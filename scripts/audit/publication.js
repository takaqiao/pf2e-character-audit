import { EXCLUDED_PUBLICATION_TYPES } from "../constants.js";
import { getWhitelistTitles } from "../settings.js";

const UNKNOWN_KEY = "PF2E-CA.Publication.Unknown";
const CUSTOM_LORE_KEY = "PF2E-CA.Publication.CustomLore";

function safeText(v) {
  return typeof v === "string" ? v.trim() : "";
}

export function getPub(item) {
  const t = safeText(item?.system?.publication?.title);
  if (t) return { title: t, isUnknown: false, isCustom: false };
  const legacy = safeText(item?.system?.source?.value) || safeText(item?.system?.source);
  if (legacy) return { title: legacy, isUnknown: false, isCustom: false, fromLegacy: true };
  if (item?.type === "lore") return { title: game.i18n.localize(CUSTOM_LORE_KEY), isUnknown: false, isCustom: true };
  return { title: game.i18n.localize(UNKNOWN_KEY), isUnknown: true, isCustom: false };
}

export function getLicense(item) {
  const p = item?.system?.publication;
  if (!p) return { license: "", remaster: false, display: "" };
  const lic = safeText(p.license);
  const r = !!p.remaster;
  // OGL items flagged remaster become "OGL·R"; ORC items are post-remaster by definition,
  // but if the data carries remaster=true we still surface "ORC·R" for transparency.
  // TODO verify: confirm with PF2e system whether ORC entries ever set remaster=true.
  return { license: lic, remaster: r, display: lic ? `${lic}${r ? "·R" : ""}` : (r ? "·R" : "") };
}

export function isExcluded(item) {
  return EXCLUDED_PUBLICATION_TYPES.has(item?.type);
}

function categoryFor(item) {
  switch (item?.type) {
    case "feat":
    case "ancestry":
    case "heritage":
    case "background":
    case "class":
    case "deity":
    case "spell":
    case "lore":
      return item.type;
    case "weapon":
    case "armor":
    case "shield":
    case "equipment":
    case "consumable":
    case "treasure":
    case "backpack":
      return "equipment";
    default:
      return "other";
  }
}

export function auditPublication(actor) {
  const whitelist = new Set(getWhitelistTitles());
  const titles = new Map();
  const byCategory = {};
  let total = 0;
  let remasterCount = 0;
  let unknownCount = 0;
  const byLicense = {};

  for (const item of actor.items) {
    if (isExcluded(item)) continue;
    const pub = getPub(item);
    const lic = getLicense(item);
    const cat = categoryFor(item);
    total++;
    if (pub.isUnknown) unknownCount++;
    if (lic.remaster) remasterCount++;
    byLicense[lic.license || ""] = (byLicense[lic.license || ""] || 0) + 1;

    const entry = titles.get(pub.title) ?? {
      title: pub.title,
      license: lic.license,
      licenseDisplay: lic.display,
      remaster: lic.remaster,
      whitelisted: whitelist.has(pub.title),
      isUnknown: pub.isUnknown,
      isCustom: pub.isCustom,
      count: 0,
      items: []
    };
    entry.count++;
    entry.items.push({
      id: item.id,
      uuid: item.uuid,
      name: item.name,
      type: item.type,
      category: cat,
      fromLegacy: !!pub.fromLegacy
    });
    titles.set(pub.title, entry);

    byCategory[cat] = byCategory[cat] || [];
    byCategory[cat].push({
      title: pub.title,
      license: lic.license,
      licenseDisplay: lic.display,
      remaster: lic.remaster,
      itemId: item.id,
      itemUuid: item.uuid,
      itemName: item.name,
      fromLegacy: !!pub.fromLegacy
    });
  }

  const actorRollup = [...titles.values()]
    .map((e) => ({
      title: e.title,
      count: e.count,
      license: e.license,
      licenseDisplay: e.licenseDisplay,
      remaster: e.remaster,
      whitelisted: e.whitelisted,
      isUnknown: e.isUnknown,
      isCustom: e.isCustom
    }))
    .sort((a, b) => b.count - a.count);

  return {
    summary: { total, byLicense, remasterCount, unknownCount, distinctTitles: titles.size },
    byCategory,
    actorRollup,
    titles: actorRollup
  };
}

export function aggregateAcrossActors(reports) {
  const cross = new Map();
  const seenActors = new Set();
  for (const r of reports) {
    // Guard against the same actor appearing twice in the input — we want to count
    // titles "across distinct actors", not multiply by duplicates.
    const actorKey = r?.actorUuid ?? r?.actorId ?? r?.actorName;
    if (actorKey && seenActors.has(actorKey)) continue;
    if (actorKey) seenActors.add(actorKey);
    for (const t of r.publication?.actorRollup ?? []) {
      const e = cross.get(t.title) ?? {
        title: t.title,
        license: t.license,
        licenseDisplay: t.licenseDisplay,
        remaster: t.remaster,
        whitelisted: t.whitelisted,
        isUnknown: t.isUnknown,
        isCustom: t.isCustom,
        count: 0,
        actorBreakdown: []
      };
      e.count += t.count;
      e.actorBreakdown.push({ actor: r.actorName, count: t.count });
      cross.set(t.title, e);
    }
  }
  const byTitle = [...cross.values()].sort((a, b) => b.count - a.count);
  return {
    summary: { distinctTitles: byTitle.length, totalItems: byTitle.reduce((s, e) => s + e.count, 0) },
    byTitle
  };
}
