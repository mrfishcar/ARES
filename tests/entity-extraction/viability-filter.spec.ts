import { beforeAll, describe, expect, it } from 'vitest';
import { extractEntities } from '../../app/engine/extract/entities';

beforeAll(() => {
  process.env.PARSER_ACTIVE_BACKEND = 'mock';
});

describe('entity viability filter', () => {
  it('drops discourse starters and verb fragments', async () => {
    const { entities } = await extractEntities(
      'When we tried to never mask the truth, Coach Grant looked on. However, they would only agree to figure something out, draw attention, and fix this later. Exactly! Yes. Nope.'
    );

    const canonicals = entities.map(e => e.canonical.toLowerCase());
    const blocked = [
      'when',
      'however',
      'exactly',
      'never mask',
      'only agree',
      'figure something',
      'draw attention',
      'fix this',
      'yes',
      'nope'
    ];

    for (const name of blocked) {
      expect(canonicals).not.toContain(name);
    }
  });

  it('keeps real entities and stitches Coach Grant', async () => {
    const { entities } = await extractEntities('Coach Grant invited Barty over. Barty nodded.');

    const canonicals = entities.map(e => e.canonical.toLowerCase());
    const coachGrant = entities.find(e => e.canonical.toLowerCase() === 'coach grant');
    expect(coachGrant?.type).toBe('PERSON');

    const strayPieces = entities.filter(
      e => e.type === 'PERSON' && (e.canonical.toLowerCase() === 'coach' || e.canonical.toLowerCase() === 'grant')
    );
    expect(strayPieces).toHaveLength(0);

    const bartyHolder = entities.find(
      e =>
        e.canonical.toLowerCase() === 'barty' ||
        e.aliases.some(alias => alias.trim().toLowerCase() === 'barty')
    );
    expect(bartyHolder?.type).toBe('PERSON');
    expect(canonicals).toContain('coach grant');
  });
});
