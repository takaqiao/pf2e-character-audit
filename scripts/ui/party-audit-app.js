import { MODULE_ID, SEVERITY } from "../constants.js";
import { auditParty, suppressIssueCode, suppressFeatPrereq, unsuppressAll } from "../audit/index.js";
import { t, key } from "../i18n.js";
import { toChat, toJournal, toJson } from "./exporters.js";
import { hasQuickFix, runQuickFix } from "./quick-fix.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function severityIcon(sev) {
  if (sev === SEVERITY.ERROR) return '<i class="fa-solid fa-circle-exclamation"></i>';
  if (sev === SEVERITY.WARN) return '<i class="fa-solid fa-triangle-exclamation"></i>';
  if (sev === SEVERITY.INFO) return '<i class="fa-solid fa-circle-info"></i>';
  return "";
}

function localizeIssue(issue) {
  return {
    ...issue,
    icon: severityIcon(issue.severity),
    titleText: game.i18n.format(`${issue.i18nKey}.Title`, issue.params ?? {}),
    hintText: game.i18n.format(`${issue.i18nKey}.Hint`, issue.params ?? {}),
    quickFix: hasQuickFix(issue.code)
  };
}

function applySeverityFilter(issues, filter) {
  if (!filter || filter === "all" || !Array.isArray(issues)) return issues ?? [];
  return issues.filter((i) => i.severity === filter || i.evaluation === filter);
}

function buildHistoryBars(history) {
  if (!Array.isArray(history) || history.length < 2) return null;
  const max = Math.max(1, ...history.map((h) => h.total ?? 0));
  return history.map((h, i) => ({
    heightPct: Math.max(8, Math.round(((h.total ?? 0) / max) * 100)),
    total: h.total ?? 0,
    isCurrent: i === history.length - 1,
    timestampLabel: new Date(h.timestamp ?? 0).toLocaleString()
  }));
}

function deltaFromSnapshot(report, previous) {
  if (!previous) return null;
  const cur = report.summary ?? {};
  const c = cur.completeness ?? {};
  const p = cur.prerequisites ?? {};
  const diff = Date.now() - (previous.timestamp ?? 0);
  let rt = "";
  if (diff < 60_000) rt = game.i18n.localize("PF2E-CA.Time.JustNow");
  else if (diff < 3_600_000) rt = game.i18n.format("PF2E-CA.Time.MinutesAgo", { n: Math.floor(diff / 60_000) });
  else if (diff < 86_400_000) rt = game.i18n.format("PF2E-CA.Time.HoursAgo", { n: Math.floor(diff / 3_600_000) });
  else rt = game.i18n.format("PF2E-CA.Time.DaysAgo", { n: Math.floor(diff / 86_400_000) });
  return {
    relativeTime: rt,
    errors: (c.errors ?? 0) - (previous.completeness?.errors ?? 0),
    warnings: (c.warnings ?? 0) - (previous.completeness?.warnings ?? 0),
    infos: (c.infos ?? 0) - (previous.completeness?.infos ?? 0),
    fail: (p.fail ?? 0) - (previous.prerequisites?.fail ?? 0),
    unknown: (p.unknown ?? 0) - (previous.prerequisites?.unknown ?? 0)
  };
}

function localizeReport(report, filter) {
  if (!report) return report;
  return {
    ...report,
    completeness: report.completeness
      ? {
          ...report.completeness,
          issues: applySeverityFilter(report.completeness.issues, filter).map(localizeIssue),
          allIssueCount: report.completeness.issues?.length ?? 0
        }
      : null,
    prerequisites: report.prerequisites
      ? {
          ...report.prerequisites,
          issues: applySeverityFilter(report.prerequisites.issues, filter)
        }
      : null
  };
}

export class PartyAuditApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this._partyReport = null;
    this._selectedActorId = null;
    this._activeTab = "overview";
    this._severityFilter = "all";
  }

  static DEFAULT_OPTIONS = {
    id: "pf2e-character-audit-party",
    classes: ["pf2e-character-audit", "party-audit"],
    tag: "section",
    window: {
      title: key("App.Title.Party"),
      resizable: true,
      icon: "fa-solid fa-users"
    },
    position: { width: 1020, height: 720 },
    actions: {
      selectMember: PartyAuditApp.#onSelectMember,
      switchTab: PartyAuditApp.#onSwitchTab,
      rerun: PartyAuditApp.#onRerun,
      exportChat: PartyAuditApp.#onExportChat,
      exportJournal: PartyAuditApp.#onExportJournal,
      exportJson: PartyAuditApp.#onExportJson,
      filterSev: PartyAuditApp.#onFilterSev,
      openItem: PartyAuditApp.#onOpenItem,
      suppressIssue: PartyAuditApp.#onSuppress,
      suppressFeat: PartyAuditApp.#onSuppressFeat,
      quickFix: PartyAuditApp.#onQuickFix,
      unsuppressAll: PartyAuditApp.#onUnsuppressAll
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/party-audit.hbs`, scrollable: [".audit-member-list", ".audit-tab-content"] }
  };

  async _prepareContext(options) {
    if (!this._partyReport) this._partyReport = auditParty();
    const pr = this._partyReport;
    if (!this._selectedActorId && pr.party.length > 0) {
      this._selectedActorId = pr.party[0].actorId;
    }
    if (this._selectedActorId === "__cross__") this._activeTab = "cross";
    const filter = this._severityFilter ?? "all";
    const rawSelected = pr.party.find((r) => r.actorId === this._selectedActorId);
    const selected = localizeReport(rawSelected, filter);
    const delta = rawSelected ? deltaFromSnapshot(rawSelected, rawSelected.previousSnapshot) : null;
    const historyBars = rawSelected ? buildHistoryBars(rawSelected.history) : null;
    const suppressedCount = rawSelected
      ? (rawSelected.suppressedCodes?.length ?? 0) + (rawSelected.suppressedFeats?.length ?? 0)
      : 0;
    return {
      partyReport: pr,
      delta,
      historyBars,
      suppressedCount,
      members: pr.party.map((r) => ({
        id: r.actorId,
        name: r.actorName,
        level: r.actorLevel,
        badge: r.badge,
        summary: r.summary
      })),
      selectedId: this._selectedActorId,
      selected,
      severityFilter: filter,
      activeTab: this._activeTab,
      crossPartyPublication: pr.crossPartyPublication,
      tabs: [
        { id: "overview", label: t("Tab.Overview") },
        { id: "publication", label: t("Tab.Publication") },
        { id: "completeness", label: t("Tab.Completeness") },
        { id: "prereq", label: t("Tab.Prereq") }
      ],
      labels: {
        rerun: t("Action.Rerun"),
        chat: t("Action.SendChat"),
        journal: t("Action.ExportJournal"),
        json: t("Action.CopyJson"),
        crossLabel: t("Tab.CrossParty"),
        memberSection: t("Label.PartyMembers"),
        noIssues: t("Label.NoIssues"),
        passLabel: t("Label.Pass"),
        failLabel: t("Label.Fail"),
        unknownLabel: t("Label.Unknown"),
        filterAll: t("Filter.All"),
        filterError: t("Filter.Errors"),
        filterWarn: t("Filter.Warnings"),
        filterInfo: t("Filter.Infos"),
        filterShow: t("Filter.Show"),
        suppressLabel: t("Action.Suppress"),
        suppressFeatLabel: t("Action.SuppressFeat"),
        unsuppressLabel: t("Action.UnsuppressAll"),
        suppressedNote: t("Label.SuppressedNote"),
        quickFixLabel: t("Action.QuickFix"),
        historyTitle: t("Label.History")
      }
    };
  }

  static #onSelectMember(event, target) {
    const id = target?.dataset?.actorId;
    if (!id) return;
    this._selectedActorId = id;
    this.render();
  }

  static #onSwitchTab(event, target) {
    const tab = target?.dataset?.tab;
    if (!tab) return;
    this._activeTab = tab;
    this.render();
  }

  static #onRerun() {
    this._partyReport = null;
    this.render();
  }

  static async #onExportChat() {
    if (!this._partyReport) return;
    for (const r of this._partyReport.party) await toChat(r);
  }

  static async #onExportJournal() {
    if (!this._partyReport) return;
    await toJournal(null, this._partyReport);
  }

  static #onExportJson() {
    if (this._partyReport) toJson(this._partyReport);
  }

  static #onFilterSev(event, target) {
    const sev = target?.dataset?.sev ?? "all";
    this._severityFilter = sev;
    this.render();
  }

  static async #onOpenItem(event, target) {
    const uuid = target?.dataset?.uuid;
    if (!uuid) return;
    try {
      const doc = await fromUuid(uuid);
      doc?.sheet?.render(true);
    } catch (err) {
      console.warn("[pf2e-character-audit] failed to open uuid", uuid, err);
    }
  }

  static async #onSuppress(event, target) {
    const code = target?.dataset?.code;
    const actorId = this._selectedActorId;
    if (!code || !actorId) return;
    const actor = game.actors.get(actorId);
    if (!actor) return;
    const added = await suppressIssueCode(actor, code);
    if (added) {
      ui.notifications?.info(game.i18n.format(key("Action.SuppressedNotice"), { code }));
      this._partyReport = null;
      this.render();
    }
  }

  static async #onUnsuppressAll(event, target) {
    const actorId = this._selectedActorId;
    if (!actorId) return;
    const actor = game.actors.get(actorId);
    if (!actor) return;
    await unsuppressAll(actor);
    ui.notifications?.info(game.i18n.localize(key("Action.UnsuppressNotice")));
    this._partyReport = null;
    this.render();
  }

  static async #onSuppressFeat(event, target) {
    const slug = target?.dataset?.slug;
    const name = target?.dataset?.name;
    const actorId = this._selectedActorId;
    if (!slug || !actorId) return;
    const actor = game.actors.get(actorId);
    if (!actor) return;
    const added = await suppressFeatPrereq(actor, slug, name);
    if (added) {
      ui.notifications?.info(game.i18n.format(key("Action.SuppressedFeatNotice"), { name: name || slug }));
      this._partyReport = null;
      this.render();
    }
  }

  static async #onQuickFix(event, target) {
    const code = target?.dataset?.code;
    const actorId = this._selectedActorId;
    if (!code || !actorId) return;
    const actor = game.actors.get(actorId);
    if (!actor) return;
    const ok = await runQuickFix(code, actor);
    if (ok) {
      setTimeout(() => { this._partyReport = null; this.render(); }, 250);
    }
  }
}
