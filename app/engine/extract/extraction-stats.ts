/**
 * Extraction Stats - Honest Metrics
 *
 * Tracks all stages of the extraction pipeline with full transparency.
 * "rejected: 0" while junk exists is a bug - these stats cannot lie.
 */

import type { NominationSource } from './mention-candidate';
import type { RejectReason, ContextOnlyReason } from './meaning-gate';

// ============================================================================
// STAT TYPES
// ============================================================================

export type PromotionReason =
  | 'mention_threshold'
  | 'introduction_pattern'
  | 'strong_ner_subject'
  | 'header_position'
  | 'whitelist';

export type DeferralReason =
  | 'single_mention'
  | 'weak_evidence'
  | 'context_only_pattern';

export interface ExtractionStats {
  // ========================================
  // NOMINATION STAGE
  // ========================================
  totalNominations: number;
  nominationsBySource: Record<NominationSource, number>;

  // ========================================
  // MEANING GATE STAGE
  // ========================================
  gateResults: {
    nonEntity: number;
    contextOnly: number;
    durableCandidate: number;
  };
  rejectReasons: Record<string, number>;
  contextOnlyReasons: Record<string, number>;

  // ========================================
  // ACCUMULATION STAGE
  // ========================================
  mentionsAccumulated: number;
  uniqueSurfaces: number;

  // ========================================
  // CLUSTERING STAGE
  // ========================================
  clustersFormed: number;
  singletonClusters: number;
  multiMentionClusters: number;

  // ========================================
  // PROMOTION STAGE
  // ========================================
  clustersPromoted: number;
  clustersDeferred: number;
  promotionReasons: Record<string, number>;
  deferralReasons: Record<string, number>;

  // ========================================
  // ENTITY MINTING STAGE
  // ========================================
  entitiesCreated: number;
  entitiesByType: Record<string, number>;
  aliasesAttached: number;

  // ========================================
  // VALIDATION (post-hoc checks)
  // ========================================
  junkDetected: number;  // Should be 0 if pipeline is correct
  junkExamples: string[];
}

// ============================================================================
// STATS COLLECTOR
// ============================================================================

export class StatsCollector {
  private stats: ExtractionStats;

  constructor() {
    this.stats = this.createEmptyStats();
  }

  private createEmptyStats(): ExtractionStats {
    return {
      totalNominations: 0,
      nominationsBySource: {
        NER: 0,
        DEP: 0,
        FALLBACK: 0,
        PATTERN: 0,
      },
      gateResults: {
        nonEntity: 0,
        contextOnly: 0,
        durableCandidate: 0,
      },
      rejectReasons: {},
      contextOnlyReasons: {},
      mentionsAccumulated: 0,
      uniqueSurfaces: 0,
      clustersFormed: 0,
      singletonClusters: 0,
      multiMentionClusters: 0,
      clustersPromoted: 0,
      clustersDeferred: 0,
      promotionReasons: {},
      deferralReasons: {},
      entitiesCreated: 0,
      entitiesByType: {},
      aliasesAttached: 0,
      junkDetected: 0,
      junkExamples: [],
    };
  }

  // ----------------------------------------
  // Nomination tracking
  // ----------------------------------------

  recordNomination(source: NominationSource): void {
    this.stats.totalNominations++;
    this.stats.nominationsBySource[source]++;
  }

  // ----------------------------------------
  // Gate tracking
  // ----------------------------------------

  recordGateResult(
    verdict: 'NON_ENTITY' | 'CONTEXT_ONLY' | 'DURABLE_CANDIDATE',
    reason?: string
  ): void {
    switch (verdict) {
      case 'NON_ENTITY':
        this.stats.gateResults.nonEntity++;
        if (reason) {
          this.stats.rejectReasons[reason] =
            (this.stats.rejectReasons[reason] || 0) + 1;
        }
        break;
      case 'CONTEXT_ONLY':
        this.stats.gateResults.contextOnly++;
        if (reason) {
          this.stats.contextOnlyReasons[reason] =
            (this.stats.contextOnlyReasons[reason] || 0) + 1;
        }
        break;
      case 'DURABLE_CANDIDATE':
        this.stats.gateResults.durableCandidate++;
        break;
    }
  }

  // ----------------------------------------
  // Accumulation tracking
  // ----------------------------------------

  recordMentionAccumulated(): void {
    this.stats.mentionsAccumulated++;
  }

  setUniqueSurfaces(count: number): void {
    this.stats.uniqueSurfaces = count;
  }

  // ----------------------------------------
  // Clustering tracking
  // ----------------------------------------

  recordCluster(mentionCount: number): void {
    this.stats.clustersFormed++;
    if (mentionCount === 1) {
      this.stats.singletonClusters++;
    } else {
      this.stats.multiMentionClusters++;
    }
  }

  // ----------------------------------------
  // Promotion tracking
  // ----------------------------------------

  recordPromotion(reason: PromotionReason): void {
    this.stats.clustersPromoted++;
    this.stats.promotionReasons[reason] =
      (this.stats.promotionReasons[reason] || 0) + 1;
  }

  recordDeferral(reason: DeferralReason): void {
    this.stats.clustersDeferred++;
    this.stats.deferralReasons[reason] =
      (this.stats.deferralReasons[reason] || 0) + 1;
  }

  // ----------------------------------------
  // Entity minting tracking
  // ----------------------------------------

  recordEntityCreated(type: string): void {
    this.stats.entitiesCreated++;
    this.stats.entitiesByType[type] =
      (this.stats.entitiesByType[type] || 0) + 1;
  }

  recordAliasAttached(): void {
    this.stats.aliasesAttached++;
  }

  // ----------------------------------------
  // Validation tracking
  // ----------------------------------------

  recordJunkDetected(example: string): void {
    this.stats.junkDetected++;
    if (this.stats.junkExamples.length < 20) {
      this.stats.junkExamples.push(example);
    }
  }

  // ----------------------------------------
  // Output
  // ----------------------------------------

  getStats(): ExtractionStats {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = this.createEmptyStats();
  }

  /**
   * Generate a summary string for logging
   */
  getSummary(): string {
    const s = this.stats;
    const lines: string[] = [
      '=== Extraction Stats ===',
      '',
      '--- Nomination ---',
      `Total nominations: ${s.totalNominations}`,
      `  NER: ${s.nominationsBySource.NER}`,
      `  DEP: ${s.nominationsBySource.DEP}`,
      `  FALLBACK: ${s.nominationsBySource.FALLBACK}`,
      `  PATTERN: ${s.nominationsBySource.PATTERN}`,
      '',
      '--- Meaning Gate ---',
      `NON_ENTITY (rejected): ${s.gateResults.nonEntity}`,
      `CONTEXT_ONLY: ${s.gateResults.contextOnly}`,
      `DURABLE_CANDIDATE: ${s.gateResults.durableCandidate}`,
    ];

    if (Object.keys(s.rejectReasons).length > 0) {
      lines.push('', 'Rejection reasons:');
      for (const [reason, count] of Object.entries(s.rejectReasons).sort(
        (a, b) => b[1] - a[1]
      )) {
        lines.push(`  ${reason}: ${count}`);
      }
    }

    if (Object.keys(s.contextOnlyReasons).length > 0) {
      lines.push('', 'Context-only reasons:');
      for (const [reason, count] of Object.entries(s.contextOnlyReasons).sort(
        (a, b) => b[1] - a[1]
      )) {
        lines.push(`  ${reason}: ${count}`);
      }
    }

    lines.push(
      '',
      '--- Accumulation ---',
      `Mentions accumulated: ${s.mentionsAccumulated}`,
      `Unique surfaces: ${s.uniqueSurfaces}`,
      '',
      '--- Clustering ---',
      `Clusters formed: ${s.clustersFormed}`,
      `Singleton clusters: ${s.singletonClusters}`,
      `Multi-mention clusters: ${s.multiMentionClusters}`,
      '',
      '--- Promotion ---',
      `Clusters promoted: ${s.clustersPromoted}`,
      `Clusters deferred: ${s.clustersDeferred}`,
    );

    if (Object.keys(s.promotionReasons).length > 0) {
      lines.push('', 'Promotion reasons:');
      for (const [reason, count] of Object.entries(s.promotionReasons)) {
        lines.push(`  ${reason}: ${count}`);
      }
    }

    lines.push(
      '',
      '--- Entity Minting ---',
      `Entities created: ${s.entitiesCreated}`,
      `Aliases attached: ${s.aliasesAttached}`,
    );

    if (Object.keys(s.entitiesByType).length > 0) {
      lines.push('', 'Entities by type:');
      for (const [type, count] of Object.entries(s.entitiesByType)) {
        lines.push(`  ${type}: ${count}`);
      }
    }

    lines.push('', '--- Validation ---', `Junk detected: ${s.junkDetected}`);

    if (s.junkExamples.length > 0) {
      lines.push('', 'Junk examples:');
      for (const example of s.junkExamples) {
        lines.push(`  - "${example}"`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get stats as JSON for API/CLI output
   */
  toJSON(): object {
    return this.stats;
  }
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

let globalCollector: StatsCollector | null = null;

export function getStatsCollector(): StatsCollector {
  if (!globalCollector) {
    globalCollector = new StatsCollector();
  }
  return globalCollector;
}

export function resetStats(): void {
  if (globalCollector) {
    globalCollector.reset();
  }
}

export function createStatsCollector(): StatsCollector {
  return new StatsCollector();
}
