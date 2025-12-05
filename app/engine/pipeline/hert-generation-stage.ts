/**
 * Stage 13: HERT Generation Stage (Optional)
 *
 * Responsibility: Generate HERT IDs for entity occurrences
 *
 * HERT (Hierarchical Entity Reference Tag) provides stable, compact entity references
 * that encode:
 * - EID (stable entity ID)
 * - AID (surface form/alias ID)
 * - SP (sense path for disambiguation)
 * - Document fingerprint
 * - Paragraph and token location
 *
 * Example: HERTv1:1J8trXOyn4HRaWXrdh9TUE
 *
 * This stage is optional and only runs if options.generateHERTs is true.
 */

import type {
  HERTGenerationInput,
  HERTGenerationOutput
} from './types';

const STAGE_NAME = 'HERTGenerationStage';

/**
 * Generate HERT IDs for entity occurrences
 */
export async function runHERTGenerationStage(
  input: HERTGenerationInput
): Promise<HERTGenerationOutput> {
  const startTime = Date.now();
  console.log(`[${STAGE_NAME}] Starting with ${input.spans.length} entity spans`);

  try {
    // Validate input
    if (!input.entities || !Array.isArray(input.entities)) {
      throw new Error('Invalid input: entities must be an array');
    }

    if (!input.spans || !Array.isArray(input.spans)) {
      throw new Error('Invalid input: spans must be an array');
    }

    if (!input.options.generateHERTs) {
      console.log(`[${STAGE_NAME}] HERT generation disabled, skipping`);
      return { herts: [] };
    }

    // Dynamically import HERT modules
    const { createHERT, encodeHERT, generateDID, hashContent } = await import('../hert');

    // Generate content hash and DID
    const contentHash = hashContent(input.fullText);
    const did = generateDID(input.docId, contentHash, 1);

    console.log(`[${STAGE_NAME}] Generated DID: ${did}, content hash: ${contentHash}`);

    const herts: string[] = [];

    // Generate HERT for each span
    for (const span of input.spans) {
      // Find corresponding entity
      const entity = input.entities.find(e => e.id === span.entity_id);

      if (!entity || !entity.eid) {
        console.warn(
          `[${STAGE_NAME}] Skipping span ${span.start}-${span.end}: entity not found or missing EID`
        );
        continue;
      }

      // Calculate paragraph number (count double newlines before this position)
      const textBefore = input.fullText.substring(0, span.start);
      const paragraph = (textBefore.match(/\n\n/g) || []).length;

      // Create HERT
      const hert = createHERT({
        eid: entity.eid,
        aid: entity.aid,  // Phase 3: Include alias ID
        sp: entity.sp,    // Phase 4: Include sense path
        documentPath: input.docId,
        contentHash,
        paragraph,
        tokenStart: span.start,
        tokenLength: span.end - span.start,
        confidence:
          (entity.attrs?.pattern_confidence as number) ||
          (entity.attrs?.confidence as number) ||
          1.0
      });

      // Encode to string
      const encoded = encodeHERT(hert);
      herts.push(encoded);
    }

    // Auto-save to HERT store if requested
    if (input.options.autoSaveHERTs && herts.length > 0) {
      const { hertStore } = await import('../../storage/hert-store');
      hertStore.addMany(herts);
      console.log(`[${STAGE_NAME}] Saved ${herts.length} HERTs to store`);
    }

    const duration = Date.now() - startTime;
    console.log(
      `[${STAGE_NAME}] Complete in ${duration}ms: Generated ${herts.length} HERTs`
    );

    return { herts };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${STAGE_NAME}] Failed after ${duration}ms:`, error);
    const err = new Error(`[${STAGE_NAME}] ${(error as Error).message}`);
          (err as any).cause = error;
    throw err;
  }
}
