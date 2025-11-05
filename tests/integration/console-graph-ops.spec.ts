/**
 * Console Graph Operations Tests - Sprint R5
 * Integration tests for snapshots and exports
 *
 * NOTE: These tests require the GraphQL server to be running on port 4000
 *       Run: make server-graphql (in separate terminal)
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { query, mutate } from '../../app/ui/console/src/lib/api';

const LIST_SNAPSHOTS_QUERY = `
  query ListSnapshots($project: String!) {
    listSnapshots(project: $project) {
      id
      timestamp
    }
  }
`;

const CREATE_SNAPSHOT_MUTATION = `
  mutation CreateSnapshot($project: String!) {
    createSnapshot(project: $project) {
      id
      timestamp
    }
  }
`;

const RESTORE_SNAPSHOT_MUTATION = `
  mutation RestoreSnapshot($project: String!, $id: String!) {
    restoreSnapshot(project: $project, id: $id)
  }
`;

const EXPORT_GRAPH_MUTATION = `
  mutation ExportGraph($project: String!, $format: String!) {
    exportGraph(project: $project, format: $format) {
      path
    }
  }
`;

describe.skip('Console - Snapshots', () => {
  it('should list snapshots', async () => {
    const result = await query<any>(LIST_SNAPSHOTS_QUERY, { project: 'test' });

    expect(result.listSnapshots).toBeInstanceOf(Array);
    result.listSnapshots.forEach((snapshot: any) => {
      expect(snapshot.id).toBeTruthy();
      expect(typeof snapshot.timestamp).toBe('number');
    });
  });

  it('should create a snapshot', async () => {
    const result = await mutate<any>(CREATE_SNAPSHOT_MUTATION, { project: 'test' });

    expect(result.createSnapshot).toBeDefined();
    expect(result.createSnapshot.id).toBeTruthy();
    expect(typeof result.createSnapshot.timestamp).toBe('number');
  });

  it('should restore a snapshot', async () => {
    // First create a snapshot
    const createResult = await mutate<any>(CREATE_SNAPSHOT_MUTATION, { project: 'test' });
    const snapshotId = createResult.createSnapshot.id;

    // Then restore it
    const restoreResult = await mutate<any>(RESTORE_SNAPSHOT_MUTATION, {
      project: 'test',
      id: snapshotId,
    });

    expect(restoreResult.restoreSnapshot).toBe(true);
  });

  it('should handle restoring non-existent snapshot', async () => {
    await expect(
      mutate<any>(RESTORE_SNAPSHOT_MUTATION, {
        project: 'test',
        id: 'nonexistent-snapshot-id',
      })
    ).rejects.toThrow();
  });
});

describe.skip('Console - Exports', () => {
  it('should export graph to GraphML format', async () => {
    const result = await mutate<any>(EXPORT_GRAPH_MUTATION, {
      project: 'test',
      format: 'graphml',
    });

    expect(result.exportGraph).toBeDefined();
    expect(result.exportGraph.path).toBeTruthy();
    expect(result.exportGraph.path).toContain('.graphml');
  });

  it('should export graph to Cypher format', async () => {
    const result = await mutate<any>(EXPORT_GRAPH_MUTATION, {
      project: 'test',
      format: 'cypher',
    });

    expect(result.exportGraph).toBeDefined();
    expect(result.exportGraph.path).toBeTruthy();
    expect(result.exportGraph.path).toContain('.cypher');
  });

  it('should handle invalid format', async () => {
    await expect(
      mutate<any>(EXPORT_GRAPH_MUTATION, {
        project: 'test',
        format: 'invalid-format',
      })
    ).rejects.toThrow();
  });
});
