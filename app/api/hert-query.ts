/**
 * HERT Query API - Phase 5
 *
 * Provides high-level query interface for HERT system data:
 * - Entity search and retrieval
 * - Relationship queries
 * - HERT reference lookups
 * - Co-occurrence analysis
 * - Cross-document entity tracking
 */

import type { Entity, Relation, EntityType, Predicate } from '../engine/schema';
import { getEIDRegistry } from '../engine/eid-registry';
import { getAliasRegistry } from '../engine/alias-registry';
import { getHERTStore } from '../storage/hert-store';
import { getSenseRegistry } from '../engine/sense-disambiguator';
import { decodeHERT, encodeHERTReadable } from '../engine/hert';

/**
 * Entity search result
 */
export interface EntitySearchResult {
  eid: number;
  canonical: string;
  type?: EntityType;
  aliases: string[];
  senses: Array<{ sp: number[]; type: EntityType }>;
  mention_count: number;
  document_count: number;
}

/**
 * Relationship search result
 */
export interface RelationshipResult {
  subj_eid: number;
  subj_canonical: string;
  pred: Predicate;
  obj_eid: number;
  obj_canonical: string;
  confidence: number;
  evidence_count: number;
}

/**
 * Entity mention with context
 */
export interface EntityMention {
  eid: number;
  aid?: number;
  sp?: number[];
  canonical: string;
  document_id: string;
  location: {
    paragraph: number;
    token_start: number;
    token_length: number;
  };
  hert_compact: string;
  hert_readable: string;
}

/**
 * Co-occurrence result
 */
export interface CooccurrenceResult {
  entity1_eid: number;
  entity1_canonical: string;
  entity2_eid: number;
  entity2_canonical: string;
  cooccurrence_count: number;
  documents: string[];
}

/**
 * HERT Query API
 */
export class HERTQuery {
  private eidRegistry = getEIDRegistry();
  private aliasRegistry = getAliasRegistry();
  private hertStore = getHERTStore();
  private senseRegistry = getSenseRegistry();

  // Store relations for querying
  private relations: Relation[] = [];

  // Map entity.id → entity.eid for relationship queries
  private entityIDtoEID: Map<string, number> = new Map();

  /**
   * Load relations and entities for querying
   */
  loadRelations(relations: Relation[], entities?: Entity[]): void {
    this.relations = relations;

    // Build entity ID → EID mapping
    if (entities) {
      this.entityIDtoEID.clear();
      for (const entity of entities) {
        if (entity.eid !== undefined) {
          this.entityIDtoEID.set(entity.id, entity.eid);
        }
      }
    }
  }

  /**
   * Find entity by name (exact or fuzzy)
   */
  findEntityByName(name: string, options?: {
    fuzzy?: boolean;
    type?: EntityType;
  }): EntitySearchResult[] {
    const results: EntitySearchResult[] = [];
    const normalizedName = name.toLowerCase().trim();

    // Try exact match first
    const eid = this.eidRegistry.get(name);
    if (eid) {
      results.push(this.buildEntityResult(eid, name));
    }

    // Try alias match
    const aliasMapping = this.aliasRegistry.getBySurfaceForm(name);
    if (aliasMapping && !results.find(r => r.eid === aliasMapping.eid)) {
      const canonical = this.eidRegistry.getCanonical(aliasMapping.eid);
      if (canonical) {
        results.push(this.buildEntityResult(aliasMapping.eid, canonical));
      }
    }

    // Fuzzy search through all entities
    if (options?.fuzzy) {
      const allEntities = this.eidRegistry.getAll();
      for (const mapping of allEntities) {
        if (mapping.canonical.toLowerCase().includes(normalizedName)) {
          if (!results.find(r => r.eid === mapping.eid)) {
            results.push(this.buildEntityResult(mapping.eid, mapping.canonical));
          }
        }
      }
    }

    // Filter by type if specified
    if (options?.type) {
      return results.filter(r => r.senses.some(s => s.type === options.type));
    }

    return results;
  }

  /**
   * Find entity by EID
   */
  findEntityByEID(eid: number): EntitySearchResult | null {
    const canonical = this.eidRegistry.getCanonical(eid);
    if (!canonical) return null;

    return this.buildEntityResult(eid, canonical);
  }

  /**
   * Find all entities of a specific type
   */
  findEntitiesByType(type: EntityType): EntitySearchResult[] {
    const results: EntitySearchResult[] = [];
    const allEntities = this.eidRegistry.getAll();

    for (const mapping of allEntities) {
      const senses = this.senseRegistry.getSenses(mapping.canonical);
      if (senses.some(s => s.type === type)) {
        results.push(this.buildEntityResult(mapping.eid, mapping.canonical));
      }
    }

    return results;
  }

  /**
   * Find relationships involving an entity
   */
  findRelationships(eid: number, options?: {
    as?: 'subject' | 'object' | 'any';
    predicate?: Predicate;
  }): RelationshipResult[] {
    const role = options?.as || 'any';
    const results: RelationshipResult[] = [];

    for (const rel of this.relations) {
      // Check if entity is involved
      const isSubject = this.getEntityEID(rel.subj) === eid;
      const isObject = this.getEntityEID(rel.obj) === eid;

      if ((role === 'subject' && isSubject) ||
          (role === 'object' && isObject) ||
          (role === 'any' && (isSubject || isObject))) {

        // Filter by predicate if specified
        if (options?.predicate && rel.pred !== options.predicate) {
          continue;
        }

        const subjEID = this.getEntityEID(rel.subj);
        const objEID = this.getEntityEID(rel.obj);

        if (subjEID && objEID) {
          results.push({
            subj_eid: subjEID,
            subj_canonical: this.eidRegistry.getCanonical(subjEID) || 'Unknown',
            pred: rel.pred,
            obj_eid: objEID,
            obj_canonical: this.eidRegistry.getCanonical(objEID) || 'Unknown',
            confidence: rel.confidence,
            evidence_count: rel.evidence.length
          });
        }
      }
    }

    return results;
  }

  /**
   * Find all relationships of a specific type
   */
  findRelationshipsByPredicate(predicate: Predicate): RelationshipResult[] {
    const results: RelationshipResult[] = [];

    for (const rel of this.relations) {
      if (rel.pred === predicate) {
        const subjEID = this.getEntityEID(rel.subj);
        const objEID = this.getEntityEID(rel.obj);

        if (subjEID && objEID) {
          results.push({
            subj_eid: subjEID,
            subj_canonical: this.eidRegistry.getCanonical(subjEID) || 'Unknown',
            pred: rel.pred,
            obj_eid: objEID,
            obj_canonical: this.eidRegistry.getCanonical(objEID) || 'Unknown',
            confidence: rel.confidence,
            evidence_count: rel.evidence.length
          });
        }
      }
    }

    return results;
  }

  /**
   * Find all mentions of an entity
   */
  findMentions(eid: number, options?: {
    document_id?: string;
    limit?: number;
  }): EntityMention[] {
    const results: EntityMention[] = [];
    const canonical = this.eidRegistry.getCanonical(eid);
    if (!canonical) return results;

    // Get all HERTs for this entity
    const herts = this.hertStore.getByEntity(eid);

    for (const hertCompact of herts) {
      try {
        const decoded = decodeHERT(hertCompact);

        // Filter by document if specified
        if (options?.document_id && decoded.did.toString() !== options.document_id) {
          continue;
        }

        results.push({
          eid: decoded.eid,
          aid: decoded.aid,
          sp: decoded.sp,
          canonical,
          document_id: decoded.did.toString(),
          location: {
            paragraph: decoded.lp.paragraph,
            token_start: decoded.lp.tokenStart,
            token_length: decoded.lp.tokenLength
          },
          hert_compact: hertCompact,
          hert_readable: encodeHERTReadable(decoded)
        });

        // Apply limit if specified
        if (options?.limit && results.length >= options.limit) {
          break;
        }
      } catch (err) {
        console.error(`Failed to decode HERT: ${hertCompact}`, err);
      }
    }

    return results;
  }

  /**
   * Find entities that co-occur with a given entity
   */
  findCooccurrences(eid: number, options?: {
    min_count?: number;
    limit?: number;
  }): CooccurrenceResult[] {
    const minCount = options?.min_count || 1;
    const limit = options?.limit || 50;

    // Get all documents this entity appears in
    const entityMentions = this.findMentions(eid);
    const entityDocs = new Set(entityMentions.map(m => m.document_id));

    // Count co-occurrences with other entities
    const cooccurrences = new Map<number, {
      count: number;
      documents: Set<string>;
    }>();

    for (const docId of entityDocs) {
      // Get all entities in this document
      const docHerts = this.hertStore.getByDocument(BigInt(docId));

      for (const hertCompact of docHerts) {
        try {
          const decoded = decodeHERT(hertCompact);
          if (decoded.eid !== eid) {
            if (!cooccurrences.has(decoded.eid)) {
              cooccurrences.set(decoded.eid, {
                count: 0,
                documents: new Set()
              });
            }

            const cooccur = cooccurrences.get(decoded.eid)!;
            cooccur.count++;
            cooccur.documents.add(docId);
          }
        } catch (err) {
          // Skip invalid HERTs
        }
      }
    }

    // Build results
    const results: CooccurrenceResult[] = [];
    const canonical1 = this.eidRegistry.getCanonical(eid) || 'Unknown';

    for (const [otherEID, data] of cooccurrences.entries()) {
      if (data.count >= minCount) {
        const canonical2 = this.eidRegistry.getCanonical(otherEID) || 'Unknown';

        results.push({
          entity1_eid: eid,
          entity1_canonical: canonical1,
          entity2_eid: otherEID,
          entity2_canonical: canonical2,
          cooccurrence_count: data.count,
          documents: Array.from(data.documents)
        });
      }
    }

    // Sort by cooccurrence count descending
    results.sort((a, b) => b.cooccurrence_count - a.cooccurrence_count);

    // Apply limit
    return results.slice(0, limit);
  }

  /**
   * Get entity statistics
   */
  getEntityStats(eid: number): {
    canonical: string;
    total_mentions: number;
    document_count: number;
    alias_count: number;
    sense_count: number;
    relationship_count: number;
  } | null {
    const canonical = this.eidRegistry.getCanonical(eid);
    if (!canonical) return null;

    const mentions = this.findMentions(eid);
    const documents = new Set(mentions.map(m => m.document_id));
    const aliases = this.aliasRegistry.getAliasesForEntity(eid);
    const senses = this.senseRegistry.getSenses(canonical);
    const relationships = this.findRelationships(eid);

    return {
      canonical,
      total_mentions: mentions.length,
      document_count: documents.size,
      alias_count: aliases.length,
      sense_count: senses.length,
      relationship_count: relationships.length
    };
  }

  /**
   * Get global statistics
   */
  getGlobalStats(): {
    total_entities: number;
    total_aliases: number;
    total_senses: number;
    total_herts: number;
    total_documents: number;
    total_relationships: number;
  } {
    const eidStats = this.eidRegistry.getStats();
    const aliasStats = this.aliasRegistry.getStats();
    const senseStats = this.senseRegistry.getStats();
    const hertStats = this.hertStore.getStats();

    return {
      total_entities: eidStats.total_entities,
      total_aliases: aliasStats.total_aliases,
      total_senses: senseStats.total_senses,
      total_herts: hertStats.total_refs,
      total_documents: hertStats.total_documents,
      total_relationships: this.relations.length
    };
  }

  /**
   * Helper: Build entity result from EID
   */
  private buildEntityResult(eid: number, canonical: string): EntitySearchResult {
    const aliases = this.aliasRegistry.getAliasesForEntity(eid);
    const senses = this.senseRegistry.getSenses(canonical);
    const mentions = this.findMentions(eid);
    const documents = new Set(mentions.map(m => m.document_id));

    // Extract entity type from first sense (if available)
    let entityType: EntityType | undefined = undefined;
    if (senses.length > 0) {
      entityType = senses[0].type;
    }

    return {
      eid,
      canonical,
      type: entityType,
      aliases: aliases.map(a => a.surfaceForm),
      senses: senses.map(s => ({ sp: s.sp, type: s.type })),
      mention_count: mentions.length,
      document_count: documents.size
    };
  }

  /**
   * Helper: Get EID from entity ID (handles both formats)
   */
  private getEntityEID(entityId: string): number | null {
    return this.entityIDtoEID.get(entityId) || null;
  }
}

/**
 * Singleton instance
 */
let globalQuery: HERTQuery | null = null;

export function getHERTQuery(): HERTQuery {
  if (!globalQuery) {
    globalQuery = new HERTQuery();
  }
  return globalQuery;
}

export const hertQuery = getHERTQuery();
