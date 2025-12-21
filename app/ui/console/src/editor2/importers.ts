import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

function makeTextNode(text: string, key?: string): SerializedLexicalNode {
  return {
    type: 'text',
    text,
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
    version: 1,
    key: key || `t-${Math.random().toString(36).slice(2)}`,
  } as SerializedLexicalNode;
}

function makeElement(type: string, children: SerializedLexicalNode[], extra: Record<string, unknown> = {}): SerializedLexicalNode {
  return {
    type,
    format: '',
    indent: 0,
    version: 1,
    direction: null,
    children,
    key: `${type}-${Math.random().toString(36).slice(2)}`,
    ...extra,
  } as SerializedLexicalNode;
}

export function importPlainText(text: string): SerializedEditorState {
  const blocks = text.split(/\n{2,}/);
  const children: SerializedLexicalNode[] = [];

  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.split('\n');
    const firstLine = lines[0];

    if (/^#{1,3}\s/.test(firstLine)) {
      const level = firstLine.match(/^#{1,3}/)?.[0].length ?? 1;
      const content = firstLine.replace(/^#{1,3}\s*/, '');
      children.push(
        makeElement('heading', [makeTextNode(content)], { tag: `h${level}` }),
      );
      if (lines.length > 1) {
        const rest = lines.slice(1).join('\n');
        children.push(makeElement('paragraph', [makeTextNode(rest)]));
      }
      continue;
    }

    const bulletMatch = lines.every(line => /^[-*]\s+/.test(line));
    const orderedMatch = lines.every(line => /^\d+\.\s+/.test(line));
    const checklistMatch = lines.every(line => /^-\s+\[[ xX]\]\s+/.test(line));

    if (bulletMatch || orderedMatch || checklistMatch) {
      const listType = orderedMatch ? 'number' : 'bullet';
      const listChildren = lines.map(line => {
        const clean = line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').replace(/^- \[[ xX]\]\s+/, '');
        return makeElement('listitem', [makeTextNode(clean)]);
      });
      children.push(makeElement('list', listChildren, { listType }));
      continue;
    }

    if (lines.every(line => /^>\s?/.test(line))) {
      const quoteText = lines.map(line => line.replace(/^>\s?/, '')).join('\n');
      children.push(makeElement('quote', [makeTextNode(quoteText)]));
      continue;
    }

    children.push(makeElement('paragraph', [makeTextNode(block)]));
  }

  if (children.length === 0) {
    children.push(makeElement('paragraph', [makeTextNode('')]));
  }

  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: null,
      children,
      key: 'root',
    },
  };
}
