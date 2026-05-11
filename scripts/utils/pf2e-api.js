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

/**
 * Determine whether a spell is granted to the actor by their deity (cleric bonus
 * spells, domain spells, etc.). These spells are legitimately castable by the
 * cleric in their divine entry even if the spell itself is tagged with a
 * non-divine tradition (e.g. Mindlink is arcane/occult but appears on some
 * deities' bonus-spell lists).
 *
 * Defensive: the PF2e system has shifted the deity schema several times. Tries
 * every known shape and returns false when uncertain so we don't suppress real
 * bugs.
 *
 * @param {Actor} actor   PF2e character actor
 * @param {Item}  spellItem PF2e spell item
 * @returns {boolean}
 */
export function isDeityGrantedSpell(actor, spellItem) {
  try {
    if (!actor || !spellItem) return false;
    const deity = actor.deity ?? actor.deities?.[0] ?? null;
    if (!deity) return false;
    const sys = deity.system ?? {};

    const spellSlug = spellItem.slug ?? spellItem.system?.slug ?? slugify(spellItem.name ?? "");
    const spellUuid = spellItem.uuid ?? spellItem.sourceId ?? spellItem.system?.source?.value ?? null;
    const sourceId = spellItem.flags?.core?.sourceId ?? spellItem._stats?.compendiumSource ?? null;

    const candidateIds = new Set();
    if (spellSlug) candidateIds.add(String(spellSlug).toLowerCase());
    if (spellUuid) candidateIds.add(String(spellUuid));
    if (sourceId) candidateIds.add(String(sourceId));
    // Also accept the trailing slug fragment of any UUID we have.
    for (const id of [spellUuid, sourceId]) {
      if (!id) continue;
      const tail = String(id).split(".").pop();
      if (tail) candidateIds.add(tail.toLowerCase());
    }

    const matches = (val) => {
      if (!val) return false;
      const s = String(val);
      if (candidateIds.has(s) || candidateIds.has(s.toLowerCase())) return true;
      const tail = s.split(".").pop();
      if (tail && candidateIds.has(tail.toLowerCase())) return true;
      return false;
    };

    // Shape 1 (current PF2e v8+): array of { uuid, level } at system.clericSpells.
    const clericSpells = sys.clericSpells;
    if (Array.isArray(clericSpells)) {
      for (const entry of clericSpells) {
        if (!entry) continue;
        if (typeof entry === "string" && matches(entry)) return true;
        if (matches(entry.uuid) || matches(entry.slug) || matches(entry.id)) return true;
      }
    } else if (clericSpells && typeof clericSpells === "object") {
      for (const v of Object.values(clericSpells)) {
        if (matches(v)) return true;
        if (v && typeof v === "object" && (matches(v.uuid) || matches(v.slug))) return true;
      }
    }

    // Shape 2 (legacy): system.spells is an object map (level -> uuid) or array.
    const legacySpells = sys.spells;
    if (Array.isArray(legacySpells)) {
      for (const entry of legacySpells) {
        if (typeof entry === "string" && matches(entry)) return true;
        if (entry && (matches(entry.uuid) || matches(entry.slug))) return true;
      }
    } else if (legacySpells && typeof legacySpells === "object") {
      for (const v of Object.values(legacySpells)) {
        if (typeof v === "string" && matches(v)) return true;
        if (Array.isArray(v)) {
          for (const x of v) {
            if (matches(x)) return true;
            if (x && (matches(x.uuid) || matches(x.slug))) return true;
          }
        } else if (v && typeof v === "object" && (matches(v.uuid) || matches(v.slug))) {
          return true;
        }
      }
    }

    // Shape 3: domain spells. Deity grants domains; each domain has an initiate
    // benefit / advanced spell that some GMs treat as deity-granted. We look at
    // both system.domains (primary) and any pre-computed list on the actor.
    const domainSources = [];
    if (sys.domains) domainSources.push(sys.domains);
    if (sys.domain) domainSources.push(sys.domain);
    if (actor.system?.details?.deity?.domains) domainSources.push(actor.system.details.deity.domains);

    for (const dom of domainSources) {
      if (!dom) continue;
      const iter = Array.isArray(dom) ? dom : (typeof dom === "object" ? Object.values(dom) : [dom]);
      for (const d of iter) {
        if (!d) continue;
        if (typeof d === "string" && matches(d)) return true;
        if (typeof d === "object") {
          // d may have { initiate, advanced } UUIDs, or { spells: [...] }
          if (matches(d.initiate) || matches(d.advanced) || matches(d.uuid) || matches(d.slug)) return true;
          if (Array.isArray(d.spells)) {
            for (const x of d.spells) {
              if (matches(x)) return true;
              if (x && (matches(x.uuid) || matches(x.slug))) return true;
            }
          }
        }
      }
    }

    // Shape 4: actor-flattened bonus spells list (some sheets expose this).
    const flat = actor.deity?.bonusSpells ?? actor.system?.details?.deity?.bonusSpells;
    if (Array.isArray(flat)) {
      for (const x of flat) {
        if (matches(x)) return true;
        if (x && (matches(x.uuid) || matches(x.slug))) return true;
      }
    }
  } catch {
    // fall through to false
  }
  return false;
}

export function escapeHTML(str) {
  const fn = foundry?.utils?.escapeHTML;
  if (typeof fn === "function") return fn(String(str ?? ""));
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
