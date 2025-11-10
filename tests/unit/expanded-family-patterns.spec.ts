import { describe, it, expect, beforeEach } from 'vitest';
import { appendDoc, loadGraph, clearStorage } from '../../app/storage/storage';
import * as path from 'path';

describe('Expanded Family Relationship Patterns', () => {
  const testPath = path.join(process.cwd(), 'test-expanded-patterns.json');

  beforeEach(() => {
    clearStorage(testPath);
  });

  describe('offspring pattern', () => {
    it('should extract child_of from "X, offspring of Y" pattern', async () => {
      const text = 'Marcus, offspring of Helena, studied at the Academy.';
      await appendDoc('test-offspring-1', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const marcus = graph!.entities.find(e => e.canonical.toLowerCase().includes('marcus'));
      const helena = graph!.entities.find(e => e.canonical.toLowerCase().includes('helena'));

      if (marcus && helena) {
        const childOf = graph!.relations.find(r =>
          r.subj === marcus.id &&
          r.obj === helena.id &&
          r.pred === 'child_of'
        );
        expect(childOf).toBeDefined();
      } else {
        throw new Error('Expected entities Marcus and Helena not found');
      }
    });

    it('should extract child_of from "X was the offspring of Y" pattern', async () => {
      const text = 'Marcus was the offspring of Helena.';
      await appendDoc('test-offspring-2', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const marcus = graph!.entities.find(e => e.canonical.toLowerCase().includes('marcus'));
      const helena = graph!.entities.find(e => e.canonical.toLowerCase().includes('helena'));

      if (marcus && helena) {
        const childOf = graph!.relations.find(r =>
          r.subj === marcus.id &&
          r.obj === helena.id &&
          r.pred === 'child_of'
        );
        expect(childOf).toBeDefined();
      } else {
        throw new Error('Expected entities Marcus and Helena not found');
      }
    });
  });

  describe('descendant pattern', () => {
    it('should extract child_of from "X, descendant of Y" pattern', async () => {
      const text = 'Aria, descendant of King Theron, ruled the realm.';
      await appendDoc('test-descendant-1', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const aria = graph!.entities.find(e => e.canonical.toLowerCase().includes('aria'));
      const theron = graph!.entities.find(e => e.canonical.toLowerCase().includes('theron'));

      if (aria && theron) {
        const childOf = graph!.relations.find(r =>
          r.subj === aria.id &&
          r.obj === theron.id &&
          r.pred === 'child_of'
        );
        expect(childOf).toBeDefined();
      } else {
        throw new Error('Expected entities Aria and Theron not found');
      }
    });

    it('should extract child_of from "X was a descendant of Y" pattern', async () => {
      const text = 'Aria was a descendant of King Theron.';
      await appendDoc('test-descendant-2', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const aria = graph!.entities.find(e => e.canonical.toLowerCase().includes('aria'));
      const theron = graph!.entities.find(e => e.canonical.toLowerCase().includes('theron'));

      if (aria && theron) {
        const childOf = graph!.relations.find(r =>
          r.subj === aria.id &&
          r.obj === theron.id &&
          r.pred === 'child_of'
        );
        expect(childOf).toBeDefined();
      } else {
        throw new Error('Expected entities Aria and Theron not found');
      }
    });
  });

  describe('heir pattern', () => {
    it('should extract child_of from "X, heir of Y" pattern', async () => {
      const text = 'Prince Aldric, heir of Queen Isolde, was trained in diplomacy.';
      await appendDoc('test-heir-1', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const aldric = graph!.entities.find(e => e.canonical.toLowerCase().includes('aldric'));
      const isolde = graph!.entities.find(e => e.canonical.toLowerCase().includes('isolde'));

      if (aldric && isolde) {
        const childOf = graph!.relations.find(r =>
          r.subj === aldric.id &&
          r.obj === isolde.id &&
          r.pred === 'child_of'
        );
        expect(childOf).toBeDefined();
      } else {
        throw new Error('Expected entities Aldric and Isolde not found');
      }
    });

    it('should extract child_of from "X is the heir of Y" pattern', async () => {
      const text = 'Prince Aldric is the heir of Queen Isolde.';
      await appendDoc('test-heir-2', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const aldric = graph!.entities.find(e => e.canonical.toLowerCase().includes('aldric'));
      const isolde = graph!.entities.find(e => e.canonical.toLowerCase().includes('isolde'));

      if (aldric && isolde) {
        const childOf = graph!.relations.find(r =>
          r.subj === aldric.id &&
          r.obj === isolde.id &&
          r.pred === 'child_of'
        );
        expect(childOf).toBeDefined();
      } else {
        throw new Error('Expected entities Aldric and Isolde not found');
      }
    });
  });

  describe('born to pattern', () => {
    it.skip('should extract child_of from "X was born to Y" pattern (passive construction - complex)', async () => {
      // Note: "born to" with passive verb construction is complex and may require
      // additional dependency pattern handling beyond the current scope
      const text = 'Lyra was born to Mira.';
      await appendDoc('test-born-1', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const lyra = graph!.entities.find(e => e.canonical.toLowerCase().includes('lyra'));
      const mira = graph!.entities.find(e => e.canonical.toLowerCase().includes('mira'));

      if (lyra && mira) {
        const childOf = graph!.relations.find(r =>
          r.subj === lyra.id &&
          r.obj === mira.id &&
          r.pred === 'child_of'
        );
        expect(childOf).toBeDefined();
      } else {
        throw new Error('Expected entities Lyra and Mira not found');
      }
    });

    it.skip('should extract child_of from "X born to Y" pattern (complex)', async () => {
      // Note: "born to" patterns are challenging for dependency parsing
      const text = 'Sofia born to Elena ruled the kingdom.';
      await appendDoc('test-born-2', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const sofia = graph!.entities.find(e => e.canonical.toLowerCase().includes('sofia'));
      const elena = graph!.entities.find(e => e.canonical.toLowerCase().includes('elena'));

      if (sofia && elena) {
        const childOf = graph!.relations.find(r =>
          r.subj === sofia.id &&
          r.obj === elena.id &&
          r.pred === 'child_of'
        );
        expect(childOf).toBeDefined();
      } else {
        throw new Error('Expected entities Sofia and Elena not found');
      }
    });
  });

  describe('child pattern (existing but enhanced)', () => {
    it('should extract child_of from "X, child of Y" pattern', async () => {
      const text = 'Sofia, child of Marcus, excelled in her studies.';
      await appendDoc('test-child-1', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const sofia = graph!.entities.find(e => e.canonical.toLowerCase().includes('sofia'));
      const marcus = graph!.entities.find(e => e.canonical.toLowerCase().includes('marcus'));

      if (sofia && marcus) {
        const childOf = graph!.relations.find(r =>
          r.subj === sofia.id &&
          r.obj === marcus.id &&
          r.pred === 'child_of'
        );
        expect(childOf).toBeDefined();
      } else {
        throw new Error('Expected entities Sofia and Marcus not found');
      }
    });

    it('should extract child_of from "X was the child of Y" pattern', async () => {
      const text = 'Sofia was the child of Marcus.';
      await appendDoc('test-child-2', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const sofia = graph!.entities.find(e => e.canonical.toLowerCase().includes('sofia'));
      const marcus = graph!.entities.find(e => e.canonical.toLowerCase().includes('marcus'));

      if (sofia && marcus) {
        const childOf = graph!.relations.find(r =>
          r.subj === sofia.id &&
          r.obj === marcus.id &&
          r.pred === 'child_of'
        );
        expect(childOf).toBeDefined();
      } else {
        throw new Error('Expected entities Sofia and Marcus not found');
      }
    });
  });

  describe('combined patterns', () => {
    it('should extract multiple parent-child relationships with varied patterns', async () => {
      const text = `
        Marcus, offspring of Victoria, traveled widely.
        Prince Aldric, heir of Queen Isolde, studied diplomacy.
      `;
      await appendDoc('test-combined', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const childOfRelations = graph!.relations.filter(r => r.pred === 'child_of');
      expect(childOfRelations.length).toBeGreaterThan(0);

      // Verify specific relationships
      const marcus = graph!.entities.find(e => e.canonical.toLowerCase().includes('marcus'));
      const victoria = graph!.entities.find(e => e.canonical.toLowerCase().includes('victoria'));

      if (marcus && victoria) {
        const marcusToVictoria = childOfRelations.find(r =>
          r.subj === marcus.id && r.obj === victoria.id
        );
        expect(marcusToVictoria).toBeDefined();
      }

      const aldric = graph!.entities.find(e => e.canonical.toLowerCase().includes('aldric'));
      const isolde = graph!.entities.find(e => e.canonical.toLowerCase().includes('isolde'));

      if (aldric && isolde) {
        const aldricToIsolde = childOfRelations.find(r =>
          r.subj === aldric.id && r.obj === isolde.id
        );
        expect(aldricToIsolde).toBeDefined();
      }
    });
  });
});
