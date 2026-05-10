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
