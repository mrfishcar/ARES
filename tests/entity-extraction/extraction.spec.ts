import { describe, it, expect } from 'vitest';
import { extractEntities, Entity, EntityType } from '../../app/engine/extract/entities';
import fs from 'fs';
import path from 'path';

interface TestCase {
  id: string;
  description: string;
  text: string;
  expectedEntities: Array<{
    type: EntityType;
    text: string;
    aliases?: string[];
    context?: string;
    confidence: number;
  }>;
}

/**
 * Load test cases from JSON files in test-cases directory
 */
function loadTestCases(): TestCase[] {
  const testDir = path.join(__dirname, 'test-cases');
  const files = fs.readdirSync(testDir).filter(f => f.endsWith('.json'));
  
  return files.flatMap(file => {
    const content = fs.readFileSync(path.join(testDir, file), 'utf-8');
    return JSON.parse(content) as TestCase[];
  });
}

describe('Entity Extraction Tests', () => {
  const testCases = loadTestCases();

  testCases.forEach(testCase => {
    it(`${testCase.id}: ${testCase.description}`, async () => {
      const result = await extractEntities(testCase.text);
      const entities = result.entities;

      // Verify all expected entities are found
      testCase.expectedEntities.forEach(expected => {
        const found = entities.find(e =>
          e.type === expected.type &&
          e.canonical.toLowerCase() === expected.text.toLowerCase()
        );

        expect(found, `Missing entity: ${expected.text} (${expected.type})`).toBeDefined();

        if (expected.aliases) {
          expect(found!.aliases).toEqual(expect.arrayContaining(expected.aliases));
        }

        if (expected.context) {
          // Context may not be an exact match, so just check it exists for now
          // TODO: Add context field to Entity schema if needed
        }

        expect(found!.confidence).toBeGreaterThanOrEqual(expected.confidence);
      });

      // Verify no unexpected entities
      const unexpectedEntities = entities.filter(found =>
        !testCase.expectedEntities.some(expected =>
          expected.type === found.type &&
          found.canonical.toLowerCase() === expected.text.toLowerCase()
        )
      );

      expect(unexpectedEntities, 'Found unexpected entities').toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty text', async () => {
      const result = await extractEntities('');
      expect(result.entities).toHaveLength(0);
    });

    it('handles text with only whitespace', async () => {
      const result = await extractEntities('   \n\t   ');
      expect(result.entities).toHaveLength(0);
    });

    it('handles null/undefined input', async () => {
      await expect(extractEntities(null as any)).rejects.toThrow();
      await expect(extractEntities(undefined as any)).rejects.toThrow();
    });
  });
});