/**
 * Fact Builder - Derives FactViewRows from events and assertions.
 *
 * FactViewRows are materialized views over events/assertions. They:
 * - Are NOT a second truth store - they're index rows
 * - Have required derivedFrom - orphan facts must be deleted
 * - Are recomputable - can drop all facts and regenerate
 * - Have no lifecycle fields - no createdAt, no user overrides
 *
 * v1 Facts:
 * - located_in(entity, place) from MOVE events
 * - alive(entity) = false from DEATH events
 *
 * @module ir/fact-builder
 */

import { createHash } from 'crypto';
import type {
  StoryEvent,
  Assertion,
  FactViewRow,
  FactId,
  EntityId,
  EventId,
  AssertionId,
  TimeAnchor,
  PredicateType,
} from './types';

// =============================================================================
// FACT EXTRACTION
// =============================================================================

/**
 * Build FactViewRows from events.
 *
 * This is the main entry point for fact derivation.
 * Facts are views - they can be recomputed from events at any time.
 *
 * @param events - Array of StoryEvents
 * @returns Array of FactViewRows
 */
export function buildFactsFromEvents(events: StoryEvent[]): FactViewRow[] {
  const facts: FactViewRow[] = [];

  for (const event of events) {
    const derived = deriveFactsFromEvent(event);
    facts.push(...derived);
  }

  // Deduplicate facts with same subject-predicate-object
  return deduplicateFacts(facts);
}

/**
 * Derive facts from a single event.
 */
function deriveFactsFromEvent(event: StoryEvent): FactViewRow[] {
  switch (event.type) {
    case 'MOVE':
      return deriveMoveFactS(event);
    case 'DEATH':
      return deriveDeathFacts(event);
    // Future: add more event types
    // case 'MEET':
    //   return deriveMeetFacts(event);
    default:
      return [];
  }
}

// =============================================================================
// MOVE → located_in
// =============================================================================

/**
 * Derive located_in facts from MOVE events.
 *
 * Pattern: MOVE(mover, destination) → located_in(mover, destination)
 *
 * The fact is valid from the event time (discourse anchor).
 */
function deriveMoveFactS(event: StoryEvent): FactViewRow[] {
  const facts: FactViewRow[] = [];

  // Find mover and destination participants
  const mover = event.participants.find((p) => p.role === 'MOVER');
  const destination = event.participants.find((p) => p.role === 'DESTINATION');

  if (mover && destination) {
    facts.push(
      createFact({
        subject: mover.entity,
        predicate: 'located_in',
        object: destination.entity,
        validFrom: event.time,
        derivedFrom: [event.id],
        confidence: event.confidence.composite,
      })
    );
  }

  return facts;
}

// =============================================================================
// DEATH → alive = false
// =============================================================================

/**
 * Derive alive=false facts from DEATH events.
 *
 * Pattern: DEATH(decedent) → alive(decedent) = false
 *
 * The fact is valid from the event time onward (indefinitely).
 */
function deriveDeathFacts(event: StoryEvent): FactViewRow[] {
  const facts: FactViewRow[] = [];

  // Find decedent participant
  const decedent = event.participants.find((p) => p.role === 'DECEDENT');

  if (decedent) {
    facts.push(
      createFact({
        subject: decedent.entity,
        predicate: 'alive',
        object: false, // alive = false
        validFrom: event.time,
        // No validUntil - death is permanent
        derivedFrom: [event.id],
        confidence: event.confidence.composite,
      })
    );

    // Also create a died_at fact if we have location
    if (event.location) {
      facts.push(
        createFact({
          subject: decedent.entity,
          predicate: 'died_in',
          object: event.location,
          validFrom: event.time,
          derivedFrom: [event.id],
          confidence: event.confidence.composite,
        })
      );
    }
  }

  return facts;
}

// =============================================================================
// FACT CREATION HELPERS
// =============================================================================

interface FactInput {
  subject: EntityId;
  predicate: PredicateType;
  object: EntityId | string | number | boolean;
  validFrom: TimeAnchor;
  validUntil?: TimeAnchor;
  derivedFrom: (EventId | AssertionId)[];
  confidence: number;
}

/**
 * Create a FactViewRow with a deterministic ID.
 */
function createFact(input: FactInput): FactViewRow {
  const factId = generateFactId(
    input.subject,
    input.predicate,
    input.object,
    input.derivedFrom
  );

  return {
    id: factId,
    subject: input.subject,
    predicate: input.predicate,
    object: input.object,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    derivedFrom: input.derivedFrom,
    confidence: input.confidence,
  };
}

/**
 * Generate deterministic fact ID from components.
 */
function generateFactId(
  subject: EntityId,
  predicate: PredicateType,
  object: EntityId | string | number | boolean,
  derivedFrom: (EventId | AssertionId)[]
): FactId {
  const parts = [
    subject,
    predicate,
    String(object),
    ...derivedFrom.sort(),
  ];

  const hash = createHash('sha256')
    .update(parts.join('|'))
    .digest('hex')
    .slice(0, 16);

  return `fact_${predicate}_${hash}`;
}

// =============================================================================
// DEDUPLICATION
// =============================================================================

/**
 * Deduplicate facts with same subject-predicate-object.
 *
 * When merging, combine derivedFrom arrays and use highest confidence.
 * For temporal facts, we keep the latest validFrom.
 */
function deduplicateFacts(facts: FactViewRow[]): FactViewRow[] {
  const factMap = new Map<string, FactViewRow>();

  for (const fact of facts) {
    const key = `${fact.subject}|${fact.predicate}|${String(fact.object)}`;

    const existing = factMap.get(key);
    if (existing) {
      // Merge derivedFrom
      const mergedDerivedFrom = new Set([
        ...existing.derivedFrom,
        ...fact.derivedFrom,
      ]);

      // Keep the one with higher confidence, or merge
      const merged: FactViewRow = {
        ...existing,
        derivedFrom: Array.from(mergedDerivedFrom),
        confidence: Math.max(existing.confidence, fact.confidence),
        // Keep most recent validFrom for state tracking
        validFrom: compareTimeAnchors(fact.validFrom, existing.validFrom) > 0
          ? fact.validFrom
          : existing.validFrom,
      };

      // Regenerate ID with merged derivedFrom
      merged.id = generateFactId(
        merged.subject,
        merged.predicate,
        merged.object,
        merged.derivedFrom
      );

      factMap.set(key, merged);
    } else {
      factMap.set(key, fact);
    }
  }

  return Array.from(factMap.values());
}

/**
 * Compare two time anchors for ordering.
 * Returns positive if a > b, negative if a < b, 0 if equal.
 */
function compareTimeAnchors(a: TimeAnchor, b: TimeAnchor): number {
  // For discourse time, compare by chapter > paragraph > sentence
  if (a.type === 'DISCOURSE' && b.type === 'DISCOURSE') {
    const chapterDiff = (a.chapter ?? 0) - (b.chapter ?? 0);
    if (chapterDiff !== 0) return chapterDiff;

    const paraDiff = (a.paragraph ?? 0) - (b.paragraph ?? 0);
    if (paraDiff !== 0) return paraDiff;

    return (a.sentence ?? 0) - (b.sentence ?? 0);
  }

  // Unknown times sort last
  if (a.type === 'UNKNOWN') return -1;
  if (b.type === 'UNKNOWN') return 1;

  // For other types, treat as equal for now
  return 0;
}

// =============================================================================
// QUERY HELPERS
// =============================================================================

/**
 * Get current location of an entity.
 *
 * Returns the most recent located_in fact for the entity.
 */
export function getCurrentLocation(
  facts: FactViewRow[],
  entityId: EntityId
): EntityId | undefined {
  const locationFacts = facts
    .filter(
      (f) =>
        f.subject === entityId &&
        f.predicate === 'located_in' &&
        typeof f.object === 'string'
    )
    .sort((a, b) => compareTimeAnchors(b.validFrom, a.validFrom));

  return locationFacts.length > 0
    ? (locationFacts[0].object as EntityId)
    : undefined;
}

/**
 * Check if an entity is alive.
 *
 * Returns false if there's a DEATH-derived alive=false fact.
 */
export function isAlive(facts: FactViewRow[], entityId: EntityId): boolean {
  const aliveFact = facts.find(
    (f) =>
      f.subject === entityId &&
      f.predicate === 'alive' &&
      f.object === false
  );

  return aliveFact === undefined;
}

/**
 * Get all facts for an entity.
 */
export function getFactsForEntity(
  facts: FactViewRow[],
  entityId: EntityId
): FactViewRow[] {
  return facts.filter(
    (f) => f.subject === entityId || f.object === entityId
  );
}

/**
 * Get facts by predicate.
 */
export function getFactsByPredicate(
  facts: FactViewRow[],
  predicate: PredicateType
): FactViewRow[] {
  return facts.filter((f) => f.predicate === predicate);
}
