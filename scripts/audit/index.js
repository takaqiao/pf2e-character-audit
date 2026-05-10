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

  if (shouldRun("enablePublicationAudit")) {
    report.publication = runDetector("publication", () => auditPublication(actor), report);
  }
  if (shouldRun("enableCompletenessAudit")) {
    report.completeness = runDetector("completeness", () => auditCompleteness(actor, variants), report);
  }
  if (shouldRun("enablePrerequisiteAudit")) {
    report.prerequisites = runDetector("prerequisite", () => auditPrerequisites(actor), report);
  }

  report.summary = summarizeReport(report);
  report.badge = buildBadge(report);
  return report;
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
