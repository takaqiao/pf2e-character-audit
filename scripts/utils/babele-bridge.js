// Babele bridge: build a runtime reverse-lookup map (CN feat/feature name → EN
// canonical name) so the prereq normalizer can translate references like
// "鲁莽骑手入门" → "Reckless Rider Dedication" without us hardcoding 2000+ pairs.
//
// At audit time we ask `getReverseMap()`; first call lazily scans every loaded
// Babele translation pack's `entries` and registers `cn_stem → en_key`.

let cachedReverseMap = null;
let lastBuildTime = 0;
const CACHE_TTL_MS = 60_000; // rebuild at most once a minute to pick up new owned items

function bilingualToCN(name) {
  if (typeof name !== "string") return null;
  // Strip the trailing English/punct portion (e.g. "鲁莽骑手入门 Reckless Rider Dedication"
  // → "鲁莽骑手入门"; "(Custom Lore)" → "" — skipped).
  const trimmed = name.replace(/\s*[A-Za-z(\[].*$/, "").trim();
  if (!trimmed) return null;
  if (!/[一-鿿]/.test(trimmed)) return null;
  return trimmed;
}

function processEntries(entries, map) {
  if (!entries || typeof entries !== "object") return;
  for (const [enKey, val] of Object.entries(entries)) {
    if (!val || typeof val !== "object") continue;
    const cnName = bilingualToCN(val.name);
    if (cnName && !map.has(cnName)) map.set(cnName, enKey);
  }
}

function tryReadBabeleTranslations() {
  // Babele's API has shifted across versions; probe a wide set.
  const candidates = [
    () => globalThis.game?.babele?.translations,
    () => globalThis.game?.babele?._translations,
    () => globalThis.game?.babele?.packs,
    () => globalThis.game?.modules?.get?.("babele")?.babele?.translations,
    () => globalThis.game?.modules?.get?.("babele")?.api?.translations,
    () => globalThis.game?.modules?.get?.("babele")?._instance?.translations,
    () => globalThis.Babele?.get?.()?.translations,
    () => globalThis.Babele?.translations,
    () => globalThis.CONFIG?.Babele?.translations
  ];
  for (const fn of candidates) {
    try {
      const t = fn();
      if (t && (t instanceof Map ? t.size > 0 : (Array.isArray(t) ? t.length > 0 : Object.keys(t ?? {}).length > 0))) {
        return t;
      }
    } catch {}
  }
  return null;
}

// Diagnostic helper — call from console to see Babele state.
export function debugBabele() {
  console.group("[pf2e-character-audit] Babele probe");
  const paths = [
    ["game.babele", () => game?.babele],
    ["game.babele.translations", () => game?.babele?.translations],
    ["game.babele.packs", () => game?.babele?.packs],
    ["game.modules.get('babele')", () => game?.modules?.get?.("babele")],
    ["globalThis.Babele", () => globalThis.Babele],
    ["globalThis.Babele.get()", () => globalThis.Babele?.get?.()]
  ];
  for (const [label, fn] of paths) {
    try {
      const v = fn();
      const meta = v instanceof Map
        ? `Map(${v.size})`
        : Array.isArray(v)
        ? `Array(${v.length})`
        : v && typeof v === "object"
        ? `Object(keys=${Object.keys(v).length})`
        : String(v);
      console.log(`  ${label}: ${meta}`);
    } catch (e) {
      console.log(`  ${label}: ERROR ${e.message}`);
    }
  }
  const map = getReverseMap();
  console.log(`Reverse map size: ${map.size}`);
  if (map.size > 0) {
    console.log("Sample entries:", [...map.entries()].slice(0, 5));
  }
  console.groupEnd();
}

// Parse a bilingual document name like "乌尔芬卫士入门 Ulfen Guard Dedication"
// or "光亮术 Light" → { cn, en }. Returns null when the pattern doesn't match.
function splitBilingual(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  // Skip "(自定义 Lore)" / "(Custom Lore)" style synthetic names
  if (trimmed.startsWith("(")) return null;
  // CJK run followed by space then ASCII run (letters / numbers / parens / hyphens)
  const m = trimmed.match(/^([一-鿿][^A-Za-z]*?)\s+([A-Za-z][A-Za-z0-9'\(\) :,\-]+?)$/);
  if (!m) return null;
  const cn = m[1].trim();
  const en = m[2].trim();
  if (!cn || !en) return null;
  if (!/[一-鿿]/.test(cn)) return null;
  return { cn, en };
}

// Scan every loaded compendium pack's pre-built index. Foundry pre-loads
// index metadata (name + id + a few fields) at world start, so this is
// fast and synchronous. Many Babele translation packs apply translations
// to compendium documents as bilingual names ("CN EN"), so the index alone
// is enough to build a CN→EN map without poking Babele's runtime APIs.
function buildReverseMapFromCompendiums(map) {
  let added = 0;
  for (const pack of game?.packs ?? []) {
    const index = pack.index;
    if (!index) continue;
    for (const entry of index) {
      const parts = splitBilingual(entry?.name);
      if (parts && !map.has(parts.cn)) {
        map.set(parts.cn, parts.en);
        added++;
      }
    }
  }
  return added;
}

// Scan world actors' owned items + world items collection for bilingual
// names. This is the most reliable path because owned items are always
// translated by Babele (Babele intercepts document creation, not pack
// index reads). If `pack.index` doesn't carry translated names in the
// user's Babele version, this still works.
function buildReverseMapFromWorld(map) {
  let added = 0;
  const seen = new Set();
  const visit = (item) => {
    const name = item?.name;
    if (!name || seen.has(name)) return;
    seen.add(name);
    const parts = splitBilingual(name);
    if (parts && !map.has(parts.cn)) {
      map.set(parts.cn, parts.en);
      added++;
    }
  };
  for (const actor of game?.actors ?? []) {
    for (const item of actor.items ?? []) visit(item);
  }
  for (const item of game?.items ?? []) visit(item);
  return added;
}

function buildReverseMap() {
  const map = new Map();

  // Path 1: ask Babele directly (older or differently-loaded modules)
  const translations = tryReadBabeleTranslations();
  if (translations) {
    const iter = translations instanceof Map
      ? translations.values()
      : (Array.isArray(translations) ? translations : Object.values(translations));
    for (const trans of iter) {
      if (!trans || typeof trans !== "object") continue;
      processEntries(trans.entries, map);
      processEntries(trans.translations?.entries, map);
      if (trans.entries instanceof Map) {
        for (const [k, v] of trans.entries) {
          const cnName = bilingualToCN(v?.name);
          if (cnName && !map.has(cnName)) map.set(cnName, k);
        }
      }
      if (!trans.entries && !trans.translations) {
        for (const [k, v] of Object.entries(trans)) {
          if (typeof v !== "object" || v === null) continue;
          const cnName = bilingualToCN(v?.name);
          if (cnName && !map.has(cnName)) map.set(cnName, k);
        }
      }
    }
  }

  // Path 2: compendium pack indexes (if Babele applied translations there).
  const fromIndex = buildReverseMapFromCompendiums(map);
  // Path 3: world actors' items + world items collection. These are document
  // instances, which Babele always translates regardless of pack-index handling.
  const fromWorld = buildReverseMapFromWorld(map);

  console.info(
    `[pf2e-character-audit] reverse map: ${map.size} entries ` +
    `(api=${map.size - fromIndex - fromWorld}, index=${fromIndex}, world=${fromWorld}).`
  );
  return map;
}

export function getReverseMap() {
  const now = Date.now();
  if (cachedReverseMap !== null && now - lastBuildTime < CACHE_TTL_MS) {
    return cachedReverseMap;
  }
  try {
    cachedReverseMap = buildReverseMap();
    lastBuildTime = now;
  } catch (err) {
    console.warn("[pf2e-character-audit] babele reverse-map build failed:", err);
    cachedReverseMap = new Map();
  }
  return cachedReverseMap;
}

export function invalidateReverseMap() {
  cachedReverseMap = null;
  lastBuildTime = 0;
}

export function applyReverseLookup(text) {
  const map = getReverseMap();
  if (!map || map.size === 0) return text;
  if (!/[一-鿿]/.test(text)) return text;

  let out = String(text);
  // Longest first so "鲁莽骑手入门" beats "鲁莽" if both exist.
  const sortedKeys = [...map.keys()].sort((a, b) => b.length - a.length);
  for (const cn of sortedKeys) {
    if (cn.length < 2) continue;
    if (out.includes(cn)) out = out.split(cn).join(map.get(cn));
  }
  return out;
}
