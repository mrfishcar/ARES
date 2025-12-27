/**
 * ARES to IR Adapter
 *
 * Maps existing ARES extraction output (entities, relations) to the
 * Story World IR format. This is the "boring glue" that lets us test
 * the IR immediately without rewriting extraction.
 *
 * Adapter strategy:
 * - Existing entities → IR entities (with weak defaults)
 * - Existing relations → IR assertions (modality=FACT, narrator attribution)
 * - BookNLP signals → stored separately for Pass 0
 *
 * @module ir/adapter
 */

import { v4 as uuid } from 'uuid';
import type {
  Entity as LegacyEntity,
  Relation as LegacyRelation,
  Evidence as LegacyEvidence,
  EntityType as LegacyEntityType,
  Predicate as LegacyPredicate,
} from '../schema';

import type {
  Entity as IREntity,
  Assertion,
  StoryEvent,
  EvidenceSpan,
  Attribution,
  Modality,
  Confidence,
  TimeAnchor,
  EntityType as IREntityType,
  PredicateType,
  DocId,
  ProjectIR,
} from './types';

// =============================================================================
// ENTITY ADAPTER
// =============================================================================

/**
 * Map legacy EntityType to IR EntityType
 */
function mapEntityType(legacyType: LegacyEntityType): IREntityType {
  // Most types map directly
  const directMap: Record<string, IREntityType> = {
    'PERSON': 'PERSON',
    'ORG': 'ORG',
    'PLACE': 'PLACE',
    'ITEM': 'ITEM',
    'OBJECT': 'ITEM',
    'EVENT': 'EVENT',
    'CREATURE': 'CREATURE',
    'WORK': 'WORK',
    'HOUSE': 'GROUP',
    'TRIBE': 'GROUP',
    'RACE': 'GROUP',
    'DATE': 'TIME_PERIOD',
    'TIME': 'TIME_PERIOD',
    'ARTIFACT': 'ITEM',
    'TECHNOLOGY': 'ITEM',
    'MAGIC': 'CONCEPT',
    'LANGUAGE': 'CONCEPT',
    'CURRENCY': 'CONCEPT',
    'MATERIAL': 'CONCEPT',
    'DRUG': 'ITEM',
    'DEITY': 'PERSON',  // Treat as person for now
    'ABILITY': 'CONCEPT',
    'SKILL': 'CONCEPT',
    'POWER': 'CONCEPT',
    'TECHNIQUE': 'CONCEPT',
    'SPELL': 'WORK',
    'TITLE': 'CONCEPT',
    'SPECIES': 'CREATURE',
    'MISC': 'CONCEPT',
  };

  return directMap[legacyType] || 'CONCEPT';
}

/**
 * Map legacy Evidence to IR EvidenceSpan
 */
function mapEvidence(legacyEvidence: LegacyEvidence, docId: DocId): EvidenceSpan {
  return {
    docId: legacyEvidence.doc_id || docId,
    sentenceIndex: legacyEvidence.sentence_index,
    charStart: legacyEvidence.span.start,
    charEnd: legacyEvidence.span.end,
    text: legacyEvidence.span.text,
  };
}

/**
 * Create default confidence for legacy entities
 */
function createDefaultConfidence(legacyConfidence?: number): Confidence {
  const base = legacyConfidence ?? 0.7;
  return {
    extraction: base,
    identity: base,
    semantic: 0.5,  // Unknown semantic confidence
    temporal: 0.5,  // Unknown temporal confidence
    composite: base * 0.8,  // Slightly reduced for missing info
  };
}

/**
 * Convert legacy Entity to IR Entity
 */
export function adaptEntity(
  legacy: LegacyEntity,
  docId: DocId
): IREntity {
  const now = new Date().toISOString();

  // Create evidence span from entity if we have position info
  const evidence: EvidenceSpan[] = [];
  if (legacy.attrs?.charStart !== undefined && legacy.attrs?.charEnd !== undefined) {
    evidence.push({
      docId,
      charStart: legacy.attrs.charStart as number,
      charEnd: legacy.attrs.charEnd as number,
      text: legacy.canonical,
    });
  }

  return {
    id: legacy.id,
    type: mapEntityType(legacy.type),
    canonical: legacy.canonical,
    aliases: legacy.aliases || [],
    createdAt: legacy.created_at || now,
    updatedAt: now,
    attrs: {
      // Preserve original type for debugging
      legacyType: legacy.type,
      // Copy over relevant attrs
      ...(legacy.gender && { gender: legacy.gender }),
      ...(legacy.booknlp_id && { booknlp_id: legacy.booknlp_id }),
      ...(legacy.mention_count && { mention_count: legacy.mention_count }),
      ...(legacy.centrality && { centrality: legacy.centrality }),
      ...(legacy.tier && { tier: legacy.tier }),
      ...(legacy.eid && { eid: legacy.eid }),
      ...(legacy.meta?.isCollective && { isCollective: legacy.meta.isCollective }),
      ...(legacy.meta?.surnameKey && { surnameKey: legacy.meta.surnameKey }),
    },
    evidence,
    confidence: createDefaultConfidence(legacy.confidence),
  };
}

// =============================================================================
// RELATION → ASSERTION ADAPTER
// =============================================================================

/**
 * Create default attribution (narrator says it)
 */
function createNarratorAttribution(): Attribution {
  return {
    source: 'NARRATOR',
    reliability: 0.9,
    isDialogue: false,
    isThought: false,
  };
}

/**
 * Infer modality from predicate and extractor
 */
function inferModality(
  predicate: LegacyPredicate,
  extractor?: string
): Modality {
  // Negation predicates
  if (['not_related_to', 'denied', 'disputed'].includes(predicate)) {
    return 'NEGATED';
  }

  // Uncertainty predicates
  if (['alleged', 'rumored', 'uncertain_link'].includes(predicate)) {
    return 'RUMOR';
  }

  // Dialogue-based relations
  if (extractor === 'fiction-dialogue') {
    return 'CLAIM';  // Someone said it, not necessarily true
  }

  // Default: presented as fact by narrator
  return 'FACT';
}

/**
 * Convert legacy Relation to IR Assertion
 */
export function adaptRelation(
  legacy: LegacyRelation,
  docId: DocId
): Assertion {
  const now = new Date().toISOString();

  // Map evidence
  const evidence: EvidenceSpan[] = (legacy.evidence || []).map(e =>
    mapEvidence(e, docId)
  );

  // Infer modality
  const modality = inferModality(legacy.pred, legacy.extractor);

  // Create assertion
  return {
    id: legacy.id || uuid(),
    assertionType: 'DIRECT',
    subject: legacy.subj,
    predicate: legacy.pred as PredicateType,
    object: legacy.obj,
    evidence,
    attribution: createNarratorAttribution(),
    modality,
    confidence: {
      extraction: legacy.confidence || 0.7,
      identity: 0.8,  // Assume good identity resolution
      semantic: 0.7,  // Assume decent semantic interpretation
      temporal: 0.5,  // Unknown temporal info
      composite: (legacy.confidence || 0.7) * 0.85,
    },
    createdAt: now,
    compiler_pass: 'legacy_adapter',
  };
}

// =============================================================================
// BATCH ADAPTERS
// =============================================================================

export interface LegacyExtractionResult {
  entities: LegacyEntity[];
  relations: LegacyRelation[];
  docId: string;
}

/**
 * @deprecated Use ProjectIR instead
 */
export interface AdaptedIR {
  entities: IREntity[];
  assertions: Assertion[];
  events: StoryEvent[];
  docId: string;
  adaptedAt: string;
  stats: {
    entitiesAdapted: number;
    relationsAdapted: number;
    eventsCreated: number;
  };
}

/**
 * Adapt a complete legacy extraction result to ProjectIR format.
 *
 * This is DUMB MAPPING ONLY:
 * - No inference
 * - No semantic interpretation
 * - No event extraction
 * - Weak defaults for missing fields
 *
 * The goal is to get existing output into IR shape so we can
 * test renderers immediately.
 */
export function adaptLegacyExtraction(
  legacy: LegacyExtractionResult
): ProjectIR {
  const now = new Date().toISOString();

  // Adapt entities (dumb mapping)
  const entities = legacy.entities.map(e => adaptEntity(e, legacy.docId));

  // Adapt relations to assertions (dumb mapping, assume FACT modality)
  const assertions = legacy.relations.map(r => adaptRelation(r, legacy.docId));

  // No events yet - events require the Event Builder pass
  const events: StoryEvent[] = [];

  return {
    version: '1.0',
    projectId: legacy.docId,
    docId: legacy.docId,
    createdAt: now,
    entities,
    assertions,
    events,
    stats: {
      entityCount: entities.length,
      assertionCount: assertions.length,
      eventCount: 0,
    },
  };
}

/**
 * Legacy adapter for backward compatibility.
 * @deprecated Use adaptLegacyExtraction which returns ProjectIR
 */
export function adaptToAdaptedIR(
  legacy: LegacyExtractionResult
): AdaptedIR {
  const ir = adaptLegacyExtraction(legacy);
  return {
    entities: ir.entities,
    assertions: ir.assertions,
    events: ir.events,
    docId: ir.docId || ir.projectId,
    adaptedAt: ir.createdAt,
    stats: {
      entitiesAdapted: ir.stats.entityCount,
      relationsAdapted: ir.stats.assertionCount,
      eventsCreated: ir.stats.eventCount,
    },
  };
}

// =============================================================================
// ENTITY MAP HELPERS
// =============================================================================

/**
 * Build entity lookup map from IR entities
 */
export function buildEntityMap(entities: IREntity[]): Map<string, IREntity> {
  const map = new Map<string, IREntity>();
  for (const entity of entities) {
    map.set(entity.id, entity);
  }
  return map;
}

/**
 * Resolve entity ID to canonical name
 */
export function resolveEntityName(
  entityId: string,
  entityMap: Map<string, IREntity>
): string {
  const entity = entityMap.get(entityId);
  return entity?.canonical || entityId;
}
