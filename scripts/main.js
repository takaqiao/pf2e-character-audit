import { MODULE_ID, MODULE_VERSION } from "./constants.js";
import { registerSettings } from "./settings.js";
import { registerHooks } from "./ui/injectors.js";
import { createApi } from "./api.js";

Hooks.once("init", () => {
  registerSettings();
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = createApi();
  registerHooks();
  loadTemplates([
    `modules/${MODULE_ID}/templates/audit-report.hbs`,
    `modules/${MODULE_ID}/templates/party-audit.hbs`,
    `modules/${MODULE_ID}/templates/partials/overview-card.hbs`,
    `modules/${MODULE_ID}/templates/partials/publication-table.hbs`,
    `modules/${MODULE_ID}/templates/partials/completeness-list.hbs`,
    `modules/${MODULE_ID}/templates/partials/prereq-list.hbs`
  ]).catch((err) => console.warn(`[${MODULE_ID}] template preload failed`, err));
});

Hooks.once("ready", () => {
  const api = game.modules.get(MODULE_ID)?.api;
  if (api) {
    globalThis.PF2eCharacterAudit = api;
    console.info(`[${MODULE_ID}] v${MODULE_VERSION} ready — globalThis.PF2eCharacterAudit available`);
  }
});
