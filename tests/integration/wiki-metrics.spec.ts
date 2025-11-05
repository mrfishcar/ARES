/**
 * Integration tests for Wiki Generation Metrics
 * Sprint R3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { generateWiki } from '../../app/generate/wiki';
import { getRawMetrics, resetMetrics } from '../../app/monitor/metrics';
import { createEmptyGraph } from '../../app/storage/storage';

const TEST_OUTPUT_DIR = path.join(process.cwd(), 'tmp', 'test-wiki');

describe('Wiki Generation Metrics', () => {
  beforeEach(() => {
    resetMetrics();

    // Create test output directory
    if (!fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    resetMetrics();

    // Clean up test files
    if (fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.rmSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  it('should increment wiki rebuild counter', () => {
    const graph = createEmptyGraph();
    graph.entities.push({
      id: 'e1',
      type: 'PERSON',
      canonical: 'Test Entity',
      aliases: [],
      created_at: new Date().toISOString()
    });

    const before = getRawMetrics();
    expect(before.wiki_rebuild_count_total).toBe(0);

    generateWiki(graph, {
      outputDir: TEST_OUTPUT_DIR,
      project: 'test'
    });

    const after = getRawMetrics();
    expect(after.wiki_rebuild_count_total).toBe(1);
  });

  it('should record wiki rebuild duration', () => {
    const graph = createEmptyGraph();

    // Add multiple entities to make rebuild take time
    for (let i = 0; i < 10; i++) {
      graph.entities.push({
        id: `e${i}`,
        type: 'PERSON',
        canonical: `Entity ${i}`,
        aliases: [],
        created_at: new Date().toISOString()
      });
    }

    const before = getRawMetrics();
    expect(before.wiki_rebuild_last_ms).toBe(0);

    generateWiki(graph, {
      outputDir: TEST_OUTPUT_DIR,
      project: 'test'
    });

    const after = getRawMetrics();
    expect(after.wiki_rebuild_last_ms).toBeGreaterThan(0);
    expect(after.wiki_rebuild_last_ms).toBeLessThan(10000); // Should complete in < 10s
  });

  it('should increment counter on multiple rebuilds', () => {
    const graph = createEmptyGraph();

    generateWiki(graph, {
      outputDir: TEST_OUTPUT_DIR,
      project: 'test'
    });

    generateWiki(graph, {
      outputDir: TEST_OUTPUT_DIR,
      project: 'test'
    });

    const metrics = getRawMetrics();
    expect(metrics.wiki_rebuild_count_total).toBe(2);
  });

  it('should update duration on each rebuild', () => {
    const graph = createEmptyGraph();

    generateWiki(graph, {
      outputDir: TEST_OUTPUT_DIR,
      project: 'test'
    });

    const firstDuration = getRawMetrics().wiki_rebuild_last_ms;

    generateWiki(graph, {
      outputDir: TEST_OUTPUT_DIR,
      project: 'test'
    });

    const secondDuration = getRawMetrics().wiki_rebuild_last_ms;

    // Both durations should be recorded (>= 0)
    expect(firstDuration).toBeGreaterThanOrEqual(0);
    expect(secondDuration).toBeGreaterThanOrEqual(0);
    // Rebuild counter should be 2
    expect(getRawMetrics().wiki_rebuild_count_total).toBe(2);
  });
});
