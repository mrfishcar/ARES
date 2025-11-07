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

function buildTokens(sentenceText: string, offset: number): Token[] {
  const tokens: Token[] = [];
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = WORD_REGEX.exec(sentenceText)) !== null) {
    const raw = match[0];
    const start = offset + match.index;
    const end = start + raw.length;
    const isCapitalized = /^[A-Z]/.test(raw);

    tokens.push({
      i: index,
      text: raw,
      lemma: raw.toLowerCase(),
      pos: isCapitalized ? "PROPN" : "NOUN",
      tag: isCapitalized ? "NNP" : "NN",
      dep: index === 0 ? "ROOT" : "dep",
      head: 0,
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
