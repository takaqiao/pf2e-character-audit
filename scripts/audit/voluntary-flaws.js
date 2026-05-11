// Voluntary Flaw rule consistency checks (PF2e Player Core, "Voluntary Flaws").
//
// Voluntary Flaws (CRB / Player Core): at character creation, a player MAY
// take 2 ability flaws — in TWO DIFFERENT attributes — in exchange for 1 free
// ability boost (counted at character creation). It is OPTIONAL. The Remaster
// removed mandatory ancestry flaws, but Voluntary Flaws remain.
//
// PF2e v8 data paths (best-effort, defensive):
//   - actor.system.build.attributes.flaws[1]   -> array of attribute slugs at L1
//   - actor.system.build.attributes.boosts[1]  -> array of attribute slugs at L1
//   - actor.ancestry?.slug                     -> ancestry slug (kebab-case)
//   - actor.ancestry?.system.flaws.value       -> ancestry-granted flaws (array)
//   - actor.system.flaws.ancestry              -> alt path (some builds)
//
// Issue shape: { code, severity, i18nKey, params }.
// Returns { issues, summary }.

import { SEVERITY, ATTRIBUTES } from "../constants.js";

// Remaster ancestries that no longer pre-fill mandatory flaws. Used only as
// a fallback when neither ancestry.system.flaws.value nor system.flaws.ancestry
// is available. This is the spec-authoritative minimum set; extend if Paizo
// remasters additional ancestries.
const REMASTER_FLAWLESS_ANCESTRIES = new Set([
  "orc",
  "half-orc",
  "half-elf",
  "goblin",
  "hobgoblin",
  "kobold",
  "leshy",
  "lizardfolk",
  "ratfolk",
  "tengu",
  "anadi",
  "android"
]);

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

function asAttrArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.toLowerCase().trim() : null))
    .filter((v) => v && ATTRIBUTES.includes(v));
}

/**
 * Read the array of flaws granted by ancestry. Tries common shapes:
 *   - actor.ancestry.system.flaws.value (array of slugs)
 *   - actor.system.flaws.ancestry (array of slugs)
 *   - actor.ancestry.system.flaws (array directly)
 * Returns an array of attribute slugs (possibly empty).
 */
function readAncestryGrantedFlaws(actor) {
  const ancestry = actor?.ancestry ?? null;
  const candidates = [
    ancestry?.system?.flaws?.value,
    ancestry?.system?.flaws,
    actor?.system?.flaws?.ancestry,
    actor?.system?.details?.ancestry?.flaws
  ];
  for (const c of candidates) {
    const arr = asAttrArray(c);
    if (arr.length > 0) return arr;
  }
  return [];
}

/**
 * Heuristically determine whether the ancestry is "Remaster-flawless" — i.e.
 * its Remaster version no longer pre-fills mandatory flaws. If we have an
 * explicit ancestry-flaws array (from above), trust it: empty = flawless.
 * Otherwise fall back to the hardcoded set.
 */
function isRemasterFlawless(actor, grantedFlaws) {
  if (grantedFlaws && grantedFlaws.length === 0) {
    const slug = actor?.ancestry?.slug ?? null;
    if (slug && REMASTER_FLAWLESS_ANCESTRIES.has(slug)) return true;
    // No granted flaws AND we can't classify → still treat as flawless so that
    // any flaws found are interpreted as voluntary, which is the typical case
    // for post-Remaster builds.
    return true;
  }
  return false;
}

export function auditVoluntaryFlaws(actor) {
  const issues = [];
  if (!actor || actor.type !== "character") {
    return { issues, summary: summarize(issues) };
  }

  const build = actor?.system?.build?.attributes ?? {};
  const levelFlaws = asAttrArray(build?.flaws?.[1]);
  const levelBoosts = Array.isArray(build?.boosts?.[1]) ? build.boosts[1] : [];
  const grantedFlaws = readAncestryGrantedFlaws(actor);
  const ancestrySlug = actor?.ancestry?.slug ?? null;

  // If we have no ancestry data at all AND the actor has level-1 flaws, we
  // cannot reliably distinguish mandatory (legacy) from voluntary flaws.
  // Skip the count/same-attribute/missing-boost checks rather than emit a
  // false-positive ERROR. The remaster-flawless info pass below also gates on
  // ancestrySlug, so it self-skips.
  const ancestryDataMissing = !ancestrySlug
    && grantedFlaws.length === 0
    && !actor?.ancestry;
  if (ancestryDataMissing && levelFlaws.length > 0) {
    return { issues, summary: summarize(issues) };
  }

  // Subtract one occurrence of each ancestry-granted flaw from levelFlaws to
  // isolate VOLUNTARY flaws. This way a legacy/CRB ancestry that grants 1 STR
  // flaw + a voluntary 2-flaw pair still surfaces correctly.
  const remaining = [...levelFlaws];
  for (const g of grantedFlaws) {
    const idx = remaining.indexOf(g);
    if (idx >= 0) remaining.splice(idx, 1);
  }
  const voluntary = remaining;
  const voluntaryCount = voluntary.length;

  // Issue 1: VOLUNTARY_FLAW_COUNT_WRONG — must be 0 or exactly 2.
  if (voluntaryCount !== 0 && voluntaryCount !== 2) {
    issues.push(makeIssue("VOLUNTARY_FLAW_COUNT_WRONG", SEVERITY.ERROR, {
      count: voluntaryCount
    }));
  }

  // Issue 2: VOLUNTARY_FLAW_SAME_ATTRIBUTE — when there are 2 voluntary flaws
  // they must be in DIFFERENT attributes. Report the offending attribute(s).
  if (voluntaryCount === 2) {
    const counts = new Map();
    for (const a of voluntary) counts.set(a, (counts.get(a) ?? 0) + 1);
    for (const [attribute, n] of counts) {
      if (n >= 2) {
        issues.push(makeIssue("VOLUNTARY_FLAW_SAME_ATTRIBUTE", SEVERITY.ERROR, {
          attribute
        }));
      }
    }
  }

  // Issue 3: VOLUNTARY_FLAW_NO_MATCHING_BOOST — taking voluntary flaws grants
  // one extra free boost at character creation, so boosts[1] should have 5
  // entries (4 base + 1 voluntary) instead of the usual 4.
  if (voluntaryCount > 0) {
    const actual = levelBoosts.length;
    if (actual < 5) {
      issues.push(makeIssue("VOLUNTARY_FLAW_NO_MATCHING_BOOST", SEVERITY.WARN, {
        expected: 5,
        actual
      }));
    }
  }

  // Issue 4: MANDATORY_FLAW_ON_REMASTER_ANCESTRY — info-only. A level-1 flaw
  // exists AND the ancestry's Remaster version is flawless AND the flaw does
  // not match any granted-flaw entry → likely stale legacy data. We emit one
  // info per distinct attribute that looks mandatory-but-shouldn't-be.
  if (ancestrySlug && levelFlaws.length > 0 && isRemasterFlawless(actor, grantedFlaws)) {
    // Only flag flaws that are NOT classified as "voluntary 2-flaw pair":
    // if there are exactly 0 or 2 voluntary flaws AND no granted flaws, the
    // 2 are properly voluntary; nothing stale. But if grantedFlaws is empty
    // and voluntary count is 1 or odd, those leftover entries look mandatory.
    const looksStale = (voluntaryCount !== 2 && voluntaryCount !== 0) || grantedFlaws.length > 0;
    if (looksStale) {
      const seen = new Set();
      for (const attribute of levelFlaws) {
        if (seen.has(attribute)) continue;
        seen.add(attribute);
        issues.push(makeIssue("MANDATORY_FLAW_ON_REMASTER_ANCESTRY", SEVERITY.INFO, {
          attribute,
          ancestry: ancestrySlug
        }));
      }
    }
  }

  return { issues, summary: summarize(issues) };
}
