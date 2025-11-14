/**
 * Entity Quality Filter
 *
 * Filters false positive entities extracted by spaCy/LLM.
 * Removes pronouns, common words, and low-quality extractions.
 */

import type { Entity, EntityType } from './schema';

/**
 * Pronouns and common words to filter out
 */
const PRONOUNS = new Set([
  'i', 'me', 'my', 'mine', 'myself',
  'you', 'your', 'yours', 'yourself',
  'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself',
  'we', 'us', 'our', 'ours', 'ourselves',
  'they', 'them', 'their', 'theirs', 'themselves',
  'this', 'that', 'these', 'those',
  'who', 'whom', 'whose', 'which', 'what',
  'anyone', 'someone', 'everyone', 'no one',
  'anybody', 'somebody', 'everybody', 'nobody',
  'anything', 'something', 'everything', 'nothing',
  'one', 'ones'
]);

/**
 * Common verbs/words often mis-extracted as entities
 */
const COMMON_WORDS = new Set([
  'said', 'came', 'went', 'moved', 'told', 'asked', 'replied',
  'welcome', 'excuse', 'sorry', 'thank', 'thanks', 'please',
  'yes', 'no', 'maybe', 'okay', 'ok', 'sure', 'fine',
  'first', 'second', 'third', 'last', 'next', 'very', 'really',
  'always', 'never', 'often', 'sometimes', 'just', 'only',
  'better', 'worse', 'good', 'bad', 'small', 'big', 'large',
  'part', 'partly', 'back', 'even', 'almost', 'definitely',
  'probably', 'sounds', 'seeing', 'tell', 'remember', 'thought',
  'killing', 'happier', 'scared', 'easier', 'different',
  'bring', 'says', 'am', 'are', 'is', 'was', 'were', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'should', 'could', 'might', 'must', 'can',
  'dinner', 'tomorrow', 'yesterday', 'today',
  'life', 'people', 'children', 'recovery', 'medicine',
  // Narrative false positives
  'perhaps', 'hidden', 'forgive', 'finally', 'inside', 'bodies',
  'whoever', 'three', 'fifty', 'entire', 'fields', 'livestock',
  'chose', 'oh', 'join', 'release', 'long', 'run', 'brilliant',
  'rebuild', 'located', 'looking', 'wisdoms', 'gather',
  'take', 'if', 'before', 'after', 'during', 'while', 'whenever'
]);

/**
 * Patterns for entity names that are likely false positives
 */
const BAD_PATTERNS = [
  // Leading conjunctions/articles/prepositions
  /^(and|or|but|the|a|an|when|where|seeing|meeting|before|after|if|take|gather|located)\s+/i,
  // Trailing verbs
  /\s+(said|asked|replied|moved|came|went|told)$/i,
  // Trailing location words (e.g., "magic there", "something here")
  /\s+(there|here)$/i,
  // Just punctuation/numbers
  /^[^a-z]+$/i,
  // Single letters (unless well-known acronyms)
  /^[a-z]$/i,
  // Chapter/section markers
  /chapter|section|part\s+\d+|epilogue|prologue/i,
  // All caps shouted text (dialogue)
  /^[A-Z\s]{4,}$/,
  // Sentence fragments with verbs
  /^(you|i|they|we)\s+(dared|use|my|your|their|our)/i,
];

/**
 * Well-known acronyms/abbreviations that are valid despite being short
 */
const VALID_SHORT_ENTITIES = new Set([
  'nyc', 'usa', 'uk', 'eu', 'un', 'fbi', 'cia', 'nsa',
  'nasa', 'mit', 'ucla', 'nyu', 'usc', 'uva',
  'ibm', 'hp', 'ge', 'gm', 'at&t',
  'dr', 'mr', 'mrs', 'ms', 'prof',
  'id', 'pm', 'am'
]);

/**
 * Entity type-specific filters
 */
const TYPE_SPECIFIC_BLOCKLIST: Partial<Record<EntityType, Set<string>>> = {
  PERSON: new Set([
    'meeting', 'chapter', 'gallery', 'track', 'island school',
    'opening', 'complications', 'crisis', 'reflection',
    'six months later', 'epilogue', 'turn', 'choice',
    'resolution', 'fragility', 'end', 'emergency', 'visit',
    'stable', 'seizure', 'surgery', 'holidays', 'teaching',
    'department', 'associate professor', 'neurologist', 'divorced',
    'academia', 'times', 'fine arts', 'medicine',
    // Fantasy/magical false positives (common nouns, not people)
    'magic', 'potions', 'slytherin', 'ravenclaw', 'hufflepuff', 'gryffindor',
    'platform', 'quidditch', 'wand', 'spell', 'charm', 'transfiguration',
    'divination', 'herbology', 'astronomy', 'defense'
  ]),
  PLACE: new Set([
    'nothing', 'everything', 'back', 'part'
  ]),
  ORG: new Set([
    'goon squad', 'visit', 'academia'
  ])
};

/**
 * Force-correct entity type based on strong lexical markers
 * This overrides spaCy classifications when we have high confidence
 */
export function correctEntityType(
  canonical: string,
  currentType: EntityType
): EntityType {
  const normalized = canonical.toLowerCase();

  // Geographic markers - MUST be PLACE
  if (/(river|creek|stream|mountain|mount|peak|hill|hillside|valley|lake|sea|ocean|island|isle|forest|wood|desert|plain|prairie|city|town|village|kingdom|realm|land|cliff|ridge|canyon|gorge|fjord|haven|harbor|bay|cove|grove|glade|dale|moor|heath|marsh|swamp|waste|wild|reach|highland|lowland|borderland)s?\b/i.test(canonical)) {
    return 'PLACE';
  }

  // Educational/organizational markers
  if (/(school|university|academy|college|ministry|department|company|corporation|inc|llc|corp|ltd|bank|institute)\b/i.test(canonical)) {
    return 'ORG';
  }

  // House/Order markers
  if (/\b(house|order|clan|tribe|dynasty)\b/i.test(canonical)) {
    return 'HOUSE';
  }

  // Event markers
  if (/\b(battle|war|treaty|accord|council|conference|summit)\s+of\b/i.test(canonical)) {
    return 'EVENT';
  }

  return currentType;
}

/**
 * Check if entity is a valid extraction
 */
export function isValidEntity(
  canonical: string,
  entityType: EntityType
): boolean {
  // DEBUG: Log professor entities
  const isProf = canonical.toLowerCase().includes('professor');
  if (isProf) {
    console.log(`[isValidEntity] Checking: "${canonical}" (${entityType})`);
  }

  if (!canonical || canonical.trim() === '') {
    if (isProf) console.log(`  REJECT: empty canonical`);
    return false;
  }

  const normalized = canonical.toLowerCase().trim();

  // 1. Filter pronouns
  if (PRONOUNS.has(normalized)) {
    if (isProf) console.log(`  REJECT: is pronoun`);
    return false;
  }

  // 2. Filter common words
  if (COMMON_WORDS.has(normalized)) {
    if (isProf) console.log(`  REJECT: is common word`);
    return false;
  }

  // 3. Filter type-specific blocklist
  const typeBlocklist = TYPE_SPECIFIC_BLOCKLIST[entityType];
  if (typeBlocklist && typeBlocklist.has(normalized)) {
    if (isProf) console.log(`  REJECT: in type blocklist`);
    return false;
  }

  if (isProf) console.log(`  PASS`);

  // 4. Check bad patterns (except for DATE/ITEM entities which can be numeric)
  // DATE entities like "3019" should not be filtered by "no letters" pattern
  if (entityType !== 'DATE' && entityType !== 'ITEM') {
    for (const pattern of BAD_PATTERNS) {
      if (pattern.test(canonical)) {
        return false;
      }
    }
  }

  // 5. Length checks (unless valid short entity)
  if (normalized.length < 2) {
    return false;
  }

  if (normalized.length === 2 && !VALID_SHORT_ENTITIES.has(normalized)) {
    // Allow 2-letter entities only if they're known acronyms or person names with titles
    if (entityType !== 'PERSON') {
      return false;
    }
  }

  // 6. Must contain at least one letter (except for DATE/ITEM entities)
  // DATE entities can be pure numbers (e.g., "3019", "2024")
  // ITEM entities can be model numbers (e.g., "iPhone 15", "3080")
  if (entityType !== 'DATE' && entityType !== 'ITEM') {
    if (!/[a-z]/i.test(canonical)) {
      return false;
    }
  }

  // 7. For PERSON entities, filter chapter/section markers
  if (entityType === 'PERSON') {
    if (/^(chapter|section|part|volume|book)\s+\d+/i.test(canonical)) {
      return false;
    }
  }

  return true;
}

/**
 * Filter a list of entities, removing false positives
 */
export function filterEntities(entities: Entity[]): Entity[] {
  return entities.filter(entity =>
    isValidEntity(entity.canonical, entity.type)
  );
}

/**
 * Quality score for entity (0-1)
 * Higher score = more likely to be valid
 */
export function scoreEntity(
  canonical: string,
  entityType: EntityType,
  mentionCount: number = 1
): number {
  let score = 1.0;

  const normalized = canonical.toLowerCase().trim();

  // Penalty for being in common words
  if (COMMON_WORDS.has(normalized)) {
    score -= 0.8;
  }

  // Penalty for being a pronoun
  if (PRONOUNS.has(normalized)) {
    score -= 0.9;
  }

  // Bonus for multiple mentions
  if (mentionCount > 1) {
    score += 0.1 * Math.min(mentionCount - 1, 5); // Up to +0.5 for 6+ mentions
  }

  // Bonus for proper capitalization
  if (canonical[0] === canonical[0].toUpperCase() && entityType === 'PERSON') {
    score += 0.1;
  }

  // Bonus for multi-word names (usually more specific)
  const wordCount = normalized.split(/\s+/).length;
  if (wordCount >= 2 && wordCount <= 4) {
    score += 0.1;
  }

  // Penalty for very long names (likely extraction errors)
  if (wordCount > 5) {
    score -= 0.2;
  }

  // Penalty for single-word PERSON entities (often errors)
  if (entityType === 'PERSON' && wordCount === 1) {
    // Exception: if it's a well-formed name (capitalized)
    if (canonical[0] !== canonical[0].toUpperCase()) {
      score -= 0.3;
    }
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Get statistics about filtered entities
 */
export function getFilterStats(
  before: Entity[],
  after: Entity[]
): {
  total: number;
  kept: number;
  filtered: number;
  filterRate: number;
  byReason: Map<string, number>;
} {
  const filtered = before.length - after.length;
  const filterRate = before.length > 0 ? filtered / before.length : 0;

  // Count reasons for filtering
  const byReason = new Map<string, number>();

  for (const entity of before) {
    if (!after.find(e => e.id === entity.id)) {
      const normalized = entity.canonical.toLowerCase().trim();

      if (PRONOUNS.has(normalized)) {
        byReason.set('pronouns', (byReason.get('pronouns') || 0) + 1);
      } else if (COMMON_WORDS.has(normalized)) {
        byReason.set('common_words', (byReason.get('common_words') || 0) + 1);
      } else if (normalized.length < 2) {
        byReason.set('too_short', (byReason.get('too_short') || 0) + 1);
      } else {
        byReason.set('other_patterns', (byReason.get('other_patterns') || 0) + 1);
      }
    }
  }

  return {
    total: before.length,
    kept: after.length,
    filtered,
    filterRate,
    byReason
  };
}
