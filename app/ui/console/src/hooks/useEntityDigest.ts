/**
 * useEntityDigest Hook - Sprint W1
 * Manages entity digest composition and citations
 */

import { useState, useEffect, useCallback } from 'react';
import { query, mutate } from '../lib/api';

export interface CitationRef {
  seedId: string;
  docId: string;
  quote: string;
}

export interface DigestSection {
  title: string;
  markdown: string;
  citations: CitationRef[];
}

export interface DigestStats {
  seedCount: number;
  noteCount: number;
  relationCount: number;
  temporalEventCount: number;
}

export interface EntityDigest {
  entityId: string;
  entityName: string;
  sections: DigestSection[];
  generatedAt: string;
  stats: DigestStats;
}

const QUERY_GET_ENTITY_DIGEST = `
  query GetEntityDigest($project: String!, $entityId: ID!) {
    entityDigest(project: $project, entityId: $entityId) {
      entityId
      entityName
      sections {
        title
        markdown
        citations {
          seedId
          docId
          quote
        }
      }
      generatedAt
      stats {
        seedCount
        noteCount
        relationCount
        temporalEventCount
      }
    }
  }
`;

const MUTATION_REGENERATE_DIGEST = `
  mutation RegenerateEntityDigest(
    $project: String!
    $entityId: ID!
    $options: JSON
  ) {
    regenerateEntityDigest(
      project: $project
      entityId: $entityId
      options: $options
    ) {
      entityId
      entityName
      sections {
        title
        markdown
        citations {
          seedId
          docId
          quote
        }
      }
      generatedAt
      stats {
        seedCount
        noteCount
        relationCount
        temporalEventCount
      }
    }
  }
`;

export function useEntityDigest(project: string, entityId?: string) {
  const [digest, setDigest] = useState<EntityDigest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDigest = useCallback(async () => {
    if (!entityId) return;

    try {
      setLoading(true);
      setError(null);
      const result = await query<{ entityDigest: EntityDigest }>(
        QUERY_GET_ENTITY_DIGEST,
        { project, entityId }
      );
      setDigest(result.entityDigest);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entity digest');
      console.error('[useEntityDigest] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [project, entityId]);

  useEffect(() => {
    loadDigest();
  }, [loadDigest]);

  const regenerate = useCallback(
    async (options?: Record<string, any>): Promise<void> => {
      if (!entityId) return;

      try {
        setLoading(true);
        setError(null);
        const result = await mutate<{ regenerateEntityDigest: EntityDigest }>(
          MUTATION_REGENERATE_DIGEST,
          { project, entityId, options }
        );
        setDigest(result.regenerateEntityDigest);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to regenerate digest');
        console.error('[useEntityDigest] Regenerate error:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [project, entityId]
  );

  return {
    digest,
    loading,
    error,
    loadDigest,
    regenerate,
  };
}
