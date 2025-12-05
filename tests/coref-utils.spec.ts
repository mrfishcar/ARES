import { describe, it, expect } from 'vitest';
import { resolveMentionToCanonical, isPronoun } from '../app/engine/pipeline/coref-utils';

describe('coref-utils', () => {
  it('resolves mention to highest-confidence canonical id', () => {
    const links = [
      { mentionId: 'm1', canonicalEntityId: 'E1', confidence: 0.4 },
      { mentionId: 'm1', canonicalEntityId: 'E2', confidence: 0.9 },
    ];
    const resolved = resolveMentionToCanonical('m1', links);
    expect(resolved).toBe('E2');
  });

  it('returns null when no link exists', () => {
    const links: any[] = [];
    expect(resolveMentionToCanonical('missing', links)).toBeNull();
  });

  it('detects common pronouns', () => {
    expect(isPronoun('He')).toBe(true);
    expect(isPronoun('they')).toBe(true);
    expect(isPronoun('Alice')).toBe(false);
  });
});
