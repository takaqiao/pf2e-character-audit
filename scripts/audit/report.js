import { MODULE_ID, MODULE_VERSION, SEVERITY } from "../constants.js";

const DEFAULT_VARIANTS = Object.freeze({
  abp: false,
  abpVariant: "noABP",
  freeArchetype: false,
  dualClass: false,
  gradualBoosts: false,
  stamina: false,
  proficiencyWithoutLevel: false
});

function normalizeVariants(v) {
  if (!v || typeof v !== "object") return { ...DEFAULT_VARIANTS };
  return { ...DEFAULT_VARIANTS, ...v };
}

export function emptyReport(actor, variants) {
  return {
    actorId: actor?.id ?? null,
    actorUuid: actor?.uuid ?? null,
    actorName: actor?.name ?? "(unknown)",
    actorLevel: actor?.system?.details?.level?.value ?? null,
    actorClass: actor?.class?.name ?? null,
    actorAncestry: actor?.ancestry?.name ?? null,
    generatedAt: new Date().toISOString(),
    moduleId: MODULE_ID,
    moduleVersion: MODULE_VERSION,
    variants: normalizeVariants(variants),
    publication: null,
    prerequisites: null,
    completeness: null,
    errors: []
  };
}

export function summarizeReport(report) {
  const c = report.completeness?.summary ?? { errors: 0, warnings: 0, infos: 0 };
  const p = report.prerequisites?.summary ?? { fail: 0, unknown: 0 };
  const pub = report.publication?.summary ?? { unknownCount: 0, distinctTitles: 0 };
  // Total user-actionable issues across the three audit categories.
  // Publication unknowns count as info-level issues, surfaced separately in the badge.
  const totalIssues =
    (c.errors || 0) +
    (c.warnings || 0) +
    (p.fail || 0) +
    (p.unknown || 0) +
    (pub.unknownCount || 0);
  return {
    totalIssues,
    completeness: c,
    prerequisites: p,
    publication: pub
  };
}

export function buildBadge(report) {
  const s = summarizeReport(report);
  if ((s.completeness.errors || 0) + (s.prerequisites.fail || 0) > 0) return SEVERITY.ERROR;
  if ((s.completeness.warnings || 0) + (s.prerequisites.unknown || 0) > 0) return SEVERITY.WARN;
  if ((s.publication.unknownCount || 0) > 0) return SEVERITY.INFO;
  return null;
}
