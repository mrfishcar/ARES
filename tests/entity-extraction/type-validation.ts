/**
 * Entity Type Validation Utilities
 *
 * Provides utilities for validating entity type classification,
 * including type consistency checks, context-based validation,
 * and type disambiguation logic.
 */

import type { Entity, EntityType } from '../../app/engine/extract/entities';

export interface TypeValidationRule {
  name: string;
  description: string;
  validate: (entity: Entity, text: string) => {
    valid: boolean;
    message?: string;
    suggestedType?: EntityType;
  };
}

/**
 * Standard entity types with their common indicators
 */
export const ENTITY_TYPE_INDICATORS = {
  PERSON: {
    titles: ['Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Prof.', 'President', 'Senator', 'Judge'],
    roles: ['professor', 'scientist', 'doctor', 'teacher', 'engineer', 'artist', 'author'],
    verbs: ['married', 'born', 'studied', 'worked', 'taught', 'wrote', 'said'],
    patterns: [/\b(son|daughter|father|mother|brother|sister) of\b/i],
  },
  ORGANIZATION: {
    suffixes: ['Inc.', 'Corp.', 'LLC', 'Ltd.', 'Co.', 'Company', 'Corporation', 'Institute'],
    types: ['university', 'school', 'hospital', 'laboratory', 'department', 'ministry'],
    verbs: ['announced', 'reported', 'operates', 'provides', 'manufactures'],
    patterns: [/\b(University of|Institute of|Department of|Ministry of)\b/i],
  },
  LOCATION: {
    types: ['city', 'country', 'state', 'region', 'continent', 'province', 'district'],
    prepositions: ['in', 'at', 'from', 'to', 'near'],
    verbs: ['located', 'situated', 'traveled to', 'moved to', 'lives in'],
    patterns: [/\b(traveled to|located in|moved to|lives in)\b/i],
  },
  DATE: {
    patterns: [
      /\b\d{4}\b/, // year
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i,
      /\b\d{1,2}(st|nd|rd|th)\b/,
    ],
  },
  PRODUCT: {
    versions: /\b(v\d+|\d+\.\d+|Pro|Max|Plus|Mini)\b/i,
    patterns: [/\biPhone \d+\b/i, /\biPad\b/i, /\bGalaxy S\d+\b/i],
  },
  EVENT: {
    types: ['conference', 'summit', 'meeting', 'symposium', 'convention', 'festival'],
    patterns: [/\b\d{4}\b/, /\b(annual|biennial|world|international)\b/i],
  },
};

/**
 * Check if entity type is appropriate based on context
 */
export function validateTypeFromContext(
  entity: Entity,
  text: string
): { valid: boolean; message?: string; suggestedType?: EntityType } {
  // Extract context around the entity (±50 chars)
  const entityIndex = text.toLowerCase().indexOf(entity.canonical.toLowerCase());
  if (entityIndex === -1) {
    return { valid: true }; // Can't validate without position
  }

  const start = Math.max(0, entityIndex - 50);
  const end = Math.min(text.length, entityIndex + entity.canonical.length + 50);
  const context = text.slice(start, end).toLowerCase();

  // Validate PERSON type
  if (entity.type === 'PERSON') {
    const indicators = ENTITY_TYPE_INDICATORS.PERSON;
    const hasPersonIndicator =
      indicators.titles.some(t => context.includes(t.toLowerCase())) ||
      indicators.roles.some(r => context.includes(r)) ||
      indicators.verbs.some(v => context.includes(v)) ||
      indicators.patterns.some(p => p.test(context));

    // Check for org indicators that suggest misclassification
    const orgIndicators = ENTITY_TYPE_INDICATORS.ORGANIZATION;
    const hasOrgIndicator =
      orgIndicators.suffixes.some(s => entity.canonical.includes(s)) ||
      orgIndicators.types.some(t => context.includes(t));

    if (hasOrgIndicator && !hasPersonIndicator) {
      return {
        valid: false,
        message: `Entity "${entity.canonical}" classified as PERSON but has organization indicators`,
        suggestedType: 'ORG',
      };
    }
  }

  // Validate ORGANIZATION type
  if (entity.type === 'ORG' || entity.type === 'ORGANIZATION') {
    const indicators = ENTITY_TYPE_INDICATORS.ORGANIZATION;
    const hasOrgIndicator =
      indicators.suffixes.some(s => entity.canonical.includes(s)) ||
      indicators.types.some(t => context.includes(t)) ||
      indicators.patterns.some(p => p.test(context));

    // Check for person indicators that suggest misclassification
    const personIndicators = ENTITY_TYPE_INDICATORS.PERSON;
    const hasPersonIndicator =
      personIndicators.titles.some(t => entity.canonical.includes(t)) ||
      personIndicators.roles.some(r => context.includes(r));

    if (hasPersonIndicator && !hasOrgIndicator) {
      return {
        valid: false,
        message: `Entity "${entity.canonical}" classified as ORG but has person indicators`,
        suggestedType: 'PERSON',
      };
    }
  }

  // Validate LOCATION type
  if (entity.type === 'PLACE' || entity.type === 'LOCATION') {
    const indicators = ENTITY_TYPE_INDICATORS.LOCATION;
    const hasLocationIndicator =
      indicators.types.some(t => context.includes(t)) ||
      indicators.prepositions.some(p => new RegExp(`\\b${p}\\s+\\w*${entity.canonical}`, 'i').test(context)) ||
      indicators.patterns.some(p => p.test(context));

    // Location type is often valid, but check for obvious mismatches
    if (!hasLocationIndicator) {
      // Check if it's more likely an org
      const orgSuffixes = ENTITY_TYPE_INDICATORS.ORGANIZATION.suffixes;
      if (orgSuffixes.some(s => entity.canonical.includes(s))) {
        return {
          valid: false,
          message: `Entity "${entity.canonical}" classified as LOCATION but appears to be an organization`,
          suggestedType: 'ORG',
        };
      }
    }
  }

  // Validate DATE type
  if (entity.type === 'DATE') {
    const indicators = ENTITY_TYPE_INDICATORS.DATE;
    const hasDatePattern = indicators.patterns.some(p => p.test(entity.canonical));

    if (!hasDatePattern) {
      return {
        valid: false,
        message: `Entity "${entity.canonical}" classified as DATE but doesn't match date patterns`,
      };
    }
  }

  return { valid: true };
}

/**
 * Check for common type classification errors
 */
export const TYPE_VALIDATION_RULES: TypeValidationRule[] = [
  {
    name: 'org-suffix-consistency',
    description: 'Organizations with corporate suffixes should be typed as ORG',
    validate: (entity, text) => {
      const orgSuffixes = ['Inc.', 'Corp.', 'LLC', 'Ltd.', 'Co.', 'Company'];
      const hasSuffix = orgSuffixes.some(s =>
        entity.canonical.includes(s) || entity.canonical.includes(s.replace('.', ''))
      );

      if (hasSuffix && entity.type !== 'ORG' && entity.type !== 'ORGANIZATION') {
        return {
          valid: false,
          message: `Entity "${entity.canonical}" has corporate suffix but is typed as ${entity.type}`,
          suggestedType: 'ORG',
        };
      }

      return { valid: true };
    },
  },
  {
    name: 'person-title-consistency',
    description: 'Entities with person titles should be typed as PERSON',
    validate: (entity, text) => {
      const personTitles = ['Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Prof.', 'President', 'Senator'];
      const hasTitle = personTitles.some(t => entity.canonical.includes(t));

      if (hasTitle && entity.type !== 'PERSON') {
        return {
          valid: false,
          message: `Entity "${entity.canonical}" has person title but is typed as ${entity.type}`,
          suggestedType: 'PERSON',
        };
      }

      return { valid: true };
    },
  },
  {
    name: 'date-format-consistency',
    description: 'Entities matching date formats should be typed as DATE',
    validate: (entity, text) => {
      const datePatterns = [
        /^\d{4}$/, // year
        /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // MM/DD/YYYY
        /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}$/i,
      ];

      const isDateFormat = datePatterns.some(p => p.test(entity.canonical));

      if (isDateFormat && entity.type !== 'DATE' && entity.type !== 'TIME') {
        return {
          valid: false,
          message: `Entity "${entity.canonical}" matches date format but is typed as ${entity.type}`,
          suggestedType: 'DATE',
        };
      }

      return { valid: true };
    },
  },
  {
    name: 'location-preposition-consistency',
    description: 'Entities following location prepositions should be typed as LOCATION',
    validate: (entity, text) => {
      const locationPreps = ['in', 'at', 'from', 'to', 'near', 'inside', 'outside'];
      const entityIndex = text.toLowerCase().indexOf(entity.canonical.toLowerCase());

      if (entityIndex > 0) {
        const before = text.slice(Math.max(0, entityIndex - 20), entityIndex).toLowerCase();
        const hasLocationPrep = locationPreps.some(prep =>
          new RegExp(`\\b${prep}\\s*$`).test(before)
        );

        if (hasLocationPrep && entity.type !== 'PLACE' && entity.type !== 'LOCATION' && entity.type !== 'GPE') {
          // Check if it's an organization that happens to follow a preposition
          const orgIndicators = ENTITY_TYPE_INDICATORS.ORGANIZATION.suffixes;
          const hasOrgSuffix = orgIndicators.some(s => entity.canonical.includes(s));

          if (!hasOrgSuffix) {
            return {
              valid: false,
              message: `Entity "${entity.canonical}" follows location preposition but is typed as ${entity.type}`,
              suggestedType: 'LOCATION',
            };
          }
        }
      }

      return { valid: true };
    },
  },
  {
    name: 'product-version-consistency',
    description: 'Entities with version numbers should be typed as PRODUCT',
    validate: (entity, text) => {
      const versionPattern = /\b(v\d+|\d+\.\d+|Pro|Max|Plus|Mini|iPhone \d+|iPad)\b/i;
      const hasVersionIndicator = versionPattern.test(entity.canonical);

      if (hasVersionIndicator && entity.type !== 'PRODUCT' && entity.type !== 'WORK') {
        return {
          valid: false,
          message: `Entity "${entity.canonical}" has product version indicator but is typed as ${entity.type}`,
          suggestedType: 'PRODUCT',
        };
      }

      return { valid: true };
    },
  },
];

/**
 * Validate all type rules for an entity
 */
export function validateEntityTypes(
  entity: Entity,
  text: string,
  rules: TypeValidationRule[] = TYPE_VALIDATION_RULES
): Array<{ rule: string; message: string; suggestedType?: EntityType }> {
  const violations: Array<{ rule: string; message: string; suggestedType?: EntityType }> = [];

  // Run standard rules
  for (const rule of rules) {
    const result = rule.validate(entity, text);
    if (!result.valid && result.message) {
      violations.push({
        rule: rule.name,
        message: result.message,
        suggestedType: result.suggestedType,
      });
    }
  }

  // Run context-based validation
  const contextResult = validateTypeFromContext(entity, text);
  if (!contextResult.valid && contextResult.message) {
    violations.push({
      rule: 'context-validation',
      message: contextResult.message,
      suggestedType: contextResult.suggestedType,
    });
  }

  return violations;
}

/**
 * Check for type consistency across all entities
 */
export function validateTypeConsistency(entities: Entity[], text: string): {
  valid: boolean;
  violations: Array<{
    entity: string;
    type: EntityType;
    issues: Array<{ rule: string; message: string; suggestedType?: EntityType }>;
  }>;
} {
  const violations: Array<{
    entity: string;
    type: EntityType;
    issues: Array<{ rule: string; message: string; suggestedType?: EntityType }>;
  }> = [];

  for (const entity of entities) {
    const issues = validateEntityTypes(entity, text);
    if (issues.length > 0) {
      violations.push({
        entity: entity.canonical,
        type: entity.type,
        issues,
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Generate type validation report
 */
export function generateTypeValidationReport(
  entities: Entity[],
  text: string
): string {
  const result = validateTypeConsistency(entities, text);
  const lines: string[] = [
    'Entity Type Validation Report',
    '============================',
    '',
    `Total Entities: ${entities.length}`,
    `Type Violations: ${result.violations.length}`,
    '',
  ];

  if (result.valid) {
    lines.push('✅ All entity types are valid and consistent');
  } else {
    lines.push('Issues Found:');
    lines.push('');
    for (const violation of result.violations) {
      lines.push(`❌ ${violation.entity} (${violation.type})`);
      for (const issue of violation.issues) {
        lines.push(`   - [${issue.rule}] ${issue.message}`);
        if (issue.suggestedType) {
          lines.push(`     Suggested: ${issue.suggestedType}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Get type distribution across entities
 */
export function getTypeDistribution(entities: Entity[]): Map<EntityType, number> {
  const distribution = new Map<EntityType, number>();

  for (const entity of entities) {
    const count = distribution.get(entity.type) || 0;
    distribution.set(entity.type, count + 1);
  }

  return distribution;
}

/**
 * Format type distribution for display
 */
export function formatTypeDistribution(entities: Entity[]): string {
  const distribution = getTypeDistribution(entities);
  const lines: string[] = [
    'Entity Type Distribution',
    '=======================',
    '',
  ];

  const sorted = Array.from(distribution.entries()).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sorted) {
    const percentage = ((count / entities.length) * 100).toFixed(1);
    lines.push(`${type.padEnd(15)} ${count.toString().padStart(3)}  (${percentage}%)`);
  }

  return lines.join('\n');
}
