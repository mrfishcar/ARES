/**
 * Query Layer - Phase 3
 * Flexible filtering and retrieval for knowledge graph
 */

import type { Relation, Predicate, Entity } from './schema';

export interface QueryOptions {
  subjectId?: string;      // Exact entity ID
  objectId?: string;       // Exact entity ID
  predicate?: Predicate;   // Exact predicate
  subjectName?: string;    // Partial name match
  objectName?: string;     // Partial name match
  time?: string;           // Time qualifier match (e.g., '3019')
  place?: string;          // Place qualifier match (e.g., 'Hebron')
  minConf?: number;        // Minimum confidence threshold
}

/**
 * Query relations with flexible filtering
 */
export function query(
  relations: Relation[],
  entities: Entity[],
  options: QueryOptions
): Relation[] {
  // Build entity ID -> canonical name map
  const entityMap = new Map(entities.map(e => [e.id, e]));

  const getEntityName = (id: string): string => {
    return entityMap.get(id)?.canonical ?? '';
  };

  const matchesName = (entityId: string, query: string): boolean => {
    const entity = entityMap.get(entityId);
    if (!entity) return false;

    const queryLower = query.toLowerCase();

    // Match canonical name
    if (entity.canonical.toLowerCase().includes(queryLower)) return true;

    // Match aliases
    return entity.aliases.some(alias => alias.toLowerCase().includes(queryLower));
  };

  return relations.filter(rel => {
    // Filter by exact IDs
    if (options.subjectId && rel.subj !== options.subjectId) return false;
    if (options.objectId && rel.obj !== options.objectId) return false;

    // Filter by predicate
    if (options.predicate && rel.pred !== options.predicate) return false;

    // Filter by partial name match
    if (options.subjectName && !matchesName(rel.subj, options.subjectName)) return false;
    if (options.objectName && !matchesName(rel.obj, options.objectName)) return false;

    // Filter by confidence
    if (options.minConf != null && rel.confidence < options.minConf) return false;

    // Filter by qualifiers
    if (options.time || options.place) {
      if (!rel.qualifiers || rel.qualifiers.length === 0) return false;

      if (options.time) {
        const hasTime = rel.qualifiers.some(q =>
          q.type === 'time' && q.value.includes(options.time!)
        );
        if (!hasTime) return false;
      }

      if (options.place) {
        const hasPlace = rel.qualifiers.some(q =>
          q.type === 'place' && q.value.includes(options.place!)
        );
        if (!hasPlace) return false;
      }
    }

    return true;
  });
}

/**
 * Get all relations for a specific entity (as subject or object)
 */
export function getEntityRelations(
  entityId: string,
  relations: Relation[]
): { outgoing: Relation[], incoming: Relation[] } {
  const outgoing = relations.filter(r => r.subj === entityId);
  const incoming = relations.filter(r => r.obj === entityId);

  return { outgoing, incoming };
}

/**
 * Find paths between two entities (simple BFS, max depth 3)
 */
export function findPaths(
  fromId: string,
  toId: string,
  relations: Relation[],
  maxDepth: number = 3
): Relation[][] {
  if (fromId === toId) return [];

  const paths: Relation[][] = [];
  const queue: { current: string; path: Relation[] }[] = [
    { current: fromId, path: [] }
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { current, path } = queue.shift()!;

    if (path.length >= maxDepth) continue;
    if (visited.has(current)) continue;
    visited.add(current);

    // Find all outgoing relations from current node
    const outgoing = relations.filter(r => r.subj === current);

    for (const rel of outgoing) {
      const newPath = [...path, rel];

      if (rel.obj === toId) {
        // Found a path!
        paths.push(newPath);
      } else {
        // Continue searching
        queue.push({ current: rel.obj, path: newPath });
      }
    }
  }

  return paths;
}

/**
 * Get relation statistics
 */
export function getStats(relations: Relation[], entities: Entity[]): {
  totalRelations: number;
  totalEntities: number;
  byPredicate: Record<string, number>;
  byExtractor: Record<string, number>;
  avgConfidence: number;
} {
  const byPredicate: Record<string, number> = {};
  const byExtractor: Record<string, number> = {};
  let totalConf = 0;

  for (const rel of relations) {
    byPredicate[rel.pred] = (byPredicate[rel.pred] || 0) + 1;
    byExtractor[rel.extractor || 'unknown'] = (byExtractor[rel.extractor || 'unknown'] || 0) + 1;
    totalConf += rel.confidence;
  }

  return {
    totalRelations: relations.length,
    totalEntities: entities.length,
    byPredicate,
    byExtractor,
    avgConfidence: relations.length > 0 ? totalConf / relations.length : 0
  };
}
