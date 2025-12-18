import { describe, it, expect } from 'vitest';
import { extractFromSegments } from '../../app/engine/extract/orchestrator';

describe('junk mention rejection + recall guard', () => {
  it('drops junk fragments and records mention stats', async () => {
    const text = [
      'Frederick could only agree.',
      'He tried to figure something out.',
      'He collected Monster Runner cards.',
      'The dance’s theme, Gettin’ Outta Here, was printed on posters.',
      'Students walked with teachers in the hall.',
      'He could at least try.'
    ].join(' ');

    const result = await extractFromSegments('junk-check', text);
    const names = result.entities.map(e => e.canonical.toLowerCase());

    expect(names).not.toContain('only agree');
    expect(names).not.toContain('figure something');
    expect(names).not.toContain('monster runner cards');
    expect(names).not.toContain('outta here');
    expect(names).not.toContain('with teachers');
    expect(names).not.toContain('at least');

    expect(result.stats?.entities.rejected).toBeGreaterThan(0);
    expect(result.stats?.mentions?.rejected).toBeGreaterThan(0);
    expect(result.stats?.mentions?.contextOnly).toBeGreaterThanOrEqual(0);
  });

  it('keeps control set of real names and event typing', async () => {
    const text = [
      'Frederick and Freddy greeted Mr. Garrison at Mont Linola Junior High.',
      'Barty Beauregard talked to Preston Farrell and Kelly Prescott.',
      'Beau Adams waved to Sarah Badeoux.',
      'Principal Green announced the End of School Dance.'
    ].join(' ');

    const result = await extractFromSegments('recall-check', text);
    const names = result.entities.map(e => e.canonical);

    expect(names).toContain('Mont Linola Junior High');
    expect(names).toContain('School Dance');
    expect(result.entities.length).toBeGreaterThan(0);

    const dance = result.entities.find(e => /School Dance/i.test(e.canonical));
    expect(dance?.type).toBe('EVENT');
  });
});
