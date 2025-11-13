/**
 * Confidence Scoring Validation Utilities
 *
 * Provides specialized utilities for validating entity extraction
 * confidence scores, ensuring they meet quality thresholds and
 * correlate with extraction accuracy.
 */

import type { Entity } from '../../app/engine/schema';
import type { TestEntity } from './test-utils';
import { findMatchingEntity } from './test-utils';

export interface ConfidenceThresholds {
  minimum: number;
  high: number;
  medium: number;
  low: number;
}

export const DEFAULT_THRESHOLDS: ConfidenceThresholds = {
  minimum: 0.5,
  high: 0.9,
  medium: 0.7,
  low: 0.5,
};

export interface ConfidenceDistribution {
  high: number;
  medium: number;
  low: number;
  belowMinimum: number;
  average: number;
  median: number;
  stdDev: number;
}

/**
 * Analyze confidence score distribution across entities
 */
export function analyzeConfidenceDistribution(
  entities: Entity[],
  thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS
): ConfidenceDistribution {
  const scores = entities
    .map(e => e.confidence)
    .filter((c): c is number => typeof c === 'number')
    .sort((a, b) => a - b);

  if (scores.length === 0) {
    return {
      high: 0,
      medium: 0,
      low: 0,
      belowMinimum: 0,
      average: 0,
      median: 0,
      stdDev: 0,
    };
  }

  const high = scores.filter(s => s >= thresholds.high).length;
  const medium = scores.filter(s => s >= thresholds.medium && s < thresholds.high).length;
  const low = scores.filter(s => s >= thresholds.low && s < thresholds.medium).length;
  const belowMinimum = scores.filter(s => s < thresholds.minimum).length;

  const average = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const median = scores[Math.floor(scores.length / 2)];

  // Calculate standard deviation
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - average, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  return {
    high,
    medium,
    low,
    belowMinimum,
    average,
    median,
    stdDev,
  };
}

/**
 * Check if confidence scores correlate with extraction accuracy
 */
export function validateConfidenceCorrelation(
  expected: TestEntity[],
  extracted: Entity[]
): {
  valid: boolean;
  correctHighConfidence: number;
  incorrectHighConfidence: number;
  correctLowConfidence: number;
  incorrectLowConfidence: number;
  correlation: number;
} {
  const highThreshold = DEFAULT_THRESHOLDS.high;
  let correctHighConf = 0;
  let incorrectHighConf = 0;
  let correctLowConf = 0;
  let incorrectLowConf = 0;

  for (const entity of extracted) {
    const isCorrect = findMatchingEntity(
      {
        text: entity.canonical,
        type: entity.type,
        confidence: 0,
      },
      expected.map(e => ({
        id: '',
        canonical: e.text,
        type: e.type,
        confidence: e.confidence,
        aliases: e.aliases || [],
      }))
    ) !== undefined;

    const isHighConf = entity.confidence >= highThreshold;

    if (isCorrect && isHighConf) correctHighConf++;
    else if (!isCorrect && isHighConf) incorrectHighConf++;
    else if (isCorrect && !isHighConf) correctLowConf++;
    else if (!isCorrect && !isHighConf) incorrectLowConf++;
  }

  // Calculate correlation: high confidence should correlate with correctness
  const totalHigh = correctHighConf + incorrectHighConf;
  const totalLow = correctLowConf + incorrectLowConf;

  const highConfAccuracy = totalHigh > 0 ? correctHighConf / totalHigh : 0;
  const lowConfAccuracy = totalLow > 0 ? correctLowConf / totalLow : 0;

  // Correlation is the difference - should be positive and significant
  const correlation = highConfAccuracy - lowConfAccuracy;

  return {
    valid: correlation >= 0.1, // At least 10% better accuracy for high confidence
    correctHighConfidence: correctHighConf,
    incorrectHighConfidence: incorrectHighConf,
    correctLowConfidence: correctLowConf,
    incorrectLowConfidence: incorrectLowConf,
    correlation,
  };
}

/**
 * Validate confidence calibration (predicted confidence vs actual accuracy)
 */
export function validateConfidenceCalibration(
  expected: TestEntity[],
  extracted: Entity[],
  bins: number = 10
): {
  valid: boolean;
  calibrationError: number;
  bins: Array<{
    minConf: number;
    maxConf: number;
    avgConf: number;
    accuracy: number;
    count: number;
  }>;
} {
  // Create bins
  const binSize = 1.0 / bins;
  const binData: Array<{
    minConf: number;
    maxConf: number;
    confidences: number[];
    correct: number;
    total: number;
  }> = [];

  for (let i = 0; i < bins; i++) {
    binData.push({
      minConf: i * binSize,
      maxConf: (i + 1) * binSize,
      confidences: [],
      correct: 0,
      total: 0,
    });
  }

  // Assign entities to bins
  for (const entity of extracted) {
    const binIndex = Math.min(
      Math.floor(entity.confidence * bins),
      bins - 1
    );

    const isCorrect = findMatchingEntity(
      {
        text: entity.canonical,
        type: entity.type,
        confidence: 0,
      },
      expected.map(e => ({
        id: '',
        canonical: e.text,
        type: e.type,
        confidence: e.confidence,
        aliases: e.aliases || [],
      }))
    ) !== undefined;

    binData[binIndex].confidences.push(entity.confidence);
    binData[binIndex].total++;
    if (isCorrect) binData[binIndex].correct++;
  }

  // Calculate calibration error (ECE - Expected Calibration Error)
  let totalError = 0;
  let totalCount = 0;

  const binResults = binData.map(bin => {
    const avgConf = bin.confidences.length > 0
      ? bin.confidences.reduce((sum, c) => sum + c, 0) / bin.confidences.length
      : (bin.minConf + bin.maxConf) / 2;

    const accuracy = bin.total > 0 ? bin.correct / bin.total : 0;

    // Calibration error for this bin
    const error = Math.abs(avgConf - accuracy) * bin.total;
    totalError += error;
    totalCount += bin.total;

    return {
      minConf: bin.minConf,
      maxConf: bin.maxConf,
      avgConf,
      accuracy,
      count: bin.total,
    };
  });

  const calibrationError = totalCount > 0 ? totalError / totalCount : 0;

  return {
    valid: calibrationError < 0.15, // Calibration error should be < 15%
    calibrationError,
    bins: binResults,
  };
}

/**
 * Detect potential confidence scoring issues
 */
export interface ConfidenceIssue {
  type: 'too-uniform' | 'too-high' | 'too-low' | 'poor-correlation' | 'poor-calibration';
  severity: 'error' | 'warning' | 'info';
  message: string;
  details?: any;
}

export function detectConfidenceIssues(
  expected: TestEntity[],
  extracted: Entity[],
  thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS
): ConfidenceIssue[] {
  const issues: ConfidenceIssue[] = [];
  const distribution = analyzeConfidenceDistribution(extracted, thresholds);

  // Check for uniform confidence (all entities have similar scores)
  if (distribution.stdDev < 0.05 && extracted.length > 5) {
    issues.push({
      type: 'too-uniform',
      severity: 'warning',
      message: `Confidence scores are too uniform (stdDev: ${distribution.stdDev.toFixed(3)}). Scores should vary based on extraction certainty.`,
      details: { stdDev: distribution.stdDev, average: distribution.average },
    });
  }

  // Check for unrealistically high confidence
  if (distribution.average > 0.95 && extracted.length > 5) {
    issues.push({
      type: 'too-high',
      severity: 'warning',
      message: `Average confidence is unrealistically high (${(distribution.average * 100).toFixed(1)}%). Consider more conservative scoring.`,
      details: { average: distribution.average },
    });
  }

  // Check for too many low confidence entities
  if (distribution.belowMinimum / extracted.length > 0.3) {
    issues.push({
      type: 'too-low',
      severity: 'warning',
      message: `${((distribution.belowMinimum / extracted.length) * 100).toFixed(1)}% of entities below minimum confidence threshold. Consider filtering or improving extraction.`,
      details: {
        belowMinimum: distribution.belowMinimum,
        total: extracted.length,
        percentage: (distribution.belowMinimum / extracted.length) * 100,
      },
    });
  }

  // Check correlation with correctness
  const correlation = validateConfidenceCorrelation(expected, extracted);
  if (!correlation.valid) {
    issues.push({
      type: 'poor-correlation',
      severity: 'error',
      message: `Confidence scores don't correlate well with correctness (correlation: ${(correlation.correlation * 100).toFixed(1)}%). High-confidence entities should be more accurate.`,
      details: correlation,
    });
  }

  // Check calibration
  const calibration = validateConfidenceCalibration(expected, extracted);
  if (!calibration.valid) {
    issues.push({
      type: 'poor-calibration',
      severity: 'warning',
      message: `Confidence scores are poorly calibrated (error: ${(calibration.calibrationError * 100).toFixed(1)}%). Predicted confidence doesn't match actual accuracy.`,
      details: { calibrationError: calibration.calibrationError },
    });
  }

  return issues;
}

/**
 * Generate confidence analysis report
 */
export function generateConfidenceReport(
  expected: TestEntity[],
  extracted: Entity[],
  thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS
): string {
  const distribution = analyzeConfidenceDistribution(extracted, thresholds);
  const correlation = validateConfidenceCorrelation(expected, extracted);
  const calibration = validateConfidenceCalibration(expected, extracted);
  const issues = detectConfidenceIssues(expected, extracted, thresholds);

  const lines: string[] = [
    'Confidence Analysis Report',
    '=========================',
    '',
    'Distribution:',
    `  High Confidence (≥${thresholds.high}):     ${distribution.high} entities`,
    `  Medium Confidence (≥${thresholds.medium}): ${distribution.medium} entities`,
    `  Low Confidence (≥${thresholds.low}):       ${distribution.low} entities`,
    `  Below Minimum (<${thresholds.minimum}):    ${distribution.belowMinimum} entities`,
    '',
    `  Average:  ${distribution.average.toFixed(3)}`,
    `  Median:   ${distribution.median.toFixed(3)}`,
    `  Std Dev:  ${distribution.stdDev.toFixed(3)}`,
    '',
    'Correlation with Correctness:',
    `  High Confidence Correct:   ${correlation.correctHighConfidence}`,
    `  High Confidence Incorrect: ${correlation.incorrectHighConfidence}`,
    `  Low Confidence Correct:    ${correlation.correctLowConfidence}`,
    `  Low Confidence Incorrect:  ${correlation.incorrectLowConfidence}`,
    `  Correlation Score:         ${(correlation.correlation * 100).toFixed(1)}% ${correlation.valid ? '✅' : '❌'}`,
    '',
    'Calibration:',
    `  Calibration Error: ${(calibration.calibrationError * 100).toFixed(1)}% ${calibration.valid ? '✅' : '❌'}`,
  ];

  if (issues.length > 0) {
    lines.push('');
    lines.push('Issues Detected:');
    for (const issue of issues) {
      const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      lines.push(`  ${icon} [${issue.type}] ${issue.message}`);
    }
  } else {
    lines.push('');
    lines.push('✅ No confidence issues detected');
  }

  return lines.join('\n');
}

/**
 * Filter entities by confidence threshold
 */
export function filterByConfidence(
  entities: Entity[],
  minimumConfidence: number
): Entity[] {
  return entities.filter(e => e.confidence >= minimumConfidence);
}

/**
 * Rank entities by confidence
 */
export function rankByConfidence(entities: Entity[]): Entity[] {
  return [...entities].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get confidence percentile for an entity
 */
export function getConfidencePercentile(
  entity: Entity,
  allEntities: Entity[]
): number {
  const scores = allEntities
    .map(e => e.confidence)
    .filter((c): c is number => typeof c === 'number')
    .sort((a, b) => a - b);

  if (scores.length === 0) return 0;

  const rank = scores.filter(s => s < entity.confidence).length;
  return (rank / scores.length) * 100;
}
