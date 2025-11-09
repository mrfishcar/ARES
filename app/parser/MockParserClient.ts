import type { ParserClient, ParseInput, ParseOutput } from "./ParserClient";
import type { ParsedSentence, Token } from "./parse-types";

const SENTENCE_SPLIT_REGEX = /(?<=[.!?])\s+|\n+/g;
const WORD_REGEX = /\b[\w'’\-]+\b/g;

function splitSentences(text: string): Array<{ text: string; start: number; end: number }> {
  const segments: Array<{ text: string; start: number; end: number }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SENTENCE_SPLIT_REGEX.exec(text)) !== null) {
    const end = match.index;
    const sentence = text.slice(lastIndex, end).trim();
    if (sentence) {
      segments.push({ text: sentence, start: lastIndex, end });
    }
    lastIndex = match.index + match[0].length;
  }

  const tail = text.slice(lastIndex).trim();
  if (tail) {
    segments.push({ text: tail, start: lastIndex, end: text.length });
  }

  if (segments.length === 0 && text.trim()) {
    segments.push({ text: text.trim(), start: 0, end: text.length });
  }

  return segments;
}

// Common action verbs that take subjects
const ACTION_VERBS = new Set([
  'said', 'asked', 'replied', 'answered', 'whispered', 'shouted', 'thought', 'felt',
  'went', 'came', 'walked', 'ran', 'stood', 'sat', 'moved', 'traveled',
  'was', 'were', 'had', 'has', 'did', 'does', 'could', 'would', 'should',
  'wrote', 'made', 'built', 'created', 'founded', 'started', 'joined', 'left'
]);

function buildTokens(sentenceText: string, offset: number): Token[] {
  const tokens: Token[] = [];
  let match: RegExpExecArray | null;
  let index = 0;

  // First pass: create tokens
  while ((match = WORD_REGEX.exec(sentenceText)) !== null) {
    const raw = match[0];
    const start = offset + match.index;
    const end = start + raw.length;
    const isCapitalized = /^[A-Z]/.test(raw);
    const isLowercase = /^[a-z]/.test(raw);

    tokens.push({
      i: index,
      text: raw,
      lemma: raw.toLowerCase(),
      pos: isCapitalized ? "PROPN" : (isLowercase && ACTION_VERBS.has(raw.toLowerCase()) ? "VERB" : "NOUN"),
      tag: isCapitalized ? "NNP" : (isLowercase && ACTION_VERBS.has(raw.toLowerCase()) ? "VBD" : "NN"),
      dep: "dep", // Will be refined below
      head: 0,   // Will be refined below
      ent: "",
      start,
      end
    });

    index += 1;
  }

  if (tokens.length === 0) {
    tokens.push({
      i: 0,
      text: sentenceText,
      lemma: sentenceText.toLowerCase(),
      pos: "X",
      tag: "X",
      dep: "ROOT",
      head: 0,
      ent: "",
      start: offset,
      end: offset + sentenceText.length
    });
    return tokens;
  }

  // Second pass: establish dependency relationships
  // Find the main verb (first VERB token, or first token as fallback)
  let verbIdx = tokens.findIndex(t => t.pos === "VERB");
  if (verbIdx === -1) {
    verbIdx = 0; // Fallback to first token
  }

  tokens[verbIdx].dep = "ROOT";
  tokens[verbIdx].head = verbIdx;

  // Assign dependencies for tokens before the verb
  for (let i = 0; i < verbIdx; i++) {
    const curr = tokens[i];
    const next = tokens[i + 1];

    // Multi-word name patterns: consecutive NOUN/PROPN tokens are compounds
    if (i + 1 < verbIdx &&
        (curr.pos === "NOUN" || curr.pos === "PROPN") &&
        (next.pos === "NOUN" || next.pos === "PROPN")) {
      // Current token is compound of next token
      curr.dep = "compound";
      curr.head = next.i;
    } else {
      // Last token before verb is subject
      curr.dep = "nsubj";
      curr.head = verbIdx;
    }
  }

  // Assign dependencies for tokens after the verb
  for (let i = verbIdx + 1; i < tokens.length; i++) {
    const curr = tokens[i];
    const prev = tokens[i - 1];

    // Multi-word name patterns: consecutive NOUN/PROPN tokens are compounds
    if (i + 1 < tokens.length &&
        (curr.pos === "NOUN" || curr.pos === "PROPN") &&
        (tokens[i + 1].pos === "NOUN" || tokens[i + 1].pos === "PROPN")) {
      curr.dep = "compound";
      curr.head = tokens[i + 1].i;
    } else if (curr.pos === "NOUN" || curr.pos === "PROPN") {
      // Last token in a noun phrase sequence is direct object
      curr.dep = "dobj";
      curr.head = verbIdx;
    } else {
      // Other tokens depend on verb
      curr.dep = "dep";
      curr.head = verbIdx;
    }
  }

  return tokens;
}

export class MockParserClient implements ParserClient {
  async parse(input: ParseInput): Promise<ParseOutput> {
    const sentences = splitSentences(input.text);

    const parsed: ParsedSentence[] = sentences.map((sentence, idx) => ({
      sentence_index: idx,
      start: sentence.start,
      end: sentence.end,
      tokens: buildTokens(sentence.text, sentence.start)
    }));

    return { sentences: parsed };
  }
}
