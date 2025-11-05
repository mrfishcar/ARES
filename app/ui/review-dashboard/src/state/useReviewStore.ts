/**
 * Review Queue State Management with Polling
 */

import { useState, useEffect, useCallback } from 'react';
import { query, mutate } from '../api/client';

interface PendingEntity {
  id: string;
  name: string;
  aliases: string[];
  types: string[];
  evidence: Array<{ text: string; confidence: number }>;
}

interface PendingRelation {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  symmetric: boolean;
  evidence: Array<{ text: string }>;
}

interface ReviewStats {
  entities: number;
  relations: number;
}

interface ReviewHeartbeat {
  lastUpdatedAt: string;
}

export function useReviewStore(project: string, pollMs: number = 2000) {
  const [entities, setEntities] = useState<PendingEntity[]>([]);
  const [relations, setRelations] = useState<PendingRelation[]>([]);
  const [stats, setStats] = useState<ReviewStats>({ entities: 0, relations: 0 });
  const [lastHeartbeat, setLastHeartbeat] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsData, entitiesData, relationsData] = await Promise.all([
        query<{ reviewStats: ReviewStats }>(`
          query { reviewStats(project: "${project}") { entities relations } }
        `),
        query<{ pendingEntities: PendingEntity[] }>(`
          query { pendingEntities(project: "${project}", limit: 50) {
            id name aliases types evidence { text confidence }
          }}
        `),
        query<{ pendingRelations: PendingRelation[] }>(`
          query { pendingRelations(project: "${project}", limit: 50) {
            id subject predicate object symmetric evidence { text }
          }}
        `)
      ]);

      setStats(statsData.reviewStats);
      setEntities(entitiesData.pendingEntities);
      setRelations(relationsData.pendingRelations);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [project]);

  const checkHeartbeat = useCallback(async () => {
    try {
      setPolling(true);
      const data = await query<{ reviewHeartbeat: ReviewHeartbeat }>(`
        query { reviewHeartbeat(project: "${project}") { lastUpdatedAt } }
      `);

      if (data.reviewHeartbeat.lastUpdatedAt !== lastHeartbeat) {
        setLastHeartbeat(data.reviewHeartbeat.lastUpdatedAt);
        await fetchData();
      }
    } catch (err: any) {
      console.error('Heartbeat check failed:', err);
    } finally {
      setPolling(false);
    }
  }, [project, lastHeartbeat, fetchData]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Polling
  useEffect(() => {
    const interval = setInterval(checkHeartbeat, pollMs);
    return () => clearInterval(interval);
  }, [checkHeartbeat, pollMs]);

  const approve = useCallback(async (id: string) => {
    try {
      await mutate(`
        mutation { approveReviewItem(project: "${project}", id: "${id}") }
      `);
      await fetchData();
    } catch (err: any) {
      throw new Error(`Approve failed: ${err.message}`);
    }
  }, [project, fetchData]);

  const dismiss = useCallback(async (id: string) => {
    try {
      await mutate(`
        mutation { dismissReviewItem(project: "${project}", id: "${id}") }
      `);
      await fetchData();
    } catch (err: any) {
      throw new Error(`Dismiss failed: ${err.message}`);
    }
  }, [project, fetchData]);

  return {
    entities,
    relations,
    stats,
    loading,
    polling,
    error,
    approve,
    dismiss,
    refresh: fetchData
  };
}
