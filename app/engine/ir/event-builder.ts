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

// MOVE event triggers (expanded to include base verbs)
const MOVE_PREDICATES = new Set<PredicateType | string>([
  // With preposition suffix
  'traveled_to',
  'went_to',
  'arrived_at',
  'left',
  'moved_to',
  'visited',
  'returned_to',
  'fled_to',
  'escaped_to',
  'came_to',
  'came_from',
  'walked_to',
  'ran_to',
  'stayed_at',
  'stayed_in',
  // Base verbs (when prep object is captured as object)
  'went',
  'moved',
  'came',
  'traveled',
  'walked',
  'ran',
  'returned',
  'fled',
  'escaped',
  'entered',
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
  'replied',
  'answered',
  'shouted',
  'whispered',
  'called',
  'cried',
  'stated',
  'declared',
  'mentioned',
  'noted',
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
  'meet',
  'joined',
  'greeted',
  'saw',
  'visited',
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
// PREDICATE NORMALIZATION TABLE
// =============================================================================

/**
 * Normalize surface verb forms to canonical predicates.
 * This reduces trigger list bloat and makes behavior more consistent.
 *
 * Format: surface form → canonical form
 */
const PREDICATE_NORMALIZATIONS: Record<string, string> = {
  // TELL variations → said
  'say': 'said',
  'says': 'said',
  'reply': 'replied',
  'replies': 'replied',
  'answer': 'answered',
  'answers': 'answered',
  'shout': 'shouted',
  'shouts': 'shouted',
  'whisper': 'whispered',
  'whispers': 'whispered',
  'tell': 'told',
  'tells': 'told',
  'ask': 'asked',
  'asks': 'asked',
  'explain': 'explained',
  'explains': 'explained',
  'announce': 'announced',
  'announces': 'announced',
  'declare': 'declared',
  'declares': 'declared',
  'mention': 'mentioned',
  'mentions': 'mentioned',
  'state': 'stated',
  'states': 'stated',

  // MOVE variations → past tense
  'go': 'went',
  'goes': 'went',
  'come': 'came',
  'comes': 'came',
  'move': 'moved',
  'moves': 'moved',
  'walk': 'walked',
  'walks': 'walked',
  'run': 'ran',
  'runs': 'ran',
  'enter': 'entered',
  'enters': 'entered',
  'leave': 'left',
  'leaves': 'left',
  'arrive': 'arrived_at',
  'arrives': 'arrived_at',
  'travel': 'traveled',
  'travels': 'traveled',
  'return': 'returned',
  'returns': 'returned',
  'flee': 'fled',
  'flees': 'fled',
  'escape': 'escaped',
  'escapes': 'escaped',
  'stay': 'stayed_at',
  'stays': 'stayed_at',

  // LEARN variations
  'learn': 'learned',
  'learns': 'learned',
  'discover': 'discovered',
  'discovers': 'discovered',
  'realize': 'realized',
  'realizes': 'realized',
  'understand': 'understood',
  'understands': 'understood',
  'recognize': 'recognized',
  'recognizes': 'recognized',

  // MEET variations
  'meet': 'met',
  'meets': 'met',
  'encounter': 'encountered',
  'encounters': 'encountered',
  'greet': 'greeted',
  'greets': 'greeted',
  'join': 'joined',
  'joins': 'joined',
  'see': 'saw',
  'sees': 'saw',

  // DEATH variations
  'die': 'died',
  'dies': 'died',
  'kill': 'killed',
  'kills': 'killed',
  'murder': 'murdered',
  'murders': 'murdered',

  // ATTACK variations
  'attack': 'attacked',
  'attacks': 'attacked',
  'fight': 'fought',
  'fights': 'fought',
  'strike': 'struck',
  'strikes': 'struck',
  'hit': 'hit', // already past tense form
  'hits': 'hit',
  'assault': 'assaulted',
  'assaults': 'assaulted',

  // PROMISE variations
  'promise': 'promised',
  'promises': 'promised',
  'swear': 'swore',
  'swears': 'swore',
  'vow': 'vowed',
  'vows': 'vowed',
  'pledge': 'pledged',
  'pledges': 'pledged',
};

/**
 * Normalize a predicate to its canonical form.
 */
function normalizePredicate(predicate: string): string {
  return PREDICATE_NORMALIZATIONS[predicate] || predicate;
}

// =============================================================================
// EVENT ELIGIBILITY GATE
// =============================================================================

/**
 * Unresolved pronouns that should block event creation.
 * These indicate failed coreference resolution.
 */
const UNRESOLVED_PRONOUNS = new Set([
  'he', 'she', 'they', 'it', 'him', 'her', 'them',
  'his', 'hers', 'their', 'theirs', 'its',
  'He', 'She', 'They', 'It', 'Him', 'Her', 'Them',
  'I', 'we', 'me', 'us', 'my', 'our', 'We', 'Me', 'Us',
]);

/**
 * Group placeholders that should block event creation
 * unless they map to a real GROUP entity type.
 */
const GROUP_PLACEHOLDERS = new Set([
  'everyone', 'everybody', 'someone', 'somebody', 'anyone', 'anybody',
  'no one', 'nobody', 'people', 'others', 'some', 'many', 'few',
  'the family', 'the group', 'the team', 'the crowd',
  'Everyone', 'Everybody', 'Someone', 'Somebody', 'Anyone', 'Anybody',
]);

/**
 * Stats for tracking eligibility gate decisions.
 */
export interface EligibilityStats {
  /** Total assertions processed */
  total: number;
  /** Assertions that passed eligibility */
  passed: number;
  /** Blocked by unresolved pronoun subject */
  blockedUnresolvedPronoun: number;
  /** Blocked by group placeholder subject */
  blockedGroupPlaceholder: number;
  /** Blocked by missing required object */
  blockedMissingObject: number;
  /** Blocked by NEGATED modality */
  blockedNegated: number;
}

/**
 * Eligibility check result with reason.
 */
interface EligibilityResult {
  eligible: boolean;
  reason?: 'unresolved_pronoun' | 'group_placeholder' | 'missing_object' | 'negated';
  confidencePenalty?: number;
}

/**
 * Check if an assertion is eligible for event creation.
 *
 * Hard blocks:
 * - Subject is unresolved pronoun (coref failed)
 * - Subject is group placeholder (unless GROUP entity)
 * - Object required for event type but missing (MOVE needs destination)
 *
 * Soft blocks:
 * - NEGATED modality → skip event (for now; could create NON_EVENT later)
 */
function checkEligibility(
  assertion: Assertion,
  eventType: EventType,
  entityMap: Map<EntityId, Entity>
): EligibilityResult {
  const subjectId = assertion.subject;

  // Hard block: No subject
  if (!subjectId) {
    return { eligible: false, reason: 'unresolved_pronoun' };
  }

  // Check if subject is a resolved entity or just a pronoun string
  const subjectEntity = entityMap.get(subjectId);
  const subjectName = subjectEntity?.name || subjectId;

  // Hard block: Unresolved pronoun as subject
  if (UNRESOLVED_PRONOUNS.has(subjectName) && !subjectEntity) {
    return { eligible: false, reason: 'unresolved_pronoun' };
  }

  // Hard block: Group placeholder (unless mapped to GROUP entity)
  const lowerName = subjectName.toLowerCase();
  if (GROUP_PLACEHOLDERS.has(subjectName) || GROUP_PLACEHOLDERS.has(lowerName)) {
    if (!subjectEntity || subjectEntity.type !== 'GROUP') {
      return { eligible: false, reason: 'group_placeholder' };
    }
  }

  // Hard block: MOVE requires destination
  if (eventType === 'MOVE') {
    const objectId = assertion.object;
    if (!objectId || typeof objectId !== 'string') {
      return { eligible: false, reason: 'missing_object' };
    }
    // Check if object is a PLACE (or at least exists)
    const objectEntity = entityMap.get(objectId);
    // Allow if object exists as entity, even if not strictly PLACE
    // (validation will filter later if needed)
  }

  // Soft block: NEGATED modality → skip event creation (for now)
  if (assertion.modality === 'NEGATED') {
    return { eligible: false, reason: 'negated' };
  }

  return { eligible: true };
}

// =============================================================================
// EVENT CANDIDATE EXTRACTION
// =============================================================================

/**
 * Extract event candidates from assertions with eligibility gating.
 *
 * This is a deterministic mapping: same assertions → same candidates.
 * No inference or world simulation - just predicate matching + eligibility checks.
 *
 * @param assertions - Array of enriched assertions
 * @param entityMap - Map of entity IDs to entities (for type checking)
 * @param stats - Optional stats object to track eligibility decisions
 * @returns Array of event candidates
 */
export function extractEventCandidates(
  assertions: Assertion[],
  entityMap: Map<EntityId, Entity>,
  stats?: EligibilityStats
): EventCandidate[] {
  const candidates: EventCandidate[] = [];

  // Initialize stats if provided
  if (stats) {
    stats.total = 0;
    stats.passed = 0;
    stats.blockedUnresolvedPronoun = 0;
    stats.blockedGroupPlaceholder = 0;
    stats.blockedMissingObject = 0;
    stats.blockedNegated = 0;
  }

  for (const assertion of assertions) {
    // Skip assertions without subject-predicate-object
    if (!assertion.subject || !assertion.predicate) {
      continue;
    }

    // First determine if this predicate maps to an event type
    const eventType = getEventTypeForPredicate(assertion.predicate as string);
    if (!eventType) {
      continue; // Predicate doesn't map to any event
    }

    if (stats) stats.total++;

    // Check eligibility before creating candidate
    const eligibility = checkEligibility(assertion, eventType, entityMap);
    if (!eligibility.eligible) {
      if (stats) {
        switch (eligibility.reason) {
          case 'unresolved_pronoun':
            stats.blockedUnresolvedPronoun++;
            break;
          case 'group_placeholder':
            stats.blockedGroupPlaceholder++;
            break;
          case 'missing_object':
            stats.blockedMissingObject++;
            break;
          case 'negated':
            stats.blockedNegated++;
            break;
        }
      }
      continue;
    }

    if (stats) stats.passed++;

    const candidate = createCandidateForType(eventType, assertion, entityMap);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

/**
 * Determine which event type a predicate maps to.
 * Returns null if no match.
 */
function getEventTypeForPredicate(predicate: string): EventType | null {
  // Normalize predicate first (e.g., 'say' → 'said', 'go' → 'went')
  const normalized = normalizePredicate(predicate);

  if (MOVE_PREDICATES.has(normalized)) return 'MOVE';
  if (DEATH_PREDICATES.has(normalized)) return 'DEATH';
  if (TELL_PREDICATES.has(normalized)) return 'TELL';
  if (LEARN_PREDICATES.has(normalized)) return 'LEARN';
  if (PROMISE_PREDICATES.has(normalized)) return 'PROMISE';
  if (ATTACK_PREDICATES.has(normalized)) return 'ATTACK';
  if (MEET_PREDICATES.has(normalized)) return 'MEET';
  return null;
}

/**
 * Create a candidate for a specific event type.
 */
function createCandidateForType(
  eventType: EventType,
  assertion: Assertion,
  entityMap: Map<EntityId, Entity>
): EventCandidate | null {
  switch (eventType) {
    case 'MOVE':
      return createMoveCandidate(assertion, entityMap);
    case 'DEATH':
      return createDeathCandidate(assertion, entityMap);
    case 'TELL':
      return createTellCandidate(assertion, entityMap);
    case 'LEARN':
      return createLearnCandidate(assertion, entityMap);
    case 'PROMISE':
      return createPromiseCandidate(assertion, entityMap);
    case 'ATTACK':
      return createAttackCandidate(assertion, entityMap);
    case 'MEET':
      return createMeetCandidate(assertion, entityMap);
    default:
      return null;
  }
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

  // Mover is the subject (use specific role MOVER, not generic AGENT)
  if (assertion.subject) {
    participants.push({
      role: 'MOVER',
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
  _entityMap: Map<EntityId, Entity>
): EventCandidate {
  const participants: Participant[] = [];
  const predicate = assertion.predicate as string;

  const isKilling = predicate === 'killed' || predicate === 'murdered';

  if (isKilling) {
    // "X killed Y" - X is the killer, Y is the decedent
    if (assertion.subject) {
      participants.push({
        role: 'KILLER',
        entity: assertion.subject,
        isRequired: false, // Killer is optional for DEATH event
      });
    }
    if (assertion.object && typeof assertion.object === 'string') {
      participants.push({
        role: 'DECEDENT',
        entity: assertion.object,
        isRequired: true,
      });
    }
  } else {
    // "X died" - X is the decedent
    if (assertion.subject) {
      participants.push({
        role: 'DECEDENT',
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
 * learner = subject, topic = object
 */
function createLearnCandidate(
  assertion: Assertion,
  _entityMap: Map<EntityId, Entity>
): EventCandidate {
  const participants: Participant[] = [];

  // Learner is the subject (use specific role LEARNER)
  if (assertion.subject) {
    participants.push({
      role: 'LEARNER',
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

  // Promiser is the subject (use specific role PROMISER)
  if (assertion.subject) {
    participants.push({
      role: 'PROMISER',
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

  // Attacker is the subject (use specific role ATTACKER)
  if (assertion.subject) {
    participants.push({
      role: 'ATTACKER',
      entity: assertion.subject,
      isRequired: true,
    });
  }

  // Target is the object (use specific role TARGET)
  if (assertion.object && typeof assertion.object === 'string') {
    const objectEntity = entityMap.get(assertion.object);
    if (objectEntity?.type === 'PERSON' || objectEntity?.type === 'CREATURE') {
      participants.push({
        role: 'TARGET',
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

  // PersonA is the subject (use PERSON_A for symmetric meet events)
  if (assertion.subject) {
    participants.push({
      role: 'PERSON_A',
      entity: assertion.subject,
      isRequired: true,
    });
  }

  // PersonB is the object (if it's a PERSON)
  if (assertion.object && typeof assertion.object === 'string') {
    const objectEntity = entityMap.get(assertion.object);
    if (objectEntity?.type === 'PERSON' || objectEntity?.type === 'CREATURE') {
      participants.push({
        role: 'PERSON_B',
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

  // Use safest modality (most uncertain) to avoid auto-upgrading
  const safestModality = selectSafestModality(candidates);

  // Collect all observed modalities for richer rendering
  const modalitiesObserved = collectModalitiesObserved(candidates);

  // Generate deterministic event ID (include dedupe bucket for stability)
  const eventId = generateEventId(
    base.type,
    base.participants,
    base.docId,
    base.discoursePosition.paragraphIndex,
    mergedDerivedFrom
  );

  const now = new Date().toISOString();

  return {
    id: eventId,
    type: base.type,
    participants: base.participants,
    location: base.location,
    time: { type: 'UNKNOWN' } as TimeAnchor, // Will be set by attachTimeAnchors
    evidence: mergedEvidence,
    attribution: base.attribution,
    modality: safestModality,
    modalitiesObserved, // All modalities seen across merged candidates
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
 * Select safest modality from candidates (maximum uncertainty).
 *
 * When merging duplicate events, we choose the LEAST certain modality
 * to avoid auto-upgrading uncertain events to facts.
 *
 * Uncertainty order (most uncertain first):
 *   RUMOR > BELIEF > CLAIM > NEGATED > PLAN > HYPOTHETICAL > FACT
 *
 * Rule: if any source is RUMOR → merged = RUMOR, etc.
 */
function selectSafestModality(candidates: EventCandidate[]): Modality {
  // Lower number = more uncertain = chosen when merging
  const uncertainty: Record<Modality, number> = {
    RUMOR: 1,        // Most uncertain - hearsay
    BELIEF: 2,       // Character believes
    CLAIM: 3,        // Character claims
    NEGATED: 4,      // Explicitly negated
    PLAN: 5,         // Future intention
    HYPOTHETICAL: 6, // Conditional/counterfactual
    UNCERTAIN: 7,    // Ambiguous
    FACT: 8,         // Most certain - narrator states
  };

  let safest: Modality = 'FACT';
  let lowestScore = uncertainty.FACT;

  for (const c of candidates) {
    const score = uncertainty[c.modality] ?? uncertainty.UNCERTAIN;
    if (score < lowestScore) {
      lowestScore = score;
      safest = c.modality;
    }
  }

  return safest;
}

/**
 * Collect all observed modalities from candidates.
 * Useful for rendering "reported as rumor, later confirmed".
 */
function collectModalitiesObserved(candidates: EventCandidate[]): Modality[] {
  const seen = new Set<Modality>();
  for (const c of candidates) {
    seen.add(c.modality);
  }
  return Array.from(seen);
}

/**
 * Generate deterministic event ID from type, participants, dedupe bucket, and sources.
 *
 * The ID is based on the canonical event signature used for deduplication:
 * - eventType
 * - participants sorted by role+id
 * - docId
 * - paragraphIndex (time bucket)
 * - derivedFrom assertion IDs
 *
 * This ensures same-bucket duplicates get the same ID.
 */
function generateEventId(
  type: EventType,
  participants: Participant[],
  docId: string,
  paragraphIndex: number | undefined,
  derivedFrom: AssertionId[]
): EventId {
  const parts = [
    type,
    ...participants.map((p) => `${p.role}:${p.entity}`).sort(),
    docId,
    String(paragraphIndex ?? 'unknown'),
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
/**
 * Result of buildEvents including optional eligibility stats.
 */
export interface BuildEventsResult {
  events: StoryEvent[];
  eligibilityStats?: EligibilityStats;
}

export function buildEvents(
  assertions: Assertion[],
  entityMap: Map<EntityId, Entity>,
  docOrder: DocOrderInfo[],
  trackEligibility?: false
): StoryEvent[];
export function buildEvents(
  assertions: Assertion[],
  entityMap: Map<EntityId, Entity>,
  docOrder: DocOrderInfo[],
  trackEligibility: true
): BuildEventsResult;
export function buildEvents(
  assertions: Assertion[],
  entityMap: Map<EntityId, Entity>,
  docOrder: DocOrderInfo[],
  trackEligibility: boolean = false
): StoryEvent[] | BuildEventsResult {
  // Step 1: Extract event candidates (with optional stats)
  const stats: EligibilityStats | undefined = trackEligibility
    ? { total: 0, passed: 0, blockedUnresolvedPronoun: 0, blockedGroupPlaceholder: 0, blockedMissingObject: 0, blockedNegated: 0 }
    : undefined;

  const candidates = extractEventCandidates(assertions, entityMap, stats);

  // Step 2: Normalize and dedupe
  const events = normalizeAndDedupe(candidates);

  // Step 3: Attach time anchors
  const timedEvents = attachTimeAnchors(events, docOrder);

  if (trackEligibility) {
    return { events: timedEvents, eligibilityStats: stats };
  }
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
