const PERF_ENABLED =
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_ARES_PERF === '1' || import.meta.env?.ARES_PERF === '1')) ||
  (typeof process !== 'undefined' && process.env?.ARES_PERF === '1');

export function measureDecorationBuild<T>(
  label: string,
  bytesScanned: number,
  fn: () => T,
): T {
  if (!PERF_ENABLED) {
    return fn();
  }

  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const result = fn();
  const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const duration = end - start;

  // eslint-disable-next-line no-console
  console.debug(`[ARES_PERF] ${label}: ${duration.toFixed(2)}ms (scanned=${bytesScanned})`);
  return result;
}

export function isPerfLoggingEnabled() {
  return PERF_ENABLED;
}
