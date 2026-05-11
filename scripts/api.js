import { MODULE_ID, MODULE_VERSION } from "./constants.js";
import { auditActor, auditParty } from "./audit/index.js";
import { auditPublication } from "./audit/publication.js";
import { auditCompleteness } from "./audit/completeness.js";
import { auditPrerequisites } from "./audit/prerequisite.js";
import { auditProficiencyProgression } from "./audit/proficiency-progression.js";
import { auditEquipment } from "./audit/equipment-audit.js";
import {
  auditClericDomains,
  auditPartySkillCoverage,
  auditPartyLanguageCoverage,
  auditPartySaves,
  auditPartyExtras
} from "./audit/cross-party-extras.js";
import { computeSnapshotDiff, formatChatSummary } from "./ui/watch.js";
import { buildBuildStateFromActor } from "./prereq/build-state.js";
import { parseAllPrerequisiteNodes } from "./prereq/parsers.js";
import { evaluateRequirementNode } from "./prereq/checker.js";
import { detectVariants } from "./utils/pf2e-api.js";
import { debugBabele } from "./utils/babele-bridge.js";
import { openAuditApp, openPartyApp } from "./ui/injectors.js";
import { toChat, toJournal, toJson, toJsonVerbose } from "./ui/exporters.js";

export function createApi() {
  return {
    moduleId: MODULE_ID,
    version: MODULE_VERSION,
    auditActor,
    auditParty,
    openAuditApp,
    openPartyApp,
    audit: {
      publication: auditPublication,
      prerequisite: auditPrerequisites,
      completeness: auditCompleteness,
      proficiencyProgression: auditProficiencyProgression,
      equipment: auditEquipment,
      clericDomains: auditClericDomains,
      partySkillCoverage: auditPartySkillCoverage,
      partyLanguageCoverage: auditPartyLanguageCoverage,
      partySaves: auditPartySaves,
      partyExtras: auditPartyExtras
    },
    diff: { computeSnapshotDiff, formatChatSummary },
    buildBuildStateFromActor,
    parsePrerequisites: (feat) => parseAllPrerequisiteNodes(feat),
    evaluatePrerequisite: evaluateRequirementNode,
    detectVariants,
    debugBabele,
    exporters: { toChat, toJournal, toJson, toJsonVerbose }
  };
}
