/**
 * Fact Builder - Derives FactViewRows from events and assertions.
 *
 * FactViewRows are materialized views over events/assertions. They:
 * - Are NOT a second truth store - they're index rows
 * - Have required derivedFrom - orphan facts must be deleted
 * - Are recomputable - can drop all facts and regenerate
 * - Have no lifecycle fields - no createdAt, no user overrides
 *
 * Derived Facts:
 * - located_in(entity, place) from MOVE events
 * - alive(entity) = false from DEATH events
 * - possesses(entity, item) from TRANSFER events
 *   - receiver/taker gains possession (validFrom = event time)
 *   - giver loses possession (validUntil = event time)
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
    case 'TRANSFER':
      return deriveTransferFacts(event);
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
// TRANSFER → possesses
// =============================================================================

/**
 * Derive possession facts from TRANSFER events.
 *
 * Patterns:
 * - TRANSFER(giver, receiver, item) → possesses(receiver, item) validFrom=t
 * - TRANSFER(giver, receiver, item) → possesses(giver, item) validUntil=t (optional)
 *
 * The receiver gains possession from event time.
 * The giver loses possession at event time (if giver is identified).
 */
function deriveTransferFacts(event: StoryEvent): FactViewRow[] {
  const facts: FactViewRow[] = [];

  // Find participants by role
  const giver = event.participants.find((p) => p.role === 'GIVER');
  const taker = event.participants.find((p) => p.role === 'TAKER');
  const receiver = event.participants.find((p) => p.role === 'RECEIVER');
  const item = event.participants.find((p) => p.role === 'ITEM');

  // Must have an ITEM to derive possession facts
  if (!item) {
    return facts;
  }

  // Determine who now possesses the item
  // Priority: RECEIVER (explicit recipient) > TAKER (took it themselves)
  const newPossessor = receiver ?? taker;

  if (newPossessor) {
    // New possessor has the item from event time
    facts.push(
      createFact({
        subject: newPossessor.entity,
        predicate: 'possesses',
        object: item.entity,
        validFrom: event.time,
        derivedFrom: [event.id],
        confidence: event.confidence.composite,
        inference: 'explicit',  // Directly stated in evidence
      })
    );
  }

  // If there's a giver, they no longer possess the item
  // Create a "lost possession" fact with validUntil
  if (giver) {
    facts.push(
      createFact({
        subject: giver.entity,
        predicate: 'possesses',
        object: item.entity,
        validFrom: { type: 'UNKNOWN' }, // Had it before (unknown start)
        validUntil: event.time, // Lost it at event time
        derivedFrom: [event.id],
        confidence: event.confidence.composite * 0.9, // Slightly lower - inferred loss
        inference: 'implied_loss',  // Inferred from transfer (giver no longer has item)
      })
    );
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
  inference?: 'explicit' | 'implied_loss';
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

  const fact: FactViewRow = {
    id: factId,
    subject: input.subject,
    predicate: input.predicate,
    object: input.object,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    derivedFrom: input.derivedFrom,
    confidence: input.confidence,
  };

  // Add inference field if specified
  if (input.inference) {
    fact.inference = input.inference;
  }

  return fact;
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
 * Deduplicate facts with same subject-predicate-object-temporalType.
 *
 * When merging, combine derivedFrom arrays and use highest confidence.
 * For temporal facts, we keep the latest validFrom.
 *
 * Note: Facts with validUntil (ended possession) are distinct from facts
 * without validUntil (current possession). They represent different temporal states.
 */
function deduplicateFacts(facts: FactViewRow[]): FactViewRow[] {
  const factMap = new Map<string, FactViewRow>();

  for (const fact of facts) {
    // Include temporal type in key: facts with validUntil are "ended" facts
    const temporalType = fact.validUntil ? 'ended' : 'current';
    const key = `${fact.subject}|${fact.predicate}|${String(fact.object)}|${temporalType}`;

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

/**
 * Get current possessions of an entity.
 *
 * Returns items the entity possesses (no validUntil or validUntil in future).
 * Excludes items they previously possessed but have since transferred away.
 */
export function getCurrentPossessions(
  facts: FactViewRow[],
  entityId: EntityId
): EntityId[] {
  // Get all possession facts for this entity as subject
  const possessionFacts = facts.filter(
    (f) =>
      f.subject === entityId &&
      f.predicate === 'possesses' &&
      typeof f.object === 'string'
  );

  // Group by object (item) and find current state
  // Track both gain events and loss events separately
  const itemStates = new Map<EntityId, { gainTime: number; lossTime: number }>();

  for (const fact of possessionFacts) {
    const itemId = fact.object as EntityId;

    const state = itemStates.get(itemId) || { gainTime: -1, lossTime: -1 };

    if (fact.validUntil) {
      // This is a "loss" fact - use validUntil as the event time
      const lossTime = getTimeOrderValue(fact.validUntil);
      state.lossTime = Math.max(state.lossTime, lossTime);
    } else {
      // This is a "gain" fact - use validFrom as the event time
      const gainTime = getTimeOrderValue(fact.validFrom);
      state.gainTime = Math.max(state.gainTime, gainTime);
    }

    itemStates.set(itemId, state);
  }

  // Return items where the most recent event is a gain (gainTime > lossTime)
  return Array.from(itemStates.entries())
    .filter(([_, state]) => state.gainTime > state.lossTime)
    .map(([itemId, _]) => itemId);
}

/**
 * Get the current holder of an item (inverse query).
 *
 * Returns the entity that most recently gained the item without losing it.
 * If multiple entities "currently" hold it (data inconsistency), returns
 * { holder: 'contested', holders: [...] }.
 *
 * @param facts - All facts
 * @param itemId - The item entity ID
 * @returns Current holder info, or undefined if no holder
 */
export function getCurrentHolder(
  facts: FactViewRow[],
  itemId: EntityId
): { holder: EntityId } | { holder: 'contested'; holders: EntityId[] } | undefined {
  // Get all possession facts where this item is the object
  const possessionFacts = facts.filter(
    (f) =>
      f.object === itemId &&
      f.predicate === 'possesses' &&
      typeof f.subject === 'string'
  );

  if (possessionFacts.length === 0) {
    return undefined;
  }

  // Track each entity's possession state for this item
  const entityStates = new Map<EntityId, { gainTime: number; lossTime: number }>();

  for (const fact of possessionFacts) {
    const entityId = fact.subject;

    const state = entityStates.get(entityId) || { gainTime: -1, lossTime: -1 };

    if (fact.validUntil) {
      // Loss fact
      const lossTime = getTimeOrderValue(fact.validUntil);
      state.lossTime = Math.max(state.lossTime, lossTime);
    } else {
      // Gain fact
      const gainTime = getTimeOrderValue(fact.validFrom);
      state.gainTime = Math.max(state.gainTime, gainTime);
    }

    entityStates.set(entityId, state);
  }

  // Find entities that currently possess the item (gainTime > lossTime)
  const currentHolders: EntityId[] = [];
  for (const [entityId, state] of entityStates.entries()) {
    if (state.gainTime > state.lossTime) {
      currentHolders.push(entityId);
    }
  }

  if (currentHolders.length === 0) {
    return undefined;
  }

  if (currentHolders.length === 1) {
    return { holder: currentHolders[0] };
  }

  // Multiple holders - contested (data inconsistency, but handle gracefully)
  return { holder: 'contested', holders: currentHolders.sort() };
}

/**
 * Get numeric time value for ordering (higher = more recent).
 */
function getTimeOrderValue(time: TimeAnchor): number {
  if (time.type === 'DISCOURSE') {
    return (
      (time.chapter ?? 0) * 100000 +
      (time.paragraph ?? 0) * 1000 +
      (time.sentence ?? 0)
    );
  }
  // UNKNOWN times sort earliest
  return -1;
}
