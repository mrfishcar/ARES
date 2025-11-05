/**
 * Phase 3 Qualifier Tests
 * Tests for time/place qualifiers, confidence scores, and extractor metadata
 */

import { describe, it, expect } from 'vitest';
import { extractEntities } from '../app/engine/extract/entities';
import { extractRelations } from '../app/engine/extract/relations';

const usingMockParser =
  (process.env.PARSER_ACTIVE_BACKEND || '').toLowerCase() === 'mock';

const describeWithParser = usingMockParser ? describe.skip : describe;

if (usingMockParser) {
  console.warn(
    '[qualifiers.spec] Skipping qualifier assertions because PARSER_ACTIVE_BACKEND=mock'
  );
}

describeWithParser('Phase 3: Qualifiers and Confidence', () => {
  it('married_in_year: should extract time qualifier from "married in YEAR"', async () => {
    const text = 'Aragorn married Arwen in 3019.';
    const { entities, spans } = await extractEntities(text);
    const rels = await extractRelations(text, { entities, spans }, 'test');

    const marriedRel = rels.find(r =>
      r.pred === 'married_to' &&
      entities.find(e => e.id === r.subj)?.canonical === 'Aragorn'
    );

    expect(marriedRel).toBeDefined();
    expect(marriedRel?.qualifiers).toBeDefined();
    expect(marriedRel?.qualifiers?.some(q =>
      q.type === 'time' && q.value.includes('3019')
    )).toBe(true);
  });

  it('lives_in_place: should extract lives_in with place as object', async () => {
    const text = 'Jacob dwelt in Hebron.';
    const { entities, spans } = await extractEntities(text);
    const rels = await extractRelations(text, { entities, spans }, 'test');

    const livesInRel = rels.find(r =>
      r.pred === 'lives_in' &&
      entities.find(e => e.id === r.subj)?.canonical === 'Jacob' &&
      entities.find(e => e.id === r.obj)?.canonical === 'Hebron'
    );

    expect(livesInRel).toBeDefined();
    expect(livesInRel?.extractor).toBe('dep');
    expect(livesInRel?.confidence).toBeGreaterThan(0.7);
  });

  it('traveled_to_with_date: should extract time qualifier for travel', async () => {
    const text = 'Gandalf traveled to Minas Tirith in 3018.';
    const { entities, spans } = await extractEntities(text);
    const rels = await extractRelations(text, { entities, spans }, 'test');

    const travelRel = rels.find(r =>
      r.pred === 'traveled_to' &&
      entities.find(e => e.id === r.subj)?.canonical.includes('Gandalf')
    );

    expect(travelRel).toBeDefined();
    expect(travelRel?.qualifiers).toBeDefined();
    expect(travelRel?.qualifiers?.some(q =>
      q.type === 'time' && q.value.includes('3018')
    )).toBe(true);
  });

  it('multi_sentence_begat: should extract relations from multiple sentences', async () => {
    const text = 'Abram begat Isaac in Canaan. Isaac begat Jacob.';
    const { entities, spans } = await extractEntities(text);
    const rels = await extractRelations(text, { entities, spans }, 'test');

    // Find both parent_of relations
    const parentRels = rels.filter(r => r.pred === 'parent_of');

    expect(parentRels.length).toBeGreaterThanOrEqual(2);

    // First: Abram → Isaac (should have place qualifier)
    const abramIsaac = parentRels.find(r =>
      entities.find(e => e.id === r.subj)?.canonical === 'Abram' &&
      entities.find(e => e.id === r.obj)?.canonical === 'Isaac'
    );

    expect(abramIsaac).toBeDefined();
    // Note: "in Canaan" can break dep pattern, regex fallback is OK
    expect(abramIsaac?.extractor).toMatch(/^(dep|regex)$/);

    // Second: Isaac → Jacob
    const isaacJacob = parentRels.find(r =>
      entities.find(e => e.id === r.subj)?.canonical === 'Isaac' &&
      entities.find(e => e.id === r.obj)?.canonical === 'Jacob'
    );

    expect(isaacJacob).toBeDefined();
    expect(isaacJacob?.extractor).toBe('dep');
  });

  it('confidence_scores: should assign confidence scores', async () => {
    const text = 'Aragorn married Arwen in 3019.';
    const { entities, spans } = await extractEntities(text);
    const rels = await extractRelations(text, { entities, spans }, 'test');

    for (const rel of rels) {
      expect(rel.confidence).toBeGreaterThan(0);
      expect(rel.confidence).toBeLessThanOrEqual(1.0);
      expect(rel.extractor).toMatch(/^(dep|regex)$/);

      // DEP should have higher confidence than REGEX
      if (rel.extractor === 'dep') {
        expect(rel.confidence).toBeGreaterThanOrEqual(0.7);
      }
    }
  });

  it('extractor_metadata: should tag relations with extraction method', async () => {
    const text = 'Gandalf traveled to Minas Tirith.';
    const { entities, spans } = await extractEntities(text);
    const rels = await extractRelations(text, { entities, spans }, 'test');

    const travelRel = rels.find(r => r.pred === 'traveled_to');

    expect(travelRel).toBeDefined();
    expect(travelRel?.extractor).toBe('dep');  // Should use dependency pattern
    expect(travelRel?.confidence).toBeGreaterThan(0.7);  // Good confidence for dep
  });
});
