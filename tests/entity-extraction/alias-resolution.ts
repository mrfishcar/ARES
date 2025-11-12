/**
 * Alias Resolution Test Utilities
 *
 * Provides utilities for validating alias resolution and entity
 * coreference, including pronoun resolution, title back-linking,
 * and canonical name selection.
 */

import type { Entity } from '../../app/engine/schema';
import type { TestEntity } from './test-utils';
import { normalizeEntityText } from './test-utils';

export interface AliasMatch {
  entity: Entity;
  matchedAlias: string;
  matchType: 'canonical' | 'alias' | 'partial';
}

export interface AliasResolutionResult {
  valid: boolean;
  matched: string[];
  missing: string[];
  unexpected: string[];
  coverage: number;
}

/**
 * Check if two names are likely the same entity
 */
export function namesAreSimilar(name1: string, name2: string): boolean {
  const n1 = normalizeEntityText(name1);
  const n2 = normalizeEntityText(name2);

  // Exact match
  if (n1 === n2) return true;

  // One is substring of the other (e.g., "Smith" in "John Smith")
  if (n1.includes(n2) || n2.includes(n1)) return true;

  // Last name match for people (e.g., "Smith" matches "Dr. Smith")
  const n1Words = n1.split(/\s+/);
  const n2Words = n2.split(/\s+/);
  if (n1Words.length > 1 && n2Words.length > 1) {
    const n1Last = n1Words[n1Words.length - 1];
    const n2Last = n2Words[n2Words.length - 1];
    if (n1Last === n2Last && n1Last.length > 2) return true;
  }

  // Check for common nickname patterns
  const nicknameMap: Record<string, string[]> = {
    'robert': ['bob', 'rob', 'bobby'],
    'william': ['bill', 'will', 'billy'],
    'richard': ['rick', 'dick', 'ricky'],
    'elizabeth': ['liz', 'beth', 'betty', 'lizzie'],
    'michael': ['mike', 'mikey'],
    'james': ['jim', 'jimmy'],
    'jennifer': ['jen', 'jenny'],
  };

  for (const [full, nicknames] of Object.entries(nicknameMap)) {
    if ((n1.includes(full) && nicknames.some(n => n2.includes(n))) ||
        (n2.includes(full) && nicknames.some(n => n1.includes(n)))) {
      return true;
    }
  }

  return false;
}

/**
 * Find entity by canonical name or alias
 */
export function findEntityByAlias(
  searchName: string,
  entities: Entity[]
): AliasMatch | undefined {
  const normalized = normalizeEntityText(searchName);

  for (const entity of entities) {
    // Check canonical name
    if (normalizeEntityText(entity.canonical) === normalized) {
      return {
        entity,
        matchedAlias: searchName,
        matchType: 'canonical',
      };
    }

    // Check aliases
    if (entity.aliases) {
      for (const alias of entity.aliases) {
        if (normalizeEntityText(alias) === normalized) {
          return {
            entity,
            matchedAlias: alias,
            matchType: 'alias',
          };
        }
      }
    }

    // Check for partial match
    if (namesAreSimilar(entity.canonical, searchName)) {
      return {
        entity,
        matchedAlias: searchName,
        matchType: 'partial',
      };
    }

    if (entity.aliases) {
      for (const alias of entity.aliases) {
        if (namesAreSimilar(alias, searchName)) {
          return {
            entity,
            matchedAlias: alias,
            matchType: 'partial',
          };
        }
      }
    }
  }

  return undefined;
}

/**
 * Validate that expected aliases are present
 */
export function validateAliasResolution(
  expected: TestEntity,
  extracted: Entity[]
): AliasResolutionResult {
  if (!expected.aliases || expected.aliases.length === 0) {
    return {
      valid: true,
      matched: [],
      missing: [],
      unexpected: [],
      coverage: 1.0,
    };
  }

  const matched: string[] = [];
  const missing: string[] = [];

  // Find the entity
  const match = findEntityByAlias(expected.text, extracted);
  if (!match) {
    return {
      valid: false,
      matched: [],
      missing: expected.aliases,
      unexpected: [],
      coverage: 0,
    };
  }

  const entity = match.entity;
  const entityAliases = new Set([
    normalizeEntityText(entity.canonical),
    ...(entity.aliases || []).map(a => normalizeEntityText(a)),
  ]);

  // Check each expected alias
  for (const expectedAlias of expected.aliases) {
    const normalized = normalizeEntityText(expectedAlias);
    if (entityAliases.has(normalized)) {
      matched.push(expectedAlias);
    } else {
      // Check for partial match
      let found = false;
      for (const entityAlias of Array.from(entityAliases)) {
        if (namesAreSimilar(entityAlias, expectedAlias)) {
          matched.push(expectedAlias);
          found = true;
          break;
        }
      }
      if (!found) {
        missing.push(expectedAlias);
      }
    }
  }

  // Find unexpected aliases (aliases that weren't expected)
  const expectedAliasSet = new Set([
    normalizeEntityText(expected.text),
    ...expected.aliases.map(a => normalizeEntityText(a)),
  ]);

  const unexpected: string[] = [];
  for (const alias of entity.aliases || []) {
    const normalized = normalizeEntityText(alias);
    if (!expectedAliasSet.has(normalized)) {
      // Check if it's a partial match to any expected alias
      let isExpected = false;
      for (const exp of Array.from(expectedAliasSet)) {
        if (namesAreSimilar(exp, alias)) {
          isExpected = true;
          break;
        }
      }
      if (!isExpected) {
        unexpected.push(alias);
      }
    }
  }

  const coverage = expected.aliases.length > 0
    ? matched.length / expected.aliases.length
    : 1.0;

  return {
    valid: missing.length === 0,
    matched,
    missing,
    unexpected,
    coverage,
  };
}

/**
 * Check for pronoun resolution
 */
export interface PronounCheck {
  pronoun: string;
  expectedEntity: string;
  resolvedCorrectly: boolean;
  actualEntity?: string;
}

export function validatePronounResolution(
  text: string,
  entities: Entity[],
  expectedMappings: Array<{ pronoun: string; entity: string }>
): PronounCheck[] {
  const results: PronounCheck[] = [];

  for (const mapping of expectedMappings) {
    const expectedEntity = findEntityByAlias(mapping.entity, entities);

    if (!expectedEntity) {
      results.push({
        pronoun: mapping.pronoun,
        expectedEntity: mapping.entity,
        resolvedCorrectly: false,
      });
      continue;
    }

    // Check if pronoun appears in entity aliases
    const aliases = expectedEntity.entity.aliases || [];
    const normalizedPronoun = normalizeEntityText(mapping.pronoun);
    const hasAlias = aliases.some(a => normalizeEntityText(a) === normalizedPronoun);

    results.push({
      pronoun: mapping.pronoun,
      expectedEntity: mapping.entity,
      resolvedCorrectly: hasAlias,
      actualEntity: hasAlias ? expectedEntity.entity.canonical : undefined,
    });
  }

  return results;
}

/**
 * Validate canonical name selection (should be the most formal/complete form)
 */
export interface CanonicalNameQuality {
  valid: boolean;
  canonical: string;
  issues: string[];
  suggestions: string[];
}

export function validateCanonicalName(entity: Entity): CanonicalNameQuality {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check if canonical is a pronoun
  const pronouns = ['he', 'she', 'it', 'they', 'his', 'her', 'their', 'him', 'them'];
  if (pronouns.includes(entity.canonical.toLowerCase())) {
    issues.push('Canonical name is a pronoun');
    if (entity.aliases && entity.aliases.length > 0) {
      // Suggest the longest non-pronoun alias
      const nonPronouns = entity.aliases.filter(
        a => !pronouns.includes(a.toLowerCase())
      );
      if (nonPronouns.length > 0) {
        const longest = nonPronouns.reduce((a, b) => a.length > b.length ? a : b);
        suggestions.push(`Use "${longest}" as canonical name`);
      }
    }
  }

  // Check if canonical is too short (likely nickname or abbreviation)
  if (entity.canonical.length < 3 && entity.type === 'PERSON') {
    issues.push('Canonical name is very short for a person');
    if (entity.aliases) {
      const longerAliases = entity.aliases.filter(a => a.length > entity.canonical.length);
      if (longerAliases.length > 0) {
        const longest = longerAliases.reduce((a, b) => a.length > b.length ? a : b);
        suggestions.push(`Consider using longer form: "${longest}"`);
      }
    }
  }

  // Check if there's a more formal version in aliases
  if (entity.aliases) {
    const formalIndicators = ['Dr.', 'Prof.', 'Mr.', 'Mrs.', 'Ms.', 'President', 'Senator'];
    const formalAliases = entity.aliases.filter(a =>
      formalIndicators.some(ind => a.includes(ind))
    );

    if (formalAliases.length > 0 && !formalIndicators.some(ind => entity.canonical.includes(ind))) {
      issues.push('More formal version available in aliases');
      suggestions.push(`Consider: ${formalAliases.join(' or ')}`);
    }
  }

  // Check for articles in canonical name
  if (/^(the|a|an)\s+/i.test(entity.canonical)) {
    issues.push('Canonical name starts with article');
    suggestions.push(`Remove article: "${entity.canonical.replace(/^(the|a|an)\s+/i, '')}"`);
  }

  return {
    valid: issues.length === 0,
    canonical: entity.canonical,
    issues,
    suggestions,
  };
}

/**
 * Analyze alias quality across all entities
 */
export interface AliasQualityMetrics {
  totalEntities: number;
  entitiesWithAliases: number;
  avgAliasesPerEntity: number;
  canonicalIssues: number;
  pronounResolutionRate: number;
}

export function analyzeAliasQuality(
  entities: Entity[],
  text?: string
): AliasQualityMetrics {
  const entitiesWithAliases = entities.filter(e => e.aliases && e.aliases.length > 0).length;
  const totalAliases = entities.reduce((sum, e) => sum + (e.aliases?.length || 0), 0);
  const avgAliases = entities.length > 0 ? totalAliases / entities.length : 0;

  let canonicalIssues = 0;
  for (const entity of entities) {
    const quality = validateCanonicalName(entity);
    if (!quality.valid) canonicalIssues++;
  }

  // Estimate pronoun resolution (count pronouns in aliases)
  const pronouns = ['he', 'she', 'it', 'they', 'his', 'her', 'their'];
  let pronounsResolved = 0;
  let totalPronounsInText = 0;

  if (text) {
    const words = text.toLowerCase().split(/\s+/);
    totalPronounsInText = words.filter(w => pronouns.includes(w)).length;

    for (const entity of entities) {
      if (entity.aliases) {
        pronounsResolved += entity.aliases.filter(a =>
          pronouns.includes(a.toLowerCase())
        ).length;
      }
    }
  }

  const pronounResolutionRate = totalPronounsInText > 0
    ? pronounsResolved / totalPronounsInText
    : 0;

  return {
    totalEntities: entities.length,
    entitiesWithAliases,
    avgAliasesPerEntity: avgAliases,
    canonicalIssues,
    pronounResolutionRate,
  };
}

/**
 * Generate alias resolution report
 */
export function generateAliasReport(
  expected: TestEntity[],
  extracted: Entity[],
  text?: string
): string {
  const lines: string[] = [
    'Alias Resolution Report',
    '======================',
    '',
  ];

  // Overall quality metrics
  const metrics = analyzeAliasQuality(extracted, text);
  lines.push('Quality Metrics:');
  lines.push(`  Entities with aliases: ${metrics.entitiesWithAliases}/${metrics.totalEntities} (${((metrics.entitiesWithAliases / metrics.totalEntities) * 100).toFixed(1)}%)`);
  lines.push(`  Average aliases per entity: ${metrics.avgAliasesPerEntity.toFixed(1)}`);
  lines.push(`  Canonical name issues: ${metrics.canonicalIssues}`);
  if (text) {
    lines.push(`  Pronoun resolution rate: ${(metrics.pronounResolutionRate * 100).toFixed(1)}%`);
  }
  lines.push('');

  // Validate each expected entity's aliases
  lines.push('Alias Coverage:');
  let totalCoverage = 0;
  let validCount = 0;

  for (const exp of expected) {
    const result = validateAliasResolution(exp, extracted);
    totalCoverage += result.coverage;
    if (result.valid) validCount++;

    const icon = result.valid ? '✅' : '❌';
    lines.push(`  ${icon} ${exp.text} (${(result.coverage * 100).toFixed(0)}% coverage)`);

    if (result.matched.length > 0) {
      lines.push(`     Matched: ${result.matched.join(', ')}`);
    }
    if (result.missing.length > 0) {
      lines.push(`     Missing: ${result.missing.join(', ')}`);
    }
    if (result.unexpected.length > 0) {
      lines.push(`     Unexpected: ${result.unexpected.join(', ')}`);
    }
  }

  const avgCoverage = expected.length > 0 ? totalCoverage / expected.length : 0;
  lines.push('');
  lines.push(`Average Coverage: ${(avgCoverage * 100).toFixed(1)}%`);
  lines.push(`Fully Resolved: ${validCount}/${expected.length}`);

  // Check canonical name quality
  lines.push('');
  lines.push('Canonical Name Quality:');
  let issueCount = 0;
  for (const entity of extracted) {
    const quality = validateCanonicalName(entity);
    if (!quality.valid) {
      issueCount++;
      lines.push(`  ⚠️  ${entity.canonical}:`);
      for (const issue of quality.issues) {
        lines.push(`     - ${issue}`);
      }
      if (quality.suggestions.length > 0) {
        lines.push(`     Suggestions: ${quality.suggestions.join('; ')}`);
      }
    }
  }

  if (issueCount === 0) {
    lines.push('  ✅ No canonical name issues');
  }

  return lines.join('\n');
}
