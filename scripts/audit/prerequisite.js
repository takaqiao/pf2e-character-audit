import { MODULE_ID, EVALUATION, SEVERITY } from "../constants.js";
import { buildBuildStateFromActor } from "../prereq/build-state.js";
import { parseAllPrerequisiteNodes } from "../prereq/parsers.js";
import { evaluateRequirementNode } from "../prereq/checker.js";
import { hasCJK, normalizeFeatPrerequisites, normalizeRequirement } from "../prereq/cn-normalizer.js";
import { isFeatInArchetypeAFList, ensureAFMap } from "./additional-feats.js";

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

// Additional Feats rule (Player Core p. 215, "Additional Feats" sidebar):
// some archetypes list feats from OTHER classes in their "Additional Feats"
// section. Example: Ulfen Guard lists Reactive Striker, Guardian's Deflection,
// Shield Warden. When taken via Ulfen Guard, the original Fighter-Dedication
// prereq is satisfied by Ulfen Guard Dedication instead (and the fighter class
// trait is dropped). The feat item in the compendium still carries its
// ORIGINAL prereq text ("Fighter Dedication"), so the parser can't tell the
// feat was taken via the alt path. We compensate by scanning each owned
// dedication's description for an "Additional Feats" section that mentions
// the current feat by name — if found, the prereq is satisfied via that
// archetype.
function splitBilingualName(rawName) {
  const name = String(rawName ?? "").trim();
  const m = name.match(/^([一-鿿][^A-Za-z]*?)\s+([A-Za-z][A-Za-z0-9'() :,\-]+)$/);
  if (m) return { cn: m[1].trim(), en: m[2].trim() };
  if (/[一-鿿]/.test(name)) return { cn: name, en: null };
  return { cn: null, en: name };
}

// Section header — must be a heading-ish line, not a passing mention.
const ADDITIONAL_FEATS_SECTION = /(?:<(?:h[1-6]|strong|b)[^>]*>\s*)?(?:additional\s+feats?|额外专长|额外的?专长|附加专长)/i;

// Extract the slice of `desc` that starts at the Additional Feats heading,
// so a feat name appearing in some earlier flavor paragraph doesn't trigger
// a false positive. We stop at the next heading-like break or end-of-string.
function extractAdditionalFeatsSection(desc) {
  const m = desc.match(ADDITIONAL_FEATS_SECTION);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = desc.slice(start);
  // Cut at the next likely heading boundary (another <h*>, <strong> heading-ish, or "Cross-Class"/"Class Feats" section).
  const nextHeading = rest.search(/<h[1-6][^>]*>|class\s+feats?|跨职业|职业专长/i);
  return nextHeading >= 0 ? rest.slice(0, nextHeading) : rest;
}

function isFeatGrantedAsAdditionalFeat(actor, currentFeat) {
  const parts = splitBilingualName(currentFeat.name);
  const en = parts.en ? parts.en.toLowerCase() : null;
  const cn = parts.cn;
  // Skip ultra-short names to avoid accidental substring hits ("Ki", "Bon").
  if ((!en || en.length < 4) && (!cn || cn.length < 2)) return null;

  for (const item of actor.items ?? []) {
    if (item === currentFeat || item.id === currentFeat.id) continue;
    const traits = item.system?.traits?.value ?? [];
    if (!traits.includes("dedication")) continue;

    const desc = item.system?.description?.value ?? "";
    if (!desc) continue;
    const section = extractAdditionalFeatsSection(desc);
    if (!section) continue;

    const sectionLower = section.toLowerCase();
    if (en && en.length >= 4 && sectionLower.includes(en)) return item.name;
    if (cn && cn.length >= 2 && section.includes(cn)) return item.name;
  }
  return null;
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

// In PF2e RAW there's a distinction between PREREQUISITE (mechanical: skill
// ranks, ability scores, specific feats — auditable) and ACCESS (story:
// "member of <Org>", "citizen of <Place>", "from <Region>", "your deity is
// X" — GM-discretion, not mechanically enforced). Translation packs and
// community content often lump them together into one prerequisite string,
// so we filter story-flavor clauses out before mechanical verification.
const STORY_CLAUSE_PATTERNS = [
  /(?:^|\b)member of\b/i,
  /(?:^|\b)from\s+[A-Z]/,                  // "from Taldor"
  /(?:^|\b)citizen of\b/i,
  /(?:^|\b)native of\b/i,
  /(?:^|\b)ties? to\b/i,
  /^.*成员\s*$/,                           // "X的成员" / "X's 成员"
  /^来自/,                                  // "来自 X"
  /公民\s*$/,
  /一员\s*$/,
  /父母.*至少有一/                         // "at least one of your parents is ..."
];

function isStoryClause(clauseText) {
  if (!clauseText) return false;
  return STORY_CLAUSE_PATTERNS.some((re) => re.test(clauseText));
}

const RANK_NAMES = { untrained: 0, trained: 1, expert: 2, master: 3, legendary: 4 };

// Class-HP-per-level restriction clause (e.g. Barbarian Resiliency from PC1:
// "a class that grants no more than 10 + CON HP per level"). Raw CN reads
// "每级生命值不超过10+体质调整值的职业"; normalized variants include "HP per
// level no more than 10", "class with 10 or less HP per level", etc.
// Returns:
//   { threshold: <int>, matched: true } when a threshold is parsed,
//   null when the clause doesn't look like an HP-restriction clause.
function parseClassHpRestrictionClause(clauseText) {
  if (!clauseText) return null;
  // Normalize full-width digits to ASCII so parseInt works uniformly.
  const text = clauseText.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));
  // CN raw form: "每级生命值不超过<N>"
  let m = text.match(/每级\s*(?:生命值|HP|Life值?)\s*(?:不超过|不多于|不大于|至多|最多)\s*(\d+)/);
  if (m) return { threshold: parseInt(m[1], 10) };
  // Reverse CN: "<N>...每级生命值"
  m = text.match(/(?:不超过|不多于|不大于|至多|最多)\s*(\d+)[^\d]{0,12}(?:每级)?\s*(?:生命值|HP|Life值?)\s*(?:每级)?/);
  if (m) return { threshold: parseInt(m[1], 10) };
  // Normalized hybrid (translator output): "每级Life值不超过10"
  m = text.match(/每级\s*\S{0,8}\s*不超过\s*(\d+)/);
  if (m && /(?:生命|HP|Life)/i.test(text)) return { threshold: parseInt(m[1], 10) };
  // English: "class with N or less HP per level", "N or fewer HP per level",
  // "no more than N HP per level".
  m = text.match(/\b(?:no\s+more\s+than|at\s+most|up\s+to)\s+(\d+)\s*\+?\s*(?:CON|Constitution)?[^.]{0,40}?\bHP\s+per\s+level/i);
  if (m) return { threshold: parseInt(m[1], 10) };
  m = text.match(/\b(\d+)\s+or\s+(?:less|fewer)\s+HP\s+per\s+level/i);
  if (m) return { threshold: parseInt(m[1], 10) };
  m = text.match(/\bbase\s+HP\s+(?:of\s+)?(?:no\s+more\s+than|at\s+most|<=|≤)\s*(\d+)/i);
  if (m) return { threshold: parseInt(m[1], 10) };
  // Normalizer-emitted form: "per level HP no more than <N>" (literal
  // CN → EN of "每级生命值不超过<N>"). The phrase order differs from
  // canonical English ("no more than N HP per level"), so it needs a
  // dedicated pattern.
  m = text.match(/\bper\s+level\s+HP\s+(?:no\s+more\s+than|at\s+most|up\s+to|<=|≤|is\s+(?:no\s+more\s+than|at\s+most))\s+(\d+)/i);
  if (m) return { threshold: parseInt(m[1], 10) };
  return null;
}

// Evaluate a class-HP-per-level restriction against the actor's class.
// Returns true/false when threshold parsed; null when threshold could not
// be parsed (defer to parser) OR actor has no class HP value.
// "每级生命值不超过10+体质调整值的职业" refers to the CLASS's defined
// base HP-per-level (Fighter=10, Wizard=6, etc.) — NOT the actor's total
// HP. Other sources (Toughness feat, ancestry HP, CON mod, etc.) add to
// effective HP but don't count for this prereq.
//
// PF2e v8 surfaces this through several paths; we try in order:
//   1. actor.system.attributes.classhp   (computed from class.hpPerLevel)
//   2. actor.class.hpPerLevel             (getter on the class item)
//   3. actor.class.system.hp              (raw class definition; may be a
//                                          number OR an object — handle both)
function getClassHpPerLevel(actor) {
  const fromAttrs = actor?.system?.attributes?.classhp;
  if (typeof fromAttrs === "number" && fromAttrs > 0) return fromAttrs;

  const fromGetter = actor?.class?.hpPerLevel;
  if (typeof fromGetter === "number" && fromGetter > 0) return fromGetter;

  const raw = actor?.class?.system?.hp;
  if (typeof raw === "number" && raw > 0) return raw;
  if (raw && typeof raw === "object") {
    const v = Number(raw.value ?? raw.base ?? raw.perLevel);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

function evalClassHpRestrictionClause(actor, clauseText) {
  const parsed = parseClassHpRestrictionClause(clauseText);
  if (!parsed) return null;
  const classHp = getClassHpPerLevel(actor);
  if (typeof classHp !== "number") return null;
  return classHp <= parsed.threshold;
}

// Evaluate a normalized skill clause like "trained in Athletics" /
// "expert in Athletics and Intimidation" against the actor's actual skill
// ranks. Returns true / false / null (null = unrecognized → defer to parser).
function evalSkillClause(actor, clause) {
  const m = clause.match(/\b(untrained|trained|expert|master|legendary)\s+in\s+(.+?)\s*$/i);
  if (!m) return null;
  const requiredRank = RANK_NAMES[m[1].toLowerCase()];
  if (requiredRank == null) return null;
  const skillsRaw = m[2].split(/\s+and\s+|\s*,\s*/i).map((s) => s.trim()).filter(Boolean);
  if (skillsRaw.length === 0) return null;
  let allMet = true;
  for (const sk of skillsRaw) {
    const slug = sk.toLowerCase();
    const skill = actor.skills?.[slug];
    const rank = typeof skill?.rank === "number"
      ? skill.rank
      : (typeof actor.system?.skills?.[slug]?.rank === "number"
          ? actor.system.skills[slug].rank
          : null);
    if (rank == null) return null;
    if (rank < requiredRank) allMet = false;
  }
  return allMet;
}

// Split a prereq into clauses, skip pure-story clauses (treated as GM-verified
// access per PF2e RAW), and verify each remaining mechanical clause
// independently. Returns true only when we actually filtered story content
// OR resolved a class-HP-restriction clause AND every mechanical clause is
// satisfied — never auto-passes pure-story prereqs (those still go through
// the parser, which will report unknown).
function tryStorySplitSatisfied(actor, normalizedText) {
  if (!normalizedText) return false;
  const clauses = normalizedText.split(/[,;，；]/).map((s) => s.trim()).filter(Boolean);
  if (clauses.length === 0) return false;
  let sawStory = false;
  let sawHpRestriction = false;
  let mechanicalCount = 0;
  for (const c of clauses) {
    if (isStoryClause(c)) { sawStory = true; continue; }
    // Class HP-per-level restriction (Barbarian Resiliency etc.): the parser
    // can't handle this clause shape, so verify directly against
    // actor.class.system.hp. Failure here aborts the bypass — we MUST NOT
    // silently pass a mechanical gate.
    const hpParsed = parseClassHpRestrictionClause(c);
    if (hpParsed) {
      const ok = evalClassHpRestrictionClause(actor, c);
      if (ok === null) return false;   // can't verify → defer to parser
      if (ok === false) return false;  // actor's class exceeds threshold
      sawHpRestriction = true;
      mechanicalCount++;
      continue;
    }
    if (/\b(untrained|trained|expert|master|legendary)\s+in/i.test(c)) {
      const r = evalSkillClause(actor, c);
      if (r !== true) return false;
      mechanicalCount++;
      continue;
    }
    if (clauseMatchesOwnedItem(actor, c)) { mechanicalCount++; continue; }
    return false;
  }
  return (sawStory || sawHpRestriction) && mechanicalCount > 0;
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

    // Story-clause + skill-clause split: prereqs like "<Org>'s 成员, trained
    // in Athletics and Intimidation" can't be verified by the parser as a
    // whole (the story half is opaque). Split and verify each individually.
    if (tryStorySplitSatisfied(actor, requirementNormalized)) {
      pass++;
      continue;
    }

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

    // Additional Feats check (PC p.215): a dedication-style prereq fail may
    // actually be legal if the feat sits on another archetype's "Additional
    // Feats" list. PRIMARY path uses the archetype-journal scan
    // (`isFeatInArchetypeAFList`) which matches by compendium sourceId UUID —
    // the authoritative reference. FALLBACK scans owned dedication
    // descriptions for the feat name, used when the journal map hasn't
    // finished building yet or the relevant journal pack isn't loaded.
    if (evaluation.met === false) {
      if (isFeatInArchetypeAFList(actor, feat)) {
        pass++;
        continue;
      }
      if (isFeatGrantedAsAdditionalFeat(actor, feat)) {
        pass++;
        continue;
      }
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
