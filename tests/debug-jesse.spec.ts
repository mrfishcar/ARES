import { describe, it, expect } from 'vitest';
import { extractEntities } from '../app/engine/extract/entities';

describe('Prepositional Phrase Extraction', () => {
  it('should extract Jesse from "son of Jesse"', async () => {
    const text = "David, son of Jesse, was born in Bethlehem.";
    const { entities } = await extractEntities(text);

    const names = entities.map(e => e.canonical).sort();

    // Should extract all three entities
    expect(names).toContain('David');
    expect(names).toContain('Jesse');
    expect(names).toContain('Bethlehem');
    expect(entities.length).toBe(3);

    // Check types
    const personNames = entities.filter(e => e.type === 'PERSON').map(e => e.canonical);
    expect(personNames).toContain('David');
    expect(personNames).toContain('Jesse');

    const places = entities.filter(e => e.type === 'PLACE').map(e => e.canonical);
    expect(places).toContain('Bethlehem');
  });

  it('should extract Arathorn from "son of Arathorn"', async () => {
    const text = "Aragorn, son of Arathorn, married Arwen.";
    const { entities } = await extractEntities(text);

    const names = entities.map(e => e.canonical).sort();

    expect(names).toContain('Aragorn');
    expect(names).toContain('Arathorn');
    expect(names).toContain('Arwen');
    expect(entities.length).toBe(3);
  });
});
