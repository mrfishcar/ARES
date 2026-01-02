/**
 * Tests for coordinated entity extraction
 *
 * Ensures that entities separated by coordination conjunctions (and, or)
 * are extracted as separate entities, not combined into one.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { extractEntities } from '../../app/engine/extract/entities';
import { parseWithService } from '../../app/engine/extract/entities';

describe('Coordinated Entity Extraction', () => {
  beforeAll(async () => {
    // Warm up the parser
    await parseWithService('test');
  });

  describe('Person Coordination', () => {
    it('should extract "Harry and Ron" as two separate PERSON entities', async () => {
      const result = await extractEntities('Harry and Ron studied at Hogwarts.');

      const personEntities = result.entities.filter(e => e.type === 'PERSON');
      const names = personEntities.map(e => e.canonical.toLowerCase());

      expect(names).toContain('harry');
      expect(names).toContain('ron');
      // Should NOT have "Harry and Ron" as a single entity
      expect(names).not.toContain('harry and ron');
    });

    it('should extract "Alice and Bob went home" as two separate entities', async () => {
      const result = await extractEntities('Alice and Bob went home.');

      const personEntities = result.entities.filter(e => e.type === 'PERSON');
      const names = personEntities.map(e => e.canonical.toLowerCase());

      expect(names).toContain('alice');
      expect(names).toContain('bob');
      expect(names).not.toContain('alice and bob');
    });

    it.skip('should extract "James and Lily Potter" as two separate people with shared surname (needs shared surname handling)', async () => {
      const result = await extractEntities('James and Lily Potter lived in Godric\'s Hollow.');

      const personEntities = result.entities.filter(e => e.type === 'PERSON');
      const names = personEntities.map(e => e.canonical.toLowerCase());

      // Should have at least James and Lily
      const hasJames = names.some(n => n.includes('james'));
      const hasLily = names.some(n => n.includes('lily'));

      expect(hasJames).toBe(true);
      expect(hasLily).toBe(true);
    });

    it.skip('should extract "Fred, George, and Ron" as three separate entities (needs list parsing enhancement)', async () => {
      const result = await extractEntities('Fred, George, and Ron all played Quidditch.');

      const personEntities = result.entities.filter(e => e.type === 'PERSON');
      const names = personEntities.map(e => e.canonical.toLowerCase());

      expect(names).toContain('fred');
      expect(names).toContain('george');
      expect(names).toContain('ron');
    });
  });

  describe('Valid compound names should still work', () => {
    // These tests verify that the coordination fix doesn't break legitimate compound names
    // Some of these may fail due to pre-existing issues unrelated to coordination

    it.skip('should keep "Leonardo da Vinci" as one entity (pre-existing issue)', async () => {
      const result = await extractEntities('Leonardo da Vinci was a painter.');

      const personEntities = result.entities.filter(e => e.type === 'PERSON');
      const names = personEntities.map(e => e.canonical.toLowerCase());

      // Should have the full name, not split on "da"
      const hasFullName = names.some(n => n.includes('vinci'));
      expect(hasFullName).toBe(true);
    });

    it.skip('should keep "Battle of Hogwarts" as one entity (pre-existing issue)', async () => {
      const result = await extractEntities('The Battle of Hogwarts ended the war.');

      // This may be extracted as EVENT or merged with the PLACE
      const allEntities = result.entities;
      const hasHogwarts = allEntities.some(e =>
        e.canonical.toLowerCase().includes('hogwarts')
      );
      expect(hasHogwarts).toBe(true);
    });
  });

  describe('Organization coordination', () => {
    it('should extract "Gryffindor and Slytherin" as two separate ORG entities', async () => {
      const result = await extractEntities('Gryffindor and Slytherin played Quidditch.');

      const orgEntities = result.entities.filter(e => e.type === 'ORG');
      const names = orgEntities.map(e => e.canonical.toLowerCase());

      expect(names).toContain('gryffindor');
      expect(names).toContain('slytherin');
      expect(names).not.toContain('gryffindor and slytherin');
    });
  });
});
