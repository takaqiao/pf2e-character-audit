import { MODULE_ID } from "../constants.js";
import { t } from "../i18n.js";

// ---------- shared helpers ----------

function sevEmoji(sev) {
  if (sev === "error") return "❌"; // ❌
  if (sev === "warn") return "⚠️"; // ⚠️
  if (sev === "info") return "ℹ️"; // ℹ️
  return "";
}

function fmtI18n(keyStr, params) {
  try {
    if (!keyStr) return null;
    if (!game?.i18n) return null;
    const out = game.i18n.format(keyStr, params || {});
    // game.i18n.format returns the key untouched if not found — treat that as "miss".
    if (out === keyStr) return null;
    return out;
  } catch (_e) {
    return null;
  }
}

// Resolve title/hint for a completeness-style issue.
function resolveIssueText(issue) {
  const params = issue.params || {};
  let title = null;
  let hint = null;
  if (issue.i18nKey) {
    title = fmtI18n(`${issue.i18nKey}.Title`, params);
    hint = fmtI18n(`${issue.i18nKey}.Hint`, params);
    if (!title) title = fmtI18n(issue.i18nKey, params);
  }
  if (!title) title = issue.title || null;
  if (!hint) hint = issue.hint || null;
  if (!title) title = issue.code || "";
  return { title: String(title ?? ""), hint: hint ? String(hint) : "" };
}

function mdEscape(s) {
  return String(s ?? "").replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1");
}

function mdInline(s) {
  // For inline text in lists/paragraphs we keep punctuation but escape pipes (for tables) elsewhere.
  return String(s ?? "");
}

function tableCell(s) {
  return String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function htmlEscape(s) {
  const fn = foundry?.utils?.escapeHTML;
  if (typeof fn === "function") return fn(String(s ?? ""));
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function sevHtmlBadge(sev) {
  if (sev === "error") return '<span class="sev sev-error">❌</span>';
  if (sev === "warn") return '<span class="sev sev-warn">⚠️</span>';
  if (sev === "info") return '<span class="sev sev-info">ℹ️</span>';
  return "";
}

function isPartyReport(r) {
  return r && Array.isArray(r.party) && !r.actorId;
}

// ---------- Markdown ----------

function renderSingleMarkdown(report) {
  const lines = [];
  const name = report.actorName ?? "";
  const lvl = report.actorLevel ?? "?";
  lines.push(`# Character Audit: ${mdInline(name)} (Level ${lvl})`);
  lines.push("");
  if (report.generatedAt) {
    const gen = new Date(report.generatedAt).toISOString();
    lines.push(`_Generated: ${gen}_`);
    lines.push("");
  }

  // Summary
  const cs = report.completeness?.summary ?? {};
  const ps = report.prerequisites?.summary ?? {};
  lines.push("## Summary");
  lines.push(`- Errors: ${cs.errors ?? 0}`);
  lines.push(`- Warnings: ${cs.warnings ?? 0}`);
  lines.push(`- Infos: ${cs.infos ?? 0}`);
  if (ps && (ps.fail || ps.unknown)) {
    lines.push(`- Prereq Fails: ${ps.fail ?? 0}`);
    lines.push(`- Prereq Unknowns: ${ps.unknown ?? 0}`);
  }
  lines.push("");

  // Publication
  if (report.publication) {
    const rollup = report.publication.actorRollup ?? [];
    lines.push("## Publication");
    if (rollup.length === 0) {
      lines.push("_No publication data._");
    } else {
      lines.push("| Title | License | Count |");
      lines.push("| --- | --- | ---: |");
      for (const r of rollup) {
        const flag = r.isUnknown ? "(?) " : r.whitelisted ? "(OK) " : "";
        lines.push(`| ${flag}${tableCell(r.title)} | ${tableCell(r.licenseDisplay ?? r.license ?? "")} | ${r.count ?? 0} |`);
      }
    }
    lines.push("");
  }

  // Prerequisites
  if (report.prerequisites) {
    const issues = report.prerequisites.issues ?? [];
    lines.push("## Prerequisites");
    if (issues.length === 0) {
      lines.push("_No prerequisite issues._");
    } else {
      for (const i of issues) {
        const icon = i.evaluation === "fail" ? "❌" : i.evaluation === "unknown" ? "ℹ️" : sevEmoji(i.severity);
        lines.push(`- ${icon} **${mdInline(i.featName ?? "")}** — ${mdInline(i.requirement ?? "")}`);
        if (Array.isArray(i.reasons) && i.reasons.length > 0) {
          for (const reason of i.reasons) lines.push(`  - Failed: ${mdInline(reason)}`);
        } else if (i.evaluation) {
          lines.push(`  - Evaluation: ${i.evaluation}`);
        }
      }
    }
    lines.push("");
  }

  // Completeness
  if (report.completeness) {
    const issues = report.completeness.issues ?? [];
    lines.push("## Completeness");
    if (issues.length === 0) {
      lines.push("_No completeness issues._");
    } else {
      for (const i of issues) {
        const { title, hint } = resolveIssueText(i);
        lines.push(`- ${sevEmoji(i.severity)} **${mdInline(title)}**${hint ? ` — ${mdInline(hint)}` : ""}`);
        const codeStr = i.code ? `\`${i.code}\`` : "";
        const sevStr = i.severity ?? "";
        if (codeStr || sevStr) lines.push(`  - Code: ${codeStr}, Severity: ${sevStr}`);
      }
    }
    lines.push("");
  }

  // Equipment / variants
  if (report.variants) {
    const v = report.variants;
    const flags = [];
    if (v.freeArchetype) flags.push("Free Archetype");
    if (v.abp) flags.push("Automatic Bonus Progression");
    if (v.gradualBoosts) flags.push("Gradual Boosts");
    if (v.dualClass) flags.push("Dual Class");
    if (flags.length > 0) {
      lines.push("## Variant Rules");
      for (const f of flags) lines.push(`- ${f}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function renderCrossPartyMarkdown(pr) {
  const lines = [];
  lines.push(`# Party Audit`);
  lines.push("");
  if (pr.generatedAt) {
    lines.push(`_Generated: ${new Date(pr.generatedAt).toISOString()}_`);
    lines.push("");
  }

  // Cross-party publication
  if (pr.crossPartyPublication) {
    lines.push("## Cross-Party Publication");
    const rows = pr.crossPartyPublication.byTitle ?? [];
    if (rows.length === 0) {
      lines.push("_No data._");
    } else {
      lines.push("| Title | License | Count |");
      lines.push("| --- | --- | ---: |");
      for (const r of rows) {
        lines.push(`| ${tableCell(r.title)} | ${tableCell(r.licenseDisplay ?? r.license ?? "")} | ${r.count ?? 0} |`);
      }
    }
    lines.push("");
  }

  // Per-member sections
  for (const r of pr.party ?? []) {
    lines.push("---");
    lines.push("");
    lines.push(renderSingleMarkdown(r));
  }
  return lines.join("\n");
}

export function toMarkdown(report) {
  if (!report) return "";
  return isPartyReport(report) ? renderCrossPartyMarkdown(report) : renderSingleMarkdown(report);
}

// ---------- HTML ----------

const HTML_CSS = `
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 1.5rem auto; max-width: 960px; line-height: 1.5; color: #222; padding: 0 1rem; }
h1 { border-bottom: 2px solid #444; padding-bottom: 0.3rem; }
h2 { border-bottom: 1px solid #bbb; padding-bottom: 0.2rem; margin-top: 1.6rem; }
table { border-collapse: collapse; width: 100%; margin: 0.5rem 0 1rem; }
th, td { border: 1px solid #ccc; padding: 0.35rem 0.6rem; text-align: left; }
th { background: #f3f3f3; }
td.num, th.num { text-align: right; }
ul { padding-left: 1.4rem; }
li { margin: 0.2rem 0; }
.sev { font-weight: bold; margin-right: 0.25rem; }
.sev-error { color: #b00020; }
.sev-warn { color: #b8860b; }
.sev-info { color: #1a73e8; }
code { background: #f1f1f1; padding: 0 0.25rem; border-radius: 3px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.meta { color: #666; font-style: italic; }
.muted { color: #888; }
`;

function renderSingleHtmlBody(report) {
  const out = [];
  const name = htmlEscape(report.actorName ?? "");
  const lvl = htmlEscape(report.actorLevel ?? "?");
  out.push(`<h1>Character Audit: ${name} <span class="muted">(Level ${lvl})</span></h1>`);
  if (report.generatedAt) {
    out.push(`<p class="meta">Generated: ${htmlEscape(new Date(report.generatedAt).toISOString())}</p>`);
  }

  const cs = report.completeness?.summary ?? {};
  const ps = report.prerequisites?.summary ?? {};
  out.push("<h2>Summary</h2>");
  out.push("<ul>");
  out.push(`<li>Errors: ${cs.errors ?? 0}</li>`);
  out.push(`<li>Warnings: ${cs.warnings ?? 0}</li>`);
  out.push(`<li>Infos: ${cs.infos ?? 0}</li>`);
  if (ps && (ps.fail || ps.unknown)) {
    out.push(`<li>Prereq Fails: ${ps.fail ?? 0}</li>`);
    out.push(`<li>Prereq Unknowns: ${ps.unknown ?? 0}</li>`);
  }
  out.push("</ul>");

  if (report.publication) {
    out.push("<h2>Publication</h2>");
    const rollup = report.publication.actorRollup ?? [];
    if (rollup.length === 0) {
      out.push('<p class="muted">No publication data.</p>');
    } else {
      out.push("<table><thead><tr><th>Title</th><th>License</th><th class=\"num\">Count</th></tr></thead><tbody>");
      for (const r of rollup) {
        const flag = r.isUnknown ? "(?) " : r.whitelisted ? "(OK) " : "";
        out.push(`<tr><td>${htmlEscape(flag + (r.title ?? ""))}</td><td>${htmlEscape(r.licenseDisplay ?? r.license ?? "")}</td><td class="num">${r.count ?? 0}</td></tr>`);
      }
      out.push("</tbody></table>");
    }
  }

  if (report.prerequisites) {
    out.push("<h2>Prerequisites</h2>");
    const issues = report.prerequisites.issues ?? [];
    if (issues.length === 0) {
      out.push('<p class="muted">No prerequisite issues.</p>');
    } else {
      out.push("<ul>");
      for (const i of issues) {
        const badge = i.evaluation === "fail"
          ? '<span class="sev sev-error">❌</span>'
          : i.evaluation === "unknown"
            ? '<span class="sev sev-info">ℹ️</span>'
            : sevHtmlBadge(i.severity);
        out.push(`<li>${badge}<strong>${htmlEscape(i.featName ?? "")}</strong> — ${htmlEscape(i.requirement ?? "")}`);
        if (Array.isArray(i.reasons) && i.reasons.length > 0) {
          out.push("<ul>");
          for (const r of i.reasons) out.push(`<li>Failed: ${htmlEscape(r)}</li>`);
          out.push("</ul>");
        }
        out.push("</li>");
      }
      out.push("</ul>");
    }
  }

  if (report.completeness) {
    out.push("<h2>Completeness</h2>");
    const issues = report.completeness.issues ?? [];
    if (issues.length === 0) {
      out.push('<p class="muted">No completeness issues.</p>');
    } else {
      out.push("<ul>");
      for (const i of issues) {
        const { title, hint } = resolveIssueText(i);
        out.push(`<li>${sevHtmlBadge(i.severity)}<strong>${htmlEscape(title)}</strong>${hint ? ` — ${htmlEscape(hint)}` : ""}`);
        if (i.code) out.push(`<br><span class="muted">Code: <code>${htmlEscape(i.code)}</code>, Severity: ${htmlEscape(i.severity ?? "")}</span>`);
        out.push("</li>");
      }
      out.push("</ul>");
    }
  }

  if (report.variants) {
    const v = report.variants;
    const flags = [];
    if (v.freeArchetype) flags.push("Free Archetype");
    if (v.abp) flags.push("Automatic Bonus Progression");
    if (v.gradualBoosts) flags.push("Gradual Boosts");
    if (v.dualClass) flags.push("Dual Class");
    if (flags.length > 0) {
      out.push("<h2>Variant Rules</h2><ul>");
      for (const f of flags) out.push(`<li>${htmlEscape(f)}</li>`);
      out.push("</ul>");
    }
  }
  return out.join("\n");
}

function renderCrossPartyHtmlBody(pr) {
  const out = [];
  out.push("<h1>Party Audit</h1>");
  if (pr.generatedAt) {
    out.push(`<p class="meta">Generated: ${htmlEscape(new Date(pr.generatedAt).toISOString())}</p>`);
  }
  if (pr.crossPartyPublication) {
    out.push("<h2>Cross-Party Publication</h2>");
    const rows = pr.crossPartyPublication.byTitle ?? [];
    if (rows.length === 0) {
      out.push('<p class="muted">No data.</p>');
    } else {
      out.push("<table><thead><tr><th>Title</th><th>License</th><th class=\"num\">Count</th></tr></thead><tbody>");
      for (const r of rows) {
        out.push(`<tr><td>${htmlEscape(r.title ?? "")}</td><td>${htmlEscape(r.licenseDisplay ?? r.license ?? "")}</td><td class="num">${r.count ?? 0}</td></tr>`);
      }
      out.push("</tbody></table>");
    }
  }
  for (const r of pr.party ?? []) {
    out.push("<hr>");
    out.push(renderSingleHtmlBody(r));
  }
  return out.join("\n");
}

export function toHtml(report, options = {}) {
  if (!report) return "";
  const title = options.title
    ?? (isPartyReport(report)
      ? "PF2e Party Audit"
      : `PF2e Character Audit — ${report.actorName ?? ""}`);
  const body = isPartyReport(report) ? renderCrossPartyHtmlBody(report) : renderSingleHtmlBody(report);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${htmlEscape(title)}</title>
<style>${HTML_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

// ---------- download helper ----------

export function downloadAs(filename, content, mimeType = "application/octet-stream") {
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke after the click is processed.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch (err) {
    console.error(`[${MODULE_ID}] downloadAs failed`, err);
    try { ui.notifications?.error(`Download failed: ${err?.message ?? err}`); } catch (_e) { /* no-op */ }
    return false;
  }
}

// ---------- convenience save handlers ----------

function buildFilenameBase(report) {
  // Full timestamp: YYYYMMDD-HHMMSS (UTC). Filesystem-safe; sortable.
  const iso = new Date().toISOString(); // e.g. "2026-05-12T03:14:15.123Z"
  const ts = iso.slice(0, 19).replace(/[-:T]/g, "").replace(/(\d{8})(\d{6})/, "$1-$2");
  if (isPartyReport(report)) return `pf2e-party-audit-${ts}`;
  const safeName = String(report.actorName ?? "actor").replace(/[^\w.-]+/g, "_");
  return `pf2e-audit-${safeName}-${ts}`;
}

export function saveMarkdown(report) {
  const md = toMarkdown(report);
  const ok = downloadAs(`${buildFilenameBase(report)}.md`, md, "text/markdown;charset=utf-8");
  if (ok) try { ui.notifications?.info(t("Action.ExportMarkdown") + " — OK"); } catch (_e) { /* no-op */ }
  return ok;
}

export function saveHtml(report) {
  const html = toHtml(report);
  const ok = downloadAs(`${buildFilenameBase(report)}.html`, html, "text/html;charset=utf-8");
  if (ok) try { ui.notifications?.info(t("Action.ExportHtml") + " — OK"); } catch (_e) { /* no-op */ }
  return ok;
}
