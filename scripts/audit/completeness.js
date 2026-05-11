import { SEVERITY } from "../constants.js";
import { expectedSlots } from "./slot-tables.js";

// Required subclass selectors per class. Keys are class slugs; each entry has
// `featureName` (i18n hint suffix) and `slugs` (any of these feat/feature slugs
// satisfies the requirement). Slugs match PF2e core compendium IDs.
const CLASS_SUBCLASS_REQUIREMENTS = {
  bard: { featureName: "muse", slugs: ["maestro", "polymath", "enigma", "warrior"] },
  cleric: { featureName: "doctrine", slugs: ["warpriest", "cloistered-cleric"] },
  sorcerer: {
    featureName: "bloodline",
    slugs: [
      "angelic", "demonic", "diabolic", "draconic", "fey", "genie", "hag",
      "imperial", "phoenix", "psychopomp", "shadow", "undead", "aberrant",
      "elemental", "harrow", "nymph", "wyrmblessed"
    ]
  },
  wizard: {
    featureName: "school",
    slugs: [
      "school-of-ars-grammatica", "school-of-battle-magic", "school-of-civic-wizardry",
      "school-of-mentalism", "school-of-protean-form", "school-of-the-boundary",
      "school-of-unified-magical-theory",
      "abjuration", "conjuration", "divination", "enchantment", "evocation",
      "illusion", "necromancy", "transmutation", "universalist"
    ]
  },
  druid: { featureName: "order", slugs: ["animal", "flame", "leaf", "storm", "untamed", "wave"] },
  champion: {
    featureName: "cause",
    slugs: [
      "liberator", "paladin", "redeemer", "antipaladin", "tyrant", "desecrator",
      "the-tenets-of-good", "the-tenets-of-evil"
    ]
  },
  barbarian: {
    featureName: "instinct",
    slugs: ["animal-instinct", "dragon-instinct", "fury-instinct", "giant-instinct",
            "spirit-instinct", "superstition-instinct"]
  },
  witch: {
    featureName: "patron",
    slugs: ["faith", "fervor", "knowledge", "mosquito", "rune", "silence",
            "spinner-of-threads", "stitches", "wild", "winter"]
  },
  ranger: { featureName: "hunter's edge", slugs: ["flurry", "outwit", "precision"] },
  rogue: {
    featureName: "racket",
    slugs: ["eldritch-trickster", "mastermind", "ruffian", "scoundrel", "thief"]
  },
  monk: { featureName: null, slugs: [] }, // no required subclass
  fighter: { featureName: null, slugs: [] }, // no required subclass
  alchemist: { featureName: "research field", slugs: ["bomber", "chirurgeon", "mutagenist", "toxicologist"] },
  investigator: { featureName: "methodology", slugs: ["alchemical-sciences", "empiricism", "forensic-medicine", "interrogation"] },
  swashbuckler: { featureName: "style", slugs: ["braggart", "fencer", "gymnast", "rascal", "wit"] },
  oracle: {
    featureName: "mystery",
    slugs: ["ancestors", "battle", "bones", "cosmos", "flames", "life", "lore",
            "tempest", "time"]
  },
  psychic: { featureName: "conscious mind", slugs: ["distant-grasp", "infinite-eye", "oscillating-wave", "precision", "silent-whisper", "tangible-dream", "unbound-step"] },
  magus: { featureName: "hybrid study", slugs: ["inexorable-iron", "laughing-shadow", "shooting-star", "starlit-span", "sustaining-steel", "twisting-tree"] },
  inventor: { featureName: "innovation", slugs: ["armor-innovation", "construct-innovation", "weapon-innovation"] },
  kineticist: { featureName: "kinetic gate", slugs: ["dual-gate", "single-gate", "elemental-gate-fire", "elemental-gate-air", "elemental-gate-earth", "elemental-gate-water", "elemental-gate-metal", "elemental-gate-wood"] },
  summoner: { featureName: "eidolon", slugs: ["angel", "anger-phantom", "beast", "construct", "demon", "devotion-phantom", "dragon", "dragon-tyrant", "elemental", "fey", "psychopomp", "undead-phantom"] },
  gunslinger: { featureName: "way", slugs: ["pistolero", "sniper", "drifter", "vanguard", "triggerbrand", "fortune", "drifter"] },
  thaumaturge: {
    featureName: "implement",
    slugs: ["amulet", "bell", "chalice", "lantern", "mirror", "regalia", "tome", "wand", "weapon"]
  },
  animist: { featureName: "apparition", slugs: ["champion-of-the-fallen", "custodian-of-groves-and-gardens", "imposter-in-hidden-places", "lurker-in-devouring-dark", "monarch-who-bows-to-none", "musician-of-the-eternal-chord", "stalker-in-darkened-boughs", "steward-of-stone-and-fire", "witness-to-ancient-battles"] },
  commander: { featureName: "banner", slugs: ["assault-banner", "regimental-banner", "stoic-banner", "trickster-banner"] }
};

// Bilingual feature-keyword patterns. If actor has a class-feature item whose
// name contains one of these, consider the subclass picked (covers community-
// content doctrines/muses/instincts the core slug list doesn't enumerate).
const FEATURE_KEYWORDS = {
  muse: /muse|缪斯/i,
  doctrine: /doctrine|信条|教条/i,
  bloodline: /bloodline|血裔/i,
  school: /school|学派/i,
  cause: /cause|事业|心愿/i,
  instinct: /instinct|本能/i,
  order: /order|教派/i,
  racket: /racket|风格/i,
  patron: /patron|渊源/i,
  mystery: /mystery|神秘/i,
  "hunter's edge": /hunter|猎人/i,
  "research field": /research|研究领域/i,
  methodology: /methodology|调查方法/i,
  style: /style/i,
  "conscious mind": /conscious|意识心智/i,
  "hybrid study": /hybrid|混合研究/i,
  innovation: /innovation/i,
  "kinetic gate": /gate|能门/i,
  eidolon: /eidolon|万灵/i,
  way: /way/i,
  apparition: /apparition|灵显/i,
  banner: /banner|旗帜/i,
  implement: /implement|奇具|神器/i
};

function checkClassSubclass(actor, issues) {
  const classSlug = actor.class?.slug ?? actor.class?.system?.slug;
  if (!classSlug) return;
  const req = CLASS_SUBCLASS_REQUIREMENTS[classSlug];
  if (!req || !req.featureName) return;

  // Method 1: actor has a feat with one of the canonical subclass slugs.
  const ownedSlugs = new Set(
    (actor.itemTypes.feat ?? [])
      .map((f) => f.slug ?? f.system?.slug)
      .filter(Boolean)
  );
  if (req.slugs.some((slug) => ownedSlugs.has(slug))) return;

  // Method 2: actor has a classfeature item that looks like the feature
  // (bilingual keyword match in the name, or carries the class slug as a
  // trait). Catches community content like Clerics+'s "Armorclad" doctrine.
  const pattern = FEATURE_KEYWORDS[req.featureName];
  const classFeats = (actor.itemTypes.feat ?? []).filter((f) => {
    const cat = f.system?.category ?? f.system?.featType;
    return cat === "classfeature";
  });
  for (const f of classFeats) {
    const traits = f.system?.traits?.value ?? [];
    if (pattern && pattern.test(f.name ?? "")) return; // pass
    if (traits.includes(classSlug) && pattern && pattern.test(f.system?.description?.value ?? "")) return;
  }

  issues.push(makeIssue("CLASS_SUBCLASS_MISSING", SEVERITY.ERROR, {
    className: actor.class?.name ?? classSlug,
    feature: req.featureName
  }));
}

function makeIssue(code, severity, params = {}, extra = {}) {
  return {
    code,
    severity,
    i18nKey: `PF2E-CA.Audit.Code.${code}`,
    params,
    ...extra
  };
}

function countFeatsByCategory(actor, category, maxLevel) {
  return actor.itemTypes.feat.filter((f) => {
    const cat = f.system?.category ?? f.system?.featType;
    if (cat !== category) return false;
    const lv = f.system?.level?.value ?? 1;
    return lv <= maxLevel;
  });
}

function countSkillIncreases(actor) {
  const inc = actor.system?.build?.skills?.increases ?? actor.system?.build?.skills ?? {};
  if (Array.isArray(inc)) return inc.length;
  if (inc && typeof inc === "object" && Array.isArray(inc.byLevel)) return inc.byLevel.flat().length;
  let total = 0;
  if (inc && typeof inc === "object") {
    for (const v of Object.values(inc)) {
      if (Array.isArray(v)) total += v.length;
    }
  }
  return total;
}

function checkBasics(actor, issues) {
  if (!actor.ancestry) issues.push(makeIssue("MISSING_ANCESTRY", SEVERITY.ERROR));
  if (!actor.heritage) issues.push(makeIssue("MISSING_HERITAGE", SEVERITY.ERROR));
  if (!actor.background) issues.push(makeIssue("MISSING_BACKGROUND", SEVERITY.ERROR));
  if (!actor.class) issues.push(makeIssue("MISSING_CLASS", SEVERITY.ERROR));
  const keyAbility = actor.class?.system?.keyAbility?.selected;
  if (actor.class && (!keyAbility || (Array.isArray(keyAbility) && keyAbility.length === 0))) {
    issues.push(makeIssue("MISSING_KEY_ABILITY", SEVERITY.ERROR));
  }
}

function checkBoosts(actor, expected, variants, issues) {
  if (variants.gradualBoosts) {
    issues.push(makeIssue("GRADUAL_BOOSTS_ENABLED", SEVERITY.INFO));
    return;
  }
  const boosts = actor.system?.build?.attributes?.boosts ?? {};
  for (const lv of expected.boostLevels) {
    const slot = boosts[lv] ?? boosts[String(lv)] ?? [];
    const arr = Array.isArray(slot) ? slot : [];
    if (arr.length !== 4) {
      issues.push(
        makeIssue("BOOST_COUNT_MISMATCH", SEVERITY.ERROR, { level: lv, actual: arr.length, expected: 4 }, { level: lv })
      );
    }
  }
  // Ancestry flaw check removed entirely. Mandatory ability flaws were phased
  // out in the Remaster era and the field is unreliable across migrated /
  // homebrew ancestries — produces too many false positives to be useful.
  if (expected.level >= 17 && !variants.abp) {
    if (!actor.system?.build?.attributes?.apex) {
      issues.push(makeIssue("APEX_MISSING_AT_17", SEVERITY.ERROR, { level: expected.level }));
    }
  }
}

function checkLanguages(actor, issues) {
  const value = actor.system?.details?.languages?.value ?? [];
  const granted = actor.system?.build?.languages?.granted ?? [];
  const max = actor.system?.build?.languages?.max ?? null;
  if (typeof max !== "number") return;

  // build.languages.max is the cap on *additional* selectable languages on top of
  // the ancestry-granted ones (Common + ancestry language). Compare apples to apples.
  const grantedSlugs = new Set(
    granted.map((g) => (typeof g === "string" ? g : g?.slug)).filter(Boolean)
  );
  const chosenExtras = value.filter((slug) => !grantedSlugs.has(slug));
  const extras = chosenExtras.length;

  if (extras > max) {
    issues.push(
      makeIssue("LANGUAGE_OVER_LIMIT", SEVERITY.ERROR, { actual: extras, max, total: value.length })
    );
  } else if (extras < max) {
    issues.push(
      makeIssue("LANGUAGE_UNDER_LIMIT", SEVERITY.WARN, { actual: extras, max, total: value.length })
    );
  }
}

function checkFeatSlots(actor, expected, issues) {
  const checks = [
    { code: "ANCESTRY_FEAT_MISSING", category: "ancestry", expected: expected.ancestryFeats },
    { code: "CLASS_FEAT_MISSING", category: "class", expected: expected.classFeats },
    { code: "SKILL_FEAT_MISSING", category: "skill", expected: expected.skillFeats },
    { code: "GENERAL_FEAT_MISSING", category: "general", expected: expected.generalFeats }
  ];
  const allLevels = Object.keys(expected.ancestryFeats).concat(
    Object.keys(expected.classFeats), Object.keys(expected.skillFeats), Object.keys(expected.generalFeats)
  );
  if (allLevels.length === 0) return;

  for (const c of checks) {
    const owned = actor.itemTypes.feat.filter((f) => {
      const cat = f.system?.category ?? f.system?.featType;
      return cat === c.category;
    });
    const targetLevels = Object.keys(c.expected).map(Number).filter((k) => k <= expected.level);
    if (targetLevels.length === 0) continue;
    const maxLv = Math.max(...targetLevels);
    const expectedCumulative = targetLevels.reduce((s, k) => s + (c.expected[k] || 0), 0);
    const got = owned.filter((f) => (f.system?.level?.value ?? 1) <= maxLv).length;
    if (got < expectedCumulative) {
      issues.push(
        makeIssue(c.code, SEVERITY.ERROR, { level: maxLv, expected: expectedCumulative, actual: got }, { level: maxLv })
      );
    }
  }
}

function checkArchetypeSlots(actor, expected, variants, issues) {
  if (!variants.freeArchetype) return;
  const archetype = actor.itemTypes.feat.filter((f) => {
    const cat = f.system?.category ?? f.system?.featType;
    const traits = f.system?.traits?.value ?? [];
    return cat === "archetype" || traits.includes("archetype") || traits.includes("dedication");
  });
  const targetLevels = Object.keys(expected.archetypeFeats).map(Number).filter((k) => k <= expected.level);
  if (targetLevels.length === 0) return;
  const maxLv = Math.max(...targetLevels);
  const expectedCumulative = targetLevels.reduce((s, k) => s + (expected.archetypeFeats[k] || 0), 0);
  const got = archetype.filter((f) => (f.system?.level?.value ?? 1) <= maxLv).length;
  if (got < expectedCumulative) {
    issues.push(
      makeIssue("ARCHETYPE_FEAT_MISSING", SEVERITY.ERROR, { level: maxLv, expected: expectedCumulative, actual: got }, { level: maxLv })
    );
  }
}

function checkSkillIncreases(actor, expected, issues) {
  const expectedTotal = Object.values(expected.skillIncreases).reduce((s, n) => s + n, 0);
  if (expectedTotal === 0) return;

  // PF2e v8 / Remaster doesn't always populate actor.system.build.skills.
  // Skip the check entirely when we can't read the data — reporting "0 vs N"
  // for every higher-level character is just noise.
  const inc = actor.system?.build?.skills?.increases ?? actor.system?.build?.skills;
  if (!inc) return;
  const hasAnyData = (typeof inc === "object")
    && Object.values(inc).some((v) => Array.isArray(v) ? v.length > 0 : !!v);
  if (!hasAnyData) return;

  const actual = countSkillIncreases(actor);
  if (actual < expectedTotal) {
    issues.push(
      makeIssue("SKILL_INCREASE_MISSING", SEVERITY.ERROR, { expected: expectedTotal, actual })
    );
  }
}

function checkDedications(actor, issues) {
  const dedications = actor.itemTypes.feat.filter((f) => {
    const traits = f.system?.traits?.value ?? [];
    return traits.includes("dedication");
  });
  if (dedications.length <= 1) return;

  for (const ded of dedications) {
    const slug = ded.slug ?? ded.system?.slug;
    if (!slug) continue;
    const archName = slug.replace(/-dedication$/, "");
    // PF2e tags archetype follow-up feats with the archetype-name trait, not
    // by slug prefix (e.g. "Guarded Mind" has trait "ulfen-guard" but slug
    // doesn't start with "ulfen-guard"). Match by trait.
    const followups = actor.itemTypes.feat.filter((f) => {
      if (f.id === ded.id) return false;
      const traits = f.system?.traits?.value ?? [];
      if (traits.includes("dedication")) return false; // exclude other dedications
      return traits.includes(archName);
    });
    if (followups.length < 2) {
      issues.push(makeIssue("DEDICATION_2_FEAT_RULE", SEVERITY.WARN, {
        dedication: ded.name ?? slug,
        actual: followups.length
      }));
    }
  }
}

function checkDualClass(actor, variants, issues) {
  if (!variants.dualClass) return;
  issues.push(makeIssue("DUAL_CLASS_DETECTED", SEVERITY.INFO));
}

function checkStartingEquipment(actor, issues) {
  const inv = [
    ...(actor.itemTypes.weapon ?? []),
    ...(actor.itemTypes.armor ?? []),
    ...(actor.itemTypes.shield ?? []),
    ...(actor.itemTypes.equipment ?? []),
    ...(actor.itemTypes.consumable ?? [])
  ];
  if (inv.length === 0) {
    issues.push(makeIssue("STARTING_EQUIPMENT_EMPTY", SEVERITY.WARN));
  }
}

function checkSpellcasting(actor, issues) {
  const entries = actor.itemTypes.spellcastingEntry ?? [];
  if (entries.length === 0) return;
  const spellCount = (actor.itemTypes.spell ?? []).length;
  if (spellCount === 0) {
    issues.push(makeIssue("SPELL_LIST_INCOMPLETE", SEVERITY.WARN, { actual: 0 }));
  }
}

function checkBackgroundSkill(actor, issues) {
  const bg = actor.background;
  if (!bg) return;
  const trained = bg.system?.trainedSkills?.value;
  if (!Array.isArray(trained) || trained.length === 0) return;

  for (const slug of trained) {
    const rank = actor.skills?.[slug]?.rank ?? actor.system?.skills?.[slug]?.rank ?? 0;
    if (rank < 1) {
      issues.push(makeIssue("BACKGROUND_SKILL_NOT_TRAINED", SEVERITY.WARN, {
        background: bg.name,
        skill: slug
      }));
    }
  }
}

function checkHP(actor, issues) {
  const max = actor.system?.attributes?.hp?.max;
  if (typeof max !== "number") return;
  const ancestryHp = actor.ancestry?.system?.hp ?? 0;
  const classHp = actor.class?.system?.hp ?? 0;
  if (ancestryHp <= 0 || classHp <= 0) return;
  const conMod = actor.system?.abilities?.con?.mod ?? 0;
  const level = actor.system?.details?.level?.value ?? 1;
  const baseline = ancestryHp + (classHp + conMod) * level;
  // Many feats / class features ADD hp; flag only when actor's max is below the
  // unmodified baseline by more than 2 (typo / forgotten leveling).
  if (max + 2 < baseline) {
    issues.push(makeIssue("HP_UNDER_EXPECTED", SEVERITY.WARN, { actual: max, baseline }));
  }
}

function checkStartingWealth(actor, issues) {
  const level = actor.system?.details?.level?.value ?? 1;
  if (level !== 1) return;
  let copper = 0;
  // Try the modern PF2e API first.
  if (typeof actor.inventory?.coins?.copperValue === "number") {
    copper = actor.inventory.coins.copperValue;
  } else {
    // Fallback: walk treasure items.
    for (const item of actor.itemTypes.treasure ?? []) {
      if (item.system?.stackGroup !== "coins") continue;
      const slug = item.slug ?? item.system?.slug ?? "";
      const qty = item.system?.quantity ?? 0;
      const factor = slug === "platinum-pieces" ? 1000
        : slug === "gold-pieces" ? 100
        : slug === "silver-pieces" ? 10
        : slug === "copper-pieces" ? 1 : 0;
      copper += qty * factor;
    }
  }
  const gp = copper / 100;
  if (gp > 15) {
    issues.push(makeIssue("STARTING_WEALTH_EXCEEDED", SEVERITY.INFO, { gp: Math.floor(gp * 10) / 10 }));
  }
}

function checkSpellPreparation(actor, issues) {
  const entries = actor.itemTypes.spellcastingEntry ?? [];
  for (const entry of entries) {
    const isPrepared = entry.system?.prepared?.value === "prepared";
    if (!isPrepared) continue;
    const slots = entry.system?.slots ?? {};
    let unfilled = 0;
    for (let rank = 0; rank <= 10; rank++) {
      const slot = slots[`slot${rank}`];
      if (!slot) continue;
      const max = Number(slot.max ?? 0);
      if (max <= 0) continue;
      const prepared = Array.isArray(slot.prepared) ? slot.prepared : Object.values(slot.prepared ?? {});
      const filled = prepared.filter((p) => p && (p.id || p.value)).length;
      if (filled < max) unfilled += max - filled;
    }
    if (unfilled > 0) {
      issues.push(makeIssue("SPELL_PREPARATION_INCOMPLETE", SEVERITY.WARN, {
        entry: entry.name,
        missing: unfilled
      }));
    }
  }
}

function checkClassFeatures(actor, issues) {
  if (!actor.class) return;
  const classFeatures = actor.itemTypes.feat.filter((f) => {
    const cat = f.system?.category ?? f.system?.featType;
    return cat === "classfeature";
  });

  if (classFeatures.length === 0) {
    issues.push(makeIssue("CLASS_FEATURES_MISSING", SEVERITY.WARN, {}));
    return;
  }

  // Deep check via class.system.items (PF2e populates this with each class's
  // auto-granted features keyed by level). For every entry at or below the
  // actor's level, verify a matching item exists on the actor (matched by
  // compendium sourceId).
  const items = actor.class.system?.items;
  if (!items || typeof items !== "object") return;
  const level = actor.system?.details?.level?.value ?? 1;
  const ownedSources = new Set();
  for (const item of actor.items ?? []) {
    const src = item.flags?.core?.sourceId
      ?? item._stats?.compendiumSource
      ?? item.sourceId
      ?? null;
    if (src) ownedSources.add(src);
  }
  const missing = [];
  for (const entry of Object.values(items)) {
    if (!entry || typeof entry !== "object") continue;
    if (!entry.uuid) continue;
    if ((entry.level ?? 0) > level) continue;
    if (!ownedSources.has(entry.uuid)) {
      missing.push(entry.name || entry.uuid.split(".").pop());
    }
  }
  if (missing.length > 0) {
    const preview = missing.slice(0, 3).join(", ") + (missing.length > 3 ? ` (+${missing.length - 3})` : "");
    issues.push(makeIssue("CLASS_FEATURES_MISSING_SPECIFIC", SEVERITY.WARN, {
      count: missing.length,
      names: preview
    }));
  }
}

function checkLevelXP(actor, issues) {
  const level = actor.system?.details?.level?.value ?? 1;
  if (level >= 20) return;
  const xpVal = actor.system?.details?.xp?.value ?? 0;
  const xpMax = actor.system?.details?.xp?.max ?? 1000;
  if (xpMax > 0 && xpVal >= xpMax) {
    issues.push(makeIssue("LEVEL_UP_PENDING", SEVERITY.INFO, { xp: xpVal, threshold: xpMax, level }));
  }
}

function checkSpellTraditions(actor, issues) {
  const entries = actor.itemTypes.spellcastingEntry ?? [];
  const allSpells = actor.itemTypes.spell ?? [];
  if (entries.length === 0 || allSpells.length === 0) return;

  for (const entry of entries) {
    const tradition = entry.system?.tradition?.value ?? entry.system?.tradition;
    if (!tradition || tradition === "focus" || tradition === "") continue;

    const entrySpells = allSpells.filter((s) => s.system?.location?.value === entry.id);
    for (const spell of entrySpells) {
      const traits = spell.system?.traits?.value ?? [];
      const traditions = spell.system?.traits?.traditions ?? [];
      const allTags = new Set([...(Array.isArray(traits) ? traits : []), ...(Array.isArray(traditions) ? traditions : [])]);
      // Skip cantrips/rituals/focus mark
      if (allTags.has("focus")) continue;
      // If the spell explicitly lists ANY tradition and ours isn't one of them, flag it.
      const hasTraditionTags = ["arcane", "divine", "occult", "primal"].some((t) => allTags.has(t));
      if (!hasTraditionTags) continue;
      if (!allTags.has(tradition)) {
        issues.push(makeIssue("SPELL_TRADITION_MISMATCH", SEVERITY.INFO, {
          spell: spell.name,
          spellTraditions: [...allTags].filter((t) => ["arcane", "divine", "occult", "primal"].includes(t)).join("/") || "—",
          entryTradition: tradition
        }));
      }
    }
  }
}

function checkLegacySource(actor, issues) {
  let count = 0;
  for (const item of actor.items) {
    const hasLegacy = item.system?.source?.value && !item.system?.publication?.title;
    if (hasLegacy) count++;
  }
  if (count > 0) {
    issues.push(makeIssue("LEGACY_SOURCE_FIELD", SEVERITY.INFO, { count }));
  }
}

export function auditCompleteness(actor, variants) {
  const issues = [];
  const expected = expectedSlots(actor, variants);

  checkBasics(actor, issues);
  checkClassSubclass(actor, issues);
  checkBoosts(actor, expected, variants, issues);
  checkLanguages(actor, issues);
  checkFeatSlots(actor, expected, issues);
  checkArchetypeSlots(actor, expected, variants, issues);
  checkSkillIncreases(actor, expected, issues);
  checkDedications(actor, issues);
  checkDualClass(actor, variants, issues);
  checkStartingEquipment(actor, issues);
  checkSpellcasting(actor, issues);
  checkBackgroundSkill(actor, issues);
  checkSpellTraditions(actor, issues);
  checkClassFeatures(actor, issues);
  checkHP(actor, issues);
  checkLevelXP(actor, issues);
  checkStartingWealth(actor, issues);
  checkSpellPreparation(actor, issues);
  checkLegacySource(actor, issues);

  const summary = {
    errors: issues.filter((i) => i.severity === SEVERITY.ERROR).length,
    warnings: issues.filter((i) => i.severity === SEVERITY.WARN).length,
    infos: issues.filter((i) => i.severity === SEVERITY.INFO).length,
    total: issues.length
  };

  return { issues, slots: expected, summary };
}
