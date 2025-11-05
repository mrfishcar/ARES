import { describe, expect, it } from 'vitest';

import { extractFictionCharacters, extractFictionEntities, extractFictionRelations } from '../../app/engine/fiction-extraction';

describe('fiction relation patterns', () => {
  const sampleText = `
Frederick warned Barty about the looming storm as Preston listened nearby.
"Stay with him," Frederick shouted to Preston while Barty begged Preston for patience.
Later, Preston comforted Barty and promised Frederick they would keep the plan quiet.
When night fell, Barty betrayed Preston. Barty attacked Frederick in the cellar.
Frederick chased Barty through the tunnels while Preston worked with Frederick to corner him.
`;

  const characters = extractFictionCharacters(sampleText);
  const relations = extractFictionRelations(sampleText, characters, 'sample');

  const hasRelation = (pred: string, subj: string, obj: string) =>
    relations.some(
      relation =>
        relation.pred === pred &&
        relation.subj === `fiction:${subj}` &&
        relation.obj === `fiction:${obj}`
    );

  it('captures the key characters from repeated mentions', () => {
    const names = characters.map(char => char.name);
    expect(names).toContain('Frederick');
    expect(names).toContain('Barty');
    expect(names).toContain('Preston');
  });

  it('detects extended dialogue and assistance verbs', () => {
    expect(hasRelation('spoke_to', 'Frederick', 'Barty')).toBe(true);
    expect(hasRelation('spoke_to', 'Frederick', 'Preston')).toBe(true);
    expect(hasRelation('spoke_to', 'Barty', 'Preston')).toBe(true);
    expect(hasRelation('ally_of', 'Preston', 'Barty')).toBe(true);
    expect(hasRelation('ally_of', 'Preston', 'Frederick')).toBe(true);
  });

  it('detects richer conflict verbs', () => {
    expect(hasRelation('enemy_of', 'Barty', 'Preston')).toBe(true);
    expect(hasRelation('enemy_of', 'Barty', 'Frederick')).toBe(true);
    expect(hasRelation('enemy_of', 'Frederick', 'Barty')).toBe(true);
  });

  it('keeps results deduplicated', () => {
    const uniqueKeys = new Set(
      relations.map(rel => `${rel.subj}::${rel.pred}::${rel.obj}`)
    );
    expect(uniqueKeys.size).toBe(relations.length);
  });

  it('highlights notable entities beyond characters', () => {
    const ambienceText = `
Song for the City, No. 12. floated from the weathered record player perched on the rooftop garden.
Frederick listened while the melody echoed across the rooftops.
Frederick, the mail carrier, paused beneath the tiger statue that guarded the black gate at number 6067.
The devil's niece whispered from the rafters while the two lovers prepared their dark magic.
`;

    const entities = extractFictionEntities(ambienceText);

    const filterByType = (type: string) =>
      entities
        .filter(entity => entity.type === type)
        .map(entity => entity.name);

    expect(filterByType('character')).toEqual(
      expect.arrayContaining([
        'Frederick',
        "The Devil's Niece",
        'The Two Lovers'
      ])
    );
    expect(filterByType('artifact')).toEqual(
      expect.arrayContaining([
        'Song for the City No. 12',
        'The Weathered Record Player',
        'The Tiger Statue'
      ])
    );
    expect(filterByType('location')).toEqual(
      expect.arrayContaining([
        'The Black Gate',
        'The Rooftop Garden'
      ])
    );
    expect(filterByType('address')).toContain('Number 6067');
    expect(filterByType('other')).toContain('The Mail Carrier');
  });
});
