import { MODULE_ID, MODULE_VERSION } from "./constants.js";
import { auditActor, auditParty } from "./audit/index.js";
import { auditNpcOrCompanion } from "./audit/npc-companion.js";
import { auditEquipmentProficiency } from "./audit/equipment-proficiency.js";
import { auditSpellDetail } from "./audit/spell-detail.js";
import { auditVoluntaryFlaws } from "./audit/voluntary-flaws.js";
import { auditClassFeatureDetail } from "./audit/class-feature-detail.js";
import { auditCustomRules } from "./audit/custom-rules.js";
import { getAonUrl, getAonLinkHtml } from "./utils/aon-links.js";
import { toMarkdown, toHtml, saveMarkdown, saveHtml } from "./ui/exporters-extras.js";
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
    auditNpcOrCompanion,
    auditAny(actor) {
      if (!actor) throw new Error("auditAny: actor is required");
      if (actor.type === "character" && !actor.flags?.pf2e?.companionType) return auditActor(actor);
      return auditNpcOrCompanion(actor);
    },
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
      partyExtras: auditPartyExtras,
      npcOrCompanion: auditNpcOrCompanion,
      equipmentProficiency: auditEquipmentProficiency,
      spellDetail: auditSpellDetail,
      voluntaryFlaws: auditVoluntaryFlaws,
      classFeatureDetail: auditClassFeatureDetail,
      customRules: auditCustomRules
    },
    aon: { getUrl: getAonUrl, getLinkHtml: getAonLinkHtml },
    diff: { computeSnapshotDiff, formatChatSummary },
    buildBuildStateFromActor,
    parsePrerequisites: (feat) => parseAllPrerequisiteNodes(feat),
    evaluatePrerequisite: evaluateRequirementNode,
    detectVariants,
    debugBabele,
    exporters: { toChat, toJournal, toJson, toJsonVerbose, toMarkdown, toHtml, saveMarkdown, saveHtml }
  };
}
