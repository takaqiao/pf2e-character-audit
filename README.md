# PF2e Character Audit

> **中文** | [English](#english)

为 Foundry VTT v14 + Pathfinder 2nd Edition 系统打造的车卡检测器，覆盖出版物来源、专长前置、构建完整性、熟练度进阶、装备合法性、跨队覆盖等 60+ 规则。

## 主要检测面

| 域 | 检查内容 |
|---|---|
| 出版物 | 来源 / OGL/ORC 许可 / Remaster 标记，跨队聚合 |
| 专长前置 | 解析 + 双语正则化 + 神祇授予豁免 + Additional Feats (PC p.215) 路径识别 |
| 构建完整性 | 属性 boost / 语言 / 祖先 / 背景 / 职业 / heritage / 各类专长槽位 / 技能熟练度提升 / Apex / Free Archetype / Dual Class / 起始装备 / HP / 升级阈值 / 起始财富 / 子类选择 (24 职业) / Divine Font / Dedication 2-feat 规则 |
| 熟练度进阶 | Fort/Ref/Will/Perception/Class DC 对照 26 职业表；技能 rank 最低等级铁律 (E≥3 / M≥7 / L≥15) |
| 装备 | 物品级别 vs 角色级别 / 投契物品 10 上限 / 符文叠加合法性 / ABP 冲突 / GMC Treasure-by-Level / 未受训武器·甲胄 / 双手武器+盾冲突 / 缺弹药 |
| 法术 | 法术位 / 戏法数 / 聚能池 / 单法术传统冲突 (跳过 ritual/innate/focus) |
| 牧师专项 | Domain 法术数 vs Initiate+Advanced feat 数 |
| 自愿弱点 | 0/2 数量铁律 + 同属性禁止 + 对应免费提升 |
| 跨队 (Party) | 出版物聚合 / 关键技能覆盖 / 常用语言覆盖 / Fort·Ref·Will 平均豁免预警 |
| NPC / 伙伴 | 等级范围 / Building Creatures AC·HP 区间 / 主人关联 / 等级匹配 |
| 自定义 | GM 在 settings 写 JSON 规则数组，10+ 谓词组合 |

## UI / 入口

- 角色卡 header `📋 审计` 按钮
- 角色卡 header 旁徽章显示当前问题数（红/黄/绿）
- Actors 目录顶栏 `审计 Party` + 右键 `审计该角色`
- Party sheet `审计全队`
- **升级自动审计**：检测 `system.details.level.value` 变化时悄悄话推送 GM 摘要
- **Watch 模式**：可选 setting，actor/item 数据变化时 800ms 防抖自动重审

## 导出

聊天 (whisper GM) / Journal 条目 / JSON / **Markdown** / **HTML**（每个 issue 自带 AoN 规则跳转链接 `{{aon code}}`）

## API

```js
const api = game.modules.get("pf2e-character-audit").api;
api.openAuditApp(token.actor);              // 单角色 UI
api.openPartyApp();                         // 全队 UI
api.auditActor(actor);                      // JSON 报告（character）
api.auditNpcOrCompanion(actor);             // NPC / 灵宠 / 同伴
api.auditAny(actor);                        // 按 type 自动分派
api.audit.publication / .prerequisite / .completeness / ...  // 单维度
api.exporters.toMarkdown(report);
api.diff.computeSnapshotDiff(report, prevSnapshot);
api.debugAF(actor);                         // Additional Feats 诊断
api.debugBabele();                          // Babele 反查诊断
```

## Settings 摘要

`game settings → module settings → PF2e Character Audit`：
三类总开关、装备审计、法术细节、自定义规则、升级自动审计、Watch 模式、Player 是否可触发、出版物白名单 (JSON)、许可证过滤、Legacy source 严重度、Free Archetype / ABP 策略、未知前置严重度、Dual Class 深检。

## 兼容性

- Foundry VTT v13 / v14
- PF2e System v7+
- 自动适配 Babele + pf2e_compendium_chn / pf2e-compendium-extra-cn（中文 prereq 文本自动 normalize；archetype "补充专长" 与英文 "Additional Feats" 同源处理）

## 致谢

前置条件解析引擎 (`scripts/prereq/parsers.js / matchers.js / checker.js`) 借鉴自 [RoiLeaf](https://github.com/roi007leaf) 的 [pf2e-leveler](https://github.com/roi007leaf/pf2e-leveler) (v3.4.7, MIT)。出版物审计逻辑迁移自原独立 Macro。

## 许可

MIT — 见 [LICENSE](LICENSE)。

---

<a name="english"></a>

## English

A character-sheet validator for Foundry VTT v14 + Pathfinder 2nd Edition. Covers publication source, feat prerequisites, build completeness, proficiency progression, equipment legality, cross-party coverage, and 60+ rules in total.

### Coverage

- **Publication** — source / OGL/ORC license / Remaster, cross-party rollup.
- **Prerequisites** — parser + bilingual normalization + deity-granted-spell exemption + Additional Feats rule (PC p.215) recognition.
- **Build completeness** — 25+ rules: ability boosts, languages, ancestry/heritage/background/class, feat slots, skill increases, apex, Free Archetype, Dual Class, starting equipment, HP, level-up XP threshold, starting wealth, subclass selection (24 classes), Divine Font, Dedication-2-feat rule.
- **Proficiency progression** — Fort/Ref/Will/Perception/Class DC vs class table for 26 classes. Skill rank min-level rule (Expert ≥ 3, Master ≥ 7, Legendary ≥ 15).
- **Equipment** — item-level vs character, investiture cap, rune stacking, ABP-rune conflict, Treasure-by-Level, untrained weapon/armor, shield + two-handed conflict, missing ammo.
- **Spell detail** — slot counts per rank, cantrip count, focus pool, per-spell tradition mismatch (skips ritual/innate/focus entries; honors deity bonus spells).
- **Cleric domains** — focus pool size vs Initiate + Advanced feats.
- **Voluntary flaws** — count, attribute distinctness, matching boost.
- **Cross-party** — publication rollup, key skill coverage, language coverage, save-vulnerability heat check.
- **NPC / companion** — level range, AC/HP vs Building Creatures benchmark, master linkage.
- **Custom rules** — JSON predicate engine in world setting.

### UI / Entry Points

- Character-sheet header `📋 Audit` button + count badge
- Actors directory toolbar `Audit Party`
- Actors directory context `Audit Character`
- Party sheet `Audit Whole Party`
- Auto-audit on level-up (GM-only whisper)
- Optional Watch Mode (live re-audit on actor/item change)

### Exporters

Chat / Journal / JSON / **Markdown** / **HTML** (each issue includes an AoN rule-link button).

### API

```js
const api = game.modules.get("pf2e-character-audit").api;
api.auditActor(actor);
api.auditAny(actor);             // dispatches by actor.type
api.exporters.toMarkdown(report);
api.diff.computeSnapshotDiff(report, prevSnapshot);
```

### Compatibility

- Foundry VTT v13 / v14
- PF2e System v7+

### Acknowledgements

Prerequisite engine adapted from [pf2e-leveler v3.4.7](https://github.com/roi007leaf/pf2e-leveler) by RoiLeaf (MIT). Publication audit logic migrated from the original standalone macro.

### License

MIT — see [LICENSE](LICENSE).
