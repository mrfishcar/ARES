/**
 * useNotes Hook - Sprint R7
 * Fetches notes with cursor pagination and mutations
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { query, mutate } from './api';

export interface Note {
  id: string;
  project: string;
  title?: string;
  markdown: string;
  attachments: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NoteConnection {
  nodes: Note[];
  pageInfo: {
    endCursor: string | null;
    hasNextPage: boolean;
  };
  totalApprox: number;
}

export interface NoteInput {
  title?: string;
  markdown: string;
  attachments?: string[];
}

export interface UseNotesOptions {
  project: string;
  limit?: number;
  enabled?: boolean;
}

export interface UseNotesResult {
  notes: Note[];
  loading: boolean;
  error: string | null;
  hasNextPage: boolean;
  totalApprox: number;
  loadMore: () => void;
  refetch: () => void;
  createNote: (input: NoteInput) => Promise<Note>;
  updateNote: (id: string, input: NoteInput) => Promise<Note>;
  deleteNote: (id: string) => Promise<boolean>;
}

const GRAPHQL_LIST_NOTES = `
  query ListNotes($project: String!, $after: Cursor, $limit: Int!) {
    listNotes(project: $project, after: $after, limit: $limit) {
      nodes {
        id
        project
        title
        markdown
        attachments
        createdAt
        updatedAt
      }
      pageInfo {
        endCursor
        hasNextPage
      }
      totalApprox
    }
  }
`;

const GRAPHQL_CREATE_NOTE = `
  mutation CreateNote($project: String!, $input: NoteInput!) {
    createNote(project: $project, input: $input) {
      id
      project
      title
      markdown
      attachments
      createdAt
      updatedAt
    }
  }
`;

const GRAPHQL_UPDATE_NOTE = `
  mutation UpdateNote($id: ID!, $input: NoteInput!) {
    updateNote(id: $id, input: $input) {
      id
      project
      title
      markdown
      attachments
      createdAt
      updatedAt
    }
  }
`;

const GRAPHQL_DELETE_NOTE = `
  mutation DeleteNote($id: ID!) {
    deleteNote(id: $id)
  }
`;

/**
 * Hook for fetching and managing notes
 * Supports cursor pagination and CRUD operations
 */
export function useNotes(options: UseNotesOptions): UseNotesResult {
  const { project, limit = 50, enabled = true } = options;

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState<boolean>(false);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [totalApprox, setTotalApprox] = useState<number>(0);
  const [refetchTrigger, setRefetchTrigger] = useState<number>(0);

  // Memoize query parameters
  const queryKey = useMemo(() => {
    return `notes:${project}:${limit}`;
  }, [project, limit]);

  // Refetch function
  const refetch = useCallback(() => {
    setNotes([]);
    setEndCursor(null);
    setRefetchTrigger(prev => prev + 1);
  }, []);

  // Load more (pagination)
  const loadMore = useCallback(() => {
    if (!hasNextPage || loading) return;
    setRefetchTrigger(prev => prev + 1);
  }, [hasNextPage, loading]);

  // Create note mutation
  const createNote = useCallback(async (input: NoteInput): Promise<Note> => {
    interface CreateNoteResponse {
      createNote: Note;
    }

    const result = await mutate<CreateNoteResponse>(GRAPHQL_CREATE_NOTE, {
      project,
      input,
    });

    // Refetch to include new note
    refetch();

    return result.createNote;
  }, [project, refetch]);

  // Update note mutation
  const updateNote = useCallback(async (id: string, input: NoteInput): Promise<Note> => {
    interface UpdateNoteResponse {
      updateNote: Note;
    }

    const result = await mutate<UpdateNoteResponse>(GRAPHQL_UPDATE_NOTE, {
      id,
      input,
    });

    // Update local state
    setNotes(prev => prev.map(n => (n.id === id ? result.updateNote : n)));

    return result.updateNote;
  }, []);

  // Delete note mutation
  const deleteNote = useCallback(async (id: string): Promise<boolean> => {
    interface DeleteNoteResponse {
      deleteNote: boolean;
    }

    const result = await mutate<DeleteNoteResponse>(GRAPHQL_DELETE_NOTE, {
      id,
    });

    if (result.deleteNote) {
      // Remove from local state
      setNotes(prev => prev.filter(n => n.id !== id));
      setTotalApprox(prev => Math.max(0, prev - 1));
    }

    return result.deleteNote;
  }, []);

  // Fetch notes with pagination
  useEffect(() => {
    if (!enabled) {
      setNotes([]);
      setLoading(false);
      setError(null);
      setHasNextPage(false);
      setTotalApprox(0);
      return;
    }

    setLoading(true);
    setError(null);

    // Debounce: wait 100ms before fetching
    const timeoutId = setTimeout(async () => {
      try {
        interface ListNotesResponse {
          listNotes: NoteConnection;
        }

        const result = await query<ListNotesResponse>(GRAPHQL_LIST_NOTES, {
          project,
          after: endCursor,
          limit,
        });

        const connection = result.listNotes;

        // Append to existing notes or replace if no cursor
        if (endCursor) {
          setNotes(prev => [...prev, ...connection.nodes]);
        } else {
          setNotes(connection.nodes);
        }

        setEndCursor(connection.pageInfo.endCursor);
        setHasNextPage(connection.pageInfo.hasNextPage);
        setTotalApprox(connection.totalApprox);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch notes';
        console.warn('Notes API unavailable:', message);
        setError(message);
        // Set empty state so UI can still render
        setNotes([]);
        setHasNextPage(false);
        setTotalApprox(0);
      } finally {
        setLoading(false);
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [queryKey, enabled, refetchTrigger, endCursor]);

  return {
    notes,
    loading,
    error,
    hasNextPage,
    totalApprox,
    loadMore,
    refetch,
    createNote,
    updateNote,
    deleteNote,
  };
}
