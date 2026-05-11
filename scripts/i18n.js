import { MODULE_ID } from "./constants.js";

const PREFIX = "PF2E-CA";

// Hardcoded English fallbacks — used when game.i18n hasn't loaded our lang
// JSON (typically because the user updated the module mid-world without
// restarting). Without this, players see raw keys like "PF2E-CA.Label.Errors".
const FALLBACKS = {
  "Label.Errors": "errors",
  "Label.Warnings": "warnings",
  "Label.Infos": "info",
  "Label.Pass": "pass",
  "Label.Fail": "fail",
  "Label.Unknown": "unknown",
  "Label.NoIssues": "No issues",
  "Label.PartyMembers": "Party Members",
  "Label.History": "Trend",
  "Label.SuppressedNote": "Suppressed rules",
  "Filter.Show": "Show",
  "Filter.All": "All",
  "Filter.Errors": "Errors",
  "Filter.Warnings": "Warnings",
  "Filter.Infos": "Info",
  "Action.Rerun": "Re-run",
  "Action.SendChat": "Whisper",
  "Action.ExportJournal": "Journal",
  "Action.CopyJson": "JSON",
  "Action.QuickFix": "Fix",
  "Action.Suppress": "Ignore rule",
  "Action.SuppressFeat": "Ignore this feat",
  "Action.UnsuppressAll": "Clear ignore list",
  "Tab.Overview": "Overview",
  "Tab.Publication": "Publication",
  "Tab.Completeness": "Completeness",
  "Tab.Prereq": "Prerequisites",
  "Tab.CrossParty": "Cross-Party",
  "Time.JustNow": "just now",
  "Time.MinutesAgo": "{n} min ago",
  "Time.HoursAgo": "{n} h ago",
  "Time.DaysAgo": "{n} d ago",
  "Delta.LastAudit": "Last audit",
  "Delta.NoChange": "no change",
  "Field.Title": "Title",
  "Field.License": "License",
  "Field.Count": "Count",
  "Field.Actors": "Actors",
  "Field.Requirement": "Requirement",
  "Overview.Titles": "titles",
  "Overview.Items": "items",
  "Overview.Unknown": "unknown",
  // App titles
  "App.Title.Single": "PF2e Character Audit",
  "App.Title.Party": "PF2e Party Audit",
  // Notices
  "Notice.NotCharacter": "PF2e Character Audit only supports actors of type \"character\".",
  // 0.1.24+ settings (Name + Hint) — fallbacks so a stale i18n cache still
  // shows readable labels instead of raw keys after a mid-world update.
  "Settings.enableSpellAudit.Name": "Enable spell-detail audit",
  "Settings.enableSpellAudit.Hint": "Check spell-slot counts, cantrip count, focus pool, and per-spell tradition mismatches.",
  "Settings.enableEquipmentAudit.Name": "Enable equipment audit",
  "Settings.enableEquipmentAudit.Hint": "Audit runes, investiture, item-level vs character, and treasure-by-level.",
  "Settings.autoAuditOnLevelUp.Name": "Auto-audit on level-up",
  "Settings.autoAuditOnLevelUp.Hint": "When a character's level changes, automatically run the audit and whisper a summary to the GM.",
  "Settings.watchModeActive.Name": "Watch mode (live audit)",
  "Settings.watchModeActive.Hint": "Re-run audit automatically whenever actor or owned-item data changes.",
  "Settings.customAuditRules.Name": "Custom audit rules (JSON)",
  "Settings.customAuditRules.Hint": "Array of { code, severity, title, hint, when:{predicates} }. See module docs.",
  // Auto-audit chat summary
  "AutoAudit.ChatTitle": "<strong>{actorName}</strong> reached level {level} — audit results",
  "AutoAudit.Summary.Title": "Audit after level-up",
  "AutoAudit.Summary.Errors": "errors",
  "AutoAudit.Summary.Warnings": "warnings",
  "AutoAudit.Summary.Infos": "infos",
  "AutoAudit.Summary.PrereqFails": "prereq failures",
  "AutoAudit.Summary.PrereqUnknowns": "prereq unknowns",
  "AutoAudit.OpenFullReport": "View full audit",
  // Sheet badge
  "SheetBadge.Tooltip": "{errors} errors, {warnings} warnings — click for details",
  "SheetBadge.NoSnapshot": "Click to audit",
  "SheetBadge.Clean": "No issues",
  // Custom rules
  "CustomRules.ParseError": "Custom audit rules: invalid JSON, ignoring."
};

export function key(suffix) {
  return `${PREFIX}.${suffix}`;
}

function localizeOrFallback(suffix) {
  const fullKey = key(suffix);
  const result = game.i18n?.localize?.(fullKey);
  if (result && result !== fullKey) return result;
  return FALLBACKS[suffix] ?? fullKey;
}

export function t(suffix) {
  return localizeOrFallback(suffix);
}

export function format(suffix, data = {}) {
  const fullKey = key(suffix);
  const tpl = game?.i18n?.localize?.(fullKey);
  if (tpl && tpl !== fullKey && typeof game?.i18n?.format === "function") {
    return game.i18n.format(fullKey, data);
  }
  // Fallback path: do simple {placeholder} substitution against our default
  // (or the localized template, if we have one but no game.i18n.format).
  let s = (tpl && tpl !== fullKey ? tpl : null) ?? FALLBACKS[suffix] ?? fullKey;
  for (const [k, v] of Object.entries(data ?? {})) {
    s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

export function setting(name) {
  return game.settings.get(MODULE_ID, name);
}

// Inject our default English values into game.i18n.translations for any key
// the lang JSON didn't supply. Defends against mid-world module updates where
// Foundry's i18n cache is stale until the world is restarted.
export function injectFallbacks() {
  if (!game?.i18n?.translations) return;
  for (const [suffix, value] of Object.entries(FALLBACKS)) {
    const fullKey = key(suffix);
    const cur = game.i18n.localize(fullKey);
    if (cur === fullKey) {
      const parts = fullKey.split(".");
      let target = game.i18n.translations;
      for (let i = 0; i < parts.length - 1; i++) {
        if (typeof target[parts[i]] !== "object" || target[parts[i]] === null) {
          target[parts[i]] = {};
        }
        target = target[parts[i]];
      }
      target[parts[parts.length - 1]] = value;
    }
  }
}
