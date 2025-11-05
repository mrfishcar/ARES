/**
 * useIdentityReview Hook - Sprint R9
 * Manages identity candidate detection and resolution
 */

import { useState, useEffect, useCallback } from 'react';
import { query, mutate } from '../lib/api';

export interface IdentityCandidate {
  id: string;
  entity1: EntitySummary;
  entity2: EntitySummary;
  similarityScore: number;
  sharedRelations: number;
  evidenceReasons: string[];
}

export interface EntitySummary {
  id: string;
  name: string;
  category: string;
  confidence: number;
  relationCount: number;
  seeds: string[];
}

const QUERY_GET_IDENTITY_CANDIDATES = `
  query GetIdentityCandidates(
    $project: String!
    $minSimilarity: Float
    $limit: Int
  ) {
    identityCandidates(
      project: $project
      minSimilarity: $minSimilarity
      limit: $limit
    ) {
      id
      entity1 {
        id
        name
        category
        confidence
        relationCount
        seeds
      }
      entity2 {
        id
        name
        category
        confidence
        relationCount
        seeds
      }
      similarityScore
      sharedRelations
      evidenceReasons
    }
  }
`;

const MUTATION_MERGE_ENTITIES = `
  mutation MergeEntities(
    $project: String!
    $entity1Id: String!
    $entity2Id: String!
    $primaryEntityId: String!
  ) {
    mergeEntities(
      project: $project
      entity1Id: $entity1Id
      entity2Id: $entity2Id
      primaryEntityId: $primaryEntityId
    ) {
      id
      name
      category
    }
  }
`;

const MUTATION_SEPARATE_ENTITIES = `
  mutation SeparateEntities(
    $project: String!
    $entity1Id: String!
    $entity2Id: String!
  ) {
    separateEntities(
      project: $project
      entity1Id: $entity1Id
      entity2Id: $entity2Id
    )
  }
`;

export function useIdentityReview(
  project: string,
  minSimilarity: number = 0.7,
  limit: number = 50
) {
  const [candidates, setCandidates] = useState<IdentityCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await query<{ identityCandidates: IdentityCandidate[] }>(
        QUERY_GET_IDENTITY_CANDIDATES,
        { project, minSimilarity, limit }
      );
      setCandidates(result.identityCandidates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load candidates');
    } finally {
      setLoading(false);
    }
  }, [project, minSimilarity, limit]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const mergeEntities = useCallback(
    async (
      entity1Id: string,
      entity2Id: string,
      primaryEntityId: string
    ): Promise<void> => {
      await mutate(MUTATION_MERGE_ENTITIES, {
        project,
        entity1Id,
        entity2Id,
        primaryEntityId,
      });
      // Remove the candidate from the list
      setCandidates(prev => prev.filter(c => c.id !== `${entity1Id}-${entity2Id}`));
    },
    [project]
  );

  const separateEntities = useCallback(
    async (entity1Id: string, entity2Id: string): Promise<void> => {
      await mutate(MUTATION_SEPARATE_ENTITIES, {
        project,
        entity1Id,
        entity2Id,
      });
      // Remove the candidate from the list
      setCandidates(prev => prev.filter(c => c.id !== `${entity1Id}-${entity2Id}`));
    },
    [project]
  );

  const ignorePair = useCallback((candidateId: string) => {
    // Simply remove from local state (could also call a mutation to persist)
    setCandidates(prev => prev.filter(c => c.id !== candidateId));
  }, []);

  return {
    candidates,
    loading,
    error,
    loadCandidates,
    mergeEntities,
    separateEntities,
    ignorePair,
  };
}
