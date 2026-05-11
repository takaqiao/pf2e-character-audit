import { MODULE_ID } from "../constants.js";
import { format, t } from "../i18n.js";

/**
 * Compute a diff between the current audit report and the most recent snapshot.
 *
 * NOTE: snapshots only persist aggregate counts (not individual issue codes),
 * so this diff is COUNT-BASED, not issue-by-issue. `added` and `fixed` are
 * deltas per severity, clamped to >= 0; `persistent` is min(current, prev).
 *
 * @param {object} currentReport  Full report from api.auditActor().
 * @param {object|null} prevSnapshot  Previous snapshot record, or null.
 * @returns {{added:Array,fixed:Array,persistent:number,summaryDelta:object|null,firstRun?:boolean}}
 */
export function computeSnapshotDiff(currentReport, prevSnapshot) {
  if (!prevSnapshot) {
    return { added: [], fixed: [], persistent: 0, summaryDelta: null, firstRun: true };
  }

  const curC = currentReport?.completeness?.summary ?? {};
  const curP = currentReport?.prerequisites?.summary ?? {};
  const curTotal =
    (curC.errors ?? 0) + (curC.warnings ?? 0) + (curC.infos ?? 0) +
    (curP.fail ?? 0) + (curP.unknown ?? 0);

  const prevC = prevSnapshot.completeness ?? {};
  const prevP = prevSnapshot.prerequisites ?? {};
  const prevTotal = prevSnapshot.total ?? 0;

  const categories = [
    { key: "completenessErrors", label: "Completeness errors", cur: curC.errors ?? 0, prev: prevC.errors ?? 0 },
    { key: "completenessWarnings", label: "Completeness warnings", cur: curC.warnings ?? 0, prev: prevC.warnings ?? 0 },
    { key: "completenessInfos", label: "Completeness infos", cur: curC.infos ?? 0, prev: prevC.infos ?? 0 },
    { key: "prereqFails", label: "Prerequisite failures", cur: curP.fail ?? 0, prev: prevP.fail ?? 0 },
    { key: "prereqUnknowns", label: "Prerequisite unknowns", cur: curP.unknown ?? 0, prev: prevP.unknown ?? 0 }
  ];

  const added = [];
  const fixed = [];
  let persistent = 0;

  for (const cat of categories) {
    const diff = cat.cur - cat.prev;
    if (diff > 0) added.push({ category: cat.key, label: cat.label, delta: diff });
    else if (diff < 0) fixed.push({ category: cat.key, label: cat.label, delta: -diff });
    persistent += Math.min(cat.cur, cat.prev);
  }

  const summaryDelta = {
    completenessErrors: (curC.errors ?? 0) - (prevC.errors ?? 0),
    completenessWarnings: (curC.warnings ?? 0) - (prevC.warnings ?? 0),
    prereqFails: (curP.fail ?? 0) - (prevP.fail ?? 0),
    prereqUnknowns: (curP.unknown ?? 0) - (prevP.unknown ?? 0),
    total: curTotal - prevTotal
  };

  return { added, fixed, persistent, summaryDelta };
}

/**
 * Render a compact HTML summary for the chat-card whisper.
 * @param {object} report  Full report from api.auditActor().
 * @returns {string}
 */
export function formatChatSummary(report) {
  const actor = report?.actor ?? {};
  const actorName = actor.name ?? "Unknown";
  const actorId = actor.id ?? report?.actorId ?? "";
  const c = report?.completeness?.summary ?? {};
  const p = report?.prerequisites?.summary ?? {};
  const errors = c.errors ?? 0;
  const warnings = c.warnings ?? 0;
  const infos = c.infos ?? 0;
  const fails = p.fail ?? 0;
  const unknowns = p.unknown ?? 0;

  const i18n = (k, fallback) => {
    const full = `PF2E-CA.${k}`;
    const out = game.i18n?.localize?.(full);
    return (out && out !== full) ? out : fallback;
  };

  const lblTitle = i18n("AutoAudit.Summary.Title", "Audit after level-up");
  const lblErrors = i18n("AutoAudit.Summary.Errors", "errors");
  const lblWarnings = i18n("AutoAudit.Summary.Warnings", "warnings");
  const lblInfos = i18n("AutoAudit.Summary.Infos", "infos");
  const lblFails = i18n("AutoAudit.Summary.PrereqFails", "prereq failures");
  const lblUnknowns = i18n("AutoAudit.Summary.PrereqUnknowns", "prereq unknowns");
  const lblOpen = i18n("AutoAudit.OpenFullReport", "View full audit");

  return `<div class="pf2e-ca-auto-audit">
  <p><strong>${foundry.utils.escapeHTML?.(actorName) ?? actorName}</strong> — ${lblTitle}</p>
  <ul style="list-style:none;padding-left:0;margin:0.25em 0;">
    <li><i class="fas fa-times-circle" style="color:#c33;"></i> ${errors} ${lblErrors}</li>
    <li><i class="fas fa-exclamation-triangle" style="color:#d80;"></i> ${warnings} ${lblWarnings}</li>
    <li><i class="fas fa-info-circle" style="color:#39c;"></i> ${infos} ${lblInfos}</li>
    <li><i class="fas fa-ban" style="color:#a33;"></i> ${fails} ${lblFails}</li>
    <li><i class="fas fa-question-circle" style="color:#888;"></i> ${unknowns} ${lblUnknowns}</li>
  </ul>
  <p><a data-action="open-audit" data-actor-id="${actorId}"><i class="fas fa-clipboard-check"></i> ${lblOpen}</a></p>
</div>`;
}

function getGmRecipientIds() {
  try {
    const recips = ChatMessage.getWhisperRecipients("GM") ?? [];
    return recips.map((u) => u.id);
  } catch {
    return game.users?.filter?.((u) => u.isGM)?.map?.((u) => u.id) ?? [];
  }
}

async function handleLevelUp(actor, newLevel) {
  try {
    const api = game.modules.get(MODULE_ID)?.api;
    if (!api?.auditActor) return;
    const report = await api.auditActor(actor);
    const content = formatChatSummary(report);
    const title = format("AutoAudit.ChatTitle", { actorName: actor.name, level: newLevel });
    const wrapped = `<div class="pf2e-ca-auto-audit-wrap"><p><strong>${title}</strong></p>${content}</div>`;
    await ChatMessage.create({
      content: wrapped,
      whisper: getGmRecipientIds(),
      speaker: { alias: "PF2e Character Audit" },
      flags: { [MODULE_ID]: { autoAudit: true, actorId: actor.id, level: newLevel } }
    });
  } catch (err) {
    console.warn(`[${MODULE_ID}] auto-audit on level-up failed`, err);
  }
}

/**
 * Register the updateActor hook that runs an audit when a character's level
 * changes, plus the renderChatMessage hook that wires the "open audit" link.
 */
export function registerLevelUpHook() {
  Hooks.on("updateActor", (actor, change, _options, _userId) => {
    try {
      const newLevel = change?.system?.details?.level?.value;
      // Only fire on numeric level updates; ignore undefined/non-numeric values.
      if (typeof newLevel !== "number" || !Number.isFinite(newLevel)) return;
      if (!game.user?.isGM) return;
      if (actor?.type !== "character") return;
      let enabled = true;
      try { enabled = !!game.settings.get(MODULE_ID, "autoAuditOnLevelUp"); } catch { enabled = true; }
      if (!enabled) return;
      setTimeout(() => handleLevelUp(actor, newLevel), 50);
    } catch (err) {
      console.warn(`[${MODULE_ID}] updateActor level-up hook error`, err);
    }
  });

  Hooks.on("renderChatMessage", (_msg, html, _data) => {
    try {
      const root = html instanceof HTMLElement ? html : html?.[0];
      if (!root) return;
      const links = root.querySelectorAll('[data-action="open-audit"]');
      links.forEach((el) => {
        if (el.dataset.pf2eCaBound) return;
        el.dataset.pf2eCaBound = "1";
        el.addEventListener("click", (ev) => {
          ev.preventDefault();
          const actorId = el.dataset.actorId;
          const actor = actorId ? game.actors.get(actorId) : null;
          const api = game.modules.get(MODULE_ID)?.api;
          if (actor && api?.openAuditApp) api.openAuditApp(actor);
        });
      });
    } catch (err) {
      console.warn(`[${MODULE_ID}] renderChatMessage open-audit binding error`, err);
    }
  });
}
