import { SEVERITY } from "../constants.js";

/**
 * Cross-cutting audits that don't fit the per-character completeness/
 * prerequisite/publication detectors:
 *
 *  - auditClericDomains: per-actor sanity check on a cleric's owned domain
 *    feats vs the number of domain focus spells.
 *  - auditPartySkillCoverage / auditPartyLanguageCoverage: party-level
 *    coverage gaps a GM cares about for encounter design.
 *  - PARTY_SAVES_VULNERABILITY is emitted from auditPartySkillCoverage's
 *    sibling save check (kept in this same file for locality).
 *
 * Issue shape: { code, severity, i18nKey, params }.
 * Summary shape: { errors, warnings, infos, total }.
 */

function makeIssue(code, severity, params = {}) {
  return {
    code,
    severity,
    i18nKey: `PF2E-CA.Audit.Code.${code}`,
    params
  };
}

function summarize(issues) {
  return {
    errors: issues.filter((i) => i.severity === SEVERITY.ERROR).length,
    warnings: issues.filter((i) => i.severity === SEVERITY.WARN).length,
    infos: issues.filter((i) => i.severity === SEVERITY.INFO).length,
    total: issues.length
  };
}

// ---------- Per-actor: cleric domain count ----------

const DOMAIN_FEAT_SLUGS = new Set(["domain-initiate", "advanced-domain"]);

/** Pull a domain slug out of a domain-feat's pf2e flags (best-effort). */
function readDomainChoice(feat) {
  const flags = feat?.flags?.pf2e ?? {};
  const fromRules = flags.rulesSelections?.domain;
  if (typeof fromRules === "string" && fromRules) return fromRules;
  const fromChoice = flags.choiceSelections?.domain;
  if (typeof fromChoice === "string" && fromChoice) return fromChoice;
  // Some builds store an object — try .value
  if (fromRules && typeof fromRules === "object" && typeof fromRules.value === "string") {
    return fromRules.value;
  }
  if (fromChoice && typeof fromChoice === "object" && typeof fromChoice.value === "string") {
    return fromChoice.value;
  }
  return null;
}

/** Count distinct domain focus spells the actor owns. Heuristic. */
function countDomainFocusSpells(actor) {
  const spells = actor.itemTypes?.spell ?? [];
  const domains = new Set();
  for (const s of spells) {
    const traits = s.system?.traits?.value ?? [];
    if (!Array.isArray(traits)) continue;
    if (!traits.includes("focus")) continue;
    // Domain spells are tagged with `cleric` AND a domain trait. We can't
    // enumerate every domain (homebrew exists), but PF2e tags the spell with
    // the domain slug directly. Inspect the spell's slug for "-domain-spell"
    // suffix as a fallback signal.
    const slug = s.slug ?? s.system?.slug ?? "";
    const looksLikeDomainSpell = /(^|-)domain(-spell)?$/.test(slug)
      || /-(initial|advanced)-domain-spell$/.test(slug)
      || traits.includes("cleric");
    if (!looksLikeDomainSpell) continue;
    // Pull the most-specific non-generic trait as a "domain identifier".
    const GENERIC = new Set(["focus", "cleric", "divine", "uncommon", "rare", "common", "cantrip", "spell"]);
    const candidate = traits.find((t) => !GENERIC.has(t));
    if (candidate) domains.add(candidate);
    else domains.add(slug); // fall back to slug uniqueness
  }
  return domains.size;
}

export function auditClericDomains(actor) {
  const issues = [];
  const classSlug = actor?.class?.slug ?? actor?.class?.system?.slug ?? null;
  if (classSlug !== "cleric") {
    return { issues, summary: summarize(issues) };
  }

  // Count domain feats (Domain Initiate + Advanced Domain).
  const feats = actor.itemTypes?.feat ?? [];
  const domainFeats = feats.filter((f) => DOMAIN_FEAT_SLUGS.has(f.slug ?? f.system?.slug ?? ""));
  const domainInitiateCount = domainFeats.filter(
    (f) => (f.slug ?? f.system?.slug) === "domain-initiate"
  ).length;
  const advancedDomainCount = domainFeats.filter(
    (f) => (f.slug ?? f.system?.slug) === "advanced-domain"
  ).length;

  // Expected: 1 (primary) + each Domain Initiate feat + each Advanced Domain.
  // Advanced Domain doesn't grant a new domain — it grants an advanced spell
  // for one already owned — so don't count it toward distinct-domain expectation.
  const expected = 1 + domainInitiateCount;

  // Try to read the distinct domain slugs the player actually picked.
  const chosenDomains = new Set();
  // Primary domain may live on the cleric class doctrine feature; we don't
  // try to read it directly. Instead, count distinct domain focus spells.
  for (const f of domainFeats) {
    const d = readDomainChoice(f);
    if (d) chosenDomains.add(d);
  }

  const focusSpellDomains = countDomainFocusSpells(actor);
  // Use the larger of (feat-choice flags, focus-spell heuristic) as actual.
  const actual = Math.max(chosenDomains.size + (chosenDomains.size > 0 ? 1 : 0), focusSpellDomains);

  // Defensive: if we couldn't determine either signal at all, bail.
  if (actual === 0 || expected === 0) {
    return { issues, summary: summarize(issues) };
  }

  if (actual !== expected) {
    issues.push(makeIssue("CLERIC_DOMAIN_COUNT_OFF", SEVERITY.WARN, {
      expected,
      actual,
      advancedDomain: advancedDomainCount
    }));
  }

  return { issues, summary: summarize(issues) };
}

// ---------- Per-party: skill coverage ----------

const KEY_PARTY_SKILLS = [
  "stealth", "medicine", "diplomacy", "athletics", "acrobatics",
  "society", "survival", "religion", "nature", "arcana",
  "occultism", "thievery"
];

function skillRank(actor, slug) {
  return actor?.skills?.[slug]?.rank
    ?? actor?.system?.skills?.[slug]?.rank
    ?? 0;
}

export function auditPartySkillCoverage(actorArray) {
  const issues = [];
  const actors = Array.isArray(actorArray) ? actorArray.filter(Boolean) : [];
  if (actors.length === 0) return { issues, summary: summarize(issues) };

  for (const skill of KEY_PARTY_SKILLS) {
    const someoneTrained = actors.some((a) => skillRank(a, skill) >= 1);
    if (!someoneTrained) {
      issues.push(makeIssue("PARTY_SKILL_COVERAGE_GAP", SEVERITY.INFO, { skill }));
    }
  }

  return { issues, summary: summarize(issues) };
}

// ---------- Per-party: language coverage ----------

const USEFUL_PARTY_LANGUAGES = [
  "common", "draconic", "fey", "necril", "celestial",
  "elven", "dwarven", "goblin"
];

function normalizeLanguages(actor) {
  const arr = actor?.system?.details?.languages?.value ?? [];
  if (!Array.isArray(arr)) return [];
  return arr.map((l) => (typeof l === "string" ? l : l?.slug ?? "")).filter(Boolean)
    .map((l) => l.toLowerCase().trim());
}

export function auditPartyLanguageCoverage(actorArray) {
  const issues = [];
  const actors = Array.isArray(actorArray) ? actorArray.filter(Boolean) : [];
  if (actors.length === 0) return { issues, summary: summarize(issues) };

  const spoken = new Set();
  for (const a of actors) {
    for (const l of normalizeLanguages(a)) spoken.add(l);
  }

  for (const lang of USEFUL_PARTY_LANGUAGES) {
    if (!spoken.has(lang)) {
      issues.push(makeIssue("PARTY_LANGUAGE_COVERAGE_GAP", SEVERITY.INFO, { language: lang }));
    }
  }

  return { issues, summary: summarize(issues) };
}

// ---------- Per-party: save vulnerability ----------

const SAVES = ["fortitude", "reflex", "will"];

function actorLevel(actor) {
  return actor?.system?.details?.level?.value ?? 1;
}

function saveMod(actor, slug) {
  const v = actor?.system?.saves?.[slug]?.totalModifier;
  return typeof v === "number" ? v : null;
}

/**
 * For each save, if avg(save mod) <= avg(level) - 2, party is fragile.
 * Threshold rationale: a level-N character with master proficiency and a +4
 * ability is ~level+8 (mod). The line "level - 2" approximates an untrained-
 * with-no-mod baseline.
 */
export function auditPartySaves(actorArray) {
  const issues = [];
  const actors = Array.isArray(actorArray) ? actorArray.filter(Boolean) : [];
  if (actors.length < 2) return { issues, summary: summarize(issues) };

  const avgLevel = actors.reduce((s, a) => s + actorLevel(a), 0) / actors.length;
  const threshold = avgLevel - 2;

  for (const slug of SAVES) {
    const mods = actors.map((a) => saveMod(a, slug)).filter((v) => v !== null);
    if (mods.length === 0) continue;
    const avgMod = mods.reduce((s, v) => s + v, 0) / mods.length;
    if (avgMod <= threshold) {
      issues.push(makeIssue("PARTY_SAVES_VULNERABILITY", SEVERITY.INFO, {
        save: slug,
        avgMod: Math.round(avgMod * 10) / 10,
        level: Math.round(avgLevel * 10) / 10
      }));
    }
  }

  return { issues, summary: summarize(issues) };
}

/**
 * Convenience: run all party-level audits and merge results.
 */
export function auditPartyExtras(actorArray) {
  const skill = auditPartySkillCoverage(actorArray);
  const lang = auditPartyLanguageCoverage(actorArray);
  const saves = auditPartySaves(actorArray);
  const issues = [...skill.issues, ...lang.issues, ...saves.issues];
  return {
    issues,
    summary: summarize(issues),
    skill,
    language: lang,
    saves
  };
}
