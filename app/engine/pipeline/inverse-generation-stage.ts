/**
 * Stage 9: Inverse Generation Stage
 *
 * Responsibility: Generate inverse relations for bidirectional predicates
 *
 * Example:
 * - If we have parent_of(A, B), create child_of(B, A)
 * - If we have founded(A, B), create founded_by(B, A)
 * - married_to is symmetric, so married_to(A, B) creates married_to(B, A)
 */

import { v4 as uuid } from 'uuid';
import type { Relation } from '../schema';
import { INVERSE } from '../schema';
import type {
  InverseGenerationInput,
  InverseGenerationOutput
} from './types';

const STAGE_NAME = 'InverseGenerationStage';

/**
 * Generate inverse relations for bidirectional predicates
 */
export async function runInverseGenerationStage(
  input: InverseGenerationInput
): Promise<InverseGenerationOutput> {
  const startTime = Date.now();
  console.log(`[${STAGE_NAME}] Starting with ${input.relations.length} relations`);

  try {
    // Validate input
    if (!input.relations || !Array.isArray(input.relations)) {
      throw new Error('Invalid input: relations must be an array');
    }

    const inversesToAdd: Relation[] = [];

    for (const rel of input.relations) {
      // DEBUG: Log child_of relations to track Bill Weasley issue
      if (rel.pred === 'child_of' || rel.pred === 'parent_of') {
        console.log(
          `[${STAGE_NAME}] Found ${rel.pred}(${rel.subj}, ${rel.obj}) from extractor: ${rel.extractor || 'UNKNOWN'}`
        );
      }

      // Check if this predicate has an inverse
      const inversePred = INVERSE[rel.pred];

      if (inversePred) {
        // Create inverse relation
        const inverseRel: Relation = {
          ...rel,
          id: uuid(),
          subj: rel.obj,  // Swap subject and object
          obj: rel.subj,
          pred: inversePred
          // Keep same extractor, evidence, confidence, etc.
        };

        inversesToAdd.push(inverseRel);

        console.log(
          `[${STAGE_NAME}] Generated inverse: ${inversePred}(${inverseRel.subj}, ${inverseRel.obj})`
        );
      }
    }

    // Combine original relations with generated inverses
    const allRelations = [...input.relations, ...inversesToAdd];

    const duration = Date.now() - startTime;
    console.log(
      `[${STAGE_NAME}] Complete in ${duration}ms: ${input.relations.length} → ${allRelations.length} relations (+${inversesToAdd.length} inverses)`
    );

    return {
      relations: allRelations
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${STAGE_NAME}] Failed after ${duration}ms:`, error);
    const err = new Error(`[${STAGE_NAME}] ${(error as Error).message}`);
          (err as any).cause = error;
    throw err;
  }
}
