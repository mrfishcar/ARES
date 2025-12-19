/**
 * Entity Resolvers - Sprint R4
 * List and detail views for entities with caching
 */

import { loadGraph } from '../../storage/storage';
import { sliceByCursor, validateLimit } from '../pagination';
import type { Cursor } from '../pagination';
import { ensureRelationIds } from '../relation-id';
import { incrementListEntities, incrementGetEntity } from '../../monitor/metrics';

interface EntityFilter {
  type?: string;
  nameContains?: string;
}

interface ListEntitiesArgs {
  project: string;
  after?: Cursor;
  limit?: number;
  filter?: EntityFilter;
}

interface GetEntityArgs {
  project: string;
  id: string;
}

/**
 * Convert storage entity to EntityLite
 */
function toEntityLite(entity: any) {
  return {
    id: entity.id,
    name: entity.canonical,
    types: Array.isArray(entity.type) ? entity.type : [entity.type],
    aliases: entity.aliases || [],
    mentionCount: entity.mention_count || 0,
    source: entity.source || 'ares'
  };
}

/**
 * Convert storage relation to RelationLite
 */
function toRelationLite(relation: any, entityById: Map<string, any>) {
  const subjEntity = entityById.get(relation.subj);
  const objEntity = entityById.get(relation.obj);

  // Calculate average confidence from evidence
  let confidenceAvg = relation.confidence;
  if (!confidenceAvg && relation.evidence && relation.evidence.length > 0) {
    const sum = relation.evidence.reduce((acc: number, ev: any) =>
      acc + (ev.confidence || 0), 0
    );
    confidenceAvg = sum / relation.evidence.length;
  }

  return {
    id: relation.id,
    subject: subjEntity?.canonical || relation.subj,
    predicate: relation.pred || relation.predicate,
    object: objEntity?.canonical || relation.obj,
    symmetric: relation.symmetric || false,
    confidenceAvg
  };
}

/**
 * Apply filters to entities
 */
function filterEntities(entities: any[], filter?: EntityFilter): any[] {
  if (!filter) return entities;

  return entities.filter(entity => {
    // Type filter (exact match)
    if (filter.type) {
      const types = Array.isArray(entity.type) ? entity.type : [entity.type];
      if (!types.includes(filter.type)) {
        return false;
      }
    }

    // Name filter (case-insensitive contains on canonical or aliases)
    if (filter.nameContains) {
      const searchTerm = filter.nameContains.toLowerCase();
      const matchesCanonical = entity.canonical.toLowerCase().includes(searchTerm);
      const matchesAlias = (entity.aliases || []).some((alias: string) =>
        alias.toLowerCase().includes(searchTerm)
      );

      if (!matchesCanonical && !matchesAlias) {
        return false;
      }
    }

    return true;
  });
}

export const entityResolvers = {
  Query: {
    /**
     * List entities with filters and pagination
     */
    listEntities: (_: any, args: ListEntitiesArgs) => {
      // Track metrics
      incrementListEntities();

      const { project, after, limit, filter } = args;

      // Validate limit
      const validLimit = validateLimit(limit);

      // Load graph
      const graphPath = `./data/projects/${project}/graph.json`;
      const graph = loadGraph(graphPath);

      if (!graph) {
        return {
          nodes: [],
          pageInfo: { endCursor: null, hasNextPage: false },
          totalApprox: 0
        };
      }

      // Filter entities
      let filtered = filterEntities(graph.entities, filter);

      // Stable sort by entity.id
      const sorted = filtered.sort((a, b) => a.id.localeCompare(b.id));

      // Apply cursor pagination
      const result = sliceByCursor(sorted, (e) => e.id, after, validLimit);

      // Convert to EntityLite
      const nodes = result.nodes.map(toEntityLite);

      return {
        nodes,
        pageInfo: {
          endCursor: result.endCursor,
          hasNextPage: result.hasNextPage
        },
        totalApprox: filtered.length
      };
    },

    /**
     * Get entity detail with relations and evidence
     */
    getEntity: (_: any, args: GetEntityArgs) => {
      // Track metrics
      incrementGetEntity();

      const { project, id } = args;

      // Load graph
      const graphPath = `./data/projects/${project}/graph.json`;
      const graph = loadGraph(graphPath);

      if (!graph) {
        throw new Error(`Graph not found for project: ${project}`);
      }

      // Find entity
      const entity = graph.entities.find(e => e.id === id);
      if (!entity) {
        throw new Error(`Entity not found: ${id}`);
      }

      // Ensure relations have IDs
      ensureRelationIds(graph.relations);

      // Build entity map for relation lookup
      const entityById = new Map(graph.entities.map(e => [e.id, e]));

      // Find inbound and outbound relations
      const inbound = graph.relations
        .filter(r => r.obj === id)
        .map(r => toRelationLite(r, entityById));

      const outbound = graph.relations
        .filter(r => r.subj === id)
        .map(r => toRelationLite(r, entityById));

      // Extract and normalize evidence from entity
      const evidence = ((entity as any).evidence || []).map((ev: any) => {
        // Normalize text: extract from span if present, limit to 200 chars, strip control chars
        let text = ev.span?.text || ev.text || '';

        // Strip control characters (except \n, \t, \r which will be normalized to space)
        text = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

        // Normalize whitespace to single spaces
        text = text.replace(/\s+/g, ' ').trim();

        // Limit to 200 chars
        if (text.length > 200) {
          text = text.substring(0, 197) + '...';
        }

        return {
          text,
          confidence: ev.confidence || null,
          docId: ev.docId || ev.doc_id || null
        };
      });

      return {
        entity: toEntityLite(entity),
        inbound,
        outbound,
        evidence
      };
    }
  }
};
