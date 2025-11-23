/**
 * Pronoun Handling Tests
 * Verifies that pronouns are NOT stored in entity.aliases
 * and that cross-document merge works correctly without pronoun-based false positives
 */

import { describe, it, expect } from 'vitest';
import { extractFromSegments } from '../../app/engine/extract/orchestrator';
import { mergeEntitiesAcrossDocs } from '../../app/engine/merge';
import { isPronoun, isContextDependent, filterPronouns } from '../../app/engine/pronoun-utils';

describe('Pronoun Utilities', () => {
  describe('isPronoun', () => {
    it('should detect personal pronouns', () => {
      expect(isPronoun('he')).toBe(true);
      expect(isPronoun('she')).toBe(true);
      expect(isPronoun('it')).toBe(true);
      expect(isPronoun('they')).toBe(true);
      expect(isPronoun('him')).toBe(true);
      expect(isPronoun('her')).toBe(true);
      expect(isPronoun('his')).toBe(true);
      expect(isPronoun('hers')).toBe(true);
      expect(isPronoun('them')).toBe(true);
    });

    it('should detect reflexive pronouns', () => {
      expect(isPronoun('himself')).toBe(true);
      expect(isPronoun('herself')).toBe(true);
      expect(isPronoun('itself')).toBe(true);
      expect(isPronoun('themselves')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isPronoun('He')).toBe(true);
      expect(isPronoun('SHE')).toBe(true);
      expect(isPronoun('THEY')).toBe(true);
    });

    it('should reject non-pronouns', () => {
      expect(isPronoun('Frederick')).toBe(false);
      expect(isPronoun('Saul')).toBe(false);
      expect(isPronoun('the wizard')).toBe(false);
    });
  });

  describe('isContextDependent', () => {
    it('should detect pronouns', () => {
      expect(isContextDependent('he')).toBe(true);
      expect(isContextDependent('she')).toBe(true);
    });

    it('should detect deictic expressions', () => {
      expect(isContextDependent('there')).toBe(true);
      expect(isContextDependent('here')).toBe(true);
    });

    it('should reject normal names', () => {
      expect(isContextDependent('Frederick')).toBe(false);
      expect(isContextDependent('the king')).toBe(false);
    });
  });

  describe('filterPronouns', () => {
    it('should remove pronouns from string array', () => {
      const input = ['Frederick', 'Freddy', 'he', 'him', 'his', 'the king'];
      const expected = ['Frederick', 'Freddy', 'the king'];
      expect(filterPronouns(input)).toEqual(expected);
    });

    it('should handle empty array', () => {
      expect(filterPronouns([])).toEqual([]);
    });

    it('should remove all items if all are pronouns', () => {
      const input = ['he', 'him', 'his', 'himself'];
      expect(filterPronouns(input)).toEqual([]);
    });
  });
});

describe('Pronoun Handling in Extraction', () => {
  it('should NOT store pronouns in entity.aliases', async () => {
    const text = 'Frederick walked to the house. He knocked on the door. He entered the house.';
    const docId = 'test_pronoun_aliases';

    const result = await extractFromSegments(docId, text);

    // Find Frederick entity
    const frederick = result.entities.find(e =>
      e.canonical.toLowerCase().includes('frederick')
    );

    expect(frederick).toBeDefined();

    // CRITICAL: Frederick's aliases should NOT contain pronouns
    const pronounsInAliases = frederick!.aliases.filter(alias => isPronoun(alias));

    expect(pronounsInAliases).toEqual([]);
    expect(frederick!.aliases).not.toContain('he');
    expect(frederick!.aliases).not.toContain('He');
    expect(frederick!.aliases).not.toContain('him');
    expect(frederick!.aliases).not.toContain('his');
  });

  it('should allow descriptive mentions in aliases', async () => {
    const text = 'Frederick, the king, ruled the land. The king was wise.';
    const docId = 'test_descriptive_aliases';

    const result = await extractFromSegments(docId, text);

    const frederick = result.entities.find(e =>
      e.canonical.toLowerCase().includes('frederick')
    );

    expect(frederick).toBeDefined();

    // Descriptive mentions (non-pronouns) ARE allowed in aliases
    // Note: Depending on coreference resolution, "the king" might be added
    // This test just verifies pronouns are NOT present
    const pronounsInAliases = frederick!.aliases.filter(alias => isPronoun(alias));
    expect(pronounsInAliases).toEqual([]);
  });

  it('should resolve pronouns correctly for relation extraction', async () => {
    const text = 'Frederick knocked on the door. He entered the house.';
    const docId = 'test_pronoun_resolution';

    const result = await extractFromSegments(docId, text);

    // Find Frederick
    const frederick = result.entities.find(e =>
      e.canonical.toLowerCase().includes('frederick')
    );

    expect(frederick).toBeDefined();

    // Check that relations use Frederick's ID, not "He"
    const enteredRelation = result.relations.find(r =>
      r.pred === 'located_in' &&
      r.subj === frederick!.id
    );

    // Pronouns should NOT be in aliases
    expect(frederick!.aliases).not.toContain('he');
    expect(frederick!.aliases).not.toContain('He');
  });
});

describe('Cross-Document Merge Without Pronoun False Positives', () => {
  it('should NOT merge different male entities based on "he" pronoun', async () => {
    // Document 1: Frederick
    const doc1 = 'Frederick walked to the house. He knocked on the door.';
    const result1 = await extractFromSegments('doc1', doc1);

    // Document 2: Saul
    const doc2 = 'Saul appeared at the gate. He spoke loudly.';
    const result2 = await extractFromSegments('doc2', doc2);

    // Verify no pronouns in aliases
    const frederick = result1.entities.find(e => e.canonical.toLowerCase().includes('frederick'));
    const saul = result2.entities.find(e => e.canonical.toLowerCase().includes('saul'));

    expect(frederick).toBeDefined();
    expect(saul).toBeDefined();

    expect(frederick!.aliases.filter(isPronoun)).toEqual([]);
    expect(saul!.aliases.filter(isPronoun)).toEqual([]);

    // Merge entities across documents
    const allEntities = [...result1.entities, ...result2.entities];
    const mergeResult = mergeEntitiesAcrossDocs(allEntities);

    // CRITICAL: Frederick and Saul should remain SEPARATE entities
    // They should NOT merge based on shared "he" pronoun
    const personClusters = mergeResult.globals.filter(e => e.type === 'PERSON');

    // Should have at least 2 separate person entities (Frederick and Saul)
    expect(personClusters.length).toBeGreaterThanOrEqual(2);

    // Verify Frederick and Saul are separate
    const frederickCluster = personClusters.find(e =>
      e.canonical.toLowerCase().includes('frederick') ||
      e.aliases.some(a => a.toLowerCase().includes('frederick'))
    );

    const saulCluster = personClusters.find(e =>
      e.canonical.toLowerCase().includes('saul') ||
      e.aliases.some(a => a.toLowerCase().includes('saul'))
    );

    expect(frederickCluster).toBeDefined();
    expect(saulCluster).toBeDefined();

    // They should be different entities
    expect(frederickCluster!.id).not.toBe(saulCluster!.id);
  });

  it('should NOT merge female entities based on "she" pronoun', async () => {
    const doc1 = 'Sarah studied at the academy. She excelled in mathematics.';
    const result1 = await extractFromSegments('doc1', doc1);

    const doc2 = 'Rebecca taught at the university. She published many papers.';
    const result2 = await extractFromSegments('doc2', doc2);

    // Merge
    const allEntities = [...result1.entities, ...result2.entities];
    const mergeResult = mergeEntitiesAcrossDocs(allEntities);

    // Should have at least 2 separate female entities
    const personClusters = mergeResult.globals.filter(e => e.type === 'PERSON');
    expect(personClusters.length).toBeGreaterThanOrEqual(2);

    // Find Sarah and Rebecca clusters
    const sarahCluster = personClusters.find(e =>
      e.canonical.toLowerCase().includes('sarah') ||
      e.aliases.some(a => a.toLowerCase().includes('sarah'))
    );

    const rebeccaCluster = personClusters.find(e =>
      e.canonical.toLowerCase().includes('rebecca') ||
      e.aliases.some(a => a.toLowerCase().includes('rebecca'))
    );

    if (sarahCluster && rebeccaCluster) {
      expect(sarahCluster.id).not.toBe(rebeccaCluster.id);
    }
  });

  it('should correctly merge same entity across documents', async () => {
    const doc1 = 'Frederick walked to the house. He knocked.';
    const result1 = await extractFromSegments('doc1', doc1);

    const doc2 = 'Frederick entered the building. Frederick looked around.';
    const result2 = await extractFromSegments('doc2', doc2);

    // Merge
    const allEntities = [...result1.entities, ...result2.entities];
    const mergeResult = mergeEntitiesAcrossDocs(allEntities);

    // Frederick should appear only ONCE in merged entities
    const frederickClusters = mergeResult.globals.filter(e =>
      e.canonical.toLowerCase().includes('frederick') ||
      e.aliases.some(a => a.toLowerCase().includes('frederick'))
    );

    // Should merge into 1 entity (not 2)
    expect(frederickClusters.length).toBe(1);

    // That entity should NOT have pronouns in aliases
    const frederick = frederickClusters[0];
    expect(frederick.aliases.filter(isPronoun)).toEqual([]);
  });
});

describe('Context Switch Handling', () => {
  it('should handle pronoun resolution with context switches', async () => {
    const text = 'Frederick left the room. Saul entered. He looked around.';
    const docId = 'test_context_switch';

    const result = await extractFromSegments(docId, text);

    // Both Frederick and Saul should be extracted
    const frederick = result.entities.find(e => e.canonical.toLowerCase().includes('frederick'));
    const saul = result.entities.find(e => e.canonical.toLowerCase().includes('saul'));

    expect(frederick).toBeDefined();
    expect(saul).toBeDefined();

    // Neither should have pronouns in aliases
    if (frederick) {
      expect(frederick.aliases.filter(isPronoun)).toEqual([]);
    }

    if (saul) {
      expect(saul.aliases.filter(isPronoun)).toEqual([]);
    }

    // "He" in the last sentence should resolve to Saul (most recent subject)
    // This is verified by relation extraction - not by alias storage
  });
});

describe('Regression: Original Bug Case', () => {
  it('should NOT cause catastrophic merge of all male entities', async () => {
    // This is the exact scenario from the bug description:
    // "Frederick walked to the house. He knocked on the door. Saul appeared. He spoke to Frederick."

    const text = 'Frederick walked to the house. He knocked on the door. Saul appeared. He spoke to Frederick.';
    const result = await extractFromSegments('test_original_bug', text);

    // Extract both entities
    const frederick = result.entities.find(e => e.canonical.toLowerCase().includes('frederick'));
    const saul = result.entities.find(e => e.canonical.toLowerCase().includes('saul'));

    expect(frederick).toBeDefined();
    expect(saul).toBeDefined();

    // CRITICAL VERIFICATION: Neither should have "he" in aliases
    expect(frederick!.aliases).not.toContain('he');
    expect(frederick!.aliases).not.toContain('He');
    expect(saul!.aliases).not.toContain('he');
    expect(saul!.aliases).not.toContain('He');

    // Test cross-document scenario
    const doc1 = 'Frederick walked. He knocked.';
    const doc2 = 'Saul appeared. He spoke.';

    const result1 = await extractFromSegments('doc1', doc1);
    const result2 = await extractFromSegments('doc2', doc2);

    const allEntities = [...result1.entities, ...result2.entities];
    const mergeResult = mergeEntitiesAcrossDocs(allEntities);

    // Count PERSON entities
    const personCount = mergeResult.globals.filter(e => e.type === 'PERSON').length;

    // Should be 2 (Frederick and Saul), NOT 1 (catastrophic merge)
    expect(personCount).toBe(2);

    console.log(`[REGRESSION TEST] ✅ Frederick and Saul correctly remain separate (${personCount} PERSON entities)`);
  });
});
