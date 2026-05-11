import { SEVERITY, SKILLS, PROFICIENCY_RANKS } from "../constants.js";

// Class proficiency progression tables (PC1 / PC2 / Remaster / Legacy core).
// Each list contains only the LEVELS at which a rank advances; ranks are
// 0=untrained, 1=trained, 2=expert, 3=master, 4=legendary.
const LEVEL_GAINS = {
  alchemist: {
    fortitude: [{ level: 1, rank: 2 }, { level: 11, rank: 3 }],
    reflex:    [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    will:      [{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 15, rank: 3 }],
    perception:[{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 15, rank: 3 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 5, rank: 2 }, { level: 13, rank: 3 }, { level: 17, rank: 4 }]
  },
  barbarian: {
    fortitude: [{ level: 1, rank: 2 }, { level: 7, rank: 3 }, { level: 15, rank: 4 }],
    reflex:    [{ level: 1, rank: 1 }, { level: 9, rank: 2 }],
    will:      [{ level: 1, rank: 2 }, { level: 15, rank: 3 }],
    perception:[{ level: 1, rank: 2 }, { level: 17, rank: 3 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 5, rank: 2 }, { level: 13, rank: 3 }, { level: 17, rank: 4 }]
  },
  bard: {
    fortitude: [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    reflex:    [{ level: 1, rank: 2 }, { level: 15, rank: 3 }],
    will:      [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    perception:[{ level: 1, rank: 2 }, { level: 3, rank: 3 }, { level: 17, rank: 4 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    spellDC:   [{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 15, rank: 3 }, { level: 19, rank: 4 }]
  },
  champion: {
    fortitude: [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    reflex:    [{ level: 1, rank: 1 }, { level: 17, rank: 2 }],
    will:      [{ level: 1, rank: 2 }, { level: 9, rank: 3 }],
    perception:[{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 17, rank: 3 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 5, rank: 2 }, { level: 13, rank: 3 }, { level: 17, rank: 4 }],
    spellDC:   [{ level: 1, rank: 1 }, { level: 9, rank: 2 }] // focus-only; verify on champion focus
  },
  cleric: {
    fortitude: [{ level: 1, rank: 1 }, { level: 9, rank: 2 }],
    reflex:    [{ level: 1, rank: 1 }, { level: 9, rank: 2 }],
    will:      [{ level: 1, rank: 2 }, { level: 11, rank: 3 }, { level: 19, rank: 4 }],
    perception:[{ level: 1, rank: 1 }, { level: 11, rank: 2 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 13, rank: 2 }],
    spellDC:   [{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 15, rank: 3 }, { level: 19, rank: 4 }]
  },
  druid: {
    fortitude: [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 15, rank: 3 }],
    reflex:    [{ level: 1, rank: 1 }, { level: 11, rank: 2 }],
    will:      [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    perception:[{ level: 1, rank: 2 }, { level: 11, rank: 3 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 13, rank: 2 }],
    spellDC:   [{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 15, rank: 3 }, { level: 19, rank: 4 }]
  },
  fighter: {
    fortitude: [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 15, rank: 4 }],
    reflex:    [{ level: 1, rank: 2 }, { level: 15, rank: 3 }],
    will:      [{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 15, rank: 3 }],
    perception:[{ level: 1, rank: 2 }, { level: 7, rank: 3 }, { level: 17, rank: 4 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 11, rank: 2 }, { level: 17, rank: 3 }]
  },
  monk: {
    fortitude: [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    reflex:    [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    will:      [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    perception:[{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 15, rank: 3 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 5, rank: 2 }, { level: 13, rank: 3 }, { level: 17, rank: 4 }]
  },
  ranger: {
    fortitude: [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 15, rank: 4 }],
    reflex:    [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    will:      [{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 15, rank: 3 }],
    perception:[{ level: 1, rank: 2 }, { level: 7, rank: 3 }, { level: 15, rank: 4 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 5, rank: 2 }, { level: 13, rank: 3 }, { level: 17, rank: 4 }]
  },
  rogue: {
    fortitude: [{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 15, rank: 3 }],
    reflex:    [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    will:      [{ level: 1, rank: 2 }, { level: 11, rank: 3 }, { level: 19, rank: 4 }],
    perception:[{ level: 1, rank: 2 }, { level: 7, rank: 3 }, { level: 17, rank: 4 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 5, rank: 2 }, { level: 13, rank: 3 }, { level: 17, rank: 4 }]
  },
  sorcerer: {
    fortitude: [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    reflex:    [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    will:      [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    perception:[{ level: 1, rank: 1 }, { level: 11, rank: 2 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 13, rank: 2 }],
    spellDC:   [{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 15, rank: 3 }, { level: 19, rank: 4 }]
  },
  wizard: {
    fortitude: [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    reflex:    [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    will:      [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    perception:[{ level: 1, rank: 1 }, { level: 11, rank: 2 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 13, rank: 2 }],
    spellDC:   [{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 15, rank: 3 }, { level: 19, rank: 4 }]
  },
  witch: {
    fortitude: [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    reflex:    [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    will:      [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    perception:[{ level: 1, rank: 1 }, { level: 11, rank: 2 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 13, rank: 2 }],
    spellDC:   [{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 15, rank: 3 }, { level: 19, rank: 4 }]
  },
  investigator: {
    fortitude: [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    reflex:    [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    will:      [{ level: 1, rank: 2 }, { level: 11, rank: 3 }, { level: 19, rank: 4 }],
    perception:[{ level: 1, rank: 2 }, { level: 7, rank: 3 }, { level: 17, rank: 4 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 5, rank: 2 }, { level: 13, rank: 3 }, { level: 17, rank: 4 }]
  },
  swashbuckler: {
    fortitude: [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    reflex:    [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    will:      [{ level: 1, rank: 2 }, { level: 11, rank: 3 }, { level: 19, rank: 4 }],
    perception:[{ level: 1, rank: 2 }, { level: 7, rank: 3 }, { level: 17, rank: 4 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 5, rank: 2 }, { level: 13, rank: 3 }, { level: 17, rank: 4 }]
  },
  oracle: {
    fortitude: [{ level: 1, rank: 2 }, { level: 11, rank: 3 }],
    reflex:    [{ level: 1, rank: 1 }, { level: 11, rank: 2 }],
    will:      [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    perception:[{ level: 1, rank: 1 }, { level: 11, rank: 2 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 13, rank: 2 }],
    spellDC:   [{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 15, rank: 3 }, { level: 19, rank: 4 }]
  },
  psychic: {
    fortitude: [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    reflex:    [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    will:      [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    perception:[{ level: 1, rank: 2 }, { level: 11, rank: 3 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 13, rank: 2 }],
    spellDC:   [{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 15, rank: 3 }, { level: 19, rank: 4 }]
  },
  magus: {
    fortitude: [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    reflex:    [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    will:      [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    perception:[{ level: 1, rank: 2 }, { level: 11, rank: 3 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    spellDC:   [{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 15, rank: 3 }, { level: 19, rank: 4 }]
  },
  summoner: {
    fortitude: [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    reflex:    [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    will:      [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    perception:[{ level: 1, rank: 1 }, { level: 11, rank: 2 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    spellDC:   [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }] // summoner caps at master
  },
  gunslinger: {
    fortitude: [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    reflex:    [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    will:      [{ level: 1, rank: 2 }, { level: 11, rank: 3 }, { level: 19, rank: 4 }],
    perception:[{ level: 1, rank: 2 }, { level: 7, rank: 3 }, { level: 15, rank: 4 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 5, rank: 2 }, { level: 13, rank: 3 }, { level: 17, rank: 4 }]
  },
  inventor: {
    fortitude: [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    reflex:    [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    will:      [{ level: 1, rank: 2 }, { level: 11, rank: 3 }, { level: 19, rank: 4 }],
    perception:[{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 17, rank: 3 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 5, rank: 2 }, { level: 13, rank: 3 }, { level: 17, rank: 4 }]
  },
  kineticist: {
    fortitude: [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    reflex:    [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    will:      [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    perception:[{ level: 1, rank: 2 }, { level: 11, rank: 3 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 5, rank: 2 }, { level: 13, rank: 3 }, { level: 17, rank: 4 }]
  },
  thaumaturge: {
    fortitude: [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    reflex:    [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    will:      [{ level: 1, rank: 2 }, { level: 11, rank: 3 }, { level: 19, rank: 4 }],
    perception:[{ level: 1, rank: 2 }, { level: 7, rank: 3 }, { level: 17, rank: 4 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 5, rank: 2 }, { level: 13, rank: 3 }, { level: 17, rank: 4 }]
  },
  animist: { // TODO verify (PC2 War of Immortals)
    fortitude: [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    reflex:    [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    will:      [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    perception:[{ level: 1, rank: 2 }, { level: 11, rank: 3 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 13, rank: 2 }],
    spellDC:   [{ level: 1, rank: 1 }, { level: 7, rank: 2 }, { level: 15, rank: 3 }, { level: 19, rank: 4 }]
  },
  exemplar: { // TODO verify (PC2 War of Immortals)
    fortitude: [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    reflex:    [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    will:      [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    perception:[{ level: 1, rank: 2 }, { level: 7, rank: 3 }, { level: 17, rank: 4 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 5, rank: 2 }, { level: 13, rank: 3 }, { level: 17, rank: 4 }]
  },
  commander: { // TODO verify (Battlecry!)
    fortitude: [{ level: 1, rank: 2 }, { level: 9, rank: 3 }, { level: 17, rank: 4 }],
    reflex:    [{ level: 1, rank: 1 }, { level: 9, rank: 2 }, { level: 17, rank: 3 }],
    will:      [{ level: 1, rank: 2 }, { level: 11, rank: 3 }, { level: 19, rank: 4 }],
    perception:[{ level: 1, rank: 2 }, { level: 7, rank: 3 }, { level: 17, rank: 4 }],
    classDC:   [{ level: 1, rank: 1 }, { level: 5, rank: 2 }, { level: 13, rank: 3 }, { level: 17, rank: 4 }]
  }
};

const SKILL_RANK_MIN_LEVEL = { 2: 3, 3: 7, 4: 15 }; // expert/master/legendary

const STAT_LABELS = {
  fortitude: "Fortitude",
  reflex: "Reflex",
  will: "Will",
  perception: "Perception",
  classDC: "Class DC",
  spellDC: "Spell DC"
};

function makeIssue(code, severity, params = {}) {
  return { code, severity, i18nKey: `PF2E-CA.Audit.Code.${code}`, params };
}

function rankName(rank) {
  return PROFICIENCY_RANKS[rank] ?? String(rank);
}

export function expectedRankAtLevel(progressionList, level) {
  if (!Array.isArray(progressionList)) return 0;
  let best = 0;
  for (const entry of progressionList) {
    if (entry?.level <= level && entry?.rank > best) best = entry.rank;
  }
  return best;
}

function compareRank(stat, actualRank, expectedRank, level, issues) {
  if (typeof actualRank !== "number") return;
  if (actualRank < expectedRank) {
    issues.push(makeIssue("RANK_BEHIND_PROGRESSION", SEVERITY.WARN, {
      stat, level,
      expectedRank: rankName(expectedRank),
      actualRank: rankName(actualRank)
    }));
  } else if (actualRank > expectedRank) {
    issues.push(makeIssue("RANK_AHEAD_OF_PROGRESSION", SEVERITY.ERROR, {
      stat, level,
      expectedRank: rankName(expectedRank),
      actualRank: rankName(actualRank)
    }));
  }
}

function getEntryEffectiveRank(entry) {
  // Preferred: PF2e v8 statistic — rule-element-aware (Expert Spellcaster etc.)
  if (typeof entry?.statistic?.rank === "number") return entry.statistic.rank;
  // Fallback: the raw proficiency value
  if (typeof entry?.system?.proficiency?.value === "number") return entry.system.proficiency.value;
  return null;
}

function isRitualEntry(entry) {
  return entry?.system?.prepared?.value === "ritual"
    || entry?.system?.category === "ritual"
    || entry?.system?.category?.value === "ritual"
    || entry?.isRitual === true;
}

function getClassSlug(actor) {
  const slug = actor.class?.slug ?? actor.class?.system?.slug ?? null;
  if (!slug) return null;
  return String(slug).toLowerCase();
}

function readClassDCRank(actor) {
  const a = actor.classDC?.rank;
  if (typeof a === "number") return a;
  const b = actor.system?.proficiencies?.classDC?.rank;
  if (typeof b === "number") return b;
  const c = actor.system?.proficiencies?.classDCs;
  if (c && typeof c === "object") {
    const vals = Object.values(c).map((e) => e?.rank).filter((n) => typeof n === "number");
    if (vals.length > 0) return Math.max(...vals);
  }
  return null;
}

function checkClassProgression(actor, issues) {
  const slug = getClassSlug(actor);
  if (!slug) return;
  const table = LEVEL_GAINS[slug];
  if (!table) return;
  const level = Number(actor.system?.details?.level?.value ?? 0) || 0;

  const saves = actor.system?.saves ?? {};
  compareRank(STAT_LABELS.fortitude, saves.fortitude?.rank, expectedRankAtLevel(table.fortitude, level), level, issues);
  compareRank(STAT_LABELS.reflex,    saves.reflex?.rank,    expectedRankAtLevel(table.reflex,    level), level, issues);
  compareRank(STAT_LABELS.will,      saves.will?.rank,      expectedRankAtLevel(table.will,      level), level, issues);

  const perceptionRank = actor.system?.perception?.rank ?? actor.perception?.rank;
  compareRank(STAT_LABELS.perception, perceptionRank, expectedRankAtLevel(table.perception, level), level, issues);

  if (table.classDC) {
    const classDCRank = readClassDCRank(actor);
    if (classDCRank !== null) {
      compareRank(STAT_LABELS.classDC, classDCRank, expectedRankAtLevel(table.classDC, level), level, issues);
    }
  }

  if (table.spellDC) {
    const expectedSpell = expectedRankAtLevel(table.spellDC, level);
    const entries = actor.spellcasting?.contents ?? [];
    for (const entry of entries) {
      if (entry?.system?.prepared?.value === "items") continue;
      if (isRitualEntry(entry)) continue;
      const effectiveRank = getEntryEffectiveRank(entry);
      if (typeof effectiveRank !== "number") continue;
      const entryName = entry.name ?? entry.tradition ?? "Spellcasting";
      compareRank(`Spell DC (${entryName})`, effectiveRank, expectedSpell, level, issues);
    }
  }
}

function checkSkillMinLevel(actor, issues) {
  const level = Number(actor.system?.details?.level?.value ?? 0) || 0;
  const skills = actor.skills;
  if (!skills) return;
  for (const key of SKILLS) {
    const skill = skills.get ? skills.get(key) : skills[key];
    const rank = skill?.rank;
    if (typeof rank !== "number" || rank < 2) continue;
    const minLevel = SKILL_RANK_MIN_LEVEL[rank];
    if (!minLevel) continue;
    if (level < minLevel) {
      issues.push(makeIssue("SKILL_RANK_TOO_HIGH_FOR_LEVEL", SEVERITY.ERROR, {
        skill: key,
        rank: rankName(rank),
        characterLevel: level,
        minLevel
      }));
    }
  }
}

export function auditProficiencyProgression(actor) {
  const issues = [];
  if (actor?.type === "character") {
    checkClassProgression(actor, issues);
    checkSkillMinLevel(actor, issues);
  }
  const summary = {
    errors: issues.filter((i) => i.severity === SEVERITY.ERROR).length,
    warnings: issues.filter((i) => i.severity === SEVERITY.WARN).length,
    infos: issues.filter((i) => i.severity === SEVERITY.INFO).length,
    total: issues.length
  };
  return { issues, summary };
}

export { LEVEL_GAINS, SKILL_RANK_MIN_LEVEL };
