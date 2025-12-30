/**
 * Extraction Diagnostics - Quality metrics and validation for the IR pipeline.
 *
 * This module provides:
 * - C1: Signal precision validation
 * - C2: Confidence calibration
 * - C3: Extraction metrics and diagnostics
 *
 * CONTRACT:
 * - Diagnostics are read-only - they analyze but don't modify IR
 * - All metrics are deterministic
 * - No external dependencies (works offline)
 *
 * @module ir/extraction-diagnostics
 */

import type {
  ProjectIR,
  Entity,
  EntityId,
  StoryEvent,
  Assertion,
  FactViewRow,
  Confidence,
  EvidenceSpan,
  TimeAnchor,
  Modality,
} from './types';
import { buildFactsFromEvents } from './fact-builder';

// =============================================================================
// C1: SIGNAL PRECISION VALIDATION
// =============================================================================

/**
 * Validation issue found during precision check.
 */
export interface ValidationIssue {
  /** Issue severity */
  severity: 'error' | 'warning' | 'info';

  /** Issue category */
  category: 'entity' | 'event' | 'assertion' | 'fact' | 'consistency';

  /** Human-readable message */
  message: string;

  /** ID of affected object (if applicable) */
  objectId?: string;

  /** Suggested fix (if applicable) */
  suggestion?: string;
}

/**
 * Validation result for an IR.
 */
export interface ValidationResult {
  /** Whether validation passed (no errors) */
  valid: boolean;

  /** Total issues found */
  issueCount: number;

  /** Issues by severity */
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];

  /** Validation timestamp */
  validatedAt: string;
}

/**
 * Validate IR for signal precision issues.
 *
 * Checks for:
 * - Orphan references (entity/event IDs that don't exist)
 * - Missing required fields
 * - Invalid confidence values
 * - Inconsistent temporal data
 * - Duplicate IDs
 *
 * @param ir - The ProjectIR to validate
 * @returns Validation result with issues
 */
export function validateIR(ir: ProjectIR): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Check entity issues
  issues.push(...validateEntities(ir));

  // Check event issues
  issues.push(...validateEvents(ir));

  // Check assertion issues
  issues.push(...validateAssertions(ir));

  // Check consistency issues
  issues.push(...validateConsistency(ir));

  // Separate by severity
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const info = issues.filter((i) => i.severity === 'info');

  return {
    valid: errors.length === 0,
    issueCount: issues.length,
    errors,
    warnings,
    info,
    validatedAt: new Date().toISOString(),
  };
}

/**
 * Validate entities.
 */
function validateEntities(ir: ProjectIR): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();

  for (const entity of ir.entities) {
    // Check for duplicate IDs
    if (seenIds.has(entity.id)) {
      issues.push({
        severity: 'error',
        category: 'entity',
        message: `Duplicate entity ID: ${entity.id}`,
        objectId: entity.id,
        suggestion: 'Merge or rename duplicate entities',
      });
    }
    seenIds.add(entity.id);

    // Check for missing canonical name
    if (!entity.canonical || entity.canonical.trim() === '') {
      issues.push({
        severity: 'error',
        category: 'entity',
        message: `Entity ${entity.id} has no canonical name`,
        objectId: entity.id,
        suggestion: 'Set canonical name from aliases or ID',
      });
    }

    // Check for invalid confidence
    if (!isValidConfidence(entity.confidence)) {
      issues.push({
        severity: 'warning',
        category: 'entity',
        message: `Entity ${entity.id} has invalid confidence values`,
        objectId: entity.id,
        suggestion: 'Recalculate confidence',
      });
    }

    // Check for empty evidence
    if (!entity.evidence || entity.evidence.length === 0) {
      issues.push({
        severity: 'warning',
        category: 'entity',
        message: `Entity ${entity.id} has no evidence`,
        objectId: entity.id,
        suggestion: 'Add evidence spans for entity mentions',
      });
    }

    // Check for low confidence entities
    if (entity.confidence.composite < 0.5) {
      issues.push({
        severity: 'info',
        category: 'entity',
        message: `Entity ${entity.id} has low confidence (${(entity.confidence.composite * 100).toFixed(1)}%)`,
        objectId: entity.id,
      });
    }
  }

  return issues;
}

/**
 * Validate events.
 */
function validateEvents(ir: ProjectIR): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();
  const entityIds = new Set(ir.entities.map((e) => e.id));

  for (const event of ir.events) {
    // Check for duplicate IDs
    if (seenIds.has(event.id)) {
      issues.push({
        severity: 'error',
        category: 'event',
        message: `Duplicate event ID: ${event.id}`,
        objectId: event.id,
      });
    }
    seenIds.add(event.id);

    // Check for orphan participant references
    for (const participant of event.participants) {
      if (!entityIds.has(participant.entity)) {
        issues.push({
          severity: 'error',
          category: 'event',
          message: `Event ${event.id} references non-existent entity: ${participant.entity}`,
          objectId: event.id,
          suggestion: 'Add missing entity or fix reference',
        });
      }
    }

    // Check for orphan location reference
    if (event.location && !entityIds.has(event.location)) {
      issues.push({
        severity: 'warning',
        category: 'event',
        message: `Event ${event.id} references non-existent location: ${event.location}`,
        objectId: event.id,
      });
    }

    // Check for empty derivedFrom (should have provenance)
    if (!event.derivedFrom || event.derivedFrom.length === 0) {
      issues.push({
        severity: 'info',
        category: 'event',
        message: `Event ${event.id} has no derivedFrom provenance`,
        objectId: event.id,
      });
    }

    // Check for empty evidence
    if (!event.evidence || event.evidence.length === 0) {
      issues.push({
        severity: 'warning',
        category: 'event',
        message: `Event ${event.id} has no evidence`,
        objectId: event.id,
      });
    }

    // Check for invalid temporal links
    for (const link of event.links) {
      if (!ir.events.some((e) => e.id === link.target)) {
        issues.push({
          severity: 'warning',
          category: 'event',
          message: `Event ${event.id} has link to non-existent event: ${link.target}`,
          objectId: event.id,
        });
      }
    }
  }

  return issues;
}

/**
 * Validate assertions.
 */
function validateAssertions(ir: ProjectIR): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();
  const entityIds = new Set(ir.entities.map((e) => e.id));

  for (const assertion of ir.assertions) {
    // Check for duplicate IDs
    if (seenIds.has(assertion.id)) {
      issues.push({
        severity: 'error',
        category: 'assertion',
        message: `Duplicate assertion ID: ${assertion.id}`,
        objectId: assertion.id,
      });
    }
    seenIds.add(assertion.id);

    // Check for orphan subject reference
    if (assertion.subject && !entityIds.has(assertion.subject)) {
      issues.push({
        severity: 'warning',
        category: 'assertion',
        message: `Assertion ${assertion.id} references non-existent subject: ${assertion.subject}`,
        objectId: assertion.id,
      });
    }

    // Check for orphan object reference (if it's an entity ID)
    if (
      typeof assertion.object === 'string' &&
      assertion.object.startsWith('entity_') &&
      !entityIds.has(assertion.object)
    ) {
      issues.push({
        severity: 'warning',
        category: 'assertion',
        message: `Assertion ${assertion.id} references non-existent object: ${assertion.object}`,
        objectId: assertion.id,
      });
    }

    // Check for empty evidence
    if (!assertion.evidence || assertion.evidence.length === 0) {
      issues.push({
        severity: 'info',
        category: 'assertion',
        message: `Assertion ${assertion.id} has no evidence`,
        objectId: assertion.id,
      });
    }
  }

  return issues;
}

/**
 * Validate consistency across IR objects.
 */
function validateConsistency(ir: ProjectIR): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for entities with conflicting types in assertions
  const entityTypes = new Map<string, Set<string>>();

  for (const assertion of ir.assertions) {
    if (assertion.predicate === 'is_a' && assertion.subject) {
      if (!entityTypes.has(assertion.subject)) {
        entityTypes.set(assertion.subject, new Set());
      }
      entityTypes.get(assertion.subject)!.add(String(assertion.object));
    }
  }

  for (const [entityId, types] of entityTypes.entries()) {
    if (types.size > 2) {
      issues.push({
        severity: 'warning',
        category: 'consistency',
        message: `Entity ${entityId} has many type assertions: ${Array.from(types).join(', ')}`,
        objectId: entityId,
      });
    }
  }

  // Check for death events followed by other events for same entity
  const deathTimes = new Map<string, number>();
  for (const event of ir.events) {
    if (event.type === 'DEATH') {
      const decedent = event.participants.find((p) => p.role === 'DECEDENT');
      if (decedent) {
        const timeVal = getTimeOrderValue(event.time);
        deathTimes.set(decedent.entity, timeVal);
      }
    }
  }

  for (const event of ir.events) {
    if (event.type === 'DEATH') continue;

    for (const participant of event.participants) {
      const deathTime = deathTimes.get(participant.entity);
      if (deathTime !== undefined) {
        const eventTime = getTimeOrderValue(event.time);
        if (eventTime > deathTime) {
          issues.push({
            severity: 'warning',
            category: 'consistency',
            message: `Entity ${participant.entity} participates in event ${event.id} after death`,
            objectId: event.id,
            suggestion: 'Check temporal ordering or mark as flashback',
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Check if confidence values are valid.
 */
function isValidConfidence(confidence: Confidence): boolean {
  const fields = ['extraction', 'identity', 'semantic', 'temporal', 'composite'];
  for (const field of fields) {
    const value = (confidence as any)[field];
    if (typeof value !== 'number' || value < 0 || value > 1 || isNaN(value)) {
      return false;
    }
  }
  return true;
}

/**
 * Get numeric time value for ordering.
 */
function getTimeOrderValue(time: TimeAnchor): number {
  if (time.type === 'DISCOURSE') {
    return (
      (time.chapter ?? 0) * 100000 +
      (time.paragraph ?? 0) * 1000 +
      (time.sentence ?? 0)
    );
  }
  return -1;
}

// =============================================================================
// C2: CONFIDENCE CALIBRATION
// =============================================================================

/**
 * Confidence distribution statistics.
 */
export interface ConfidenceStats {
  /** Number of objects analyzed */
  count: number;

  /** Mean confidence */
  mean: number;

  /** Median confidence */
  median: number;

  /** Standard deviation */
  stdDev: number;

  /** Min confidence */
  min: number;

  /** Max confidence */
  max: number;

  /** Distribution buckets (0-0.1, 0.1-0.2, ..., 0.9-1.0) */
  buckets: number[];
}

/**
 * Calibration report for IR confidence scores.
 */
export interface CalibrationReport {
  /** Entity confidence stats */
  entities: ConfidenceStats;

  /** Event confidence stats */
  events: ConfidenceStats;

  /** Assertion confidence stats */
  assertions: ConfidenceStats;

  /** Overall calibration score (0-1, higher is better) */
  calibrationScore: number;

  /** Recommendations for calibration */
  recommendations: string[];

  /** Report timestamp */
  reportedAt: string;
}

/**
 * Analyze confidence calibration across the IR.
 *
 * A well-calibrated IR has:
 * - Good spread of confidence values (not all 0.9 or all 0.5)
 * - Higher confidence for objects with more evidence
 * - Consistent confidence across object types
 *
 * @param ir - The ProjectIR to analyze
 * @returns Calibration report
 */
export function analyzeConfidence(ir: ProjectIR): CalibrationReport {
  const entityConfs = ir.entities.map((e) => e.confidence.composite);
  const eventConfs = ir.events.map((e) => e.confidence.composite);
  const assertionConfs = ir.assertions.map((a) => a.confidence.composite);

  const entityStats = computeStats(entityConfs);
  const eventStats = computeStats(eventConfs);
  const assertionStats = computeStats(assertionConfs);

  // Calculate calibration score
  const calibrationScore = computeCalibrationScore(entityStats, eventStats, assertionStats);

  // Generate recommendations
  const recommendations = generateCalibrationRecommendations(
    entityStats,
    eventStats,
    assertionStats
  );

  return {
    entities: entityStats,
    events: eventStats,
    assertions: assertionStats,
    calibrationScore,
    recommendations,
    reportedAt: new Date().toISOString(),
  };
}

/**
 * Compute statistics for a set of confidence values.
 */
function computeStats(values: number[]): ConfidenceStats {
  if (values.length === 0) {
    return {
      count: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      buckets: new Array(10).fill(0),
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  const median = count % 2 === 0
    ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
    : sorted[Math.floor(count / 2)];

  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / count;
  const stdDev = Math.sqrt(variance);

  // Compute buckets
  const buckets = new Array(10).fill(0);
  for (const value of values) {
    const bucket = Math.min(9, Math.floor(value * 10));
    buckets[bucket]++;
  }

  return {
    count,
    mean,
    median,
    stdDev,
    min: sorted[0],
    max: sorted[count - 1],
    buckets,
  };
}

/**
 * Compute overall calibration score.
 */
function computeCalibrationScore(
  entities: ConfidenceStats,
  events: ConfidenceStats,
  assertions: ConfidenceStats
): number {
  // Good calibration indicators:
  // 1. Some spread in confidence (stdDev > 0.1)
  // 2. Not all values clustered at extremes
  // 3. Consistent mean across types

  let score = 1.0;

  // Penalize very low spread (everything same confidence)
  const avgStdDev = (entities.stdDev + events.stdDev + assertions.stdDev) / 3;
  if (avgStdDev < 0.05) {
    score *= 0.7; // Low spread is bad
  } else if (avgStdDev > 0.3) {
    score *= 0.9; // Very high spread might indicate issues
  }

  // Penalize if everything is at extremes
  const totalCount = entities.count + events.count + assertions.count;
  const lowBuckets = entities.buckets[0] + entities.buckets[1] +
    events.buckets[0] + events.buckets[1] +
    assertions.buckets[0] + assertions.buckets[1];
  const highBuckets = entities.buckets[8] + entities.buckets[9] +
    events.buckets[8] + events.buckets[9] +
    assertions.buckets[8] + assertions.buckets[9];

  const extremeRatio = (lowBuckets + highBuckets) / Math.max(1, totalCount);
  if (extremeRatio > 0.8) {
    score *= 0.8; // Too many at extremes
  }

  // Penalize large mean differences between types
  if (entities.count > 0 && events.count > 0) {
    const meanDiff = Math.abs(entities.mean - events.mean);
    if (meanDiff > 0.3) {
      score *= 0.9;
    }
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Generate calibration recommendations.
 */
function generateCalibrationRecommendations(
  entities: ConfidenceStats,
  events: ConfidenceStats,
  assertions: ConfidenceStats
): string[] {
  const recommendations: string[] = [];

  // Check entity confidence
  if (entities.count > 0) {
    if (entities.stdDev < 0.05) {
      recommendations.push('Entity confidence values are too uniform. Consider varying based on evidence quality.');
    }
    if (entities.mean < 0.5) {
      recommendations.push('Average entity confidence is low. Review extraction rules.');
    }
    if (entities.mean > 0.95) {
      recommendations.push('Average entity confidence is very high. May be overconfident.');
    }
  }

  // Check event confidence
  if (events.count > 0) {
    if (events.stdDev < 0.05) {
      recommendations.push('Event confidence values are too uniform.');
    }
    if (events.mean < 0.5) {
      recommendations.push('Average event confidence is low. Review event extraction patterns.');
    }
  }

  // Check assertion confidence
  if (assertions.count > 0) {
    if (assertions.stdDev < 0.05) {
      recommendations.push('Assertion confidence values are too uniform.');
    }
    if (assertions.buckets[9] / Math.max(1, assertions.count) > 0.9) {
      recommendations.push('Nearly all assertions have >0.9 confidence. May be overconfident.');
    }
  }

  // Check cross-type consistency
  if (entities.count > 0 && events.count > 0) {
    if (Math.abs(entities.mean - events.mean) > 0.2) {
      recommendations.push(`Entity (${entities.mean.toFixed(2)}) and event (${events.mean.toFixed(2)}) confidence differ significantly.`);
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('Confidence calibration looks reasonable.');
  }

  return recommendations;
}

/**
 * Recalibrate confidence values based on evidence count.
 *
 * Simple heuristic: more evidence = higher confidence.
 * This is a non-destructive operation that returns adjusted values.
 *
 * @param baseConfidence - The original confidence value
 * @param evidenceCount - Number of evidence spans
 * @param options - Calibration options
 * @returns Adjusted confidence value
 */
export function calibrateConfidence(
  baseConfidence: number,
  evidenceCount: number,
  options?: {
    minEvidenceBoost?: number;
    maxEvidenceBoost?: number;
    evidenceScaling?: number;
  }
): number {
  const minBoost = options?.minEvidenceBoost ?? 0.0;
  const maxBoost = options?.maxEvidenceBoost ?? 0.1;
  const scaling = options?.evidenceScaling ?? 0.5;

  // Calculate boost based on evidence count (diminishing returns)
  const boost = minBoost + (maxBoost - minBoost) * (1 - Math.exp(-evidenceCount * scaling));

  // Apply boost, capping at 1.0
  return Math.min(1.0, baseConfidence + boost);
}

// =============================================================================
// C3: EXTRACTION METRICS
// =============================================================================

/**
 * Extraction metrics for an IR.
 */
export interface ExtractionMetrics {
  /** Entity metrics */
  entities: {
    total: number;
    byType: Record<string, number>;
    avgConfidence: number;
    avgAliases: number;
    avgEvidence: number;
  };

  /** Event metrics */
  events: {
    total: number;
    byType: Record<string, number>;
    avgConfidence: number;
    avgParticipants: number;
    avgEvidence: number;
    withLinks: number;
  };

  /** Assertion metrics */
  assertions: {
    total: number;
    byPredicate: Record<string, number>;
    byModality: Record<string, number>;
    avgConfidence: number;
  };

  /** Fact metrics (if computed) */
  facts: {
    total: number;
    byPredicate: Record<string, number>;
    derivedFromEvents: number;
    derivedFromAssertions: number;
  };

  /** Coverage metrics */
  coverage: {
    documentsProcessed: number;
    totalCharacters: number;
    entitiesPerKChar: number;
    eventsPerKChar: number;
  };

  /** Performance metrics */
  performance: {
    extractionRate?: number; // chars/second if available
  };

  /** Report timestamp */
  computedAt: string;
}

/**
 * Compute extraction metrics for an IR.
 *
 * @param ir - The ProjectIR to analyze
 * @returns Extraction metrics
 */
export function computeMetrics(ir: ProjectIR): ExtractionMetrics {
  // Entity metrics
  const entityByType: Record<string, number> = {};
  let totalEntityAliases = 0;
  let totalEntityEvidence = 0;
  let totalEntityConfidence = 0;

  for (const entity of ir.entities) {
    entityByType[entity.type] = (entityByType[entity.type] || 0) + 1;
    totalEntityAliases += entity.aliases.length;
    totalEntityEvidence += entity.evidence.length;
    totalEntityConfidence += entity.confidence.composite;
  }

  // Event metrics
  const eventByType: Record<string, number> = {};
  let totalEventParticipants = 0;
  let totalEventEvidence = 0;
  let totalEventConfidence = 0;
  let eventsWithLinks = 0;

  for (const event of ir.events) {
    eventByType[event.type] = (eventByType[event.type] || 0) + 1;
    totalEventParticipants += event.participants.length;
    totalEventEvidence += event.evidence.length;
    totalEventConfidence += event.confidence.composite;
    if (event.links.length > 0) eventsWithLinks++;
  }

  // Assertion metrics
  const assertionByPredicate: Record<string, number> = {};
  const assertionByModality: Record<string, number> = {};
  let totalAssertionConfidence = 0;

  for (const assertion of ir.assertions) {
    if (assertion.predicate) {
      assertionByPredicate[assertion.predicate] =
        (assertionByPredicate[assertion.predicate] || 0) + 1;
    }
    assertionByModality[assertion.modality] =
      (assertionByModality[assertion.modality] || 0) + 1;
    totalAssertionConfidence += assertion.confidence.composite;
  }

  // Fact metrics
  const facts = buildFactsFromEvents(ir.events, ir.assertions);
  const factByPredicate: Record<string, number> = {};
  let factsFromEvents = 0;
  let factsFromAssertions = 0;

  for (const fact of facts) {
    factByPredicate[fact.predicate] = (factByPredicate[fact.predicate] || 0) + 1;

    // Check derivation source
    for (const sourceId of fact.derivedFrom) {
      if (sourceId.startsWith('event_')) {
        factsFromEvents++;
        break;
      } else if (sourceId.startsWith('assertion_')) {
        factsFromAssertions++;
        break;
      }
    }
  }

  // Coverage metrics
  const documents = new Set<string>();
  let totalChars = 0;

  for (const entity of ir.entities) {
    for (const ev of entity.evidence) {
      documents.add(ev.docId);
      totalChars = Math.max(totalChars, ev.charEnd);
    }
  }
  for (const event of ir.events) {
    for (const ev of event.evidence) {
      documents.add(ev.docId);
      totalChars = Math.max(totalChars, ev.charEnd);
    }
  }

  const kChars = totalChars / 1000;

  return {
    entities: {
      total: ir.entities.length,
      byType: entityByType,
      avgConfidence: ir.entities.length > 0 ? totalEntityConfidence / ir.entities.length : 0,
      avgAliases: ir.entities.length > 0 ? totalEntityAliases / ir.entities.length : 0,
      avgEvidence: ir.entities.length > 0 ? totalEntityEvidence / ir.entities.length : 0,
    },
    events: {
      total: ir.events.length,
      byType: eventByType,
      avgConfidence: ir.events.length > 0 ? totalEventConfidence / ir.events.length : 0,
      avgParticipants: ir.events.length > 0 ? totalEventParticipants / ir.events.length : 0,
      avgEvidence: ir.events.length > 0 ? totalEventEvidence / ir.events.length : 0,
      withLinks: eventsWithLinks,
    },
    assertions: {
      total: ir.assertions.length,
      byPredicate: assertionByPredicate,
      byModality: assertionByModality,
      avgConfidence: ir.assertions.length > 0 ? totalAssertionConfidence / ir.assertions.length : 0,
    },
    facts: {
      total: facts.length,
      byPredicate: factByPredicate,
      derivedFromEvents: factsFromEvents,
      derivedFromAssertions: factsFromAssertions,
    },
    coverage: {
      documentsProcessed: documents.size,
      totalCharacters: totalChars,
      entitiesPerKChar: kChars > 0 ? ir.entities.length / kChars : 0,
      eventsPerKChar: kChars > 0 ? ir.events.length / kChars : 0,
    },
    performance: {},
    computedAt: new Date().toISOString(),
  };
}

/**
 * Format metrics as a human-readable report.
 *
 * @param metrics - The metrics to format
 * @returns Markdown-formatted report
 */
export function formatMetricsReport(metrics: ExtractionMetrics): string {
  const lines: string[] = [];

  lines.push('# Extraction Metrics Report');
  lines.push('');
  lines.push(`Generated: ${metrics.computedAt}`);
  lines.push('');

  // Entity section
  lines.push('## Entities');
  lines.push('');
  lines.push(`- **Total:** ${metrics.entities.total}`);
  lines.push(`- **Avg confidence:** ${(metrics.entities.avgConfidence * 100).toFixed(1)}%`);
  lines.push(`- **Avg aliases:** ${metrics.entities.avgAliases.toFixed(1)}`);
  lines.push(`- **Avg evidence spans:** ${metrics.entities.avgEvidence.toFixed(1)}`);
  lines.push('');
  lines.push('### By Type');
  for (const [type, count] of Object.entries(metrics.entities.byType).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${type}: ${count}`);
  }
  lines.push('');

  // Event section
  lines.push('## Events');
  lines.push('');
  lines.push(`- **Total:** ${metrics.events.total}`);
  lines.push(`- **Avg confidence:** ${(metrics.events.avgConfidence * 100).toFixed(1)}%`);
  lines.push(`- **Avg participants:** ${metrics.events.avgParticipants.toFixed(1)}`);
  lines.push(`- **With temporal links:** ${metrics.events.withLinks}`);
  lines.push('');
  lines.push('### By Type');
  for (const [type, count] of Object.entries(metrics.events.byType).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${type}: ${count}`);
  }
  lines.push('');

  // Assertion section
  lines.push('## Assertions');
  lines.push('');
  lines.push(`- **Total:** ${metrics.assertions.total}`);
  lines.push(`- **Avg confidence:** ${(metrics.assertions.avgConfidence * 100).toFixed(1)}%`);
  lines.push('');
  lines.push('### By Modality');
  for (const [modality, count] of Object.entries(metrics.assertions.byModality).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${modality}: ${count}`);
  }
  lines.push('');
  lines.push('### Top Predicates');
  const topPredicates = Object.entries(metrics.assertions.byPredicate)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [pred, count] of topPredicates) {
    lines.push(`- ${pred}: ${count}`);
  }
  lines.push('');

  // Fact section
  lines.push('## Facts (Derived)');
  lines.push('');
  lines.push(`- **Total:** ${metrics.facts.total}`);
  lines.push(`- **From events:** ${metrics.facts.derivedFromEvents}`);
  lines.push(`- **From assertions:** ${metrics.facts.derivedFromAssertions}`);
  lines.push('');

  // Coverage section
  lines.push('## Coverage');
  lines.push('');
  lines.push(`- **Documents:** ${metrics.coverage.documentsProcessed}`);
  lines.push(`- **Total characters:** ${metrics.coverage.totalCharacters.toLocaleString()}`);
  lines.push(`- **Entities per 1K chars:** ${metrics.coverage.entitiesPerKChar.toFixed(2)}`);
  lines.push(`- **Events per 1K chars:** ${metrics.coverage.eventsPerKChar.toFixed(2)}`);

  return lines.join('\n');
}

/**
 * Compare two sets of metrics to track progress.
 *
 * @param before - Previous metrics
 * @param after - Current metrics
 * @returns Comparison report
 */
export function compareMetrics(
  before: ExtractionMetrics,
  after: ExtractionMetrics
): {
  entityDelta: number;
  eventDelta: number;
  assertionDelta: number;
  factDelta: number;
  confidenceDelta: {
    entities: number;
    events: number;
    assertions: number;
  };
  summary: string;
} {
  const entityDelta = after.entities.total - before.entities.total;
  const eventDelta = after.events.total - before.events.total;
  const assertionDelta = after.assertions.total - before.assertions.total;
  const factDelta = after.facts.total - before.facts.total;

  const confidenceDelta = {
    entities: after.entities.avgConfidence - before.entities.avgConfidence,
    events: after.events.avgConfidence - before.events.avgConfidence,
    assertions: after.assertions.avgConfidence - before.assertions.avgConfidence,
  };

  const formatDelta = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

  const summary = [
    `Entities: ${formatDelta(entityDelta)} (${before.entities.total} → ${after.entities.total})`,
    `Events: ${formatDelta(eventDelta)} (${before.events.total} → ${after.events.total})`,
    `Assertions: ${formatDelta(assertionDelta)}`,
    `Facts: ${formatDelta(factDelta)}`,
  ].join('\n');

  return {
    entityDelta,
    eventDelta,
    assertionDelta,
    factDelta,
    confidenceDelta,
    summary,
  };
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

/**
 * Quick health check for an IR.
 *
 * Returns true if IR has basic structure and no critical errors.
 */
export function isHealthy(ir: ProjectIR): boolean {
  const validation = validateIR(ir);
  return validation.valid;
}

/**
 * Get a summary string for an IR.
 */
export function getSummary(ir: ProjectIR): string {
  const metrics = computeMetrics(ir);
  return `IR: ${metrics.entities.total} entities, ${metrics.events.total} events, ${metrics.assertions.total} assertions, ${metrics.facts.total} facts`;
}
