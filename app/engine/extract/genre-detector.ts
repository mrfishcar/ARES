/**
 * Genre Detector
 *
 * Automatically detects document genre to apply appropriate entity recognition priors.
 * Different genres have different entity type distributions and naming patterns.
 *
 * Supported genres:
 * - Fantasy (Lord of the Rings, Harry Potter)
 * - Biblical/Religious texts
 * - Business/Corporate news
 * - Historical narratives
 * - Modern fiction
 * - Technical/Academic
 */

import type { EntityType } from '../schema';

export type Genre = 'fantasy' | 'biblical' | 'business' | 'historical' | 'modern_fiction' | 'technical' | 'general';

/**
 * Genre-specific priors for entity classification
 */
export interface GenrePriors {
  name: Genre;
  displayName: string;

  // Prior probabilities for ambiguous single-word capitalized entities
  // P(type | single-word capitalized, genre)
  singleWordPriors: Record<EntityType, number>;

  // Expected entity types in this genre (ordered by frequency)
  expectedTypes: EntityType[];

  // Lexical markers (keywords indicating this genre)
  keywords: Set<string>;

  // Name patterns (regex for character names)
  namePatterns: RegExp[];

  // Verb patterns characteristic of genre
  verbPatterns: RegExp[];

  // Confidence threshold adjustments
  confidenceBoost: number;  // Multiplier for entities matching genre expectations
}

/**
 * Fantasy genre priors (Tolkien, Rowling, etc.)
 */
const FANTASY_PRIORS: GenrePriors = {
  name: 'fantasy',
  displayName: 'Fantasy',

  singleWordPriors: {
    'PERSON': 0.70,     // Most single-word capitalized = character names
    'PLACE': 0.20,      // Some places (Rivendell, Gondor)
    'ORG': 0.05,
    'ITEM': 0.03,
    'EVENT': 0.01,
    'WORK': 0.01
  },

  expectedTypes: ['PERSON', 'PLACE', 'ITEM', 'ORG', 'EVENT'],

  keywords: new Set([
    'wizard', 'magic', 'spell', 'wand', 'staff', 'sword', 'dragon', 'elf', 'dwarf',
    'hobbit', 'orc', 'kingdom', 'castle', 'quest', 'prophecy', 'dark lord',
    'enchanted', 'cursed', 'potion', 'charm', 'hex', 'jinx', 'transfiguration',
    'divination', 'defense', 'dueling', 'apparate', 'disapparate', 'muggle',
    'fellowship', 'ringbearer', 'palantir', 'mithril', 'shire', 'mordor'
  ]),

  namePatterns: [
    /\w+alf$/,           // Gandalf, Radagalf
    /\w+orn$/,           // Aragorn, Arathorn
    /\w+iel$/,           // Arwen, Galadriel
    /\w+dor$/,           // Gondor, Mordor
    /^[A-Z]\w+stone$/,   // Brimstone, etc.
  ],

  verbPatterns: [
    /\b(enchant|bewitch|curse|summon|vanquish|smite|wield)\w*\b/i,
    /\b(quest|journey|travell?ed|ventured|sought)\w*\b/i
  ],

  confidenceBoost: 1.1
};

/**
 * Biblical/Religious genre priors
 */
const BIBLICAL_PRIORS: GenrePriors = {
  name: 'biblical',
  displayName: 'Biblical/Religious',

  singleWordPriors: {
    'PERSON': 0.75,     // Abraham, Isaac, Jacob
    'PLACE': 0.20,      // Hebron, Jerusalem
    'ORG': 0.03,
    'EVENT': 0.01,
    'ITEM': 0.01,
    'WORK': 0.00
  },

  expectedTypes: ['PERSON', 'PLACE', 'EVENT', 'ORG'],

  keywords: new Set([
    'begat', 'begot', 'lord', 'god', 'thee', 'thou', 'thy', 'thine',
    'testified', 'covenant', 'altar', 'sacrifice', 'prophet', 'apostle',
    'disciple', 'pharisee', 'sadducee', 'scribe', 'temple', 'synagogue',
    'sabbath', 'passover', 'blessed', 'righteousness', 'salvation',
    'commandment', 'testament', 'scripture', 'israelite', 'gentile'
  ]),

  namePatterns: [
    /^[A-Z]\w+ah$/,      // Abijah, Jedidiah
    /^[A-Z]\w+iah$/,     // Isaiah, Jeremiah
    /^[A-Z]\w+el$/,      // Israel, Daniel, Samuel
  ],

  verbPatterns: [
    /\b(begat|begot|testified|covenanted|blessed|anointed)\w*\b/i,
    /\b(dwelt|sojourned|smote|slew)\w*\b/i
  ],

  confidenceBoost: 1.15
};

/**
 * Business/Corporate genre priors
 */
const BUSINESS_PRIORS: GenrePriors = {
  name: 'business',
  displayName: 'Business/Corporate',

  singleWordPriors: {
    'PERSON': 0.35,     // CEOs, founders
    'ORG': 0.55,        // Companies, startups
    'PLACE': 0.05,
    'ITEM': 0.03,
    'EVENT': 0.02,
    'WORK': 0.00
  },

  expectedTypes: ['ORG', 'PERSON', 'PLACE', 'ITEM'],

  keywords: new Set([
    'founded', 'ceo', 'cto', 'cfo', 'founder', 'co-founder', 'startup', 'venture',
    'invested', 'investment', 'funding', 'round', 'valuation', 'acquisition',
    'acquired', 'merger', 'ipo', 'revenue', 'profit', 'loss', 'quarter',
    'shareholder', 'board', 'executive', 'strategy', 'innovation', 'disruption',
    'silicon valley', 'unicorn', 'portfolio', 'capital', 'equity', 'stock'
  ]),

  namePatterns: [
    /\w+(tech|soft|systems|solutions|labs|capital|ventures|partners|group)\b/i,
    /^[A-Z]\w+\s+(inc|corp|llc|ltd)\.?$/i
  ],

  verbPatterns: [
    /\b(founded|launched|acquired|invested|raised|secured|announced|unveiled)\w*\b/i,
    /\b(developed|created|built|scaled|grew|expanded)\w*\b/i
  ],

  confidenceBoost: 1.05
};

/**
 * Historical narrative priors
 */
const HISTORICAL_PRIORS: GenrePriors = {
  name: 'historical',
  displayName: 'Historical',

  singleWordPriors: {
    'PERSON': 0.65,
    'PLACE': 0.25,
    'ORG': 0.05,
    'EVENT': 0.04,
    'ITEM': 0.01,
    'WORK': 0.00
  },

  expectedTypes: ['PERSON', 'PLACE', 'EVENT', 'ORG'],

  keywords: new Set([
    'century', 'dynasty', 'empire', 'kingdom', 'reign', 'monarch', 'emperor',
    'battle', 'war', 'treaty', 'alliance', 'conquest', 'revolution', 'era',
    'ancient', 'medieval', 'renaissance', 'victorian', 'colonial', 'crusade',
    'expedition', 'explorer', 'discovery', 'expedition', 'chronicle', 'annals'
  ]),

  namePatterns: [
    /^[A-Z]\w+\s+(the\s+)?(Great|First|Second|Third|IV|V|VI)\b/i,
    /^[A-Z]\w+\s+of\s+[A-Z]\w+$/
  ],

  verbPatterns: [
    /\b(conquered|ruled|reigned|governed|invaded|colonized)\w*\b/i,
    /\b(established|founded|declared|proclaimed|abolished)\w*\b/i
  ],

  confidenceBoost: 1.08
};

/**
 * Modern fiction priors
 */
const MODERN_FICTION_PRIORS: GenrePriors = {
  name: 'modern_fiction',
  displayName: 'Modern Fiction',

  singleWordPriors: {
    'PERSON': 0.80,     // Character names dominate
    'PLACE': 0.12,
    'ORG': 0.05,
    'ITEM': 0.02,
    'EVENT': 0.01,
    'WORK': 0.00
  },

  expectedTypes: ['PERSON', 'PLACE', 'ORG'],

  keywords: new Set([
    'thought', 'felt', 'wondered', 'realized', 'remembered', 'imagined',
    'whispered', 'shouted', 'murmured', 'apartment', 'street', 'restaurant',
    'office', 'phone', 'car', 'computer', 'email', 'text', 'message'
  ]),

  namePatterns: [
    /^[A-Z][a-z]+\s+[A-Z][a-z]+$/  // Standard Western names (John Smith)
  ],

  verbPatterns: [
    /\b(thought|felt|wondered|realized|remembered|noticed|watched)\w*\b/i,
    /\b(walked|ran|drove|flew|called|texted|emailed)\w*\b/i
  ],

  confidenceBoost: 1.0
};

/**
 * Technical/Academic priors
 */
const TECHNICAL_PRIORS: GenrePriors = {
  name: 'technical',
  displayName: 'Technical/Academic',

  singleWordPriors: {
    'PERSON': 0.40,     // Researchers, authors
    'ORG': 0.35,        // Universities, labs
    'PLACE': 0.05,
    'ITEM': 0.15,       // Algorithms, systems
    'WORK': 0.03,
    'EVENT': 0.02
  },

  expectedTypes: ['PERSON', 'ORG', 'ITEM', 'WORK'],

  keywords: new Set([
    'algorithm', 'system', 'method', 'approach', 'framework', 'model', 'architecture',
    'performance', 'evaluation', 'experiment', 'results', 'analysis', 'dataset',
    'proposed', 'demonstrated', 'achieved', 'implemented', 'optimized', 'validated',
    'research', 'paper', 'study', 'journal', 'conference', 'proceedings'
  ]),

  namePatterns: [
    /^[A-Z]\w+\s+et\s+al\.?$/i,  // "Smith et al."
    /^[A-Z]\w+\s+[A-Z]\w+\s+\(\d{4}\)$/  // "Smith Jones (2020)"
  ],

  verbPatterns: [
    /\b(proposed|demonstrated|achieved|implemented|optimized|validated)\w*\b/i,
    /\b(analyze|evaluate|compute|calculate|measure|estimate)\w*\b/i
  ],

  confidenceBoost: 0.95
};

/**
 * General/default priors
 */
const GENERAL_PRIORS: GenrePriors = {
  name: 'general',
  displayName: 'General',

  singleWordPriors: {
    'PERSON': 0.60,
    'PLACE': 0.20,
    'ORG': 0.15,
    'ITEM': 0.03,
    'EVENT': 0.01,
    'WORK': 0.01
  },

  expectedTypes: ['PERSON', 'PLACE', 'ORG', 'EVENT'],

  keywords: new Set([]),
  namePatterns: [],
  verbPatterns: [],

  confidenceBoost: 1.0
};

/**
 * All available genre priors
 */
const ALL_PRIORS: GenrePriors[] = [
  FANTASY_PRIORS,
  BIBLICAL_PRIORS,
  BUSINESS_PRIORS,
  HISTORICAL_PRIORS,
  MODERN_FICTION_PRIORS,
  TECHNICAL_PRIORS,
  GENERAL_PRIORS
];

/**
 * Detect document genre based on content analysis
 */
export function detectGenre(fullText: string): GenrePriors {
  // Sample analysis window (first 2000 chars + random middle sample)
  const sampleSize = Math.min(2000, fullText.length);
  const opening = fullText.slice(0, sampleSize).toLowerCase();

  // Also sample from middle (more representative for long documents)
  const middleStart = Math.floor(fullText.length / 3);
  const middle = fullText.slice(middleStart, middleStart + 1000).toLowerCase();

  const sample = opening + ' ' + middle;

  // Score each genre based on keyword matches
  const genreScores = new Map<Genre, number>();

  for (const priors of ALL_PRIORS) {
    if (priors.name === 'general') continue; // Skip general (it's the fallback)

    let score = 0;

    // Keyword matching (primary signal)
    for (const keyword of priors.keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = sample.match(regex);
      if (matches) {
        score += matches.length;
      }
    }

    // Verb pattern matching (secondary signal)
    for (const pattern of priors.verbPatterns) {
      const matches = sample.match(pattern);
      if (matches) {
        score += matches.length * 0.5;
      }
    }

    // Name pattern matching (tertiary signal)
    const capitalizedWords = fullText.match(/\b[A-Z][a-z]+\b/g) || [];
    for (const word of capitalizedWords.slice(0, 50)) { // Check first 50 capitalized words
      for (const pattern of priors.namePatterns) {
        if (pattern.test(word)) {
          score += 0.3;
        }
      }
    }

    genreScores.set(priors.name, score);
  }

  // Find highest scoring genre
  let bestGenre: Genre = 'general';
  let bestScore = 0;

  for (const [genre, score] of genreScores) {
    if (score > bestScore) {
      bestScore = score;
      bestGenre = genre;
    }
  }

  // Require minimum threshold to avoid false positives
  const MIN_SCORE = 3;
  if (bestScore < MIN_SCORE) {
    bestGenre = 'general';
  }

  const selected = ALL_PRIORS.find(p => p.name === bestGenre) || GENERAL_PRIORS;

  console.log(`[GENRE-DETECTOR] Detected genre: ${selected.displayName} (score: ${bestScore.toFixed(1)})`);

  return selected;
}

/**
 * Get entity type prior probability for a given genre
 */
export function getTypePrior(genre: GenrePriors, type: EntityType): number {
  return genre.singleWordPriors[type] || 0;
}

/**
 * Check if entity matches genre expectations
 */
export function matchesGenreExpectations(
  entityName: string,
  entityType: EntityType,
  genre: GenrePriors
): boolean {
  // Check if type is expected in this genre
  if (!genre.expectedTypes.includes(entityType)) {
    return false;
  }

  // Check if name matches genre patterns
  for (const pattern of genre.namePatterns) {
    if (pattern.test(entityName)) {
      return true;
    }
  }

  // Check if name contains genre keywords
  const nameLower = entityName.toLowerCase();
  for (const keyword of genre.keywords) {
    if (nameLower.includes(keyword)) {
      return true;
    }
  }

  return genre.expectedTypes.includes(entityType); // At least type is expected
}

/**
 * Get confidence boost for entity based on genre alignment
 */
export function getGenreConfidenceBoost(
  entityName: string,
  entityType: EntityType,
  genre: GenrePriors
): number {
  if (matchesGenreExpectations(entityName, entityType, genre)) {
    return genre.confidenceBoost;
  }
  return 1.0; // No boost
}

/**
 * Export genre priors for testing/debugging
 */
export const GENRE_PRIORS = {
  FANTASY: FANTASY_PRIORS,
  BIBLICAL: BIBLICAL_PRIORS,
  BUSINESS: BUSINESS_PRIORS,
  HISTORICAL: HISTORICAL_PRIORS,
  MODERN_FICTION: MODERN_FICTION_PRIORS,
  TECHNICAL: TECHNICAL_PRIORS,
  GENERAL: GENERAL_PRIORS
};
