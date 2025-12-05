/**
 * Stage 7: Relation Extraction Stage
 *
 * Responsibility: Extract relation candidates from text
 *
 * Extraction methods:
 * 1. Dependency path patterns - Extract from spaCy dependency trees
 * 2. Narrative patterns - Extract from narrative text patterns
 *
 * Operations:
 * - Process each segment with context window
 * - Extract relations using dependency paths (extractRelations)
 * - Extract relations using narrative patterns (extractAllNarrativeRelations)
 * - Remap evidence spans to absolute coordinates
 * - Attach sentence indices for proximity filtering
 *
 * This stage produces raw relation candidates before filtering.
 */

import { extractRelations } from '../extract/relations';
import { extractAllNarrativeRelations } from '../narrative-relations';
import { splitIntoSentences } from '../segment';
import type { Relation } from '../schema';
import type {
  RelationExtractionInput,
  RelationExtractionOutput,
  Segment,
  Sentence,
  EntityLookup
} from './types';

const STAGE_NAME = 'RelationExtractionStage';

// Larger context window for multi-paragraph narratives
const CONTEXT_WINDOW_SIZE = 1000; // Increased from 200 to handle Stage 3 multi-paragraph tests

/**
 * Extract relation candidates from text
 */
export async function runRelationExtractionStage(
  input: RelationExtractionInput
): Promise<RelationExtractionOutput> {
  const startTime = Date.now();
  console.log(
    `[${STAGE_NAME}] Starting with ${input.entities.length} entities, ${input.segments.length} segments`
  );

  try {
    // Validate input
    if (!input.segments || !Array.isArray(input.segments)) {
      throw new Error('Invalid input: segments must be an array');
    }

    if (!input.entities || !Array.isArray(input.entities)) {
      throw new Error('Invalid input: entities must be an array');
    }

    if (!input.spans || !Array.isArray(input.spans)) {
      throw new Error('Invalid input: spans must be an array');
    }

    if (!input.processedText || typeof input.processedText !== 'string') {
      throw new Error('Invalid input: processedText must be a non-empty string');
    }

    if (!input.docId || typeof input.docId !== 'string') {
      throw new Error('Invalid input: docId must be a non-empty string');
    }

    if (!input.entityLookup || !Array.isArray(input.entityLookup)) {
      throw new Error('Invalid input: entityLookup must be an array');
    }

    // Split processed text into sentences for evidence mapping
    const sentences: Sentence[] = splitIntoSentences(input.processedText);

    // Helper to find sentence index from character position
    const findSentenceIndex = (start: number, end: number): number => {
      const midpoint = Math.floor((start + end) / 2);
      const containingIdx = sentences.findIndex(s => midpoint >= s.start && midpoint <= s.end);
      if (containingIdx !== -1) return containingIdx;
      const overlappingIdx = sentences.findIndex(s => start < s.end && end > s.start);
      return overlappingIdx === -1 ? 0 : overlappingIdx;
    };

    // Helper to remap evidence spans to absolute coordinates
    const remapEvidence = (rel: Relation, offset: number): Relation => {
      if (!rel.evidence || rel.evidence.length === 0) return rel;

      const mappedEvidence = rel.evidence.map(ev => {
        const spanStart = ev.span?.start != null ? ev.span.start + offset : undefined;
        const spanEnd = ev.span?.end != null ? ev.span.end + offset : spanStart;

        // Prefer existing sentence_index if provided; otherwise compute from span
        const sentence_index =
          ev.sentence_index != null
            ? ev.sentence_index
            : spanStart != null && spanEnd != null
              ? findSentenceIndex(spanStart, spanEnd)
              : 0;

        return {
          ...ev,
          doc_id: input.docId,
          sentence_index,
          span: ev.span
            ? {
                ...ev.span,
                start: spanStart ?? ev.span.start,
                end: spanEnd ?? ev.span.end,
                text:
                  spanStart != null && spanEnd != null
                    ? input.processedText.slice(spanStart, spanEnd)
                    : ev.span.text
              }
            : ev.span
        };
      });

      return { ...rel, evidence: mappedEvidence };
    };

    const allRelations: Relation[] = [];

    // ========================================================================
    // EXTRACTION 1: DEPENDENCY PATH PATTERNS
    // ========================================================================

    console.log(`[${STAGE_NAME}] Extracting relations from ${input.segments.length} segments`);

    for (const seg of input.segments) {
      // Build context window (±1000 chars)
      const contextBefore = input.processedText.slice(
        Math.max(0, seg.start - CONTEXT_WINDOW_SIZE),
        seg.start
      );
      const contextAfter = input.processedText.slice(
        seg.end,
        Math.min(input.processedText.length, seg.end + CONTEXT_WINDOW_SIZE)
      );
      const window = contextBefore + seg.text + contextAfter;
      const segOffsetInWindow = contextBefore.length;

      // Get entities and spans that overlap with this window
      const windowSpans = input.spans.filter(s => {
        // Map to window coordinates
        const windowStart = s.start - seg.start + segOffsetInWindow;
        const windowEnd = s.end - seg.start + segOffsetInWindow;
        return windowStart >= 0 && windowEnd <= window.length;
      });

      const windowEntities = input.entities.filter(e =>
        windowSpans.some(s => s.entity_id === e.id)
      );

      // Map spans to window coordinates
      const mappedSpans = windowSpans.map(s => ({
        entity_id: s.entity_id,
        start: s.start - seg.start + segOffsetInWindow,
        end: s.end - seg.start + segOffsetInWindow
      }));

      // Extract relations from window
      const rels = await extractRelations(
        window,
        { entities: windowEntities, spans: mappedSpans },
        input.docId
      );

      // Remap to use merged entity IDs and absolute coordinates
      const baseOffset = seg.start - contextBefore.length;

      for (const rel of rels) {
        const subjEntity = windowEntities.find(e => e.id === rel.subj);
        const objEntity = windowEntities.find(e => e.id === rel.obj);

        if (subjEntity && objEntity) {
          const subjKey = `${subjEntity.type}::${subjEntity.canonical.toLowerCase()}`;
          const objKey = `${objEntity.type}::${objEntity.canonical.toLowerCase()}`;

          const mergedSubj = input.entityMap.get(subjKey);
          const mergedObj = input.entityMap.get(objKey);

          allRelations.push(
            remapEvidence(
              {
                ...rel,
                subj: mergedSubj?.id || rel.subj,
                obj: mergedObj?.id || rel.obj
              },
              baseOffset
            )
          );
        }
      }
    }

    console.log(
      `[${STAGE_NAME}] Dependency extraction: ${allRelations.length} relations`
    );

    // ========================================================================
    // EXTRACTION 2: NARRATIVE PATTERNS
    // ========================================================================

    // Extract narrative relations (pattern-based extraction)
    // Pass coref links to enable resolution of "the couple", "their", etc.
    // Use processedText (with deictic resolutions) instead of fullText
    const narrativeRelations = extractAllNarrativeRelations(
      input.processedText,
      input.entityLookup,
      input.docId,
      { links: input.corefLinks }
    );

    const narrativeRelationsWithContext = narrativeRelations.map(rel =>
      remapEvidence(rel, 0)
    );

    console.log(
      `[${STAGE_NAME}] Narrative extraction: ${narrativeRelationsWithContext.length} relations`
    );

    // Combine all relation sources
    const combinedRelations = [...allRelations, ...narrativeRelationsWithContext];

    const duration = Date.now() - startTime;
    console.log(
      `[${STAGE_NAME}] Complete in ${duration}ms: Extracted ${combinedRelations.length} total relations`
    );
    console.log(
      `  - Dependency patterns: ${allRelations.length}`
    );
    console.log(
      `  - Narrative patterns: ${narrativeRelationsWithContext.length}`
    );

    return {
      relations: combinedRelations
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${STAGE_NAME}] Failed after ${duration}ms:`, error);
    throw new Error(`[${STAGE_NAME}] ${(error as Error).message}`, {
      cause: error
    });
  }
}
