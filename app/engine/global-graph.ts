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
      if (match.confidence >= 0.80) {
        matches.push({ ...match, entity1: existingEntity, entity2: newEntity });
      }
    }

    if (matches.length === 0) {
      // No match found - just return the new entity ID
      // (Already created above in getCandidateMatches branch)
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

    // Match found - merge with existing entity
    const bestMatch = matches.sort((a, b) => b.confidence - a.confidence)[0];
    const existing = bestMatch.entity1 as GlobalEntity;

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
 * Calculate confidence that two entities refer to the same real-world entity
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

  const canon1 = e1.canonical.toLowerCase();
  const canon2 = e2.canonical.toLowerCase();

  const tokens1 = canon1.split(/\s+/).filter(Boolean);
  const tokens2 = canon2.split(/\s+/).filter(Boolean);

  // If both are single-token names and the tokens differ, treat as different people
  if (tokens1.length === 1 && tokens2.length === 1 && tokens1[0] !== tokens2[0]) {
    return result;
  }

  // EXACT MATCH: Same canonical name
  if (canon1 === canon2) {
    result.confidence = 1.0;
    result.matchType = 'exact';
    result.evidence.push('exact canonical match');
    return result;
  }

  // ALIAS MATCH: One is substring of other (only if they share tokens)
  // But check for disambiguation signals first
  const sharedTokens = tokens1.filter((t) => tokens2.includes(t));

  if ((canon1.includes(canon2) || canon2.includes(canon1)) && sharedTokens.length > 0) {
    // Check if both have names with multiple words (first + last)
    const words1 = canon1.split(/\s+/);
    const words2 = canon2.split(/\s+/);

    // DISAMBIGUATION: Different first names = different people
    // Example: "James Potter" vs "Harry Potter"
    if (words1.length >= 2 && words2.length >= 2) {
      const firstName1 = words1[0];
      const firstName2 = words2[0];

      if (
        firstName1 !== firstName2 &&
        firstName1.length > 1 &&
        firstName2.length > 1
      ) {
        // Different first names - likely different people
        result.confidence = 0.0;
        result.evidence.push('different first names');
        return result;
      }
    }

    // Substring match without disambiguation signals
    result.confidence = 0.90;
    result.matchType = 'alias';
    result.evidence.push('substring match');
    return result;
  }

  // DISAMBIGUATION: Check for conflicting titles
  // Example: "Professor McGonagall" vs "Dr. McGonagall"
  const titles = [
    'professor',
    'prof',
    'dr',
    'doctor',
    'mr',
    'mrs',
    'ms',
    'sir',
    'lady',
    'lord',
    'king',
    'queen',
    'prince',
    'princess'
  ];

  const words1 = canon1.split(/\s+/);
  const words2 = canon2.split(/\s+/);

  const title1 = words1[0];
  const title2 = words2[0];

  if (titles.includes(title1) && titles.includes(title2) && title1 !== title2) {
    // Different titles - likely different people
    result.confidence = 0.0;
    result.evidence.push('conflicting titles');
    return result;
  }

  // CONTEXTUAL MATCH: Shared attributes
  if ('documents' in e1 && e1.attributes && e2.attrs) {
    const sharedAttributes = Object.keys(e1.attributes).filter(
      (k) => e2.attrs && e2.attrs[k] === e1.attributes[k]
    );

    if (sharedAttributes.length >= 2) {
      result.confidence = 0.80;
      result.matchType = 'contextual';
      result.evidence.push(`shared attributes: ${sharedAttributes.join(', ')}`);
      return result;
    }
  }

  // NO MATCH
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
