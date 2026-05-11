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

/**
 * Count the actor's domain focus spells. Returns:
 *   distinct — number of unique domains the actor has at least one spell of
 *   total   — total count of domain focus spells (initial + advanced)
 * Heuristic — relies on focus trait + cleric trait + slug pattern.
 */
// Count spells in the actor's focus pool spellcasting entry. PF2e remaster
// does NOT tag domain spells with `cleric` or a `<domain>` trait — domain
// spells are plain focus spells (focus + divine traits, nothing else
// distinctive on the spell item). Use the focus pool itself as the source
// of truth: every spell sitting in the cleric's focus pool was granted by
// either the deity's starting domain (no, that's not a thing — see below)
// or by a Domain Initiate / Advanced Domain feat.
//
// Per RAW Domain Initiate, the cleric class does NOT auto-grant any focus
// spell. So a cleric's focus pool contents = (Domain Initiate count +
// Advanced Domain count) for vanilla characters. Other classes' focus
// spells (multiclass archetype) live in separate spellcasting entries.
function countFocusPoolSpells(actor) {
  const entries = actor.spellcasting?.contents ?? [];
  let total = 0;
  for (const entry of entries) {
    const prep = entry.system?.prepared?.value;
    const isFocus = prep === "focus" || entry.isFocusPool === true || entry.system?.category === "focus";
    if (!isFocus) continue;
    // The entry's spells collection may be `entry.spells` (Collection) with
    // `.size` or an array via `.contents`. Try both shapes defensively.
    if (entry.spells?.size != null) total += entry.spells.size;
    else if (Array.isArray(entry.spells?.contents)) total += entry.spells.contents.length;
    else if (Array.isArray(entry.spells)) total += entry.spells.length;
  }
  return total;
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

  // Simple invariant: cleric's focus pool size = Domain Initiate + Advanced
  // Domain feats taken. The cleric class doesn't auto-grant any focus spell
  // (per RAW Domain Initiate); every focus spell on a cleric came from one
  // of those feats. If the count doesn't match, the player either took the
  // feat but didn't drag the spell in, or has the spell without the feat.
  const expectedSpells = domainInitiateCount + advancedDomainCount;
  const actualSpells = countFocusPoolSpells(actor);

  if (expectedSpells === 0 && actualSpells === 0) {
    return { issues, summary: summarize(issues) };
  }

  if (actualSpells !== expectedSpells) {
    issues.push(makeIssue("CLERIC_DOMAIN_SPELL_COUNT_OFF", SEVERITY.WARN, {
      expected: expectedSpells,
      actual: actualSpells,
      domainInitiate: domainInitiateCount,
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
