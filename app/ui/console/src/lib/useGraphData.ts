/**
 * useGraphData Hook - Sprint R6 Phase 2
 * Fetches graph visualization data with memoization and debouncing
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { query } from './api';

export interface GraphNode {
  id: string;
  name: string;
  types: string[];
}

export interface GraphEdge {
  id: string;
  subject: string;
  object: string;
  predicate: string;
  symmetric?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface UseGraphDataOptions {
  project: string;
  mode: 'neighborhood' | 'predicate';
  centerId?: string;
  depth?: number;
  limit?: number;
  predicate?: string;
  enabled?: boolean; // Only fetch when true
}

export interface UseGraphDataResult {
  data: GraphData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const GRAPHQL_NEIGHBORHOOD = `
  query GraphNeighborhood($project: String!, $centerId: ID!, $depth: Int!, $limit: Int!) {
    graphNeighborhood(project: $project, centerId: $centerId, depth: $depth, limit: $limit) {
      nodes {
        id
        name
        types
      }
      edges {
        id
        subject
        object
        predicate
        symmetric
      }
    }
  }
`;

const GRAPHQL_PREDICATE = `
  query GraphByPredicate($project: String!, $predicate: String!, $limit: Int!) {
    graphByPredicate(project: $project, predicate: $predicate, limit: $limit) {
      nodes {
        id
        name
        types
      }
      edges {
        id
        subject
        object
        predicate
        symmetric
      }
    }
  }
`;

/**
 * Hook for fetching graph visualization data
 * Supports two modes: neighborhood (BFS from center) and predicate (filter by relation type)
 * Debounces requests by 250ms and memoizes by query parameters
 */
export function useGraphData(options: UseGraphDataOptions): UseGraphDataResult {
  const {
    project,
    mode,
    centerId,
    depth = 1,
    limit = 200,
    predicate,
    enabled = true,
  } = options;

  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState<number>(0);

  // Memoize query parameters to prevent unnecessary refetches
  const queryKey = useMemo(() => {
    if (mode === 'neighborhood') {
      return `neighborhood:${project}:${centerId}:${depth}:${limit}`;
    } else {
      return `predicate:${project}:${predicate}:${limit}`;
    }
  }, [mode, project, centerId, depth, limit, predicate]);

  // Refetch function
  const refetch = useCallback(() => {
    setRefetchTrigger(prev => prev + 1);
  }, []);

  // Fetch graph data with debouncing
  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    // Validate required parameters
    if (mode === 'neighborhood' && !centerId) {
      setError('Center entity ID is required for neighborhood mode');
      setLoading(false);
      return;
    }

    if (mode === 'predicate' && !predicate) {
      setError('Predicate is required for predicate mode');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Debounce: wait 250ms before fetching
    const timeoutId = setTimeout(async () => {
      try {
        if (mode === 'neighborhood') {
          interface NeighborhoodResponse {
            graphNeighborhood: GraphData;
          }

          const result = await query<NeighborhoodResponse>(GRAPHQL_NEIGHBORHOOD, {
            project,
            centerId,
            depth,
            limit,
          });

          setData(result.graphNeighborhood);
        } else {
          interface PredicateResponse {
            graphByPredicate: GraphData;
          }

          const result = await query<PredicateResponse>(GRAPHQL_PREDICATE, {
            project,
            predicate,
            limit,
          });

          setData(result.graphByPredicate);
        }

        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch graph data';
        setError(message);
        setData(null);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [queryKey, enabled, refetchTrigger]);

  return {
    data,
    loading,
    error,
    refetch,
  };
}
