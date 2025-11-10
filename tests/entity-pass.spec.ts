import { describe, it, expect } from 'vitest';
import { preprocessText, runEntityPass, guessType } from '../app/engine/extract/entity-pass';

describe('Entity Pass basics', () => {
  it('normalizes and collapses initials', () => {
    const s = preprocessText('"J. R. R. Tolkien"  wrote—to  Mildred.');
    expect(s).toContain('J.R.R. Tolkien');
    expect(s).toContain('--');
  });

  it('finds entities and guesses types', () => {
    const { text, entities } = runEntityPass('He walked to St. Tammany Parish and then to Red Wing Shoes Inc');
    expect(text).toContain('St. Tammany Parish');
    const names = entities.map(e => e.text);
    expect(names.join(' ')).toMatch(/St\. Tammany Parish/);
    expect(names.join(' ')).toMatch(/Red Wing Shoes Inc/);
    expect(guessType('Red Wing Shoes Inc')).toBe('ORG');
    expect(guessType('St. Tammany Parish')).toBe('LOC');
  });

  it('collapses initials with spaces', () => {
    const s = preprocessText('J. K. Rowling wrote books.');
    expect(s).toBe('J.K. Rowling wrote books.');
  });

  it('attaches suffixes correctly', () => {
    const s = preprocessText('John Smith, Jr. was born.');
    expect(s).toBe('John Smith Jr. was born.');
  });

  it('fixes hyphenated names', () => {
    const s = preprocessText('Mary Anne - Smith is here.');
    expect(s).toBe('Mary Anne-Smith is here.');
  });

  it('guesses PERSON for typical names', () => {
    expect(guessType('John Smith')).toBe('PERSON');
    expect(guessType('Mary Anne-Johnson')).toBe('PERSON');
    expect(guessType('Robert Jr.')).toBe('PERSON');
  });

  it('guesses ORG for company cues', () => {
    expect(guessType('Microsoft Corp')).toBe('ORG');
    expect(guessType('Harvard University')).toBe('ORG');
    expect(guessType('First Baptist Church')).toBe('ORG');
  });

  it('guesses LOC for location cues', () => {
    expect(guessType('Main Street')).toBe('LOC');
    expect(guessType('Central Park')).toBe('LOC');
    expect(guessType('St. Tammany Parish')).toBe('LOC');
  });

  it('returns UNKNOWN for ambiguous text', () => {
    expect(guessType('Something')).toBe('UNKNOWN');
  });

  it('produces entity hints with correct spans', () => {
    const { text, entities } = runEntityPass('John Smith visited Harvard University.');
    expect(entities.length).toBeGreaterThan(0);

    const john = entities.find(e => e.text.includes('John'));
    expect(john).toBeDefined();
    if (john) {
      expect(john.start).toBeGreaterThanOrEqual(0);
      expect(john.end).toBeGreaterThan(john.start);
      expect(text.substring(john.start, john.end)).toBe(john.text);
    }
  });
});
