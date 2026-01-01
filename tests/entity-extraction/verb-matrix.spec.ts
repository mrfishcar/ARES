/**
 * Verb Matrix Regression Test
 *
 * Tests that sentence-initial capitalized names are NOT dropped
 * when followed by any common verb. This is the gate check for
 * entity extraction quality.
 *
 * Pattern: "Name <verb> ..." should always extract "Name" as entity
 */

import { describe, it, expect } from 'vitest';
import { extractEntities } from '../../app/engine/extract/entities';

// 100+ common verbs that can follow a person's name
const COMMON_VERBS = [
  // Modal/auxiliary
  'was', 'is', 'were', 'are', 'has', 'had', 'have', 'did', 'does', 'do',
  'could', 'would', 'should', 'will', 'can', 'may', 'might', 'must', 'shall',

  // Movement
  'walked', 'ran', 'went', 'came', 'arrived', 'left', 'entered', 'exited',
  'traveled', 'travelled', 'moved', 'stood', 'sat', 'fell', 'rose', 'climbed',
  'jumped', 'flew', 'swam', 'drove', 'rode',

  // Communication
  'said', 'asked', 'replied', 'answered', 'spoke', 'told', 'whispered',
  'shouted', 'screamed', 'cried', 'laughed', 'nodded', 'shook',

  // Perception/cognition
  'saw', 'heard', 'felt', 'knew', 'thought', 'believed', 'understood',
  'noticed', 'observed', 'watched', 'recognized', 'remembered', 'forgot',
  'discovered', 'learned', 'realized',

  // Action
  'helped', 'saved', 'killed', 'fought', 'attacked', 'defended', 'protected',
  'trained', 'taught', 'studied', 'worked', 'played', 'created', 'built',
  'destroyed', 'made', 'took', 'gave', 'found', 'lost', 'won', 'defeated',

  // Social/relationship
  'married', 'loved', 'hated', 'liked', 'trusted', 'betrayed', 'befriended',
  'met', 'joined', 'followed', 'led', 'ruled', 'governed',

  // Possession/transfer
  'owned', 'possessed', 'received', 'sent', 'wrote', 'read',

  // State changes
  'became', 'remained', 'died', 'lived', 'dwelt', 'resided', 'stayed',
  'started', 'finished', 'began', 'ended', 'continued', 'stopped',

  // Control/authority
  'founded', 'established', 'created', 'launched', 'started',
  'captured', 'escaped', 'rescued', 'released',

  // Emotion/mental
  'feared', 'hoped', 'wished', 'dreamed', 'expected', 'suspected',
  'doubted', 'admired', 'respected', 'warned', 'guided',

  // Additional verbs from benchmark failures
  'succeeded', 'visited', 'attended', 'carried', 'reached', 'returned',
  'passed', 'decided', 'claimed', 'accepted', 'rejected',
];

// Test names (mix of common and fictional)
const TEST_NAMES = [
  'Dumbledore', 'Harry', 'Hermione', 'Voldemort', 'Gandalf',
  'Frodo', 'Aragorn', 'Elizabeth', 'William', 'Alexander',
  'Margaret', 'Catherine', 'Napoleon', 'Einstein', 'Shakespeare',
];

describe('Verb Matrix: Sentence-Initial Name Extraction', () => {
  describe('Single-word names followed by verbs should be kept', () => {
    // Test a representative sample (all names × subset of verbs)
    const testVerbs = COMMON_VERBS.slice(0, 50); // First 50 verbs

    for (const name of TEST_NAMES.slice(0, 5)) { // First 5 names
      for (const verb of testVerbs) {
        it(`should extract "${name}" from "${name} ${verb}..."`, async () => {
          const text = `${name} ${verb} something important.`;
          const result = await extractEntities(text);

          const foundEntity = result.entities.find(e =>
            e.canonical.toLowerCase() === name.toLowerCase()
          );

          expect(foundEntity, `"${name}" should be extracted when followed by "${verb}"`).toBeDefined();
        });
      }
    }
  });

  describe('Summary: Verb coverage check', () => {
    it('should keep names for ALL common verbs (comprehensive check)', async () => {
      const name = 'Dumbledore';
      const failures: string[] = [];

      for (const verb of COMMON_VERBS) {
        const text = `${name} ${verb} something important.`;
        const result = await extractEntities(text);

        const foundEntity = result.entities.find(e =>
          e.canonical.toLowerCase() === name.toLowerCase()
        );

        if (!foundEntity) {
          failures.push(verb);
        }
      }

      if (failures.length > 0) {
        console.log(`\nVerb failures (${failures.length}/${COMMON_VERBS.length}):`);
        console.log(failures.join(', '));
      }

      expect(failures.length, `Failed verbs: ${failures.join(', ')}`).toBe(0);
    });
  });

  describe('Known junk should NOT be kept', () => {
    const JUNK_SENTENCE_STARTERS = [
      'Meanwhile', 'However', 'Therefore', 'Nevertheless', 'Furthermore',
      'Suddenly', 'Eventually', 'Finally', 'Unfortunately', 'Obviously',
      'Yesterday', 'Tomorrow', 'Chapter', 'Section', 'Part',
    ];

    for (const junk of JUNK_SENTENCE_STARTERS) {
      it(`should NOT extract "${junk}" as entity`, async () => {
        const text = `${junk} the story continued.`;
        const result = await extractEntities(text);

        const foundEntity = result.entities.find(e =>
          e.canonical.toLowerCase() === junk.toLowerCase()
        );

        expect(foundEntity, `"${junk}" should NOT be extracted as entity`).toBeUndefined();
      });
    }
  });
});
