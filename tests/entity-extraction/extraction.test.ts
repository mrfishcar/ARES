import { describe, it, expect } from 'vitest';
import { extractEntities, Entity, EntityType } from '../../app/engine/extraction';
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
    it(`${testCase.id}: ${testCase.description}`, () => {
      const entities = extractEntities(testCase.text);

      // Verify all expected entities are found
      testCase.expectedEntities.forEach(expected => {
        const found = entities.find(e => 
          e.type === expected.type && 
          e.text === expected.text
        );

        expect(found, `Missing entity: ${expected.text} (${expected.type})`).toBeDefined();
        
        if (expected.aliases) {
          expect(found!.aliases).toEqual(expect.arrayContaining(expected.aliases));
        }

        if (expected.context) {
          expect(found!.context).toBe(expected.context);
        }

        expect(found!.confidence).toBeGreaterThanOrEqual(expected.confidence);
      });

      // Verify no unexpected entities
      const unexpectedEntities = entities.filter(found => 
        !testCase.expectedEntities.some(expected =>
          expected.type === found.type &&
          expected.text === found.text
        )
      );

      expect(unexpectedEntities, 'Found unexpected entities').toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty text', () => {
      const entities = extractEntities('');
      expect(entities).toHaveLength(0);
    });

    it('handles text with only whitespace', () => {
      const entities = extractEntities('   \n\t   ');
      expect(entities).toHaveLength(0);
    });

    it('handles null/undefined input', () => {
      expect(() => extractEntities(null as any)).toThrow();
      expect(() => extractEntities(undefined as any)).toThrow();
    });
  });
});