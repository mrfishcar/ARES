import { describe, it, expect } from 'vitest';
import { extractFromSegments } from '../../app/engine/extract/orchestrator';

describe('integration: junk rejection and stats surfacing', () => {
  it('rejects junk fragments while keeping real names and counts rejections', async () => {
    const text = [
      'Frederick stood in the hallway.',
      'He could only agree after that.',
      'He collected Monster Runner cards.',
      'The dance’s theme, Gettin’ Outta Here, was printed on posters.',
      'Kelly Prescott mocked Barty Beauregard.',
      'Mr. Garrison and Principal Green watched.',
      'Beau Adams waved at Sarah Badeoux.',
      'Bullet and Steamy arrived.',
      'They planned the End of School Dance.'
    ].join(' ');

    const result = await extractFromSegments('junk-integration', text);
    const names = result.entities.map(e => e.canonical.toLowerCase());

    // Junk should be gone
    expect(names).not.toContain('only agree');
    expect(names).not.toContain('monster runner');
    expect(names).not.toContain('monster runner cards');
    expect(names).not.toContain('gettin');
    expect(names).not.toContain('outta here');

    // Real names should remain (Barty merged into Beauregard aliases)
    const hasBarty =
      result.entities.some(e => e.canonical.toLowerCase().includes('beauregard')) ||
      result.entities.some(e => e.aliases.some(a => a.toLowerCase() === 'barty'));
    expect(hasBarty).toBe(true);

    // Dance should be typed as EVENT, not ORG
    const dance = result.entities.find(e => e.canonical.toLowerCase().includes('dance'));
    expect(dance?.type).toBe('EVENT');

    // Stats must show some rejections
    expect(result.stats?.entities.rejected).toBeGreaterThan(0);
  });
});
