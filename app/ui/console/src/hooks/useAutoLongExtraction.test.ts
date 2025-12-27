import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoLongExtractionScheduler } from './useAutoLongExtraction';

const makeEnv = () => {
  const setTimeoutSpy = vi.fn<(cb: () => void, ms: number) => number>((cb, ms) => window.setTimeout(cb, ms));
  const clearTimeoutSpy = vi.fn(window.clearTimeout);
  return { setTimeout: setTimeoutSpy, clearTimeout: clearTimeoutSpy };
};

describe('AutoLongExtractionScheduler', () => {
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
    const env = makeEnv();
    const scheduler = new AutoLongExtractionScheduler({
      threshold: THRESHOLD,
      debounceMs: DEBOUNCE,
      startJob,
      env,
    });

    scheduler.notify('short', true, false);
    scheduler.notify('long enough content', true, false);
    vi.advanceTimersByTime(DEBOUNCE * 2);

    expect(startJob).toHaveBeenCalledTimes(1);
    expect(startJob).toHaveBeenCalledWith(expect.any(Number), 'long enough content');
  });

  it('does not apply stale jobs after edits (supersedes previous schedule)', () => {
    const startJob = vi.fn();
    const env = makeEnv();
    const scheduler = new AutoLongExtractionScheduler({
      threshold: THRESHOLD,
      debounceMs: DEBOUNCE,
      startJob,
      env,
    });

    scheduler.notify('first long text exceeding', true, false);
    vi.advanceTimersByTime(DEBOUNCE / 2);
    scheduler.notify('updated long text exceeding threshold again', true, false);
    vi.advanceTimersByTime(DEBOUNCE * 2);

    expect(startJob).toHaveBeenCalledTimes(1);
    expect(startJob).toHaveBeenCalledWith(expect.any(Number), 'updated long text exceeding threshold again');
  });

  it('does not schedule when document is hidden', () => {
    const startJob = vi.fn();
    const env = makeEnv();
    const scheduler = new AutoLongExtractionScheduler({
      threshold: THRESHOLD,
      debounceMs: DEBOUNCE,
      startJob,
      env,
    });

    scheduler.notify('long hidden text crossing threshold', false, false);
    vi.advanceTimersByTime(DEBOUNCE * 2);

    expect(startJob).not.toHaveBeenCalled();
  });
});
