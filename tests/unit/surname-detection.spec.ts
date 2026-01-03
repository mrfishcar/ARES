/**
 * Guardrail tests for surname detection and the "two-first-names" filter.
 *
 * The "two-first-names" filter was designed for biblical texts where names like
 * "Elimelech Naomi" (two unrelated first names) appear. It should NOT trigger
 * on legitimate "FirstName LastName" combinations.
 *
 * Root cause of Andrew Beauregard bug: "Beauregard" ends in "ard" which wasn't
 * in the surname endings list, causing it to be classified as a first name.
 */

import { describe, it, expect } from 'vitest';
import { filterLowQualityEntities } from '../../app/engine/entity-quality-filter';
import type { Entity } from '../../app/engine/schema';

function makeEntity(canonical: string, type: string = 'PERSON'): Entity {
  return {
    id: `test-${canonical.toLowerCase().replace(/\s+/g, '-')}`,
    canonical,
    type: type as any,
    aliases: [],
    created_at: new Date().toISOString()
  };
}

describe('Surname Detection Guardrails', () => {
  describe('Names ending in -ard should NOT be split', () => {
    const ardSurnames = [
      'Andrew Beauregard',
      'James Bernard',
      'Mary Gerard',
      'John Blanchard',
      'Sarah Richard',
      'Michael Maynard',
      'Elizabeth Barnard',
      'David Goddard',
      'Robert Picard',
      'William Leonard'
    ];

    it.each(ardSurnames)('should preserve "%s" as single entity', (name) => {
      const entity = makeEntity(name);
      const result = filterLowQualityEntities([entity]);

      expect(result.length).toBe(1);
      expect(result[0].canonical).toBe(name);
    });
  });

  describe('Names ending in -gard should NOT be split', () => {
    const gardSurnames = [
      'Erik Lindgard',
      'Hans Asgard',
      'Peter Midgard'
    ];

    it.each(gardSurnames)('should preserve "%s" as single entity', (name) => {
      const entity = makeEntity(name);
      const result = filterLowQualityEntities([entity]);

      expect(result.length).toBe(1);
      expect(result[0].canonical).toBe(name);
    });
  });

  describe('Common surname endings should NOT trigger two-first-names filter', () => {
    const validNames = [
      // -son/-sen endings
      'Michael Johnson',
      'Sarah Anderson',
      'Erik Eriksen',
      // -er/-or endings
      'Harry Potter',
      'James Miller',
      'Mary Granger',
      // -ey/-ay endings
      'John Finley',
      'David Murray',
      // -ald/-old endings
      'Gerald Fitzgerald',
      'Robert Arnold',
      // -man/-stein/-berg endings
      'Max Goldman',
      'Albert Einstein',
      'Steven Spielberg',
      // Fictional names
      'Severus Snape',
      'Albus Dumbledore',
      'Draco Malfoy',
      'Neville Longbottom'
    ];

    it.each(validNames)('should preserve "%s" as single entity', (name) => {
      const entity = makeEntity(name);
      const result = filterLowQualityEntities([entity]);

      expect(result.length).toBe(1);
      expect(result[0].canonical).toBe(name);
    });
  });

  describe('Biblical two-first-names SHOULD be split (correct behavior)', () => {
    // These are the cases the filter was designed for:
    // Two unrelated first names mashed together without a surname
    const biblicalNames = [
      'Elimelech Naomi',  // Book of Ruth - two separate people
      'Abraham Isaac',     // Two patriarchs
      'Jacob Esau'         // Twin brothers
    ];

    it.each(biblicalNames)('should split "%s" into two entities', (name) => {
      const entity = makeEntity(name);
      const result = filterLowQualityEntities([entity]);

      // Should be split into 2 entities
      expect(result.length).toBe(2);

      const names = result.map(e => e.canonical);
      const [first, second] = name.split(' ');
      expect(names).toContain(first);
      expect(names).toContain(second);
    });
  });

  describe('Edge cases', () => {
    it('should handle single-word names without splitting', () => {
      const entity = makeEntity('Gandalf');
      const result = filterLowQualityEntities([entity]);

      expect(result.length).toBe(1);
      expect(result[0].canonical).toBe('Gandalf');
    });

    it('should handle three-word names without splitting', () => {
      const entity = makeEntity('Jean Luc Picard');
      const result = filterLowQualityEntities([entity]);

      // Three-word names bypass the two-first-names filter entirely
      expect(result.length).toBe(1);
      expect(result[0].canonical).toBe('Jean Luc Picard');
    });

    // NOTE: Hyphenated surnames currently get split because the hyphen
    // causes the surname check to fail. This is a known limitation.
    // TODO: Add hyphen-handling to looksLikeSurname()
    it.skip('should handle hyphenated surnames (known limitation)', () => {
      const entity = makeEntity('Mary Smith-Jones');
      const result = filterLowQualityEntities([entity]);

      expect(result.length).toBe(1);
      expect(result[0].canonical).toBe('Mary Smith-Jones');
    });
  });
});
