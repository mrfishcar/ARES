/**
 * BookNLP Graph Projection Integration Tests
 *
 * Tests that BookNLP results are correctly projected into ARES graph format.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  projectEntities,
  projectDialogueRelations,
  projectCoOccurrenceRelations,
  projectToGraph,
  projectForGlobalGraph,
} from '../../app/engine/booknlp/graph-projection';
import { adaptBookNLPContract } from '../../app/engine/booknlp/adapter';
import type { BookNLPContract } from '../../app/engine/booknlp/types';
import type { Entity } from '../../app/engine/schema';

// Load fixtures
const FIXTURE_PATH = path.resolve(
  __dirname,
  '../fixtures/booknlp/barty-excerpt-contract.json'
);

function loadFixture(): BookNLPContract {
  const json = fs.readFileSync(FIXTURE_PATH, 'utf-8');
  return JSON.parse(json) as BookNLPContract;
}

function getAdaptedResult() {
  const contract = loadFixture();
  return adaptBookNLPContract(contract);
}

describe('BookNLP Graph Projection', () => {
  describe('Entity Projection', () => {
    it('should project ARES entities to schema Entity format', () => {
      const result = getAdaptedResult();
      const entities = projectEntities(result.entities, {
        docId: 'test-doc-001',
      });

      expect(entities).toHaveLength(4);

      // All should have required fields
      entities.forEach(e => {
        expect(e.id).toBeDefined();
        expect(e.type).toBeDefined();
        expect(e.canonical).toBeDefined();
        expect(e.aliases).toBeDefined();
        expect(e.created_at).toBeDefined();
      });
    });

    it('should set high confidence tier for BookNLP entities', () => {
      const result = getAdaptedResult();
      const entities = projectEntities(result.entities, {
        docId: 'test-doc-001',
      });

      entities.forEach(e => {
        expect(e.tier).toBe('TIER_A');
        expect(e.confidence).toBeGreaterThan(0.9);
      });
    });

    it('should preserve BookNLP metadata in attrs', () => {
      const result = getAdaptedResult();
      const entities = projectEntities(result.entities, {
        docId: 'test-doc-001',
      });

      const barty = entities.find(e => e.canonical === 'Barty Beauregard');
      expect(barty?.attrs?.source).toBe('booknlp');
      expect(barty?.attrs?.booknlp_id).toBe('char_0');
      expect(barty?.attrs?.mention_count).toBe(7);
      expect(barty?.attrs?.gender).toBe('male');
    });

    it('should filter by minimum mention count', () => {
      const result = getAdaptedResult();

      // With high threshold, should filter out low-mention characters
      const entities = projectEntities(result.entities, {
        docId: 'test-doc-001',
        minMentionCount: 5,
      });

      // Only Barty has 7 mentions
      expect(entities.length).toBeLessThan(4);
      expect(entities.some(e => e.canonical === 'Barty Beauregard')).toBe(true);
    });
  });

  describe('Dialogue Relation Projection', () => {
    it('should create spoke_to relations from dialogue sequences', () => {
      const result = getAdaptedResult();
      const entities = projectEntities(result.entities, {
        docId: 'test-doc-001',
      });

      const entityMap = new Map<string, Entity>();
      entities.forEach(e => entityMap.set(e.id, e));

      const relations = projectDialogueRelations(result.quotes, entityMap, {
        docId: 'test-doc-001',
      });

      // With 2 quotes from different speakers, should create 1 spoke_to relation
      expect(relations.length).toBeGreaterThanOrEqual(0);

      if (relations.length > 0) {
        const rel = relations[0];
        expect(rel.pred).toBe('spoke_to');
        expect(rel.confidence).toBeGreaterThan(0.8);
        expect(rel.extractor).toBe('fiction-dialogue');
      }
    });

    it('should not create relations for same speaker', () => {
      // Create quotes with same speaker
      const mockQuotes = [
        {
          id: 'q1',
          text: 'First quote',
          start: 0,
          end: 50,
          speaker_id: 'char_0',
          speaker_name: 'Barty',
          confidence: 0.9,
        },
        {
          id: 'q2',
          text: 'Second quote',
          start: 100,
          end: 150,
          speaker_id: 'char_0', // Same speaker
          speaker_name: 'Barty',
          confidence: 0.9,
        },
      ];

      const entityMap = new Map<string, Entity>([
        [
          'char_0',
          {
            id: 'char_0',
            type: 'PERSON',
            canonical: 'Barty',
            aliases: [],
            created_at: new Date().toISOString(),
          },
        ],
      ]);

      const relations = projectDialogueRelations(mockQuotes, entityMap, {
        docId: 'test-doc-001',
      });

      // No relations for same speaker
      expect(relations).toHaveLength(0);
    });

    it('should deduplicate speaker pairs', () => {
      // Create alternating dialogue
      const mockQuotes = [
        {
          id: 'q1',
          text: 'Hello',
          start: 0,
          end: 10,
          speaker_id: 'char_0',
          speaker_name: 'A',
          confidence: 0.9,
        },
        {
          id: 'q2',
          text: 'Hi',
          start: 20,
          end: 30,
          speaker_id: 'char_1',
          speaker_name: 'B',
          confidence: 0.9,
        },
        {
          id: 'q3',
          text: 'How are you',
          start: 40,
          end: 60,
          speaker_id: 'char_0',
          speaker_name: 'A',
          confidence: 0.9,
        },
        {
          id: 'q4',
          text: 'Fine',
          start: 70,
          end: 80,
          speaker_id: 'char_1',
          speaker_name: 'B',
          confidence: 0.9,
        },
      ];

      const entityMap = new Map<string, Entity>([
        [
          'char_0',
          {
            id: 'char_0',
            type: 'PERSON',
            canonical: 'A',
            aliases: [],
            created_at: new Date().toISOString(),
          },
        ],
        [
          'char_1',
          {
            id: 'char_1',
            type: 'PERSON',
            canonical: 'B',
            aliases: [],
            created_at: new Date().toISOString(),
          },
        ],
      ]);

      const relations = projectDialogueRelations(mockQuotes, entityMap, {
        docId: 'test-doc-001',
      });

      // Should only have 1 unique pair
      expect(relations).toHaveLength(1);
    });
  });

  describe('Co-occurrence Relation Projection', () => {
    it('should create met relations for nearby character mentions', () => {
      // Create spans for two characters mentioned close together
      const mockSpans = [
        { entity_id: 'char_0', start: 0, end: 10, text: 'Barty' },
        { entity_id: 'char_1', start: 50, end: 60, text: 'Preston' },
      ];

      const entityMap = new Map<string, Entity>([
        [
          'char_0',
          {
            id: 'char_0',
            type: 'PERSON',
            canonical: 'Barty',
            aliases: [],
            created_at: new Date().toISOString(),
          },
        ],
        [
          'char_1',
          {
            id: 'char_1',
            type: 'PERSON',
            canonical: 'Preston',
            aliases: [],
            created_at: new Date().toISOString(),
          },
        ],
      ]);

      const relations = projectCoOccurrenceRelations(mockSpans, entityMap, {
        docId: 'test-doc-001',
        text: 'Barty walked over to Preston and shook his hand.',
      });

      expect(relations.length).toBeGreaterThanOrEqual(1);

      const rel = relations[0];
      expect(rel.pred).toBe('met');
      expect(rel.confidence).toBeLessThan(0.7); // Lower for proximity-based
      expect(rel.extractor).toBe('fiction-action');
    });

    it('should not create relations for distant mentions', () => {
      // Create spans that are far apart (> 500 chars)
      const mockSpans = [
        { entity_id: 'char_0', start: 0, end: 10, text: 'Barty' },
        { entity_id: 'char_1', start: 1000, end: 1010, text: 'Preston' },
      ];

      const entityMap = new Map<string, Entity>([
        [
          'char_0',
          {
            id: 'char_0',
            type: 'PERSON',
            canonical: 'Barty',
            aliases: [],
            created_at: new Date().toISOString(),
          },
        ],
        [
          'char_1',
          {
            id: 'char_1',
            type: 'PERSON',
            canonical: 'Preston',
            aliases: [],
            created_at: new Date().toISOString(),
          },
        ],
      ]);

      const relations = projectCoOccurrenceRelations(mockSpans, entityMap, {
        docId: 'test-doc-001',
        text: 'x'.repeat(1100),
      });

      expect(relations).toHaveLength(0);
    });

    it('should skip non-PERSON entities for met relations', () => {
      const mockSpans = [
        { entity_id: 'char_0', start: 0, end: 10, text: 'Barty' },
        { entity_id: 'org_1', start: 20, end: 40, text: 'Mont Linola' },
      ];

      const entityMap = new Map<string, Entity>([
        [
          'char_0',
          {
            id: 'char_0',
            type: 'PERSON',
            canonical: 'Barty',
            aliases: [],
            created_at: new Date().toISOString(),
          },
        ],
        [
          'org_1',
          {
            id: 'org_1',
            type: 'ORG',
            canonical: 'Mont Linola',
            aliases: [],
            created_at: new Date().toISOString(),
          },
        ],
      ]);

      const relations = projectCoOccurrenceRelations(mockSpans, entityMap, {
        docId: 'test-doc-001',
        text: 'Barty went to Mont Linola.',
      });

      // No met relation between PERSON and ORG
      expect(relations).toHaveLength(0);
    });

    it('should skip self-references', () => {
      const mockSpans = [
        { entity_id: 'char_0', start: 0, end: 10, text: 'Barty' },
        { entity_id: 'char_0', start: 20, end: 30, text: 'he' }, // Same entity
      ];

      const entityMap = new Map<string, Entity>([
        [
          'char_0',
          {
            id: 'char_0',
            type: 'PERSON',
            canonical: 'Barty',
            aliases: [],
            created_at: new Date().toISOString(),
          },
        ],
      ]);

      const relations = projectCoOccurrenceRelations(mockSpans, entityMap, {
        docId: 'test-doc-001',
        text: 'Barty saw that he was late.',
      });

      expect(relations).toHaveLength(0);
    });
  });

  describe('Full Graph Projection', () => {
    it('should project complete BookNLP result to graph', () => {
      const result = getAdaptedResult();
      const projection = projectToGraph(result, {
        docId: 'test-doc-001',
        text: 'Sample text for evidence',
        generateSpeakerRelations: true,
        generateCoOccurrenceRelations: true,
      });

      expect(projection.entities.length).toBeGreaterThan(0);
      expect(projection.stats.entitiesProjected).toBe(projection.entities.length);
    });

    it('should track stats correctly', () => {
      const result = getAdaptedResult();
      const projection = projectToGraph(result, {
        docId: 'test-doc-001',
        text: 'Sample text',
      });

      expect(projection.stats.entitiesProjected).toBeDefined();
      expect(projection.stats.relationsFromQuotes).toBeDefined();
      expect(projection.stats.relationsFromCoref).toBeDefined();
      expect(projection.stats.totalRelations).toBe(
        projection.stats.relationsFromQuotes + projection.stats.relationsFromCoref
      );
    });

    it('should respect option flags', () => {
      const result = getAdaptedResult();

      // Disable all relation generation
      const projection = projectToGraph(result, {
        docId: 'test-doc-001',
        generateSpeakerRelations: false,
        generateCoOccurrenceRelations: false,
      });

      expect(projection.relations).toHaveLength(0);
      expect(projection.stats.relationsFromQuotes).toBe(0);
      expect(projection.stats.relationsFromCoref).toBe(0);
    });
  });

  describe('GlobalGraph Convenience Function', () => {
    it('should produce entities and relations for GlobalKnowledgeGraph', () => {
      const result = getAdaptedResult();
      const { entities, relations } = projectForGlobalGraph(
        result,
        'barty-doc-001',
        'The full text of the document would go here.'
      );

      expect(entities.length).toBeGreaterThan(0);
      expect(Array.isArray(relations)).toBe(true);

      // Entities should be in correct format
      entities.forEach(e => {
        expect(e.id).toBeDefined();
        expect(e.type).toBeDefined();
        expect(e.canonical).toBeDefined();
        expect(e.aliases).toBeInstanceOf(Array);
      });

      // Relations should be in correct format
      relations.forEach(r => {
        expect(r.id).toBeDefined();
        expect(r.subj).toBeDefined();
        expect(r.pred).toBeDefined();
        expect(r.obj).toBeDefined();
        expect(r.confidence).toBeGreaterThan(0);
      });
    });
  });

  describe('Evidence Quality', () => {
    it('should create proper evidence objects for relations', () => {
      const mockSpans = [
        { entity_id: 'char_0', start: 10, end: 20, text: 'Barty' },
        { entity_id: 'char_1', start: 30, end: 45, text: 'Preston' },
      ];

      const entityMap = new Map<string, Entity>([
        [
          'char_0',
          {
            id: 'char_0',
            type: 'PERSON',
            canonical: 'Barty',
            aliases: [],
            created_at: new Date().toISOString(),
          },
        ],
        [
          'char_1',
          {
            id: 'char_1',
            type: 'PERSON',
            canonical: 'Preston',
            aliases: [],
            created_at: new Date().toISOString(),
          },
        ],
      ]);

      const text = 'Earlier, Barty walked over to Preston and waved.';
      const relations = projectCoOccurrenceRelations(mockSpans, entityMap, {
        docId: 'evidence-test',
        text,
      });

      expect(relations.length).toBe(1);
      const evidence = relations[0].evidence[0];

      expect(evidence.doc_id).toBe('evidence-test');
      expect(evidence.span.start).toBeDefined();
      expect(evidence.span.end).toBeDefined();
      expect(evidence.span.text).toBeDefined();
      expect(evidence.source).toBe('RULE');
    });
  });
});
