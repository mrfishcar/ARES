/**
 * ARES Pipeline Stage Types
 *
 * Shared type definitions for the modular extraction pipeline.
 * Each stage has explicit input/output types for type safety and clarity.
 */

import type { Entity, Relation, EntityType, Predicate } from '../schema';
import type { LLMConfig } from '../llm-config';
import type { EntityProfile } from '../entity-profiler';
import type { FictionEntity } from '../fiction-extraction';
import type { PatternLibrary } from '../pattern-library';
import type { ParsedSentence } from '../extract/parse-types';

// ============================================================================
// CORE PIPELINE TYPES
// ============================================================================

/**
 * Global engine configuration
 * Passed to orchestrator and propagated to relevant stages
 */
export interface EngineConfig {
  llmConfig?: LLMConfig;
  entityFilterConfig: EntityFilterConfig;
  deduplicationConfig: DeduplicationConfig;
  relationFilterConfig: RelationFilterConfig;
  hertOptions?: HERTOptions;
}

/**
 * Document segment with context window
 */
export interface Segment {
  paraIndex: number;
  sentIndex: number;
  start: number;        // Character offset in full text
  end: number;          // Character offset in full text
  text: string;
}

/**
 * Sentence boundary information
 */
export interface Sentence {
  start: number;        // Character offset
  end: number;          // Character offset
  text: string;
}

/**
 * Entity span (character offsets)
 */
export interface Span {
  entity_id: string;
  start: number;
  end: number;
}

/**
 * Lightweight entity lookup for relation extraction
 */
export interface EntityLookup {
  id: string;
  canonical: string;
  type: EntityType;
  aliases: string[];
}

/**
 * Coreference link (pronoun/descriptor → entity)
 */
export interface CorefLink {
  entity_id: string;
  mention: {
    text: string;
    start: number;
    end: number;
  };
  method: string;       // 'pronoun', 'descriptor', 'name_variant', etc.
  confidence: number;
}

/**
 * Deictic reference resolution
 */
export interface DeicticSpan {
  start: number;
  end: number;
  replacement: string;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * Entity filtering configuration (Precision Defense Layer 1)
 */
export interface EntityFilterConfig {
  enabled: boolean;
  minConfidence: number;
  minLength: number;
  blockedTokens: string[];
  requireCapitalization: boolean;
  allowInvalidCharacters: boolean;
  strictMode: boolean;
}

/**
 * Relation deduplication configuration (Precision Defense Layer 3)
 */
export interface DeduplicationConfig {
  enabled: boolean;
  mergeEvidence: boolean;
  keepHighestConfidence: boolean;
}

/**
 * Relation filtering configuration (Precision Defense Layer 2)
 */
export interface RelationFilterConfig {
  marriedToSuppressionEnabled: boolean;
  marriedToProximityWindow: number;  // ±N sentences
  siblingDetectionEnabled: boolean;
  appositiveFilteringEnabled: boolean;
  coordinationDetectionEnabled: boolean;
  minConfidence: number;
}

/**
 * HERT generation options
 */
export interface HERTOptions {
  generateHERTs: boolean;
  autoSaveHERTs: boolean;
}

// ============================================================================
// STATISTICS TYPES
// ============================================================================

/**
 * Entity filtering statistics
 */
export interface FilterStats {
  original: number;
  filtered: number;
  removed: number;
  removalRate: number;
  removedByReason: {
    lowConfidence: number;
    tooShort: number;
    blockedToken: number;
    noCapitalization: number;
    invalidCharacters: number;
    invalidDate: number;
    tooGeneric: number;
    strictMode: number;
  };
}

/**
 * Relation filtering statistics
 */
export interface RelationFilterStats {
  original: number;
  filtered: number;
  removed: number;
  removalRate: number;
  removedByReason: {
    marriedToSuppression: number;
    siblingDetection: number;
    appositiveFiltering: number;
    confidenceThreshold: number;
  };
}

/**
 * Relation deduplication statistics
 */
export interface DeduplicationStats {
  original: number;
  deduplicated: number;
  removed: number;
  removalRate: number;
  duplicateGroups: number;
  avgGroupSize: number;
  maxGroupSize: number;
}

// ============================================================================
// STAGE 1: DOCUMENT PARSE STAGE
// ============================================================================

export interface ParseStageInput {
  docId: string;
  fullText: string;
  config: EngineConfig;
}

export interface ParseStageOutput {
  docId: string;
  fullText: string;
  segments: Segment[];
  sentences: Sentence[];
  parseCache: Map<string, ParsedSentence>;
}

// ============================================================================
// STAGE 2: ENTITY EXTRACTION STAGE
// ============================================================================

export interface EntityExtractionInput extends ParseStageOutput {
  llmConfig?: LLMConfig;
  patternLibrary?: PatternLibrary;
}

export interface EntityExtractionOutput {
  entities: Entity[];
  spans: Span[];
  entityMap: Map<string, Entity>;  // type::canonical_lower -> entity
  meta?: {
    classifierRejected: number;
    contextOnlyMentions: number;
  };
}

// ============================================================================
// STAGE 3: ENTITY FILTERING STAGE
// ============================================================================

export interface EntityFilteringInput {
  entities: Entity[];
  spans: Span[];
  entityMap: Map<string, Entity>;
  config: EntityFilterConfig;
}

export interface EntityFilteringOutput {
  entities: Entity[];
  spans: Span[];
  entityMap: Map<string, Entity>;
  filterStats: FilterStats;
}

// ============================================================================
// STAGE 4: ENTITY PROFILING STAGE
// ============================================================================

export interface EntityProfilingInput {
  entities: Entity[];
  spans: Span[];
  sentences: Sentence[];
  docId: string;
  existingProfiles?: Map<string, EntityProfile>;
}

export interface EntityProfilingOutput {
  profiles: Map<string, EntityProfile>;
}

// ============================================================================
// STAGE 5: COREFERENCE STAGE
// ============================================================================

export interface CoreferenceInput {
  sentences: Sentence[];
  entities: Entity[];
  spans: Span[];
  fullText: string;
  profiles: Map<string, EntityProfile>;
}

export interface CoreferenceOutput {
  corefLinks: CorefLink[];
  virtualSpans: Span[];     // Pronoun spans mapped to entities
}

// ============================================================================
// STAGE 6: DEICTIC RESOLUTION STAGE
// ============================================================================

export interface DeicticResolutionInput {
  fullText: string;
  entities: Entity[];
  spans: Span[];
}

export interface DeicticResolutionOutput {
  processedText: string;     // Text with deictic references resolved
  deicticSpans: DeicticSpan[];
}

// ============================================================================
// STAGE 7: RELATION EXTRACTION STAGE
// ============================================================================

export interface RelationExtractionInput {
  segments: Segment[];
  entities: Entity[];
  spans: Span[];              // Real + virtual (coref) spans
  processedText: string;      // After deictic resolution
  docId: string;
  corefLinks: CorefLink[];
  entityLookup: EntityLookup[];
  entityMap: Map<string, Entity>;
}

export interface RelationExtractionOutput {
  relations: Relation[];
}

// ============================================================================
// STAGE 8: RELATION FILTERING STAGE
// ============================================================================

export interface RelationFilteringInput {
  relations: Relation[];
  entities: Entity[];
  spans: Span[];
  fullText: string;
  sentences: Sentence[];
  config: RelationFilterConfig;
}

export interface RelationFilteringOutput {
  relations: Relation[];
  filterStats: RelationFilterStats;
}

// ============================================================================
// STAGE 9: INVERSE GENERATION STAGE
// ============================================================================

export interface InverseGenerationInput {
  relations: Relation[];
}

export interface InverseGenerationOutput {
  relations: Relation[];    // Original + generated inverses
}

// ============================================================================
// STAGE 10: DEDUPLICATION STAGE
// ============================================================================

export interface DeduplicationInput {
  relations: Relation[];
  config: DeduplicationConfig;
}

export interface DeduplicationOutput {
  relations: Relation[];
  deduplicationStats: DeduplicationStats;
}

// ============================================================================
// STAGE 11: ALIAS RESOLUTION STAGE
// ============================================================================

export interface AliasResolutionInput {
  entities: Entity[];
  profiles: Map<string, EntityProfile>;
  corefLinks: CorefLink[];
}

export interface AliasResolutionOutput {
  entities: Entity[];       // With EID, AID, SP assigned
}

// ============================================================================
// STAGE 12: KNOWLEDGE GRAPH STAGE
// ============================================================================

export interface KnowledgeGraphInput {
  entities: Entity[];
  spans: Span[];
  relations: Relation[];
  profiles: Map<string, EntityProfile>;
  fullText: string;
}

export interface KnowledgeGraphOutput {
  entities: Entity[];
  spans: Span[];
  relations: Relation[];
  fictionEntities: FictionEntity[];
}

// ============================================================================
// STAGE 13: HERT GENERATION STAGE (OPTIONAL)
// ============================================================================

export interface HERTGenerationInput {
  entities: Entity[];
  spans: Span[];
  fullText: string;
  docId: string;
  options: HERTOptions;
}

export interface HERTGenerationOutput {
  herts: string[];
}

// ============================================================================
// FINAL PIPELINE OUTPUT
// ============================================================================

/**
 * Complete extraction result from pipeline
 */
export interface PipelineOutput {
  entities: Entity[];
  spans: Span[];
  relations: Relation[];
  fictionEntities: FictionEntity[];
  profiles: Map<string, EntityProfile>;
  herts?: string[];
  stats?: {
    entities: {
      kept: number;
      rejected: number;
    };
  };
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Stage execution metadata
 */
export interface StageMetadata {
  stageName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  inputSize: number;
  outputSize: number;
  error?: Error;
}

/**
 * Pipeline execution trace
 */
export interface PipelineTrace {
  stages: StageMetadata[];
  totalDuration: number;
  success: boolean;
}

/**
 * Stage function signature
 */
export type StageFunction<TInput, TOutput> = (input: TInput) => Promise<TOutput>;
