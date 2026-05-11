// Additional Feats (Player Core p. 215) detection.
//
// Some archetypes (Ulfen Guard, Eagle Knight, Blackjacket, Acrobat, …) include
// a list of "Additional Feats" — feats from other classes that you can take
// AS archetype feats. When taken this way, the original Dedication prereq
// (e.g. `Fighter Dedication`) is replaced by the archetype's own dedication,
// and the original class trait is dropped.
//
// The Additional Feats list lives on the ARCHETYPE JOURNAL PAGE, not on the
// feat item itself. PF2e v8 stores it in the `pf2e.journals` compendium pack
// under entries like "Archetypes" → page "Ulfen Guard". The list looks like:
//
//   <p><strong>Additional Feats:</strong>
//      <strong>4th</strong> @UUID[Compendium.pf2e.feats-srd.Item.OqU6QXkMrZqToEEi]{Reactive Striker};
//      <strong>8th</strong> @UUID[...]{Guardian's Deflection}, @UUID[...]{Shield Warden}</p>
//
// The Chinese translation (pf2e_compendium_chn) uses "补充专长" but keeps the
// same UUIDs. So we scan every loaded JournalEntry compendium pack ONCE at
// world ready, pull every "Additional Feats" / "补充专长" section, extract the
// @UUID[…] references, and build a map keyed by archetype page name
// (lower-cased; both CN and EN halves of the bilingual name registered).
//
// At audit time we look up each owned Dedication's archetype name in the map.
// If the failing feat's compendium sourceId UUID is in that archetype's
// Additional Feats set, the prereq is satisfied via that archetype.

let cachedMap = null;
let buildPromise = null;

const AF_SECTION_RE = /<strong>\s*(?:Additional\s+Feats?|补充专长|额外专长|额外的?专长|附加专长)\s*[:：]?\s*<\/strong>([\s\S]*?)(?:<\/p>|<h[1-6])/i;
const UUID_RE = /@UUID\[([^\]]+)\](?:\{([^}]+)\})?/g;

function extractAFSection(text) {
  if (!text) return null;
  const m = text.match(AF_SECTION_RE);
  if (!m) return null;
  const section = m[1];
  const uuids = new Set();
  const names = new Set();
  UUID_RE.lastIndex = 0;
  let um;
  while ((um = UUID_RE.exec(section)) !== null) {
    uuids.add(um[1].trim());
    if (um[2]) names.add(um[2].toLowerCase().trim());
  }
  return uuids.size > 0 || names.size > 0 ? { uuids, names } : null;
}

function splitBilingual(rawName) {
  const name = String(rawName ?? "").trim();
  const m = name.match(/^([一-鿿][^A-Za-z]*?)\s+([A-Za-z][A-Za-z0-9'() :,\-]+)$/);
  if (m) return { cn: m[1].trim(), en: m[2].trim() };
  if (/[一-鿿]/.test(name)) return { cn: name, en: null };
  return { cn: null, en: name };
}

// Strip suffixes like "(Archetype)", "（变体）", " - Archetype" from journal
// page names before bilingual splitting.
function stripPageSuffix(rawName) {
  let n = String(rawName ?? "").trim();
  n = n.replace(/\s*[\(（][^\)）]*[\)）]\s*$/g, "").trim();
  n = n.replace(/\s*[-—–]\s*Archetype\s*$/i, "").trim();
  return n;
}

function registerArchetype(map, pageName, data) {
  const cleaned = stripPageSuffix(pageName);
  const parts = splitBilingual(cleaned);
  const keys = [];
  if (parts.en) keys.push(parts.en.toLowerCase());
  if (parts.cn) keys.push(parts.cn.toLowerCase());
  for (const key of keys) {
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { uuids: new Set(), names: new Set(), source: pageName };
      map.set(key, bucket);
    }
    for (const u of data.uuids) bucket.uuids.add(u);
    for (const n of data.names) bucket.names.add(n);
  }
}

async function buildAFMap() {
  const map = new Map();
  const packs = [...(game?.packs ?? [])].filter((p) => p.documentName === "JournalEntry");
  for (const pack of packs) {
    let docs;
    try {
      docs = await pack.getDocuments();
    } catch {
      continue;
    }
    for (const journal of docs) {
      for (const page of journal.pages ?? []) {
        const data = extractAFSection(page.text?.content ?? "");
        if (!data) continue;
        registerArchetype(map, page.name, data);
      }
    }
  }
  return map;
}

export function ensureAFMap() {
  if (cachedMap !== null) return Promise.resolve(cachedMap);
  if (buildPromise !== null) {
    console.warn("[pf2e-character-audit] Additional Feats map still building — audit will await it.");
    return buildPromise;
  }
  buildPromise = buildAFMap()
    .then((m) => {
      cachedMap = m;
      console.info(`[pf2e-character-audit] Additional Feats map: ${m.size} archetype entries indexed.`);
      buildPromise = null;
      return m;
    })
    .catch((err) => {
      console.warn("[pf2e-character-audit] Additional Feats map build failed:", err);
      cachedMap = new Map();
      buildPromise = null;
      return cachedMap;
    });
  return buildPromise;
}

export function getAFMap() {
  return cachedMap;
}

function getFeatSourceUuid(item) {
  return (
    item?.flags?.core?.sourceId ??
    item?._stats?.compendiumSource ??
    item?._source?.flags?.core?.sourceId ??
    null
  );
}

// "Ulfen Guard Dedication" → "Ulfen Guard"; "乌尔芬卫士入门" → "乌尔芬卫士"
function archetypeBaseName(dedicationItem) {
  const parts = splitBilingual(dedicationItem.name);
  return {
    en: parts.en ? parts.en.replace(/\s+dedication$/i, "").toLowerCase().trim() : null,
    cn: parts.cn ? parts.cn.replace(/入门$/, "").toLowerCase().trim() : null
  };
}

// Accept an item as a dedication when ANY of the following indicators is
// present. Community-content / translation-pack items sometimes drop the
// literal "dedication" trait, so we look at slug, name suffix, and category.
function isDedicationLike(item) {
  const traits = item?.system?.traits?.value ?? [];
  if (Array.isArray(traits) && traits.includes("dedication")) return true;
  const slug = String(item?.system?.slug ?? item?.slug ?? "").toLowerCase();
  if (/-dedication$/.test(slug)) return true;
  const name = String(item?.name ?? "");
  const parts = splitBilingual(name);
  if (parts.en && /\bdedication$/i.test(parts.en)) return true;
  if (parts.cn && /入门$/.test(parts.cn)) return true;
  if (/\bdedication$/i.test(name) || /入门$/.test(name)) return true;
  const category = String(item?.system?.category ?? "").toLowerCase();
  if (category === "class" && (/dedication/i.test(name) || /入门/.test(name))) return true;
  return false;
}

export function isFeatInArchetypeAFList(actor, currentFeat) {
  if (!cachedMap || cachedMap.size === 0) return null;
  const featUuid = getFeatSourceUuid(currentFeat);
  const featParts = splitBilingual(currentFeat.name);
  const featEn = featParts.en ? featParts.en.toLowerCase() : null;

  for (const item of actor.items ?? []) {
    if (item === currentFeat || item.id === currentFeat.id) continue;
    if (!isDedicationLike(item)) continue;

    const arch = archetypeBaseName(item);
    let afSet = null;
    if (arch.en) afSet = cachedMap.get(arch.en);
    if (!afSet && arch.cn) afSet = cachedMap.get(arch.cn);
    if (!afSet) continue;

    if (featUuid && afSet.uuids.has(featUuid)) return item.name;
    if (featEn && afSet.names.has(featEn)) return item.name;
  }
  return null;
}

// Console diagnostic. Usage: game.modules.get("pf2e-character-audit").api.debugAF(actor)
export function debugAFMap(actor) {
  const tag = "[pf2e-character-audit][debugAF]";
  if (!cachedMap) {
    console.warn(`${tag} map not yet built (cachedMap=null). buildPromise=${buildPromise ? "pending" : "null"}`);
    return { built: false };
  }
  console.info(`${tag} map size: ${cachedMap.size}`);
  const keys = [...cachedMap.keys()];
  console.info(`${tag} first 10 keys:`, keys.slice(0, 10));

  if (!actor) return { built: true, size: cachedMap.size, keys: keys.slice(0, 10) };

  console.info(`${tag} === actor: ${actor.name} ===`);
  for (const item of actor.items ?? []) {
    if (!isDedicationLike(item)) continue;
    const arch = archetypeBaseName(item);
    const enHit = arch.en ? cachedMap.has(arch.en) : false;
    const cnHit = arch.cn ? cachedMap.has(arch.cn) : false;
    const bucket = (arch.en && cachedMap.get(arch.en)) || (arch.cn && cachedMap.get(arch.cn)) || null;
    console.info(`${tag} dedication "${item.name}": archetypeBaseName en="${arch.en}" cn="${arch.cn}" enHit=${enHit} cnHit=${cnHit}`);
    if (bucket) {
      console.info(`${tag}   uuids:`, [...bucket.uuids]);
      console.info(`${tag}   names:`, [...bucket.names]);
    }
  }

  const dedicationRe = /^(.+?)\s+Dedication$|^(.+?)入门$/i;
  for (const feat of actor.itemTypes?.feat ?? []) {
    const prereqEntries = feat.system?.prerequisites?.value ?? [];
    const txt = prereqEntries.map((p) => p?.value ?? "").filter(Boolean).join("; ");
    if (!txt) continue;
    if (!dedicationRe.test(txt.trim())) continue;
    const lookup = isFeatInArchetypeAFList(actor, feat);
    const uuid = getFeatSourceUuid(feat);
    console.info(`${tag} feat "${feat.name}" prereq="${txt}" sourceUuid=${uuid} → AFList match: ${lookup ?? "none"}`);
  }
  return { built: true, size: cachedMap.size };
}
