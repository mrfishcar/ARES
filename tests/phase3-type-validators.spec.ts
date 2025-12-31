/**
 * Phase 3.3 Tests: Entity Type Validators
 *
 * Verifies that type-specific validators correctly:
 * - Accept valid entity names for their type
 * - Reject invalid entity names
 * - Handle edge cases (sentence-initial, NER support, etc.)
 *
 * Key invariants:
 * 1. Multi-token proper names should be accepted
 * 2. Title prefixes (Mr., Dr., etc.) should boost acceptance
 * 3. Known blocklisted terms should be rejected
 * 4. NER support should override rejections
 */

import { describe, it, expect } from 'vitest';
import {
  isValidPersonName,
  isValidPlaceName,
  isValidOrgName,
  isValidHouseName,
  isValidRaceName,
  isValidSpeciesName,
  isValidItemName,
  isValidDateName,
  isValidEventName,
  validateEntityForType,
  inferEntityType,
  TITLE_PREFIXES,
  PERSON_ABSTRACT_BLOCKLIST,
  GEOGRAPHIC_MARKERS,
  ORGANIZATION_MARKERS,
} from '../app/engine/entity-type-validators';

describe('Phase 3.3: Entity Type Validators', () => {
  describe('isValidPersonName', () => {
    it('should accept multi-token proper names', () => {
      expect(isValidPersonName(['John', 'Smith'], 'john smith')).toBe(true);
      expect(isValidPersonName(['Mary', 'Jane', 'Watson'], 'mary jane watson')).toBe(true);
    });

    it('should accept names with title prefixes', () => {
      expect(isValidPersonName(['Mr.', 'Smith'], 'mr. smith')).toBe(true);
      expect(isValidPersonName(['Dr.', 'Watson'], 'dr. watson')).toBe(true);
      expect(isValidPersonName(['Professor', 'McGonagall'], 'professor mcgonagall')).toBe(true);
    });

    it('should accept single-token names with NER support', () => {
      expect(isValidPersonName(['Gandalf'], 'gandalf', { hasNERSupport: true })).toBe(true);
    });

    it('should reject single-token sentence-initial-only names without NER', () => {
      expect(isValidPersonName(['Kenny'], 'kenny', { isSentenceInitialOnly: true })).toBe(false);
    });

    it('should reject abstract nouns that are sentence-initial-only', () => {
      expect(isValidPersonName(['Hope'], 'hope', { isSentenceInitialOnly: true })).toBe(false);
      expect(isValidPersonName(['Justice'], 'justice', { isSentenceInitialOnly: true })).toBe(false);
    });
  });

  describe('isValidPlaceName', () => {
    it('should accept names with geographic markers', () => {
      expect(isValidPlaceName(['Misty', 'Mountain'], 'misty mountain')).toBe(true);
      expect(isValidPlaceName(['Black', 'Lake'], 'black lake')).toBe(true);
      expect(isValidPlaceName(['Dark', 'Forest'], 'dark forest')).toBe(true);
    });

    it('should accept multi-token capitalized names', () => {
      expect(isValidPlaceName(['New', 'York'], 'new york')).toBe(true);
      expect(isValidPlaceName(['Rivendell'], 'rivendell')).toBe(true);
    });

    it('should accept NER-backed locations', () => {
      expect(isValidPlaceName(['Paris'], 'paris', { hasNERSupport: true })).toBe(true);
    });

    it('should reject generic nouns', () => {
      expect(isValidPlaceName(['nothing'], 'nothing')).toBe(false);
      expect(isValidPlaceName(['somewhere'], 'somewhere')).toBe(false);
    });
  });

  describe('isValidOrgName', () => {
    it('should accept names with organization markers', () => {
      expect(isValidOrgName(['Hogwarts', 'School'], 'hogwarts school')).toBe(true);
      expect(isValidOrgName(['Ministry', 'of', 'Magic'], 'ministry of magic')).toBe(true);
      expect(isValidOrgName(['Oxford', 'University'], 'oxford university')).toBe(true);
    });

    it('should accept multi-token capitalized names', () => {
      expect(isValidOrgName(['Daily', 'Prophet'], 'daily prophet')).toBe(true);
    });

    it('should accept NER-backed organizations', () => {
      expect(isValidOrgName(['Apple'], 'apple', { hasNERSupport: true })).toBe(true);
    });

    it('should reject known false positives', () => {
      expect(isValidOrgName(['goon', 'squad'], 'goon squad')).toBe(false);
    });
  });

  describe('isValidHouseName', () => {
    it('should accept names with house markers', () => {
      expect(isValidHouseName(['House', 'Stark'], 'house stark')).toBe(true);
      expect(isValidHouseName(['Order', 'of', 'the', 'Phoenix'], 'order of the phoenix')).toBe(true);
      expect(isValidHouseName(['Gryffindor', 'House'], 'gryffindor house')).toBe(true);
    });

    it('should accept "House of X" patterns', () => {
      expect(isValidHouseName(['House', 'of', 'Slytherin'], 'house of slytherin')).toBe(true);
    });

    it('should require at least one capitalized word', () => {
      expect(isValidHouseName(['Slytherin'], 'Slytherin')).toBe(true);
      expect(isValidHouseName(['the', 'clan'], 'the clan')).toBe(true); // Has marker
    });
  });

  describe('isValidRaceName', () => {
    it('should accept known races', () => {
      expect(isValidRaceName(['Elves'], 'elves')).toBe(true);
      expect(isValidRaceName(['Hobbits'], 'hobbits')).toBe(true);
      expect(isValidRaceName(['Dwarves'], 'dwarves')).toBe(true);
    });

    it('should accept demonym suffixes', () => {
      expect(isValidRaceName(['Gondorian'], 'gondorian')).toBe(true);
      expect(isValidRaceName(['Japanese'], 'japanese')).toBe(true);
    });

    it('should reject gerunds', () => {
      expect(isValidRaceName(['Running'], 'running')).toBe(false);
      expect(isValidRaceName(['Walking'], 'walking')).toBe(false);
    });

    it('should reject generic group nouns', () => {
      expect(isValidRaceName(['people'], 'people')).toBe(false);
      expect(isValidRaceName(['citizens'], 'citizens')).toBe(false);
    });
  });

  describe('isValidSpeciesName', () => {
    it('should accept known species', () => {
      expect(isValidSpeciesName(['dragon'], 'dragon')).toBe(true);
      expect(isValidSpeciesName(['phoenix'], 'phoenix')).toBe(true);
      expect(isValidSpeciesName(['wolf'], 'wolf')).toBe(true);
    });

    it('should reject common verbs', () => {
      expect(isValidSpeciesName(['break'], 'break')).toBe(false);
      expect(isValidSpeciesName(['run'], 'run')).toBe(false);
    });
  });

  describe('isValidItemName', () => {
    it('should accept concrete noun phrases', () => {
      expect(isValidItemName(['Sword'], 'sword')).toBe(true);
      expect(isValidItemName(['Ring', 'of', 'Power'], 'ring of power')).toBe(true);
    });

    it('should reject pronoun-heavy phrases', () => {
      expect(isValidItemName(['my', 'precious'], 'my precious')).toBe(false);
      expect(isValidItemName(['his', 'sword'], 'his sword')).toBe(false);
    });

    it('should reject verb-headed phrases', () => {
      expect(isValidItemName(['walk', 'slowly'], 'walk slowly')).toBe(false);
      expect(isValidItemName(['kill', 'him'], 'kill him')).toBe(false);
    });
  });

  describe('isValidDateName', () => {
    it('should accept names with numbers', () => {
      expect(isValidDateName(['January', '1'], 'january 1')).toBe(true);
      expect(isValidDateName(['2024'], '2024')).toBe(true);
    });

    it('should accept temporal keywords', () => {
      expect(isValidDateName(['Third', 'Age'], 'third age')).toBe(true);
      expect(isValidDateName(['yesterday'], 'yesterday')).toBe(true);
    });

    it('should accept spelled-out numbers', () => {
      expect(isValidDateName(['year', 'one'], 'year one')).toBe(true);
    });

    it('should reject non-date phrases', () => {
      expect(isValidDateName(['random', 'words'], 'random words')).toBe(false);
    });
  });

  describe('isValidEventName', () => {
    it('should accept event patterns', () => {
      expect(isValidEventName(['Battle', 'of', 'Helm\'s', 'Deep'], 'battle of helm\'s deep')).toBe(true);
      expect(isValidEventName(['Council', 'of', 'Elrond'], 'council of elrond')).toBe(true);
    });

    it('should accept event keywords', () => {
      expect(isValidEventName(['The', 'Wedding'], 'the wedding')).toBe(true);
      expect(isValidEventName(['Family', 'Reunion'], 'family reunion')).toBe(true);
    });

    it('should accept NER-backed events', () => {
      expect(isValidEventName(['Olympics'], 'olympics', { hasNERSupport: true })).toBe(true);
    });
  });

  describe('validateEntityForType', () => {
    it('should use correct validator for each type', () => {
      expect(validateEntityForType('John Smith', 'PERSON')).toBe(true);
      expect(validateEntityForType('Black Lake', 'PLACE')).toBe(true);
      expect(validateEntityForType('Ministry of Magic', 'ORG')).toBe(true);
      expect(validateEntityForType('House Stark', 'HOUSE')).toBe(true);
    });

    it('should return true for types without validators', () => {
      expect(validateEntityForType('Something', 'MISC' as any)).toBe(true);
    });
  });

  describe('inferEntityType', () => {
    it('should infer PLACE from geographic markers', () => {
      expect(inferEntityType('Black Mountain', 'MISC')).toBe('PLACE');
      expect(inferEntityType('Crystal Lake', 'MISC')).toBe('PLACE');
    });

    it('should infer ORG from organization markers', () => {
      expect(inferEntityType('Magic Academy', 'MISC')).toBe('ORG');
      expect(inferEntityType('Secret Ministry', 'MISC')).toBe('ORG');
    });

    it('should infer HOUSE from house markers', () => {
      expect(inferEntityType('House Lannister', 'MISC')).toBe('HOUSE');
      expect(inferEntityType('Order of Merlin', 'MISC')).toBe('HOUSE');
    });

    it('should infer EVENT from event patterns', () => {
      expect(inferEntityType('Battle of Five Armies', 'MISC')).toBe('EVENT');
      expect(inferEntityType('Annual Dance', 'MISC')).toBe('EVENT');
    });

    it('should keep original type if no markers found', () => {
      expect(inferEntityType('John', 'PERSON')).toBe('PERSON');
      expect(inferEntityType('SomeThing', 'MISC')).toBe('MISC');
    });
  });

  describe('Constant Sets', () => {
    it('should have common title prefixes', () => {
      expect(TITLE_PREFIXES.has('mr')).toBe(true);
      expect(TITLE_PREFIXES.has('dr')).toBe(true);
      expect(TITLE_PREFIXES.has('professor')).toBe(true);
      expect(TITLE_PREFIXES.has('king')).toBe(true);
    });

    it('should have abstract nouns in person blocklist', () => {
      expect(PERSON_ABSTRACT_BLOCKLIST.has('hope')).toBe(true);
      expect(PERSON_ABSTRACT_BLOCKLIST.has('justice')).toBe(true);
      expect(PERSON_ABSTRACT_BLOCKLIST.has('darkness')).toBe(true);
    });

    it('should have geographic markers', () => {
      expect(GEOGRAPHIC_MARKERS.has('river')).toBe(true);
      expect(GEOGRAPHIC_MARKERS.has('mountain')).toBe(true);
      expect(GEOGRAPHIC_MARKERS.has('lake')).toBe(true);
    });

    it('should have organization markers', () => {
      expect(ORGANIZATION_MARKERS.has('school')).toBe(true);
      expect(ORGANIZATION_MARKERS.has('university')).toBe(true);
      expect(ORGANIZATION_MARKERS.has('ministry')).toBe(true);
    });
  });
});
