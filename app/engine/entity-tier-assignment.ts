/**
 * Entity Tier Assignment Module
 *
 * Assigns entities to tiers based on extraction evidence and confidence.
 * This enables graduated recall where:
 *   - TIER_A: High-confidence core entities (full merging)
 *   - TIER_B: Medium-confidence supporting entities (cautious merging)
 *   - TIER_C: Low-confidence candidates (no merging, isolated)
 *
 * Design Principles:
 * 1. Deterministic - same input always produces same tier
 * 2. Explainable - tier assignment can be logged/inspected
 * 3. Conservative promotion - entities start low and are promoted with evidence
 */

import type { Entity, EntityTier, EntityType } from './schema';

/**
 * Confidence thresholds for tier assignment
 *
 * Rationale:
 * - TIER_A requires high confidence (0.70) to be graph-worthy
 * - TIER_B accepts medium confidence (0.50) for indexing/search
 * - TIER_C accepts lower confidence (0.30) as provisional candidates
 */
export const TIER_CONFIDENCE_THRESHOLDS = {
  TIER_A: 0.70,  // High-confidence core entities
  TIER_B: 0.50,  // Medium-confidence supporting entities
  TIER_C: 0.30,  // Low-confidence candidates (provisional)
} as const;

/**
 * Entity features used for tier assignment
 */
export interface TierAssignmentFeatures {
  // From extraction
  hasNERSupport: boolean;           // spaCy NER backed this entity
  isSentenceInitialOnly: boolean;   // Only appears at sentence starts
  tokenCount: number;               // Number of tokens in canonical name
  hasTitlePrefix: boolean;          // Has Mr./Dr./etc. prefix

  // From context
  mentionCount?: number;            // How many times mentioned
  appearsInRelation?: boolean;      // Appears in any relation
  hasAliases?: boolean;             // Has resolved aliases

  // Extraction source
  source?: 'NER' | 'pattern' | 'coreference' | 'title_reference' | 'fallback';
}

/**
 * Title prefixes that indicate a proper entity reference
 */
const TITLE_PREFIXES = new Set([
  'mr', 'mrs', 'miss', 'ms', 'dr', 'doctor',
  'prof', 'professor', 'sir', 'madam', 'madame',
  'lord', 'lady', 'king', 'queen', 'prince', 'princess',
  'captain', 'commander', 'head', 'headmaster', 'headmistress',
  'chief', 'general', 'mayor', 'senator', 'judge', 'officer',
  'father', 'mother', 'brother', 'sister', 'aunt', 'uncle',
  'grandma', 'grandpa', 'grandmother', 'grandfather',
]);

/**
 * Check if entity name has a title prefix
 */
function hasTitlePrefix(name: string): boolean {
  const firstToken = name.split(/\s+/)[0]?.toLowerCase();
  return firstToken ? TITLE_PREFIXES.has(firstToken.replace(/\.$/, '')) : false;
}

/**
 * Assign tier to an entity based on features
 *
 * Algorithm:
 * 1. Start with confidence-based tier
 * 2. Apply promotions for strong evidence (NER, multi-token)
 * 3. Apply demotions for weak evidence (sentence-initial-only)
 * 4. Return final tier with explanation
 */
export function assignEntityTier(
  entity: Entity,
  features: TierAssignmentFeatures
): { tier: EntityTier; reason: string } {
  const confidence = entity.confidence ?? 0.5;

  // Step 1: Base tier from confidence
  let baseTier: EntityTier;
  if (confidence >= TIER_CONFIDENCE_THRESHOLDS.TIER_A) {
    baseTier = 'TIER_A';
  } else if (confidence >= TIER_CONFIDENCE_THRESHOLDS.TIER_B) {
    baseTier = 'TIER_B';
  } else if (confidence >= TIER_CONFIDENCE_THRESHOLDS.TIER_C) {
    baseTier = 'TIER_C';
  } else {
    // Below minimum threshold - still assign TIER_C but mark as very low confidence
    baseTier = 'TIER_C';
  }

  // Step 2: Promotions

  // NER-backed entities get TIER_A (strong signal from spaCy)
  if (features.hasNERSupport && baseTier !== 'TIER_A') {
    return { tier: 'TIER_A', reason: 'ner_backed' };
  }

  // Multi-token proper names get at least TIER_B (structural evidence)
  if (features.tokenCount >= 2 && baseTier === 'TIER_C') {
    return { tier: 'TIER_B', reason: 'multi_token_name' };
  }

  // Title-prefixed names get at least TIER_B
  if (features.hasTitlePrefix && baseTier === 'TIER_C') {
    return { tier: 'TIER_B', reason: 'title_prefix' };
  }

  // Entities with multiple mentions get promoted (corroboration)
  if ((features.mentionCount ?? 0) >= 3 && baseTier === 'TIER_C') {
    return { tier: 'TIER_B', reason: 'multiple_mentions' };
  }

  // Step 3: Demotions

  // Sentence-initial-only single tokens without NER get TIER_C
  if (
    features.isSentenceInitialOnly &&
    features.tokenCount === 1 &&
    !features.hasNERSupport &&
    baseTier !== 'TIER_C'
  ) {
    return { tier: 'TIER_C', reason: 'sentence_initial_single_token' };
  }

  // Step 4: Return base tier
  return { tier: baseTier, reason: `confidence_${confidence.toFixed(2)}` };
}

/**
 * Extract features for tier assignment from entity and context
 */
export function extractTierFeatures(
  entity: Entity,
  text?: string
): TierAssignmentFeatures {
  const tokens = entity.canonical.split(/\s+/).filter(Boolean);

  return {
    hasNERSupport: Boolean(entity.attrs?.nerLabel),
    isSentenceInitialOnly: Boolean(
      entity.attrs?.isSentenceInitial && !entity.attrs?.occursNonInitial
    ),
    tokenCount: tokens.length,
    hasTitlePrefix: hasTitlePrefix(entity.canonical),
    mentionCount: entity.attrs?.mentionCount as number | undefined,
    hasAliases: entity.aliases.length > 1,
    source: entity.attrs?.source as TierAssignmentFeatures['source'],
  };
}

/**
 * Assign tiers to a batch of entities
 *
 * This is the main entry point for tier assignment.
 * Returns entities with tier field populated.
 */
export function assignTiersToEntities(
  entities: Entity[],
  text?: string
): Entity[] {
  return entities.map(entity => {
    // Skip if tier already assigned
    if (entity.tier) return entity;

    const features = extractTierFeatures(entity, text);
    const { tier, reason } = assignEntityTier(entity, features);

    // Log tier assignment in debug mode
    if (process.env.TIER_DEBUG === '1') {
      console.log(`[TIER] ${entity.canonical} (${entity.type}) → ${tier} (${reason})`);
    }

    return {
      ...entity,
      tier,
      attrs: {
        ...entity.attrs,
        tierReason: reason,
      },
    };
  });
}

/**
 * Check if two entities can be merged based on tiers
 *
 * Merging rules:
 * - TIER_A can merge with TIER_A (full merging)
 * - TIER_B can merge with TIER_A or TIER_B (cautious merging)
 * - TIER_C cannot merge with anything (isolated)
 */
export function canMergeByTier(
  entity1: Entity,
  entity2: Entity
): { canMerge: boolean; reason: string } {
  const tier1 = entity1.tier ?? 'TIER_A'; // Default to TIER_A for backward compatibility
  const tier2 = entity2.tier ?? 'TIER_A';

  // TIER_C entities are isolated - no merging
  if (tier1 === 'TIER_C' || tier2 === 'TIER_C') {
    return { canMerge: false, reason: 'tier_c_isolated' };
  }

  // TIER_A and TIER_B can merge with each other
  return { canMerge: true, reason: 'tier_compatible' };
}

/**
 * Filter entities by minimum tier
 *
 * Use this to get only graph-worthy entities (TIER_A)
 * or include supporting entities (TIER_A + TIER_B)
 */
export function filterByTier(
  entities: Entity[],
  minTier: EntityTier = 'TIER_A'
): Entity[] {
  const tierOrder: EntityTier[] = ['TIER_A', 'TIER_B', 'TIER_C'];
  const minIndex = tierOrder.indexOf(minTier);

  return entities.filter(e => {
    const tier = e.tier ?? 'TIER_A';
    const tierIndex = tierOrder.indexOf(tier);
    return tierIndex <= minIndex;
  });
}

/**
 * Get tier statistics for a set of entities
 */
export function getTierStats(entities: Entity[]): {
  total: number;
  tierA: number;
  tierB: number;
  tierC: number;
  unassigned: number;
} {
  const stats = {
    total: entities.length,
    tierA: 0,
    tierB: 0,
    tierC: 0,
    unassigned: 0,
  };

  for (const entity of entities) {
    switch (entity.tier) {
      case 'TIER_A':
        stats.tierA++;
        break;
      case 'TIER_B':
        stats.tierB++;
        break;
      case 'TIER_C':
        stats.tierC++;
        break;
      default:
        stats.unassigned++;
    }
  }

  return stats;
}
