/**
 * Guardrail Test: Prevent Legacy Coref Resurrection
 *
 * This test ensures that the legacy coreference tracking patterns do not
 * creep back into the codebase. All pronoun resolution must go through
 * the unified TokenResolver/ReferenceResolver service.
 *
 * IMPORTANT: If this test fails, do NOT add the banned patterns back.
 * Instead, extend TokenResolver to handle your use case.
 *
 * Banned patterns:
 * - lastNamedSubject, lastNamedOrg, lastSchoolOrg state variables
 * - recentPersons array tracking
 * - pushRecentPerson(), pushRecentOrg() functions
 * - resolvePossessors() outside TokenResolver (legacy version)
 * - updateLastNamedSubject() function
 * - resolveAcademicSubject() outside resolveAcademicSubjectUnified
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const RELATIONS_TS_PATH = path.join(__dirname, '../../app/engine/extract/relations.ts');

describe('Guardrail: No Legacy Coref Patterns', () => {
  const relationsCode = fs.readFileSync(RELATIONS_TS_PATH, 'utf-8');

  describe('Banned State Variables', () => {
    it('should NOT contain lastNamedSubject state variable', () => {
      // Allow references in comments, but not declarations
      const declarationPattern = /let\s+lastNamedSubject\s*[=:]/;
      expect(relationsCode).not.toMatch(declarationPattern);
    });

    it('should NOT contain lastNamedOrg state variable', () => {
      const declarationPattern = /let\s+lastNamedOrg\s*[=:]/;
      expect(relationsCode).not.toMatch(declarationPattern);
    });

    it('should NOT contain lastSchoolOrg state variable', () => {
      const declarationPattern = /let\s+lastSchoolOrg\s*[=:]/;
      expect(relationsCode).not.toMatch(declarationPattern);
    });

    it('should NOT contain recentPersons array', () => {
      const declarationPattern = /const\s+recentPersons\s*[=:]/;
      expect(relationsCode).not.toMatch(declarationPattern);
    });
  });

  describe('Banned Functions', () => {
    it('should NOT contain pushRecentPerson function', () => {
      const functionPattern = /const\s+pushRecentPerson\s*=/;
      expect(relationsCode).not.toMatch(functionPattern);
    });

    it('should NOT contain pushRecentOrg function', () => {
      const functionPattern = /const\s+pushRecentOrg\s*=/;
      expect(relationsCode).not.toMatch(functionPattern);
    });

    it('should NOT contain legacy resolvePossessors function (outside unified adapter)', () => {
      // The legacy resolvePossessors was a local function that used recentPersons
      // The unified version calls tokenResolver.resolvePossessors
      const legacyPattern = /const\s+resolvePossessors\s*=\s*\([^)]*\)\s*:\s*Token\[\]\s*=>/;
      expect(relationsCode).not.toMatch(legacyPattern);
    });

    it('should NOT contain updateLastNamedSubject function', () => {
      const functionPattern = /const\s+updateLastNamedSubject\s*=/;
      expect(relationsCode).not.toMatch(functionPattern);
    });

    it('should NOT contain legacy resolveAcademicSubject function', () => {
      // The legacy version was: const resolveAcademicSubject = (tok, tokensRef) => ...
      // The unified version is: resolveAcademicSubjectUnified
      const legacyPattern = /const\s+resolveAcademicSubject\s*=\s*\([^)]*\)\s*:\s*Token\s*\|\s*null\s*=>/;
      expect(relationsCode).not.toMatch(legacyPattern);
    });
  });

  describe('Required Unified Resolution', () => {
    it('should use resolvePronounToken for pronoun resolution', () => {
      // Verify the unified adapter exists
      expect(relationsCode).toContain('const resolvePronounToken = ');
    });

    it('should use resolvePossessorsUnified for possessive resolution', () => {
      expect(relationsCode).toContain('const resolvePossessorsUnified = ');
    });

    it('should use trackEntityMention for entity tracking', () => {
      expect(relationsCode).toContain('const trackEntityMention = ');
    });

    it('should use resolveAcademicSubjectUnified for academic title resolution', () => {
      expect(relationsCode).toContain('const resolveAcademicSubjectUnified = ');
    });

    it('should receive tokenResolver parameter', () => {
      expect(relationsCode).toContain('tokenResolver?: TokenResolver');
    });
  });

  describe('No FORCE_TOKEN_RESOLVER Flag', () => {
    it('should NOT contain FORCE_TOKEN_RESOLVER flag (legacy code was deleted)', () => {
      const flagPattern = /FORCE_TOKEN_RESOLVER/;
      expect(relationsCode).not.toMatch(flagPattern);
    });
  });
});
