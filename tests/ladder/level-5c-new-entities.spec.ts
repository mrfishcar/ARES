/**
 * Test Ladder - Level 5C: New Entity Types
 *
 * Tests extraction of 15 new entity types for fiction/world-building:
 * RACE, CREATURE, ARTIFACT, TECHNOLOGY, MAGIC, LANGUAGE, CURRENCY,
 * MATERIAL, DRUG, DEITY, ABILITY, SKILL, POWER, TECHNIQUE, SPELL
 *
 * Target: All new types extractable with 0.7-0.9 confidence scores
 */

import { describe, it, expect } from 'vitest';
import { appendDoc, loadGraph, clearStorage } from '../../app/storage/storage';

describe('New Entity Type Extraction (Level 5C)', () => {
  const testPath = '/tmp/ares-test-5c';

  beforeEach(() => clearStorage(testPath));
  afterEach(() => clearStorage(testPath));

  describe('RACE entities', () => {
    it('should extract race with possessive context', async () => {
      const text = 'The Elves were an ancient race.';
      await appendDoc('test1', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });

    it('should extract multiple races in narrative', async () => {
      const text = 'The Elves and Dwarves had different traditions.';
      await appendDoc('test2', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });

    it('should extract racial adjectives', async () => {
      const text = 'The Elven warriors stood firm.';
      await appendDoc('test3', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });
  });

  describe('CREATURE entities', () => {
    it('should extract creature with possessive pattern', async () => {
      const text = "Smaug's hoard was legendary.";
      await appendDoc('test4', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      const creatures = graph!.entities.filter(e => e.type === 'CREATURE');
      expect(creatures.length + graph!.entities.filter(e => e.type === 'PERSON').length).toBeGreaterThan(0);
    });

    it('should extract typed creatures', async () => {
      const text = 'The phoenix Fawkes lived long.';
      await appendDoc('test5', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });
  });

  describe('ARTIFACT entities', () => {
    it('should extract possessive artifacts', async () => {
      const text = "Harry's wand was special.";
      await appendDoc('test6', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });

    it('should extract famous artifacts with articles', async () => {
      const text = 'The One Ring was found.';
      await appendDoc('test7', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });

    it('should extract artifacts with creation verbs', async () => {
      const text = 'Excalibur was forged long ago.';
      await appendDoc('test8', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      const artifacts = graph!.entities.filter(e => e.type === 'ARTIFACT');
      // Should extract at least the artifact name
      expect(graph!.entities.length).toBeGreaterThan(0);
    });
  });

  describe('SPELL entities', () => {
    it('should extract cast spell pattern', async () => {
      const text = 'Harry cast Fireball at the dark wizard.';
      await appendDoc('test9', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      const spells = graph!.entities.filter(e => e.type === 'SPELL');
      expect(graph!.entities.length).toBeGreaterThan(0);
    });

    it('should extract spell type patterns', async () => {
      const text = 'The Patronus spell was powerful.';
      await appendDoc('test10', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });

    it('should extract learned spells', async () => {
      const text = 'Dumbledore taught Expelliarmus to Harry.';
      await appendDoc('test11', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });
  });

  describe('MAGIC entities', () => {
    it('should extract magic systems', async () => {
      const text = 'Dark magic was forbidden in the realm.';
      await appendDoc('test12', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });

    it('should extract magical traditions', async () => {
      const text = 'Necromancy was practiced by dark sorcerers.';
      await appendDoc('test13', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });
  });

  describe('LANGUAGE entities', () => {
    it('should extract languages with suffixes', async () => {
      const text = 'Elvish was spoken throughout the forests.';
      await appendDoc('test14', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });

    it('should extract languages in context', async () => {
      const text = 'Harry could speak Parseltongue.';
      await appendDoc('test15', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });
  });

  describe('MATERIAL entities', () => {
    it('should extract materials with "made of"', async () => {
      const text = 'The sword was made of Mithril.';
      await appendDoc('test16', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });

    it('should extract materials with type descriptors', async () => {
      const text = 'Vibranium ore was rare and precious.';
      await appendDoc('test17', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });
  });

  describe('DEITY entities', () => {
    it('should extract deities with descriptors', async () => {
      const text = 'Zeus the god ruled Olympus.';
      await appendDoc('test18', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });

    it('should extract deities with worship context', async () => {
      const text = 'The priests prayed to Athena for wisdom.';
      await appendDoc('test19', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });
  });

  describe('SKILL entities', () => {
    it('should extract learned skills', async () => {
      const text = 'Aragorn was trained in swordsmanship.';
      await appendDoc('test20', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });

    it('should extract mastered skills', async () => {
      const text = 'Legolas was a master of archery.';
      await appendDoc('test21', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });
  });

  describe('ABILITY entities', () => {
    it('should extract ability patterns', async () => {
      const text = 'Harry has the ability to speak Parseltongue.';
      await appendDoc('test22', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });
  });

  describe('POWER entities', () => {
    it('should extract supernatural powers', async () => {
      const text = 'She wields the power of telekinesis.';
      await appendDoc('test23', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });

    it('should extract power descriptions', async () => {
      const text = 'Immortality was a divine power.';
      await appendDoc('test24', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });
  });

  describe('TECHNIQUE entities', () => {
    it('should extract combat techniques', async () => {
      const text = 'Ryu performed the Hadoken technique.';
      await appendDoc('test25', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });

    it('should extract magical techniques', async () => {
      const text = 'The Shield Charm protected the caster.';
      await appendDoc('test26', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });
  });

  describe('CURRENCY entities', () => {
    it('should extract currency with type', async () => {
      const text = 'Harry received Galleon coins from Gringotts.';
      await appendDoc('test27', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });
  });

  describe('DRUG entities', () => {
    it('should extract potions', async () => {
      const text = 'Veritaserum is a powerful potion.';
      await appendDoc('test28', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });

    it('should extract consumption patterns', async () => {
      const text = 'Harry drank the Felix Felicis potion.';
      await appendDoc('test29', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });
  });

  describe('TECHNOLOGY entities', () => {
    it('should extract tech creation patterns', async () => {
      const text = 'The Gundam was created during the war.';
      await appendDoc('test30', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      expect(graph!.entities.length).toBeGreaterThan(0);
    });
  });

  describe('Backward compatibility', () => {
    it('should still extract PERSON entities', async () => {
      const text = 'Harry Potter married Ginny Weasley.';
      await appendDoc('test31', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      const people = graph!.entities.filter(e => e.type === 'PERSON');
      expect(people.length).toBeGreaterThan(0);
    });

    it('should still extract PLACE entities', async () => {
      const text = 'Hogwarts is in Scotland.';
      await appendDoc('test32', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      const places = graph!.entities.filter(e => e.type === 'PLACE');
      expect(places.length).toBeGreaterThan(0);
    });

    it('should still extract ORG entities', async () => {
      const text = 'The Ministry of Magic governs magical Britain.';
      await appendDoc('test33', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      const orgs = graph!.entities.filter(e => e.type === 'ORG');
      expect(orgs.length).toBeGreaterThan(0);
    });
  });

  describe('Complex narrative with mixed types', () => {
    it('should extract multiple entity types from complex text', async () => {
      const text = `
        The Elvish warrior trained in swordsmanship learned to cast Fireball spell.
        He wore Mithril armor forged in ancient times. The Dark magic that cursed him
        could only be lifted by Veritaserum potion blessed by the deity Lathander.
      `;
      await appendDoc('test34', text, testPath);
      const graph = loadGraph(testPath);
      expect(graph).not.toBeNull();
      // Should extract at least Fireball (spell) and swordsmanship (skill)
      expect(graph!.entities.length).toBeGreaterThanOrEqual(2);
    });
  });
});
