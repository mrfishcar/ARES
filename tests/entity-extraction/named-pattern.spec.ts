/**
 * Named Pattern Test Suite
 *
 * Tests that "named X", "called X", "titled X" patterns correctly extract X
 * as a proper entity, not as a theme/slogan.
 *
 * Pattern: "a [NOUN] named/called/titled [NAME]" should extract NAME as entity
 */

import { describe, it, expect } from 'vitest';
import { extractEntities } from '../../app/engine/extract/entities';
import { classifyMention } from '../../app/engine/linguistics/mention-classifier';

describe('Named Pattern: Entity Introduction', () => {
  describe('classifyMention should NOT classify names after introducers as theme-slogan', () => {
    const testCases = [
      { text: 'a dragon named Norbert', name: 'Norbert', start: 15, end: 22 },
      { text: 'a boy called Tom', name: 'Tom', start: 13, end: 16 },
      { text: 'a wizard known as Gandalf', name: 'Gandalf', start: 18, end: 25 },
      { text: 'She was nicknamed Scarface', name: 'Scarface', start: 18, end: 26 },
      { text: 'the hero dubbed Champion', name: 'Champion', start: 16, end: 24 },
    ];

    for (const tc of testCases) {
      it(`should classify "${tc.name}" as DURABLE_NAME in "${tc.text}"`, () => {
        const result = classifyMention(tc.name, tc.text, tc.start, tc.end);
        expect(result.mentionClass, `"${tc.name}" should not be theme-slogan`).toBe('DURABLE_NAME');
      });
    }
  });

  describe('extractEntities should extract names after introducers', () => {
    it('should extract Norbert from "a dragon named Norbert"', async () => {
      const text = 'Hagrid had a dragon named Norbert. Norbert was a Norwegian Ridgeback.';
      const result = await extractEntities(text);

      const norbert = result.entities.find(e =>
        e.canonical.toLowerCase() === 'norbert'
      );
      expect(norbert, 'Norbert should be extracted as entity').toBeDefined();
    });

    it('should extract Tom from "a boy called Tom"', async () => {
      const text = 'There was a boy called Tom. Tom grew up to be a wizard.';
      const result = await extractEntities(text);

      const tom = result.entities.find(e =>
        e.canonical.toLowerCase() === 'tom'
      );
      expect(tom, 'Tom should be extracted as entity').toBeDefined();
    });

    it('should extract Gandalf from "a wizard known as Gandalf"', async () => {
      const text = 'There lived a wizard known as Gandalf. Gandalf was very wise.';
      const result = await extractEntities(text);

      const gandalf = result.entities.find(e =>
        e.canonical.toLowerCase() === 'gandalf'
      );
      expect(gandalf, 'Gandalf should be extracted as entity').toBeDefined();
    });
  });

  describe('Actual theme/slogan patterns should still be filtered', () => {
    it('should NOT extract theme slogans as entities', async () => {
      const text = 'The theme was "Love Conquers All" and people loved it.';
      const result = await extractEntities(text);

      // The quoted slogan should not be a PERSON entity
      const slogan = result.entities.find(e =>
        e.canonical.toLowerCase().includes('love conquers')
      );
      // Either not extracted, or if extracted, should not be PERSON
      if (slogan) {
        expect(slogan.type).not.toBe('PERSON');
      }
    });

    it('should NOT extract poster titles as PERSON entities', async () => {
      const text = 'The poster said "Buy War Bonds" in big letters.';
      const result = await extractEntities(text);

      // The quoted title should not be a PERSON entity
      const poster = result.entities.find(e =>
        e.canonical.toLowerCase().includes('war bonds')
      );
      if (poster) {
        expect(poster.type).not.toBe('PERSON');
      }
    });
  });
});
