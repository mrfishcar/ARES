/**
 * Relation Resolvers - Sprint R4
 * List and detail views for relations with caching
 */

import { loadGraph } from '../../storage/storage';
import { sliceByCursor, validateLimit } from '../pagination';
import type { Cursor } from '../pagination';
import { extractEvidenceSnippets } from '../evidence-utils';
import { ensureRelationIds } from '../relation-id';
import { incrementListRelations, incrementGetRelation } from '../../monitor/metrics';

interface RelationFilter {
  predicate?: string;
  nameContains?: string;
}

interface ListRelationsArgs {
  project: string;
  after?: Cursor;
  limit?: number;
  filter?: RelationFilter;
}

interface GetRelationArgs {
  project: string;
  id: string;
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
 * Apply filters to relations
 */
function filterRelations(
  relations: any[],
  entityById: Map<string, any>,
  filter?: RelationFilter
): any[] {
  if (!filter) return relations;

  return relations.filter(relation => {
    // Predicate filter (exact match)
    if (filter.predicate) {
      const pred = relation.pred || relation.predicate;
      if (pred !== filter.predicate) {
        return false;
      }
    }

    // Name filter (case-insensitive contains on subject or object names)
    if (filter.nameContains) {
      const searchTerm = filter.nameContains.toLowerCase();

      const subjEntity = entityById.get(relation.subj);
      const objEntity = entityById.get(relation.obj);

      const subjName = subjEntity?.canonical || relation.subj;
      const objName = objEntity?.canonical || relation.obj;

      const matchesSubject = subjName.toLowerCase().includes(searchTerm);
      const matchesObject = objName.toLowerCase().includes(searchTerm);

      if (!matchesSubject && !matchesObject) {
        return false;
      }
    }

    return true;
  });
}

export const relationResolvers = {
  Query: {
    /**
     * List relations with filters and pagination
     */
    listRelations: (_: any, args: ListRelationsArgs) => {
      // Track metrics
      incrementListRelations();

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

      // Ensure all relations have stable IDs
      ensureRelationIds(graph.relations);

      // Build entity map for lookups
      const entityById = new Map(graph.entities.map(e => [e.id, e]));

      // Filter relations
      let filtered = filterRelations(graph.relations, entityById, filter);

      // Stable sort by relation.id (SHA1 hash)
      const sorted = filtered.sort((a, b) => a.id.localeCompare(b.id));

      // Apply cursor pagination
      const result = sliceByCursor(sorted, (r) => r.id, after, validLimit);

      // Convert to RelationLite
      const nodes = result.nodes.map(r => toRelationLite(r, entityById));

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
     * Get relation detail with evidence
     */
    getRelation: (_: any, args: GetRelationArgs) => {
      // Track metrics
      incrementGetRelation();

      const { project, id } = args;

      // Load graph
      const graphPath = `./data/projects/${project}/graph.json`;
      const graph = loadGraph(graphPath);

      if (!graph) {
        throw new Error(`Graph not found for project: ${project}`);
      }

      // Ensure relations have IDs
      ensureRelationIds(graph.relations);

      // Find relation
      const relation = graph.relations.find(r => r.id === id);
      if (!relation) {
        throw new Error(`Relation not found: ${id}`);
      }

      // Build entity map for relation lookup
      const entityById = new Map(graph.entities.map(e => [e.id, e]));

      // Extract all evidence snippets (no limit for detail view)
      const evidence = extractEvidenceSnippets(relation.evidence || [], 1000);

      return {
        relation: toRelationLite(relation, entityById),
        evidence
      };
    }
  }
};
