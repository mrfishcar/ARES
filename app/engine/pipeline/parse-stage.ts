/**
 * Stage 1: Document Parse Stage
 *
 * Responsibility: Parse raw text into structured linguistic representation
 *
 * Operations:
 * 1. Segment document into chunks with context windows
 * 2. Split into sentences for proximity analysis
 * 3. Call spaCy parser service for NLP analysis
 * 4. Build parse cache for efficiency
 *
 * This is the foundation stage - all downstream stages depend on its output.
 */

import { segmentDocument, normalizeWhitespace } from '../segmenter';
import { splitIntoSentences } from '../segment';
import type { ParsedSentence } from '../extract/parse-types';
import type {
  ParseStageInput,
  ParseStageOutput,
  Segment,
  Sentence
} from './types';

const STAGE_NAME = 'DocumentParseStage';

/**
 * Parse raw text into structured representation
 */
export async function runDocumentParseStage(
  input: ParseStageInput
): Promise<ParseStageOutput> {
  const startTime = Date.now();
  const wordCount = input.fullText.split(/\s+/).length;
  console.log(
    `[${STAGE_NAME}] Starting: ${input.fullText.length} chars, ~${wordCount} words`
  );

  try {
    // Validate input
    if (!input.docId || typeof input.docId !== 'string') {
      throw new Error('Invalid input: docId must be a non-empty string');
    }

    if (!input.fullText || typeof input.fullText !== 'string') {
      throw new Error('Invalid input: fullText must be a non-empty string');
    }

    // IMPORTANT: Normalize text first to ensure segment positions match fullText positions
    // The segmenter internally normalizes, so we must use the same normalized text
    // throughout the pipeline to avoid character offset mismatches
    const normalizedText = normalizeWhitespace(input.fullText);

    // 1. Segment the document into chunks with context windows
    // Note: segmentDocument also normalizes, so this is consistent
    const segments: Segment[] = segmentDocument(input.docId, normalizedText);

    // Sort segments deterministically (already sorted by segmentDocument, but be explicit)
    segments.sort((a, b) => {
      if (a.paraIndex !== b.paraIndex) return a.paraIndex - b.paraIndex;
      return a.sentIndex - b.sentIndex;
    });

    console.log(
      `[${STAGE_NAME}] Segmented into ${segments.length} chunks`
    );

    // 2. Split into sentences for proximity analysis and coreference
    // Use normalized text to ensure sentence positions match segment positions
    const sentences: Sentence[] = splitIntoSentences(normalizedText);

    console.log(
      `[${STAGE_NAME}] Split into ${sentences.length} sentences`
    );

    // 3. Build parse cache (populated lazily during extraction)
    // The parse cache will be populated by entity/relation extraction stages
    // as they call the spaCy parser service
    const parseCache = new Map<string, ParsedSentence>();

    const duration = Date.now() - startTime;
    console.log(
      `[${STAGE_NAME}] Complete in ${duration}ms: ${segments.length} segments, ${sentences.length} sentences`
    );

    return {
      docId: input.docId,
      fullText: normalizedText,  // Use normalized text to match segment positions
      segments,
      sentences,
      parseCache
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${STAGE_NAME}] Failed after ${duration}ms:`, error);
    const err = new Error(`[${STAGE_NAME}] ${(error as Error).message}`);
    (err as any).cause = error;
    throw err;
  }
}
