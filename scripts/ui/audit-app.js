import { MODULE_ID, SEVERITY } from "../constants.js";
import { auditActor } from "../audit/index.js";
import { t, key } from "../i18n.js";
import { toChat, toJournal, toJson } from "./exporters.js";

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
    hintText: game.i18n.format(`${issue.i18nKey}.Hint`, issue.params ?? {})
  };
}

export class AuditReportApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this._activeTab = "overview";
    this._report = null;
  }

  static DEFAULT_OPTIONS = {
    id: "pf2e-character-audit-{id}",
    classes: ["pf2e-character-audit", "audit-report"],
    tag: "section",
    window: {
      title: key("App.Title.Single"),
      resizable: true,
      contentClasses: ["standard-form"],
      icon: "fas fa-clipboard-check"
    },
    position: { width: 780, height: 640 },
    actions: {
      switchTab: AuditReportApp.#onSwitchTab,
      rerun: AuditReportApp.#onRerun,
      exportChat: AuditReportApp.#onExportChat,
      exportJournal: AuditReportApp.#onExportJournal,
      exportJson: AuditReportApp.#onExportJson,
      openItem: AuditReportApp.#onOpenItem
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
    return {
      report: r,
      activeTab: this._activeTab,
      tabs: [
        { id: "overview", label: t("Tab.Overview") },
        { id: "publication", label: t("Tab.Publication") },
        { id: "completeness", label: t("Tab.Completeness") },
        { id: "prereq", label: t("Tab.Prereq") }
      ],
      summary: r.summary,
      badge: r.badge,
      variants: r.variants,
      publication: r.publication,
      completeness: r.completeness
        ? { ...r.completeness, issues: (r.completeness.issues ?? []).map(localizeIssue) }
        : null,
      prerequisites: r.prerequisites,
      labels: {
        rerun: t("Action.Rerun"),
        chat: t("Action.SendChat"),
        journal: t("Action.ExportJournal"),
        json: t("Action.CopyJson"),
        actorName: r.actorName,
        actorLevel: r.actorLevel,
        actorClass: r.actorClass ?? "—",
        actorAncestry: r.actorAncestry ?? "—",
        noIssues: t("Label.NoIssues"),
        passLabel: t("Label.Pass"),
        failLabel: t("Label.Fail"),
        unknownLabel: t("Label.Unknown")
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

  static async #onOpenItem(event, target) {
    const uuid = target?.dataset?.uuid;
    if (!uuid) return;
    const doc = await fromUuid(uuid);
    doc?.sheet?.render(true);
  }
}
