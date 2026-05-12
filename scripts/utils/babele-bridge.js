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
    ["game.babele", () => globalThis.game?.babele],
    ["game.babele.translations", () => globalThis.game?.babele?.translations],
    ["game.babele.packs", () => globalThis.game?.babele?.packs],
    ["game.modules.get('babele')", () => globalThis.game?.modules?.get?.("babele")],
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
// or "光亮术 Light" → { cn, en }. Also handles names with full-width parens
// where no separating space exists, e.g. "召唤怪物（基础）Summon Construct (Basic)".
// Returns null when the pattern doesn't match.
function splitBilingual(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  // Skip "(自定义 Lore)" / "(Custom Lore)" style synthetic names that start
  // with an ASCII or full-width opening paren — no CJK head to anchor on.
  if (trimmed.startsWith("(") || trimmed.startsWith("（")) return null;
  // CJK head (may include full-width punctuation like （）、·・) optionally
  // followed by whitespace, then an ASCII tail starting with a letter.
  // \s* (zero-or-more) is required because translations like
  // "召唤怪物（基础）Summon Construct (Basic)" omit the separator.
  const m = trimmed.match(/^([一-鿿][^A-Za-z]*?)\s*([A-Za-z][A-Za-z0-9'\(\) :,\-]+?)$/);
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
  const packs = (typeof game !== "undefined" && game?.packs) ? game.packs : null;
  if (!packs) return 0;
  for (const pack of packs) {
    try {
      const index = pack?.index;
      if (!index) continue;
      // Foundry's Collection iterator covers empty indexes safely (length 0).
      for (const entry of index) {
        const parts = splitBilingual(entry?.name);
        if (parts && !map.has(parts.cn)) {
          map.set(parts.cn, parts.en);
          added++;
        }
      }
    } catch (err) {
      // One broken pack must not poison the whole scan.
      console.warn(`[pf2e-character-audit] skipped pack ${pack?.collection ?? "?"}:`, err);
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
  // Defensive: game / collections may be undefined in Node tests or
  // during very early init. Iterating `undefined` throws, so guard each.
  if (typeof game === "undefined") return 0;
  const actors = game?.actors;
  if (actors && typeof actors[Symbol.iterator] === "function") {
    for (const actor of actors) {
      try {
        const items = actor?.items;
        if (!items || typeof items[Symbol.iterator] !== "function") continue;
        for (const item of items) visit(item);
      } catch (err) {
        console.warn(`[pf2e-character-audit] skipped actor ${actor?.name ?? "?"}:`, err);
      }
    }
  }
  const worldItems = game?.items;
  if (worldItems && typeof worldItems[Symbol.iterator] === "function") {
    try {
      for (const item of worldItems) visit(item);
    } catch (err) {
      console.warn("[pf2e-character-audit] skipped world items:", err);
    }
  }
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
    const next = buildReverseMap();
    cachedReverseMap = next;
    lastBuildTime = now;
  } catch (err) {
    console.warn("[pf2e-character-audit] babele reverse-map build failed:", err);
    // Preserve any previously-good cache; only fall back to empty on first failure.
    if (cachedReverseMap === null) cachedReverseMap = new Map();
    // Mark as freshly attempted so we don't hot-loop rebuilds on persistent error.
    lastBuildTime = now;
  }
  return cachedReverseMap;
}

export function invalidateReverseMap() {
  cachedReverseMap = null;
  lastBuildTime = 0;
}

// Reserved generic tokens that must NEVER be replaced by Babele reverse-lookup
// — they have specific rule semantics handled by cn-normalizer's regex patterns
// (rank words, skill names, ability scores, structural particles). Without this
// guard, an item literally named "大师 Maestro" (a Bard muse-selector or NPC)
// or "运动 Athletics" (a creature skill name) sneaks into the map and clobbers
// the rank/skill words in prereq text — e.g. "特技技能熟练度为大师" comes out
// as "Acrobatics熟练度 is Maestro" which the parser can't decode.
//
// Policy: generic rule vocabulary blocklisted; proper-noun feat references
// still translated. Keep this list tight to specific common rule words that
// also happen to appear as standalone bilingual item names somewhere in the
// PF2E data set. Class slugs (战士), dedication suffix (入门), and full feat
// names are deliberately NOT blocklisted — those are exactly what the reverse
// lookup is for ("战士入门" → "Fighter Dedication").
const RESERVED_GENERIC_TOKENS = new Set([
  // Proficiency ranks (受训 listed once — Set dedupes regardless)
  "未受训", "受训", "专家", "大师", "传奇",
  // PF2E skills
  "杂技", "特技", "体技",
  "神秘", "奥术", "奥法",
  "运动", "竞技",
  "工艺", "手艺", "技艺", "制造",
  "欺骗", "诈骗",
  "外交", "交涉",
  "威吓", "恐吓",
  "医疗", "医术",
  "自然",
  "神秘学", "异能学", "玄秘", "异能",
  "表演",
  "宗教",
  "社群", "社交",
  "隐匿", "潜行",
  "生存",
  "盗窃", "盗术",
  // Ability scores
  "力量", "敏捷", "体质", "智力", "感知", "魅力",
  // Vital stats / HP wording (a bilingual creature/feature literally named
  // "生命 Life" or "生命值 HP" must not rewrite "每级生命值不超过…" prereqs).
  "生命", "生命值", "HP",
  // Structural / rule particles (调整值 = modifier, e.g. 体质调整值)
  "熟练度", "技能", "调整值", "成员", "角色",
  // Class / build vocabulary — "职业" leaks via items like "职业 Classes";
  // level/comparator words leak via lore/journal entries.
  "职业", "等级", "级", "每级",
  "不超过", "不少于", "或更高", "或以上", "或更多",
  // Generic structural particles that occasionally appear as bilingual names
  // in junk entries (single-character particles tend to be no-ops because the
  // reverse-lookup already requires length >= 2, but pinning them is cheap).
  "的", "之", "与", "及", "以及", "而",
  // Feat / class taxonomy words (a bilingual entry "专长 Feat" would otherwise
  // rewrite "你必须拥有该专长" → "you must have this Feat" mid-sentence).
  "专长", "领域", "特性",
  // Religion / theology rule words (a deity entry named "伊欧梅黛 Iomedae"
  // must not rewrite the literal token "神祇" or "偏好武器" in prereq text).
  "神祇", "偏好武器", "学识",
  // Spellcasting rule words
  "焦点", "戏法", "戏法位", "法术", "法术位", "仪式",
  // Rank / tier / level / name particles
  "阶", "环", "名", "圈",
]);

export function applyReverseLookup(text) {
  if (text == null) return text;
  const map = getReverseMap();
  if (!map || map.size === 0) return text;
  const asString = String(text);
  if (!/[一-鿿]/.test(asString)) return asString;

  let out = asString;
  // Longest first so "鲁莽骑手入门" beats "鲁莽" if both exist. Secondary sort by
  // string value to make order fully deterministic across engines/insertion order
  // when two keys share length (e.g. "大师缪斯" vs "大师风范" — both 4 chars).
  const sortedKeys = [...map.keys()].sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  for (const cn of sortedKeys) {
    if (!cn || cn.length < 2) continue;
    if (RESERVED_GENERIC_TOKENS.has(cn)) continue;
    const en = map.get(cn);
    if (typeof en !== "string" || !en) continue;
    if (out.includes(cn)) out = out.split(cn).join(en);
  }
  return out;
}
