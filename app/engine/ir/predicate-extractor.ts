/**
 * Predicate Candidate Extractor - "Verb Exhaust Capture"
 *
 * Extracts predicate candidates from parsed sentences using dependency patterns.
 * This is NOT meaning extraction - it's syntactic signal harvesting.
 *
 * Rules:
 * 1. Basic SVO from ROOT verbs (nsubj → VERB → dobj)
 * 2. Conjunction verbs inherit subject ("entered and sat")
 * 3. Verb particles normalize to phrasal verbs ("sat down" → "sit_down")
 * 4. Prepositional objects for movement verbs ("went to X")
 *
 * Output: PredicateCandidates that feed into IR Assertions
 *
 * @module ir/predicate-extractor
 */

import type { EvidenceSpan, Assertion, Modality, Confidence } from './types';
import { v4 as uuid } from 'uuid';

// =============================================================================
// TYPES
// =============================================================================

/** Token from spaCy parse */
export interface Token {
  i: number;
  text: string;
  pos: string;
  tag?: string;
  dep: string;
  head: number;
  lemma: string;
  ent?: string;
  start?: number;
  end?: number;
}

/** Parsed sentence from parser service */
export interface ParsedSentence {
  sentence_index: number;
  start: number;
  end: number;
  tokens: Token[];
}

/** Entity span from extraction */
export interface EntitySpan {
  entityId: string;
  name: string;
  start: number;
  end: number;
  type?: string;
}

/** Raw predicate candidate before entity resolution */
export interface PredicateCandidate {
  subjectToken?: Token;
  subjectEntityId?: string;
  subjectText: string;
  predicate: string;
  predicateLemma: string;
  objectToken?: Token;
  objectEntityId?: string;
  objectText?: string;
  confidence: number;
  negated: boolean;
  tense: 'past' | 'present' | 'future' | 'unknown';
  evidence: EvidenceSpan;
  rule: string; // which rule produced this
}

/** Configuration for extraction */
export interface ExtractorConfig {
  docId: string;
  /** Minimum confidence to emit */
  minConfidence?: number;
  /** Include unresolved subjects (pronouns, etc.) */
  includeUnresolved?: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Verbs that take prepositional objects as destinations */
const MOVEMENT_VERBS = new Set([
  'go', 'went', 'gone', 'going',
  'come', 'came', 'coming',
  'enter', 'entered', 'entering',
  'leave', 'left', 'leaving',
  'arrive', 'arrived', 'arriving',
  'travel', 'traveled', 'travelling',
  'move', 'moved', 'moving',
  'walk', 'walked', 'walking',
  'run', 'ran', 'running',
  'drive', 'drove', 'driving',
  'fly', 'flew', 'flying',
  'return', 'returned', 'returning',
  'stay', 'stayed', 'staying',
  'live', 'lived', 'living',
]);

/** Prepositions that indicate destination */
const DESTINATION_PREPS = new Set(['to', 'into', 'in', 'at', 'toward', 'towards']);

/** Prepositions that indicate origin */
const ORIGIN_PREPS = new Set(['from', 'out', 'away']);

/** Negation tokens */
const NEGATION_TOKENS = new Set(['not', "n't", 'never', 'no', 'none', 'nobody', 'nothing', 'nowhere']);

/** Subject dependency types */
const SUBJ_DEPS = ['nsubj', 'nsubjpass', 'csubj', 'csubjpass'];

/** Object dependency types */
const OBJ_DEPS = ['dobj', 'obj', 'attr', 'oprd', 'acomp'];

// =============================================================================
// HELPER FUNCTIONS
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
 * Find all children with matching dependencies.
 */
function findChildren(tokens: Token[], headIndex: number, deps: string[]): Token[] {
  return childrenOf(tokens, headIndex).filter(t => deps.includes(t.dep));
}

/**
 * Check if token is a verb.
 */
function isVerb(t: Token): boolean {
  return t.pos === 'VERB' || t.pos === 'AUX';
}

/**
 * Check if token is negated.
 */
function isNegated(tokens: Token[], verbIndex: number): boolean {
  const children = childrenOf(tokens, verbIndex);
  return children.some(c => c.dep === 'neg' || NEGATION_TOKENS.has(c.text.toLowerCase()));
}

/**
 * Infer tense from verb tag.
 */
function inferTense(verb: Token): 'past' | 'present' | 'future' | 'unknown' {
  const tag = verb.tag || '';
  if (tag.includes('VBD') || tag.includes('VBN')) return 'past';
  if (tag.includes('VBZ') || tag.includes('VBP') || tag.includes('VBG')) return 'present';
  // Future is usually "will + verb" - check for aux
  return 'unknown';
}

/**
 * Normalize predicate with verb particles.
 *
 * "sat down" → "sit_down"
 * "gave up" → "give_up"
 */
function normalizePredicate(tokens: Token[], verb: Token): { lemma: string; full: string } {
  const prt = findChild(tokens, verb.i, ['prt']);
  const lemma = verb.lemma.toLowerCase();

  if (prt) {
    const prtText = prt.text.toLowerCase();
    return {
      lemma,
      full: `${lemma}_${prtText}`,
    };
  }

  return { lemma, full: lemma };
}

/**
 * Get the full noun phrase text for a token.
 */
function getNounPhraseText(tokens: Token[], head: Token): string {
  // Get determiners, adjectives, compound nouns
  const children = childrenOf(tokens, head.i);
  const modifiers = children.filter(c =>
    ['det', 'amod', 'compound', 'poss', 'nn'].includes(c.dep)
  );

  // Sort by position
  const allTokens = [head, ...modifiers].sort((a, b) => a.i - b.i);
  return allTokens.map(t => t.text).join(' ');
}

/**
 * Try to resolve token to entity ID using entity spans.
 */
function resolveToEntity(
  token: Token,
  sentenceStart: number,
  entitySpans: EntitySpan[]
): { entityId?: string; text: string } {
  // Token's character position in document
  const tokenStart = sentenceStart + (token.start ?? 0);
  const tokenEnd = sentenceStart + (token.end ?? token.start ?? 0 + token.text.length);

  // Find overlapping entity span
  for (const span of entitySpans) {
    if (span.start <= tokenStart && span.end >= tokenEnd) {
      return { entityId: span.entityId, text: span.name };
    }
    // Partial overlap - token is part of entity
    if (tokenStart >= span.start && tokenStart < span.end) {
      return { entityId: span.entityId, text: span.name };
    }
  }

  return { text: token.text };
}

// =============================================================================
// EXTRACTION RULES
// =============================================================================

/**
 * Rule 1: Extract SVO from ROOT verb.
 *
 * Pattern: nsubj → VERB(ROOT) → dobj
 * Example: "Marcus entered the office"
 */
function extractFromRootVerb(
  sentence: ParsedSentence,
  verb: Token,
  entitySpans: EntitySpan[],
  docId: string,
  inheritedSubj?: Token
): PredicateCandidate | null {
  const tokens = sentence.tokens;

  // Find subject
  let subj = findChild(tokens, verb.i, SUBJ_DEPS);

  // Inherit subject if this is a conj verb
  if (!subj && inheritedSubj) {
    subj = inheritedSubj;
  }

  // Must have subject
  if (!subj) {
    return null;
  }

  // Find object
  const obj = findChild(tokens, verb.i, OBJ_DEPS);

  // Normalize predicate
  const { lemma, full } = normalizePredicate(tokens, verb);

  // Check negation
  const negated = isNegated(tokens, verb.i);

  // Infer tense
  const tense = inferTense(verb);

  // Resolve entities
  const subjResolved = resolveToEntity(subj, sentence.start, entitySpans);
  const objResolved = obj ? resolveToEntity(obj, sentence.start, entitySpans) : undefined;

  // Calculate confidence
  let confidence = 0.65;
  if (objResolved) confidence += 0.1;
  if (subj.pos === 'PRON' && !subjResolved.entityId) confidence -= 0.2;
  if (negated) confidence -= 0.1;

  // Build evidence span
  const evidence: EvidenceSpan = {
    docId,
    charStart: sentence.start,
    charEnd: sentence.end,
    text: tokens.map(t => t.text).join(' '),
    sentenceIndex: sentence.sentence_index,
  };

  return {
    subjectToken: subj,
    subjectEntityId: subjResolved.entityId,
    subjectText: subjResolved.text || getNounPhraseText(tokens, subj),
    predicate: full,
    predicateLemma: lemma,
    objectToken: obj,
    objectEntityId: objResolved?.entityId,
    objectText: objResolved?.text || (obj ? getNounPhraseText(tokens, obj) : undefined),
    confidence,
    negated,
    tense,
    evidence,
    rule: 'SVO_ROOT',
  };
}

/**
 * Rule 4: Extract prepositional object for movement verbs.
 *
 * Pattern: VERB(movement) → prep → pobj
 * Example: "went to the station"
 */
function extractPrepObject(
  sentence: ParsedSentence,
  verb: Token,
  subj: Token,
  entitySpans: EntitySpan[],
  docId: string
): PredicateCandidate | null {
  const tokens = sentence.tokens;

  // Only for movement verbs without direct object
  const lemmaLower = verb.lemma.toLowerCase();
  if (!MOVEMENT_VERBS.has(lemmaLower)) {
    return null;
  }

  // Check if already has direct object
  const dobj = findChild(tokens, verb.i, OBJ_DEPS);
  if (dobj) {
    return null; // Already handled by Rule 1
  }

  // Find prep children
  const preps = findChildren(tokens, verb.i, ['prep']);

  for (const prep of preps) {
    const prepText = prep.text.toLowerCase();

    // Find pobj of prep
    const pobj = findChild(tokens, prep.i, ['pobj']);
    if (!pobj) continue;

    // Determine if destination or origin
    let predicateSuffix = '';
    if (DESTINATION_PREPS.has(prepText)) {
      predicateSuffix = '_to';
    } else if (ORIGIN_PREPS.has(prepText)) {
      predicateSuffix = '_from';
    } else {
      predicateSuffix = `_${prepText}`;
    }

    // Resolve entities
    const subjResolved = resolveToEntity(subj, sentence.start, entitySpans);
    const objResolved = resolveToEntity(pobj, sentence.start, entitySpans);

    // Build predicate
    const predicate = `${verb.lemma.toLowerCase()}${predicateSuffix}`;

    // Calculate confidence
    let confidence = 0.60;
    if (objResolved.entityId) confidence += 0.1;
    if (subj.pos === 'PRON' && !subjResolved.entityId) confidence -= 0.2;

    const evidence: EvidenceSpan = {
      docId,
      charStart: sentence.start,
      charEnd: sentence.end,
      text: tokens.map(t => t.text).join(' '),
      sentenceIndex: sentence.sentence_index,
    };

    return {
      subjectToken: subj,
      subjectEntityId: subjResolved.entityId,
      subjectText: subjResolved.text || getNounPhraseText(tokens, subj),
      predicate,
      predicateLemma: verb.lemma.toLowerCase(),
      objectToken: pobj,
      objectEntityId: objResolved.entityId,
      objectText: objResolved.text || getNounPhraseText(tokens, pobj),
      confidence,
      negated: isNegated(tokens, verb.i),
      tense: inferTense(verb),
      evidence,
      rule: 'PREP_MOVEMENT',
    };
  }

  return null;
}

// =============================================================================
// MAIN EXTRACTOR
// =============================================================================

/**
 * Extract predicate candidates from a single sentence.
 */
export function extractPredicatesFromSentence(
  sentence: ParsedSentence,
  entitySpans: EntitySpan[],
  config: ExtractorConfig
): PredicateCandidate[] {
  const candidates: PredicateCandidate[] = [];
  const tokens = sentence.tokens;
  const minConf = config.minConfidence ?? 0.3;

  // Find all verbs
  const verbs = tokens.filter(isVerb);

  // Track which subjects we've used (for conjunction inheritance)
  const verbSubjects = new Map<number, Token>();

  // First pass: ROOT verbs (Rule 1)
  for (const verb of verbs) {
    if (verb.dep === 'ROOT') {
      const candidate = extractFromRootVerb(
        sentence,
        verb,
        entitySpans,
        config.docId
      );
      if (candidate && candidate.confidence >= minConf) {
        candidates.push(candidate);
        if (candidate.subjectToken) {
          verbSubjects.set(verb.i, candidate.subjectToken);
        }
      }

      // Rule 4: Try prep object for movement verbs
      if (candidate?.subjectToken) {
        const prepCandidate = extractPrepObject(
          sentence,
          verb,
          candidate.subjectToken,
          entitySpans,
          config.docId
        );
        if (prepCandidate && prepCandidate.confidence >= minConf) {
          candidates.push(prepCandidate);
        }
      }
    }
  }

  // Second pass: Conjunction verbs (Rule 2)
  for (const verb of verbs) {
    if (verb.dep === 'conj') {
      // Find head verb
      const headVerb = tokens.find(t => t.i === verb.head && isVerb(t));
      if (!headVerb) continue;

      // Inherit subject from head
      const inheritedSubj = verbSubjects.get(headVerb.i);
      if (!inheritedSubj) {
        // Try to find subject of head
        const headSubj = findChild(tokens, headVerb.i, SUBJ_DEPS);
        if (headSubj) {
          verbSubjects.set(headVerb.i, headSubj);
        }
      }

      const candidate = extractFromRootVerb(
        sentence,
        verb,
        entitySpans,
        config.docId,
        verbSubjects.get(headVerb.i)
      );

      if (candidate && candidate.confidence >= minConf) {
        candidate.rule = 'CONJ_VERB';
        candidates.push(candidate);

        // Also try prep object for conjunction verbs
        if (candidate.subjectToken) {
          const prepCandidate = extractPrepObject(
            sentence,
            verb,
            candidate.subjectToken,
            entitySpans,
            config.docId
          );
          if (prepCandidate && prepCandidate.confidence >= minConf) {
            prepCandidate.rule = 'CONJ_PREP_MOVEMENT';
            candidates.push(prepCandidate);
          }
        }
      }
    }
  }

  return candidates;
}

/**
 * Extract predicate candidates from all sentences.
 */
export function extractPredicates(
  sentences: ParsedSentence[],
  entitySpans: EntitySpan[],
  config: ExtractorConfig
): PredicateCandidate[] {
  const allCandidates: PredicateCandidate[] = [];

  for (const sentence of sentences) {
    const candidates = extractPredicatesFromSentence(sentence, entitySpans, config);
    allCandidates.push(...candidates);
  }

  return allCandidates;
}

// =============================================================================
// CONVERSION TO IR ASSERTIONS
// =============================================================================

/**
 * Convert predicate candidate to IR Assertion.
 */
export function candidateToAssertion(candidate: PredicateCandidate): Assertion {
  const now = new Date().toISOString();

  // Determine modality
  let modality: Modality = 'FACT';
  if (candidate.negated) {
    modality = 'NEGATED';
  }

  // Build confidence
  const confidence: Confidence = {
    extraction: candidate.confidence,
    identity: candidate.subjectEntityId ? 0.8 : 0.5,
    semantic: 0.6,
    temporal: 0.5,
    composite: candidate.confidence * 0.8,
  };

  return {
    id: uuid(),
    assertionType: 'DIRECT',
    subject: candidate.subjectEntityId ?? candidate.subjectText,
    predicate: candidate.predicate as any,
    object: candidate.objectEntityId ?? candidate.objectText ?? null,
    evidence: [candidate.evidence],
    attribution: {
      source: 'NARRATOR',
      reliability: 'MEDIUM',
    },
    modality,
    confidence,
    createdAt: now,
    compiler_pass: `predicate_extractor:${candidate.rule}`,
  };
}

/**
 * Extract predicates and convert to assertions.
 */
export function extractAssertionsFromSentences(
  sentences: ParsedSentence[],
  entitySpans: EntitySpan[],
  config: ExtractorConfig
): Assertion[] {
  const candidates = extractPredicates(sentences, entitySpans, config);
  return candidates.map(candidateToAssertion);
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  MOVEMENT_VERBS,
  DESTINATION_PREPS,
  ORIGIN_PREPS,
  NEGATION_TOKENS,
};
