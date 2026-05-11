import { MODULE_ID, MODULE_VERSION } from "./constants.js";
import { auditActor, auditParty } from "./audit/index.js";
import { auditPublication } from "./audit/publication.js";
import { auditCompleteness } from "./audit/completeness.js";
import { auditPrerequisites } from "./audit/prerequisite.js";
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
      completeness: auditCompleteness
    },
    buildBuildStateFromActor,
    parsePrerequisites: (feat) => parseAllPrerequisiteNodes(feat),
    evaluatePrerequisite: evaluateRequirementNode,
    detectVariants,
    debugBabele,
    exporters: { toChat, toJournal, toJson, toJsonVerbose }
  };
}
