/**
 * Graph Operations Resolvers - Sprint R4
 * Snapshots and exports via GraphQL
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  createSnapshot as createSnapshotUtil,
  listSnapshots as listSnapshotsUtil,
  restoreSnapshot as restoreSnapshotUtil
} from '../../storage/snapshots';
import { loadGraph } from '../../storage/storage';
import { exportGraphML } from '../../export/graphml';
import { exportCypher } from '../../export/cypher';

interface CreateSnapshotArgs {
  project: string;
}

interface ListSnapshotsArgs {
  project: string;
}

interface RestoreSnapshotArgs {
  project: string;
  id: string;
}

interface ExportGraphArgs {
  project: string;
  format: string;
}

/**
 * Ensure output directory exists
 */
function ensureOutDir(): string {
  const outDir = path.join(process.cwd(), 'out');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  return outDir;
}

export const graphOpsResolvers = {
  Query: {
    /**
     * List all snapshots for a project
     */
    listSnapshots: async (_: any, args: ListSnapshotsArgs) => {
      const { project } = args;

      const snapshots = await listSnapshotsUtil(project);

      return snapshots.map(snapshot => ({
        id: snapshot.id,
        createdAt: snapshot.createdAt,
        bytes: snapshot.bytes
      }));
    }
  },

  Mutation: {
    /**
     * Create a new snapshot
     */
    createSnapshot: async (_: any, args: CreateSnapshotArgs) => {
      const { project } = args;

      const result = await createSnapshotUtil(project);

      // Get file size
      const stats = fs.statSync(result.path);

      return {
        id: result.id,
        createdAt: new Date().toISOString(),
        bytes: stats.size
      };
    },

    /**
     * Restore a snapshot
     */
    restoreSnapshot: async (_: any, args: RestoreSnapshotArgs) => {
      const { project, id } = args;

      try {
        await restoreSnapshotUtil(project, id);
        return true;
      } catch (error: any) {
        throw new Error(`Failed to restore snapshot: ${error.message}`);
      }
    },

    /**
     * Export graph to external format
     */
    exportGraph: async (_: any, args: ExportGraphArgs) => {
      const { project, format } = args;

      // Validate format
      if (format !== 'graphml' && format !== 'cypher') {
        throw new Error(`Unsupported format: ${format}. Use 'graphml' or 'cypher'.`);
      }

      // Load graph
      const graphPath = path.join(process.cwd(), 'data', 'projects', project, 'graph.json');
      const graph = loadGraph(graphPath);

      if (!graph) {
        throw new Error(`Graph not found for project: ${project}`);
      }

      // Ensure output directory
      const outDir = ensureOutDir();

      // Generate output path
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${project}-${timestamp}.${format === 'graphml' ? 'graphml' : 'cypher'}`;
      const outputPath = path.join(outDir, filename);

      // Export
      if (format === 'graphml') {
        exportGraphML(graph, outputPath);
      } else {
        exportCypher(graph, outputPath);
      }

      return {
        format,
        path: outputPath
      };
    }
  }
};
