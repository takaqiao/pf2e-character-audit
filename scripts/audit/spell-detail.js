import { SEVERITY } from "../constants.js";
import { isDeityGrantedSpell } from "../utils/pf2e-api.js";

/**
 * Granular spell-related checks. Best-effort: PF2e slot tables are complex and
 * vary across class features (e.g., wizard universalist gives +1 slot per rank,
 * sorcerer bloodline grants signature spells, etc.). Every sub-check is wrapped
 * in try/catch and emits no issue on uncertainty.
 *
 * Issue codes emitted:
 *   - SPELL_SLOTS_PER_RANK_MISMATCH (warn)
 *   - CANTRIP_COUNT_LOW             (info)
 *   - FOCUS_POOL_OVER_FOCUS_SPELLS  (error)
 *   - FOCUS_POOL_OVER_CAP           (error)
 *   - SPELL_TRADITION_TRAIT_MISMATCH (warn)
 *
 * Contract: returns { issues, summary }.
 */

function makeIssue(code, severity, params = {}) {
  return {
    code,
    severity,
    i18nKey: `PF2E-CA.Audit.Code.${code}`,
    params
  };
}

// ---------------------------------------------------------------------------
// Slot tables — best-effort.
// Indexed by class-slug; each entry is a function(level) -> { 0: cantrips,
// 1: rank1Slots, 2: rank2Slots, ... up to topRank }.
// topRank = ceil(level/2), capped at 10.
// ---------------------------------------------------------------------------

const FULL_PREPARED_CASTERS = new Set([
  "cleric", "druid", "wizard", "witch"
]);
const FULL_SPONTANEOUS_CASTERS = new Set([
  "bard", "oracle", "sorcerer"
]);
const FULL_CASTERS = new Set([...FULL_PREPARED_CASTERS, ...FULL_SPONTANEOUS_CASTERS]);

/**
 * Standard full-caster slot progression (CRB Table for any 4-slots-per-rank class).
 * Returns slots per rank at the given level (1..topRank). 10th rank gets 1 slot
 * starting at level 19 (signature/level-10 archetype variants ignored).
 *
 * Cantrips for full casters: 5 known/prepared (cleric, druid, sorcerer, bard,
 * wizard all start with 5; witch with 4 — we don't try to be exhaustive).
 */
function fullCasterSlots(level) {
  const out = { 0: 5 };
  const topRank = Math.min(10, Math.ceil(level / 2));
  // Each rank 1..9 reaches 4 slots after the rank unlocks + 2-3 levels.
  // Simplified: rank N has slots = max(2, min(4, level - 2*N + 3))
  // At rank unlock level (2N-1): 2 slots. Next level: 3. +2 levels: 4.
  for (let r = 1; r <= 9; r++) {
    const unlock = 2 * r - 1;
    if (level < unlock) break;
    const progress = level - unlock; // 0,1,2,...
    let slots;
    if (progress === 0) slots = 2;
    else if (progress === 1) slots = 3;
    else slots = 4;
    out[r] = slots;
  }
  if (level >= 19 && topRank >= 10) {
    out[10] = 1;
  }
  return out;
}

/**
 * Compute expected slots dictionary. Returns null if the class is unknown or
 * not a standard full caster (e.g., magus, summoner, ranger — partial casters
 * with idiosyncratic progressions we don't model).
 */
export function expectedSpellSlots(level, classSlug) {
  if (!classSlug || typeof level !== "number" || level < 1) return null;
  const slug = String(classSlug).toLowerCase();
  if (FULL_CASTERS.has(slug)) {
    return fullCasterSlots(level);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readEntrySlots(entry) {
  // Returns { rank: max, ... } for ranks 0..10 where max > 0.
  const out = {};
  try {
    const slots = entry?.system?.slots ?? {};
    for (let r = 0; r <= 10; r++) {
      const slot = slots[`slot${r}`] ?? slots[String(r)] ?? slots[r];
      if (!slot) continue;
      const max = Number(slot.max ?? 0);
      if (max > 0) out[r] = max;
    }
  } catch {}
  return out;
}

function getEntrySpells(actor, entry) {
  // entry.spells.contents preferred; fall back to filtering all spell items.
  try {
    const fromCollection = entry?.spells?.contents;
    if (Array.isArray(fromCollection) && fromCollection.length > 0) return fromCollection;
  } catch {}
  try {
    return (actor.itemTypes?.spell ?? []).filter(
      (s) => s.system?.location?.value === entry.id
    );
  } catch {}
  return [];
}

function isCantrip(spell) {
  try {
    const traits = spell?.system?.traits?.value ?? [];
    if (Array.isArray(traits) && traits.includes("cantrip")) return true;
    if (spell?.isCantrip === true) return true;
  } catch {}
  return false;
}

function isRitualEntry(entry) {
  return entry?.system?.prepared?.value === "ritual"
    || entry?.system?.category === "ritual"
    || entry?.system?.category?.value === "ritual"
    || entry?.isRitual === true;
}

function isInnateEntry(entry) {
  return entry?.system?.prepared?.value === "innate"
    || entry?.isInnate === true;
}

function isFocusEntry(entry) {
  return entry?.system?.prepared?.value === "focus"
    || entry?.system?.category === "focus"
    || entry?.system?.category?.value === "focus"
    || entry?.system?.tradition?.value === "focus"
    || entry?.isFocusPool === true;
}

function spellTraditionTags(spell) {
  try {
    const traits = spell?.system?.traits?.value ?? [];
    const traditions = spell?.system?.traits?.traditions ?? [];
    const all = new Set([
      ...(Array.isArray(traits) ? traits : []),
      ...(Array.isArray(traditions) ? traditions : [])
    ]);
    return [...all].filter((t) => ["arcane", "divine", "occult", "primal"].includes(t));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Sub-checks
// ---------------------------------------------------------------------------

function checkSlotsPerRank(actor, issues) {
  try {
    const level = actor?.system?.details?.level?.value ?? 1;
    const classSlug = actor?.class?.slug ?? null;
    const expected = expectedSpellSlots(level, classSlug);
    if (!expected) return;
    const entries = actor.spellcasting?.contents ?? actor.itemTypes?.spellcastingEntry ?? [];
    for (const entry of entries) {
      try {
        // Only judge primary class entry. Skip ritual, focus pools, innate, scrolls, items.
        if (isRitualEntry(entry)) continue;
        const category =
          entry?.system?.category?.value ?? entry?.system?.category ?? entry?.category;
        if (category && !["spellcasting", "charges"].includes(category)) continue;
        if (isFocusEntry(entry)) continue;
        if (isInnateEntry(entry)) continue;

        const actualSlots = readEntrySlots(entry);
        for (const rankStr of Object.keys(expected)) {
          const rank = Number(rankStr);
          if (rank === 0) continue; // cantrip handled separately
          const exp = expected[rank];
          const act = actualSlots[rank] ?? 0;
          if (act !== exp) {
            issues.push(makeIssue("SPELL_SLOTS_PER_RANK_MISMATCH", SEVERITY.WARN, {
              rank,
              expected: exp,
              actual: act,
              entryName: entry?.name ?? "(spellcasting)"
            }));
          }
        }
      } catch {}
    }
  } catch {}
}

function checkCantripCount(actor, issues) {
  try {
    const level = actor?.system?.details?.level?.value ?? 1;
    const classSlug = actor?.class?.slug ?? null;
    const expected = expectedSpellSlots(level, classSlug);
    if (!expected || typeof expected[0] !== "number") return;
    const expectedCantrips = expected[0];
    const entries = actor.spellcasting?.contents ?? actor.itemTypes?.spellcastingEntry ?? [];
    for (const entry of entries) {
      try {
        if (isRitualEntry(entry)) continue;
        if (isFocusEntry(entry)) continue;
        if (isInnateEntry(entry)) continue;

        const spells = getEntrySpells(actor, entry);
        const cantrips = spells.filter(isCantrip);
        if (cantrips.length < expectedCantrips) {
          issues.push(makeIssue("CANTRIP_COUNT_LOW", SEVERITY.INFO, {
            actual: cantrips.length,
            expected: expectedCantrips,
            entryName: entry?.name ?? "(spellcasting)"
          }));
        }
      } catch {}
    }
  } catch {}
}

function checkFocusPool(actor, issues) {
  try {
    const focus = actor?.system?.resources?.focus;
    if (!focus || typeof focus.max !== "number") return;
    const poolMax = focus.max;
    if (poolMax > 3) {
      issues.push(makeIssue("FOCUS_POOL_OVER_CAP", SEVERITY.ERROR, { poolMax }));
    }
    if (poolMax > 0) {
      // Count owned focus spells.
      let owned = 0;
      try {
        for (const s of actor.itemTypes?.spell ?? []) {
          const traits = s.system?.traits?.value ?? [];
          if (Array.isArray(traits) && traits.includes("focus")) owned++;
        }
      } catch {}
      if (owned < poolMax) {
        issues.push(makeIssue("FOCUS_POOL_OVER_FOCUS_SPELLS", SEVERITY.ERROR, {
          poolMax,
          focusSpellsOwned: owned
        }));
      }
    }
  } catch {}
}

function checkSpellTraditionTrait(actor, issues) {
  try {
    const entries = actor.spellcasting?.contents ?? actor.itemTypes?.spellcastingEntry ?? [];
    for (const entry of entries) {
      try {
        if (isRitualEntry(entry)) continue;
        const entryTradition = entry?.system?.tradition?.value ?? entry?.system?.tradition;
        if (!entryTradition || entryTradition === "focus" || entryTradition === "") continue;
        if (!["arcane", "divine", "occult", "primal"].includes(entryTradition)) continue;

        const spells = getEntrySpells(actor, entry);
        for (const spell of spells) {
          try {
            const traitsArr = spell?.system?.traits?.value ?? [];
            // Skip focus spells (domain initiate, blood magic, etc.).
            if (Array.isArray(traitsArr) && traitsArr.includes("focus")) continue;
            // Skip rituals (different tradition semantics).
            if (spell?.type === "ritual" || spell?.system?.ritual
              || (Array.isArray(traitsArr) && traitsArr.includes("ritual"))) continue;

            const tags = spellTraditionTags(spell);
            if (tags.length === 0) continue;
            // Skip cantrips with multiple traditions (often universal/shared).
            if (isCantrip(spell) && tags.length > 1) continue;
            if (!tags.includes(entryTradition)) {
              // Deity-granted spells (cleric bonus / domain) are legitimate even
              // if their native tradition differs from the entry's.
              if (isDeityGrantedSpell(actor, spell)) continue;
              issues.push(makeIssue("SPELL_TRADITION_TRAIT_MISMATCH", SEVERITY.WARN, {
                spell: spell?.name ?? "(spell)",
                entryName: entry?.name ?? "(spellcasting)",
                entryTradition,
                spellTraditions: tags.join("/")
              }));
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function auditSpellDetail(actor) {
  const issues = [];
  if (!actor) return { issues, summary: { errors: 0, warnings: 0, infos: 0, total: 0 } };

  try {
    const entries = actor.spellcasting?.contents ?? actor.itemTypes?.spellcastingEntry ?? [];
    const hasFocusPool = (actor?.system?.resources?.focus?.max ?? 0) > 0;
    if (entries.length === 0 && !hasFocusPool) {
      return { issues, summary: { errors: 0, warnings: 0, infos: 0, total: 0 } };
    }
  } catch {}

  checkSlotsPerRank(actor, issues);
  checkCantripCount(actor, issues);
  checkFocusPool(actor, issues);
  checkSpellTraditionTrait(actor, issues);

  const summary = {
    errors: issues.filter((i) => i.severity === SEVERITY.ERROR).length,
    warnings: issues.filter((i) => i.severity === SEVERITY.WARN).length,
    infos: issues.filter((i) => i.severity === SEVERITY.INFO).length,
    total: issues.length
  };
  return { issues, summary };
}
