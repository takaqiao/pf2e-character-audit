import { MODULE_ID, SEVERITY } from "../constants.js";
import { detectVariants, getPartyMembers } from "../utils/pf2e-api.js";
import { auditPublication, aggregateAcrossActors } from "./publication.js";
import { auditCompleteness } from "./completeness.js";
import { auditPrerequisites } from "./prerequisite.js";
import { auditProficiencyProgression } from "./proficiency-progression.js";
import { auditEquipment } from "./equipment-audit.js";
import { auditClericDomains, auditPartyExtras } from "./cross-party-extras.js";
import { emptyReport, summarizeReport, buildBadge } from "./report.js";

function resummarize(bucket) {
  if (!bucket?.issues) return;
  const issues = bucket.issues;
  bucket.summary = {
    errors: issues.filter((i) => i.severity === SEVERITY.ERROR).length,
    warnings: issues.filter((i) => i.severity === SEVERITY.WARN).length,
    infos: issues.filter((i) => i.severity === SEVERITY.INFO).length,
    total: issues.length
  };
}

function shouldRun(name) {
  try {
    return game.settings.get(MODULE_ID, name);
  } catch {
    return true;
  }
}

function runDetector(label, fn, report) {
  try {
    return fn();
  } catch (err) {
    console.error(`[pf2e-character-audit] detector ${label} crashed:`, err);
    report.errors.push({
      detector: label,
      code: "DETECTOR_CRASHED",
      severity: SEVERITY.ERROR,
      message: err?.message ?? String(err),
      stack: err?.stack ?? null
    });
    return null;
  }
}

function readActorFlag(actor, key) {
  try {
    return actor.getFlag?.(MODULE_ID, key) ?? null;
  } catch {
    return null;
  }
}

function writeActorFlag(actor, key, value) {
  // Fire-and-forget; don't block the synchronous audit on a permission error.
  if (typeof actor.setFlag !== "function") return;
  try {
    Promise.resolve(actor.setFlag(MODULE_ID, key, value)).catch(() => {});
  } catch {}
}

const HISTORY_LIMIT = 5;

function snapshotFromReport(report) {
  const c = report.completeness?.summary ?? {};
  const p = report.prerequisites?.summary ?? {};
  const pub = report.publication?.summary ?? {};
  const total = (c.errors ?? 0) + (c.warnings ?? 0) + (c.infos ?? 0)
    + (p.fail ?? 0) + (p.unknown ?? 0);
  return {
    timestamp: Date.now(),
    moduleVersion: report.moduleVersion,
    total,
    completeness: { errors: c.errors ?? 0, warnings: c.warnings ?? 0, infos: c.infos ?? 0 },
    prerequisites: { fail: p.fail ?? 0, unknown: p.unknown ?? 0, pass: p.pass ?? 0 },
    publication: { distinctTitles: pub.distinctTitles ?? 0, unknownCount: pub.unknownCount ?? 0 }
  };
}

function applySuppression(report, suppressedCodes, suppressedFeats) {
  const codeSet = new Set(suppressedCodes ?? []);
  const featSet = new Set((suppressedFeats ?? []).map((s) => (typeof s === "string" ? s : s?.slug)).filter(Boolean));
  let suppressed = 0;
  if (codeSet.size > 0 && Array.isArray(report.completeness?.issues)) {
    const before = report.completeness.issues.length;
    report.completeness.issues = report.completeness.issues.filter((i) => !codeSet.has(i.code));
    suppressed += before - report.completeness.issues.length;
    const issues = report.completeness.issues;
    report.completeness.summary = {
      errors: issues.filter((i) => i.severity === SEVERITY.ERROR).length,
      warnings: issues.filter((i) => i.severity === SEVERITY.WARN).length,
      infos: issues.filter((i) => i.severity === SEVERITY.INFO).length,
      total: issues.length
    };
  }
  if (featSet.size > 0 && Array.isArray(report.prerequisites?.issues)) {
    const before = report.prerequisites.issues.length;
    report.prerequisites.issues = report.prerequisites.issues.filter((i) => !featSet.has(i.featSlug));
    suppressed += before - report.prerequisites.issues.length;
    const issues = report.prerequisites.issues;
    report.prerequisites.summary = {
      total: (report.prerequisites.summary?.total ?? 0),
      pass: report.prerequisites.summary?.pass ?? 0,
      fail: issues.filter((i) => i.evaluation === "fail").length,
      unknown: issues.filter((i) => i.evaluation === "unknown").length
    };
  }
  if (suppressed > 0) report.suppressedCount = suppressed;
}

export function auditActor(actor, opts = {}) {
  if (!actor) {
    throw new Error("auditActor: actor is required");
  }
  if (actor.type !== "character") {
    ui.notifications?.warn(game.i18n.localize("PF2E-CA.Notice.NotCharacter"));
    const report = emptyReport(actor, detectVariants());
    report.errors.push({ code: "NOT_CHARACTER", severity: SEVERITY.ERROR, message: `actor.type=${actor.type}` });
    return report;
  }

  const variants = detectVariants();
  const report = emptyReport(actor, variants);

  // Read prior history (up to HISTORY_LIMIT entries) and suppression lists.
  const history = readActorFlag(actor, "history");
  report.history = Array.isArray(history) ? history.slice(-HISTORY_LIMIT) : [];
  report.previousSnapshot = report.history.length > 0
    ? report.history[report.history.length - 1]
    : readActorFlag(actor, "lastSnapshot"); // legacy single-snapshot flag

  const suppressedCodes = readActorFlag(actor, "suppressedCodes") ?? [];
  const suppressedFeats = readActorFlag(actor, "suppressedFeats") ?? [];
  report.suppressedCodes = Array.isArray(suppressedCodes) ? suppressedCodes : [];
  report.suppressedFeats = Array.isArray(suppressedFeats) ? suppressedFeats : [];

  if (shouldRun("enablePublicationAudit")) {
    report.publication = runDetector("publication", () => auditPublication(actor), report);
  }
  if (shouldRun("enableCompletenessAudit")) {
    report.completeness = runDetector("completeness", () => auditCompleteness(actor, variants), report);
    const prog = runDetector("proficiencyProgression", () => auditProficiencyProgression(actor), report);
    const cd = runDetector("clericDomains", () => auditClericDomains(actor), report);
    if (report.completeness) {
      if (prog?.issues?.length) report.completeness.issues.push(...prog.issues);
      if (cd?.issues?.length) report.completeness.issues.push(...cd.issues);
      resummarize(report.completeness);
    }
  }
  if (shouldRun("enableEquipmentAudit")) {
    const eq = runDetector("equipment", () => auditEquipment(actor), report);
    if (eq?.issues?.length && report.completeness) {
      report.completeness.issues.push(...eq.issues);
      resummarize(report.completeness);
    } else if (eq?.issues?.length) {
      report.completeness = eq;
    }
  }
  if (shouldRun("enablePrerequisiteAudit")) {
    report.prerequisites = runDetector("prerequisite", () => auditPrerequisites(actor), report);
  }

  applySuppression(report, report.suppressedCodes, report.suppressedFeats);

  report.summary = summarizeReport(report);
  report.badge = buildBadge(report);

  // Append to rolling history (fire-and-forget; permission errors ignored).
  if (opts.saveSnapshot !== false) {
    const snapshot = snapshotFromReport(report);
    const newHistory = [...report.history, snapshot].slice(-HISTORY_LIMIT);
    writeActorFlag(actor, "history", newHistory);
    writeActorFlag(actor, "lastSnapshot", snapshot); // back-compat
  }
  return report;
}

export async function suppressIssueCode(actor, code) {
  if (!actor || !code) return false;
  const cur = (await actor.getFlag?.(MODULE_ID, "suppressedCodes")) ?? [];
  const list = Array.isArray(cur) ? cur : [];
  if (list.includes(code)) return false;
  await actor.setFlag(MODULE_ID, "suppressedCodes", [...list, code]);
  return true;
}

export async function suppressFeatPrereq(actor, featSlug, featName) {
  if (!actor || !featSlug) return false;
  const cur = (await actor.getFlag?.(MODULE_ID, "suppressedFeats")) ?? [];
  const list = Array.isArray(cur) ? cur : [];
  if (list.some((e) => (typeof e === "string" ? e : e?.slug) === featSlug)) return false;
  await actor.setFlag(MODULE_ID, "suppressedFeats", [...list, { slug: featSlug, name: featName ?? featSlug }]);
  return true;
}

export async function unsuppressAll(actor) {
  if (!actor) return false;
  await actor.setFlag(MODULE_ID, "suppressedCodes", []);
  await actor.setFlag(MODULE_ID, "suppressedFeats", []);
  return true;
}

export function auditParty(opts = {}) {
  const members = getPartyMembers(opts.includeDead ?? game.settings.get(MODULE_ID, "showDeadActors"));
  const variants = detectVariants();
  const party = members.map((a) => auditActor(a, opts));
  const crossPartyPublication = aggregateAcrossActors(party);
  let crossPartyAnalysis = null;
  try {
    crossPartyAnalysis = auditPartyExtras(members);
  } catch (err) {
    console.warn("[pf2e-character-audit] crossPartyAnalysis failed:", err);
  }
  return {
    generatedAt: new Date().toISOString(),
    moduleId: MODULE_ID,
    moduleVersion: undefined,
    variants,
    members: members.map((a) => ({ id: a.id, name: a.name, uuid: a.uuid, level: a.system?.details?.level?.value })),
    party,
    crossPartyPublication,
    crossPartyAnalysis
  };
}
