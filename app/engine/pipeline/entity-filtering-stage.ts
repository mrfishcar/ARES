/**
 * Stage 3: Entity Filtering Stage
 *
 * Responsibility: Filter low-quality entity candidates (Precision Defense Layer 1)
 *
 * Filters:
 * - Low confidence entities
 * - Too-short entities (< min length)
 * - Blocked tokens (pronouns, common words)
 * - Missing capitalization
 * - Invalid characters
 * - Invalid dates
 * - Generic/ambiguous entities
 *
 * Expected Impact: +5-10% precision improvement
 */

import {
  filterLowQualityEntities,
  isEntityFilterEnabled,
  getFilterConfig,
  getFilterStats
} from '../entity-quality-filter';
import type {
  EntityFilteringInput,
  EntityFilteringOutput,
  FilterStats
} from './types';

const STAGE_NAME = 'EntityFilteringStage';

/**
 * Filter low-quality entity candidates
 */
export async function runEntityFilteringStage(
  input: EntityFilteringInput
): Promise<EntityFilteringOutput> {
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

    if (!input.entityMap || !(input.entityMap instanceof Map)) {
      throw new Error('Invalid input: entityMap must be a Map');
    }

    const preFilterCount = input.entities.length;
    let filteredEntities = input.entities;
    let stats: FilterStats;

    // Check if filtering is enabled (either via config or global flag)
    if (input.config.enabled || isEntityFilterEnabled()) {
      const config = input.config.enabled ? input.config : getFilterConfig();

      // Apply quality filter
      filteredEntities = filterLowQualityEntities(input.entities, config);
      stats = getFilterStats(input.entities, filteredEntities, config);

      console.log(`[${STAGE_NAME}] 🛡️ Layer 1: Entity Quality Filter`);
      console.log(`  Original entities: ${stats.original}`);
      console.log(`  Filtered entities: ${stats.filtered}`);
      console.log(`  Removed: ${stats.removed} (${(stats.removalRate * 100).toFixed(1)}%)`);
      console.log(`  Removal reasons:`);
      console.log(`    - Low confidence: ${stats.removedByReason.lowConfidence}`);
      console.log(`    - Too short: ${stats.removedByReason.tooShort}`);
      console.log(`    - Blocked token: ${stats.removedByReason.blockedToken}`);
      console.log(`    - No capitalization: ${stats.removedByReason.noCapitalization}`);
      console.log(`    - Invalid characters: ${stats.removedByReason.invalidCharacters}`);
      console.log(`    - Invalid date: ${stats.removedByReason.invalidDate}`);
      console.log(`    - Too generic: ${stats.removedByReason.tooGeneric}`);
      console.log(`    - Strict mode: ${stats.removedByReason.strictMode}`);
    } else {
      console.log(`[${STAGE_NAME}] Filtering disabled, keeping all entities`);
      stats = {
        original: input.entities.length,
        filtered: input.entities.length,
        removed: 0,
        removalRate: 0,
        removedByReason: {
          lowConfidence: 0,
          tooShort: 0,
          blockedToken: 0,
          noCapitalization: 0,
          invalidCharacters: 0,
          invalidDate: 0,
          tooGeneric: 0,
          strictMode: 0
        }
      };
    }

    // Update entityMap to only include filtered entities
    const filteredIds = new Set(filteredEntities.map(e => e.id));
    const updatedEntityMap = new Map<string, import('../schema').Entity>();

    for (const [key, entity] of Array.from(input.entityMap.entries())) {
      if (filteredIds.has(entity.id)) {
        updatedEntityMap.set(key, entity);
      }
    }

    // Update spans to only include spans for filtered entities
    const validSpans = input.spans.filter(s => filteredIds.has(s.entity_id));

    const duration = Date.now() - startTime;
    console.log(
      `[${STAGE_NAME}] Complete in ${duration}ms: ${preFilterCount} → ${filteredEntities.length} entities, ${input.spans.length} → ${validSpans.length} spans`
    );

    return {
      entities: filteredEntities,
      spans: validSpans,
      entityMap: updatedEntityMap,
      filterStats: stats
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${STAGE_NAME}] Failed after ${duration}ms:`, error);
    const err = new Error(`[${STAGE_NAME}] ${(error as Error).message}`);
          (err as any).cause = error;
    throw err;
  }
}
