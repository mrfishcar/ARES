/**
 * Unit tests for Coreference Resolution (Phase E2)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isPronoun,
  isDescriptor,
  getPronounType,
  extractRole,
  resolvePronoun,
  resolveDescriptor,
  resolveCoreferences
} from '../../app/engine/coreference';
import {
  createMention,
  createEntityCluster,
  resetIdCounters,
  type EntityCluster
} from '../../app/engine/mention-tracking';

describe('Coreference Resolution', () => {
  beforeEach(() => {
    resetIdCounters();
  });

  describe('isPronoun', () => {
    it('should detect person pronouns', () => {
      expect(isPronoun('she')).toBe(true);
      expect(isPronoun('He')).toBe(true);
      expect(isPronoun('THEY')).toBe(true);
      expect(isPronoun('himself')).toBe(true);
    });

    it('should reject non-pronouns', () => {
      expect(isPronoun('Aria')).toBe(false);
      expect(isPronoun('the')).toBe(false);
      expect(isPronoun('strategist')).toBe(false);
    });
  });

  describe('isDescriptor', () => {
    it('should detect role-based descriptors', () => {
      expect(isDescriptor('the strategist')).toBe(true);
      expect(isDescriptor('the explorer')).toBe(true);
      expect(isDescriptor('the professor')).toBe(true);
    });

    it('should detect relational descriptors', () => {
      expect(isDescriptor('the son')).toBe(true);
      expect(isDescriptor('the daughter')).toBe(true);
      expect(isDescriptor('the father')).toBe(true);
    });

    it('should detect multi-word descriptors', () => {
      expect(isDescriptor('the young woman')).toBe(true);
      expect(isDescriptor('the old man')).toBe(true);
    });

    it('should reject non-descriptors', () => {
      expect(isDescriptor('Aria Thorne')).toBe(false);
      expect(isDescriptor('she')).toBe(false);
    });
  });

  describe('getPronounType', () => {
    it('should classify male pronouns', () => {
      expect(getPronounType('he')).toBe('male');
      expect(getPronounType('him')).toBe('male');
      expect(getPronounType('his')).toBe('male');
    });

    it('should classify female pronouns', () => {
      expect(getPronounType('she')).toBe('female');
      expect(getPronounType('her')).toBe('female');
      expect(getPronounType('hers')).toBe('female');
    });

    it('should classify plural pronouns', () => {
      expect(getPronounType('they')).toBe('plural');
      expect(getPronounType('them')).toBe('plural');
      expect(getPronounType('their')).toBe('plural');
    });
  });

  describe('extractRole', () => {
    it('should extract role from simple descriptors', () => {
      expect(extractRole('the strategist')).toBe('strategist');
      expect(extractRole('the explorer')).toBe('explorer');
      expect(extractRole('the professor')).toBe('professor');
    });

    it('should extract role from relational descriptors', () => {
      expect(extractRole('the son')).toBe('son');
      expect(extractRole('the daughter')).toBe('daughter');
    });

    it('should return null for non-descriptors', () => {
      expect(extractRole('Aria Thorne')).toBeNull();
      expect(extractRole('she')).toBeNull();
    });
  });

  describe('resolvePronoun', () => {
    it('should resolve female pronoun to recent female entity', () => {
      resetIdCounters();

      // Create Aria Thorne (female) mentioned in sentence 0
      const ariaM1 = createMention('', [0, 11], 'Aria Thorne', 0, 'canonical', 0.9);
      const ariaCluster = createEntityCluster('PERSON', 'Aria Thorne', ariaM1, ['NER'], 0.85);

      // Create Elias Calder (male) mentioned in sentence 1
      const eliasM1 = createMention('', [50, 62], 'Elias Calder', 1, 'canonical', 0.9);
      const eliasCluster = createEntityCluster('PERSON', 'Elias Calder', eliasM1, ['NER'], 0.85);

      const clusters = [ariaCluster, eliasCluster];

      // Resolve "she" in sentence 2 (should resolve to Aria)
      const resolved = resolvePronoun('she', 2, clusters, 3);

      expect(resolved).not.toBeNull();
      expect(resolved!.canonical).toBe('Aria Thorne');
    });

    it('should resolve male pronoun to recent male entity', () => {
      resetIdCounters();

      const ariaM1 = createMention('', [0, 11], 'Aria Thorne', 0, 'canonical', 0.9);
      const ariaCluster = createEntityCluster('PERSON', 'Aria Thorne', ariaM1, ['NER'], 0.85);

      const eliasM1 = createMention('', [50, 62], 'Elias Calder', 1, 'canonical', 0.9);
      const eliasCluster = createEntityCluster('PERSON', 'Elias Calder', eliasM1, ['NER'], 0.85);

      const clusters = [ariaCluster, eliasCluster];

      // Resolve "he" in sentence 2 (should resolve to Elias)
      const resolved = resolvePronoun('he', 2, clusters, 3);

      expect(resolved).not.toBeNull();
      expect(resolved!.canonical).toBe('Elias Calder');
    });

    it('should return null if no entity within window', () => {
      resetIdCounters();

      const ariaM1 = createMention('', [0, 11], 'Aria Thorne', 0, 'canonical', 0.9);
      const ariaCluster = createEntityCluster('PERSON', 'Aria Thorne', ariaM1, ['NER'], 0.85);

      const clusters = [ariaCluster];

      // Resolve "she" in sentence 10 with window=3 (Aria at sentence 0, too far)
      const resolved = resolvePronoun('she', 10, clusters, 3);

      expect(resolved).toBeNull();
    });

    it('should prefer most recent entity', () => {
      resetIdCounters();

      // Aria mentioned in sentence 0
      const ariaM1 = createMention('', [0, 11], 'Aria Thorne', 0, 'canonical', 0.9);
      const ariaCluster = createEntityCluster('PERSON', 'Aria Thorne', ariaM1, ['NER'], 0.85);

      // Mira mentioned in sentence 2 (more recent)
      const miraM1 = createMention('', [100, 111], 'Mira Calder', 2, 'canonical', 0.9);
      const miraCluster = createEntityCluster('PERSON', 'Mira Calder', miraM1, ['NER'], 0.85);

      const clusters = [ariaCluster, miraCluster];

      // Resolve "she" in sentence 3 (should resolve to Mira, more recent)
      const resolved = resolvePronoun('she', 3, clusters, 3);

      expect(resolved).not.toBeNull();
      expect(resolved!.canonical).toBe('Mira Calder');
    });
  });

  describe('resolveDescriptor', () => {
    it('should resolve descriptor to entity with matching role', () => {
      resetIdCounters();

      // Kara Nightfall, the strategist
      const karaM1 = createMention('', [0, 14], 'Kara Nightfall', 0, 'canonical', 0.9);
      const karaCluster = createEntityCluster('PERSON', 'Kara Nightfall', karaM1, ['NER'], 0.85);
      karaCluster.aliases.push('the strategist');

      // Aria Thorne, the explorer
      const ariaM1 = createMention('', [50, 61], 'Aria Thorne', 1, 'canonical', 0.9);
      const ariaCluster = createEntityCluster('PERSON', 'Aria Thorne', ariaM1, ['NER'], 0.85);
      ariaCluster.aliases.push('the explorer');

      const clusters = [karaCluster, ariaCluster];

      // Resolve "the strategist" in sentence 2
      const resolved = resolveDescriptor('the strategist', 2, clusters, 5);

      expect(resolved).not.toBeNull();
      expect(resolved!.canonical).toBe('Kara Nightfall');
    });

    it('should fall back to most recent person if no role match', () => {
      resetIdCounters();

      const ariaM1 = createMention('', [0, 11], 'Aria Thorne', 0, 'canonical', 0.9);
      const ariaCluster = createEntityCluster('PERSON', 'Aria Thorne', ariaM1, ['NER'], 0.85);

      const eliasM1 = createMention('', [50, 62], 'Elias Calder', 2, 'canonical', 0.9);
      const eliasCluster = createEntityCluster('PERSON', 'Elias Calder', eliasM1, ['NER'], 0.85);

      const clusters = [ariaCluster, eliasCluster];

      // Resolve "the professor" (no match, should fall back to Elias, more recent)
      const resolved = resolveDescriptor('the professor', 3, clusters, 5);

      expect(resolved).not.toBeNull();
      expect(resolved!.canonical).toBe('Elias Calder');
    });

    it('should return null if no entity within window', () => {
      resetIdCounters();

      const ariaM1 = createMention('', [0, 11], 'Aria Thorne', 0, 'canonical', 0.9);
      const ariaCluster = createEntityCluster('PERSON', 'Aria Thorne', ariaM1, ['NER'], 0.85);

      const clusters = [ariaCluster];

      // Resolve "the explorer" in sentence 10 with window=5 (Aria at sentence 0, too far)
      const resolved = resolveDescriptor('the explorer', 10, clusters, 5);

      expect(resolved).toBeNull();
    });
  });

  describe('resolveCoreferences', () => {
    it('should resolve multiple pronouns in text', () => {
      resetIdCounters();

      const text = 'Aria Thorne explored the ruins. She discovered ancient artifacts. They were magnificent.';

      const ariaM1 = createMention('', [0, 11], 'Aria Thorne', 0, 'canonical', 0.9);
      const ariaCluster = createEntityCluster('PERSON', 'Aria Thorne', ariaM1, ['NER'], 0.85);

      const clusters = [ariaCluster];

      const resolutions = resolveCoreferences(text, clusters);

      expect(resolutions.has('she')).toBe(true);
      expect(resolutions.get('she')).toBe(ariaCluster.id);
    });

    it('should resolve descriptors in text', () => {
      resetIdCounters();

      const text = 'Kara Nightfall led the mission. The strategist made critical decisions.';

      const karaM1 = createMention('', [0, 14], 'Kara Nightfall', 0, 'canonical', 0.9);
      const karaCluster = createEntityCluster('PERSON', 'Kara Nightfall', karaM1, ['NER'], 0.85);
      karaCluster.aliases.push('the strategist');

      const clusters = [karaCluster];

      const resolutions = resolveCoreferences(text, clusters);

      expect(resolutions.has('the strategist')).toBe(true);
      expect(resolutions.get('the strategist')).toBe(karaCluster.id);
    });
  });
});
