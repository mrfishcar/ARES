/**
 * Event Extraction System
 *
 * Extracts narrative events with agent/patient roles from text.
 * BookNLP-inspired approach using verb-centric event detection.
 *
 * Event Structure:
 * - Event trigger (verb)
 * - Agent (who performs the action)
 * - Patient (who/what receives the action)
 * - Temporal/spatial modifiers
 *
 * @see docs/BOOKNLP_COMPARISON.md - Critical gap implementation
 */

import type { Event, Evidence, Entity } from '../schema';
import type { Token, ParsedSentence } from '../../parser/parse-types';
import { logger } from '../../infra/logger';
import {
  getSupersense,
  type VerbSupersense,
} from '../linguistics/supersense';
import { v4 as uuid } from 'uuid';

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Narrative event types based on verb supersenses
 */
export type EventType =
  | 'MOTION'        // Movement events (go, come, travel)
  | 'COMMUNICATION' // Speech events (say, tell, ask)
  | 'PERCEPTION'    // Perception events (see, hear, feel)
  | 'COGNITION'     // Mental events (think, know, believe)
  | 'CONTACT'       // Physical contact (hit, kill, fight)
  | 'CHANGE'        // State change (become, die, transform)
  | 'POSSESSION'    // Possession events (take, give, steal)
  | 'SOCIAL'        // Social events (meet, marry, betray)
  | 'CREATION'      // Creation events (make, build, destroy)
  | 'EMOTION'       // Emotional events (love, hate, fear)
  | 'OTHER';        // Unclassified events

/**
 * Event participant role
 */
export interface EventParticipant {
  role: 'agent' | 'patient' | 'instrument' | 'location' | 'time' | 'manner';
  entityId?: string;    // Link to entity if resolved
  text: string;         // Surface form
  tokenIndices: number[]; // Token positions
}

/**
 * Extracted narrative event
 */
export interface NarrativeEvent {
  id: string;
  type: EventType;
  trigger: {
    lemma: string;
    text: string;
    tokenIndex: number;
    supersense?: VerbSupersense;
  };
  participants: EventParticipant[];
  sentenceIndex: number;
  confidence: number;
  evidence: Evidence;
}

/**
 * Event extraction result
 */
export interface EventExtractionResult {
  events: NarrativeEvent[];
  stats: {
    totalEvents: number;
    byType: Record<EventType, number>;
    withAgent: number;
    withPatient: number;
    avgConfidence: number;
  };
}

// ============================================================================
// EVENT TYPE MAPPING
// ============================================================================

const SUPERSENSE_TO_EVENT_TYPE: Record<VerbSupersense, EventType> = {
  'v.motion': 'MOTION',
  'v.communication': 'COMMUNICATION',
  'v.perception': 'PERCEPTION',
  'v.cognition': 'COGNITION',
  'v.contact': 'CONTACT',
  'v.change': 'CHANGE',
  'v.possession': 'POSSESSION',
  'v.social': 'SOCIAL',
  'v.creation': 'CREATION',
  'v.emotion': 'EMOTION',
  'v.body': 'OTHER',
  'v.competition': 'CONTACT',
  'v.consumption': 'OTHER',
  'v.stative': 'OTHER',
  'v.weather': 'OTHER',
};

/**
 * Important narrative verbs (event triggers)
 * Organized by event type
 */
const NARRATIVE_VERBS: Record<EventType, Set<string>> = {
  MOTION: new Set([
    'go', 'come', 'walk', 'run', 'ride', 'fly', 'fall', 'climb', 'travel',
    'return', 'flee', 'escape', 'enter', 'leave', 'follow', 'lead', 'cross',
    'pass', 'approach', 'depart', 'arrive', 'journey', 'wander', 'march',
  ]),
  COMMUNICATION: new Set([
    'say', 'tell', 'ask', 'answer', 'speak', 'call', 'cry', 'shout',
    'whisper', 'sing', 'declare', 'announce', 'warn', 'promise', 'name',
    'command', 'order', 'reply', 'respond', 'explain', 'describe',
  ]),
  PERCEPTION: new Set([
    'see', 'look', 'watch', 'hear', 'listen', 'feel', 'sense', 'notice',
    'observe', 'smell', 'taste', 'glimpse', 'spot', 'recognize',
  ]),
  COGNITION: new Set([
    'think', 'know', 'believe', 'remember', 'forget', 'understand',
    'wonder', 'dream', 'plan', 'decide', 'doubt', 'realize', 'learn',
    'consider', 'imagine', 'hope', 'expect', 'guess', 'suppose',
  ]),
  CONTACT: new Set([
    'hit', 'strike', 'kill', 'fight', 'attack', 'defend', 'cut', 'break',
    'hold', 'catch', 'throw', 'push', 'pull', 'touch', 'grab', 'seize',
    'wound', 'pierce', 'stab', 'shoot', 'burn', 'beat', 'slay',
  ]),
  CHANGE: new Set([
    'become', 'change', 'turn', 'grow', 'die', 'wake', 'sleep', 'rise',
    'fall', 'break', 'heal', 'transform', 'vanish', 'appear', 'fade',
    'emerge', 'awaken', 'recover', 'deteriorate',
  ]),
  POSSESSION: new Set([
    'have', 'take', 'give', 'get', 'find', 'lose', 'keep', 'bring',
    'carry', 'steal', 'receive', 'obtain', 'acquire', 'possess', 'own',
    'seize', 'claim', 'surrender', 'grant',
  ]),
  SOCIAL: new Set([
    'meet', 'marry', 'serve', 'help', 'rule', 'obey', 'betray', 'trust',
    'join', 'unite', 'divide', 'ally', 'befriend', 'exile', 'banish',
    'crown', 'appoint', 'elect', 'dismiss',
  ]),
  CREATION: new Set([
    'make', 'create', 'build', 'forge', 'write', 'destroy', 'burn',
    'craft', 'design', 'compose', 'invent', 'construct', 'demolish',
    'ruin', 'found', 'establish',
  ]),
  EMOTION: new Set([
    'love', 'hate', 'fear', 'hope', 'laugh', 'cry', 'weep', 'mourn',
    'rejoice', 'grieve', 'despair', 'rage', 'delight', 'suffer',
  ]),
  OTHER: new Set([]),
};

// ============================================================================
// EVENT EXTRACTION
// ============================================================================

/**
 * Find the event type for a verb lemma
 */
function getEventTypeForVerb(lemma: string): EventType {
  const normalized = lemma.toLowerCase();

  // Check supersense first
  const supersense = getSupersense(normalized, 'VB');
  if (supersense && supersense.startsWith('v.')) {
    return SUPERSENSE_TO_EVENT_TYPE[supersense as VerbSupersense];
  }

  // Fall back to lexicon lookup
  for (const [eventType, verbs] of Object.entries(NARRATIVE_VERBS)) {
    if (verbs.has(normalized)) {
      return eventType as EventType;
    }
  }

  return 'OTHER';
}

/**
 * Check if a token is an event trigger (main verb)
 */
function isEventTrigger(token: Token): boolean {
  // Must be a verb
  if (!token.pos.startsWith('VB') && token.pos !== 'VERB') {
    return false;
  }

  // Exclude auxiliaries and modals
  const auxiliaries = new Set(['be', 'have', 'do', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must']);
  if (auxiliaries.has(token.lemma.toLowerCase())) {
    // Unless it's the main verb (ROOT or with direct objects)
    if (token.dep !== 'ROOT' && token.dep !== 'conj') {
      return false;
    }
  }

  // Must be in a meaningful dependency position
  const eventDeps = new Set(['ROOT', 'conj', 'relcl', 'advcl', 'xcomp', 'ccomp']);
  return eventDeps.has(token.dep);
}

/**
 * Find the agent (subject) of a verb
 */
function findAgent(tokens: Token[], verbIndex: number): EventParticipant | undefined {
  const verb = tokens[verbIndex];

  // Look for nsubj (nominal subject) or nsubjpass
  for (const token of tokens) {
    if (token.head === verbIndex && (token.dep === 'nsubj' || token.dep === 'nsubjpass')) {
      // Expand to full noun phrase
      const npTokens = expandNounPhrase(tokens, token.i);
      const text = npTokens.map(t => t.text).join(' ');

      return {
        role: 'agent',
        text,
        tokenIndices: npTokens.map(t => t.i),
      };
    }
  }

  // Check if verb head has a subject (for embedded clauses)
  if (verb.head !== verbIndex) {
    const head = tokens.find(t => t.i === verb.head);
    if (head && head.pos.startsWith('VB')) {
      return findAgent(tokens, verb.head);
    }
  }

  return undefined;
}

/**
 * Find the patient (direct object) of a verb
 */
function findPatient(tokens: Token[], verbIndex: number): EventParticipant | undefined {
  // Look for dobj (direct object) or pobj through prep
  for (const token of tokens) {
    if (token.head === verbIndex && (token.dep === 'dobj' || token.dep === 'attr')) {
      const npTokens = expandNounPhrase(tokens, token.i);
      const text = npTokens.map(t => t.text).join(' ');

      return {
        role: 'patient',
        text,
        tokenIndices: npTokens.map(t => t.i),
      };
    }
  }

  // Check for passive subjects (which are semantic patients)
  for (const token of tokens) {
    if (token.head === verbIndex && token.dep === 'nsubjpass') {
      const npTokens = expandNounPhrase(tokens, token.i);
      const text = npTokens.map(t => t.text).join(' ');

      return {
        role: 'patient',
        text,
        tokenIndices: npTokens.map(t => t.i),
      };
    }
  }

  return undefined;
}

/**
 * Find location modifier
 */
function findLocation(tokens: Token[], verbIndex: number): EventParticipant | undefined {
  // Look for prepositional phrases with location prepositions
  const locationPreps = new Set(['in', 'at', 'on', 'to', 'from', 'into', 'onto', 'through', 'across', 'toward', 'towards']);

  for (const token of tokens) {
    if (token.head === verbIndex && token.dep === 'prep' && locationPreps.has(token.lemma.toLowerCase())) {
      // Find the object of the preposition
      for (const objToken of tokens) {
        if (objToken.head === token.i && objToken.dep === 'pobj') {
          const npTokens = expandNounPhrase(tokens, objToken.i);
          const text = token.text + ' ' + npTokens.map(t => t.text).join(' ');

          return {
            role: 'location',
            text,
            tokenIndices: [token.i, ...npTokens.map(t => t.i)],
          };
        }
      }
    }
  }

  return undefined;
}

/**
 * Find temporal modifier
 */
function findTime(tokens: Token[], verbIndex: number): EventParticipant | undefined {
  // Look for temporal adverbs or prepositional phrases
  const temporalPreps = new Set(['before', 'after', 'during', 'since', 'until', 'when']);
  const temporalAdvs = new Set(['then', 'now', 'soon', 'later', 'finally', 'suddenly', 'immediately']);

  for (const token of tokens) {
    // Check temporal adverbs
    if (token.head === verbIndex && token.dep === 'advmod' && temporalAdvs.has(token.lemma.toLowerCase())) {
      return {
        role: 'time',
        text: token.text,
        tokenIndices: [token.i],
      };
    }

    // Check temporal prepositions
    if (token.head === verbIndex && token.dep === 'prep' && temporalPreps.has(token.lemma.toLowerCase())) {
      for (const objToken of tokens) {
        if (objToken.head === token.i && objToken.dep === 'pobj') {
          const npTokens = expandNounPhrase(tokens, objToken.i);
          const text = token.text + ' ' + npTokens.map(t => t.text).join(' ');

          return {
            role: 'time',
            text,
            tokenIndices: [token.i, ...npTokens.map(t => t.i)],
          };
        }
      }
    }
  }

  return undefined;
}

/**
 * Expand a token to its full noun phrase
 */
function expandNounPhrase(tokens: Token[], headIndex: number): Token[] {
  const result: Token[] = [];
  const head = tokens.find(t => t.i === headIndex);

  if (!head) return result;

  // Collect all dependents of this head that form the NP
  const npDeps = new Set(['det', 'amod', 'compound', 'poss', 'nummod', 'nmod', 'appos']);

  for (const token of tokens) {
    if (token.head === headIndex && npDeps.has(token.dep)) {
      result.push(token);
    }
  }

  result.push(head);

  // Sort by token index
  result.sort((a, b) => a.i - b.i);

  return result;
}

/**
 * Extract events from a single sentence
 */
function extractEventsFromSentence(
  sentence: ParsedSentence,
  docId: string
): NarrativeEvent[] {
  const events: NarrativeEvent[] = [];
  const tokens = sentence.tokens;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (!isEventTrigger(token)) continue;

    const eventType = getEventTypeForVerb(token.lemma);

    // Skip OTHER events with no supersense (low value)
    if (eventType === 'OTHER') {
      const ss = getSupersense(token.lemma, 'VB');
      if (!ss) continue;
    }

    const participants: EventParticipant[] = [];

    // Find participants
    const agent = findAgent(tokens, i);
    if (agent) participants.push(agent);

    const patient = findPatient(tokens, i);
    if (patient) participants.push(patient);

    const location = findLocation(tokens, i);
    if (location) participants.push(location);

    const time = findTime(tokens, i);
    if (time) participants.push(time);

    // Calculate confidence based on completeness
    let confidence = 0.5; // Base
    if (agent) confidence += 0.2;
    if (patient) confidence += 0.15;
    if (location || time) confidence += 0.1;

    // Boost for supersense match
    const supersense = getSupersense(token.lemma, 'VB');
    if (supersense) confidence += 0.05;

    const event: NarrativeEvent = {
      id: uuid(),
      type: eventType,
      trigger: {
        lemma: token.lemma,
        text: token.text,
        tokenIndex: token.i,
        supersense: supersense as VerbSupersense | undefined,
      },
      participants,
      sentenceIndex: sentence.sentence_index,
      confidence: Math.min(confidence, 1.0),
      evidence: {
        doc_id: docId,
        span: {
          start: sentence.start,
          end: sentence.end,
          text: tokens.map(t => t.text).join(' '),
        },
        sentence_index: sentence.sentence_index,
        source: 'RULE',
      },
    };

    events.push(event);
  }

  return events;
}

/**
 * Link event participants to entities
 */
export function linkParticipantsToEntities(
  events: NarrativeEvent[],
  entities: Entity[]
): NarrativeEvent[] {
  // Build entity lookup by canonical name and aliases
  const entityLookup = new Map<string, string>();

  for (const entity of entities) {
    entityLookup.set(entity.canonical.toLowerCase(), entity.id);
    for (const alias of entity.aliases) {
      entityLookup.set(alias.toLowerCase(), entity.id);
    }
  }

  // Link participants
  return events.map(event => ({
    ...event,
    participants: event.participants.map(p => {
      const entityId = entityLookup.get(p.text.toLowerCase());
      return entityId ? { ...p, entityId } : p;
    }),
  }));
}

/**
 * Convert NarrativeEvent to ARES Event schema
 */
export function convertToSchemaEvent(narrEvent: NarrativeEvent): Event {
  const roles = narrEvent.participants.map(p => ({
    role: p.role,
    entity_id: p.entityId || `unresolved:${p.text}`,
  }));

  return {
    id: narrEvent.id,
    type: narrEvent.type,
    time: narrEvent.participants.find(p => p.role === 'time')?.text,
    place: narrEvent.participants.find(p => p.role === 'location')?.text,
    roles,
    evidence: [narrEvent.evidence],
    confidence: narrEvent.confidence,
  };
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Extract events from parsed sentences
 */
export function extractEventsFromParsed(
  sentences: ParsedSentence[],
  docId: string,
  entities?: Entity[]
): EventExtractionResult {
  let allEvents: NarrativeEvent[] = [];

  for (const sentence of sentences) {
    const sentenceEvents = extractEventsFromSentence(sentence, docId);
    allEvents.push(...sentenceEvents);
  }

  // Link to entities if provided
  if (entities && entities.length > 0) {
    allEvents = linkParticipantsToEntities(allEvents, entities);
  }

  // Compute stats
  const stats = {
    totalEvents: allEvents.length,
    byType: {} as Record<EventType, number>,
    withAgent: 0,
    withPatient: 0,
    avgConfidence: 0,
  };

  for (const event of allEvents) {
    stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;
    if (event.participants.some(p => p.role === 'agent')) stats.withAgent++;
    if (event.participants.some(p => p.role === 'patient')) stats.withPatient++;
    stats.avgConfidence += event.confidence;
  }

  if (allEvents.length > 0) {
    stats.avgConfidence /= allEvents.length;
  }

  logger.debug({
    msg: 'Event extraction complete',
    doc_id: docId,
    total_events: allEvents.length,
    with_agent: stats.withAgent,
    with_patient: stats.withPatient,
  });

  return { events: allEvents, stats };
}

/**
 * Main extraction function (legacy API)
 */
export async function extractEvents(
  text: string,
  docId: string
): Promise<Event[]> {
  // This function requires parsed sentences - it should be called from orchestrator
  // with parsed data. For standalone use, return empty.
  logger.debug({
    msg: 'extractEvents called without parsed data - use extractEventsFromParsed instead',
    doc_id: docId,
  });
  return [];
}

/**
 * Filter events by type
 */
export function filterEventsByType(
  events: NarrativeEvent[],
  types: EventType[]
): NarrativeEvent[] {
  const typeSet = new Set(types);
  return events.filter(e => typeSet.has(e.type));
}

/**
 * Filter events with specific participant roles
 */
export function filterEventsWithRole(
  events: NarrativeEvent[],
  role: 'agent' | 'patient' | 'location' | 'time'
): NarrativeEvent[] {
  return events.filter(e => e.participants.some(p => p.role === role));
}

/**
 * Get events involving a specific entity
 */
export function getEventsForEntity(
  events: NarrativeEvent[],
  entityId: string
): NarrativeEvent[] {
  return events.filter(e =>
    e.participants.some(p => p.entityId === entityId)
  );
}

/**
 * Get agent-patient pairs from events (useful for relation extraction)
 */
export function getAgentPatientPairs(
  events: NarrativeEvent[]
): Array<{
  eventId: string;
  eventType: EventType;
  agent?: EventParticipant;
  patient?: EventParticipant;
}> {
  return events.map(e => ({
    eventId: e.id,
    eventType: e.type,
    agent: e.participants.find(p => p.role === 'agent'),
    patient: e.participants.find(p => p.role === 'patient'),
  })).filter(pair => pair.agent || pair.patient);
}
