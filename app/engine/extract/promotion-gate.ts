/**
 * Promotion Gate - Threshold-Based Entity Promotion
 *
 * Determines whether a mention cluster should be promoted to an entity.
 * Implements BookNLP-style thresholds with exceptions for high-confidence cases.
 *
 * Promotion criteria:
 * 1. mention_threshold: count >= 2 (default)
 * 2. introduction_pattern: "X, a wizard" / "named X" / etc.
 * 3. strong_ner_subject: High-confidence NER + subject/object role
 * 4. header_position: Appears in title/heading context
 * 5. whitelist: User-defined entities
 */

import type { MentionCluster } from './mention-cluster';
import type { StatsCollector, PromotionReason, DeferralReason } from './extraction-stats';

// ============================================================================
// TYPES
// ============================================================================

export interface PromotionConfig {
  /** Minimum mention count for promotion (default: 2) */
  mentionThreshold: number;

  /** Allow single-mention promotion with strong NER evidence */
  allowStrongNERSingleton: boolean;

  /** Allow single-mention promotion with introduction pattern */
  allowIntroductionPattern: boolean;

  /** User-defined whitelist entries */
  whitelist: Set<string>;
}

export interface PromotionResult {
  promoted: boolean;
  reason: PromotionReason | DeferralReason;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_PROMOTION_CONFIG: PromotionConfig = {
  mentionThreshold: 2,
  allowStrongNERSingleton: true,
  allowIntroductionPattern: true,
  whitelist: new Set(),
};

// ============================================================================
// PROMOTION LOGIC
// ============================================================================

/**
 * Determine whether a cluster should be promoted to an entity
 */
export function shouldPromote(
  cluster: MentionCluster,
  config: PromotionConfig = DEFAULT_PROMOTION_CONFIG
): PromotionResult {
  const mentionCount = cluster.mentionCount();

  // ----------------------------------------
  // Check 1: Mention threshold
  // ----------------------------------------
  if (mentionCount >= config.mentionThreshold) {
    return { promoted: true, reason: 'mention_threshold' };
  }

  // ----------------------------------------
  // Check 2: Whitelist
  // ----------------------------------------
  const canonical = cluster.canonicalForm.toLowerCase();
  if (config.whitelist.has(canonical)) {
    return { promoted: true, reason: 'whitelist' };
  }

  // Check aliases too
  for (const alias of cluster.aliasVariants) {
    if (config.whitelist.has(alias.toLowerCase())) {
      return { promoted: true, reason: 'whitelist' };
    }
  }

  // ----------------------------------------
  // Check 3: Strong NER with good syntactic role
  // ----------------------------------------
  if (config.allowStrongNERSingleton && mentionCount >= 1) {
    if (hasStrongNEREvidence(cluster)) {
      return { promoted: true, reason: 'strong_ner_subject' };
    }
  }

  // ----------------------------------------
  // Check 4: Introduction pattern
  // ----------------------------------------
  if (config.allowIntroductionPattern && mentionCount >= 1) {
    if (cluster.hasIntroductionPattern()) {
      return { promoted: true, reason: 'introduction_pattern' };
    }
  }

  // ----------------------------------------
  // Check 5: Header/title position
  // ----------------------------------------
  if (mentionCount >= 1 && hasHeaderPositionEvidence(cluster)) {
    return { promoted: true, reason: 'header_position' };
  }

  // ----------------------------------------
  // Not promoted
  // ----------------------------------------
  if (mentionCount === 1) {
    return { promoted: false, reason: 'single_mention' };
  }

  return { promoted: false, reason: 'weak_evidence' };
}

/**
 * Check if cluster has strong NER evidence
 */
function hasStrongNEREvidence(cluster: MentionCluster): boolean {
  if (!cluster.hasStrongNER()) return false;

  // Also check syntactic role
  for (const mention of cluster.mentions) {
    const { candidate } = mention;
    const { depRole, headPOS } = candidate;

    // Strong roles: subject, object, appositive
    const strongRoles = ['nsubj', 'dobj', 'iobj', 'pobj', 'appos', 'attr'];
    if (depRole && strongRoles.includes(depRole)) {
      return true;
    }

    // Proper noun in any position
    if (headPOS === 'PROPN') {
      return true;
    }
  }

  return false;
}

/**
 * Check if cluster appears in header/title position
 */
function hasHeaderPositionEvidence(cluster: MentionCluster): boolean {
  // Check mentions for header-like characteristics
  for (const mention of cluster.mentions) {
    const { candidate } = mention;

    // Check if position is near document start
    if (candidate.start < 100 && candidate.isSentenceInitial) {
      // Early document position + sentence initial might be title
      const tokens = candidate.tokens;
      // All proper nouns?
      if (tokens.length > 0 && tokens.every(t => t.pos === 'PROPN')) {
        return true;
      }
    }
  }

  return false;
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Process all clusters and separate promoted from deferred
 */
export function processClusterPromotion(
  clusters: MentionCluster[],
  config: PromotionConfig = DEFAULT_PROMOTION_CONFIG,
  stats?: StatsCollector
): {
  promoted: MentionCluster[];
  deferred: MentionCluster[];
} {
  const promoted: MentionCluster[] = [];
  const deferred: MentionCluster[] = [];

  for (const cluster of clusters) {
    const result = shouldPromote(cluster, config);

    if (result.promoted) {
      promoted.push(cluster);
      stats?.recordPromotion(result.reason as PromotionReason);
    } else {
      deferred.push(cluster);
      stats?.recordDeferral(result.reason as DeferralReason);
    }
  }

  return { promoted, deferred };
}

// ============================================================================
// CONFIG BUILDERS
// ============================================================================

export function createPromotionConfig(
  overrides: Partial<PromotionConfig> = {}
): PromotionConfig {
  return {
    ...DEFAULT_PROMOTION_CONFIG,
    ...overrides,
    whitelist: overrides.whitelist || new Set(DEFAULT_PROMOTION_CONFIG.whitelist),
  };
}

/**
 * Create a strict config that requires more evidence
 */
export function createStrictPromotionConfig(): PromotionConfig {
  return {
    mentionThreshold: 3,
    allowStrongNERSingleton: false,
    allowIntroductionPattern: true,
    whitelist: new Set(),
  };
}

/**
 * Create a permissive config for high-recall scenarios
 */
export function createPermissivePromotionConfig(): PromotionConfig {
  return {
    mentionThreshold: 1,
    allowStrongNERSingleton: true,
    allowIntroductionPattern: true,
    whitelist: new Set(),
  };
}
