// Babele bridge: build a runtime reverse-lookup map (CN feat/feature name → EN
// canonical name) so the prereq normalizer can translate references like
// "鲁莽骑手入门" → "Reckless Rider Dedication" without us hardcoding 2000+ pairs.
//
// At audit time we ask `getReverseMap()`; first call lazily scans every loaded
// Babele translation pack's `entries` and registers `cn_stem → en_key`.

let cachedReverseMap = null;

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

function buildReverseMap() {
  const map = new Map();
  const translations = tryReadBabeleTranslations();
  if (!translations) {
    console.warn("[pf2e-character-audit] no Babele translations found. " +
      "Run `game.modules.get('pf2e-character-audit').api.debugBabele()` to diagnose.");
    return map;
  }

  const iter = translations instanceof Map
    ? translations.values()
    : (Array.isArray(translations) ? translations : Object.values(translations));

  for (const trans of iter) {
    if (!trans || typeof trans !== "object") continue;
    // Different shapes seen across Babele versions/source modules:
    //  - { entries: { EnName: { name: "CnName EnName", ... }, ... } }
    //  - { translations: { entries: {...} } }
    //  - { entries: Map<EnName, {...}> }
    //  - { mapping: {...}, label: ..., entries: {...} }
    processEntries(trans.entries, map);
    processEntries(trans.translations?.entries, map);
    if (trans.entries instanceof Map) {
      for (const [k, v] of trans.entries) {
        const cnName = bilingualToCN(v?.name);
        if (cnName && !map.has(cnName)) map.set(cnName, k);
      }
    }
    // Newer Babele: trans may BE the entries dict directly
    if (!trans.entries && !trans.translations) {
      for (const [k, v] of Object.entries(trans)) {
        if (typeof v !== "object" || v === null) continue;
        const cnName = bilingualToCN(v?.name);
        if (cnName && !map.has(cnName)) map.set(cnName, k);
      }
    }
  }

  if (map.size > 0) {
    console.info(`[pf2e-character-audit] Babele reverse map built: ${map.size} entries.`);
  } else {
    console.warn("[pf2e-character-audit] Babele reverse map is empty. " +
      "Run `game.modules.get('pf2e-character-audit').api.debugBabele()` to diagnose.");
  }
  return map;
}

export function getReverseMap() {
  if (cachedReverseMap !== null) return cachedReverseMap;
  try {
    cachedReverseMap = buildReverseMap();
  } catch (err) {
    console.warn("[pf2e-character-audit] babele reverse-map build failed:", err);
    cachedReverseMap = new Map();
  }
  return cachedReverseMap;
}

export function invalidateReverseMap() {
  cachedReverseMap = null;
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
