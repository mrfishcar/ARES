/**
 * BookNLP Adapter Integration Tests
 *
 * Fixture-based tests that validate the BookNLP adapter works correctly.
 * These tests use pre-generated JSON fixtures instead of running full BookNLP.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  adaptBookNLPContract,
  adaptCharacters,
  adaptMentions,
  adaptQuotes,
  adaptCorefChains,
  validateContract,
  parseBookNLPContract,
} from '../../app/engine/booknlp/adapter';
import type { BookNLPContract, BookNLPCharacter } from '../../app/engine/booknlp/types';
import { toBookNLPEID, toBookNLPStableEntityId } from '../../app/engine/booknlp/identity';

// Load fixtures
const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/booknlp/barty-excerpt-contract.json');

function loadFixture(): BookNLPContract {
  const json = fs.readFileSync(FIXTURE_PATH, 'utf-8');
  return JSON.parse(json) as BookNLPContract;
}

describe('BookNLP Adapter', () => {
  describe('Contract Validation', () => {
    it('should validate a correct contract structure', () => {
      const contract = loadFixture();
      expect(validateContract(contract)).toBe(true);
    });

    it('should reject null/undefined', () => {
      expect(validateContract(null)).toBe(false);
      expect(validateContract(undefined)).toBe(false);
    });

    it('should reject objects missing required fields', () => {
      expect(validateContract({})).toBe(false);
      expect(validateContract({ schema_version: '1.0' })).toBe(false);
      expect(validateContract({ schema_version: '1.0', document_id: 'test' })).toBe(false);
    });

    it('should reject objects with wrong field types', () => {
      const badContract = {
        schema_version: 123, // Should be string
        document_id: 'test',
        characters: [],
        mentions: [],
        quotes: [],
        tokens: [],
        coref_chains: [],
        metadata: {},
      };
      expect(validateContract(badContract)).toBe(false);
    });
  });

  describe('Contract Parsing', () => {
    it('should parse valid JSON', () => {
      const json = fs.readFileSync(FIXTURE_PATH, 'utf-8');
      const contract = parseBookNLPContract(json);

      expect(contract.schema_version).toBe('1.0');
      expect(contract.document_id).toBe('barty-test-001');
    });

    it('should throw on invalid JSON', () => {
      expect(() => parseBookNLPContract('not json')).toThrow('Invalid JSON');
    });

    it('should throw on valid JSON with wrong structure', () => {
      expect(() => parseBookNLPContract('{}')).toThrow('Invalid BookNLP contract structure');
    });
  });

  describe('Character Adaptation', () => {
    it('should convert BookNLP characters to ARES entities', () => {
      const contract = loadFixture();
      const entities = adaptCharacters(contract.characters);

      expect(entities).toHaveLength(4);

      // All characters should be PERSON type
      entities.forEach(e => {
        expect(e.type).toBe('PERSON');
        expect(e.source).toBe('booknlp');
        expect(e.confidence).toBeGreaterThan(0.9);
      });
    });

    it('should preserve canonical names', () => {
      const contract = loadFixture();
      const entities = adaptCharacters(contract.characters);

      const canonicals = entities.map(e => e.canonical);
      expect(canonicals).toContain('Barty Beauregard');
      expect(canonicals).toContain('Preston Farrell');
      expect(canonicals).toContain('Kelly Prescott');
      expect(canonicals).toContain('Principal Green');
    });

    it('should extract aliases from character data', () => {
      const contract = loadFixture();
      const entities = adaptCharacters(contract.characters);

      const barty = entities.find(e => e.canonical === 'Barty Beauregard');
      expect(barty).toBeDefined();
      expect(barty!.aliases).toContain('Barty');
      expect(barty!.aliases).toContain('Beauregard');
    });

    it('should preserve BookNLP ID reference', () => {
      const contract = loadFixture();
      const entities = adaptCharacters(contract.characters);

      const barty = entities.find(e => e.canonical === 'Barty Beauregard');
      expect(barty?.booknlp_id).toBe('char_0');
    });

    it('should preserve mention counts', () => {
      const contract = loadFixture();
      const entities = adaptCharacters(contract.characters);

      const barty = entities.find(e => e.canonical === 'Barty Beauregard');
      expect(barty?.mention_count).toBe(7);
    });

    it('should preserve gender information', () => {
      const contract = loadFixture();
      const entities = adaptCharacters(contract.characters);

      const barty = entities.find(e => e.canonical === 'Barty Beauregard');
      expect(barty?.gender).toBe('male');

      const kelly = entities.find(e => e.canonical === 'Kelly Prescott');
      expect(kelly?.gender).toBe('female');
    });

    it('should generate stable ARES IDs from BookNLP IDs', () => {
      const contract = loadFixture();
      const entities = adaptCharacters(contract.characters);

      // IDs should be stable (same input = same output)
      const entities2 = adaptCharacters(contract.characters);

      for (let i = 0; i < entities.length; i++) {
        expect(entities[i].id).toBe(entities2[i].id);
      }

      const barty = entities.find(e => e.canonical === 'Barty Beauregard');
      expect(barty?.id).toBe(toBookNLPStableEntityId('char_0'));
    });

    it('uses deterministic cluster-derived IDs and EIDs', () => {
      const contract = loadFixture();
      const entities = adaptCharacters(contract.characters);

      for (const char of contract.characters) {
        const expectedId = toBookNLPStableEntityId(char.id);
        const expectedEID = toBookNLPEID(char.id);
        const entity = entities.find(e => e.booknlp_id === char.id);
        expect(entity?.id).toBe(expectedId);
        expect(entity?.eid).toBe(expectedEID);
      }
    });
  });

  describe('Mention Adaptation', () => {
    it('should convert mentions with character links', () => {
      const contract = loadFixture();
      const characterIdMap = new Map<string, string>();
      contract.characters.forEach(c => {
        characterIdMap.set(c.id, `ares_${c.id}`);
      });

      const spans = adaptMentions(contract.mentions, characterIdMap);

      // Only mentions with character_id should be included
      const linkedMentions = contract.mentions.filter(m => m.character_id);
      expect(spans.length).toBe(linkedMentions.length);
    });

    it('should map character IDs to ARES entity IDs', () => {
      const contract = loadFixture();
      const characterIdMap = new Map<string, string>();
      characterIdMap.set('char_0', 'ares_barty');
      characterIdMap.set('char_1', 'ares_preston');

      const spans = adaptMentions(contract.mentions, characterIdMap);

      const bartySpans = spans.filter(s => s.entity_id === 'ares_barty');
      expect(bartySpans.length).toBeGreaterThan(0);
    });

    it('should preserve text span information', () => {
      const contract = loadFixture();
      const characterIdMap = new Map<string, string>();
      contract.characters.forEach(c => {
        characterIdMap.set(c.id, c.id);
      });

      const spans = adaptMentions(contract.mentions, characterIdMap);

      const firstSpan = spans.find(s => s.text === 'Barty Beauregard');
      expect(firstSpan).toBeDefined();
      expect(firstSpan!.start).toBe(0);
      expect(firstSpan!.end).toBe(16);
    });

    it('should exclude unlinked mentions (null character_id)', () => {
      const contract = loadFixture();
      const characterIdMap = new Map<string, string>();

      const spans = adaptMentions(contract.mentions, characterIdMap);

      // Mont Linola Junior High has null character_id, should be excluded
      const facilitySpan = spans.find(s => s.text === 'Mont Linola Junior High');
      expect(facilitySpan).toBeUndefined();
    });
  });

  describe('Quote Adaptation', () => {
    it('should convert quotes with speaker attribution', () => {
      const contract = loadFixture();
      const characterIdMap = new Map<string, string>();
      contract.characters.forEach(c => {
        characterIdMap.set(c.id, `ares_${c.id}`);
      });

      const quotes = adaptQuotes(contract.quotes, characterIdMap);

      expect(quotes).toHaveLength(2);
    });

    it('should map speaker IDs to ARES entity IDs', () => {
      const contract = loadFixture();
      const characterIdMap = new Map<string, string>();
      characterIdMap.set('char_2', 'ares_kelly');
      characterIdMap.set('char_3', 'ares_green');

      const quotes = adaptQuotes(contract.quotes, characterIdMap);

      const kellyQuote = quotes.find(q => q.text.includes('whole thing'));
      expect(kellyQuote).toBeDefined();
      expect(kellyQuote!.speaker_id).toBe('ares_kelly');
      expect(kellyQuote!.speaker_name).toBe('Kelly Prescott');
    });

    it('should assign higher confidence to attributed quotes', () => {
      const contract = loadFixture();
      const characterIdMap = new Map<string, string>();
      contract.characters.forEach(c => {
        characterIdMap.set(c.id, c.id);
      });

      const quotes = adaptQuotes(contract.quotes, characterIdMap);

      // All quotes in fixture have speaker_id
      quotes.forEach(q => {
        expect(q.speaker_id).not.toBeNull();
        expect(q.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });

    it('should preserve quote text and positions', () => {
      const contract = loadFixture();
      const characterIdMap = new Map<string, string>();

      const quotes = adaptQuotes(contract.quotes, characterIdMap);

      const quote1 = quotes.find(q => q.id === 'quote_0');
      expect(quote1?.text).toBe('I saw the whole thing!');
      expect(quote1?.start).toBe(165);
      expect(quote1?.end).toBe(187);
    });
  });

  describe('Coreference Chain Adaptation', () => {
    it('should create links between consecutive mentions', () => {
      const contract = loadFixture();
      const characterIdMap = new Map<string, string>();
      contract.characters.forEach(c => {
        characterIdMap.set(c.id, c.id);
      });

      const links = adaptCorefChains(contract, characterIdMap);

      // Chain with 4 mentions creates 3 links
      // Chain with 2 mentions creates 1 link
      expect(links.length).toBeGreaterThanOrEqual(4);
    });

    it('should preserve entity ID in coref links', () => {
      const contract = loadFixture();
      const characterIdMap = new Map<string, string>();
      characterIdMap.set('char_0', 'ares_barty');
      characterIdMap.set('char_2', 'ares_kelly');

      const links = adaptCorefChains(contract, characterIdMap);

      const bartyLinks = links.filter(l => l.entity_id === 'ares_barty');
      expect(bartyLinks.length).toBeGreaterThan(0);
    });

    it('should skip chains with no character_id', () => {
      // Create a contract with a chain that has null character_id
      const contract = loadFixture();
      contract.coref_chains.push({
        chain_id: 'coref_orphan',
        character_id: null,
        mentions: ['mention_8'],
      });

      const characterIdMap = new Map<string, string>();
      const links = adaptCorefChains(contract, characterIdMap);

      // Orphan chain should not create any links
      const orphanLinks = links.filter(l => l.entity_id === null);
      expect(orphanLinks).toHaveLength(0);
    });

    it('should skip chains with only one mention', () => {
      // A chain with single mention can't create links
      const contract = loadFixture();
      contract.coref_chains.push({
        chain_id: 'coref_single',
        character_id: 'char_0',
        mentions: ['mention_0'],
      });

      const characterIdMap = new Map<string, string>();
      characterIdMap.set('char_0', 'char_0');

      const originalLinks = adaptCorefChains(loadFixture(), characterIdMap);
      const newLinks = adaptCorefChains(contract, characterIdMap);

      // Single-mention chain shouldn't add any links
      expect(newLinks.length).toBe(originalLinks.length);
    });
  });

  describe('Full Contract Adaptation', () => {
    it('should produce complete ARES result from contract', () => {
      const contract = loadFixture();
      const result = adaptBookNLPContract(contract);

      expect(result.entities).toHaveLength(4);
      expect(result.quotes).toHaveLength(2);
      expect(result.spans.length).toBeGreaterThan(0);
      expect(result.coref_links.length).toBeGreaterThan(0);
      expect(result.metadata).toBeDefined();
    });

    it('should filter characters by minimum mention count', () => {
      const contract = loadFixture();

      // With high threshold, should filter out low-mention characters
      const result = adaptBookNLPContract(contract, { minMentionCount: 5 });

      // Only Barty has 7 mentions, others have fewer
      expect(result.entities.length).toBeLessThan(4);
      expect(result.entities.some(e => e.canonical === 'Barty Beauregard')).toBe(true);
    });

    it('should include raw contract when requested', () => {
      const contract = loadFixture();

      const withRaw = adaptBookNLPContract(contract, { includeRawContract: true });
      const withoutRaw = adaptBookNLPContract(contract, { includeRawContract: false });

      expect(withRaw.raw_contract).toBeDefined();
      expect(withoutRaw.raw_contract).toBeUndefined();
    });

    it('should preserve metadata from contract', () => {
      const contract = loadFixture();
      const result = adaptBookNLPContract(contract);

      expect(result.metadata.booknlp_version).toBe('1.0.7');
      expect(result.metadata.processing_time_seconds).toBe(2.5);
      expect(result.metadata.character_count).toBe(4);
    });
  });

  describe('ID Stability', () => {
    it('should generate deterministic IDs across runs', () => {
      const contract = loadFixture();

      const result1 = adaptBookNLPContract(contract);
      const result2 = adaptBookNLPContract(contract);

      // Entity IDs should be identical
      for (let i = 0; i < result1.entities.length; i++) {
        expect(result1.entities[i].id).toBe(result2.entities[i].id);
      }
    });

    it('should generate different IDs for different characters', () => {
      const contract = loadFixture();
      const result = adaptBookNLPContract(contract);

      const ids = result.entities.map(e => e.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Stats Integrity', () => {
    it('should have entity count matching character count from metadata', () => {
      const contract = loadFixture();
      const result = adaptBookNLPContract(contract);

      // Without filtering, entity count should match character count
      expect(result.entities.length).toBe(contract.metadata.character_count);
    });

    it('should have quote count matching metadata', () => {
      const contract = loadFixture();
      const result = adaptBookNLPContract(contract);

      expect(result.quotes.length).toBe(contract.metadata.quote_count);
    });

    it('should not produce junk entities from valid BookNLP output', () => {
      const contract = loadFixture();
      const result = adaptBookNLPContract(contract);

      // All entities should have proper names (not verb phrases, fragments, etc.)
      const junkPatterns = [
        /^(only|never|hardly|easily)\s/i,  // Adverb-led
        /^(with|at|for|to)\s/i,  // Preposition-led
        /^\w+ing$/,  // Gerund-only
        /^[a-z]/,  // Starts lowercase (likely not a name)
      ];

      for (const entity of result.entities) {
        for (const pattern of junkPatterns) {
          expect(entity.canonical).not.toMatch(pattern);
        }
      }
    });
  });
});
