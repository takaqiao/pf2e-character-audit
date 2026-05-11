import { SEVERITY } from "../constants.js";

// GM Core "Building Creatures" benchmarks. Index = level + 1 (so [-1] is index 0).
// AC is the "moderate" target; HP range is the moderate band [low, high].
// Values condensed from the published creature-building tables.
const LEVEL_TO_AC = [
  14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34,
  35, 36, 38, 39, 40, 42, 43, 44, 46, 47, 48
]; // levels -1 .. 25

const LEVEL_TO_HP_RANGE = [
  [6, 8], [11, 20], [16, 24], [24, 36], [32, 48], [40, 60], [48, 72], [56, 84],
  [68, 100], [78, 115], [88, 130], [98, 145], [108, 160], [118, 175], [128, 190],
  [138, 205], [148, 220], [158, 235], [168, 250], [178, 265], [188, 280],
  [198, 295], [208, 310], [218, 325], [228, 340], [238, 355], [248, 370]
]; // levels -1 .. 25

const NPC_LEVEL_MIN = -1;
const NPC_LEVEL_MAX = 25;
const AC_DEVIATION = 3;
const HP_DEVIATION_PCT = 0.25;

function makeIssue(code, severity, params = {}) {
  return { code, severity, i18nKey: `PF2E-CA.Audit.Code.${code}`, params };
}

function summarize(issues) {
  return {
    errors: issues.filter((i) => i.severity === SEVERITY.ERROR).length,
    warnings: issues.filter((i) => i.severity === SEVERITY.WARN).length,
    infos: issues.filter((i) => i.severity === SEVERITY.INFO).length,
    total: issues.length
  };
}

function emptyResult() {
  return { issues: [], summary: { errors: 0, warnings: 0, infos: 0, total: 0 } };
}

function pack(issues) {
  return { issues, summary: summarize(issues) };
}

function lookupLevelIndex(level) {
  // levels -1..25 map to indices 0..26
  const idx = level + 1;
  if (idx < 0 || idx >= LEVEL_TO_AC.length) return -1;
  return idx;
}

export function auditNpc(actor) {
  const issues = [];
  if (!actor || actor.type !== "npc") return pack(issues);

  const level = Number(actor.system?.details?.level?.value ?? 0);
  const name = actor.name ?? "";

  // 1. NPC_LEVEL_OUT_OF_RANGE
  if (!Number.isFinite(level) || level < NPC_LEVEL_MIN || level > NPC_LEVEL_MAX) {
    issues.push(makeIssue("NPC_LEVEL_OUT_OF_RANGE", SEVERITY.WARN, { level }));
  }

  // 2. NPC_MISSING_TRAITS
  const traits = actor.system?.traits?.value;
  if (!Array.isArray(traits) || traits.length === 0) {
    issues.push(makeIssue("NPC_MISSING_TRAITS", SEVERITY.WARN, { name }));
  }

  // 3. NPC_AC_HP_OUT_OF_BAND (only when level is in benchmark range)
  const idx = lookupLevelIndex(Math.trunc(level));
  if (idx >= 0) {
    const expectedAc = LEVEL_TO_AC[idx];
    const [hpLow, hpHigh] = LEVEL_TO_HP_RANGE[idx];
    const hpMid = (hpLow + hpHigh) / 2;

    const actualAc = Number(actor.system?.attributes?.ac?.value);
    if (Number.isFinite(actualAc) && Math.abs(actualAc - expectedAc) > AC_DEVIATION) {
      issues.push(makeIssue("NPC_AC_HP_OUT_OF_BAND", SEVERITY.INFO, {
        stat: "AC", actual: actualAc, expected: expectedAc, level
      }));
    }

    const actualHp = Number(actor.system?.attributes?.hp?.max);
    if (Number.isFinite(actualHp) && actualHp > 0) {
      const lowBound = hpMid * (1 - HP_DEVIATION_PCT);
      const highBound = hpMid * (1 + HP_DEVIATION_PCT);
      if (actualHp < lowBound || actualHp > highBound) {
        issues.push(makeIssue("NPC_AC_HP_OUT_OF_BAND", SEVERITY.INFO, {
          stat: "HP", actual: actualHp, expected: `${hpLow}-${hpHigh}`, level
        }));
      }
    }
  }

  return pack(issues);
}

function resolveMaster(actor) {
  // Prefer system.master.id, then actor.master (live reference on familiar/eidolon).
  const masterId = actor?.system?.master?.id ?? null;
  if (masterId && typeof game !== "undefined") {
    const m = game.actors?.get?.(masterId);
    if (m) return m;
  }
  if (actor?.master) return actor.master;
  return null;
}

export function auditCompanion(actor) {
  const issues = [];
  if (!actor) return pack(issues);

  const t = actor.type;
  const isFamiliar = t === "familiar";
  const isEidolon = t === "eidolon";
  // Animal companion: stored as a "character" with a companionType flag.
  const companionFlag = actor.flags?.pf2e?.companionType;
  const isAnimalCompanion = t === "character" && !!companionFlag;

  if (!isFamiliar && !isEidolon && !isAnimalCompanion) return pack(issues);

  const name = actor.name ?? "";
  const master = resolveMaster(actor);

  // 4. COMPANION_NO_MASTER
  if (!master) {
    issues.push(makeIssue("COMPANION_NO_MASTER", SEVERITY.ERROR, { name, type: t }));
    return pack(issues); // can't check level mismatch without master
  }

  // 5. COMPANION_LEVEL_MISMATCH
  // Familiars don't have an independent level (their effective level = master).
  // Skip the check for familiars to avoid false positives when the field is
  // absent or zero. Animal companions and eidolons should match master level.
  if (!isFamiliar) {
    const masterLevel = Number(master.system?.details?.level?.value);
    const companionLevel = Number(actor.system?.details?.level?.value);
    if (Number.isFinite(masterLevel) && Number.isFinite(companionLevel)
        && companionLevel > 0
        && masterLevel !== companionLevel) {
      issues.push(makeIssue("COMPANION_LEVEL_MISMATCH", SEVERITY.WARN, {
        name, companionLevel, masterLevel
      }));
    }
  }

  return pack(issues);
}

export function auditNpcOrCompanion(actor) {
  if (!actor) return emptyResult();
  const t = actor.type;
  if (t === "npc") return auditNpc(actor);
  if (t === "familiar" || t === "eidolon") return auditCompanion(actor);
  // Animal companion edge case: character with companionType flag.
  if (t === "character" && actor.flags?.pf2e?.companionType) {
    return auditCompanion(actor);
  }
  return emptyResult();
}
