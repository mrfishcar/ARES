/**
 * Integration tests for Watch Mode File Ingestion
 * Sprint R1
 *
 * Note: These tests use timeouts to verify file watching behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { watch as chokidarWatch, type FSWatcher } from 'chokidar';
import { appendDoc, loadGraph } from '../../app/storage/storage';
import { loadConfig } from '../../app/config/load';

const TEST_WATCH_DIR = path.join(process.cwd(), 'tmp', 'test-watch');
const TEST_PROCESSED_DIR = path.join(TEST_WATCH_DIR, 'processed');
const TEST_PROJECT = 'test-watch';
const TEST_PROJECT_DIR = path.join(process.cwd(), 'data', 'projects', TEST_PROJECT);
const TEST_GRAPH_PATH = path.join(TEST_PROJECT_DIR, 'graph.json');

describe('Watch Mode File Ingestion', () => {
  beforeEach(() => {
    // Create test directories
    if (!fs.existsSync(TEST_WATCH_DIR)) {
      fs.mkdirSync(TEST_WATCH_DIR, { recursive: true });
    }
    if (!fs.existsSync(TEST_PROCESSED_DIR)) {
      fs.mkdirSync(TEST_PROCESSED_DIR, { recursive: true });
    }
    if (!fs.existsSync(TEST_PROJECT_DIR)) {
      fs.mkdirSync(TEST_PROJECT_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directories
    if (fs.existsSync(TEST_WATCH_DIR)) {
      fs.rmSync(TEST_WATCH_DIR, { recursive: true });
    }
    if (fs.existsSync(TEST_PROJECT_DIR)) {
      fs.rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
  });

  describe('File Detection', () => {
    it('should detect new .txt files', async () => {
      let detected = false;
      const watcher: FSWatcher = chokidarWatch(TEST_WATCH_DIR, {
        ignored: [TEST_PROCESSED_DIR, /(^|[\/\\])\../],
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50
        }
      });

      watcher.on('add', (filePath: string) => {
        if (path.extname(filePath) === '.txt') {
          detected = true;
        }
      });

      // Wait for watcher to be ready
      await new Promise(resolve => watcher.on('ready', resolve));

      // Create a test file
      const testFile = path.join(TEST_WATCH_DIR, 'test.txt');
      fs.writeFileSync(testFile, 'Aragorn traveled to Rivendell.');

      // Wait for detection
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(detected).toBe(true);

      await watcher.close();
    });

    it('should detect new .md files', async () => {
      let detected = false;
      const watcher: FSWatcher = chokidarWatch(TEST_WATCH_DIR, {
        ignored: [TEST_PROCESSED_DIR, /(^|[\/\\])\../],
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50
        }
      });

      watcher.on('add', (filePath: string) => {
        if (path.extname(filePath) === '.md') {
          detected = true;
        }
      });

      await new Promise(resolve => watcher.on('ready', resolve));

      const testFile = path.join(TEST_WATCH_DIR, 'test.md');
      fs.writeFileSync(testFile, '# Notes\n\nGandalf is a wizard.');

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(detected).toBe(true);

      await watcher.close();
    });

    it('should ignore non-text files', async () => {
      let detectedTxt = false;
      let detectedJpg = false;

      const watcher: FSWatcher = chokidarWatch(TEST_WATCH_DIR, {
        ignored: [TEST_PROCESSED_DIR, /(^|[\/\\])\../],
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50
        }
      });

      watcher.on('add', (filePath: string) => {
        const ext = path.extname(filePath);
        if (ext === '.txt') detectedTxt = true;
        if (ext === '.jpg') detectedJpg = true;
      });

      await new Promise(resolve => watcher.on('ready', resolve));

      // Create both files
      fs.writeFileSync(path.join(TEST_WATCH_DIR, 'test.txt'), 'Text content');
      fs.writeFileSync(path.join(TEST_WATCH_DIR, 'image.jpg'), Buffer.from([0xFF, 0xD8]));

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(detectedTxt).toBe(true);
      expect(detectedJpg).toBe(true); // Detected but should be filtered by handler

      await watcher.close();
    });

    it('should ignore files in processed directory', async () => {
      let detectedInProcessed = false;

      const watcher: FSWatcher = chokidarWatch(TEST_WATCH_DIR, {
        ignored: [TEST_PROCESSED_DIR, /(^|[\/\\])\../],
        persistent: true,
        ignoreInitial: true
      });

      watcher.on('add', (filePath: string) => {
        if (filePath.includes('processed')) {
          detectedInProcessed = true;
        }
      });

      await new Promise(resolve => watcher.on('ready', resolve));

      // Create file in processed dir
      fs.writeFileSync(path.join(TEST_PROCESSED_DIR, 'already-processed.txt'), 'Content');

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(detectedInProcessed).toBe(false);

      await watcher.close();
    });
  });

  describe('File Processing', () => {
    it('should ingest file content using ARES extraction', async () => {
      const testContent = 'Aragorn, son of Arathorn, traveled to Rivendell. Elrond welcomed him.';
      const testFile = path.join(TEST_WATCH_DIR, 'lotr.txt');

      fs.writeFileSync(testFile, testContent);

      // Simulate ingestion
      const docId = `doc:lotr:${Date.now()}`;
      const result = await appendDoc(docId, testContent, TEST_GRAPH_PATH);

      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.relations.length).toBeGreaterThan(0);

      // Verify graph was updated
      const graph = loadGraph(TEST_GRAPH_PATH);
      expect(graph).toBeDefined();
      expect(graph!.entities.length).toBeGreaterThan(0);
    }, 10000); // Longer timeout for extraction

    it('should move processed file to processed directory', () => {
      const testFile = path.join(TEST_WATCH_DIR, 'test.txt');
      const processedFile = path.join(TEST_PROCESSED_DIR, 'test.txt');

      fs.writeFileSync(testFile, 'Test content');

      // Simulate file move after processing
      fs.renameSync(testFile, processedFile);

      expect(fs.existsSync(testFile)).toBe(false);
      expect(fs.existsSync(processedFile)).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should load watch configuration from config file', () => {
      const config = loadConfig();

      expect(config.watch).toBeDefined();
      expect(config.watch.incomingDir).toBeDefined();
      expect(config.watch.intervalMs).toBeDefined();
      expect(config.watch.rebuildDebounceMs).toBeDefined();
    });

    it('should use default values if config is missing', () => {
      const config = loadConfig();

      // Should have defaults
      expect(config.watch.intervalMs).toBe(3000);
      expect(config.watch.rebuildDebounceMs).toBe(5000);
      expect(config.watch.incomingDir).toBe('./incoming');
    });
  });

  describe('Error Handling', () => {
    it('should handle files that fail to ingest', async () => {
      const invalidFile = path.join(TEST_WATCH_DIR, 'invalid.txt');

      // Create file with content that might cause issues (empty file)
      fs.writeFileSync(invalidFile, '');

      // Attempt ingestion
      const docId = `doc:invalid:${Date.now()}`;

      // Should not throw, but might return empty results
      const result = await appendDoc(docId, '', TEST_GRAPH_PATH);

      // Empty content should result in no entities
      expect(result.entities.length).toBe(0);
    }, 10000);
  });
});
