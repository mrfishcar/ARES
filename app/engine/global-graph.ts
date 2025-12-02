/**
 * Global Knowledge Graph
 *
 * Cross-document entity resolution and global knowledge aggregation
 * Handles:
 * - Entity matching across documents
 * - Confidence-based merging
 * - Disambiguation of similar entities
 * - Relation aggregation
 */

import type { Entity, Relation, EntityType } from './schema';

export interface GlobalEntity {
  id: string; // Global EID
  type: EntityType;
  canonical: string; // Primary/preferred name
  aliases: string[]; // All known names for this entity
  mentionCount: number; // Total mentions across all documents
  documents: string[]; // Document IDs where entity appears
  attributes: Record<string, any>; // Merged attributes
  confidence: number; // Overall confidence
  firstSeen: string; // Document ID where first extracted
}

export interface GlobalRelation {
  id: string;
  type: string;
  subj: string; // Global entity ID
  obj: string; // Global entity ID
  confidence: number;
  documents: string[]; // Document IDs where relation appears
  evidence: string[]; // Text snippets supporting relation
}

export interface DocumentMetadata {
  id: string;
  text: string;
  processedAt: Date;
  entityCount: number;
  relationCount: number;
}

interface EntityMatch {
  entity1: GlobalEntity | Entity;
  entity2: Entity;
  confidence: number;
  matchType: 'exact' | 'alias' | 'contextual' | null;
  evidence: string[];
}

interface ExportedGraph {
  entities: GlobalEntity[];
  relations: GlobalRelation[];
  documents: DocumentMetadata[];
}

export class GlobalKnowledgeGraph {
  private entities: Map<string, GlobalEntity> = new Map();
  private relations: Map<string, GlobalRelation> = new Map();
  private documents: Map<string, DocumentMetadata> = new Map();
  private canonicalToGlobalId: Map<string, string> = new Map(); // For fast lookups

  // 🚀 LEVEL 5B: Performance Optimizations
  // Indices for fast filtering
  private byType: Map<EntityType, Set<string>> = new Map(); // Type → entity IDs
  private byFirstLetter: Map<string, Set<string>> = new Map(); // "type:P" → entity IDs

  // Caching
  private matchCache: Map<string, { confidence: number; matchType: string | null }> = new Map();
  private normalizedCache: Map<string, string> = new Map();
  private cacheStats = { hits: 0, misses: 0 };

  addDocument(
    docId: string,
    text: string,
    entities: Entity[],
    relations: Relation[]
  ): void {
    // Store document metadata
    this.documents.set(docId, {
      id: docId,
      text,
      processedAt: new Date(),
      entityCount: entities.length,
      relationCount: relations.length
    });

    // Create a map from old entity IDs to new global IDs
    // (needed because merging may create new IDs)
    const entityIdMap = new Map<string, string>();

    // Merge each entity into global graph
    for (const entity of entities) {
      const globalId = this.mergeEntity(entity, docId);
      entityIdMap.set(entity.id, globalId);
    }

    // Merge each relation into global graph
    for (const relation of relations) {
      this.mergeRelation(relation, docId, entityIdMap);
    }
  }

  private mergeEntity(newEntity: Entity, docId: string): string {
    // 🛡️ MERGE THRESHOLDS: Tightened to prevent over-aggressive merging
    const HARD_MIN_CONFIDENCE = 0.93;  // Auto-merge only if very confident
    const SOFT_MIN_CONFIDENCE = 0.88;  // Consider candidates above this

    // 🚀 OPTIMIZATION 1: Quick exact match via canonical index
    const exactKey = `${newEntity.type}::${newEntity.canonical.toLowerCase()}`;
    const exactMatch = this.canonicalToGlobalId.get(exactKey);

    if (exactMatch) {
      const existing = this.entities.get(exactMatch)!;
      existing.mentionCount += 1;
      existing.documents.push(docId);
      existing.documents = [...new Set(existing.documents)];
      return existing.id;
    }

    // 🚀 OPTIMIZATION 2: Only check candidates (filtered by type/letter)
    const candidates = this.getCandidateMatches(newEntity);

    if (candidates.length === 0) {
      // No match found - create new global entity
      const globalEntity: GlobalEntity = {
        id: newEntity.id,
        type: newEntity.type,
        canonical: newEntity.canonical,
        aliases: [newEntity.canonical],
        mentionCount: 1,
        documents: [docId],
        attributes: newEntity.attrs || {},
        confidence: 0.85,
        firstSeen: docId
      };
      this.entities.set(newEntity.id, globalEntity);
      this.addIndexes(globalEntity);
      return newEntity.id;
    }

    // Find existing entities that might match
    const matches: EntityMatch[] = [];

    for (const existingEntity of candidates) {
      const match = calculateMatchConfidence(existingEntity, newEntity);

      // 🛡️ DEBUG LOGGING: Track merge decisions
      if (match.confidence >= 0.7 && process.env.DEBUG_ENTITY_MERGE === 'true') {
        console.log('[ENTITY MERGE CANDIDATE]', {
          existingId: existingEntity.id,
          existingName: existingEntity.canonical,
          existingType: existingEntity.type,
          newId: newEntity.id,
          newName: newEntity.canonical,
          newType: newEntity.type,
          confidence: match.confidence.toFixed(3),
          matchType: match.matchType,
          reason: match.evidence.join('; ')
        });
      }

      // 🛡️ SOFT FILTER: Ignore low-confidence matches
      if (match.confidence < SOFT_MIN_CONFIDENCE) {
        continue;
      }

      // 🛡️ TYPE COMPATIBILITY CHECK: Prevent person/org/place cross-merging
      if (!areEntityTypesCompatible(existingEntity, newEntity, match)) {
        if (process.env.DEBUG_ENTITY_MERGE === 'true') {
          console.log('[ENTITY MERGE REJECTED] Type incompatibility:', {
            existing: `${existingEntity.canonical} (${existingEntity.type})`,
            new: `${newEntity.canonical} (${newEntity.type})`,
            confidence: match.confidence.toFixed(3)
          });
        }
        continue;
      }

      matches.push({ ...match, entity1: existingEntity, entity2: newEntity });
    }

    if (matches.length === 0) {
      // No match found - create new entity
      const globalEntity: GlobalEntity = {
        id: newEntity.id,
        type: newEntity.type,
        canonical: newEntity.canonical,
        aliases: [newEntity.canonical],
        mentionCount: 1,
        documents: [docId],
        attributes: newEntity.attrs || {},
        confidence: 0.85,
        firstSeen: docId
      };
      this.entities.set(newEntity.id, globalEntity);
      this.addIndexes(globalEntity);
      return newEntity.id;
    }

    // Pick best match
    const bestMatch = matches.sort((a, b) => b.confidence - a.confidence)[0];

    // 🛡️ HARD THRESHOLD: Only merge if confidence is very high
    if (bestMatch.confidence < HARD_MIN_CONFIDENCE) {
      if (process.env.DEBUG_ENTITY_MERGE === 'true') {
        console.log('[ENTITY MERGE REJECTED] Below hard threshold:', {
          existing: `${bestMatch.entity1.canonical} (${bestMatch.entity1.type})`,
          new: `${newEntity.canonical} (${newEntity.type})`,
          confidence: bestMatch.confidence.toFixed(3),
          threshold: HARD_MIN_CONFIDENCE
        });
      }

      // Create new entity instead of merging
      const globalEntity: GlobalEntity = {
        id: newEntity.id,
        type: newEntity.type,
        canonical: newEntity.canonical,
        aliases: [newEntity.canonical],
        mentionCount: 1,
        documents: [docId],
        attributes: newEntity.attrs || {},
        confidence: 0.85,
        firstSeen: docId
      };
      this.entities.set(newEntity.id, globalEntity);
      this.addIndexes(globalEntity);
      return newEntity.id;
    }

    // Match found with high confidence - merge with existing entity
    const existing = bestMatch.entity1 as GlobalEntity;

    if (process.env.DEBUG_ENTITY_MERGE === 'true') {
      console.log('[ENTITY MERGE SUCCESS]', {
        existing: `${existing.canonical} (${existing.type})`,
        new: `${newEntity.canonical} (${newEntity.type})`,
        confidence: bestMatch.confidence.toFixed(3)
      });
    }

    // Merge data
    existing.aliases.push(newEntity.canonical);
    existing.aliases = [...new Set(existing.aliases)]; // Deduplicate
    existing.mentionCount += 1;
    existing.documents.push(docId);
    existing.documents = [...new Set(existing.documents)];
    existing.attributes = mergeAttributes(existing.attributes, newEntity.attrs || {});

    // Choose best canonical name
    existing.canonical = chooseBestCanonical([existing.canonical, newEntity.canonical]);

    // Update lookup index
    this.addIndexes(existing);

    return existing.id;
  }

  private mergeRelation(
    newRelation: Relation,
    docId: string,
    entityIdMap: Map<string, string>
  ): void {
    // Map old entity IDs to global IDs
    const globalSubjId = entityIdMap.get(newRelation.subj) || newRelation.subj;
    const globalObjId = entityIdMap.get(newRelation.obj) || newRelation.obj;

    // Create relation key
    const relationKey = `${newRelation.pred}::${globalSubjId}::${globalObjId}`;

    if (this.relations.has(relationKey)) {
      // Relation exists - update metadata
      const existing = this.relations.get(relationKey)!;
      existing.documents.push(docId);
      existing.documents = [...new Set(existing.documents)];
      existing.confidence = Math.max(existing.confidence, newRelation.confidence);
    } else {
      // New relation - add to graph
      const globalRelation: GlobalRelation = {
        id: relationKey,
        type: newRelation.pred,
        subj: globalSubjId,
        obj: globalObjId,
        confidence: newRelation.confidence,
        documents: [docId],
        evidence: newRelation.subj_surface && newRelation.obj_surface
          ? [`${newRelation.subj_surface} --[${newRelation.pred}]--> ${newRelation.obj_surface}`]
          : []
      };
      this.relations.set(relationKey, globalRelation);
    }
  }

  // 🚀 LEVEL 5B: Helper methods for optimization

  /**
   * Get filtered candidate entities for matching
   * Uses indices to avoid comparing against all entities
   */
  private getCandidateMatches(newEntity: Entity): GlobalEntity[] {
    const candidates = new Set<GlobalEntity>();

    // Same type only
    const sameType = this.byType.get(newEntity.type) || new Set();

    // Add by first letter for faster initial filtering
    const firstLetter = newEntity.canonical[0]?.toLowerCase() || '';
    const byLetter = this.byFirstLetter.get(`${newEntity.type}:${firstLetter}`) || new Set();

    // Combine and fetch entities
    for (const id of new Set([...sameType, ...byLetter])) {
      const entity = this.entities.get(id);
      if (entity) candidates.add(entity);
    }

    return Array.from(candidates);
  }

  /**
   * Add entity to all indices for fast lookups
   */
  private addIndexes(entity: GlobalEntity): void {
    // Index by type
    if (!this.byType.has(entity.type)) {
      this.byType.set(entity.type, new Set());
    }
    this.byType.get(entity.type)!.add(entity.id);

    // Index by first letter
    const firstLetter = entity.canonical[0]?.toLowerCase() || '';
    const key = `${entity.type}:${firstLetter}`;
    if (!this.byFirstLetter.has(key)) {
      this.byFirstLetter.set(key, new Set());
    }
    this.byFirstLetter.get(key)!.add(entity.id);

    // Canonical index
    this.canonicalToGlobalId.set(
      `${entity.type}::${entity.canonical.toLowerCase()}`,
      entity.id
    );
  }

  /**
   * Get statistics about caching and performance
   */
  getStats(): {
    entityCount: number;
    relationCount: number;
    documentCount: number;
    cacheHitRate: number;
    totalCacheChecks: number;
  } {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    return {
      entityCount: this.entities.size,
      relationCount: this.relations.size,
      documentCount: this.documents.size,
      cacheHitRate: total > 0 ? this.cacheStats.hits / total : 0,
      totalCacheChecks: total
    };
  }

  /**
   * Query entities by name (with fuzzy matching)
   */
  findEntitiesByName(name: string, type?: EntityType): GlobalEntity[] {
    const needle = name.toLowerCase();
    const candidates = Array.from(this.entities.values());

    return candidates.filter((e) => {
      if (type && e.type !== type) return false;
      return (
        e.canonical.toLowerCase().includes(needle) ||
        e.aliases.some((a) => a.toLowerCase().includes(needle))
      );
    });
  }

  /**
   * Query entities by type
   */
  getEntitiesByType(type: EntityType): GlobalEntity[] {
    const ids = this.byType.get(type) || new Set();
    return Array.from(ids)
      .map((id) => this.entities.get(id))
      .filter((e): e is GlobalEntity => e !== undefined);
  }

  /**
   * Get relations for an entity (inbound, outbound, or both)
   */
  getRelations(
    entityId: string,
    direction?: 'inbound' | 'outbound'
  ): GlobalRelation[] {
    return Array.from(this.relations.values()).filter((r) => {
      if (direction === 'inbound') return r.obj === entityId;
      if (direction === 'outbound') return r.subj === entityId;
      return r.subj === entityId || r.obj === entityId;
    });
  }

  /**
   * Export with optional filtering
   */
  export(options?: {
    entityTypes?: EntityType[];
    documentIds?: string[];
  }): ExportedGraph {
    let entities = Array.from(this.entities.values());

    if (options?.entityTypes) {
      entities = entities.filter((e) => options.entityTypes!.includes(e.type));
    }

    if (options?.documentIds) {
      const docSet = new Set(options.documentIds);
      entities = entities.filter((e) =>
        e.documents.some((d) => docSet.has(d))
      );
    }

    // Filter relations to only included entities
    const entityIds = new Set(entities.map((e) => e.id));
    const relations = Array.from(this.relations.values()).filter(
      (r) => entityIds.has(r.subj) && entityIds.has(r.obj)
    );

    return {
      entities,
      relations,
      documents: Array.from(this.documents.values())
    };
  }
}

/**
 * 🛡️ Check if two entities are compatible for merging based on their types and names
 * Prevents PERSON entities from merging with ORG/PLACE entities
 */
function areEntityTypesCompatible(
  existing: GlobalEntity | Entity,
  candidate: Entity,
  match: EntityMatch
): boolean {
  // Helper: Check if name contains org keywords
  const hasOrgKeyword = (name: string): boolean => {
    const lower = name.toLowerCase();
    const orgKeywords = [
      'school', 'junior', 'high', 'academy', 'university', 'college', 'institute',
      'church', 'foundation', 'company', 'inc', 'ltd', 'corp', 'co',
      'city', 'valley', 'mount', 'mont', 'river', 'lake', 'county'
    ];
    return orgKeywords.some(kw => lower.includes(kw));
  };

  // Helper: Check if name looks like a person (1-3 capitalized tokens, no org keywords)
  const looksLikePerson = (entity: GlobalEntity | Entity): boolean => {
    const tokens = entity.canonical.split(/\s+/).filter(Boolean);
    if (tokens.length < 1 || tokens.length > 3) return false;
    if (hasOrgKeyword(entity.canonical)) return false;
    // All tokens should start with capital letter
    return tokens.every(t => /^[A-Z]/.test(t));
  };

  // RULE 1: If one looks like PERSON and other has org keywords → reject
  if (looksLikePerson(existing) && hasOrgKeyword(candidate.canonical)) {
    return false;
  }
  if (looksLikePerson(candidate) && hasOrgKeyword(existing.canonical)) {
    return false;
  }

  // RULE 2: Strong type mismatch → reject (unless one is UNKNOWN)
  const strongTypes = new Set(['PERSON', 'ORG', 'PLACE', 'GPE', 'EVENT']);
  const existingStrong = strongTypes.has(existing.type);
  const candidateStrong = strongTypes.has(candidate.type);

  if (existingStrong && candidateStrong && existing.type !== candidate.type) {
    // Allow PERSON <-> UNKNOWN, ORG <-> UNKNOWN, but not PERSON <-> ORG
    const compatiblePairs = [
      ['PERSON', 'UNKNOWN'], ['UNKNOWN', 'PERSON'],
      ['ORG', 'UNKNOWN'], ['UNKNOWN', 'ORG'],
      ['PLACE', 'GPE'], ['GPE', 'PLACE'],  // These are similar
      ['PLACE', 'UNKNOWN'], ['UNKNOWN', 'PLACE'],
      ['GPE', 'UNKNOWN'], ['UNKNOWN', 'GPE']
    ];

    const pair = [existing.type, candidate.type];
    const isCompatible = compatiblePairs.some(
      ([a, b]) => (pair[0] === a && pair[1] === b) || (pair[0] === b && pair[1] === a)
    );

    if (!isCompatible) {
      return false;
    }
  }

  return true;
}

/**
 * Helper: Normalize entity name for comparison
 */
interface NormalizedName {
  raw: string;
  tokens: string[];
  hasOrgKeyword: boolean;
  looksLikePerson: boolean;
}

function normalizeName(entity: GlobalEntity | Entity): NormalizedName {
  const raw = entity.canonical.toLowerCase();

  // Remove punctuation and split into tokens
  const allTokens = raw.replace(/[.,;:!?()]/g, '').split(/\s+/).filter(Boolean);

  // Remove stopwords
  const stopwords = new Set(['the', 'of', 'at', 'and', 'a', 'an', 'in', 'on']);
  const tokens = allTokens.filter(t => !stopwords.has(t));

  // Check for org keywords
  const orgKeywords = [
    'school', 'junior', 'high', 'academy', 'university', 'college', 'institute',
    'church', 'foundation', 'company', 'inc', 'llc', 'ltd', 'corp', 'co',
    'city', 'valley', 'mount', 'mont', 'river', 'lake', 'county', 'state'
  ];
  const hasOrgKeyword = orgKeywords.some(kw => raw.includes(kw));

  // Check if looks like person: 1-3 tokens, all capitalized, no org keywords
  const looksLikePerson = !hasOrgKeyword && tokens.length >= 1 && tokens.length <= 3 &&
    entity.canonical.split(/\s+/).every(t => /^[A-Z]/.test(t));

  return { raw, tokens, hasOrgKeyword, looksLikePerson };
}

/**
 * Calculate confidence that two entities refer to the same real-world entity
 * Enhanced with strict matching rules to prevent over-merging
 */
function calculateMatchConfidence(
  e1: GlobalEntity | Entity,
  e2: Entity
): EntityMatch {
  const result: EntityMatch = {
    entity1: e1,
    entity2: e2,
    confidence: 0.0,
    matchType: null,
    evidence: []
  };

  // Must be same type
  if (e1.type !== e2.type) {
    return result;
  }

  // Normalize names for comparison
  const norm1 = normalizeName(e1);
  const norm2 = normalizeName(e2);

  // 🛡️ GUARD: Person vs Org name clash
  if (norm1.looksLikePerson && norm2.hasOrgKeyword) {
    result.confidence = 0.1;
    result.evidence.push('person-vs-org-name-clash');
    return result;
  }
  if (norm2.looksLikePerson && norm1.hasOrgKeyword) {
    result.confidence = 0.1;
    result.evidence.push('person-vs-org-name-clash');
    return result;
  }

  const canon1 = norm1.raw;
  const canon2 = norm2.raw;
  const tokens1 = norm1.tokens;
  const tokens2 = norm2.tokens;

  // 🛡️ EXACT MATCH: Same canonical name
  if (canon1 === canon2) {
    result.confidence = 1.0;
    result.matchType = 'exact';
    result.evidence.push('exact canonical match');
    return result;
  }

  // 🛡️ JACCARD SIMILARITY: Token overlap
  const tokensSet1 = new Set(tokens1);
  const tokensSet2 = new Set(tokens2);
  const intersection = tokens1.filter(t => tokensSet2.has(t));
  const union = new Set([...tokens1, ...tokens2]);
  const jaccard = union.size > 0 ? intersection.length / union.size : 0;

  if (jaccard < 0.4) {
    // Very little overlap - cap confidence at 0.6
    result.confidence = Math.min(0.6, jaccard * 1.5);
    result.evidence.push(`low token overlap (${jaccard.toFixed(2)})`);
    return result;
  }

  // 🛡️ GUARD: Long name absorbs short name
  if ((tokens1.length >= 3 && tokens2.length <= 2) || (tokens2.length >= 3 && tokens1.length <= 2)) {
    const longName = tokens1.length > tokens2.length ? norm1 : norm2;
    const shortName = tokens1.length > tokens2.length ? norm2 : norm1;

    // If long name is org and short name looks like person → reject
    if (longName.hasOrgKeyword && shortName.looksLikePerson) {
      result.confidence = 0.3;
      result.evidence.push('long-org-absorbing-short-person');
      return result;
    }

    // Even if both look like person, be cautious with length mismatch
    if (shortName.looksLikePerson && longName.looksLikePerson) {
      // Only allow if they share a surname-like token (last token)
      const surname1 = tokens1[tokens1.length - 1];
      const surname2 = tokens2[tokens2.length - 1];
      if (surname1 !== surname2) {
        result.confidence = 0.5;
        result.evidence.push('length-mismatch-no-shared-surname');
        return result;
      }
    }
  }

  // 🛡️ PERSON-SPECIFIC RULES
  if (e1.type === 'PERSON' && e2.type === 'PERSON') {
    const words1 = e1.canonical.split(/\s+/);
    const words2 = e2.canonical.split(/\s+/);

    // If both have 2+ words, check first name match
    if (words1.length >= 2 && words2.length >= 2) {
      const firstName1 = words1[0].toLowerCase();
      const firstName2 = words2[0].toLowerCase();

      // Different first names = different people
      if (firstName1 !== firstName2 && firstName1.length > 1 && firstName2.length > 1) {
        result.confidence = 0.0;
        result.evidence.push('different-first-names');
        return result;
      }

      // Same surname check
      const surname1 = words1[words1.length - 1].toLowerCase();
      const surname2 = words2[words2.length - 1].toLowerCase();

      if (firstName1 === firstName2 && surname1 === surname2) {
        // Strong match: same first and last name
        result.confidence = 0.95;
        result.matchType = 'alias';
        result.evidence.push('same-first-and-surname');
        return result;
      }
    }

    // Single token vs multi-token person names
    if (tokens1.length === 1 && tokens2.length > 1) {
      // e.g., "Potter" vs "Harry Potter" - only match if single token is the surname
      const surname2 = words2[words2.length - 1].toLowerCase();
      if (tokens1[0] === surname2) {
        result.confidence = 0.90;
        result.matchType = 'alias';
        result.evidence.push('surname-match');
        return result;
      }
    }
    if (tokens2.length === 1 && tokens1.length > 1) {
      const surname1 = words1[words1.length - 1].toLowerCase();
      if (tokens2[0] === surname1) {
        result.confidence = 0.90;
        result.matchType = 'alias';
        result.evidence.push('surname-match');
        return result;
      }
    }
  }

  // SUBSTRING MATCH with high jaccard
  if ((canon1.includes(canon2) || canon2.includes(canon1)) && jaccard >= 0.7) {
    result.confidence = 0.85;
    result.matchType = 'alias';
    result.evidence.push('substring-with-high-overlap');
    return result;
  }

  // Moderate jaccard but no other strong signals
  if (jaccard >= 0.7) {
    result.confidence = 0.80;
    result.evidence.push(`high-token-overlap (${jaccard.toFixed(2)})`);
    return result;
  }

  // NO STRONG MATCH
  result.confidence = Math.min(0.7, jaccard);
  result.evidence.push(`weak-match (jaccard=${jaccard.toFixed(2)})`);
  return result;
}

/**
 * Choose the best (most complete) canonical name from a list
 */
function chooseBestCanonical(names: string[]): string {
  // Remove duplicates and filter empty
  const unique = [...new Set(names)].filter((n) => n && n.trim());

  if (unique.length === 0) {
    return '';
  }

  // Prefer full names (first + last) over single names
  const fullNames = unique.filter((n) => n.split(/\s+/).length >= 2);
  if (fullNames.length > 0) {
    // Among full names, prefer longer (more specific)
    return fullNames.sort((a, b) => b.length - a.length)[0];
  }

  // Fall back to longer single name (more specific)
  return unique.sort((a, b) => b.length - a.length)[0];
}

/**
 * Merge attributes from two entities, preferring more specific values
 */
function mergeAttributes(
  a1: Record<string, any>,
  a2: Record<string, any>
): Record<string, any> {
  const merged = { ...a1 };

  for (const [key, value] of Object.entries(a2)) {
    if (!merged[key]) {
      // New attribute, add it
      merged[key] = value;
    } else if (Array.isArray(merged[key])) {
      // Already an array, append
      merged[key].push(value);
      merged[key] = [...new Set(merged[key])]; // Deduplicate
    } else if (typeof value === 'string' && value.length > String(merged[key]).length) {
      // More specific string value - prefer it
      const altKey = key + 'Alternatives';
      merged[altKey] = merged[altKey] || [];
      merged[altKey].push(merged[key]);
      merged[key] = value;
    }
  }

  return merged;
}
