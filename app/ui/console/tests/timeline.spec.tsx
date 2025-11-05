/**
 * Timeline Tests - Sprint R9
 * Tests for vine timeline visualization and temporal data
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTimeline } from '../src/hooks/useTimeline';
import type { TimelineData, TemporalEvent, TemporalConnection } from '../src/hooks/useTimeline';

// Mock the API module
vi.mock('../src/lib/api', () => ({
  query: vi.fn(),
  mutate: vi.fn(),
}));

import { query, mutate } from '../src/lib/api';

describe('Timeline System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useTimeline hook', () => {
    it('should load timeline data from API', async () => {
      const mockTimeline: TimelineData = {
        events: [
          {
            id: 'event-1',
            label: 'Battle of Helm\'s Deep',
            date: '3019-03-03',
            confidence: 0.95,
            entityId: 'entity-1',
            category: 'EVENT',
            description: 'Epic battle at Helm\'s Deep',
          },
          {
            id: 'event-2',
            label: 'Council of Elrond',
            date: '3018-10-25',
            confidence: 0.9,
            entityId: 'entity-2',
            category: 'EVENT',
            description: 'Council to decide the fate of the Ring',
          },
        ],
        connections: [
          {
            source: 'event-1',
            target: 'event-2',
            relationId: 'rel-1',
            label: 'preceded_by',
          },
        ],
      };

      vi.mocked(query).mockResolvedValue({ getTimeline: mockTimeline });

      const { result } = renderHook(() => useTimeline('test-project'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.timeline).toEqual(mockTimeline);
      expect(result.current.error).toBeNull();
    });

    it('should handle loading error', async () => {
      vi.mocked(query).mockRejectedValue(new Error('Timeline error'));

      const { result } = renderHook(() => useTimeline('test-project'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Timeline error');
    });

    it('should filter by date range', async () => {
      const mockTimeline: TimelineData = {
        events: [
          {
            id: 'event-1',
            label: 'Event 1',
            date: '3019-03-03',
            confidence: 0.9,
            entityId: 'entity-1',
            category: 'EVENT',
          },
        ],
        connections: [],
      };

      vi.mocked(query).mockResolvedValue({ getTimeline: mockTimeline });

      const { result } = renderHook(() =>
        useTimeline('test-project', '3019-01-01', '3019-12-31', 0.5)
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('getTimeline'),
        expect.objectContaining({
          startDate: '3019-01-01',
          endDate: '3019-12-31',
        })
      );
    });

    it('should filter by minimum confidence', async () => {
      const mockTimeline: TimelineData = {
        events: [
          {
            id: 'event-1',
            label: 'High confidence event',
            date: '3019-03-03',
            confidence: 0.95,
            entityId: 'entity-1',
            category: 'EVENT',
          },
        ],
        connections: [],
      };

      vi.mocked(query).mockResolvedValue({ getTimeline: mockTimeline });

      const { result } = renderHook(() =>
        useTimeline('test-project', undefined, undefined, 0.8)
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('getTimeline'),
        expect.objectContaining({ minConfidence: 0.8 })
      );
    });

    it('should update event date via mutation', async () => {
      const mockTimeline: TimelineData = {
        events: [
          {
            id: 'event-1',
            label: 'Test Event',
            date: '3019-03-03',
            confidence: 0.9,
            entityId: 'entity-1',
            category: 'EVENT',
          },
        ],
        connections: [],
      };

      vi.mocked(query).mockResolvedValue({ getTimeline: mockTimeline });
      vi.mocked(mutate).mockResolvedValue({
        updateEventDate: { id: 'event-1', date: '3019-03-05' },
      });

      const { result } = renderHook(() => useTimeline('test-project'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateEventDate('event-1', '3019-03-05');
      });

      expect(mutate).toHaveBeenCalledWith(
        expect.stringContaining('updateEventDate'),
        { eventId: 'event-1', newDate: '3019-03-05' }
      );
    });

    it('should connect two events via mutation', async () => {
      const mockTimeline: TimelineData = {
        events: [
          {
            id: 'event-1',
            label: 'Event 1',
            date: '3019-03-03',
            confidence: 0.9,
            entityId: 'entity-1',
            category: 'EVENT',
          },
          {
            id: 'event-2',
            label: 'Event 2',
            date: '3019-03-05',
            confidence: 0.9,
            entityId: 'entity-2',
            category: 'EVENT',
          },
        ],
        connections: [],
      };

      const newConnection: TemporalConnection = {
        source: 'event-1',
        target: 'event-2',
        relationId: 'rel-new',
        label: 'leads_to',
      };

      vi.mocked(query).mockResolvedValue({ getTimeline: mockTimeline });
      vi.mocked(mutate).mockResolvedValue({ connectEvents: newConnection });

      const { result } = renderHook(() => useTimeline('test-project'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.connectEvents('event-1', 'event-2', 'leads_to');
      });

      expect(mutate).toHaveBeenCalledWith(
        expect.stringContaining('connectEvents'),
        {
          sourceEventId: 'event-1',
          targetEventId: 'event-2',
          relationType: 'leads_to',
        }
      );
    });

    it('should reload timeline after mutation', async () => {
      const timeline1: TimelineData = {
        events: [
          {
            id: 'event-1',
            label: 'Event 1',
            date: '3019-03-03',
            confidence: 0.9,
            entityId: 'entity-1',
            category: 'EVENT',
          },
        ],
        connections: [],
      };

      const timeline2: TimelineData = {
        events: [
          {
            id: 'event-1',
            label: 'Event 1',
            date: '3019-03-05',
            confidence: 0.9,
            entityId: 'entity-1',
            category: 'EVENT',
          },
        ],
        connections: [],
      };

      vi.mocked(query)
        .mockResolvedValueOnce({ getTimeline: timeline1 })
        .mockResolvedValueOnce({ getTimeline: timeline2 });

      vi.mocked(mutate).mockResolvedValue({
        updateEventDate: { id: 'event-1', date: '3019-03-05' },
      });

      const { result } = renderHook(() => useTimeline('test-project'));

      await waitFor(() => {
        expect(result.current.timeline?.events[0].date).toBe('3019-03-03');
      });

      await act(async () => {
        await result.current.updateEventDate('event-1', '3019-03-05');
      });

      await waitFor(() => {
        expect(result.current.timeline?.events[0].date).toBe('3019-03-05');
      });
    });

    it('should handle empty timeline', async () => {
      const emptyTimeline: TimelineData = {
        events: [],
        connections: [],
      };

      vi.mocked(query).mockResolvedValue({ getTimeline: emptyTimeline });

      const { result } = renderHook(() => useTimeline('test-project'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.timeline?.events).toEqual([]);
      expect(result.current.timeline?.connections).toEqual([]);
    });

    it('should include event metadata', async () => {
      const mockTimeline: TimelineData = {
        events: [
          {
            id: 'event-1',
            label: 'Important Event',
            date: '3019-03-03',
            confidence: 0.95,
            entityId: 'entity-1',
            category: 'EVENT',
            description: 'A very important event',
            x: 100,
            y: 200,
          },
        ],
        connections: [],
      };

      vi.mocked(query).mockResolvedValue({ getTimeline: mockTimeline });

      const { result } = renderHook(() => useTimeline('test-project'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const event = result.current.timeline?.events[0];
      expect(event?.description).toBe('A very important event');
      expect(event?.x).toBe(100);
      expect(event?.y).toBe(200);
    });

    it('should support manual timeline reload', async () => {
      const timeline1: TimelineData = {
        events: [
          {
            id: 'event-1',
            label: 'Event 1',
            date: '3019-03-03',
            confidence: 0.9,
            entityId: 'entity-1',
            category: 'EVENT',
          },
        ],
        connections: [],
      };

      const timeline2: TimelineData = {
        events: [
          {
            id: 'event-1',
            label: 'Event 1',
            date: '3019-03-03',
            confidence: 0.9,
            entityId: 'entity-1',
            category: 'EVENT',
          },
          {
            id: 'event-2',
            label: 'Event 2',
            date: '3019-03-05',
            confidence: 0.8,
            entityId: 'entity-2',
            category: 'EVENT',
          },
        ],
        connections: [],
      };

      vi.mocked(query)
        .mockResolvedValueOnce({ getTimeline: timeline1 })
        .mockResolvedValueOnce({ getTimeline: timeline2 });

      const { result } = renderHook(() => useTimeline('test-project'));

      await waitFor(() => {
        expect(result.current.timeline?.events.length).toBe(1);
      });

      await act(async () => {
        await result.current.loadTimeline();
      });

      expect(result.current.timeline?.events.length).toBe(2);
    });
  });
});
