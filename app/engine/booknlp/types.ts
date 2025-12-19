/**
 * BookNLP Contract Types
 *
 * These types match the JSON contract produced by scripts/booknlp_runner.py
 * Schema version: 1.0
 */

// ============================================================================
// CONTRACT TYPES (match Python output)
// ============================================================================

export interface CharacterAlias {
  text: string;
  count: number;
}

export interface BookNLPCharacter {
  id: string;  // "char_{cluster_id}"
  canonical_name: string;
  aliases: CharacterAlias[];
  mention_count: number;
  gender: string | null;
  agent_score: number;
}

export interface BookNLPMention {
  id: string;
  character_id: string | null;
  text: string;
  start_token: number;
  end_token: number;
  start_char: number;
  end_char: number;
  sentence_idx: number;
  mention_type: 'PROP' | 'NOM' | 'PRON' | string;
  entity_type: 'PER' | 'LOC' | 'ORG' | 'FAC' | 'GPE' | 'VEH' | string;
}

export interface BookNLPCorefChain {
  chain_id: string;
  character_id: string | null;
  mentions: string[];  // List of mention IDs
}

export interface BookNLPQuote {
  id: string;
  text: string;
  start_token: number;
  end_token: number;
  start_char: number;
  end_char: number;
  speaker_id: string | null;
  speaker_name: string | null;
  addressee_id: string | null;
  quote_type: 'explicit' | 'implicit' | 'anaphoric' | string;
}

export interface BookNLPToken {
  idx: number;
  text: string;
  lemma: string;
  pos: string;
  ner: string;
  start_char: number;
  end_char: number;
  sentence_idx: number;
  paragraph_idx: number;
}

export interface BookNLPMetadata {
  booknlp_version: string;
  text_length: number;
  text_hash: string;
  processing_time_seconds: number;
  token_count: number;
  sentence_count: number;
  character_count: number;
  mention_count: number;
  quote_count: number;
}

export interface BookNLPContract {
  schema_version: string;
  document_id: string;
  metadata: BookNLPMetadata;
  characters: BookNLPCharacter[];
  mentions: BookNLPMention[];
  coref_chains: BookNLPCorefChain[];
  quotes: BookNLPQuote[];
  tokens: BookNLPToken[];
}

// ============================================================================
// ARES INTERNAL TYPES (what we convert to)
// ============================================================================

export interface ARESEntity {
  id: string;
  canonical: string;
  type: 'PERSON' | 'ORG' | 'PLACE' | 'DATE' | 'WORK' | 'ITEM' | 'SPECIES' | 'EVENT';
  aliases: string[];
  confidence: number;
  source: 'booknlp' | 'ares_refinement' | 'hybrid';
  booknlp_id?: string;  // Original BookNLP character ID
  mention_count?: number;
  gender?: string;
}

export interface ARESSpan {
  entity_id: string;
  start: number;
  end: number;
  text: string;
  mention_id?: string;
  mention_type?: string;
}

export interface ARESQuote {
  id: string;
  text: string;
  start: number;
  end: number;
  speaker_id: string | null;
  speaker_name: string | null;
  confidence: number;
}

export interface ARESCorefLink {
  from_mention_id: string;
  to_mention_id: string;
  entity_id: string;
}

export interface BookNLPResult {
  entities: ARESEntity[];
  spans: ARESSpan[];
  quotes: ARESQuote[];
  coref_links: ARESCorefLink[];
  metadata: BookNLPMetadata;
  raw_contract?: BookNLPContract;
}
