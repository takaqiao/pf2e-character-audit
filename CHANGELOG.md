# Changelog

User-facing release notes for PF2e Character Audit.
For full engineering history see [CHANGELOG-detailed.zh.md](CHANGELOG-detailed.zh.md).

## [0.1.7] - 2026-05-11

### Added
- Background-granted trained skill check — flags if a character's background skill is not actually trained.
- Spell tradition mismatch check — warns if a caster owns spells from a tradition other than their spellcasting entry's.

### Changed
- CHANGELOG split: brief English notes (this file) for end users; full details in CHANGELOG-detailed.zh.md.

## [0.1.6] - 2026-05-11

### Added
- Auto-detects loaded Babele translation packs (pf2e_compendium_chn, pf2e-compendium-extra-cn, etc.) and uses them to translate Chinese prereq references back to English on the fly. No hardcoded dictionary needed.
- New completeness check: required subclass selection per class (Bard muse, Cleric doctrine, Barbarian instinct, Sorcerer bloodline, Wizard school, etc. — 24 classes covered).
- More Chinese prereq patterns recognized: "X入门" (Dedication), "X学识受训" (Lore trained), "魅力14" (attribute), focus pool, spellstrike, arcane cascade, divine font, …

## [0.1.5] - 2026-05-11

### Fixed
- Skip prereq check on feats auto-granted by class features (fixes false errors on Cleric's Deadly Simplicity, Shield Block, etc., which Warpriest grants automatically).
- Skip ancestry-flaw check on Remaster ancestries (Remaster removed mandatory flaws from Orc, Half-Orc, Half-Elf).

## [0.1.4] - 2026-05-11

### Fixed
- "Maestro muse" prereq false-fail: maps Chinese subclass selectors directly to feat names so the prereq engine can find the actor's muse/instinct/bloodline pick.
- "Recall Knowledge skill" prereq false-fail: expands to OR of all 7 standard RK skills.
- Skill rank reading on PF2E v8: tries `actor.skills.<slug>.rank` before falling back to `actor.system.skills`.
- UI contrast: removed FVTT theme variable dependencies that broke colours in some themes; all severity colors now hardcoded and WCAG AA verified, with dark-mode auto-switch.

## [0.1.3] - 2026-05-11

### Added
- Chinese prerequisite preprocessor: translates common patterns ("X技能熟练度为受训", "在你神祇的偏好武器上受训", "大师缪斯", …) to English before parsing.
- Normalized requirement shown under the original on the report.

### Changed
- Full UI repaint with explicit colour tokens per severity, dark theme support, card-style issues, pill-style level badges.

## [0.1.2] - 2026-05-11

### Fixed
- Character sheet header no longer bloats when the audit button is injected.
- LANGUAGE_OVER_LIMIT false positives: now correctly subtracts ancestry-granted languages before comparing.
- Class/Skill/General feat slot tables read both array and `{value: []}` shapes from the class item.
- Chinese prereqs no longer flood the report as warnings (demoted to info).
- Party member list layout no longer collapses to a single line.
- Party audit's Completeness tab now localizes issue text.

### Added
- Dual-registers `cn` + `zh-CN` language codes so legacy Foundry locales also get Chinese.

## [0.1.1] - 2026-05-10

### Fixed
- Module failed to load due to missing `evaluateRequirementNode` export.

## [0.1.0] - 2026-05-10

### Added
- Initial release. Three audit detectors:
  - **Publication audit** — scans every owned item for source title, license (OGL/ORC), and Remaster status.
  - **Prerequisite verification** — parses each feat's prerequisites and evaluates against the actor (tristate: pass / fail / unknown).
  - **Build completeness** — checks attribute boosts, languages, ancestry/heritage/background/class presence, feat slots, skill increases, apex item, dual class, starting equipment, and more.
- Variant rule detection: ABP, Free Archetype, Dual Class, Gradual Boosts, Stamina, Proficiency Without Level.
- Four entry points: character sheet header, party sheet header, Actors directory toolbar, Actors directory right-click menu.
- ApplicationV2 reports for single-character and whole-party audits.
- Three exporters: whisper to chat, export to journal entry, copy JSON.
- Bilingual UI (English + Simplified Chinese).
- Settings for per-detector toggles, severity overrides, publication whitelist, variant overrides.
