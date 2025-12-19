/**
 * BookNLP Adapter
 *
 * Transforms BookNLP contract output into ARES internal representations.
 * This is the primary integration point between BookNLP and ARES.
 */

import type {
  BookNLPContract,
  BookNLPCharacter,
  BookNLPMention,
  BookNLPQuote,
  BookNLPResult,
  ARESEntity,
  ARESSpan,
  ARESQuote,
  ARESCorefLink,
} from './types';
import { toBookNLPEID, toBookNLPStableEntityId } from './identity';

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
 */
export function adaptMentions(
  mentions: BookNLPMention[],
  characterIdMap: Map<string, string>  // BookNLP char ID -> ARES entity ID
): ARESSpan[] {
  return mentions
    .filter(m => m.character_id)  // Only include resolved mentions
    .map(mention => ({
      entity_id: characterIdMap.get(mention.character_id!) || toBookNLPStableEntityId(mention.character_id!),
      start: mention.start_char,
      end: mention.end_char,
      text: mention.text,
      mention_id: mention.id,
      mention_type: mention.mention_type,
    }));
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
 */
export function adaptBookNLPContract(
  contract: BookNLPContract,
  options: {
    includeRawContract?: boolean;
    minMentionCount?: number;
  } = {}
): BookNLPResult {
  const { includeRawContract = false, minMentionCount = 1 } = options;

  // Filter characters by minimum mention count
  const filteredCharacters = contract.characters.filter(
    c => c.mention_count >= minMentionCount
  );

  // Convert characters to entities
  const entities = adaptCharacters(filteredCharacters);

  // Build ID mapping
  const characterIdMap = new Map<string, string>();
  for (const char of filteredCharacters) {
    const aresId = toBookNLPStableEntityId(char.id);
    characterIdMap.set(char.id, aresId);
  }

  // Convert mentions to spans
  const spans = adaptMentions(contract.mentions, characterIdMap);

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
