/**
 * Integration tests for Snapshot System
 * Sprint R3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createSnapshot, listSnapshots, restoreSnapshot } from '../../app/storage/snapshots';
import { loadGraph, saveGraph, createEmptyGraph } from '../../app/storage/storage';

const TEST_PROJECT = 'test-snapshots';
const TEST_PROJECT_DIR = path.join(process.cwd(), 'data', 'projects', TEST_PROJECT);
const TEST_GRAPH_PATH = path.join(TEST_PROJECT_DIR, 'graph.json');
const TEST_SNAPSHOTS_DIR = path.join(TEST_PROJECT_DIR, 'snapshots');

describe('Snapshot System Integration', () => {
  beforeEach(() => {
    // Create test project with initial graph
    if (!fs.existsSync(TEST_PROJECT_DIR)) {
      fs.mkdirSync(TEST_PROJECT_DIR, { recursive: true });
    }

    const initialGraph = createEmptyGraph();
    initialGraph.entities.push({
      id: 'e1',
      type: 'PERSON',
      canonical: 'Test Entity',
      aliases: ['TE'],
      created_at: new Date().toISOString()
    });

    // Ensure provenance is properly initialized
    if (!initialGraph.provenance) {
      initialGraph.provenance = new Map();
    }

    saveGraph(initialGraph, TEST_GRAPH_PATH);
  });

  afterEach(() => {
    // Clean up test data
    if (fs.existsSync(TEST_PROJECT_DIR)) {
      fs.rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
  });

  it('should create a snapshot successfully', async () => {
    const { id, path: snapshotPath } = await createSnapshot(TEST_PROJECT);

    expect(id).toBeTruthy();
    expect(fs.existsSync(snapshotPath)).toBe(true);
    expect(snapshotPath).toContain('.graph.json.gz');
  });

  it('should list snapshots', async () => {
    // Create two snapshots
    await createSnapshot(TEST_PROJECT);

    // Wait 10ms to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    await createSnapshot(TEST_PROJECT);

    const snapshots = await listSnapshots(TEST_PROJECT);

    expect(snapshots.length).toBe(2);
    expect(snapshots[0].id).toBeTruthy();
    expect(snapshots[0].bytes).toBeGreaterThan(0);
    expect(snapshots[0].createdAt).toBeTruthy();

    // Should be sorted newest first
    const date1 = new Date(snapshots[0].createdAt).getTime();
    const date2 = new Date(snapshots[1].createdAt).getTime();
    expect(date1).toBeGreaterThanOrEqual(date2);
  });

  it('should restore snapshot correctly', async () => {
    // Create initial snapshot
    const { id: snapshotId } = await createSnapshot(TEST_PROJECT);

    // Verify initial state
    const beforeGraph = loadGraph(TEST_GRAPH_PATH);
    expect(beforeGraph?.entities.length).toBe(1);
    expect(beforeGraph?.entities[0].canonical).toBe('Test Entity');

    // Mutate graph
    const mutatedGraph = loadGraph(TEST_GRAPH_PATH)!;
    mutatedGraph.entities.push({
      id: 'e2',
      type: 'PERSON',
      canonical: 'New Entity',
      aliases: [],
      created_at: new Date().toISOString()
    });
    saveGraph(mutatedGraph, TEST_GRAPH_PATH);

    // Verify mutation
    const afterMutation = loadGraph(TEST_GRAPH_PATH);
    expect(afterMutation?.entities.length).toBe(2);

    // Restore snapshot
    await restoreSnapshot(TEST_PROJECT, snapshotId);

    // Verify restoration
    const afterRestore = loadGraph(TEST_GRAPH_PATH);
    expect(afterRestore?.entities.length).toBe(1);
    expect(afterRestore?.entities[0].canonical).toBe('Test Entity');
  });

  it('should handle snapshot of empty graph', async () => {
    // Create empty graph
    const emptyGraph = createEmptyGraph();
    saveGraph(emptyGraph, TEST_GRAPH_PATH);

    const { id } = await createSnapshot(TEST_PROJECT);

    const snapshots = await listSnapshots(TEST_PROJECT);
    expect(snapshots.length).toBeGreaterThan(0);

    // Should be able to restore empty snapshot
    await restoreSnapshot(TEST_PROJECT, id);

    const restored = loadGraph(TEST_GRAPH_PATH);
    expect(restored?.entities.length).toBe(0);
    expect(restored?.relations.length).toBe(0);
  });

  it('should throw error for non-existent snapshot', async () => {
    await expect(
      restoreSnapshot(TEST_PROJECT, 'non-existent-id')
    ).rejects.toThrow('Snapshot not found');
  });

  it('should throw error for non-existent project', async () => {
    await expect(
      createSnapshot('non-existent-project')
    ).rejects.toThrow('No graph found');
  });
});
