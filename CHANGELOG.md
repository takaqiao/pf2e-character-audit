# Changelog

User-facing release notes for PF2e Character Audit.
For full engineering history see [CHANGELOG-detailed.zh.md](CHANGELOG-detailed.zh.md).

## [0.1.21] - 2026-05-12

### Fixed
- **Additional Feats rule (Player Core p. 215) now respected**: some archetypes (Ulfen Guard, Eagle Knight, Blackjacket, …) list feats from *other* classes in their "Additional Feats" section. When a feat is taken via that path, the original Dedication prereq (typically `Fighter Dedication`) is replaced by the archetype's own dedication, and the original class trait is dropped. The feat item in the compendium still carries its **original** prereq text, so the parser used to flag false positives — e.g. `反应打击者 Reactive Striker` failing on a Cleric/Ulfen Guard because they lack Fighter Dedication, even though Ulfen Guard's Additional Feats list includes Reactive Striker. Fix: after the parser returns fail, the audit scans every owned dedication's description for an `Additional Feats` / `额外专长` section and looks for the current feat's name. If found, the prereq is treated as satisfied via that archetype.

## [0.1.20] - 2026-05-12

### Fixed
- **Kip Up / 鲤鱼打挺 false-fail (`大师 → Maestro` collision)**: 0.1.19's world-scan expanded the Babele reverse-map enough that generic rule words started colliding with proper-noun entries. A bilingual item literally named `大师 Maestro` (Bard's Maestro muse — or any creature/NPC named "Maestro") was registered as `大师 → Maestro`, then applied to prereq text BEFORE the rank-pattern regex could match, producing the broken `Acrobatics熟练度 is Maestro`. Fixed by adding `RESERVED_GENERIC_TOKENS` blocklist to `applyReverseLookup` — rank words, skill names, ability scores, and structural particles are never replaced via reverse-lookup; they're handled by the cn-normalizer's regex patterns where context guarantees correctness.
- Defensive sweep: any stray `熟练度` token that escapes the rank-pattern capture is now stripped at end of normalization.

### Notes on remaining "fails"
- `乌尔芬卫士入门 Ulfen Guard Dedication` — **real violation**, not a bug. Prereq requires Athletics AND Intimidation trained; this character has Athletics but not Intimidation.
- `反应打击者 Reactive Striker` — **real violation**, not a bug. Requires Fighter Dedication; this Cleric does not have it (Ulfen Guard occupies the Free Archetype dedication slot).

## [0.1.19] - 2026-05-12

### Fixed
- **Prereq references that the parser keeps mis-decoding** (`乌尔芬卫士入门`, `治疗源泉`, `领域入门`, …): added a quick-path that runs *before* the leveler parser. For every prereq sub-clause that isn't a skill / ability / rank check, the module looks for a substring match against any of the actor's own owned item names. If `乌尔芬卫士入门` is contained in the name of a feat the actor owns (`乌尔芬卫士入门 Ulfen Guard Dedication`), the prereq is accepted without going through normalization or the parser. Eliminates the bulk of "Chinese reference → English alphabet soup" failures.
- **Babele reverse map now scans world actors + world items**, not just compendium indexes. Owned items are always translated by Babele (it hooks document creation), so this works regardless of whether `pack.index` carries translated names in the user's Babele version. Console log breaks out where entries came from: `api / index / world`.
- **`DEDICATION_2_FEAT_RULE` still firing on Ulfen Guard despite same pack**: `flags.core.sourceId` isn't always populated — newer FVTT keeps the compendium link in `_stats.compendiumSource`. Now reads three paths. Added **M5**: same `system.publication.title` as the dedication (broader signal, accepted risk of slight over-count in books that ship multiple archetypes).
- The reverse-map cache now has a 1-minute TTL so freshly-added items get picked up without restarting the world.

## [0.1.18] - 2026-05-12

### Fixed
- **`DEDICATION_2_FEAT_RULE` still 0/2 after 0.1.16**: the previous fix required follow-up feats to carry the `archetype` trait, but community-content modules (e.g. *Lost Omens: Shining Kingdoms* Ulfen Guard) don't tag their archetype feats with it. The gate is dropped; the four specificity methods (trait, slug-prefix, shared distinctive trait, same compendium pack) are enough on their own.
- **Babele reverse-lookup empty**: added a second source for the CN→EN map — every compendium pack's pre-loaded index is scanned for bilingual document names (`乌尔芬卫士入门 Ulfen Guard Dedication`). Always runs, works regardless of Babele's runtime API shape. The console log now reports how many entries came from each source.
- **"审计 Party" toolbar button wrapping awkwardly**: added `white-space: nowrap` and gave it the proper inline-flex layout so the icon + label stay on one line.
- **Eye-slash suppress button not centered**: switched to `align-items: center` (was `baseline`) with min-height so a single icon sits properly inside the button.

## [0.1.17] - 2026-05-12

### Changed
- **UI rewritten to match Foundry-native styling**. Removes the custom paper/ink palette, serif headings, decorative pills, animated transitions, and box-shadow accents that gave a "branded module" look. Now:
  - All colours come from FVTT's CSS variables (`--color-text-*`, `--color-bg-alt`, `--color-level-error/warning/info/success`, `--color-border-light-tertiary`).
  - Fonts inherit (no Georgia/serif override).
  - Issue list is plain row-and-icon, no card backgrounds.
  - Buttons inherit FVTT's default styling.
  - Tabs use a simple underline indicator on the active item.
  - History sparkline kept but down-scaled and monochrome.
  - Filter chips look like plain inline buttons.
- The module now visually fits alongside the rest of FVTT (and PF2e's own sheets) rather than asserting its own aesthetic.

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
