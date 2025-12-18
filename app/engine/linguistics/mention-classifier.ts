import type { MentionType } from '../mention-tracking';

export type MentionClass = 'DURABLE_NAME' | 'CONTEXT_ONLY' | 'NON_ENTITY';

export interface MentionClassification {
  mentionClass: MentionClass;
  reason?: string;
  mentionType?: MentionType;
}

const QUOTE_CHARS = new Set(['"', '“', '”', '‘', '’', "'"]);
const IMPERATIVE_START = new Set(['tell', 'listen', 'check', 'look', 'get', 'go']);
const THEME_LEX = new Set(['theme', 'poster', 'posters', 'called', 'titled', 'named', 'slogan', 'motto']);
const INTERJECTIONS = new Set(['yeah', 'yep', 'nope', 'uh', 'ugh', 'huh', 'whoa', 'wow', 'oops']);
const PREP_LEADS = new Set(['with', 'at', 'in', 'on', 'of', 'from', 'to']);
const VERBISH = new Set(['agree', 'figure', 'murder', 'draw', 'distract', 'follow', 'meet', 'see', 'feel', 'know', 'tell']);
const COLLECT_VERBS = new Set(['collect', 'collects', 'collected', 'collecting', 'building', 'playing', 'buying', 'trading', 'reading', 'watching']);
const EVENT_TERMS = new Set(['dance', 'reunion', 'festival', 'ball', 'prom', 'ceremony']);

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
  const match = slice.match(/^[\s,;:"“”'’\-]*([A-Za-z][\w']*)/);
  return match ? match[1] : null;
}

function prevWord(text: string, start: number): string | null {
  const slice = text.slice(0, start);
  const match = slice.match(/([A-Za-z][\w']*)[\s,;:"“”'’\-]*$/);
  return match ? match[1] : null;
}

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
  const tokens = raw.split(/\s+/);
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

  // Lowercase-leading multi-word fragments ("only agree", "figure something")
  if (/^[a-z]/.test(raw) && tokens.length >= 1) {
    return { mentionClass: 'NON_ENTITY', reason: 'lowercase-fragment' };
  }

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
  if (isSingleToken && /that['’]?s\s+$/i.test(priorWindow)) {
    return { mentionClass: 'NON_ENTITY', reason: 'predicative-adjective' };
  }

  // Imperative/vocative at sentence/quote start with trailing comma ("Listen, Freddy.", "Honey, ...")
  if (sentenceStart && isSingleToken && followingComma && /^[A-Z]/.test(firstToken)) {
    return { mentionClass: 'CONTEXT_ONLY', reason: 'sentence-initial-comma' };
  }

  // Sentence-start imperative single token with next lowercase word ("Check the door.")
  if (sentenceStart && isSingleToken && followingWord && /^[a-z]/.test(followingWord)) {
    return { mentionClass: 'CONTEXT_ONLY', reason: 'imperative-single' };
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

  // Demonym/adjective before lowercase noun ("Jersey accent")
  if (sentenceStart && isSingleToken && followingWord && /^[a-z]/.test(followingWord)) {
    return { mentionClass: 'NON_ENTITY', reason: 'adjectival-demonym' };
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
  const COLLECT_VERBS = new Set(['collect', 'collects', 'collected', 'collecting', 'building', 'playing', 'buying', 'trading', 'reading', 'watching']);
  if (!sentenceStart && COLLECT_VERBS.has(prevWordLower) && tokens.every(t => /^[A-Z]/.test(t))) {
    return { mentionClass: 'NON_ENTITY', reason: 'collectible-titlecase' };
  }

  // Slogan/theme/title after theme markers or inside quotes
  const windowStart = Math.max(0, start - 30);
  const windowText = fullText.slice(windowStart, start).toLowerCase();
  if (tokens.length >= 1 && tokens.length <= 3 && (/^['"“”‘’]/.test(fullText[start - 1] || '') || Array.from(THEME_LEX).some(tok => windowText.includes(tok)))) {
    return { mentionClass: 'CONTEXT_ONLY', reason: 'theme-slogan' };
  }

  // Titlecased token(s) followed immediately by lowercase noun ("Monster Runner cards")
  if (
    tokens.every(t => /^[A-Z]/.test(t)) &&
    followingWord &&
    /^[a-z]+s?$/.test(followingWord)
  ) {
    return { mentionClass: 'NON_ENTITY', reason: 'titlecase-plus-lower-follow' };
  }

  // Eventish phrases in context (End of School Dance) -> keep but hint type
  if (tokens.some(t => EVENT_TERMS.has(t.toLowerCase()))) {
    return { mentionClass: 'DURABLE_NAME', reason: 'event-lexeme' };
  }

  // Verb-object or infinitive-like fragments (lowercase tokens, minimal name cues)
  const lowerTokens = tokens.every(t => t === t.toLowerCase());
  if (lowerTokens) {
    const VERBISH = /^(agree|figure|murder|draw|distract|follow|meet|tell|see|feel|know)$/;
    if (tokens.length >= 2 && (VERBISH.test(tokens[0]) || VERBISH.test(tokens[1]) || tokens[0] === 'at' || tokens[0] === 'with')) {
      return { mentionClass: 'NON_ENTITY', reason: 'verb-fragment' };
    }
  }

  // Lowercase raw span inside text ("black", "aged")
  if (rawIsLower) {
    return { mentionClass: 'NON_ENTITY', reason: 'lowercase-raw' };
  }

  return { mentionClass: 'DURABLE_NAME' };
}
