import { describe, it, expect } from 'vitest';
import type { Entity } from '../../app/engine/schema';
import {
  applyTypeOverrides,
  resolveSpanConflicts,
  shouldSuppressAdjectiveColorPerson,
  shouldSuppressSentenceInitialPerson,
  stitchTitlecaseSpans,
  isFragmentaryItem
} from '../../app/engine/linguistics/entity-heuristics';

const baseEntity = (canonical: string, type: Entity['type']): Entity => ({
  id: canonical.toLowerCase() + Math.random().toString(16).slice(2),
  type,
  canonical,
  aliases: [],
  attrs: {},
  created_at: new Date().toISOString(),
});

describe('Sentence-initial suppression', () => {
  it('drops leading discourse starters as PERSON', () => {
    const entity = baseEntity('When', 'PERSON');
    const span = { start: 0, end: 4 };
    const check = shouldSuppressSentenceInitialPerson(entity, span, 'When the lights fell, everyone gasped.');
    expect(check.suppress).toBe(true);
  });
});

describe('Adjective/color suppression with title escape hatches', () => {
  it('blocks bare color as PERSON', () => {
    const entity = baseEntity('Black', 'PERSON');
    const span = { start: 0, end: 5 };
    const check = shouldSuppressAdjectiveColorPerson(entity, span, 'Black clouds rolled in.');
    expect(check.suppress).toBe(true);
  });

  it('allows title-led surname usage', () => {
    const entity = baseEntity('Black', 'PERSON');
    const span = { start: 4, end: 9 };
    const check = shouldSuppressAdjectiveColorPerson(entity, span, 'Mr. Black stepped forward.');
    expect(check.suppress).toBe(false);
  });
});

describe('Title-driven person and headword overrides', () => {
  it('forces PERSON when prefixed by Detective/Coach', () => {
    const entity = baseEntity('Sheff', 'ITEM');
    const span = { start: 10, end: 15 };
    const override = applyTypeOverrides(entity, span, 'Detective Sheff noted the clue.');
    expect(override.type).toBe('PERSON');
  });

  it('prefers PLACE for place headwords', () => {
    const entity = baseEntity('Dapier Street', 'PERSON');
    const span = { start: 0, end: 13 };
    const override = applyTypeOverrides(entity, span, 'Dapier Street was closed.');
    expect(override.type).toBe('PLACE');
  });

  it('leans ORG for school-like names', () => {
    const entity = baseEntity('Mount Linola Junior High School', 'PLACE');
    const span = { start: 0, end: 33 };
    const override = applyTypeOverrides(entity, span, 'Mount Linola Junior High School opened its gates.');
    expect(override.type).toBe('ORG');
  });
});

describe('Fragmentary ITEM filtering', () => {
  it('suppresses verb/determiner phrases mis-tagged as ITEM', () => {
    const entity = baseEntity('fix this', 'ITEM');
    expect(isFragmentaryItem(entity)).toBe(true);
  });
});

describe('Proper noun stitching', () => {
  it('merges adjacent titlecase spans', () => {
    const spans = [
      { text: 'Detective', type: 'PERSON' as const, start: 0, end: 9 },
      { text: 'Sheff', type: 'PERSON' as const, start: 10, end: 15 }
    ];
    const stitched = stitchTitlecaseSpans(spans, 'Detective Sheff nodded.');
    expect(stitched[0]?.text).toBe('Detective Sheff');
  });
});

describe('Span conflict resolution', () => {
  it('keeps strongest type when spans are identical', () => {
    const person = baseEntity('Barty', 'PERSON');
    person.confidence = 0.9;
    const item = baseEntity('Barty', 'ITEM');
    item.confidence = 0.3;
    const spans = [
      { entity_id: person.id, start: 0, end: 5 },
      { entity_id: item.id, start: 0, end: 5 }
    ];
    const resolved = resolveSpanConflicts([person, item], spans);
    expect(resolved.entities).toHaveLength(1);
    expect(resolved.entities[0]?.type).toBe('PERSON');
    expect(resolved.spans).toHaveLength(1);
  });
});

