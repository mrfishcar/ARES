/**
 * Parts of Speech Grammar Module
 *
 * Comprehensive implementation of English grammar rules based on:
 * - Grammar Monster: https://www.grammar-monster.com/
 * - Purdue OWL: https://owl.purdue.edu/
 *
 * Integrates all 8 major parts of speech for entity/relation extraction:
 * 1. Nouns → Entities
 * 2. Pronouns → Coreference (already in pronoun-utils.ts)
 * 3. Verbs → Relations/Events
 * 4. Adjectives → Entity Attributes
 * 5. Adverbs → Relation Qualifiers
 * 6. Prepositions → Spatial/Temporal Relations
 * 7. Conjunctions → Complex Relations
 * 8. Determiners/Articles → Entity Definiteness
 */

import type { EntityType } from '../schema';

// ============================================================================
// 1. NOUNS (Grammar Monster: Nouns)
// https://www.grammar-monster.com/lessons/nouns.htm
// ============================================================================

/**
 * Noun categories determine entity types
 */
export enum NounCategory {
  PROPER_PERSON = 'proper_person',      // Frederick, Sarah, John Smith
  PROPER_PLACE = 'proper_place',        // London, Hogwarts, River Thames
  PROPER_ORG = 'proper_org',            // Microsoft, United Nations
  COMMON_CONCRETE = 'common_concrete',  // house, artifact, sword
  COMMON_ABSTRACT = 'common_abstract',  // love, wisdom, freedom
  COLLECTIVE = 'collective',            // family, group, army
  COMPOUND = 'compound'                 // mother-in-law, passerby
}

/**
 * Map noun category to ARES entity type
 */
export function nounCategoryToEntityType(category: NounCategory): EntityType {
  switch (category) {
    case NounCategory.PROPER_PERSON:
      return 'PERSON';
    case NounCategory.PROPER_PLACE:
      return 'PLACE';
    case NounCategory.PROPER_ORG:
      return 'ORG';
    case NounCategory.COMMON_CONCRETE:
      return 'ITEM';
    case NounCategory.COMMON_ABSTRACT:
      return 'WORK';  // Abstract concepts often manifest as works/ideas
    case NounCategory.COLLECTIVE:
      return 'ORG';  // Groups treated as organizations
    case NounCategory.COMPOUND:
      return 'PERSON';  // Most compounds are people (mother-in-law, etc.)
    default:
      return 'ITEM';
  }
}

/**
 * Detect noun category from word and context
 */
export function detectNounCategory(word: string, pos: string, isCapitalized: boolean): NounCategory {
  const lower = word.toLowerCase();

  // Proper noun detection (capitalized, not sentence-start)
  if (pos === 'PROPN' || (isCapitalized && pos === 'NOUN')) {
    // Person name patterns
    if (/\b(mr|mrs|ms|miss|dr|prof|sir|lady|lord|king|queen|prince|princess)\b/i.test(word)) {
      return NounCategory.PROPER_PERSON;
    }

    // Place name patterns
    if (/\b(mount|river|lake|city|town|castle|kingdom|shire)\b/i.test(word)) {
      return NounCategory.PROPER_PLACE;
    }

    // Organization patterns
    if (/\b(house|company|corporation|university|council|alliance)\b/i.test(word)) {
      return NounCategory.PROPER_ORG;
    }

    // Default proper nouns to person
    return NounCategory.PROPER_PERSON;
  }

  // Collective nouns
  const collectiveNouns = new Set([
    'family', 'group', 'team', 'army', 'crowd', 'council', 'committee',
    'flock', 'herd', 'pack', 'tribe', 'clan', 'house'
  ]);
  if (collectiveNouns.has(lower)) {
    return NounCategory.COLLECTIVE;
  }

  // Compound nouns (hyphenated)
  if (word.includes('-')) {
    return NounCategory.COMPOUND;
  }

  // Abstract nouns (typically concepts, emotions, qualities)
  const abstractMarkers = new Set([
    'love', 'hate', 'wisdom', 'freedom', 'justice', 'beauty', 'truth',
    'courage', 'honor', 'glory', 'power', 'knowledge', 'faith'
  ]);
  if (abstractMarkers.has(lower)) {
    return NounCategory.COMMON_ABSTRACT;
  }

  // Default: concrete common noun
  return NounCategory.COMMON_CONCRETE;
}

// ============================================================================
// 3. VERBS (Grammar Monster: Verbs)
// https://www.grammar-monster.com/lessons/verbs.htm
// ============================================================================

/**
 * Verb categories determine relation types
 */
export enum VerbCategory {
  ACTION_TRANSITIVE = 'action_transitive',    // killed, built, wrote (requires object)
  ACTION_INTRANSITIVE = 'action_intransitive',  // walked, arrived, died (no object)
  LINKING = 'linking',                        // is, was, became (connects subject to complement)
  AUXILIARY = 'auxiliary',                    // has, will, should (helping verbs)
  MODAL = 'modal',                            // can, could, may, might, must
  STATIVE = 'stative'                         // owns, knows, believes (state, not action)
}

/**
 * Detect verb category from lemma and dependencies
 */
export function detectVerbCategory(
  lemma: string,
  hasDirectObject: boolean,
  hasComplement: boolean
): VerbCategory {
  const lower = lemma.toLowerCase();

  // Linking verbs (copula)
  const linkingVerbs = new Set([
    'be', 'is', 'are', 'was', 'were', 'been', 'being',
    'become', 'became', 'seem', 'appear', 'remain', 'stay'
  ]);
  if (linkingVerbs.has(lower) && hasComplement) {
    return VerbCategory.LINKING;
  }

  // Auxiliary/helping verbs
  const auxiliaryVerbs = new Set([
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'shall'
  ]);
  if (auxiliaryVerbs.has(lower)) {
    return VerbCategory.AUXILIARY;
  }

  // Modal verbs
  const modalVerbs = new Set([
    'can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would'
  ]);
  if (modalVerbs.has(lower)) {
    return VerbCategory.MODAL;
  }

  // Stative verbs (states, not actions)
  const stativeVerbs = new Set([
    'own', 'possess', 'belong', 'know', 'believe', 'understand',
    'love', 'hate', 'want', 'need', 'prefer', 'contain'
  ]);
  if (stativeVerbs.has(lower)) {
    return VerbCategory.STATIVE;
  }

  // Transitive vs intransitive (based on whether there's a direct object)
  if (hasDirectObject) {
    return VerbCategory.ACTION_TRANSITIVE;
  } else {
    return VerbCategory.ACTION_INTRANSITIVE;
  }
}

/**
 * Verb tense detection (for temporal analysis)
 */
export enum VerbTense {
  SIMPLE_PAST = 'simple_past',        // walked, studied
  SIMPLE_PRESENT = 'simple_present',  // walks, studies
  SIMPLE_FUTURE = 'simple_future',    // will walk, will study
  PRESENT_PERFECT = 'present_perfect',  // has walked, have studied
  PAST_PERFECT = 'past_perfect',      // had walked
  FUTURE_PERFECT = 'future_perfect',  // will have walked
  PRESENT_PROGRESSIVE = 'present_progressive',  // is walking
  PAST_PROGRESSIVE = 'past_progressive'  // was walking
}

/**
 * Detect verb tense from spaCy tag
 */
export function detectVerbTense(tag: string, lemma: string): VerbTense {
  // VBD = past tense (walked)
  if (tag === 'VBD') {
    return VerbTense.SIMPLE_PAST;
  }

  // VBZ = 3rd person singular present (walks)
  // VBP = non-3rd person singular present (walk)
  if (tag === 'VBZ' || tag === 'VBP') {
    return VerbTense.SIMPLE_PRESENT;
  }

  // VBG = gerund/present participle (walking)
  if (tag === 'VBG') {
    return VerbTense.PRESENT_PROGRESSIVE;
  }

  // VBN = past participle (walked) - could be perfect tense
  if (tag === 'VBN') {
    return VerbTense.PAST_PERFECT;  // Assume perfect if past participle
  }

  // Default to simple present
  return VerbTense.SIMPLE_PRESENT;
}

/**
 * Get temporal interpretation from verb tense
 */
export function getTenseTemporality(tense: VerbTense): 'past' | 'present' | 'future' {
  switch (tense) {
    case VerbTense.SIMPLE_PAST:
    case VerbTense.PAST_PERFECT:
    case VerbTense.PAST_PROGRESSIVE:
      return 'past';

    case VerbTense.SIMPLE_FUTURE:
    case VerbTense.FUTURE_PERFECT:
      return 'future';

    default:
      return 'present';
  }
}

// ============================================================================
// 4. ADJECTIVES (Grammar Monster: Adjectives)
// https://www.grammar-monster.com/lessons/adjectives.htm
// ============================================================================

/**
 * Adjective categories for entity attribute extraction
 */
export enum AdjectiveCategory {
  DESCRIPTIVE = 'descriptive',    // old, beautiful, wise
  QUANTITATIVE = 'quantitative',  // many, few, several
  DEMONSTRATIVE = 'demonstrative',  // this, that, these, those
  POSSESSIVE = 'possessive',      // my, your, his, her
  INTERROGATIVE = 'interrogative',  // which, what, whose
  PROPER = 'proper'               // American, Victorian, Shakespearean
}

/**
 * Detect adjective category
 */
export function detectAdjectiveCategory(word: string, pos: string): AdjectiveCategory {
  const lower = word.toLowerCase();

  // Quantitative adjectives
  const quantitative = new Set([
    'many', 'few', 'several', 'some', 'all', 'most', 'every', 'each',
    'numerous', 'countless'
  ]);
  if (quantitative.has(lower)) {
    return AdjectiveCategory.QUANTITATIVE;
  }

  // Demonstrative adjectives
  const demonstrative = new Set(['this', 'that', 'these', 'those']);
  if (demonstrative.has(lower)) {
    return AdjectiveCategory.DEMONSTRATIVE;
  }

  // Possessive adjectives
  const possessive = new Set(['my', 'your', 'his', 'her', 'its', 'our', 'their']);
  if (possessive.has(lower)) {
    return AdjectiveCategory.POSSESSIVE;
  }

  // Interrogative adjectives
  const interrogative = new Set(['which', 'what', 'whose']);
  if (interrogative.has(lower)) {
    return AdjectiveCategory.INTERROGATIVE;
  }

  // Proper adjectives (capitalized)
  if (/^[A-Z]/.test(word) && pos === 'ADJ') {
    return AdjectiveCategory.PROPER;
  }

  // Default: descriptive
  return AdjectiveCategory.DESCRIPTIVE;
}

/**
 * Extract entity attributes from adjectives
 * Example: "the old wizard" → Entity{attrs: {age: "old"}}
 */
export interface EntityAttribute {
  category: string;  // 'age', 'color', 'size', 'quality', 'origin'
  value: string;     // The adjective itself
  confidence: number;
}

export function extractAttributeFromAdjective(adjective: string): EntityAttribute {
  const lower = adjective.toLowerCase();

  // Age/temporal attributes
  const ageAdjectives = new Set(['old', 'young', 'ancient', 'new', 'modern', 'aged', 'elderly']);
  if (ageAdjectives.has(lower)) {
    return { category: 'age', value: adjective, confidence: 0.9 };
  }

  // Size attributes
  const sizeAdjectives = new Set(['big', 'small', 'large', 'tiny', 'huge', 'massive', 'great']);
  if (sizeAdjectives.has(lower)) {
    return { category: 'size', value: adjective, confidence: 0.9 };
  }

  // Color attributes
  const colorAdjectives = new Set(['red', 'blue', 'green', 'black', 'white', 'golden', 'silver']);
  if (colorAdjectives.has(lower)) {
    return { category: 'color', value: adjective, confidence: 0.95 };
  }

  // Quality/character attributes
  const qualityAdjectives = new Set(['wise', 'brave', 'cruel', 'kind', 'powerful', 'weak']);
  if (qualityAdjectives.has(lower)) {
    return { category: 'quality', value: adjective, confidence: 0.85 };
  }

  // Origin/nationality attributes
  if (/^[A-Z]/.test(adjective) && /ian$|ese$|ish$|an$/.test(lower)) {
    return { category: 'origin', value: adjective, confidence: 0.9 };
  }

  // Default: general descriptor
  return { category: 'descriptor', value: adjective, confidence: 0.7 };
}

// ============================================================================
// 5. ADVERBS (Grammar Monster: Adverbs)
// https://www.grammar-monster.com/lessons/adverbs.htm
// ============================================================================

/**
 * Adverb categories for relation qualification
 */
export enum AdverbCategory {
  MANNER = 'manner',        // quickly, carefully, happily (how?)
  TIME = 'time',            // now, then, yesterday, soon (when?)
  PLACE = 'place',          // here, there, everywhere (where?)
  FREQUENCY = 'frequency',  // always, never, often, rarely (how often?)
  DEGREE = 'degree'         // very, quite, extremely, somewhat (to what extent?)
}

/**
 * Detect adverb category
 */
export function detectAdverbCategory(word: string): AdverbCategory {
  const lower = word.toLowerCase();

  // Time adverbs
  const timeAdverbs = new Set([
    'now', 'then', 'today', 'yesterday', 'tomorrow', 'soon', 'later',
    'early', 'recently', 'formerly', 'already', 'still', 'yet'
  ]);
  if (timeAdverbs.has(lower)) {
    return AdverbCategory.TIME;
  }

  // Place adverbs
  const placeAdverbs = new Set([
    'here', 'there', 'everywhere', 'nowhere', 'somewhere', 'anywhere',
    'above', 'below', 'inside', 'outside', 'nearby'
  ]);
  if (placeAdverbs.has(lower)) {
    return AdverbCategory.PLACE;
  }

  // Frequency adverbs
  const frequencyAdverbs = new Set([
    'always', 'never', 'often', 'rarely', 'seldom', 'sometimes',
    'usually', 'frequently', 'occasionally', 'constantly'
  ]);
  if (frequencyAdverbs.has(lower)) {
    return AdverbCategory.FREQUENCY;
  }

  // Degree adverbs
  const degreeAdverbs = new Set([
    'very', 'quite', 'extremely', 'somewhat', 'rather', 'too',
    'almost', 'nearly', 'completely', 'absolutely'
  ]);
  if (degreeAdverbs.has(lower)) {
    return AdverbCategory.DEGREE;
  }

  // Manner adverbs (usually end in -ly)
  if (lower.endsWith('ly')) {
    return AdverbCategory.MANNER;
  }

  // Default to manner
  return AdverbCategory.MANNER;
}

/**
 * Extract relation qualifier from adverb
 * Example: "walked quickly" → Relation{qualifiers: [{type: 'manner', value: 'quickly'}]}
 */
export interface RelationQualifier {
  type: 'time' | 'place' | 'manner' | 'frequency' | 'degree';
  value: string;
  span?: [number, number];
}

export function extractQualifierFromAdverb(adverb: string): RelationQualifier {
  const category = detectAdverbCategory(adverb);

  switch (category) {
    case AdverbCategory.TIME:
      return { type: 'time', value: adverb };
    case AdverbCategory.PLACE:
      return { type: 'place', value: adverb };
    case AdverbCategory.FREQUENCY:
      return { type: 'manner', value: `frequency:${adverb}` };
    case AdverbCategory.DEGREE:
      return { type: 'manner', value: `degree:${adverb}` };
    case AdverbCategory.MANNER:
    default:
      return { type: 'manner', value: adverb };
  }
}

// ============================================================================
// 6. PREPOSITIONS (Grammar Monster: Prepositions)
// https://www.grammar-monster.com/lessons/prepositions.htm
// ============================================================================

/**
 * Preposition categories determine relation modifiers
 */
export enum PrepositionCategory {
  LOCATION = 'location',      // in, at, on, near, behind, above
  TIME = 'time',              // during, before, after, since, until
  DIRECTION = 'direction',    // to, from, toward, into, out of
  MANNER = 'manner',          // by, with, like, as
  POSSESSION = 'possession',  // of, with
  AGENT = 'agent'             // by (passive voice agent)
}

/**
 * Common prepositions by category
 */
export const PREPOSITIONS = {
  location: new Set([
    'in', 'at', 'on', 'near', 'by', 'beside', 'between', 'among',
    'above', 'below', 'under', 'over', 'behind', 'in front of',
    'inside', 'outside', 'within', 'throughout'
  ]),

  time: new Set([
    'during', 'before', 'after', 'since', 'until', 'till', 'by',
    'at', 'on', 'in', 'for', 'throughout', 'within'
  ]),

  direction: new Set([
    'to', 'from', 'toward', 'towards', 'into', 'onto', 'out of',
    'through', 'across', 'along', 'past', 'around'
  ]),

  manner: new Set([
    'by', 'with', 'without', 'like', 'as', 'via', 'through'
  ]),

  possession: new Set(['of', 'with', 'belonging to']),

  agent: new Set(['by'])  // "painted by Leonardo" → agent
};

/**
 * Detect preposition category
 */
export function detectPrepositionCategory(preposition: string, context: 'temporal' | 'spatial' | 'unknown'): PrepositionCategory {
  const lower = preposition.toLowerCase();

  // Context hints help disambiguate (e.g., "at" can be location OR time)
  if (context === 'temporal') {
    if (PREPOSITIONS.time.has(lower)) {
      return PrepositionCategory.TIME;
    }
  } else if (context === 'spatial') {
    if (PREPOSITIONS.location.has(lower)) {
      return PrepositionCategory.LOCATION;
    }
  }

  // Category detection by frequency
  if (PREPOSITIONS.direction.has(lower)) {
    return PrepositionCategory.DIRECTION;
  }

  if (PREPOSITIONS.manner.has(lower)) {
    return PrepositionCategory.MANNER;
  }

  if (PREPOSITIONS.possession.has(lower)) {
    return PrepositionCategory.POSSESSION;
  }

  if (PREPOSITIONS.time.has(lower)) {
    return PrepositionCategory.TIME;
  }

  if (PREPOSITIONS.location.has(lower)) {
    return PrepositionCategory.LOCATION;
  }

  // Default to location
  return PrepositionCategory.LOCATION;
}

// ============================================================================
// 7. CONJUNCTIONS (Grammar Monster: Conjunctions)
// https://www.grammar-monster.com/lessons/conjunctions.htm
// ============================================================================

/**
 * Conjunction categories for complex relation handling
 */
export enum ConjunctionCategory {
  COORDINATING = 'coordinating',    // and, but, or, nor, for, yet, so (FANBOYS)
  SUBORDINATING = 'subordinating',  // because, although, if, when, while
  CORRELATIVE = 'correlative'       // either...or, neither...nor, both...and
}

/**
 * Coordinating conjunctions (FANBOYS mnemonic)
 */
export const COORDINATING_CONJUNCTIONS = new Set([
  'for', 'and', 'nor', 'but', 'or', 'yet', 'so'
]);

/**
 * Subordinating conjunctions (introduce dependent clauses)
 */
export const SUBORDINATING_CONJUNCTIONS = new Set([
  'because', 'although', 'though', 'since', 'if', 'unless', 'while',
  'when', 'whenever', 'where', 'wherever', 'before', 'after', 'until',
  'as', 'than', 'whether', 'that'
]);

/**
 * Detect conjunction type
 */
export function detectConjunctionCategory(word: string): ConjunctionCategory {
  const lower = word.toLowerCase();

  if (COORDINATING_CONJUNCTIONS.has(lower)) {
    return ConjunctionCategory.COORDINATING;
  }

  if (SUBORDINATING_CONJUNCTIONS.has(lower)) {
    return ConjunctionCategory.SUBORDINATING;
  }

  // Correlative conjunctions are multi-word, handled separately
  return ConjunctionCategory.COORDINATING;  // Default
}

/**
 * Handle coordinating conjunctions for entity/relation lists
 * Example: "Frederick and Sarah" → 2 entities
 * Example: "walked and talked" → 2 relations
 */
export interface CoordinatedItems {
  type: 'entities' | 'relations';
  items: string[];
  conjunction: string;
}

export function parseCoordination(phrase: string): CoordinatedItems | null {
  // Simple pattern: "X and Y" or "X, Y, and Z"
  const andPattern = /(.+?)\s+and\s+(.+)/;
  const orPattern = /(.+?)\s+or\s+(.+)/;

  if (andPattern.test(phrase)) {
    const match = phrase.match(andPattern);
    if (match) {
      const items = [match[1].trim(), match[2].trim()];
      return { type: 'entities', items, conjunction: 'and' };
    }
  }

  if (orPattern.test(phrase)) {
    const match = phrase.match(orPattern);
    if (match) {
      const items = [match[1].trim(), match[2].trim()];
      return { type: 'entities', items, conjunction: 'or' };
    }
  }

  return null;
}

// ============================================================================
// 8. DETERMINERS/ARTICLES (Grammar Monster: Articles)
// https://www.grammar-monster.com/lessons/articles_a_an_the.htm
// ============================================================================

/**
 * Determiner categories
 */
export enum DeterminerCategory {
  DEFINITE = 'definite',      // the (specific, known entity)
  INDEFINITE = 'indefinite',  // a, an (non-specific entity)
  POSSESSIVE = 'possessive',  // my, your, his, her, its, our, their
  DEMONSTRATIVE = 'demonstrative',  // this, that, these, those
  QUANTIFIER = 'quantifier'   // some, any, many, few, several
}

/**
 * Articles
 */
export const DEFINITE_ARTICLE = 'the';
export const INDEFINITE_ARTICLES = new Set(['a', 'an']);

/**
 * Detect determiner category
 */
export function detectDeterminerCategory(word: string): DeterminerCategory {
  const lower = word.toLowerCase();

  if (lower === 'the') {
    return DeterminerCategory.DEFINITE;
  }

  if (INDEFINITE_ARTICLES.has(lower)) {
    return DeterminerCategory.INDEFINITE;
  }

  const possessive = new Set(['my', 'your', 'his', 'her', 'its', 'our', 'their']);
  if (possessive.has(lower)) {
    return DeterminerCategory.POSSESSIVE;
  }

  const demonstrative = new Set(['this', 'that', 'these', 'those']);
  if (demonstrative.has(lower)) {
    return DeterminerCategory.DEMONSTRATIVE;
  }

  // Default to quantifier
  return DeterminerCategory.QUANTIFIER;
}

/**
 * Determine entity definiteness from article
 * "the wizard" → definite (specific entity, likely previously mentioned)
 * "a wizard" → indefinite (new entity being introduced)
 */
export interface EntityDefiniteness {
  isDefinite: boolean;
  isSpecific: boolean;
  confidence: number;
}

export function detectEntityDefiniteness(determiner: string | null): EntityDefiniteness {
  if (!determiner) {
    // No article → could be proper noun (definite by nature) or generic reference
    return { isDefinite: false, isSpecific: false, confidence: 0.5 };
  }

  const category = detectDeterminerCategory(determiner);

  switch (category) {
    case DeterminerCategory.DEFINITE:
      // "the wizard" → definite, specific entity
      return { isDefinite: true, isSpecific: true, confidence: 0.95 };

    case DeterminerCategory.INDEFINITE:
      // "a wizard" → indefinite, non-specific entity
      return { isDefinite: false, isSpecific: false, confidence: 0.95 };

    case DeterminerCategory.POSSESSIVE:
    case DeterminerCategory.DEMONSTRATIVE:
      // "my wizard", "this wizard" → definite, specific
      return { isDefinite: true, isSpecific: true, confidence: 0.9 };

    default:
      return { isDefinite: false, isSpecific: false, confidence: 0.7 };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Comprehensive part of speech detection
 */
export interface POSAnalysis {
  word: string;
  pos: string;  // spaCy POS tag
  category: string;  // Grammar category from our taxonomy
  entityRelevance: number;  // 0-1 score: how relevant for entity extraction
  relationRelevance: number;  // 0-1 score: how relevant for relation extraction
}

export function analyzePOS(word: string, pos: string, tag: string, dep: string): POSAnalysis {
  const lower = word.toLowerCase();

  // Nouns → high entity relevance
  if (pos === 'NOUN' || pos === 'PROPN') {
    const category = detectNounCategory(word, pos, /^[A-Z]/.test(word));
    return {
      word,
      pos,
      category: category.toString(),
      entityRelevance: 1.0,
      relationRelevance: 0.1
    };
  }

  // Verbs → high relation relevance
  if (pos === 'VERB') {
    const category = detectVerbCategory(lower, dep === 'dobj', dep === 'attr');
    return {
      word,
      pos,
      category: category.toString(),
      entityRelevance: 0.0,
      relationRelevance: 1.0
    };
  }

  // Adjectives → entity attributes
  if (pos === 'ADJ') {
    const category = detectAdjectiveCategory(word, pos);
    return {
      word,
      pos,
      category: category.toString(),
      entityRelevance: 0.7,
      relationRelevance: 0.2
    };
  }

  // Adverbs → relation qualifiers
  if (pos === 'ADV') {
    const category = detectAdverbCategory(word);
    return {
      word,
      pos,
      category: category.toString(),
      entityRelevance: 0.1,
      relationRelevance: 0.8
    };
  }

  // Prepositions → relation modifiers
  if (pos === 'ADP') {
    const category = detectPrepositionCategory(word, 'unknown');
    return {
      word,
      pos,
      category: category.toString(),
      entityRelevance: 0.0,
      relationRelevance: 0.9
    };
  }

  // Default
  return {
    word,
    pos,
    category: 'other',
    entityRelevance: 0.0,
    relationRelevance: 0.0
  };
}
