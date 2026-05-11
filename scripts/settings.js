import { MODULE_ID } from "./constants.js";
import { key } from "./i18n.js";

export function registerSettings() {
  const reg = (name, opts) =>
    game.settings.register(MODULE_ID, name, {
      name: key(`Settings.${name}.Name`),
      hint: key(`Settings.${name}.Hint`),
      ...opts
    });

  reg("enablePublicationAudit", { scope: "world", config: true, type: Boolean, default: true });
  reg("enablePrerequisiteAudit", { scope: "world", config: true, type: Boolean, default: true });
  reg("enableCompletenessAudit", { scope: "world", config: true, type: Boolean, default: true });

  reg("prereqUnknownSeverity", {
    scope: "world",
    config: true,
    type: String,
    choices: {
      info: key("Settings.prereqUnknownSeverity.Choice.info"),
      warn: key("Settings.prereqUnknownSeverity.Choice.warn"),
      error: key("Settings.prereqUnknownSeverity.Choice.error")
    },
    default: "warn"
  });

  reg("publicationWhitelist", {
    scope: "world",
    config: true,
    type: String,
    default: "[]"
  });

  reg("publicationLicenseFilter", {
    scope: "world",
    config: true,
    type: String,
    choices: {
      all: key("Settings.publicationLicenseFilter.Choice.all"),
      "orc-only": key("Settings.publicationLicenseFilter.Choice.orc-only"),
      "ogl-only": key("Settings.publicationLicenseFilter.Choice.ogl-only")
    },
    default: "all"
  });

  reg("treatLegacySourceAs", {
    scope: "world",
    config: true,
    type: String,
    choices: {
      info: key("Settings.treatLegacySourceAs.Choice.info"),
      warn: key("Settings.treatLegacySourceAs.Choice.warn"),
      none: key("Settings.treatLegacySourceAs.Choice.none")
    },
    default: "info"
  });

  reg("respectFreeArchetype", {
    scope: "world",
    config: true,
    type: String,
    choices: {
      auto: key("Settings.respectFreeArchetype.Choice.auto"),
      on: key("Settings.respectFreeArchetype.Choice.on"),
      off: key("Settings.respectFreeArchetype.Choice.off")
    },
    default: "auto"
  });

  reg("respectABP", {
    scope: "world",
    config: true,
    type: String,
    choices: {
      auto: key("Settings.respectABP.Choice.auto"),
      on: key("Settings.respectABP.Choice.on"),
      off: key("Settings.respectABP.Choice.off")
    },
    default: "auto"
  });

  reg("enableDualClassDeepCheck", { scope: "world", config: true, type: Boolean, default: false });
  reg("showDeadActors", { scope: "world", config: true, type: Boolean, default: false });
  reg("auditButtonOnSheet", { scope: "client", config: true, type: Boolean, default: true });
  reg("allowPlayerAudit", { scope: "world", config: true, type: Boolean, default: false });
  reg("enableEquipmentAudit", { scope: "world", config: true, type: Boolean, default: true });
  reg("enableSpellAudit", { scope: "world", config: true, type: Boolean, default: true });
  reg("autoAuditOnLevelUp", { scope: "world", config: true, type: Boolean, default: true });
  reg("watchModeActive", { scope: "world", config: true, type: Boolean, default: false });
  reg("customAuditRules", { scope: "world", config: true, type: String, default: "[]" });
}

export function getWhitelistTitles() {
  try {
    const raw = game.settings.get(MODULE_ID, "publicationWhitelist");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
