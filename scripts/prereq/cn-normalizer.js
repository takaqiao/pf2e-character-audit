// CN→EN preprocessor for PF2E feat prerequisite text.
// pf2e-leveler's parser only understands English/French. When a Chinese
// translation pack (e.g. pf2e_compendium_chn) is active, the prereq text
// stored on owned items is Chinese. We translate the most common patterns
// back to a normalized English form before passing to the parser.
//
// Step 0 of normalization is a runtime Babele reverse-lookup (built lazily
// from the loaded translation packs in scripts/utils/babele-bridge.js). This
// resolves named references like "鲁莽骑手入门" → "Reckless Rider Dedication"
// without us maintaining 2000+ hand-coded pairs — it falls out of whatever
// translation pack the user has installed.
//
// Coverage focuses on the high-frequency patterns in PF2E core:
//   - "<skill>技能熟练度为<rank>"           → "<rank> in <skill>"
//   - "<skill>技能的熟练度达到<rank>"        → "<rank> in <skill>"
//   - "在<skill>上<rank>"                   → "<rank> in <skill>"
//   - "一个能用来回忆知识的技能熟练度为<rank>" → "<rank> in a Recall Knowledge skill"
//   - "在你神祇的偏好武器上<rank>"           → "<rank> in your deity's favored weapon"
//   - skill / ability / ancestry / class / common feature names
// Anything not matched falls through; the parser will return `unknown` and
// the audit demotes it to `info` to avoid a wall of yellow warnings.

const SKILL_CN_TO_EN = {
  "杂技": "Acrobatics", "特技": "Acrobatics", "体技": "Acrobatics",
  "神秘": "Arcana", "奥术": "Arcana", "奥法": "Arcana",
  "运动": "Athletics", "竞技": "Athletics",
  "工艺": "Crafting", "手艺": "Crafting", "技艺": "Crafting", "制造": "Crafting",
  "欺骗": "Deception", "诈骗": "Deception",
  "外交": "Diplomacy", "交涉": "Diplomacy",
  "威吓": "Intimidation", "恐吓": "Intimidation",
  "医疗": "Medicine", "医术": "Medicine",
  "自然": "Nature",
  "神秘学": "Occultism", "异能学": "Occultism", "玄秘": "Occultism", "异能": "Occultism",
  "表演": "Performance",
  "宗教": "Religion",
  "社群": "Society", "社交": "Society",
  "隐匿": "Stealth", "潜行": "Stealth",
  "生存": "Survival",
  "盗窃": "Thievery", "盗术": "Thievery"
};

const RANK_CN_TO_EN = {
  "未受训": "untrained",
  "受训": "trained",
  "专家": "expert",
  "大师": "master",
  "传奇": "legendary"
};

const ABILITY_CN_TO_EN = {
  "力量": "Strength",
  "敏捷": "Dexterity",
  "体质": "Constitution",
  "智力": "Intelligence",
  "感知": "Wisdom",
  "魅力": "Charisma"
};

const ANCESTRY_CN_TO_EN = {
  "人类": "human",
  "半身人": "halfling",
  "矮人": "dwarf",
  "精灵": "elf",
  "半精灵": "half-elf",
  "半兽人": "half-orc",
  "兽人": "orc",
  "侏儒": "gnome",
  "哥布林": "goblin",
  "艾瑟玛": "aasimar",
  "亲魔": "tiefling",
  "冥裔": "duskwalker",
  "幻灵裔": "ganzi",
  "蜥蜴人": "lizardfolk",
  "豺狼人": "gnoll",
  "鸟人": "strix",
  "卡修狄": "kashrishi",
  "莱什": "leshy",
  "卡他骏": "catfolk",
  "鼠人": "ratfolk"
};

const CLASS_CN_TO_EN = {
  "炼金师": "alchemist",
  "野蛮人": "barbarian",
  "吟游诗人": "bard",
  "勇士": "champion",
  "牧师": "cleric",
  "德鲁伊": "druid",
  "战士": "fighter",
  "武僧": "monk",
  "游侠": "ranger",
  "游荡者": "rogue",
  "术士": "sorcerer",
  "法师": "wizard",
  "咒术家": "witch",
  "巫师": "witch",
  "调查员": "investigator",
  "探员": "investigator",
  "发明家": "inventor",
  "玄学家": "magus",
  "神谕者": "oracle",
  "召唤师": "summoner",
  "剑刃舞者": "swashbuckler",
  "灵能士": "psychic",
  "通灵师": "psychic",
  "万灵师": "animist",
  "元素动者": "kineticist",
  "机巧使": "gunslinger",
  "奇术师": "thaumaturge",
  "指挥官": "commander",
  "运演师": "exemplar"
};

// Subclass-selector translations: emit ONLY the feat name (drop the suffix
// like "muse"/"instinct"/"bloodline"). The leveler parser then recognises it
// as a feat reference and `matchFeat(slug)` resolves against the actor's
// owned-feat set. This is the entire trick that makes "大师缪斯" pass —
// otherwise the parser produces slug "maestro-muse" which doesn't exist.
const FEATURE_CN_TO_EN = {
  // Generic concepts
  "神祇": "deity",
  "偏好武器": "favored weapon",
  "简易武器": "simple weapons",
  "无武装攻击": "unarmed attacks",
  "武装攻击": "unarmed attacks",
  "聚能法术": "focus spell",
  "聚能点": "focus point",
  "聚能池": "Focus Pool",
  "焦能池": "Focus Pool",
  "施法": "spellcasting",
  "法术位": "spell slot",
  "法术打击": "Spellstrike",
  "奥术奔涌": "Arcane Cascade",
  "神力源泉": "Divine Font",
  "神圣盟友": "Divine Ally",
  "觉醒阶段": "Awakened Stage",
  "本能出神": "instinct trance",
  "出神": "trance",
  "幻能": "psi",
  "法师": "magus",
  "魔仆": "familiar",
  "神器": "implement",
  "奇具": "implement",
  "弱点发掘": "Exploit Vulnerability",
  "能够从法术位施法": "able to cast spells from spell slots",
  "能够施法": "able to cast spells",

  // Bard muses (drop "缪斯" suffix → bare feat name)
  "丹心缪斯": "Enigma",
  "大师缪斯": "Maestro",
  "宝典缪斯": "Polymath",
  "战士缪斯": "Warrior",
  "战乐缪斯": "Warrior",
  "缪斯": "muse",

  // Barbarian instincts (drop "本能" suffix)
  "动物本能": "Animal Instinct",
  "龙之本能": "Dragon Instinct",
  "狂怒本能": "Fury Instinct",
  "巨人本能": "Giant Instinct",
  "灵魂本能": "Spirit Instinct",
  "超感本能": "Superstition Instinct",

  // Cleric doctrines (drop "信条" suffix)
  "战斗祭司": "Warpriest",
  "战祭司": "Warpriest",
  "虔信者": "Cloistered Cleric",

  // Champion causes
  "解放者": "Liberator",
  "守护者": "Paladin",
  "复仇者": "Antipaladin",

  // Sorcerer bloodlines (drop "血裔" suffix)
  "天界血裔": "Angelic",
  "恶魔血裔": "Demonic",
  "魔鬼血裔": "Diabolic",
  "巨龙血裔": "Draconic",
  "妖精血裔": "Fey",
  "异界血裔": "Genie",
  "蛇魔血裔": "Hag",
  "灵异血裔": "Imperial",
  "纯粹血裔": "Phoenix",
  "心灵血裔": "Psychopomp",
  "暗影血裔": "Shadow",
  "禁忌血裔": "Undead",

  // Generic suffix words (matched as standalone, last)
  "本能": "instinct",
  "学派": "school",
  "血裔": "bloodline",
  "信条": "doctrine",
  "神秘事项": "mystery",
  "渊源": "patron",
  "教派": "order",
  "研究领域": "research field",
  "调查方法": "methodology",
  "突袭风格": "racket",
  "猎人之锋": "hunter's edge",
  "意识心智": "conscious mind",
  "潜意识心智": "subconscious mind"
};

import { applyReverseLookup } from "../utils/babele-bridge.js";

// Greedy CJK run: used for whole-phrase captures (在 X 上 rank).
const CJK_RUN = "[\\u4e00-\\u9fff]+";
// Lazy CJK run: used for skill stem captures so optional "技能"/"的" can still
// consume their tokens after the stem (otherwise greedy `+` swallows 技能).
const CJK_RUN_LAZY = "[\\u4e00-\\u9fff]+?";
const RANK_GROUP = "(未受训|受训|专家|大师|传奇)";

function rankToEn(cn) {
  return RANK_CN_TO_EN[cn] ?? cn;
}

function skillToEn(cn) {
  if (SKILL_CN_TO_EN[cn]) return SKILL_CN_TO_EN[cn];
  // Lore skills: "<X>学识" → "X Lore"
  if (cn.endsWith("学识")) {
    const stem = cn.slice(0, -2);
    return `${stem} Lore`;
  }
  if (cn.endsWith("知识")) {
    const stem = cn.slice(0, -2);
    return `${stem} Lore`;
  }
  return cn;
}

function replaceVocabulary(text) {
  let out = text;
  // Order matters: longer phrases first
  const tables = [
    FEATURE_CN_TO_EN,
    CLASS_CN_TO_EN,
    ANCESTRY_CN_TO_EN,
    SKILL_CN_TO_EN,
    ABILITY_CN_TO_EN
  ];
  for (const table of tables) {
    const sortedKeys = Object.keys(table).sort((a, b) => b.length - a.length);
    for (const cn of sortedKeys) {
      out = out.split(cn).join(table[cn]);
    }
  }
  return out;
}

function replaceConnectors(text) {
  let out = text
    .replace(/[、，]/g, ", ")
    .replace(/[；]/g, "; ")
    .replace(/[：]/g, ": ")
    .replace(/[。]/g, ". ")
    .replace(/和/g, " and ")
    .replace(/或/g, " or ")
    .replace(/[一二三四五六七八九十]个/g, " ");
  // Possessive 的 (only when between non-space characters; doesn't break grammar 100%
  // but covers PF2E's "X的Y" phrasing reliably).
  out = out
    .replace(/你的/g, "your ")
    .replace(/你/g, "your ")
    .replace(/(\S)的/g, "$1's ")
    .replace(/为/g, " is ")
    .replace(/是/g, " is ")
    .replace(/拥有/g, " has ")
    .replace(/具有/g, " has ");
  return out;
}

export function hasCJK(text) {
  return /[一-鿿]/.test(String(text ?? ""));
}

export function normalizeRequirement(text) {
  if (!text) return text;
  if (!hasCJK(text)) return text;

  // Strip trailing CJK fullstop and other terminal punctuation so the parser
  // doesn't get confused by "受训。" trailing markers.
  let out = String(text).replace(/[。．；;]+\s*$/g, "").trim();

  // Step 0: ask Babele for any CN named-reference we can swap out (covers
  // dedications, class features, focus spells, etc.). Runs first so the
  // subsequent regex patterns operate on a partially-English string.
  const beforeBabele = out;
  out = applyReverseLookup(out);
  const babeleHelped = out !== beforeBabele;
  if (!hasCJK(out)) return out;

  // Pattern: "一个能用来回忆知识的技能熟练度为<rank>"
  // Expand into an OR of all 7 RK skills so the leveler parser can route to
  // matchSkill for each — matchRecallKnowledgeSkill is too narrow (Lore skills
  // also count for Recall Knowledge but it doesn't check them).
  out = out.replace(
    new RegExp(`(?:一个)?能?用来?回忆知识(?:用)?的?技能(?:的)?熟练度(?:为|达到)${RANK_GROUP}`, "g"),
    (_, rank) => {
      const r = rankToEn(rank);
      return [
        `${r} in Society`,
        `${r} in Arcana`,
        `${r} in Crafting`,
        `${r} in Medicine`,
        `${r} in Nature`,
        `${r} in Occultism`,
        `${r} in Religion`
      ].join(" or ");
    }
  );

  // Pattern: "<skill>(技能)?(的)?熟练度(为|达到)<rank>" → "<rank> in <skill>"
  out = out.replace(
    new RegExp(`(${CJK_RUN_LAZY})(?:技能)?(?:的)?熟练度(?:为|达到)${RANK_GROUP}`, "g"),
    (_, skill, rank) => `${rankToEn(rank)} in ${skillToEn(skill)}`
  );

  // Pattern: "在<phrase>(技能)?上(为)?<rank>" → "<rank> in <phrase>"
  // Greedy here is fine because trailing "上" + RANK provides a strong anchor.
  out = out.replace(
    new RegExp(`在(${CJK_RUN}(?:的${CJK_RUN})*)(?:技能)?上(?:为)?${RANK_GROUP}`, "g"),
    (_, phrase, rank) => `${rankToEn(rank)} in ${skillToEn(phrase)}`
  );

  // Pattern: "<X>学识受训" (lore-trained shorthand, no 熟练度) → "trained in <X> Lore"
  out = out.replace(
    new RegExp(`(${CJK_RUN_LAZY})学识${RANK_GROUP}`, "g"),
    (_, stem, rank) => `${rankToEn(rank)} in ${stem} Lore`
  );

  // Fallback dedication pattern: "<X>入门" → "<X> Dedication". Only apply when
  // Babele's reverse-lookup didn't already handle this term — "入门" is
  // ambiguous in PF2E Chinese: most archetype intros are "Dedication" but
  // class feats like "领域入门 Domain Initiate", "法术入门 Spell Initiate" use
  // "Initiate", and the wrong translation would mis-route the parser.
  if (!babeleHelped) {
    out = out.replace(new RegExp(`(${CJK_RUN})入门`, "g"), (_, stem) => `${stem} Dedication`);
  }

  // Multi-skill compound: "A 和 B" inside a 在...上... clause already split
  // earlier may leave lone "技能"/"熟练度" tokens. Strip them now so they
  // don't leak through to the parser (which would treat them as feat-name
  // tokens and emit unknown). 熟练度 is normally consumed by the rank
  // patterns above; only reaches here if the rank-word capture failed
  // (e.g. a non-standard wording the regex didn't cover).
  out = out.replace(/熟练度/g, " ");
  out = out.replace(/技能/g, "");

  // Pattern: "<ability><num>" / "<ability> <num> 或更高" / "<ability>调整值+<num>"
  // → "<ability> <num>". Leveler parser handles both "Strength 14" (score) and
  // "Strength +2" (modifier); we preserve whichever notation appeared in
  // the source so the parser can interpret it correctly.
  out = out.replace(
    new RegExp(`(${CJK_RUN_LAZY})(?:调整值)?(?:为|达到)?\\s*([+]?\\d+)\\s*(?:或更高|或以上)?`, "g"),
    (m, attr, num) => {
      const en = ABILITY_CN_TO_EN[attr];
      if (!en) return m;
      return `${en} ${num}`;
    }
  );

  // Generic vocabulary replace
  out = replaceVocabulary(out);

  // Connectors after vocabulary so we don't break "或更高" etc.
  out = replaceConnectors(out);

  // Collapse whitespace
  out = out.replace(/\s+/g, " ").trim();

  return out;
}

export function normalizeFeatPrerequisites(feat) {
  const list = feat?.system?.prerequisites?.value ?? [];
  if (!Array.isArray(list) || list.length === 0) return feat;
  if (!list.some((p) => hasCJK(p?.value))) return feat;

  const cloned = list.map((p) => ({
    ...p,
    value: normalizeRequirement(p?.value ?? "")
  }));

  return {
    ...feat,
    system: {
      ...feat.system,
      prerequisites: { ...(feat.system?.prerequisites ?? {}), value: cloned }
    }
  };
}
