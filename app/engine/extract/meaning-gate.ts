/**
 * Meaning Gate - Structural Eligibility Checker
 *
 * The Meaning Gate answers: "Is this span grammatically capable of being a referent?"
 *
 * A referent is something that can be referred back to with a pronoun or
 * definite description. The gate uses ONLY grammatical structure, not blocklists.
 *
 * Closed-class word sets (prepositions, determiners, modals, pronouns, conjunctions)
 * are allowed as they are finite grammatical categories.
 */

import type { MentionCandidate } from './mention-candidate';
import type { Token } from './parse-types';

// ============================================================================
// VERDICT TYPES
// ============================================================================

export type GateVerdict = 'NON_ENTITY' | 'CONTEXT_ONLY' | 'DURABLE_CANDIDATE';

/**
 * Reasons for NON_ENTITY rejection (structural failures)
 */
export type RejectReason =
  | 'empty_span'
  | 'too_short'
  | 'verb_phrase'
  | 'verb_lead'
  | 'adverb_lead'
  | 'pp_lead_no_object'
  | 'closed_class_only'
  | 'modal_lead'
  | 'conjunction_lead'
  | 'subordinator_lead'
  | 'determiner_only'
  | 'incomplete_constituent'
  | 'pronoun_only'
  | 'wh_word'
  | 'discourse_marker'
  | 'interjection'
  | 'predicate_adjective'
  | 'compound_fragment'
  | 'lowercase_non_noun'
  | 'numeric_only';

/**
 * Reasons for CONTEXT_ONLY (valid mention but not entity-worthy)
 */
export type ContextOnlyReason =
  | 'vocative'
  | 'theme_slogan'
  | 'imperative_address'
  | 'single_token_sentence_initial_unverified'
  | 'role_without_identity'
  | 'generic_descriptor';

export interface GateResult {
  verdict: GateVerdict;
  reason?: RejectReason | ContextOnlyReason;
  /** For PP-led spans, we may extract the NP object as valid */
  extractedNPObject?: MentionCandidate;
}

// ============================================================================
// CLOSED-CLASS WORD SETS (finite grammatical categories - allowed)
// ============================================================================

/** Prepositions - closed class */
const PREPOSITIONS = new Set([
  'in', 'on', 'at', 'by', 'with', 'from', 'to', 'of', 'for', 'about',
  'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'among', 'under', 'over', 'into', 'onto', 'upon', 'within', 'without',
  'against', 'along', 'around', 'behind', 'beneath', 'beside', 'besides',
  'beyond', 'despite', 'except', 'inside', 'outside', 'toward', 'towards',
  'underneath', 'unlike', 'until', 'via', 'near', 'across', 'past',
  'like', 'off', 'out', 'up', 'down', 'since', 'per',
]);

/** Determiners - closed class */
const DETERMINERS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those',
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'some', 'any', 'no', 'every', 'each', 'all', 'both', 'few', 'many',
  'much', 'several', 'most', 'other', 'another', 'such', 'what', 'which',
]);

/** Modal verbs - closed class */
const MODALS = new Set([
  'can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would',
  'ought', 'need', 'dare',
]);

/** Pronouns - closed class */
const PRONOUNS = new Set([
  'i', 'me', 'my', 'mine', 'myself',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself',
  'we', 'us', 'our', 'ours', 'ourselves',
  'they', 'them', 'their', 'theirs', 'themselves',
  'who', 'whom', 'whose', 'which', 'what', 'that',
  'whoever', 'whomever', 'whatever', 'whichever',
  'anyone', 'someone', 'everyone', 'no one', 'nobody',
  'anybody', 'somebody', 'everybody',
  'anything', 'something', 'everything', 'nothing',
  'one', 'ones', 'none',
  'this', 'that', 'these', 'those',
  // Reflexive/emphatic
  'oneself',
]);

/** Coordinating conjunctions - closed class */
const COORDINATING_CONJ = new Set([
  'and', 'or', 'but', 'nor', 'yet', 'so', 'for',
]);

/** Subordinating conjunctions - closed class */
const SUBORDINATING_CONJ = new Set([
  'because', 'since', 'unless', 'until', 'while', 'although', 'though',
  'if', 'when', 'where', 'whereas', 'whenever', 'wherever', 'whether',
  'after', 'before', 'as', 'once', 'than', 'that', 'lest',
]);

/** Discourse markers - closed class */
const DISCOURSE_MARKERS = new Set([
  'however', 'therefore', 'moreover', 'furthermore', 'nevertheless',
  'thus', 'hence', 'consequently', 'accordingly',
  'indeed', 'certainly', 'surely', 'obviously', 'clearly',
  'perhaps', 'possibly', 'probably', 'likely',
  'meanwhile', 'otherwise', 'instead', 'besides',
  'well', 'now', 'anyway', 'actually', 'basically', 'honestly',
  'frankly', 'seriously', 'literally', 'apparently',
]);

/** Interjections - closed class */
const INTERJECTIONS = new Set([
  'oh', 'ah', 'uh', 'um', 'er', 'erm', 'hmm', 'hm', 'mm',
  'wow', 'oops', 'ouch', 'hey', 'hi', 'hello', 'bye', 'goodbye',
  'yes', 'no', 'yeah', 'yep', 'nope', 'nah', 'okay', 'ok',
  'please', 'thanks', 'sorry', 'pardon', 'huh', 'eh',
  'alas', 'bravo', 'cheers', 'damn', 'darn', 'geez', 'gosh',
  'hooray', 'hurrah', 'phew', 'psst', 'shh', 'ugh', 'whew', 'yikes',
]);

/** WH-words that aren't valid entity referents on their own */
const WH_WORDS = new Set([
  'who', 'whom', 'whose', 'which', 'what', 'where', 'when', 'why', 'how',
  'whoever', 'whomever', 'whatever', 'whichever', 'wherever', 'whenever',
]);

/** Role nouns that need identity binding (CONTEXT_ONLY unless qualified) */
const ROLE_NOUNS = new Set([
  'detective', 'coach', 'nurse', 'doctor', 'professor', 'teacher',
  'principal', 'officer', 'soldier', 'guard', 'captain', 'general',
  'manager', 'director', 'president', 'chairman', 'secretary',
  'lawyer', 'judge', 'politician', 'minister', 'bishop', 'priest',
  'king', 'queen', 'prince', 'princess', 'lord', 'lady',
  'man', 'woman', 'boy', 'girl', 'child', 'person', 'people',
  'stranger', 'visitor', 'traveler', 'messenger', 'servant',
  'friend', 'enemy', 'neighbor', 'colleague', 'partner',
]);

// ============================================================================
// POS-BASED CHECKS
// ============================================================================

/** POS tags that indicate verb-like tokens */
const VERB_POS = new Set(['VERB', 'AUX']);

/** POS tags that indicate adverb-like tokens */
const ADV_POS = new Set(['ADV']);

/** POS tags that indicate adjective */
const ADJ_POS = new Set(['ADJ']);

/** POS tags that can be heads of entity-referring NPs */
const NOMINAL_POS = new Set(['NOUN', 'PROPN', 'NUM']);

// ============================================================================
// MEANING GATE IMPLEMENTATION
// ============================================================================

/**
 * Main Meaning Gate function
 *
 * Returns verdict on whether a mention candidate is structurally valid.
 */
export function applyMeaningGate(
  candidate: MentionCandidate,
  fullText: string
): GateResult {
  const { tokens, normalized, isSentenceInitial } = candidate;

  // ========================================
  // PHASE 1: Empty/trivial rejection
  // ========================================

  if (!normalized || normalized.trim().length === 0) {
    return { verdict: 'NON_ENTITY', reason: 'empty_span' };
  }

  if (normalized.length < 2) {
    return { verdict: 'NON_ENTITY', reason: 'too_short' };
  }

  // All-numeric (except for dates, handled elsewhere)
  if (/^\d+$/.test(normalized)) {
    return { verdict: 'NON_ENTITY', reason: 'numeric_only' };
  }

  // ========================================
  // PHASE 2: Token-based analysis
  // ========================================

  if (tokens.length === 0) {
    // No tokens but has text - use surface analysis
    return analyzeByText(normalized, isSentenceInitial);
  }

  const firstToken = tokens[0];
  const lastToken = tokens[tokens.length - 1];
  const firstLower = firstToken.text.toLowerCase();
  const allLower = tokens.map(t => t.text.toLowerCase());

  // ----------------------------------------
  // 2a: Pronoun-only spans
  // ----------------------------------------
  if (tokens.length === 1 && PRONOUNS.has(firstLower)) {
    return { verdict: 'NON_ENTITY', reason: 'pronoun_only' };
  }

  // ----------------------------------------
  // 2b: WH-word only
  // ----------------------------------------
  if (tokens.length === 1 && WH_WORDS.has(firstLower)) {
    return { verdict: 'NON_ENTITY', reason: 'wh_word' };
  }

  // ----------------------------------------
  // 2c: Discourse marker only
  // ----------------------------------------
  if (tokens.length === 1 && DISCOURSE_MARKERS.has(firstLower)) {
    return { verdict: 'NON_ENTITY', reason: 'discourse_marker' };
  }

  // ----------------------------------------
  // 2d: Interjection only
  // ----------------------------------------
  if (tokens.length === 1 && INTERJECTIONS.has(firstLower)) {
    return { verdict: 'NON_ENTITY', reason: 'interjection' };
  }

  // ----------------------------------------
  // 2e: Verb-led spans (verb phrase fragments)
  // ----------------------------------------
  if (firstToken.pos && VERB_POS.has(firstToken.pos)) {
    // Exception: past participles used as adjectives ("Wounded soldier")
    // Check if followed by a noun
    if (tokens.length > 1 && hasNominalHead(tokens.slice(1))) {
      // This might be an adjective + noun pattern, allow it
    } else {
      return { verdict: 'NON_ENTITY', reason: 'verb_lead' };
    }
  }

  // All tokens are verbs
  if (tokens.length > 0 && tokens.every(t => t.pos && VERB_POS.has(t.pos))) {
    return { verdict: 'NON_ENTITY', reason: 'verb_phrase' };
  }

  // ----------------------------------------
  // 2f: Modal-led spans
  // ----------------------------------------
  if (MODALS.has(firstLower)) {
    return { verdict: 'NON_ENTITY', reason: 'modal_lead' };
  }

  // ----------------------------------------
  // 2g: Adverb-led spans (discourse fragments)
  // ----------------------------------------
  if (firstToken.pos && ADV_POS.has(firstToken.pos)) {
    // Exception: "nearly home" where "home" is the head
    if (!hasNominalHead(tokens)) {
      return { verdict: 'NON_ENTITY', reason: 'adverb_lead' };
    }
  }

  // ----------------------------------------
  // 2h: Conjunction-led spans
  // ----------------------------------------
  if (COORDINATING_CONJ.has(firstLower)) {
    return { verdict: 'NON_ENTITY', reason: 'conjunction_lead' };
  }

  if (SUBORDINATING_CONJ.has(firstLower)) {
    return { verdict: 'NON_ENTITY', reason: 'subordinator_lead' };
  }

  // ----------------------------------------
  // 2i: Preposition-led spans
  // ----------------------------------------
  if (PREPOSITIONS.has(firstLower)) {
    // PP-led: the preposition is not an entity, but the NP inside may be
    const npObject = extractPPObject(candidate);
    if (npObject) {
      return {
        verdict: 'NON_ENTITY',
        reason: 'pp_lead_no_object',
        extractedNPObject: npObject,
      };
    }
    return { verdict: 'NON_ENTITY', reason: 'pp_lead_no_object' };
  }

  // ----------------------------------------
  // 2j: Determiner-only
  // ----------------------------------------
  if (tokens.length === 1 && DETERMINERS.has(firstLower)) {
    return { verdict: 'NON_ENTITY', reason: 'determiner_only' };
  }

  // ----------------------------------------
  // 2k: All closed-class words
  // ----------------------------------------
  if (isAllClosedClass(allLower)) {
    return { verdict: 'NON_ENTITY', reason: 'closed_class_only' };
  }

  // ----------------------------------------
  // 2l: Predicate adjective (sentence-initial ADJ without noun)
  // ----------------------------------------
  if (
    tokens.length === 1 &&
    firstToken.pos &&
    ADJ_POS.has(firstToken.pos) &&
    isSentenceInitial
  ) {
    // Single adjective at sentence start - likely "Dead, he realized..."
    return { verdict: 'NON_ENTITY', reason: 'predicate_adjective' };
  }

  // ========================================
  // PHASE 3: Structural checks
  // ========================================

  // ----------------------------------------
  // 3a: Incomplete compound (fragment of larger compound)
  // ----------------------------------------
  if (isIncompleteCompound(candidate, fullText)) {
    return { verdict: 'NON_ENTITY', reason: 'compound_fragment' };
  }

  // ----------------------------------------
  // 3b: Incomplete constituent (no nominal head)
  // ----------------------------------------
  if (!hasNominalHead(tokens)) {
    // No noun/proper noun as head - probably not an entity
    // Exception: capitalized words that might be proper nouns mistagged
    const hasCapitalized = tokens.some(t => /^[A-Z]/.test(t.text));
    if (!hasCapitalized) {
      return { verdict: 'NON_ENTITY', reason: 'incomplete_constituent' };
    }
  }

  // ----------------------------------------
  // 3c: Lowercase non-noun fragments
  // ----------------------------------------
  if (isLowercaseNonNoun(tokens)) {
    return { verdict: 'NON_ENTITY', reason: 'lowercase_non_noun' };
  }

  // ========================================
  // PHASE 4: Context-only checks
  // ========================================

  // ----------------------------------------
  // 4a: Role nouns without identity
  // ----------------------------------------
  if (tokens.length === 1 && ROLE_NOUNS.has(firstLower)) {
    // "Detective" alone - might be a role, not an entity
    // Exception: if capitalized mid-sentence, might be a name
    if (isSentenceInitial || firstToken.text === firstToken.text.toLowerCase()) {
      return { verdict: 'CONTEXT_ONLY', reason: 'role_without_identity' };
    }
  }

  // ----------------------------------------
  // 4b: Single-token sentence-initial (needs verification)
  // ----------------------------------------
  if (tokens.length === 1 && isSentenceInitial) {
    // Single capitalized word at sentence start - might just be capitalized
    // because of position, not because it's a proper noun
    const hasStrongNER = candidate.nerHint &&
      ['PERSON', 'ORG', 'GPE', 'LOC'].includes(candidate.nerHint);

    if (!hasStrongNER) {
      // Not rejected, but flagged for extra scrutiny
      return {
        verdict: 'CONTEXT_ONLY',
        reason: 'single_token_sentence_initial_unverified'
      };
    }
  }

  // ----------------------------------------
  // 4c: Theme/slogan patterns (quoted titles, imperative phrases)
  // ----------------------------------------
  if (isThemeOrSlogan(normalized, tokens)) {
    return { verdict: 'CONTEXT_ONLY', reason: 'theme_slogan' };
  }

  // ========================================
  // PHASE 5: PASS - eligible for accumulation
  // ========================================

  return { verdict: 'DURABLE_CANDIDATE' };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if tokens have a nominal head (NOUN, PROPN, or NUM)
 */
function hasNominalHead(tokens: Token[]): boolean {
  return tokens.some(t => t.pos && NOMINAL_POS.has(t.pos));
}

/**
 * Check if all tokens are closed-class words
 */
function isAllClosedClass(words: string[]): boolean {
  const allClosed = (word: string): boolean => {
    return PREPOSITIONS.has(word) ||
      DETERMINERS.has(word) ||
      MODALS.has(word) ||
      PRONOUNS.has(word) ||
      COORDINATING_CONJ.has(word) ||
      SUBORDINATING_CONJ.has(word) ||
      DISCOURSE_MARKERS.has(word) ||
      INTERJECTIONS.has(word);
  };

  return words.every(allClosed);
}

/**
 * Check if this is an incomplete compound (e.g., "Springs" from "Eulina Springs")
 */
function isIncompleteCompound(
  candidate: MentionCandidate,
  fullText: string
): boolean {
  const { start, end, tokens } = candidate;
  if (tokens.length !== 1) return false;

  const token = tokens[0];

  // Check if token is the second part of a compound
  if (token.dep === 'compound') {
    return true; // This token modifies something else
  }

  // Check for preceding capitalized word that might be the compound head
  const before = fullText.slice(Math.max(0, start - 30), start);
  const precedingWords = before.match(/[A-Z][a-z]+\s*$/);
  if (precedingWords) {
    // There's a capitalized word immediately before - might be compound
    return true;
  }

  return false;
}

/**
 * Check if all tokens are lowercase and non-noun
 */
function isLowercaseNonNoun(tokens: Token[]): boolean {
  if (tokens.some(t => /^[A-Z]/.test(t.text))) {
    return false; // Has capitalized tokens
  }

  // Check if any token is a noun
  return !tokens.some(t => t.pos && NOMINAL_POS.has(t.pos));
}

/**
 * Extract NP object from PP-led span
 * e.g., "with teachers" → "teachers"
 */
function extractPPObject(candidate: MentionCandidate): MentionCandidate | undefined {
  const { tokens, sentenceIndex } = candidate;
  if (tokens.length < 2) return undefined;

  const firstLower = tokens[0].text.toLowerCase();
  if (!PREPOSITIONS.has(firstLower)) return undefined;

  // Skip the preposition, take the rest
  const npTokens = tokens.slice(1);

  // Skip any determiners
  let startIdx = 0;
  while (startIdx < npTokens.length) {
    const tok = npTokens[startIdx];
    if (DETERMINERS.has(tok.text.toLowerCase())) {
      startIdx++;
    } else {
      break;
    }
  }

  const objectTokens = npTokens.slice(startIdx);
  if (objectTokens.length === 0) return undefined;

  // Check if remaining is a valid NP
  if (!hasNominalHead(objectTokens)) return undefined;

  const surface = objectTokens.map(t => t.text).join(' ');
  const start = objectTokens[0].start;
  const end = objectTokens[objectTokens.length - 1].end;

  return {
    surface,
    normalized: surface.trim().replace(/\s+/g, ' '),
    start,
    end,
    tokens: objectTokens,
    source: candidate.source,
    nerHint: candidate.nerHint,
    sentenceIndex,
    isSentenceInitial: false,
    depRole: objectTokens[0].dep,
    headPOS: objectTokens.find(t => t.pos && NOMINAL_POS.has(t.pos))?.pos,
  };
}

/**
 * Check if normalized text looks like a theme/slogan
 */
function isThemeOrSlogan(normalized: string, tokens: Token[]): boolean {
  // Contractions like "Gettin'", "Outta"
  if (/[''](?:in|out|a)\b/i.test(normalized)) {
    return true;
  }

  // "X Here" patterns that are slogans
  if (/\bHere$/i.test(normalized) && tokens.length > 1) {
    const firstLower = tokens[0].text.toLowerCase();
    if (firstLower.endsWith("'") || firstLower.endsWith("'")) {
      return true;
    }
  }

  // Imperative-looking patterns
  if (tokens.length >= 2) {
    const first = tokens[0];
    // Starts with base verb form (imperative)
    if (first.pos === 'VERB' && first.tag === 'VB') {
      return true;
    }
  }

  return false;
}

/**
 * Fallback analysis when we don't have parsed tokens
 */
function analyzeByText(
  normalized: string,
  isSentenceInitial: boolean
): GateResult {
  const lower = normalized.toLowerCase();
  const words = lower.split(/\s+/);

  if (words.length === 0) {
    return { verdict: 'NON_ENTITY', reason: 'empty_span' };
  }

  const first = words[0];

  // Check closed classes
  if (PRONOUNS.has(lower)) {
    return { verdict: 'NON_ENTITY', reason: 'pronoun_only' };
  }

  if (DISCOURSE_MARKERS.has(lower)) {
    return { verdict: 'NON_ENTITY', reason: 'discourse_marker' };
  }

  if (INTERJECTIONS.has(lower)) {
    return { verdict: 'NON_ENTITY', reason: 'interjection' };
  }

  if (PREPOSITIONS.has(first)) {
    return { verdict: 'NON_ENTITY', reason: 'pp_lead_no_object' };
  }

  if (COORDINATING_CONJ.has(first)) {
    return { verdict: 'NON_ENTITY', reason: 'conjunction_lead' };
  }

  if (SUBORDINATING_CONJ.has(first)) {
    return { verdict: 'NON_ENTITY', reason: 'subordinator_lead' };
  }

  if (MODALS.has(first)) {
    return { verdict: 'NON_ENTITY', reason: 'modal_lead' };
  }

  // If all lowercase and single word, might be junk
  if (words.length === 1 && lower === normalized) {
    if (ROLE_NOUNS.has(lower)) {
      return { verdict: 'CONTEXT_ONLY', reason: 'role_without_identity' };
    }
  }

  // Default to DURABLE_CANDIDATE if we can't determine otherwise
  return { verdict: 'DURABLE_CANDIDATE' };
}
