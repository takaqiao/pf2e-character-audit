import { MODULE_ID, SEVERITY } from "../constants.js";
import { auditActor, suppressIssueCode, suppressFeatPrereq, unsuppressAll } from "../audit/index.js";
import { t, key } from "../i18n.js";
import { toChat, toJournal, toJson } from "./exporters.js";
import { saveMarkdown, saveHtml } from "./exporters-extras.js";
import { hasQuickFix, runQuickFix } from "./quick-fix.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function severityIcon(sev) {
  if (sev === SEVERITY.ERROR) return '<i class="fa-solid fa-circle-exclamation"></i>';
  if (sev === SEVERITY.WARN) return '<i class="fa-solid fa-triangle-exclamation"></i>';
  if (sev === SEVERITY.INFO) return '<i class="fa-solid fa-circle-info"></i>';
  return "";
}

function localizeIssue(issue) {
  // Custom rules (and any homebrew detector) supply literal title/hint and set
  // i18nKey to null. When i18nKey is null, prefer the literal strings.
  const params = issue.params ?? {};
  const titleText = issue.i18nKey
    ? game.i18n.format(`${issue.i18nKey}.Title`, params)
    : (issue.title ?? issue.code ?? "");
  const hintText = issue.i18nKey
    ? game.i18n.format(`${issue.i18nKey}.Hint`, params)
    : (issue.hint ?? "");
  return {
    ...issue,
    icon: severityIcon(issue.severity),
    titleText,
    hintText,
    quickFix: hasQuickFix(issue.code)
  };
}

function applyPublicationFilter(publication, filter) {
  if (!publication || !filter || filter === "all") return publication;
  const matches = (license, remaster) => {
    if (filter === "ogl") return license === "OGL" || !remaster;
    if (filter === "orc") return license === "ORC" || remaster;
    if (filter === "legacy") return !remaster;
    return true;
  };
  const rollup = (publication.actorRollup ?? []).filter((r) => matches(r.license, r.remaster));
  const byCategory = {};
  for (const [cat, list] of Object.entries(publication.byCategory ?? {})) {
    const kept = list.filter((it) => matches(it.license, it.remaster));
    if (kept.length > 0) byCategory[cat] = kept;
  }
  const filteredSummary = {
    ...publication.summary,
    total: rollup.reduce((s, r) => s + r.count, 0),
    distinctTitles: rollup.length
  };
  return { ...publication, summary: filteredSummary, actorRollup: rollup, titles: rollup, byCategory };
}

function buildHistoryBars(history) {
  if (!Array.isArray(history) || history.length < 2) return null;
  const max = Math.max(1, ...history.map((h) => h.total ?? 0));
  return history.map((h, i) => {
    const ratio = (h.total ?? 0) / max;
    const heightPct = Math.max(8, Math.round(ratio * 100));
    return {
      heightPct,
      total: h.total ?? 0,
      isCurrent: i === history.length - 1,
      timestampLabel: new Date(h.timestamp ?? 0).toLocaleString()
    };
  });
}

function applySeverityFilter(issues, filter) {
  if (!filter || filter === "all" || !Array.isArray(issues)) return issues ?? [];
  return issues.filter((i) => i.severity === filter || i.evaluation === filter);
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return game.i18n.localize(`${key("Time.JustNow")}`);
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return game.i18n.format(`${key("Time.MinutesAgo")}`, { n: mins });
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 24) return game.i18n.format(`${key("Time.HoursAgo")}`, { n: hrs });
  const days = Math.floor(diff / 86_400_000);
  return game.i18n.format(`${key("Time.DaysAgo")}`, { n: days });
}

function deltaFromSnapshot(report, previous) {
  if (!previous) return null;
  const cur = report.summary ?? {};
  const c = cur.completeness ?? {};
  const p = cur.prerequisites ?? {};
  return {
    relativeTime: formatRelativeTime(previous.timestamp),
    errors: (c.errors ?? 0) - (previous.completeness?.errors ?? 0),
    warnings: (c.warnings ?? 0) - (previous.completeness?.warnings ?? 0),
    infos: (c.infos ?? 0) - (previous.completeness?.infos ?? 0),
    fail: (p.fail ?? 0) - (previous.prerequisites?.fail ?? 0),
    unknown: (p.unknown ?? 0) - (previous.prerequisites?.unknown ?? 0)
  };
}

export class AuditReportApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this._activeTab = "overview";
    this._report = null;
    this._severityFilter = "all";
    this._pubFilter = "all";
  }

  static DEFAULT_OPTIONS = {
    id: "pf2e-character-audit-{id}",
    classes: ["pf2e-character-audit", "audit-report"],
    tag: "section",
    window: {
      title: key("App.Title.Single"),
      resizable: true,
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-clipboard-check"
    },
    position: { width: 800, height: 660 },
    actions: {
      switchTab: AuditReportApp.#onSwitchTab,
      rerun: AuditReportApp.#onRerun,
      exportChat: AuditReportApp.#onExportChat,
      exportJournal: AuditReportApp.#onExportJournal,
      exportJson: AuditReportApp.#onExportJson,
      exportMarkdown: AuditReportApp.#onExportMarkdown,
      exportHtml: AuditReportApp.#onExportHtml,
      openItem: AuditReportApp.#onOpenItem,
      filterSev: AuditReportApp.#onFilterSev,
      filterPub: AuditReportApp.#onFilterPub,
      suppressIssue: AuditReportApp.#onSuppress,
      suppressFeat: AuditReportApp.#onSuppressFeat,
      quickFix: AuditReportApp.#onQuickFix,
      unsuppressAll: AuditReportApp.#onUnsuppressAll
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/audit-report.hbs`, scrollable: [".audit-tab-content"] }
  };

  get title() {
    return `${game.i18n.localize(key("App.Title.Single"))} — ${this.actor?.name ?? ""}`;
  }

  async _prepareContext(options) {
    if (!this._report) this._report = auditActor(this.actor);
    const r = this._report;
    const filter = this._severityFilter ?? "all";

    const completeness = r.completeness
      ? {
          ...r.completeness,
          issues: applySeverityFilter(r.completeness.issues, filter).map(localizeIssue),
          allIssueCount: r.completeness.issues?.length ?? 0
        }
      : null;
    const prerequisites = r.prerequisites
      ? {
          ...r.prerequisites,
          issues: applySeverityFilter(r.prerequisites.issues, filter)
        }
      : null;

    const pubFilter = this._pubFilter ?? "all";
    return {
      report: r,
      activeTab: this._activeTab,
      severityFilter: filter,
      pubFilter,
      delta: deltaFromSnapshot(r, r.previousSnapshot),
      historyBars: buildHistoryBars(r.history),
      suppressedCount: (r.suppressedCodes ?? []).length + (r.suppressedFeats ?? []).length,
      tabs: [
        { id: "overview", label: t("Tab.Overview") },
        { id: "publication", label: t("Tab.Publication") },
        { id: "completeness", label: t("Tab.Completeness") },
        { id: "prereq", label: t("Tab.Prereq") }
      ],
      summary: r.summary,
      badge: r.badge,
      variants: r.variants,
      publication: applyPublicationFilter(r.publication, pubFilter),
      completeness,
      prerequisites,
      labels: {
        rerun: t("Action.Rerun"),
        chat: t("Action.SendChat"),
        journal: t("Action.ExportJournal"),
        json: t("Action.CopyJson"),
        markdown: t("Action.ExportMarkdown"),
        html: t("Action.ExportHtml"),
        actorId: r.actorId,
        actorName: r.actorName,
        actorLevel: r.actorLevel,
        actorClass: r.actorClass ?? "—",
        actorAncestry: r.actorAncestry ?? "—",
        noIssues: t("Label.NoIssues"),
        passLabel: t("Label.Pass"),
        failLabel: t("Label.Fail"),
        unknownLabel: t("Label.Unknown"),
        filterAll: t("Filter.All"),
        filterError: t("Filter.Errors"),
        filterWarn: t("Filter.Warnings"),
        filterInfo: t("Filter.Infos"),
        filterShow: t("Filter.Show"),
        pubFilterAll: t("Filter.PubAll"),
        pubFilterOgl: t("Filter.PubOgl"),
        pubFilterOrc: t("Filter.PubOrc"),
        pubFilterLegacy: t("Filter.PubLegacy"),
        suppressLabel: t("Action.Suppress"),
        suppressFeatLabel: t("Action.SuppressFeat"),
        unsuppressLabel: t("Action.UnsuppressAll"),
        suppressedNote: t("Label.SuppressedNote"),
        quickFixLabel: t("Action.QuickFix"),
        historyTitle: t("Label.History")
      }
    };
  }

  static #onSwitchTab(event, target) {
    const tab = target?.dataset?.tab;
    if (!tab) return;
    this._activeTab = tab;
    this.render();
  }

  static #onRerun() {
    this._report = null;
    this.render();
  }

  static async #onExportChat() {
    if (this._report) await toChat(this._report);
  }

  static async #onExportJournal() {
    if (this._report) await toJournal(this._report);
  }

  static #onExportJson() {
    if (this._report) toJson(this._report);
  }

  static #onExportMarkdown() {
    if (this._report) saveMarkdown(this._report);
  }

  static #onExportHtml() {
    if (this._report) saveHtml(this._report);
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

  static #onFilterSev(event, target) {
    const sev = target?.dataset?.sev ?? "all";
    this._severityFilter = sev;
    this.render();
  }

  static #onFilterPub(event, target) {
    const f = target?.dataset?.filter ?? "all";
    this._pubFilter = f;
    this.render();
  }

  static async #onSuppress(event, target) {
    const code = target?.dataset?.code;
    if (!code || !this.actor) return;
    const added = await suppressIssueCode(this.actor, code);
    if (added) {
      ui.notifications?.info(game.i18n.format(key("Action.SuppressedNotice"), { code }));
      this._report = null;
      this.render();
    }
  }

  static async #onUnsuppressAll(event, target) {
    if (!this.actor) return;
    await unsuppressAll(this.actor);
    ui.notifications?.info(game.i18n.localize(key("Action.UnsuppressNotice")));
    this._report = null;
    this.render();
  }

  static async #onSuppressFeat(event, target) {
    const slug = target?.dataset?.slug;
    const name = target?.dataset?.name;
    if (!slug || !this.actor) return;
    const added = await suppressFeatPrereq(this.actor, slug, name);
    if (added) {
      ui.notifications?.info(game.i18n.format(key("Action.SuppressedFeatNotice"), { name: name || slug }));
      this._report = null;
      this.render();
    }
  }

  static async #onQuickFix(event, target) {
    const code = target?.dataset?.code;
    if (!code) return;
    const ok = await runQuickFix(code, this.actor);
    if (ok) {
      // Re-render after a short delay so the user sees post-action state.
      setTimeout(() => { this._report = null; this.render(); }, 250);
    }
  }
}
