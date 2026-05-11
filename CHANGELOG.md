# Changelog

User-facing release notes for PF2e Character Audit.
For full engineering history see [CHANGELOG-detailed.zh.md](CHANGELOG-detailed.zh.md).

## [0.1.16] - 2026-05-12

### Fixed
- **`DEDICATION_2_FEAT_RULE` still firing 0/2 on community-content archetypes** (e.g. Ulfen Guard from *Lost Omens: Shining Kingdoms*). Follow-up detection now uses four parallel methods:
  1. Trait equals the archetype slug.
  2. Feat slug starts with the archetype name.
  3. Shares any distinctive (non-generic) trait with the dedication.
  4. Same compendium pack as the dedication. Catches modules that don't tag follow-ups with the archetype slug as a trait.
- **Babele reverse-lookup empty / Chinese references not resolving** (`乌尔芬卫士入门` → "乌尔芬卫士 Dedication" instead of "Ulfen Guard Dedication"). Probe list expanded to 9 API paths covering newer Babele layouts. If the map ends up empty the module now logs a warning to the console pointing to a diagnostic helper.
- **Healing Font / 治疗源泉 prereq stuck on "unknown"**: `deriveDivineFont` now checks the Divine Font feat's `flags.pf2e.rulesSelections.font`, falls back to a name-based heuristic (`heal|治疗` / `harm|伤害` in the feat name), and finally the deity's declared font(s).

### Added
- `game.modules.get("pf2e-character-audit").api.debugBabele()` — prints Babele's exposed objects and the size of the reverse-lookup map. Run it from the console if Chinese feat names aren't resolving.

## [0.1.15] - 2026-05-12

### Changed
- **"Copy JSON" now exports a compact report** stripped of fields that bloat shared debug pastes:
  - `publication.byCategory` (every owned item listed per category) — removed
  - `publication.titles` (duplicate of `actorRollup`) — removed
  - `prerequisites.issues[].tree` (parser internal state) — removed
  - `prerequisites.issues[].featUuid` (duplicate of `featId`) — removed
  - `completeness.slots` (expected slot table) — removed
  - `history` (kept only `previousSnapshot`)
  - `crossPartyPublication.byTitle[].actorBreakdown` — removed
- Typical 11-level character: full report ~140 KB → compact ~12 KB.
- The full verbose report is still available via `game.modules.get("pf2e-character-audit").api.exporters.toJsonVerbose(report)` for parser-level debugging.

## [0.1.14] - 2026-05-12

### Fixed
- **`DEDICATION_2_FEAT_RULE` counted wrong**: was matching follow-up archetype feats by slug prefix (e.g. expecting "ulfen-guard-*" slugs), but PF2e marks follow-ups via a trait on the feat (e.g. trait `ulfen-guard`). Now uses traits, so Ulfen Guard / Exemplar / etc. follow-ups are counted correctly.
- **`CLASS_SUBCLASS_MISSING` false-positive on community content** (e.g. Clerics+'s "Armorclad" doctrine): in addition to the canonical slug list, now accepts any class-feature item whose name matches a bilingual keyword pattern for the expected feature (`doctrine|信条|教条`, `muse|缪斯`, `instinct|本能`, …).
- **`SKILL_INCREASE_MISSING` always reporting 0 actual** on PF2e v8: the new actor schema doesn't always populate `actor.system.build.skills.increases`. The check now silently skips when no data is available rather than producing false errors.
- **CN normalizer**:
  - Added skill aliases: `特技/体技` → Acrobatics, `奥术/奥法` → Arcana, plus alternates for every standard skill (so different translation packs all work).
  - Trailing `技能` tokens left over from compound prereqs (e.g. "Athletics技能 and Intimidation技能") are now stripped.
  - "`<X>入门 → <X> Dedication`" fallback only fires when Babele's reverse-lookup didn't already translate the term. Stops "领域入门 Domain Initiate" being miscalled "Domain Dedication".

### Added
- **Publication source filter chips** on the Publication tab: All / OGL only / ORC only / Legacy (non-Remaster). Lets you find every pre-Remaster item in a party for a quick cleanup pass.

## [0.1.13] - 2026-05-11

### Fixed
- **Raw translation keys (e.g. `PF2E-CA.Label.Errors`) showing in the UI** when a user updates the module mid-world. Foundry caches the lang JSON at world launch and doesn't re-read it on file change, so newly-added keys appear unlocalized until the world restarts. We now inject hardcoded English fallbacks into `game.i18n.translations` during the `i18nInit` hook for ~40 commonly-used keys, so the UI stays readable even with a stale cache.

## [0.1.12] - 2026-05-11

### Added
- **Class feature presence checks**:
  - `CLASS_FEATURES_MISSING` (warn): actor has a class but zero class features.
  - `CLASS_FEATURES_MISSING_SPECIFIC` (warn): cross-references the class's auto-grant list (`class.system.items`) with the actor's owned compendium sourceIds and lists the names of any missing entries.
- Both have quick-fix buttons that open the class sheet.

## [0.1.11] - 2026-05-11

### Added
- **Per-feat prereq suppress**: each prereq issue now has its own "Ignore" button. Stored in `flags.pf2e-character-audit.suppressedFeats` per actor; the rule code suppress (existing) is independent.
- **History sparkline**: actor flag now keeps the last 5 audit snapshots. Overview's Δ strip renders a tiny inline bar chart so you can see whether issues are trending up or down.
- **Quick-fix buttons** on common completeness issues:
  - `MISSING_ANCESTRY/HERITAGE/BACKGROUND/CLASS` → opens the relevant compendium so you can drag from it.
  - `CLASS_SUBCLASS_MISSING` → opens the classes compendium.
  - `MISSING_KEY_ABILITY` → opens the class item sheet.
  - `LANGUAGE_OVER/UNDER_LIMIT`, `BACKGROUND_SKILL_NOT_TRAINED`, `HP_UNDER_EXPECTED`, `STARTING_WEALTH_EXCEEDED`, `SPELL_LIST_INCOMPLETE`, `SPELL_PREPARATION_INCOMPLETE` → opens the actor sheet.
  - `LEVEL_UP_PENDING` → if pf2e-leveler is installed, opens its level planner; otherwise bumps `system.details.level.value` by 1.
  - `STARTING_EQUIPMENT_EMPTY`, `APEX_MISSING_AT_17` → opens the equipment compendium.

## [0.1.10] - 2026-05-11

### Fixed
- **Prereq title click did nothing**: replaced `<a>` with `<button>` so the action listener reliably fires.
- **Deadly Simplicity (and similar) still flagged after 0.1.5**: the auto-grant detection now also does a reverse lookup — any actor item that lists a feat in its `flags.pf2e.itemGrants` counts as "system already vetted this", not just `flags.pf2e.grantedBy` on the feat itself. Older imports and manually-copied feats now skip prereq re-validation correctly.
- **Deity favored-weapon prereqs**: when a feat's prerequisite is "your deity's favored weapon is …" or "在你神祇的偏好武器上 …", any parser-reported failure is downgraded to info (the matcher can't read deity weapon-category data; the false-positive isn't worth it).
- **Removed ANCESTRY_FLAW_MISMATCH** entirely: mandatory ability flaws are gone in the Remaster era and the field is too unreliable across migrated/homebrew ancestries to be useful.

### Notes
- Module hot-reload only covers css/hbs/json. After updating the module zip, hit **F5** in Foundry to pick up new JavaScript.

## [0.1.9] - 2026-05-11

### Added
- **Severity filter chips** on the Completeness and Prerequisites tabs (All / Errors / Warnings / Info).
- **Audit history strip** at the top of the Overview tab — shows relative time of the last run and per-severity delta (+/−).
- **Suppress / ignore issues** per actor — click the eye-slash button on a completeness issue to silence that rule for this character. "Clear ignore list" in overview when any are active.
- **`STARTING_WEALTH_EXCEEDED`** (info): flags level-1 characters with more than 15 gp of coin.
- **`SPELL_PREPARATION_INCOMPLETE`** (warn): for prepared casters, counts un-prepared slots and notes the total.

### Fixed
- Prereq issue "open item" link now uses each feat's full UUID (works in both single-actor and party-audit views; previously broken in party view).

## [0.1.8] - 2026-05-11

### Changed
- UI overhaul: switched to a paper-and-ink palette that fits alongside PF2e's own document chrome. Serif headings, sepia accents, hardcoded hex colours with explicit dark-mode tokens (no theme variable inheritance).
- All emoji removed from UI text, settings labels, and exports — Font Awesome icons used instead for consistent typography.
- Prereq issue titles are now clickable links that open the offending feat.
- Tighter spacing throughout; cleaner tab strip; subtle accent ring on active party member.

### Added
- `HP_UNDER_EXPECTED` check: warns when an actor's max HP is below the baseline ancestry + (class + CON) × level — catches forgotten level-ups.
- `LEVEL_UP_PENDING` check: info-level note when XP has reached the threshold but the level hasn't been bumped.

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
