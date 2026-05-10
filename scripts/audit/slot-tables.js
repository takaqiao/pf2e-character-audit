import {
  ANCESTRY_FEAT_LEVELS,
  GENERAL_FEAT_LEVELS,
  DEFAULT_SKILL_FEAT_LEVELS,
  DEFAULT_SKILL_INCREASE_LEVELS,
  BOOST_LEVELS
} from "../constants.js";

function fillCount(levels, max) {
  const out = {};
  for (const l of levels) if (l <= max) out[l] = 1;
  return out;
}

function readClassLevels(actor, key) {
  const raw = actor?.class?.system?.[key];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.value)) return raw.value;
  return null;
}

export function expectedSlots(actor, variants) {
  const level = actor?.system?.details?.level?.value ?? 1;

  const ancestryFeats = fillCount(ANCESTRY_FEAT_LEVELS, level);
  const generalFeats = fillCount(GENERAL_FEAT_LEVELS, level);

  const classFeatLevels =
    readClassLevels(actor, "classFeatLevels") ??
    readClassLevels(actor, "featLevels") ??
    [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
  const classFeats = fillCount(classFeatLevels, level);

  const skillFeatLevels = readClassLevels(actor, "skillFeatLevels") ?? DEFAULT_SKILL_FEAT_LEVELS;
  const skillFeats = fillCount(skillFeatLevels, level);

  const skillIncreaseLevels = readClassLevels(actor, "skillIncreaseLevels") ?? DEFAULT_SKILL_INCREASE_LEVELS;
  const skillIncreases = fillCount(skillIncreaseLevels, level);

  const archetypeFeats = variants?.freeArchetype ? fillCount(DEFAULT_SKILL_FEAT_LEVELS, level) : {};

  const boostLevels = BOOST_LEVELS.filter((l) => l <= level);

  return {
    level,
    ancestryFeats,
    classFeats,
    skillFeats,
    generalFeats,
    archetypeFeats,
    skillIncreases,
    boostLevels
  };
}
