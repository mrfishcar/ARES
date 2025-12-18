/**
 * Entity Extraction Pipeline - Logic-First, Grammar-First
 *
 * This module implements the new extraction architecture:
 *   Mention Nomination → Meaning Gate → Buffer → Clustering → Promotion → Minting
 *
 * Key principles:
 * - NO open-class blocklists (closed-class only)
 * - Entities are minted LATE, not early
 * - Stats are honest (rejected > 0 when junk exists)
 * - Deterministic and explainable
 */

import type { ParsedSentence, Token } from './parse-types';
import type { Entity, EntityType } from '../schema';
import {
  type MentionCandidate,
  type NominationSource,
  createCandidate,
  normalizeSurface,
} from './mention-candidate';
import {
  type GateResult,
  type GateVerdict,
  applyMeaningGate,
} from './meaning-gate';
import {
  type DurableMention,
  type MentionBuffer,
  createMentionBuffer,
} from './mention-buffer';
import {
  type MentionCluster,
  clusterMentions,
} from './mention-cluster';
import {
  type PromotionConfig,
  DEFAULT_PROMOTION_CONFIG,
  processClusterPromotion,
} from './promotion-gate';
import {
  type EntityMintingResult,
  mintEntities,
  toLegacyFormat,
} from './deferred-minting';
import {
  type ExtractionStats,
  type StatsCollector,
  createStatsCollector,
} from './extraction-stats';

// ============================================================================
// TYPES
// ============================================================================

export interface PipelineConfig {
  /** Promotion configuration */
  promotion: PromotionConfig;

  /** Enable debug logging */
  debug: boolean;

  /** Document ID for entity minting */
  docId: string;
}

export interface PipelineResult {
  /** Final entities */
  entities: Entity[];

  /** Entity spans */
  spans: Array<{
    entity_id: string;
    start: number;
    end: number;
    surface: string;
  }>;

  /** Extraction statistics */
  stats: ExtractionStats;

  /** Context-only mentions (for coref) */
  contextOnly: MentionCandidate[];

  /** Deferred clusters (not promoted) */
  deferredClusters: MentionCluster[];
}

// ============================================================================
// NOMINATION
// ============================================================================

/**
 * Extract mention candidates from NER spans
 */
function nominateFromNER(
  sentences: ParsedSentence[],
  fullText: string,
  stats: StatsCollector
): MentionCandidate[] {
  const candidates: MentionCandidate[] = [];

  for (let si = 0; si < sentences.length; si++) {
    const sent = sentences[si];
    const tokens = sent.tokens;

    let i = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      if (!t.ent || t.ent === 'O' || t.ent === '') {
        i++;
        continue;
      }

      // Collect consecutive tokens with same NER label
      let j = i + 1;
      while (j < tokens.length && tokens[j].ent === t.ent) {
        // Break on punctuation gaps
        const prevToken = tokens[j - 1];
        const currToken = tokens[j];
        if (currToken.start - prevToken.end > 1) break;
        j++;
      }

      const spanTokens = tokens.slice(i, j);
      const surface = spanTokens.map(tok => tok.text).join(' ');
      const start = spanTokens[0].start;
      const end = spanTokens[spanTokens.length - 1].end;

      const candidate = createCandidate(
        surface,
        start,
        end,
        spanTokens,
        'NER',
        fullText,
        si,
        { nerHint: t.ent }
      );

      candidates.push(candidate);
      stats.recordNomination('NER');

      i = j;
    }
  }

  return candidates;
}

/**
 * Extract mention candidates from dependency patterns
 */
function nominateFromDependencies(
  sentences: ParsedSentence[],
  fullText: string,
  stats: StatsCollector
): MentionCandidate[] {
  const candidates: MentionCandidate[] = [];

  for (let si = 0; si < sentences.length; si++) {
    const sent = sentences[si];
    const tokens = sent.tokens;

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];

      // Skip if not a proper noun or noun
      if (tok.pos !== 'PROPN' && tok.pos !== 'NOUN') continue;

      // Skip lowercase nouns (too many false positives)
      if (tok.pos === 'NOUN' && !/^[A-Z]/.test(tok.text)) continue;

      // Gather compound/flat modifiers
      let startIdx = i;
      let endIdx = i;

      // Look backward for compounds
      for (let j = i - 1; j >= 0; j--) {
        const dep = tokens[j].dep;
        if (dep === 'compound' || dep === 'flat' || dep === 'flat:name') {
          if (tokens[j].head === tok.i) {
            startIdx = j;
          }
        } else {
          break;
        }
      }

      // Look forward for compounds
      for (let j = i + 1; j < tokens.length; j++) {
        const dep = tokens[j].dep;
        if (dep === 'compound' || dep === 'flat' || dep === 'flat:name') {
          if (tokens[j].head === tok.i) {
            endIdx = j;
          }
        } else {
          break;
        }
      }

      const spanTokens = tokens.slice(startIdx, endIdx + 1);
      const surface = spanTokens.map(t => t.text).join(' ');
      const start = spanTokens[0].start;
      const end = spanTokens[spanTokens.length - 1].end;

      const candidate = createCandidate(
        surface,
        start,
        end,
        spanTokens,
        'DEP',
        fullText,
        si
      );

      // Skip if already covered by NER (dedup later)
      candidates.push(candidate);
      stats.recordNomination('DEP');
    }
  }

  return candidates;
}

/**
 * Deduplicate overlapping candidates (prefer NER over DEP)
 */
function deduplicateCandidates(
  candidates: MentionCandidate[]
): MentionCandidate[] {
  // Sort by start position, then by length (longer first)
  const sorted = [...candidates].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });

  const result: MentionCandidate[] = [];
  let lastEnd = -1;

  for (const candidate of sorted) {
    // Skip if fully contained in previous
    if (candidate.start < lastEnd && candidate.end <= lastEnd) {
      continue;
    }

    result.push(candidate);
    lastEnd = Math.max(lastEnd, candidate.end);
  }

  return result;
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

/**
 * Run the full extraction pipeline
 */
export function runExtractionPipeline(
  sentences: ParsedSentence[],
  fullText: string,
  config: Partial<PipelineConfig> = {}
): PipelineResult {
  const stats = createStatsCollector();
  const debug = config.debug ?? false;
  const docId = config.docId ?? 'doc';
  const promotionConfig = config.promotion ?? DEFAULT_PROMOTION_CONFIG;

  if (debug) {
    console.log('[PIPELINE] Starting extraction...');
  }

  // ========================================
  // STAGE A: NOMINATION
  // ========================================

  if (debug) console.log('[PIPELINE] Stage A: Nomination');

  const nerCandidates = nominateFromNER(sentences, fullText, stats);
  const depCandidates = nominateFromDependencies(sentences, fullText, stats);

  // Combine and deduplicate
  const allCandidates = deduplicateCandidates([...nerCandidates, ...depCandidates]);

  if (debug) {
    console.log(`[PIPELINE]   NER candidates: ${nerCandidates.length}`);
    console.log(`[PIPELINE]   DEP candidates: ${depCandidates.length}`);
    console.log(`[PIPELINE]   After dedup: ${allCandidates.length}`);
  }

  // ========================================
  // STAGE B: MEANING GATE
  // ========================================

  if (debug) console.log('[PIPELINE] Stage B: Meaning Gate');

  const buffer = createMentionBuffer(stats);
  const contextOnlyMentions: MentionCandidate[] = [];

  for (const candidate of allCandidates) {
    const gateResult = applyMeaningGate(candidate, fullText);

    stats.recordGateResult(gateResult.verdict, gateResult.reason);

    switch (gateResult.verdict) {
      case 'NON_ENTITY':
        // Rejected - but check if we extracted an NP object from PP
        if (gateResult.extractedNPObject) {
          // Re-process the extracted NP
          const npResult = applyMeaningGate(gateResult.extractedNPObject, fullText);
          stats.recordGateResult(npResult.verdict, npResult.reason);

          if (npResult.verdict === 'DURABLE_CANDIDATE') {
            buffer.add({
              candidate: gateResult.extractedNPObject,
              gateResult: npResult,
              documentPosition: gateResult.extractedNPObject.start,
            });
          }
        }
        break;

      case 'CONTEXT_ONLY':
        contextOnlyMentions.push(candidate);
        break;

      case 'DURABLE_CANDIDATE':
        buffer.add({
          candidate,
          gateResult,
          documentPosition: candidate.start,
        });
        break;
    }
  }

  stats.setUniqueSurfaces(buffer.getUniqueSurfaceCount());

  if (debug) {
    console.log(`[PIPELINE]   NON_ENTITY: ${stats.getStats().gateResults.nonEntity}`);
    console.log(`[PIPELINE]   CONTEXT_ONLY: ${stats.getStats().gateResults.contextOnly}`);
    console.log(`[PIPELINE]   DURABLE: ${stats.getStats().gateResults.durableCandidate}`);
  }

  // ========================================
  // STAGE C & D: ACCUMULATION & CLUSTERING
  // ========================================

  if (debug) console.log('[PIPELINE] Stage C/D: Clustering');

  const clusters = clusterMentions(buffer, stats);

  if (debug) {
    console.log(`[PIPELINE]   Clusters formed: ${clusters.length}`);
  }

  // ========================================
  // STAGE E: PROMOTION
  // ========================================

  if (debug) console.log('[PIPELINE] Stage E: Promotion');

  const { promoted, deferred } = processClusterPromotion(
    clusters,
    promotionConfig,
    stats
  );

  if (debug) {
    console.log(`[PIPELINE]   Promoted: ${promoted.length}`);
    console.log(`[PIPELINE]   Deferred: ${deferred.length}`);
  }

  // ========================================
  // STAGE F: DEFERRED MINTING
  // ========================================

  if (debug) console.log('[PIPELINE] Stage F: Minting');

  const mintingResults = mintEntities(promoted, docId, stats);
  const { entities, spans } = toLegacyFormat(mintingResults);

  if (debug) {
    console.log(`[PIPELINE]   Entities created: ${entities.length}`);
    console.log(`[PIPELINE]   Spans created: ${spans.length}`);
  }

  // ========================================
  // RESULT
  // ========================================

  return {
    entities,
    spans,
    stats: stats.getStats(),
    contextOnly: contextOnlyMentions,
    deferredClusters: deferred,
  };
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export {
  createStatsCollector,
  DEFAULT_PROMOTION_CONFIG,
  createMentionBuffer,
  clusterMentions,
};

export type {
  MentionCandidate,
  GateResult,
  GateVerdict,
  MentionCluster,
  ExtractionStats,
};
