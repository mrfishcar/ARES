import { perfBudgets, type PerfCheckResult, type PerfStat } from './perfBudgets';

export type LongTaskSample = { start: number; duration: number };

export function computeStats(samples: number[]): PerfStat {
  if (!samples.length) return { p50: 0, p95: 0, p99: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  return {
    p50: pick(0.5),
    p95: pick(0.95),
    p99: pick(0.99),
  };
}

export function nextPaint(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

export async function measureInteraction(name: string, action: () => void | Promise<void>): Promise<number> {
  const start = performance.now();
  await action();
  await nextPaint();
  return performance.now() - start;
}

export function observeLongTasks(label: string, samples: LongTaskSample[]) {
  if (typeof PerformanceObserver === 'undefined') return () => {};
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'longtask') {
        samples.push({ start: entry.startTime, duration: entry.duration });
      }
    }
  });
  observer.observe({ type: 'longtask', buffered: true });
  return () => observer.disconnect();
}

export async function sampleFPS(durationMs: number): Promise<{ frames: number; expected: number }> {
  return new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = () => {
      frames += 1;
      if (performance.now() - start < durationMs) {
        requestAnimationFrame(tick);
      } else {
        const expected = durationMs / (1000 / 60);
        resolve({ frames, expected });
      }
    };
    requestAnimationFrame(tick);
  });
}

export function summarizeCheck(label: string, stats: PerfStat, budget: number): PerfCheckResult {
  return {
    label,
    stats,
    budget,
    pass: stats.p95 <= budget,
  };
}

export function reportResults(results: PerfCheckResult[], longTasks: LongTaskSample[]) {
  // eslint-disable-next-line no-console
  console.group('[PerfGauntlet] Results');
  results.forEach((result) => {
    // eslint-disable-next-line no-console
    console.log(
      `${result.label}: p50=${result.stats.p50.toFixed(1)}ms p95=${result.stats.p95.toFixed(
        1
      )}ms p99=${result.stats.p99.toFixed(1)}ms | budget ${result.budget}ms -> ${
        result.pass ? 'PASS' : 'FAIL'
      }`
    );
  });

  const offendingLongTasks = longTasks.filter((t) => t.duration > perfBudgets.longTaskBudget);
  if (offendingLongTasks.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `[PerfGauntlet] Long tasks over ${perfBudgets.longTaskBudget}ms`,
      offendingLongTasks.slice(0, 5)
    );
  } else {
    // eslint-disable-next-line no-console
    console.log('[PerfGauntlet] No long tasks over budget');
  }
  // eslint-disable-next-line no-console
  console.groupEnd();
}
