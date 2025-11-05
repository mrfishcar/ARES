/**
 * Pattern Library - Persistence and Management
 *
 * Stores learned patterns for reuse across documents and sessions.
 *
 * Features:
 * - Save/load pattern libraries to JSON
 * - Version management
 * - Pattern refinement (add/remove/update)
 * - Metadata tracking (creation date, usage stats)
 *
 * Usage:
 * ```typescript
 * // Bootstrap patterns from seeds
 * const result = bootstrapPatterns(wizardSeeds, corpus);
 *
 * // Save to library
 * const library = createPatternLibrary();
 * addPatterns(library, 'WIZARD', result.patterns);
 * savePatternLibrary(library, './patterns/wizards.json');
 *
 * // Reuse in new documents
 * const library = loadPatternLibrary('./patterns/wizards.json');
 * const wizardPatterns = getPatterns(library, 'WIZARD');
 * const matches = applyPatterns(newCorpus, wizardPatterns);
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Pattern } from './bootstrap';

/**
 * Pattern library structure
 */
export interface PatternLibrary {
  version: string;                           // Library version (e.g., "1.0.0")
  created_at: string;                        // ISO timestamp
  updated_at: string;                        // ISO timestamp
  entityTypes: Record<string, PatternSet>;   // Patterns grouped by entity type
  metadata: LibraryMetadata;                 // Usage stats and notes
}

/**
 * Pattern set for a specific entity type
 */
export interface PatternSet {
  type: string;                              // Entity type (e.g., "WIZARD", "SPELL")
  patterns: Pattern[];                       // Learned patterns
  seeds: string[];                           // Original seed examples
  corpus_stats: {
    documents_seen: number;                  // How many documents used for learning
    total_extractions: number;               // Total entities extracted
    last_updated: string;                    // Last time patterns were refined
  };
}

/**
 * Library metadata
 */
export interface LibraryMetadata {
  name: string;                              // Library name (e.g., "Harry Potter Patterns")
  description: string;                       // Description
  domain: string;                            // Domain (e.g., "fantasy", "technical")
  total_patterns: number;                    // Total patterns across all types
  total_types: number;                       // Number of entity types
  notes: string;                             // User notes
}

/**
 * Serialized pattern (for JSON storage)
 */
interface SerializedPattern {
  type: string;
  template: string;
  regex_source: string;                      // RegExp.source
  regex_flags: string;                       // RegExp.flags
  confidence: number;
  examples: string[];
  extractionCount: number;
}

/**
 * Create a new empty pattern library
 */
export function createPatternLibrary(
  name: string = 'Unnamed Library',
  description: string = '',
  domain: string = 'general'
): PatternLibrary {
  const now = new Date().toISOString();

  return {
    version: '1.0.0',
    created_at: now,
    updated_at: now,
    entityTypes: {},
    metadata: {
      name,
      description,
      domain,
      total_patterns: 0,
      total_types: 0,
      notes: ''
    }
  };
}

/**
 * Add patterns for an entity type
 *
 * If the entity type already exists, merges new patterns with existing ones,
 * removing duplicates and updating metadata.
 */
export function addPatterns(
  library: PatternLibrary,
  entityType: string,
  patterns: Pattern[],
  seeds: string[] = []
): void {
  if (patterns.length === 0) {
    console.warn(`[PATTERN-LIBRARY] No patterns provided for ${entityType}`);
    return;
  }

  const now = new Date().toISOString();

  if (!library.entityTypes[entityType]) {
    // New entity type
    library.entityTypes[entityType] = {
      type: entityType,
      patterns: [],
      seeds: seeds,
      corpus_stats: {
        documents_seen: 1,
        total_extractions: 0,
        last_updated: now
      }
    };
    library.metadata.total_types++;
  }

  const patternSet = library.entityTypes[entityType];

  // Merge patterns (avoid duplicates based on template)
  const existingTemplates = new Set(patternSet.patterns.map(p => p.template));
  const newPatterns = patterns.filter(p => !existingTemplates.has(p.template));

  patternSet.patterns.push(...newPatterns);
  patternSet.corpus_stats.last_updated = now;
  patternSet.corpus_stats.total_extractions += patterns.reduce((sum, p) => sum + p.extractionCount, 0);

  // Merge seeds
  const existingSeeds = new Set(patternSet.seeds);
  for (const seed of seeds) {
    if (!existingSeeds.has(seed)) {
      patternSet.seeds.push(seed);
    }
  }

  library.metadata.total_patterns = Object.values(library.entityTypes)
    .reduce((sum, ps) => sum + ps.patterns.length, 0);
  library.updated_at = now;

  console.log(`[PATTERN-LIBRARY] Added ${newPatterns.length} new patterns for ${entityType}`);
}

/**
 * Get patterns for an entity type
 */
export function getPatterns(
  library: PatternLibrary,
  entityType: string
): Pattern[] {
  const patternSet = library.entityTypes[entityType];
  if (!patternSet) {
    console.warn(`[PATTERN-LIBRARY] Entity type "${entityType}" not found in library`);
    return [];
  }

  return patternSet.patterns;
}

/**
 * Remove patterns for an entity type
 */
export function removePatterns(
  library: PatternLibrary,
  entityType: string,
  templateFilter: (template: string) => boolean
): number {
  const patternSet = library.entityTypes[entityType];
  if (!patternSet) {
    console.warn(`[PATTERN-LIBRARY] Entity type "${entityType}" not found in library`);
    return 0;
  }

  const beforeCount = patternSet.patterns.length;
  patternSet.patterns = patternSet.patterns.filter(p => !templateFilter(p.template));
  const removedCount = beforeCount - patternSet.patterns.length;

  library.metadata.total_patterns = Object.values(library.entityTypes)
    .reduce((sum, ps) => sum + ps.patterns.length, 0);
  library.updated_at = new Date().toISOString();

  console.log(`[PATTERN-LIBRARY] Removed ${removedCount} patterns from ${entityType}`);
  return removedCount;
}

/**
 * Update pattern confidence
 *
 * Useful for refining patterns based on user feedback.
 */
export function updatePatternConfidence(
  library: PatternLibrary,
  entityType: string,
  template: string,
  newConfidence: number
): boolean {
  const patternSet = library.entityTypes[entityType];
  if (!patternSet) {
    console.warn(`[PATTERN-LIBRARY] Entity type "${entityType}" not found in library`);
    return false;
  }

  const pattern = patternSet.patterns.find(p => p.template === template);
  if (!pattern) {
    console.warn(`[PATTERN-LIBRARY] Pattern "${template}" not found for ${entityType}`);
    return false;
  }

  pattern.confidence = newConfidence;
  library.updated_at = new Date().toISOString();

  console.log(`[PATTERN-LIBRARY] Updated confidence for "${template}": ${newConfidence.toFixed(2)}`);
  return true;
}

/**
 * Save pattern library to JSON file
 */
export function savePatternLibrary(
  library: PatternLibrary,
  filePath: string
): void {
  // Serialize patterns (RegExp → { source, flags })
  const serialized: any = {
    ...library,
    entityTypes: {}
  };

  for (const [entityType, patternSet] of Object.entries(library.entityTypes)) {
    serialized.entityTypes[entityType] = {
      ...patternSet,
      patterns: patternSet.patterns.map(p => serializePattern(p))
    };
  }

  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(serialized, null, 2), 'utf-8');
  console.log(`[PATTERN-LIBRARY] Saved to: ${filePath}`);
  console.log(`  Entity types: ${library.metadata.total_types}`);
  console.log(`  Total patterns: ${library.metadata.total_patterns}`);
}

/**
 * Load pattern library from JSON file
 */
export function loadPatternLibrary(
  filePath: string
): PatternLibrary | null {
  if (!fs.existsSync(filePath)) {
    console.warn(`[PATTERN-LIBRARY] File not found: ${filePath}`);
    return null;
  }

  try {
    const json = fs.readFileSync(filePath, 'utf-8');
    const serialized = JSON.parse(json);

    // Deserialize patterns ({ source, flags } → RegExp)
    const library: PatternLibrary = {
      ...serialized,
      entityTypes: {}
    };

    for (const [entityType, patternSet] of Object.entries(serialized.entityTypes as Record<string, any>)) {
      library.entityTypes[entityType] = {
        ...patternSet,
        patterns: patternSet.patterns.map((p: SerializedPattern) => deserializePattern(p))
      };
    }

    console.log(`[PATTERN-LIBRARY] Loaded from: ${filePath}`);
    console.log(`  Entity types: ${library.metadata.total_types}`);
    console.log(`  Total patterns: ${library.metadata.total_patterns}`);

    return library;
  } catch (error) {
    console.error(`[PATTERN-LIBRARY] Failed to load: ${error}`);
    return null;
  }
}

/**
 * Serialize a pattern for JSON storage
 */
function serializePattern(pattern: Pattern): SerializedPattern {
  return {
    type: pattern.type,
    template: pattern.template,
    regex_source: pattern.regex.source,
    regex_flags: pattern.regex.flags,
    confidence: pattern.confidence,
    examples: pattern.examples,
    extractionCount: pattern.extractionCount
  };
}

/**
 * Deserialize a pattern from JSON
 */
function deserializePattern(serialized: SerializedPattern): Pattern {
  return {
    type: serialized.type,
    template: serialized.template,
    regex: new RegExp(serialized.regex_source, serialized.regex_flags),
    confidence: serialized.confidence,
    examples: serialized.examples,
    extractionCount: serialized.extractionCount
  };
}

/**
 * Merge two pattern libraries
 *
 * Combines patterns from both libraries, keeping higher-confidence
 * patterns when duplicates exist.
 */
export function mergeLibraries(
  lib1: PatternLibrary,
  lib2: PatternLibrary,
  name: string = 'Merged Library'
): PatternLibrary {
  const merged = createPatternLibrary(
    name,
    `Merged from: ${lib1.metadata.name} + ${lib2.metadata.name}`,
    lib1.metadata.domain
  );

  // Merge entity types
  const allTypes = new Set([
    ...Object.keys(lib1.entityTypes),
    ...Object.keys(lib2.entityTypes)
  ]);

  for (const entityType of allTypes) {
    const patterns1 = lib1.entityTypes[entityType]?.patterns || [];
    const patterns2 = lib2.entityTypes[entityType]?.patterns || [];
    const seeds1 = lib1.entityTypes[entityType]?.seeds || [];
    const seeds2 = lib2.entityTypes[entityType]?.seeds || [];

    // Merge patterns by template, keeping higher confidence
    const patternMap = new Map<string, Pattern>();

    for (const pattern of [...patterns1, ...patterns2]) {
      const existing = patternMap.get(pattern.template);
      if (!existing || pattern.confidence > existing.confidence) {
        patternMap.set(pattern.template, pattern);
      }
    }

    const mergedPatterns = Array.from(patternMap.values());
    const mergedSeeds = Array.from(new Set([...seeds1, ...seeds2]));

    addPatterns(merged, entityType, mergedPatterns, mergedSeeds);
  }

  console.log(`[PATTERN-LIBRARY] Merged libraries:`);
  console.log(`  ${lib1.metadata.name}: ${lib1.metadata.total_patterns} patterns`);
  console.log(`  ${lib2.metadata.name}: ${lib2.metadata.total_patterns} patterns`);
  console.log(`  Result: ${merged.metadata.total_patterns} patterns`);

  return merged;
}

/**
 * Get library statistics
 */
export function getLibraryStats(library: PatternLibrary): {
  total_patterns: number;
  total_types: number;
  avg_patterns_per_type: number;
  avg_confidence: number;
  top_patterns: Array<{ type: string; template: string; confidence: number }>;
} {
  const allPatterns = Object.values(library.entityTypes)
    .flatMap(ps => ps.patterns);

  const avgConfidence = allPatterns.length > 0
    ? allPatterns.reduce((sum, p) => sum + p.confidence, 0) / allPatterns.length
    : 0;

  const topPatterns = allPatterns
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10)
    .map(p => ({
      type: p.type,
      template: p.template,
      confidence: p.confidence
    }));

  return {
    total_patterns: library.metadata.total_patterns,
    total_types: library.metadata.total_types,
    avg_patterns_per_type: library.metadata.total_types > 0
      ? library.metadata.total_patterns / library.metadata.total_types
      : 0,
    avg_confidence: avgConfidence,
    top_patterns: topPatterns
  };
}
