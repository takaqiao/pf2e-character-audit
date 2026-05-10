# PF2e Character Audit

> **中文** | [English](#english)

为 Foundry VTT v14 + Pathfinder 2nd Edition 系统打造的"尽可能完善的车卡检测器"。

## 功能

集合三类检测：

1. **出版物来源审计** — 扫描角色身上每件 item 的 `system.publication.title` / `license` / `remaster`，按出版物分组汇总（同时识别 legacy `system.source` 字段、自定义 Lore、未知来源）。
2. **专长前置条件验证** — 对角色已学的每个 feat，解析其 `system.prerequisites.value` 并与角色当前状态比对，标记不满足或无法解析的条目。
3. **车卡完整性检测** — 自动核对 6 项属性 boost 槽位、语言数量、祖先 / 背景 / 职业 / heritage 是否齐全、各类专长槽位、技能熟练度提升数量、Apex 物品（17+）、Free Archetype 槽位、Dual Class 状态、起始装备等 20+ 项规则。

## UI 入口

模组装载后，GM 在 4 个位置都能触发：

- 角色卡（character sheet）顶栏的"📋 审计"按钮
- Party sheet 顶栏的"👥 审计 Party"按钮
- Actors 目录面板顶栏的"审计 Party"按钮
- Actors 目录中右键单个 actor 的"审计该角色"菜单

也可通过 macro / console 调用 API：

```js
const api = game.modules.get("pf2e-character-audit").api;
api.openAuditApp(token.actor);            // 单角色
api.openPartyApp();                       // 全队
const report = api.auditActor(actor);     // 拿到 JSON 报告
```

## 设置

在 `游戏设置 → 模组设置 → PF2e Character Audit` 下：

- 三类检测的总开关
- 未知前置条件的严重度（信息 / 警告 / 错误）
- 出版物白名单（JSON 数组）
- 许可证过滤（全部 / 仅 ORC / 仅 OGL）
- Free Archetype / ABP 检测策略（auto / 强制 on / 强制 off）
- 是否允许玩家触发审计

## 兼容性

- Foundry VTT v13 / v14
- PF2e System v7+

## 致谢 (Acknowledgements)

本模组的前置条件检测引擎（`scripts/prereq/parsers.js`、`matchers.js`、`checker.js`）借鉴自 [RoiLeaf](https://github.com/roi007leaf) 的 [pf2e-leveler](https://github.com/roi007leaf/pf2e-leveler)（v3.4.7），原作以 MIT 许可发布。

出版物审计逻辑迁移自原独立 Macro（`pf2e-party-publication-audit.js`）。

## 许可

MIT License — 见 [LICENSE](LICENSE)。

---

<a name="english"></a>

## English

A comprehensive PF2e character sheet validator for Foundry VTT v14:

- **Publication Source Audit** — scans every owned item's `system.publication.title` / `license` / `remaster` field, tolerates legacy `system.source`, surfaces homebrew and custom Lore.
- **Prerequisite Verification** — parses each owned feat's prerequisites and evaluates them against actor state. Tristate result (pass / fail / unknown) with configurable severity for unknowns.
- **Build Completeness Check** — verifies attribute boost slots, language counts, ancestry/heritage/background/class presence, feat slots (ancestry / class / skill / general / archetype / Free Archetype), skill increases, apex item, dual class, starting equipment, and 20+ other rules.

### Entry Points

- "📋 Audit" button on character sheet header
- "👥 Audit Party" button on party sheet header
- "Audit Party" button in Actors directory toolbar
- "Audit Character" right-click context menu in Actors directory
- Macro / console: `game.modules.get("pf2e-character-audit").api.openAuditApp(actor)`

### Compatibility

- Foundry VTT v13 / v14
- PF2e System v7+

### Acknowledgements

The prerequisite engine (`scripts/prereq/`) is adapted from [pf2e-leveler v3.4.7](https://github.com/roi007leaf/pf2e-leveler) by RoiLeaf (MIT-licensed).

### License

MIT — see [LICENSE](LICENSE).
