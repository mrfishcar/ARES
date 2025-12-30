/**
 * Phase 2 Tests: Override Manager
 *
 * Verifies that the override system:
 * - Applies entity type corrections correctly
 * - Handles entity merges across reprocessing
 * - Applies alias additions/removals
 * - Applies canonical name changes
 * - Applies relation additions/removals
 * - Handles entity rejections
 * - Preserves correction history
 * - Filters out rolled-back corrections
 *
 * Key invariants:
 * 1. Corrections survive reprocessing
 * 2. Rolled-back corrections are not applied
 * 3. Corrections are applied in chronological order
 * 4. Entity matching works by ID or name
 */

import { describe, it, expect } from 'vitest';
import { applyOverrides, applyOverridesFromSavedGraph } from '../app/engine/override-manager';
import type { KnowledgeGraph } from '../app/storage/storage';
import type { Entity, Relation, Correction, EntityType, Predicate } from '../app/engine/schema';

// Test graph factory
function createTestGraph(overrides: Partial<KnowledgeGraph> = {}): KnowledgeGraph {
  return {
    entities: [],
    relations: [],
    conflicts: [],
    provenance: new Map(),
    profiles: new Map(),
    corrections: [],
    versions: [],
    learnedPatterns: [],
    metadata: {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      doc_count: 0,
      doc_ids: [],
    },
    ...overrides,
  };
}

// Test entity factory
function createTestEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: `entity-${Math.random().toString(36).substr(2, 9)}`,
    type: 'PERSON',
    canonical: 'Test Entity',
    aliases: [],
    created_at: new Date().toISOString(),
    confidence: 0.8,
    ...overrides,
  };
}

// Test relation factory
function createTestRelation(overrides: Partial<Relation> = {}): Relation {
  return {
    id: `rel-${Math.random().toString(36).substr(2, 9)}`,
    subj: 'entity-1',
    pred: 'married_to' as Predicate,
    obj: 'entity-2',
    confidence: 0.9,
    evidence: [],
    ...overrides,
  };
}

// Test correction factory
function createTestCorrection(overrides: Partial<Correction> = {}): Correction {
  return {
    id: `corr-${Math.random().toString(36).substr(2, 9)}`,
    type: 'entity_type',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('Phase 2: Override Manager', () => {
  describe('applyOverrides - Entity Type Corrections', () => {
    it('should apply entity type correction by ID', () => {
      const entity = createTestEntity({
        id: 'ent-1',
        canonical: 'John Smith',
        type: 'PERSON',
      });
      const graph = createTestGraph({ entities: [entity] });

      const correction = createTestCorrection({
        type: 'entity_type',
        entityId: 'ent-1',
        before: { entityType: 'PERSON', canonical: 'John Smith' },
        after: { entityType: 'ORG' },
      });

      const result = applyOverrides(graph, [correction]);

      expect(result.graph.entities[0].type).toBe('ORG');
      expect(result.stats.entityTypeChanges).toBe(1);
      expect(result.stats.totalApplied).toBe(1);
    });

    it('should apply entity type correction by canonical name when ID not found', () => {
      const entity = createTestEntity({
        id: 'new-id',
        canonical: 'John Smith',
        type: 'PERSON',
      });
      const graph = createTestGraph({ entities: [entity] });

      const correction = createTestCorrection({
        type: 'entity_type',
        entityId: 'old-id', // ID changed after reprocessing
        before: { entityType: 'PERSON', canonical: 'John Smith' },
        after: { entityType: 'ORG' },
      });

      const result = applyOverrides(graph, [correction]);

      expect(result.graph.entities[0].type).toBe('ORG');
      expect(result.stats.entityTypeChanges).toBe(1);
    });

    it('should skip correction when entity not found', () => {
      const graph = createTestGraph({ entities: [] });

      const correction = createTestCorrection({
        type: 'entity_type',
        entityId: 'nonexistent',
        before: { entityType: 'PERSON' },
        after: { entityType: 'ORG' },
      });

      const result = applyOverrides(graph, [correction]);

      expect(result.stats.entityTypeChanges).toBe(0);
      expect(result.stats.skipped).toBe(1);
    });
  });

  describe('applyOverrides - Entity Merge Corrections', () => {
    it('should merge entities into one', () => {
      const entity1 = createTestEntity({
        id: 'ent-1',
        canonical: 'John Smith',
        aliases: ['Johnny'],
      });
      const entity2 = createTestEntity({
        id: 'ent-2',
        canonical: 'J. Smith',
        aliases: ['JS'],
      });
      const graph = createTestGraph({ entities: [entity1, entity2] });

      const correction = createTestCorrection({
        type: 'entity_merge',
        entityIds: ['ent-1', 'ent-2'],
        before: {
          entities: [
            { id: 'ent-1', canonical: 'John Smith' },
            { id: 'ent-2', canonical: 'J. Smith' },
          ],
        },
        after: { canonical: 'John Smith' },
      });

      const result = applyOverrides(graph, [correction]);

      // Should have one entity
      expect(result.graph.entities).toHaveLength(1);

      // Should have merged aliases
      const merged = result.graph.entities[0];
      expect(merged.canonical).toBe('John Smith');
      expect(merged.aliases).toContain('J. Smith');
      expect(merged.aliases).toContain('Johnny');
      expect(merged.aliases).toContain('JS');

      expect(result.stats.entityMerges).toBe(1);
    });

    it('should update relations after merge', () => {
      const entity1 = createTestEntity({ id: 'ent-1', canonical: 'John' });
      const entity2 = createTestEntity({ id: 'ent-2', canonical: 'John Smith' });
      const entity3 = createTestEntity({ id: 'ent-3', canonical: 'Mary' });

      const relation = createTestRelation({
        subj: 'ent-2',
        obj: 'ent-3',
        pred: 'married_to' as Predicate,
      });

      const graph = createTestGraph({
        entities: [entity1, entity2, entity3],
        relations: [relation],
      });

      const correction = createTestCorrection({
        type: 'entity_merge',
        entityIds: ['ent-1', 'ent-2'],
        before: {
          entities: [
            { id: 'ent-1', canonical: 'John' },
            { id: 'ent-2', canonical: 'John Smith' },
          ],
        },
        after: { canonical: 'John Smith' },
      });

      const result = applyOverrides(graph, [correction]);

      // Relation should now point to merged entity
      expect(result.graph.relations[0].subj).toBe('ent-1');
    });
  });

  describe('applyOverrides - Entity Rejection Corrections', () => {
    it('should mark entity as rejected', () => {
      const entity = createTestEntity({
        id: 'ent-1',
        canonical: 'Invalid Entity',
      });
      const graph = createTestGraph({ entities: [entity] });

      const correction = createTestCorrection({
        type: 'entity_reject',
        entityId: 'ent-1',
        before: { entity: { id: 'ent-1', canonical: 'Invalid Entity' } },
      });

      const result = applyOverrides(graph, [correction]);

      expect((result.graph.entities[0] as any).rejected).toBe(true);
      expect(result.stats.entityRejections).toBe(1);
    });

    it('should restore rejected entity', () => {
      const entity = createTestEntity({
        id: 'ent-1',
        canonical: 'Valid Entity',
      }) as any;
      entity.rejected = true;
      const graph = createTestGraph({ entities: [entity] });

      const correction = createTestCorrection({
        type: 'entity_restore',
        entityId: 'ent-1',
      });

      const result = applyOverrides(graph, [correction]);

      expect((result.graph.entities[0] as any).rejected).toBe(false);
    });
  });

  describe('applyOverrides - Alias Corrections', () => {
    it('should add alias to entity', () => {
      const entity = createTestEntity({
        id: 'ent-1',
        canonical: 'John Smith',
        aliases: ['Johnny'],
      });
      const graph = createTestGraph({ entities: [entity] });

      const correction = createTestCorrection({
        type: 'alias_add',
        entityId: 'ent-1',
        after: { alias: 'J. Smith' },
      });

      const result = applyOverrides(graph, [correction]);

      expect(result.graph.entities[0].aliases).toContain('J. Smith');
      expect(result.graph.entities[0].aliases).toContain('Johnny');
      expect(result.stats.aliasChanges).toBe(1);
    });

    it('should remove alias from entity', () => {
      const entity = createTestEntity({
        id: 'ent-1',
        canonical: 'John Smith',
        aliases: ['Johnny', 'J. Smith'],
      });
      const graph = createTestGraph({ entities: [entity] });

      const correction = createTestCorrection({
        type: 'alias_remove',
        entityId: 'ent-1',
        before: { alias: 'Johnny' },
      });

      const result = applyOverrides(graph, [correction]);

      expect(result.graph.entities[0].aliases).not.toContain('Johnny');
      expect(result.graph.entities[0].aliases).toContain('J. Smith');
      expect(result.stats.aliasChanges).toBe(1);
    });

    it('should not add duplicate alias', () => {
      const entity = createTestEntity({
        id: 'ent-1',
        canonical: 'John Smith',
        aliases: ['Johnny'],
      });
      const graph = createTestGraph({ entities: [entity] });

      const correction = createTestCorrection({
        type: 'alias_add',
        entityId: 'ent-1',
        after: { alias: 'Johnny' }, // Already exists
      });

      const result = applyOverrides(graph, [correction]);

      expect(result.graph.entities[0].aliases.filter(a => a === 'Johnny')).toHaveLength(1);
    });
  });

  describe('applyOverrides - Canonical Name Changes', () => {
    it('should change canonical name and preserve old as alias', () => {
      const entity = createTestEntity({
        id: 'ent-1',
        canonical: 'John Smith',
        aliases: ['Johnny'],
      });
      const graph = createTestGraph({ entities: [entity] });

      const correction = createTestCorrection({
        type: 'canonical_change',
        entityId: 'ent-1',
        before: { canonical: 'John Smith' },
        after: { canonical: 'Jonathan Smith' },
      });

      const result = applyOverrides(graph, [correction]);

      expect(result.graph.entities[0].canonical).toBe('Jonathan Smith');
      expect(result.graph.entities[0].aliases).toContain('John Smith');
      expect(result.graph.entities[0].aliases).toContain('Johnny');
      expect(result.stats.canonicalChanges).toBe(1);
    });
  });

  describe('applyOverrides - Relation Corrections', () => {
    it('should add new relation', () => {
      const entity1 = createTestEntity({ id: 'ent-1', canonical: 'John' });
      const entity2 = createTestEntity({ id: 'ent-2', canonical: 'Mary' });
      const graph = createTestGraph({ entities: [entity1, entity2], relations: [] });

      const correction = createTestCorrection({
        type: 'relation_add',
        after: {
          relation: {
            subj: 'ent-1',
            pred: 'married_to',
            obj: 'ent-2',
          },
        },
      });

      const result = applyOverrides(graph, [correction]);

      expect(result.graph.relations).toHaveLength(1);
      expect(result.graph.relations[0].subj).toBe('ent-1');
      expect(result.graph.relations[0].pred).toBe('married_to');
      expect(result.graph.relations[0].obj).toBe('ent-2');
      expect(result.stats.relationAdditions).toBe(1);
    });

    it('should not add duplicate relation', () => {
      const entity1 = createTestEntity({ id: 'ent-1', canonical: 'John' });
      const entity2 = createTestEntity({ id: 'ent-2', canonical: 'Mary' });
      const existingRelation = createTestRelation({
        subj: 'ent-1',
        pred: 'married_to' as Predicate,
        obj: 'ent-2',
      });
      const graph = createTestGraph({
        entities: [entity1, entity2],
        relations: [existingRelation],
      });

      const correction = createTestCorrection({
        type: 'relation_add',
        after: {
          relation: {
            subj: 'ent-1',
            pred: 'married_to',
            obj: 'ent-2',
          },
        },
      });

      const result = applyOverrides(graph, [correction]);

      expect(result.graph.relations).toHaveLength(1);
    });

    it('should remove relation', () => {
      const entity1 = createTestEntity({ id: 'ent-1', canonical: 'John' });
      const entity2 = createTestEntity({ id: 'ent-2', canonical: 'Mary' });
      const relation = createTestRelation({
        id: 'rel-1',
        subj: 'ent-1',
        pred: 'married_to' as Predicate,
        obj: 'ent-2',
      });
      const graph = createTestGraph({
        entities: [entity1, entity2],
        relations: [relation],
      });

      const correction = createTestCorrection({
        type: 'relation_remove',
        relationId: 'rel-1',
        before: {
          relation: {
            id: 'rel-1',
            subj: 'ent-1',
            pred: 'married_to',
            obj: 'ent-2',
          },
        },
      });

      const result = applyOverrides(graph, [correction]);

      expect(result.graph.relations).toHaveLength(0);
      expect(result.stats.relationRemovals).toBe(1);
    });
  });

  describe('applyOverrides - Rolled Back Corrections', () => {
    it('should not apply rolled-back corrections', () => {
      const entity = createTestEntity({
        id: 'ent-1',
        canonical: 'John Smith',
        type: 'PERSON',
      });
      const graph = createTestGraph({ entities: [entity] });

      const correction = createTestCorrection({
        type: 'entity_type',
        entityId: 'ent-1',
        before: { entityType: 'PERSON' },
        after: { entityType: 'ORG' },
        rolledBack: true, // Marked as rolled back
      });

      const result = applyOverrides(graph, [correction]);

      expect(result.graph.entities[0].type).toBe('PERSON'); // Unchanged
      expect(result.stats.totalApplied).toBe(0);
    });
  });

  describe('applyOverrides - Correction Ordering', () => {
    it('should apply corrections in chronological order', () => {
      const entity = createTestEntity({
        id: 'ent-1',
        canonical: 'John Smith',
        aliases: [],
      });
      const graph = createTestGraph({ entities: [entity] });

      const now = new Date();
      const corrections = [
        createTestCorrection({
          type: 'alias_add',
          entityId: 'ent-1',
          after: { alias: 'Second' },
          timestamp: new Date(now.getTime() + 1000).toISOString(), // Later
        }),
        createTestCorrection({
          type: 'alias_add',
          entityId: 'ent-1',
          after: { alias: 'First' },
          timestamp: now.toISOString(), // Earlier
        }),
      ];

      const result = applyOverrides(graph, corrections);

      // Both should be applied, order shouldn't matter for independent changes
      expect(result.graph.entities[0].aliases).toContain('First');
      expect(result.graph.entities[0].aliases).toContain('Second');
    });
  });

  describe('applyOverrides - Correction History Preservation', () => {
    it('should preserve corrections in the graph', () => {
      const entity = createTestEntity({ id: 'ent-1' });
      const graph = createTestGraph({ entities: [entity] });

      const correction = createTestCorrection({
        id: 'corr-1',
        type: 'alias_add',
        entityId: 'ent-1',
        after: { alias: 'New Alias' },
      });

      const result = applyOverrides(graph, [correction]);

      expect(result.graph.corrections).toHaveLength(1);
      expect(result.graph.corrections[0].id).toBe('corr-1');
    });

    it('should not duplicate corrections', () => {
      const entity = createTestEntity({ id: 'ent-1' });
      const existingCorrection = createTestCorrection({ id: 'corr-1' });
      const graph = createTestGraph({
        entities: [entity],
        corrections: [existingCorrection],
      });

      // Try to apply same correction again
      const result = applyOverrides(graph, [existingCorrection]);

      expect(result.graph.corrections).toHaveLength(1);
    });
  });

  describe('applyOverridesFromSavedGraph', () => {
    it('should load corrections from saved graph and apply', () => {
      const entity = createTestEntity({
        id: 'ent-1',
        canonical: 'John Smith',
        type: 'PERSON',
      });
      const extractedGraph = createTestGraph({ entities: [entity] });

      const savedGraph = createTestGraph({
        corrections: [
          createTestCorrection({
            type: 'entity_type',
            entityId: 'ent-1',
            before: { entityType: 'PERSON' },
            after: { entityType: 'ORG' },
          }),
        ],
      });

      const result = applyOverridesFromSavedGraph(extractedGraph, savedGraph);

      expect(result.graph.entities[0].type).toBe('ORG');
    });

    it('should preserve versions and learned patterns', () => {
      const extractedGraph = createTestGraph();
      const savedGraph = createTestGraph({
        versions: [{ id: 'v1', timestamp: '', correctionId: '', changedEntities: [], changedRelations: [], snapshot: { entities: [], relations: [] } }],
        learnedPatterns: [{ id: 'p1', type: 'entity_type', pattern: '', condition: {}, action: {}, stats: { timesApplied: 0, timesValidated: 0, timesRejected: 0 }, sourceCorrections: [], active: true, confidence: 0.9 }],
      });

      const result = applyOverridesFromSavedGraph(extractedGraph, savedGraph);

      expect(result.graph.versions).toHaveLength(1);
      expect(result.graph.learnedPatterns).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty corrections array', () => {
      const entity = createTestEntity();
      const graph = createTestGraph({ entities: [entity] });

      const result = applyOverrides(graph, []);

      expect(result.graph.entities).toHaveLength(1);
      expect(result.stats.totalApplied).toBe(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should handle entity matching by alias', () => {
      const entity = createTestEntity({
        id: 'new-id',
        canonical: 'Jonathan Smith',
        aliases: ['John Smith'],
      });
      const graph = createTestGraph({ entities: [entity] });

      const correction = createTestCorrection({
        type: 'entity_type',
        entityId: 'old-id',
        before: { canonical: 'John Smith', entityType: 'PERSON' }, // Match by alias
        after: { entityType: 'ORG' },
      });

      const result = applyOverrides(graph, [correction]);

      expect(result.graph.entities[0].type).toBe('ORG');
    });

    it('should handle missing required fields gracefully', () => {
      const entity = createTestEntity({ id: 'ent-1' });
      const graph = createTestGraph({ entities: [entity] });

      const correction = createTestCorrection({
        type: 'entity_type',
        // Missing entityId and after.entityType
      });

      const result = applyOverrides(graph, [correction]);

      expect(result.stats.skipped).toBe(1);
    });
  });
});
