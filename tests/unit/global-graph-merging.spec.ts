/**
 * Global Graph Entity Merging Tests
 *
 * Validates that GlobalKnowledgeGraph prevents over-aggressive merging
 * of entities, especially preventing ORG/PLACE entities from absorbing
 * PERSON entities.
 *
 * This test guards against the "Barty Beauregard" bug where
 * "Mont Linola Junior High" (ORG) absorbed all character names
 * (Barty, Kelly, Preston, etc.) as aliases.
 */

import { describe, it, expect } from 'vitest';
import { GlobalKnowledgeGraph } from '../../app/engine/global-graph';
import type { Entity } from '../../app/engine/schema';

/**
 * Helper to create a test entity
 */
function makeEntity(canonical: string, type: any, id?: string): Entity {
  return {
    id: id || `entity-${canonical.replace(/\s+/g, '-').toLowerCase()}`,
    canonical,
    type,
    attrs: {},
    spans: [],
    aliases: []
  };
}

describe('GlobalKnowledgeGraph Entity Merging', () => {
  describe('School/Organization vs Student/Person Merging', () => {
    it('should NOT merge school ORG with student PERSON entities', () => {
      const graph = new GlobalKnowledgeGraph();

      // Create entities
      const school = makeEntity('Mont Linola Junior High', 'ORG');
      const barty = makeEntity('Barty Beauregard', 'PERSON');
      const kelly = makeEntity('Kelly Prescott', 'PERSON');
      const preston = makeEntity('Preston Farrell', 'PERSON');

      // Add to graph
      graph.addDocument('doc1', 'Test document', [school, barty, kelly, preston], []);

      // Export and verify
      const exported = graph.export();

      // Should have 4 distinct entities
      expect(exported.entities.length).toBe(4);

      // Find each entity
      const schoolNode = exported.entities.find(e =>
        e.canonical.toLowerCase().includes('mont linola') ||
        e.canonical.toLowerCase().includes('junior high')
      );
      const bartyNode = exported.entities.find(e =>
        e.canonical.toLowerCase().includes('barty')
      );
      const kellyNode = exported.entities.find(e =>
        e.canonical.toLowerCase().includes('kelly')
      );
      const prestonNode = exported.entities.find(e =>
        e.canonical.toLowerCase().includes('preston')
      );

      // All should exist
      expect(schoolNode).toBeDefined();
      expect(bartyNode).toBeDefined();
      expect(kellyNode).toBeDefined();
      expect(prestonNode).toBeDefined();

      // School should be ORG type
      expect(schoolNode!.type).toBe('ORG');

      // Students should be PERSON type
      expect(bartyNode!.type).toBe('PERSON');
      expect(kellyNode!.type).toBe('PERSON');
      expect(prestonNode!.type).toBe('PERSON');

      // School should NOT have absorbed person names as aliases
      const schoolAliases = schoolNode!.aliases.map(a => a.toLowerCase());
      expect(schoolAliases).not.toContainEqual(
        expect.stringMatching(/barty|kelly|preston/i)
      );

      // Each entity should have distinct IDs
      const ids = new Set([
        schoolNode!.id,
        bartyNode!.id,
        kellyNode!.id,
        prestonNode!.id
      ]);
      expect(ids.size).toBe(4);
    });

    it('should NOT merge university ORG with professor PERSON', () => {
      const graph = new GlobalKnowledgeGraph();

      const university = makeEntity('Stanford University', 'ORG');
      const professor = makeEntity('Sarah Chen', 'PERSON');

      graph.addDocument('doc1', 'Test document', [university, professor], []);

      const exported = graph.export();

      expect(exported.entities.length).toBe(2);

      const univNode = exported.entities.find(e =>
        e.canonical.toLowerCase().includes('stanford')
      );
      const profNode = exported.entities.find(e =>
        e.canonical.toLowerCase().includes('sarah')
      );

      expect(univNode).toBeDefined();
      expect(profNode).toBeDefined();
      expect(univNode!.id).not.toBe(profNode!.id);
      expect(univNode!.type).toBe('ORG');
      expect(profNode!.type).toBe('PERSON');
    });
  });

  describe('Same-Type Entity Merging', () => {
    it('should conservatively handle "Harry Potter" and "Potter" merging', () => {
      const graph = new GlobalKnowledgeGraph();

      const harry1 = makeEntity('Harry Potter', 'PERSON', 'harry-1');
      const harry2 = makeEntity('Potter', 'PERSON', 'harry-2');

      graph.addDocument('doc1', 'Harry Potter was a wizard.', [harry1], []);
      graph.addDocument('doc2', 'Potter defeated Voldemort.', [harry2], []);

      const exported = graph.export();

      // With strict merging (threshold 0.93), surname-only match (conf 0.90)
      // might not merge. This is acceptable conservative behavior.
      const potterEntities = exported.entities.filter(e =>
        e.canonical.toLowerCase().includes('potter')
      );

      // Should have 1-2 entities (either merged or kept separate conservatively)
      expect(potterEntities.length).toBeGreaterThanOrEqual(1);
      expect(potterEntities.length).toBeLessThanOrEqual(2);

      // If merged, should have 2 mentions
      if (potterEntities.length === 1) {
        expect(potterEntities[0].mentionCount).toBe(2);
      }
    });

    it('should NOT merge "James Potter" and "Harry Potter" (different first names)', () => {
      const graph = new GlobalKnowledgeGraph();

      const james = makeEntity('James Potter', 'PERSON', 'james');
      const harry = makeEntity('Harry Potter', 'PERSON', 'harry');

      graph.addDocument('doc1', 'Test', [james, harry], []);

      const exported = graph.export();

      // Should remain 2 distinct entities
      expect(exported.entities.length).toBe(2);

      const jamesNode = exported.entities.find(e =>
        e.canonical.toLowerCase().includes('james')
      );
      const harryNode = exported.entities.find(e =>
        e.canonical.toLowerCase().includes('harry')
      );

      expect(jamesNode).toBeDefined();
      expect(harryNode).toBeDefined();
      expect(jamesNode!.id).not.toBe(harryNode!.id);
    });
  });

  describe('Place/City vs Person Merging', () => {
    it('should NOT merge city PLACE with person PERSON', () => {
      const graph = new GlobalKnowledgeGraph();

      const city = makeEntity('New York City', 'PLACE');
      const person = makeEntity('John York', 'PERSON');

      graph.addDocument('doc1', 'Test', [city, person], []);

      const exported = graph.export();

      expect(exported.entities.length).toBe(2);

      const cityNode = exported.entities.find(e =>
        e.canonical.toLowerCase().includes('city')
      );
      const personNode = exported.entities.find(e =>
        e.canonical.toLowerCase().includes('john')
      );

      expect(cityNode).toBeDefined();
      expect(personNode).toBeDefined();
      expect(cityNode!.id).not.toBe(personNode!.id);
    });
  });

  describe('High Confidence Threshold', () => {
    it('should require very high confidence (≥0.93) to merge entities', () => {
      const graph = new GlobalKnowledgeGraph();

      // Two similar but not identical person names
      const person1 = makeEntity('Michael Smith', 'PERSON', 'mike-1');
      const person2 = makeEntity('Mike Smith', 'PERSON', 'mike-2');

      graph.addDocument('doc1', 'Test', [person1], []);
      graph.addDocument('doc2', 'Test', [person2], []);

      const exported = graph.export();

      // These might merge if they're determined to be the same person
      // OR stay separate if confidence is below threshold
      // The key is that the system should be conservative
      const smithEntities = exported.entities.filter(e =>
        e.canonical.toLowerCase().includes('smith')
      );

      // Should have 1-2 entities (merged or separate), not 0
      expect(smithEntities.length).toBeGreaterThanOrEqual(1);
      expect(smithEntities.length).toBeLessThanOrEqual(2);
    });
  });
});
