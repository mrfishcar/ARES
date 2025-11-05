/**
 * Search Index - Sprint R6 Phase 5
 * Lunr.js-based full-text search with faceting
 */

import lunr from 'lunr';
import { loadGraph } from '../storage/storage';
import type { Entity, Relation } from '../engine/schema';

/**
 * Search document (unified entity/relation)
 */
interface SearchDocument {
  id: string;
  kind: 'entity' | 'relation';
  label: string;
  text: string;
  type: string;
  predicate?: string;
}

/**
 * Search facet
 */
export interface Facet {
  name: string;
  count: number;
}

/**
 * Search hit with metadata
 */
export interface SearchHit {
  id: string;
  kind: 'entity' | 'relation';
  label: string;
  snippet: string;
  score: number;
  type: string;
  predicate?: string;
}

/**
 * Search results with facets
 */
export interface SearchResults {
  hits: SearchHit[];
  entityTypes: Facet[];
  predicates: Facet[];
}

/**
 * In-memory search index cache
 */
class SearchIndexCache {
  private indexes: Map<string, { index: lunr.Index; docs: Map<string, SearchDocument> }> = new Map();
  private lastBuilt: Map<string, number> = new Map();

  /**
   * Get or build index for project
   */
  getOrBuild(project: string): { index: lunr.Index; docs: Map<string, SearchDocument> } {
    const cached = this.indexes.get(project);
    const lastBuildTime = this.lastBuilt.get(project) || 0;
    const now = Date.now();

    // Rebuild if cache is older than 30 seconds (to pick up new approvals)
    if (cached && (now - lastBuildTime) < 30000) {
      return cached;
    }

    // Build fresh index
    const result = this.buildIndex(project);
    this.indexes.set(project, result);
    this.lastBuilt.set(project, now);
    return result;
  }

  /**
   * Build Lunr.js index from knowledge graph
   */
  private buildIndex(project: string): { index: lunr.Index; docs: Map<string, SearchDocument> } {
    const graphPath = `./data/projects/${project}/graph.json`;
    const graph = loadGraph(graphPath);

    const docs = new Map<string, SearchDocument>();

    if (!graph) {
      // Empty index
      const emptyIndex = lunr(function() {
        this.ref('id');
        this.field('label', { boost: 10 });
        this.field('text');
        this.field('type', { boost: 5 });
      });
      return { index: emptyIndex, docs };
    }

    // Index entities
    for (const entity of graph.entities) {
      const doc: SearchDocument = {
        id: `entity:${entity.id}`,
        kind: 'entity',
        label: entity.canonical,
        text: [
          entity.canonical,
          ...(entity.aliases || []),
          entity.type
        ].join(' '),
        type: entity.type
      };
      docs.set(doc.id, doc);
    }

    // Index relations
    const entityById = new Map(graph.entities.map(e => [e.id, e]));
    for (const relation of graph.relations) {
      const subjEntity = entityById.get(relation.subj);
      const objEntity = entityById.get(relation.obj);

      const subjName = subjEntity?.canonical || relation.subj;
      const objName = objEntity?.canonical || relation.obj;
      const label = `${subjName} → ${relation.pred} → ${objName}`;

      const doc: SearchDocument = {
        id: `relation:${relation.id}`,
        kind: 'relation',
        label,
        text: [subjName, relation.pred, objName].join(' '),
        type: 'RELATION',
        predicate: relation.pred
      };
      docs.set(doc.id, doc);
    }

    // Build Lunr index
    const index = lunr(function() {
      this.ref('id');
      this.field('label', { boost: 10 });
      this.field('text');
      this.field('type', { boost: 5 });

      // Add all documents
      docs.forEach((doc) => {
        this.add(doc);
      });
    });

    return { index, docs };
  }

  /**
   * Invalidate cache for project (force rebuild on next query)
   */
  invalidate(project: string): void {
    this.indexes.delete(project);
    this.lastBuilt.delete(project);
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.indexes.clear();
    this.lastBuilt.clear();
  }
}

// Global cache instance
const searchCache = new SearchIndexCache();

/**
 * Search knowledge graph with faceting
 */
export function search(
  project: string,
  query: string,
  limit: number = 50
): SearchResults {
  // Get or build index
  const { index, docs } = searchCache.getOrBuild(project);

  // Perform search
  const results = index.search(query);

  // Convert to hits
  const hits: SearchHit[] = [];
  for (const result of results.slice(0, limit)) {
    const doc = docs.get(result.ref);
    if (!doc) {
      continue;
    }

    hits.push({
      id: doc.id,
      kind: doc.kind,
      label: doc.label,
      snippet: generateSnippet(doc.text, query),
      score: result.score,
      type: doc.type,
      predicate: doc.predicate
    });
  }

  // Calculate facets
  const entityTypes = calculateFacets(
    hits.filter(h => h.kind === 'entity'),
    h => h.type
  );

  const predicates = calculateFacets(
    hits.filter(h => h.kind === 'relation'),
    h => h.predicate || ''
  );

  return {
    hits,
    entityTypes,
    predicates
  };
}

/**
 * Generate snippet with query term highlighted
 */
function generateSnippet(text: string, query: string, maxLen: number = 100): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().split(/\s+/)[0]; // First term

  const index = lowerText.indexOf(lowerQuery);
  if (index === -1) {
    // No match, return start of text
    return text.substring(0, maxLen) + (text.length > maxLen ? '...' : '');
  }

  // Center snippet around match
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + lowerQuery.length + 50);
  let snippet = text.substring(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';

  return snippet;
}

/**
 * Calculate facet counts
 */
function calculateFacets<T>(
  items: T[],
  keyFn: (item: T) => string
): Facet[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  // Sort by count descending
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Invalidate search cache for project
 * Call this after approve/dismiss/ingest operations
 */
export function invalidateSearchCache(project: string): void {
  searchCache.invalidate(project);
}

/**
 * Clear all search caches (for testing)
 */
export function clearSearchCache(): void {
  searchCache.clear();
}
