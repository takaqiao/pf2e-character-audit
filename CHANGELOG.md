# Changelog

## [0.1.25] - 2026-05-12
- **Reactive Striker regression fixed**: Additional Feats lookup now also accepts dedications by `-dedication` slug / name suffix / class category, not only by literal `dedication` trait. Translation-pack items that lose the trait now resolve correctly. `api.debugAF(actor)` exposed for diagnostics.
- **Spell DC reads effective rank**: now uses `entry.statistic.rank` (post-rule-element) instead of base `system.proficiency.value`. Eliminates false `RANK_BEHIND_PROGRESSION` warnings when system has already advanced via `Expert Spellcaster` etc.
- **Ritual / Innate / Focus entries skipped** from cantrip / slot-rank checks. Fixes `CANTRIP_COUNT_LOW: 仪式 = 0`.
- **Deity-granted spells exempt** from `SPELL_TRADITION_MISMATCH` / `SPELL_TRADITION_TRAIT_MISMATCH`: reads `deity.system.clericSpells` + domain spell lists. Focus + ritual spells also skipped from tradition checks.
- **Class-feature detection rewritten**: primary path derives expected features from `actor.class.system.items` (UUID-based); fallback table drops profile-level entries (Anathema/Deity/Edicts/Tenets) and adds bilingual name matching (Resolve↔聚能/铁心/决心, Alertness↔警觉/警戒). Eliminates the false positives on Cleric Anathema/Deity/Resolve/Alertness.

## [0.1.24] - 2026-05-12
- **NPC + companion audit** — `api.auditAny(actor)` dispatches by actor.type. New codes: `NPC_LEVEL_OUT_OF_RANGE`, `NPC_MISSING_TRAITS`, `NPC_AC_HP_OUT_OF_BAND`, `COMPANION_NO_MASTER`, `COMPANION_LEVEL_MISMATCH`.
- **Sheet header badge** — small colored pill on character sheet showing audit issue count (reads cached snapshot, no on-render audit).
- **Equipment proficiency** — `WIELDING_UNTRAINED_WEAPON`, `WEARING_UNTRAINED_ARMOR`, `SHIELD_AND_TWO_HANDED`, `MISSING_AMMO`.
- **Spell granularity** — `SPELL_SLOTS_PER_RANK_MISMATCH`, `CANTRIP_COUNT_LOW`, `FOCUS_POOL_OVER_FOCUS_SPELLS`, `FOCUS_POOL_OVER_CAP`, `SPELL_TRADITION_TRAIT_MISMATCH`.
- **Voluntary flaws** — `VOLUNTARY_FLAW_COUNT_WRONG`, `VOLUNTARY_FLAW_SAME_ATTRIBUTE`, `VOLUNTARY_FLAW_NO_MATCHING_BOOST`, `MANDATORY_FLAW_ON_REMASTER_ANCESTRY`.
- **Class-feature granular check** — `CLASS_FEATURE_NOT_PRESENT` for 22 classes' core auto-grants per level.
- **AoN rule citation links** — `{{aon code}}` Handlebars helper + `api.aon.getUrl()`.
- **Custom GM rules** — `customAuditRules` setting accepts JSON array with predicate-based rules (level/class/ancestry/HP/AC/traits/feats/skill).
- **Markdown / HTML exporters** — `api.exporters.toMarkdown / toHtml / saveMarkdown / saveHtml`, buttons added to audit footer.
- **Watch mode** — `watchModeActive` setting enables debounced live audit on any actor/item change.
- 20 new issue codes, 5 new settings, +60 i18n keys (EN/CN parity preserved at 274 each).

## [0.1.23] - 2026-05-12
- **Proficiency progression checks** — Fort/Ref/Will/Perception/Class DC/Spell DC vs class table for 26 classes. `RANK_BEHIND_PROGRESSION` (warn) when behind, `RANK_AHEAD_OF_PROGRESSION` (error) when ahead.
- **Skill rank min-level rule** — `SKILL_RANK_TOO_HIGH_FOR_LEVEL` (Expert ≥ L3, Master ≥ L7, Legendary ≥ L15).
- **Equipment audit** — item-level > char+2, invested > 10, duplicate runes, rune-level > char, ABP-rune conflict, GMC Treasure-by-Level low/high.
- **Cleric domain count check.**
- **Party coverage** — `crossPartyAnalysis`: untrained key skills, missing common languages, weak Fort/Ref/Will averages.
- **Auto-audit on level-up** — `updateActor` hook detects `system.details.level.value` change, whispers GM a summary chat card.
- **Snapshot diff API** — `api.diff.computeSnapshotDiff(report, prevSnapshot)` returns added/fixed/persistent counts.
- New settings: `enableEquipmentAudit`, `autoAuditOnLevelUp`.

## [0.1.22] - 2026-05-12
- Additional Feats lookup via archetype journal pack (UUID-based, language-independent).

## [0.1.21] - 2026-05-12
- Recognise Additional Feats rule (PC p.215). Reactive Striker via Ulfen Guard etc. no longer flagged.

## [0.1.20] - 2026-05-12
- Blocklist rank/skill words from Babele reverse-lookup (fixes `大师 → Maestro` collision in Kip Up).
- Strip stray `熟练度` token at end of normalization.

## [0.1.19] - 2026-05-12
- Pre-check prereqs against owned-item names before parsing (`乌尔芬卫士入门`, `治疗源泉`, `领域入门`).
- Babele reverse-map also scans world actors/items.
- `DEDICATION_2_FEAT_RULE` reads sourceId from 3 paths + publication-title fallback.
- Reverse-map cache TTL 60s.

## [0.1.18] - 2026-05-12
- `DEDICATION_2_FEAT_RULE`: drop archetype-trait gate; compendium index scanned for bilingual names.
- UI: party-audit button no-wrap, suppress button center-aligned.

## [0.1.17] - 2026-05-12
- UI: switch to Foundry-native CSS variables, drop custom palette/serif.

## [0.1.16] - 2026-05-12
- `DEDICATION_2_FEAT_RULE`: 4 parallel match methods (trait / slug-prefix / shared trait / same pack).
- Babele probe paths expanded; `api.debugBabele()` helper.
- Divine Font detection: rule selection → name heuristic → deity fallback.

## [0.1.15] - 2026-05-12
- Copy JSON now compact (~12 KB vs 140 KB). Verbose via `api.exporters.toJsonVerbose`.

## [0.1.14] - 2026-05-12
- `DEDICATION_2_FEAT_RULE`: match by trait, not slug prefix.
- `CLASS_SUBCLASS_MISSING`: accept bilingual keyword patterns.
- `SKILL_INCREASE_MISSING`: skip when v8 schema lacks data.
- CN normalizer: more skill aliases, strip trailing `技能`, gate `入门` fallback on Babele state.
- Publication filter chips (All / OGL / ORC / Legacy).

## [0.1.13] - 2026-05-11
- Inject hardcoded i18n fallbacks at `i18nInit` (works around stale lang cache).

## [0.1.12] - 2026-05-11
- Class feature presence checks: `CLASS_FEATURES_MISSING` + `CLASS_FEATURES_MISSING_SPECIFIC`.

## [0.1.11] - 2026-05-11
- Per-feat prereq suppress.
- History sparkline of last 5 snapshots.
- Quick-fix buttons on common completeness issues.

## [0.1.10] - 2026-05-11
- Prereq button reliably fires (was anchor, now button).
- Auto-grant detection also reverse-looks-up `itemGrants`.
- Deity favored-weapon prereqs demoted to info.
- Removed `ANCESTRY_FLAW_MISMATCH` (Remaster-incompatible).

## [0.1.9] - 2026-05-11
- Severity filter chips on Completeness / Prereq tabs.
- Audit history strip on Overview.
- Per-actor issue suppress.
- `STARTING_WEALTH_EXCEEDED`, `SPELL_PREPARATION_INCOMPLETE` checks.

## [0.1.8] - 2026-05-11
- UI: paper-and-ink palette w/ explicit hex colours and dark mode.
- Emoji removed in favour of FA icons.
- Prereq titles clickable.
- `HP_UNDER_EXPECTED`, `LEVEL_UP_PENDING` checks.

## [0.1.7] - 2026-05-11
- Background-granted skill training check.
- Spell tradition mismatch check.
- CHANGELOG split (brief here, detail in `CHANGELOG-detailed.zh.md`).

## [0.1.6] - 2026-05-11
- Babele auto-translation of CN prereq refs.
- Subclass-selection completeness check across 24 classes.
- More CN prereq patterns (`X入门`, `X学识`, attribute scores, focus/spellstrike/divine font).

## [0.1.5] - 2026-05-11
- Skip prereq check on auto-granted feats.
- Skip ancestry-flaw check on Remaster ancestries.

## [0.1.4] - 2026-05-11
- "Maestro muse" / RK-skill / v8 skill-rank reads / hardcoded WCAG colours.

## [0.1.3] - 2026-05-11
- CN prerequisite preprocessor.
- UI repaint w/ explicit severity colour tokens + dark theme.

## [0.1.2] - 2026-05-11
- 6 bug fixes from real-world testing (header bloat, language count, feat slot shapes, CN severity, party layout, party i18n).
- Dual-register `cn` + `zh-CN` language codes.

## [0.1.1] - 2026-05-10
- Fix missing `evaluateRequirementNode` export.

## [0.1.0] - 2026-05-10
- Initial release. Publication / Prereq / Completeness detectors (20+ rules). Variant detection (ABP/FA/Dual/Gradual/Stamina/PWL). 4 UI entry points. ApplicationV2 reports. Chat/Journal/JSON exporters. Bilingual (EN/zh-CN).
