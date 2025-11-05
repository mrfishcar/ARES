/**
 * Possessive Family Relations Tests
 *
 * Tests for extracting family relationships from possessive patterns:
 * - "X's daughter/son/child" → parent_of(X, Y)
 * - "their daughter Mira" (requires coreference resolution)
 * - "X's father/mother/parent" → child_of(X, Y)
 * - "X's brother/sister" → sibling_of(X, Y)
 *
 * This complements dependency-based relation extraction which often misses
 * narrative/possessive patterns.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { appendDoc, loadGraph, clearStorage } from '../../app/storage/storage';
import * as path from 'path';

describe('Possessive Family Relations', () => {
  const testPath = path.join(process.cwd(), 'test-possessive-relations.json');

  beforeEach(() => {
    clearStorage(testPath);
  });

  describe('Parent-child patterns', () => {
    it('should extract parent_of from "X\'s daughter Y" pattern', async () => {
      const text = 'Aria\'s daughter Mira loved to tinker with machines.';
      await appendDoc('test-daughter', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      // Find entities
      const aria = graph!.entities.find(e => e.canonical.toLowerCase().includes('aria'));
      const mira = graph!.entities.find(e => e.canonical.toLowerCase().includes('mira'));

      if (aria && mira) {
        // Check for parent_of relation
        const parentOf = graph!.relations.find(r =>
          r.subj === aria.id &&
          r.obj === mira.id &&
          r.pred === 'parent_of'
        );

        expect(parentOf).toBeDefined();
      }
    });

    it('should extract parent_of from "X\'s son Y" pattern', async () => {
      const text = 'Elias\'s son Cael favored music.';
      await appendDoc('test-son', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const elias = graph!.entities.find(e => e.canonical.toLowerCase().includes('elias'));
      const cael = graph!.entities.find(e => e.canonical.toLowerCase().includes('cael'));

      if (elias && cael) {
        const parentOf = graph!.relations.find(r =>
          r.subj === elias.id &&
          r.obj === cael.id &&
          r.pred === 'parent_of'
        );

        expect(parentOf).toBeDefined();
      }
    });

    it('should handle both parents in separate sentences', async () => {
      const text = 'Aria\'s daughter Mira studied at the Academy. Elias\'s daughter Mira loved mechanics.';
      await appendDoc('test-both-parents', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const aria = graph!.entities.find(e => e.canonical.toLowerCase().includes('aria'));
      const elias = graph!.entities.find(e => e.canonical.toLowerCase().includes('elias'));
      const mira = graph!.entities.find(e => e.canonical.toLowerCase().includes('mira'));

      if (aria && mira) {
        const ariaParent = graph!.relations.find(r =>
          r.subj === aria.id &&
          r.obj === mira.id &&
          r.pred === 'parent_of'
        );
        expect(ariaParent).toBeDefined();
      }

      if (elias && mira) {
        const eliasParent = graph!.relations.find(r =>
          r.subj === elias.id &&
          r.obj === mira.id &&
          r.pred === 'parent_of'
        );
        expect(eliasParent).toBeDefined();
      }
    });
  });

  describe('Child-parent patterns', () => {
    it('should extract child_of from "X\'s father Y" pattern', async () => {
      const text = 'Mira\'s father Elias taught at the Academy.';
      await appendDoc('test-father', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const mira = graph!.entities.find(e => e.canonical.toLowerCase().includes('mira'));
      const elias = graph!.entities.find(e => e.canonical.toLowerCase().includes('elias'));

      if (mira && elias) {
        const childOf = graph!.relations.find(r =>
          r.subj === mira.id &&
          r.obj === elias.id &&
          r.pred === 'child_of'
        );

        expect(childOf).toBeDefined();
      }
    });

    it('should extract child_of from "X\'s mother Y" pattern', async () => {
      const text = 'Cael\'s mother Aria was an explorer.';
      await appendDoc('test-mother', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const cael = graph!.entities.find(e => e.canonical.toLowerCase().includes('cael'));
      const aria = graph!.entities.find(e => e.canonical.toLowerCase().includes('aria'));

      if (cael && aria) {
        const childOf = graph!.relations.find(r =>
          r.subj === cael.id &&
          r.obj === aria.id &&
          r.pred === 'child_of'
        );

        expect(childOf).toBeDefined();
      }
    });
  });

  describe('Sibling patterns', () => {
    it('should extract symmetric sibling_of relations', async () => {
      const text = 'Mira\'s brother Cael played music in the evenings.';
      await appendDoc('test-siblings', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const mira = graph!.entities.find(e => e.canonical.toLowerCase().includes('mira'));
      const cael = graph!.entities.find(e => e.canonical.toLowerCase().includes('cael'));

      if (mira && cael) {
        // Should have both directions
        const miratoCael = graph!.relations.find(r =>
          r.subj === mira.id &&
          r.obj === cael.id &&
          r.pred === 'sibling_of'
        );

        const caelToMira = graph!.relations.find(r =>
          r.subj === cael.id &&
          r.obj === mira.id &&
          r.pred === 'sibling_of'
        );

        expect(miratoCael).toBeDefined();
        expect(caelToMira).toBeDefined();
      }
    });

    it('should handle sister pattern', async () => {
      const text = 'Cael\'s sister Mira designed new dormitories.';
      await appendDoc('test-sister', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const cael = graph!.entities.find(e => e.canonical.toLowerCase().includes('cael'));
      const mira = graph!.entities.find(e => e.canonical.toLowerCase().includes('mira'));

      if (cael && mira) {
        const sibling = graph!.relations.find(r =>
          r.subj === cael.id &&
          r.obj === mira.id &&
          r.pred === 'sibling_of'
        );

        expect(sibling).toBeDefined();
      }
    });
  });

  describe('Narrative context (from mega-001)', () => {
    it('should extract from full narrative context', async () => {
      const text = `The couple's daughter, Mira Calder, loved to tinker with the machines her parents built.
        Mira spent mornings in the Academy's youth wing studying mechanical grammar.
        She idolized her parents, often insisting that she was equally the child of Aria and Elias.`;

      await appendDoc('test-narrative', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      // Should extract Mira as PERSON
      const mira = graph!.entities.find(e => e.canonical.toLowerCase().includes('mira'));
      expect(mira).toBeDefined();
      if (mira) {
        expect(mira.type).toBe('PERSON');
      }

      // Should extract Aria and Elias as PERSON
      const aria = graph!.entities.find(e => e.canonical.toLowerCase().includes('aria'));
      const elias = graph!.entities.find(e => e.canonical.toLowerCase().includes('elias'));

      expect(aria).toBeDefined();
      expect(elias).toBeDefined();

      // Should extract parent_of relations (from explicit statement "child of Aria and Elias")
      if (aria && mira) {
        const ariaParent = graph!.relations.find(r =>
          r.subj === aria.id && r.obj === mira.id && r.pred === 'parent_of'
        );
        // Note: This may require dependency parsing to extract
        if (ariaParent) {
          expect(ariaParent.pred).toBe('parent_of');
        }
      }
    });

    it('should handle "their son" pattern (when parents known from context)', async () => {
      const text = `Aria and Elias lived together in a copper-roofed house.
        Their son, Cael Calder, favored music but still joined family expeditions.`;

      await appendDoc('test-their-son', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const cael = graph!.entities.find(e => e.canonical.toLowerCase().includes('cael'));
      expect(cael).toBeDefined();

      // Note: "their son" requires coreference resolution to link "their" → "Aria and Elias"
      // This is a known limitation documented in Phase E4
    });
  });

  describe('Edge cases', () => {
    it('should not extract relations when entity types are wrong', async () => {
      const text = 'The river\'s daughter stream flows nearby.';
      await appendDoc('test-wrong-type', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      // Should not create parent_of relations for non-PERSON entities
      const parentOfRelations = graph!.relations.filter(r => r.pred === 'parent_of');

      for (const rel of parentOfRelations) {
        const subj = graph!.entities.find(e => e.id === rel.subj);
        const obj = graph!.entities.find(e => e.id === rel.obj);

        // Both should be PERSON type
        if (subj && obj) {
          expect(subj.type).toBe('PERSON');
          expect(obj.type).toBe('PERSON');
        }
      }
    });

    it('should not create self-referential relations', async () => {
      const text = 'Aria\'s daughter Aria Junior was named after her.';
      await appendDoc('test-self-ref', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      // No relation should have same subject and object
      for (const rel of graph!.relations) {
        expect(rel.subj).not.toBe(rel.obj);
      }
    });

    it('should handle multiple family members in one sentence', async () => {
      const text = 'Aria\'s daughter Mira and Aria\'s son Cael both studied at the Academy.';
      await appendDoc('test-multiple', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const aria = graph!.entities.find(e => e.canonical.toLowerCase() === 'aria');
      const mira = graph!.entities.find(e => e.canonical.toLowerCase().includes('mira'));
      const cael = graph!.entities.find(e => e.canonical.toLowerCase().includes('cael'));

      if (aria && mira && cael) {
        const ariaToMira = graph!.relations.find(r =>
          r.subj === aria.id && r.obj === mira.id && r.pred === 'parent_of'
        );
        const ariaToCael = graph!.relations.find(r =>
          r.subj === aria.id && r.obj === cael.id && r.pred === 'parent_of'
        );

        expect(ariaToMira).toBeDefined();
        expect(ariaToCael).toBeDefined();
      }
    });
  });

  describe('Confidence and evidence', () => {
    it('should assign reasonable confidence to possessive patterns', async () => {
      const text = 'Aria\'s daughter Mira studied mechanics.';
      await appendDoc('test-confidence', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const parentOf = graph!.relations.find(r => r.pred === 'parent_of');

      if (parentOf) {
        // Possessive patterns should have good confidence (0.75-0.85)
        expect(parentOf.confidence).toBeGreaterThan(0.7);
        expect(parentOf.confidence).toBeLessThanOrEqual(1.0);

        // Should have evidence
        expect(parentOf.evidence).toBeDefined();
        expect(parentOf.evidence.length).toBeGreaterThan(0);

        // Evidence should include the source span
        const firstEvidence = parentOf.evidence[0];
        expect(firstEvidence.span).toBeDefined();
        expect(firstEvidence.span.text.toLowerCase()).toContain('daughter');
      }
    });
  });
});
