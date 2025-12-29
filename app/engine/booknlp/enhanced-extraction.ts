/**
 * Enhanced BookNLP Extraction - Phase 5
 *
 * Additional extraction capabilities beyond basic entity/quote adaptation:
 * 1. Quote-based relation generation (spoke_to, asked, replied)
 * 2. Character interaction analysis from quotes
 * 3. Token-aligned entity spans for precise locations
 * 4. Enhanced character profiles with metadata
 */

import type {
  BookNLPContract,
  BookNLPQuote,
  BookNLPToken,
  BookNLPCharacter,
  BookNLPMention,
  ARESEntity,
  ARESQuote,
} from './types';
import type { Relation, Predicate } from '../schema';
import { toBookNLPStableEntityId } from './identity';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Enhanced character profile with additional BookNLP metadata
 */
export interface CharacterProfile {
  entityId: string;
  canonical: string;
  aliases: string[];
  gender: string | null;
  mentionCount: number;
  agentScore: number;  // BookNLP's measure of character agency
  sentencesSpoken: number;
  wordsSpoken: number;
  addressees: string[];  // Entity IDs of characters they speak to
  speakers: string[];    // Entity IDs of characters who speak to them
  firstMention: { char: number; sentence: number } | null;
  lastMention: { char: number; sentence: number } | null;
  mentionTypes: {
    proper: number;   // Proper noun mentions
    nominal: number;  // Nominal mentions
    pronoun: number;  // Pronoun mentions
  };
}

/**
 * Token-aligned span with precise position info
 */
export interface TokenAlignedSpan {
  entityId: string;
  text: string;
  startChar: number;
  endChar: number;
  startToken: number;
  endToken: number;
  sentenceIdx: number;
  paragraphIdx: number;
  mentionType: string;
}

/**
 * Quote-based relation
 */
export interface QuoteRelation {
  speakerId: string;
  addresseeId: string | null;
  predicate: Predicate;
  quoteId: string;
  quoteText: string;
  confidence: number;
}

// ============================================================================
// CHARACTER PROFILE EXTRACTION
// ============================================================================

/**
 * Build enhanced character profiles from BookNLP data
 */
export function extractCharacterProfiles(
  contract: BookNLPContract
): CharacterProfile[] {
  const profiles: CharacterProfile[] = [];
  const characterIdMap = new Map<string, string>();

  // Build entity ID mapping
  for (const char of contract.characters) {
    characterIdMap.set(char.id, toBookNLPStableEntityId(char.id));
  }

  // Create mention lookup by character
  const mentionsByCharacter = new Map<string, BookNLPMention[]>();
  for (const mention of contract.mentions) {
    if (mention.character_id) {
      const existing = mentionsByCharacter.get(mention.character_id) || [];
      existing.push(mention);
      mentionsByCharacter.set(mention.character_id, existing);
    }
  }

  // Create quote stats by character
  const quotesByCharacter = new Map<string, BookNLPQuote[]>();
  const addresseesByCharacter = new Map<string, Set<string>>();
  const speakersByCharacter = new Map<string, Set<string>>();

  for (const quote of contract.quotes) {
    if (quote.speaker_id) {
      const existing = quotesByCharacter.get(quote.speaker_id) || [];
      existing.push(quote);
      quotesByCharacter.set(quote.speaker_id, existing);

      // Track addressee relationship
      if (quote.addressee_id) {
        const addressees = addresseesByCharacter.get(quote.speaker_id) || new Set();
        addressees.add(quote.addressee_id);
        addresseesByCharacter.set(quote.speaker_id, addressees);

        // Track reverse relationship
        const speakers = speakersByCharacter.get(quote.addressee_id) || new Set();
        speakers.add(quote.speaker_id);
        speakersByCharacter.set(quote.addressee_id, speakers);
      }
    }
  }

  // Build profiles
  for (const char of contract.characters) {
    const entityId = characterIdMap.get(char.id)!;
    const mentions = mentionsByCharacter.get(char.id) || [];
    const quotes = quotesByCharacter.get(char.id) || [];

    // Count mention types
    const mentionTypes = { proper: 0, nominal: 0, pronoun: 0 };
    for (const mention of mentions) {
      if (mention.mention_type === 'PROP') mentionTypes.proper++;
      else if (mention.mention_type === 'NOM') mentionTypes.nominal++;
      else if (mention.mention_type === 'PRON') mentionTypes.pronoun++;
    }

    // Find first and last mentions
    let firstMention: CharacterProfile['firstMention'] = null;
    let lastMention: CharacterProfile['lastMention'] = null;

    if (mentions.length > 0) {
      const sorted = [...mentions].sort((a, b) => a.start_char - b.start_char);
      firstMention = {
        char: sorted[0].start_char,
        sentence: sorted[0].sentence_idx
      };
      lastMention = {
        char: sorted[sorted.length - 1].start_char,
        sentence: sorted[sorted.length - 1].sentence_idx
      };
    }

    // Calculate words spoken
    let wordsSpoken = 0;
    for (const quote of quotes) {
      wordsSpoken += quote.text.split(/\s+/).length;
    }

    profiles.push({
      entityId,
      canonical: char.canonical_name,
      aliases: char.aliases.map(a => a.text),
      gender: char.gender,
      mentionCount: char.mention_count,
      agentScore: char.agent_score,
      sentencesSpoken: quotes.length,
      wordsSpoken,
      addressees: Array.from(addresseesByCharacter.get(char.id) || [])
        .map(id => characterIdMap.get(id) || id),
      speakers: Array.from(speakersByCharacter.get(char.id) || [])
        .map(id => characterIdMap.get(id) || id),
      firstMention,
      lastMention,
      mentionTypes,
    });
  }

  return profiles;
}

// ============================================================================
// QUOTE-BASED RELATIONS
// ============================================================================

/**
 * Infer predicate from quote context
 */
function inferQuotePredicate(quote: BookNLPQuote): Predicate {
  const text = quote.text.toLowerCase();

  // Check for question marks
  if (text.includes('?')) {
    return 'asked';
  }

  // Check for reply indicators
  if (quote.quote_type === 'anaphoric') {
    return 'replied';
  }

  // Default to spoke_to
  return 'spoke_to';
}

/**
 * Extract relations from quotes (dialogue attribution)
 */
export function extractQuoteRelations(
  contract: BookNLPContract
): QuoteRelation[] {
  const relations: QuoteRelation[] = [];
  const characterIdMap = new Map<string, string>();

  // Build entity ID mapping
  for (const char of contract.characters) {
    characterIdMap.set(char.id, toBookNLPStableEntityId(char.id));
  }

  for (const quote of contract.quotes) {
    if (!quote.speaker_id) continue;

    const speakerId = characterIdMap.get(quote.speaker_id) || quote.speaker_id;
    const addresseeId = quote.addressee_id
      ? characterIdMap.get(quote.addressee_id) || quote.addressee_id
      : null;

    relations.push({
      speakerId,
      addresseeId,
      predicate: inferQuotePredicate(quote),
      quoteId: quote.id,
      quoteText: quote.text.slice(0, 100),  // Truncate for storage
      confidence: quote.speaker_id ? 0.85 : 0.5,
    });
  }

  return relations;
}

/**
 * Convert quote relations to ARES Relation format
 */
export function convertQuoteRelationsToARES(
  quoteRelations: QuoteRelation[],
  documentId: string
): Relation[] {
  const relations: Relation[] = [];

  for (const qr of quoteRelations) {
    // Only create relations when we have both speaker and addressee
    if (!qr.addresseeId) continue;

    relations.push({
      id: uuid(),
      subj: qr.speakerId,
      pred: qr.predicate,
      obj: qr.addresseeId,
      confidence: qr.confidence,
      evidence: [{
        doc_id: documentId,
        span: { start: 0, end: 0, text: qr.quoteText },
        sentence_index: 0,
        source: 'RAW'
      }],
      subj_surface: undefined,
      obj_surface: undefined,
      extractor: 'fiction-dialogue'
    });
  }

  return relations;
}

// ============================================================================
// TOKEN-ALIGNED SPANS
// ============================================================================

/**
 * Build token-aligned spans for precise entity locations
 */
export function extractTokenAlignedSpans(
  contract: BookNLPContract
): TokenAlignedSpan[] {
  const spans: TokenAlignedSpan[] = [];
  const characterIdMap = new Map<string, string>();

  // Build entity ID mapping
  for (const char of contract.characters) {
    characterIdMap.set(char.id, toBookNLPStableEntityId(char.id));
  }

  // Build token lookup by position
  const tokenByIdx = new Map<number, BookNLPToken>();
  for (const token of contract.tokens) {
    tokenByIdx.set(token.idx, token);
  }

  for (const mention of contract.mentions) {
    if (!mention.character_id) continue;

    const entityId = characterIdMap.get(mention.character_id)!;

    // Get paragraph index from first token
    const firstToken = tokenByIdx.get(mention.start_token);
    const paragraphIdx = firstToken?.paragraph_idx ?? 0;

    spans.push({
      entityId,
      text: mention.text,
      startChar: mention.start_char,
      endChar: mention.end_char,
      startToken: mention.start_token,
      endToken: mention.end_token,
      sentenceIdx: mention.sentence_idx,
      paragraphIdx,
      mentionType: mention.mention_type,
    });
  }

  return spans;
}

// ============================================================================
// INTERACTION ANALYSIS
// ============================================================================

/**
 * Character interaction summary
 */
export interface CharacterInteraction {
  character1Id: string;
  character2Id: string;
  interactionCount: number;
  quoteExchanges: number;
  sharedSentences: number;
  relationship: 'speaker_to_addressee' | 'addressee_from_speaker' | 'mutual';
}

/**
 * Analyze character interactions from quotes and mentions
 */
export function analyzeCharacterInteractions(
  contract: BookNLPContract
): CharacterInteraction[] {
  const interactions = new Map<string, CharacterInteraction>();
  const characterIdMap = new Map<string, string>();

  // Build entity ID mapping
  for (const char of contract.characters) {
    characterIdMap.set(char.id, toBookNLPStableEntityId(char.id));
  }

  // Count quote exchanges
  for (const quote of contract.quotes) {
    if (!quote.speaker_id || !quote.addressee_id) continue;

    const id1 = characterIdMap.get(quote.speaker_id)!;
    const id2 = characterIdMap.get(quote.addressee_id)!;
    const key = [id1, id2].sort().join(':');

    const existing = interactions.get(key) || {
      character1Id: id1 < id2 ? id1 : id2,
      character2Id: id1 < id2 ? id2 : id1,
      interactionCount: 0,
      quoteExchanges: 0,
      sharedSentences: 0,
      relationship: 'speaker_to_addressee' as const
    };

    existing.quoteExchanges++;
    existing.interactionCount++;

    // Determine relationship direction
    if (existing.character1Id === id1) {
      existing.relationship = 'speaker_to_addressee';
    } else if (existing.character1Id === id2) {
      // Reverse direction seen
      if (existing.relationship === 'speaker_to_addressee') {
        existing.relationship = 'mutual';
      }
    }

    interactions.set(key, existing);
  }

  // Count shared sentences (co-mentions)
  const mentionsBySentence = new Map<number, Set<string>>();
  for (const mention of contract.mentions) {
    if (!mention.character_id) continue;
    const entityId = characterIdMap.get(mention.character_id)!;
    const existing = mentionsBySentence.get(mention.sentence_idx) || new Set();
    existing.add(entityId);
    mentionsBySentence.set(mention.sentence_idx, existing);
  }

  for (const [sentIdx, characters] of Array.from(mentionsBySentence.entries())) {
    if (characters.size < 2) continue;

    const charArray = Array.from(characters);
    for (let i = 0; i < charArray.length; i++) {
      for (let j = i + 1; j < charArray.length; j++) {
        const key = [charArray[i], charArray[j]].sort().join(':');
        const existing = interactions.get(key) || {
          character1Id: charArray[i] < charArray[j] ? charArray[i] : charArray[j],
          character2Id: charArray[i] < charArray[j] ? charArray[j] : charArray[i],
          interactionCount: 0,
          quoteExchanges: 0,
          sharedSentences: 0,
          relationship: 'mutual' as const
        };
        existing.sharedSentences++;
        existing.interactionCount++;
        interactions.set(key, existing);
      }
    }
  }

  return Array.from(interactions.values());
}

// ============================================================================
// ENHANCED EXTRACTION ORCHESTRATOR
// ============================================================================

/**
 * Result of enhanced BookNLP extraction
 */
export interface EnhancedExtractionResult {
  profiles: CharacterProfile[];
  quoteRelations: QuoteRelation[];
  aresRelations: Relation[];
  tokenSpans: TokenAlignedSpan[];
  interactions: CharacterInteraction[];
  stats: {
    charactersWithProfiles: number;
    quoteRelationsExtracted: number;
    tokenSpansExtracted: number;
    interactionsAnalyzed: number;
  };
}

/**
 * Perform enhanced extraction from BookNLP contract
 */
export function performEnhancedExtraction(
  contract: BookNLPContract,
  documentId: string
): EnhancedExtractionResult {
  // Extract character profiles
  const profiles = extractCharacterProfiles(contract);

  // Extract quote-based relations
  const quoteRelations = extractQuoteRelations(contract);
  const aresRelations = convertQuoteRelationsToARES(quoteRelations, documentId);

  // Extract token-aligned spans
  const tokenSpans = extractTokenAlignedSpans(contract);

  // Analyze character interactions
  const interactions = analyzeCharacterInteractions(contract);

  console.log(`[BOOKNLP-ENHANCED] Extracted ${profiles.length} character profiles`);
  console.log(`[BOOKNLP-ENHANCED] Extracted ${quoteRelations.length} quote relations`);
  console.log(`[BOOKNLP-ENHANCED] Extracted ${tokenSpans.length} token-aligned spans`);
  console.log(`[BOOKNLP-ENHANCED] Analyzed ${interactions.length} character interactions`);

  return {
    profiles,
    quoteRelations,
    aresRelations,
    tokenSpans,
    interactions,
    stats: {
      charactersWithProfiles: profiles.length,
      quoteRelationsExtracted: quoteRelations.length,
      tokenSpansExtracted: tokenSpans.length,
      interactionsAnalyzed: interactions.length
    }
  };
}
