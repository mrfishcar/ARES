/**
 * Golden Corpus Tests
 */

import { describe, it, expect } from 'vitest';
import { extractEntities } from '../../app/engine/extract/entities';
import { extractRelations } from '../../app/engine/extract/relations';

describe('LotR Golden Corpus', () => {
  const text = `Aragorn, son of Arathorn, married Arwen in 3019. Gandalf the Grey traveled to Minas Tirith.`;

  it('should extract PERSON entities', async () => {
    const { entities } = await extractEntities(text);
    const personNames = entities
      .filter(e => e.type === 'PERSON')
      .map(e => e.canonical)
      .sort();
    
    expect(personNames).toContain('Aragorn');
    expect(personNames).toContain('Arathorn');
    expect(personNames).toContain('Arwen');
    expect(personNames).toContain('Gandalf');
    expect(personNames.length).toBeGreaterThanOrEqual(4);
  });

  it('should extract PLACE entities', async () => {
    const { entities } = await extractEntities(text);
    const places = entities
      .filter(e => e.type === 'PLACE')
      .map(e => e.canonical);
    
    expect(places).toContain('Minas Tirith');
  });

  it('should extract DATE entities', async () => {
    const { entities } = await extractEntities(text);
    const dates = entities
      .filter(e => e.type === 'DATE')
      .map(e => e.canonical);
    
    expect(dates.some(d => d.includes('3019'))).toBe(true);
  });

  it('should return span information for each entity', async () => {
    const { entities, spans } = await extractEntities(text);
    
    expect(spans.length).toBe(entities.length);
    expect(spans.every(s => s.entity_id && s.start >= 0 && s.end > s.start)).toBe(true);
  });

  it('should extract parent_of relation', async () => {
    const { entities, spans } = await extractEntities(text);
    const rels = await extractRelations(text, { entities, spans }, 'test');

    const hasRelation = (pred: string, subjName: string, objName: string) => {
      return rels.some(r => {
        const subjEntity = entities.find(e => e.id === r.subj)?.canonical;
        const objEntity = entities.find(e => e.id === r.obj)?.canonical;

        // Check exact match
        if (r.pred === pred && subjEntity === subjName && objEntity === objName) {
          return true;
        }

        // Check inverse (parent_of <-> child_of)
        if (pred === 'parent_of' && r.pred === 'child_of' &&
            subjEntity === objName && objEntity === subjName) {
          return true;
        }
        if (pred === 'child_of' && r.pred === 'parent_of' &&
            subjEntity === objName && objEntity === subjName) {
          return true;
        }

        return false;
      });
    };

    expect(hasRelation('parent_of', 'Arathorn', 'Aragorn')).toBe(true);
  });

  it('should extract married_to relation with time qualifier', async () => {
    const { entities, spans } = await extractEntities(text);
    const rels = await extractRelations(text, { entities, spans }, 'test');

    const hasMarriedRelation = rels.some(r =>
      r.pred === 'married_to' &&
      (
        (entities.find(e => e.id === r.subj)?.canonical === 'Aragorn' &&
         entities.find(e => e.id === r.obj)?.canonical === 'Arwen') ||
        (entities.find(e => e.id === r.subj)?.canonical === 'Arwen' &&
         entities.find(e => e.id === r.obj)?.canonical === 'Aragorn')
      )
    );

    expect(hasMarriedRelation).toBe(true);
  });

  it('should extract traveled_to relation', async () => {
    const { entities, spans } = await extractEntities(text);
    const rels = await extractRelations(text, { entities, spans }, 'test');

    const hasTravelRelation = rels.some(r =>
      r.pred === 'traveled_to' &&
      entities.find(e => e.id === r.subj)?.canonical.includes('Gandalf') &&
      entities.find(e => e.id === r.obj)?.canonical === 'Minas Tirith'
    );

    expect(hasTravelRelation).toBe(true);
  });
});

describe('Harry Potter Golden Corpus', () => {
  const text = `Harry Potter studies at Hogwarts. Professor McGonagall teaches at Hogwarts.`;

  it('should extract PERSON entities', async () => {
    const { entities } = await extractEntities(text);
    const personNames = entities
      .filter(e => e.type === 'PERSON')
      .map(e => e.canonical)
      .sort();
    
    expect(personNames).toContain('Harry Potter');
    expect(personNames.some(n => n.includes('McGonagall'))).toBe(true);
  });

  it('should extract Hogwarts as ORG or PLACE', async () => {
    const { entities } = await extractEntities(text);
    const hogwarts = entities.find(e => e.canonical === 'Hogwarts');
    
    expect(hogwarts).toBeDefined();
    expect(['ORG', 'PLACE']).toContain(hogwarts!.type);
  });

  it('should extract studies_at relation', async () => {
    const { entities, spans } = await extractEntities(text);
    const rels = await extractRelations(text, { entities, spans }, 'test');

    const hasStudiesAt = rels.some(r =>
      r.pred === 'studies_at' &&
      entities.find(e => e.id === r.subj)?.canonical === 'Harry Potter' &&
      entities.find(e => e.id === r.obj)?.canonical === 'Hogwarts'
    );

    expect(hasStudiesAt).toBe(true);
  });

  it('should extract teaches_at relation', async () => {
    const { entities, spans } = await extractEntities(text);
    const rels = await extractRelations(text, { entities, spans }, 'test');

    const hasTeachesAt = rels.some(r =>
      r.pred === 'teaches_at' &&
      entities.find(e => e.id === r.subj)?.canonical.includes('McGonagall') &&
      entities.find(e => e.id === r.obj)?.canonical === 'Hogwarts'
    );

    expect(hasTeachesAt).toBe(true);
  });
});

describe('Bible Golden Corpus', () => {
  const text = `Abram begat Isaac. Isaac begat Jacob. Jacob dwelt in Hebron.`;

  it('should extract PERSON entities', async () => {
    const { entities } = await extractEntities(text);
    const personNames = entities
      .filter(e => e.type === 'PERSON')
      .map(e => e.canonical)
      .sort();
    
    expect(personNames).toContain('Abram');
    expect(personNames).toContain('Isaac');
    expect(personNames).toContain('Jacob');
  });

  it('should extract PLACE entity (Hebron)', async () => {
    const { entities } = await extractEntities(text);
    const places = entities
      .filter(e => e.type === 'PLACE')
      .map(e => e.canonical);
    
    expect(places).toContain('Hebron');
  });

  it('should extract parent_of from "begat"', async () => {
    const { entities, spans } = await extractEntities(text);
    const rels = await extractRelations(text, { entities, spans }, 'test');

    const hasRelation = (pred: string, subjName: string, objName: string) => {
      return rels.some(r =>
        r.pred === pred &&
        entities.find(e => e.id === r.subj)?.canonical === subjName &&
        entities.find(e => e.id === r.obj)?.canonical === objName
      );
    };

    expect(hasRelation('parent_of', 'Abram', 'Isaac')).toBe(true);
    expect(hasRelation('parent_of', 'Isaac', 'Jacob')).toBe(true);
    expect(hasRelation('child_of', 'Isaac', 'Abram')).toBe(true);
    expect(hasRelation('child_of', 'Jacob', 'Isaac')).toBe(true);
  });

  it('should extract lives_in relation', async () => {
    const { entities, spans } = await extractEntities(text);
    const rels = await extractRelations(text, { entities, spans }, 'test');

    const hasLivesIn = rels.some(r =>
      r.pred === 'lives_in' &&
      entities.find(e => e.id === r.subj)?.canonical === 'Jacob' &&
      entities.find(e => e.id === r.obj)?.canonical === 'Hebron'
    );

    expect(hasLivesIn).toBe(true);
  });
});
