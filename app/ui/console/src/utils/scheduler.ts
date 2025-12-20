type IdleDeadline = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type IdleHandle = number;

const fallbackRequestIdleCallback = (cb: (deadline: IdleDeadline) => void): IdleHandle =>
  setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 16 }), 0);

const fallbackCancelIdleCallback = (id: IdleHandle) => {
  clearTimeout(id as unknown as number);
};

export function requestIdleChunk<T>(
  getItems: () => T[],
  opts: {
    initialIndex?: number;
    chunkSize: number;
    maxChunkDurationMs: number;
    onChunk: (items: T[]) => void;
    onComplete?: () => void;
  }
): () => void {
  const items = getItems();
  let index = opts.initialIndex ?? 0;
  let cancelled = false;

  const hasWindow = typeof window !== 'undefined';
  const schedule =
    hasWindow && 'requestIdleCallback' in window
      ? window.requestIdleCallback.bind(window)
      : fallbackRequestIdleCallback;
  const cancel =
    hasWindow && 'cancelIdleCallback' in window
      ? window.cancelIdleCallback.bind(window)
      : fallbackCancelIdleCallback;

  let handle: IdleHandle | null = null;

  const run = (deadline: IdleDeadline) => {
    const start = performance.now();
    while (
      index < items.length &&
      (deadline.timeRemaining() > 1 || performance.now() - start < opts.maxChunkDurationMs)
    ) {
      const next = Math.min(items.length, index + opts.chunkSize);
      opts.onChunk(items.slice(index, next));
      index = next;
    }

    if (cancelled) return;

    if (index < items.length) {
      handle = schedule(run);
    } else {
      opts.onComplete?.();
    }
  };

  handle = schedule(run);

  return () => {
    cancelled = true;
    if (handle != null) {
      cancel(handle);
    }
  };
}
