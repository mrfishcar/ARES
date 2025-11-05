/**
 * Unit tests for Narrative Relation Extraction (Phase E3)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractNarrativeRelations,
  extractPossessiveFamilyRelations,
  extractAllNarrativeRelations
} from '../../app/engine/narrative-relations';

describe('Narrative Relation Extraction', () => {
  describe('extractNarrativeRelations - Marriage Patterns', () => {
    it('should extract "X married Y" pattern', () => {
      const text = 'Aria Thorne married Elias Calder in 3005.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Elias Calder', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      expect(relations.length).toBeGreaterThanOrEqual(2); // Symmetric relations

      const forwardRel = relations.find(r => r.subj === 'E001' && r.obj === 'E002');
      expect(forwardRel).toBeDefined();
      expect(forwardRel!.pred).toBe('married_to');
      expect(forwardRel!.confidence).toBe(0.85);
      expect(forwardRel!.extractor).toBe('regex');

      const reverseRel = relations.find(r => r.subj === 'E002' && r.obj === 'E001');
      expect(reverseRel).toBeDefined();
      expect(reverseRel!.pred).toBe('married_to');
    });

    it('should extract "X and Y married" pattern', () => {
      const text = 'Aria Thorne and Elias Calder married in the spring.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Elias Calder', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      expect(relations.length).toBeGreaterThanOrEqual(2);
      const forwardRel = relations.find(r => r.subj === 'E001' && r.obj === 'E002');
      expect(forwardRel).toBeDefined();
      expect(forwardRel!.pred).toBe('married_to');
    });

    it('should skip marriage with non-PERSON entities', () => {
      const text = 'Aria Thorne married Meridian Ridge.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Meridian Ridge', type: 'PLACE' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      const marriageRel = relations.find(r => r.pred === 'married_to');
      expect(marriageRel).toBeUndefined();
    });
  });

  describe('extractNarrativeRelations - Friendship Patterns', () => {
    it('should extract "X remained friends with Y"', () => {
      const text = 'Aria Thorne remained friends with Jun Park.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Jun Park', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      expect(relations.length).toBeGreaterThanOrEqual(2);
      const friendRel = relations.find(r => r.subj === 'E001' && r.obj === 'E002');
      expect(friendRel).toBeDefined();
      expect(friendRel!.pred).toBe('friends_with');
    });

    it('should extract "X and Y remained friends"', () => {
      const text = 'Aria Thorne and Jun Park remained best friends.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Jun Park', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      expect(relations.length).toBeGreaterThanOrEqual(2);
      const friendRel = relations.find(r => r.pred === 'friends_with');
      expect(friendRel).toBeDefined();
    });
  });

  describe('extractNarrativeRelations - Enemy Patterns', () => {
    it('should extract "X became enemy of Y"', () => {
      const text = 'Aria Thorne became an enemy of Kara Nightfall.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Kara Nightfall', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      expect(relations.length).toBeGreaterThanOrEqual(2);
      const enemyRel = relations.find(r => r.subj === 'E001' && r.obj === 'E002');
      expect(enemyRel).toBeDefined();
      expect(enemyRel!.pred).toBe('enemy_of');
    });

    it('should extract "X and Y became enemies"', () => {
      const text = 'Aria Thorne and Kara Nightfall became rivals.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Kara Nightfall', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      expect(relations.length).toBeGreaterThanOrEqual(2);
      const rivalRel = relations.find(r => r.pred === 'enemy_of');
      expect(rivalRel).toBeDefined();
    });
  });

  describe('extractNarrativeRelations - Education Patterns', () => {
    it('should extract "X studied at Y"', () => {
      const text = 'Aria Thorne studied at Meridian Academy.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Meridian Academy', type: 'ORG' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      expect(relations.length).toBeGreaterThanOrEqual(1);
      const studyRel = relations.find(r => r.subj === 'E001' && r.obj === 'E002');
      expect(studyRel).toBeDefined();
      expect(studyRel!.pred).toBe('studies_at');
    });

    it('should extract "X taught at Y"', () => {
      const text = 'Kara Nightfall taught at Meridian Academy.';
      const entities = [
        { id: 'E001', canonical: 'Kara Nightfall', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Meridian Academy', type: 'ORG' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      expect(relations.length).toBeGreaterThanOrEqual(1);
      const teachRel = relations.find(r => r.subj === 'E001' && r.obj === 'E002');
      expect(teachRel).toBeDefined();
      expect(teachRel!.pred).toBe('teaches_at');
    });
  });

  describe('extractNarrativeRelations - Location Patterns', () => {
    it('should extract "X lived in Y"', () => {
      const text = 'Aria Thorne lived in Meridian Ridge.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Meridian Ridge', type: 'PLACE' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      expect(relations.length).toBeGreaterThanOrEqual(1);
      const liveRel = relations.find(r => r.subj === 'E001' && r.obj === 'E002');
      expect(liveRel).toBeDefined();
      expect(liveRel!.pred).toBe('lives_in');
    });
  });

  describe('extractNarrativeRelations - Travel Patterns', () => {
    it('should extract "X traveled to Y"', () => {
      const text = 'Aria Thorne traveled to Meridian Ridge.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Meridian Ridge', type: 'PLACE' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      expect(relations.length).toBeGreaterThanOrEqual(1);
      const travelRel = relations.find(r => r.subj === 'E001' && r.obj === 'E002');
      expect(travelRel).toBeDefined();
      expect(travelRel!.pred).toBe('traveled_to');
    });
  });

  describe('extractNarrativeRelations - Battle Patterns', () => {
    it('should extract "X fought in Y"', () => {
      const text = 'Aria Thorne fought in the Battle of Meridian.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Battle of Meridian', type: 'EVENT' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      expect(relations.length).toBeGreaterThanOrEqual(1);
      const fightRel = relations.find(r => r.subj === 'E001' && r.obj === 'E002');
      expect(fightRel).toBeDefined();
      expect(fightRel!.pred).toBe('fought_in');
    });
  });

  describe('extractNarrativeRelations - Entity Matching', () => {
    it('should match entities by canonical name (case-insensitive matching)', () => {
      // Note: Patterns require capitalized text, but matching is case-insensitive
      const text = 'Aria Thorne married Elias Calder.';
      const entities = [
        { id: 'E001', canonical: 'aria thorne', type: 'PERSON' as const, aliases: [] }, // lowercase canonical
        { id: 'E002', canonical: 'elias calder', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      expect(relations.length).toBeGreaterThanOrEqual(2);
    });

    it('should match entities by aliases', () => {
      const text = 'Aria married Eli.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: ['Aria'] },
        { id: 'E002', canonical: 'Elias Calder', type: 'PERSON' as const, aliases: ['Eli'] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      expect(relations.length).toBeGreaterThanOrEqual(2);
      const rel = relations.find(r => r.pred === 'married_to');
      expect(rel).toBeDefined();
    });

    it('should skip unrecognized entities', () => {
      const text = 'Aria Thorne married Unknown Person.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      expect(relations.length).toBe(0);
    });

    it('should skip self-relations', () => {
      const text = 'Aria Thorne remained friends with Aria Thorne.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      expect(relations.length).toBe(0);
    });
  });

  describe('extractPossessiveFamilyRelations', () => {
    it('should extract "X\'s daughter" → parent_of', () => {
      const text = 'Aria Thorne\'s daughter Mira played in the garden.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Mira', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractPossessiveFamilyRelations(text, entities);

      expect(relations.length).toBeGreaterThanOrEqual(1);
      const parentRel = relations.find(r => r.subj === 'E001' && r.obj === 'E002');
      expect(parentRel).toBeDefined();
      expect(parentRel!.pred).toBe('parent_of');
      expect(parentRel!.confidence).toBe(0.80);
      expect(parentRel!.extractor).toBe('regex');
    });

    it('should extract "X\'s son" → parent_of', () => {
      const text = 'Elias Calder\'s son Thomas studied physics.';
      const entities = [
        { id: 'E001', canonical: 'Elias Calder', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Thomas', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractPossessiveFamilyRelations(text, entities);

      expect(relations.length).toBeGreaterThanOrEqual(1);
      const parentRel = relations.find(r => r.pred === 'parent_of');
      expect(parentRel).toBeDefined();
    });

    it('should extract "X\'s brother" → sibling_of (symmetric)', () => {
      const text = 'Aria Thorne\'s brother Kael lived in the north.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Kael', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractPossessiveFamilyRelations(text, entities);

      expect(relations.length).toBeGreaterThanOrEqual(2); // Symmetric
      const siblingRel = relations.find(r => r.subj === 'E001' && r.obj === 'E002');
      expect(siblingRel).toBeDefined();
      expect(siblingRel!.pred).toBe('sibling_of');
    });

    it('should skip if no entity found after possessive', () => {
      const text = 'Aria Thorne\'s daughter lived far away.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractPossessiveFamilyRelations(text, entities);

      expect(relations.length).toBe(0);
    });

    it('should skip self-relations', () => {
      const text = 'Aria Thorne\'s daughter Aria Thorne studied hard.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractPossessiveFamilyRelations(text, entities);

      expect(relations.length).toBe(0);
    });
  });

  describe('extractAllNarrativeRelations', () => {
    it('should combine narrative and possessive patterns', () => {
      const text = 'Aria Thorne married Elias Calder. Aria Thorne\'s daughter Mira was born in 3010.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Elias Calder', type: 'PERSON' as const, aliases: [] },
        { id: 'E003', canonical: 'Mira', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractAllNarrativeRelations(text, entities);

      // Should have marriage relations (2 symmetric) + parent_of relation (1)
      expect(relations.length).toBeGreaterThanOrEqual(3);

      const marriageRel = relations.find(r => r.pred === 'married_to');
      expect(marriageRel).toBeDefined();

      const parentRel = relations.find(r => r.pred === 'parent_of');
      expect(parentRel).toBeDefined();
    });

    it('should extract multiple relation types', () => {
      const text = 'Aria Thorne studied at Meridian Academy. Aria Thorne remained friends with Jun Park.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Meridian Academy', type: 'ORG' as const, aliases: [] },
        { id: 'E003', canonical: 'Jun Park', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractAllNarrativeRelations(text, entities);

      const studyRel = relations.find(r => r.pred === 'studies_at');
      expect(studyRel).toBeDefined();

      const friendRel = relations.find(r => r.pred === 'friends_with');
      expect(friendRel).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty text', () => {
      const text = '';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);
      expect(relations.length).toBe(0);
    });

    it('should handle empty entity list', () => {
      const text = 'Aria Thorne married Elias Calder.';
      const entities: any[] = [];

      const relations = extractNarrativeRelations(text, entities);
      expect(relations.length).toBe(0);
    });

    it('should handle multiple matches in same text', () => {
      const text = 'Aria married Elias. Kara married Jun. Mira married Thomas.';
      const entities = [
        { id: 'E001', canonical: 'Aria', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Elias', type: 'PERSON' as const, aliases: [] },
        { id: 'E003', canonical: 'Kara', type: 'PERSON' as const, aliases: [] },
        { id: 'E004', canonical: 'Jun', type: 'PERSON' as const, aliases: [] },
        { id: 'E005', canonical: 'Mira', type: 'PERSON' as const, aliases: [] },
        { id: 'E006', canonical: 'Thomas', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      // 3 marriages × 2 (symmetric) = 6 relations
      expect(relations.length).toBe(6);
      expect(relations.filter(r => r.pred === 'married_to').length).toBe(6);
    });

    it('should include evidence spans', () => {
      const text = 'Aria Thorne married Elias Calder.';
      const entities = [
        { id: 'E001', canonical: 'Aria Thorne', type: 'PERSON' as const, aliases: [] },
        { id: 'E002', canonical: 'Elias Calder', type: 'PERSON' as const, aliases: [] }
      ];

      const relations = extractNarrativeRelations(text, entities);

      const rel = relations[0];
      expect(rel.evidence).toBeDefined();
      expect(rel.evidence.length).toBe(1);
      expect(rel.evidence[0].span).toBeDefined();
      expect(rel.evidence[0].span.text).toContain('married');
      expect(rel.evidence[0].source).toBe('RULE');
      expect(rel.confidence).toBe(0.85); // Confidence is on the relation, not evidence
    });
  });
});
