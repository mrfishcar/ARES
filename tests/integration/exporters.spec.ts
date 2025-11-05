/**
 * Integration tests for GraphML and Cypher exporters
 * Sprint R1
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { exportGraphML } from '../../app/export/graphml';
import { exportCypher } from '../../app/export/cypher';
import type { KnowledgeGraph } from '../../app/storage/storage';

const TEST_OUTPUT_DIR = path.join(process.cwd(), 'tmp', 'test-exports');

describe('Graph Exporters', () => {
  beforeEach(() => {
    // Create test output directory
    if (!fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.rmSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  const createTestGraph = (): KnowledgeGraph => ({
    entities: [
      {
        id: 'e1',
        type: 'PERSON',
        canonical: 'Aragorn',
        aliases: ['Strider', 'Elessar'],
        centrality: 0.95
      },
      {
        id: 'e2',
        type: 'PERSON',
        canonical: 'Arwen',
        aliases: ['Undomiel'],
        centrality: 0.75
      },
      {
        id: 'e3',
        type: 'LOCATION',
        canonical: 'Rivendell',
        aliases: ['Imladris'],
        centrality: 0.65
      }
    ],
    relations: [
      {
        id: 'r1',
        subj: 'e1',
        pred: 'married_to',
        obj: 'e2',
        confidence: 0.95,
        extractor: 'rule_001',
        evidence: []
      },
      {
        id: 'r2',
        subj: 'e1',
        pred: 'traveled_to',
        obj: 'e3',
        confidence: 0.85,
        extractor: 'rule_002',
        evidence: []
      }
    ],
    conflicts: [],
    metadata: {
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      doc_count: 1,
      doc_ids: ['doc1']
    }
  });

  describe('GraphML Exporter', () => {
    it('should export valid GraphML XML', () => {
      const graph = createTestGraph();
      const outputPath = path.join(TEST_OUTPUT_DIR, 'test.graphml');

      exportGraphML(graph, outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);
      const content = fs.readFileSync(outputPath, 'utf-8');

      // Check XML structure
      expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(content).toContain('<graphml xmlns=');
      expect(content).toContain('</graphml>');
    });

    it('should include all entities as nodes', () => {
      const graph = createTestGraph();
      const outputPath = path.join(TEST_OUTPUT_DIR, 'test.graphml');

      exportGraphML(graph, outputPath);
      const content = fs.readFileSync(outputPath, 'utf-8');

      expect(content).toContain('id="e1"');
      expect(content).toContain('id="e2"');
      expect(content).toContain('id="e3"');
      expect(content).toContain('Aragorn');
      expect(content).toContain('Arwen');
      expect(content).toContain('Rivendell');
    });

    it('should include all relations as edges', () => {
      const graph = createTestGraph();
      const outputPath = path.join(TEST_OUTPUT_DIR, 'test.graphml');

      exportGraphML(graph, outputPath);
      const content = fs.readFileSync(outputPath, 'utf-8');

      expect(content).toContain('source="e1"');
      expect(content).toContain('target="e2"');
      expect(content).toContain('married_to');
      expect(content).toContain('traveled_to');
    });

    it('should escape XML special characters', () => {
      const graph = createTestGraph();
      graph.entities[0].canonical = 'Test & <Name>';

      const outputPath = path.join(TEST_OUTPUT_DIR, 'test.graphml');
      exportGraphML(graph, outputPath);
      const content = fs.readFileSync(outputPath, 'utf-8');

      expect(content).toContain('&amp;');
      expect(content).toContain('&lt;');
      expect(content).toContain('&gt;');
    });

    it('should mark symmetric relations', () => {
      const graph = createTestGraph();
      const outputPath = path.join(TEST_OUTPUT_DIR, 'test.graphml');

      exportGraphML(graph, outputPath);
      const content = fs.readFileSync(outputPath, 'utf-8');

      // married_to is symmetric
      expect(content).toMatch(/<data key="e2">true<\/data>/);
    });
  });

  describe('Cypher Exporter', () => {
    it('should export valid Cypher statements', () => {
      const graph = createTestGraph();
      const outputPath = path.join(TEST_OUTPUT_DIR, 'test.cypher');

      exportCypher(graph, outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);
      const content = fs.readFileSync(outputPath, 'utf-8');

      expect(content).toContain('MERGE (n:Entity');
      expect(content).toContain('MATCH (a:Entity');
      expect(content).toContain('CREATE INDEX');
    });

    it('should include all entities with MERGE', () => {
      const graph = createTestGraph();
      const outputPath = path.join(TEST_OUTPUT_DIR, 'test.cypher');

      exportCypher(graph, outputPath);
      const content = fs.readFileSync(outputPath, 'utf-8');

      expect(content).toContain('id: "e1"');
      expect(content).toContain('name: "Aragorn"');
      expect(content).toContain('id: "e2"');
      expect(content).toContain('name: "Arwen"');
      expect(content).toContain('id: "e3"');
      expect(content).toContain('name: "Rivendell"');
    });

    it('should create relationships with MATCH and MERGE', () => {
      const graph = createTestGraph();
      const outputPath = path.join(TEST_OUTPUT_DIR, 'test.cypher');

      exportCypher(graph, outputPath);
      const content = fs.readFileSync(outputPath, 'utf-8');

      expect(content).toContain('[:MARRIED_TO');
      expect(content).toContain('[:TRAVELED_TO');
    });

    it('should escape Cypher special characters', () => {
      const graph = createTestGraph();
      graph.entities[0].canonical = 'Test "Name"';

      const outputPath = path.join(TEST_OUTPUT_DIR, 'test.cypher');
      exportCypher(graph, outputPath);
      const content = fs.readFileSync(outputPath, 'utf-8');

      expect(content).toContain('\\"');
    });

    it('should create both directions for symmetric relations', () => {
      const graph = createTestGraph();
      const outputPath = path.join(TEST_OUTPUT_DIR, 'test.cypher');

      exportCypher(graph, outputPath);
      const content = fs.readFileSync(outputPath, 'utf-8');

      // married_to is symmetric, should have both (a)->(b) and (b)->(a)
      const lines = content.split('\n');
      const marriedToLines = lines.filter(l => l.includes('MARRIED_TO'));

      // Should have MERGE statements creating both directions
      expect(marriedToLines.length).toBeGreaterThan(1);
    });

    it('should include index creation statements', () => {
      const graph = createTestGraph();
      const outputPath = path.join(TEST_OUTPUT_DIR, 'test.cypher');

      exportCypher(graph, outputPath);
      const content = fs.readFileSync(outputPath, 'utf-8');

      expect(content).toContain('CREATE INDEX entity_id_index');
      expect(content).toContain('CREATE INDEX entity_name_index');
    });
  });
});
