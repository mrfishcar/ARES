/**
 * State & Possession Assertion Extractor
 *
 * Extracts assertions from copula verbs (was/is) and possession verbs (had/has)
 * that describe entity states and properties rather than actions.
 *
 * Key patterns:
 * - "X was ADJ" → state_of(X, ADJ)
 * - "X was a NOUN" → is_a(X, NOUN)
 * - "X had NOUN" → has(X, NOUN)
 * - "X could VERB" → can(X, VERB)
 *
 * These assertions enrich entity pages but do NOT become timeline events
 * (states persist, they don't "happen").
 *
 * @module ir/state-assertion-extractor
 */

import type { ParsedSentence, Token, EntitySpan } from './predicate-extractor';
import type { Assertion, EvidenceSpan, Modality, Confidence } from './types';
import { v4 as uuid } from 'uuid';

// =============================================================================
// TYPES
// =============================================================================

export type StatePredicateType =
  | 'state_of'      // X was ADJ (emotional/physical state)
  | 'is_a'          // X was a NOUN (role/identity)
  | 'has'           // X had NOUN (possession)
  | 'can'           // X could VERB (capability)
  | 'trait'         // X was always ADJ (permanent trait)
  | 'location_at';  // X was in/at PLACE (static location)

export interface StateAssertion {
  id: string;
  subject: string;
  subjectEntityId?: string;
  predicate: StatePredicateType;
  object: string;
  objectEntityId?: string;
  /** Is this a negated state? ("was not happy") */
  negated: boolean;
  /** Temporal indicator if present */
  temporalModifier?: 'always' | 'never' | 'sometimes' | 'once' | 'still';
  /** Confidence score (0-1) */
  confidence: number;
  /** Evidence span */
  evidence: EvidenceSpan;
  /** Which pattern matched */
  pattern: string;
}

export interface StateExtractionStats {
  total: number;
  byPredicate: Record<StatePredicateType, number>;
  negated: number;
  withTemporalModifier: number;
}

export interface StateExtractionConfig {
  docId: string;
  /** Minimum confidence to emit (default: 0.5) */
  minConfidence?: number;
  /** Include negated states (default: true) */
  includeNegated?: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Copula verbs (to be) */
const COPULA_VERBS = new Set([
  'be', 'is', 'are', 'was', 'were', 'been', 'being',
  'am', "'s", "'re", "'m",
]);

/** Possession verbs */
const POSSESSION_VERBS = new Set([
  'have', 'has', 'had', 'having',
  'own', 'owns', 'owned', 'owning',
  'possess', 'possesses', 'possessed',
]);

/** Capability modals */
const CAPABILITY_MODALS = new Set([
  'can', 'could', 'may', 'might', 'able',
]);

/** Temporal modifiers that affect state interpretation */
const TEMPORAL_MODIFIERS: Record<string, StateAssertion['temporalModifier']> = {
  'always': 'always',
  'never': 'never',
  'sometimes': 'sometimes',
  'occasionally': 'sometimes',
  'once': 'once',
  'still': 'still',
  'forever': 'always',
  'ever': 'always',
};

/** Negation tokens */
const NEGATION_TOKENS = new Set([
  'not', "n't", 'never', 'no', 'none', 'neither', 'nor',
]);

/** State adjectives that indicate emotional/physical states */
const STATE_ADJECTIVES = new Set([
  // Emotional
  'happy', 'sad', 'angry', 'furious', 'afraid', 'scared', 'worried',
  'anxious', 'nervous', 'excited', 'thrilled', 'depressed', 'miserable',
  'content', 'satisfied', 'frustrated', 'annoyed', 'irritated', 'calm',
  'peaceful', 'tense', 'stressed', 'relaxed', 'relieved', 'shocked',
  'surprised', 'amazed', 'confused', 'puzzled', 'curious', 'interested',
  'bored', 'tired', 'exhausted', 'energetic', 'determined', 'motivated',
  'hopeful', 'hopeless', 'desperate', 'confident', 'insecure', 'proud',
  'ashamed', 'embarrassed', 'guilty', 'jealous', 'envious', 'grateful',
  'thankful', 'sorry', 'regretful', 'lonely', 'loved', 'hated',
  // Physical
  'hungry', 'thirsty', 'cold', 'hot', 'warm', 'sick', 'ill', 'healthy',
  'weak', 'strong', 'wounded', 'injured', 'hurt', 'dead', 'alive',
  'conscious', 'unconscious', 'awake', 'asleep', 'drunk', 'sober',
  // Descriptive
  'tall', 'short', 'young', 'old', 'beautiful', 'handsome', 'ugly',
  'rich', 'poor', 'wealthy', 'famous', 'unknown', 'powerful', 'powerless',
  'innocent', 'guilty', 'wise', 'foolish', 'clever', 'stupid', 'crazy',
  'mad', 'sane', 'brave', 'cowardly', 'loyal', 'treacherous', 'honest',
  'dishonest', 'kind', 'cruel', 'gentle', 'fierce', 'quiet', 'loud',
]);

/** Location prepositions that indicate static position */
const LOCATION_PREPS = new Set(['in', 'at', 'on', 'inside', 'within', 'near', 'beside']);

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get all children of a token by head index.
 */
function childrenOf(tokens: Token[], headIndex: number): Token[] {
  return tokens.filter(t => t.head === headIndex && t.i !== headIndex);
}

/**
 * Find first child with matching dependency.
 */
function findChild(tokens: Token[], headIndex: number, deps: string[]): Token | undefined {
  return childrenOf(tokens, headIndex).find(t => deps.includes(t.dep));
}

/**
 * Check if there's a negation among the children.
 */
function hasNegation(tokens: Token[], headIndex: number): boolean {
  const children = childrenOf(tokens, headIndex);
  return children.some(t => t.dep === 'neg' || NEGATION_TOKENS.has(t.text.toLowerCase()));
}

/**
 * Find temporal modifier among children.
 */
function findTemporalModifier(tokens: Token[], headIndex: number): StateAssertion['temporalModifier'] | undefined {
  const children = childrenOf(tokens, headIndex);
  for (const child of children) {
    const modifier = TEMPORAL_MODIFIERS[child.text.toLowerCase()];
    if (modifier) return modifier;
  }
  return undefined;
}

/**
 * Match token to entity span.
 */
function matchToEntity(
  token: Token,
  sentence: ParsedSentence,
  entitySpans: EntitySpan[]
): EntitySpan | undefined {
  // Calculate character position
  const tokenStart = token.start ?? (sentence.start + token.i);
  const tokenEnd = token.end ?? (tokenStart + token.text.length);

  // Find overlapping entity span
  return entitySpans.find(span =>
    (span.start <= tokenStart && span.end >= tokenEnd) ||
    (tokenStart <= span.start && tokenEnd >= span.end) ||
    (tokenStart >= span.start && tokenStart < span.end)
  );
}

/**
 * Get the full noun phrase text from a token.
 */
function getNounPhraseText(tokens: Token[], headIndex: number): string {
  const head = tokens[headIndex];
  if (!head) return '';

  const children = childrenOf(tokens, headIndex);
  const determiners = children.filter(t => ['det', 'poss', 'amod', 'compound'].includes(t.dep));

  // Sort by position and build phrase
  const phraseTokens = [...determiners, head].sort((a, b) => a.i - b.i);
  return phraseTokens.map(t => t.text).join(' ');
}

/**
 * Create evidence span from sentence and relevant tokens.
 */
function createEvidence(
  sentence: ParsedSentence,
  docId: string,
  tokens?: Token[]
): EvidenceSpan {
  // If specific tokens provided, use their range
  if (tokens && tokens.length > 0) {
    const sorted = [...tokens].sort((a, b) => a.i - b.i);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const start = first.start ?? sentence.start;
    const end = last.end ?? sentence.end;

    return {
      docId,
      sentenceIndex: sentence.sentence_index,
      charStart: start,
      charEnd: end,
      text: tokens.map(t => t.text).join(' '),
    };
  }

  // Fall back to full sentence
  return {
    docId,
    sentenceIndex: sentence.sentence_index,
    charStart: sentence.start,
    charEnd: sentence.end,
    text: sentence.tokens.map(t => t.text).join(' '),
  };
}

// =============================================================================
// PATTERN EXTRACTORS
// =============================================================================

/**
 * Pattern: "X was ADJ" (state/trait)
 * Example: "Sarah was furious", "Marcus was tall"
 */
function extractCopulaAdj(
  sentence: ParsedSentence,
  entitySpans: EntitySpan[],
  config: StateExtractionConfig
): StateAssertion[] {
  const results: StateAssertion[] = [];
  const tokens = sentence.tokens;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Find copula verb
    if (!COPULA_VERBS.has(token.lemma.toLowerCase())) continue;

    // Look for subject (nsubj)
    const subject = findChild(tokens, token.i, ['nsubj', 'nsubjpass']);
    if (!subject) continue;

    // Look for predicate adjective (acomp, attr)
    const predAdj = findChild(tokens, token.i, ['acomp', 'attr']);
    if (!predAdj) continue;

    // Skip if predicate is a noun (handled by is_a pattern)
    if (predAdj.pos === 'NOUN' || predAdj.pos === 'PROPN') continue;

    // Determine predicate type
    const adjLower = predAdj.lemma.toLowerCase();
    const temporal = findTemporalModifier(tokens, token.i);
    const predicateType: StatePredicateType = temporal === 'always' ? 'trait' : 'state_of';

    // Check for negation
    const negated = hasNegation(tokens, token.i);

    // Match to entities
    const subjectEntity = matchToEntity(subject, sentence, entitySpans);

    // Confidence based on pattern quality
    let confidence = 0.75;
    if (STATE_ADJECTIVES.has(adjLower)) confidence = 0.85;
    if (subjectEntity) confidence += 0.05;

    results.push({
      id: uuid(),
      subject: subjectEntity?.name || subject.text,
      subjectEntityId: subjectEntity?.entityId,
      predicate: predicateType,
      object: predAdj.text,
      negated,
      temporalModifier: temporal,
      confidence,
      evidence: createEvidence(sentence, config.docId, [subject, token, predAdj]),
      pattern: 'copula_adj',
    });
  }

  return results;
}

/**
 * Pattern: "X was a NOUN" (identity/role)
 * Example: "Marcus was a soldier", "She was the queen"
 */
function extractCopulaNoun(
  sentence: ParsedSentence,
  entitySpans: EntitySpan[],
  config: StateExtractionConfig
): StateAssertion[] {
  const results: StateAssertion[] = [];
  const tokens = sentence.tokens;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Find copula verb
    if (!COPULA_VERBS.has(token.lemma.toLowerCase())) continue;

    // Look for subject (nsubj)
    const subject = findChild(tokens, token.i, ['nsubj', 'nsubjpass']);
    if (!subject) continue;

    // Look for predicate noun (attr for "was a soldier")
    const predNoun = findChild(tokens, token.i, ['attr']);
    if (!predNoun) continue;

    // Only handle nouns
    if (predNoun.pos !== 'NOUN' && predNoun.pos !== 'PROPN') continue;

    // Check for negation
    const negated = hasNegation(tokens, token.i);
    const temporal = findTemporalModifier(tokens, token.i);

    // Match to entities
    const subjectEntity = matchToEntity(subject, sentence, entitySpans);
    const objectEntity = matchToEntity(predNoun, sentence, entitySpans);

    // Get full noun phrase for object
    const objectText = getNounPhraseText(tokens, predNoun.i);

    results.push({
      id: uuid(),
      subject: subjectEntity?.name || subject.text,
      subjectEntityId: subjectEntity?.entityId,
      predicate: 'is_a',
      object: objectText || predNoun.text,
      objectEntityId: objectEntity?.entityId,
      negated,
      temporalModifier: temporal,
      confidence: 0.8,
      evidence: createEvidence(sentence, config.docId, [subject, token, predNoun]),
      pattern: 'copula_noun',
    });
  }

  return results;
}

/**
 * Pattern: "X was in/at PLACE" (static location)
 * Example: "He was in the garden", "The book was on the table"
 */
function extractCopulaLocation(
  sentence: ParsedSentence,
  entitySpans: EntitySpan[],
  config: StateExtractionConfig
): StateAssertion[] {
  const results: StateAssertion[] = [];
  const tokens = sentence.tokens;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Find copula verb
    if (!COPULA_VERBS.has(token.lemma.toLowerCase())) continue;

    // Look for subject
    const subject = findChild(tokens, token.i, ['nsubj', 'nsubjpass']);
    if (!subject) continue;

    // Look for prepositional phrase (prep → pobj)
    const prep = findChild(tokens, token.i, ['prep']);
    if (!prep) continue;
    if (!LOCATION_PREPS.has(prep.text.toLowerCase())) continue;

    // Find object of preposition
    const pobj = findChild(tokens, prep.i, ['pobj']);
    if (!pobj) continue;

    // Check for negation
    const negated = hasNegation(tokens, token.i);
    const temporal = findTemporalModifier(tokens, token.i);

    // Match to entities
    const subjectEntity = matchToEntity(subject, sentence, entitySpans);
    const objectEntity = matchToEntity(pobj, sentence, entitySpans);

    // Get full location phrase
    const locationText = getNounPhraseText(tokens, pobj.i);

    results.push({
      id: uuid(),
      subject: subjectEntity?.name || subject.text,
      subjectEntityId: subjectEntity?.entityId,
      predicate: 'location_at',
      object: `${prep.text} ${locationText || pobj.text}`,
      objectEntityId: objectEntity?.entityId,
      negated,
      temporalModifier: temporal,
      confidence: 0.7,
      evidence: createEvidence(sentence, config.docId, [subject, token, prep, pobj]),
      pattern: 'copula_location',
    });
  }

  return results;
}

/**
 * Pattern: "X had NOUN" (possession)
 * Example: "Marcus had a cottage", "She had three children"
 */
function extractPossession(
  sentence: ParsedSentence,
  entitySpans: EntitySpan[],
  config: StateExtractionConfig
): StateAssertion[] {
  const results: StateAssertion[] = [];
  const tokens = sentence.tokens;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Find possession verb
    if (!POSSESSION_VERBS.has(token.lemma.toLowerCase())) continue;

    // Skip auxiliary uses ("had gone", "has been")
    if (token.dep === 'aux' || token.dep === 'auxpass') continue;

    // Look for subject
    const subject = findChild(tokens, token.i, ['nsubj', 'nsubjpass']);
    if (!subject) continue;

    // Look for direct object
    const dobj = findChild(tokens, token.i, ['dobj', 'obj']);
    if (!dobj) continue;

    // Check for negation
    const negated = hasNegation(tokens, token.i);
    const temporal = findTemporalModifier(tokens, token.i);

    // Match to entities
    const subjectEntity = matchToEntity(subject, sentence, entitySpans);
    const objectEntity = matchToEntity(dobj, sentence, entitySpans);

    // Get full noun phrase for object
    const objectText = getNounPhraseText(tokens, dobj.i);

    results.push({
      id: uuid(),
      subject: subjectEntity?.name || subject.text,
      subjectEntityId: subjectEntity?.entityId,
      predicate: 'has',
      object: objectText || dobj.text,
      objectEntityId: objectEntity?.entityId,
      negated,
      temporalModifier: temporal,
      confidence: 0.8,
      evidence: createEvidence(sentence, config.docId, [subject, token, dobj]),
      pattern: 'possession',
    });
  }

  return results;
}

/**
 * Pattern: "X could VERB" (capability)
 * Example: "He could swim", "She was able to fly"
 */
function extractCapability(
  sentence: ParsedSentence,
  entitySpans: EntitySpan[],
  config: StateExtractionConfig
): StateAssertion[] {
  const results: StateAssertion[] = [];
  const tokens = sentence.tokens;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Find capability modal
    if (!CAPABILITY_MODALS.has(token.lemma.toLowerCase())) continue;

    // For modals, find the main verb they modify
    // The main verb has the modal as its head and has 'xcomp' or similar dependency
    const mainVerb = tokens.find(t =>
      t.head === token.i &&
      t.pos === 'VERB' &&
      t.i !== token.i
    );
    if (!mainVerb) continue;

    // Look for subject - in modal constructions, subject is usually attached to the modal
    let subject = findChild(tokens, token.i, ['nsubj', 'nsubjpass']);
    // Fallback: check on main verb
    if (!subject) {
      subject = findChild(tokens, mainVerb.i, ['nsubj', 'nsubjpass']);
    }
    if (!subject) continue;

    // Check for negation
    const negated = hasNegation(tokens, token.i) || hasNegation(tokens, mainVerb.i);
    const temporal = findTemporalModifier(tokens, token.i);

    // Match to entities
    const subjectEntity = matchToEntity(subject, sentence, entitySpans);

    results.push({
      id: uuid(),
      subject: subjectEntity?.name || subject.text,
      subjectEntityId: subjectEntity?.entityId,
      predicate: 'can',
      object: mainVerb.lemma,
      negated,
      temporalModifier: temporal,
      confidence: 0.7,
      evidence: createEvidence(sentence, config.docId, [subject, token, mainVerb]),
      pattern: 'capability',
    });
  }

  return results;
}

// =============================================================================
// MAIN EXTRACTION
// =============================================================================

/**
 * Extract state and possession assertions from parsed sentences.
 *
 * @param sentences - Parsed sentences from spaCy
 * @param entitySpans - Entity spans from entity extraction
 * @param config - Extraction configuration
 * @returns State assertions and extraction stats
 */
export function extractStateAssertions(
  sentences: ParsedSentence[],
  entitySpans: EntitySpan[],
  config: StateExtractionConfig
): {
  assertions: StateAssertion[];
  stats: StateExtractionStats;
} {
  const minConfidence = config.minConfidence ?? 0.5;
  const includeNegated = config.includeNegated ?? true;

  const allAssertions: StateAssertion[] = [];
  const stats: StateExtractionStats = {
    total: 0,
    byPredicate: {
      state_of: 0,
      is_a: 0,
      has: 0,
      can: 0,
      trait: 0,
      location_at: 0,
    },
    negated: 0,
    withTemporalModifier: 0,
  };

  for (const sentence of sentences) {
    // Run all pattern extractors
    const assertions = [
      ...extractCopulaAdj(sentence, entitySpans, config),
      ...extractCopulaNoun(sentence, entitySpans, config),
      ...extractCopulaLocation(sentence, entitySpans, config),
      ...extractPossession(sentence, entitySpans, config),
      ...extractCapability(sentence, entitySpans, config),
    ];

    // Filter and collect
    for (const assertion of assertions) {
      // Filter by confidence
      if (assertion.confidence < minConfidence) continue;

      // Filter negated if disabled
      if (assertion.negated && !includeNegated) continue;

      allAssertions.push(assertion);

      // Update stats
      stats.total++;
      stats.byPredicate[assertion.predicate]++;
      if (assertion.negated) stats.negated++;
      if (assertion.temporalModifier) stats.withTemporalModifier++;
    }
  }

  return { assertions: allAssertions, stats };
}

/**
 * Convert StateAssertion to IR Assertion format.
 */
export function stateToIRAssertion(state: StateAssertion): Assertion {
  const now = new Date().toISOString();

  return {
    id: state.id,
    assertionType: 'DIRECT',
    subject: state.subjectEntityId || state.subject,
    predicate: state.predicate as any, // Map to PredicateType
    object: state.objectEntityId || state.object,
    evidence: [state.evidence],
    attribution: {
      source: 'NARRATOR',
      reliability: 0.9,
      isDialogue: false,
      isThought: false,
    },
    modality: state.negated ? 'NEGATED' : 'FACT',
    confidence: {
      extraction: state.confidence,
      identity: state.subjectEntityId ? 0.9 : 0.5,
      semantic: 0.8,
      temporal: 0.5,
      composite: state.confidence * 0.85,
    },
    createdAt: now,
    compiler_pass: `state_extractor:${state.pattern}`,
  };
}

// Types are exported where defined
