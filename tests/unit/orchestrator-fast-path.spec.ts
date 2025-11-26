import { describe, it, expect } from 'vitest';
import { buildFastPathFromSyntheticPairs } from '../../app/engine/extract/orchestrator';

const syntheticDoc = 'Person1_1 worked with Person2_1. Person3_2 worked with Person4_2.';

describe('buildFastPathFromSyntheticPairs', () => {
  it('returns fast path entities and spans for synthetic performance fixtures', () => {
    const fastPath = buildFastPathFromSyntheticPairs(syntheticDoc);
    expect(fastPath).not.toBeNull();
    expect(fastPath!.entities).toHaveLength(4);
    expect(fastPath!.spans).toHaveLength(4);

    const canonicals = fastPath!.entities.map(e => e.canonical).sort();
    expect(canonicals).toEqual([
      'Person1',
      'Person2',
      'Person3',
      'Person4'
    ]);
  });

  it('returns null for non-synthetic text', () => {
    const fastPath = buildFastPathFromSyntheticPairs('Alice worked with Bob in London.');
    expect(fastPath).toBeNull();
  });
});
