import { MODULE_ID, SEVERITY } from "../constants.js";

// Allowed predicate keys; anything else causes the rule to be skipped with a warning.
const PREDICATE_KEYS = new Set([
  "levelAtLeast",
  "levelAtMost",
  "classSlug",
  "ancestrySlug",
  "hpBelow",
  "hpAbove",
  "acBelow",
  "acAbove",
  "anyOwnedItemHasTrait",
  "anyOwnedItemHasSlug",
  "noOwnedItemHasSlug",
  "hasFeatSlug",
  "lacksFeatSlug",
  "skillRankAtLeast"
]);

const ALLOWED_SEVERITIES = new Set([SEVERITY.ERROR, SEVERITY.WARN, SEVERITY.INFO]);

/**
 * Validate a single rule. Returns null if valid, otherwise a descriptive error string.
 * Kept intentionally permissive: missing `when` is allowed (always-emit rule).
 */
export function validateRuleSchema(rule) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
    return "Rule must be an object.";
  }
  if (typeof rule.code !== "string" || !rule.code.trim()) {
    return "Rule.code must be a non-empty string.";
  }
  if (typeof rule.severity !== "string" || !ALLOWED_SEVERITIES.has(rule.severity)) {
    return `Rule.severity must be one of: ${[...ALLOWED_SEVERITIES].join(", ")}.`;
  }
  if (rule.title != null && typeof rule.title !== "string") return "Rule.title must be a string.";
  if (rule.hint != null && typeof rule.hint !== "string") return "Rule.hint must be a string.";
  if (rule.when != null) {
    if (typeof rule.when !== "object" || Array.isArray(rule.when)) {
      return "Rule.when must be an object.";
    }
    for (const k of Object.keys(rule.when)) {
      if (!PREDICATE_KEYS.has(k)) return `Unknown predicate "${k}".`;
    }
  }
  return null;
}

/**
 * Read the world setting and return an array of valid rules.
 * Invalid JSON or bad entries are logged and skipped.
 */
export function parseCustomRules() {
  let raw = "[]";
  try {
    raw = game.settings.get(MODULE_ID, "customAuditRules") ?? "[]";
  } catch (err) {
    console.warn(`[${MODULE_ID}] custom-rules: setting unavailable`, err);
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[${MODULE_ID}] ${game.i18n?.localize?.("PF2E-CA.CustomRules.ParseError") ?? "custom-rules: invalid JSON"}`, err);
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.warn(`[${MODULE_ID}] custom-rules: setting must be a JSON array.`);
    return [];
  }
  const valid = [];
  for (const rule of parsed) {
    const err = validateRuleSchema(rule);
    if (err) {
      console.warn(`[${MODULE_ID}] custom-rules: skipping rule (${err})`, rule);
      continue;
    }
    valid.push(rule);
  }
  return valid;
}

// ---------------- Predicate evaluation ----------------

function asArray(v) {
  return Array.isArray(v) ? v : [v];
}

function actorLevel(actor) {
  return Number(actor?.system?.details?.level?.value ?? 0);
}

function actorHpMax(actor) {
  return Number(actor?.system?.attributes?.hp?.max ?? 0);
}

function actorAc(actor) {
  return Number(actor?.system?.attributes?.ac?.value ?? 0);
}

function itemTraits(item) {
  const t = item?.system?.traits?.value;
  return Array.isArray(t) ? t : [];
}

const PREDICATES = {
  levelAtLeast: (actor, val) => actorLevel(actor) >= Number(val),
  levelAtMost: (actor, val) => actorLevel(actor) <= Number(val),
  classSlug: (actor, val) => {
    const slugs = asArray(val).map((s) => String(s).toLowerCase());
    const cs = String(actor?.class?.slug ?? "").toLowerCase();
    return cs && slugs.includes(cs);
  },
  ancestrySlug: (actor, val) => {
    const slugs = asArray(val).map((s) => String(s).toLowerCase());
    const a = String(actor?.ancestry?.slug ?? "").toLowerCase();
    return a && slugs.includes(a);
  },
  hpBelow: (actor, val) => actorHpMax(actor) < Number(val),
  hpAbove: (actor, val) => actorHpMax(actor) > Number(val),
  acBelow: (actor, val) => actorAc(actor) < Number(val),
  acAbove: (actor, val) => actorAc(actor) > Number(val),
  anyOwnedItemHasTrait: (actor, val) => {
    const target = String(val).toLowerCase();
    const items = actor?.items ?? [];
    for (const it of items) if (itemTraits(it).map((t) => String(t).toLowerCase()).includes(target)) return true;
    return false;
  },
  anyOwnedItemHasSlug: (actor, val) => {
    const target = String(val).toLowerCase();
    const items = actor?.items ?? [];
    for (const it of items) if (String(it?.slug ?? "").toLowerCase() === target) return true;
    return false;
  },
  noOwnedItemHasSlug: (actor, val) => !PREDICATES.anyOwnedItemHasSlug(actor, val),
  hasFeatSlug: (actor, val) => {
    const target = String(val).toLowerCase();
    const feats = actor?.itemTypes?.feat ?? [];
    return feats.some((f) => String(f?.slug ?? "").toLowerCase() === target);
  },
  lacksFeatSlug: (actor, val) => !PREDICATES.hasFeatSlug(actor, val),
  skillRankAtLeast: (actor, val) => {
    if (!val || typeof val !== "object") return false;
    const skill = String(val.skill ?? "").toLowerCase();
    const rank = Number(val.rank ?? 0);
    if (!skill) return false;
    const s = actor?.skills?.[skill];
    return s && Number(s.rank ?? 0) >= rank;
  }
};

function evaluateRule(actor, rule) {
  const when = rule.when;
  if (!when) return true;
  for (const [key, val] of Object.entries(when)) {
    const fn = PREDICATES[key];
    if (!fn) return false; // unknown predicate -> never matches
    try {
      if (!fn(actor, val)) return false;
    } catch (err) {
      console.warn(`[${MODULE_ID}] custom-rules: predicate "${key}" threw`, err);
      return false;
    }
  }
  return true;
}

/**
 * Run all parsed custom rules against an actor. Emits one issue per matching rule.
 * Issue shape: { code, severity, i18nKey: null, title, hint, params }.
 */
export function auditCustomRules(actor) {
  const issues = [];
  if (!actor) return { issues, summary: emptySummary() };

  const rules = parseCustomRules();
  const actorName = actor?.name ?? "";

  for (const rule of rules) {
    let matched = false;
    try {
      matched = evaluateRule(actor, rule);
    } catch (err) {
      console.warn(`[${MODULE_ID}] custom-rules: rule "${rule.code}" threw`, err);
      continue;
    }
    if (!matched) continue;

    const params = { actorName };
    issues.push({
      code: String(rule.code),
      severity: rule.severity,
      i18nKey: null,
      title: interpolate(rule.title ?? rule.code, params),
      hint: interpolate(rule.hint ?? "", params),
      params
    });
  }

  return { issues, summary: summarize(issues) };
}

function interpolate(str, params) {
  if (typeof str !== "string" || !str.includes("{")) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : `{${k}}`));
}

function emptySummary() {
  return { errors: 0, warnings: 0, infos: 0, total: 0 };
}

function summarize(issues) {
  return {
    errors: issues.filter((i) => i.severity === SEVERITY.ERROR).length,
    warnings: issues.filter((i) => i.severity === SEVERITY.WARN).length,
    infos: issues.filter((i) => i.severity === SEVERITY.INFO).length,
    total: issues.length
  };
}
