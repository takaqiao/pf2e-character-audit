import { MODULE_ID } from "../constants.js";
import { t, format } from "../i18n.js";

/**
 * Read the most recent audit snapshot stored on the actor.
 * History flag is an array; newest entry is last (per watch.js convention).
 */
function latestSnapshot(actor) {
  try {
    const history = actor.getFlag(MODULE_ID, "history");
    if (!Array.isArray(history) || history.length === 0) return null;
    return history[history.length - 1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Map a snapshot to a presentable badge descriptor.
 * Exported for testing / reuse.
 *
 * @param {object|null} snapshot
 * @returns {{class: "ok"|"warn"|"error"|"unknown", label: string, tooltip: string}}
 */
export function formatBadge(snapshot) {
  if (!snapshot) {
    return {
      class: "unknown",
      label: "?",
      tooltip: t("SheetBadge.NoSnapshot")
    };
  }
  const errors = Number(snapshot?.completeness?.errors ?? 0)
    + Number(snapshot?.prerequisites?.fail ?? 0);
  const warnings = Number(snapshot?.completeness?.warnings ?? 0)
    + Number(snapshot?.prerequisites?.unknown ?? 0);

  if (errors === 0 && warnings === 0) {
    return {
      class: "ok",
      label: "✓",
      tooltip: t("SheetBadge.Clean")
    };
  }
  if (errors > 0) {
    return {
      class: "error",
      label: `⚠ ${errors}`,
      tooltip: format("SheetBadge.Tooltip", { errors, warnings })
    };
  }
  return {
    class: "warn",
    label: `⚠ ${warnings}`,
    tooltip: format("SheetBadge.Tooltip", { errors, warnings })
  };
}

function colorFor(klass) {
  switch (klass) {
    case "error":   return "var(--color-level-error, #b91c1c)";
    case "warn":    return "var(--color-level-warning, #b45309)";
    case "ok":      return "var(--color-level-success, #15803d)";
    case "unknown":
    default:        return "var(--color-text-subtle, #71717a)";
  }
}

function buildBadgeElement(actor, descriptor) {
  const span = document.createElement("a");
  span.className = `pf2e-character-audit-badge pf2e-character-audit-badge--${descriptor.class}`;
  span.dataset.actorId = actor.id;
  span.dataset.tooltip = descriptor.tooltip;
  span.setAttribute("aria-label", descriptor.tooltip);
  span.setAttribute("role", "button");
  span.textContent = descriptor.label;

  const bg = colorFor(descriptor.class);
  Object.assign(span.style, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "20px",
    maxWidth: "24px",
    height: "20px",
    padding: "0 4px",
    marginLeft: "6px",
    borderRadius: "10px",
    background: bg,
    color: "#fff",
    fontSize: "11px",
    lineHeight: "1",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.15)",
    whiteSpace: "nowrap"
  });

  span.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const api = game.modules.get(MODULE_ID)?.api;
    api?.openAuditApp?.(actor);
  });
  return span;
}

function rootEl(html, app) {
  if (html instanceof HTMLElement) return html;
  if (html && typeof html === "object" && typeof html.length === "number" && html[0] instanceof HTMLElement) return html[0];
  return app?.element ?? null;
}

function shouldShow(actor) {
  if (!actor || actor.type !== "character") return false;
  // Show if a snapshot exists, OR the user has the sheet-button setting on
  // (in which case we render a neutral "?" prompt).
  if (latestSnapshot(actor)) return true;
  try {
    return game.settings.get(MODULE_ID, "auditButtonOnSheet") !== false;
  } catch {
    return false;
  }
}

function onRender(app, html) {
  const actor = app?.actor;
  if (!shouldShow(actor)) return;
  const root = rootEl(html, app);
  if (!root) return;
  // Avoid duplicates on re-render.
  root.querySelector(".pf2e-character-audit-badge")?.remove();

  const descriptor = formatBadge(latestSnapshot(actor));
  const badge = buildBadgeElement(actor, descriptor);

  // Place next to the window title (left side of header controls).
  const title = root.querySelector(".window-header .window-title");
  if (title) {
    title.after(badge);
    return;
  }
  // Fallback: drop next to our existing audit button if title is missing.
  const auditBtn = root.querySelector(".pf2e-character-audit-btn");
  if (auditBtn) auditBtn.after(badge);
}

/**
 * Register the renderCharacterSheetPF2e hook so the badge appears on each
 * character sheet render. Idempotent — safe to call once during "ready".
 */
export function registerSheetBadgeHook() {
  Hooks.on("renderCharacterSheetPF2e", onRender);
}
