/**
 * useTimeline Hook - Sprint R9
 * Manages temporal graph data for vine timeline visualization
 */

import { useState, useEffect, useCallback } from 'react';
import { query, mutate } from '../lib/api';

export interface TemporalEvent {
  id: string;
  label: string;
  date: string;
  confidence: number;
  entityId: string;
  category: string;
  description?: string;
  x?: number;
  y?: number;
}

export interface TemporalConnection {
  source: string;
  target: string;
  relationId: string;
  label: string;
}

export interface TimelineData {
  events: TemporalEvent[];
  connections: TemporalConnection[];
}

const QUERY_GET_TIMELINE = `
  query GetTimeline(
    $project: String!
    $startDate: String
    $endDate: String
    $minConfidence: Float
  ) {
    getTimeline(
      project: $project
      startDate: $startDate
      endDate: $endDate
      minConfidence: $minConfidence
    ) {
      events {
        id
        label
        date
        confidence
        entityId
        category
        description
      }
      connections {
        source
        target
        relationId
        label
      }
    }
  }
`;

const MUTATION_UPDATE_EVENT_DATE = `
  mutation UpdateEventDate($eventId: String!, $newDate: String!) {
    updateEventDate(eventId: $eventId, newDate: $newDate) {
      id
      date
    }
  }
`;

const MUTATION_CONNECT_EVENTS = `
  mutation ConnectEvents(
    $sourceEventId: String!
    $targetEventId: String!
    $relationType: String!
  ) {
    connectEvents(
      sourceEventId: $sourceEventId
      targetEventId: $targetEventId
      relationType: $relationType
    ) {
      source
      target
      relationId
      label
    }
  }
`;

export function useTimeline(
  project: string,
  startDate?: string,
  endDate?: string,
  minConfidence: number = 0.5
) {
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTimeline = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await query<{ getTimeline: TimelineData }>(QUERY_GET_TIMELINE, {
        project,
        startDate,
        endDate,
        minConfidence,
      });
      setTimeline(result.getTimeline);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }, [project, startDate, endDate, minConfidence]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  const updateEventDate = useCallback(
    async (eventId: string, newDate: string): Promise<void> => {
      await mutate<{ updateEventDate: { id: string; date: string } }>(
        MUTATION_UPDATE_EVENT_DATE,
        { eventId, newDate }
      );
      await loadTimeline();
    },
    [loadTimeline]
  );

  const connectEvents = useCallback(
    async (sourceEventId: string, targetEventId: string, relationType: string): Promise<void> => {
      await mutate<{ connectEvents: TemporalConnection }>(MUTATION_CONNECT_EVENTS, {
        sourceEventId,
        targetEventId,
        relationType,
      });
      await loadTimeline();
    },
    [loadTimeline]
  );

  return {
    timeline,
    loading,
    error,
    loadTimeline,
    updateEventDate,
    connectEvents,
  };
}
