/**
 * useEntityMentions Hook - Sprint W2
 * Manage entity mentions with confirm/reject functionality
 */

import { useState, useCallback } from 'react';
import { mutate } from '../lib/api';
import type { EntityType } from '../types/entities';

export interface EntityMention {
  id: string;
  noteId: string;
  projectId: string;
  text: string;
  type: string;
  confidence: number;
  status: string;
  start: number;
  end: number;
  createdAt: string;
  confirmedAt?: string;
}

const MUTATION_CONFIRM_MENTION = `
  mutation ConfirmEntityMention(
    $project: String!
    $noteId: ID!
    $entityName: String!
    $type: String!
  ) {
    confirmEntityMention(
      project: $project
      noteId: $noteId
      entityName: $entityName
      type: $type
    ) {
      id
      noteId
      projectId
      text
      type
      confidence
      status
      start
      end
      createdAt
      confirmedAt
    }
  }
`;

const MUTATION_UPDATE_TYPE = `
  mutation UpdateEntityMentionType(
    $id: ID!
    $newType: String!
  ) {
    updateEntityMentionType(
      id: $id
      newType: $newType
    ) {
      id
      type
    }
  }
`;

const MUTATION_REJECT_MENTION = `
  mutation RejectEntityMention($id: ID!) {
    rejectEntityMention(id: $id)
  }
`;

export function useEntityMentions(project: string, noteId: string) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmMention = useCallback(
    async (entityName: string, type: EntityType): Promise<void> => {
      try {
        setConfirming(true);
        setError(null);

        await mutate<{ confirmEntityMention: EntityMention }>(
          MUTATION_CONFIRM_MENTION,
          { project, noteId, entityName, type }
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to confirm mention';
        setError(message);
        console.error('[useEntityMentions] Confirm error:', err);
        throw err;
      } finally {
        setConfirming(false);
      }
    },
    [project, noteId]
  );

  const updateType = useCallback(
    async (id: string, newType: EntityType): Promise<void> => {
      try {
        setError(null);

        await mutate<{ updateEntityMentionType: EntityMention }>(
          MUTATION_UPDATE_TYPE,
          { id, newType }
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update type';
        setError(message);
        console.error('[useEntityMentions] Update type error:', err);
        throw err;
      }
    },
    []
  );

  const rejectMention = useCallback(
    async (id: string): Promise<void> => {
      try {
        setError(null);

        await mutate<{ rejectEntityMention: boolean }>(
          MUTATION_REJECT_MENTION,
          { id }
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to reject mention';
        setError(message);
        console.error('[useEntityMentions] Reject error:', err);
        throw err;
      }
    },
    []
  );

  return {
    confirmMention,
    updateType,
    rejectMention,
    confirming,
    error,
  };
}
