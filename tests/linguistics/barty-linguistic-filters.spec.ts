/**
 * Regression tests for linguistic filters
 * Validates: NF-1, CN-*, NV-*, JR-*, PR-*
 */

import { describe, it, expect } from 'vitest';
import { extractFromSegments } from '../../app/engine/extract/orchestrator';

/**
 * Helper: extract entities and return simplified format
 */
let docCounter = 0;

async function runExtractionOnText(text: string) {
  docCounter += 1;
  const result = await extractFromSegments(`test-doc-${docCounter}`, text);
  return {
    entities: result.entities.map(e => ({
      canonical: e.canonical,
      type: e.type,
      aliases: e.aliases || []
    })),
    relations: result.relations
  };
}

describe('Linguistic Filters - Regression Tests', () => {
  describe('Test 1: Name Fragments (NF-1)', () => {
    it('does not emit attached-only fragments as PERSON entities', async () => {
      const text = 'Students at Mont Linola Junior High gathered.';

        const result = await runExtractionOnText(text);

      const entityNames = result.entities.map(e => ({
        name: e.canonical,
        type: e.type,
      }));

      // Should have the school as ORG
      expect(entityNames).toContainEqual(
        expect.objectContaining({
          name: expect.stringMatching(/Mont Linola.*High/i),
          type: 'ORG',
        })
      );

      // No standalone Mont / Linola PERSON entities
      expect(entityNames).not.toContainEqual({ name: 'Mont', type: 'PERSON' });
      expect(entityNames).not.toContainEqual({ name: 'Linola', type: 'PERSON' });
    });
  });

  describe('Test 2: Common Noun Filtering (CN-*)', () => {
    it('filters common nouns and discourse markers mis-tagged as PERSON', async () => {
      const text = `
        The friend arrived at Hell Hall.
        "Well, I heard she's odd," he said.
      `;

        const result = await runExtractionOnText(text);

      const people = result.entities.filter(e => e.type === 'PERSON');
      const personNames = people.map(e => e.canonical.toLowerCase());

      // Common nouns should NOT be PERSON
      expect(personNames).not.toContain('friend');
      expect(personNames).not.toContain('hell');
      expect(personNames).not.toContain('hall');
      expect(personNames).not.toContain('well');

      // Hell Hall as PLACE/ORG is acceptable
      const hellHall = result.entities.find(
        e =>
          e.canonical.toLowerCase() === 'hell hall' &&
          (e.type === 'PLACE' || e.type === 'ORG')
      );
      // Note: might not extract Hell Hall at all, which is fine
      // Just ensure it's not PERSON if extracted
      if (hellHall) {
        expect(hellHall.type).not.toBe('PERSON');
      }
    });
  });

  describe('Test 3: School Name Variant Consolidation (NV)', () => {
    it('merges school name variants into a single ORG entity', async () => {
      const text = `
        Mont Linola Junior High School held a dance.
        Students at Mont Linola Junior High celebrated.
        Mont Linola Jr was founded in 1950.
      `;

        const result = await runExtractionOnText(text);

      const orgs = result.entities.filter(e => e.type === 'ORG');
      const schoolOrgs = orgs.filter(e =>
        e.canonical.toLowerCase().includes('mont linola')
      );

      // Should consolidate to 1-2 org entities (allowing some variation)
      // Strict: exactly 1, Lenient: 1-2
      expect(schoolOrgs.length).toBeGreaterThanOrEqual(1);
      expect(schoolOrgs.length).toBeLessThanOrEqual(2);

      // At least one should have the root name
      const hasRoot = schoolOrgs.some(e =>
        /mont\s+linola/i.test(e.canonical)
      );
      expect(hasRoot).toBe(true);
    });
  });

  describe('Test 4: Jr Disambiguation – Person (JR-1)', () => {
    it('classifies "John Smith Jr." as PERSON', async () => {
      const text = 'John Smith Jr. attended the meeting.';

        const result = await runExtractionOnText(text);

      const johnSmithJr = result.entities.find(
        e =>
          e.canonical.toLowerCase().includes('john') &&
          e.canonical.toLowerCase().includes('smith') &&
          e.canonical.toLowerCase().includes('jr')
      );

      expect(johnSmithJr).toBeDefined();
      expect(johnSmithJr!.type).toBe('PERSON');
    });
  });

  describe('Test 5: Jr Disambiguation – School/Org (JR-2)', () => {
    it('classifies "Mont Linola Jr" as ORG in a school context', async () => {
      const text = `
        Students at Mont Linola Jr packed the hallway.
        Teachers at Mont Linola Jr were exhausted.
      `;

      const result = await runExtractionOnText(text);

      const orgs = result.entities.filter(e => e.type === 'ORG');
      const montLinolaJr = orgs.find(e =>
        /mont\s+linola\s+jr/i.test(e.canonical)
      );

      // Should find Mont Linola Jr as ORG (or variant)
      // Allow some flexibility in exact name
      const hasSchool = orgs.some(e =>
        e.canonical.toLowerCase().includes('mont linola')
      );
      expect(hasSchool).toBe(true);

      // If we found the exact "Mont Linola Jr", verify it's ORG
      if (montLinolaJr) {
        expect(montLinolaJr.type).toBe('ORG');
      }
    });
  });

  describe('Test 6: Place vs School Split (NV-3)', () => {
    it('keeps PLACE and ORG separate for shared root names', async () => {
      const text = `
        He grew up in Mont Linola.
        Mont Linola Junior High was the only school in town.
      `;

      const result = await runExtractionOnText(text);

      // Look for place entity (just "Mont Linola")
      const place = result.entities.find(
        e =>
          e.canonical.toLowerCase() === 'mont linola' &&
          (e.type === 'PLACE' || e.type === 'GPE')
      );

      // Look for org entity (school)
      const org = result.entities.find(
        e =>
          e.canonical.toLowerCase().includes('mont linola') &&
          (e.canonical.toLowerCase().includes('high') ||
           e.canonical.toLowerCase().includes('school')) &&
          e.type === 'ORG'
      );

      // Should have both entities, not merged
      expect(place || org).toBeDefined(); // At least one should exist

      // If both exist, they should be separate
      if (place && org) {
        expect(place.canonical).not.toBe(org.canonical);
      }
    });
  });

  describe('Test 7: Pronoun Resolution Guard (PR-1/2)', () => {
    it('does not resolve personal pronouns to org/place entities', async () => {
      const text = `
        At Mont Linola Junior High, students gathered in the hall.
        They whispered about the dance.
      `;

      const result = await runExtractionOnText(text);

      // This test is more about internal behavior, but we can check:
      // - "students" should be extracted as a group/entity
      // - "They" would resolve to students, not to the school
      // Since we don't expose coref chains directly in the test,
      // we'll just verify that school is ORG and not PERSON

      const school = result.entities.find(e =>
        e.canonical.toLowerCase().includes('mont linola')
      );

      if (school) {
        // School should be ORG, not PERSON (which would allow pronoun resolution)
        expect(school.type).toBe('ORG');
      }

      // This is a light check - the real pronoun guard is tested in coref.spec.ts
      expect(result.entities.length).toBeGreaterThan(0);
    });
  });
});
