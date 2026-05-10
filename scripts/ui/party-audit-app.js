import { MODULE_ID, SEVERITY } from "../constants.js";
import { auditParty } from "../audit/index.js";
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

function localizeReport(report) {
  if (!report) return report;
  return {
    ...report,
    completeness: report.completeness
      ? { ...report.completeness, issues: (report.completeness.issues ?? []).map(localizeIssue) }
      : null
  };
}

export class PartyAuditApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this._partyReport = null;
    this._selectedActorId = null;
    this._activeTab = "overview";
  }

  static DEFAULT_OPTIONS = {
    id: "pf2e-character-audit-party",
    classes: ["pf2e-character-audit", "party-audit"],
    tag: "section",
    window: {
      title: key("App.Title.Party"),
      resizable: true,
      icon: "fas fa-users"
    },
    position: { width: 1000, height: 700 },
    actions: {
      selectMember: PartyAuditApp.#onSelectMember,
      switchTab: PartyAuditApp.#onSwitchTab,
      rerun: PartyAuditApp.#onRerun,
      exportChat: PartyAuditApp.#onExportChat,
      exportJournal: PartyAuditApp.#onExportJournal,
      exportJson: PartyAuditApp.#onExportJson
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
    const rawSelected = pr.party.find((r) => r.actorId === this._selectedActorId);
    const selected = localizeReport(rawSelected);
    return {
      partyReport: pr,
      members: pr.party.map((r) => ({
        id: r.actorId,
        name: r.actorName,
        level: r.actorLevel,
        badge: r.badge,
        summary: r.summary
      })),
      selectedId: this._selectedActorId,
      selected,
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
        memberSection: t("Label.PartyMembers")
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
}
