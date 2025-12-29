/**
 * Entity Type Validators
 *
 * Centralized type-specific validation rules for entities.
 * Each validator determines if an entity name is valid for its type.
 *
 * Usage:
 *   import { getTypeValidator, validateEntityForType } from './entity-type-validators';
 *
 *   const validator = getTypeValidator('PERSON');
 *   if (!validator(tokens, normalized, features)) { // reject entity }
 */

import type { EntityType } from './schema';

// ============================================================================
// SHARED CONSTANTS
// ============================================================================

/**
 * Title/honorific prefixes that indicate proper name usage
 */
export const TITLE_PREFIXES = new Set([
  'mr', 'mrs', 'miss', 'ms', 'dr', 'doctor',
  'prof', 'professor', 'sir', 'madam', 'madame',
  'lord', 'lady', 'king', 'queen', 'prince', 'princess',
  'captain', 'commander', 'head', 'headmaster', 'headmistress',
  'chief', 'general', 'colonel', 'major', 'lieutenant',
  'father', 'mother', 'brother', 'sister', 'reverend', 'pastor',
  'rabbi', 'imam', 'sheikh', 'master', 'mistress',
]);

/**
 * Common abstract nouns that shouldn't be PERSON entities
 */
export const PERSON_ABSTRACT_BLOCKLIST = new Set([
  'song', 'songs', 'justice', 'darkness', 'light', 'learning',
  'questions', 'question', 'answers', 'answer',
  'listen', 'listening', 'familiar', 'hello', 'goodbye',
  'perched', 'perching', 'stabbing', 'breaking',
  'hope', 'fear', 'love', 'hate', 'joy', 'sorrow', 'pain',
  'silence', 'chaos', 'peace', 'war', 'death', 'life',
]);

/**
 * Known race/demonym names
 */
export const KNOWN_RACES = new Set([
  // Fantasy races
  'human', 'humans', 'elf', 'elves', 'elven', 'dwarf', 'dwarves', 'dwarven',
  'orc', 'orcs', 'orcish', 'goblin', 'goblins', 'troll', 'trolls',
  'hobbit', 'hobbits', 'wizard', 'wizards', 'witch', 'witches',
  'vampire', 'vampires', 'werewolf', 'werewolves', 'zombie', 'zombies',
  'demon', 'demons', 'angel', 'angels', 'dragon', 'dragons',
  'giant', 'giants', 'fairy', 'fairies', 'sprite', 'sprites',
  'centaur', 'centaurs', 'mermaid', 'mermaids', 'merman', 'mermen',
  'gnome', 'gnomes', 'halfling', 'halflings', 'drow',
  // Real-world demonyms
  'american', 'americans', 'british', 'french', 'german', 'italian', 'spanish',
  'chinese', 'japanese', 'korean', 'indian', 'russian', 'arab', 'african',
  'european', 'asian', 'martian', 'martians', 'venusian', 'venusians',
  'canadian', 'mexican', 'brazilian', 'australian', 'egyptian',
]);

/**
 * Known species/creature names
 */
export const KNOWN_SPECIES = new Set([
  // Animals
  'cat', 'cats', 'dog', 'dogs', 'horse', 'horses', 'wolf', 'wolves',
  'bear', 'bears', 'lion', 'lions', 'tiger', 'tigers', 'eagle', 'eagles',
  'snake', 'snakes', 'spider', 'spiders', 'rat', 'rats', 'mouse', 'mice',
  'owl', 'owls', 'raven', 'ravens', 'crow', 'crows', 'hawk', 'hawks',
  // Mythical creatures
  'dragon', 'dragons', 'phoenix', 'phoenixes', 'griffin', 'griffins',
  'unicorn', 'unicorns', 'pegasus', 'chimera', 'hydra', 'basilisk',
  'demon', 'demons', 'devil', 'devils', 'imp', 'imps',
  'goblin', 'goblins', 'troll', 'trolls', 'ogre', 'ogres',
  'vampire', 'vampires', 'werewolf', 'werewolves', 'zombie', 'zombies',
  'ghost', 'ghosts', 'specter', 'specters', 'wraith', 'wraiths',
  // Generic
  'bird', 'birds', 'fish', 'fishes', 'beast', 'beasts', 'creature', 'creatures',
  'monster', 'monsters', 'animal', 'animals',
]);

/**
 * Geographic markers for PLACE entities
 */
export const GEOGRAPHIC_MARKERS = new Set([
  'river', 'creek', 'stream', 'mountain', 'mount', 'peak', 'hill', 'hillside',
  'valley', 'lake', 'sea', 'ocean', 'island', 'isle', 'forest', 'wood',
  'desert', 'plain', 'prairie', 'city', 'town', 'village', 'kingdom', 'realm',
  'land', 'cliff', 'ridge', 'canyon', 'gorge', 'fjord', 'haven', 'harbor',
  'bay', 'cove', 'grove', 'glade', 'dale', 'moor', 'heath', 'marsh', 'swamp',
  'waste', 'wild', 'reach', 'highland', 'lowland', 'borderland', 'coast',
  'shore', 'beach', 'peninsula', 'cape', 'point', 'falls', 'springs',
]);

/**
 * Organization markers for ORG entities
 */
export const ORGANIZATION_MARKERS = new Set([
  'school', 'university', 'academy', 'college', 'ministry', 'department',
  'company', 'corporation', 'inc', 'llc', 'corp', 'ltd', 'bank', 'institute',
  'foundation', 'association', 'society', 'committee', 'council', 'board',
  'agency', 'bureau', 'office', 'division', 'group', 'team', 'union',
  'federation', 'league', 'alliance', 'coalition', 'organization',
]);

/**
 * House/Order markers for HOUSE entities
 */
export const HOUSE_MARKERS = new Set([
  'house', 'order', 'clan', 'tribe', 'dynasty', 'family', 'brotherhood',
  'sisterhood', 'guild', 'fellowship', 'court', 'council',
]);

// ============================================================================
// VALIDATION CONTEXT
// ============================================================================

/**
 * Features available for type validation
 */
export interface TypeValidationFeatures {
  /** spaCy NER labeled this entity */
  hasNERSupport?: boolean;
  /** Entity only appears at sentence starts */
  isSentenceInitialOnly?: boolean;
  /** Number of times entity appears in text */
  mentionCount?: number;
  /** Entity appears in dialogue context */
  inDialogue?: boolean;
  /** Entity has appositive description */
  hasAppositive?: boolean;
}

// ============================================================================
// TYPE VALIDATORS
// ============================================================================

/**
 * Validate PERSON entity name
 *
 * Allows:
 * - Multi-token proper names with >1 capitalized word
 * - Names with title prefixes (Mr/Mrs/Dr/Professor/King/etc.)
 * - NER-backed PERSON labels
 *
 * Rejects:
 * - Single-token names that only appear sentence-initial without NER
 * - Common abstract nouns or verbs
 */
export function isValidPersonName(
  tokens: string[],
  normalized: string,
  features: TypeValidationFeatures = {}
): boolean {
  // Allow if has title prefix
  if (tokens.length >= 2) {
    const firstToken = tokens[0].toLowerCase().replace(/\.$/, '');
    if (TITLE_PREFIXES.has(firstToken)) {
      return true;
    }
  }

  // Allow if multi-token proper name (>1 capitalized word)
  const capitalizedWords = tokens.filter(t => /^[A-Z]/.test(t));
  if (capitalizedWords.length > 1) {
    return true;
  }

  // Allow if NER strongly labels as PERSON
  if (features.hasNERSupport) {
    return true;
  }

  // Reject abstract nouns if sentence-initial-only
  if (PERSON_ABSTRACT_BLOCKLIST.has(normalized) && features.isSentenceInitialOnly) {
    return false;
  }

  // Reject single-token sentence-initial without NER
  if (tokens.length === 1 && features.isSentenceInitialOnly && !features.hasNERSupport) {
    return false;
  }

  return true;
}

/**
 * Validate PLACE entity name
 *
 * Allows:
 * - Names with geographic markers (River, Mountain, etc.)
 * - Multi-token capitalized names
 * - NER-backed GPE/LOC labels
 *
 * Rejects:
 * - Generic nouns (nothing, everything, back, part)
 */
export function isValidPlaceName(
  tokens: string[],
  normalized: string,
  features: TypeValidationFeatures = {}
): boolean {
  // Check for geographic markers
  for (const token of tokens) {
    if (GEOGRAPHIC_MARKERS.has(token.toLowerCase())) {
      return true;
    }
  }

  // Allow if NER-backed
  if (features.hasNERSupport) {
    return true;
  }

  // Allow multi-token capitalized names
  const capitalizedWords = tokens.filter(t => /^[A-Z]/.test(t));
  if (capitalizedWords.length >= 1) {
    return true;
  }

  // Reject generic nouns
  const GENERIC_PLACES = new Set(['nothing', 'everything', 'back', 'part', 'somewhere', 'nowhere']);
  if (GENERIC_PLACES.has(normalized)) {
    return false;
  }

  return true;
}

/**
 * Validate ORG entity name
 *
 * Allows:
 * - Names with organization markers (School, University, etc.)
 * - Multi-token capitalized names
 * - NER-backed ORG labels
 */
export function isValidOrgName(
  tokens: string[],
  normalized: string,
  features: TypeValidationFeatures = {}
): boolean {
  // Check for organization markers
  for (const token of tokens) {
    if (ORGANIZATION_MARKERS.has(token.toLowerCase())) {
      return true;
    }
  }

  // Allow if NER-backed
  if (features.hasNERSupport) {
    return true;
  }

  // Allow multi-token capitalized names
  const capitalizedWords = tokens.filter(t => /^[A-Z]/.test(t));
  if (capitalizedWords.length >= 2) {
    return true;
  }

  // Reject known false positives
  const ORG_BLOCKLIST = new Set(['goon squad', 'visit', 'academia']);
  if (ORG_BLOCKLIST.has(normalized)) {
    return false;
  }

  return true;
}

/**
 * Validate HOUSE entity name
 *
 * Allows:
 * - Names with house/order markers
 * - "House of X" or "X House" patterns
 */
export function isValidHouseName(
  tokens: string[],
  normalized: string,
  features: TypeValidationFeatures = {}
): boolean {
  // Check for house markers
  for (const token of tokens) {
    if (HOUSE_MARKERS.has(token.toLowerCase())) {
      return true;
    }
  }

  // "House of X" pattern
  if (/\bhouse\s+of\b/i.test(tokens.join(' '))) {
    return true;
  }

  // Allow NER-backed
  if (features.hasNERSupport) {
    return true;
  }

  // Must have at least one capitalized word
  const hasCapitalized = tokens.some(t => /^[A-Z]/.test(t));
  return hasCapitalized;
}

/**
 * Validate RACE entity name
 *
 * Allows:
 * - Known races/demonyms
 * - Demonym-like suffixes (-an, -ian, -ese, -ish, -i)
 *
 * Rejects:
 * - Gerunds (-ing forms)
 * - Generic group nouns
 */
export function isValidRaceName(
  tokens: string[],
  normalized: string,
  features: TypeValidationFeatures = {}
): boolean {
  // Allow known races
  if (KNOWN_RACES.has(normalized)) {
    return true;
  }

  // Allow demonym-like suffixes
  const DEMONYM_SUFFIXES = ['-an', '-ian', '-ese', '-ish', '-i'];
  for (const suffix of DEMONYM_SUFFIXES) {
    if (normalized.endsWith(suffix.replace('-', ''))) {
      // But not if it's a gerund
      if (normalized.endsWith('ing')) {
        return false;
      }
      return true;
    }
  }

  // Reject gerunds
  if (normalized.endsWith('ing')) {
    return false;
  }

  // Reject generic group nouns
  const GENERIC_GROUP_NOUNS = new Set([
    'people', 'citizens', 'folks', 'crowd', 'crowds',
    'men', 'women', 'children', 'boys', 'girls',
    'population', 'populations', 'group', 'groups',
  ]);
  if (GENERIC_GROUP_NOUNS.has(normalized)) {
    return false;
  }

  return true;
}

/**
 * Validate SPECIES entity name
 *
 * Allows:
 * - Known species/creatures
 *
 * Rejects:
 * - Common verbs
 */
export function isValidSpeciesName(
  tokens: string[],
  normalized: string,
  features: TypeValidationFeatures = {}
): boolean {
  // Allow known species
  if (KNOWN_SPECIES.has(normalized)) {
    return true;
  }

  // Reject common verbs
  const COMMON_VERBS = new Set([
    'break', 'breaks', 'run', 'runs', 'walk', 'walks',
    'fight', 'fights', 'attack', 'attacks', 'defend', 'defends',
  ]);
  if (COMMON_VERBS.has(normalized)) {
    return false;
  }

  return true;
}

/**
 * Validate ITEM entity name
 *
 * Allows:
 * - Concrete noun phrases
 * - Phrases with capitalized words
 *
 * Rejects:
 * - Verb-headed phrases
 * - Pronoun-heavy phrases
 */
export function isValidItemName(
  tokens: string[],
  normalized: string,
  features: TypeValidationFeatures = {}
): boolean {
  // Reject if contains personal pronouns
  const PERSONAL_PRONOUNS = new Set([
    'i', 'you', 'he', 'she', 'we', 'they',
    'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'her', 'our', 'their',
  ]);
  for (const token of tokens) {
    if (PERSONAL_PRONOUNS.has(token.toLowerCase())) {
      return false;
    }
  }

  // Reject function word phrases
  const FUNCTION_WORDS = new Set([
    'the', 'a', 'an', 'to', 'do', 'get', 'not', 'or', 'and', 'but',
    'is', 'are', 'was', 'were', 'be', 'been', 'being',
  ]);
  if (tokens.length <= 2) {
    const firstToken = tokens[0].toLowerCase();
    const lastToken = tokens[tokens.length - 1].toLowerCase();
    if (FUNCTION_WORDS.has(firstToken) || FUNCTION_WORDS.has(lastToken)) {
      return false;
    }
  }

  // Reject verb-headed phrases
  const COMMON_ACTION_VERBS = new Set([
    'walk', 'run', 'do', 'get', 'make', 'take', 'go', 'come',
    'kill', 'help', 'read', 'see', 'hear', 'feel', 'find',
    'look', 'watch', 'listen', 'think', 'know', 'believe',
  ]);
  const firstWord = tokens[0].toLowerCase();
  if (COMMON_ACTION_VERBS.has(firstWord)) {
    return false;
  }

  // Require at least one capitalized word for single-token
  if (tokens.length === 1 && !/^[A-Z]/.test(tokens[0])) {
    const COMMON_CONCRETE_NOUNS = new Set([
      'sword', 'shield', 'armor', 'helmet', 'bow', 'arrow',
      'book', 'scroll', 'potion', 'ring', 'amulet', 'staff',
      'key', 'door', 'gate', 'window', 'table', 'chair',
    ]);
    if (!COMMON_CONCRETE_NOUNS.has(normalized)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate DATE entity name
 *
 * Allows:
 * - Names with numbers or temporal keywords
 * - Spelled-out numbers
 */
export function isValidDateName(
  tokens: string[],
  normalized: string,
  features: TypeValidationFeatures = {}
): boolean {
  const text = tokens.join(' ');

  // Has numbers
  if (/\d/.test(text)) {
    return true;
  }

  // Has temporal keywords
  if (/\b(year|month|day|century|age|era|bc|ad|today|yesterday|tomorrow)\b/i.test(text)) {
    return true;
  }

  // Has spelled-out numbers
  if (/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|hundred|thousand)\b/i.test(text)) {
    return true;
  }

  return false;
}

/**
 * Validate EVENT entity name
 */
export function isValidEventName(
  tokens: string[],
  normalized: string,
  features: TypeValidationFeatures = {}
): boolean {
  const text = tokens.join(' ');

  // Event patterns
  if (/\b(battle|war|treaty|accord|council|conference|summit)\s+of\b/i.test(text)) {
    return true;
  }

  if (/\b(dance|reunion|festival|party|ball|show|ceremony|wedding|funeral)\b/i.test(text)) {
    return true;
  }

  // Allow NER-backed
  if (features.hasNERSupport) {
    return true;
  }

  // Allow multi-token capitalized
  const capitalizedWords = tokens.filter(t => /^[A-Z]/.test(t));
  return capitalizedWords.length >= 1;
}

// ============================================================================
// VALIDATOR REGISTRY
// ============================================================================

type TypeValidator = (
  tokens: string[],
  normalized: string,
  features: TypeValidationFeatures
) => boolean;

const TYPE_VALIDATORS: Partial<Record<EntityType, TypeValidator>> = {
  PERSON: isValidPersonName,
  PLACE: isValidPlaceName,
  ORG: isValidOrgName,
  HOUSE: isValidHouseName,
  RACE: isValidRaceName,
  SPECIES: isValidSpeciesName,
  ITEM: isValidItemName,
  DATE: isValidDateName,
  EVENT: isValidEventName,
};

/**
 * Get the validator for a specific entity type
 */
export function getTypeValidator(type: EntityType): TypeValidator | undefined {
  return TYPE_VALIDATORS[type];
}

/**
 * Validate an entity name for a specific type
 *
 * @param name - Entity canonical name
 * @param type - Entity type
 * @param features - Validation context features
 * @returns true if valid, false otherwise
 */
export function validateEntityForType(
  name: string,
  type: EntityType,
  features: TypeValidationFeatures = {}
): boolean {
  const tokens = name.split(/\s+/).filter(Boolean);
  const normalized = name.toLowerCase().trim();

  const validator = getTypeValidator(type);
  if (!validator) {
    // No specific validator - use generic rules
    return true;
  }

  return validator(tokens, normalized, features);
}

/**
 * Force-correct entity type based on strong lexical markers
 *
 * @param name - Entity canonical name
 * @param currentType - Current entity type
 * @returns Corrected type (or original if no correction needed)
 */
export function inferEntityType(
  name: string,
  currentType: EntityType
): EntityType {
  const lowerName = name.toLowerCase();
  const tokens = name.split(/\s+/).map(t => t.toLowerCase());

  // Geographic markers → PLACE
  for (const token of tokens) {
    if (GEOGRAPHIC_MARKERS.has(token)) {
      return 'PLACE';
    }
  }

  // Organization markers → ORG
  for (const token of tokens) {
    if (ORGANIZATION_MARKERS.has(token)) {
      return 'ORG';
    }
  }

  // House/Order markers → HOUSE
  for (const token of tokens) {
    if (HOUSE_MARKERS.has(token)) {
      return 'HOUSE';
    }
  }

  // Event patterns → EVENT
  if (/\b(battle|war|treaty|accord|council|conference|summit)\s+of\b/i.test(name)) {
    return 'EVENT';
  }
  if (/\b(dance|reunion|festival|party|ball|show)\b/i.test(name) && tokens.length >= 2) {
    return 'EVENT';
  }

  // Demonymic patterns → RACE
  if (/\bnative american(s)?\b/i.test(name)) {
    return 'RACE';
  }

  return currentType;
}
