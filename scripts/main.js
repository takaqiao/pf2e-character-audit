import { MODULE_ID, MODULE_VERSION } from "./constants.js";
import { registerSettings } from "./settings.js";
import { registerHooks } from "./ui/injectors.js";
import { createApi } from "./api.js";
import { injectFallbacks } from "./i18n.js";
import { ensureAFMap } from "./audit/additional-feats.js";
import { registerLevelUpHook } from "./ui/watch.js";
import { registerSheetBadgeHook } from "./ui/sheet-badge.js";
import { registerWatchModeHook } from "./ui/watch-mode.js";
import { getAonLinkHtml } from "./utils/aon-links.js";

Hooks.once("i18nInit", () => {
  // Inject hardcoded English fallbacks for any translation key that didn't
  // make it into game.i18n.translations (e.g. lang file added in a newer
  // version that loaded into a stale cache).
  injectFallbacks();
});

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
  // Async scan of every JournalEntry pack for "Additional Feats" / "补充专长"
  // sections. The resulting UUID map lets the prereq audit recognise feats
  // taken via another archetype's Additional Feats list (PC p.215).
  ensureAFMap();
  registerLevelUpHook();
  registerSheetBadgeHook();
  registerWatchModeHook();
  if (typeof Handlebars !== "undefined") {
    Handlebars.registerHelper("aon", (code) => new Handlebars.SafeString(getAonLinkHtml(code)));
  }
  // When the Additional Feats journal scan finishes after a world reload, any
  // already-open AuditReportApp likely ran with an empty map (false fails on
  // Reactive Striker etc.). Auto-rerender so the user doesn't have to click
  // Re-audit manually.
  Hooks.on("pf2e-character-audit.afMapReady", () => {
    try {
      const instances = foundry.applications?.instances ?? new Map();
      for (const app of instances.values()) {
        if (app?.constructor?.name === "AuditReportApp" && app.rendered) {
          app._report = null;
          app.render(false);
        }
      }
    } catch (err) {
      console.warn(`[${MODULE_ID}] afMapReady rerender failed:`, err);
    }
  });
});
