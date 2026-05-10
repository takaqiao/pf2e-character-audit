import { ATTRIBUTES, SKILLS, ANCESTRY_TRAIT_ALIASES } from "../constants.js";
import { slugify } from "../utils/pf2e-api.js";

function safeSlug(item) {
  return item?.slug ?? item?.system?.slug ?? (item?.name ? slugify(item.name) : null);
}

function deriveHeritageAliases(actor) {
  const traits = new Set([
    ...(actor.heritage?.system?.traits?.value ?? []),
    ...(actor.ancestry?.system?.traits?.value ?? [])
  ]);
  const aliases = new Set();
  if (actor.heritage?.slug) aliases.add(actor.heritage.slug);
  if (actor.ancestry?.slug) aliases.add(actor.ancestry.slug);
  for (const trait of traits) {
    aliases.add(trait);
    const alias = ANCESTRY_TRAIT_ALIASES[trait];
    if (alias) aliases.add(alias);
  }
  return aliases;
}

function deriveAncestryTraits(actor) {
  return new Set([
    ...(actor.ancestry?.system?.traits?.value ?? []),
    ...(actor.heritage?.system?.traits?.value ?? [])
  ]);
}

function deriveAttributes(actor) {
  const out = {};
  for (const k of ATTRIBUTES) {
    out[k] = actor.system?.abilities?.[k]?.mod ?? 0;
  }
  return out;
}

function deriveSkills(actor) {
  const out = {};
  for (const k of SKILLS) {
    out[k] = actor.system?.skills?.[k]?.rank ?? 0;
  }
  return out;
}

function deriveLanguages(actor) {
  const value = actor.system?.details?.languages?.value ?? [];
  const granted = (actor.system?.build?.languages?.granted ?? []).map((g) => g?.slug).filter(Boolean);
  return new Set([...value, ...granted]);
}

function deriveLores(actor) {
  return (actor.itemTypes.lore ?? []).map((l) => ({
    slug: safeSlug(l),
    name: l.name,
    rank: l.system?.proficient?.value ?? l.system?.rank ?? 0
  }));
}

function deriveProficiencies(actor) {
  const proficiencies = {
    fortitude: actor.system?.saves?.fortitude?.rank ?? 0,
    reflex: actor.system?.saves?.reflex?.rank ?? 0,
    will: actor.system?.saves?.will?.rank ?? 0,
    perception: actor.system?.perception?.rank ?? 0,
    classDC: actor.classDC?.rank ?? 0,
    spellAttack: actor.system?.proficiencies?.spellcasting?.rank ?? 0,
    spellDC: actor.system?.proficiencies?.spellcasting?.rank ?? 0
  };
  const attacks = actor.system?.proficiencies?.attacks ?? {};
  for (const [k, v] of Object.entries(attacks)) {
    proficiencies[k] = typeof v === "object" ? (v?.rank ?? 0) : (v ?? 0);
  }
  const defenses = actor.system?.proficiencies?.defenses ?? {};
  for (const [k, v] of Object.entries(defenses)) {
    proficiencies[k] = typeof v === "object" ? (v?.rank ?? 0) : (v ?? 0);
  }
  return proficiencies;
}

function deriveEquipment(actor) {
  const armorCategories = new Set();
  const weaponCategories = new Set();
  const weaponGroups = new Set();
  const weaponTraits = new Set();
  let wieldedMelee = false;
  let wieldedRanged = false;
  let hasShield = false;

  for (const a of actor.itemTypes.armor ?? []) {
    if (a.system?.category) armorCategories.add(a.system.category);
  }
  for (const s of actor.itemTypes.shield ?? []) {
    hasShield = true;
    if (s.system?.equipped?.carryType === "held") hasShield = true;
  }
  for (const w of actor.itemTypes.weapon ?? []) {
    if (w.system?.category) weaponCategories.add(w.system.category);
    if (w.system?.group) weaponGroups.add(w.system.group);
    for (const t of w.system?.traits?.value ?? []) weaponTraits.add(t);
    const range = w.system?.range;
    if (w.system?.equipped?.carryType === "held") {
      if (range && range !== null) wieldedRanged = true;
      else wieldedMelee = true;
    }
  }
  return {
    armorCategories,
    weaponCategories,
    weaponGroups,
    weaponTraits,
    wieldedMelee,
    wieldedRanged,
    hasShield,
    weapons: (actor.itemTypes.weapon ?? []).map((w) => ({
      slug: safeSlug(w),
      name: w.name,
      traits: w.system?.traits?.value ?? [],
      group: w.system?.group ?? null,
      category: w.system?.category ?? null
    }))
  };
}

function deriveFeats(actor) {
  return (actor.itemTypes.feat ?? []).map((f) => ({
    slug: safeSlug(f),
    name: f.name,
    level: f.system?.level?.value ?? 1,
    type: f.system?.featType ?? f.system?.category ?? null,
    traits: f.system?.traits?.value ?? [],
    sourceUuid: f.uuid
  }));
}

function deriveClassFeatures(actor) {
  const slugs = (actor.itemTypes.feat ?? [])
    .filter((f) => (f.system?.category ?? f.system?.featType) === "classfeature")
    .map((f) => safeSlug(f))
    .filter(Boolean);
  return new Set(slugs);
}

function deriveDeityState(actor) {
  const deity = actor.deity;
  if (!deity) return null;
  const domains = new Set([
    ...(deity.system?.domains?.primary ?? []),
    ...(deity.system?.domains?.alternate ?? [])
  ]);
  return {
    hasDeity: true,
    slug: safeSlug(deity),
    name: deity.name,
    traits: deity.system?.traits?.value ?? [],
    sanctification: deity.system?.sanctification?.modal ?? null,
    fonts: deity.system?.font ?? [],
    domains
  };
}

function deriveDivineFont(actor) {
  const flag = actor.class?.flags?.pf2e?.divineFont ?? actor.flags?.pf2e?.divineFont ?? null;
  if (flag) return flag;
  const fonts = actor.deity?.system?.font ?? [];
  if (Array.isArray(fonts) && fonts.length === 1) return fonts[0];
  return null;
}

function deriveSpellcasting(actor) {
  const entries = actor.itemTypes.spellcastingEntry ?? [];
  const traditions = new Set();
  const types = new Set();
  let focusPool = false;
  let hasSpellSlots = false;
  for (const e of entries) {
    const tradition = e.system?.tradition?.value ?? e.system?.tradition;
    const type = e.system?.prepared?.value ?? e.system?.spellcastingType;
    if (tradition && tradition !== "focus") traditions.add(tradition);
    if (type) types.add(type);
    if (e.system?.prepared?.value === "focus" || tradition === "focus" || e.isFocusPool) focusPool = true;
    const slots = e.system?.slots ?? {};
    for (const s of Object.values(slots)) {
      if (s?.max > 0) hasSpellSlots = true;
    }
  }
  const spells = actor.itemTypes.spell ?? [];
  const spellNames = new Set(spells.map((s) => safeSlug(s)).filter(Boolean));
  const spellTraits = new Set();
  for (const s of spells) {
    for (const t of s.system?.traits?.value ?? []) spellTraits.add(t);
  }
  return {
    hasSpellcasting: entries.length > 0,
    traditions,
    types,
    entryCount: entries.length,
    focusPool,
    hasSpellSlots,
    spellNames,
    spellTraits
  };
}

function deriveArchetypeDedications(actor) {
  return (actor.itemTypes.feat ?? [])
    .filter((f) => (f.system?.traits?.value ?? []).includes("dedication"))
    .map((f) => {
      const slug = safeSlug(f) ?? "";
      const archetype = slug.replace(/-dedication$/, "");
      return { slug, archetype, name: f.name };
    });
}

function deriveDedicationProgress(actor) {
  const dedications = deriveArchetypeDedications(actor);
  const progress = {};
  for (const ded of dedications) {
    const followups = (actor.itemTypes.feat ?? []).filter((f) => {
      if ((f.system?.traits?.value ?? []).includes("dedication")) return false;
      const fSlug = safeSlug(f) ?? "";
      const traits = f.system?.traits?.value ?? [];
      return traits.includes("archetype") && fSlug.startsWith(ded.archetype);
    });
    progress[ded.slug] = followups.length;
  }
  return progress;
}

function deriveIncompleteDedications(actor) {
  const progress = deriveDedicationProgress(actor);
  const incomplete = [];
  for (const [slug, count] of Object.entries(progress)) {
    if (count < 2) incomplete.push({ slug, count });
  }
  return incomplete;
}

function deriveSenses(actor) {
  const raw = actor.system?.perception?.senses ?? actor.system?.traits?.senses?.value ?? [];
  const set = new Set();
  if (Array.isArray(raw)) {
    for (const s of raw) {
      if (typeof s === "string") set.add(s);
      else if (s?.type) set.add(s.type);
      else if (s?.value) set.add(s.value);
    }
  }
  return set;
}

function deriveFeatAliasMap(actor) {
  const map = new Map();
  for (const f of actor.itemTypes.feat ?? []) {
    const slug = safeSlug(f);
    if (!slug) continue;
    const inner = new Map();
    inner.set(slug, f.name);
    map.set(slug, inner);
  }
  return map;
}

export function buildBuildStateFromActor(actor) {
  if (!actor) return null;

  const level = actor.system?.details?.level?.value ?? 1;
  const classSlug = safeSlug(actor.class);
  const ancestrySlug = safeSlug(actor.ancestry);
  const heritageSlug = safeSlug(actor.heritage);
  const backgroundSlug = safeSlug(actor.background);

  const attributes = deriveAttributes(actor);
  const skills = deriveSkills(actor);
  const languages = deriveLanguages(actor);
  const lores = deriveLores(actor);
  const proficiencies = deriveProficiencies(actor);
  const equipment = deriveEquipment(actor);
  const featList = deriveFeats(actor);
  const featAliasSources = deriveFeatAliasMap(actor);
  const deity = deriveDeityState(actor);
  const divineFont = deriveDivineFont(actor);
  const spellcasting = deriveSpellcasting(actor);
  const archetypeDedications = deriveArchetypeDedications(actor);
  const archetypeDedicationProgress = deriveDedicationProgress(actor);
  const incompleteArchetypeDedications = deriveIncompleteDedications(actor);
  const classFeatures = deriveClassFeatures(actor);
  const senses = deriveSenses(actor);
  const heritageAliases = deriveHeritageAliases(actor);
  const ancestryTraits = deriveAncestryTraits(actor);

  const featSet = new Set(featList.map((f) => f.slug).filter(Boolean));

  const classEntry = classSlug
    ? {
        slug: classSlug,
        name: actor.class?.name,
        hp: actor.class?.system?.hp ?? null,
        traditions: spellcasting.traditions,
        subclassType: actor.class?.system?.flags?.pf2e?.subclass ?? null
      }
    : null;

  return {
    level,
    classSlug,
    dualClassSlug: null,
    class: classEntry,
    dualClass: null,
    classes: classEntry ? [classEntry] : [],
    ancestrySlug,
    heritageSlug,
    heritageAliases,
    ancestryTraits,
    backgroundSlug,
    attributes,
    rawAttributes: attributes,
    skills,
    languages,
    lores,
    proficiencies,
    weaponProficiencies: proficiencies,
    equipment,
    feats: featSet,
    featList,
    featAliasSources,
    deity,
    divineFont,
    spellcasting,
    archetypeDedications,
    archetypeDedicationProgress,
    incompleteArchetypeDedications,
    canTakeNewArchetypeDedication: incompleteArchetypeDedications.length === 0,
    classArchetypeDedications: [],
    classArchetypeTraits: [],
    classFeatures,
    senses
  };
}
