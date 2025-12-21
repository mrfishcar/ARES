import { describe, expect, it } from 'vitest';
import type { SerializedEditorState } from 'lexical';
import { flattenRichDoc, mapPlainOffsetToRich, mapRichToPlain, snapshotRichDoc } from '../flattenRichDoc';

const demoDoc: SerializedEditorState = {
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: null,
    children: [
      {
        type: 'heading',
        tag: 'h1',
        format: '',
        indent: 0,
        version: 1,
        direction: null,
        children: [
          { type: 'text', text: 'Title', detail: 0, format: 0, mode: 'normal', style: '', version: 1 },
        ],
        key: 'h1',
      },
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: null,
        children: [
          {
            type: 'text',
            text: 'First paragraph body',
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            version: 1,
            key: 'p1t1',
          },
        ],
        key: 'p1',
      },
      {
        type: 'list',
        listType: 'bullet',
        format: '',
        indent: 0,
        version: 1,
        direction: null,
        children: [
          {
            type: 'listitem',
            format: '',
            indent: 0,
            version: 1,
            direction: null,
            key: 'li1',
            children: [
              { type: 'text', text: 'Item one', detail: 0, format: 0, mode: 'normal', style: '', version: 1, key: 'li1t' },
            ],
          },
          {
            type: 'listitem',
            format: '',
            indent: 0,
            version: 1,
            direction: null,
            key: 'li2',
            children: [
              { type: 'text', text: 'Item two', detail: 0, format: 0, mode: 'normal', style: '', version: 1, key: 'li2t' },
            ],
          },
        ],
        key: 'list1',
      },
      {
        type: 'quote',
        format: '',
        indent: 0,
        version: 1,
        direction: null,
        key: 'q1',
        children: [
          { type: 'text', text: 'Quoted line', detail: 0, format: 0, mode: 'normal', style: '', version: 1, key: 'qt1' },
        ],
      },
      {
        type: 'horizontalrule',
        format: '',
        indent: 0,
        version: 1,
        direction: null,
        key: 'hr1',
      },
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: null,
        key: 'p2',
        children: [
          { type: 'text', text: 'Tail paragraph', detail: 0, format: 0, mode: 'normal', style: '', version: 1, key: 'p2t1' },
        ],
      },
    ],
    key: 'root',
  },
};

describe('flattenRichDoc', () => {
  it('flattens blocks with newline policy', () => {
    const result = flattenRichDoc(demoDoc);
    expect(result.plainText).toBe(
      ['Title', 'First paragraph body', 'Item one\nItem two', 'Quoted line', '', 'Tail paragraph'].join('\n\n'),
    );
    // Blocks tracked with deterministic boundaries
    expect(result.blocks).toHaveLength(6);
    expect(result.blocks[2].plainStart).toBeGreaterThan(result.blocks[1].plainEnd);
  });

  it('round-trips plain offsets through posMap', () => {
    const result = flattenRichDoc(demoDoc);
    const headingPoint = mapPlainOffsetToRich(result.posMap, 1);
    expect(headingPoint?.key).toBe('h1');
    const plainBack = mapRichToPlain(result.posMap, headingPoint!);
    expect(plainBack).toBe(1);

    // List item newline snaps to neighbor
    const newlinePoint = mapPlainOffsetToRich(result.posMap, result.plainText.indexOf('\nItem'));
    expect(newlinePoint?.key).toBeDefined();
  });

  it('computes deterministic doc version', () => {
    const snap = snapshotRichDoc(demoDoc);
    const snap2 = snapshotRichDoc(demoDoc);
    expect(snap.docVersion).toBe(snap2.docVersion);
  });
});
