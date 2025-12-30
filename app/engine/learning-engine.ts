/**
 * Learning Engine - Phase 4.1
 *
 * Extracts patterns from user corrections for automatic application.
 *
 * Key responsibilities:
 * 1. Analyze corrections to extract generalizable patterns
 * 2. Store patterns with confidence based on correction frequency
 * 3. Provide pattern matching for new extractions
 *
 * Pattern Types:
 * - entity_type: "Kingdom of X" → PLACE
 * - entity_name: Canonical name corrections
 * - relation: Predicate corrections
 * - confidence: Confidence boost/reduction patterns
 */

import type {
  Correction,
  CorrectionType,
  LearnedPattern,
  EntityType,
  Predicate,
} from './schema';
import { v4 as uuid } from 'uuid';

// ============================================================================
// PATTERN EXTRACTION
// ============================================================================

/**
 * Context analysis result from a correction
 */
export interface CorrectionContext {
  /** Text pattern (e.g., "Kingdom of *", "* River") */
  textPattern?: string;
  /** Surrounding context keywords */
  contextWords?: string[];
  /** Entity type involved */
  entityType?: EntityType;
  /** If applicable, the relation predicate */
  predicate?: Predicate;
}

/**
 * Extract a generalizable pattern from an entity type correction
 */
function extractEntityTypePattern(correction: Correction): LearnedPattern | null {
  const beforeType = correction.before?.entityType as EntityType | undefined;
  const afterType = correction.after?.entityType as EntityType | undefined;
  const canonical = correction.before?.canonical || '';

  if (!beforeType || !afterType || beforeType === afterType) {
    return null;
  }

  // Analyze the canonical name for patterns
  const tokens = canonical.split(/\s+/).filter(Boolean);
  let textPattern: string | undefined;

  // Check for geographic patterns
  const geoMarkers = ['kingdom', 'river', 'lake', 'mountain', 'forest', 'city', 'village'];
  const tokensLower = tokens.map(t => t.toLowerCase());
  for (const marker of geoMarkers) {
    const markerIndex = tokensLower.indexOf(marker);
    if (markerIndex !== -1) {
      if (markerIndex === 0) {
        textPattern = `${marker} of *`;
      } else {
        textPattern = `* ${marker}`;
      }
      break;
    }
  }

  // Check for organization patterns
  const orgMarkers = ['ministry', 'school', 'university', 'company', 'corporation'];
  for (const marker of orgMarkers) {
    if (tokens.some(t => t.toLowerCase() === marker)) {
      textPattern = textPattern || `* ${marker}`;
      break;
    }
  }

  // Check for house/order patterns
  const houseMarkers = ['house', 'order', 'clan', 'dynasty'];
  for (const marker of houseMarkers) {
    const markerIndex = tokensLower.indexOf(marker);
    if (markerIndex !== -1) {
      if (markerIndex === 0) {
        textPattern = `${marker} of *`;
      } else {
        textPattern = `* ${marker}`;
      }
      break;
    }
  }

  // If no pattern found, use exact match (lower confidence)
  if (!textPattern) {
    textPattern = canonical;
  }

  return {
    id: uuid(),
    type: 'entity_type',
    pattern: textPattern,
    condition: {
      textPattern,
      entityType: beforeType,
    },
    action: {
      setType: afterType,
    },
    stats: {
      timesApplied: 0,
      timesValidated: 1, // Created from user correction
      timesRejected: 0,
    },
    sourceCorrections: [correction.id],
    active: true,
    confidence: textPattern !== canonical ? 0.6 : 0.3, // Higher for generalized patterns
  };
}

/**
 * Extract pattern from entity merge correction
 */
function extractMergePattern(correction: Correction): LearnedPattern | null {
  const entities = correction.before?.entities as Array<{ canonical: string; type?: string }> | undefined;
  if (!entities || entities.length < 2) {
    return null;
  }

  // Check if entities have similar patterns (e.g., "John" + "John Smith" → merge)
  const canonicals = entities.map(e => e.canonical);
  const allNames = canonicals.join(' | ');

  // Check for alias patterns (short form → long form)
  const sorted = [...canonicals].sort((a, b) => a.length - b.length);
  const shortest = sorted[0];
  const longest = sorted[sorted.length - 1];

  // If shortest is prefix of longest, create pattern
  if (longest.toLowerCase().startsWith(shortest.toLowerCase())) {
    return {
      id: uuid(),
      type: 'entity_name',
      pattern: `${shortest} <-> ${longest}`,
      condition: {
        textPattern: shortest,
      },
      action: {
        merge: true,
      },
      stats: {
        timesApplied: 0,
        timesValidated: 1,
        timesRejected: 0,
      },
      sourceCorrections: [correction.id],
      active: true,
      confidence: 0.5,
    };
  }

  return null;
}

/**
 * Extract pattern from confidence correction
 */
function extractConfidencePattern(correction: Correction): LearnedPattern | null {
  const beforeConf = correction.before?.confidence as number | undefined;
  const afterConf = correction.after?.confidence as number | undefined;
  const canonical = correction.before?.canonical || '';

  if (beforeConf === undefined || afterConf === undefined) {
    return null;
  }

  const confChange = afterConf - beforeConf;
  if (Math.abs(confChange) < 0.1) {
    return null;
  }

  return {
    id: uuid(),
    type: 'confidence',
    pattern: canonical,
    condition: {
      textPattern: canonical,
    },
    action: {
      setConfidence: afterConf,
    },
    stats: {
      timesApplied: 0,
      timesValidated: 1,
      timesRejected: 0,
    },
    sourceCorrections: [correction.id],
    active: true,
    confidence: 0.4,
  };
}

/**
 * Extract a pattern from a correction
 *
 * @param correction - The user correction to analyze
 * @returns Learned pattern or null if not generalizable
 */
export function extractPatternFromCorrection(correction: Correction): LearnedPattern | null {
  switch (correction.type) {
    case 'entity_type':
      return extractEntityTypePattern(correction);

    case 'entity_merge':
      return extractMergePattern(correction);

    case 'canonical_change':
      // Could extract alias patterns
      return null;

    case 'alias_add':
    case 'alias_remove':
      // Could track common aliases
      return null;

    case 'relation_add':
    case 'relation_remove':
    case 'relation_edit':
      // Could extract relation patterns
      return null;

    case 'entity_reject':
      // Could learn rejection patterns
      return {
        id: uuid(),
        type: 'confidence',
        pattern: correction.before?.entity?.canonical || '',
        condition: {
          textPattern: correction.before?.entity?.canonical,
        },
        action: {
          reject: true,
        },
        stats: {
          timesApplied: 0,
          timesValidated: 1,
          timesRejected: 0,
        },
        sourceCorrections: [correction.id],
        active: true,
        confidence: 0.3,
      };

    default:
      return null;
  }
}

// ============================================================================
// PATTERN STORAGE
// ============================================================================

/**
 * Merge a new pattern with existing patterns
 *
 * If a similar pattern exists, boost its confidence. Otherwise add new pattern.
 */
export function mergePatterns(
  existing: LearnedPattern[],
  newPattern: LearnedPattern
): LearnedPattern[] {
  // Check for existing similar pattern
  const similar = existing.find(p =>
    p.type === newPattern.type &&
    p.pattern === newPattern.pattern
  );

  if (similar) {
    // Boost existing pattern's confidence
    const boostedConfidence = Math.min(
      similar.confidence + 0.1,
      0.95
    );

    return existing.map(p =>
      p.id === similar.id
        ? {
            ...p,
            confidence: boostedConfidence,
            stats: {
              ...p.stats,
              timesValidated: p.stats.timesValidated + 1,
            },
            sourceCorrections: [...p.sourceCorrections, ...newPattern.sourceCorrections],
          }
        : p
    );
  }

  // Add new pattern
  return [...existing, newPattern];
}

/**
 * Update pattern stats after application
 */
export function updatePatternStats(
  patterns: LearnedPattern[],
  patternId: string,
  outcome: 'applied' | 'validated' | 'rejected'
): LearnedPattern[] {
  return patterns.map(p => {
    if (p.id !== patternId) {
      return p;
    }

    const stats = { ...p.stats };

    switch (outcome) {
      case 'applied':
        stats.timesApplied++;
        stats.lastApplied = new Date().toISOString();
        break;
      case 'validated':
        stats.timesValidated++;
        break;
      case 'rejected':
        stats.timesRejected++;
        break;
    }

    // Recalculate confidence based on validation/rejection ratio
    const total = stats.timesValidated + stats.timesRejected;
    let newConfidence = p.confidence;
    if (total >= 5) {
      newConfidence = Math.max(0.1, stats.timesValidated / total);
    }

    // Deactivate patterns with low confidence
    const active = newConfidence >= 0.2;

    return { ...p, stats, confidence: newConfidence, active };
  });
}

// ============================================================================
// PATTERN MATCHING
// ============================================================================

/**
 * Pattern match result
 */
export interface PatternMatchResult {
  pattern: LearnedPattern;
  matchConfidence: number;
  matchedText: string;
}

/**
 * Check if a text matches a pattern
 */
function matchTextPattern(text: string, pattern: string): boolean {
  // Handle wildcard patterns
  if (pattern.includes('*')) {
    const regexPattern = pattern
      .replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&') // Escape regex chars
      .replace(/\*/g, '.*'); // Convert * to .*
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(text);
  }

  // Exact match (case-insensitive)
  return text.toLowerCase() === pattern.toLowerCase();
}

/**
 * Match entity against learned patterns
 *
 * @param entityName - Entity canonical name
 * @param entityType - Current entity type
 * @param patterns - Active learned patterns
 * @returns Matching patterns sorted by confidence
 */
export function matchPatternsForEntity(
  entityName: string,
  entityType: EntityType,
  patterns: LearnedPattern[]
): PatternMatchResult[] {
  const matches: PatternMatchResult[] = [];

  for (const pattern of patterns) {
    if (!pattern.active) {
      continue;
    }

    // Check if pattern applies to this entity type
    if (pattern.condition.entityType && pattern.condition.entityType !== entityType) {
      continue;
    }

    // Check text pattern match
    const textPattern = pattern.condition.textPattern || pattern.pattern;
    if (matchTextPattern(entityName, textPattern)) {
      matches.push({
        pattern,
        matchConfidence: pattern.confidence,
        matchedText: entityName,
      });
    }
  }

  // Sort by confidence (highest first)
  return matches.sort((a, b) => b.matchConfidence - a.matchConfidence);
}

// ============================================================================
// LEARNING ENGINE CLASS
// ============================================================================

/**
 * Learning Engine for pattern-based corrections
 */
export class LearningEngine {
  private patterns: LearnedPattern[] = [];

  constructor(initialPatterns: LearnedPattern[] = []) {
    this.patterns = initialPatterns;
  }

  /**
   * Get all patterns
   */
  getPatterns(): LearnedPattern[] {
    return this.patterns;
  }

  /**
   * Get active patterns only
   */
  getActivePatterns(): LearnedPattern[] {
    return this.patterns.filter(p => p.active);
  }

  /**
   * Learn from a correction
   */
  learnFromCorrection(correction: Correction): LearnedPattern | null {
    const pattern = extractPatternFromCorrection(correction);
    if (pattern) {
      this.patterns = mergePatterns(this.patterns, pattern);
      return pattern;
    }
    return null;
  }

  /**
   * Match patterns for an entity
   */
  matchForEntity(entityName: string, entityType: EntityType): PatternMatchResult[] {
    return matchPatternsForEntity(entityName, entityType, this.patterns);
  }

  /**
   * Record pattern application
   */
  recordApplication(patternId: string, outcome: 'applied' | 'validated' | 'rejected'): void {
    this.patterns = updatePatternStats(this.patterns, patternId, outcome);
  }

  /**
   * Enable/disable a pattern
   */
  setPatternActive(patternId: string, active: boolean): void {
    this.patterns = this.patterns.map(p =>
      p.id === patternId ? { ...p, active } : p
    );
  }

  /**
   * Get pattern statistics
   */
  getStats(): {
    total: number;
    active: number;
    byType: Record<string, number>;
    avgConfidence: number;
  } {
    const byType: Record<string, number> = {};
    let totalConfidence = 0;

    for (const pattern of this.patterns) {
      byType[pattern.type] = (byType[pattern.type] || 0) + 1;
      totalConfidence += pattern.confidence;
    }

    return {
      total: this.patterns.length,
      active: this.patterns.filter(p => p.active).length,
      byType,
      avgConfidence: this.patterns.length > 0 ? totalConfidence / this.patterns.length : 0,
    };
  }
}

/**
 * Create a learning engine from stored patterns
 */
export function createLearningEngine(patterns: LearnedPattern[] = []): LearningEngine {
  return new LearningEngine(patterns);
}
