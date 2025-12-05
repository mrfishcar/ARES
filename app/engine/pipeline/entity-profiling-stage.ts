/**
 * Stage 4: Entity Profiling Stage
 *
 * Responsibility: Build entity profiles for adaptive learning
 *
 * Entity profiles track:
 * - Mention frequency (salience)
 * - Context patterns (what sentences mention this entity)
 * - Descriptors ("the wizard", "the chosen one")
 * - Co-occurrence patterns (which entities appear together)
 *
 * These profiles enable:
 * - Better coreference resolution (recency + salience)
 * - Cross-document identity matching
 * - Descriptor-based resolution ("the wizard" → Gandalf)
 */

import { buildProfiles } from '../entity-profiler';
import type { EntityProfile } from '../entity-profiler';
import type {
  EntityProfilingInput,
  EntityProfilingOutput
} from './types';

const STAGE_NAME = 'EntityProfilingStage';

/**
 * Build entity profiles for adaptive learning
 */
export async function runEntityProfilingStage(
  input: EntityProfilingInput
): Promise<EntityProfilingOutput> {
  const startTime = Date.now();
  console.log(`[${STAGE_NAME}] Starting with ${input.entities.length} entities`);

  try {
    // Validate input
    if (!input.entities || !Array.isArray(input.entities)) {
      throw new Error('Invalid input: entities must be an array');
    }

    if (!input.spans || !Array.isArray(input.spans)) {
      throw new Error('Invalid input: spans must be an array');
    }

    if (!input.sentences || !Array.isArray(input.sentences)) {
      throw new Error('Invalid input: sentences must be an array');
    }

    if (!input.docId || typeof input.docId !== 'string') {
      throw new Error('Invalid input: docId must be a non-empty string');
    }

    // Build profiles
    // buildProfiles accumulates knowledge about entities to improve future resolution
    const profiles = buildProfiles(
      input.entities,
      input.spans,
      input.sentences,
      input.docId,
      input.existingProfiles
    );

    const duration = Date.now() - startTime;
    console.log(
      `[${STAGE_NAME}] Complete in ${duration}ms: Built ${profiles.size} entity profiles`
    );

    // Log sample profiles for debugging
    let sampledCount = 0;
    for (const [canonical, profile] of profiles.entries()) {
      if (sampledCount >= 3) break;

      console.log(
        `[${STAGE_NAME}] Profile: "${canonical}" - ${profile.mentions.length} mentions, ${profile.descriptors?.length || 0} descriptors`
      );

      sampledCount++;
    }

    return { profiles };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${STAGE_NAME}] Failed after ${duration}ms:`, error);
    throw new Error(`[${STAGE_NAME}] ${(error as Error).message}`, {
      cause: error
    });
  }
}
