import { computeSignature } from '../scripts/pattern-expansion/pattern-signature';

describe('signature normalization', () => {
  it('collapses active/passive ownership', () => {
    const a = computeSignature({surface:'X owns Y', dep:'X-nsubj->owns->obj-Y'});
    const b = computeSignature({surface:'Y is owned by X', dep:'Y-nsubjpass->owned->obl:by-X'});
    expect(a).toEqual(b);
  });
  it('collapses belongs_to / property_of', () => {
    const a = computeSignature({surface:'Y belongs to X', dep:'Y-nsubj->belongs->obl:to-X'});
    const b = computeSignature({surface:'Y is the property of X', dep:'Y-nsubj->is->nmod:of-X'});
    expect(a).toEqual(b);
  });
});
