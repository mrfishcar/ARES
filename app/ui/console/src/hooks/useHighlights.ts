/**
 * useHighlights Hook - Sprint R10
 * Manages entity highlights in notes with real-time detection
 */

import { useState, useEffect, useCallback } from 'react';
import { query, mutate } from '../lib/api';

export interface Highlight {
  id: string;
  noteId: string;
  text: string;
  entityId?: string;
  entityType: string;
  confidence: number;
  status: 'proposed' | 'confirmed' | 'rejected' | 'corrected';
  start: number;
  end: number;
  createdAt: string;
}

export interface HighlightStats {
  total: number;
  confirmed: number;
  rejected: number;
  pending: number;
}

const QUERY_GET_HIGHLIGHTS = `
  query GetHighlights($noteId: ID!) {
    highlights(noteId: $noteId) {
      id
      noteId
      text
      entityId
      entityType
      confidence
      status
      start
      end
      createdAt
    }
  }
`;

const QUERY_GET_HIGHLIGHT_STATS = `
  query GetHighlightStats($project: String!) {
    getHighlightStats(project: $project) {
      total
      confirmed
      rejected
      pending
    }
  }
`;

const MUTATION_CONFIRM_HIGHLIGHT = `
  mutation ConfirmHighlight($id: ID!, $entityType: String) {
    confirmHighlight(id: $id, entityType: $entityType) {
      id
      noteId
      text
      entityId
      entityType
      confidence
      status
      start
      end
      createdAt
    }
  }
`;

const MUTATION_REJECT_HIGHLIGHT = `
  mutation RejectHighlight($id: ID!) {
    rejectHighlight(id: $id) {
      id
      status
    }
  }
`;

const MUTATION_CORRECT_HIGHLIGHT = `
  mutation CorrectHighlight($id: ID!, $newEntityType: String!) {
    correctHighlight(id: $id, newEntityType: $newEntityType) {
      id
      entityType
      status
    }
  }
`;

const MUTATION_REANALYZE_NOTE = `
  mutation ReanalyzeNote($noteId: ID!) {
    reanalyzeNote(noteId: $noteId) {
      id
      noteId
      text
      entityId
      entityType
      confidence
      status
      start
      end
      createdAt
    }
  }
`;

const MUTATION_AUTO_CONFIRM_PENDING = `
  mutation AutoConfirmPending($noteId: ID!, $threshold: Float!) {
    autoConfirmPending(noteId: $noteId, threshold: $threshold) {
      id
      status
    }
  }
`;

export function useHighlights(noteId?: string) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [stats, setStats] = useState<HighlightStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHighlights = useCallback(async () => {
    if (!noteId) return;

    try {
      setLoading(true);
      setError(null);
      const result = await query<{ highlights: Highlight[] }>(QUERY_GET_HIGHLIGHTS, { noteId });
      setHighlights(result.highlights);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load highlights');
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  const loadStats = useCallback(async (project: string) => {
    try {
      const result = await query<{ getHighlightStats: HighlightStats }>(QUERY_GET_HIGHLIGHT_STATS, {
        project,
      });
      setStats(result.getHighlightStats);
    } catch (err) {
      console.error('Failed to load highlight stats:', err);
    }
  }, []);

  useEffect(() => {
    loadHighlights();
  }, [loadHighlights]);

  const confirmHighlight = useCallback(
    async (id: string, entityType?: string): Promise<void> => {
      try {
        const result = await mutate<{ confirmHighlight: Highlight }>(MUTATION_CONFIRM_HIGHLIGHT, {
          id,
          entityType,
        });

        // Update local state
        setHighlights((prev) =>
          prev.map((h) => (h.id === id ? result.confirmHighlight : h))
        );
      } catch (err) {
        throw new Error(
          `Failed to confirm highlight: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    },
    []
  );

  const rejectHighlight = useCallback(async (id: string): Promise<void> => {
    try {
      await mutate<{ rejectHighlight: Highlight }>(MUTATION_REJECT_HIGHLIGHT, { id });

      // Update local state
      setHighlights((prev) => prev.map((h) => (h.id === id ? { ...h, status: 'rejected' } : h)));
    } catch (err) {
      throw new Error(
        `Failed to reject highlight: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }, []);

  const correctHighlight = useCallback(
    async (id: string, newEntityType: string): Promise<void> => {
      try {
        const result = await mutate<{ correctHighlight: Highlight }>(MUTATION_CORRECT_HIGHLIGHT, {
          id,
          newEntityType,
        });

        // Update local state
        setHighlights((prev) =>
          prev.map((h) => (h.id === id ? { ...h, ...result.correctHighlight } : h))
        );
      } catch (err) {
        throw new Error(
          `Failed to correct highlight: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    },
    []
  );

  const reanalyzeNote = useCallback(async (noteId: string): Promise<void> => {
    try {
      const result = await mutate<{ reanalyzeNote: Highlight[] }>(MUTATION_REANALYZE_NOTE, {
        noteId,
      });

      setHighlights(result.reanalyzeNote);
    } catch (err) {
      throw new Error(
        `Failed to reanalyze note: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }, []);

  const autoConfirmPending = useCallback(
    async (noteId: string, threshold: number): Promise<void> => {
      try {
        await mutate<{ autoConfirmPending: Highlight[] }>(
          MUTATION_AUTO_CONFIRM_PENDING,
          { noteId, threshold }
        );

        // Reload highlights after auto-confirmation
        await loadHighlights();
      } catch (err) {
        throw new Error(
          `Failed to auto-confirm: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    },
    [loadHighlights]
  );

  return {
    highlights,
    stats,
    loading,
    error,
    loadHighlights,
    loadStats,
    confirmHighlight,
    rejectHighlight,
    correctHighlight,
    reanalyzeNote,
    autoConfirmPending,
  };
}
