/**
 * BookNLP Graph Projection
 *
 * Projects BookNLP extraction results into ARES knowledge graph format.
 * Creates entities and relations suitable for the GlobalKnowledgeGraph.
 */

import type {
  BookNLPResult,
  ARESEntity,
  ARESQuote,
  ARESSpan,
  ARESCorefLink,
} from './types';
import type { Entity, Relation, Predicate, Evidence } from '../schema';
import { v4 as uuid } from 'uuid';

// ============================================================================
// GRAPH PROJECTION TYPES
// ============================================================================

export interface GraphProjectionResult {
  entities: Entity[];
  relations: Relation[];
  stats: {
    entitiesProjected: number;
    relationsFromQuotes: number;
    relationsFromCoref: number;
    totalRelations: number;
  };
}

export interface ProjectionOptions {
  /** Document ID for provenance tracking */
  docId: string;
  /** Full text for evidence extraction */
  text?: string;
  /** Generate spoke_to relations from quotes */
  generateSpeakerRelations?: boolean;
  /** Generate met relations from co-occurrence */
  generateCoOccurrenceRelations?: boolean;
  /** Minimum confidence for speaker attribution */
  minSpeakerConfidence?: number;
  /** Minimum mention count for entity inclusion */
  minMentionCount?: number;
}

// ============================================================================
// ENTITY PROJECTION
// ============================================================================

/**
 * Convert BookNLP ARES entities to schema Entity format
 */
export function projectEntities(
  aresEntities: ARESEntity[],
  options: ProjectionOptions
): Entity[] {
  const { docId, minMentionCount = 1 } = options;
  const now = new Date().toISOString();

  return aresEntities
    .filter(e => (e.mention_count || 1) >= minMentionCount)
    .map(aresEntity => ({
      id: aresEntity.id,
      type: aresEntity.type,
      canonical: aresEntity.canonical,
      aliases: aresEntity.aliases,
      created_at: now,
      confidence: aresEntity.confidence,
      tier: 'TIER_A' as const,  // BookNLP entities are high-confidence
      attrs: {
        source: 'booknlp',
        booknlp_id: aresEntity.booknlp_id,
        mention_count: aresEntity.mention_count,
        gender: aresEntity.gender,
      },
    }));
}

// ============================================================================
// RELATION PROJECTION
// ============================================================================

/**
 * Create evidence object from quote or span
 */
function createEvidence(
  docId: string,
  start: number,
  end: number,
  text: string
): Evidence {
  return {
    doc_id: docId,
    span: { start, end, text },
    sentence_index: -1,  // Not available from BookNLP
    source: 'RULE',
  };
}

/**
 * Project spoke_to relations from quotes with speaker attribution
 */
export function projectSpeakerRelations(
  quotes: ARESQuote[],
  entities: Map<string, Entity>,
  options: ProjectionOptions
): Relation[] {
  const { docId, minSpeakerConfidence = 0.8, text = '' } = options;
  const relations: Relation[] = [];

  // Track unique speaker pairs to avoid duplicates
  const speakerPairs = new Set<string>();

  for (const quote of quotes) {
    if (!quote.speaker_id || quote.confidence < minSpeakerConfidence) {
      continue;
    }

    const speaker = entities.get(quote.speaker_id);
    if (!speaker) continue;

    // If quote has an addressee, create a direct spoke_to relation
    // (BookNLP sometimes provides this)
    // For now, we skip addressee since it's less reliable

    // Create evidence from the quote text
    const evidence = createEvidence(
      docId,
      quote.start,
      quote.end,
      quote.text.slice(0, 100)  // Truncate for evidence
    );

    // We could track who was spoken to, but BookNLP doesn't reliably
    // provide this. For now, just note that this speaker was speaking.
    // A more sophisticated implementation could:
    // 1. Look for addressees in the quote context
    // 2. Use proximity to other character mentions
    // 3. Build a speaker-addressee graph from dialogue sequences
  }

  return relations;
}

/**
 * Project met/co-occurrence relations from character co-mentions
 * Characters mentioned in the same context are likely interacting
 */
export function projectCoOccurrenceRelations(
  spans: ARESSpan[],
  entities: Map<string, Entity>,
  options: ProjectionOptions
): Relation[] {
  const { docId, text = '' } = options;
  const relations: Relation[] = [];

  // Group spans by proximity (within 500 characters)
  const PROXIMITY_WINDOW = 500;
  const seenPairs = new Set<string>();

  // Sort spans by start position
  const sortedSpans = [...spans].sort((a, b) => a.start - b.start);

  for (let i = 0; i < sortedSpans.length; i++) {
    const span1 = sortedSpans[i];
    const entity1 = entities.get(span1.entity_id);
    if (!entity1 || entity1.type !== 'PERSON') continue;

    // Look at nearby spans
    for (let j = i + 1; j < sortedSpans.length; j++) {
      const span2 = sortedSpans[j];

      // Stop if too far away
      if (span2.start - span1.end > PROXIMITY_WINDOW) break;

      const entity2 = entities.get(span2.entity_id);
      if (!entity2 || entity2.type !== 'PERSON') continue;

      // Skip self-references
      if (span1.entity_id === span2.entity_id) continue;

      // Create canonical pair key (alphabetical order for dedup)
      const pairKey = [span1.entity_id, span2.entity_id].sort().join('::');
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      // Extract context text for evidence
      const contextStart = Math.max(0, span1.start - 50);
      const contextEnd = Math.min(text.length, span2.end + 50);
      const contextText = text.slice(contextStart, contextEnd);

      relations.push({
        id: uuid(),
        subj: span1.entity_id,
        pred: 'met' as Predicate,
        obj: span2.entity_id,
        confidence: 0.6,  // Lower confidence for proximity-based
        evidence: [createEvidence(docId, contextStart, contextEnd, contextText)],
        subj_surface: entity1.canonical,
        obj_surface: entity2.canonical,
        extractor: 'fiction-action',
      });
    }
  }

  return relations;
}

/**
 * Project spoke_to relations from dialogue sequences
 * When characters appear in dialogue context together
 */
export function projectDialogueRelations(
  quotes: ARESQuote[],
  entities: Map<string, Entity>,
  options: ProjectionOptions
): Relation[] {
  const { docId } = options;
  const relations: Relation[] = [];
  const seenPairs = new Set<string>();

  // Sort quotes by position
  const sortedQuotes = [...quotes]
    .filter(q => q.speaker_id)
    .sort((a, b) => a.start - b.start);

  // Look for dialogue sequences (alternating speakers)
  for (let i = 1; i < sortedQuotes.length; i++) {
    const prev = sortedQuotes[i - 1];
    const curr = sortedQuotes[i];

    // Skip if same speaker
    if (prev.speaker_id === curr.speaker_id) continue;

    // Check proximity (quotes close together are likely a dialogue)
    const DIALOGUE_GAP = 500;
    if (curr.start - prev.end > DIALOGUE_GAP) continue;

    const speaker1 = entities.get(prev.speaker_id!);
    const speaker2 = entities.get(curr.speaker_id!);

    if (!speaker1 || !speaker2) continue;

    // Create canonical pair key
    const pairKey = [prev.speaker_id, curr.speaker_id].sort().join('::');
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    // Create spoke_to relation (symmetric)
    relations.push({
      id: uuid(),
      subj: prev.speaker_id!,
      pred: 'spoke_to' as Predicate,
      obj: curr.speaker_id!,
      confidence: 0.85,
      evidence: [
        createEvidence(docId, prev.start, prev.end, prev.text.slice(0, 50)),
        createEvidence(docId, curr.start, curr.end, curr.text.slice(0, 50)),
      ],
      subj_surface: speaker1.canonical,
      obj_surface: speaker2.canonical,
      extractor: 'fiction-dialogue',
    });
  }

  return relations;
}

// ============================================================================
// MAIN PROJECTION
// ============================================================================

/**
 * Project BookNLP result into ARES knowledge graph format
 */
export function projectToGraph(
  result: BookNLPResult,
  options: ProjectionOptions
): GraphProjectionResult {
  const {
    generateSpeakerRelations = true,
    generateCoOccurrenceRelations = true,
  } = options;

  // Project entities
  const entities = projectEntities(result.entities, options);

  // Build entity lookup map
  const entityMap = new Map<string, Entity>();
  for (const entity of entities) {
    entityMap.set(entity.id, entity);
  }

  // Collect relations
  const allRelations: Relation[] = [];
  let relationsFromQuotes = 0;
  let relationsFromCoref = 0;

  // Generate dialogue relations from quotes
  if (generateSpeakerRelations && result.quotes.length > 0) {
    const dialogueRelations = projectDialogueRelations(
      result.quotes,
      entityMap,
      options
    );
    allRelations.push(...dialogueRelations);
    relationsFromQuotes = dialogueRelations.length;
  }

  // Generate co-occurrence relations
  if (generateCoOccurrenceRelations && result.spans.length > 0) {
    const coOccurRelations = projectCoOccurrenceRelations(
      result.spans,
      entityMap,
      options
    );
    allRelations.push(...coOccurRelations);
    relationsFromCoref = coOccurRelations.length;
  }

  return {
    entities,
    relations: allRelations,
    stats: {
      entitiesProjected: entities.length,
      relationsFromQuotes,
      relationsFromCoref,
      totalRelations: allRelations.length,
    },
  };
}

/**
 * Convenience function to get entities and relations ready for GlobalKnowledgeGraph
 */
export function projectForGlobalGraph(
  result: BookNLPResult,
  docId: string,
  text: string
): { entities: Entity[]; relations: Relation[] } {
  const projection = projectToGraph(result, {
    docId,
    text,
    generateSpeakerRelations: true,
    generateCoOccurrenceRelations: true,
    minSpeakerConfidence: 0.7,
    minMentionCount: 1,
  });

  return {
    entities: projection.entities,
    relations: projection.relations,
  };
}
