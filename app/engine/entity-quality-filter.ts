/**
 * Entity Quality Filter (Layer 1 of Precision Defense System)
 *
 * Filters low-quality entities BEFORE relation extraction to prevent
 * cascading false positives.
 *
 * Rationale: Bad entities → bad relations
 * - "Maybe" as PERSON → false relations
 * - "It" as ORG → false relations
 * - Pronouns without proper resolution → false relations
 */

import type { Entity, EntityType } from './schema';

export interface EntityQualityConfig {
  minConfidence: number;
  minNameLength: number;
  blockedTokens: Set<string>;
  requireCapitalization: boolean;
  strictMode: boolean; // Extra strict for complex text
}

export const DEFAULT_CONFIG: EntityQualityConfig = {
  minConfidence: 0.65,        // Reject entities with confidence < 65%
  minNameLength: 2,            // Reject single-letter entities
  blockedTokens: new Set([
    // Pronouns (should be resolved via coreference, not extracted as entities)
    'he', 'she', 'it', 'they', 'them', 'we', 'us', 'i', 'you', 'me',
    'him', 'her', 'his', 'hers', 'their', 'theirs', 'our', 'ours',

    // Demonstratives
    'this', 'that', 'these', 'those',

    // Determiners
    'the', 'a', 'an',

    // Vague terms
    'something', 'someone', 'somebody', 'somewhere',
    'thing', 'person', 'people', 'place',
    'situation', 'case', 'instance', 'example',
    'way', 'time', 'day', 'year',

    // Question words
    'who', 'what', 'where', 'when', 'why', 'how',

    // Common false positives
    'maybe', 'perhaps', 'if', 'then', 'else',
    'and', 'or', 'but', 'nor',
  ]),
  requireCapitalization: true,  // PERSON/ORG/PLACE must start with capital
  strictMode: false
};

export const STRICT_CONFIG: EntityQualityConfig = {
  ...DEFAULT_CONFIG,
  minConfidence: 0.75,  // Higher bar in strict mode
  minNameLength: 3,      // Longer names required
  strictMode: true
};

/**
 * Check if entity name looks like a valid proper noun
 */
function isValidProperNoun(name: string, type: EntityType): boolean {
  // Proper nouns (PERSON, ORG, PLACE, HOUSE) should start with capital letter
  if (['PERSON', 'ORG', 'PLACE', 'HOUSE', 'TRIBE'].includes(type)) {
    const firstChar = name[0];
    if (!firstChar || firstChar !== firstChar.toUpperCase()) {
      return false;
    }
  }

  return true;
}

/**
 * Check if entity name contains valid characters
 */
function hasValidCharacters(name: string): boolean {
  // Should contain mostly letters
  const letterCount = (name.match(/[a-zA-Z]/g) || []).length;
  const totalChars = name.replace(/\s/g, '').length; // Exclude spaces

  if (totalChars === 0) return false;

  // At least 70% letters (allows for names like "Henry VIII")
  const letterRatio = letterCount / totalChars;
  return letterRatio >= 0.70;
}

/**
 * Validate DATE entities have temporal markers
 */
function isValidDate(name: string): boolean {
  // Dates should contain numbers or temporal keywords
  const hasNumbers = /\d/.test(name);
  const hasTemporalKeywords = /\b(year|month|day|century|age|era|bc|ad|today|yesterday|tomorrow)\b/i.test(name);

  return hasNumbers || hasTemporalKeywords;
}

/**
 * Check if name is too generic
 */
function isTooGeneric(name: string): boolean {
  const lowerName = name.toLowerCase();

  // Single common words
  const genericWords = [
    'man', 'woman', 'boy', 'girl', 'child',
    'king', 'queen', 'lord', 'lady',
    'group', 'team', 'organization',
    'city', 'town', 'village', 'country',
    'world', 'earth', 'universe',
    'thing', 'stuff', 'item', 'object',
  ];

  if (genericWords.includes(lowerName)) {
    return true;
  }

  // Descriptive phrases without proper nouns
  if (lowerName.match(/^(the|a|an)\s+\w+$/)) {
    // "the man", "a woman", etc.
    return true;
  }

  return false;
}

/**
 * Main entity quality filter
 */
export function filterLowQualityEntities(
  entities: Entity[],
  config: EntityQualityConfig = DEFAULT_CONFIG
): Entity[] {
  const filtered = entities.filter(entity => {
    const name = entity.canonical;
    const lowerName = name.toLowerCase();

    // 1. Confidence check
    const confidence = (entity.attrs?.confidence as number) || 1.0;
    if (confidence < config.minConfidence) {
      return false;
    }

    // 2. Name length check
    if (name.length < config.minNameLength) {
      return false;
    }

    // 3. Blocked tokens check
    if (config.blockedTokens.has(lowerName)) {
      return false;
    }

    // 4. Capitalization check for proper nouns
    if (config.requireCapitalization) {
      if (!isValidProperNoun(name, entity.type)) {
        return false;
      }
    }

    // 5. Valid characters check
    if (!hasValidCharacters(name)) {
      return false;
    }

    // 6. Type-specific validation
    if (entity.type === 'DATE') {
      if (!isValidDate(name)) {
        return false;
      }
    }

    // 7. Too generic check
    if (isTooGeneric(name)) {
      return false;
    }

    // 8. Strict mode additional checks
    if (config.strictMode) {
      // In strict mode, reject entities that look suspicious

      // Reject all-caps (likely acronyms without context)
      if (name.length > 1 && name === name.toUpperCase()) {
        // Allow known acronyms like "US", "UK", "FBI"
        const knownAcronyms = ['US', 'UK', 'USA', 'FBI', 'CIA', 'NASA', 'NATO'];
        if (!knownAcronyms.includes(name)) {
          return false;
        }
      }

      // Reject single words that are common nouns
      const words = name.split(/\s+/);
      if (words.length === 1) {
        // Single-word proper nouns should be at least 3 chars in strict mode
        if (name.length < 3) {
          return false;
        }
      }
    }

    return true;
  });

  return filtered;
}

/**
 * Get statistics about filtered entities
 */
export interface FilterStats {
  original: number;
  filtered: number;
  removed: number;
  removalRate: number;
  removedByReason: {
    lowConfidence: number;
    tooShort: number;
    blockedToken: number;
    noCapitalization: number;
    invalidCharacters: number;
    invalidDate: number;
    tooGeneric: number;
    strictMode: number;
  };
}

export function getFilterStats(
  originalEntities: Entity[],
  filteredEntities: Entity[],
  config: EntityQualityConfig = DEFAULT_CONFIG
): FilterStats {
  const removed = originalEntities.length - filteredEntities.length;
  const removedIds = new Set(filteredEntities.map(e => e.id));
  const removedEntities = originalEntities.filter(e => !removedIds.has(e.id));

  const stats: FilterStats = {
    original: originalEntities.length,
    filtered: filteredEntities.length,
    removed,
    removalRate: removed / originalEntities.length,
    removedByReason: {
      lowConfidence: 0,
      tooShort: 0,
      blockedToken: 0,
      noCapitalization: 0,
      invalidCharacters: 0,
      invalidDate: 0,
      tooGeneric: 0,
      strictMode: 0,
    }
  };

  // Analyze removal reasons
  for (const entity of removedEntities) {
    const name = entity.canonical;
    const lowerName = name.toLowerCase();

    const confidence = (entity.attrs?.confidence as number) || 1.0;
    if (confidence < config.minConfidence) {
      stats.removedByReason.lowConfidence++;
    } else if (name.length < config.minNameLength) {
      stats.removedByReason.tooShort++;
    } else if (config.blockedTokens.has(lowerName)) {
      stats.removedByReason.blockedToken++;
    } else if (config.requireCapitalization && !isValidProperNoun(name, entity.type)) {
      stats.removedByReason.noCapitalization++;
    } else if (!hasValidCharacters(name)) {
      stats.removedByReason.invalidCharacters++;
    } else if (entity.type === 'DATE' && !isValidDate(name)) {
      stats.removedByReason.invalidDate++;
    } else if (isTooGeneric(name)) {
      stats.removedByReason.tooGeneric++;
    } else if (config.strictMode) {
      stats.removedByReason.strictMode++;
    }
  }

  return stats;
}

/**
 * Check if entity quality filtering is enabled
 *
 * DEFAULT: ENABLED (proven effective in Phase 1)
 * To disable: ARES_ENTITY_FILTER=off
 */
export function isEntityFilterEnabled(): boolean {
  // Explicitly disabled
  if (process.env.ARES_ENTITY_FILTER === 'off' || process.env.ARES_ENTITY_FILTER === '0') {
    return false;
  }

  // Enabled by default (or explicitly enabled)
  return true;
}

/**
 * Get filter config based on environment
 */
export function getFilterConfig(): EntityQualityConfig {
  const strict = process.env.ARES_PRECISION_MODE === 'strict';
  return strict ? STRICT_CONFIG : DEFAULT_CONFIG;
}
