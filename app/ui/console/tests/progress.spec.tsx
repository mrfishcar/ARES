/**
 * Progress System Tests - Sprint R9
 * Tests for gamification, level calculation, and category unlocks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProgress } from '../src/hooks/useProgress';
import { useCategoryUnlocks } from '../src/components/CategoryUnlock';
import type { Progress } from '../src/hooks/useProgress';

// Mock the API module
vi.mock('../src/lib/api', () => ({
  query: vi.fn(),
  mutate: vi.fn(),
}));

import { query, mutate } from '../src/lib/api';

describe('Progress System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useProgress hook', () => {
    it('should load progress data from API', async () => {
      const mockProgress: Progress = {
        level: 5,
        unlockedCategories: ['PERSON', 'PLACE', 'ORG'],
        totalEntities: 125,
        totalRelations: 50,
        experiencePoints: 1750,
      };

      vi.mocked(query).mockResolvedValue({ getProgress: mockProgress });

      const { result } = renderHook(() => useProgress('test-project'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress).toEqual(mockProgress);
      expect(result.current.error).toBeNull();
    });

    it('should handle loading error', async () => {
      vi.mocked(query).mockRejectedValue(new Error('API error'));

      const { result } = renderHook(() => useProgress('test-project'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('API error');
    });

    it('should record entity creation action', async () => {
      const initialProgress: Progress = {
        level: 3,
        unlockedCategories: ['PERSON'],
        totalEntities: 50,
        totalRelations: 20,
        experiencePoints: 700,
      };

      const updatedProgress: Progress = {
        level: 3,
        unlockedCategories: ['PERSON'],
        totalEntities: 51,
        totalRelations: 20,
        experiencePoints: 710,
      };

      vi.mocked(query).mockResolvedValue({ getProgress: initialProgress });
      vi.mocked(mutate).mockResolvedValue({ recordEntityAction: updatedProgress });

      const { result } = renderHook(() => useProgress('test-project'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.recordAction('entity_created');
      });

      expect(result.current.progress?.totalEntities).toBe(51);
      expect(result.current.progress?.experiencePoints).toBe(710);
    });

    it('should record relation creation action', async () => {
      const initialProgress: Progress = {
        level: 2,
        unlockedCategories: ['PERSON'],
        totalEntities: 30,
        totalRelations: 10,
        experiencePoints: 350,
      };

      const updatedProgress: Progress = {
        level: 2,
        unlockedCategories: ['PERSON'],
        totalEntities: 30,
        totalRelations: 11,
        experiencePoints: 355,
      };

      vi.mocked(query).mockResolvedValue({ getProgress: initialProgress });
      vi.mocked(mutate).mockResolvedValue({ recordEntityAction: updatedProgress });

      const { result } = renderHook(() => useProgress('test-project'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.recordAction('relation_created');
      });

      expect(result.current.progress?.totalRelations).toBe(11);
      expect(result.current.progress?.experiencePoints).toBe(355);
    });

    it('should level up when threshold is reached', async () => {
      const beforeLevelUp: Progress = {
        level: 4,
        unlockedCategories: ['PERSON', 'PLACE'],
        totalEntities: 99,
        totalRelations: 40,
        experiencePoints: 1190,
      };

      const afterLevelUp: Progress = {
        level: 5,
        unlockedCategories: ['PERSON', 'PLACE', 'ORG'],
        totalEntities: 100,
        totalRelations: 40,
        experiencePoints: 1200,
      };

      vi.mocked(query).mockResolvedValue({ getProgress: beforeLevelUp });
      vi.mocked(mutate).mockResolvedValue({ recordEntityAction: afterLevelUp });

      const { result } = renderHook(() => useProgress('test-project'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.recordAction('entity_created');
      });

      expect(result.current.progress?.level).toBe(5);
      expect(result.current.progress?.unlockedCategories).toContain('ORG');
    });

    it('should calculate XP correctly for entities and relations', async () => {
      const progress: Progress = {
        level: 3,
        unlockedCategories: ['PERSON'],
        totalEntities: 25,  // 25 * 10 = 250 XP
        totalRelations: 10,  // 10 * 5 = 50 XP
        experiencePoints: 300, // Total: 300 XP
      };

      vi.mocked(query).mockResolvedValue({ getProgress: progress });

      const { result } = renderHook(() => useProgress('test-project'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress?.experiencePoints).toBe(300);
    });

    it('should reload progress on demand', async () => {
      const progress1: Progress = {
        level: 2,
        unlockedCategories: ['PERSON'],
        totalEntities: 30,
        totalRelations: 10,
        experiencePoints: 350,
      };

      const progress2: Progress = {
        level: 3,
        unlockedCategories: ['PERSON', 'PLACE'],
        totalEntities: 50,
        totalRelations: 20,
        experiencePoints: 600,
      };

      vi.mocked(query)
        .mockResolvedValueOnce({ getProgress: progress1 })
        .mockResolvedValueOnce({ getProgress: progress2 });

      const { result } = renderHook(() => useProgress('test-project'));

      await waitFor(() => {
        expect(result.current.progress?.level).toBe(2);
      });

      await act(async () => {
        await result.current.loadProgress();
      });

      expect(result.current.progress?.level).toBe(3);
    });
  });

  describe('useCategoryUnlocks hook', () => {
    it('should detect new category unlock', () => {
      const { result } = renderHook(() => useCategoryUnlocks());

      act(() => {
        result.current.checkForUnlocks(['PERSON']);
      });

      expect(result.current.currentUnlock).toBe('PERSON');
    });

    it('should not show unlock for existing category', () => {
      const { result } = renderHook(() => useCategoryUnlocks());

      act(() => {
        result.current.checkForUnlocks(['PERSON']);
      });

      act(() => {
        result.current.dismissUnlock();
      });

      act(() => {
        result.current.checkForUnlocks(['PERSON']);
      });

      expect(result.current.currentUnlock).toBeUndefined();
    });

    it('should queue multiple category unlocks', () => {
      const { result } = renderHook(() => useCategoryUnlocks());

      act(() => {
        result.current.checkForUnlocks(['PERSON', 'PLACE', 'ORG']);
      });

      expect(result.current.currentUnlock).toBe('PERSON');

      act(() => {
        result.current.dismissUnlock();
      });

      expect(result.current.currentUnlock).toBe('PLACE');

      act(() => {
        result.current.dismissUnlock();
      });

      expect(result.current.currentUnlock).toBe('ORG');
    });

    it('should dismiss current unlock', () => {
      const { result } = renderHook(() => useCategoryUnlocks());

      act(() => {
        result.current.checkForUnlocks(['PERSON']);
      });

      expect(result.current.currentUnlock).toBe('PERSON');

      act(() => {
        result.current.dismissUnlock();
      });

      expect(result.current.currentUnlock).toBeUndefined();
    });

    it('should handle incremental category unlocks', () => {
      const { result } = renderHook(() => useCategoryUnlocks());

      // First check
      act(() => {
        result.current.checkForUnlocks(['PERSON']);
      });

      expect(result.current.currentUnlock).toBe('PERSON');

      act(() => {
        result.current.dismissUnlock();
      });

      // Second check with additional category
      act(() => {
        result.current.checkForUnlocks(['PERSON', 'PLACE']);
      });

      expect(result.current.currentUnlock).toBe('PLACE');
    });
  });
});
