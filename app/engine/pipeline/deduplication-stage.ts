/**
 * Stage 10: Deduplication Stage
 *
 * Responsibility: Merge duplicate relations (Precision Defense Layer 3)
 *
 * Problem: Same relation extracted multiple times
 * - Pattern 1: "Aragorn married Arwen" → married_to(Aragorn, Arwen) [0.85]
 * - Pattern 2: "Aragorn and Arwen married" → married_to(Aragorn, Arwen) [0.80]
 *
 * Solution: Merge duplicates, keep highest confidence, merge evidence
 *
 * Expected Impact: 10-15% precision improvement
 */

import {
  deduplicateRelations,
  getDeduplicationStats,
  isDeduplicationEnabled
} from '../relation-deduplicator';
import type {
  DeduplicationInput,
  DeduplicationOutput,
  DeduplicationStats
} from './types';

const STAGE_NAME = 'DeduplicationStage';

/**
 * Deduplicate relations by merging duplicates
 */
export async function runDeduplicationStage(
  input: DeduplicationInput
): Promise<DeduplicationOutput> {
  const startTime = Date.now();
  console.log(`[${STAGE_NAME}] Starting with ${input.relations.length} relations`);

  try {
    // Validate input
    if (!input.relations || !Array.isArray(input.relations)) {
      throw new Error('Invalid input: relations must be an array');
    }

    let deduplicated: import('../schema').Relation[];
    let stats: DeduplicationStats;

    if (input.config.enabled || isDeduplicationEnabled()) {
      // Use full deduplication with statistics
      const preDedupeCount = input.relations.length;
      deduplicated = deduplicateRelations(input.relations);
      stats = getDeduplicationStats(input.relations, deduplicated);

      console.log(`[${STAGE_NAME}] 🛡️ Layer 3: Relation Deduplication`);
      console.log(`  Original relations: ${stats.original}`);
      console.log(`  Deduplicated relations: ${stats.deduplicated}`);
      console.log(`  Removed duplicates: ${stats.removed} (${(stats.removalRate * 100).toFixed(1)}%)`);
      console.log(`  Duplicate groups: ${stats.duplicateGroups}`);
      console.log(`  Avg group size: ${stats.avgGroupSize.toFixed(1)}`);
      console.log(`  Max group size: ${stats.maxGroupSize}`);
    } else {
      // Fallback: Simple deduplication by key
      console.log(`[${STAGE_NAME}] Using simple deduplication (config.enabled=false)`);

      const uniqueMap = new Map<string, import('../schema').Relation>();

      for (const rel of input.relations) {
        const key = `${rel.subj}::${rel.pred}::${rel.obj}`;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, rel);
        }
      }

      deduplicated = Array.from(uniqueMap.values());

      stats = {
        original: input.relations.length,
        deduplicated: deduplicated.length,
        removed: input.relations.length - deduplicated.length,
        removalRate: (input.relations.length - deduplicated.length) / input.relations.length,
        duplicateGroups: 0,
        avgGroupSize: 1,
        maxGroupSize: 1
      };
    }

    const duration = Date.now() - startTime;
    console.log(
      `[${STAGE_NAME}] Complete in ${duration}ms: ${input.relations.length} → ${deduplicated.length} relations`
    );

    return {
      relations: deduplicated,
      deduplicationStats: stats
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${STAGE_NAME}] Failed after ${duration}ms:`, error);
    const err = new Error(`[${STAGE_NAME}] ${(error as Error).message}`);
          (err as any).cause = error;
    throw err;
  }
}
