import { MODULE_ID, EVALUATION, SEVERITY } from "../constants.js";
import { buildBuildStateFromActor } from "../prereq/build-state.js";
import { parseAllPrerequisiteNodes } from "../prereq/parsers.js";
import { evaluateRequirementNode } from "../prereq/checker.js";
import { hasCJK, normalizeFeatPrerequisites, normalizeRequirement } from "../prereq/cn-normalizer.js";

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
    // Feats auto-granted by a class feature (e.g. Warpriest doctrine grants
    // Deadly Simplicity + Shield Block) carry `flags.pf2e.grantedBy`. The
    // system already vetted them — re-checking prereqs against the actor
    // produces false-positive errors. Trust the grant.
    if (feat.flags?.pf2e?.grantedBy) {
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

    const ev = evaluation.met === false ? EVALUATION.FAIL : EVALUATION.UNKNOWN;
    if (ev === EVALUATION.FAIL) fail++;
    else unknown++;

    issues.push({
      featId: feat.id,
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
