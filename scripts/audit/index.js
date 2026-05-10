import { MODULE_ID, SEVERITY } from "../constants.js";
import { detectVariants, getPartyMembers } from "../utils/pf2e-api.js";
import { auditPublication, aggregateAcrossActors } from "./publication.js";
import { auditCompleteness } from "./completeness.js";
import { auditPrerequisites } from "./prerequisite.js";
import { emptyReport, summarizeReport, buildBadge } from "./report.js";

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

function snapshotFromReport(report) {
  const c = report.completeness?.summary ?? {};
  const p = report.prerequisites?.summary ?? {};
  const pub = report.publication?.summary ?? {};
  return {
    timestamp: Date.now(),
    moduleVersion: report.moduleVersion,
    completeness: { errors: c.errors ?? 0, warnings: c.warnings ?? 0, infos: c.infos ?? 0 },
    prerequisites: { fail: p.fail ?? 0, unknown: p.unknown ?? 0, pass: p.pass ?? 0 },
    publication: { distinctTitles: pub.distinctTitles ?? 0, unknownCount: pub.unknownCount ?? 0 }
  };
}

function applySuppression(report, suppressed) {
  if (!suppressed || suppressed.length === 0) return;
  const set = new Set(suppressed);
  if (Array.isArray(report.completeness?.issues)) {
    const before = report.completeness.issues.length;
    report.completeness.issues = report.completeness.issues.filter((i) => !set.has(i.code));
    const removed = before - report.completeness.issues.length;
    if (removed > 0) {
      // Recompute summary
      const issues = report.completeness.issues;
      report.completeness.summary = {
        errors: issues.filter((i) => i.severity === SEVERITY.ERROR).length,
        warnings: issues.filter((i) => i.severity === SEVERITY.WARN).length,
        infos: issues.filter((i) => i.severity === SEVERITY.INFO).length,
        total: issues.length
      };
      report.completeness.suppressedCount = removed;
    }
  }
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

  // Snapshot from the previous run, before we recompute.
  report.previousSnapshot = readActorFlag(actor, "lastSnapshot");
  // List of issue codes the GM has marked as suppressed for this actor.
  const suppressed = readActorFlag(actor, "suppressedCodes") ?? [];
  report.suppressedCodes = Array.isArray(suppressed) ? suppressed : [];

  if (shouldRun("enablePublicationAudit")) {
    report.publication = runDetector("publication", () => auditPublication(actor), report);
  }
  if (shouldRun("enableCompletenessAudit")) {
    report.completeness = runDetector("completeness", () => auditCompleteness(actor, variants), report);
  }
  if (shouldRun("enablePrerequisiteAudit")) {
    report.prerequisites = runDetector("prerequisite", () => auditPrerequisites(actor), report);
  }

  applySuppression(report, report.suppressedCodes);

  report.summary = summarizeReport(report);
  report.badge = buildBadge(report);

  // Save snapshot for next run (fire-and-forget; permission errors silently ignored).
  if (opts.saveSnapshot !== false) {
    writeActorFlag(actor, "lastSnapshot", snapshotFromReport(report));
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

export async function unsuppressAll(actor) {
  if (!actor) return false;
  await actor.setFlag(MODULE_ID, "suppressedCodes", []);
  return true;
}

export function auditParty(opts = {}) {
  const members = getPartyMembers(opts.includeDead ?? game.settings.get(MODULE_ID, "showDeadActors"));
  const variants = detectVariants();
  const party = members.map((a) => auditActor(a, opts));
  const crossPartyPublication = aggregateAcrossActors(party);
  return {
    generatedAt: new Date().toISOString(),
    moduleId: MODULE_ID,
    moduleVersion: undefined,
    variants,
    members: members.map((a) => ({ id: a.id, name: a.name, uuid: a.uuid, level: a.system?.details?.level?.value })),
    party,
    crossPartyPublication
  };
}
