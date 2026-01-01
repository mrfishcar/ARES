/**
 * Mention Classifier - Pre-mint Entity Eligibility Gate
 *
 * This module provides the MANDATORY eligibility check before entity minting.
 * Every span must pass through classifyMention() before becoming an entity.
 *
 * Three classes:
 * - DURABLE_NAME: May mint entities, may create aliases
 * - CONTEXT_ONLY: Discourse/vocative mentions; logged but NO entity/alias creation
 * - NON_ENTITY: Structural junk; dropped entirely, stats incremented
 */

import type { MentionType } from '../mention-tracking';
// Note: COMMON_VERBS_FOR_NAME_DETECTION removed - now using default-KEEP strategy

export type MentionClass = 'DURABLE_NAME' | 'CONTEXT_ONLY' | 'NON_ENTITY';

export interface MentionClassification {
  mentionClass: MentionClass;
  reason?: string;
  mentionType?: MentionType;
}

// ============================
// STRUCTURAL DETECTION SETS
// ============================

const QUOTE_CHARS = new Set(['"', '\u201c', '\u201d', '\u2018', '\u2019', "'"]);

// Imperative verbs that start commands
const IMPERATIVE_START = new Set(['tell', 'listen', 'check', 'look', 'get', 'go', 'let', 'take', 'give', 'make', 'find', 'help', 'show']);

// Theme/slogan context markers (NOT including name-introducers)
// 'named', 'called', 'titled' are EXCLUDED because they introduce proper names, not themes
// e.g., "a dragon named Norbert" → Norbert is a PERSON, not a theme
const THEME_LEX = new Set(['theme', 'poster', 'posters', 'slogan', 'motto', 'banner', 'sign']);

// Name-introducer words that create entity aliases (NOT themes)
// These are handled separately via dependency patterns, not as theme markers
const NAME_INTRODUCERS = new Set(['named', 'called', 'titled', 'known', 'nicknamed', 'dubbed']);

// Interjections that should never be entities
const INTERJECTIONS = new Set(['yeah', 'yep', 'nope', 'uh', 'ugh', 'huh', 'whoa', 'wow', 'oops', 'oh', 'ah', 'aha', 'hmm', 'umm', 'er', 'um']);

// Prepositions that lead junk fragments
const PREP_LEADS = new Set(['with', 'at', 'in', 'on', 'of', 'from', 'to', 'for', 'into', 'onto', 'upon', 'through', 'across', 'against', 'between', 'among', 'within', 'without']);

// Verbs that should never start entity spans
const VERBISH = new Set([
  'agree', 'figure', 'murder', 'draw', 'distract', 'follow', 'meet', 'see', 'feel', 'know', 'tell',
  'mask', 'react', 'sleep', 'travel', 'gain', 'shed', 'smell', 'drift', 'handle', 'mean',
  'describe', 'argue', 'recall', 'pass', 'roar', 'happen', 'believe', 'understand', 'realize',
  'begin', 'start', 'end', 'finish', 'continue', 'stop', 'try', 'attempt', 'manage',
  'want', 'need', 'wish', 'hope', 'expect', 'fear', 'worry', 'wonder', 'doubt',
  'like', 'love', 'hate', 'enjoy', 'prefer', 'mind', 'care', 'matter',
  'become', 'remain', 'stay', 'grow', 'turn', 'prove', 'seem', 'appear',
  'break', 'fix', 'change', 'improve', 'reduce', 'increase', 'develop', 'create',
  'read', 'write', 'speak', 'talk', 'discuss', 'explain', 'mention', 'suggest',
  'ask', 'answer', 'question', 'reply', 'respond', 'refuse', 'accept', 'reject',
  'decide', 'choose', 'pick', 'select', 'determine', 'consider', 'judge',
  'find', 'discover', 'notice', 'observe', 'watch', 'hear', 'listen', 'touch',
  'hold', 'carry', 'bring', 'send', 'receive', 'take', 'leave', 'put', 'place',
  'move', 'walk', 'run', 'jump', 'climb', 'fall', 'sit', 'stand', 'lie',
  'eat', 'drink', 'cook', 'prepare', 'serve', 'clean', 'wash', 'dry'
]);

// Collect/hobby verbs
const COLLECT_VERBS = new Set(['collect', 'collects', 'collected', 'collecting', 'building', 'playing', 'buying', 'trading', 'reading', 'watching']);

// Event terms that indicate valid EVENT type
const EVENT_TERMS = new Set(['dance', 'reunion', 'festival', 'ball', 'prom', 'ceremony', 'party', 'wedding', 'funeral', 'celebration']);

// Adverbs/modifiers that start junk verb phrases
const VERB_PHRASE_ADVERBS = new Set([
  'never', 'only', 'just', 'even', 'still', 'already', 'no', 'not', 'hardly', 'barely', 'scarcely',
  'almost', 'nearly', 'quite', 'rather', 'somewhat', 'fairly', 'pretty', 'really', 'truly', 'actually',
  'simply', 'merely', 'easily', 'quickly', 'slowly', 'suddenly', 'finally', 'eventually', 'probably',
  'certainly', 'definitely', 'possibly', 'perhaps', 'maybe', 'likely', 'unlikely'
]);

// Discourse starters that should not be entities
const DISCOURSE_STARTERS = new Set([
  'when', 'however', 'yes', 'no', 'nope', 'exactly', 'originally', 'occasionally',
  'whatever', 'absolutely', 'accidental', 'surprise', 'look', 'go', 'hearing',
  'turning', 'dead', "it's", 'its', "that's", 'visitors', 'detective',
  'hearing', 'wherever', 'whenever', 'whoever', 'whichever', 'meanwhile', 'furthermore',
  'moreover', 'nevertheless', 'nonetheless', 'otherwise', 'therefore', 'thus', 'hence',
  'consequently', 'accordingly', 'subsequently', 'previously', 'currently', 'recently',
  'initially', 'ultimately', 'basically', 'essentially', 'apparently', 'obviously'
]);

// Fragment endings that indicate junk
const FRAGMENT_ENDINGS = new Set(['this', 'that', 'it', 'anything', 'something', 'someone', 'everyone', 'everything', 'nothing', 'nobody', 'anybody']);

// Single-token garbage
const SINGLE_TOKEN_GARBAGE = new Set(['mr', 'mrs', 'ms', 'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else']);

// Sentence-initial capitalized words that are NOT names
const SENTENCE_INITIAL_NON_NAMES = new Set([
  'when', 'whatever', 'wherever', 'however', 'therefore', 'meanwhile', 'dead', 'hearing',
  'visitors', 'detective', 'once', 'suddenly', 'originally', 'exactly', 'fortunately',
  'finally', 'afterward', 'afterwards', 'someday', 'eventually', 'perhaps', 'maybe',
  'certainly', 'probably', 'obviously', 'apparently', 'unfortunately', 'surprisingly',
  'interestingly', 'importantly', 'naturally', 'clearly', 'surely', 'hopefully',
  // Time words
  'yesterday', 'tomorrow', 'today', 'tonight', 'nowadays',
  // Document structure words
  'chapter', 'section', 'part', 'paragraph', 'page', 'figure', 'table', 'appendix',
  // Common nouns often mistaken for names at sentence start
  'song', 'music', 'dance', 'food', 'water', 'fire', 'earth', 'air', 'light', 'dark',
  'silence', 'noise', 'rain', 'snow', 'wind', 'thunder', 'lightning', 'weather',
  'morning', 'evening', 'night', 'afternoon', 'midnight', 'dawn', 'dusk',
  'summer', 'winter', 'spring', 'autumn', 'fall'
]);

// ============================
// HELPER FUNCTIONS
// ============================

function isSentenceStart(text: string, start: number): boolean {
  if (start > 0 && QUOTE_CHARS.has(text[start - 1])) return true;
  for (let i = start - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '\n') return true;
    if (/[.!?]/.test(ch)) return true;
    if (!/\s/.test(ch) && !QUOTE_CHARS.has(ch)) return false;
  }
  return true;
}

function nextWord(text: string, end: number): string | null {
  const slice = text.slice(end);
  const match = slice.match(/^[\s,;:\u201c\u201d"'\u2018\u2019\-]*([A-Za-z][\w']*)/);
  return match ? match[1] : null;
}

function prevWord(text: string, start: number): string | null {
  const slice = text.slice(0, start);
  const match = slice.match(/([A-Za-z][\w']*)[\s,;:\u201c\u201d"'\u2018\u2019\-]*$/);
  return match ? match[1] : null;
}

function isTitleCase(tokens: string[]): boolean {
  return tokens.length > 0 && tokens.every(tok => /^[A-Z]/.test(tok));
}

function isAcronymish(tokens: string[]): boolean {
  return tokens.length > 0 && tokens.every(tok => /^[A-Z0-9]+$/.test(tok)) && tokens.some(tok => /[A-Z]/.test(tok));
}

function hasLowercaseToken(tokens: string[]): boolean {
  return tokens.some(t => /^[a-z]/.test(t));
}

// ============================
// STRUCTURAL DETECTION (NEW)
// ============================

/**
 * Detect verb-object fragments like "never mask", "only agree", "figure something"
 * These are structural junk, NOT entities.
 */
function isVerbObjectFragment(tokens: string[]): { isJunk: boolean; reason?: string } {
  if (tokens.length < 2) return { isJunk: false };

  const first = tokens[0].toLowerCase();
  const second = tokens[1].toLowerCase();
  const last = tokens[tokens.length - 1].toLowerCase();

  // Pattern: adverb + verb (e.g., "never mask", "only agree", "hardly sleep")
  if (VERB_PHRASE_ADVERBS.has(first) && (VERBISH.has(second) || tokens.length === 2)) {
    return { isJunk: true, reason: 'adverb-verb-fragment' };
  }

  // Pattern: verb + object (e.g., "figure something", "handle anything")
  if (VERBISH.has(first)) {
    return { isJunk: true, reason: 'verb-lead-fragment' };
  }

  // Pattern: ends with fragment word (e.g., "it over", "figure something")
  if (FRAGMENT_ENDINGS.has(last)) {
    return { isJunk: true, reason: 'fragment-ending' };
  }

  // Pattern: modal/aux + verb/word (e.g., "can only", "will never")
  const MODALS = new Set(['can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must']);
  if (MODALS.has(first)) {
    return { isJunk: true, reason: 'modal-lead-fragment' };
  }

  // Pattern: preposition + lowercase (e.g., "at least", "for some")
  if (PREP_LEADS.has(first) && tokens.slice(1).every(t => t === t.toLowerCase())) {
    return { isJunk: true, reason: 'prep-lowercase-fragment' };
  }

  return { isJunk: false };
}

/**
 * Detect sentence-initial capitalization traps (e.g., "Dead", "Hearing", "Whatever")
 *
 * STRATEGY: Default to KEEP for sentence-initial capitalized words.
 * Only REJECT when there's strong counter-evidence:
 * - Known discourse starters/adverbs
 * - Determiners/articles (The, A, An, Some, etc.)
 * - Month names followed by lowercase
 */
function isSentenceInitialTrap(surface: string, text: string, start: number): { isTrap: boolean; reason?: string } {
  const tokens = surface.split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) return { isTrap: false };

  const token = tokens[0];
  const tokenLower = token.toLowerCase();

  // Only check if at sentence start
  if (!isSentenceStart(text, start)) return { isTrap: false };

  // REJECT: Known non-name words (adverbs, discourse markers)
  if (SENTENCE_INITIAL_NON_NAMES.has(tokenLower)) {
    return { isTrap: true, reason: 'sentence-initial-non-name' };
  }

  // REJECT: Discourse starters
  if (DISCOURSE_STARTERS.has(tokenLower)) {
    return { isTrap: true, reason: 'discourse-starter' };
  }

  // REJECT: Determiners/articles at sentence start (they're never names)
  const SENTENCE_DETERMINERS = new Set(['the', 'a', 'an', 'some', 'any', 'no', 'every', 'each', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their']);
  if (SENTENCE_DETERMINERS.has(tokenLower)) {
    return { isTrap: true, reason: 'sentence-initial-determiner' };
  }

  // REJECT: Prepositions at sentence start (typically not names)
  const SENTENCE_PREPS = new Set(['in', 'on', 'at', 'to', 'from', 'with', 'by', 'for', 'of', 'into', 'onto', 'upon', 'through', 'across', 'between', 'among', 'within', 'without', 'before', 'after', 'during', 'since', 'until', 'unless', 'despite', 'although', 'though', 'because', 'while', 'if']);
  if (SENTENCE_PREPS.has(tokenLower)) {
    return { isTrap: true, reason: 'sentence-initial-preposition' };
  }

  // REJECT: Month names (commonly capitalized at sentence start but not entities)
  const MONTHS = new Set(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']);
  const following = nextWord(text, start + surface.length);
  if (MONTHS.has(tokenLower) && following && /^[a-z0-9]/.test(following)) {
    return { isTrap: true, reason: 'sentence-initial-month' };
  }

  // DEFAULT: KEEP - sentence-initial capitalized words are likely names
  // This includes names followed by any verb (trained, attacked, protected, etc.)
  return { isTrap: false };
}

/**
 * Detect multi-word lowercase junk (e.g., "no longer", "it over", "even react")
 */
function isLowercaseJunk(tokens: string[], rawSpan: string): { isJunk: boolean; reason?: string } {
  // If starts with lowercase, it's junk (with few exceptions)
  if (/^[a-z]/.test(rawSpan)) {
    return { isJunk: true, reason: 'lowercase-lead' };
  }

  // If all lowercase and not an acronym
  if (tokens.every(t => t === t.toLowerCase())) {
    return { isJunk: true, reason: 'all-lowercase' };
  }

  // If most tokens are lowercase (ratio > 0.6) and not a known pattern
  const lowerCount = tokens.filter(t => t === t.toLowerCase()).length;
  if (tokens.length >= 2 && lowerCount / tokens.length > 0.6) {
    // Exception: "X of Y" patterns where X and Y are capitalized
    const hasOfPattern = tokens.includes('of') && tokens.filter(t => /^[A-Z]/.test(t)).length >= 2;
    if (!hasOfPattern) {
      return { isJunk: true, reason: 'mostly-lowercase' };
    }
  }

  return { isJunk: false };
}

/**
 * Detect titlecase + lowercase tail (e.g., "Monster Runner cards")
 */
function hasTitlecaseLowercaseTail(tokens: string[]): boolean {
  if (tokens.length < 2) return false;

  // Check if starts with titlecase and ends with lowercase
  const lastToken = tokens[tokens.length - 1];
  const startsWithTitlecase = tokens.slice(0, -1).every(t => /^[A-Z]/.test(t));
  const endsWithLowercase = /^[a-z]+s?$/.test(lastToken);

  return startsWithTitlecase && endsWithLowercase;
}

// ============================
// MAIN CLASSIFIER
// ============================

export function classifyMention(
  surface: string,
  fullText: string,
  start: number,
  end: number
): MentionClassification {
  const raw = surface.trim();
  if (!raw) {
    return { mentionClass: 'NON_ENTITY', reason: 'empty' };
  }

  const firstToken = raw.split(/\s+/)[0] ?? raw;
  const tokens = raw.split(/\s+/).filter(Boolean);
  const isSingleToken = tokens.length === 1;

  const rawInText = fullText.slice(start, end);
  const rawLower = rawInText.toLowerCase();
  const rawIsLower = rawInText === rawLower;
  const windowBefore = fullText.slice(Math.max(0, start - 50), start);
  const windowAfter = fullText.slice(end, Math.min(fullText.length, end + 50));

  const sentenceStart = isSentenceStart(fullText, start);
  const followingWord = nextWord(fullText, end);
  const precedingWord = prevWord(fullText, start);
  const followingComma = /^[\s]*,/.test(fullText.slice(end));
  const followingQuestion = /^[\s]*\?/.test(fullText.slice(end));
  const precedingDeterminer = precedingWord ? ['a', 'an', 'the'].includes(precedingWord.toLowerCase()) : false;
  let prevNonSpace = '';
  for (let i = start - 1; i >= 0; i--) {
    const ch = fullText[i];
    if (!/\s/.test(ch)) {
      prevNonSpace = ch;
      break;
    }
  }

  // ============================
  // PHASE 1: ABSOLUTE REJECTIONS
  // ============================

  // Chapter/heading markers (e.g., "CHAPTER SEVEN", "Chapter Nine")
  if (/^chapter\s+[\w-]+/i.test(raw)) {
    return { mentionClass: 'NON_ENTITY', reason: 'chapter-heading' };
  }

  // Repeated-letter interjections ("Aggggghhhh")
  if (isSingleToken && /(.)\1{3,}/i.test(raw.replace(/[^A-Za-z]/g, ''))) {
    return { mentionClass: 'NON_ENTITY', reason: 'repeated-letter-interjection' };
  }

  // Common interjections (case-insensitive, single token)
  if (isSingleToken && INTERJECTIONS.has(raw.toLowerCase())) {
    return { mentionClass: 'NON_ENTITY', reason: 'interjection' };
  }

  // Preposition-led fragments with lowercase tails ("with teachers")
  if (PREP_LEADS.has(tokens[0].toLowerCase()) && (tokens.length === 1 || tokens.slice(1).every(t => t === t.toLowerCase()))) {
    return { mentionClass: 'NON_ENTITY', reason: 'prep-led-fragment' };
  }

  // Determiner-led lowercase phrases ("the professional family")
  if (
    tokens.length >= 2 &&
    ['the', 'a', 'an'].includes(tokens[0].toLowerCase()) &&
    (tokens[1] === tokens[1].toLowerCase() || tokens[tokens.length - 1] === tokens[tokens.length - 1].toLowerCase())
  ) {
    return { mentionClass: 'NON_ENTITY', reason: 'determiner-lower-phrase' };
  }

  // Road/sign markers like "Dead End"
  if (tokens.length === 2 && tokens[1].toLowerCase() === 'end') {
    return { mentionClass: 'NON_ENTITY', reason: 'road-sign' };
  }

  // Death token
  if (isSingleToken && /^dead$/i.test(raw)) {
    return { mentionClass: 'NON_ENTITY', reason: 'death-token' };
  }

  // Profession acronym like EMT
  if (isSingleToken && /^emt$/i.test(raw)) {
    return { mentionClass: 'NON_ENTITY', reason: 'profession-acronym' };
  }

  // Advert fragment
  if (tokens.length >= 2 && tokens[0].toLowerCase() === 'ad' && tokens[1].toLowerCase() === 'written') {
    return { mentionClass: 'NON_ENTITY', reason: 'ad-fragment' };
  }

  // ============================
  // PHASE 2: STRUCTURAL JUNK DETECTION (NEW)
  // ============================

  // Verb-object fragments (e.g., "never mask", "only agree", "figure something")
  const verbObjCheck = isVerbObjectFragment(tokens);
  if (verbObjCheck.isJunk) {
    return { mentionClass: 'NON_ENTITY', reason: verbObjCheck.reason };
  }

  // Lowercase-leading multi-word fragments ("only agree", "figure something")
  if (/^[a-z]/.test(raw) && tokens.length >= 1) {
    return { mentionClass: 'NON_ENTITY', reason: 'lowercase-fragment' };
  }

  // Lowercase junk detection
  const lowercaseCheck = isLowercaseJunk(tokens, raw);
  if (lowercaseCheck.isJunk) {
    return { mentionClass: 'NON_ENTITY', reason: lowercaseCheck.reason };
  }

  // Sentence-initial trap detection
  const trapCheck = isSentenceInitialTrap(raw, fullText, start);
  if (trapCheck.isTrap) {
    return { mentionClass: 'NON_ENTITY', reason: trapCheck.reason };
  }

  // Titlecase + lowercase tail (e.g., "Monster Runner cards")
  if (hasTitlecaseLowercaseTail(tokens)) {
    return { mentionClass: 'NON_ENTITY', reason: 'titlecase-lowercase-tail' };
  }

  // ============================
  // PHASE 3: CONTEXT-ONLY MENTIONS
  // ============================

  // Standalone with question mark ("Familiar?")
  if (followingQuestion && isSingleToken) {
    return { mentionClass: 'NON_ENTITY', reason: 'question-fragment' };
  }

  // Determiner + acronym/common noun ("a PDF", "the pdf")
  if (precedingDeterminer && /^[A-Z0-9]{2,}$/.test(raw)) {
    return { mentionClass: 'NON_ENTITY', reason: 'determiner-acronym' };
  }

  // Subordinator at clause start ("When" ...)
  if (sentenceStart && /^when$/i.test(raw) && followingWord && /^[a-z]/.test(followingWord)) {
    return { mentionClass: 'NON_ENTITY', reason: 'subordinator' };
  }

  // Predicative adjective after "That's"/"That is"
  const priorWindow = fullText.slice(Math.max(0, start - 8), start);
  if (isSingleToken && /that['\u2019]?s\s+$/i.test(priorWindow)) {
    return { mentionClass: 'NON_ENTITY', reason: 'predicative-adjective' };
  }

  // Imperative/vocative at sentence/quote start with trailing comma ("Listen, Freddy.", "Honey, ...")
  // Exception: If followed by appositive relationship markers ("Aragorn, son of Arathorn")
  // Exception: If followed by capitalized word (coordination list: "Harry, Ron, and Hermione")
  const APPOSITIVE_MARKERS_COMMA = new Set(['son', 'daughter', 'brother', 'sister', 'mother', 'father', 'wife', 'husband', 'king', 'queen', 'prince', 'princess', 'lord', 'lady', 'heir', 'child', 'nephew', 'niece', 'cousin', 'uncle', 'aunt', 'friend', 'servant', 'master', 'student', 'apprentice', 'leader', 'chief', 'captain', 'commander', 'head', 'ruler', 'founder', 'member', 'ally', 'enemy', 'rival']);
  if (sentenceStart && isSingleToken && followingComma && /^[A-Z]/.test(firstToken)) {
    // Don't filter if followed by appositive marker (e.g., "Aragorn, son of Arathorn")
    // Don't filter if followed by capitalized word (coordination: "Harry, Ron, and Hermione")
    const isCoordinationList = followingWord && /^[A-Z]/.test(followingWord);
    if (!APPOSITIVE_MARKERS_COMMA.has(followingWord?.toLowerCase() ?? '') && !isCoordinationList) {
      return { mentionClass: 'CONTEXT_ONLY', reason: 'sentence-initial-comma' };
    }
  }

  // Sentence-start imperative single token with next lowercase word ("Check the door.")
  // STRATEGY: Default KEEP for sentence-initial capitalized tokens.
  // Only REJECT if the token is a known imperative command verb.
  if (sentenceStart && isSingleToken && followingWord && /^[a-z]/.test(followingWord)) {
    // REJECT only if: token IS a known imperative verb (Check, Look, Tell, etc.)
    // These are words that commonly start commands, not names
    if (IMPERATIVE_START.has(raw.toLowerCase())) {
      return { mentionClass: 'CONTEXT_ONLY', reason: 'imperative-single' };
    }
    // DEFAULT: KEEP - capitalized token at sentence start is likely a name
    // Names like "Dumbledore trained Harry" should be kept regardless of following verb
  }

  // Sentence/utterance start command with no following word ("Check.")
  const trimmedAfter = fullText.slice(end).trimStart();
  if (sentenceStart && isSingleToken && !followingWord && /^[.!?]/.test(trimmedAfter)) {
    return { mentionClass: 'CONTEXT_ONLY', reason: 'imperative-terminal' };
  }

  // Command verb followed by capitalized object ("Tell Laurie ...")
  if (
    sentenceStart &&
    tokens.length === 2 &&
    IMPERATIVE_START.has(tokens[0].toLowerCase()) &&
    /^[A-Z]/.test(tokens[1])
  ) {
    return { mentionClass: 'CONTEXT_ONLY', reason: 'imperative-object' };
  }

  // Explicit verb-object fragments (verbish + lowercase object)
  if (tokens.length >= 2 && VERBISH.has(tokens[0].toLowerCase()) && tokens.slice(1).every(t => t === t.toLowerCase())) {
    return { mentionClass: 'NON_ENTITY', reason: 'verb-object-fragment' };
  }

  // Demonym/adjective before lowercase noun ("Jersey accent", "French cuisine")
  // STRATEGY: Default KEEP. Only reject when followed by known demonym-target nouns.
  // This check is now very narrow - most sentence-initial capitalized tokens are names.
  if (sentenceStart && isSingleToken && followingWord && /^[a-z]/.test(followingWord) && !followingComma) {
    // Only reject if followed by words that indicate demonym/adjective usage
    const DEMONYM_TARGETS = new Set(['accent', 'style', 'cuisine', 'food', 'shore', 'coast', 'dialect', 'fashion', 'culture', 'tradition', 'music', 'art', 'architecture', 'language', 'weather', 'climate', 'landscape', 'countryside', 'hospitality', 'wine', 'cheese', 'cooking', 'recipe', 'heritage', 'influence', 'flavor', 'flavour']);
    if (DEMONYM_TARGETS.has(followingWord.toLowerCase())) {
      return { mentionClass: 'NON_ENTITY', reason: 'adjectival-demonym' };
    }
    // DEFAULT: KEEP - capitalized token is likely a name
  }

  // Mid-sentence demonym/adjective after determiner ("a Jersey accent", "the French cuisine")
  // If preceded by determiner (a, an, the) and followed by lowercase noun, it's likely an adjective
  if (!sentenceStart && isSingleToken && precedingDeterminer && followingWord && /^[a-z]+$/.test(followingWord)) {
    return { mentionClass: 'NON_ENTITY', reason: 'determiner-adjective-noun' };
  }

  // Common-noun head preceded by lowercase word ("swimming pool", "monster runner")
  const prevChar = fullText[start - 1] || '';
  if (
    isSingleToken &&
    raw === raw.toLowerCase() &&
    (/[a-z]$/.test(prevChar) || /[a-z]/.test(prevNonSpace))
  ) {
    return { mentionClass: 'NON_ENTITY', reason: 'lowercase-predecessor' };
  }

  // Mid-sentence titlecased fragment with lowercase neighbor ("Monster Runner cards")
  if (
    !sentenceStart &&
    tokens.length >= 2 &&
    tokens.slice(0, -1).every(t => /^[A-Z]/.test(t)) &&
    /^[a-z]+s?$/.test(tokens[tokens.length - 1])
  ) {
    return { mentionClass: 'NON_ENTITY', reason: 'capital-plus-lower-tail' };
  }

  // Hobby/collection context with titlecased tokens ("collecting Monster Runner")
  const prevWordLower = precedingWord ? precedingWord.toLowerCase() : '';
  if (!sentenceStart && COLLECT_VERBS.has(prevWordLower) && tokens.every(t => /^[A-Z]/.test(t))) {
    return { mentionClass: 'NON_ENTITY', reason: 'collectible-titlecase' };
  }

  // Slogan/theme/title after theme markers or inside quotes
  const windowStart = Math.max(0, start - 30);
  const windowText = fullText.slice(windowStart, start).toLowerCase();
  if (tokens.length >= 1 && tokens.length <= 3 && (/^['\u2018\u2019"\u201c\u201d]/.test(fullText[start - 1] || '') || Array.from(THEME_LEX).some(tok => windowText.includes(tok)))) {
    return { mentionClass: 'CONTEXT_ONLY', reason: 'theme-slogan' };
  }

  // Titlecased token(s) followed immediately by lowercase noun ("Monster Runner cards")
  // STRATEGY: Default KEEP. Only reject for clear collectible/product patterns.
  // Exception: If followed by comma, it's likely an appositive ("Kara Nightfall, a strategist")
  if (
    tokens.every(t => /^[A-Z]/.test(t)) &&
    followingWord &&
    /^[a-z]+s?$/.test(followingWord) &&
    !followingComma  // Don't reject if comma separates name from description
  ) {
    // Only reject if followed by words indicating collectible/product context
    // (cards, figures, toys, merchandise, etc.)
    const COLLECTIBLE_NOUNS = new Set(['cards', 'card', 'figures', 'figure', 'toys', 'toy', 'merchandise', 'merch', 'posters', 'poster', 'stickers', 'sticker', 'decks', 'deck', 'packs', 'pack', 'sets', 'set', 'pieces', 'piece', 'models', 'model', 'miniatures', 'miniature', 'figurines', 'figurine', 'items', 'item', 'stuff', 'gear', 'accessories', 'accessory', 'products', 'product', 'collectibles', 'collectible']);
    if (COLLECTIBLE_NOUNS.has(followingWord.toLowerCase())) {
      return { mentionClass: 'NON_ENTITY', reason: 'titlecase-plus-lower-follow' };
    }
    // DEFAULT: KEEP - titlecased tokens followed by any other lowercase word is fine
    // "Dumbledore trained Harry" - "trained" is lowercase but Dumbledore is a name
  }

  // ============================
  // PHASE 4: VALID NAME PATTERNS
  // ============================

  // Eventish phrases in context (End of School Dance) -> keep but hint type
  if (tokens.some(t => EVENT_TERMS.has(t.toLowerCase()))) {
    return { mentionClass: 'DURABLE_NAME', reason: 'event-lexeme' };
  }

  // Verb-object or infinitive-like fragments (lowercase tokens, minimal name cues)
  const lowerTokens = tokens.every(t => t === t.toLowerCase());
  if (lowerTokens) {
    const VERBISH_PATTERN = /^(agree|figure|murder|draw|distract|follow|meet|tell|see|feel|know)$/;
    if (tokens.length >= 2 && (VERBISH_PATTERN.test(tokens[0]) || VERBISH_PATTERN.test(tokens[1]) || tokens[0] === 'at' || tokens[0] === 'with')) {
      return { mentionClass: 'NON_ENTITY', reason: 'verb-fragment' };
    }
  }

  // Lowercase raw span inside text ("black", "aged")
  if (rawIsLower) {
    return { mentionClass: 'NON_ENTITY', reason: 'lowercase-raw' };
  }

  // ============================
  // DEFAULT: DURABLE NAME
  // ============================
  return { mentionClass: 'DURABLE_NAME' };
}

/**
 * Batch classification with statistics
 */
export interface ClassificationStats {
  total: number;
  durableName: number;
  contextOnly: number;
  nonEntity: number;
  reasons: Map<string, number>;
}

export function classifyMentionBatch(
  spans: Array<{ text: string; start: number; end: number }>,
  fullText: string
): { classifications: MentionClassification[]; stats: ClassificationStats } {
  const stats: ClassificationStats = {
    total: spans.length,
    durableName: 0,
    contextOnly: 0,
    nonEntity: 0,
    reasons: new Map()
  };

  const classifications: MentionClassification[] = [];

  for (const span of spans) {
    const result = classifyMention(span.text, fullText, span.start, span.end);
    classifications.push(result);

    switch (result.mentionClass) {
      case 'DURABLE_NAME':
        stats.durableName++;
        break;
      case 'CONTEXT_ONLY':
        stats.contextOnly++;
        break;
      case 'NON_ENTITY':
        stats.nonEntity++;
        break;
    }

    if (result.reason) {
      stats.reasons.set(result.reason, (stats.reasons.get(result.reason) || 0) + 1);
    }
  }

  return { classifications, stats };
}
