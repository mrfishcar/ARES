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
  // Aliases for compatibility with various code paths
  idx?: number;           // Alias for i
  char_start?: number;    // Alias for start
  char_end?: number;      // Alias for end
  start_char?: number;    // Alias for start (spaCy style)
  ent_type?: string;      // Alias for ent
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
