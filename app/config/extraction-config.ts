/**
 * Extraction Configuration Loader
 *
 * Loads and validates extraction.json configuration file.
 * Provides typed access to all extraction parameters.
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ConfidenceConfig {
  source_weights: {
    WHITELIST: number;
    NER: number;
    DEP: number;
    FALLBACK: number;
  };
  minimum_entity_confidence: number;
  minimum_relation_confidence: number;
  generic_penalty: number;
  mention_frequency_bonus_max: number;
  mention_frequency_bonus_per_count: number;
}

export interface ContextWindowsConfig {
  initial_extraction: {
    before: number;
    after: number;
  };
  coreference_resolution: {
    before: number;
    after: number;
  };
  adaptive_sizing: {
    enabled: boolean;
    min_document_length: number;
  };
}

export interface AliasingConfig {
  min_similarity_for_alias: number;
  min_similarity_for_auto_merge: number;
  max_pronoun_distance_sentences: number;
  require_gender_agreement: boolean;
  title_overlap_prevention: {
    enabled: boolean;
    generic_titles: string[];
  };
  valid_name_prefixes: string[];
}

export interface EntityDetectionConfig {
  org_hint_keywords: string[];
  place_prepositions: string[];
  family_relation_words: string[];
  person_role_descriptors: string[];
}

export interface VerbClass {
  verbs: string[];
  relation_type?: string;
  relation_types?: string[];
}

export interface RelationExtractionConfig {
  verb_classes: {
    OWNERSHIP: VerbClass;
    FAMILY: VerbClass;
    LOCATION: VerbClass;
    COMMUNICATION: VerbClass;
    AFFILIATION: VerbClass;
  };
  max_relation_distance_tokens: number;
  coordination_detection: {
    enabled: boolean;
    max_distance_chars: number;
    markers: string[];
  };
}

export interface PatternExtractionConfig {
  date_patterns: {
    enabled: boolean;
    year_only_range: {
      min: number;
      max: number;
      regex: string;
    };
  };
  product_patterns: {
    enabled: boolean;
    brand_keywords: string[];
  };
  org_acronyms: {
    enabled: boolean;
    min_length: number;
    max_length: number;
    common_acronyms: string[];
  };
}

export interface QualityFiltersConfig {
  entity_filter: {
    enabled: boolean;
    min_length: number;
    blocked_tokens: string[];
    max_generic_word_count: number;
  };
  relation_filter: {
    enabled: boolean;
    appositive_detection: {
      enabled: boolean;
      max_distance_chars: number;
    };
    duplicate_suppression: {
      enabled: boolean;
      parent_child_when_married: boolean;
    };
  };
}

export interface PerformanceConfig {
  max_entities_per_document: number;
  max_relations_per_document: number;
  enable_caching: boolean;
  cache_parse_results: boolean;
}

export interface DebugConfig {
  enable_extraction_logging: boolean;
  enable_span_tracing: boolean;
  log_level: string;
}

export interface ExtractionConfig {
  version: string;
  description: string;
  confidence: ConfidenceConfig;
  context_windows: ContextWindowsConfig;
  aliasing: AliasingConfig;
  entity_detection: EntityDetectionConfig;
  relation_extraction: RelationExtractionConfig;
  pattern_extraction: PatternExtractionConfig;
  quality_filters: QualityFiltersConfig;
  performance: PerformanceConfig;
  debug: DebugConfig;
}

// ============================================================================
// Config Loader
// ============================================================================

let cachedConfig: ExtractionConfig | null = null;

/**
 * Load extraction configuration from config/extraction.json
 * Config is cached after first load for performance
 */
export function loadExtractionConfig(): ExtractionConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Resolve config path relative to project root
  const configPath = path.join(process.cwd(), 'config', 'extraction.json');

  try {
    const rawConfig = fs.readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(rawConfig) as ExtractionConfig;
    return cachedConfig;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        `Extraction config not found at ${configPath}. ` +
        `Please ensure config/extraction.json exists.`
      );
    }
    throw new Error(
      `Failed to load extraction config: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Force reload config from disk (useful for testing or hot-reloading)
 */
export function reloadExtractionConfig(): ExtractionConfig {
  cachedConfig = null;
  return loadExtractionConfig();
}

/**
 * Get specific config section
 */
export function getConfidenceConfig(): ConfidenceConfig {
  return loadExtractionConfig().confidence;
}

export function getContextWindowsConfig(): ContextWindowsConfig {
  return loadExtractionConfig().context_windows;
}

export function getAliasingConfig(): AliasingConfig {
  return loadExtractionConfig().aliasing;
}

export function getEntityDetectionConfig(): EntityDetectionConfig {
  return loadExtractionConfig().entity_detection;
}

export function getRelationExtractionConfig(): RelationExtractionConfig {
  return loadExtractionConfig().relation_extraction;
}

export function getPatternExtractionConfig(): PatternExtractionConfig {
  return loadExtractionConfig().pattern_extraction;
}

export function getQualityFiltersConfig(): QualityFiltersConfig {
  return loadExtractionConfig().quality_filters;
}

export function getPerformanceConfig(): PerformanceConfig {
  return loadExtractionConfig().performance;
}

export function getDebugConfig(): DebugConfig {
  return loadExtractionConfig().debug;
}

// ============================================================================
// Convenience Helpers
// ============================================================================

/**
 * Get generic titles set (for title overlap prevention)
 */
export function getGenericTitles(): Set<string> {
  const config = getAliasingConfig();
  return new Set(config.title_overlap_prevention.generic_titles);
}

/**
 * Get valid name prefixes regex pattern
 */
export function getValidNamePrefixesPattern(): RegExp {
  const config = getAliasingConfig();
  const prefixes = config.valid_name_prefixes.join('|');
  return new RegExp(`^(${prefixes})`, 'i');
}

/**
 * Get context window size for initial extraction
 */
export function getInitialContextWindowSize(): { before: number; after: number } {
  const config = getContextWindowsConfig();
  return {
    before: config.initial_extraction.before,
    after: config.initial_extraction.after
  };
}

/**
 * Get context window size for coreference resolution
 */
export function getCorefContextWindowSize(): number {
  const config = getContextWindowsConfig();
  // Return total window size (before + after)
  return config.coreference_resolution.before + config.coreference_resolution.after;
}

/**
 * Check if extraction logging is enabled
 */
export function isExtractionLoggingEnabled(): boolean {
  const config = getDebugConfig();
  return config.enable_extraction_logging;
}

/**
 * Check if span tracing is enabled
 */
export function isSpanTracingEnabled(): boolean {
  const config = getDebugConfig();
  return config.enable_span_tracing;
}
