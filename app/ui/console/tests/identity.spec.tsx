/**
 * Identity Review Tests - Sprint R9
 * Tests for entity identity resolution and duplicate detection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useIdentityReview } from '../src/hooks/useIdentityReview';
import type { IdentityCandidate } from '../src/hooks/useIdentityReview';

// Mock the API module
vi.mock('../src/lib/api', () => ({
  query: vi.fn(),
  mutate: vi.fn(),
}));

import { query, mutate } from '../src/lib/api';

describe('Identity Review System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useIdentityReview hook', () => {
    it('should load identity candidates from API', async () => {
      const mockCandidates: IdentityCandidate[] = [
        {
          id: 'candidate-1',
          entity1: {
            id: 'entity-1',
            name: 'Gandalf the Grey',
            category: 'PERSON',
            confidence: 0.95,
            relationCount: 25,
            seeds: ['note-1', 'note-2'],
          },
          entity2: {
            id: 'entity-2',
            name: 'Gandalf',
            category: 'PERSON',
            confidence: 0.9,
            relationCount: 18,
            seeds: ['note-3'],
          },
          similarityScore: 0.92,
          sharedRelations: 15,
          evidenceReasons: [
            'Name similarity: 95%',
            'Same category: PERSON',
            '15 shared relations',
          ],
        },
      ];

      vi.mocked(query).mockResolvedValue({ identityCandidates: mockCandidates });

      const { result } = renderHook(() => useIdentityReview('test-project'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.candidates).toEqual(mockCandidates);
      expect(result.current.error).toBeNull();
    });

    it('should handle loading error', async () => {
      vi.mocked(query).mockRejectedValue(new Error('API error'));

      const { result } = renderHook(() => useIdentityReview('test-project'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('API error');
    });

    it('should merge entities and remove from candidates', async () => {
      const mockCandidates: IdentityCandidate[] = [
        {
          id: 'entity-1-entity-2',
          entity1: {
            id: 'entity-1',
            name: 'Aragorn',
            category: 'PERSON',
            confidence: 0.95,
            relationCount: 30,
            seeds: ['note-1'],
          },
          entity2: {
            id: 'entity-2',
            name: 'Strider',
            category: 'PERSON',
            confidence: 0.9,
            relationCount: 20,
            seeds: ['note-2'],
          },
          similarityScore: 0.88,
          sharedRelations: 18,
          evidenceReasons: ['Same person, different names'],
        },
      ];

      vi.mocked(query).mockResolvedValue({ identityCandidates: mockCandidates });
      vi.mocked(mutate).mockResolvedValue({
        mergeEntities: { id: 'entity-1', name: 'Aragorn', category: 'PERSON' },
      });

      const { result } = renderHook(() => useIdentityReview('test-project'));

      await waitFor(() => {
        expect(result.current.candidates.length).toBe(1);
      });

      await act(async () => {
        await result.current.mergeEntities('entity-1', 'entity-2', 'entity-1');
      });

      expect(result.current.candidates.length).toBe(0);
      expect(mutate).toHaveBeenCalledWith(
        expect.stringContaining('mergeEntities'),
        {
          project: 'test-project',
          entity1Id: 'entity-1',
          entity2Id: 'entity-2',
          primaryEntityId: 'entity-1',
        }
      );
    });

    it('should separate entities and remove from candidates', async () => {
      const mockCandidates: IdentityCandidate[] = [
        {
          id: 'entity-1-entity-2',
          entity1: {
            id: 'entity-1',
            name: 'Merry',
            category: 'PERSON',
            confidence: 0.9,
            relationCount: 15,
            seeds: ['note-1'],
          },
          entity2: {
            id: 'entity-2',
            name: 'Pippin',
            category: 'PERSON',
            confidence: 0.9,
            relationCount: 14,
            seeds: ['note-2'],
          },
          similarityScore: 0.75,
          sharedRelations: 10,
          evidenceReasons: ['Both hobbits from the Shire'],
        },
      ];

      vi.mocked(query).mockResolvedValue({ identityCandidates: mockCandidates });
      vi.mocked(mutate).mockResolvedValue({ separateEntities: true });

      const { result } = renderHook(() => useIdentityReview('test-project'));

      await waitFor(() => {
        expect(result.current.candidates.length).toBe(1);
      });

      await act(async () => {
        await result.current.separateEntities('entity-1', 'entity-2');
      });

      expect(result.current.candidates.length).toBe(0);
      expect(mutate).toHaveBeenCalledWith(
        expect.stringContaining('separateEntities'),
        {
          project: 'test-project',
          entity1Id: 'entity-1',
          entity2Id: 'entity-2',
        }
      );
    });

    it('should ignore pair and remove from local state', async () => {
      const mockCandidates: IdentityCandidate[] = [
        {
          id: 'candidate-1',
          entity1: {
            id: 'entity-1',
            name: 'Entity 1',
            category: 'PERSON',
            confidence: 0.9,
            relationCount: 10,
            seeds: ['note-1'],
          },
          entity2: {
            id: 'entity-2',
            name: 'Entity 2',
            category: 'PERSON',
            confidence: 0.9,
            relationCount: 10,
            seeds: ['note-2'],
          },
          similarityScore: 0.7,
          sharedRelations: 5,
          evidenceReasons: ['Weak match'],
        },
      ];

      vi.mocked(query).mockResolvedValue({ identityCandidates: mockCandidates });

      const { result } = renderHook(() => useIdentityReview('test-project'));

      await waitFor(() => {
        expect(result.current.candidates.length).toBe(1);
      });

      act(() => {
        result.current.ignorePair('candidate-1');
      });

      expect(result.current.candidates.length).toBe(0);
    });

    it('should filter by minimum similarity', async () => {
      const mockCandidates: IdentityCandidate[] = [
        {
          id: 'candidate-1',
          entity1: {
            id: 'entity-1',
            name: 'High Match',
            category: 'PERSON',
            confidence: 0.95,
            relationCount: 20,
            seeds: ['note-1'],
          },
          entity2: {
            id: 'entity-2',
            name: 'High Match 2',
            category: 'PERSON',
            confidence: 0.95,
            relationCount: 20,
            seeds: ['note-2'],
          },
          similarityScore: 0.92,
          sharedRelations: 18,
          evidenceReasons: ['Very high similarity'],
        },
      ];

      vi.mocked(query).mockResolvedValue({ identityCandidates: mockCandidates });

      renderHook(() => useIdentityReview('test-project', 0.9));

      await waitFor(() => {
        expect(query).toHaveBeenCalledWith(
          expect.stringContaining('identityCandidates'),
          expect.objectContaining({ minSimilarity: 0.9 })
        );
      });
    });

    it('should limit number of candidates', async () => {
      const mockCandidates: IdentityCandidate[] = [];
      for (let i = 0; i < 25; i++) {
        mockCandidates.push({
          id: `candidate-${i}`,
          entity1: {
            id: `entity-${i}-1`,
            name: `Entity ${i}-1`,
            category: 'PERSON',
            confidence: 0.9,
            relationCount: 10,
            seeds: ['note-1'],
          },
          entity2: {
            id: `entity-${i}-2`,
            name: `Entity ${i}-2`,
            category: 'PERSON',
            confidence: 0.9,
            relationCount: 10,
            seeds: ['note-2'],
          },
          similarityScore: 0.8,
          sharedRelations: 5,
          evidenceReasons: ['Match'],
        });
      }

      vi.mocked(query).mockResolvedValue({ identityCandidates: mockCandidates });

      renderHook(() => useIdentityReview('test-project', 0.7, 25));

      await waitFor(() => {
        expect(query).toHaveBeenCalledWith(
          expect.stringContaining('identityCandidates'),
          expect.objectContaining({ limit: 25 })
        );
      });
    });

    it('should reload candidates on demand', async () => {
      const candidates1: IdentityCandidate[] = [
        {
          id: 'candidate-1',
          entity1: {
            id: 'entity-1',
            name: 'Test 1',
            category: 'PERSON',
            confidence: 0.9,
            relationCount: 10,
            seeds: ['note-1'],
          },
          entity2: {
            id: 'entity-2',
            name: 'Test 2',
            category: 'PERSON',
            confidence: 0.9,
            relationCount: 10,
            seeds: ['note-2'],
          },
          similarityScore: 0.8,
          sharedRelations: 5,
          evidenceReasons: ['Match 1'],
        },
      ];

      const candidates2: IdentityCandidate[] = [
        {
          id: 'candidate-3',
          entity1: {
            id: 'entity-3',
            name: 'Test 3',
            category: 'PERSON',
            confidence: 0.9,
            relationCount: 10,
            seeds: ['note-3'],
          },
          entity2: {
            id: 'entity-4',
            name: 'Test 4',
            category: 'PERSON',
            confidence: 0.9,
            relationCount: 10,
            seeds: ['note-4'],
          },
          similarityScore: 0.85,
          sharedRelations: 6,
          evidenceReasons: ['Match 2'],
        },
      ];

      vi.mocked(query)
        .mockResolvedValueOnce({ identityCandidates: candidates1 })
        .mockResolvedValueOnce({ identityCandidates: candidates2 });

      const { result } = renderHook(() => useIdentityReview('test-project'));

      await waitFor(() => {
        expect(result.current.candidates.length).toBe(1);
        expect(result.current.candidates[0].id).toBe('candidate-1');
      });

      await act(async () => {
        await result.current.loadCandidates();
      });

      expect(result.current.candidates.length).toBe(1);
      expect(result.current.candidates[0].id).toBe('candidate-3');
    });

    it('should handle empty candidates list', async () => {
      vi.mocked(query).mockResolvedValue({ identityCandidates: [] });

      const { result } = renderHook(() => useIdentityReview('test-project'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.candidates).toEqual([]);
    });
  });
});
