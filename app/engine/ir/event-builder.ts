/**
 * Event Builder - Compiler pass that derives events from assertions.
 *
 * Events are "compiled summaries" of assertions. They should:
 * - Never exist without evidence
 * - Be recomputable from assertions
 * - Be deduped deterministically
 *
 * This module implements three main functions:
 * 1. extractEventCandidates(assertions) → EventCandidate[]
 * 2. normalizeAndDedupe(candidates) → StoryEvent[]
 * 3. attachTimeAnchors(events, docOrder)
 *
 * @module ir/event-builder
 */

import { createHash } from 'crypto';
import type {
  Assertion,
  AssertionId,
  Entity,
  EntityId,
  EventId,
  StoryEvent,
  EventType,
  Participant,
  ParticipantRole,
  EvidenceSpan,
  TimeAnchor,
  DiscourseTime,
  Modality,
  Confidence,
  Attribution,
  PredicateType,
} from './types';

// =============================================================================
// EVENT CANDIDATE TYPE
// =============================================================================

/**
 * An event candidate before deduplication.
 * This is the intermediate representation between assertion and final event.
 */
export interface EventCandidate {
  /** Event type */
  type: EventType;

  /** Participants with roles */
  participants: Participant[];

  /** Location if applicable */
  location?: EntityId;

  /** Evidence spans from source assertion */
  evidence: EvidenceSpan[];

  /** Source assertion IDs */
  derivedFrom: AssertionId[];

  /** Modality inherited from assertion */
  modality: Modality;

  /** Confidence inherited from assertion */
  confidence: Confidence;

  /** Attribution inherited from assertion */
  attribution: Attribution;

  /** Optional content (for TELL, PROMISE, etc.) */
  content?: string;

  /** Document ID for deduplication */
  docId: string;

  /** Discourse position for time anchoring */
  discoursePosition: {
    paragraphIndex?: number;
    sentenceIndex?: number;
    charStart: number;
  };
}

// =============================================================================
// PREDICATE → EVENT TYPE MAPPING
// =============================================================================

/**
 * Map predicates to event types.
 * These are the trigger sources for event extraction.
 */

// MOVE event triggers
const MOVE_PREDICATES = new Set<PredicateType | string>([
  'traveled_to',
  'went_to',
  'arrived_at',
  'left',
  'moved_to',
  'visited',
  'returned_to',
  'fled_to',
  'escaped_to',
]);

// LEARN/DISCOVER event triggers
const LEARN_PREDICATES = new Set<PredicateType | string>([
  'learned',
  'discovered',
  'realized',
  'found_out',
  'understood',
  'recognized',
]);

// TELL/ASK event triggers
const TELL_PREDICATES = new Set<PredicateType | string>([
  'told',
  'said',
  'asked',
  'questioned',
  'informed',
  'explained',
  'revealed',
  'announced',
  'warned',
  'confessed',
]);

// PROMISE event triggers
const PROMISE_PREDICATES = new Set<PredicateType | string>([
  'promised',
  'swore',
  'vowed',
  'agreed_to',
  'committed_to',
  'pledged',
]);

// ATTACK/HARM event triggers
const ATTACK_PREDICATES = new Set<PredicateType | string>([
  'attacked',
  'hit',
  'hurt',
  'injured',
  'struck',
  'fought',
  'assaulted',
]);

// MEET event triggers
const MEET_PREDICATES = new Set<PredicateType | string>([
  'met',
  'encountered',
  'ran_into',
  'found',
  'came_across',
]);

// DEATH event triggers
const DEATH_PREDICATES = new Set<PredicateType | string>([
  'died',
  'killed',
  'murdered',
  'perished',
  'passed_away',
]);

// =============================================================================
// EVENT CANDIDATE EXTRACTION
// =============================================================================

/**
 * Extract event candidates from assertions.
 *
 * This is a deterministic mapping: same assertions → same candidates.
 * No inference or world simulation - just predicate matching.
 *
 * @param assertions - Array of enriched assertions
 * @param entityMap - Map of entity IDs to entities (for type checking)
 * @returns Array of event candidates
 */
export function extractEventCandidates(
  assertions: Assertion[],
  entityMap: Map<EntityId, Entity>
): EventCandidate[] {
  const candidates: EventCandidate[] = [];

  for (const assertion of assertions) {
    // Skip assertions without subject-predicate-object
    if (!assertion.subject || !assertion.predicate) {
      continue;
    }

    const candidate = mapAssertionToCandidate(assertion, entityMap);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

/**
 * Map a single assertion to an event candidate.
 * Returns null if the predicate doesn't map to any event type.
 */
function mapAssertionToCandidate(
  assertion: Assertion,
  entityMap: Map<EntityId, Entity>
): EventCandidate | null {
  const predicate = assertion.predicate as string;

  // Try each event type in priority order
  if (MOVE_PREDICATES.has(predicate)) {
    return createMoveCandidate(assertion, entityMap);
  }

  if (DEATH_PREDICATES.has(predicate)) {
    return createDeathCandidate(assertion, entityMap);
  }

  if (TELL_PREDICATES.has(predicate)) {
    return createTellCandidate(assertion, entityMap);
  }

  if (LEARN_PREDICATES.has(predicate)) {
    return createLearnCandidate(assertion, entityMap);
  }

  if (PROMISE_PREDICATES.has(predicate)) {
    return createPromiseCandidate(assertion, entityMap);
  }

  if (ATTACK_PREDICATES.has(predicate)) {
    return createAttackCandidate(assertion, entityMap);
  }

  if (MEET_PREDICATES.has(predicate)) {
    return createMeetCandidate(assertion, entityMap);
  }

  // No matching event type
  return null;
}

/**
 * Create a MOVE event candidate.
 * mover = subject, destination = object (PLACE)
 */
function createMoveCandidate(
  assertion: Assertion,
  entityMap: Map<EntityId, Entity>
): EventCandidate {
  const participants: Participant[] = [];

  // Mover is the subject
  if (assertion.subject) {
    participants.push({
      role: 'AGENT',
      entity: assertion.subject,
      isRequired: true,
    });
  }

  // Destination is the object (if it's a PLACE entity)
  if (assertion.object && typeof assertion.object === 'string') {
    const objectEntity = entityMap.get(assertion.object);
    if (objectEntity?.type === 'PLACE') {
      participants.push({
        role: 'DESTINATION',
        entity: assertion.object,
        isRequired: true,
      });
    }
  }

  return createBaseCandidate('MOVE', assertion, participants);
}

/**
 * Create a DEATH event candidate.
 * decedent = subject (if "died") or object (if "killed")
 * killer = subject (if "killed")
 */
function createDeathCandidate(
  assertion: Assertion,
  entityMap: Map<EntityId, Entity>
): EventCandidate {
  const participants: Participant[] = [];
  const predicate = assertion.predicate as string;

  const isKilling = predicate === 'killed' || predicate === 'murdered';

  if (isKilling) {
    // "X killed Y" - X is the killer (AGENT), Y is the decedent (PATIENT)
    if (assertion.subject) {
      participants.push({
        role: 'AGENT',
        entity: assertion.subject,
        isRequired: false, // Killer is optional for DEATH event
      });
    }
    if (assertion.object && typeof assertion.object === 'string') {
      participants.push({
        role: 'PATIENT',
        entity: assertion.object,
        isRequired: true,
      });
    }
  } else {
    // "X died" - X is the decedent
    if (assertion.subject) {
      participants.push({
        role: 'PATIENT',
        entity: assertion.subject,
        isRequired: true,
      });
    }
  }

  return createBaseCandidate('DEATH', assertion, participants);
}

/**
 * Create a TELL event candidate.
 * speaker = attribution.character or subject
 * listener = object (if PERSON)
 */
function createTellCandidate(
  assertion: Assertion,
  entityMap: Map<EntityId, Entity>
): EventCandidate {
  const participants: Participant[] = [];

  // Speaker: use attribution.character if available (from Pass A), else subject
  const speakerId =
    assertion.attribution?.character || assertion.subject;

  if (speakerId) {
    participants.push({
      role: 'SPEAKER',
      entity: speakerId,
      isRequired: true,
    });
  }

  // Listener is the object if it's a PERSON
  if (assertion.object && typeof assertion.object === 'string') {
    const objectEntity = entityMap.get(assertion.object);
    if (objectEntity?.type === 'PERSON') {
      participants.push({
        role: 'ADDRESSEE',
        entity: assertion.object,
        isRequired: false,
      });
    }
  }

  // Extract content from evidence if available
  const content = extractContentFromEvidence(assertion);

  const candidate = createBaseCandidate('TELL', assertion, participants);
  candidate.content = content;
  return candidate;
}

/**
 * Create a LEARN event candidate.
 * knower = subject, content = object
 */
function createLearnCandidate(
  assertion: Assertion,
  _entityMap: Map<EntityId, Entity>
): EventCandidate {
  const participants: Participant[] = [];

  // Knower is the subject
  if (assertion.subject) {
    participants.push({
      role: 'EXPERIENCER',
      entity: assertion.subject,
      isRequired: true,
    });
  }

  // Content is the object (as topic)
  if (assertion.object && typeof assertion.object === 'string') {
    participants.push({
      role: 'TOPIC',
      entity: assertion.object,
      isRequired: false,
    });
  }

  const content =
    typeof assertion.object === 'string'
      ? undefined
      : String(assertion.object);

  const candidate = createBaseCandidate('LEARN', assertion, participants);
  candidate.content = content;
  return candidate;
}

/**
 * Create a PROMISE event candidate.
 * promiser = subject, beneficiary = object (if PERSON)
 */
function createPromiseCandidate(
  assertion: Assertion,
  entityMap: Map<EntityId, Entity>
): EventCandidate {
  const participants: Participant[] = [];

  // Promiser is the subject
  if (assertion.subject) {
    participants.push({
      role: 'AGENT',
      entity: assertion.subject,
      isRequired: true,
    });
  }

  // Beneficiary is the object if it's a PERSON
  if (assertion.object && typeof assertion.object === 'string') {
    const objectEntity = entityMap.get(assertion.object);
    if (objectEntity?.type === 'PERSON') {
      participants.push({
        role: 'BENEFICIARY',
        entity: assertion.object,
        isRequired: false,
      });
    }
  }

  const content = extractContentFromEvidence(assertion);

  const candidate = createBaseCandidate('PROMISE', assertion, participants);
  candidate.content = content;
  return candidate;
}

/**
 * Create an ATTACK event candidate.
 * attacker = subject, target = object (PERSON)
 */
function createAttackCandidate(
  assertion: Assertion,
  entityMap: Map<EntityId, Entity>
): EventCandidate {
  const participants: Participant[] = [];

  // Attacker is the subject
  if (assertion.subject) {
    participants.push({
      role: 'AGENT',
      entity: assertion.subject,
      isRequired: true,
    });
  }

  // Target is the object
  if (assertion.object && typeof assertion.object === 'string') {
    const objectEntity = entityMap.get(assertion.object);
    if (objectEntity?.type === 'PERSON' || objectEntity?.type === 'CREATURE') {
      participants.push({
        role: 'PATIENT',
        entity: assertion.object,
        isRequired: true,
      });
    }
  }

  return createBaseCandidate('ATTACK', assertion, participants);
}

/**
 * Create a MEET event candidate.
 * personA = subject, personB = object
 */
function createMeetCandidate(
  assertion: Assertion,
  entityMap: Map<EntityId, Entity>
): EventCandidate {
  const participants: Participant[] = [];

  // PersonA is the subject
  if (assertion.subject) {
    participants.push({
      role: 'AGENT',
      entity: assertion.subject,
      isRequired: true,
    });
  }

  // PersonB is the object (if it's a PERSON)
  if (assertion.object && typeof assertion.object === 'string') {
    const objectEntity = entityMap.get(assertion.object);
    if (objectEntity?.type === 'PERSON' || objectEntity?.type === 'CREATURE') {
      participants.push({
        role: 'PATIENT',
        entity: assertion.object,
        isRequired: true,
      });
    }
  }

  return createBaseCandidate('MEET', assertion, participants);
}

/**
 * Create a base event candidate with common fields.
 */
function createBaseCandidate(
  type: EventType,
  assertion: Assertion,
  participants: Participant[]
): EventCandidate {
  // Get discourse position from first evidence span
  const firstEvidence = assertion.evidence[0];
  const discoursePosition = {
    paragraphIndex: firstEvidence?.paragraphIndex,
    sentenceIndex: firstEvidence?.sentenceIndex,
    charStart: firstEvidence?.charStart ?? 0,
  };

  return {
    type,
    participants,
    evidence: assertion.evidence,
    derivedFrom: [assertion.id],
    modality: assertion.modality,
    confidence: assertion.confidence,
    attribution: assertion.attribution,
    docId: assertion.evidence[0]?.docId ?? 'unknown',
    discoursePosition,
  };
}

/**
 * Extract content string from evidence (for TELL, PROMISE, etc.).
 */
function extractContentFromEvidence(assertion: Assertion): string | undefined {
  // Look for quoted content in evidence
  for (const ev of assertion.evidence) {
    const quoteMatch = ev.text.match(/"([^"]+)"|'([^']+)'/);
    if (quoteMatch) {
      return quoteMatch[1] || quoteMatch[2];
    }
  }
  return undefined;
}

// =============================================================================
// DEDUPLICATION
// =============================================================================

/**
 * Normalize and deduplicate event candidates.
 *
 * Deduplication key: (eventType, participants sorted, timeAnchor bucket, docId)
 * Time bucket = same paragraph range in v1.
 *
 * When deduping, merge evidence spans.
 *
 * @param candidates - Array of event candidates
 * @returns Array of deduplicated StoryEvents
 */
export function normalizeAndDedupe(candidates: EventCandidate[]): StoryEvent[] {
  // Group candidates by dedup key
  const groups = new Map<string, EventCandidate[]>();

  for (const candidate of candidates) {
    const key = computeDedupeKey(candidate);
    const existing = groups.get(key);
    if (existing) {
      existing.push(candidate);
    } else {
      groups.set(key, [candidate]);
    }
  }

  // Convert each group to a single StoryEvent
  const events: StoryEvent[] = [];
  for (const [_key, group] of Array.from(groups.entries())) {
    const event = mergeCanditatesToEvent(group);
    events.push(event);
  }

  return events;
}

/**
 * Compute deterministic deduplication key.
 * Key = (eventType, participants sorted by role+id, paragraphIndex, docId)
 */
function computeDedupeKey(candidate: EventCandidate): string {
  const parts: string[] = [];

  // Event type
  parts.push(candidate.type);

  // Participants sorted by role+id
  const sortedParticipants = [...candidate.participants]
    .sort((a, b) => {
      const roleCompare = a.role.localeCompare(b.role);
      if (roleCompare !== 0) return roleCompare;
      return a.entity.localeCompare(b.entity);
    })
    .map((p) => `${p.role}:${p.entity}`);
  parts.push(sortedParticipants.join(','));

  // Time bucket (paragraph index or "unknown")
  const timeBucket = candidate.discoursePosition.paragraphIndex ?? 'unknown';
  parts.push(String(timeBucket));

  // Document ID
  parts.push(candidate.docId);

  return parts.join('|');
}

/**
 * Merge multiple candidates into a single StoryEvent.
 * Combines evidence spans and assertion references.
 */
function mergeCanditatesToEvent(candidates: EventCandidate[]): StoryEvent {
  // Use first candidate as base
  const base = candidates[0];

  // Merge evidence spans (dedupe by text)
  const evidenceMap = new Map<string, EvidenceSpan>();
  for (const candidate of candidates) {
    for (const ev of candidate.evidence) {
      const key = `${ev.docId}:${ev.charStart}:${ev.charEnd}`;
      if (!evidenceMap.has(key)) {
        evidenceMap.set(key, ev);
      }
    }
  }
  const mergedEvidence = Array.from(evidenceMap.values());

  // Merge derivedFrom assertion IDs
  const derivedFromSet = new Set<AssertionId>();
  for (const candidate of candidates) {
    for (const id of candidate.derivedFrom) {
      derivedFromSet.add(id);
    }
  }
  const mergedDerivedFrom = Array.from(derivedFromSet);

  // Compute composite confidence from merged candidates
  const avgConfidence = computeAverageConfidence(candidates);

  // Use highest modality certainty
  const bestModality = selectBestModality(candidates);

  // Generate deterministic event ID
  const eventId = generateEventId(base.type, base.participants, mergedDerivedFrom);

  const now = new Date().toISOString();

  return {
    id: eventId,
    type: base.type,
    participants: base.participants,
    location: base.location,
    time: { type: 'UNKNOWN' } as TimeAnchor, // Will be set by attachTimeAnchors
    evidence: mergedEvidence,
    attribution: base.attribution,
    modality: bestModality,
    confidence: avgConfidence,
    links: [],
    produces: [],
    extractedFrom: 'pattern',
    derivedFrom: mergedDerivedFrom,
    createdAt: now,
    compiler_pass: 'event-builder',
  };
}

/**
 * Compute average confidence from multiple candidates.
 */
function computeAverageConfidence(candidates: EventCandidate[]): Confidence {
  const sum = {
    extraction: 0,
    identity: 0,
    semantic: 0,
    temporal: 0,
    composite: 0,
  };

  for (const c of candidates) {
    sum.extraction += c.confidence.extraction;
    sum.identity += c.confidence.identity;
    sum.semantic += c.confidence.semantic;
    sum.temporal += c.confidence.temporal;
    sum.composite += c.confidence.composite;
  }

  const n = candidates.length;
  return {
    extraction: sum.extraction / n,
    identity: sum.identity / n,
    semantic: sum.semantic / n,
    temporal: sum.temporal / n,
    composite: sum.composite / n,
  };
}

/**
 * Select best modality from candidates.
 * Priority: FACT > CLAIM > BELIEF > RUMOR > NEGATED > UNCERTAIN
 */
function selectBestModality(candidates: EventCandidate[]): Modality {
  const priority: Record<Modality, number> = {
    FACT: 6,
    CLAIM: 5,
    BELIEF: 4,
    RUMOR: 3,
    PLAN: 2,
    NEGATED: 1,
    HYPOTHETICAL: 0,
    UNCERTAIN: 0,
  };

  let best: Modality = 'UNCERTAIN';
  let bestScore = -1;

  for (const c of candidates) {
    const score = priority[c.modality] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = c.modality;
    }
  }

  return best;
}

/**
 * Generate deterministic event ID from type, participants, and sources.
 */
function generateEventId(
  type: EventType,
  participants: Participant[],
  derivedFrom: AssertionId[]
): EventId {
  const parts = [
    type,
    ...participants.map((p) => `${p.role}:${p.entity}`).sort(),
    ...derivedFrom.sort(),
  ];

  const hash = createHash('sha256')
    .update(parts.join('|'))
    .digest('hex')
    .slice(0, 16);

  return `event_${type.toLowerCase()}_${hash}`;
}

// =============================================================================
// TIME ANCHOR ATTACHMENT
// =============================================================================

/**
 * Document order information for time anchoring.
 */
export interface DocOrderInfo {
  docId: string;
  orderIndex: number; // Order of this doc in the project
}

/**
 * Attach time anchors to events based on discourse position.
 *
 * v1: Uses DiscourseTime based on paragraph/sentence position.
 * Events are sorted by (docOrderIndex, paragraphIndex, sentenceIndex, charStart).
 *
 * @param events - Array of StoryEvents
 * @param docOrder - Document order information
 * @returns Events with time anchors attached
 */
export function attachTimeAnchors(
  events: StoryEvent[],
  docOrder: DocOrderInfo[]
): StoryEvent[] {
  // Build doc order lookup
  const docOrderMap = new Map<string, number>();
  for (const doc of docOrder) {
    docOrderMap.set(doc.docId, doc.orderIndex);
  }

  // Attach discourse time to each event
  const timedEvents = events.map((event) => {
    const discourseTime = computeDiscourseTime(event, docOrderMap);
    return {
      ...event,
      time: discourseTime,
    };
  });

  // Sort by discourse position for stable timeline
  timedEvents.sort((a, b) => {
    const aTime = a.time as DiscourseTime;
    const bTime = b.time as DiscourseTime;

    // First by chapter
    const chapterDiff = (aTime.chapter ?? 0) - (bTime.chapter ?? 0);
    if (chapterDiff !== 0) return chapterDiff;

    // Then by paragraph
    const paraDiff = (aTime.paragraph ?? 0) - (bTime.paragraph ?? 0);
    if (paraDiff !== 0) return paraDiff;

    // Then by sentence
    return (aTime.sentence ?? 0) - (bTime.sentence ?? 0);
  });

  return timedEvents;
}

/**
 * Compute discourse time from event evidence.
 */
function computeDiscourseTime(
  event: StoryEvent,
  docOrderMap: Map<string, number>
): DiscourseTime {
  // Get earliest evidence position
  let minParagraph: number | undefined;
  let minSentence: number | undefined;
  let docIndex: number | undefined;

  for (const ev of event.evidence) {
    const evDocIndex = docOrderMap.get(ev.docId) ?? 0;

    if (
      docIndex === undefined ||
      evDocIndex < docIndex ||
      (evDocIndex === docIndex &&
        (ev.paragraphIndex ?? 0) < (minParagraph ?? Infinity))
    ) {
      docIndex = evDocIndex;
      minParagraph = ev.paragraphIndex;
      minSentence = ev.sentenceIndex;
    }
  }

  return {
    type: 'DISCOURSE',
    chapter: docIndex,
    paragraph: minParagraph,
    sentence: minSentence,
  };
}

// =============================================================================
// MAIN PIPELINE
// =============================================================================

/**
 * Build events from assertions.
 *
 * This is the main entry point for the event builder.
 *
 * @param assertions - Array of enriched assertions
 * @param entityMap - Map of entity IDs to entities
 * @param docOrder - Document order information
 * @returns Array of StoryEvents with time anchors
 */
export function buildEvents(
  assertions: Assertion[],
  entityMap: Map<EntityId, Entity>,
  docOrder: DocOrderInfo[]
): StoryEvent[] {
  // Step 1: Extract event candidates
  const candidates = extractEventCandidates(assertions, entityMap);

  // Step 2: Normalize and dedupe
  const events = normalizeAndDedupe(candidates);

  // Step 3: Attach time anchors
  const timedEvents = attachTimeAnchors(events, docOrder);

  return timedEvents;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  MOVE_PREDICATES,
  LEARN_PREDICATES,
  TELL_PREDICATES,
  PROMISE_PREDICATES,
  ATTACK_PREDICATES,
  MEET_PREDICATES,
  DEATH_PREDICATES,
};
