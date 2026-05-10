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

export function toJson(report) {
  const json = JSON.stringify(report, jsonReplacer, 2);
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

function jsonReplacer(_k, v) {
  if (v instanceof Set) return [...v];
  if (v instanceof Map) return Object.fromEntries(v);
  return v;
}
