import { MODULE_ID, EVALUATION, SEVERITY } from "../constants.js";
import { buildBuildStateFromActor } from "../prereq/build-state.js";
import { parseAllPrerequisiteNodes } from "../prereq/parsers.js";
import { evaluateRequirementNode } from "../prereq/checker.js";

function unknownSeverity() {
  try {
    return game.settings.get(MODULE_ID, "prereqUnknownSeverity") ?? "warn";
  } catch {
    return "warn";
  }
}

function severityForEvaluation(ev) {
  if (ev === EVALUATION.FAIL) return SEVERITY.ERROR;
  if (ev === EVALUATION.UNKNOWN) {
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
    const prereqEntries = feat.system?.prerequisites?.value ?? [];
    const requirementText = prereqEntries.map((p) => p?.value ?? "").filter(Boolean).join("; ");
    if (!requirementText) {
      pass++;
      continue;
    }

    let parsed = [];
    try {
      parsed = parseAllPrerequisiteNodes(feat) ?? [];
    } catch (err) {
      console.warn("[pf2e-character-audit] prereq parse failed for", feat.name, err);
      unknown++;
      issues.push({
        featId: feat.id,
        featSlug: feat.slug ?? null,
        featName: feat.name,
        featLevel: feat.system?.level?.value ?? 1,
        featSource: feat.system?.featType ?? feat.system?.category ?? null,
        requirement: requirementText,
        evaluation: EVALUATION.UNKNOWN,
        severity: severityForEvaluation(EVALUATION.UNKNOWN),
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
      : { kind: "all", text: requirementText, children: parsed };

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
        requirement: requirementText,
        evaluation: EVALUATION.UNKNOWN,
        severity: severityForEvaluation(EVALUATION.UNKNOWN),
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
      requirement: requirementText,
      evaluation: ev,
      severity: severityForEvaluation(ev),
      reasons: ev === EVALUATION.FAIL ? collectFailReasons(evaluation.tree) : [],
      tree: evaluation.tree
    });
  }

  return {
    issues,
    summary: { total: pass + fail + unknown, pass, fail, unknown }
  };
}
