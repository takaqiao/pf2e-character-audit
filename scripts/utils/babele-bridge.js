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
  // Babele's API has shifted across versions. Probe in order:
  //   game.babele.translations            (Map<packKey, translation>)
  //   game.babele._translations            (older field)
  //   globalThis.Babele.get().translations (singleton form)
  const candidates = [
    () => globalThis.game?.babele?.translations,
    () => globalThis.game?.babele?._translations,
    () => globalThis.Babele?.get?.()?.translations,
    () => globalThis.Babele?.translations
  ];
  for (const fn of candidates) {
    try {
      const t = fn();
      if (t) return t;
    } catch {}
  }
  return null;
}

function buildReverseMap() {
  const map = new Map();
  const translations = tryReadBabeleTranslations();
  if (!translations) return map;

  const iter = translations instanceof Map
    ? translations.values()
    : (Array.isArray(translations) ? translations : Object.values(translations));

  for (const trans of iter) {
    if (!trans || typeof trans !== "object") continue;
    // Different shapes: { entries: {...} } or { translations: { entries: {...} } }
    processEntries(trans.entries, map);
    processEntries(trans.translations?.entries, map);
    // Some translation packs use Maps for entries
    if (trans.entries instanceof Map) {
      for (const [k, v] of trans.entries) {
        const cnName = bilingualToCN(v?.name);
        if (cnName && !map.has(cnName)) map.set(cnName, k);
      }
    }
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
