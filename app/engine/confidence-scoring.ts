/**
 * Entity Confidence Scoring (Phase E1)
 *
 * Computes confidence scores for entities based on:
 * - Extraction source (whitelist > NER > dependency > fallback)
 * - Mention frequency
 * - Context validation
 * - Generic word penalties
 * - NEW: Document-level salience (if macro analysis enabled)
 * - NEW: Genre alignment
 */

import type { EntityType } from "./schema";
import type { EntityCluster, ExtractorSource, Mention } from "./mention-tracking";

// NEW: Import types for macro-level analysis support
import type { EntitySalience } from "./extract/macro-analyzer";
import type { GenrePriors } from "./extract/genre-detector";

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
 *
 * NEW: Optional macro-level context for enhanced scoring
 */
export function computeEntityConfidence(
  cluster: EntityCluster,
  options?: {
    salience?: EntitySalience;  // Document-level salience from macro analysis
    genre?: GenrePriors;        // Detected genre for genre-appropriate scoring
  }
): number {
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

  // NEW: Salience bonus (macro-level importance)
  if (options?.salience) {
    const salienceScore = options.salience.score;

    // High-salience entities get confidence boost
    if (salienceScore > 0.7) {
      finalScore *= 1.15; // 15% boost for very important entities
    } else if (salienceScore > 0.5) {
      finalScore *= 1.08; // 8% boost for moderately important entities
    }

    // Opening paragraph bonus (already in salience, but worth emphasizing)
    if (options.salience.inOpeningParagraph) {
      finalScore *= 1.05; // Additional 5% for entities introduced early
    }

    // Entity with titles are more reliable
    if (options.salience.titleCount > 0) {
      finalScore *= 1.05; // 5% boost for formalized entities
    }
  }

  // NEW: Genre alignment bonus
  if (options?.genre) {
    // Check if entity type matches genre expectations
    const expectedTypes = options.genre.expectedTypes;
    if (expectedTypes.includes(cluster.type)) {
      // Bonus for entities matching genre (e.g., PERSON in fantasy, ORG in business)
      finalScore *= options.genre.confidenceBoost;
    }

    // For ambiguous cases, genre priors help
    if (baseScore < 0.6) { // Low base confidence
      const typePrior = options.genre.singleWordPriors[cluster.type] || 0;
      if (typePrior > 0.5) {
        // Genre strongly suggests this type
        finalScore *= 1.1;
      }
    }
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
  threshold: number = 0.5,
  options?: {
    salience?: EntitySalience;
    genre?: GenrePriors;
  }
): boolean {
  const confidence = computeEntityConfidence(cluster, options);
  cluster.confidence = confidence; // Update cluster with computed score
  return confidence < threshold;
}

/**
 * Filter entity clusters by confidence threshold
 */
export function filterEntitiesByConfidence(
  clusters: EntityCluster[],
  threshold: number = 0.5,
  options?: {
    salience?: Map<string, EntitySalience>;  // Map for looking up by entity name
    genre?: GenrePriors;
  }
): EntityCluster[] {
  return clusters.filter(cluster => {
    // Look up salience for this entity if map provided
    const entitySalience = options?.salience?.get(cluster.canonical.toLowerCase().trim());

    cluster.confidence = computeEntityConfidence(cluster, {
      salience: entitySalience,
      genre: options?.genre
    });
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
export function explainConfidence(
  cluster: EntityCluster,
  options?: {
    salience?: EntitySalience;
    genre?: GenrePriors;
  }
): string {
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

  const finalScore = computeEntityConfidence(cluster, options);

  const lines = [
    `Entity: ${cluster.canonical} (${cluster.id})`,
    `  Base score: ${baseScore.toFixed(2)} (sources: ${cluster.sources.join(', ')})`,
    `  Mention bonus: ${mentionBonus.toFixed(2)}x (${cluster.mentionCount} mentions)`,
    `  Generic penalty: ${genericPenalty.toFixed(2)}x${genericPenalty < 1 ? ' ⚠️' : ''}`,
    `  Context bonus: ${contextBonus.toFixed(2)}x (${mentionsWithStrongContext} strong)`
  ];

  // Add salience info if available
  if (options?.salience) {
    lines.push(`  Salience: ${options.salience.score.toFixed(3)} (opening: ${options.salience.inOpeningParagraph}, titles: ${options.salience.titleCount})`);
  }

  // Add genre info if available
  if (options?.genre) {
    lines.push(`  Genre: ${options.genre.displayName} (boost: ${options.genre.confidenceBoost.toFixed(2)}x)`);
  }

  lines.push(`  Final confidence: ${finalScore.toFixed(3)} ${finalScore < 0.5 ? '❌ FILTERED' : '✅ KEPT'}`);

  return lines.join('\n');
}

/**
 * Get confidence statistics for a set of clusters
 */
export function getConfidenceStats(
  clusters: EntityCluster[],
  options?: {
    salience?: Map<string, EntitySalience>;
    genre?: GenrePriors;
  }
): {
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
    // Look up salience if map provided
    const entitySalience = options?.salience?.get(cluster.canonical.toLowerCase().trim());

    const confidence = computeEntityConfidence(cluster, {
      salience: entitySalience,
      genre: options?.genre
    });
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
