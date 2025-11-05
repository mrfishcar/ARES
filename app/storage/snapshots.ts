/**
 * Versioned Graph Snapshots
 * Create, list, and restore graph snapshots for rollback
 * Sprint R2
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { v4 as uuid } from 'uuid';
import { loadGraph, saveGraph } from './storage';
import { updateHeartbeat } from '../monitor/metrics';

export interface SnapshotInfo {
  id: string;
  bytes: number;
  createdAt: string;
}

/**
 * Get snapshots directory for a project
 */
function getSnapshotsDir(project: string): string {
  return path.join(process.cwd(), 'data', 'projects', project, 'snapshots');
}

/**
 * Create a snapshot of the current graph
 */
export async function createSnapshot(project: string): Promise<{ id: string; path: string }> {
  const projectDir = path.join(process.cwd(), 'data', 'projects', project);
  const graphPath = path.join(projectDir, 'graph.json');

  // Ensure graph exists
  if (!fs.existsSync(graphPath)) {
    throw new Error(`No graph found for project: ${project}`);
  }

  // Load graph
  const graph = loadGraph(graphPath);
  if (!graph) {
    throw new Error(`Failed to load graph for project: ${project}`);
  }

  // Create snapshots directory
  const snapshotsDir = getSnapshotsDir(project);
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }

  // Generate snapshot ID: ISO timestamp + UUID
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const id = `${timestamp}_${uuid()}`;
  const filename = `${id}.graph.json.gz`;
  const snapshotPath = path.join(snapshotsDir, filename);

  // Serialize and compress
  const json = JSON.stringify(graph, null, 2);
  const compressed = zlib.gzipSync(json);

  // Write snapshot
  fs.writeFileSync(snapshotPath, compressed);

  return { id, path: snapshotPath };
}

/**
 * List all snapshots for a project
 */
export async function listSnapshots(project: string): Promise<SnapshotInfo[]> {
  const snapshotsDir = getSnapshotsDir(project);

  if (!fs.existsSync(snapshotsDir)) {
    return [];
  }

  const files = fs.readdirSync(snapshotsDir);
  const snapshots: SnapshotInfo[] = [];

  for (const file of files) {
    if (!file.endsWith('.graph.json.gz')) {
      continue;
    }

    const filePath = path.join(snapshotsDir, file);
    const stats = fs.statSync(filePath);

    // Extract ID from filename (remove .graph.json.gz extension)
    const id = file.replace('.graph.json.gz', '');

    // Parse timestamp from ID (format: YYYY-MM-DDTHH-MM-SS-sssZ_uuid)
    const timestampPart = id.split('_')[0];
    // Convert YYYY-MM-DDTHH-MM-SS-sssZ back to ISO format
    // Replace hyphens with colons in time portion (after the date)
    const dateTimeParts = timestampPart.split('T');
    if (dateTimeParts.length === 2) {
      const datePart = dateTimeParts[0]; // YYYY-MM-DD
      const timePart = dateTimeParts[1]; // HH-MM-SS-sssZ
      // Convert HH-MM-SS-sssZ to HH:MM:SS.sssZ
      const timeConverted = timePart
        .replace(/^(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1:$2:$3.$4Z');
      var createdAt = `${datePart}T${timeConverted}`;
    } else {
      var createdAt = timestampPart; // Fallback
    }

    snapshots.push({
      id,
      bytes: stats.size,
      createdAt
    });
  }

  // Sort by creation date (newest first)
  snapshots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return snapshots;
}

/**
 * Restore a snapshot
 */
export async function restoreSnapshot(project: string, id: string): Promise<void> {
  const projectDir = path.join(process.cwd(), 'data', 'projects', project);
  const graphPath = path.join(projectDir, 'graph.json');
  const snapshotsDir = getSnapshotsDir(project);
  const snapshotPath = path.join(snapshotsDir, `${id}.graph.json.gz`);

  // Ensure snapshot exists
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Snapshot not found: ${id}`);
  }

  // Read and decompress snapshot
  const compressed = fs.readFileSync(snapshotPath);
  const json = zlib.gunzipSync(compressed).toString('utf-8');
  const parsed = JSON.parse(json);

  // Safety check: validate graph structure
  if (!parsed || !parsed.entities || !parsed.relations || !parsed.metadata) {
    throw new Error(`Invalid snapshot: ${id} (missing required fields)`);
  }

  // Reconstruct Map from object (JSON serializes Maps as objects)
  const graph = {
    ...parsed,
    provenance: new Map(Object.entries(parsed.provenance || {}))
  };

  // Create backup of current graph before restoring
  const backupPath = path.join(projectDir, `graph.json.backup.${Date.now()}`);
  if (fs.existsSync(graphPath)) {
    fs.copyFileSync(graphPath, backupPath);
  }

  try {
    // Restore snapshot
    saveGraph(graph, graphPath);

    // Update heartbeat to notify UI
    updateHeartbeat();

    // Clean up backup on success
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
  } catch (error) {
    // Restore from backup on failure
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, graphPath);
      fs.unlinkSync(backupPath);
    }
    throw error;
  }
}
