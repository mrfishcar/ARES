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
});
