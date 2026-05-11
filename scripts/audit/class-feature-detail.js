// Per-class per-level required class-feature presence checks.
//
// Primary strategy: derive expected features from the actor's class item
// itself (`actor.class.system.items`). This is what the PF2e system uses to
// auto-grant features at each level, so it is authoritative for the active
// world (correct slugs, correct names, localized properly).
//
// Fallback strategy: if `class.system.items` is empty / missing (homebrew or
// unmigrated data), fall back to a slim hardcoded `REQUIRED_FEATURES` table
// that explicitly OMITS profile-level concepts (Anathema, Deity, Edicts) and
// uses bilingual EN/CN substring matching against owned item names.
//
// Returns `{ issues, summary }`. Issues:
//   CLASS_FEATURE_NOT_PRESENT  warn   { feature, level, classSlug }
//   KEY_ABILITY_NOT_SET        error  { classSlug }

import { SEVERITY } from "../constants.js";

const REQUIRED_FEATURES = {
  fighter: [
    { level: 1, slug: "reactive-strike", name: "Reactive Strike" },
    { level: 1, slug: "shield-block", name: "Shield Block" },
    { level: 3, slug: "bravery", name: "Bravery" },
    { level: 5, slug: "fighter-weapon-mastery", name: "Fighter Weapon Mastery" },
    { level: 7, slug: "battlefield-surveyor", name: "Battlefield Surveyor" },
    { level: 9, slug: "combat-flexibility", name: "Combat Flexibility" },
    { level: 11, slug: "armor-expertise", name: "Armor Expertise" },
    { level: 13, slug: "weapon-legend", name: "Weapon Legend" },
    { level: 15, slug: "evasion", name: "Evasion" },
    { level: 17, slug: "armor-mastery", name: "Armor Mastery" },
    { level: 19, slug: "versatile-legend", name: "Versatile Legend" }
  ],
  cleric: [
    { level: 1, slug: "divine-font", name: "Divine Font" },
    { level: 1, slug: "doctrine", name: "Doctrine" },
    { level: 3, slug: "second-doctrine", name: "Second Doctrine" },
    { level: 5, slug: "third-doctrine", name: "Third Doctrine" },
    { level: 7, slug: "fourth-doctrine", name: "Fourth Doctrine" },
    { level: 9, slug: "resolve", name: "Resolve" },
    { level: 11, slug: "alertness", name: "Alertness" },
    { level: 13, slug: "divine-defense", name: "Divine Defense" },
    { level: 15, slug: "fifth-doctrine", name: "Fifth Doctrine" },
    { level: 19, slug: "miraculous-spell", name: "Miraculous Spell" }
  ],
  wizard: [
    { level: 1, slug: "arcane-bond", name: "Arcane Bond" },
    { level: 1, slug: "arcane-school", name: "Arcane School" },
    { level: 1, slug: "arcane-thesis", name: "Arcane Thesis" },
    { level: 1, slug: "arcane-spellcasting", name: "Arcane Spellcasting" },
    { level: 1, slug: "spellbook", name: "Spellbook" },
    { level: 3, slug: "wizard-weapon-expertise", name: "Wizard Weapon Expertise" },
    { level: 5, slug: "lightning-reflexes", name: "Lightning Reflexes" },
    { level: 7, slug: "expert-spellcaster", name: "Expert Spellcaster" },
    { level: 9, slug: "magical-fortitude", name: "Magical Fortitude" },
    { level: 11, slug: "alertness", name: "Alertness" },
    { level: 11, slug: "wizard-weapon-specialization", name: "Wizard Weapon Specialization" },
    { level: 13, slug: "defensive-robes", name: "Defensive Robes" },
    { level: 15, slug: "master-spellcaster", name: "Master Spellcaster" },
    { level: 17, slug: "resolve", name: "Resolve" },
    { level: 19, slug: "archwizards-spellcraft", name: "Archwizard's Spellcraft" },
    { level: 19, slug: "legendary-spellcaster", name: "Legendary Spellcaster" }
  ],
  rogue: [
    { level: 1, slug: "rogues-racket", name: "Rogue's Racket" },
    { level: 1, slug: "sneak-attack", name: "Sneak Attack" },
    { level: 1, slug: "surprise-attack", name: "Surprise Attack" },
    { level: 3, slug: "deny-advantage", name: "Deny Advantage" },
    { level: 5, slug: "weapon-tricks", name: "Weapon Tricks" },
    { level: 7, slug: "evasion", name: "Evasion" },
    { level: 9, slug: "great-fortitude", name: "Great Fortitude" },
    { level: 11, slug: "rogue-expertise", name: "Rogue Expertise" },
    { level: 13, slug: "improved-evasion", name: "Improved Evasion" },
    { level: 13, slug: "incredible-senses", name: "Incredible Senses" },
    { level: 13, slug: "light-armor-expertise", name: "Light Armor Expertise" },
    { level: 13, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 15, slug: "greater-weapon-specialization", name: "Greater Weapon Specialization" },
    { level: 17, slug: "slippery-mind", name: "Slippery Mind" },
    { level: 19, slug: "light-armor-mastery", name: "Light Armor Mastery" },
    { level: 19, slug: "master-strike", name: "Master Strike" }
  ],
  barbarian: [
    { level: 1, slug: "instinct", name: "Instinct" },
    { level: 1, slug: "rage", name: "Rage" },
    { level: 3, slug: "deny-advantage", name: "Deny Advantage" },
    { level: 5, slug: "brutality", name: "Brutality" },
    { level: 7, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 9, slug: "lightning-reflexes", name: "Lightning Reflexes" },
    { level: 11, slug: "mighty-rage", name: "Mighty Rage" },
    { level: 13, slug: "greater-juggernaut", name: "Greater Juggernaut" },
    { level: 13, slug: "medium-armor-expertise", name: "Medium Armor Expertise" },
    { level: 13, slug: "weapon-fury", name: "Weapon Fury" },
    { level: 15, slug: "greater-weapon-specialization", name: "Greater Weapon Specialization" },
    { level: 15, slug: "indomitable-will", name: "Indomitable Will" },
    { level: 17, slug: "heightened-senses", name: "Heightened Senses" },
    { level: 17, slug: "quick-rage", name: "Quick Rage" },
    { level: 19, slug: "armor-of-fury", name: "Armor of Fury" },
    { level: 19, slug: "devastator", name: "Devastator" }
  ],
  bard: [
    { level: 1, slug: "bardic-lore", name: "Bardic Lore" },
    { level: 1, slug: "composition-spells", name: "Composition Spells" },
    { level: 1, slug: "muses", name: "Muses" },
    { level: 1, slug: "occult-spellcasting", name: "Occult Spellcasting" },
    { level: 3, slug: "lightning-reflexes", name: "Lightning Reflexes" },
    { level: 3, slug: "signature-spells", name: "Signature Spells" },
    { level: 5, slug: "bard-weapon-expertise", name: "Bard Weapon Expertise" },
    { level: 7, slug: "expert-spellcaster", name: "Expert Spellcaster" },
    { level: 9, slug: "great-fortitude", name: "Great Fortitude" },
    { level: 9, slug: "resolve", name: "Resolve" },
    { level: 11, slug: "vigilant-senses", name: "Vigilant Senses" },
    { level: 13, slug: "light-armor-expertise", name: "Light Armor Expertise" },
    { level: 13, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 15, slug: "master-spellcaster", name: "Master Spellcaster" },
    { level: 17, slug: "greater-resolve", name: "Greater Resolve" },
    { level: 19, slug: "legendary-spellcaster", name: "Legendary Spellcaster" },
    { level: 19, slug: "magnum-opus", name: "Magnum Opus" }
  ],
  champion: [
    { level: 1, slug: "cause", name: "Cause" },
    { level: 1, slug: "champions-code", name: "Champion's Code" },
    { level: 1, slug: "champions-reaction", name: "Champion's Reaction" },
    { level: 1, slug: "deific-weapon", name: "Deific Weapon" },
    { level: 1, slug: "devotion-spells", name: "Devotion Spells" },
    { level: 3, slug: "divine-ally", name: "Divine Ally" },
    { level: 5, slug: "weapon-expertise", name: "Weapon Expertise" },
    { level: 7, slug: "armor-expertise", name: "Armor Expertise" },
    { level: 7, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 9, slug: "champion-expertise", name: "Champion Expertise" },
    { level: 9, slug: "divine-smite", name: "Divine Smite" },
    { level: 9, slug: "juggernaut", name: "Juggernaut" },
    { level: 9, slug: "lightning-reflexes", name: "Lightning Reflexes" },
    { level: 11, slug: "alertness", name: "Alertness" },
    { level: 11, slug: "divine-will", name: "Divine Will" },
    { level: 11, slug: "exalt", name: "Exalt" },
    { level: 13, slug: "armor-mastery", name: "Armor Mastery" },
    { level: 13, slug: "weapon-mastery", name: "Weapon Mastery" },
    { level: 15, slug: "greater-weapon-specialization", name: "Greater Weapon Specialization" },
    { level: 17, slug: "champion-mastery", name: "Champion Mastery" },
    { level: 17, slug: "legendary-armor", name: "Legendary Armor" },
    { level: 19, slug: "hero-of-the-faith", name: "Hero of the Faith" }
  ],
  druid: [
    { level: 1, slug: "druidic-language", name: "Druidic Language" },
    { level: 1, slug: "druidic-order", name: "Druidic Order" },
    { level: 1, slug: "primal-spellcasting", name: "Primal Spellcasting" },
    { level: 1, slug: "shield-block", name: "Shield Block" },
    { level: 1, slug: "wild-empathy", name: "Wild Empathy" },
    { level: 3, slug: "alertness", name: "Alertness" },
    { level: 3, slug: "great-fortitude", name: "Great Fortitude" },
    { level: 5, slug: "lightning-reflexes", name: "Lightning Reflexes" },
    { level: 7, slug: "expert-spellcaster", name: "Expert Spellcaster" },
    { level: 11, slug: "druid-weapon-expertise", name: "Druid Weapon Expertise" },
    { level: 11, slug: "resolve", name: "Resolve" },
    { level: 13, slug: "medium-armor-expertise", name: "Medium Armor Expertise" },
    { level: 13, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 15, slug: "master-spellcaster", name: "Master Spellcaster" },
    { level: 17, slug: "druid-expertise", name: "Druid Expertise" },
    { level: 19, slug: "legendary-spellcaster", name: "Legendary Spellcaster" },
    { level: 19, slug: "primal-hierophant", name: "Primal Hierophant" }
  ],
  monk: [
    { level: 1, slug: "flurry-of-blows", name: "Flurry of Blows" },
    { level: 1, slug: "powerful-fist", name: "Powerful Fist" },
    { level: 3, slug: "incredible-movement", name: "Incredible Movement" },
    { level: 3, slug: "mystic-strikes", name: "Mystic Strikes" },
    { level: 5, slug: "alertness", name: "Alertness" },
    { level: 5, slug: "expert-strikes", name: "Expert Strikes" },
    { level: 7, slug: "path-to-perfection", name: "Path to Perfection" },
    { level: 7, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 9, slug: "metal-strikes", name: "Metal Strikes" },
    { level: 9, slug: "monk-expertise", name: "Monk Expertise" },
    { level: 11, slug: "second-path-to-perfection", name: "Second Path to Perfection" },
    { level: 13, slug: "graceful-mastery", name: "Graceful Mastery" },
    { level: 13, slug: "master-strikes", name: "Master Strikes" },
    { level: 15, slug: "greater-weapon-specialization", name: "Greater Weapon Specialization" },
    { level: 15, slug: "third-path-to-perfection", name: "Third Path to Perfection" },
    { level: 17, slug: "adamantine-strikes", name: "Adamantine Strikes" },
    { level: 17, slug: "graceful-legend", name: "Graceful Legend" },
    { level: 19, slug: "perfected-form", name: "Perfected Form" }
  ],
  ranger: [
    { level: 1, slug: "hunt-prey", name: "Hunt Prey" },
    { level: 1, slug: "hunters-edge", name: "Hunter's Edge" },
    { level: 3, slug: "iron-will", name: "Iron Will" },
    { level: 5, slug: "ranger-weapon-expertise", name: "Ranger Weapon Expertise" },
    { level: 5, slug: "trackless-step", name: "Trackless Step" },
    { level: 7, slug: "evasion", name: "Evasion" },
    { level: 7, slug: "vigilant-senses", name: "Vigilant Senses" },
    { level: 7, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 9, slug: "natures-edge", name: "Nature's Edge" },
    { level: 9, slug: "ranger-expertise", name: "Ranger Expertise" },
    { level: 11, slug: "juggernaut", name: "Juggernaut" },
    { level: 11, slug: "medium-armor-expertise", name: "Medium Armor Expertise" },
    { level: 11, slug: "wild-stride", name: "Wild Stride" },
    { level: 13, slug: "weapon-mastery", name: "Weapon Mastery" },
    { level: 15, slug: "greater-weapon-specialization", name: "Greater Weapon Specialization" },
    { level: 15, slug: "improved-evasion", name: "Improved Evasion" },
    { level: 15, slug: "incredible-senses", name: "Incredible Senses" },
    { level: 17, slug: "masterful-hunter", name: "Masterful Hunter" },
    { level: 19, slug: "second-skin", name: "Second Skin" },
    { level: 19, slug: "swift-prey", name: "Swift Prey" }
  ],
  sorcerer: [
    { level: 1, slug: "bloodline", name: "Bloodline" },
    { level: 3, slug: "signature-spells", name: "Signature Spells" },
    { level: 5, slug: "magical-fortitude", name: "Magical Fortitude" },
    { level: 7, slug: "expert-spellcaster", name: "Expert Spellcaster" },
    { level: 9, slug: "lightning-reflexes", name: "Lightning Reflexes" },
    { level: 11, slug: "alertness", name: "Alertness" },
    { level: 11, slug: "weapon-expertise", name: "Weapon Expertise" },
    { level: 13, slug: "defensive-robes", name: "Defensive Robes" },
    { level: 13, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 15, slug: "master-spellcaster", name: "Master Spellcaster" },
    { level: 17, slug: "resolve", name: "Resolve" },
    { level: 19, slug: "bloodline-paragon", name: "Bloodline Paragon" },
    { level: 19, slug: "legendary-spellcaster", name: "Legendary Spellcaster" }
  ],
  witch: [
    { level: 1, slug: "familiar", name: "Familiar" },
    { level: 1, slug: "hex-spells", name: "Hex Spells" },
    { level: 1, slug: "patron", name: "Patron" },
    { level: 1, slug: "patrons-gift", name: "Patron's Gift" },
    { level: 3, slug: "expert-spellcaster", name: "Expert Spellcaster" },
    { level: 5, slug: "magical-fortitude", name: "Magical Fortitude" },
    { level: 7, slug: "iron-will", name: "Iron Will" },
    { level: 9, slug: "alertness", name: "Alertness" },
    { level: 11, slug: "witch-weapon-expertise", name: "Witch Weapon Expertise" },
    { level: 13, slug: "defensive-robes", name: "Defensive Robes" },
    { level: 15, slug: "master-spellcaster", name: "Master Spellcaster" },
    { level: 17, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 19, slug: "legendary-spellcaster", name: "Legendary Spellcaster" },
    { level: 19, slug: "patrons-truth", name: "Patron's Truth" }
  ],
  alchemist: [
    { level: 1, slug: "alchemy", name: "Alchemy" },
    { level: 1, slug: "formula-book", name: "Formula Book" },
    { level: 1, slug: "infused-reagents", name: "Infused Reagents" },
    { level: 1, slug: "research-field", name: "Research Field" },
    { level: 3, slug: "alchemical-expertise", name: "Alchemical Expertise" },
    { level: 5, slug: "double-brew", name: "Double Brew" },
    { level: 5, slug: "iron-will", name: "Iron Will" },
    { level: 5, slug: "perpetual-infusions", name: "Perpetual Infusions" },
    { level: 7, slug: "alchemical-weapon-expertise", name: "Alchemical Weapon Expertise" },
    { level: 7, slug: "alertness", name: "Alertness" },
    { level: 9, slug: "alchemical-alacrity", name: "Alchemical Alacrity" },
    { level: 9, slug: "evasion", name: "Evasion" },
    { level: 11, slug: "alchemical-mastery", name: "Alchemical Mastery" },
    { level: 11, slug: "perpetual-potency", name: "Perpetual Potency" },
    { level: 13, slug: "medium-armor-expertise", name: "Medium Armor Expertise" },
    { level: 13, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 15, slug: "alchemical-expertise-perpetual-perfection", name: "Perpetual Perfection" },
    { level: 17, slug: "alchemical-mastery-medium-armor-mastery", name: "Medium Armor Mastery" },
    { level: 19, slug: "alchemical-legend", name: "Alchemical Legend" }
  ],
  investigator: [
    { level: 1, slug: "devise-a-stratagem", name: "Devise a Stratagem" },
    { level: 1, slug: "methodology", name: "Methodology" },
    { level: 1, slug: "on-the-case", name: "On the Case" },
    { level: 1, slug: "strategic-strike", name: "Strategic Strike" },
    { level: 3, slug: "keen-recollection", name: "Keen Recollection" },
    { level: 3, slug: "skillful-lessons", name: "Skillful Lessons" },
    { level: 5, slug: "weapon-expertise", name: "Weapon Expertise" },
    { level: 7, slug: "vigilant-senses", name: "Vigilant Senses" },
    { level: 7, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 9, slug: "deductive-improvisation", name: "Deductive Improvisation" },
    { level: 9, slug: "investigator-expertise", name: "Investigator Expertise" },
    { level: 9, slug: "resolve", name: "Resolve" },
    { level: 11, slug: "deny-advantage", name: "Deny Advantage" },
    { level: 13, slug: "light-armor-expertise", name: "Light Armor Expertise" },
    { level: 13, slug: "weapon-mastery", name: "Weapon Mastery" },
    { level: 15, slug: "evasion", name: "Evasion" },
    { level: 15, slug: "greater-weapon-specialization", name: "Greater Weapon Specialization" },
    { level: 17, slug: "light-armor-mastery", name: "Light Armor Mastery" },
    { level: 17, slug: "master-detective", name: "Master Detective" },
    { level: 19, slug: "investigator-mastery", name: "Investigator Mastery" }
  ],
  oracle: [
    { level: 1, slug: "divine-spellcasting", name: "Divine Spellcasting" },
    { level: 1, slug: "mystery", name: "Mystery" },
    { level: 1, slug: "oracular-curse", name: "Oracular Curse" },
    { level: 1, slug: "revelation-spells", name: "Revelation Spells" },
    { level: 3, slug: "signature-spells", name: "Signature Spells" },
    { level: 5, slug: "magical-fortitude", name: "Magical Fortitude" },
    { level: 7, slug: "expert-spellcaster", name: "Expert Spellcaster" },
    { level: 9, slug: "lightning-reflexes", name: "Lightning Reflexes" },
    { level: 11, slug: "alertness", name: "Alertness" },
    { level: 11, slug: "weapon-expertise", name: "Weapon Expertise" },
    { level: 13, slug: "light-armor-expertise", name: "Light Armor Expertise" },
    { level: 13, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 15, slug: "master-spellcaster", name: "Master Spellcaster" },
    { level: 17, slug: "oracular-clarity", name: "Oracular Clarity" },
    { level: 19, slug: "legendary-spellcaster", name: "Legendary Spellcaster" },
    { level: 19, slug: "oracular-providence", name: "Oracular Providence" }
  ],
  swashbuckler: [
    { level: 1, slug: "panache", name: "Panache" },
    { level: 1, slug: "swashbucklers-style", name: "Swashbuckler's Style" },
    { level: 1, slug: "precise-strike", name: "Precise Strike" },
    { level: 1, slug: "confident-finisher", name: "Confident Finisher" },
    { level: 3, slug: "stylish-tricks", name: "Stylish Tricks" },
    { level: 3, slug: "vivacious-speed", name: "Vivacious Speed" },
    { level: 5, slug: "weapon-expertise", name: "Weapon Expertise" },
    { level: 7, slug: "stylish-trick", name: "Stylish Trick" },
    { level: 7, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 9, slug: "evasion", name: "Evasion" },
    { level: 9, slug: "exemplary-finisher", name: "Exemplary Finisher" },
    { level: 9, slug: "great-fortitude", name: "Great Fortitude" },
    { level: 11, slug: "continuous-flair", name: "Continuous Flair" },
    { level: 11, slug: "vivacious-bravado", name: "Vivacious Bravado" },
    { level: 13, slug: "improved-evasion", name: "Improved Evasion" },
    { level: 13, slug: "light-armor-expertise", name: "Light Armor Expertise" },
    { level: 13, slug: "weapon-mastery", name: "Weapon Mastery" },
    { level: 15, slug: "greater-weapon-specialization", name: "Greater Weapon Specialization" },
    { level: 15, slug: "keen-flair", name: "Keen Flair" },
    { level: 17, slug: "light-armor-mastery", name: "Light Armor Mastery" },
    { level: 19, slug: "eternal-confidence", name: "Eternal Confidence" }
  ],
  magus: [
    { level: 1, slug: "arcane-cascade", name: "Arcane Cascade" },
    { level: 1, slug: "conflux-spells", name: "Conflux Spells" },
    { level: 1, slug: "hybrid-study", name: "Hybrid Study" },
    { level: 1, slug: "spellstrike", name: "Spellstrike" },
    { level: 1, slug: "arcane-spellcasting", name: "Arcane Spellcasting" },
    { level: 3, slug: "lightning-reflexes", name: "Lightning Reflexes" },
    { level: 5, slug: "magus-weapon-expertise", name: "Magus Weapon Expertise" },
    { level: 7, slug: "expert-spellcaster", name: "Expert Spellcaster" },
    { level: 7, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 9, slug: "alertness", name: "Alertness" },
    { level: 11, slug: "medium-armor-expertise", name: "Medium Armor Expertise" },
    { level: 11, slug: "vigilant-guardian", name: "Vigilant Guardian" },
    { level: 13, slug: "juggernaut", name: "Juggernaut" },
    { level: 13, slug: "magus-weapon-mastery", name: "Magus Weapon Mastery" },
    { level: 15, slug: "greater-weapon-specialization", name: "Greater Weapon Specialization" },
    { level: 15, slug: "master-spellcaster", name: "Master Spellcaster" },
    { level: 17, slug: "medium-armor-mastery", name: "Medium Armor Mastery" },
    { level: 19, slug: "double-spellstrike", name: "Double Spellstrike" }
  ],
  summoner: [
    { level: 1, slug: "eidolon", name: "Eidolon" },
    { level: 1, slug: "evolution-feat", name: "Evolution Feat" },
    { level: 1, slug: "link-spells", name: "Link Spells" },
    { level: 1, slug: "shared-vigilance", name: "Shared Vigilance" },
    { level: 3, slug: "lightning-reflexes", name: "Lightning Reflexes" },
    { level: 5, slug: "magical-fortitude", name: "Magical Fortitude" },
    { level: 5, slug: "summoner-weapon-expertise", name: "Summoner Weapon Expertise" },
    { level: 7, slug: "expert-spellcaster", name: "Expert Spellcaster" },
    { level: 9, slug: "alertness", name: "Alertness" },
    { level: 11, slug: "armor-expertise", name: "Armor Expertise" },
    { level: 13, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 15, slug: "master-spellcaster", name: "Master Spellcaster" },
    { level: 17, slug: "greater-juggernaut", name: "Greater Juggernaut" },
    { level: 19, slug: "legendary-spellcaster", name: "Legendary Spellcaster" }
  ],
  thaumaturge: [
    { level: 1, slug: "first-implement-and-esoterica", name: "First Implement and Esoterica" },
    { level: 1, slug: "esoteric-lore", name: "Esoteric Lore" },
    { level: 1, slug: "first-implement", name: "First Implement" },
    { level: 3, slug: "second-implement", name: "Second Implement" },
    { level: 5, slug: "weapon-expertise", name: "Weapon Expertise" },
    { level: 7, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 9, slug: "expert-thaumaturge", name: "Expert Thaumaturge" },
    { level: 9, slug: "intensify-vulnerability", name: "Intensify Vulnerability" },
    { level: 11, slug: "second-adept", name: "Second Adept" },
    { level: 13, slug: "weapon-mastery", name: "Weapon Mastery" },
    { level: 15, slug: "third-implement", name: "Third Implement" },
    { level: 17, slug: "exploit-vulnerability-2", name: "Greater Exploit Vulnerability" },
    { level: 17, slug: "master-thaumaturge", name: "Master Thaumaturge" },
    { level: 19, slug: "second-paragon", name: "Second Paragon" }
  ],
  psychic: [
    { level: 1, slug: "conscious-mind", name: "Conscious Mind" },
    { level: 1, slug: "occult-spellcasting", name: "Occult Spellcasting" },
    { level: 1, slug: "psi-cantrips-and-amps", name: "Psi Cantrips and Amps" },
    { level: 1, slug: "subconscious-mind", name: "Subconscious Mind" },
    { level: 1, slug: "unleash-psyche", name: "Unleash Psyche" },
    { level: 3, slug: "signature-spells", name: "Signature Spells" },
    { level: 5, slug: "magical-fortitude", name: "Magical Fortitude" },
    { level: 7, slug: "expert-spellcaster", name: "Expert Spellcaster" },
    { level: 7, slug: "weapon-expertise", name: "Weapon Expertise" },
    { level: 9, slug: "alertness", name: "Alertness" },
    { level: 9, slug: "lightning-reflexes", name: "Lightning Reflexes" },
    { level: 11, slug: "resolve", name: "Resolve" },
    { level: 13, slug: "defensive-robes", name: "Defensive Robes" },
    { level: 13, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 15, slug: "master-spellcaster", name: "Master Spellcaster" },
    { level: 19, slug: "legendary-spellcaster", name: "Legendary Spellcaster" }
  ],
  kineticist: [
    { level: 1, slug: "kinetic-gate", name: "Kinetic Gate" },
    { level: 1, slug: "kinetic-aura", name: "Kinetic Aura" },
    { level: 1, slug: "elemental-blast", name: "Elemental Blast" },
    { level: 3, slug: "lightning-reflexes", name: "Lightning Reflexes" },
    { level: 5, slug: "kineticist-weapon-expertise", name: "Kineticist Weapon Expertise" },
    { level: 7, slug: "expert-impulses", name: "Expert Impulses" },
    { level: 9, slug: "iron-will", name: "Iron Will" },
    { level: 11, slug: "alertness", name: "Alertness" },
    { level: 11, slug: "armor-expertise", name: "Armor Expertise" },
    { level: 13, slug: "kineticist-weapon-specialization", name: "Kineticist Weapon Specialization" },
    { level: 13, slug: "master-impulses", name: "Master Impulses" },
    { level: 15, slug: "evasion", name: "Evasion" },
    { level: 17, slug: "armor-mastery", name: "Armor Mastery" },
    { level: 19, slug: "legendary-impulses", name: "Legendary Impulses" }
  ],
  gunslinger: [
    { level: 1, slug: "gunslingers-way", name: "Gunslinger's Way" },
    { level: 1, slug: "initial-deed", name: "Initial Deed" },
    { level: 1, slug: "singular-expertise", name: "Singular Expertise" },
    { level: 1, slug: "slingers-reload", name: "Slinger's Reload" },
    { level: 3, slug: "gunslinger-weapon-mastery", name: "Gunslinger Weapon Mastery" },
    { level: 3, slug: "stubborn", name: "Stubborn" },
    { level: 5, slug: "advanced-deed", name: "Advanced Deed" },
    { level: 7, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 9, slug: "greater-deed", name: "Greater Deed" },
    { level: 9, slug: "vigilant-senses", name: "Vigilant Senses" },
    { level: 11, slug: "evasion", name: "Evasion" },
    { level: 11, slug: "medium-armor-expertise", name: "Medium Armor Expertise" },
    { level: 13, slug: "gunslinger-expertise", name: "Gunslinger Expertise" },
    { level: 15, slug: "greater-weapon-specialization", name: "Greater Weapon Specialization" },
    { level: 15, slug: "improved-evasion", name: "Improved Evasion" },
    { level: 17, slug: "medium-armor-mastery", name: "Medium Armor Mastery" },
    { level: 19, slug: "shootists-edge", name: "Shootist's Edge" }
  ],
  inventor: [
    { level: 1, slug: "innovation", name: "Innovation" },
    { level: 1, slug: "explode", name: "Explode" },
    { level: 1, slug: "overdrive", name: "Overdrive" },
    { level: 1, slug: "shield-block", name: "Shield Block" },
    { level: 3, slug: "expert-overdrive", name: "Expert Overdrive" },
    { level: 5, slug: "inventor-weapon-expertise", name: "Inventor Weapon Expertise" },
    { level: 7, slug: "weapon-specialization", name: "Weapon Specialization" },
    { level: 9, slug: "iron-will", name: "Iron Will" },
    { level: 11, slug: "expert-inventor", name: "Expert Inventor" },
    { level: 13, slug: "master-overdrive", name: "Master Overdrive" },
    { level: 13, slug: "medium-armor-expertise", name: "Medium Armor Expertise" },
    { level: 15, slug: "greater-weapon-specialization", name: "Greater Weapon Specialization" },
    { level: 17, slug: "medium-armor-mastery", name: "Medium Armor Mastery" },
    { level: 19, slug: "revolutionary-innovation", name: "Revolutionary Innovation" }
  ]
};

// Profile-level / non-item concepts that must never trigger a missing-feature
// warning. These are stored on the actor as profile fields (actor.deity,
// actor.system.details.deity, edicts/anathema text), not as feat items.
const PROFILE_LEVEL_SLUGS = new Set([
  "anathema", "deity", "edicts", "edicts-and-anathema",
  "edicts-anathema", "tenets", "code", "champions-code"
]);

// Bilingual aliases for fallback name-substring matching. Keyed by canonical
// slug; value is an array of acceptable substrings (case-insensitive). The
// English feature name is implicitly included by the matcher.
const CN_FEATURE_ALIAS = {
  "anathema": ["禁忌"],
  "deity": ["神祇", "神祗", "神明"],
  "resolve": ["聚能", "铁心", "决心"],
  "alertness": ["警觉", "警戒"],
  "bravery": ["英勇", "勇气"],
  "evasion": ["闪避"],
  "improved-evasion": ["精进闪避", "高级闪避"],
  "great-fortitude": ["顽强", "强健"],
  "lightning-reflexes": ["闪电反射", "迅捷反射"],
  "iron-will": ["钢铁意志", "坚毅意志"],
  "juggernaut": ["神勇", "金刚不坏"],
  "greater-juggernaut": ["高等神勇"],
  "magical-fortitude": ["魔法强韧"],
  "vigilant-senses": ["警觉感官", "敏锐感官"],
  "incredible-senses": ["敏锐感知", "卓越感官"],
  "heightened-senses": ["敏锐感官"],
  "weapon-specialization": ["武器专攻"],
  "greater-weapon-specialization": ["高等武器专攻", "进阶武器专攻"],
  "weapon-expertise": ["武器娴熟"],
  "weapon-mastery": ["武器精通"],
  "weapon-legend": ["武器传奇"],
  "armor-expertise": ["护甲娴熟"],
  "armor-mastery": ["护甲精通"],
  "medium-armor-expertise": ["中甲娴熟"],
  "medium-armor-mastery": ["中甲精通"],
  "light-armor-expertise": ["轻甲娴熟"],
  "light-armor-mastery": ["轻甲精通"],
  "legendary-armor": ["传奇护甲"],
  "shield-block": ["盾牌格挡", "格挡"],
  "rage": ["狂怒", "暴怒"],
  "mighty-rage": ["强力狂怒"],
  "quick-rage": ["迅捷狂怒"],
  "instinct": ["本能"],
  "deny-advantage": ["拒绝优势"],
  "expert-spellcaster": ["专家施法者", "娴熟施法者"],
  "master-spellcaster": ["大师施法者"],
  "legendary-spellcaster": ["传奇施法者"],
  "signature-spells": ["招牌法术"],
  "divine-font": ["神圣涌泉", "神圣源泉"],
  "doctrine": ["教义"],
  "second-doctrine": ["第二教义"],
  "third-doctrine": ["第三教义"],
  "fourth-doctrine": ["第四教义"],
  "fifth-doctrine": ["第五教义"],
  "divine-defense": ["神圣防御"],
  "miraculous-spell": ["神迹法术"],
  "sneak-attack": ["偷袭"],
  "surprise-attack": ["奇袭"],
  "rogues-racket": ["游荡者派系", "游荡者门派"],
  "flurry-of-blows": ["疾风连击", "连击"],
  "powerful-fist": ["强力拳"],
  "familiar": ["魔宠", "魔仆"],
  "bloodline": ["血脉"],
  "patron": ["守护神", "庇护者"],
  "muses": ["缪斯"],
  "bardic-lore": ["游唱诗人学识", "诗人学识"],
  "composition-spells": ["谱写法术", "吟唱法术"],
  "hunt-prey": ["狩猎宿敌"],
  "hunters-edge": ["游侠优势", "猎人优势"]
};

function makeIssue(code, severity, params = {}) {
  return {
    code,
    severity,
    i18nKey: `PF2E-CA.Audit.Code.${code}`,
    params
  };
}

function getClassSlug(actor) {
  return actor?.class?.slug ?? actor?.class?.system?.slug ?? null;
}

function getCharacterLevel(actor) {
  return actor?.system?.details?.level?.value ?? 1;
}

// Public helper: returns a Set of every slug the actor owns across both
// `itemTypes.feat` (any category) and `itemTypes.classFeature` if present.
export function getActorFeatureSlugs(actor) {
  const slugs = new Set();
  const cfList = actor?.itemTypes?.classFeature;
  if (Array.isArray(cfList)) {
    for (const it of cfList) {
      const s = it?.slug ?? it?.system?.slug;
      if (s) slugs.add(s);
    }
  }
  const feats = actor?.itemTypes?.feat;
  if (Array.isArray(feats)) {
    for (const it of feats) {
      const s = it?.slug ?? it?.system?.slug;
      if (s) slugs.add(s);
    }
  }
  return slugs;
}

function getOwnedItemSlugs(actor) {
  const slugs = new Set();
  for (const it of actor?.items ?? []) {
    const s = it?.slug ?? it?.system?.slug;
    if (s) slugs.add(s);
  }
  for (const s of getActorFeatureSlugs(actor)) slugs.add(s);
  return slugs;
}

function getOwnedItemUUIDs(actor) {
  const uuids = new Set();
  for (const it of actor?.items ?? []) {
    const src = it?.flags?.core?.sourceId
      ?? it?._stats?.compendiumSource
      ?? it?.sourceId
      ?? null;
    if (typeof src === "string" && src.length) uuids.add(src);
  }
  return uuids;
}

function getOwnedItemNames(actor) {
  const names = [];
  for (const it of actor?.items ?? []) {
    const n = typeof it?.name === "string" ? it.name : null;
    if (n) names.push(n.toLowerCase());
  }
  return names;
}

function slugFromUUID(uuid) {
  if (typeof uuid !== "string" || !uuid.length) return null;
  const last = uuid.split(".").pop();
  if (!last) return null;
  return last;
}

function prettifyUUIDTerminal(terminal) {
  if (!terminal) return null;
  // Compendium IDs are usually 16-char alphanumerics; if so, we have no good
  // human name to show — return null and let the caller fall back.
  if (/^[A-Za-z0-9]{16}$/.test(terminal)) return null;
  return terminal
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function checkKeyAbility(actor, issues) {
  if (!actor?.class) return;
  const choices = actor.class?.system?.keyAbility?.value;
  const selected = actor.class?.system?.keyAbility?.selected;
  const hasChoice = Array.isArray(choices) && choices.length > 1;
  if (!hasChoice) return;
  const isUnset = !selected
    || (Array.isArray(selected) && selected.length === 0)
    || (typeof selected === "string" && selected.trim() === "");
  if (isUnset) {
    issues.push(makeIssue("KEY_ABILITY_NOT_SET", SEVERITY.ERROR, {
      classSlug: getClassSlug(actor) ?? "unknown"
    }));
  }
}

// Primary detector: walk `actor.class.system.items` and emit a warning for
// each entry (whose level <= actor level) that does not correspond to an
// owned item by either UUID-or-slug match.
function checkFromClassItems(actor, issues) {
  const classSlug = getClassSlug(actor) ?? "unknown";
  const classItems = actor?.class?.system?.items;
  if (!classItems || typeof classItems !== "object") return false;
  const entries = Object.values(classItems);
  if (!entries.length) return false;

  const level = getCharacterLevel(actor);
  const ownedSlugs = getOwnedItemSlugs(actor);
  const ownedUUIDs = getOwnedItemUUIDs(actor);

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const entryLevel = Number(entry.level ?? 1);
    if (Number.isFinite(entryLevel) && entryLevel > level) continue;

    const uuid = typeof entry.uuid === "string" ? entry.uuid : null;
    if (!uuid) continue;
    const terminal = slugFromUUID(uuid);
    if (terminal && PROFILE_LEVEL_SLUGS.has(terminal)) continue;

    let owned = false;
    if (uuid && ownedUUIDs.has(uuid)) owned = true;
    if (!owned && terminal && ownedSlugs.has(terminal)) owned = true;
    if (owned) continue;

    const featureName = prettifyUUIDTerminal(terminal) ?? terminal ?? uuid;
    issues.push(makeIssue("CLASS_FEATURE_NOT_PRESENT", SEVERITY.WARN, {
      feature: featureName,
      level: Number.isFinite(entryLevel) ? entryLevel : 1,
      classSlug
    }));
  }
  return true;
}

function nameMatches(ownedNames, candidates) {
  for (const c of candidates) {
    if (!c) continue;
    const needle = String(c).toLowerCase();
    if (!needle) continue;
    for (const n of ownedNames) {
      if (n.includes(needle)) return true;
    }
  }
  return false;
}

// Fallback detector: hardcoded REQUIRED_FEATURES table with bilingual
// substring matching against owned item names.
function checkFromFallbackTable(actor, issues) {
  const classSlug = getClassSlug(actor);
  if (!classSlug) return;
  const table = REQUIRED_FEATURES[classSlug];
  if (!Array.isArray(table)) return;

  const level = getCharacterLevel(actor);
  const ownedSlugs = getOwnedItemSlugs(actor);
  const ownedNames = getOwnedItemNames(actor);

  for (const entry of table) {
    if (!entry || typeof entry !== "object") continue;
    if (PROFILE_LEVEL_SLUGS.has(entry.slug)) continue;
    if ((entry.level ?? 1) > level) continue;
    if (ownedSlugs.has(entry.slug)) continue;

    const aliases = CN_FEATURE_ALIAS[entry.slug] ?? [];
    const candidates = [entry.name, ...aliases];
    if (nameMatches(ownedNames, candidates)) continue;

    issues.push(makeIssue("CLASS_FEATURE_NOT_PRESENT", SEVERITY.WARN, {
      feature: entry.name ?? entry.slug,
      level: entry.level,
      classSlug
    }));
  }
}

function checkRequiredFeatures(actor, issues) {
  const usedPrimary = checkFromClassItems(actor, issues);
  if (!usedPrimary) checkFromFallbackTable(actor, issues);
}

export function auditClassFeatureDetail(actor) {
  const issues = [];
  if (actor?.type === "character") {
    try { checkKeyAbility(actor, issues); } catch (err) {
      console.warn("[pf2e-character-audit] class-feature-detail keyAbility check failed:", err);
    }
    try { checkRequiredFeatures(actor, issues); } catch (err) {
      console.warn("[pf2e-character-audit] class-feature-detail feature check failed:", err);
    }
  }
  const summary = {
    errors: issues.filter((i) => i.severity === SEVERITY.ERROR).length,
    warnings: issues.filter((i) => i.severity === SEVERITY.WARN).length,
    infos: issues.filter((i) => i.severity === SEVERITY.INFO).length,
    total: issues.length
  };
  return { issues, summary };
}

export { REQUIRED_FEATURES, PROFILE_LEVEL_SLUGS, CN_FEATURE_ALIAS };
