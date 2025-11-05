/**
 * Shared types for relation extraction
 */

export type Span = { entity_id: string; start: number; end: number };

export type Token = {
  i: number;
  text: string;
  lemma: string;
  pos: string;
  tag: string;
  dep: string;
  head: number;
  ent: string;
  start: number;
  end: number;
};

export type ParsedSentence = {
  sentence_index: number;
  tokens: Token[];
  start: number;
  end: number;
};

export type ParseResponse = {
  sentences: ParsedSentence[];
};

export interface EntityRef {
  entity: import('../../schema').Entity;
  span: Span | null;
}
