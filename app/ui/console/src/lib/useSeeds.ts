/**
 * useSeeds Hook - Sprint R7
 * Fetches and manages citation seeds for entities
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { query, mutate } from './api';

export interface Seed {
  id: string;
  entityId: string;
  docId: string;
  span: {
    start: number;
    end: number;
    text: string;
  };
  quote: string;
  addedBy: string;
  addedAt: string;
  removed: boolean;
}

export interface SeedInput {
  entityId: string;
  docId: string;
  quote: string;
  start: number;
  end: number;
}

export interface UseSeedsOptions {
  entityId: string;
  enabled?: boolean;
}

export interface UseSeedsResult {
  seeds: Seed[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  addSeed: (input: SeedInput) => Promise<Seed>;
  removeSeed: (id: string) => Promise<boolean>;
  rebuildEntity: (entityId: string) => Promise<boolean>;
}

const GRAPHQL_LIST_SEEDS = `
  query ListSeeds($entityId: ID!) {
    listSeeds(entityId: $entityId) {
      id
      entityId
      docId
      span {
        start
        end
        text
      }
      quote
      addedBy
      addedAt
      removed
    }
  }
`;

const GRAPHQL_ADD_SEED = `
  mutation AddSeed($input: SeedInput!) {
    addSeed(input: $input) {
      id
      entityId
      docId
      span {
        start
        end
        text
      }
      quote
      addedBy
      addedAt
      removed
    }
  }
`;

const GRAPHQL_REMOVE_SEED = `
  mutation RemoveSeed($id: ID!) {
    removeSeed(id: $id)
  }
`;

const GRAPHQL_REBUILD_ENTITY = `
  mutation RebuildEntity($entityId: ID!) {
    rebuildEntity(entityId: $entityId)
  }
`;

/**
 * Hook for fetching and managing entity seeds
 * Seeds are citation evidence snippets that can trigger wiki rebuilds
 */
export function useSeeds(options: UseSeedsOptions): UseSeedsResult {
  const { entityId, enabled = true } = options;

  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState<number>(0);

  // Memoize query parameters
  const queryKey = useMemo(() => {
    return `seeds:${entityId}`;
  }, [entityId]);

  // Refetch function
  const refetch = useCallback(() => {
    setRefetchTrigger(prev => prev + 1);
  }, []);

  // Add seed mutation
  const addSeed = useCallback(async (input: SeedInput): Promise<Seed> => {
    interface AddSeedResponse {
      addSeed: Seed;
    }

    const result = await mutate<AddSeedResponse>(GRAPHQL_ADD_SEED, {
      input,
    });

    // Add to local state
    setSeeds(prev => [...prev, result.addSeed]);

    return result.addSeed;
  }, []);

  // Remove seed mutation
  const removeSeed = useCallback(async (id: string): Promise<boolean> => {
    interface RemoveSeedResponse {
      removeSeed: boolean;
    }

    const result = await mutate<RemoveSeedResponse>(GRAPHQL_REMOVE_SEED, {
      id,
    });

    if (result.removeSeed) {
      // Remove from local state
      setSeeds(prev => prev.filter(s => s.id !== id));
    }

    return result.removeSeed;
  }, []);

  // Rebuild entity wiki mutation
  const rebuildEntity = useCallback(async (entityId: string): Promise<boolean> => {
    interface RebuildEntityResponse {
      rebuildEntity: boolean;
    }

    const result = await mutate<RebuildEntityResponse>(GRAPHQL_REBUILD_ENTITY, {
      entityId,
    });

    return result.rebuildEntity;
  }, []);

  // Fetch seeds for entity
  useEffect(() => {
    if (!enabled || !entityId) {
      setSeeds([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    // Debounce: wait 100ms before fetching
    const timeoutId = setTimeout(async () => {
      try {
        interface ListSeedsResponse {
          listSeeds: Seed[];
        }

        const result = await query<ListSeedsResponse>(GRAPHQL_LIST_SEEDS, {
          entityId,
        });

        setSeeds(result.listSeeds);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch seeds';
        setError(message);
        setSeeds([]);
      } finally {
        setLoading(false);
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [queryKey, enabled, refetchTrigger]);

  return {
    seeds,
    loading,
    error,
    refetch,
    addSeed,
    removeSeed,
    rebuildEntity,
  };
}
