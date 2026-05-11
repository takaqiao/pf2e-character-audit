import { MODULE_ID, EVALUATION, SEVERITY } from "../constants.js";
import { buildBuildStateFromActor } from "../prereq/build-state.js";
import { parseAllPrerequisiteNodes } from "../prereq/parsers.js";
import { evaluateRequirementNode } from "../prereq/checker.js";
import { hasCJK, normalizeFeatPrerequisites, normalizeRequirement } from "../prereq/cn-normalizer.js";

// A feat is "auto-granted" by another item (class feature, heritage, etc.) and
// shouldn't have its prereq re-checked when:
//   (1) it carries `flags.pf2e.grantedBy.id`, OR
//   (2) any other item on the actor lists it in `flags.pf2e.itemGrants`.
// PF2e v8 normally sets (1), but older imports or manually-copied feats may
// only show (2). Either is enough proof the system already vetted it.
function isAutoGranted(actor, feat) {
  const direct = feat.flags?.pf2e?.grantedBy;
  if (direct && (direct.id || typeof direct === "string" || direct === true)) return true;
  for (const other of actor.items ?? []) {
    if (other === feat || other.id === feat.id) continue;
    const grants = other.flags?.pf2e?.itemGrants;
    if (!grants) continue;
    const list = Array.isArray(grants) ? grants : Object.values(grants);
    for (const g of list) {
      if (g?.id === feat.id) return true;
    }
  }
  return false;
}

// Prereqs that involve "your deity's favored weapon" / "神祇的偏好武器" / etc.
// can't be verified without per-deity weapon-category data. When the parser
// reports a fail on such a feat, downgrade to "unknown" so the GM gets an info
// note instead of a hard error.
function isDeityWeaponPrereq(text) {
  if (!text) return false;
  return /deity['’\s]*s?\s*favored\s*weapon|deity['’\s]*s?\s*preferred\s*weapon|神祇.*偏好武器|神祇.*喜爱武器/.test(text);
}

// Quick path: many "feat name" / "class feature name" / "choice annotation"
// prereqs (especially Chinese ones the parser can't easily decode) are just
// the name of something the actor already owns. If the full prereq text — or
// each comma-separated sub-clause — appears as a substring in any owned item's
// name, accept it without going through the leveler parser.
//
// We deliberately bail out on prereq clauses that look like skill / ability /
// rank checks (those need real evaluation against build state).
const SKILL_PREREQ_HINT = /熟练度|trained|expert|master|legendary|untrained|受训|专家|大师|传奇|未受训|spell\s*slot|focus\s*pool|聚能/i;
const ABILITY_PREREQ_HINT = /\b(strength|dexterity|constitution|intelligence|wisdom|charisma)\s*\d+|力量\s*\d+|敏捷\s*\d+|体质\s*\d+|智力\s*\d+|感知\s*\d+|魅力\s*\d+/i;

function clauseMatchesOwnedItem(actor, clause) {
  const text = clause.trim();
  if (text.length < 2) return false;
  if (SKILL_PREREQ_HINT.test(text)) return false;
  if (ABILITY_PREREQ_HINT.test(text)) return false;
  const lowered = text.toLowerCase();
  for (const item of actor.items ?? []) {
    const name = (item.name ?? "").toLowerCase();
    if (name.includes(lowered)) return true;
  }
  return false;
}

function checkPrereqAgainstOwnedItems(actor, fullText) {
  if (!fullText) return null;
  // Split on Chinese / English comma & semicolon. PF2e prereqs use them
  // interchangeably; multi-clause prereqs ALL have to be satisfied.
  const clauses = fullText.split(/[,;，；]/).map((s) => s.trim()).filter(Boolean);
  if (clauses.length === 0) return null;

  let matchedAll = true;
  let matchedAny = false;
  let hasSkillClause = false;
  for (const c of clauses) {
    const hasSkill = SKILL_PREREQ_HINT.test(c) || ABILITY_PREREQ_HINT.test(c);
    if (hasSkill) { hasSkillClause = true; continue; }
    if (clauseMatchesOwnedItem(actor, c)) {
      matchedAny = true;
    } else {
      matchedAll = false;
    }
  }
  // If every non-skill clause matched an owned item AND there are no skill
  // clauses, we consider the prereq satisfied. (Skill clauses still need the
  // parser — we don't bypass them here.)
  if (matchedAll && matchedAny && !hasSkillClause) return true;
  return null; // fall through to parser
}

function unknownSeverity() {
  try {
    return game.settings.get(MODULE_ID, "prereqUnknownSeverity") ?? "warn";
  } catch {
    return "warn";
  }
}

function severityForEvaluation(ev, originalRequirement = "") {
  if (ev === EVALUATION.FAIL) return SEVERITY.ERROR;
  if (ev === EVALUATION.UNKNOWN) {
    // pf2e-leveler's prereq parser only understands English/French.
    // If the requirement text is non-Latin (e.g. zh-CN PF2E translation packs),
    // demote unknown to info so the report isn't a sea of yellow warnings.
    if (hasCJK(originalRequirement)) return SEVERITY.INFO;
    const s = unknownSeverity();
    if (s === "error") return SEVERITY.ERROR;
    if (s === "info") return SEVERITY.INFO;
    return SEVERITY.WARN;
  }
  return SEVERITY.INFO;
}

function collectFailReasons(tree) {
  const out = [];
  function walk(node) {
    if (!node) return;
    if (node.kind === "leaf") {
      if (node.met === false) out.push(node.text || node.result?.text || "");
      return;
    }
    if (node.kind === "all" || node.kind === "any") {
      for (const c of node.children ?? []) walk(c);
    } else if (node.kind === "not") {
      walk(node.child);
    }
  }
  walk(tree);
  return out.filter(Boolean);
}

export function auditPrerequisites(actor) {
  const buildState = buildBuildStateFromActor(actor);
  const issues = [];
  let pass = 0;
  let fail = 0;
  let unknown = 0;

  for (const feat of actor.itemTypes.feat) {
    if (isAutoGranted(actor, feat)) {
      pass++;
      continue;
    }

    const prereqEntries = feat.system?.prerequisites?.value ?? [];
    const requirementText = prereqEntries.map((p) => p?.value ?? "").filter(Boolean).join("; ");
    if (!requirementText) {
      pass++;
      continue;
    }

    // Quick path: if every non-skill prereq clause matches an item the actor
    // already owns by name (substring), accept without parser.
    if (checkPrereqAgainstOwnedItems(actor, requirementText) === true) {
      pass++;
      continue;
    }

    // CN preprocessing: if the requirement contains CJK, build a normalized
    // copy of the feat with English-translated prereqs and feed THAT to the
    // parser. Original text is kept for display.
    const featForParse = hasCJK(requirementText) ? normalizeFeatPrerequisites(feat) : feat;
    const requirementForDisplay = requirementText;
    const requirementNormalized = hasCJK(requirementText)
      ? normalizeRequirement(requirementText)
      : requirementText;

    let parsed = [];
    try {
      parsed = parseAllPrerequisiteNodes(featForParse) ?? [];
    } catch (err) {
      console.warn("[pf2e-character-audit] prereq parse failed for", feat.name, err);
      unknown++;
      issues.push({
        featId: feat.id,
        featSlug: feat.slug ?? null,
        featName: feat.name,
        featLevel: feat.system?.level?.value ?? 1,
        featSource: feat.system?.featType ?? feat.system?.category ?? null,
        requirement: requirementForDisplay,
        normalizedRequirement: requirementNormalized,
        evaluation: EVALUATION.UNKNOWN,
        severity: severityForEvaluation(EVALUATION.UNKNOWN, requirementText),
        reasons: ["parse error"],
        tree: null
      });
      continue;
    }

    if (!parsed.length) {
      pass++;
      continue;
    }

    const root = parsed.length === 1
      ? parsed[0]
      : { kind: "all", text: requirementNormalized, children: parsed };

    let evaluation;
    try {
      evaluation = evaluateRequirementNode(root, buildState);
    } catch (err) {
      console.warn("[pf2e-character-audit] prereq evaluate failed for", feat.name, err);
      unknown++;
      issues.push({
        featId: feat.id,
        featSlug: feat.slug ?? null,
        featName: feat.name,
        featLevel: feat.system?.level?.value ?? 1,
        featSource: feat.system?.featType ?? feat.system?.category ?? null,
        requirement: requirementForDisplay,
        normalizedRequirement: requirementNormalized,
        evaluation: EVALUATION.UNKNOWN,
        severity: severityForEvaluation(EVALUATION.UNKNOWN, requirementText),
        reasons: ["evaluate error"],
        tree: null
      });
      continue;
    }

    if (evaluation.met === true) {
      pass++;
      continue;
    }

    let ev = evaluation.met === false ? EVALUATION.FAIL : EVALUATION.UNKNOWN;
    // Demote deity-favored-weapon fails to unknown: too context-specific for
    // the generic matcher to verify, almost always false-positive.
    if (ev === EVALUATION.FAIL && isDeityWeaponPrereq(requirementText)) {
      ev = EVALUATION.UNKNOWN;
    }
    if (ev === EVALUATION.FAIL) fail++;
    else unknown++;

    issues.push({
      featId: feat.id,
      featUuid: feat.uuid,
      featSlug: feat.slug ?? null,
      featName: feat.name,
      featLevel: feat.system?.level?.value ?? 1,
      featSource: feat.system?.featType ?? feat.system?.category ?? null,
      requirement: requirementForDisplay,
      normalizedRequirement: requirementNormalized,
      evaluation: ev,
      severity: severityForEvaluation(ev, requirementText),
      reasons: ev === EVALUATION.FAIL ? collectFailReasons(evaluation.tree) : [],
      tree: evaluation.tree
    });
  }

  return {
    issues,
    summary: { total: pass + fail + unknown, pass, fail, unknown }
  };
}
