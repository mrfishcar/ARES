import { beforeAll, describe, expect, it } from 'vitest';
import { extractEntities } from '../../app/engine/extract/entities';

beforeAll(() => {
  process.env.PARSER_ACTIVE_BACKEND = 'mock';
});

describe('single-token person viability', () => {
  it('does not label sentence-initial common nouns as PERSON', async () => {
    const { entities } = await extractEntities('Song was playing. The crowd cheered.');

    const songPersons = entities.filter(e => e.canonical.toLowerCase() === 'song' && e.type === 'PERSON');
    expect(songPersons).toHaveLength(0);
  });

  it('keeps genuine mid-sentence single-token names as PERSON', async () => {
    const { entities } = await extractEntities('I saw Gandalf today. Gandalf smiled.');

    const gandalfPersons = entities.filter(e => e.canonical.toLowerCase() === 'gandalf' && e.type === 'PERSON');
    expect(gandalfPersons.length).toBeGreaterThan(0);
  });

  it('prefers PERSON globally when a surface has non-initial evidence', async () => {
    const { entities } = await extractEntities('Barty walked in. I saw Barty yesterday.');

    const bartyPersons = entities.filter(e => e.canonical.toLowerCase() === 'barty' && e.type === 'PERSON');
    const bartyItems = entities.filter(e => e.canonical.toLowerCase() === 'barty' && e.type === 'ITEM');

    expect(bartyPersons.length).toBeGreaterThan(0);
    expect(bartyItems).toHaveLength(0);
  });

  it('stitches adjacent person parts into a single entity', async () => {
    const { entities } = await extractEntities('Frank Gritzer arrived. Frank spoke.');

    const full = entities.find(e => e.type === 'PERSON' && e.canonical.toLowerCase() === 'frank gritzer');
    expect(full).toBeDefined();
    expect(full?.aliases.map(a => a.toLowerCase())).toContain('frank');

    const frankOnly = entities.filter(e => e.type === 'PERSON' && e.canonical.toLowerCase() === 'frank');
    expect(frankOnly).toHaveLength(0);
  });
});
