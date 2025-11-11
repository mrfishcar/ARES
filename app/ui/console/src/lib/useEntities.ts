/**
 * Hook for fetching and managing entities
 */

import { useState, useEffect } from 'react';
import { query } from './api';

const LIST_ENTITIES_QUERY = `
  query ListEntities($project: String!, $filter: EntityFilter, $limit: Int, $after: Cursor) {
    listEntities(project: $project, filter: $filter, limit: $limit, after: $after) {
      nodes {
        id
        name
        types
        aliases
        mentionCount
      }
      pageInfo {
        endCursor
        hasNextPage
      }
      totalApprox
    }
  }
`;

export interface Entity {
  id: string;
  name: string;
  types: string[];
  aliases: string[];
  mentionCount?: number;
}

export function useEntities({ project }: { project: string }) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadEntities = async () => {
      try {
        setLoading(true);

        const result = await query<any>(LIST_ENTITIES_QUERY, {
          project,
          limit: 100, // Get more entities for the garden
        });

        if (mounted) {
          setEntities(result.listEntities.nodes);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          const message = err instanceof Error ? err.message : 'Failed to load entities';
          setError(message);
          console.warn('Entities API unavailable:', message);
          // Set empty state so UI can still render
          setEntities([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadEntities();

    // Poll for updates every 30 seconds (less jarring for visualization)
    const interval = setInterval(loadEntities, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [project]);

  return { entities, loading, error };
}
