/**
 * Sense Disambiguator - Phase 4
 *
 * Assigns SP (Sense Path) values to distinguish entities with identical names
 * but different meanings (homonyms).
 *
 * Examples:
 * - "Apple" (company) → SP [1]
 * - "Apple" (fruit) → SP [2]
 * - "Jordan" (person) → SP [1]
 * - "Jordan" (country) → SP [2]
 * - "John Smith" (lawyer) → SP [1]
 * - "John Smith" (doctor) → SP [2]
 */

import type { Entity, EntityType } from './schema';
import type { EntityProfile } from './entity-profiler';

/**
 * Sense discrimination result
 */
export interface SenseDiscrimination {
  shouldDisambiguate: boolean;    // Are these different entities?
  confidence: number;              // How confident (0-1)
  reason: string;                  // Why they're different
  suggestedSP?: number[];          // Suggested sense path for new entity
}

/**
 * Sense registry - tracks SP assignments
 */
class SenseRegistry {
  // Map: canonical_name → { type: EntityType, sp: number[], eid: number }[]
  private senses: Map<string, Array<{ type: EntityType; sp: number[]; eid: number; profile?: EntityProfile }>>;

  constructor() {
    this.senses = new Map();
  }

  /**
   * Register a sense for a canonical name
   */
  register(canonical: string, eid: number, type: EntityType, sp: number[], profile?: EntityProfile): void {
    const key = canonical.toLowerCase();

    if (!this.senses.has(key)) {
      this.senses.set(key, []);
    }

    const senses = this.senses.get(key)!;

    // Check if already registered
    const existing = senses.find(s => s.eid === eid);
    if (existing) {
      // Update profile if provided
      if (profile) {
        existing.profile = profile;
      }
      return;
    }

    senses.push({ type, sp, eid, profile });
  }

  /**
   * Get all senses for a canonical name
   */
  getSenses(canonical: string): Array<{ type: EntityType; sp: number[]; eid: number; profile?: EntityProfile }> {
    const key = canonical.toLowerCase();
    return this.senses.get(key) || [];
  }

  /**
   * Get next available SP for a canonical name
   */
  getNextSP(canonical: string, type: EntityType): number[] {
    const senses = this.getSenses(canonical);

    // Filter by type (different types can have overlapping SPs)
    const typedSenses = senses.filter(s => s.type === type);

    if (typedSenses.length === 0) {
      // First sense of this type
      return [1];
    }

    // Find max SP value
    const maxSP = Math.max(...typedSenses.map(s => s.sp[0] || 0));
    return [maxSP + 1];
  }

  /**
   * Find best matching sense for an entity
   */
  findMatchingSense(
    canonical: string,
    type: EntityType,
    profile?: EntityProfile
  ): { eid: number; sp: number[] } | null {
    const senses = this.getSenses(canonical);

    // Filter by type
    const typedSenses = senses.filter(s => s.type === type);

    if (typedSenses.length === 0) {
      return null;
    }

    // If no profile, return first match of same type
    if (!profile) {
      return { eid: typedSenses[0].eid, sp: typedSenses[0].sp };
    }

    // Find best profile match
    let bestMatch: typeof typedSenses[0] | null = null;
    let bestScore = 0;

    for (const sense of typedSenses) {
      if (!sense.profile) continue;

      const similarity = this.calculateProfileSimilarity(profile, sense.profile);
      if (similarity > bestScore && similarity > 0.7) {  // 70% threshold for same sense
        bestScore = similarity;
        bestMatch = sense;
      }
    }

    if (bestMatch) {
      return { eid: bestMatch.eid, sp: bestMatch.sp };
    }

    return null;
  }

  /**
   * Calculate similarity between two entity profiles
   */
  private calculateProfileSimilarity(profile1: EntityProfile, profile2: EntityProfile): number {
    let score = 0;
    let weights = 0;

    // Context similarity (50% weight)
    if (profile1.contexts.length > 0 && profile2.contexts.length > 0) {
      const contextSim = this.calculateContextSimilarity(profile1.contexts, profile2.contexts);
      score += contextSim * 0.5;
      weights += 0.5;
    }

    // Descriptor similarity (30% weight)
    if (profile1.descriptors.size > 0 && profile2.descriptors.size > 0) {
      const descSim = this.calculateSetOverlap(profile1.descriptors, profile2.descriptors);
      score += descSim * 0.3;
      weights += 0.3;
    }

    // Title similarity (20% weight)
    if (profile1.titles.size > 0 && profile2.titles.size > 0) {
      const titleSim = this.calculateSetOverlap(profile1.titles, profile2.titles);
      score += titleSim * 0.2;
      weights += 0.2;
    }

    return weights > 0 ? score / weights : 0;
  }

  private calculateContextSimilarity(contexts1: string[], contexts2: string[]): number {
    const words1 = new Set(contexts1.join(' ').toLowerCase().split(/\s+/));
    const words2 = new Set(contexts2.join(' ').toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private calculateSetOverlap(set1: Set<string>, set2: Set<string>): number {
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Clear all senses
   */
  clear(): void {
    this.senses.clear();
  }

  /**
   * Get statistics
   */
  getStats(): {
    total_names: number;
    ambiguous_names: number;
    total_senses: number;
    avg_senses_per_name: number;
  } {
    const totalNames = this.senses.size;
    let totalSenses = 0;
    let ambiguousNames = 0;

    for (const [_, senses] of this.senses.entries()) {
      totalSenses += senses.length;
      if (senses.length > 1) {
        ambiguousNames++;
      }
    }

    return {
      total_names: totalNames,
      ambiguous_names: ambiguousNames,
      total_senses: totalSenses,
      avg_senses_per_name: totalNames > 0 ? totalSenses / totalNames : 0
    };
  }
}

/**
 * Discriminate between two entity mentions with the same canonical name
 */
export function discriminateSenses(
  canonical: string,
  existingType: EntityType,
  existingProfile: EntityProfile | undefined,
  newType: EntityType,
  newProfile: EntityProfile | undefined
): SenseDiscrimination {
  // Strategy 1: Different entity types = definitely different entities
  if (existingType !== newType) {
    return {
      shouldDisambiguate: true,
      confidence: 1.0,
      reason: `Different entity types (${existingType} vs ${newType})`
    };
  }

  // Strategy 2: No profiles available = assume same entity (conservative)
  if (!existingProfile || !newProfile) {
    return {
      shouldDisambiguate: false,
      confidence: 0.5,
      reason: 'Insufficient profile data'
    };
  }

  // Strategy 3: Profile similarity analysis
  const similarity = calculateProfileSimilarity(existingProfile, newProfile);

  if (similarity < 0.3) {
    // Very low similarity = different entities
    return {
      shouldDisambiguate: true,
      confidence: 0.9,
      reason: `Very different contexts (${(similarity * 100).toFixed(1)}% similarity)`
    };
  } else if (similarity < 0.5) {
    // Moderate similarity = possibly different, but not confident
    return {
      shouldDisambiguate: true,
      confidence: 0.6,
      reason: `Moderately different contexts (${(similarity * 100).toFixed(1)}% similarity)`
    };
  } else {
    // High similarity = same entity
    return {
      shouldDisambiguate: false,
      confidence: 0.8,
      reason: `Similar contexts (${(similarity * 100).toFixed(1)}% similarity)`
    };
  }
}

/**
 * Calculate profile similarity (standalone version for discrimination)
 */
function calculateProfileSimilarity(profile1: EntityProfile, profile2: EntityProfile): number {
  let score = 0;
  let weights = 0;

  // Context similarity
  if (profile1.contexts.length > 0 && profile2.contexts.length > 0) {
    const words1 = new Set(profile1.contexts.join(' ').toLowerCase().split(/\s+/));
    const words2 = new Set(profile2.contexts.join(' ').toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    const contextSim = union.size > 0 ? intersection.size / union.size : 0;
    score += contextSim * 0.5;
    weights += 0.5;
  }

  // Descriptor similarity
  if (profile1.descriptors.size > 0 && profile2.descriptors.size > 0) {
    const intersection = new Set([...profile1.descriptors].filter(x => profile2.descriptors.has(x)));
    const union = new Set([...profile1.descriptors, ...profile2.descriptors]);
    const descSim = union.size > 0 ? intersection.size / union.size : 0;
    score += descSim * 0.3;
    weights += 0.3;
  }

  // Title similarity
  if (profile1.titles.size > 0 && profile2.titles.size > 0) {
    const intersection = new Set([...profile1.titles].filter(x => profile2.titles.has(x)));
    const union = new Set([...profile1.titles, ...profile2.titles]);
    const titleSim = union.size > 0 ? intersection.size / union.size : 0;
    score += titleSim * 0.2;
    weights += 0.2;
  }

  return weights > 0 ? score / weights : 0;
}

/**
 * Singleton sense registry
 */
let globalRegistry: SenseRegistry | null = null;

export function getSenseRegistry(): SenseRegistry {
  if (!globalRegistry) {
    globalRegistry = new SenseRegistry();
  }
  return globalRegistry;
}

export const senseRegistry = getSenseRegistry();
