# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
