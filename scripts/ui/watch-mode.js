import { MODULE_ID } from "../constants.js";

/**
 * Watch mode — auto re-run audit on broad actor/item changes.
 *
 * Distinct from scripts/ui/watch.js, which handles level-up only. Watch mode
 * is intended for character-creation / heavy-editing sessions: any change to
 * a character actor or its owned items debounces an audit re-run.
 *
 * Behaviour:
 *   - Gated on world setting `watchModeActive` and on `game.user.isGM`
 *     (only the GM client runs the auto-audit to avoid duplication).
 *   - Per-actor 800ms debounce; new events reset the timer.
 *   - Burst protection: > 20 events in 5s per actor pauses re-runs until the
 *     burst window expires (typical cause: bulk drag-drop of items).
 *   - If the audit app for that actor is currently open, its rendered view
 *     is refreshed. Otherwise, `auditActor()` is called silently — that
 *     function already appends to the actor's `history` flag.
 *   - Level-changes are skipped (handled by watch.js).
 */

const DEBOUNCE_MS = 800;
const BURST_WINDOW_MS = 5000;
const BURST_LIMIT = 20;

const debounceTimers = new Map(); // actorId -> timeoutId
const burstTracker = new Map();   // actorId -> { count, windowStart }
let registered = false;

function logWarn(label, err) {
  try { console.warn(`[${MODULE_ID}] watch-mode: ${label}`, err); } catch { /* noop */ }
}

export function isWatchModeActive() {
  try {
    return !!game.settings.get(MODULE_ID, "watchModeActive");
  } catch {
    return false;
  }
}

export async function setWatchModeActive(value) {
  const v = !!value;
  try {
    await game.settings.set(MODULE_ID, "watchModeActive", v);
  } catch (err) {
    logWarn("setWatchModeActive failed", err);
  }
  return v;
}

/**
 * Check + advance the burst tracker for an actor. Returns true if the actor
 * is currently being throttled (caller should skip this event).
 */
function isInBurst(actorId) {
  const now = Date.now();
  const rec = burstTracker.get(actorId);
  if (!rec || (now - rec.windowStart) > BURST_WINDOW_MS) {
    burstTracker.set(actorId, { count: 1, windowStart: now });
    return false;
  }
  rec.count += 1;
  return rec.count > BURST_LIMIT;
}

/**
 * Try to find an open AuditReportApp instance for the given actor.
 * Falls back to null if no reliable lookup is possible.
 */
function findOpenAuditApp(actor) {
  try {
    const api = game.modules.get(MODULE_ID)?.api;
    // Optional registry that audit-app.js may expose (see integration patch).
    const registry = api?.openAuditApps;
    if (registry instanceof Map) {
      const app = registry.get(actor.id);
      if (app) return app;
    }
    const instances = foundry.applications?.instances;
    if (instances) {
      const iter = instances.values ? instances.values() : Object.values(instances);
      for (const app of iter) {
        if (!app) continue;
        if (app.constructor?.name !== "AuditReportApp") continue;
        if (app.actor?.id === actor.id) return app;
      }
    }
  } catch (err) {
    logWarn("findOpenAuditApp error", err);
  }
  return null;
}

function runAuditFor(actor) {
  try {
    const api = game.modules.get(MODULE_ID)?.api;
    if (!api?.auditActor) return;
    const openApp = findOpenAuditApp(actor);
    if (openApp) {
      // Re-render: clear cached report so _prepareContext re-audits.
      try { openApp._report = null; } catch { /* noop */ }
      openApp.render(true);
    } else {
      // Silent snapshot: auditActor() appends to the actor's history flag.
      api.auditActor(actor);
    }
  } catch (err) {
    logWarn("runAuditFor error", err);
  }
}

function scheduleAudit(actor) {
  if (!actor || actor.type !== "character") return;
  if (!game.user?.isGM) return;
  if (!isWatchModeActive()) return;
  if (isInBurst(actor.id)) return;

  const prev = debounceTimers.get(actor.id);
  if (prev) clearTimeout(prev);
  const id = setTimeout(() => {
    debounceTimers.delete(actor.id);
    runAuditFor(actor);
  }, DEBOUNCE_MS);
  debounceTimers.set(actor.id, id);
}

function onUpdateActor(actor, change, _options, _userId) {
  try {
    // Level changes are handled by scripts/ui/watch.js — skip here.
    if (change?.system?.details?.level?.value !== undefined) return;
    scheduleAudit(actor);
  } catch (err) {
    logWarn("updateActor hook error", err);
  }
}

function onItemMutation(item, _a, _b, _c) {
  try {
    const actor = item?.actor;
    if (!actor) return;
    scheduleAudit(actor);
  } catch (err) {
    logWarn("item hook error", err);
  }
}

/**
 * Register the watch-mode hooks. Idempotent — repeat calls are a no-op.
 */
export function registerWatchModeHook() {
  if (registered) return;
  registered = true;
  try {
    Hooks.on("updateActor", onUpdateActor);
    Hooks.on("createItem", onItemMutation);
    Hooks.on("updateItem", onItemMutation);
    Hooks.on("deleteItem", onItemMutation);
  } catch (err) {
    logWarn("registerWatchModeHook failed", err);
  }
}
