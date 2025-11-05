/**
 * Entity Confidence Scoring (Phase E1)
 *
 * Computes confidence scores for entities based on:
 * - Extraction source (whitelist > NER > dependency > fallback)
 * - Mention frequency
 * - Context validation
 * - Generic word penalties
 */

import type { EntityType } from "./schema";
import type { EntityCluster, ExtractorSource, Mention } from "./mention-tracking";

/**
 * Base confidence scores by extraction source
 */
const SOURCE_CONFIDENCE: Record<ExtractorSource, number> = {
  WHITELIST: 0.95,  // High confidence - explicitly curated
  NER: 0.85,        // Good - spaCy NER is reliable
  DEP: 0.75,        // Moderate - dependency patterns can be noisy
  FALLBACK: 0.40    // Low - capitalized word regex is very noisy
};

/**
 * Generic titles/words that are likely false positives
 */
const GENERIC_WORDS = new Set([
  // Titles
  'professor', 'doctor', 'captain', 'commander', 'leader', 'strategist',
  'explorer', 'warrior', 'wizard', 'king', 'queen', 'prince', 'princess',

  // Roles
  'student', 'teacher', 'mentor', 'friend', 'enemy', 'ally',

  // Group words
  'couple', 'trio', 'pair', 'friends', 'family', 'group',

  // Descriptors
  'man', 'woman', 'boy', 'girl', 'person', 'child',

  // Common nouns that get capitalized
  'house', 'order', 'council', 'guild', 'academy'
]);

/**
 * Words that indicate strong context (boost confidence)
 */
const STRONG_CONTEXT_PATTERNS = [
  // Named patterns
  /\b(named|called)\s+/i,

  // Family relations
  /\b(son|daughter|father|mother|brother|sister|parent|child)\s+of\b/i,

  // Titles with names
  /\b(lord|lady|king|queen|sir|dame)\s+[A-Z]/i,

  // Possessives
  /'s\b/,

  // Action verbs (subject of action)
  /\b(said|thought|felt|walked|traveled|fought|ruled|led)\b/i
];

/**
 * Compute confidence score for an entity cluster
 */
export function computeEntityConfidence(cluster: EntityCluster): number {
  // Start with base score from sources
  const baseScore = Math.max(...cluster.sources.map(s => SOURCE_CONFIDENCE[s]));

  // Frequency bonus: Multiple mentions increase confidence
  // Formula: 1.0 + (mentions * 0.05), capped at 1.2x
  const mentionBonus = Math.min(1.2, 1.0 + (cluster.mentionCount * 0.05));

  // Generic word penalty: Single-word generic titles get penalized
  let genericPenalty = 1.0;
  const canonicalLower = cluster.canonical.toLowerCase();
  const words = cluster.canonical.split(/\s+/);

  if (words.length === 1 && GENERIC_WORDS.has(canonicalLower)) {
    // Check if we have specific aliases (like "Professor McGonagall")
    const hasSpecificAlias = cluster.aliases.some(alias => {
      const aliasWords = alias.split(/\s+/);
      return aliasWords.length > 1 && !GENERIC_WORDS.has(alias.toLowerCase());
    });

    if (!hasSpecificAlias) {
      genericPenalty = 0.3;  // Severe penalty - likely not a real entity
    } else {
      genericPenalty = 0.8;  // Mild penalty - generic but has full form
    }
  }

  // Context validation bonus: Check if mentions have strong context
  let contextBonus = 1.0;
  const mentionsWithStrongContext = cluster.mentions.filter(mention =>
    hasStrongContext(mention.surface)
  ).length;

  if (mentionsWithStrongContext > 0) {
    contextBonus = 1.1;  // 10% boost for strong context
  }

  // Combine scores
  let finalScore = baseScore * mentionBonus * genericPenalty * contextBonus;

  // Boost reliable fallback-only clusters so multi-word names survive when NER is unavailable
  const fallbackOnly = cluster.sources.length > 0 && cluster.sources.every(source => source === 'FALLBACK');
  if (fallbackOnly) {
    const wordCount = cluster.canonical.split(/\s+/).filter(Boolean).length;
    const aliasWordCount = cluster.aliases.reduce((max, alias) => {
      const words = alias.split(/\s+/).filter(Boolean).length;
      return words > max ? words : max;
    }, 0);

    let fallbackBoost = 1.0;
    if (wordCount >= 3) {
      fallbackBoost = 1.4;
    } else if (wordCount === 2) {
      fallbackBoost = 1.3;
    } else if (aliasWordCount >= 2) {
      fallbackBoost = 1.2;
    }

    if (cluster.mentionCount >= 2) {
      fallbackBoost += 0.1;
    }

    if (cluster.type === 'ORG' || cluster.type === 'HOUSE' || cluster.type === 'PLACE') {
      fallbackBoost += 0.05;
    }

    fallbackBoost = Math.min(fallbackBoost, 1.5);
    finalScore *= fallbackBoost;
  }

  // Clamp to [0, 1]
  finalScore = Math.max(0, Math.min(1.0, finalScore));

  return finalScore;
}

/**
 * Check if a surface form has strong context indicators
 */
function hasStrongContext(surface: string): boolean {
  return STRONG_CONTEXT_PATTERNS.some(pattern => pattern.test(surface));
}

/**
 * Determine if an entity should be filtered out based on confidence threshold
 */
export function shouldFilterEntity(
  cluster: EntityCluster,
  threshold: number = 0.5
): boolean {
  const confidence = computeEntityConfidence(cluster);
  cluster.confidence = confidence; // Update cluster with computed score
  return confidence < threshold;
}

/**
 * Filter entity clusters by confidence threshold
 */
export function filterEntitiesByConfidence(
  clusters: EntityCluster[],
  threshold: number = 0.5
): EntityCluster[] {
  return clusters.filter(cluster => {
    cluster.confidence = computeEntityConfidence(cluster);
    return cluster.confidence >= threshold;
  });
}

/**
 * Compute confidence for a single mention
 */
export function computeMentionConfidence(
  mention: Mention,
  cluster: EntityCluster
): number {
  let score = 0.8; // Base score

  // Mention type affects confidence
  switch (mention.type) {
    case 'canonical':
      score = 0.95;
      break;
    case 'short_form':
      score = 0.85;
      break;
    case 'descriptor':
      score = 0.60;
      break;
    case 'pronoun':
      score = 0.50;
      break;
    case 'possessive':
      score = 0.70;
      break;
  }

  // Context bonus
  if (hasStrongContext(mention.surface)) {
    score *= 1.1;
  }

  // Generic word penalty
  const surfaceLower = mention.surface.toLowerCase();
  if (GENERIC_WORDS.has(surfaceLower)) {
    score *= 0.5;
  }

  return Math.max(0, Math.min(1.0, score));
}

/**
 * Explain why an entity was filtered (for debugging)
 */
export function explainConfidence(cluster: EntityCluster): string {
  const baseScore = Math.max(...cluster.sources.map(s => SOURCE_CONFIDENCE[s]));
  const mentionBonus = Math.min(1.2, 1.0 + (cluster.mentionCount * 0.05));

  let genericPenalty = 1.0;
  const canonicalLower = cluster.canonical.toLowerCase();
  const words = cluster.canonical.split(/\s+/);

  if (words.length === 1 && GENERIC_WORDS.has(canonicalLower)) {
    const hasSpecificAlias = cluster.aliases.some(alias => {
      const aliasWords = alias.split(/\s+/);
      return aliasWords.length > 1 && !GENERIC_WORDS.has(alias.toLowerCase());
    });
    genericPenalty = hasSpecificAlias ? 0.8 : 0.3;
  }

  const mentionsWithStrongContext = cluster.mentions.filter(mention =>
    hasStrongContext(mention.surface)
  ).length;
  const contextBonus = mentionsWithStrongContext > 0 ? 1.1 : 1.0;

  const finalScore = baseScore * mentionBonus * genericPenalty * contextBonus;

  return [
    `Entity: ${cluster.canonical} (${cluster.id})`,
    `  Base score: ${baseScore.toFixed(2)} (sources: ${cluster.sources.join(', ')})`,
    `  Mention bonus: ${mentionBonus.toFixed(2)}x (${cluster.mentionCount} mentions)`,
    `  Generic penalty: ${genericPenalty.toFixed(2)}x${genericPenalty < 1 ? ' ⚠️' : ''}`,
    `  Context bonus: ${contextBonus.toFixed(2)}x (${mentionsWithStrongContext} strong)`,
    `  Final confidence: ${finalScore.toFixed(3)} ${finalScore < 0.5 ? '❌ FILTERED' : '✅ KEPT'}`
  ].join('\n');
}

/**
 * Get confidence statistics for a set of clusters
 */
export function getConfidenceStats(clusters: EntityCluster[]): {
  total: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  filtered: number;
  averageConfidence: number;
} {
  const total = clusters.length;
  let highConfidence = 0;
  let mediumConfidence = 0;
  let lowConfidence = 0;
  let filtered = 0;
  let sumConfidence = 0;

  for (const cluster of clusters) {
    const confidence = computeEntityConfidence(cluster);
    cluster.confidence = confidence;
    sumConfidence += confidence;

    if (confidence < 0.5) {
      filtered++;
    } else if (confidence >= 0.8) {
      highConfidence++;
    } else if (confidence >= 0.6) {
      mediumConfidence++;
    } else {
      lowConfidence++;
    }
  }

  return {
    total,
    highConfidence,
    mediumConfidence,
    lowConfidence,
    filtered,
    averageConfidence: total > 0 ? sumConfidence / total : 0
  };
}
