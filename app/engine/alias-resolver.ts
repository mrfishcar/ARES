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

import type { Entity, EntityType, EntityTier } from './schema';
import type { EntityProfile } from './entity-profiler';
import { aliasRegistry } from './alias-registry';
import { eidRegistry } from './eid-registry';
import { normalizeForAliasing } from './hert/fingerprint';
import { canMergeByTier, type TierMergeOptions, DEFAULT_TIER_MERGE_OPTIONS } from './entity-tier-assignment';

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
  // Remove titles/honorifics (with optional dot after: "Mr." or "Mr ")
  /^(sir|lord|lady|king|queen|prince|princess|professor|dr|mr|mrs|ms|miss)\.?\s+/i,
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
    // Strategy 1: Check if already registered (with type compatibility check)
    const existingAID = aliasRegistry.getAID(surfaceForm);
    if (existingAID !== null) {
      const mapping = aliasRegistry.getByAID(existingAID);
      if (mapping) {
        // CRITICAL: Check type compatibility before using exact match
        // Don't resolve to an entity of incompatible type (e.g., PLACE → ORG)
        if (mapping.entityType && !this.areTypesCompatible(entityType, mapping.entityType as EntityType)) {
          // Types are incompatible - skip this match and try other strategies
          // This allows "Mont Linola" (PLACE) to stay separate from "Mont Linola Junior High" (ORG)
        } else {
          return {
            eid: mapping.eid,
            aid: existingAID,
            confidence: mapping.confidence,
            method: 'exact',
            canonical: eidRegistry.getCanonical(mapping.eid) || undefined
          };
        }
      }
    }

    // Strategy 2: Check manual mappings
    const normalizedForm = normalizeForAliasing(surfaceForm);
    const manualEID = this.manualMappings.get(normalizedForm);
    if (manualEID !== undefined) {
      const aid = aliasRegistry.register(surfaceForm, manualEID, 1.0, entityType);
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
      const aid = aliasRegistry.register(surfaceForm, titleMatch.eid, titleMatch.confidence, entityType);
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
        const aid = aliasRegistry.register(surfaceForm, profileMatch.eid, profileMatch.confidence, entityType);
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
  registerAlias(surfaceForm: string, eid: number, confidence: number = 1.0, entityType?: EntityType): number {
    return aliasRegistry.register(surfaceForm, eid, confidence, entityType);
  }

  /**
   * Add manual mapping (user-defined)
   */
  addManualMapping(surfaceForm: string, eid: number, entityType?: EntityType): void {
    const normalizedForm = normalizeForAliasing(surfaceForm);
    this.manualMappings.set(normalizedForm, eid);
    aliasRegistry.register(surfaceForm, eid, 1.0, entityType);
    console.log(`[ALIAS-RESOLVER] Manual mapping: "${surfaceForm}" → EID ${eid}`);
  }

  /**
   * Tier-aware resolution
   *
   * Graduated merging based on entity tiers:
   * - TIER_A can merge with TIER_A (full merging)
   * - TIER_B can merge with TIER_A or TIER_B (cautious merging)
   * - TIER_C can conditionally merge:
   *   - To TIER_A if confidence > 0.85 or strong namehood evidence
   *   - To TIER_B if same document + same type
   *   - TIER_C → TIER_C is blocked (garbage isolation)
   *
   * @param entity - Entity to resolve (includes tier information)
   * @param profile - Optional profile for context-based matching
   * @param existingProfiles - All existing profiles
   * @param tierOptions - Optional tier merge configuration
   * @returns Resolution or null if should create new entity
   */
  resolveWithTier(
    entity: Entity,
    profile?: EntityProfile,
    existingProfiles?: Map<string, EntityProfile>,
    tierOptions?: TierMergeOptions
  ): AliasResolution | null {
    const tier = entity.tier ?? 'TIER_A'; // Default to TIER_A for backward compatibility
    const opts = { ...DEFAULT_TIER_MERGE_OPTIONS, ...tierOptions };

    // For TIER_A and TIER_B, use standard resolution
    if (tier !== 'TIER_C') {
      return this.resolve(entity.canonical, entity.type, profile, existingProfiles);
    }

    // TIER_C: Check if conditional merge is possible
    // First, try to find a potential match
    const potentialMatch = this.resolve(entity.canonical, entity.type, profile, existingProfiles);

    if (!potentialMatch) {
      // No match found anyway - create new entity
      if (process.env.TIER_DEBUG === '1') {
        console.log(`[ALIAS-RESOLVER] TIER_C entity "${entity.canonical}" - no potential matches found`);
      }
      return null;
    }

    // Found a potential match - check tier compatibility
    // We need to look up the target entity's tier
    const targetCanonical = potentialMatch.canonical;
    const targetConfidence = potentialMatch.confidence;

    // Create a mock target entity for tier checking
    // In practice, we use confidence as proxy for tier quality
    const targetEntity: Entity = {
      id: `target_${potentialMatch.eid}`,
      type: entity.type,
      canonical: targetCanonical || entity.canonical,
      aliases: [],
      confidence: targetConfidence,
      created_at: new Date().toISOString(),
      // Infer tier from confidence (higher confidence = higher tier)
      tier: targetConfidence >= 0.85 ? 'TIER_A' : (targetConfidence >= 0.6 ? 'TIER_B' : 'TIER_C')
    };

    const mergeCheck = canMergeByTier(entity, targetEntity, opts);

    if (mergeCheck.canMerge) {
      if (process.env.TIER_DEBUG === '1') {
        console.log(`[ALIAS-RESOLVER] TIER_C entity "${entity.canonical}" allowed to merge: ${mergeCheck.reason}`);
      }
      return potentialMatch;
    }

    // Merge not allowed
    if (process.env.TIER_DEBUG === '1') {
      console.log(`[ALIAS-RESOLVER] TIER_C entity "${entity.canonical}" blocked from merge: ${mergeCheck.reason}`);
    }
    return null;
  }

  /**
   * Check if an entity can be merged based on its tier
   *
   * @param entity - Entity to check
   * @returns true if entity can participate in alias merging
   */
  canMergeEntity(entity: Entity): boolean {
    const tier = entity.tier ?? 'TIER_A';
    return tier !== 'TIER_C';
  }

  /**
   * Find title variation matches
   *
   * Examples:
   * - "Gandalf" matches "Gandalf the Grey"
   * - "Professor Dumbledore" matches "Dumbledore"
   * - "King Théoden" matches "Théoden"
   *
   * GUARD: Prevents cross-type merging (PLACE + ORG, PERSON + ORG, etc.)
   */
  private findTitleVariation(surfaceForm: string, entityType: EntityType): { eid: number; confidence: number } | null {
    const normalized = normalizeForAliasing(surfaceForm);

    // Get all existing aliases
    const allMappings = Array.from(aliasRegistry['mappings'].values());

    // Debug: Log what we're looking for
    if (process.env.DEBUG_ALIAS_RESOLVER === '1') {
      console.log(`[ALIAS-RESOLVER] findTitleVariation: looking for "${surfaceForm}" (normalized: "${normalized}"), type: ${entityType}`);
      console.log(`[ALIAS-RESOLVER]   Checking against ${allMappings.length} existing aliases`);
    }

    for (const mapping of allMappings) {
      const canonical = eidRegistry.getCanonical(mapping.eid);
      if (!canonical) continue;

      // CRITICAL: Check type compatibility before allowing merge
      // Don't merge entities of fundamentally different types
      if (mapping.entityType && !this.areTypesCompatible(entityType, mapping.entityType as EntityType)) {
        if (process.env.DEBUG_ALIAS_RESOLVER === '1') {
          console.log(`[ALIAS-RESOLVER]   Skipping "${mapping.normalizedKey}" - incompatible type ${mapping.entityType}`);
        }
        continue;
      }

      // Check if it's a title variation
      const isMatch = this.isTitleVariation(normalized, mapping.normalizedKey);
      if (process.env.DEBUG_ALIAS_RESOLVER === '1') {
        console.log(`[ALIAS-RESOLVER]   Comparing "${normalized}" vs "${mapping.normalizedKey}" → ${isMatch ? 'MATCH' : 'no match'}`);
      }
      if (isMatch) {
        console.log(`[ALIAS-RESOLVER] Title variation match: "${surfaceForm}" → "${canonical}" (EID ${mapping.eid})`);
        return {
          eid: mapping.eid,
          confidence: 0.9 // High confidence for title variations
        };
      }
    }

    return null;
  }

  /**
   * Check if two entity types are compatible for merging
   *
   * Types in the same group can merge:
   * - Location types: PLACE, GPE (Geographic Political Entity)
   * - Organization types: ORG
   * - Person types: PERSON
   * - Date/Time types: DATE, TIME
   *
   * Cross-group merging is NOT allowed (e.g., PLACE + ORG)
   */
  private areTypesCompatible(type1: EntityType, type2: EntityType): boolean {
    // Same type always compatible
    if (type1 === type2) return true;

    // Define type groups
    const locationTypes = new Set(['PLACE', 'GPE']);
    const orgTypes = new Set(['ORG']);
    const personTypes = new Set(['PERSON']);
    const timeTypes = new Set(['DATE', 'TIME']);

    // Check if both types are in the same group
    if (locationTypes.has(type1) && locationTypes.has(type2)) return true;
    if (orgTypes.has(type1) && orgTypes.has(type2)) return true;
    if (personTypes.has(type1) && personTypes.has(type2)) return true;
    if (timeTypes.has(type1) && timeTypes.has(type2)) return true;

    // Cross-group merging not allowed
    return false;
  }

  /**
   * Check if two forms are title variations of each other
   *
   * SURNAME MATCHING: Allow surname-only to match compound names when:
   * - The surname matches the LAST token of the compound name
   * - This handles "Garrison" → "Charles Garrison" and "Garrison" → "Mr. Garrison"
   *
   * GUARD: Don't match entities with different honorific prefixes
   * e.g., "Mr Dursley" should NOT match "Mrs Dursley"
   * These are different people who share a surname
   */
  private isTitleVariation(form1: string, form2: string): boolean {
    if (form1 === form2) return true;

    // Tokenize both forms
    const tokens1 = form1.split(/\s+/).filter(Boolean);
    const tokens2 = form2.split(/\s+/).filter(Boolean);

    const isPureSurname1 = tokens1.length === 1;
    const isPureSurname2 = tokens2.length === 1;

    // SURNAME MATCHING: If one is a pure surname and it matches the last token
    // of the compound name, allow the match
    // Example: "garrison" (1 token) + "charles garrison" (2 tokens) → match
    // Example: "garrison" (1 token) + "mr garrison" (2 tokens) → match
    if (isPureSurname1 && tokens2.length > 1) {
      const surname1 = tokens1[0].toLowerCase();
      const lastToken2 = tokens2[tokens2.length - 1].toLowerCase();
      if (surname1 === lastToken2) {
        console.log(`[ALIAS-RESOLVER] Surname match: "${form1}" matches last token of "${form2}"`);
        return true;
      }
    }
    if (isPureSurname2 && tokens1.length > 1) {
      const surname2 = tokens2[0].toLowerCase();
      const lastToken1 = tokens1[tokens1.length - 1].toLowerCase();
      if (surname2 === lastToken1) {
        console.log(`[ALIAS-RESOLVER] Surname match: "${form2}" matches last token of "${form1}"`);
        return true;
      }
    }

    // GUARD 2: Different honorific prefixes = different people
    // "Mr Dursley" vs "Mrs Dursley" → NEVER merge (husband vs wife)
    const honorificPattern = /^(mr|mrs|ms|miss|dr|prof|sir|lady|lord)\.?\s+/i;
    const honor1 = form1.match(honorificPattern);
    const honor2 = form2.match(honorificPattern);

    if (honor1 && honor2) {
      const h1 = honor1[1].toLowerCase().replace(/\.$/, '');
      const h2 = honor2[1].toLowerCase().replace(/\.$/, '');
      // If both have honorifics but they're different, these are different people
      if (h1 !== h2) {
        return false;
      }
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
