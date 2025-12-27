/**
 * Pattern Learning System - Phase 4
 *
 * Extracts generalizable patterns from user corrections and applies
 * them automatically to new extractions. This allows the system to
 * learn from user feedback and improve over time.
 *
 * Key responsibilities:
 * 1. Extract patterns from corrections (entity type, entity name, relation)
 * 2. Apply learned patterns to new entities/relations
 * 3. Track pattern performance (applied, validated, rejected)
 * 4. Enable/disable patterns based on confidence
 */

import type {
  Entity,
  Relation,
  EntityType,
  Predicate,
  Correction,
  LearnedPattern
} from './schema';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of applying learned patterns
 */
export interface PatternApplicationResult {
  /** Modified entities */
  entities: Entity[];
  /** Modified relations */
  relations: Relation[];
  /** Patterns that were applied */
  appliedPatterns: PatternMatch[];
  /** Statistics */
  stats: {
    entitiesModified: number;
    relationsModified: number;
    patternsApplied: number;
  };
}

/**
 * A pattern that matched an entity/relation
 */
export interface PatternMatch {
  pattern: LearnedPattern;
  targetId: string;
  targetType: 'entity' | 'relation';
  confidence: number;
  actionTaken: string;
}

/**
 * Pattern extraction result
 */
export interface ExtractedPattern {
  type: LearnedPattern['type'];
  pattern: string;
  condition: LearnedPattern['condition'];
  action: LearnedPattern['action'];
  confidence: number;
}

// ============================================================================
// PATTERN EXTRACTION
// ============================================================================

/**
 * Extract entity type pattern from a type correction
 *
 * Example: User changes "Kingdom of Gondor" from PLACE to ORG
 * Pattern: Text matching "Kingdom of *" should be ORG
 */
function extractEntityTypePattern(correction: Correction): ExtractedPattern | null {
  if (correction.type !== 'entity_type') return null;

  const beforeType = correction.before?.entityType;
  const afterType = correction.after?.entityType;
  const canonical = correction.before?.canonical;

  if (!beforeType || !afterType || !canonical) return null;

  // Generate pattern from entity name
  const pattern = generateTextPattern(canonical);
  if (!pattern) return null;

  return {
    type: 'entity_type',
    pattern,
    condition: {
      textPattern: pattern,
      entityType: beforeType
    },
    action: {
      setType: afterType
    },
    confidence: 0.7  // Initial confidence
  };
}

/**
 * Extract entity name pattern from a canonical name change
 *
 * Example: User changes "Aragorn son of Arathorn" to "Aragorn"
 * Pattern: Names matching "X son of Y" should become just "X"
 */
function extractNamePattern(correction: Correction): ExtractedPattern | null {
  if (correction.type !== 'canonical_change') return null;

  const beforeName = correction.before?.canonical;
  const afterName = correction.after?.canonical;

  if (!beforeName || !afterName) return null;

  // Check for common patterns
  // Pattern: "X, the Y" → "X"
  const appositiveMatch = beforeName.match(/^(.+?),\s+the\s+.+$/i);
  if (appositiveMatch && afterName.toLowerCase() === appositiveMatch[1].toLowerCase()) {
    return {
      type: 'entity_name',
      pattern: '(.+?),\\s+the\\s+.+',
      condition: {
        textPattern: '(.+?),\\s+the\\s+.+'
      },
      action: {
        // Use capture group $1
      },
      confidence: 0.8
    };
  }

  // Pattern: "X son/daughter of Y" → "X"
  const parentageMatch = beforeName.match(/^(.+?)\s+(son|daughter)\s+of\s+.+$/i);
  if (parentageMatch && afterName.toLowerCase() === parentageMatch[1].toLowerCase()) {
    return {
      type: 'entity_name',
      pattern: '(.+?)\\s+(son|daughter)\\s+of\\s+.+',
      condition: {
        textPattern: '(.+?)\\s+(son|daughter)\\s+of\\s+.+'
      },
      action: {},
      confidence: 0.75
    };
  }

  return null;
}

/**
 * Extract entity rejection pattern
 *
 * Example: User rejects "Stabbing" as PERSON
 * Pattern: Gerunds (-ing words) with no title should not be PERSON
 */
function extractRejectionPattern(correction: Correction): ExtractedPattern | null {
  if (correction.type !== 'entity_reject') return null;

  const entity = correction.before?.entity;
  if (!entity?.canonical || !entity?.type) return null;

  const canonical = entity.canonical as string;
  const entityType = entity.type as EntityType;

  // Check for gerund pattern
  if (canonical.match(/^[A-Z][a-z]+ing$/)) {
    return {
      type: 'entity_type',
      pattern: '^[A-Z][a-z]+ing$',
      condition: {
        textPattern: '^[A-Z][a-z]+ing$',
        entityType
      },
      action: {
        reject: true
      },
      confidence: 0.6
    };
  }

  // Check for single lowercase word pattern
  if (canonical.match(/^[a-z]+$/)) {
    return {
      type: 'entity_type',
      pattern: '^[a-z]+$',
      condition: {
        textPattern: '^[a-z]+$',
        entityType
      },
      action: {
        reject: true
      },
      confidence: 0.7
    };
  }

  return null;
}

/**
 * Extract confidence adjustment pattern
 *
 * Based on correction context, learn to adjust confidence
 */
function extractConfidencePattern(correction: Correction): ExtractedPattern | null {
  // For now, we don't extract confidence patterns
  // This could be expanded based on extraction method, context, etc.
  return null;
}

/**
 * Generate a text pattern from an entity name
 *
 * Tries to generalize specific names into reusable patterns
 */
function generateTextPattern(name: string): string | null {
  // Pattern: "Kingdom of X" → "Kingdom of *"
  if (name.match(/^Kingdom of .+/i)) {
    return '^Kingdom of .+';
  }

  // Pattern: "House of X" or "House X"
  if (name.match(/^House (of )?.+/i)) {
    return '^House (of )?.+';
  }

  // Pattern: "X Empire" or "Empire of X"
  if (name.match(/^.+ Empire$/i) || name.match(/^Empire of .+/i)) {
    return '(.+ Empire$|^Empire of .+)';
  }

  // Pattern: "The X" (definite article)
  if (name.match(/^The .+/i)) {
    return '^The .+';
  }

  // Pattern: "X of Y" (prepositional)
  if (name.match(/^.+ of .+$/i)) {
    return '.+ of .+';
  }

  // No generalizable pattern found
  return null;
}

/**
 * Extract all patterns from a correction
 */
export function extractPatternsFromCorrection(correction: Correction): ExtractedPattern[] {
  const patterns: ExtractedPattern[] = [];

  // Try each extraction function
  const typePattern = extractEntityTypePattern(correction);
  if (typePattern) patterns.push(typePattern);

  const namePattern = extractNamePattern(correction);
  if (namePattern) patterns.push(namePattern);

  const rejectPattern = extractRejectionPattern(correction);
  if (rejectPattern) patterns.push(rejectPattern);

  const confidencePattern = extractConfidencePattern(correction);
  if (confidencePattern) patterns.push(confidencePattern);

  return patterns;
}

/**
 * Convert extracted pattern to LearnedPattern
 */
export function createLearnedPattern(
  extracted: ExtractedPattern,
  correctionId: string
): LearnedPattern {
  return {
    id: uuid(),
    type: extracted.type,
    pattern: extracted.pattern,
    condition: extracted.condition,
    action: extracted.action,
    stats: {
      timesApplied: 0,
      timesValidated: 0,
      timesRejected: 0
    },
    sourceCorrections: [correctionId],
    active: true,
    confidence: extracted.confidence
  };
}

// ============================================================================
// PATTERN APPLICATION
// ============================================================================

/**
 * Check if a pattern matches an entity
 */
function patternMatchesEntity(pattern: LearnedPattern, entity: Entity): boolean {
  // Check text pattern
  if (pattern.condition.textPattern) {
    const regex = new RegExp(pattern.condition.textPattern, 'i');
    if (!regex.test(entity.canonical)) {
      return false;
    }
  }

  // Check entity type condition
  if (pattern.condition.entityType && entity.type !== pattern.condition.entityType) {
    return false;
  }

  return true;
}

/**
 * Apply a pattern to an entity
 */
function applyPatternToEntity(
  pattern: LearnedPattern,
  entity: Entity
): { modified: boolean; entity: Entity; action: string } {
  let modified = false;
  let action = '';
  let result = { ...entity };

  // Apply type change
  if (pattern.action.setType && entity.type !== pattern.action.setType) {
    result.type = pattern.action.setType;
    modified = true;
    action = `type_change:${entity.type}→${pattern.action.setType}`;
  }

  // Apply confidence adjustment
  if (pattern.action.setConfidence !== undefined) {
    result.confidence = pattern.action.setConfidence;
    modified = true;
    action += action ? ',' : '';
    action += `confidence:${pattern.action.setConfidence}`;
  }

  // Apply rejection
  if (pattern.action.reject) {
    (result as any).rejected = true;
    modified = true;
    action = 'rejected';
  }

  // Mark as pattern-modified
  if (modified) {
    result.attrs = {
      ...result.attrs,
      patternModified: true,
      patternId: pattern.id
    };
  }

  return { modified, entity: result, action };
}

/**
 * Apply learned patterns to entities
 */
export function applyPatternsToEntities(
  entities: Entity[],
  patterns: LearnedPattern[]
): PatternApplicationResult {
  const activePatterns = patterns.filter(p => p.active && p.confidence >= 0.5);
  const appliedPatterns: PatternMatch[] = [];
  let entitiesModified = 0;

  const modifiedEntities = entities.map(entity => {
    let currentEntity = entity;

    for (const pattern of activePatterns) {
      if (pattern.type !== 'entity_type' && pattern.type !== 'entity_name') {
        continue;
      }

      if (patternMatchesEntity(pattern, currentEntity)) {
        const result = applyPatternToEntity(pattern, currentEntity);

        if (result.modified) {
          currentEntity = result.entity;
          entitiesModified++;

          appliedPatterns.push({
            pattern,
            targetId: entity.id,
            targetType: 'entity',
            confidence: pattern.confidence,
            actionTaken: result.action
          });

          // Update pattern stats
          pattern.stats.timesApplied++;
          pattern.stats.lastApplied = new Date().toISOString();

          // Only apply one pattern per entity (first match wins)
          break;
        }
      }
    }

    return currentEntity;
  });

  return {
    entities: modifiedEntities,
    relations: [],  // Relations not modified in this pass
    appliedPatterns,
    stats: {
      entitiesModified,
      relationsModified: 0,
      patternsApplied: appliedPatterns.length
    }
  };
}

/**
 * Apply learned patterns to relations
 */
export function applyPatternsToRelations(
  relations: Relation[],
  patterns: LearnedPattern[]
): PatternApplicationResult {
  // For now, relation patterns are not implemented
  // This could match predicate patterns, confidence adjustments, etc.
  return {
    entities: [],
    relations,
    appliedPatterns: [],
    stats: {
      entitiesModified: 0,
      relationsModified: 0,
      patternsApplied: 0
    }
  };
}

// ============================================================================
// PATTERN MANAGEMENT
// ============================================================================

/**
 * Merge similar patterns to avoid duplication
 */
export function mergePatterns(patterns: LearnedPattern[]): LearnedPattern[] {
  const merged: LearnedPattern[] = [];
  const patternsBySignature = new Map<string, LearnedPattern>();

  for (const pattern of patterns) {
    const signature = `${pattern.type}:${pattern.pattern}:${JSON.stringify(pattern.action)}`;

    if (patternsBySignature.has(signature)) {
      // Merge with existing pattern
      const existing = patternsBySignature.get(signature)!;
      existing.sourceCorrections = Array.from(
        new Set([...existing.sourceCorrections, ...pattern.sourceCorrections])
      );
      // Increase confidence if pattern has multiple sources
      existing.confidence = Math.min(
        existing.confidence + 0.05,
        0.95
      );
      // Merge stats
      existing.stats.timesApplied += pattern.stats.timesApplied;
      existing.stats.timesValidated += pattern.stats.timesValidated;
      existing.stats.timesRejected += pattern.stats.timesRejected;
    } else {
      patternsBySignature.set(signature, { ...pattern });
    }
  }

  return Array.from(patternsBySignature.values());
}

/**
 * Update pattern confidence based on feedback
 */
export function updatePatternConfidence(
  pattern: LearnedPattern,
  validated: boolean
): LearnedPattern {
  const updated = { ...pattern };

  if (validated) {
    updated.stats.timesValidated++;
    // Increase confidence for validated patterns
    updated.confidence = Math.min(updated.confidence + 0.05, 0.95);
  } else {
    updated.stats.timesRejected++;
    // Decrease confidence for rejected patterns
    updated.confidence = Math.max(updated.confidence - 0.1, 0.1);

    // Disable pattern if confidence drops too low
    if (updated.confidence < 0.3) {
      updated.active = false;
    }
  }

  return updated;
}

/**
 * Get patterns sorted by confidence
 */
export function getSortedPatterns(patterns: LearnedPattern[]): LearnedPattern[] {
  return [...patterns].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Filter patterns by type
 */
export function getPatternsByType(
  patterns: LearnedPattern[],
  type: LearnedPattern['type']
): LearnedPattern[] {
  return patterns.filter(p => p.type === type);
}

// ============================================================================
// LEARNING ORCHESTRATOR
// ============================================================================

/**
 * Process a batch of corrections and learn patterns
 */
export function learnFromCorrections(
  corrections: Correction[],
  existingPatterns: LearnedPattern[] = []
): LearnedPattern[] {
  const newPatterns: LearnedPattern[] = [];

  for (const correction of corrections) {
    // Skip if already learned from this correction
    if (correction.learned?.patternExtracted) continue;

    const extracted = extractPatternsFromCorrection(correction);

    for (const pattern of extracted) {
      const learned = createLearnedPattern(pattern, correction.id);
      newPatterns.push(learned);
    }
  }

  // Merge with existing patterns
  return mergePatterns([...existingPatterns, ...newPatterns]);
}

/**
 * Apply all learned patterns to a graph
 */
export function applyLearnedPatterns(
  entities: Entity[],
  relations: Relation[],
  patterns: LearnedPattern[]
): PatternApplicationResult {
  // Apply to entities
  const entityResult = applyPatternsToEntities(entities, patterns);

  // Apply to relations
  const relationResult = applyPatternsToRelations(relations, patterns);

  return {
    entities: entityResult.entities,
    relations: relationResult.relations,
    appliedPatterns: [
      ...entityResult.appliedPatterns,
      ...relationResult.appliedPatterns
    ],
    stats: {
      entitiesModified: entityResult.stats.entitiesModified,
      relationsModified: relationResult.stats.relationsModified,
      patternsApplied:
        entityResult.stats.patternsApplied + relationResult.stats.patternsApplied
    }
  };
}

/**
 * Generate a report of pattern learning status
 */
export function generatePatternReport(patterns: LearnedPattern[]): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('LEARNED PATTERN REPORT');
  lines.push('='.repeat(60));
  lines.push('');

  // Summary
  const activePatterns = patterns.filter(p => p.active);
  lines.push(`Total patterns: ${patterns.length}`);
  lines.push(`Active patterns: ${activePatterns.length}`);
  lines.push('');

  // By type
  const byType = new Map<string, LearnedPattern[]>();
  for (const pattern of patterns) {
    const existing = byType.get(pattern.type) || [];
    existing.push(pattern);
    byType.set(pattern.type, existing);
  }

  for (const [type, typePatterns] of Array.from(byType.entries())) {
    lines.push(`## ${type.toUpperCase()}`);
    for (const pattern of typePatterns.slice(0, 5)) {
      lines.push(`  - ${pattern.pattern}`);
      lines.push(`    confidence: ${pattern.confidence.toFixed(2)}`);
      lines.push(`    applied: ${pattern.stats.timesApplied}, validated: ${pattern.stats.timesValidated}`);
      lines.push(`    active: ${pattern.active}`);
    }
    if (typePatterns.length > 5) {
      lines.push(`  ... and ${typePatterns.length - 5} more`);
    }
    lines.push('');
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}
