// CN→EN preprocessor for PF2E feat prerequisite text.
// pf2e-leveler's parser only understands English/French. When a Chinese
// translation pack (e.g. pf2e_compendium_chn) is active, the prereq text
// stored on owned items is Chinese. We translate the most common patterns
// back to a normalized English form before passing to the parser.
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
  "杂技": "Acrobatics",
  "神秘": "Arcana",
  "运动": "Athletics",
  "工艺": "Crafting", "手艺": "Crafting", "技艺": "Crafting",
  "欺骗": "Deception",
  "外交": "Diplomacy",
  "威吓": "Intimidation",
  "医疗": "Medicine",
  "自然": "Nature",
  "神秘学": "Occultism", "异能学": "Occultism",
  "表演": "Performance",
  "宗教": "Religion",
  "社群": "Society",
  "隐匿": "Stealth",
  "生存": "Survival",
  "盗窃": "Thievery"
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

const FEATURE_CN_TO_EN = {
  // Generic concepts
  "神祇": "deity",
  "偏好武器": "favored weapon",
  "简易武器": "simple weapons",
  "无武装攻击": "unarmed attacks",
  "武装攻击": "unarmed attacks",
  "回忆知识": "Recall Knowledge",
  "聚能法术": "focus spell",
  "聚能点": "focus point",
  // Bard muses
  "丹心缪斯": "enigma muse",
  "大师缪斯": "maestro muse",
  "宝典缪斯": "polymath muse",
  "战士缪斯": "warrior muse",
  "战乐缪斯": "warrior muse",
  "缪斯": "muse",
  // Cleric doctrines
  "战斗祭司": "warpriest doctrine",
  "战祭司": "warpriest doctrine",
  "虔信者": "cloistered cleric doctrine",
  // Champion causes (sample)
  "解放者": "liberator",
  "守护者": "paladin",
  "复仇者": "antipaladin",
  // Common subclass words
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
  "守护元素": "instinct",
  "意识心智": "conscious mind",
  "潜意识心智": "subconscious mind"
};

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

  let out = String(text);

  // Pattern: "一个能用来回忆知识的技能熟练度为<rank>" → "<rank> in a Recall Knowledge skill"
  out = out.replace(
    new RegExp(`(?:一个)?能?用来?回忆知识(?:用)?的?技能(?:的)?熟练度(?:为|达到)${RANK_GROUP}`, "g"),
    (_, rank) => `${rankToEn(rank)} in a Recall Knowledge skill`
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

  // Pattern: "<ability> <num> 或更高" / "<ability>调整值+<num>" → "<ability> +<num>"
  out = out.replace(
    new RegExp(`(${CJK_RUN_LAZY})(?:调整值)?(?:为|达到)?\\s*([+]?\\d+)\\s*(?:或更高|或以上)?`, "g"),
    (m, attr, num) => {
      const en = ABILITY_CN_TO_EN[attr];
      if (!en) return m;
      return `${en} ${num.startsWith("+") ? num : "+" + num}`;
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
