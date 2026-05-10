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

function rootEl(html, app) {
  if (html instanceof HTMLElement) return html;
  if (html && typeof html === "object" && typeof html.length === "number" && html[0] instanceof HTMLElement) return html[0];
  return app?.element ?? null;
}

function makeHeaderControl({ icon, label, action, onClick }) {
  const a = document.createElement("a");
  a.className = "header-control";
  a.dataset.action = action;
  a.dataset.tooltip = label;
  a.setAttribute("aria-label", label);
  a.setAttribute("role", "button");
  a.innerHTML = `<i class="fas ${icon}"></i>`;
  a.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick?.();
  });
  return a;
}

function placeInHeader(root, anchor) {
  if (!root) return;
  const header = root.querySelector(".window-header");
  if (!header) return;
  const closeBtn = header.querySelector('[data-action="close"], a.close, button.close, .header-button.close');
  if (closeBtn) closeBtn.before(anchor);
  else header.appendChild(anchor);
}

function injectCharacterSheetButton(app, html) {
  if (!app?.actor || app.actor.type !== "character") return;
  if (!isAuditAllowed()) return;
  if (!showButtonOnSheet()) return;
  const root = rootEl(html, app);
  if (!root) return;
  if (root.querySelector('.pf2e-character-audit-btn')) return;
  const a = makeHeaderControl({
    icon: "fa-clipboard-check",
    label: t("Action.AuditSheet"),
    action: "pf2e-character-audit",
    onClick: () => openAuditApp(app.actor)
  });
  a.classList.add("pf2e-character-audit-btn");
  placeInHeader(root, a);
}

function injectPartySheetButton(app, html) {
  if (!isAuditAllowed()) return;
  const root = rootEl(html, app);
  if (!root) return;
  if (root.querySelector('.pf2e-character-audit-party-btn')) return;
  const a = makeHeaderControl({
    icon: "fa-users-rectangle",
    label: t("Action.AuditParty"),
    action: "pf2e-character-audit-party",
    onClick: () => openPartyApp()
  });
  a.classList.add("pf2e-character-audit-party-btn");
  placeInHeader(root, a);
}

function injectActorDirectoryToolbar(app, html) {
  if (!game.user.isGM) return;
  const root = rootEl(html, app);
  if (!root) return;
  if (root.querySelector('.pf2e-character-audit-directory-btn')) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pf2e-character-audit-directory-btn";
  btn.innerHTML = `<i class="fas fa-clipboard-check"></i> ${t("Action.AuditParty")}`;
  btn.addEventListener("click", () => openPartyApp());
  const target =
    root.querySelector(".directory-header .header-actions") ??
    root.querySelector(".directory-header") ??
    root.querySelector(".header-actions");
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
