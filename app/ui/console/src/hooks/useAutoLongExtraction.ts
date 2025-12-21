import { useEffect, useRef } from 'react';

export interface AutoLongSchedulerEnv {
  setTimeout: typeof window.setTimeout;
  clearTimeout: typeof window.clearTimeout;
  requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
}

export interface AutoLongSchedulerOptions {
  threshold: number;
  debounceMs: number;
  startJob: (revision: number, textSnapshot: string) => void;
  env: AutoLongSchedulerEnv;
}

export class AutoLongExtractionScheduler {
  private threshold: number;
  private debounceMs: number;
  private startJob: (revision: number, textSnapshot: string) => void;
  private env: AutoLongSchedulerEnv;
  private debounceHandle: number | null = null;
  private idleHandle: number | null = null;
  revisionRef: { current: number };

  constructor(options: AutoLongSchedulerOptions) {
    this.threshold = options.threshold;
    this.debounceMs = options.debounceMs;
    this.startJob = options.startJob;
    this.env = options.env;
    this.revisionRef = { current: 0 };
  }

  notify(text: string, documentVisible: boolean, hasActiveJob: boolean) {
    this.revisionRef.current += 1;
    const revision = this.revisionRef.current;
    const snapshot = text;

    this.clearTimers();

    if (text.length < this.threshold || !documentVisible || hasActiveJob) {
      return;
    }

    this.debounceHandle = this.env.setTimeout(() => {
      if (!documentVisible || hasActiveJob) return;
      const runJob = () => this.startJob(revision, snapshot);

      if (this.env.requestIdleCallback) {
        this.idleHandle = this.env.requestIdleCallback(runJob, { timeout: this.debounceMs });
      } else {
        this.idleHandle = this.env.setTimeout(runJob, this.debounceMs);
      }
    }, this.debounceMs);
  }

  clearTimers() {
    if (this.debounceHandle !== null) {
      this.env.clearTimeout(this.debounceHandle);
      this.debounceHandle = null;
    }
    if (this.idleHandle !== null) {
      if (this.env.cancelIdleCallback) {
        this.env.cancelIdleCallback(this.idleHandle);
      } else {
        this.env.clearTimeout(this.idleHandle);
      }
      this.idleHandle = null;
    }
  }
}

interface UseAutoLongExtractionOptions {
  text: string;
  threshold: number;
  debounceMs: number;
  documentVisible: boolean;
  hasActiveJob: boolean;
  startJob: (revision: number, textSnapshot: string) => void;
}

export function useAutoLongExtraction({
  text,
  threshold,
  debounceMs,
  documentVisible,
  hasActiveJob,
  startJob,
}: UseAutoLongExtractionOptions) {
  const schedulerRef = useRef<AutoLongExtractionScheduler | null>(null);

  if (!schedulerRef.current) {
    schedulerRef.current = new AutoLongExtractionScheduler({
      threshold,
      debounceMs,
      startJob,
      env: {
        setTimeout: window.setTimeout.bind(window),
        clearTimeout: window.clearTimeout.bind(window),
        requestIdleCallback: (window as any).requestIdleCallback,
        cancelIdleCallback: (window as any).cancelIdleCallback,
      },
    });
  }

  useEffect(() => {
    schedulerRef.current?.notify(text, documentVisible, hasActiveJob);
    return () => schedulerRef.current?.clearTimers();
  }, [text, documentVisible, hasActiveJob]);

  return { revisionRef: schedulerRef.current.revisionRef };
}
