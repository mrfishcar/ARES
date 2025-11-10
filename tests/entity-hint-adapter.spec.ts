import { describe, it, expect } from 'vitest';
import { projectHints } from '../app/engine/extract/entity-hint-adapter';

describe('Entity hint projection', () => {
  const tokens = [
    { i: 0, text: 'St.', start: 0, end: 3 },
    { i: 1, text: 'Tammany', start: 4, end: 11 },
    { i: 2, text: 'Parish', start: 12, end: 18 },
    { i: 3, text: 'is', start: 19, end: 21 },
    { i: 4, text: 'near', start: 22, end: 26 },
    { i: 5, text: 'Slidell', start: 27, end: 34 },
  ];
  const hints = [
    { text: 'St. Tammany Parish', type: 'LOC', start: 0, end: 18 }
  ] as any;

  it('maps hint types onto token indices', () => {
    const proj = projectHints(tokens as any, hints);
    expect(proj.tokenTypes[0]).toBe('LOC');
    expect(proj.tokenTypes[1]).toBe('LOC');
    expect(proj.tokenTypes[2]).toBe('LOC');
    expect(proj.tokenTypes[3]).toBe('UNKNOWN'); // 'is' is not part of entity
    expect(proj.tokenTypes[4]).toBe('UNKNOWN'); // 'near' is not part of entity
  });

  it('finds nearest type by character position', () => {
    const proj = projectHints(tokens as any, hints);
    // Position 9 is midpoint of "St. Tammany Parish" entity
    expect(proj.nearestTypeAt(9)).toBe('LOC');
    // Position 30 (near middle of 'Slidell') should still map to closest entity
    expect(proj.nearestTypeAt(30)).toBe('LOC');
  });

  it('handles multiple entity hints', () => {
    const multiHints = [
      { text: 'St. Tammany Parish', type: 'LOC', start: 0, end: 18 },
      { text: 'Slidell', type: 'LOC', start: 27, end: 34 }
    ] as any;
    const proj = projectHints(tokens as any, multiHints);

    expect(proj.tokenTypes[0]).toBe('LOC'); // St.
    expect(proj.tokenTypes[2]).toBe('LOC'); // Parish
    expect(proj.tokenTypes[5]).toBe('LOC'); // Slidell
  });

  it('returns UNKNOWN when no hints provided', () => {
    const proj = projectHints(tokens as any, []);
    expect(proj.tokenTypes[0]).toBe('UNKNOWN');
    expect(proj.nearestTypeAt(0)).toBe('UNKNOWN');
  });

  it('handles overlapping token boundaries', () => {
    const partialTokens = [
      { i: 0, text: 'John', start: 0, end: 4 },
      { i: 1, text: 'Smith', start: 5, end: 10 },
    ];
    const partialHints = [
      { text: 'John Smith', type: 'PERSON', start: 0, end: 10 }
    ] as any;
    const proj = projectHints(partialTokens as any, partialHints);

    expect(proj.tokenTypes[0]).toBe('PERSON');
    expect(proj.tokenTypes[1]).toBe('PERSON');
  });

  it('handles no overlap gracefully', () => {
    const noOverlapHints = [
      { text: 'Something', type: 'PERSON', start: 100, end: 109 }
    ] as any;
    const proj = projectHints(tokens as any, noOverlapHints);

    // No tokens overlap with the hint
    expect(proj.tokenTypes.every(t => t === 'UNKNOWN')).toBe(true);
    // But nearestTypeAt should still find it
    expect(proj.nearestTypeAt(100)).toBe('PERSON');
  });
});
