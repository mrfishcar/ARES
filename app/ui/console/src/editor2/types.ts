import type { SerializedEditorState } from 'lexical';

export type UIMode = 'write' | 'format';

export interface RichPoint {
  key: string;
  offset: number;
}

export interface PosMapEntry {
  kind: 'text' | 'separator';
  key?: string;
  textStart?: number;
  textEnd?: number;
  plainStart: number;
  plainEnd: number;
  beforeKey?: string;
  afterKey?: string;
}

export interface BlockIndexEntry {
  key: string;
  type: string;
  plainStart: number;
  plainEnd: number;
}

export interface FlattenResult {
  plainText: string;
  posMap: PosMapEntry[];
  blocks: BlockIndexEntry[];
}

export interface RichDocSnapshot extends FlattenResult {
  docJSON: SerializedEditorState;
  docVersion: string;
}

export interface RichEditorChange {
  snapshot: RichDocSnapshot;
}
