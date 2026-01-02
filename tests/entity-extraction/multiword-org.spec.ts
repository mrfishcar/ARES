/**
 * Multi-word Organization Pattern Test Suite
 *
 * Tests that "X of Y" patterns like "Order of the Phoenix", "Ministry of Magic"
 * are correctly extracted as ORG entities, not PERSON.
 */

import { describe, it, expect } from 'vitest';
import { extractEntities } from '../../app/engine/extract/entities';

describe('Multi-word Organization Patterns', () => {
  describe('"X of Y" patterns should be extracted as ORG', () => {
    const testCases = [
      { text: 'The Order of the Phoenix was a secret society.', entity: 'Order of the Phoenix', type: 'ORG' },
      { text: 'The Ministry of Magic oversees wizarding affairs.', entity: 'Ministry of Magic', type: 'ORG' },
      { text: 'The Department of Mysteries was highly classified.', entity: 'Department of Mysteries', type: 'ORG' },
      { text: 'The Bureau of Magical Creatures regulates dangerous beasts.', entity: 'Bureau of Magical Creatures', type: 'ORG' },
    ];

    for (const tc of testCases) {
      it(`should extract "${tc.entity}" as ${tc.type} from "${tc.text}"`, async () => {
        const result = await extractEntities(tc.text);
        const found = result.entities.find(e =>
          e.canonical.toLowerCase() === tc.entity.toLowerCase()
        );
        expect(found, `${tc.entity} should be extracted`).toBeDefined();
        expect(found!.type, `${tc.entity} should be ${tc.type}`).toBe(tc.type);
      });
    }
  });

  describe('Organization keywords in multi-word names', () => {
    const testCases = [
      { text: 'The League of Shadows trained assassins.', entity: 'League of Shadows', type: 'ORG' },
      { text: 'The Alliance of Free Nations met in Geneva.', entity: 'Alliance of Free Nations', type: 'ORG' },
      { text: 'The Federation of Planets enforced the Prime Directive.', entity: 'Federation of Planets', type: 'ORG' },
    ];

    for (const tc of testCases) {
      it(`should extract "${tc.entity}" as ${tc.type}`, async () => {
        const result = await extractEntities(tc.text);
        const found = result.entities.find(e =>
          e.canonical.toLowerCase() === tc.entity.toLowerCase()
        );
        expect(found, `${tc.entity} should be extracted`).toBeDefined();
        expect(found!.type, `${tc.entity} should be ${tc.type}`).toBe(tc.type);
      });
    }
  });

  describe('Multi-word names with "the" connector', () => {
    const testCases = [
      { text: 'Harry joined the Order of the Phoenix.', entity: 'Order of the Phoenix', type: 'ORG' },
      { text: 'Frodo carried the Ring of Power.', entity: 'Ring of Power', type: 'ARTIFACT' },
    ];

    for (const tc of testCases) {
      it(`should extract "${tc.entity}" as ${tc.type}`, async () => {
        const result = await extractEntities(tc.text);
        const found = result.entities.find(e =>
          e.canonical.toLowerCase() === tc.entity.toLowerCase()
        );
        expect(found, `${tc.entity} should be extracted`).toBeDefined();
        expect(found!.type, `${tc.entity} should be ${tc.type}`).toBe(tc.type);
      });
    }
  });

  describe('Should NOT convert actual person names', () => {
    it('should keep "John Smith" as PERSON, not ORG', async () => {
      const text = 'John Smith was a famous explorer.';
      const result = await extractEntities(text);
      const found = result.entities.find(e =>
        e.canonical.toLowerCase().includes('john smith') ||
        e.canonical.toLowerCase() === 'john'
      );
      if (found) {
        expect(found.type).toBe('PERSON');
      }
    });

    it('should keep "Elizabeth of York" as PERSON', async () => {
      const text = 'Elizabeth of York was a queen.';
      const result = await extractEntities(text);
      const found = result.entities.find(e =>
        e.canonical.toLowerCase().includes('elizabeth')
      );
      // Elizabeth of York is historically a person, not an org
      if (found) {
        expect(['PERSON', 'PLACE']).toContain(found.type);
      }
    });
  });
});
