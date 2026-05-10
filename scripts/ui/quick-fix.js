// Quick-fix handlers per issue code. Each handler is a function (actor) that
// triggers the most useful next action (open the right compendium, focus the
// actor sheet on a section, level the actor up, etc.).
//
// Returns true if a handler ran. The UI shows a "Fix" button on issues whose
// code is in this map.

function openPack(packKey) {
  return () => {
    const pack = game.packs?.get?.(packKey);
    if (!pack) {
      ui.notifications?.warn(`Compendium not found: ${packKey}`);
      return false;
    }
    pack.render(true);
    return true;
  };
}

function openActorSheet() {
  return (actor) => {
    actor?.sheet?.render(true);
    return true;
  };
}

function openClassSheet() {
  return (actor) => {
    const cls = actor?.class;
    if (!cls) {
      actor?.sheet?.render(true);
      return true;
    }
    cls.sheet?.render(true);
    return true;
  };
}

function bumpLevel() {
  return async (actor) => {
    const lvl = actor?.system?.details?.level?.value ?? 1;
    if (lvl >= 20) return false;
    // Defer to leveler if installed (gives the GM the proper level-up wizard).
    const leveler = game.modules?.get?.("pf2e-leveler");
    if (leveler?.active && leveler.api?.openLevelPlanner) {
      try { leveler.api.openLevelPlanner(actor); return true; } catch {}
    }
    await actor.update({ "system.details.level.value": lvl + 1 });
    ui.notifications?.info(`Level bumped to ${lvl + 1}`);
    return true;
  };
}

const HANDLERS = {
  MISSING_ANCESTRY: openPack("pf2e.ancestries"),
  MISSING_HERITAGE: openPack("pf2e.heritages"),
  MISSING_BACKGROUND: openPack("pf2e.backgrounds"),
  MISSING_CLASS: openPack("pf2e.classes"),
  CLASS_SUBCLASS_MISSING: openPack("pf2e.classes"),
  MISSING_KEY_ABILITY: openClassSheet(),
  LANGUAGE_OVER_LIMIT: openActorSheet(),
  LANGUAGE_UNDER_LIMIT: openActorSheet(),
  BACKGROUND_SKILL_NOT_TRAINED: openActorSheet(),
  STARTING_EQUIPMENT_EMPTY: openPack("pf2e.equipment-srd"),
  STARTING_WEALTH_EXCEEDED: openActorSheet(),
  HP_UNDER_EXPECTED: openActorSheet(),
  LEVEL_UP_PENDING: bumpLevel(),
  SPELL_LIST_INCOMPLETE: openActorSheet(),
  SPELL_PREPARATION_INCOMPLETE: openActorSheet(),
  APEX_MISSING_AT_17: openPack("pf2e.equipment-srd"),
  CLASS_FEATURES_MISSING: openClassSheet(),
  CLASS_FEATURES_MISSING_SPECIFIC: openClassSheet()
};

export function hasQuickFix(code) {
  return code in HANDLERS;
}

export async function runQuickFix(code, actor) {
  const handler = HANDLERS[code];
  if (!handler) return false;
  try {
    return await handler(actor);
  } catch (err) {
    console.warn("[pf2e-character-audit] quick-fix failed for", code, err);
    return false;
  }
}
