import { useEffect } from 'react';
import { $createRangeSelection, $getSelection, $isRangeSelection, $nodesOfType, $setSelection } from 'lexical';
import { $wrapSelectionInElement } from '@lexical/selection';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { EntitySpan } from '../../types/entities';
import { getEntityTypeColor } from '../../types/entities';
import { mapPlainOffsetToRich } from '../flattenRichDoc';
import { $createEntityHighlightNode, EntityHighlightNode } from '../nodes/EntityHighlightNode';
import type { PosMapEntry } from '../types';

export interface HighlightSpan extends EntitySpan {
  color?: string;
}

interface Props {
  spans: HighlightSpan[];
  posMap: PosMapEntry[];
  onHighlightClick?: (span: HighlightSpan) => void;
}

export function EntityHighlightPlugin({ spans, posMap, onHighlightClick }: Props) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerRootListener((rootElement) => {
      if (!rootElement || !onHighlightClick) return;
      const handler = (event: Event) => {
        const target = event.target as HTMLElement;
        if (!target || !target.dataset?.start || !target.dataset?.end) return;
        const start = Number(target.dataset.start);
        const end = Number(target.dataset.end);
        const span = spans.find(s => s.start === start && s.end === end);
        if (span) {
          onHighlightClick(span);
        }
      };
      rootElement.addEventListener('click', handler);
      return () => rootElement.removeEventListener('click', handler);
    });
  }, [editor, spans, onHighlightClick]);

  useEffect(() => {
    editor.update(() => {
      const selection = $getSelection();
      const currentSelection = $isRangeSelection(selection) ? selection.clone() : null;

      $nodesOfType(EntityHighlightNode).forEach(node => node.unwrap());

      spans.forEach(span => {
        const anchor = mapPlainOffsetToRich(posMap, span.start);
        const focus = mapPlainOffsetToRich(posMap, span.end);
        if (!anchor || !focus) return;
        const selection = $createRangeSelection();
        selection.anchor.set(anchor.key, anchor.offset, 'text');
        selection.focus.set(focus.key, focus.offset, 'text');
        $setSelection(selection);
        const color = span.color || getEntityTypeColor(span.type);
        $wrapSelectionInElement(() =>
          $createEntityHighlightNode({
            color,
            id: span.entityId,
            start: span.start,
            end: span.end,
            title: span.canonicalName || span.displayText || span.text,
          }),
        );
      });

      $setSelection(currentSelection);
    });
  }, [editor, spans, posMap]);

  return null;
}
