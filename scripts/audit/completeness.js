import { SEVERITY } from "../constants.js";
import { expectedSlots } from "./slot-tables.js";

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
  const flaws = actor.system?.build?.attributes?.flaws ?? {};
  const ancestryFlaws = actor.ancestry?.system?.flaws ?? {};
  const ancestryFlawCount = Object.values(ancestryFlaws).filter((v) => v?.value !== "free").length;
  const flawTotal = Object.values(flaws).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0);
  if (ancestryFlawCount > 0 && flawTotal === 0 && expected.level >= 1) {
    issues.push(
      makeIssue("ANCESTRY_FLAW_MISMATCH", SEVERITY.WARN, { expected: ancestryFlawCount, actual: flawTotal })
    );
  }
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
  const archetypeFeatCounts = new Map();
  for (const ded of dedications) {
    const slug = ded.slug ?? ded.system?.slug;
    if (!slug) continue;
    const archName = slug.replace(/-dedication$/, "");
    const followups = actor.itemTypes.feat.filter((f) => {
      if (f === ded) return false;
      const traits = f.system?.traits?.value ?? [];
      const fSlug = f.slug ?? f.system?.slug ?? "";
      return traits.includes("archetype") && fSlug.startsWith(archName);
    });
    archetypeFeatCounts.set(slug, followups.length);
  }
  for (const [slug, count] of archetypeFeatCounts.entries()) {
    if (count < 2) {
      issues.push(makeIssue("DEDICATION_2_FEAT_RULE", SEVERITY.WARN, { dedication: slug, actual: count }));
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
  checkBoosts(actor, expected, variants, issues);
  checkLanguages(actor, issues);
  checkFeatSlots(actor, expected, issues);
  checkArchetypeSlots(actor, expected, variants, issues);
  checkSkillIncreases(actor, expected, issues);
  checkDedications(actor, issues);
  checkDualClass(actor, variants, issues);
  checkStartingEquipment(actor, issues);
  checkSpellcasting(actor, issues);
  checkLegacySource(actor, issues);

  const summary = {
    errors: issues.filter((i) => i.severity === SEVERITY.ERROR).length,
    warnings: issues.filter((i) => i.severity === SEVERITY.WARN).length,
    infos: issues.filter((i) => i.severity === SEVERITY.INFO).length,
    total: issues.length
  };

  return { issues, slots: expected, summary };
}
