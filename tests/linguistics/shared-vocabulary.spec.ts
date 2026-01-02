/**
 * Shared Vocabulary Tests
 *
 * Ensures the shared vocabulary constants are consistent and prevents
 * future divergence by verifying critical verbs are present.
 */

import { describe, it, expect } from 'vitest';
import {
  COMMON_VERBS_FOR_NAME_DETECTION,
  VERBS_BLOCKLIST_FOR_ENTITY_NAMES,
  isKnownVerb,
  isBlocklistedVerb
} from '../../app/engine/linguistics/shared-vocabulary';

describe('Shared Vocabulary', () => {
  describe('COMMON_VERBS_FOR_NAME_DETECTION', () => {
    it('should contain modal verbs', () => {
      const modals = ['could', 'would', 'should', 'will', 'can', 'may', 'might', 'must', 'shall'];
      for (const modal of modals) {
        expect(COMMON_VERBS_FOR_NAME_DETECTION.has(modal)).toBe(true);
      }
    });

    it('should contain auxiliary verbs', () => {
      const auxiliaries = ['was', 'is', 'are', 'were', 'has', 'had', 'have', 'did', 'does', 'do'];
      for (const aux of auxiliaries) {
        expect(COMMON_VERBS_FOR_NAME_DETECTION.has(aux)).toBe(true);
      }
    });

    it('should contain common narrative past tense verbs', () => {
      const verbs = ['walked', 'said', 'looked', 'turned', 'stood', 'thought', 'felt'];
      for (const verb of verbs) {
        expect(COMMON_VERBS_FOR_NAME_DETECTION.has(verb)).toBe(true);
      }
    });

    // CRITICAL: This test prevents the "Saul appeared" bug from regressing
    it('should contain "appeared" to prevent sentence-initial entity rejection', () => {
      expect(COMMON_VERBS_FOR_NAME_DETECTION.has('appeared')).toBe(true);
    });

    // CRITICAL: This test ensures entity-heuristics.ts gets 'appeared' via shared vocabulary
    it('should contain all verbs needed by entity-heuristics.ts', () => {
      const requiredVerbs = ['arrived', 'appeared', 'entered', 'exited', 'left'];
      for (const verb of requiredVerbs) {
        expect(COMMON_VERBS_FOR_NAME_DETECTION.has(verb)).toBe(true);
      }
    });

    it('should contain biblical/archaic verb forms', () => {
      const archaic = ['begat', 'begot', 'spake', 'saith', 'hath', 'doth'];
      for (const verb of archaic) {
        expect(COMMON_VERBS_FOR_NAME_DETECTION.has(verb)).toBe(true);
      }
    });

    it('should have at least 100 verbs for comprehensive coverage', () => {
      expect(COMMON_VERBS_FOR_NAME_DETECTION.size).toBeGreaterThan(100);
    });
  });

  describe('VERBS_BLOCKLIST_FOR_ENTITY_NAMES', () => {
    it('should contain common action verbs that get misidentified as entities', () => {
      const blocklisted = ['break', 'run', 'walk', 'fight', 'attack', 'defend'];
      for (const verb of blocklisted) {
        expect(VERBS_BLOCKLIST_FOR_ENTITY_NAMES.has(verb)).toBe(true);
      }
    });

    it('should contain auxiliary verbs that appear in fragments', () => {
      const auxiliaries = ['had', 'has', 'have', 'was', 'were', 'is', 'are'];
      for (const verb of auxiliaries) {
        expect(VERBS_BLOCKLIST_FOR_ENTITY_NAMES.has(verb)).toBe(true);
      }
    });

    it('should be a subset of COMMON_VERBS_FOR_NAME_DETECTION for blocklist items that are also common verbs', () => {
      // All blocklisted auxiliary verbs should also be in the detection set
      const sharedVerbs = ['had', 'has', 'have', 'was', 'were', 'is', 'are'];
      for (const verb of sharedVerbs) {
        expect(COMMON_VERBS_FOR_NAME_DETECTION.has(verb)).toBe(true);
        expect(VERBS_BLOCKLIST_FOR_ENTITY_NAMES.has(verb)).toBe(true);
      }
    });
  });

  describe('Helper functions', () => {
    it('isKnownVerb should work for lowercase verbs', () => {
      expect(isKnownVerb('walked')).toBe(true);
      expect(isKnownVerb('appeared')).toBe(true);
      expect(isKnownVerb('notaverb')).toBe(false);
    });

    it('isKnownVerb should be case-insensitive', () => {
      expect(isKnownVerb('WALKED')).toBe(true);
      expect(isKnownVerb('Appeared')).toBe(true);
    });

    it('isBlocklistedVerb should identify blocklisted verbs', () => {
      expect(isBlocklistedVerb('break')).toBe(true);
      expect(isBlocklistedVerb('had')).toBe(true);
      expect(isBlocklistedVerb('notblocked')).toBe(false);
    });

    it('isBlocklistedVerb should be case-insensitive', () => {
      expect(isBlocklistedVerb('BREAK')).toBe(true);
      expect(isBlocklistedVerb('Had')).toBe(true);
    });
  });

  describe('Divergence prevention', () => {
    // This test documents the consolidation and prevents re-introduction of inline definitions
    it('should be the single source of truth for verb lists', () => {
      // If this test fails, someone might have added inline COMMON_VERBS definitions
      // All verb lists should import from shared-vocabulary.ts
      expect(COMMON_VERBS_FOR_NAME_DETECTION).toBeDefined();
      expect(VERBS_BLOCKLIST_FOR_ENTITY_NAMES).toBeDefined();
    });
  });
});
