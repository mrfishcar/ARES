/**
 * Entity Extraction Test Utilities
 *
 * Comprehensive utilities for validating entity extraction quality,
 * including precision/recall metrics, confidence scoring, alias resolution,
 * and entity type validation.
 */

import type { Entity, EntityType } from '../../app/engine/schema';

export interface TestEntity {
  type: EntityType;
  text: string;
  aliases?: string[];
  context?: string;
  confidence: number;
}

export interface ExtractionMetrics {
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

export interface DetailedComparison {
  matched: Array<{ expected: TestEntity; actual: Entity }>;
  missing: TestEntity[];
  unexpected: Entity[];
}

/**
 * Normalize entity text for comparison (lowercase, trim whitespace)
 */
export function normalizeEntityText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Check if two entity types match, considering type hierarchies
 */
export function entityTypesMatch(expected: EntityType, actual: EntityType): boolean {
  // Exact match
  if (expected === actual) return true;

  // Allow some type flexibility for common variations
  const typeEquivalences: Record<string, Set<string>> = {
    'PERSON': new Set(['PERSON']),
    'PLACE': new Set(['PLACE', 'GPE', 'LOC']),
    'ORG': new Set(['ORG', 'ORGANIZATION']),
    'DATE': new Set(['DATE', 'TIME']),
    'LOCATION': new Set(['LOCATION', 'PLACE', 'GPE', 'LOC']),
  };

  const expectedSet = typeEquivalences[expected] || new Set([expected]);
  return expectedSet.has(actual);
}

/**
 * Find matching entity in extracted results
 */
export function findMatchingEntity(
  expected: TestEntity,
  extracted: Entity[]
): Entity | undefined {
  const normalizedExpected = normalizeEntityText(expected.text);

  return extracted.find(entity => {
    // Check if types match
    if (!entityTypesMatch(expected.type, entity.type)) {
      return false;
    }

    // Check canonical name
    const normalizedCanonical = normalizeEntityText(entity.canonical);
    if (normalizedCanonical === normalizedExpected) {
      return true;
    }

    // Check aliases
    if (entity.aliases) {
      for (const alias of entity.aliases) {
        if (normalizeEntityText(alias) === normalizedExpected) {
          return true;
        }
      }
    }

    // Check if expected entity's aliases match actual canonical
    if (expected.aliases) {
      for (const expectedAlias of expected.aliases) {
        if (normalizeEntityText(expectedAlias) === normalizedCanonical) {
          return true;
        }
      }
    }

    return false;
  });
}

/**
 * Compare expected and extracted entities with detailed matching
 */
export function compareEntities(
  expected: TestEntity[],
  extracted: Entity[]
): DetailedComparison {
  const matched: Array<{ expected: TestEntity; actual: Entity }> = [];
  const missing: TestEntity[] = [];
  const usedExtractedIds = new Set<string>();

  // Find matches for expected entities
  for (const exp of expected) {
    const match = findMatchingEntity(exp, extracted);
    if (match && !usedExtractedIds.has(match.id)) {
      matched.push({ expected: exp, actual: match });
      usedExtractedIds.add(match.id);
    } else {
      missing.push(exp);
    }
  }

  // Find unexpected entities
  const unexpected = extracted.filter(e => !usedExtractedIds.has(e.id));

  return { matched, missing, unexpected };
}

/**
 * Calculate precision, recall, and F1 score
 */
export function calculateMetrics(
  expected: TestEntity[],
  extracted: Entity[]
): ExtractionMetrics {
  const comparison = compareEntities(expected, extracted);

  const truePositives = comparison.matched.length;
  const falsePositives = comparison.unexpected.length;
  const falseNegatives = comparison.missing.length;

  const precision = truePositives + falsePositives > 0
    ? truePositives / (truePositives + falsePositives)
    : 0;

  const recall = truePositives + falseNegatives > 0
    ? truePositives / (truePositives + falseNegatives)
    : 0;

  const f1 = precision + recall > 0
    ? (2 * precision * recall) / (precision + recall)
    : 0;

  return {
    precision,
    recall,
    f1,
    truePositives,
    falsePositives,
    falseNegatives,
  };
}

/**
 * Validate entity confidence scores
 */
export function validateConfidence(
  entity: Entity,
  minimumConfidence: number
): { valid: boolean; message?: string } {
  if (entity.confidence === undefined || entity.confidence === null) {
    return {
      valid: false,
      message: `Entity "${entity.canonical}" missing confidence score`,
    };
  }

  if (entity.confidence < 0 || entity.confidence > 1) {
    return {
      valid: false,
      message: `Entity "${entity.canonical}" has invalid confidence: ${entity.confidence} (must be 0-1)`,
    };
  }

  if (entity.confidence < minimumConfidence) {
    return {
      valid: false,
      message: `Entity "${entity.canonical}" confidence ${entity.confidence} below minimum ${minimumConfidence}`,
    };
  }

  return { valid: true };
}

/**
 * Validate alias resolution
 */
export function validateAliases(
  expected: TestEntity,
  actual: Entity
): { valid: boolean; message?: string } {
  if (!expected.aliases || expected.aliases.length === 0) {
    return { valid: true };
  }

  const actualAliases = new Set(
    (actual.aliases || []).map(a => normalizeEntityText(a))
  );
  const canonicalNormalized = normalizeEntityText(actual.canonical);

  const missingAliases: string[] = [];
  for (const expectedAlias of expected.aliases) {
    const normalized = normalizeEntityText(expectedAlias);
    if (!actualAliases.has(normalized) && canonicalNormalized !== normalized) {
      missingAliases.push(expectedAlias);
    }
  }

  if (missingAliases.length > 0) {
    return {
      valid: false,
      message: `Entity "${actual.canonical}" missing expected aliases: ${missingAliases.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Validate entity type correctness
 */
export function validateEntityType(
  entity: Entity,
  validTypes: EntityType[]
): { valid: boolean; message?: string } {
  if (!validTypes.includes(entity.type)) {
    return {
      valid: false,
      message: `Entity "${entity.canonical}" has invalid type: ${entity.type} (expected one of: ${validTypes.join(', ')})`,
    };
  }

  return { valid: true };
}

/**
 * Format extraction metrics for display
 */
export function formatMetrics(metrics: ExtractionMetrics): string {
  return `
Precision: ${(metrics.precision * 100).toFixed(1)}%
Recall:    ${(metrics.recall * 100).toFixed(1)}%
F1 Score:  ${(metrics.f1 * 100).toFixed(1)}%

True Positives:  ${metrics.truePositives}
False Positives: ${metrics.falsePositives}
False Negatives: ${metrics.falseNegatives}
  `.trim();
}

/**
 * Format detailed comparison for debugging
 */
export function formatComparison(comparison: DetailedComparison): string {
  const lines: string[] = [];

  if (comparison.matched.length > 0) {
    lines.push('✅ Matched Entities:');
    for (const { expected, actual } of comparison.matched) {
      lines.push(`  - ${expected.text} (${expected.type}) → ${actual.canonical}`);
    }
  }

  if (comparison.missing.length > 0) {
    lines.push('\n❌ Missing Entities:');
    for (const entity of comparison.missing) {
      lines.push(`  - ${entity.text} (${entity.type})`);
    }
  }

  if (comparison.unexpected.length > 0) {
    lines.push('\n⚠️  Unexpected Entities:');
    for (const entity of comparison.unexpected) {
      lines.push(`  - ${entity.canonical} (${entity.type})`);
    }
  }

  return lines.join('\n');
}

/**
 * Aggregate metrics across multiple test cases
 */
export function aggregateMetrics(
  metrics: ExtractionMetrics[]
): ExtractionMetrics {
  if (metrics.length === 0) {
    return {
      precision: 0,
      recall: 0,
      f1: 0,
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
    };
  }

  const totalTP = metrics.reduce((sum, m) => sum + m.truePositives, 0);
  const totalFP = metrics.reduce((sum, m) => sum + m.falsePositives, 0);
  const totalFN = metrics.reduce((sum, m) => sum + m.falseNegatives, 0);

  const precision = totalTP + totalFP > 0
    ? totalTP / (totalTP + totalFP)
    : 0;

  const recall = totalTP + totalFN > 0
    ? totalTP / (totalTP + totalFN)
    : 0;

  const f1 = precision + recall > 0
    ? (2 * precision * recall) / (precision + recall)
    : 0;

  return {
    precision,
    recall,
    f1,
    truePositives: totalTP,
    falsePositives: totalFP,
    falseNegatives: totalFN,
  };
}

/**
 * Check if metrics meet minimum thresholds
 */
export function meetsThresholds(
  metrics: ExtractionMetrics,
  thresholds: { precision?: number; recall?: number; f1?: number }
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  if (thresholds.precision !== undefined && metrics.precision < thresholds.precision) {
    failures.push(
      `Precision ${(metrics.precision * 100).toFixed(1)}% below threshold ${(thresholds.precision * 100).toFixed(1)}%`
    );
  }

  if (thresholds.recall !== undefined && metrics.recall < thresholds.recall) {
    failures.push(
      `Recall ${(metrics.recall * 100).toFixed(1)}% below threshold ${(thresholds.recall * 100).toFixed(1)}%`
    );
  }

  if (thresholds.f1 !== undefined && metrics.f1 < thresholds.f1) {
    failures.push(
      `F1 Score ${(metrics.f1 * 100).toFixed(1)}% below threshold ${(thresholds.f1 * 100).toFixed(1)}%`
    );
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

/**
 * Validate context information is present and meaningful
 */
export function validateContext(
  entity: Entity,
  minContextLength: number = 5
): { valid: boolean; message?: string } {
  if (!entity.context || entity.context.trim().length === 0) {
    return {
      valid: false,
      message: `Entity "${entity.canonical}" missing context information`,
    };
  }

  if (entity.context.trim().length < minContextLength) {
    return {
      valid: false,
      message: `Entity "${entity.canonical}" context too short: "${entity.context}"`,
    };
  }

  return { valid: true };
}

/**
 * Generate a summary report for a test case
 */
export function generateTestReport(
  testId: string,
  text: string,
  expected: TestEntity[],
  extracted: Entity[],
  includeContext: boolean = false
): string {
  const metrics = calculateMetrics(expected, extracted);
  const comparison = compareEntities(expected, extracted);

  const lines: string[] = [
    `Test Case: ${testId}`,
    `Text Length: ${text.length} characters`,
    '',
    'Metrics:',
    formatMetrics(metrics),
    '',
    'Entity Analysis:',
    formatComparison(comparison),
  ];

  if (includeContext) {
    lines.push('');
    lines.push('Context Validation:');
    for (const entity of extracted) {
      const contextCheck = validateContext(entity);
      if (!contextCheck.valid) {
        lines.push(`  ⚠️  ${contextCheck.message}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Validate entity extraction for specific patterns
 */
export interface EntityPattern {
  name: string;
  description: string;
  validate: (entities: Entity[], text: string) => { valid: boolean; message?: string };
}

/**
 * Create standard entity patterns for validation
 */
export const standardPatterns: EntityPattern[] = [
  {
    name: 'no-duplicate-canonicals',
    description: 'Entity canonical names should be unique',
    validate: (entities) => {
      const canonicals = new Map<string, Entity[]>();
      for (const entity of entities) {
        const key = `${entity.type}::${normalizeEntityText(entity.canonical)}`;
        if (!canonicals.has(key)) {
          canonicals.set(key, []);
        }
        canonicals.get(key)!.push(entity);
      }

      const duplicates = Array.from(canonicals.entries())
        .filter(([_, entities]) => entities.length > 1);

      if (duplicates.length > 0) {
        const dupeList = duplicates
          .map(([key, entities]) => `${key} (${entities.length} times)`)
          .join(', ');
        return {
          valid: false,
          message: `Duplicate canonical entities found: ${dupeList}`,
        };
      }

      return { valid: true };
    },
  },
  {
    name: 'valid-confidence-range',
    description: 'All entities should have confidence scores between 0 and 1',
    validate: (entities) => {
      const invalid = entities.filter(
        e => e.confidence === undefined ||
             e.confidence < 0 ||
             e.confidence > 1
      );

      if (invalid.length > 0) {
        const invalidList = invalid
          .map(e => `${e.canonical} (${e.confidence})`)
          .join(', ');
        return {
          valid: false,
          message: `Entities with invalid confidence: ${invalidList}`,
        };
      }

      return { valid: true };
    },
  },
  {
    name: 'no-empty-names',
    description: 'Entity names should not be empty',
    validate: (entities) => {
      const empty = entities.filter(
        e => !e.canonical || e.canonical.trim().length === 0
      );

      if (empty.length > 0) {
        return {
          valid: false,
          message: `Found ${empty.length} entities with empty canonical names`,
        };
      }

      return { valid: true };
    },
  },
  {
    name: 'valid-entity-types',
    description: 'All entities should have recognized types',
    validate: (entities) => {
      const validTypes = new Set([
        'PERSON', 'PLACE', 'ORG', 'DATE', 'HOUSE', 'ITEM', 'WORK', 'EVENT',
        'LOCATION', 'ORGANIZATION', 'GPE', 'LOC', 'FAC', 'PRODUCT', 'TIME'
      ]);

      const invalid = entities.filter(e => !validTypes.has(e.type));

      if (invalid.length > 0) {
        const invalidList = invalid
          .map(e => `${e.canonical} (${e.type})`)
          .join(', ');
        return {
          valid: false,
          message: `Entities with unrecognized types: ${invalidList}`,
        };
      }

      return { valid: true };
    },
  },
];

/**
 * Run all standard entity pattern validations
 */
export function validateEntityPatterns(
  entities: Entity[],
  text: string,
  patterns: EntityPattern[] = standardPatterns
): { valid: boolean; failures: Array<{ pattern: string; message: string }> } {
  const failures: Array<{ pattern: string; message: string }> = [];

  for (const pattern of patterns) {
    const result = pattern.validate(entities, text);
    if (!result.valid && result.message) {
      failures.push({
        pattern: pattern.name,
        message: result.message,
      });
    }
  }

  return {
    valid: failures.length === 0,
    failures,
  };
}
