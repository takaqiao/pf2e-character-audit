# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
