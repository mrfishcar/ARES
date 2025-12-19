import { describe, it, expect } from 'vitest';
import { mergeEntitiesAcrossDocs } from '../../app/engine/merge';
import { toBookNLPGlobalId, toBookNLPEID, toBookNLPStableEntityId } from '../../app/engine/booknlp/identity';
import type { Entity } from '../../app/engine/schema';

describe('BookNLP identity mapping', () => {
  it('maps BookNLP clusters to stable global IDs and EIDs across merges', () => {
    const created_at = new Date().toISOString();
    const bookEntityDoc1: Entity = {
      id: toBookNLPStableEntityId('char_1'),
      type: 'PERSON',
      canonical: 'Alice Example',
      aliases: ['Alice'],
      source: 'booknlp',
      booknlp_id: 'char_1',
      mention_count: 2,
      created_at,
      centrality: 1,
      confidence: 0.95,
      eid: toBookNLPEID('char_1'),
    };

    const bookEntityDoc2: Entity = {
      ...bookEntityDoc1,
      id: toBookNLPStableEntityId('char_1'),
      canonical: 'Alice Example',
      aliases: ['Example'],
      mention_count: 3,
    };

    const mergeResult = mergeEntitiesAcrossDocs([bookEntityDoc1, bookEntityDoc2]);

    expect(mergeResult.globals).toHaveLength(1);
    const global = mergeResult.globals[0];
    expect(global.id).toBe(toBookNLPGlobalId('char_1'));
    expect(global.eid).toBe(toBookNLPEID('char_1'));
    expect((global as any).mention_count).toBe(5);
    expect(mergeResult.idMap.get(bookEntityDoc1.id)).toBe(global.id);
    expect(mergeResult.idMap.get(bookEntityDoc2.id)).toBe(global.id);
  });
});
