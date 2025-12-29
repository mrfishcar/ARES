/**
 * Entity Tier Assignment Module
 *
 * Assigns entities to tiers based on STRUCTURAL NAMEHOOD EVIDENCE.
 * This enables graduated recall where:
 *   - TIER_A: Strong namehood evidence (graph-worthy)
 *   - TIER_B: Moderate namehood evidence (supporting)
 *   - TIER_C: Weak/ambiguous namehood (isolated candidates)
 *
 * Design Principles:
 * 1. STRUCTURAL over blocklists - reject based on grammar, not word lists
 * 2. EVIDENCE-BASED - score namehood from multiple signals
 * 3. MINIMAL TIER_C - only true ambiguity lands here
 * 4. Deterministic and explainable
 */

import type { Entity, EntityTier, EntityType } from './schema';

/* =============================================================================
 * STRUCTURAL GARBAGE DETECTION (Grammar-Based)
 * Reject based on structural patterns, NOT word blocklists
 * ============================================================================= */

/**
 * Check if entity name contains encoding issues
 */
function hasEncodingIssues(name: string): boolean {
  if (name.includes('�')) return true;
  if (/[\x00-\x1F\x7F-\x9F]/.test(name)) return true;
  return false;
}

/**
 * Check if entity looks like a truncated extraction artifact
 * STRUCTURAL: First token is lowercase partial word
 * E.g., "er cars", "e obeyed", "nd march"
 */
function looksTruncated(name: string): boolean {
  const tokens = name.split(/\s+/);

  // First token is very short and lowercase (likely truncated mid-word)
  if (tokens.length >= 2 && tokens[0].length <= 2 && /^[a-z]+$/.test(tokens[0])) {
    return true;
  }

  // Single very short token that isn't an initial (J. or similar)
  if (tokens.length === 1 && name.length <= 2 && !/^[A-Z]\.?$/.test(name)) {
    return true;
  }

  return false;
}

/**
 * Check if entity looks like a sentence fragment
 * STRUCTURAL: Contains verb morphology without proper name capitalization
 */
function looksSentenceFragment(name: string): boolean {
  const tokens = name.split(/\s+/);
  const lower = name.toLowerCase();

  // Too short to analyze
  if (lower.trim().length < 3) return true;

  // STRUCTURAL: Multi-token ending in verb morphology without capitalization
  // "The pair sprang" - "sprang" is verb morphology, lowercase
  const verbSuffixes = ['ing', 'ed', 'ied', 'ang', 'ung', 'ought', 'ew', 'oke'];
  if (tokens.length >= 2) {
    const lastToken = tokens[tokens.length - 1];
    const lastLower = lastToken.toLowerCase();

    // If last token has verb morphology AND is lowercase, it's likely a fragment
    if (verbSuffixes.some(s => lastLower.endsWith(s)) && /^[a-z]/.test(lastToken)) {
      return true;
    }
  }

  // STRUCTURAL: "The/A + lowercase word" pattern without proper noun
  const articles = ['the', 'a', 'an'];
  if (tokens.length === 2 && articles.includes(tokens[0].toLowerCase())) {
    // "The doctor" (lowercase second word) vs "The Doctor" (capitalized)
    if (/^[a-z]/.test(tokens[1])) {
      return true;
    }
  }

  return false;
}

/**
 * Check if entity looks like a school name fragment mistyped as PERSON
 * STRUCTURAL: Contains institutional suffix indicators
 */
function looksLikeSchoolFragment(name: string, type: EntityType): boolean {
  if (type !== 'PERSON') return false;

  const lower = name.toLowerCase();
  // These are structural indicators of institutions, not people
  const institutionalSuffixes = [
    /\bjunior\s*$/,      // "Mont Linola Junior"
    /\bhigh\s*$/,        // "Oakdale High"
    /\bmiddle\s*$/,      // "Central Middle"
    /\belementary\s*$/,  // "Washington Elementary"
    /\bacademy\b/,       // "Battle Academy"
    /\buniversity\b/,
    /\bcollege\b/,
    /\binstitute\b/,
    /\bschool\b/,
  ];

  return institutionalSuffixes.some(p => p.test(lower));
}

/* =============================================================================
 * NAMEHOOD EVIDENCE SCORING
 * Score entities based on structural signals that indicate proper namehood
 * ============================================================================= */

/**
 * Namehood evidence features for scoring
 */
export interface NamehoodEvidence {
  // Strong positive signals
  occursNonInitial: boolean;      // Appears mid-sentence (not just sentence-start caps)
  isMultiToken: boolean;          // "First Last" pattern
  hasHonorific: boolean;          // Mr., Dr., etc. prefix
  mentionCount: number;           // Recurrence in text

  // Moderate positive signals
  hasNERSupport: boolean;         // spaCy NER backed this
  appearsInDialogue: boolean;     // Dialogue context
  hasAppositive: boolean;         // "X, the Y" or "Y, X" pattern

  // Type-specific
  entityType: EntityType;
}

/**
 * Title/honorific prefixes that indicate proper name usage
 */
const HONORIFIC_PREFIXES = new Set([
  'mr', 'mrs', 'miss', 'ms', 'dr', 'doctor',
  'prof', 'professor', 'sir', 'madam', 'madame',
  'lord', 'lady', 'king', 'queen', 'prince', 'princess',
  'captain', 'commander', 'general', 'colonel', 'major',
  'father', 'mother', 'brother', 'sister', 'reverend', 'pastor',
]);

/**
 * Check if entity has honorific prefix WITH a following name
 * "Doctor Smith" → true (honorific + name)
 * "Doctor" → false (honorific alone isn't a name pattern)
 */
function hasHonorificPrefix(name: string): boolean {
  const tokens = name.split(/\s+/);
  // Must have at least 2 tokens: honorific + name
  if (tokens.length < 2) return false;

  const firstToken = tokens[0]?.toLowerCase().replace(/\.$/, '');
  return firstToken ? HONORIFIC_PREFIXES.has(firstToken) : false;
}

/**
 * Calculate namehood score from evidence
 * Higher score = stronger evidence this is a proper name
 *
 * Scoring rationale:
 * - Non-sentence-initial: +3 (strongest signal - intentional capitalization)
 * - Multi-token proper: +2 (structural name pattern)
 * - Honorific prefix: +2 (social convention for names)
 * - NER support: +2 (spaCy believes it's an entity)
 * - Multiple mentions: +1 per mention, max +3 (recurrence)
 * - Dialogue context: +1 (names often appear in dialogue)
 */
function calculateNamehoodScore(evidence: NamehoodEvidence): number {
  let score = 0;

  // Strong signals
  if (evidence.occursNonInitial) score += 3;
  if (evidence.isMultiToken) score += 2;
  if (evidence.hasHonorific) score += 2;
  if (evidence.hasNERSupport) score += 2;

  // Moderate signals
  score += Math.min(evidence.mentionCount, 3); // Cap at 3
  if (evidence.appearsInDialogue) score += 1;
  if (evidence.hasAppositive) score += 1;

  return score;
}

/**
 * Namehood score thresholds for tier assignment
 * Multi-token (2) + any mention (1) = 3 should be enough for TIER_A
 * Single token with honorific (2) or recurrence (3+) should reach TIER_B
 */
const NAMEHOOD_THRESHOLDS = {
  TIER_A: 3,  // Multi-token + mention, or honorific + mention
  TIER_B: 2,  // Multi-token alone, or honorific alone
  TIER_C: 0,  // No structural evidence
};

/* =============================================================================
 * TYPE-BASED TIER CAPS
 * Certain entity types are supporting info, not graph-worthy
 * ============================================================================= */

/**
 * Types that max out at TIER_B regardless of evidence
 * These are supporting/contextual, not core graph entities
 */
const TIER_B_MAX_TYPES = new Set<EntityType>([
  'EVENT',    // Events are contextual
  'MATERIAL', // Materials are descriptive
  'SPELL',    // Often extraction noise
  'MAGIC',    // Often extraction noise
]);

function isTypeCapped(type: EntityType): boolean {
  return TIER_B_MAX_TYPES.has(type);
}

/* =============================================================================
 * CONFIDENCE THRESHOLDS (Fallback)
 * Used when namehood evidence is unavailable
 * ============================================================================= */

export const TIER_CONFIDENCE_THRESHOLDS = {
  TIER_A: 0.70,
  TIER_B: 0.50,
  TIER_C: 0.30,
} as const;

/* =============================================================================
 * FEATURE EXTRACTION
 * ============================================================================= */

export interface TierAssignmentFeatures {
  hasNERSupport: boolean;
  isSentenceInitialOnly: boolean;
  tokenCount: number;
  hasTitlePrefix: boolean;
  mentionCount?: number;
  appearsInRelation?: boolean;
  hasAliases?: boolean;
  source?: 'NER' | 'pattern' | 'coreference' | 'title_reference' | 'fallback';
}

export function extractTierFeatures(
  entity: Entity,
  _text?: string
): TierAssignmentFeatures {
  const tokens = entity.canonical.split(/\s+/).filter(Boolean);

  return {
    hasNERSupport: Boolean(entity.attrs?.nerLabel),
    isSentenceInitialOnly: Boolean(
      entity.attrs?.isSentenceInitial && !entity.attrs?.occursNonInitial
    ),
    tokenCount: tokens.length,
    hasTitlePrefix: hasHonorificPrefix(entity.canonical),
    mentionCount: entity.attrs?.mentionCount as number | undefined,
    hasAliases: entity.aliases.length > 1,
    source: entity.attrs?.source as TierAssignmentFeatures['source'],
  };
}

/* =============================================================================
 * MAIN TIER ASSIGNMENT
 * ============================================================================= */

/**
 * Assign tier based on structural namehood evidence
 *
 * Algorithm:
 * 1. Reject structural garbage → TIER_C
 * 2. Calculate namehood score from evidence
 * 3. Apply type-based caps
 * 4. Assign tier based on score
 */
export function assignEntityTier(
  entity: Entity,
  features: TierAssignmentFeatures
): { tier: EntityTier; reason: string } {
  const name = entity.canonical;
  const type = entity.type;
  const confidence = entity.confidence ?? 0.5;

  // =========================================================================
  // STEP 1: Structural garbage rejection → TIER_C
  // These are grammar-based rejections, NOT blocklist-based
  // =========================================================================

  if (hasEncodingIssues(name)) {
    return { tier: 'TIER_C', reason: 'encoding_issues' };
  }

  if (looksTruncated(name)) {
    return { tier: 'TIER_C', reason: 'truncated_artifact' };
  }

  if (looksSentenceFragment(name)) {
    return { tier: 'TIER_C', reason: 'sentence_fragment' };
  }

  if (looksLikeSchoolFragment(name, type)) {
    return { tier: 'TIER_C', reason: 'school_fragment_mistyped' };
  }

  // =========================================================================
  // STEP 2: Build namehood evidence and calculate score
  // CONSERVATIVE: Only credit non-initial occurrence if we KNOW it occurs mid-sentence
  // =========================================================================

  // We only know occursNonInitial if the attrs explicitly say so
  const hasPositiveMidSentenceEvidence = Boolean(entity.attrs?.occursNonInitial);

  const evidence: NamehoodEvidence = {
    occursNonInitial: hasPositiveMidSentenceEvidence,
    isMultiToken: features.tokenCount >= 2,
    hasHonorific: features.hasTitlePrefix,
    mentionCount: features.mentionCount ?? 1,
    hasNERSupport: features.hasNERSupport,
    appearsInDialogue: false, // TODO: extract from context
    hasAppositive: false,     // TODO: extract from context
    entityType: type,
  };

  const namehoodScore = calculateNamehoodScore(evidence);

  // =========================================================================
  // STEP 3: Apply type-based caps
  // EVENT/SPELL/MATERIAL/MAGIC max out at TIER_B
  // =========================================================================

  const typeCapped = isTypeCapped(type);

  // =========================================================================
  // STEP 4: Assign tier based on evidence score
  // =========================================================================

  // NER-backed entities get strong boost
  if (features.hasNERSupport) {
    if (typeCapped) {
      return { tier: 'TIER_B', reason: 'ner_backed_type_capped' };
    }
    return { tier: 'TIER_A', reason: 'ner_backed' };
  }

  // Score-based assignment
  if (namehoodScore >= NAMEHOOD_THRESHOLDS.TIER_A) {
    if (typeCapped) {
      return { tier: 'TIER_B', reason: 'type_capped_to_tier_b' };
    }
    return { tier: 'TIER_A', reason: `namehood_score_${namehoodScore}` };
  }

  if (namehoodScore >= NAMEHOOD_THRESHOLDS.TIER_B) {
    return { tier: 'TIER_B', reason: `namehood_score_${namehoodScore}` };
  }

  // =========================================================================
  // STEP 5: Fallback to confidence for very low evidence cases
  // =========================================================================

  // Sentence-initial-only single tokens are highly ambiguous
  if (features.isSentenceInitialOnly && features.tokenCount === 1) {
    return { tier: 'TIER_C', reason: 'sentence_initial_single_token' };
  }

  // Multi-token names get at least TIER_B even without other evidence
  if (features.tokenCount >= 2) {
    if (typeCapped) {
      return { tier: 'TIER_B', reason: 'multi_token_type_capped' };
    }
    // High confidence multi-token can reach TIER_A
    if (confidence >= TIER_CONFIDENCE_THRESHOLDS.TIER_A) {
      return { tier: 'TIER_A', reason: `confidence_${confidence.toFixed(2)}` };
    }
    return { tier: 'TIER_B', reason: 'multi_token_name' };
  }

  // Single token with honorific prefix gets TIER_B
  if (features.hasTitlePrefix) {
    return { tier: 'TIER_B', reason: 'title_prefix' };
  }

  // Confidence-based fallback for remaining single tokens
  if (confidence >= TIER_CONFIDENCE_THRESHOLDS.TIER_A) {
    if (typeCapped) {
      return { tier: 'TIER_B', reason: 'confidence_type_capped' };
    }
    return { tier: 'TIER_B', reason: 'single_token_high_confidence' };
  }

  if (confidence >= TIER_CONFIDENCE_THRESHOLDS.TIER_B) {
    return { tier: 'TIER_B', reason: `confidence_${confidence.toFixed(2)}` };
  }

  // Minimal evidence → TIER_C (true ambiguity)
  return { tier: 'TIER_C', reason: 'minimal_evidence' };
}

/* =============================================================================
 * BATCH PROCESSING AND UTILITIES
 * ============================================================================= */

export function assignTiersToEntities(
  entities: Entity[],
  text?: string
): Entity[] {
  return entities.map(entity => {
    if (entity.tier) return entity;

    const features = extractTierFeatures(entity, text);
    const { tier, reason } = assignEntityTier(entity, features);

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
 * Options for tier-based merge decisions
 */
export interface TierMergeOptions {
  /** Allow TIER_C → TIER_A merges when confidence exceeds this threshold */
  tierCToTierAThreshold?: number;
  /** Allow TIER_C → TIER_B merges when entities are from the same document */
  allowTierCToTierBSameDoc?: boolean;
  /** Document ID for same-document check */
  docId1?: string;
  docId2?: string;
}

/**
 * Default tier merge options
 */
export const DEFAULT_TIER_MERGE_OPTIONS: TierMergeOptions = {
  tierCToTierAThreshold: 0.85,
  allowTierCToTierBSameDoc: true,
};

export function canMergeByTier(
  entity1: Entity,
  entity2: Entity,
  options: TierMergeOptions = {}
): { canMerge: boolean; reason: string } {
  const tier1 = entity1.tier ?? 'TIER_A';
  const tier2 = entity2.tier ?? 'TIER_A';
  const opts = { ...DEFAULT_TIER_MERGE_OPTIONS, ...options };

  // If neither is TIER_C, always allow merge
  if (tier1 !== 'TIER_C' && tier2 !== 'TIER_C') {
    return { canMerge: true, reason: 'tier_compatible' };
  }

  // Both TIER_C - never merge (garbage isolation)
  if (tier1 === 'TIER_C' && tier2 === 'TIER_C') {
    return { canMerge: false, reason: 'tier_c_c_isolated' };
  }

  // One is TIER_C, the other is not
  const tierCEntity = tier1 === 'TIER_C' ? entity1 : entity2;
  const otherEntity = tier1 === 'TIER_C' ? entity2 : entity1;
  const otherTier = tier1 === 'TIER_C' ? tier2 : tier1;

  // TIER_C → TIER_A: Allow if confidence threshold met
  if (otherTier === 'TIER_A') {
    const mergeConfidence = Math.max(
      tierCEntity.confidence ?? 0,
      otherEntity.confidence ?? 0
    );
    if (opts.tierCToTierAThreshold && mergeConfidence >= opts.tierCToTierAThreshold) {
      return {
        canMerge: true,
        reason: `tier_c_to_tier_a_confidence_${mergeConfidence.toFixed(2)}`
      };
    }
    // Also allow if TIER_C entity has strong namehood evidence
    if (tierCEntity.attrs?.occursNonInitial || (tierCEntity.aliases?.length ?? 0) > 1) {
      return {
        canMerge: true,
        reason: 'tier_c_to_tier_a_strong_evidence'
      };
    }
    return { canMerge: false, reason: 'tier_c_to_tier_a_confidence_below_threshold' };
  }

  // TIER_C → TIER_B: Allow if same document and same type
  if (otherTier === 'TIER_B') {
    const sameType = tierCEntity.type === otherEntity.type;

    // Check if same document (if document info available in attrs)
    const doc1 = opts.docId1 || (tierCEntity.attrs?.docId as string | undefined);
    const doc2 = opts.docId2 || (otherEntity.attrs?.docId as string | undefined);
    const sameDoc = doc1 && doc2 && doc1 === doc2;

    if (opts.allowTierCToTierBSameDoc && sameType && sameDoc) {
      return { canMerge: true, reason: 'tier_c_to_tier_b_same_doc_same_type' };
    }

    // Also allow if types match and high confidence
    if (sameType && (tierCEntity.confidence ?? 0) >= 0.75) {
      return { canMerge: true, reason: 'tier_c_to_tier_b_same_type_high_confidence' };
    }

    return { canMerge: false, reason: 'tier_c_to_tier_b_conditions_not_met' };
  }

  // Fallback: no merge
  return { canMerge: false, reason: 'tier_c_isolated' };
}

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
