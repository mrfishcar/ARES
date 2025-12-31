/**
 * Pattern Applier - Phase 4.2
 *
 * Applies learned patterns during extraction to improve quality.
 *
 * Key responsibilities:
 * 1. Match entities against learned patterns during extraction
 * 2. Apply type corrections from high-confidence patterns
 * 3. Boost/reduce confidence based on pattern matches
 * 4. Track pattern application statistics
 */

import type { Entity, LearnedPattern, EntityType } from './schema';
import {
  matchPatternsForEntity,
  updatePatternStats,
  type PatternMatchResult,
} from './learning-engine';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for pattern application
 */
export interface PatternApplierConfig {
  /** Minimum pattern confidence to apply */
  minConfidence: number;
  /** Whether to apply type corrections */
  applyTypeCorrections: boolean;
  /** Whether to apply confidence boosts */
  applyConfidenceBoosts: boolean;
  /** Whether to apply rejection patterns */
  applyRejections: boolean;
  /** Maximum confidence boost from patterns */
  maxConfidenceBoost: number;
}

export const DEFAULT_APPLIER_CONFIG: PatternApplierConfig = {
  minConfidence: 0.5,
  applyTypeCorrections: true,
  applyConfidenceBoosts: true,
  applyRejections: true,
  maxConfidenceBoost: 0.2,
};

// ============================================================================
// PATTERN APPLICATION RESULT
// ============================================================================

/**
 * Result of applying patterns to an entity
 */
export interface PatternApplicationResult {
  /** Original entity */
  original: Entity;
  /** Modified entity (or original if no changes) */
  modified: Entity;
  /** Whether any changes were made */
  changed: boolean;
  /** Applied patterns */
  appliedPatterns: Array<{
    patternId: string;
    patternType: string;
    action: string;
    matchConfidence: number;
  }>;
  /** Whether entity should be rejected */
  rejected: boolean;
  /** Rejection reason if rejected */
  rejectionReason?: string;
}

// ============================================================================
// PATTERN APPLICATION
// ============================================================================

/**
 * Apply a single pattern to an entity
 */
function applyPatternToEntity(
  entity: Entity,
  match: PatternMatchResult,
  config: PatternApplierConfig
): { entity: Entity; action: string; rejected: boolean } {
  const pattern = match.pattern;
  let modified = { ...entity };
  let action = '';
  let rejected = false;

  // Apply type correction
  if (config.applyTypeCorrections && pattern.action.setType && pattern.type === 'entity_type') {
    if (modified.type !== pattern.action.setType) {
      modified.type = pattern.action.setType;
      action = `type_changed_to_${pattern.action.setType}`;
    }
  }

  // Apply confidence boost/reduction
  if (config.applyConfidenceBoosts && pattern.action.setConfidence !== undefined) {
    const currentConf = modified.confidence ?? 0.5;
    const newConf = Math.min(
      1.0,
      Math.max(0.1, currentConf + (pattern.action.setConfidence - currentConf) * 0.5)
    );
    modified.confidence = newConf;
    action = action || `confidence_adjusted_to_${newConf.toFixed(2)}`;
  }

  // Apply rejection
  if (config.applyRejections && pattern.action.reject) {
    rejected = true;
    action = 'rejected_by_pattern';
  }

  // Add pattern application metadata
  if (!modified.attrs) {
    modified.attrs = {};
  }
  if (!Array.isArray(modified.attrs.appliedPatterns)) {
    modified.attrs.appliedPatterns = [];
  }
  (modified.attrs.appliedPatterns as string[]).push(pattern.id);

  return { entity: modified, action, rejected };
}

/**
 * Apply learned patterns to a single entity
 *
 * @param entity - Entity to process
 * @param patterns - Learned patterns
 * @param config - Application configuration
 * @returns Application result
 */
export function applyPatternsToEntity(
  entity: Entity,
  patterns: LearnedPattern[],
  config: PatternApplierConfig = DEFAULT_APPLIER_CONFIG
): PatternApplicationResult {
  const matches = matchPatternsForEntity(entity.canonical, entity.type, patterns);

  // Filter to patterns meeting minimum confidence
  const applicableMatches = matches.filter(m => m.matchConfidence >= config.minConfidence);

  if (applicableMatches.length === 0) {
    return {
      original: entity,
      modified: entity,
      changed: false,
      appliedPatterns: [],
      rejected: false,
    };
  }

  let currentEntity = entity;
  const appliedPatterns: PatternApplicationResult['appliedPatterns'] = [];
  let rejected = false;
  let rejectionReason: string | undefined;

  // Apply patterns in order of confidence
  for (const match of applicableMatches) {
    const result = applyPatternToEntity(currentEntity, match, config);
    currentEntity = result.entity;

    if (result.action) {
      appliedPatterns.push({
        patternId: match.pattern.id,
        patternType: match.pattern.type,
        action: result.action,
        matchConfidence: match.matchConfidence,
      });
    }

    if (result.rejected) {
      rejected = true;
      rejectionReason = `Pattern ${match.pattern.id}: ${match.pattern.pattern}`;
      break; // Stop processing after rejection
    }
  }

  return {
    original: entity,
    modified: currentEntity,
    changed: currentEntity !== entity,
    appliedPatterns,
    rejected,
    rejectionReason,
  };
}

/**
 * Apply learned patterns to a batch of entities
 *
 * @param entities - Entities to process
 * @param patterns - Learned patterns
 * @param config - Application configuration
 * @returns Processed entities and statistics
 */
export function applyPatternsToBatch(
  entities: Entity[],
  patterns: LearnedPattern[],
  config: PatternApplierConfig = DEFAULT_APPLIER_CONFIG
): {
  entities: Entity[];
  rejected: Entity[];
  stats: {
    total: number;
    modified: number;
    rejected: number;
    patternApplications: number;
  };
} {
  const processed: Entity[] = [];
  const rejected: Entity[] = [];
  let modifiedCount = 0;
  let patternApplications = 0;

  for (const entity of entities) {
    const result = applyPatternsToEntity(entity, patterns, config);

    if (result.rejected) {
      rejected.push(result.modified);
    } else {
      processed.push(result.modified);
    }

    if (result.changed) {
      modifiedCount++;
    }

    patternApplications += result.appliedPatterns.length;
  }

  return {
    entities: processed,
    rejected,
    stats: {
      total: entities.length,
      modified: modifiedCount,
      rejected: rejected.length,
      patternApplications,
    },
  };
}

// ============================================================================
// PATTERN APPLIER CLASS
// ============================================================================

/**
 * Pattern Applier for managing pattern application during extraction
 */
export class PatternApplier {
  private patterns: LearnedPattern[];
  private config: PatternApplierConfig;
  private applicationLog: Array<{
    timestamp: string;
    entityId: string;
    entityName: string;
    patternId: string;
    action: string;
  }> = [];

  constructor(
    patterns: LearnedPattern[] = [],
    config: PatternApplierConfig = DEFAULT_APPLIER_CONFIG
  ) {
    this.patterns = patterns;
    this.config = config;
  }

  /**
   * Update patterns
   */
  setPatterns(patterns: LearnedPattern[]): void {
    this.patterns = patterns;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<PatternApplierConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Apply patterns to a single entity
   */
  apply(entity: Entity): PatternApplicationResult {
    const result = applyPatternsToEntity(entity, this.patterns, this.config);

    // Log applications
    for (const applied of result.appliedPatterns) {
      this.applicationLog.push({
        timestamp: new Date().toISOString(),
        entityId: entity.id,
        entityName: entity.canonical,
        patternId: applied.patternId,
        action: applied.action,
      });
    }

    return result;
  }

  /**
   * Apply patterns to a batch of entities
   */
  applyBatch(entities: Entity[]): ReturnType<typeof applyPatternsToBatch> {
    return applyPatternsToBatch(entities, this.patterns, this.config);
  }

  /**
   * Get application log
   */
  getApplicationLog(): typeof this.applicationLog {
    return this.applicationLog;
  }

  /**
   * Clear application log
   */
  clearLog(): void {
    this.applicationLog = [];
  }

  /**
   * Get application statistics
   */
  getStats(): {
    totalApplications: number;
    byPattern: Record<string, number>;
    byAction: Record<string, number>;
  } {
    const byPattern: Record<string, number> = {};
    const byAction: Record<string, number> = {};

    for (const entry of this.applicationLog) {
      byPattern[entry.patternId] = (byPattern[entry.patternId] || 0) + 1;
      byAction[entry.action] = (byAction[entry.action] || 0) + 1;
    }

    return {
      totalApplications: this.applicationLog.length,
      byPattern,
      byAction,
    };
  }
}

/**
 * Create a pattern applier instance
 */
export function createPatternApplier(
  patterns: LearnedPattern[] = [],
  config: Partial<PatternApplierConfig> = {}
): PatternApplier {
  return new PatternApplier(patterns, { ...DEFAULT_APPLIER_CONFIG, ...config });
}
