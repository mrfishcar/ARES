/**
 * Prometheus metrics
 */

import { Registry, Counter, Histogram } from 'prom-client';

export const register = new Registry();

export const ingestTotal = new Counter({
  name: 'ares_ingest_total',
  help: 'Documents ingested',
  registers: [register]
});

export const extractLatencyMs = new Histogram({
  name: 'ares_extract_latency_ms',
  help: 'Extraction latency in milliseconds',
  buckets: [10, 50, 100, 200, 500, 1000, 2000],
  registers: [register]
});

export const pageGenLatencyMs = new Histogram({
  name: 'ares_pagegen_latency_ms',
  help: 'Page generation latency in milliseconds',
  buckets: [5, 20, 50, 100, 200, 500, 1000],
  registers: [register]
});

export function metricsHandler(req: any, res: any): void {
  res.setHeader('Content-Type', register.contentType);
  register.metrics().then(metrics => {
    res.end(metrics);
  });
}
