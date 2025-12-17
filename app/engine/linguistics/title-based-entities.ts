/**
 * Title-Based Entity Recognition
 *
 * Extracts entities from title/role references like:
 * - "the librarian" → PERSON (TIER_C)
 * - "the deputy" → PERSON (TIER_C)
 * - "the stranger" → PERSON (TIER_C)
 * - "the inn" → PLACE (TIER_C)
 *
 * These are provisional TIER_C entities that:
 * - Are useful for relation extraction context
 * - Can be promoted if corroborated by other evidence
 * - Are NOT merged with proper-name entities
 *
 * Design:
 * - Pattern-based extraction (deterministic)
 * - Requires context to avoid false positives
 * - Returns entities with tier=TIER_C
 */

import type { Entity, EntityType, EntityTier } from '../schema';
import { v4 as uuid } from 'uuid';

/**
 * Role words that indicate a PERSON when preceded by "the"
 *
 * These are occupational/relational titles that reference specific individuals.
 */
const PERSON_ROLE_WORDS = new Set([
  // Occupations
  'librarian', 'deputy', 'sheriff', 'mayor', 'judge', 'doctor', 'nurse',
  'teacher', 'principal', 'headmaster', 'headmistress', 'professor',
  'priest', 'vicar', 'pastor', 'minister', 'rabbi', 'imam',
  'blacksmith', 'baker', 'butcher', 'innkeeper', 'barkeeper', 'bartender',
  'shopkeeper', 'merchant', 'clerk', 'secretary', 'assistant',
  'guard', 'soldier', 'captain', 'general', 'admiral', 'colonel', 'sergeant',
  'detective', 'inspector', 'constable', 'officer', 'chief',
  'cook', 'chef', 'maid', 'butler', 'servant', 'steward', 'housekeeper',
  'driver', 'coachman', 'ferryman', 'pilot', 'captain',
  'lawyer', 'attorney', 'prosecutor', 'defender',
  'architect', 'engineer', 'scientist', 'inventor',
  'artist', 'painter', 'sculptor', 'musician', 'singer', 'dancer',
  'writer', 'author', 'poet', 'journalist', 'reporter',
  'tailor', 'seamstress', 'cobbler', 'carpenter', 'mason',
  'farmer', 'shepherd', 'fisherman', 'hunter', 'woodsman',
  'healer', 'midwife', 'apothecary', 'herbalist',
  'wizard', 'witch', 'sorcerer', 'sorceress', 'mage', 'enchanter', 'enchantress',

  // Relational roles
  'stranger', 'visitor', 'guest', 'traveler', 'pilgrim',
  'messenger', 'herald', 'ambassador', 'envoy',
  'prisoner', 'captive', 'hostage',
  'victim', 'witness', 'suspect', 'culprit',
  'hero', 'villain', 'antagonist', 'protagonist',
  'narrator', 'storyteller',

  // Social/family (when used as identifier)
  'elder', 'eldest', 'youngest', 'baby',
  'widow', 'widower', 'orphan',
  'bride', 'groom', 'newlywed',

  // Authority/royalty
  'king', 'queen', 'prince', 'princess',
  'lord', 'lady', 'duke', 'duchess', 'earl', 'countess', 'baron', 'baroness',
  'emperor', 'empress', 'sultan', 'caliph', 'pharaoh',
  'chief', 'chieftain', 'elder', 'leader',
]);

/**
 * Role words that indicate a PLACE when preceded by "the"
 */
const PLACE_ROLE_WORDS = new Set([
  'inn', 'tavern', 'pub', 'bar', 'saloon',
  'shop', 'store', 'market', 'bazaar',
  'church', 'chapel', 'cathedral', 'temple', 'mosque', 'synagogue',
  'school', 'academy', 'university', 'college', 'institute',
  'hospital', 'clinic', 'infirmary',
  'prison', 'jail', 'dungeon',
  'castle', 'palace', 'manor', 'mansion', 'estate',
  'village', 'town', 'city', 'capital',
  'forest', 'woods', 'grove', 'meadow', 'field',
  'mountain', 'hill', 'valley', 'canyon', 'gorge',
  'river', 'lake', 'pond', 'stream', 'creek',
  'ocean', 'sea', 'bay', 'harbor', 'port',
  'island', 'peninsula', 'coast', 'shore', 'beach',
  'cave', 'cavern', 'mine', 'quarry',
  'bridge', 'tower', 'gate', 'wall',
  'cemetery', 'graveyard', 'crypt', 'tomb',
  'farm', 'ranch', 'plantation', 'orchard', 'vineyard',
]);

/**
 * Role words that indicate an ORG when preceded by "the"
 */
const ORG_ROLE_WORDS = new Set([
  'council', 'committee', 'board', 'commission',
  'guild', 'order', 'brotherhood', 'sisterhood',
  'army', 'navy', 'militia', 'guard', 'legion',
  'church', 'clergy', 'priesthood',
  'court', 'tribunal', 'parliament', 'senate',
  'company', 'corporation', 'firm', 'agency',
  'government', 'administration', 'ministry', 'department',
  'police', 'constabulary',
  'band', 'troupe', 'ensemble', 'orchestra', 'choir',
  'team', 'crew', 'squad', 'unit',
]);

/**
 * Pattern for matching title-based references
 *
 * Matches: "the librarian", "The Deputy", "the old man"
 * Does NOT match: "the book", "the problem", "the way"
 */
const TITLE_PATTERN = /\b[Tt]he\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/g;

/**
 * Adjectives that can precede role words
 */
const VALID_ADJECTIVES = new Set([
  'old', 'young', 'elderly', 'ancient',
  'tall', 'short', 'fat', 'thin', 'slim',
  'beautiful', 'handsome', 'ugly', 'plain',
  'rich', 'poor', 'wealthy',
  'wise', 'foolish', 'clever', 'stupid',
  'kind', 'cruel', 'gentle', 'fierce',
  'brave', 'cowardly', 'bold', 'timid',
  'good', 'evil', 'wicked', 'holy', 'dark',
  'foreign', 'local', 'mysterious', 'strange',
  'royal', 'noble', 'humble', 'common',
  'new', 'former', 'late', 'current',
  'head', 'chief', 'senior', 'junior',
]);

/**
 * Check if a word is a valid role word for an entity type
 */
function getRoleType(word: string): EntityType | null {
  const lower = word.toLowerCase();
  if (PERSON_ROLE_WORDS.has(lower)) return 'PERSON';
  if (PLACE_ROLE_WORDS.has(lower)) return 'PLACE';
  if (ORG_ROLE_WORDS.has(lower)) return 'ORG';
  return null;
}

/**
 * Extract title-based entities from text
 *
 * @param text - Text to extract from
 * @returns Array of TIER_C entities
 */
export function extractTitleBasedEntities(text: string): Entity[] {
  const entities: Entity[] = [];
  const seen = new Set<string>(); // Deduplicate

  // Reset regex
  TITLE_PATTERN.lastIndex = 0;

  let match;
  while ((match = TITLE_PATTERN.exec(text)) !== null) {
    const fullMatch = match[0]; // "the librarian"
    const capture = match[1];   // "librarian" or "old librarian"

    const words = capture.split(/\s+/);

    // Handle single word: "the librarian"
    if (words.length === 1) {
      const roleType = getRoleType(words[0]);
      if (roleType) {
        const key = `${fullMatch.toLowerCase()}:${roleType}`;
        if (!seen.has(key)) {
          seen.add(key);
          entities.push(createTitleEntity(fullMatch, roleType, match.index));
        }
      }
    }

    // Handle adjective + role: "the old librarian"
    if (words.length === 2) {
      const [adj, role] = words;
      if (VALID_ADJECTIVES.has(adj.toLowerCase())) {
        const roleType = getRoleType(role);
        if (roleType) {
          const key = `${fullMatch.toLowerCase()}:${roleType}`;
          if (!seen.has(key)) {
            seen.add(key);
            entities.push(createTitleEntity(fullMatch, roleType, match.index));
          }
        }
      }
    }
  }

  return entities;
}

/**
 * Create a TIER_C entity from a title-based reference
 */
function createTitleEntity(
  surfaceForm: string,
  type: EntityType,
  position: number
): Entity {
  // Normalize: "the librarian" → "The Librarian"
  const canonical = surfaceForm
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return {
    id: `title-entity-${uuid().slice(0, 8)}`,
    type,
    canonical,
    aliases: [surfaceForm],
    tier: 'TIER_C',
    confidence: 0.40, // Low confidence for title-based entities
    attrs: {
      source: 'title_reference',
      position,
      tierReason: 'title_based_reference',
    },
    created_at: new Date().toISOString(),
  };
}

/**
 * Check if a text fragment is a title-based entity reference
 *
 * @param fragment - Text fragment to check
 * @returns Entity type if it's a title reference, null otherwise
 */
export function isTitleBasedReference(fragment: string): EntityType | null {
  const lower = fragment.toLowerCase().trim();

  // Must start with "the"
  if (!lower.startsWith('the ')) return null;

  const rest = lower.slice(4).trim();
  const words = rest.split(/\s+/);

  // Single word
  if (words.length === 1) {
    return getRoleType(words[0]);
  }

  // Adjective + role
  if (words.length === 2) {
    const [adj, role] = words;
    if (VALID_ADJECTIVES.has(adj)) {
      return getRoleType(role);
    }
  }

  return null;
}

/**
 * Promote title-based entities that are corroborated
 *
 * If a TIER_C title entity appears in relations with TIER_A/B entities,
 * or has multiple mentions, promote it to TIER_B.
 *
 * @param entities - All entities (including title-based)
 * @param relations - Extracted relations
 * @returns Entities with promotions applied
 */
export function promoteTitleEntities(
  entities: Entity[],
  relations: Array<{ subj: string; obj: string }>
): Entity[] {
  // Find title-based TIER_C entities
  const titleEntities = entities.filter(
    e => e.tier === 'TIER_C' && e.attrs?.source === 'title_reference'
  );

  // Get IDs of entities in relations
  const entityIdsInRelations = new Set<string>();
  for (const rel of relations) {
    entityIdsInRelations.add(rel.subj);
    entityIdsInRelations.add(rel.obj);
  }

  // Promote title entities that appear in relations
  return entities.map(entity => {
    if (
      entity.tier === 'TIER_C' &&
      entity.attrs?.source === 'title_reference' &&
      entityIdsInRelations.has(entity.id)
    ) {
      return {
        ...entity,
        tier: 'TIER_B' as EntityTier,
        attrs: {
          ...entity.attrs,
          tierReason: 'title_promoted_via_relation',
        },
      };
    }
    return entity;
  });
}
