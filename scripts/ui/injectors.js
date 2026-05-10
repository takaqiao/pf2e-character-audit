import { MODULE_ID } from "../constants.js";
import { t } from "../i18n.js";
import { AuditReportApp } from "./audit-app.js";
import { PartyAuditApp } from "./party-audit-app.js";

function isAuditAllowed() {
  if (game.user.isGM) return true;
  try {
    return !!game.settings.get(MODULE_ID, "allowPlayerAudit");
  } catch {
    return false;
  }
}

function showButtonOnSheet() {
  try {
    return game.settings.get(MODULE_ID, "auditButtonOnSheet") !== false;
  } catch {
    return true;
  }
}

export function openAuditApp(actor) {
  return new AuditReportApp(actor).render(true);
}

export function openPartyApp() {
  return new PartyAuditApp().render(true);
}

function injectButton(html, btn) {
  if (!html) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  const headerActions = root.querySelector(".window-header .header-control") ?? root.querySelector(".window-header");
  if (headerActions) {
    headerActions.before(btn);
  } else {
    root.querySelector(".window-header")?.appendChild(btn);
  }
}

function makeButton({ icon, label, className, onClick }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `header-control ${className ?? ""}`.trim();
  btn.dataset.action = "pf2e-character-audit";
  btn.title = label;
  btn.innerHTML = `<i class="fas ${icon}"></i>`;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick?.();
  });
  return btn;
}

function injectCharacterSheetButton(app, html) {
  if (!app?.actor || app.actor.type !== "character") return;
  if (!isAuditAllowed()) return;
  if (!showButtonOnSheet()) return;
  const root = html instanceof HTMLElement ? html : html?.[0] ?? app.element;
  if (!root) return;
  if (root.querySelector(`button[data-action="pf2e-character-audit"]`)) return;
  const btn = makeButton({
    icon: "fa-clipboard-check",
    label: t("Action.AuditSheet"),
    className: "pf2e-character-audit-btn",
    onClick: () => openAuditApp(app.actor)
  });
  injectButton(root, btn);
}

function injectPartySheetButton(app, html) {
  if (!isAuditAllowed()) return;
  const root = html instanceof HTMLElement ? html : html?.[0] ?? app.element;
  if (!root) return;
  if (root.querySelector(`button[data-action="pf2e-character-audit-party"]`)) return;
  const btn = makeButton({
    icon: "fa-users",
    label: t("Action.AuditParty"),
    className: "pf2e-character-audit-party-btn",
    onClick: () => openPartyApp()
  });
  btn.dataset.action = "pf2e-character-audit-party";
  injectButton(root, btn);
}

function injectActorDirectoryToolbar(app, html) {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  if (root.querySelector(`.pf2e-character-audit-directory-btn`)) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pf2e-character-audit-directory-btn";
  btn.innerHTML = `<i class="fas fa-clipboard-check"></i> ${t("Action.AuditParty")}`;
  btn.addEventListener("click", () => openPartyApp());
  const target = root.querySelector(".directory-header .header-actions")
    ?? root.querySelector(".directory-header")
    ?? root.querySelector(".header-actions");
  if (target) target.append(btn);
}

function injectActorDirectoryContext(directory, options) {
  if (!isAuditAllowed()) return;
  options.push({
    name: t("Action.AuditActor"),
    icon: '<i class="fas fa-clipboard-check"></i>',
    condition: (li) => {
      const id = li?.dataset?.entryId ?? li?.[0]?.dataset?.entryId;
      const actor = id ? game.actors.get(id) : null;
      return actor?.type === "character";
    },
    callback: (li) => {
      const id = li?.dataset?.entryId ?? li?.[0]?.dataset?.entryId;
      const actor = id ? game.actors.get(id) : null;
      if (actor) openAuditApp(actor);
    }
  });
}

export function registerHooks() {
  Hooks.on("renderCharacterSheetPF2e", injectCharacterSheetButton);
  Hooks.on("renderActorSheetPF2e", (app, html) => {
    if (app?.actor?.type === "character") injectCharacterSheetButton(app, html);
    if (app?.actor?.type === "party") injectPartySheetButton(app, html);
  });
  Hooks.on("renderPartySheetPF2e", injectPartySheetButton);
  Hooks.on("renderActorDirectory", injectActorDirectoryToolbar);
  Hooks.on("getActorContextOptions", injectActorDirectoryContext);
  Hooks.on("getActorDirectoryEntryContext", injectActorDirectoryContext);
}
