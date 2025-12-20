/**
 * BookNLP Adapter
 *
 * Transforms BookNLP contract output into ARES internal representations.
 * This is the primary integration point between BookNLP and ARES.
 *
 * OPTIMIZATION (2025-12-20):
 * - Now extracts ALL entity types from mentions (LOC, ORG, FAC, GPE, VEH)
 * - Previously only extracted PERSON entities from character clusters
 * - Adds token-based paragraph and sentence structure
 */

import type {
  BookNLPContract,
  BookNLPCharacter,
  BookNLPMention,
  BookNLPQuote,
  BookNLPToken,
  BookNLPResult,
  ARESEntity,
  ARESSpan,
  ARESQuote,
  ARESCorefLink,
} from './types';
import { toBookNLPEID, toBookNLPStableEntityId, toBookNLPNonCharEntityId, toBookNLPNonCharEID } from './identity';

// ============================================================================
// TYPE MAPPING
// ============================================================================

/**
 * Map BookNLP entity types to ARES entity types
 */
function mapEntityType(
  booknlpType: string,
  mentionType: string
): ARESEntity['type'] {
  const typeMap: Record<string, ARESEntity['type']> = {
    'PER': 'PERSON',
    'PERSON': 'PERSON',
    'LOC': 'PLACE',
    'LOCATION': 'PLACE',
    'GPE': 'PLACE',  // Geopolitical entity
    'ORG': 'ORG',
    'ORGANIZATION': 'ORG',
    'FAC': 'PLACE',  // Facility
    'VEH': 'ITEM',   // Vehicle
    'WORK_OF_ART': 'WORK',
    'EVENT': 'EVENT',
    'DATE': 'DATE',
    'TIME': 'DATE',
  };

  const upper = booknlpType.toUpperCase();
  return typeMap[upper] || 'PERSON';  // Default to PERSON for characters
}

// ============================================================================
// ADAPTER FUNCTIONS
// ============================================================================

/**
 * Convert BookNLP characters to ARES entities
 */
export function adaptCharacters(
  characters: BookNLPCharacter[]
): ARESEntity[] {
  return characters.map(char => ({
    id: toBookNLPStableEntityId(char.id),
    canonical: char.canonical_name,
    type: 'PERSON',  // BookNLP characters are always PERSON
    aliases: char.aliases.map(a => a.text),
    confidence: 0.95,  // High confidence for BookNLP character clusters
    source: 'booknlp' as const,
    booknlp_id: char.id,
    mention_count: char.mention_count,
    gender: char.gender || undefined,
    eid: toBookNLPEID(char.id),
  }));
}

/**
 * Convert BookNLP mentions to ARES spans
 * Now handles BOTH character mentions AND non-character entity mentions
 */
export function adaptMentions(
  mentions: BookNLPMention[],
  characterIdMap: Map<string, string>,  // BookNLP char ID -> ARES entity ID
  nonCharEntityMap?: Map<string, string>  // canonical text -> ARES entity ID
): ARESSpan[] {
  return mentions
    .map(mention => {
      // For character-linked mentions, use the character entity ID
      if (mention.character_id) {
        return {
          entity_id: characterIdMap.get(mention.character_id) || toBookNLPStableEntityId(mention.character_id),
          start: mention.start_char,
          end: mention.end_char,
          text: mention.text,
          mention_id: mention.id,
          mention_type: mention.mention_type,
          entity_type: mention.entity_type,
        };
      }

      // For non-character mentions (LOC, ORG, etc.), look up in the non-char map
      if (nonCharEntityMap) {
        const nonCharId = nonCharEntityMap.get(mention.text.toLowerCase());
        if (nonCharId) {
          return {
            entity_id: nonCharId,
            start: mention.start_char,
            end: mention.end_char,
            text: mention.text,
            mention_id: mention.id,
            mention_type: mention.mention_type,
            entity_type: mention.entity_type,
          };
        }
      }

      // Skip mentions that aren't linked to any entity
      return null;
    })
    .filter((span): span is ARESSpan => span !== null);
}

// ============================================================================
// NON-CHARACTER ENTITY EXTRACTION (OPTIMIZATION 2025-12-20)
// ============================================================================

/**
 * Entity types from BookNLP that should be extracted as non-character entities
 */
const NON_CHAR_ENTITY_TYPES = new Set(['LOC', 'ORG', 'FAC', 'GPE', 'VEH', 'WORK_OF_ART', 'EVENT']);

/**
 * Extract non-character entities (locations, organizations, etc.) from BookNLP mentions.
 * These are entities that BookNLP identifies via NER but doesn't cluster into characters.
 *
 * Groups mentions by normalized text to create stable entities with accurate counts.
 */
export function adaptNonCharacterEntities(
  mentions: BookNLPMention[],
  options: { minMentionCount?: number } = {}
): { entities: ARESEntity[]; entityMap: Map<string, string> } {
  const { minMentionCount = 1 } = options;

  // Group mentions by (entity_type, normalized_text)
  const mentionGroups = new Map<string, {
    entityType: string;
    canonicalText: string;
    texts: string[];
    mentionCount: number;
  }>();

  for (const mention of mentions) {
    // Skip character-linked mentions (they're handled by adaptCharacters)
    if (mention.character_id) continue;

    // Skip PERSON types (handled by character clustering)
    if (mention.entity_type === 'PER' || mention.entity_type === 'PERSON') continue;

    // Skip types we don't extract
    if (!NON_CHAR_ENTITY_TYPES.has(mention.entity_type)) continue;

    // Skip short or likely-junk mentions
    if (mention.text.length < 2) continue;
    if (mention.mention_type === 'PRON') continue;  // Skip pronouns

    const key = `${mention.entity_type}:${mention.text.toLowerCase()}`;

    const existing = mentionGroups.get(key);
    if (existing) {
      existing.mentionCount++;
      if (!existing.texts.includes(mention.text)) {
        existing.texts.push(mention.text);
      }
    } else {
      mentionGroups.set(key, {
        entityType: mention.entity_type,
        canonicalText: mention.text,  // Use first occurrence as canonical
        texts: [mention.text],
        mentionCount: 1,
      });
    }
  }

  // Convert groups to entities
  const entities: ARESEntity[] = [];
  const entityMap = new Map<string, string>();  // normalized text -> entity ID

  for (const [key, group] of mentionGroups) {
    if (group.mentionCount < minMentionCount) continue;

    // Pick the most informative canonical form (longest, or most common)
    const canonical = group.texts.reduce((best, current) =>
      current.length > best.length ? current : best
    );

    const entityId = toBookNLPNonCharEntityId(group.entityType, canonical);
    const aresType = mapEntityType(group.entityType, 'PROP');

    entities.push({
      id: entityId,
      canonical: canonical,
      type: aresType,
      aliases: group.texts.filter(t => t !== canonical),
      confidence: 0.85,  // Slightly lower than character clusters
      source: 'booknlp' as const,
      booknlp_id: key,
      mention_count: group.mentionCount,
      eid: toBookNLPNonCharEID(group.entityType, canonical),
    });

    // Map all text variations to this entity ID
    for (const text of group.texts) {
      entityMap.set(text.toLowerCase(), entityId);
    }
  }

  console.log(`[BOOKNLP] Extracted ${entities.length} non-character entities (LOC, ORG, FAC, etc.)`);
  return { entities, entityMap };
}

/**
 * Convert BookNLP quotes to ARES quotes
 */
export function adaptQuotes(
  quotes: BookNLPQuote[],
  characterIdMap: Map<string, string>
): ARESQuote[] {
  return quotes.map(quote => ({
    id: quote.id,
    text: quote.text,
    start: quote.start_char,
    end: quote.end_char,
    speaker_id: quote.speaker_id
      ? characterIdMap.get(quote.speaker_id) || quote.speaker_id
      : null,
    speaker_name: quote.speaker_name,
    confidence: quote.speaker_id ? 0.9 : 0.5,  // Higher if speaker is known
  }));
}

/**
 * Build coreference links from BookNLP chains
 */
export function adaptCorefChains(
  contract: BookNLPContract,
  characterIdMap: Map<string, string>
): ARESCorefLink[] {
  const links: ARESCorefLink[] = [];
  const mentionById = new Map(contract.mentions.map(m => [m.id, m]));

  for (const chain of contract.coref_chains) {
    if (!chain.character_id || chain.mentions.length < 2) continue;

    const entityId = characterIdMap.get(chain.character_id) || chain.character_id;

    // Create links between consecutive mentions in the chain
    for (let i = 1; i < chain.mentions.length; i++) {
      links.push({
        from_mention_id: chain.mentions[i - 1],
        to_mention_id: chain.mentions[i],
        entity_id: entityId,
      });
    }
  }

  return links;
}

// ============================================================================
// MAIN ADAPTER
// ============================================================================

/**
 * Adapt a full BookNLP contract to ARES internal representations
 *
 * OPTIMIZATION (2025-12-20):
 * Now extracts ALL entity types, not just PERSON characters.
 * - Characters → PERSON entities (high-quality clusters)
 * - LOC/GPE/FAC mentions → PLACE entities
 * - ORG mentions → ORG entities
 * - VEH mentions → ITEM entities
 * - EVENT mentions → EVENT entities
 */
export function adaptBookNLPContract(
  contract: BookNLPContract,
  options: {
    includeRawContract?: boolean;
    minMentionCount?: number;
    extractNonCharacterEntities?: boolean;  // NEW: enable non-char extraction
  } = {}
): BookNLPResult {
  const {
    includeRawContract = false,
    minMentionCount = 1,
    extractNonCharacterEntities = true,  // Enabled by default
  } = options;

  // Filter characters by minimum mention count
  const filteredCharacters = contract.characters.filter(
    c => c.mention_count >= minMentionCount
  );

  // Convert characters to PERSON entities
  const characterEntities = adaptCharacters(filteredCharacters);

  // Build character ID mapping
  const characterIdMap = new Map<string, string>();
  for (const char of filteredCharacters) {
    const aresId = toBookNLPStableEntityId(char.id);
    characterIdMap.set(char.id, aresId);
  }

  // NEW: Extract non-character entities (LOC, ORG, FAC, GPE, VEH, etc.)
  let nonCharEntities: ARESEntity[] = [];
  let nonCharEntityMap = new Map<string, string>();

  if (extractNonCharacterEntities) {
    const nonCharResult = adaptNonCharacterEntities(contract.mentions, { minMentionCount });
    nonCharEntities = nonCharResult.entities;
    nonCharEntityMap = nonCharResult.entityMap;
  }

  // Combine all entities: characters + non-characters
  const entities = [...characterEntities, ...nonCharEntities];

  console.log(`[BOOKNLP] Adapted ${characterEntities.length} PERSON entities (characters)`);
  console.log(`[BOOKNLP] Adapted ${nonCharEntities.length} non-PERSON entities (LOC, ORG, etc.)`);
  console.log(`[BOOKNLP] Total entities: ${entities.length}`);

  // Convert mentions to spans (now includes non-character entities)
  const spans = adaptMentions(contract.mentions, characterIdMap, nonCharEntityMap);

  // Convert quotes
  const quotes = adaptQuotes(contract.quotes, characterIdMap);

  // Build coref links
  const coref_links = adaptCorefChains(contract, characterIdMap);

  return {
    entities,
    spans,
    quotes,
    coref_links,
    metadata: contract.metadata,
    raw_contract: includeRawContract ? contract : undefined,
  };
}

/**
 * Validate a BookNLP contract structure
 */
export function validateContract(data: unknown): data is BookNLPContract {
  if (!data || typeof data !== 'object') return false;

  const contract = data as BookNLPContract;

  return (
    typeof contract.schema_version === 'string' &&
    typeof contract.document_id === 'string' &&
    Array.isArray(contract.characters) &&
    Array.isArray(contract.mentions) &&
    Array.isArray(contract.quotes) &&
    Array.isArray(contract.tokens) &&
    contract.metadata !== undefined
  );
}

/**
 * Parse and validate a JSON string as BookNLP contract
 */
export function parseBookNLPContract(json: string): BookNLPContract {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e}`);
  }

  if (!validateContract(data)) {
    throw new Error('Invalid BookNLP contract structure');
  }

  return data;
}
