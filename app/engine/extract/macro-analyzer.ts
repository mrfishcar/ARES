/**
 * Macro-Level Document Analyzer
 *
 * Performs document-level analysis before fine-grained entity extraction.
 * This enables context-aware entity recognition that mimics how advanced readers
 * process text - by understanding the overall document structure first.
 *
 * Features:
 * - Entity salience scoring (frequency + position)
 * - Entity co-occurrence matrix
 * - First mention detection and introduction patterns
 * - Document structure analysis (opening paragraphs, dialogue, etc.)
 * - Narrative role identification (protagonists, settings)
 */

import type { ParseResponse, ParsedSentence, Token } from './parse-types';
import type { EntityType } from '../schema';

/**
 * Entity mention detected in first pass (before type classification)
 */
export interface EntityMention {
  surface: string;          // How it appears in text
  normalized: string;       // Lowercased, trimmed
  start: number;            // Character offset
  end: number;              // Character offset
  sentenceIndex: number;    // Which sentence (0-indexed)
  paragraphIndex: number;   // Which paragraph (0-indexed)

  // Parser-derived hints (not final classification)
  nerTag?: string;          // spaCy NER tag (if available)
  syntacticRole?: string;   // nsubj, dobj, pobj, etc.
  headVerb?: string;        // Verb this entity depends on

  // Context indicators
  hasTitle?: boolean;       // "King X", "Professor Y"
  hasAppositive?: boolean;  // "X, the wizard"
  isInDialogue?: boolean;   // Inside quoted speech
}

/**
 * Entity salience scores (importance in document)
 */
export interface EntitySalience {
  surface: string;
  normalized: string;

  // Frequency metrics
  mentionCount: number;
  paragraphSpread: number;     // How many different paragraphs
  sentenceSpread: number;      // How many different sentences

  // Position metrics
  firstMentionPos: number;     // Character offset (0-1 normalized)
  lastMentionPos: number;
  firstMentionSentence: number;
  firstMentionParagraph: number;

  // Context metrics
  inOpeningParagraph: boolean;  // First paragraph (high importance)
  inClosingParagraph: boolean;  // Last paragraph
  inDialogue: boolean;          // Appears in quoted speech
  titleCount: number;           // How many times appears with title

  // Computed salience score (0-1)
  score: number;
}

/**
 * Entity co-occurrence data
 */
export interface EntityCooccurrence {
  entity1: string;
  entity2: string;
  cooccurrenceCount: number;    // How many sentences both appear in
  avgDistance: number;          // Average word distance when co-occurring
  relationType?: string;        // Inferred relationship type
}

/**
 * Introduction pattern (how entity is first mentioned)
 */
export interface IntroductionPattern {
  entity: string;
  sentenceIndex: number;
  pattern: 'appositive' | 'named' | 'title' | 'possessive' | 'simple';
  context: string;              // Full sentence
  confidence: number;
}

/**
 * Document structure analysis
 */
export interface DocumentStructure {
  totalCharacters: number;
  totalSentences: number;
  totalParagraphs: number;

  // Sentence importance scores (0-1)
  sentenceImportance: number[];

  // Dialogue detection
  dialogueSentences: Set<number>;  // Sentence indices with quotes

  // Paragraph boundaries
  paragraphBoundaries: Array<{ start: number; end: number; sentenceStart: number; sentenceEnd: number }>;
}

/**
 * Complete macro-level analysis
 */
export interface MacroAnalysis {
  mentions: EntityMention[];
  salience: Map<string, EntitySalience>;
  cooccurrences: EntityCooccurrence[];
  introductions: Map<string, IntroductionPattern>;
  structure: DocumentStructure;

  // Entity graph (for quick lookups)
  entityGraph: {
    neighbors: (entity: string) => string[];  // Get co-occurring entities
    getSalience: (entity: string) => number;  // Get salience score
  };
}

/**
 * Main entry point: Analyze document at macro level
 */
export async function analyzeDocument(
  fullText: string,
  parse: ParseResponse
): Promise<MacroAnalysis> {
  // 1. Extract structure
  const structure = analyzeDocumentStructure(fullText, parse);

  // 2. Detect all entity mentions (first pass, no classification)
  const mentions = extractAllMentions(fullText, parse, structure);

  // 3. Compute salience scores
  const salience = computeSalienceScores(mentions, structure);

  // 4. Build co-occurrence matrix
  const cooccurrences = buildCooccurrenceMatrix(mentions);

  // 5. Identify introduction patterns
  const introductions = findIntroductionPatterns(mentions, parse);

  // 6. Create entity graph for fast lookups
  const entityGraph = buildEntityGraph(salience, cooccurrences);

  return {
    mentions,
    salience,
    cooccurrences,
    introductions,
    structure,
    entityGraph
  };
}

/**
 * Analyze document structure (paragraphs, sentences, dialogue)
 */
function analyzeDocumentStructure(
  fullText: string,
  parse: ParseResponse
): DocumentStructure {
  const totalCharacters = fullText.length;
  const totalSentences = parse.sentences.length;

  // Detect paragraph boundaries (double newlines or significant whitespace)
  const paragraphBoundaries: Array<{ start: number; end: number; sentenceStart: number; sentenceEnd: number }> = [];
  const paragraphs = fullText.split(/\n\s*\n/);

  let currentCharPos = 0;
  let currentSentenceIdx = 0;

  for (const para of paragraphs) {
    const paraStart = fullText.indexOf(para, currentCharPos);
    const paraEnd = paraStart + para.length;

    // Find sentences in this paragraph
    const sentenceStart = currentSentenceIdx;
    while (currentSentenceIdx < parse.sentences.length) {
      const sent = parse.sentences[currentSentenceIdx];
      const sentStart = sent.tokens[0]?.start || 0;
      if (sentStart >= paraEnd) break;
      currentSentenceIdx++;
    }
    const sentenceEnd = currentSentenceIdx - 1;

    paragraphBoundaries.push({
      start: paraStart,
      end: paraEnd,
      sentenceStart,
      sentenceEnd
    });

    currentCharPos = paraEnd;
  }

  const totalParagraphs = paragraphBoundaries.length;

  // Compute sentence importance scores
  const sentenceImportance = parse.sentences.map((sent, idx) => {
    let score = 0.5; // Base score

    // Opening sentences are important
    if (idx === 0) score += 0.3;
    else if (idx < 3) score += 0.2;

    // Closing sentences are important
    if (idx === totalSentences - 1) score += 0.2;
    else if (idx >= totalSentences - 3) score += 0.1;

    // First sentence of each paragraph is important
    const isFirstInPara = paragraphBoundaries.some(
      p => p.sentenceStart === idx
    );
    if (isFirstInPara) score += 0.15;

    // Longer sentences often more important (contain more info)
    const tokenCount = sent.tokens.length;
    if (tokenCount > 20) score += 0.1;

    return Math.min(1.0, score);
  });

  // Detect dialogue (sentences with quotes)
  const dialogueSentences = new Set<number>();
  parse.sentences.forEach((sent, idx) => {
    const sentText = sent.tokens.map(t => t.text).join(' ');
    if (/"[^"]+"/.test(sentText) || /'[^']+'/.test(sentText)) {
      dialogueSentences.add(idx);
    }
  });

  return {
    totalCharacters,
    totalSentences,
    totalParagraphs,
    sentenceImportance,
    dialogueSentences,
    paragraphBoundaries
  };
}

/**
 * Extract all potential entity mentions (first pass)
 */
function extractAllMentions(
  fullText: string,
  parse: ParseResponse,
  structure: DocumentStructure
): EntityMention[] {
  const mentions: EntityMention[] = [];

  parse.sentences.forEach((sent, sentIdx) => {
    // Find paragraph for this sentence
    const paraIdx = structure.paragraphBoundaries.findIndex(
      p => sentIdx >= p.sentenceStart && sentIdx <= p.sentenceEnd
    );

    const isInDialogue = structure.dialogueSentences.has(sentIdx);

    // Extract NER spans
    const nerSpans = extractNERSpans(sent);
    for (const span of nerSpans) {
      const surface = fullText.slice(span.start, span.end);
      const normalized = surface.toLowerCase().trim();

      // Check for title (e.g., "King Aragorn", "Professor McGonagall")
      const hasTitle = /^(king|queen|prince|princess|lord|lady|sir|professor|dr|mr|mrs|ms|captain|commander)\s+/i.test(surface);

      // Check for appositive (e.g., "Gandalf, the wizard")
      const tokenIdx = sent.tokens.findIndex(t => t.start === span.start);
      const hasAppositive = tokenIdx >= 0 && tokenIdx < sent.tokens.length - 2 &&
        sent.tokens[tokenIdx + 1].text === ',' &&
        sent.tokens[tokenIdx + 2].text.toLowerCase() === 'the';

      // Get syntactic role
      const token = sent.tokens.find(t => t.start === span.start);
      const syntacticRole = token?.dep;
      const headVerb = token?.head !== undefined && token.head !== token.i
        ? sent.tokens.find(t => t.i === token.head)?.lemma
        : undefined;

      mentions.push({
        surface,
        normalized,
        start: span.start,
        end: span.end,
        sentenceIndex: sentIdx,
        paragraphIndex: paraIdx >= 0 ? paraIdx : 0,
        nerTag: span.tag,
        syntacticRole,
        headVerb,
        hasTitle,
        hasAppositive,
        isInDialogue
      });
    }

    // Also extract capitalized patterns (fallback)
    const capitalizedSpans = extractCapitalizedPatterns(sent, fullText);
    for (const span of capitalizedSpans) {
      // Skip if already covered by NER
      if (nerSpans.some(ner => ner.start === span.start && ner.end === span.end)) {
        continue;
      }

      const surface = fullText.slice(span.start, span.end);
      const normalized = surface.toLowerCase().trim();

      mentions.push({
        surface,
        normalized,
        start: span.start,
        end: span.end,
        sentenceIndex: sentIdx,
        paragraphIndex: paraIdx >= 0 ? paraIdx : 0,
        isInDialogue
      });
    }
  });

  return mentions;
}

/**
 * Extract NER spans from parsed sentence
 */
function extractNERSpans(sent: ParsedSentence): Array<{ start: number; end: number; tag: string }> {
  const spans: Array<{ start: number; end: number; tag: string }> = [];
  let currentSpan: { start: number; end: number; tag: string } | null = null;

  for (const token of sent.tokens) {
    if (token.ent && token.ent !== 'O') {
      const tag = token.ent.replace(/^[BI]-/, ''); // Remove B-/I- prefix

      if (currentSpan && currentSpan.tag === tag) {
        // Extend current span
        currentSpan.end = token.end;
      } else {
        // Start new span
        if (currentSpan) spans.push(currentSpan);
        currentSpan = { start: token.start, end: token.end, tag };
      }
    } else {
      if (currentSpan) {
        spans.push(currentSpan);
        currentSpan = null;
      }
    }
  }

  if (currentSpan) spans.push(currentSpan);
  return spans;
}

/**
 * Extract capitalized word patterns
 */
function extractCapitalizedPatterns(sent: ParsedSentence, fullText: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const rx = /\b([A-Z][\w''.-]+(?:\s+[A-Z][\w''.-]+){0,2})\b/g;

  const sentStart = sent.tokens[0]?.start || 0;
  const sentEnd = sent.tokens[sent.tokens.length - 1]?.end || sentStart;
  const sentText = fullText.slice(sentStart, sentEnd);

  let match;
  while ((match = rx.exec(sentText)) !== null) {
    spans.push({
      start: sentStart + match.index,
      end: sentStart + match.index + match[0].length
    });
  }

  return spans;
}

/**
 * Compute salience scores for all entities
 */
function computeSalienceScores(
  mentions: EntityMention[],
  structure: DocumentStructure
): Map<string, EntitySalience> {
  const salienceMap = new Map<string, EntitySalience>();

  // Group mentions by normalized form
  const mentionGroups = new Map<string, EntityMention[]>();
  for (const mention of mentions) {
    const key = mention.normalized;
    if (!mentionGroups.has(key)) {
      mentionGroups.set(key, []);
    }
    mentionGroups.get(key)!.push(mention);
  }

  // Compute salience for each entity
  for (const [normalized, entityMentions] of mentionGroups) {
    const mentionCount = entityMentions.length;

    // Position metrics
    const firstMention = entityMentions[0];
    const lastMention = entityMentions[entityMentions.length - 1];
    const firstMentionPos = firstMention.start / structure.totalCharacters;
    const lastMentionPos = lastMention.end / structure.totalCharacters;

    // Spread metrics
    const paragraphs = new Set(entityMentions.map(m => m.paragraphIndex));
    const sentences = new Set(entityMentions.map(m => m.sentenceIndex));
    const paragraphSpread = paragraphs.size;
    const sentenceSpread = sentences.size;

    // Context metrics
    const inOpeningParagraph = firstMention.paragraphIndex === 0;
    const inClosingParagraph = lastMention.paragraphIndex === structure.totalParagraphs - 1;
    const inDialogue = entityMentions.some(m => m.isInDialogue);
    const titleCount = entityMentions.filter(m => m.hasTitle).length;

    // Compute overall salience score
    let score = 0;

    // Frequency component (with diminishing returns)
    score += Math.log(mentionCount + 1) * 0.25;

    // Position component (earlier mentions = more important)
    if (firstMentionPos < 0.1) score += 0.35;       // First 10%
    else if (firstMentionPos < 0.25) score += 0.20; // First quarter
    else if (firstMentionPos < 0.5) score += 0.10;  // First half

    // Spread component (entities spanning document = more important)
    score += (paragraphSpread / structure.totalParagraphs) * 0.15;

    // Opening paragraph bonus (protagonists introduced early)
    if (inOpeningParagraph) score += 0.25;

    // Title/descriptor bonus (formalized entities)
    if (titleCount > 0) score += 0.15;

    // Dialogue bonus (speaking characters = important)
    if (inDialogue) score += 0.10;

    // Clamp to [0, 1]
    score = Math.min(1.0, score);

    salienceMap.set(normalized, {
      surface: firstMention.surface,
      normalized,
      mentionCount,
      paragraphSpread,
      sentenceSpread,
      firstMentionPos,
      lastMentionPos,
      firstMentionSentence: firstMention.sentenceIndex,
      firstMentionParagraph: firstMention.paragraphIndex,
      inOpeningParagraph,
      inClosingParagraph,
      inDialogue,
      titleCount,
      score
    });
  }

  return salienceMap;
}

/**
 * Build entity co-occurrence matrix
 */
function buildCooccurrenceMatrix(mentions: EntityMention[]): EntityCooccurrence[] {
  const cooccurrences: EntityCooccurrence[] = [];
  const sentenceMentions = new Map<number, EntityMention[]>();

  // Group mentions by sentence
  for (const mention of mentions) {
    const sentIdx = mention.sentenceIndex;
    if (!sentenceMentions.has(sentIdx)) {
      sentenceMentions.set(sentIdx, []);
    }
    sentenceMentions.get(sentIdx)!.push(mention);
  }

  // Find co-occurrences within same sentence
  const cooccurrenceMap = new Map<string, { count: number; distances: number[] }>();

  for (const [sentIdx, sentMentions] of sentenceMentions) {
    // Only count if sentence has multiple entities
    if (sentMentions.length < 2) continue;

    for (let i = 0; i < sentMentions.length; i++) {
      for (let j = i + 1; j < sentMentions.length; j++) {
        const entity1 = sentMentions[i].normalized;
        const entity2 = sentMentions[j].normalized;

        if (entity1 === entity2) continue; // Skip self

        // Create canonical key (alphabetically sorted)
        const key = entity1 < entity2
          ? `${entity1}|${entity2}`
          : `${entity2}|${entity1}`;

        // Compute word distance
        const distance = Math.abs(sentMentions[i].start - sentMentions[j].start);

        if (!cooccurrenceMap.has(key)) {
          cooccurrenceMap.set(key, { count: 0, distances: [] });
        }

        const entry = cooccurrenceMap.get(key)!;
        entry.count++;
        entry.distances.push(distance);
      }
    }
  }

  // Convert to array
  for (const [key, data] of cooccurrenceMap) {
    const [entity1, entity2] = key.split('|');
    const avgDistance = data.distances.reduce((a, b) => a + b, 0) / data.distances.length;

    cooccurrences.push({
      entity1,
      entity2,
      cooccurrenceCount: data.count,
      avgDistance
    });
  }

  // Sort by co-occurrence count (most frequent first)
  cooccurrences.sort((a, b) => b.cooccurrenceCount - a.cooccurrenceCount);

  return cooccurrences;
}

/**
 * Identify introduction patterns
 */
function findIntroductionPatterns(
  mentions: EntityMention[],
  parse: ParseResponse
): Map<string, IntroductionPattern> {
  const introductions = new Map<string, IntroductionPattern>();

  // Group by entity
  const mentionGroups = new Map<string, EntityMention[]>();
  for (const mention of mentions) {
    const key = mention.normalized;
    if (!mentionGroups.has(key)) {
      mentionGroups.set(key, []);
    }
    mentionGroups.get(key)!.push(mention);
  }

  // Analyze first mention of each entity
  for (const [normalized, entityMentions] of mentionGroups) {
    const firstMention = entityMentions[0];
    const sent = parse.sentences[firstMention.sentenceIndex];
    const sentText = sent.tokens.map(t => t.text).join(' ');

    let pattern: IntroductionPattern['pattern'] = 'simple';
    let confidence = 0.5;

    // Check for appositive ("X, the wizard")
    if (firstMention.hasAppositive) {
      pattern = 'appositive';
      confidence = 0.9;
    }
    // Check for "named" pattern ("named X", "called X")
    else if (/\b(named|called)\s+/i.test(sentText)) {
      pattern = 'named';
      confidence = 0.85;
    }
    // Check for title ("King X", "Professor Y")
    else if (firstMention.hasTitle) {
      pattern = 'title';
      confidence = 0.8;
    }
    // Check for possessive ("X's brother", "the X family")
    else if (/'s\b/.test(sentText) || /\bthe\s+\w+\s+family/i.test(sentText)) {
      pattern = 'possessive';
      confidence = 0.7;
    }

    introductions.set(normalized, {
      entity: normalized,
      sentenceIndex: firstMention.sentenceIndex,
      pattern,
      context: sentText,
      confidence
    });
  }

  return introductions;
}

/**
 * Build entity graph for fast lookups
 */
function buildEntityGraph(
  salience: Map<string, EntitySalience>,
  cooccurrences: EntityCooccurrence[]
): MacroAnalysis['entityGraph'] {
  // Build adjacency list
  const adjacencyList = new Map<string, Set<string>>();

  for (const cooccur of cooccurrences) {
    if (!adjacencyList.has(cooccur.entity1)) {
      adjacencyList.set(cooccur.entity1, new Set());
    }
    if (!adjacencyList.has(cooccur.entity2)) {
      adjacencyList.set(cooccur.entity2, new Set());
    }

    adjacencyList.get(cooccur.entity1)!.add(cooccur.entity2);
    adjacencyList.get(cooccur.entity2)!.add(cooccur.entity1);
  }

  return {
    neighbors: (entity: string): string[] => {
      const normalized = entity.toLowerCase().trim();
      return Array.from(adjacencyList.get(normalized) || []);
    },

    getSalience: (entity: string): number => {
      const normalized = entity.toLowerCase().trim();
      return salience.get(normalized)?.score || 0;
    }
  };
}
