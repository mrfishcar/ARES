/**
 * Phase 4 Tests: Cross-Document Merge + Conflict Detection
 */

import { describe, it, expect } from 'vitest';
import { mergeEntitiesAcrossDocs, rewireRelationsToGlobal } from '../app/engine/merge';
import { detectConflicts } from '../app/engine/conflicts';
import type { Entity, Relation } from '../app/engine/schema';

describe('Cross-doc merge + conflict detection', () => {
  it('merges cross-doc aliases (Gandalf / Gandalf the Grey)', () => {
    const e1: Entity = {
      id: 'e1',
      type: 'PERSON',
      canonical: 'Gandalf',
      aliases: [],
      created_at: new Date().toISOString(),
      centrality: 1.0
    };

    const e2: Entity = {
      id: 'e2',
      type: 'PERSON',
      canonical: 'Gandalf the Grey',
      aliases: [],
      created_at: new Date().toISOString(),
      centrality: 0.9
    };

    const { globals, idMap } = mergeEntitiesAcrossDocs([e1, e2]);

    // Should merge into 1 global entity
    expect(globals.length).toBe(1);

    // Should map both local IDs to same global ID
    const globalId = idMap.get('e1');
    expect(idMap.get('e2')).toBe(globalId);

    // Should contain both names (canonical + alias)
    const merged = globals[0];
    const allNames = [merged.canonical, ...merged.aliases];
    expect(allNames).toEqual(expect.arrayContaining(['Gandalf', 'Gandalf the Grey']));
  });

  it('does NOT merge dissimilar entities (Gandalf vs Saruman)', () => {
    const e1: Entity = {
      id: 'e1',
      type: 'PERSON',
      canonical: 'Gandalf',
      aliases: [],
      created_at: new Date().toISOString(),
      centrality: 1.0
    };

    const e2: Entity = {
      id: 'e2',
      type: 'PERSON',
      canonical: 'Saruman',
      aliases: [],
      created_at: new Date().toISOString(),
      centrality: 0.9
    };

    const { globals, idMap } = mergeEntitiesAcrossDocs([e1, e2]);

    // Should keep as 2 separate entities
    expect(globals.length).toBe(2);

    // Should map to different global IDs
    expect(idMap.get('e1')).not.toBe(idMap.get('e2'));
  });

  it('detects single-valued predicate conflict (married_to)', () => {
    const r1: Relation = {
      id: 'r1',
      subj: 'aragorn',
      pred: 'married_to',
      obj: 'arwen',
      evidence: [],
      confidence: 0.9,
      extractor: 'dep'
    };

    const r2: Relation = {
      id: 'r2',
      subj: 'aragorn',
      pred: 'married_to',
      obj: 'eowyn',
      evidence: [],
      confidence: 0.8,
      extractor: 'dep'
    };

    const conflicts = detectConflicts([r1, r2]);

    expect(conflicts.length).toBeGreaterThan(0);

    const conflict = conflicts.find(c => c.type === 'single_valued');
    expect(conflict).toBeDefined();
    expect(conflict?.severity).toBe(2);
    expect(conflict?.relations).toHaveLength(2);
  });

  it('detects parent_of cycle (A→B→C→A)', () => {
    const r1: Relation = {
      id: 'r1',
      subj: 'A',
      pred: 'parent_of',
      obj: 'B',
      evidence: [],
      confidence: 0.9,
      extractor: 'dep'
    };

    const r2: Relation = {
      id: 'r2',
      subj: 'B',
      pred: 'parent_of',
      obj: 'C',
      evidence: [],
      confidence: 0.9,
      extractor: 'dep'
    };

    const r3: Relation = {
      id: 'r3',
      subj: 'C',
      pred: 'parent_of',
      obj: 'A',
      evidence: [],
      confidence: 0.9,
      extractor: 'dep'
    };

    const conflicts = detectConflicts([r1, r2, r3]);

    const cycleConflict = conflicts.find(c => c.type === 'cycle');
    expect(cycleConflict).toBeDefined();
    expect(cycleConflict?.severity).toBe(3);
    expect(cycleConflict?.description).toContain('A');
    expect(cycleConflict?.description).toContain('B');
    expect(cycleConflict?.description).toContain('C');
  });

  it('rewires relations after merge', () => {
    // Create entities that should merge
    const e1: Entity = {
      id: 'local_gandalf_1',
      type: 'PERSON',
      canonical: 'Gandalf',
      aliases: [],
      created_at: new Date().toISOString(),
      centrality: 1.0
    };

    const e2: Entity = {
      id: 'local_gandalf_2',
      type: 'PERSON',
      canonical: 'Gandalf the Grey',
      aliases: [],
      created_at: new Date().toISOString(),
      centrality: 0.9
    };

    const { globals, idMap } = mergeEntitiesAcrossDocs([e1, e2]);

    // Create relation using local IDs
    const localRel: Relation = {
      id: 'r1',
      subj: 'local_gandalf_1',
      pred: 'traveled_to',
      obj: 'rivendell',
      evidence: [],
      confidence: 0.9,
      extractor: 'dep'
    };

    // Rewire to global IDs
    const globalRels = rewireRelationsToGlobal([localRel], idMap);

    expect(globalRels[0].subj).toBe(idMap.get('local_gandalf_1'));
    expect(globalRels[0].subj).not.toBe('local_gandalf_1');
  });
});
