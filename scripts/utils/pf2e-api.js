import { MODULE_ID } from "../constants.js";

export function slugify(str) {
  return String(str ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeGetSystemSetting(key) {
  try {
    return game.settings.get("pf2e", key);
  } catch {
    return undefined;
  }
}

function moduleSetting(name) {
  try {
    return game.settings.get(MODULE_ID, name);
  } catch {
    return undefined;
  }
}

export function detectVariants() {
  const abpRaw = safeGetSystemSetting("automaticBonusVariant");
  const respectFA = moduleSetting("respectFreeArchetype") ?? "auto";
  const respectABP = moduleSetting("respectABP") ?? "auto";

  const faAuto = safeGetSystemSetting("freeArchetypeVariant") === true;
  const abpAuto = abpRaw !== undefined && abpRaw !== "noABP";

  return {
    abp: respectABP === "on" ? true : respectABP === "off" ? false : abpAuto,
    abpVariant: abpRaw ?? "noABP",
    freeArchetype: respectFA === "on" ? true : respectFA === "off" ? false : faAuto,
    dualClass: safeGetSystemSetting("dualClassVariant") === true,
    gradualBoosts: safeGetSystemSetting("gradualBoostsVariant") === true,
    stamina: (safeGetSystemSetting("staminaVariant") ?? 0) > 0,
    proficiencyWithoutLevel: safeGetSystemSetting("proficiencyVariant") === "ProficiencyWithoutLevel"
  };
}

export function isDualClassEnabled() {
  return detectVariants().dualClass;
}

export function getCharacterParty() {
  return game.actors?.party ?? null;
}

export function getPartyMembers(includeDead = false) {
  const party = getCharacterParty();
  if (!party) return [];
  const members = party.members ?? [];
  return members.filter((a) => {
    if (a?.type !== "character") return false;
    if (!includeDead && a.system?.attributes?.hp?.value === 0) return false;
    return true;
  });
}

export function escapeHTML(str) {
  const fn = foundry?.utils?.escapeHTML;
  if (typeof fn === "function") return fn(String(str ?? ""));
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
