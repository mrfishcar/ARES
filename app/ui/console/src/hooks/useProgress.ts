/**
 * useProgress Hook - Sprint R9
 * Manages gamification and progress data
 */

import { useState, useEffect, useCallback } from 'react';
import { query, mutate } from '../lib/api';

export interface Progress {
  level: number;
  unlockedCategories: string[];
  totalEntities: number;
  totalRelations: number;
  experiencePoints: number;
}

const QUERY_GET_PROGRESS = `
  query GetProgress($project: String!) {
    getProgress(project: $project) {
      level
      unlockedCategories
      totalEntities
      totalRelations
      experiencePoints
    }
  }
`;

const MUTATION_RECORD_ACTION = `
  mutation RecordEntityAction($project: String!, $actionType: String!) {
    recordEntityAction(project: $project, actionType: $actionType) {
      level
      unlockedCategories
      totalEntities
      totalRelations
      experiencePoints
    }
  }
`;

export function useProgress(project: string) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProgress = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await query<{ getProgress: Progress }>(QUERY_GET_PROGRESS, { project });
      setProgress(result.getProgress);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load progress');
    } finally {
      setLoading(false);
    }
  }, [project]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  const recordAction = useCallback(
    async (actionType: 'entity_created' | 'relation_created' | 'entity_approved'): Promise<Progress> => {
      const result = await mutate<{ recordEntityAction: Progress }>(MUTATION_RECORD_ACTION, {
        project,
        actionType,
      });

      setProgress(result.recordEntityAction);
      return result.recordEntityAction;
    },
    [project]
  );

  return {
    progress,
    loading,
    error,
    loadProgress,
    recordAction,
  };
}
