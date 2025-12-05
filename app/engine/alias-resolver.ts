/**
 * Alias Resolver - Phase 3
 *
 * Intelligently maps surface forms to entities (EIDs).
 * Uses multiple strategies to determine if different surface forms
 * refer to the same entity.
 *
 * Strategies:
 * 1. Exact match (case-insensitive)
 * 2. Title variations ("Gandalf" vs "Gandalf the Grey")
 * 3. Profile similarity (context-based)
 * 4. Entity type consistency
 * 5. Manual mappings (user-defined)
 */

import type { Entity, EntityType } from './schema';
import type { EntityProfile } from './entity-profiler';
import { aliasRegistry } from './alias-registry';
import { eidRegistry } from './eid-registry';
import { normalizeForAliasing } from './hert/fingerprint';

/**
 * Alias resolution result
 */
export interface AliasResolution {
  eid: number;              // Resolved entity ID
  aid: number;              // Alias ID
  confidence: number;       // Confidence in resolution (0-1)
  method: 'exact' | 'title-variation' | 'profile-similarity' | 'manual' | 'new';
  canonical?: string;       // Canonical name for this EID
}

/**
 * Title variation patterns
 */
const TITLE_PATTERNS = [
  // Remove articles
  /^(the|a|an)\s+/i,
  // Remove titles/honorifics
  /^(sir|lord|lady|king|queen|prince|princess|professor|dr|mr|mrs|ms)\s+/i,
  // Remove epithets (words after "the")
  /\s+the\s+\w+$/i,
  // Remove descriptors in parentheses
  /\s*\([^)]+\)\s*/g,
];

/**
 * Alias Resolver
 */
export class AliasResolver {
  private manualMappings: Map<string, number>; // surface form → EID (user-defined)

  constructor() {
    this.manualMappings = new Map();
  }

  /**
   * Resolve a surface form to an entity
   *
   * @param surfaceForm - How the entity appears in text
   * @param entityType - Entity type from extraction
   * @param profile - Entity profile (optional, for context-based matching)
   * @param existingProfiles - All existing profiles (for similarity matching)
   * @returns Resolution or null if should create new entity
   */
  resolve(
    surfaceForm: string,
    entityType: EntityType,
    profile?: EntityProfile,
    existingProfiles?: Map<string, EntityProfile>
  ): AliasResolution | null {
    // Strategy 1: Check if already registered
    const existingAID = aliasRegistry.getAID(surfaceForm);
    if (existingAID !== null) {
      const mapping = aliasRegistry.getByAID(existingAID);
      if (mapping) {
        return {
          eid: mapping.eid,
          aid: existingAID,
          confidence: mapping.confidence,
          method: 'exact',
          canonical: eidRegistry.getCanonical(mapping.eid) || undefined
        };
      }
    }

    // Strategy 2: Check manual mappings
    const normalizedForm = normalizeForAliasing(surfaceForm);
    const manualEID = this.manualMappings.get(normalizedForm);
    if (manualEID !== undefined) {
      const aid = aliasRegistry.register(surfaceForm, manualEID, 1.0);
      return {
        eid: manualEID,
        aid,
        confidence: 1.0,
        method: 'manual',
        canonical: eidRegistry.getCanonical(manualEID) || undefined
      };
    }

    // Strategy 3: Try title variations
    const titleMatch = this.findTitleVariation(surfaceForm, entityType);
    if (titleMatch) {
      const aid = aliasRegistry.register(surfaceForm, titleMatch.eid, titleMatch.confidence);
      return {
        eid: titleMatch.eid,
        aid,
        confidence: titleMatch.confidence,
        method: 'title-variation',
        canonical: eidRegistry.getCanonical(titleMatch.eid) || undefined
      };
    }

    // Strategy 4: Profile-based similarity (if profile provided)
    if (profile && existingProfiles && existingProfiles.size > 0) {
      const profileMatch = this.findBestProfileMatch(surfaceForm, profile, entityType, existingProfiles);
      if (profileMatch && profileMatch.confidence > 0.8) {
        const aid = aliasRegistry.register(surfaceForm, profileMatch.eid, profileMatch.confidence);
        return {
          eid: profileMatch.eid,
          aid,
          confidence: profileMatch.confidence,
          method: 'profile-similarity',
          canonical: eidRegistry.getCanonical(profileMatch.eid) || undefined
        };
      }
    }

    // No match found - caller should create new entity
    return null;
  }

  /**
   * Register a new surface form → entity mapping
   */
  registerAlias(surfaceForm: string, eid: number, confidence: number = 1.0): number {
    return aliasRegistry.register(surfaceForm, eid, confidence);
  }

  /**
   * Add manual mapping (user-defined)
   */
  addManualMapping(surfaceForm: string, eid: number): void {
    const normalizedForm = normalizeForAliasing(surfaceForm);
    this.manualMappings.set(normalizedForm, eid);
    aliasRegistry.register(surfaceForm, eid, 1.0);
    console.log(`[ALIAS-RESOLVER] Manual mapping: "${surfaceForm}" → EID ${eid}`);
  }

  /**
   * Find title variation matches
   *
   * Examples:
   * - "Gandalf" matches "Gandalf the Grey"
   * - "Professor Dumbledore" matches "Dumbledore"
   * - "King Théoden" matches "Théoden"
   */
  private findTitleVariation(surfaceForm: string, entityType: EntityType): { eid: number; confidence: number } | null {
    const normalized = normalizeForAliasing(surfaceForm);

    // Get all existing aliases
    const allMappings = Array.from(aliasRegistry['mappings'].values());

    for (const mapping of allMappings) {
      // Skip if different entity type
      const canonical = eidRegistry.getCanonical(mapping.eid);
      if (!canonical) continue;

      // Check if it's a title variation
      if (this.isTitleVariation(normalized, mapping.normalizedKey)) {
        return {
          eid: mapping.eid,
          confidence: 0.9 // High confidence for title variations
        };
      }
    }

    return null;
  }

  /**
   * Check if two forms are title variations of each other
   *
   * GUARD: Don't match pure surnames to compound names
   * e.g., "Potter" should NOT match "Harry Potter"
   * This prevents premature canonicalization that blocks GlobalKnowledgeGraph
   * surname-based merging with 0.90 confidence thresholds
   */
  private isTitleVariation(form1: string, form2: string): boolean {
    if (form1 === form2) return true;

    // Guard: Check if one is a pure surname (single token)
    const tokens1 = form1.split(/\s+/).filter(Boolean);
    const tokens2 = form2.split(/\s+/).filter(Boolean);

    const isPureSurname1 = tokens1.length === 1;
    const isPureSurname2 = tokens2.length === 1;

    // If one is pure surname and other is compound name, reject
    // Example: "Potter" (1 token) + "Harry Potter" (2 tokens) → reject
    // This allows GlobalKnowledgeGraph to do proper surname merging later
    if ((isPureSurname1 && tokens2.length > 1) ||
        (isPureSurname2 && tokens1.length > 1)) {
      return false;
    }

    // Try removing titles/epithets from both
    let stripped1 = form1;
    let stripped2 = form2;

    for (const pattern of TITLE_PATTERNS) {
      stripped1 = stripped1.replace(pattern, '');
      stripped2 = stripped2.replace(pattern, '');
    }

    stripped1 = stripped1.trim();
    stripped2 = stripped2.trim();

    // If one is substring of other after stripping
    if (stripped1.includes(stripped2) || stripped2.includes(stripped1)) {
      // Make sure it's substantial overlap (not just single word)
      const minLength = Math.min(stripped1.length, stripped2.length);
      if (minLength >= 4) {  // At least 4 chars
        return true;
      }
    }

    // Check if one contains the other
    if (form1.includes(form2) || form2.includes(form1)) {
      const shorter = form1.length < form2.length ? form1 : form2;
      if (shorter.length >= 4) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find best profile match using similarity scoring
   */
  private findBestProfileMatch(
    surfaceForm: string,
    profile: EntityProfile,
    entityType: EntityType,
    existingProfiles: Map<string, EntityProfile>
  ): { eid: number; confidence: number } | null {
    let bestMatch: { eid: number; confidence: number } | null = null;

    for (const [key, existingProfile] of existingProfiles.entries()) {
      // Must have same entity type
      if (existingProfile.entity_type !== entityType) continue;

      // Get EID for this profile
      const eid = eidRegistry.get(existingProfile.canonical);
      if (!eid) continue;

      // Calculate similarity
      const similarity = this.calculateProfileSimilarity(profile, existingProfile);

      if (similarity > 0.8 && (!bestMatch || similarity > bestMatch.confidence)) {
        bestMatch = {
          eid,
          confidence: similarity
        };
      }
    }

    return bestMatch;
  }

  /**
   * Calculate similarity between two entity profiles
   */
  private calculateProfileSimilarity(profile1: EntityProfile, profile2: EntityProfile): number {
    let score = 0;
    let totalWeight = 0;

    // Context overlap (using contexts array)
    const contextWeight = 0.5;
    const contextOverlap = this.calculateContextSimilarity(
      profile1.contexts,
      profile2.contexts
    );
    score += contextOverlap * contextWeight;
    totalWeight += contextWeight;

    // Descriptor overlap (using descriptors set)
    const descriptorWeight = 0.3;
    const descriptorOverlap = this.calculateSetOverlap(
      profile1.descriptors,
      profile2.descriptors
    );
    score += descriptorOverlap * descriptorWeight;
    totalWeight += descriptorWeight;

    // Title overlap (using titles set)
    const titleWeight = 0.2;
    const titleOverlap = this.calculateSetOverlap(
      profile1.titles,
      profile2.titles
    );
    score += titleOverlap * titleWeight;
    totalWeight += titleWeight;

    return totalWeight > 0 ? score / totalWeight : 0;
  }

  /**
   * Calculate similarity between context arrays
   */
  private calculateContextSimilarity(
    contexts1: string[],
    contexts2: string[]
  ): number {
    if (contexts1.length === 0 || contexts2.length === 0) return 0;

    // Simple word overlap in contexts
    const words1 = new Set(contexts1.join(' ').toLowerCase().split(/\s+/));
    const words2 = new Set(contexts2.join(' ').toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Calculate Jaccard similarity between two sets
   */
  private calculateSetOverlap(set1: Set<string>, set2: Set<string>): number {
    if (set1.size === 0 || set2.size === 0) return 0;

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Get all aliases for an entity
   */
  getAliasesForEntity(eid: number): string[] {
    const mappings = aliasRegistry.getAliasesForEntity(eid);
    return mappings.map(m => m.surfaceForm);
  }

  /**
   * Merge two entities (move all aliases from source to target)
   */
  mergeEntities(sourceEID: number, targetEID: number): number {
    return aliasRegistry.mergeEntities(sourceEID, targetEID);
  }
}

/**
 * Singleton instance
 */
let globalResolver: AliasResolver | null = null;

export function getAliasResolver(): AliasResolver {
  if (!globalResolver) {
    globalResolver = new AliasResolver();
  }
  return globalResolver;
}

export const aliasResolver = getAliasResolver();
