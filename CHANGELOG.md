# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.6] - 2026-05-11

### Added
- **Babele 反向查表**（`scripts/utils/babele-bridge.js`）: 在第一次审计时，自动扫描已加载的 Babele 翻译模组（pf2e_compendium_chn、pf2e_cn 等），构建 `中文名 → 英文 canonical 名`映射表。这一步在 CN normalizer 的最前面跑，让"鲁莽骑手入门"这种被翻译模组覆盖到的引用直接还原为英文（"Reckless Rider Dedication"），不需要我维护硬编码字典。覆盖 pf2e_compendium_chn 中 **1700+ 个 dedication 模式**和 **2000+ 个 plain CJK 引用**。

- **CN normalizer 新模式**:
  - `<X>入门` → `<X> Dedication`（fallback，Babele 没装时用）
  - `<X>学识受训` → `trained in <X> Lore`（简写形式，无"熟练度"）
  - `<ability><num>` 紧凑形式（如"魅力14"）→ `Charisma 14`
  - 自动剥离尾部"。"等终止标点
- **CN normalizer 词表扩充**: 聚能池/法术打击/奥术奔涌/神力源泉/觉醒阶段/能够施法 等 10+ 个常见 class feature 名

- **新检查 `CLASS_SUBCLASS_MISSING`**: 验证职业的子类选项在 1 级时已确定。覆盖 24 个职业（Bard 缪斯/Cleric 信条/Sorcerer 血裔/Wizard 学派/Druid 教派/Champion 事业/Barbarian 本能/Ranger 猎人之锋/Rogue 突袭风格/Witch 渊源/Alchemist 研究领域/Investigator 调查方法/Swashbuckler 突袭风格/Oracle 神秘事项/Psychic 意识心智/Magus 混合研究/Inventor 改造/Kineticist 能门/Summoner 万灵/Gunslinger 路线/Animist 灵显/Commander 旗帜 等）。如果对应子类专长 slug 不在 actor 的 feats 里，报 error。

### Changed
- prereq 步骤现在以 `applyReverseLookup` 开头，跑完仍有 CJK 才走后续 regex 路径。

[0.1.6]: https://github.com/takaqiao/pf2e-character-audit/releases/tag/0.1.6

## [0.1.5] - 2026-05-11

### Fixed
- **Auto-granted feats误报为不达成 prereq**: 由 class feature 自动授予的 feat（如 Warpriest 信条自动给的"简单致命 Deadly Simplicity"和"盾牌格挡 Shield Block"）现在跳过 prereq 校验。这些 feat 的存在本身就是系统的保证，重新校验只会得到假阳性（例如 Acavna 的偏好武器是简易武器但我的 matcher 不会解析）。检测方式：`feat.flags.pf2e.grantedBy` 存在即跳过。
- **Remaster 祖先误报 ANCESTRY_FLAW_MISMATCH**: 重铸后兽人/半兽人/半精灵等不再有强制属性贬值，但旧的检查逻辑仍按 legacy 规则要求 flaw。现在通过 `actor.ancestry.system.publication.remaster === true` 检测 Remaster 祖先并跳过 flaw 检查，避免对 Player Core 时代的用户产生噪音。

[0.1.5]: https://github.com/takaqiao/pf2e-character-audit/releases/tag/0.1.5

## [0.1.4] - 2026-05-11

### Fixed
- **「绕梁组曲」"大师缪斯" 误报为不达成 prereq**: leveler 的 parser 把 "Maestro muse" 解成 slug `maestro-muse`（带连字符），但 actor 的实际 feat slug 是 `maestro`。CN normalizer 现在直接把 "大师缪斯" 翻成 `Maestro`（不带 muse 后缀），让 leveler 走 `matchFeat` 路径命中 actor's feat。同样修复了：丹心/宝典/战士缪斯、所有野蛮人本能、术士血裔、牧师信条、勇士事业。
- **Recall Knowledge prereq 不识别 Lore 技能**: leveler 的 `matchRecallKnowledgeSkill` 只检查 7 个标准技能。现在 CN normalizer 把"一个能用来回忆知识的技能熟练度为受训"展开成 7 个 RK 技能的 OR（`trained in Society or trained in Arcana or ...`），让 leveler 用 `matchSkill` 逐个检查 — 任意一个达成即通过。
- **deriveSkills 对 PF2E v8 路径不兼容**: 部分 PF2E 版本通过 `actor.skills.<slug>.rank` 暴露技能（不是 `actor.system.skills`）。现在两个路径都尝试，并支持 flat-number fallback。
- **总览/出版物/卡片仍有低对比度文字**: 之前 CSS 用 FVTT 主题变量做 fallback（如 `var(--color-bg-option, #fdfdfd)`），主题不同时 bg/text 配色会失效。**完全移除主题变量依赖**，改用硬编码 hex 调色板（`--ca-surface: #ffffff`、`--ca-text: #111827` 等），通过 `prefers-color-scheme: dark` 与 FVTT 的 `body.theme-dark` 检测做暗色适配。所有文字-背景组合通过 WCAG AA 对比度验证。

### Changed
- **整体视觉打磨**: 新的 hard-coded 配色，issue 卡片背景改为完整的 severity 色块（不再是 white bg + 严重度边框）—— 看一眼就知道严不严重。
- **细节增强**: 角色卡 header 等级标签换成蓝色 pill；party member 列表用阴影 + accent border 凸显选中态；overview 卡片加 box-shadow；details/summary 用自定义箭头替代默认 marker。

[0.1.4]: https://github.com/takaqiao/pf2e-character-audit/releases/tag/0.1.4

## [0.1.3] - 2026-05-11

### Added
- **Chinese prerequisite support** (`scripts/prereq/cn-normalizer.js`): a CN→EN preprocessor that translates common patterns ("X技能熟练度为受训" → "trained in X", "在你神祇的偏好武器上受训" → "trained in your deity's favored weapon", "大师缪斯" → "maestro muse" etc.) before passing to pf2e-leveler's parser. Covers all 16 PF2e core skills, 14 ancestries, 24 classes, attribute names, and common subclass features. Uses lazy regex captures so "技能" suffix doesn't get swallowed.
- **Normalized requirement display**: when CN normalization happens, the report shows the translated text under the original (e.g. `→ trained in Medicine`) so users can see what got translated.

### Changed
- **Full UI repaint** (`styles/audit.css`):
  - Explicit fg/bg/border tokens per severity (error/warn/info/ok) — guaranteed contrast, no more "yellow background + gray text" unreadable combos.
  - Dark theme support via CSS variable overrides under `.theme-dark` / `body.dark-theme`.
  - Card-style issue items with hover lift and left accent border.
  - Pill-style level badge in headers; segmented status counts.
  - Cleaner tab bar with active underline and accent color.
  - Polished party member rows (rounded, accent ring on active).
  - Better `<details>`/`<summary>` styling for grouped lists.
  - Dashed empty-state cards.

### Fixed
- **Severity regex broken**: `severityForEvaluation` had a malformed regex (`[^ -\s\p{P}]`) that never triggered correctly. Replaced with the proper `hasCJK()` check from cn-normalizer.
- **`Set.list` hack residue** in `build-state.js` removed (no consumer was reading it).

[0.1.3]: https://github.com/takaqiao/pf2e-character-audit/releases/tag/0.1.3

## [0.1.2] - 2026-05-11

### Fixed
- **Character sheet header bloat**: switched the header button from `<button class="header-control">` to `<a class="header-control" data-tooltip="...">`, matching FVTT v14 / pf2e-leveler conventions so the header no longer expands.
- **`LANGUAGE_OVER_LIMIT` false positives**: `system.build.languages.max` is the cap on *additional* selectable languages, not total. Now the check subtracts ancestry-granted languages before comparing.
- **`classFeats` / `skillFeats` / `generalFeats` slot tables empty**: `actor.class.system.classFeatLevels` is `{value: [...]}` not a bare array. `slot-tables.js` now reads both shapes, so e.g. Barbarian's level-1 class feat is correctly required.
- **Chinese prereq text reported as warnings**: pf2e-leveler's prerequisite parser is English/French only. When the requirement text contains CJK characters (translated PF2e packs), unknown evaluations are now demoted to `info` so the report isn't a sea of yellow warnings.
- **Party audit member list layout broken**: `<button>` flex column layout was being overridden by FVTT base styles. Switched to `<div role="button">` with explicit `member-row` block children.
- **Party audit completeness issues showed raw i18n keys**: localized `selected` report's completeness issues in `PartyAuditApp._prepareContext` (already done in `AuditReportApp`).

### Added
- **Legacy `cn` language code**: registered the `cn` lang code alongside `zh-CN` so users on older FVTT locale settings get Chinese text. Matches the dual-registration pattern used by pf2e-xp-tool.

[0.1.2]: https://github.com/takaqiao/pf2e-character-audit/releases/tag/0.1.2

## [0.1.1] - 2026-05-10

### Fixed
- `checker.js` did not export `evaluateRequirementNode`, causing the module to fail to load with `SyntaxError: The requested module '../prereq/checker.js' does not provide an export named 'evaluateRequirementNode'`.

[0.1.1]: https://github.com/takaqiao/pf2e-character-audit/releases/tag/0.1.1

## [0.1.0] - 2026-05-10

### Added
- Initial release.
- Three audit detectors:
  - Publication source audit (migrated from `pf2e-party-publication-audit.js` macro).
  - Prerequisite verification (engine adapted from pf2e-leveler v3.4.7 by RoiLeaf, MIT-licensed).
  - Build completeness check covering 20+ rules (boosts, languages, feat/skill-increase slots, apex item, dual class, starting equipment, spell list, ancestry flaws, etc.).
- Variant rule detection (ABP, Free Archetype, Dual Class, Gradual Boosts, Stamina, Proficiency Without Level).
- Four UI entry points: character sheet header, party sheet header, Actors directory toolbar, Actors directory right-click menu.
- ApplicationV2-based AuditReportApp (single character) and PartyAuditApp (whole party).
- Three exporters: whisper to chat, journal entry, JSON copy.
- Bilingual i18n (en + zh-CN, zh-CN primary).
- 13 settings (per-detector toggles, unknown-prereq severity, publication whitelist, license filter, variant overrides).

[0.1.0]: https://github.com/takaqiao/pf2e-character-audit/releases/tag/0.1.0
