/**
 * AoN (Archives of Nethys) rule citation links for audit issues.
 *
 * Maps each audit issue `code` to a relevant AoN URL so GMs can click
 * through to verify the rule. Codes without a single canonical page
 * link to the most relevant chapter overview.
 *
 * Returns `null` (and emits no link) for codes with no useful citation
 * (e.g. PARTY_* informational issues, unknown codes).
 */

const AON_BASE = "https://2e.aonprd.com";

// Frequently-reused targets
const URL_CHAR_CREATION       = `${AON_BASE}/Rules.aspx?ID=2261`;
const URL_CHAR_ADVANCEMENT    = `${AON_BASE}/Rules.aspx?ID=2278`;
const URL_BACKGROUNDS         = `${AON_BASE}/Rules.aspx?ID=2266`;
const URL_VOLUNTARY_FLAW      = `${AON_BASE}/Rules.aspx?ID=2267`;
const URL_HP                  = `${AON_BASE}/Rules.aspx?ID=2295`;
const URL_STARTING_WEALTH     = `${AON_BASE}/Rules.aspx?ID=2306`;
const URL_WEALTH_BY_LEVEL     = `${AON_BASE}/Rules.aspx?ID=2353`;
const URL_PROFICIENCY         = `${AON_BASE}/Rules.aspx?ID=389`;
const URL_ARCHETYPES          = `${AON_BASE}/Rules.aspx?ID=735`;
const URL_SPELLCASTING        = `${AON_BASE}/Rules.aspx?ID=313`;
const URL_INVESTED            = `${AON_BASE}/Rules.aspx?ID=375`;
const URL_RUNES               = `${AON_BASE}/Rules.aspx?ID=378`;
const URL_LANGUAGES           = `${AON_BASE}/Languages.aspx`;
const URL_CLASSES             = `${AON_BASE}/Classes.aspx`;
const URL_CLERIC              = `${AON_BASE}/Classes.aspx?ID=4`;
const URL_APEX_ITEM_EXAMPLE   = `${AON_BASE}/Equipment.aspx?ID=294`;

const CODE_MAP = Object.freeze({
  // Character creation: missing core components
  MISSING_ANCESTRY:               URL_CHAR_CREATION,
  MISSING_HERITAGE:               URL_CHAR_CREATION,
  MISSING_BACKGROUND:             URL_CHAR_CREATION,
  MISSING_CLASS:                  URL_CHAR_CREATION,

  // Advancement (boosts, feats, skill increases per level)
  BOOST_COUNT_MISMATCH:           URL_CHAR_ADVANCEMENT,
  ANCESTRY_FEAT_MISSING:          URL_CHAR_ADVANCEMENT,
  HERITAGE_FEAT_MISSING:          URL_CHAR_ADVANCEMENT,
  CLASS_FEAT_MISSING:             URL_CHAR_ADVANCEMENT,
  SKILL_FEAT_MISSING:             URL_CHAR_ADVANCEMENT,
  GENERAL_FEAT_MISSING:           URL_CHAR_ADVANCEMENT,
  SKILL_INCREASE_MISSING:         URL_CHAR_ADVANCEMENT,

  // Apex items (level 17+ stat boost item)
  APEX_MISSING_AT_17:             URL_APEX_ITEM_EXAMPLE,

  // Languages
  LANGUAGE_OVER_LIMIT:            URL_LANGUAGES,
  LANGUAGE_UNDER_LIMIT:           URL_LANGUAGES,
  LANGUAGE_MISSING:               URL_LANGUAGES,
  LANGUAGE_DUPLICATE:             URL_LANGUAGES,

  // Archetype / dedication rules
  DEDICATION_2_FEAT_RULE:         URL_ARCHETYPES,

  // Spellcasting
  SPELL_TRADITION_MISMATCH:       URL_SPELLCASTING,

  // HP
  HP_UNDER_EXPECTED:              URL_HP,
  HP_OVER_EXPECTED:               URL_HP,

  // Starting wealth (level 1)
  STARTING_WEALTH_EXCEEDED:       URL_STARTING_WEALTH,

  // Backgrounds
  BACKGROUND_SKILL_NOT_TRAINED:   URL_BACKGROUNDS,
  BACKGROUND_LORE_MISSING:        URL_BACKGROUNDS,

  // Class features / subclass selection
  CLASS_FEATURES_MISSING_SPECIFIC: URL_CLASSES,
  CLASS_SUBCLASS_MISSING:         URL_CLASSES,

  // Proficiency / skill rank progression
  RANK_BEHIND_PROGRESSION:        URL_PROFICIENCY,
  RANK_AHEAD_OF_PROGRESSION:      URL_PROFICIENCY,
  SKILL_RANK_TOO_HIGH_FOR_LEVEL:  URL_PROFICIENCY,

  // Treasure / item level by character level
  ITEM_LEVEL_EXCEEDS_CHARACTER:   URL_WEALTH_BY_LEVEL,
  TREASURE_BY_LEVEL_LOW:          URL_WEALTH_BY_LEVEL,
  TREASURE_BY_LEVEL_HIGH:         URL_WEALTH_BY_LEVEL,
  TREASURE_BY_LEVEL_MISMATCH:     URL_WEALTH_BY_LEVEL,

  // Invested item limit (10)
  INVESTITURE_OVER_LIMIT:         URL_INVESTED,

  // Runes / ABP
  RUNE_INVALID:                   URL_RUNES,
  RUNE_OVER_LIMIT:                URL_RUNES,
  RUNE_LEVEL_TOO_HIGH:            URL_RUNES,
  RUNE_FUNDAMENTAL_MISSING:       URL_RUNES,
  ABP_RUNE_CONFLICT:              URL_RUNES,

  // Cleric domains
  CLERIC_DOMAIN_COUNT_OFF:        URL_CLERIC,

  // Voluntary flaws
  VOLUNTARY_FLAW_COUNT_MISMATCH:  URL_VOLUNTARY_FLAW,
  VOLUNTARY_FLAW_INVALID:         URL_VOLUNTARY_FLAW,

  // Party-tool / informational — no rule citation
  PARTY_LEVEL_SPREAD:             null,
  PARTY_MISSING_ROLE:             null,
  PARTY_COMPOSITION:              null,
});

/**
 * Returns the AoN URL for the given audit issue code, or null if no
 * citation is mapped.
 * @param {string} issueCode
 * @returns {string|null}
 */
export function getAonUrl(issueCode) {
  if (!issueCode || typeof issueCode !== "string") return null;
  const direct = CODE_MAP[issueCode];
  if (direct !== undefined) return direct;
  return null;
}

/**
 * Returns an HTML `<a>` tag pointing to the AoN rule page, or empty
 * string if no URL is mapped. Safe to interpolate in Handlebars via
 * a triple-stash (`{{{aon issue.code}}}`).
 *
 * @param {string} issueCode
 * @param {string} [label="Rule"]
 * @returns {string}
 */
export function getAonLinkHtml(issueCode, label = "Rule") {
  const url = getAonUrl(issueCode);
  if (!url) return "";
  // Pull localized label if Foundry's i18n is available; otherwise
  // fall back to the provided label argument.
  let text = label;
  try {
    if (typeof game !== "undefined" && game?.i18n?.localize) {
      const localized = game.i18n.localize("PF2E-CA.Label.RuleLink");
      if (localized && localized !== "PF2E-CA.Label.RuleLink") text = localized;
    }
  } catch (_) { /* non-Foundry context (e.g. node --check) */ }
  const safeUrl = url.replace(/"/g, "&quot;");
  const safeText = String(text).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<a href="${safeUrl}" target="_blank" rel="noopener" class="pf2e-ca-aon-link">${safeText}</a>`;
}

export default { getAonUrl, getAonLinkHtml };
