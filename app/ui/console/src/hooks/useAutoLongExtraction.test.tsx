import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useAutoLongExtraction } from './useAutoLongExtraction';

describe('useAutoLongExtraction', () => {
  const THRESHOLD = 10;
  const DEBOUNCE = 1200;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('triggers after idle when text exceeds threshold', () => {
    const startJob = vi.fn();
    const { rerender } = renderHook(
      (props: { text: string }) =>
        useAutoLongExtraction({
          text: props.text,
          threshold: THRESHOLD,
          debounceMs: DEBOUNCE,
          documentVisible: true,
          hasActiveJob: false,
          startJob,
        }),
      { initialProps: { text: 'short' } }
    );

    rerender({ text: 'long content that crosses threshold' });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE * 2);
    });

    expect(startJob).toHaveBeenCalledTimes(1);
  });

  it('does not apply stale jobs after edits (supersedes previous schedule)', () => {
    const startJob = vi.fn();
    const { rerender } = renderHook(
      (props: { text: string }) =>
        useAutoLongExtraction({
          text: props.text,
          threshold: THRESHOLD,
          debounceMs: DEBOUNCE,
          documentVisible: true,
          hasActiveJob: false,
          startJob,
        }),
      { initialProps: { text: 'first long text exceeding' } }
    );

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE / 2);
    });

    rerender({ text: 'updated long text exceeding threshold again' });

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE * 2);
    });

    expect(startJob).toHaveBeenCalledTimes(1);
  });

  it('does not schedule when document is hidden', () => {
    const startJob = vi.fn();
    renderHook(() =>
      useAutoLongExtraction({
        text: 'long hidden text crossing threshold',
        threshold: THRESHOLD,
        debounceMs: DEBOUNCE,
        documentVisible: false,
        hasActiveJob: false,
        startJob,
      })
    );

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE * 2);
    });

    expect(startJob).not.toHaveBeenCalled();
  });
});
