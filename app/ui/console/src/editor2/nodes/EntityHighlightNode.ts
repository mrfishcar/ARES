import type {
  DOMConversionMap,
  DOMConversionOutput,
  ElementFormatType,
  LexicalEditor,
  LexicalNode,
  NodeKey,
} from 'lexical';
import { ElementNode } from 'lexical';

export type EntityHighlightPayload = {
  id?: string;
  color: string;
  start: number;
  end: number;
  title?: string;
};

export class EntityHighlightNode extends ElementNode {
  __color: string;
  __entityId?: string;
  __start: number;
  __end: number;
  __title?: string;

  static getType(): string {
    return 'entity-highlight';
  }

  static clone(node: EntityHighlightNode): EntityHighlightNode {
    return new EntityHighlightNode(
      node.__color,
      node.__entityId,
      node.__start,
      node.__end,
      node.__title,
      node.__key,
    );
  }

  constructor(color: string, entityId?: string, start = 0, end = 0, title?: string, key?: NodeKey) {
    super(key);
    this.__color = color;
    this.__entityId = entityId;
    this.__start = start;
    this.__end = end;
    this.__title = title;
  }

  static importDOM(): DOMConversionMap | null {
    return null;
  }

  static importJSON(serializedNode: any): EntityHighlightNode {
    const { color, entityId, start, end, title } = serializedNode;
    return new EntityHighlightNode(color, entityId, start, end, title);
  }

  exportJSON(): any {
    return {
      type: 'entity-highlight',
      version: 1,
      color: this.__color,
      entityId: this.__entityId,
      start: this.__start,
      end: this.__end,
      title: this.__title,
    };
  }

  createDOM(_config: Record<string, unknown>, _editor: LexicalEditor): HTMLElement {
    const span = document.createElement('span');
    span.style.backgroundColor = `${this.__color}22`;
    span.style.boxShadow = `0 0 0 1px ${this.__color}55`;
    span.style.borderRadius = '4px';
    span.style.padding = '0 1px';
    span.dataset.entityId = this.__entityId || '';
    span.dataset.start = String(this.__start);
    span.dataset.end = String(this.__end);
    if (this.__title) {
      span.title = this.__title;
    }
    return span;
  }

  updateDOM(prevNode: EntityHighlightNode, dom: HTMLElement): boolean {
    if (prevNode.__color !== this.__color) {
      dom.style.backgroundColor = `${this.__color}22`;
      dom.style.boxShadow = `0 0 0 1px ${this.__color}55`;
    }
    return false;
  }

  isInline(): boolean {
    return true;
  }

  canBeEmpty(): boolean {
    return false;
  }

  getFormatType(): ElementFormatType | null {
    return null;
  }
}

export function $createEntityHighlightNode(payload: EntityHighlightPayload): EntityHighlightNode {
  return new EntityHighlightNode(payload.color, payload.id, payload.start, payload.end, payload.title);
}
