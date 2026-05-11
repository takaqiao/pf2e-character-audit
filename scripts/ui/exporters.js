import { MODULE_ID } from "../constants.js";
import { t } from "../i18n.js";

function sevTag(s) {
  // Inline tag like "[ERR]" / "[WARN]" / "[INFO]" — plain text for chat/journal export.
  if (s === "error") return "[ERR]";
  if (s === "warn") return "[WARN]";
  if (s === "info") return "[INFO]";
  return "";
}

function reportToHtml(report) {
  const lines = [];
  lines.push(`<h2>${escape(report.actorName)} (Lv ${report.actorLevel})</h2>`);
  if (report.publication) {
    const total = report.publication.summary?.total ?? 0;
    lines.push(`<h3>${t("Tab.Publication")} (${total})</h3>`);
    lines.push(`<table style="width:100%;border-collapse:collapse;">`);
    lines.push(`<tr><th align="left">${t("Field.Title")}</th><th align="left">${t("Field.License")}</th><th align="right">${t("Field.Count")}</th></tr>`);
    for (const r of report.publication.actorRollup ?? []) {
      const flag = r.isUnknown ? "[?] " : r.whitelisted ? "[OK] " : "";
      lines.push(`<tr><td>${flag}${escape(r.title)}</td><td>${escape(r.licenseDisplay ?? "")}</td><td align="right">${r.count}</td></tr>`);
    }
    lines.push(`</table>`);
  }
  if (report.completeness) {
    const s = report.completeness.summary;
    lines.push(`<h3>${t("Tab.Completeness")} — E ${s.errors} / W ${s.warnings} / I ${s.infos}</h3>`);
    lines.push(`<ul>`);
    for (const i of report.completeness.issues ?? []) {
      lines.push(`<li>${sevTag(i.severity)} ${escape(game.i18n.format(`${i.i18nKey}.Title`, i.params || {}))}</li>`);
    }
    lines.push(`</ul>`);
  }
  if (report.prerequisites) {
    const s = report.prerequisites.summary;
    lines.push(`<h3>${t("Tab.Prereq")} — F ${s.fail} / U ${s.unknown}</h3>`);
    lines.push(`<ul>`);
    for (const i of report.prerequisites.issues ?? []) {
      const tag = i.evaluation === "fail" ? "[FAIL]" : "[?]";
      lines.push(`<li>${tag} <b>${escape(i.featName)}</b> — ${escape(i.requirement)}</li>`);
    }
    lines.push(`</ul>`);
  }
  return lines.join("\n");
}

function escape(s) {
  const fn = foundry?.utils?.escapeHTML;
  if (typeof fn === "function") return fn(String(s ?? ""));
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export async function toChat(report) {
  const html = reportToHtml(report);
  const TextEditorImpl = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  const enriched = TextEditorImpl
    ? await TextEditorImpl.enrichHTML(html, { async: true })
    : html;
  return ChatMessage.create({
    content: enriched,
    whisper: [game.user.id],
    flavor: t("Action.AuditFlavor")
  });
}

export async function toJournal(report, partyReport = null) {
  const date = new Date().toISOString().slice(0, 10);
  const name = partyReport
    ? `${t("Action.PartyAuditName")} ${date}`
    : `${t("Action.SingleAuditName")} ${report.actorName} ${date}`;
  const journal = await JournalEntry.create({ name });
  const pages = [];
  if (partyReport) {
    for (const r of partyReport.party) {
      pages.push({ name: r.actorName, type: "text", text: { content: reportToHtml(r), format: 1 } });
    }
  } else {
    pages.push({ name: report.actorName, type: "text", text: { content: reportToHtml(report), format: 1 } });
  }
  await journal.createEmbeddedDocuments("JournalEntryPage", pages);
  journal.sheet.render(true);
  ui.notifications.info(t("Action.JournalCreated"));
  return journal;
}

// Strip fields that are heavy and rarely needed for shared debugging:
//   - publication.byCategory: per-item listing of every item, can be 100+ rows
//   - publication.titles: duplicate of actorRollup
//   - prereq tree: parser internal state, only useful for engine-level debug
//   - prereq featUuid: duplicates featId
//   - completeness.slots: expected-slot table, rarely useful
//   - history: redundant with previousSnapshot for most debug
// Keeps everything an issue-triage conversation actually needs.
function compactReport(report) {
  if (!report) return report;
  const out = {
    actorName: report.actorName,
    actorLevel: report.actorLevel,
    actorClass: report.actorClass,
    actorAncestry: report.actorAncestry,
    actorId: report.actorId,
    generatedAt: report.generatedAt,
    moduleVersion: report.moduleVersion,
    variants: report.variants,
    summary: report.summary,
    badge: report.badge
  };
  if (report.publication) {
    out.publication = {
      summary: report.publication.summary,
      actorRollup: report.publication.actorRollup
    };
  }
  if (report.completeness) {
    out.completeness = {
      issues: report.completeness.issues,
      summary: report.completeness.summary
    };
  }
  if (report.prerequisites) {
    out.prerequisites = {
      summary: report.prerequisites.summary,
      issues: (report.prerequisites.issues ?? []).map((i) => {
        const cleaned = {
          featId: i.featId,
          featSlug: i.featSlug,
          featName: i.featName,
          featLevel: i.featLevel,
          featSource: i.featSource,
          requirement: i.requirement,
          evaluation: i.evaluation,
          severity: i.severity
        };
        if (i.normalizedRequirement && i.normalizedRequirement !== i.requirement) {
          cleaned.normalizedRequirement = i.normalizedRequirement;
        }
        if (Array.isArray(i.reasons) && i.reasons.length > 0) cleaned.reasons = i.reasons;
        return cleaned;
      })
    };
  }
  if (report.previousSnapshot) out.previousSnapshot = report.previousSnapshot;
  if (report.errors?.length > 0) out.errors = report.errors;
  if (report.suppressedCodes?.length > 0) out.suppressedCodes = report.suppressedCodes;
  if (report.suppressedFeats?.length > 0) out.suppressedFeats = report.suppressedFeats;
  return out;
}

function compactPartyReport(pr) {
  if (!pr) return pr;
  const out = {
    generatedAt: pr.generatedAt,
    moduleVersion: pr.moduleVersion,
    variants: pr.variants,
    members: pr.members,
    party: (pr.party ?? []).map(compactReport)
  };
  if (pr.crossPartyPublication) {
    out.crossPartyPublication = {
      summary: pr.crossPartyPublication.summary,
      byTitle: (pr.crossPartyPublication.byTitle ?? []).map((t) => ({
        title: t.title,
        license: t.license,
        licenseDisplay: t.licenseDisplay,
        remaster: t.remaster,
        count: t.count
      }))
    };
  }
  return out;
}

function isPartyReport(r) {
  return r && Array.isArray(r.party) && !r.actorId;
}

export function toJson(report) {
  const compact = isPartyReport(report) ? compactPartyReport(report) : compactReport(report);
  const json = JSON.stringify(compact, jsonReplacer, 2);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(json).then(
      () => ui.notifications.info(t("Action.JsonCopied")),
      () => {
        console.log(`[${MODULE_ID}] Audit JSON:\n` + json);
        ui.notifications.warn(t("Action.JsonInConsole"));
      }
    );
  } else {
    console.log(`[${MODULE_ID}] Audit JSON:\n` + json);
    ui.notifications.warn(t("Action.JsonInConsole"));
  }
}

// Verbose version (full report) — useful for parser/engine-level debug.
// Exposed via API: game.modules.get(MODULE_ID).api.exporters.toJsonVerbose(report)
export function toJsonVerbose(report) {
  const json = JSON.stringify(report, jsonReplacer, 2);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(json).then(
      () => ui.notifications.info(t("Action.JsonCopied")),
      () => {
        console.log(`[${MODULE_ID}] Audit JSON (verbose):\n` + json);
        ui.notifications.warn(t("Action.JsonInConsole"));
      }
    );
  } else {
    console.log(`[${MODULE_ID}] Audit JSON (verbose):\n` + json);
    ui.notifications.warn(t("Action.JsonInConsole"));
  }
}

function jsonReplacer(_k, v) {
  if (v instanceof Set) return [...v];
  if (v instanceof Map) return Object.fromEntries(v);
  return v;
}
