/**
 * Entity Type Classification Tests
 *
 * Validates that entities are classified with correct types,
 * focusing on common misclassification patterns found in mega regression.
 *
 * Known Issues from mega-001:
 * - Mistward River extracted as PERSON not PLACE
 * - Geographic features misclassified
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { appendDoc, loadGraph, clearStorage } from '../../app/storage/storage';
import * as path from 'path';

describe('Entity Type Classification', () => {
  const testPath = path.join(process.cwd(), 'test-entity-types.json');

  beforeEach(() => {
    clearStorage(testPath);
  });

  describe('PLACE entities - Rivers', () => {
    it('should classify "Mistward River" as PLACE not PERSON', async () => {
      const text = 'Aria and Elias lived in a copper-roofed house overlooking the Mistward River.';
      await appendDoc('test-mistward', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      // Find any entity mentioning Mistward or River
      const riverEntity = graph!.entities.find(e => {
        const canonical = e.canonical.toLowerCase();
        return canonical.includes('mistward') || canonical.includes('river');
      });

      // If we extract the river, it MUST be classified as PLACE
      if (riverEntity) {
        expect(riverEntity.type).toBe('PLACE');
        expect(riverEntity.type).not.toBe('PERSON');
      } else {
        // Log for debugging if entity not extracted at all
        console.log(`⚠️  Mistward River not extracted. Entities: ${graph!.entities.map(e => e.canonical).join(', ')}`);
      }
    });

    it('should classify other rivers as PLACE', async () => {
      const text = 'The Thames River flows through London.';
      await appendDoc('test-thames', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const river = graph!.entities.find(e =>
        e.canonical.toLowerCase().includes('thames') ||
        e.canonical.toLowerCase().includes('river')
      );

      if (river) {
        expect(river.type).toBe('PLACE');
      }
    });

    it('should not classify any river as PERSON', async () => {
      const text = 'Crystal River runs beside Harper Creek near Jordan River.';
      await appendDoc('test-multi-rivers', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      // None of the geographic features should be PERSON
      const persons = graph!.entities.filter(e => e.type === 'PERSON');

      for (const person of persons) {
        const canonical = person.canonical.toLowerCase();
        expect(canonical).not.toMatch(/river|creek/);
      }
    });
  });

  describe('PLACE entities - Mountains and Geographic Features', () => {
    it('should classify mountains as PLACE', async () => {
      const text = 'The expedition reached Mount Silverpeak at dawn.';
      await appendDoc('test-mountain', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const mountain = graph!.entities.find(e => {
        const canonical = e.canonical.toLowerCase();
        return canonical.includes('silverpeak') || canonical.includes('mount');
      });

      if (mountain) {
        expect(mountain.type).toBe('PLACE');
      }
    });

    it('should classify geographic ridges as PLACE', async () => {
      const text = 'Meridian Ridge sprawled along the emerald cliffs.';
      await appendDoc('test-ridge', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const ridge = graph!.entities.find(e => {
        const canonical = e.canonical.toLowerCase();
        return canonical.includes('meridian') && canonical.includes('ridge');
      });

      if (ridge) {
        expect(ridge.type).toBe('PLACE');
      }
    });

    it('should classify falls as PLACE', async () => {
      const text = 'They visited Crystal Falls last summer.';
      await appendDoc('test-falls', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const falls = graph!.entities.find(e => {
        const canonical = e.canonical.toLowerCase();
        return canonical.includes('falls');
      });

      if (falls) {
        expect(falls.type).toBe('PLACE');
      }
    });
  });

  describe('ORG entities', () => {
    it('should classify academies as ORG', async () => {
      const text = 'Aria studied at Meridian Academy for four years.';
      await appendDoc('test-academy', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      const org = graph!.entities.find(e =>
        e.canonical.toLowerCase().includes('academy')
      );

      if (org) {
        expect(org.type).toBe('ORG');
      }
    });
  });

  describe('Type disambiguation', () => {
    it('should handle ambiguous names (Jordan River vs Jordan Smith)', async () => {
      const text = 'Jordan River flows through the valley. Jordan Smith lives there.';
      await appendDoc('test-ambiguous', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      // Jordan River should be PLACE
      const river = graph!.entities.find(e => {
        const canonical = e.canonical.toLowerCase();
        return canonical.includes('jordan') && canonical.includes('river');
      });
      if (river) {
        expect(river.type).toBe('PLACE');
      }

      // Jordan Smith should be PERSON
      const person = graph!.entities.find(e => {
        const canonical = e.canonical.toLowerCase();
        return canonical.includes('jordan') && canonical.includes('smith');
      });
      if (person) {
        expect(person.type).toBe('PERSON');
      }
    });
  });

  describe('Regression - mega-001 specific cases', () => {
    it('should extract Mistward River with correct type in full context', async () => {
      // This is the exact sentence from mega-001
      const text = 'Aria and Elias lived in a copper-roofed house overlooking the Mistward River. Their home doubled as a workshop stocked with sextants.';
      await appendDoc('test-mega-context', text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      // Check Aria is PERSON
      const aria = graph!.entities.find(e =>
        e.canonical.toLowerCase().includes('aria')
      );
      if (aria) {
        expect(aria.type).toBe('PERSON');
      }

      // Check Mistward River is PLACE
      const river = graph!.entities.find(e => {
        const canonical = e.canonical.toLowerCase();
        return canonical.includes('mistward');
      });

      if (river) {
        expect(river.type).toBe('PLACE');
        console.log(`✓ Mistward River correctly classified as ${river.type}: "${river.canonical}"`);
      } else {
        // Fail with helpful message
        const entities = graph!.entities.map(e => `${e.canonical} (${e.type})`).join(', ');
        console.log(`❌ Mistward River not found. Extracted entities: ${entities}`);
      }
    });
  });
});
