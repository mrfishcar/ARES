/**
 * Console API Integration Tests - Sprint R5
 * Tests for GraphQL client and API utilities
 *
 * NOTE: These tests require the GraphQL server to be running on port 4000
 *       Run: make server-graphql (in separate terminal)
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query, mutate, fetchWikiFile, fetchMetrics, parseMetrics } from '../../app/ui/console/src/lib/api';

describe.skip('Console API - GraphQL Client', () => {
  it('should execute a simple GraphQL query', async () => {
    const result = await query<any>('{ __typename }', {});
    expect(result).toBeDefined();
    expect(result.__typename).toBe('Query');
  });

  it('should handle GraphQL errors gracefully', async () => {
    await expect(query<any>('{ invalidField }', {})).rejects.toThrow();
  });

  it('should handle HTTP errors gracefully', async () => {
    // Mock a failing endpoint
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' } as Response);

    await expect(query<any>('{ __typename }', {})).rejects.toThrow('HTTP 500');

    global.fetch = originalFetch;
  });

  it('should execute mutations with variables', async () => {
    const CREATE_SNAPSHOT = `
      mutation CreateSnapshot($project: String!) {
        createSnapshot(project: $project) {
          id
          timestamp
        }
      }
    `;

    const result = await mutate<any>(CREATE_SNAPSHOT, { project: 'test' });
    expect(result.createSnapshot).toBeDefined();
    expect(result.createSnapshot.id).toBeTruthy();
  });
});

describe.skip('Console API - HTTP Endpoints', () => {
  it('should fetch wiki files', async () => {
    // This test assumes a wiki file exists in test project
    const content = await fetchWikiFile('test', 'example');
    expect(typeof content).toBe('string');
  });

  it('should handle missing wiki files', async () => {
    await expect(fetchWikiFile('test', 'nonexistent')).rejects.toThrow('Wiki file not found');
  });

  it('should fetch metrics', async () => {
    const metrics = await fetchMetrics();
    expect(typeof metrics).toBe('string');
    expect(metrics.length).toBeGreaterThan(0);
  });

  it('should parse Prometheus metrics', () => {
    const sample = `
# HELP ares_entities_extracted_total Total entities extracted
# TYPE ares_entities_extracted_total counter
ares_entities_extracted_total 42
ares_relations_extracted_total 100
`;
    const parsed = parseMetrics(sample);
    expect(parsed.ares_entities_extracted_total).toBe(42);
    expect(parsed.ares_relations_extracted_total).toBe(100);
  });

  it('should handle empty metrics', () => {
    const parsed = parseMetrics('');
    expect(Object.keys(parsed).length).toBe(0);
  });
});
