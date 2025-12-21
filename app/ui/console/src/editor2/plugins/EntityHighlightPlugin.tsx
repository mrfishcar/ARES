import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { EntitySpan } from '../../types/entities';
import { getEntityTypeColor } from '../../types/entities';

export interface HighlightSpan extends EntitySpan {
  color?: string;
}

interface Props {
  spans: HighlightSpan[];
  onHighlightClick?: (span: HighlightSpan) => void;
}

function getTextNodes(root: HTMLElement): Array<{ node: Text; start: number; end: number }> {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let offset = 0;
  let current: Node | null;
  while ((current = walker.nextNode())) {
    const textNode = current as Text;
    const len = textNode.textContent?.length ?? 0;
    nodes.push({ node: textNode, start: offset, end: offset + len });
    offset += len;
  }
  return nodes;
}

function findRangeForOffsets(root: HTMLElement, from: number, to: number): Range | null {
  const textNodes = getTextNodes(root);
  const range = document.createRange();

  const startInfo = textNodes.find(n => from >= n.start && from <= n.end);
  const endInfo = textNodes.find(n => to >= n.start && to <= n.end);
  if (!startInfo || !endInfo) return null;

  range.setStart(startInfo.node, Math.max(0, from - startInfo.start));
  range.setEnd(endInfo.node, Math.max(0, to - endInfo.start));
  return range;
}

export function EntityHighlightPlugin({ spans, onHighlightClick }: Props) {
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
    const root = editor.getRootElement();
    if (!root) return;

    // TEMPORARILY DISABLED: Direct DOM manipulation breaks Lexical's contentEditable
    // This plugin needs to be rewritten using Lexical's decorator API
    // For now, entity highlighting is disabled to restore editor functionality

    // TODO: Rewrite using Lexical TextNode decorators or mark nodes
    // See: https://lexical.dev/docs/concepts/nodes#mark-nodes

    return; // Early return - no highlighting for now

    /*
    // Clear previous highlights
    root.querySelectorAll('.rich-entity-highlight').forEach(el => {
      const parent = el.parentElement;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });

    spans.forEach(span => {
      const range = findRangeForOffsets(root, span.start, span.end);
      if (!range) return;
      const wrapper = document.createElement('span');
      const color = span.color || getEntityTypeColor(span.type);
      wrapper.className = 'rich-entity-highlight';
      wrapper.dataset.start = String(span.start);
      wrapper.dataset.end = String(span.end);
      wrapper.style.backgroundColor = `${color}22`;
      wrapper.style.boxShadow = `0 0 0 1px ${color}55`;
      wrapper.style.borderRadius = '3px';
      wrapper.style.padding = '0 1px';
      if (span.canonicalName || span.displayText || span.text) {
        wrapper.title = span.canonicalName || span.displayText || span.text;
      }
      range.surroundContents(wrapper);
    });
    */
  }, [editor, spans]);

  return null;
}
