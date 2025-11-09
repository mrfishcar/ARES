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
  'wrote', 'made', 'built', 'created', 'founded', 'started', 'joined', 'left',
  // Marriage and family verbs
  'married', 'wed', 'wedded',
  // Location verbs
  'lived', 'dwelt', 'resided', 'stayed',
  // Social verbs
  'fought', 'befriended',
  // Leadership verbs
  'ruled', 'governed', 'became',
  // Education verbs
  'studied', 'attended', 'teaches', 'learned'
]);

function buildTokens(sentenceText: string, offset: number): Token[] {
  const tokens: Token[] = [];
  let match: RegExpExecArray | null;
  let index = 0;

  // Determiners (articles)
  const DETERMINERS = new Set(['the', 'a', 'an']);

  // Prepositions
  const PREPOSITIONS = new Set(['of', 'in', 'at', 'to', 'from', 'by', 'with', 'for', 'on']);

  // First pass: create tokens
  while ((match = WORD_REGEX.exec(sentenceText)) !== null) {
    const raw = match[0];
    const start = offset + match.index;
    const end = start + raw.length;
    const isCapitalized = /^[A-Z]/.test(raw);
    const isLowercase = /^[a-z]/.test(raw);
    const lowerRaw = raw.toLowerCase();

    // Determine POS tag
    let pos: string;
    let tag: string;

    if (DETERMINERS.has(lowerRaw)) {
      pos = "DET";
      tag = "DT";
    } else if (PREPOSITIONS.has(lowerRaw)) {
      pos = "ADP";
      tag = "IN";
    } else if (isCapitalized) {
      pos = "PROPN";
      tag = "NNP";
    } else if (isLowercase && ACTION_VERBS.has(lowerRaw)) {
      pos = "VERB";
      tag = "VBD";
    } else {
      pos = "NOUN";
      tag = "NN";
    }

    tokens.push({
      i: index,
      text: raw,
      lemma: lowerRaw,
      pos,
      tag,
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
  // Strategy: Find the actual subject (usually the first PROPN), not compounds within appositives
  let subjectIdx = -1;
  for (let i = 0; i < verbIdx; i++) {
    const curr = tokens[i];

    // Skip prepositions
    if (curr.pos === "ADP") {
      curr.dep = "prep";
      // Attach to next noun
      const nextNoun = tokens.slice(i + 1, verbIdx).findIndex(t => t.pos === "NOUN" || t.pos === "PROPN");
      curr.head = nextNoun !== -1 ? i + 1 + nextNoun : verbIdx;
      continue;
    }

    // Skip determiners
    if (curr.pos === "DET") {
      curr.dep = "det";
      // Attach to next noun
      const nextNoun = tokens.slice(i + 1, verbIdx).findIndex(t => t.pos === "NOUN" || t.pos === "PROPN");
      curr.head = nextNoun !== -1 ? i + 1 + nextNoun : verbIdx;
      continue;
    }

    // Multi-word names: consecutive PROPN/NOUN
    const next = tokens[i + 1];
    if (i + 1 < verbIdx &&
        (curr.pos === "NOUN" || curr.pos === "PROPN") &&
        next && (next.pos === "NOUN" || next.pos === "PROPN")) {
      // This is part of a compound name
      curr.dep = "compound";
      curr.head = next.i;
    } else if (curr.pos === "NOUN" || curr.pos === "PROPN") {
      // This is a potential subject or appositive
      if (subjectIdx === -1) {
        // First name is the subject
        subjectIdx = i;
        curr.dep = "nsubj";
        curr.head = verbIdx;
      } else {
        // Subsequent names could be appositives, but for simplicity attach to verb
        curr.dep = "appos";
        curr.head = subjectIdx;
      }
    }
  }

  // Assign dependencies for tokens after the verb
  let lastPrepIdx = -1;
  for (let i = verbIdx + 1; i < tokens.length; i++) {
    const curr = tokens[i];

    // Track prepositions
    if (curr.pos === "ADP") {
      curr.dep = "prep";
      curr.head = verbIdx;
      lastPrepIdx = i;
      continue;
    }

    // Skip determiners
    if (curr.pos === "DET") {
      curr.dep = "det";
      // Attach to next noun
      const nextNoun = tokens.slice(i + 1).findIndex(t => t.pos === "NOUN" || t.pos === "PROPN");
      curr.head = nextNoun !== -1 ? i + 1 + nextNoun : verbIdx;
      continue;
    }

    // Multi-word names: consecutive PROPN/NOUN
    if (i + 1 < tokens.length &&
        (curr.pos === "NOUN" || curr.pos === "PROPN") &&
        (tokens[i + 1].pos === "NOUN" || tokens[i + 1].pos === "PROPN")) {
      curr.dep = "compound";
      curr.head = tokens[i + 1].i;
    } else if (curr.pos === "NOUN" || curr.pos === "PROPN") {
      // Check if this is a prepositional object
      if (lastPrepIdx !== -1 && i > lastPrepIdx) {
        curr.dep = "pobj";
        curr.head = lastPrepIdx;
        lastPrepIdx = -1; // Reset after consuming
      } else {
        // Direct object
        curr.dep = "dobj";
        curr.head = verbIdx;
      }
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
