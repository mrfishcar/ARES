#!/usr/bin/env ts-node
/**
 * ARES Wiki CLI
 * Notebook → Wiki pipeline with confidence gating
 */

import * as fs from 'fs';
import * as path from 'path';
import { appendDoc, loadGraph, createEmptyGraph, saveGraph } from '../app/storage/storage';
import { generateWiki } from '../app/generate/wiki';
import {
  loadReviewQueue,
  getPendingReviews,
  approveReviewItem,
  rejectReviewItem,
  getApprovedItems,
  cleanReviewQueue,
  addToReviewQueue,
  DEFAULT_GATES,
  type ReviewItem,
  type ConfidenceGates
} from '../app/storage/review-queue';
import { v4 as uuid } from 'uuid';
import { watch as chokidarWatch } from 'chokidar';
import { exportGraphML } from '../app/export/graphml';
import { exportCypher } from '../app/export/cypher';
import { loadConfig } from '../app/config/load';
import { createSnapshot, listSnapshots, restoreSnapshot } from '../app/storage/snapshots';

const DEFAULT_PROJECT_DIR = path.join(process.cwd(), 'data', 'projects');

function ensureProjectDir(project: string): { graphPath: string; reviewPath: string; projectDir: string } {
  const projectDir = path.join(DEFAULT_PROJECT_DIR, project);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  return {
    graphPath: path.join(projectDir, 'graph.json'),
    reviewPath: path.join(projectDir, 'review.json'),
    projectDir
  };
}

async function cmdIngest(args: string[]) {
  const file = args[0];
  const project = args[1] || 'default';

  if (!file) {
    console.error('Usage: ares-wiki ingest <file.txt> [project]');
    process.exit(1);
  }

  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const { graphPath, reviewPath } = ensureProjectDir(project);
  const text = fs.readFileSync(file, 'utf-8');
  const docId = `doc:${path.basename(file, path.extname(file))}:${Date.now()}`;

  console.log(`\n📥 Ingesting: ${file}`);
  console.log(`   Project: ${project}`);
  console.log(`   Doc ID: ${docId}\n`);

  // Use ARES's existing extraction
  const result = await appendDoc(docId, text, graphPath);

  console.log(`✅ Extraction complete:`);
  console.log(`   Entities: ${result.entities.length}`);
  console.log(`   Relations: ${result.relations.length}`);
  console.log(`   Merged: ${result.mergeCount} entities`);
  console.log(`   Conflicts: ${result.conflicts.length}`);

  // Apply confidence gating
  const gates = DEFAULT_GATES;
  const reviewItems: ReviewItem[] = [];

  // Check relation confidence
  for (const relation of result.relations) {
    const confidence = relation.confidence || 0.0;

    if (confidence < gates.ACCEPT && confidence >= gates.REVIEW) {
      reviewItems.push({
        id: uuid(),
        type: 'relation',
        confidence,
        data: relation,
        docId,
        addedAt: new Date().toISOString(),
        status: 'pending'
      });
    }
  }

  if (reviewItems.length > 0) {
    addToReviewQueue(reviewItems, reviewPath);
    console.log(`\n🟡 ${reviewItems.length} items queued for review (confidence between ${gates.REVIEW} and ${gates.ACCEPT})`);
    console.log(`   Run: ares-wiki review ${project}`);
  }

  console.log(`\n✨ Done! Graph saved to: ${graphPath}\n`);
}

async function cmdRebuild(args: string[]) {
  const project = args[0] || 'default';
  const { graphPath, projectDir } = ensureProjectDir(project);

  if (!fs.existsSync(graphPath)) {
    console.error(`No graph found for project: ${project}`);
    console.error(`Run 'ares-wiki ingest' first to create a graph.`);
    process.exit(1);
  }

  const graph = loadGraph(graphPath);
  if (!graph) {
    console.error(`Failed to load graph from: ${graphPath}`);
    process.exit(1);
  }

  const wikiDir = path.join('wiki', project);
  console.log(`\n📚 Rebuilding wiki for project: ${project}`);
  console.log(`   Input: ${graphPath}`);
  console.log(`   Output: ${wikiDir}\n`);

  generateWiki(graph, {
    outputDir: wikiDir,
    includeProvenance: true,
    includeConfidence: true,
    includeEvidence: true,
    project: project
  });

  console.log(`✨ Wiki generated!`);
  console.log(`   Entities: ${graph.entities.length} pages`);
  console.log(`   Index: ${wikiDir}/INDEX.md`);
  console.log(`   Stats: ${wikiDir}/STATS.md\n`);
}

async function cmdReview(args: string[]) {
  const project = args[0] || 'default';
  const { reviewPath, graphPath } = ensureProjectDir(project);

  const pending = getPendingReviews(reviewPath);

  if (pending.length === 0) {
    console.log(`\n✅ No pending reviews for project: ${project}\n`);
    return;
  }

  console.log(`\n🟡 Review Queue for project: ${project}`);
  console.log(`   ${pending.length} items pending\n`);

  const entities = pending.filter(item => item.type === 'entity');
  const relations = pending.filter(item => item.type === 'relation');

  if (entities.length > 0) {
    console.log(`📦 Entities (${entities.length}):`);
    for (const item of entities.slice(0, 10)) {
      const entity = item.data as any;
      console.log(`   [${item.id.slice(0, 8)}] ${entity.canonical} (confidence: ${item.confidence.toFixed(2)})`);
    }
    if (entities.length > 10) {
      console.log(`   ... and ${entities.length - 10} more`);
    }
    console.log('');
  }

  if (relations.length > 0) {
    const graph = loadGraph(graphPath);
    const entityById = new Map(graph?.entities.map(e => [e.id, e]) || []);

    console.log(`🔗 Relations (${relations.length}):`);
    for (const item of relations.slice(0, 10)) {
      const rel = item.data as any;
      const subjName = entityById.get(rel.subj)?.canonical || rel.subj;
      const objName = entityById.get(rel.obj)?.canonical || rel.obj;
      console.log(`   [${item.id.slice(0, 8)}] ${subjName} --[${rel.pred}]--> ${objName}`);
      console.log(`      confidence: ${item.confidence.toFixed(2)}`);
      if (rel.evidence?.[0]) {
        const evidence = rel.evidence[0].span.text.replace(/\n/g, ' ').slice(0, 80);
        console.log(`      evidence: "${evidence}..."`);
      }
    }
    if (relations.length > 10) {
      console.log(`   ... and ${relations.length - 10} more`);
    }
    console.log('');
  }

  console.log(`To approve/reject items, use:`);
  console.log(`   ares-wiki approve ${project} <item-id>`);
  console.log(`   ares-wiki reject ${project} <item-id> [reason]\n`);
}

async function cmdApprove(args: string[]) {
  const project = args[0] || 'default';
  const itemId = args[1];

  if (!itemId) {
    console.error('Usage: ares-wiki approve <project> <item-id>');
    process.exit(1);
  }

  const { reviewPath, graphPath } = ensureProjectDir(project);
  const item = approveReviewItem(itemId, reviewPath);

  if (!item) {
    console.error(`Item not found: ${itemId}`);
    process.exit(1);
  }

  console.log(`\n✅ Approved item: ${itemId}`);
  console.log(`   Type: ${item.type}`);
  console.log(`   Confidence: ${item.confidence.toFixed(2)}`);

  // Add to main graph
  const graph = loadGraph(graphPath) || createEmptyGraph();

  if (item.type === 'entity') {
    graph.entities.push(item.data as any);
  } else if (item.type === 'relation') {
    graph.relations.push(item.data as any);
  }

  saveGraph(graph, graphPath);
  console.log(`   Added to graph: ${graphPath}\n`);
}

async function cmdReject(args: string[]) {
  const project = args[0] || 'default';
  const itemId = args[1];
  const reason = args.slice(2).join(' ');

  if (!itemId) {
    console.error('Usage: ares-wiki reject <project> <item-id> [reason]');
    process.exit(1);
  }

  const { reviewPath } = ensureProjectDir(project);
  const item = rejectReviewItem(itemId, reviewPath, reason);

  if (!item) {
    console.error(`Item not found: ${itemId}`);
    process.exit(1);
  }

  console.log(`\n❌ Rejected item: ${itemId}`);
  console.log(`   Type: ${item.type}`);
  console.log(`   Confidence: ${item.confidence.toFixed(2)}`);
  if (reason) {
    console.log(`   Reason: ${reason}`);
  }
  console.log('');
}

async function cmdClean(args: string[]) {
  const project = args[0] || 'default';
  const { reviewPath } = ensureProjectDir(project);

  cleanReviewQueue(reviewPath);
  console.log(`\n🧹 Cleaned review queue for project: ${project}`);
  console.log(`   Removed all approved/rejected items\n`);
}

async function cmdWatch(args: string[]) {
  const project = args[0];

  if (!project) {
    console.error('Usage: ares-wiki watch <project> [--dir ./incoming] [--interval 3000] [--rebuild-debounce 5000]');
    process.exit(1);
  }

  // Parse flags
  const config = loadConfig();
  let watchDir = config.watch.incomingDir;
  let interval = config.watch.intervalMs;
  let rebuildDebounce = config.watch.rebuildDebounceMs;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) {
      watchDir = args[++i];
    } else if (args[i] === '--interval' && args[i + 1]) {
      interval = parseInt(args[++i], 10);
    } else if (args[i] === '--rebuild-debounce' && args[i + 1]) {
      rebuildDebounce = parseInt(args[++i], 10);
    }
  }

  const { graphPath, reviewPath } = ensureProjectDir(project);
  const processedDir = path.join(watchDir, 'processed');

  // Ensure directories exist
  if (!fs.existsSync(watchDir)) {
    fs.mkdirSync(watchDir, { recursive: true });
  }
  if (!fs.existsSync(processedDir)) {
    fs.mkdirSync(processedDir, { recursive: true });
  }

  console.log(`\n👀 Watching for new documents...`);
  console.log(`   Project: ${project}`);
  console.log(`   Directory: ${watchDir}`);
  console.log(`   Interval: ${interval}ms`);
  console.log(`   Rebuild Debounce: ${rebuildDebounce}ms`);
  console.log(`\n   Press Ctrl+C to stop\n`);

  let rebuildTimer: NodeJS.Timeout | null = null;
  let filesProcessed = 0;

  const scheduleRebuild = () => {
    if (rebuildTimer) {
      clearTimeout(rebuildTimer);
    }
    rebuildTimer = setTimeout(async () => {
      console.log(`\n📚 Rebuilding wiki after processing ${filesProcessed} files...`);
      await cmdRebuild([project]);
      filesProcessed = 0;
    }, rebuildDebounce);
  };

  const watcher = chokidarWatch(watchDir, {
    ignored: [processedDir, /(^|[\/\\])\../],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100
    }
  });

  watcher.on('add', async (filePath: string) => {
    const ext = path.extname(filePath).toLowerCase();

    // Only process .txt and .md files
    if (!['.txt', '.md'].includes(ext)) {
      return;
    }

    console.log(`\n📄 New file detected: ${path.basename(filePath)}`);

    try {
      const text = fs.readFileSync(filePath, 'utf-8');
      const docId = `doc:${path.basename(filePath, ext)}:${Date.now()}`;

      console.log(`   Ingesting as: ${docId}`);

      // Use ARES's existing extraction
      const result = await appendDoc(docId, text, graphPath);

      console.log(`   ✅ Extracted:`);
      console.log(`      Entities: ${result.entities.length}`);
      console.log(`      Relations: ${result.relations.length}`);
      console.log(`      Merged: ${result.mergeCount} entities`);

      // Apply confidence gating
      const gates = DEFAULT_GATES;
      const reviewItems: ReviewItem[] = [];

      for (const relation of result.relations) {
        const confidence = relation.confidence || 0.0;
        if (confidence < gates.ACCEPT && confidence >= gates.REVIEW) {
          reviewItems.push({
            id: uuid(),
            type: 'relation',
            confidence,
            data: relation,
            docId,
            addedAt: new Date().toISOString(),
            status: 'pending'
          });
        }
      }

      if (reviewItems.length > 0) {
        addToReviewQueue(reviewItems, reviewPath);
        console.log(`   🟡 ${reviewItems.length} items queued for review`);
      }

      // Move to processed
      const processedPath = path.join(processedDir, path.basename(filePath));
      fs.renameSync(filePath, processedPath);
      console.log(`   📦 Moved to: ${processedPath}`);

      filesProcessed++;
      scheduleRebuild();
    } catch (error) {
      console.error(`   ❌ Failed to process file: ${error instanceof Error ? error.message : error}`);
    }
  });

  watcher.on('error', (error: Error) => {
    console.error(`\n❌ Watcher error: ${error.message}`);
  });

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n\n👋 Stopping watcher...\n');
    watcher.close();
    process.exit(0);
  });
}

async function cmdExport(args: string[]) {
  const project = args[0];

  if (!project) {
    console.error('Usage: ares-wiki export <project> --format <graphml|cypher> --out <output-file>');
    process.exit(1);
  }

  // Parse flags
  let format: 'graphml' | 'cypher' | undefined;
  let outputPath: string | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--format' && args[i + 1]) {
      const fmt = args[++i].toLowerCase();
      if (fmt === 'graphml' || fmt === 'cypher') {
        format = fmt;
      } else {
        console.error(`Invalid format: ${fmt}. Must be 'graphml' or 'cypher'`);
        process.exit(1);
      }
    } else if (args[i] === '--out' && args[i + 1]) {
      outputPath = args[++i];
    }
  }

  if (!format || !outputPath) {
    console.error('Usage: ares-wiki export <project> --format <graphml|cypher> --out <output-file>');
    process.exit(1);
  }

  const { graphPath } = ensureProjectDir(project);

  if (!fs.existsSync(graphPath)) {
    console.error(`No graph found for project: ${project}`);
    console.error(`Run 'ares-wiki ingest' first to create a graph.`);
    process.exit(1);
  }

  const graph = loadGraph(graphPath);
  if (!graph) {
    console.error(`Failed to load graph from: ${graphPath}`);
    process.exit(1);
  }

  console.log(`\n📤 Exporting graph...`);
  console.log(`   Project: ${project}`);
  console.log(`   Format: ${format.toUpperCase()}`);
  console.log(`   Output: ${outputPath}`);

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    if (format === 'graphml') {
      exportGraphML(graph, outputPath);
    } else if (format === 'cypher') {
      exportCypher(graph, outputPath);
    }

    console.log(`\n✅ Export complete!`);
    console.log(`   Entities: ${graph.entities.length}`);
    console.log(`   Relations: ${graph.relations.length}`);
    console.log(`   File: ${outputPath}\n`);
  } catch (error) {
    console.error(`\n❌ Export failed: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}

async function cmdSnapshot(args: string[]) {
  const project = args[0];

  if (!project) {
    console.error('Usage: ares-wiki snapshot <project>');
    process.exit(1);
  }

  console.log(`\n📸 Creating snapshot...`);
  console.log(`   Project: ${project}`);

  try {
    const { id, path: snapshotPath } = await createSnapshot(project);

    const stats = fs.statSync(snapshotPath);
    const sizeKB = (stats.size / 1024).toFixed(2);

    console.log(`\n✅ Snapshot created!`);
    console.log(`   ID: ${id}`);
    console.log(`   Size: ${sizeKB} KB`);
    console.log(`   Path: ${snapshotPath}\n`);
  } catch (error) {
    console.error(`\n❌ Snapshot failed: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}

async function cmdSnapshots(args: string[]) {
  const project = args[0];

  if (!project) {
    console.error('Usage: ares-wiki snapshots <project>');
    process.exit(1);
  }

  console.log(`\n📸 Snapshots for project: ${project}\n`);

  try {
    const snapshots = await listSnapshots(project);

    if (snapshots.length === 0) {
      console.log('No snapshots found.');
      console.log(`\nCreate one with: ares-wiki snapshot ${project}\n`);
      return;
    }

    for (const snapshot of snapshots) {
      const sizeKB = (snapshot.bytes / 1024).toFixed(2);
      const date = new Date(snapshot.createdAt).toLocaleString();

      console.log(`ID: ${snapshot.id}`);
      console.log(`   Created: ${date}`);
      console.log(`   Size: ${sizeKB} KB\n`);
    }

    console.log(`Total: ${snapshots.length} snapshot(s)\n`);
  } catch (error) {
    console.error(`\n❌ Failed to list snapshots: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}

async function cmdRollback(args: string[]) {
  const project = args[0];
  const snapshotId = args[1];

  if (!project || !snapshotId) {
    console.error('Usage: ares-wiki rollback <project> <snapshot-id>');
    process.exit(1);
  }

  console.log(`\n⏪ Rolling back to snapshot...`);
  console.log(`   Project: ${project}`);
  console.log(`   Snapshot: ${snapshotId}`);

  try {
    await restoreSnapshot(project, snapshotId);

    console.log(`\n✅ Rollback complete!`);
    console.log(`   Graph restored to snapshot: ${snapshotId}\n`);
  } catch (error) {
    console.error(`\n❌ Rollback failed: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}

function usage() {
  console.log(`
ARES Wiki CLI - Notebook → Wiki Pipeline

Usage:
  ares-wiki ingest <file.txt> [project]              Ingest document with confidence gating
  ares-wiki rebuild [project]                        Generate Markdown wiki
  ares-wiki review [project]                         Show review queue
  ares-wiki approve <project> <item-id>              Approve low-confidence item
  ares-wiki reject <project> <item-id>               Reject low-confidence item
  ares-wiki clean [project]                          Clean approved/rejected items
  ares-wiki watch <project> [--dir] [--interval]     Watch directory for new documents
  ares-wiki export <project> --format --out          Export graph to GraphML or Cypher
  ares-wiki snapshot <project>                       Create versioned graph snapshot
  ares-wiki snapshots <project>                      List all snapshots
  ares-wiki rollback <project> <snapshot-id>         Restore graph from snapshot

Examples:
  ares-wiki ingest notes/tolkien.txt lotr
  ares-wiki rebuild lotr
  ares-wiki review lotr
  ares-wiki approve lotr abc123
  ares-wiki reject lotr def456 "Not relevant"
  ares-wiki watch lotr --dir ./incoming
  ares-wiki export lotr --format graphml --out out/lotr.graphml
  ares-wiki export lotr --format cypher --out out/lotr.cypher
  ares-wiki snapshot lotr
  ares-wiki snapshots lotr
  ares-wiki rollback lotr 2024-10-16T12-00-00-000Z_abc123

Confidence Thresholds (DEFAULT_GATES):
  - ACCEPT: 0.70  (auto-accept if confidence ≥ 70%)
  - REVIEW: 0.40  (queue for review if confidence ≥ 40%)
  - Below 0.40: silently reject
`);
}

async function main() {
  const cmd = process.argv[2];
  const args = process.argv.slice(3);

  if (!cmd || ['-h', '--help', 'help'].includes(cmd)) {
    usage();
    return;
  }

  try {
    switch (cmd) {
      case 'ingest':
        await cmdIngest(args);
        break;
      case 'rebuild':
        await cmdRebuild(args);
        break;
      case 'review':
        await cmdReview(args);
        break;
      case 'approve':
        await cmdApprove(args);
        break;
      case 'reject':
        await cmdReject(args);
        break;
      case 'clean':
        await cmdClean(args);
        break;
      case 'watch':
        await cmdWatch(args);
        break;
      case 'export':
        await cmdExport(args);
        break;
      case 'snapshot':
        await cmdSnapshot(args);
        break;
      case 'snapshots':
        await cmdSnapshots(args);
        break;
      case 'rollback':
        await cmdRollback(args);
        break;
      default:
        console.error(`Unknown command: ${cmd}`);
        usage();
        process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
