import type { MentionType } from '../mention-tracking';

export type MentionClass = 'DURABLE_NAME' | 'CONTEXT_ONLY' | 'NON_ENTITY';

export interface MentionClassification {
  mentionClass: MentionClass;
  reason?: string;
  mentionType?: MentionType;
}

const QUOTE_CHARS = new Set(['"', '“', '”', '‘', '’', "'"]);
const IMPERATIVE_START = new Set(['tell', 'listen', 'check', 'look', 'get', 'go']);

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

  // Demonym/adjective before lowercase noun ("Jersey accent")
  if (sentenceStart && isSingleToken && followingWord && /^[a-z]/.test(followingWord)) {
    return { mentionClass: 'NON_ENTITY', reason: 'adjectival-demonym' };
  }

  // Common-noun head preceded by lowercase word ("swimming pool", "monster runner")
  const prevChar = fullText[start - 1] || '';
  if (isSingleToken && (/[a-z]$/.test(prevChar) || /[a-z]/.test(prevNonSpace))) {
    return { mentionClass: 'NON_ENTITY', reason: 'lowercase-predecessor' };
  }

  // Lowercase raw span inside text ("black", "aged")
  if (rawIsLower) {
    return { mentionClass: 'NON_ENTITY', reason: 'lowercase-raw' };
  }

  return { mentionClass: 'DURABLE_NAME' };
}
