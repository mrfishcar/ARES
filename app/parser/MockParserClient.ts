import type { ParserClient, ParseInput, ParseOutput } from "./ParserClient";
import type { ParsedSentence, Token } from "./parse-types";

const SENTENCE_SPLIT_REGEX = /(?<=[.!?])\s+|\n+/g;
const WORD_REGEX = /\b[\w'’\-]+\b/g;

const MONTH_NAMES = new Set([
  "january","february","march","april","may","june","july","august","september","october","november","december"
]);

const ORG_KEYWORDS = [
  "university","college","institute","inc","llc","ltd","corp","corporation","company","publishing",
  "library","center","centre","press","times","news","crunch","state library","state university","fnac",
  // Educational institutions
  "school","high school","junior high","middle school","elementary","academy","highschool","kindergarten"
];

const PLACE_KEYWORDS = [
  "city","valley","bay","mountain","river","lake","island","province","state","county","kingdom"
];

const PLACE_CANONICALS = new Set([
  "massachusetts",
  "silicon valley",
  "paris",
  "moscow",
  "new york",
  "new york city",
  "california",
  "london"
]);

// Pronouns should not be tagged as entities even when capitalized (sentence-initial)
const PRONOUNS = new Set([
  "he", "she", "it", "they", "we", "i", "you",
  "him", "her", "them", "us", "me",
  "his", "her", "hers", "its", "their", "theirs", "our", "ours", "my", "mine", "your", "yours",
  "himself", "herself", "itself", "themselves", "ourselves", "myself", "yourself", "yourselves"
]);

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

function annotateNamedEntities(tokens: Token[], fullText: string): void {
  // Date detection: month names and 4-digit years
  for (const token of tokens) {
    const lower = token.text.toLowerCase();
    if (MONTH_NAMES.has(lower) || /^\d{4}$/.test(token.text)) {
      token.ent = "DATE";
    }
  }

  const hasOrgKeyword = (phrase: string) => ORG_KEYWORDS.some(keyword => phrase.includes(keyword));
  const hasPlaceKeyword = (phrase: string) => PLACE_KEYWORDS.some(keyword => phrase.includes(keyword));

  // Helper to check if there's a comma between two tokens
  const hasCommaBetween = (token1: Token, token2: Token): boolean => {
    const between = fullText.slice(token1.end, token2.start);
    return between.includes(',');
  };

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    const text = tok.text;

    if (tok.ent) {
      i += 1;
      continue;
    }

    // All-caps acronyms → ORG (MIT, CERN, FBI, IBM)
    if (text.length > 1 && text === text.toUpperCase() && /[A-Z]/.test(text)) {
      tok.ent = "ORG";
      i += 1;
      continue;
    }

    const isCapitalized = /^[A-Z]/.test(text) || /-[A-Z]/.test(text);
    if (!isCapitalized) {
      i += 1;
      continue;
    }

    // Skip pronouns - they should not be tagged as entities even when capitalized
    if (PRONOUNS.has(text.toLowerCase())) {
      i += 1;
      continue;
    }

    // Skip determiners at the start of an entity span - they shouldn't start entities
    const DETERMINERS = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their']);
    if (DETERMINERS.has(text.toLowerCase())) {
      i += 1;
      continue;
    }

    let j = i + 1;
    while (j < tokens.length) {
      const next = tokens[j];
      const nextCap = /^[A-Z]/.test(next.text) || /-[A-Z]/.test(next.text);

      // "X of Y" PATTERN: Bridge lowercase connectors to form multi-word entities
      // e.g., "Order of the Phoenix", "Ministry of Magic", "Department of Mysteries"
      if (!nextCap && !next.ent) {
        const BRIDGE_WORDS = new Set(['of', 'the', 'and', 'de', 'la', 'le', 'di', 'del', 'von', 'van']);
        const isBridge = BRIDGE_WORDS.has(next.text.toLowerCase());
        if (isBridge && j + 1 < tokens.length) {
          // Look ahead for capitalized continuation
          const afterBridge = tokens[j + 1];
          const afterBridgeCap = /^[A-Z]/.test(afterBridge.text);
          if (afterBridgeCap && !afterBridge.ent) {
            // Include bridge word and continue
            j += 1;
            continue;
          }
          // Check two-word bridge: "of the"
          if (j + 2 < tokens.length && next.text.toLowerCase() === 'of') {
            const maybeThe = tokens[j + 1];
            const afterThe = tokens[j + 2];
            if (maybeThe.text.toLowerCase() === 'the' && /^[A-Z]/.test(afterThe.text) && !afterThe.ent) {
              // Skip both "of" and "the"
              j += 2;
              continue;
            }
          }
        }
        break;
      }

      if (!nextCap || next.ent === "DATE") break;

      // COORDINATION FIX: Don't group across commas (coordination lists)
      // E.g., "Gryffindor, Slytherin, Hufflepuff" should be 3 entities, not 1
      if (hasCommaBetween(tokens[j - 1], next)) break;

      j += 1;
    }

    const phrase = tokens.slice(i, j).map(t => t.text).join(" ");
    const phraseLower = phrase.toLowerCase();

    let label: "PERSON" | "ORG" | "GPE" = "PERSON";
    if (PLACE_CANONICALS.has(phraseLower)) {
      label = "GPE";
    } else if (hasOrgKeyword(phraseLower)) {
      label = "ORG";
    } else if (hasPlaceKeyword(phraseLower)) {
      label = "GPE";
    }

    for (let k = i; k < j; k++) {
      tokens[k].ent = label;
    }

    i = j;
  }
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

function buildTokens(sentenceText: string, offset: number, fullText: string): Token[] {
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

    if (PRONOUNS.has(lowerRaw)) {
      pos = "PRON";
      tag = "PRP";
    } else if (DETERMINERS.has(lowerRaw)) {
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
  annotateNamedEntities(tokens, fullText);

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
      tokens: buildTokens(sentence.text, sentence.start, input.text)
    }));

    return { sentences: parsed };
  }
}
