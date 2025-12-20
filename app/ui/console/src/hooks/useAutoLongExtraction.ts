import { useEffect, useRef } from 'react';

interface UseAutoLongExtractionOptions {
  text: string;
  threshold: number;
  debounceMs: number;
  documentVisible: boolean;
  hasActiveJob: boolean;
  startJob: (revision: number) => void;
}

export function useAutoLongExtraction({
  text,
  threshold,
  debounceMs,
  documentVisible,
  hasActiveJob,
  startJob,
}: UseAutoLongExtractionOptions) {
  const revisionRef = useRef(0);
  const debounceHandleRef = useRef<number | null>(null);
  const idleHandleRef = useRef<number | null>(null);

  useEffect(() => {
    revisionRef.current += 1;
    const revision = revisionRef.current;
    const requestIdle = (window as any).requestIdleCallback as
      | ((cb: IdleRequestCallback, opts?: IdleRequestOptions) => number)
      | undefined;
    const cancelIdle = (window as any).cancelIdleCallback as
      | ((handle: number) => void)
      | undefined;

    if (text.length < threshold || !documentVisible || hasActiveJob) {
      if (debounceHandleRef.current !== null) {
        clearTimeout(debounceHandleRef.current);
        debounceHandleRef.current = null;
      }
      if (idleHandleRef.current !== null) {
        if (cancelIdle) {
          cancelIdle(idleHandleRef.current);
        } else {
          clearTimeout(idleHandleRef.current);
        }
        idleHandleRef.current = null;
      }
      return;
    }

    debounceHandleRef.current = window.setTimeout(() => {
      if (!documentVisible || hasActiveJob) return;

      const runJob = () => startJob(revision);
      if (requestIdle) {
        idleHandleRef.current = requestIdle(runJob, { timeout: debounceMs });
      } else {
        idleHandleRef.current = window.setTimeout(runJob, debounceMs);
      }
    }, debounceMs);

    return () => {
      if (debounceHandleRef.current !== null) {
        clearTimeout(debounceHandleRef.current);
        debounceHandleRef.current = null;
      }
      if (idleHandleRef.current !== null) {
        if (cancelIdle) {
          cancelIdle(idleHandleRef.current);
        } else {
          clearTimeout(idleHandleRef.current);
        }
        idleHandleRef.current = null;
      }
    };
  }, [text, threshold, debounceMs, documentVisible, hasActiveJob, startJob]);

  return { revisionRef };
}
