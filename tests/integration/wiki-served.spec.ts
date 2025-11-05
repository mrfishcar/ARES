/**
 * Integration Tests - Wiki and Download Serving (Sprint R4)
 * Coverage: wiki file serving, download endpoint, security
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startGraphQLServer } from '../../app/api/graphql';
import { saveGraph, createEmptyGraph } from '../../app/storage/storage';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

const TEST_PORT = 4099;
const TEST_PROJECT = 'test-wiki-serve';
const TEST_GRAPH_PATH = path.join(process.cwd(), 'data', 'projects', TEST_PROJECT, 'graph.json');
const WIKI_DIR = path.join(process.cwd(), 'data', 'projects', TEST_PROJECT, 'wiki');
const OUT_DIR = path.join(process.cwd(), 'out');

let server: any;

/**
 * Helper to make HTTP requests
 */
function httpGet(url: string): Promise<{ statusCode: number; headers: any; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body
        });
      });
    }).on('error', reject);
  });
}

describe('Wiki and Download Serving - Integration Tests', () => {
  beforeAll(async () => {
    // Ensure directories exist
    const projectDir = path.dirname(TEST_GRAPH_PATH);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    if (!fs.existsSync(WIKI_DIR)) {
      fs.mkdirSync(WIKI_DIR, { recursive: true });
    }
    if (!fs.existsSync(OUT_DIR)) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
    }

    // Create test graph
    const graph = createEmptyGraph();
    graph.entities.push({
      id: 'test-entity-123',
      type: 'PERSON',
      canonical: 'Test Person',
      aliases: [],
      created_at: new Date().toISOString(),
      evidence: []
    });
    saveGraph(graph, TEST_GRAPH_PATH);

    // Create wiki file
    fs.writeFileSync(
      path.join(WIKI_DIR, 'test-entity-123.md'),
      '# Test Person\n\nThis is a test wiki page.'
    );

    // Create test file in out/
    fs.writeFileSync(
      path.join(OUT_DIR, 'test-export.txt'),
      'Test export content'
    );

    // Start server
    server = await startGraphQLServer(TEST_PORT, TEST_GRAPH_PATH);
  });

  afterAll(async () => {
    // Cleanup
    if (fs.existsSync(TEST_GRAPH_PATH)) {
      fs.unlinkSync(TEST_GRAPH_PATH);
    }
    if (fs.existsSync(path.join(WIKI_DIR, 'test-entity-123.md'))) {
      fs.unlinkSync(path.join(WIKI_DIR, 'test-entity-123.md'));
    }
    if (fs.existsSync(WIKI_DIR)) {
      try {
        fs.rmdirSync(WIKI_DIR);
      } catch (e) {
        // Directory not empty, that's fine
      }
    }
    if (fs.existsSync(path.join(OUT_DIR, 'test-export.txt'))) {
      fs.unlinkSync(path.join(OUT_DIR, 'test-export.txt'));
    }

    // Stop server
    if (server) {
      await server.stop();
    }
  });

  describe('Wiki File Serving', () => {
    it('should serve wiki file successfully', async () => {
      const url = `http://localhost:${TEST_PORT + 100}/wiki-file?project=${TEST_PROJECT}&id=test-entity-123`;
      const response = await httpGet(url);

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/markdown; charset=utf-8');
      expect(response.body).toContain('# Test Person');
      expect(response.body).toContain('This is a test wiki page');
    });

    it('should return 404 for missing wiki file', async () => {
      const url = `http://localhost:${TEST_PORT + 100}/wiki-file?project=${TEST_PROJECT}&id=nonexistent`;
      const response = await httpGet(url);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Wiki file not found');
    });

    it('should return 400 for missing parameters', async () => {
      const url = `http://localhost:${TEST_PORT + 100}/wiki-file?project=${TEST_PROJECT}`;
      const response = await httpGet(url);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Missing project or id parameter');
    });

    it('should reject path traversal in project name', async () => {
      const url = `http://localhost:${TEST_PORT + 100}/wiki-file?project=../../../etc&id=passwd`;
      const response = await httpGet(url);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Invalid project name');
    });

    it('should reject path traversal in entity id', async () => {
      const url = `http://localhost:${TEST_PORT + 100}/wiki-file?project=${TEST_PROJECT}&id=../../../etc/passwd`;
      const response = await httpGet(url);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Invalid entity id');
    });
  });

  describe('Download Endpoint', () => {
    it('should download file from out/ directory', async () => {
      const url = `http://localhost:${TEST_PORT + 100}/download?path=test-export.txt`;
      const response = await httpGet(url);

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/octet-stream');
      expect(response.headers['content-disposition']).toBe('attachment; filename="test-export.txt"');
      expect(response.body).toBe('Test export content');
    });

    it('should return 404 for missing file', async () => {
      const url = `http://localhost:${TEST_PORT + 100}/download?path=nonexistent.txt`;
      const response = await httpGet(url);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('File not found');
    });

    it('should return 400 for missing path parameter', async () => {
      const url = `http://localhost:${TEST_PORT + 100}/download`;
      const response = await httpGet(url);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Missing path parameter');
    });

    it('should reject absolute paths', async () => {
      const url = `http://localhost:${TEST_PORT + 100}/download?path=/etc/passwd`;
      const response = await httpGet(url);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Absolute paths not allowed');
    });

    it('should reject path traversal attempts', async () => {
      const url = `http://localhost:${TEST_PORT + 100}/download?path=../../../etc/passwd`;
      const response = await httpGet(url);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Path traversal not allowed');
    });

    it('should reject access outside out/ directory', async () => {
      // Try to access a file in data/ instead of out/
      const url = `http://localhost:${TEST_PORT + 100}/download?path=../data/projects/${TEST_PROJECT}/graph.json`;
      const response = await httpGet(url);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Path traversal not allowed');
    });
  });
});
