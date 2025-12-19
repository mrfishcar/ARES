/**
 * Graph Visualization Resolvers - Sprint R6
 * Neighborhood and predicate-based graph queries
 */

import { loadGraph } from '../../storage/storage';
import { ensureRelationIds } from '../relation-id';
import { incrementCounter } from '../../monitor/metrics';
import { graphCache, generateCacheKey } from '../cache-layer';

interface GraphNode {
  id: string;
  name: string;
  types: string[];
}

interface GraphEdge {
  id: string;
  subject: string;
  object: string;
  predicate: string;
  symmetric: boolean;
}

interface GraphSlice {
  nodes: GraphNode[];
  edges: GraphEdge[];
  quotes?: any[];
}

interface NeighborhoodArgs {
  project: string;
  centerId: string;
  depth?: number;
  limit?: number;
}

interface PredicateArgs {
  project: string;
  predicate: string;
  limit?: number;
}

function selectQuotesForNodes(booknlp: any, nodeIds: Set<string>): any[] {
  if (!booknlp || !Array.isArray(booknlp.quotes)) return [];
  return booknlp.quotes
    .filter((q: any) => !q.speaker_id || nodeIds.has(q.speaker_id))
    .map((q: any) => ({
      id: q.id || `${q.doc_id || 'quote'}:${q.start || 0}`,
      speakerId: q.speaker_id || q.speakerId || null,
      text: q.text,
      confidence: q.confidence,
      start: q.start,
      end: q.end,
      docId: q.doc_id || q.docId,
    }));
}

/**
 * BFS neighborhood exploration
 */
function exploreNeighborhood(
  centerId: string,
  depth: number,
  limit: number,
  entities: Map<string, any>,
  relations: any[]
): GraphSlice {
  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Queue: [nodeId, currentDepth]
  const queue: Array<[string, number]> = [[centerId, 0]];
  visitedNodes.add(centerId);

  // Add center node
  const centerEntity = entities.get(centerId);
  if (centerEntity) {
    nodes.push({
      id: centerEntity.id,
      name: centerEntity.canonical || centerEntity.id,
      types: centerEntity.types || [],
    });
  }

  while (queue.length > 0 && nodes.length < limit) {
    const [currentId, currentDepth] = queue.shift()!;

    if (currentDepth >= depth) {
      continue;
    }

    // Find adjacent relations
    for (const rel of relations) {
      if (nodes.length >= limit) break;

      const isOutbound = rel.subj === currentId;
      const isInbound = rel.obj === currentId;

      if (!isOutbound && !isInbound) continue;
      if (visitedEdges.has(rel.id)) continue;

      // Add edge
      const subjEntity = entities.get(rel.subj);
      const objEntity = entities.get(rel.obj);

      edges.push({
        id: rel.id,
        subject: rel.subj,
        object: rel.obj,
        predicate: rel.pred || rel.predicate,
        symmetric: rel.symmetric || false,
      });
      visitedEdges.add(rel.id);

      // Add neighbor node and queue for next depth
      const neighborId = isOutbound ? rel.obj : rel.subj;
      if (!visitedNodes.has(neighborId)) {
        const neighborEntity = entities.get(neighborId);
        if (neighborEntity) {
          nodes.push({
            id: neighborEntity.id,
            name: neighborEntity.canonical || neighborEntity.id,
            types: neighborEntity.types || [],
          });
          visitedNodes.add(neighborId);
          queue.push([neighborId, currentDepth + 1]);
        }
      }
    }
  }

  return { nodes, edges };
}

/**
 * Filter graph by predicate
 */
function filterByPredicate(
  predicate: string,
  limit: number,
  entities: Map<string, any>,
  relations: any[]
): GraphSlice {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  // Find all relations with this predicate
  const matchingRelations = relations.filter(
    r => (r.pred || r.predicate) === predicate
  ).slice(0, limit);

  for (const rel of matchingRelations) {
    // Add edge
    edges.push({
      id: rel.id,
      subject: rel.subj,
      object: rel.obj,
      predicate: rel.pred || rel.predicate,
      symmetric: rel.symmetric || false,
    });

    // Add subject node
    if (!nodeIds.has(rel.subj)) {
      const subjEntity = entities.get(rel.subj);
      if (subjEntity) {
        nodes.push({
          id: subjEntity.id,
          name: subjEntity.canonical || subjEntity.id,
          types: subjEntity.types || [],
        });
        nodeIds.add(rel.subj);
      }
    }

    // Add object node
    if (!nodeIds.has(rel.obj)) {
      const objEntity = entities.get(rel.obj);
      if (objEntity) {
        nodes.push({
          id: objEntity.id,
          name: objEntity.canonical || objEntity.id,
          types: objEntity.types || [],
        });
        nodeIds.add(rel.obj);
      }
    }
  }

  return { nodes, edges };
}

export const graphVizResolvers = {
  Query: {
    /**
     * Get neighborhood graph around a center entity
     */
    graphNeighborhood: (_: any, args: NeighborhoodArgs): GraphSlice => {
      const { project, centerId, depth = 1, limit = 200 } = args;

      // Validate depth
      if (depth < 1 || depth > 2) {
        throw new Error('Depth must be 1 or 2');
      }

      // Validate limit
      if (limit < 1 || limit > 200) {
        throw new Error('Limit must be between 1 and 200');
      }

      // Check cache
      const cacheKey = generateCacheKey('graphNeighborhood', project, { centerId, depth, limit });
      const cached = graphCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Track metrics
      incrementCounter('api_graph_neighborhood_total');

      // Load graph
      const graphPath = `./data/projects/${project}/graph.json`;
      const graph = loadGraph(graphPath);

      if (!graph) {
        throw new Error(`Graph not found for project: ${project}`);
      }

      // Ensure relation IDs
      ensureRelationIds(graph.relations);

      // Build entity map
      const entityMap = new Map(graph.entities.map(e => [e.id, e]));

      // Check center exists
      if (!entityMap.has(centerId)) {
        throw new Error(`Entity not found: ${centerId}`);
      }

      // Explore neighborhood
      const result = exploreNeighborhood(centerId, depth, limit, entityMap, graph.relations);
      const quotes = selectQuotesForNodes(graph.booknlp, new Set(result.nodes.map(n => n.id)));
      const withQuotes = { ...result, quotes };

      // Cache result
      graphCache.set(cacheKey, withQuotes);

      return withQuotes;
    },

    /**
     * Get graph filtered by predicate
     */
    graphByPredicate: (_: any, args: PredicateArgs): GraphSlice => {
      const { project, predicate, limit = 500 } = args;

      // Validate limit
      if (limit < 1 || limit > 500) {
        throw new Error('Limit must be between 1 and 500');
      }

      // Check cache
      const cacheKey = generateCacheKey('graphByPredicate', project, { predicate, limit });
      const cached = graphCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Track metrics
      incrementCounter('api_graph_by_predicate_total');

      // Load graph
      const graphPath = `./data/projects/${project}/graph.json`;
      const graph = loadGraph(graphPath);

      if (!graph) {
        throw new Error(`Graph not found for project: ${project}`);
      }

      // Ensure relation IDs
      ensureRelationIds(graph.relations);

      // Build entity map
      const entityMap = new Map(graph.entities.map(e => [e.id, e]));

      // Filter by predicate
      const result = filterByPredicate(predicate, limit, entityMap, graph.relations);
      const quotes = selectQuotesForNodes(graph.booknlp, new Set(result.nodes.map(n => n.id)));
      const withQuotes = { ...result, quotes };

      // Cache result
      graphCache.set(cacheKey, withQuotes);

      return withQuotes;
    },
  },
};
