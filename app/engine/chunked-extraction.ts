/**
 * Chunked Long-Form Extraction Pipeline
 *
 * Provides a two-tier chunking approach for processing long documents:
 * 1. Macro-chunks (~5k words) - for progress tracking and memory management
 * 2. Micro-segments (existing 450-600 words) - for extraction precision
 *
 * Config:
 *   ARES_LONGFORM_MODE: 'chunked' | 'legacy' (default: 'legacy')
 *   ARES_CHUNK_SIZE_WORDS: number (default: 5000)
 *   ARES_CHUNK_OVERLAP_CHARS: number (default: 500)
 */

import type { Entity, Relation } from './schema';
import type { EntityProfile } from './entity-profiler';
import type { LLMConfig } from './llm-config';
import type { FictionEntity } from './fiction-extraction';
import type { PatternLibrary } from './pattern-library';
import type { PipelineOutput, Span as PipelineSpan } from './pipeline/types';
import type { BookNLPResult, ARESEntity, ARESSpan } from './booknlp/types';
import { extractFromSegments } from './pipeline/orchestrator';
import { DEFAULT_LLM_CONFIG } from './llm-config';
import { runBookNLPAndAdapt } from './booknlp/runner';
import { toBookNLPEID } from './booknlp/identity';
import { mergeEntitiesAcrossDocs, rewireRelationsToGlobal } from './merge';
import { logDebugIdentity } from './identity-debug';

// ============================================================================
// Configuration
// ============================================================================

export interface ChunkedExtractionConfig {
  /** Target words per macro-chunk (default: 5000) */
  chunkSizeWords: number;
  /** Character overlap between chunks for cross-boundary entity/relation detection (default: 500) */
  overlapChars: number;
  /** Minimum words to form a chunk (prevents tiny final chunks) */
  minChunkWords: number;
  /** Progress callback for UI updates */
  onProgress?: (progress: ChunkProgress) => void;
}

export interface ChunkProgress {
  currentChunk: number;
  totalChunks: number;
  chunkStartOffset: number;
  chunkEndOffset: number;
  entitiesInChunk: number;
  relationsInChunk: number;
  elapsedMs: number;
}

const DEFAULT_CHUNKED_CONFIG: ChunkedExtractionConfig = {
  chunkSizeWords: parseInt(process.env.ARES_CHUNK_SIZE_WORDS || '5000', 10),
  overlapChars: parseInt(process.env.ARES_CHUNK_OVERLAP_CHARS || '500', 10),
  minChunkWords: 1000,
};

interface ChunkStats {
  totalChunks: number;
  totalWords: number;
  processingTimeMs: number;
  wordsPerSecond: number;
}

interface ExtractionResult extends PipelineOutput {
  chunkStats?: ChunkStats;
}

// ============================================================================
// Macro-Chunk Splitter
// ============================================================================

export interface MacroChunk {
  /** Chunk index (0-based) */
  index: number;
  /** Chunk text content */
  text: string;
  /** Start offset in original document */
  globalStart: number;
  /** End offset in original document */
  globalEnd: number;
  /** Word count in this chunk */
  wordCount: number;
  /** Whether this chunk has overlap from the previous chunk */
  hasOverlapPrefix: boolean;
  /** Number of overlap characters at the start (if hasOverlapPrefix) */
  overlapPrefixChars: number;
}

/**
 * Count words in text (consistent with segmenter)
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Find a good split point near a target position
 * Prefers paragraph breaks > sentence breaks > word breaks
 */
function findSplitPoint(text: string, targetPos: number, searchRange: number = 500): number {
  const start = Math.max(0, targetPos - searchRange);
  const end = Math.min(text.length, targetPos + searchRange);
  const region = text.slice(start, end);

  // Try to find paragraph break (double newline)
  const paragraphBreak = region.lastIndexOf('\n\n');
  if (paragraphBreak !== -1) {
    return start + paragraphBreak + 2; // After the paragraph break
  }

  // Try to find sentence end (. ? !)
  const sentenceEnd = region.search(/[.?!]\s+[A-Z]/);
  if (sentenceEnd !== -1) {
    return start + sentenceEnd + 2; // After the punctuation and space
  }

  // Fall back to word break
  const lastSpace = region.lastIndexOf(' ');
  if (lastSpace !== -1) {
    return start + lastSpace + 1;
  }

  // Last resort: split at target
  return targetPos;
}

/**
 * Split document into macro-chunks with overlap
 */
export function splitIntoMacroChunks(
  text: string,
  config: Partial<ChunkedExtractionConfig> = {}
): MacroChunk[] {
  const { chunkSizeWords, overlapChars, minChunkWords } = { ...DEFAULT_CHUNKED_CONFIG, ...config };

  const totalWords = countWords(text);
  if (totalWords <= chunkSizeWords + minChunkWords) {
    // Document is small enough to process as single chunk
    return [{
      index: 0,
      text,
      globalStart: 0,
      globalEnd: text.length,
      wordCount: totalWords,
      hasOverlapPrefix: false,
      overlapPrefixChars: 0,
    }];
  }

  const chunks: MacroChunk[] = [];
  let currentPos = 0;
  let chunkIndex = 0;

  while (currentPos < text.length) {
    // Calculate target end position based on word count
    // Approximate: average word length ~5 chars + 1 space = 6 chars/word
    const targetChunkChars = chunkSizeWords * 6;
    let targetEnd = currentPos + targetChunkChars;

    // Find a good split point
    if (targetEnd < text.length) {
      targetEnd = findSplitPoint(text, targetEnd);
    } else {
      targetEnd = text.length;
    }

    // Extract chunk text with overlap prefix from previous chunk
    let chunkStart = currentPos;
    let overlapPrefixChars = 0;

    if (chunkIndex > 0 && currentPos >= overlapChars) {
      // Include overlap from previous chunk
      chunkStart = currentPos - overlapChars;
      overlapPrefixChars = overlapChars;
    }

    const chunkText = text.slice(chunkStart, targetEnd);
    const chunkWords = countWords(chunkText);

    // Check if remaining text is too small - merge with current chunk
    const remainingText = text.slice(targetEnd);
    const remainingWords = countWords(remainingText);

    if (remainingWords > 0 && remainingWords < minChunkWords) {
      // Merge remaining with current chunk
      targetEnd = text.length;
      const mergedText = text.slice(chunkStart, targetEnd);

      chunks.push({
        index: chunkIndex,
        text: mergedText,
        globalStart: chunkStart,
        globalEnd: targetEnd,
        wordCount: countWords(mergedText),
        hasOverlapPrefix: chunkIndex > 0,
        overlapPrefixChars,
      });
      break;
    }

    chunks.push({
      index: chunkIndex,
      text: chunkText,
      globalStart: chunkStart,
      globalEnd: targetEnd,
      wordCount: chunkWords,
      hasOverlapPrefix: chunkIndex > 0,
      overlapPrefixChars,
    });

    currentPos = targetEnd;
    chunkIndex++;
  }

  return chunks;
}

// ============================================================================
// Cross-Chunk Merge
// ============================================================================

interface ChunkResult {
  chunk: MacroChunk;
  entities: Entity[];
  spans: PipelineSpan[];
  relations: Relation[];
  fictionEntities: FictionEntity[];
  profiles: Map<string, EntityProfile>;
}

/**
 * Adjust span offsets from chunk-local to document-global coordinates
 * Also handles overlap regions to avoid double-counting
 */
function adjustSpansToGlobal(
  spans: PipelineSpan[],
  chunk: MacroChunk
): PipelineSpan[] {
  return spans.map(span => {
    // Spans are relative to chunk.text, but chunk.text may include overlap prefix
    // The actual document position is: chunk.globalStart + span.start
    const globalStart = chunk.globalStart + span.start;
    const globalEnd = chunk.globalStart + span.end;

    return {
      ...span,
      entity_id: span.entity_id,
      start: globalStart,
      end: globalEnd,
    };
  });
}

/**
 * Filter spans that are in the overlap region of subsequent chunks
 * This prevents double-counting entities in overlap regions
 */
function dedupeOverlapSpans(
  allSpans: PipelineSpan[],
  chunks: MacroChunk[]
): PipelineSpan[] {
  // Build a set of overlap regions
  const overlapRegions: Array<{ start: number; end: number }> = [];
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk.hasOverlapPrefix && chunk.overlapPrefixChars > 0) {
      overlapRegions.push({
        start: chunk.globalStart,
        end: chunk.globalStart + chunk.overlapPrefixChars,
      });
    }
  }

  // For spans in overlap regions, prefer the one from the earlier chunk
  // (which will have lower globalStart before overlap adjustment)
  const seen = new Map<string, PipelineSpan>();

  for (const span of allSpans) {
    // Check if this span is in an overlap region
    const inOverlap = overlapRegions.some(region =>
      span.start >= region.start && span.start < region.end
    );

    // Create a key for deduplication
    const key = `${span.entity_id}-${span.start}-${span.end}`;

    if (inOverlap) {
      // If we already have this span from an earlier chunk, skip
      if (seen.has(key)) {
        continue;
      }
    }

    seen.set(key, span);
  }

  return Array.from(seen.values());
}

/**
 * Merge results from all chunks into a unified extraction result
 */
function mergeChunkResults(
  chunkResults: ChunkResult[],
  chunks: MacroChunk[]
): PipelineOutput {
  // 1. Collect all entities
  const allEntities: Entity[] = [];
  for (const result of chunkResults) {
    allEntities.push(...result.entities);
  }

  // 2. Merge entities across chunks using existing Jaro-Winkler clustering
  const mergeResult = mergeEntitiesAcrossDocs(allEntities);
  const { globals: mergedEntities, idMap } = mergeResult;

  console.log(`[CHUNKED-MERGE] Merged ${allEntities.length} entities → ${mergedEntities.length} unique entities`);
  console.log(`[CHUNKED-MERGE] Stats: avg_confidence=${mergeResult.stats.avg_confidence.toFixed(3)}, low_confidence=${mergeResult.stats.low_confidence_count}`);

  // 3. Collect and adjust all spans
  let allSpans: PipelineSpan[] = [];
  for (const result of chunkResults) {
    const adjustedSpans = adjustSpansToGlobal(result.spans, result.chunk);
    // Remap entity IDs to global IDs
    const remappedSpans = adjustedSpans.map(span => ({
      ...span,
      entity_id: idMap.get(span.entity_id) || span.entity_id,
    }));
    allSpans.push(...remappedSpans);
  }

  // 4. Dedupe spans in overlap regions
  allSpans = dedupeOverlapSpans(allSpans, chunks);

  // 5. Collect and rewire all relations
  const allRelations: Relation[] = [];
  for (const result of chunkResults) {
    allRelations.push(...result.relations);
  }

  // Rewire relations to use global entity IDs
  const rewiredRelations = rewireRelationsToGlobal(allRelations, idMap);

  // Dedupe relations (same pred+subj+obj)
  const relationKeys = new Set<string>();
  const uniqueRelations: Relation[] = [];
  for (const rel of rewiredRelations) {
    const key = `${rel.pred}|${rel.subj}|${rel.obj}`;
    if (!relationKeys.has(key)) {
      relationKeys.add(key);
      uniqueRelations.push(rel);
    }
  }

  console.log(`[CHUNKED-MERGE] Merged ${allRelations.length} relations → ${uniqueRelations.length} unique relations`);

  // 6. Collect fiction entities (simple concat, no merging needed)
  const allFictionEntities: FictionEntity[] = [];
  for (const result of chunkResults) {
    allFictionEntities.push(...result.fictionEntities);
  }

  // 7. Merge profiles (take latest for each entity)
  const mergedProfiles = new Map<string, EntityProfile>();
  for (const result of chunkResults) {
    for (const [key, profile] of result.profiles) {
      // Remap key to global ID
      const globalKey = idMap.get(key) || key;
      mergedProfiles.set(globalKey, profile);
    }
  }

  return {
    entities: mergedEntities,
    spans: allSpans,
    relations: uniqueRelations,
    fictionEntities: allFictionEntities,
    profiles: mergedProfiles,
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Helper to yield to event loop
 */
const yieldToEventLoop = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

/**
 * Check if chunked mode is enabled
 */
export function isChunkedModeEnabled(): boolean {
  return process.env.ARES_LONGFORM_MODE === 'chunked';
}

/**
 * Extract entities and relations from a long document using chunked processing
 *
 * This is the main entry point for long-form extraction. It:
 * 1. Splits the document into macro-chunks (~5k words each)
 * 2. Processes each chunk through the existing extractFromSegments pipeline
 * 3. Merges results across chunks with proper offset adjustment and entity clustering
 *
 * Progress is reported via the onProgress callback, and the event loop is
 * yielded between chunks to keep the UI responsive.
 */
export async function extractFromLongDocument(
  docId: string,
  fullText: string,
  existingProfiles?: Map<string, EntityProfile>,
  llmConfig: LLMConfig = DEFAULT_LLM_CONFIG,
  patternLibrary?: PatternLibrary,
  options?: {
    generateHERTs?: boolean;
    autoSaveHERTs?: boolean;
  },
  chunkedConfig?: Partial<ChunkedExtractionConfig>
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const config = { ...DEFAULT_CHUNKED_CONFIG, ...chunkedConfig };
  const totalWords = countWords(fullText);

  // Split document into macro-chunks
  const chunks = splitIntoMacroChunks(fullText, config);

  console.log(`[CHUNKED-EXTRACT] Document: ${totalWords} words → ${chunks.length} chunks (target: ${config.chunkSizeWords} words/chunk)`);

  // If only one chunk, delegate to standard pipeline
  if (chunks.length === 1) {
    console.log(`[CHUNKED-EXTRACT] Single chunk - delegating to standard pipeline`);
    const result = await extractFromSegments(
      docId,
      fullText,
      existingProfiles,
      llmConfig,
      patternLibrary,
      options
    );

    const elapsedMs = Date.now() - startTime;
    return {
      ...result,
      chunkStats: {
        totalChunks: 1,
        totalWords,
        processingTimeMs: elapsedMs,
        wordsPerSecond: Math.round(totalWords / (elapsedMs / 1000)),
      },
    };
  }

  // Process each chunk
  const chunkResults: ChunkResult[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkStartTime = Date.now();

    console.log(`[CHUNKED-EXTRACT] Processing chunk ${i + 1}/${chunks.length} (${chunk.wordCount} words, offset ${chunk.globalStart}-${chunk.globalEnd})`);

    // Create a unique doc ID for this chunk to avoid ID collisions
    const chunkDocId = `${docId}_chunk_${i}`;

    // Extract from this chunk
    const result = await extractFromSegments(
      chunkDocId,
      chunk.text,
      existingProfiles,
      llmConfig,
      patternLibrary,
      options
    );

    chunkResults.push({
      chunk,
      entities: result.entities,
      spans: result.spans,
      relations: result.relations,
      fictionEntities: result.fictionEntities,
      profiles: result.profiles,
    });

    const chunkElapsedMs = Date.now() - chunkStartTime;

    // Report progress
    if (config.onProgress) {
      config.onProgress({
        currentChunk: i + 1,
        totalChunks: chunks.length,
        chunkStartOffset: chunk.globalStart,
        chunkEndOffset: chunk.globalEnd,
        entitiesInChunk: result.entities.length,
        relationsInChunk: result.relations.length,
        elapsedMs: Date.now() - startTime,
      });
    }

    console.log(`[CHUNKED-EXTRACT] Chunk ${i + 1} complete: ${result.entities.length} entities, ${result.relations.length} relations (${chunkElapsedMs}ms)`);

    // Yield to event loop between chunks for responsiveness
    await yieldToEventLoop();
  }

  // Merge all chunk results
  console.log(`[CHUNKED-EXTRACT] Merging results from ${chunks.length} chunks...`);
  const mergedResult = mergeChunkResults(chunkResults, chunks);

  const elapsedMs = Date.now() - startTime;
  const wordsPerSecond = Math.round(totalWords / (elapsedMs / 1000));

  console.log(`[CHUNKED-EXTRACT] ✅ Complete: ${mergedResult.entities.length} entities, ${mergedResult.relations.length} relations in ${(elapsedMs / 1000).toFixed(1)}s (${wordsPerSecond} words/sec)`);

  return {
    ...mergedResult,
    chunkStats: {
      totalChunks: chunks.length,
      totalWords,
      processingTimeMs: elapsedMs,
      wordsPerSecond,
    },
  };
}

function mergeBookNLPCharacters(
  pipelineEntities: Entity[],
  bookEntities: Entity[],
): Entity[] {
  const byKey = new Map<string, Entity>();
  const keyFor = (e: Entity) => `${e.type}::${e.canonical.toLowerCase()}`;

  for (const entity of bookEntities) {
    byKey.set(keyFor(entity), entity);
  }

  for (const entity of pipelineEntities) {
    const key = keyFor(entity);
    if (entity.type === 'PERSON' && byKey.has(key)) {
      // Prefer BookNLP cluster for person entities to avoid duplicates
      continue;
    }
    if (!byKey.has(key)) {
      byKey.set(key, entity);
    }
  }

  return Array.from(byKey.values());
}

function mapBookNLPSpans(spans: ARESSpan[]): PipelineSpan[] {
  return spans.map(span => ({
    entity_id: span.entity_id,
    start: span.start,
    end: span.end,
    text: span.text,
    mention_id: span.mention_id,
    mention_type: span.mention_type,
    source: 'booknlp',
  }));
}

function toSchemaEntities(booknlpEntities: ARESEntity[]): Entity[] {
  const created_at = new Date().toISOString();
  return booknlpEntities.map(entity => ({
    id: entity.id,
    canonical: entity.canonical,
    type: entity.type as Entity['type'],
    aliases: entity.aliases,
    confidence: entity.confidence,
    source: entity.source,
    booknlp_id: entity.booknlp_id,
    mention_count: entity.mention_count,
    gender: entity.gender,
    eid: entity.eid ?? (entity.booknlp_id ? toBookNLPEID(entity.booknlp_id) : undefined),
    created_at,
    centrality: 1,
  }));
}

async function attachBookNLPBaseline(
  docId: string,
  fullText: string,
  baseResult: ExtractionResult,
  precomputedResult?: BookNLPResult,
  baselineRequired: boolean = false,
  debugRunId?: string,
): Promise<ExtractionResult> {
  try {
    const booknlpResult: BookNLPResult =
      precomputedResult || await runBookNLPAndAdapt(fullText, docId);
    logDebugIdentity(debugRunId, 'booknlp_result', {
      entities: booknlpResult.entities.length,
      mentions: booknlpResult.spans.length,
      uniqueClusterIds: new Set(booknlpResult.entities.map(e => e.booknlp_id)).size,
    });
    const bookEntities = toSchemaEntities(booknlpResult.entities);
    const mergedEntities = mergeBookNLPCharacters(baseResult.entities, bookEntities);
    const mergedSpans = [...(baseResult.spans || []), ...mapBookNLPSpans(booknlpResult.spans)];

    return {
      ...baseResult,
      entities: mergedEntities,
      spans: mergedSpans,
      booknlp: booknlpResult,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (baselineRequired) {
      throw new Error(`[EXTRACT-STRATEGY] BookNLP baseline required but unavailable: ${message}`);
    }
    console.warn(`[EXTRACT-STRATEGY] BookNLP baseline unavailable: ${message}`);
    return baseResult;
  }
}

/**
 * Smart extraction entry point that chooses between chunked and legacy modes
 * based on document size and configuration
 */
export async function extractWithOptimalStrategy(
  docId: string,
  fullText: string,
  existingProfiles?: Map<string, EntityProfile>,
  llmConfig: LLMConfig = DEFAULT_LLM_CONFIG,
  patternLibrary?: PatternLibrary,
  options?: {
    generateHERTs?: boolean;
    autoSaveHERTs?: boolean;
    debugIdentity?: boolean;
    debugRunId?: string;
  },
  chunkedConfig?: Partial<ChunkedExtractionConfig>
): Promise<ExtractionResult> {
  const totalWords = countWords(fullText);
  const config = { ...DEFAULT_CHUNKED_CONFIG, ...chunkedConfig };
  const debugEnabled = options?.debugIdentity === true;
  const debugRunId = debugEnabled ? options?.debugRunId : undefined;
  const extractionMode = (process.env.ARES_MODE || '').toLowerCase();
  const isLegacyMode = extractionMode === 'legacy';
  const baselineRequired = !isLegacyMode;

  // Run BookNLP first when baseline is required (default) so cluster IDs exist
  // before the rest of the pipeline executes.
  let booknlpResult: BookNLPResult | undefined;
  if (baselineRequired) {
    booknlpResult = await runBookNLPAndAdapt(fullText, docId);
  }

  // Use chunked mode if:
  // 1. Explicitly enabled via env var, OR
  // 2. Document is large enough to benefit from chunking (> chunkSizeWords * 1.5)
  const useChunked = isChunkedModeEnabled() || totalWords > config.chunkSizeWords * 1.5;

  let baseResult: ExtractionResult;

  if (useChunked && totalWords > config.chunkSizeWords) {
    console.log(`[EXTRACT-STRATEGY] Using CHUNKED mode for ${totalWords} words`);
    baseResult = await extractFromLongDocument(
      docId,
      fullText,
      existingProfiles,
      llmConfig,
      patternLibrary,
      options,
      chunkedConfig
    );
  } else {
    console.log(`[EXTRACT-STRATEGY] Using LEGACY mode for ${totalWords} words`);
    const startTime = Date.now();
    const result = await extractFromSegments(
      docId,
      fullText,
      existingProfiles,
      llmConfig,
      patternLibrary,
      options
    );

    const elapsedMs = Date.now() - startTime;
    baseResult = {
      ...result,
      chunkStats: {
        totalChunks: 1,
        totalWords,
        processingTimeMs: elapsedMs,
        wordsPerSecond: Math.round(totalWords / (elapsedMs / 1000)),
      },
    };
  }

  if (debugEnabled) {
    const byType: Record<string, number> = {};
    for (const e of baseResult.entities) {
      byType[e.type] = (byType[e.type] || 0) + 1;
    }
    logDebugIdentity(debugRunId, 'local_extraction_result', {
      entityCount: baseResult.entities.length,
      byType,
    });
  }

  if (isLegacyMode) {
    return baseResult;
  }

  // Attach BookNLP baseline (required if mode is not legacy)
  return attachBookNLPBaseline(docId, fullText, baseResult, booknlpResult, baselineRequired, debugRunId);
}
