export const MODULE_ID = "pf2e-character-audit";
export const MODULE_VERSION = "0.1.27";

export const ATTRIBUTES = ["str", "dex", "con", "int", "wis", "cha"];

export const SKILLS = [
  "acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy",
  "intimidation", "medicine", "nature", "occultism", "performance", "religion",
  "society", "stealth", "survival", "thievery"
];

export const PROFICIENCY_RANKS = ["untrained", "trained", "expert", "master", "legendary"];
export const PROFICIENCY_RANK_NAMES = PROFICIENCY_RANKS;

export const BOOST_LEVELS = [1, 5, 10, 15, 20];

export const ANCESTRY_FEAT_LEVELS = [1, 5, 9, 13, 17];
export const GENERAL_FEAT_LEVELS = [3, 7, 11, 15, 19];
export const DEFAULT_SKILL_FEAT_LEVELS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
export const DEFAULT_SKILL_INCREASE_LEVELS = [3, 5, 7, 9, 11, 13, 15, 17, 19];

export const EXCLUDED_PUBLICATION_TYPES = new Set([
  "spellcastingEntry",
  "condition",
  "effect",
  "affliction"
]);

export const ANCESTRY_TRAIT_ALIASES = {
  dromaar: "orc",
  ganzi: "human",
  dhampir: "human",
  duskwalker: "human",
  changeling: "human",
  lizardfolk: "iruxi"
};

export const SEVERITY = {
  ERROR: "error",
  WARN: "warn",
  INFO: "info"
};

export const EVALUATION = {
  PASS: "pass",
  FAIL: "fail",
  UNKNOWN: "unknown"
};
