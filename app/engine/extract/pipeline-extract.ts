/**
 * Pipeline-Based Entity Extraction
 *
 * This module provides the new logic-first, grammar-first extraction
 * that replaces the old "mint early, filter late" approach.
 *
 * Usage:
 *   Set ARES_PIPELINE=true to enable the new pipeline
 *   Or call extractWithPipeline() directly
 */

import type { ParsedSentence } from './parse-types';
import type { Entity } from '../schema';
import { runExtractionPipeline, type PipelineResult } from './pipeline';
import { createPromotionConfig, DEFAULT_PROMOTION_CONFIG } from './promotion-gate';

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface PipelineExtractionConfig {
  /** Document ID */
  docId?: string;

  /** Enable debug logging */
  debug?: boolean;

  /** Minimum mention count for promotion (default: 2) */
  mentionThreshold?: number;

  /** Allow single-mention entities with strong NER */
  allowStrongNERSingleton?: boolean;

  /** Entity whitelist (always promoted) */
  whitelist?: string[];
}

// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================

/**
 * Extract entities using the new pipeline
 */
export function extractWithPipeline(
  sentences: ParsedSentence[],
  fullText: string,
  config: PipelineExtractionConfig = {}
): PipelineResult {
  const debug = config.debug ?? process.env.ARES_PIPELINE_DEBUG === 'true';
  const docId = config.docId ?? 'doc';

  const promotionConfig = createPromotionConfig({
    mentionThreshold: config.mentionThreshold ?? 2,
    allowStrongNERSingleton: config.allowStrongNERSingleton ?? true,
    allowIntroductionPattern: true,
    whitelist: new Set(config.whitelist ?? []),
  });

  const result = runExtractionPipeline(sentences, fullText, {
    promotion: promotionConfig,
    debug,
    docId,
  });

  return result;
}

/**
 * Check if the new pipeline is enabled
 */
export function isPipelineEnabled(): boolean {
  return process.env.ARES_PIPELINE === 'true' || process.env.ARES_PIPELINE === '1';
}

/**
 * Get stats summary from pipeline result
 */
export function getStatsSummary(result: PipelineResult): string {
  const s = result.stats;
  const lines: string[] = [
    '=== Pipeline Extraction Stats ===',
    '',
    `Nominations: ${s.totalNominations}`,
    `  - NER: ${s.nominationsBySource.NER}`,
    `  - DEP: ${s.nominationsBySource.DEP}`,
    '',
    `Gate Results:`,
    `  - NON_ENTITY (rejected): ${s.gateResults.nonEntity}`,
    `  - CONTEXT_ONLY: ${s.gateResults.contextOnly}`,
    `  - DURABLE: ${s.gateResults.durableCandidate}`,
    '',
    `Clusters: ${s.clustersFormed}`,
    `  - Singletons: ${s.singletonClusters}`,
    `  - Multi-mention: ${s.multiMentionClusters}`,
    '',
    `Promotion:`,
    `  - Promoted: ${s.clustersPromoted}`,
    `  - Deferred: ${s.clustersDeferred}`,
    '',
    `Final Output:`,
    `  - Entities: ${s.entitiesCreated}`,
    `  - Aliases: ${s.aliasesAttached}`,
  ];

  // Add rejection reasons if any
  if (Object.keys(s.rejectReasons).length > 0) {
    lines.push('', 'Rejection Reasons:');
    for (const [reason, count] of Object.entries(s.rejectReasons).sort((a, b) => b[1] - a[1])) {
      lines.push(`  - ${reason}: ${count}`);
    }
  }

  return lines.join('\n');
}

/**
 * Convert pipeline result to legacy format for backward compatibility
 */
export function toLegacyResult(result: PipelineResult): {
  entities: Entity[];
  spans: Array<{ entity_id: string; start: number; end: number }>;
  meta: {
    classifierRejected: number;
    contextOnlyMentions: number;
    durableMentions: number;
    rejectedMentions: number;
    pipelineStats: typeof result.stats;
  };
} {
  return {
    entities: result.entities,
    spans: result.spans.map(s => ({
      entity_id: s.entity_id,
      start: s.start,
      end: s.end,
    })),
    meta: {
      classifierRejected: 0, // Not used in pipeline
      contextOnlyMentions: result.stats.gateResults.contextOnly,
      durableMentions: result.stats.gateResults.durableCandidate,
      rejectedMentions: result.stats.gateResults.nonEntity,
      pipelineStats: result.stats,
    },
  };
}
