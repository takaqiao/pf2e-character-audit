import { SEVERITY } from "../constants.js";
import { detectVariants } from "../utils/pf2e-api.js";

const INVESTITURE_CAP = 10;
const ITEM_LEVEL_TOLERANCE = 2;
const CONSUMABLE_TYPES = new Set(["consumable"]);
const SKIP_TRAIT_FOR_LEVEL = new Set(["potion", "scroll", "ammo", "alchemical", "elixir", "talisman", "oil", "wand"]);

const POTENCY_LEVELS = { 1: 2, 2: 10, 3: 16 };
const STRIKING_LEVELS = { 1: 4, 2: 12, 3: 19 };
const RESILIENT_LEVELS = { 1: 8, 2: 14, 3: 20 };

const WEALTH_BY_LEVEL = {
  1: 15, 2: 30, 3: 80, 4: 200, 5: 320, 6: 500, 7: 720, 8: 1000,
  9: 1400, 10: 2000, 11: 2800, 12: 4000, 13: 5700, 14: 8000,
  15: 12000, 16: 20000, 17: 30000, 18: 48000, 19: 80000, 20: 140000
};

const COIN_TO_GP = { pp: 10, gp: 1, sp: 0.1, cp: 0.01 };

function makeIssue(code, severity, params = {}, extra = {}) {
  return {
    code,
    severity,
    i18nKey: `PF2E-CA.Audit.Code.${code}`,
    params,
    ...extra
  };
}

function summarize(issues) {
  const errors = issues.filter((i) => i.severity === SEVERITY.ERROR).length;
  const warnings = issues.filter((i) => i.severity === SEVERITY.WARN).length;
  const infos = issues.filter((i) => i.severity === SEVERITY.INFO).length;
  return { errors, warnings, infos, total: issues.length };
}

function isInvested(item) {
  return item?.system?.equipped?.invested === true;
}

function isEquippedOrHeld(item) {
  const eq = item?.system?.equipped;
  if (!eq) return false;
  if (eq.invested === true) return true;
  if (eq.carryType && eq.carryType !== "dropped") return true;
  return eq.inSlot === true || eq.handsHeld > 0;
}

function isConsumableLike(item) {
  if (CONSUMABLE_TYPES.has(item?.type)) return true;
  const traits = item?.system?.traits?.value ?? [];
  return traits.some((t) => SKIP_TRAIT_FOR_LEVEL.has(t));
}

function readRuneGrade(host, key) {
  const v = host?.system?.runes?.[key];
  if (v && typeof v === "object" && "value" in v) return Number(v.value) || 0;
  if (typeof v === "number") return v;
  return 0;
}

function readLegacyRune(host, fieldNames) {
  for (const f of fieldNames) {
    const v = host?.system?.[f];
    if (v && typeof v === "object" && "value" in v && v.value != null) return Number(v.value) || 0;
    if (typeof v === "number" && v > 0) return v;
  }
  return 0;
}

function readPropertyRunes(host) {
  const fromShape = host?.system?.runes?.property;
  if (Array.isArray(fromShape)) return fromShape.filter(Boolean);
  const legacy = [];
  for (const k of ["propertyRune1", "propertyRune2", "propertyRune3", "propertyRune4"]) {
    const v = host?.system?.[k]?.value ?? host?.system?.[k];
    if (typeof v === "string" && v) legacy.push(v);
  }
  return legacy;
}

function checkItemLevels(actor, issues) {
  const actorLevel = actor.system?.details?.level?.value ?? 1;
  for (const item of actor.items) {
    if (!item?.system) continue;
    if (isConsumableLike(item)) continue;
    if (!isEquippedOrHeld(item)) continue;
    const lv = item.system?.level?.value;
    if (typeof lv !== "number") continue;
    if (lv > actorLevel + ITEM_LEVEL_TOLERANCE) {
      issues.push(makeIssue("ITEM_LEVEL_EXCEEDS_CHARACTER", SEVERITY.WARN, {
        itemName: item.name,
        itemLevel: lv,
        characterLevel: actorLevel
      }));
    }
  }
}

function checkInvestiture(actor, issues) {
  let count = 0;
  for (const item of actor.items) {
    if (isInvested(item)) count++;
  }
  if (count > INVESTITURE_CAP) {
    issues.push(makeIssue("INVESTITURE_OVER_LIMIT", SEVERITY.ERROR, { count }));
  }
}

function checkRunesOnHost(host, fundamentalKey, legacyFieldNames, issues, runeTypeLabel) {
  const modernGrade = readRuneGrade(host, fundamentalKey);
  const legacyGrade = readLegacyRune(host, legacyFieldNames);
  if (modernGrade > 0 && legacyGrade > 0 && modernGrade !== legacyGrade) {
    issues.push(makeIssue("RUNE_DUPLICATE", SEVERITY.ERROR, {
      itemName: host.name,
      runeType: runeTypeLabel
    }));
  }
  const props = readPropertyRunes(host);
  const seen = new Set();
  for (const p of props) {
    const key = typeof p === "string" ? p : (p?.slug ?? p?.name);
    if (!key) continue;
    if (seen.has(key)) {
      issues.push(makeIssue("RUNE_DUPLICATE", SEVERITY.ERROR, {
        itemName: host.name,
        runeType: key
      }));
    }
    seen.add(key);
  }
  return Math.max(modernGrade, legacyGrade);
}

function checkRunes(actor, issues) {
  const actorLevel = actor.system?.details?.level?.value ?? 1;
  const weapons = actor.itemTypes?.weapon ?? [];
  const armors = actor.itemTypes?.armor ?? [];
  let hasFundamental = false;

  for (const w of weapons) {
    const potencyGrade = checkRunesOnHost(w, "potency", ["potencyRune"], issues, "potency");
    const strikingGrade = checkRunesOnHost(w, "striking", ["strikingRune"], issues, "striking");
    if (potencyGrade > 0 || strikingGrade > 0) hasFundamental = true;
    if (potencyGrade > 0) {
      const lv = POTENCY_LEVELS[potencyGrade] ?? 0;
      if (lv > actorLevel + ITEM_LEVEL_TOLERANCE) {
        issues.push(makeIssue("RUNE_LEVEL_EXCEEDS_CHARACTER", SEVERITY.WARN, {
          itemName: w.name, runeName: `potency +${potencyGrade}`, runeLevel: lv, characterLevel: actorLevel
        }));
      }
    }
    if (strikingGrade > 0) {
      const lv = STRIKING_LEVELS[strikingGrade] ?? 0;
      if (lv > actorLevel + ITEM_LEVEL_TOLERANCE) {
        const label = strikingGrade === 3 ? "major striking" : strikingGrade === 2 ? "greater striking" : "striking";
        issues.push(makeIssue("RUNE_LEVEL_EXCEEDS_CHARACTER", SEVERITY.WARN, {
          itemName: w.name, runeName: label, runeLevel: lv, characterLevel: actorLevel
        }));
      }
    }
  }

  for (const a of armors) {
    const potencyGrade = checkRunesOnHost(a, "potency", ["potencyRune"], issues, "potency");
    const resilientGrade = checkRunesOnHost(a, "resilient", ["resiliencyRune", "resilientRune"], issues, "resilient");
    if (potencyGrade > 0 || resilientGrade > 0) hasFundamental = true;
    if (potencyGrade > 0) {
      const lv = POTENCY_LEVELS[potencyGrade] ?? 0;
      if (lv > actorLevel + ITEM_LEVEL_TOLERANCE) {
        issues.push(makeIssue("RUNE_LEVEL_EXCEEDS_CHARACTER", SEVERITY.WARN, {
          itemName: a.name, runeName: `potency +${potencyGrade}`, runeLevel: lv, characterLevel: actorLevel
        }));
      }
    }
    if (resilientGrade > 0) {
      const lv = RESILIENT_LEVELS[resilientGrade] ?? 0;
      if (lv > actorLevel + ITEM_LEVEL_TOLERANCE) {
        const label = resilientGrade === 3 ? "major resilient" : resilientGrade === 2 ? "greater resilient" : "resilient";
        issues.push(makeIssue("RUNE_LEVEL_EXCEEDS_CHARACTER", SEVERITY.WARN, {
          itemName: a.name, runeName: label, runeLevel: lv, characterLevel: actorLevel
        }));
      }
    }
  }

  return hasFundamental;
}

function checkABPConflict(actor, hasFundamentalRune, issues) {
  let variants;
  try { variants = detectVariants(); } catch { variants = { abp: false, abpVariant: "noABP" }; }
  if (!variants?.abp) return;
  if (variants.abpVariant === "noABP") return;
  if (!hasFundamentalRune) return;
  const weapons = actor.itemTypes?.weapon ?? [];
  const armors = actor.itemTypes?.armor ?? [];
  for (const w of weapons) {
    if (readRuneGrade(w, "potency") > 0 || readRuneGrade(w, "striking") > 0
      || readLegacyRune(w, ["potencyRune"]) > 0 || readLegacyRune(w, ["strikingRune"]) > 0) {
      issues.push(makeIssue("ABP_RUNE_CONFLICT", SEVERITY.WARN, { itemName: w.name }));
    }
  }
  for (const a of armors) {
    if (readRuneGrade(a, "potency") > 0 || readRuneGrade(a, "resilient") > 0
      || readLegacyRune(a, ["potencyRune"]) > 0 || readLegacyRune(a, ["resiliencyRune", "resilientRune"]) > 0) {
      issues.push(makeIssue("ABP_RUNE_CONFLICT", SEVERITY.WARN, { itemName: a.name }));
    }
  }
}

function priceToGp(price) {
  if (!price) return 0;
  const v = price.value ?? price;
  if (!v || typeof v !== "object") return 0;
  let gp = 0;
  for (const [k, mul] of Object.entries(COIN_TO_GP)) {
    const n = Number(v[k] ?? 0);
    if (n) gp += n * mul;
  }
  const per = Number(price.per ?? 1) || 1;
  const qty = 1;
  return (gp * qty) / per;
}

function sumCoins(actor) {
  const direct = actor.inventory?.coins;
  if (direct && typeof direct === "object") {
    let gp = 0;
    for (const [k, mul] of Object.entries(COIN_TO_GP)) {
      const n = Number(direct[k] ?? 0);
      if (n) gp += n * mul;
    }
    if (gp > 0) return gp;
  }
  const treasures = actor.itemTypes?.treasure ?? [];
  let gp = 0;
  for (const t of treasures) {
    const stack = t.system?.stackGroup;
    const denom = t.system?.price?.value;
    const qty = Number(t.system?.quantity ?? 1);
    if (stack === "coins" && denom && typeof denom === "object") {
      for (const [k, mul] of Object.entries(COIN_TO_GP)) {
        const n = Number(denom[k] ?? 0);
        if (n) gp += n * mul * qty;
      }
    }
  }
  return gp;
}

function sumItemValue(actor) {
  let gp = 0;
  for (const item of actor.items) {
    if (item.type === "treasure" && item.system?.stackGroup === "coins") continue;
    const price = item.system?.price;
    if (!price) continue;
    const qty = Number(item.system?.quantity ?? 1) || 1;
    gp += priceToGp(price) * qty;
  }
  return gp;
}

function checkTreasureByLevel(actor, issues) {
  const level = actor.system?.details?.level?.value ?? 1;
  if (level <= 1) return;
  const expected = WEALTH_BY_LEVEL[Math.min(level, 20)];
  if (!expected) return;
  let total = 0;
  try { total += sumCoins(actor); } catch {}
  try { total += sumItemValue(actor); } catch {}
  const totalGp = Math.round(total * 100) / 100;
  if (totalGp < expected * 0.5) {
    issues.push(makeIssue("TREASURE_BY_LEVEL_LOW", SEVERITY.INFO, {
      totalGp, expectedGp: expected, characterLevel: level
    }));
  } else if (totalGp > expected * 2) {
    issues.push(makeIssue("TREASURE_BY_LEVEL_HIGH", SEVERITY.INFO, {
      totalGp, expectedGp: expected, characterLevel: level
    }));
  }
}

export function auditEquipment(actor) {
  const issues = [];
  if (!actor) return { issues, summary: summarize(issues) };

  try { checkItemLevels(actor, issues); } catch (e) { console.warn("[pf2e-character-audit] equipment item-levels:", e); }
  try { checkInvestiture(actor, issues); } catch (e) { console.warn("[pf2e-character-audit] equipment investiture:", e); }

  let hasFundamental = false;
  try { hasFundamental = checkRunes(actor, issues); } catch (e) { console.warn("[pf2e-character-audit] equipment runes:", e); }
  try { checkABPConflict(actor, hasFundamental, issues); } catch (e) { console.warn("[pf2e-character-audit] equipment ABP:", e); }
  try { checkTreasureByLevel(actor, issues); } catch (e) { console.warn("[pf2e-character-audit] equipment wealth:", e); }

  return { issues, summary: summarize(issues) };
}
