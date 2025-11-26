import { describe, it, expect } from 'vitest';
import { extractFromSegments } from '../../app/engine/extract/orchestrator';

function canonicalById(entities: ReturnType<typeof extractFromSegments> extends Promise<infer R> ? R['entities'] : never) {
  return new Map(entities.map(e => [e.id, e.canonical]));
}

describe('relation evidence remapping', () => {
  it('preserves doc_id, sentence_index, and span for married_to relations', async () => {
    const docId = 'evidence-1';
    const text = 'Aragorn married Arwen.';
    const { entities, relations } = await extractFromSegments(docId, text);
    const names = canonicalById(entities);

    const married = relations.find(r => names.get(r.subj)?.includes('Aragorn') && r.pred === 'married_to');
    expect(married).toBeDefined();
    expect(married!.evidence?.[0]?.doc_id).toBe(docId);
    expect(married!.evidence?.[0]?.sentence_index).toBe(0);
    expect(married!.evidence?.[0]?.span?.text).toContain('Aragorn married Arwen');
  });

  it('remaps evidence across sentences for location and travel relations', async () => {
    const docId = 'evidence-2';
    const text = 'Bilbo lived in the Shire. Later, he traveled to Rivendell.';
    const { entities, relations } = await extractFromSegments(docId, text);
    const names = canonicalById(entities);

    const livesIn = relations.find(r => r.pred === 'lives_in' && names.get(r.subj)?.includes('Bilbo'));
    const traveledTo = relations.find(r => r.pred === 'traveled_to' && names.get(r.obj)?.includes('Rivendell'));

    expect(livesIn?.evidence?.[0]?.doc_id).toBe(docId);
    expect(livesIn?.evidence?.[0]?.sentence_index).toBe(0);
    expect(livesIn?.evidence?.[0]?.span?.text).toContain('Bilbo lived in the Shire');

    expect(traveledTo?.evidence?.[0]?.doc_id).toBe(docId);
    expect(traveledTo?.evidence?.[0]?.sentence_index).toBe(0);
    expect(traveledTo?.evidence?.[0]?.span?.text).toContain('traveled to Rivendell');
  });

  it('keeps evidence metadata when extracting parent-child relations', async () => {
    const docId = 'evidence-3';
    const text = 'Frodo is the son of Drogo.';
    const { entities, relations } = await extractFromSegments(docId, text);
    const names = canonicalById(entities);

    const childOf = relations.find(r => r.pred === 'child_of' && names.get(r.subj)?.includes('Frodo'));
    expect(childOf?.evidence?.[0]?.doc_id).toBe(docId);
    expect(childOf?.evidence?.[0]?.sentence_index).toBe(0);
    expect(childOf?.evidence?.[0]?.span?.text).toContain('Frodo is the son of Drogo');
  });
});
