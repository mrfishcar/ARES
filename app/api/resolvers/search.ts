/**
 * Search Resolvers - Sprint R6 Phase 5
 * Full-text search with faceting
 */

import { search, type SearchResults, type SearchHit, type Facet } from '../search-index';
import { incrementCounter } from '../../monitor/metrics';
import { searchCache, generateCacheKey } from '../cache-layer';

interface SearchArgs {
  project: string;
  text: string;
  limit?: number;
}

export const searchResolvers = {
  Query: {
    /**
     * Full-text search across entities and relations
     * Returns hits with facets for filtering
     */
    search: (_: any, args: SearchArgs): SearchResults => {
      const { project, text, limit = 50 } = args;

      // Validate limit
      const validLimit = Math.min(Math.max(limit, 1), 500);

      // Check cache
      const cacheKey = generateCacheKey('search', project, { text, limit: validLimit });
      const cached = searchCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Perform search
      const results = search(project, text, validLimit);

      // Cache results
      searchCache.set(cacheKey, results);

      // Track metrics
      incrementCounter('api_search_total');

      return results;
    }
  }
};
