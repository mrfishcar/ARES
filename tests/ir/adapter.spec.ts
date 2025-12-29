/**
 * IR Adapter Tests
 *
 * Tests the adapter that maps legacy ARES output to ProjectIR.
 * Uses a tiny fixture to verify the mapping is correct.
 */

import { describe, it, expect } from 'vitest';
import {
  adaptLegacyExtraction,
  adaptEntity,
  adaptRelation,
  LegacyExtractionResult,
} from '../../app/engine/ir/adapter';
import { renderIR, renderIRSummary } from '../../app/engine/ir/renderer';
import type { Entity, Relation } from '../../app/engine/schema';

// =============================================================================
// TEST FIXTURES
// =============================================================================

/**
 * Minimal fixture: Harry Potter text with 3 entities, 2 relations
 */
const FIXTURE_LEGACY: LegacyExtractionResult = {
  docId: 'test-chapter-1',
  entities: [
    {
      id: 'entity_harry',
      type: 'PERSON',
      canonical: 'Harry Potter',
      aliases: ['Harry', 'The Boy Who Lived'],
      created_at: '2025-01-01T00:00:00Z',
      confidence: 0.95,
      tier: 'TIER_A',
    },
    {
      id: 'entity_ron',
      type: 'PERSON',
      canonical: 'Ron Weasley',
      aliases: ['Ron'],
      created_at: '2025-01-01T00:00:00Z',
      confidence: 0.90,
      tier: 'TIER_A',
    },
    {
      id: 'entity_hogwarts',
      type: 'PLACE',
      canonical: 'Hogwarts',
      aliases: ['Hogwarts School', 'the school'],
      created_at: '2025-01-01T00:00:00Z',
      confidence: 0.85,
      tier: 'TIER_A',
    },
  ],
  relations: [
    {
      id: 'rel_1',
      subj: 'entity_harry',
      pred: 'friends_with',
      obj: 'entity_ron',
      evidence: [{
        doc_id: 'test-chapter-1',
        span: { start: 100, end: 150, text: 'Harry and Ron became friends' },
        sentence_index: 5,
        source: 'RULE',
      }],
      confidence: 0.85,
      subj_surface: 'Harry',
      obj_surface: 'Ron',
      extractor: 'dep',
    },
    {
      id: 'rel_2',
      subj: 'entity_harry',
      pred: 'studies_at',
      obj: 'entity_hogwarts',
      evidence: [{
        doc_id: 'test-chapter-1',
        span: { start: 200, end: 250, text: 'Harry studied at Hogwarts' },
        sentence_index: 10,
        source: 'RULE',
      }],
      confidence: 0.90,
      subj_surface: 'Harry',
      obj_surface: 'Hogwarts',
      extractor: 'dep',
    },
  ],
};

// =============================================================================
// ADAPTER TESTS
// =============================================================================

describe('IR Adapter', () => {
  describe('adaptLegacyExtraction', () => {
    it('should produce valid ProjectIR', () => {
      const ir = adaptLegacyExtraction(FIXTURE_LEGACY);

      expect(ir.version).toBe('1.0');
      expect(ir.projectId).toBe('test-chapter-1');
      expect(ir.docId).toBe('test-chapter-1');
      expect(ir.createdAt).toBeDefined();
    });

    it('should map all entities', () => {
      const ir = adaptLegacyExtraction(FIXTURE_LEGACY);

      expect(ir.entities).toHaveLength(3);
      expect(ir.stats.entityCount).toBe(3);

      // Check Harry
      const harry = ir.entities.find(e => e.id === 'entity_harry');
      expect(harry).toBeDefined();
      expect(harry?.canonical).toBe('Harry Potter');
      expect(harry?.type).toBe('PERSON');
      expect(harry?.aliases).toContain('Harry');
    });

    it('should map entity types correctly', () => {
      const ir = adaptLegacyExtraction(FIXTURE_LEGACY);

      const hogwarts = ir.entities.find(e => e.id === 'entity_hogwarts');
      expect(hogwarts?.type).toBe('PLACE');
    });

    it('should map all relations to assertions', () => {
      const ir = adaptLegacyExtraction(FIXTURE_LEGACY);

      expect(ir.assertions).toHaveLength(2);
      expect(ir.stats.assertionCount).toBe(2);
    });

    it('should preserve evidence spans', () => {
      const ir = adaptLegacyExtraction(FIXTURE_LEGACY);

      const friendsAssertion = ir.assertions.find(a =>
        a.predicate === 'friends_with'
      );
      expect(friendsAssertion).toBeDefined();
      expect(friendsAssertion?.evidence).toHaveLength(1);
      expect(friendsAssertion?.evidence[0].text).toBe('Harry and Ron became friends');
    });

    it('should set default modality to FACT', () => {
      const ir = adaptLegacyExtraction(FIXTURE_LEGACY);

      for (const assertion of ir.assertions) {
        expect(assertion.modality).toBe('FACT');
      }
    });

    it('should have empty events (no event extraction yet)', () => {
      const ir = adaptLegacyExtraction(FIXTURE_LEGACY);

      expect(ir.events).toHaveLength(0);
      expect(ir.stats.eventCount).toBe(0);
    });
  });

  describe('adaptEntity', () => {
    it('should map legacy entity to IR entity', () => {
      const legacy: Entity = {
        id: 'test_entity',
        type: 'PERSON',
        canonical: 'Test Person',
        aliases: ['Test', 'TP'],
        created_at: '2025-01-01T00:00:00Z',
        confidence: 0.8,
      };

      const ir = adaptEntity(legacy, 'test-doc');

      expect(ir.id).toBe('test_entity');
      expect(ir.type).toBe('PERSON');
      expect(ir.canonical).toBe('Test Person');
      expect(ir.aliases).toEqual(['Test', 'TP']);
      expect(ir.confidence.extraction).toBe(0.8);
    });

    it('should map exotic entity types', () => {
      const legacy: Entity = {
        id: 'artifact_1',
        type: 'ARTIFACT',
        canonical: 'The Elder Wand',
        aliases: [],
        created_at: '2025-01-01T00:00:00Z',
      };

      const ir = adaptEntity(legacy, 'test-doc');
      expect(ir.type).toBe('ITEM');  // ARTIFACT maps to ITEM
    });
  });

  describe('adaptRelation', () => {
    it('should map legacy relation to IR assertion', () => {
      const legacy: Relation = {
        id: 'rel_test',
        subj: 'entity_a',
        pred: 'married_to',
        obj: 'entity_b',
        evidence: [{
          doc_id: 'test-doc',
          span: { start: 0, end: 20, text: 'A married B' },
          sentence_index: 1,
          source: 'RULE',
        }],
        confidence: 0.9,
      };

      const assertion = adaptRelation(legacy, 'test-doc');

      expect(assertion.subject).toBe('entity_a');
      expect(assertion.predicate).toBe('married_to');
      expect(assertion.object).toBe('entity_b');
      expect(assertion.modality).toBe('FACT');
      expect(assertion.attribution.source).toBe('NARRATOR');
    });

    it('should infer NEGATED modality from negation predicates', () => {
      const legacy: Relation = {
        id: 'rel_neg',
        subj: 'entity_a',
        pred: 'not_related_to',
        obj: 'entity_b',
        evidence: [],
        confidence: 0.7,
      };

      const assertion = adaptRelation(legacy, 'test-doc');
      expect(assertion.modality).toBe('NEGATED');
    });

    it('should infer RUMOR modality from rumor predicates', () => {
      const legacy: Relation = {
        id: 'rel_rumor',
        subj: 'entity_a',
        pred: 'rumored',
        obj: 'entity_b',
        evidence: [],
        confidence: 0.5,
      };

      const assertion = adaptRelation(legacy, 'test-doc');
      expect(assertion.modality).toBe('RUMOR');
    });
  });
});

// =============================================================================
// RENDERER TESTS
// =============================================================================

describe('IR Debug Renderer', () => {
  describe('renderIR', () => {
    it('should render IR to markdown', () => {
      const ir = adaptLegacyExtraction(FIXTURE_LEGACY);
      const output = renderIR(ir);

      expect(output).toContain('# IR Debug View');
      expect(output).toContain('Document: test-chapter-1');
      expect(output).toContain('3 entities');
      expect(output).toContain('2 assertions');
    });

    it('should render entity table', () => {
      const ir = adaptLegacyExtraction(FIXTURE_LEGACY);
      const output = renderIR(ir, { showEntities: true, showAssertions: false });

      expect(output).toContain('Harry Potter');
      expect(output).toContain('Ron Weasley');
      expect(output).toContain('Hogwarts');
      expect(output).toContain('PERSON');
      expect(output).toContain('PLACE');
    });

    it('should render assertions with modality', () => {
      const ir = adaptLegacyExtraction(FIXTURE_LEGACY);
      const output = renderIR(ir, { showAssertions: true });

      expect(output).toContain('FACT');
      expect(output).toContain('friends_with');
      expect(output).toContain('studies_at');
    });

    it('should work with empty events', () => {
      const ir = adaptLegacyExtraction(FIXTURE_LEGACY);
      const output = renderIR(ir, { showEvents: true, showTimeline: true });

      // Should not crash, should render without events
      expect(output).toContain('0 events');
    });

    it('should filter by entity', () => {
      const ir = adaptLegacyExtraction(FIXTURE_LEGACY);
      const output = renderIR(ir, {
        entityFilter: ['entity_harry'],
        showEntities: true,
        showAssertions: true,
      });

      expect(output).toContain('Harry Potter');
      // Ron should be filtered out of entity table
      // But assertions involving Harry should still appear
    });
  });

  describe('renderIRSummary', () => {
    it('should render compact summary', () => {
      const ir = adaptLegacyExtraction(FIXTURE_LEGACY);
      const output = renderIRSummary(ir);

      expect(output).toContain('IR Summary');
      expect(output).toContain('Entities:   3');
      expect(output).toContain('Assertions: 2');
      expect(output).toContain('Events:     0');
      expect(output).toContain('PERSON: 2');
      expect(output).toContain('PLACE: 1');
    });
  });
});

// =============================================================================
// SNAPSHOT TEST
// =============================================================================

describe('IR Snapshot', () => {
  it('should produce stable output', () => {
    // Create IR with fixed timestamp for snapshot stability
    const ir = adaptLegacyExtraction(FIXTURE_LEGACY);

    // Normalize timestamps for snapshot
    const normalized = {
      ...ir,
      createdAt: '2025-01-01T00:00:00.000Z',
      entities: ir.entities.map(e => ({
        ...e,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      })),
      assertions: ir.assertions.map(a => ({
        ...a,
        createdAt: '2025-01-01T00:00:00.000Z',
      })),
    };

    // Snapshot the key structure
    expect(normalized.stats).toEqual({
      entityCount: 3,
      assertionCount: 2,
      eventCount: 0,
    });

    expect(normalized.entities.map(e => e.canonical).sort()).toEqual([
      'Harry Potter',
      'Hogwarts',
      'Ron Weasley',
    ]);

    expect(normalized.assertions.map(a => a.predicate).sort()).toEqual([
      'friends_with',
      'studies_at',
    ]);
  });
});
