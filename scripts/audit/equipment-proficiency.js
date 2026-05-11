// Weapon / armor / shield proficiency audit.
//
// Flags "wearing what you can't legally use" scenarios:
//   - WIELDING_UNTRAINED_WEAPON (warn) — held weapon with rank 0 across every
//     proficiency that could grant it (category, weapon-group, advancedWeapons).
//   - WEARING_UNTRAINED_ARMOR  (warn) — invested+worn armor in a category with
//     rank 0.
//   - SHIELD_AND_TWO_HANDED    (error) — held shield while also holding a
//     true two-handed weapon (two-hand-dX trait excluded — that's a wielding
//     mode, not a hard 2H requirement; only the bare two-handed weapons here).
//   - MISSING_AMMO             (info)  — owns a reload-N weapon but no
//     matching ammunition items in inventory.
//
// All look-ups are defensive; PF2e v8 paths (carryType / invested / category /
// group / proficiencies.attacks.<key>.rank / proficiencies.defenses.<key>.rank
// / reload.value / traits.value).

import { SEVERITY } from "../constants.js";

const TWO_HANDED_TRAITS = new Set([
  "two-hand-d6", "two-hand-d8", "two-hand-d10", "two-hand-d12"
]);

function makeIssue(code, severity, params = {}) {
  return {
    code,
    severity,
    i18nKey: `PF2E-CA.Audit.Code.${code}`,
    params
  };
}

function summarize(issues) {
  const errors = issues.filter((i) => i.severity === SEVERITY.ERROR).length;
  const warnings = issues.filter((i) => i.severity === SEVERITY.WARN).length;
  const infos = issues.filter((i) => i.severity === SEVERITY.INFO).length;
  return { errors, warnings, infos, total: issues.length };
}

function rankOf(actor, slot, key) {
  if (!key) return 0;
  const node = actor?.system?.proficiencies?.[slot]?.[key];
  const r = node?.rank;
  return typeof r === "number" ? r : 0;
}

function isHeld(item) {
  return item?.system?.equipped?.carryType === "held";
}

function isWornInvested(item) {
  const eq = item?.system?.equipped;
  return eq?.carryType === "worn" && eq?.invested === true;
}

function weaponMaxRank(actor, weapon) {
  const sys = weapon?.system ?? {};
  const category = sys.category; // unarmed/simple/martial/advanced
  const group = sys.group;       // sword/bow/club/...
  const ranks = [
    rankOf(actor, "attacks", category),
    rankOf(actor, "attacks", group)
  ];
  if (category === "advanced") {
    ranks.push(rankOf(actor, "attacks", "advancedWeapons"));
  }
  // Some specific weapon types are tracked by slug on .attacks too; harmless
  // to also peek by weapon slug if present.
  const slug = sys.slug ?? weapon?.slug;
  if (slug) ranks.push(rankOf(actor, "attacks", slug));
  return Math.max(0, ...ranks);
}

function isTwoHandedWeapon(weapon) {
  const traits = weapon?.system?.traits?.value ?? [];
  if (!Array.isArray(traits)) return false;
  if (traits.includes("two-handed")) return true;
  for (const t of traits) {
    if (TWO_HANDED_TRAITS.has(t)) return true;
  }
  // Fall back to hands metadata if exposed (1 = 1H, 2 = 2H).
  const usage = weapon?.system?.usage?.value;
  if (typeof usage === "string" && /held-in-two-hands|2h/i.test(usage)) return true;
  return false;
}

function checkWeapons(actor, issues) {
  const weapons = actor?.itemTypes?.weapon ?? [];
  for (const w of weapons) {
    if (!isHeld(w)) continue;
    const max = weaponMaxRank(actor, w);
    if (max <= 0) {
      issues.push(makeIssue("WIELDING_UNTRAINED_WEAPON", SEVERITY.WARN, {
        weaponName: w.name,
        weaponGroup: w.system?.group ?? w.system?.category ?? "unknown"
      }));
    }
  }
}

function checkArmor(actor, issues) {
  const armors = actor?.itemTypes?.armor ?? [];
  for (const a of armors) {
    if (!isWornInvested(a)) continue;
    const category = a.system?.category; // unarmored/light/medium/heavy
    const rank = rankOf(actor, "defenses", category);
    if (rank <= 0) {
      issues.push(makeIssue("WEARING_UNTRAINED_ARMOR", SEVERITY.WARN, {
        armorName: a.name,
        armorCategory: category ?? "unknown"
      }));
    }
  }
}

function checkShieldAndTwoHanded(actor, issues) {
  const shields = actor?.itemTypes?.shield ?? [];
  const heldShield = shields.find((s) => isHeld(s));
  if (!heldShield) return;
  const weapons = actor?.itemTypes?.weapon ?? [];
  for (const w of weapons) {
    if (!isHeld(w)) continue;
    if (isTwoHandedWeapon(w)) {
      issues.push(makeIssue("SHIELD_AND_TWO_HANDED", SEVERITY.ERROR, {
        weapon: w.name,
        shield: heldShield.name
      }));
    }
  }
}

function ammoMatches(weapon, ammo) {
  if (!ammo) return false;
  const wSlug = weapon?.system?.slug ?? weapon?.slug;
  const wGroup = weapon?.system?.group;
  const aSlug = ammo?.system?.slug ?? ammo?.slug;
  // PF2e doesn't strictly bind ammo to a weapon at the system level outside of
  // explicit selectedAmmoId; we accept any consumable with the "ammo" trait or
  // type "consumable" + consumableType "ammo" as a candidate. Group-aligned
  // names (arrow / bolt / bullet / dart) are best-effort matched.
  const traits = ammo?.system?.traits?.value ?? [];
  if (!traits.includes("ammo") && ammo?.system?.consumableType?.value !== "ammo"
      && ammo?.system?.category !== "ammo" && ammo?.type !== "consumable") {
    return false;
  }
  // If selectedAmmoId is set on the weapon, only that ammo counts.
  const selected = weapon?.system?.selectedAmmoId;
  if (selected) return ammo.id === selected;
  // Group-name heuristic.
  if (wGroup && aSlug && aSlug.includes(wGroup)) return true;
  if (wSlug && aSlug && aSlug.includes(wSlug)) return true;
  // Otherwise accept any ammo on the actor — a missing-ammo finding requires
  // zero ammo at all.
  return true;
}

function checkMissingAmmo(actor, issues) {
  const weapons = actor?.itemTypes?.weapon ?? [];
  const consumables = actor?.itemTypes?.consumable ?? [];
  for (const w of weapons) {
    const reload = w.system?.reload?.value;
    if (!reload) continue;
    const reloadStr = String(reload).trim();
    if (!/^[0-3]$/.test(reloadStr) && !/reload-?[0-3]/i.test(reloadStr)) continue;
    // count matching ammo with quantity > 0
    let total = 0;
    for (const c of consumables) {
      if (!ammoMatches(w, c)) continue;
      const qty = Number(c.system?.quantity ?? 0) || 0;
      total += qty;
    }
    if (total <= 0) {
      issues.push(makeIssue("MISSING_AMMO", SEVERITY.INFO, {
        weapon: w.name
      }));
    }
  }
}

export function auditEquipmentProficiency(actor) {
  const issues = [];
  if (!actor) return { issues, summary: summarize(issues) };

  try { checkWeapons(actor, issues); }
  catch (e) { console.warn("[pf2e-character-audit] equipment-proficiency weapons:", e); }

  try { checkArmor(actor, issues); }
  catch (e) { console.warn("[pf2e-character-audit] equipment-proficiency armor:", e); }

  try { checkShieldAndTwoHanded(actor, issues); }
  catch (e) { console.warn("[pf2e-character-audit] equipment-proficiency shield+2h:", e); }

  try { checkMissingAmmo(actor, issues); }
  catch (e) { console.warn("[pf2e-character-audit] equipment-proficiency ammo:", e); }

  return { issues, summary: summarize(issues) };
}
