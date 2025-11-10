/**
 * Dynamic Pattern Loader
 *
 * Loads generated surface patterns from JSON files at runtime
 * to dramatically increase pattern coverage without manual integration.
 *
 * Strategy: Load high-value relation families (LOCATION, PART_WHOLE, EMPLOYMENT, CREATION)
 * to boost coverage from 26% to 40-50%.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { EntityType } from './schema';

interface JsonSurfacePattern {
  id: string;
  regex: string;
  predicate: string;
  family: string;
  lemma_form: string;
  examples: string[];
}

export interface RelationPattern {
  regex: RegExp;
  predicate: string;
  symmetric?: boolean;
  extractSubj?: number;
  extractObj?: number;
  typeGuard?: {
    subj?: EntityType[];
    obj?: EntityType[];
  };
}

/**
 * Relation families to load
 * Prioritize high-value families with low coverage
 */
const FAMILIES_TO_LOAD = new Set([
  'location',      // 18% coverage → high value
  'part_whole',    // 10% coverage → high value
  'employment',    // 16% coverage → high value
  'creation',      // 25% coverage → medium value
  'ownership',     // 24% coverage → medium value
  'temporal',      // 32% coverage → medium value
  'event',         // 40% coverage → medium value
]);

/**
 * Predicates to EXCLUDE (known issues or unwanted)
 */
const EXCLUDED_PREDICATES = new Set<string>([
  // Add problematic predicates here
]);

/**
 * Type guards by relation family
 */
const FAMILY_TYPE_GUARDS: Record<string, { subj?: EntityType[]; obj?: EntityType[] }> = {
  location: { subj: ['PERSON', 'ORG', 'ITEM'], obj: ['PLACE'] },
  part_whole: { subj: ['ITEM', 'ORG'], obj: ['ITEM', 'ORG'] },
  employment: { subj: ['PERSON'], obj: ['ORG'] },
  creation: { subj: ['PERSON', 'ORG'], obj: ['WORK', 'ITEM'] },
  ownership: { subj: ['PERSON', 'ORG'], obj: ['ITEM', 'PLACE'] },
  temporal: {},
  event: { subj: ['PERSON'], obj: ['EVENT'] },
  kinship: { subj: ['PERSON'], obj: ['PERSON'] },
  communication: { subj: ['PERSON'], obj: ['PERSON'] },
  power: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] },
  emotional: { subj: ['PERSON'], obj: ['PERSON'] },
  identity: {},
  comparison: {},
};

/**
 * Symmetric predicates (bidirectional relations)
 */
const SYMMETRIC_PREDICATES = new Set([
  'married_to',
  'sibling_of',
  'friends_with',
  'enemy_of',
  'cousin_of',
  'colleague_of',
  'allied_with',
  'similar_to',
  'equals',
]);

/**
 * Load surface patterns from JSON file
 */
function loadSurfacePatterns(filePath: string): JsonSurfacePattern[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as JsonSurfacePattern[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[DynamicPatternLoader] Failed to load ${filePath}:`, message);
    return [];
  }
}

/**
 * Convert JSON pattern to RelationPattern
 */
function convertPattern(jsonPattern: JsonSurfacePattern): RelationPattern | null {
  try {
    // Skip excluded families
    if (!FAMILIES_TO_LOAD.has(jsonPattern.family)) {
      return null;
    }

    // Skip excluded predicates
    if (EXCLUDED_PREDICATES.has(jsonPattern.predicate)) {
      return null;
    }

    // Skip patterns that look malformed
    if (!jsonPattern.regex || jsonPattern.regex.length < 10) {
      return null;
    }

    // Convert regex string to RegExp with global flag
    const regex = new RegExp(jsonPattern.regex, 'g');

    // Get type guard for this family
    const typeGuard = FAMILY_TYPE_GUARDS[jsonPattern.family] || {};

    // Check if symmetric
    const symmetric = SYMMETRIC_PREDICATES.has(jsonPattern.predicate);

    return {
      regex,
      predicate: jsonPattern.predicate,
      symmetric,
      typeGuard: Object.keys(typeGuard).length > 0 ? typeGuard : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[DynamicPatternLoader] Failed to convert pattern ${jsonPattern.id}:`, message);
    return null;
  }
}

/**
 * Load and convert all high-value surface patterns
 */
export function loadDynamicPatterns(patternsDir: string = 'patterns'): RelationPattern[] {
  const filePath = path.join(process.cwd(), patternsDir, 'new_surface_patterns.json');

  console.log(`[DynamicPatternLoader] Loading patterns from ${filePath}`);

  const jsonPatterns = loadSurfacePatterns(filePath);
  console.log(`[DynamicPatternLoader] Loaded ${jsonPatterns.length} JSON patterns`);

  const converted: RelationPattern[] = [];
  const familyCounts: Record<string, number> = {};

  for (const jsonPattern of jsonPatterns) {
    const pattern = convertPattern(jsonPattern);
    if (pattern) {
      converted.push(pattern);

      // Track family counts
      familyCounts[jsonPattern.family] = (familyCounts[jsonPattern.family] || 0) + 1;
    }
  }

  console.log(`[DynamicPatternLoader] Converted ${converted.length} patterns:`);
  for (const [family, count] of Object.entries(familyCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${family}: ${count} patterns`);
  }

  return converted;
}

/**
 * Check if dynamic pattern loading is enabled
 */
export function isDynamicPatternsEnabled(): boolean {
  return process.env.ARES_DYNAMIC_PATTERNS === 'on' || process.env.ARES_DYNAMIC_PATTERNS === '1';
}

// Singleton cache
let cachedPatterns: RelationPattern[] | null = null;

/**
 * Get dynamic patterns (cached)
 */
export function getDynamicPatterns(): RelationPattern[] {
  if (!isDynamicPatternsEnabled()) {
    return [];
  }

  if (cachedPatterns === null) {
    cachedPatterns = loadDynamicPatterns();
  }

  return cachedPatterns;
}
