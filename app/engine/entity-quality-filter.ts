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

const TITLE_PREFIXES = new Set([
  'mr', 'mrs', 'miss', 'ms', 'dr', 'doctor',
  'prof', 'professor', 'sir', 'madam', 'madame',
  'lord', 'lady', 'king', 'queen', 'prince', 'princess',
  'captain', 'commander', 'head', 'headmaster', 'headmistress',
  'chief', 'general'
]);

function hasTitlePrefix(name: string): boolean {
  const tokens = name
    .split(/\s+/)
    .map(token => token.toLowerCase())
    .filter(Boolean);
  if (tokens.length < 2) return false;
  return TITLE_PREFIXES.has(tokens[0]);
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
    if (hasTitlePrefix(name)) {
      return true;
    }
    const trimmed = name.trim();
    const firstChar = trimmed[0];
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
  // Also check for spelled-out numbers like "one thousand seven hundred"
  const hasSpelledOutNumbers = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/i.test(name);

  return hasNumbers || hasTemporalKeywords || hasSpelledOutNumbers;
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
 * Check if word looks like a surname (vs first name)
 */
function looksLikeSurname(word: string): boolean {
  const lower = word.toLowerCase();

  // Common surname endings
  const surnameEndings = [
    // Patronymic/occupational endings
    'son', 'sen', 'sson', 'ton', 'ham', 'ley', 'field',
    'man', 'stein', 'berg', 'ski', 'sky', 'wicz',
    'ing', 'ford', 'wood', 'ridge', 'dale', 'hill',
    // Additional common endings
    'er', 'or', 'ar',           // Potter, Miller, Granger, etc.
    'kins', 'kin',              // Larkins, Perkins, etc.
    'well', 'wall', 'wick',     // Maxwell, Powell, Warwick, etc.
    'ape', 'ope',               // Snape, Pope, etc.
    'good',                     // Lovegood, etc.
    'more', 'ore',              // Blackmore, Dumbledore, etc.
    'grave', 'grove',           // Graves, Groves, etc.
    'stone', 'strom',           // Stone, Stromberg, etc.
    'water', 'worth',           // Waterford, Worthing, etc.
    'foy', 'roy',               // Malfoy, Leroy, etc.
    'aw', 'ew',                 // Ravenclaw, Crenshaw, etc.
    'om', 'um',                 // Longbottom, etc.
    'in', 'an', 'on',           // Lupin, Petunia->Pettigrew pattern (wider), etc.
  ];

  if (surnameEndings.some(end => lower.endsWith(end))) {
    return true;
  }

  // Common surname prefixes
  const surnamePrefixes = ['mc', 'mac', "o'", 'van', 'von', 'de', 'di', 'du', 'le', 'la'];
  if (surnamePrefixes.some(pre => lower.startsWith(pre))) {
    return true;
  }

  return false;
}

/**
 * Check if name looks like two first names mashed together (no surname)
 */
function looksLikeTwoFirstNames(name: string): boolean {
  const words = name.split(/\s+/).filter(Boolean);

  // Must be exactly 2 words
  if (words.length !== 2) return false;

  // Both must be capitalized
  if (!words.every(w => /^[A-Z]/.test(w))) return false;

  // Check if second word looks like a surname
  const secondWord = words[1];
  if (looksLikeSurname(secondWord)) {
    return false; // Valid: "Harry Potter" (Potter is a surname)
  }

  // Two capitalized words, second is NOT a surname
  // Pattern: "Elimelech Naomi" (two first names - REJECT)
  return true;
}

/**
 * Check if name is a role/title description rather than a proper name
 */
function isRoleBasedName(name: string): boolean {
  const lowerName = name.toLowerCase();
  const words = lowerName.split(/\s+/).filter(Boolean);

  const ROLE_DESCRIPTORS = new Set([
    'man', 'woman', 'boy', 'girl', 'child', 'person', 'people',
    'young', 'old', 'elder', 'eldest', 'youngest',
    'master', 'mistress', 'servant', 'slave',
    'messenger', 'soldier', 'warrior', 'guard',
    'stranger', 'visitor', 'traveler'
  ]);

  // Single role word
  if (words.length === 1 && ROLE_DESCRIPTORS.has(words[0])) {
    return true;
  }

  // "the [role]" or "a [role]"
  if (words.length === 2) {
    const [first, second] = words;
    if ((first === 'the' || first === 'a' || first === 'an') && ROLE_DESCRIPTORS.has(second)) {
      return true;
    }

    // "young man", "old woman"
    if (ROLE_DESCRIPTORS.has(first) && ROLE_DESCRIPTORS.has(second)) {
      return true;
    }
  }

  return false;
}

/**
 * Split a two-first-names entity into constituent parts
 */
function splitTwoFirstNamesEntity(entity: Entity): Entity[] {
  const words = entity.canonical.split(/\s+/).filter(Boolean);
  if (words.length !== 2) return [];

  // Create two entities from the parts
  // Use canonical names as basis for IDs so they naturally dedupe with separately-extracted entities
  return words.map(word => {
    // Generate a deterministic ID based on canonical name (similar to how entities are normally created)
    const canonicalLower = word.toLowerCase();
    const newId = `entity-${entity.type.toLowerCase()}-${canonicalLower}`;

    return {
      ...entity,
      id: newId,
      canonical: word,
      attrs: {
        ...entity.attrs,
        confidence: ((entity.attrs?.confidence as number) || 1.0) * 0.95, // Slightly lower confidence
      }
    };
  });
}

/**
 * Main entity quality filter
 */
export function filterLowQualityEntities(
  entities: Entity[],
  config: EntityQualityConfig = DEFAULT_CONFIG
): Entity[] {
  const filtered: Entity[] = [];

  for (const entity of entities) {
    const name = entity.canonical;
    const lowerName = name.toLowerCase();

    const isDateEntity = entity.type === 'DATE';
    if (isDateEntity && process.env.L4_DEBUG === "1") {
      console.log(`[QUALITY-FILTER] Processing DATE: "${name}"`);
    }

    // 1. Confidence check
    const confidence = (entity.attrs?.confidence as number) || 1.0;
    if (confidence < config.minConfidence) {
      continue;
    }

    // 2. Name length check
    if (name.length < config.minNameLength) {
      continue;
    }

    // 3. Blocked tokens check
    if (config.blockedTokens.has(lowerName)) {
      continue;
    }

    // 4. Capitalization check for proper nouns
    if (config.requireCapitalization && !isValidProperNoun(name, entity.type)) {
      if (name.toLowerCase().includes('mcgonagall') && process.env.L3_DEBUG === '1') {
        console.log(`[DEBUG-MCG] filterLowQualityEntities rejecting ${name} due to capitalization`);
      }
      continue;
    }

    // 5. Valid characters check
    if (entity.type !== 'DATE' && !hasValidCharacters(name)) {
      continue;
    }

    // 6. Type-specific validation
    if (entity.type === 'DATE') {
      // Allow simple numeric years (like "1775", "2024", etc.)
      const isSimpleYear = /^\d{4}$/.test(name);
      if (!isSimpleYear && !isValidDate(name)) {
        if (isDateEntity && process.env.L4_DEBUG === "1") {
          console.log(`[QUALITY-FILTER] DATE "${name}" failed isValidDate check`);
        }
        continue;
      }
    }

    // 7. Too generic check
    if (isTooGeneric(name)) {
      continue;
    }

    // 8. Strict mode additional checks
    if (config.strictMode) {
      // In strict mode, reject entities that look suspicious

      // Reject all-caps (likely acronyms without context)
      if (name.length > 1 && name === name.toUpperCase()) {
        // Allow known acronyms like "US", "UK", "FBI"
        const knownAcronyms = ['US', 'UK', 'USA', 'FBI', 'CIA', 'NASA', 'NATO'];
        if (!knownAcronyms.includes(name)) {
          continue;
        }
      }

      // Reject single words that are common nouns
      const words = name.split(/\s+/);
      if (words.length === 1) {
        // Single-word proper nouns should be at least 3 chars in strict mode
        if (name.length < 3) {
          continue;
        }
      }
    }

    // 9. Handle entities with two first names (biblical text issue - FILTER 1)
    if (entity.type === 'PERSON' && looksLikeTwoFirstNames(name)) {
      // Instead of rejecting, split into constituent parts
      if (process.env.L4_DEBUG === '1') {
        console.log(`[QUALITY-FILTER] Splitting PERSON "${name}" into constituent parts`);
      }
      const splitEntities = splitTwoFirstNamesEntity(entity);
      filtered.push(...splitEntities);
      continue;
    }

    // 10. Reject role-based names (FILTER 2)
    if (isRoleBasedName(name)) {
      if (process.env.L4_DEBUG === '1') {
        console.log(`[QUALITY-FILTER] Rejecting "${name}" - role descriptor`);
      }
      continue;
    }

    // Entity passed all checks, add to filtered list
    filtered.push(entity);
  }

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
    twoFirstNames: number;
    roleDescriptor: number;
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
      twoFirstNames: 0,
      roleDescriptor: 0,
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
    } else if (entity.type !== 'DATE' && !hasValidCharacters(name)) {
      stats.removedByReason.invalidCharacters++;
    } else if (entity.type === 'DATE' && !isValidDate(name)) {
      stats.removedByReason.invalidDate++;
    } else if (isTooGeneric(name)) {
      stats.removedByReason.tooGeneric++;
    } else if (entity.type === 'PERSON' && looksLikeTwoFirstNames(name)) {
      stats.removedByReason.twoFirstNames++;
    } else if (isRoleBasedName(name)) {
      stats.removedByReason.roleDescriptor++;
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
