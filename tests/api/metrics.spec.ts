/**
 * Metrics and Health Endpoint Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startGraphQLServer } from '../../app/api/graphql';
import { ApolloServer } from '@apollo/server';
import * as http from 'http';

describe('Metrics and Health Endpoints', () => {
  let server: ApolloServer;
  const port = 4001;
  const metricsPort = port + 100;

  beforeAll(async () => {
    server = await startGraphQLServer(port, ':memory:');
  });

  afterAll(async () => {
    await server.stop();
  });

  it('GET /healthz returns 200 ok', async () => {
    const response = await fetch(`http://localhost:${metricsPort}/healthz`);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe('ok');
  });

  it('GET /readyz returns 200 ready', async () => {
    const response = await fetch(`http://localhost:${metricsPort}/readyz`);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe('ready');
  });

  it('GET /metrics returns 200 and contains metric names', async () => {
    const response = await fetch(`http://localhost:${metricsPort}/metrics`);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('ares_ingest_count_total');
    expect(text).toContain('ares_review_approved_total');
    expect(text).toContain('ares_review_dismissed_total');
    expect(text).toContain('ares_wiki_rebuild_count_total');
    expect(text).toContain('ares_heartbeat_last_updated_seconds');
  });
});
