/**
 * Integration Tests - Graph Operations API (Sprint R4)
 * Coverage: snapshots, exports, concurrency, security
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGraphQLServer } from '../../app/api/graphql';
import { saveGraph, createEmptyGraph } from '../../app/storage/storage';
import * as fs from 'fs';
import * as path from 'path';

const TEST_PROJECT = 'test-graph-ops';
const TEST_GRAPH_PATH = path.join(process.cwd(), 'data', 'projects', TEST_PROJECT, 'graph.json');
const SNAPSHOTS_DIR = path.join(process.cwd(), 'data', 'projects', TEST_PROJECT, 'snapshots');
const OUT_DIR = path.join(process.cwd(), 'out');

/**
 * Create test graph fixture
 */
function createTestGraph() {
  const graph = createEmptyGraph();

  // Create 10 entities
  for (let i = 0; i < 10; i++) {
    graph.entities.push({
      id: `entity-${i}`,
      type: 'PERSON',
      canonical: `Person${i}`,
      aliases: [],
      created_at: new Date().toISOString(),
      evidence: []
    });
  }

  // Create 5 relations
  for (let i = 0; i < 5; i++) {
    graph.relations.push({
      subj: `entity-${i}`,
      pred: 'knows',
      obj: `entity-${i + 1}`,
      confidence: 0.9,
      evidence: []
    });
  }

  return graph;
}

/**
 * Clean up directories
 */
function cleanup() {
  // Remove test graph
  if (fs.existsSync(TEST_GRAPH_PATH)) {
    fs.unlinkSync(TEST_GRAPH_PATH);
  }

  // Remove snapshots directory
  if (fs.existsSync(SNAPSHOTS_DIR)) {
    const files = fs.readdirSync(SNAPSHOTS_DIR);
    files.forEach(file => {
      fs.unlinkSync(path.join(SNAPSHOTS_DIR, file));
    });
    fs.rmdirSync(SNAPSHOTS_DIR);
  }

  // Remove project directory if empty
  const projectDir = path.dirname(TEST_GRAPH_PATH);
  if (fs.existsSync(projectDir)) {
    try {
      fs.rmdirSync(projectDir);
    } catch (e) {
      // Directory not empty, that's fine
    }
  }

  // Clean up out/ directory (remove test exports)
  if (fs.existsSync(OUT_DIR)) {
    const files = fs.readdirSync(OUT_DIR);
    files.forEach(file => {
      if (file.startsWith(TEST_PROJECT)) {
        fs.unlinkSync(path.join(OUT_DIR, file));
      }
    });
  }
}

describe('Graph Operations API - Integration Tests', () => {
  let server: any;

  beforeEach(() => {
    cleanup();

    // Ensure directories exist
    const projectDir = path.dirname(TEST_GRAPH_PATH);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // Create and save test graph
    const graph = createTestGraph();
    saveGraph(graph, TEST_GRAPH_PATH);

    // Create server
    server = createGraphQLServer(TEST_GRAPH_PATH);
  });

  afterEach(() => {
    cleanup();
  });

  describe('Snapshot Lifecycle', () => {
    it('should create a snapshot', async () => {
      const result = await server.executeOperation({
        query: `
          mutation {
            createSnapshot(project: "${TEST_PROJECT}") {
              id
              createdAt
              bytes
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeUndefined();
        const data = result.body.singleResult.data;

        expect(data?.createSnapshot.id).toBeTruthy();
        expect(data?.createSnapshot.createdAt).toBeTruthy();
        expect(data?.createSnapshot.bytes).toBeGreaterThan(0);

        // Verify snapshot file exists (with correct extension)
        const snapshotPath = path.join(SNAPSHOTS_DIR, `${data?.createSnapshot.id}.graph.json.gz`);
        expect(fs.existsSync(snapshotPath)).toBe(true);
      }
    });

    it('should list snapshots', async () => {
      // Create 2 snapshots
      await server.executeOperation({
        query: `mutation { createSnapshot(project: "${TEST_PROJECT}") { id } }`
      });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      await server.executeOperation({
        query: `mutation { createSnapshot(project: "${TEST_PROJECT}") { id } }`
      });

      // List snapshots
      const result = await server.executeOperation({
        query: `
          query {
            listSnapshots(project: "${TEST_PROJECT}") {
              id
              createdAt
              bytes
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeUndefined();
        const data = result.body.singleResult.data;

        expect(data?.listSnapshots.length).toBe(2);
        expect(data?.listSnapshots[0].id).toBeTruthy();
        expect(data?.listSnapshots[1].id).toBeTruthy();

        // Should be sorted by timestamp (newest first)
        const ts1 = new Date(data?.listSnapshots[0].createdAt).getTime();
        const ts2 = new Date(data?.listSnapshots[1].createdAt).getTime();
        expect(ts1).toBeGreaterThanOrEqual(ts2);
      }
    });

    it('should restore a snapshot', async () => {
      // Create initial snapshot
      const createResult = await server.executeOperation({
        query: `mutation { createSnapshot(project: "${TEST_PROJECT}") { id } }`
      });

      expect(createResult.body.kind).toBe('single');
      if (createResult.body.kind === 'single') {
        const snapshotId = createResult.body.singleResult.data?.createSnapshot.id;

        // Modify the graph
        const graph = createTestGraph();
        graph.entities.push({
          id: 'new-entity',
          type: 'PERSON',
          canonical: 'NewPerson',
          aliases: [],
          created_at: new Date().toISOString(),
          evidence: []
        });
        saveGraph(graph, TEST_GRAPH_PATH);

        // Verify graph has 11 entities now
        const modifiedGraph = JSON.parse(fs.readFileSync(TEST_GRAPH_PATH, 'utf-8'));
        expect(modifiedGraph.entities.length).toBe(11);

        // Restore snapshot
        const restoreResult = await server.executeOperation({
          query: `
            mutation {
              restoreSnapshot(project: "${TEST_PROJECT}", id: "${snapshotId}")
            }
          `
        });

        expect(restoreResult.body.kind).toBe('single');
        if (restoreResult.body.kind === 'single') {
          expect(restoreResult.body.singleResult.errors).toBeUndefined();
          expect(restoreResult.body.singleResult.data?.restoreSnapshot).toBe(true);

          // Verify graph is restored to 10 entities
          const restoredGraph = JSON.parse(fs.readFileSync(TEST_GRAPH_PATH, 'utf-8'));
          expect(restoredGraph.entities.length).toBe(10);
        }
      }
    });

    it('should handle nonexistent snapshot gracefully', async () => {
      const result = await server.executeOperation({
        query: `
          mutation {
            restoreSnapshot(project: "${TEST_PROJECT}", id: "nonexistent-snapshot")
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeDefined();
        expect(result.body.singleResult.errors?.[0].message).toContain('Failed to restore snapshot');
      }
    });
  });

  describe('Export Functionality', () => {
    it('should export to GraphML format', async () => {
      const result = await server.executeOperation({
        query: `
          mutation {
            exportGraph(project: "${TEST_PROJECT}", format: "graphml") {
              format
              path
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeUndefined();
        const data = result.body.singleResult.data;

        expect(data?.exportGraph.format).toBe('graphml');
        expect(data?.exportGraph.path).toContain('.graphml');

        // Verify file exists
        const exportPath = data?.exportGraph.path;
        expect(fs.existsSync(exportPath)).toBe(true);

        // Verify file content is GraphML
        const content = fs.readFileSync(exportPath, 'utf-8');
        expect(content).toContain('<?xml version="1.0"');
        expect(content).toContain('<graphml');
        expect(content).toContain('<node');
        expect(content).toContain('<edge');
      }
    });

    it('should export to Cypher format', async () => {
      const result = await server.executeOperation({
        query: `
          mutation {
            exportGraph(project: "${TEST_PROJECT}", format: "cypher") {
              format
              path
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeUndefined();
        const data = result.body.singleResult.data;

        expect(data?.exportGraph.format).toBe('cypher');
        expect(data?.exportGraph.path).toContain('.cypher');

        // Verify file exists
        const exportPath = data?.exportGraph.path;
        expect(fs.existsSync(exportPath)).toBe(true);

        // Verify file content is Cypher
        const content = fs.readFileSync(exportPath, 'utf-8');
        expect(content).toContain('MERGE');
        expect(content).toMatch(/\(.*:Entity/); // Entity nodes with :Entity label
        expect(content).toMatch(/type: "PERSON"/); // Entity with PERSON type
        expect(content).toMatch(/-\[:KNOWS/); // Relationships (uppercase)
      }
    });

    it('should reject unsupported export format', async () => {
      const result = await server.executeOperation({
        query: `
          mutation {
            exportGraph(project: "${TEST_PROJECT}", format: "invalid-format") {
              format
              path
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeDefined();
        expect(result.body.singleResult.errors?.[0].message).toContain('Unsupported format');
      }
    });

    it('should write exports to out/ directory', async () => {
      const result = await server.executeOperation({
        query: `
          mutation {
            exportGraph(project: "${TEST_PROJECT}", format: "graphml") {
              path
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        const exportPath = result.body.singleResult.data?.exportGraph.path;

        // Verify path is within out/ directory
        expect(exportPath).toContain(OUT_DIR);
        expect(path.dirname(exportPath)).toBe(OUT_DIR);
      }
    });
  });

  describe('Concurrency', () => {
    it('should handle concurrent snapshot creation', async () => {
      // Create multiple snapshots concurrently
      const promises = [
        server.executeOperation({
          query: `mutation { createSnapshot(project: "${TEST_PROJECT}") { id } }`
        }),
        server.executeOperation({
          query: `mutation { createSnapshot(project: "${TEST_PROJECT}") { id } }`
        }),
        server.executeOperation({
          query: `mutation { createSnapshot(project: "${TEST_PROJECT}") { id } }`
        })
      ];

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(result => {
        expect(result.body.kind).toBe('single');
        if (result.body.kind === 'single') {
          expect(result.body.singleResult.errors).toBeUndefined();
          expect(result.body.singleResult.data?.createSnapshot.id).toBeTruthy();
        }
      });

      // Verify all snapshots have unique IDs
      const ids = results.map(r =>
        r.body.kind === 'single' ? r.body.singleResult.data?.createSnapshot.id : null
      ).filter(Boolean);

      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it('should handle concurrent exports', async () => {
      // Create multiple exports concurrently
      const promises = [
        server.executeOperation({
          query: `mutation { exportGraph(project: "${TEST_PROJECT}", format: "graphml") { path } }`
        }),
        server.executeOperation({
          query: `mutation { exportGraph(project: "${TEST_PROJECT}", format: "cypher") { path } }`
        })
      ];

      const results = await Promise.all(promises);

      // Both should succeed
      results.forEach(result => {
        expect(result.body.kind).toBe('single');
        if (result.body.kind === 'single') {
          expect(result.body.singleResult.errors).toBeUndefined();
          expect(result.body.singleResult.data?.exportGraph.path).toBeTruthy();
        }
      });

      // Verify both files exist
      results.forEach(result => {
        if (result.body.kind === 'single') {
          const exportPath = result.body.singleResult.data?.exportGraph.path;
          expect(fs.existsSync(exportPath)).toBe(true);
        }
      });
    });
  });
});
