/**
 * Pattern Inventory System
 *
 * Scans existing ARES codebase to catalog all surface and dependency patterns,
 * computes signatures, and saves for de-duplication.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  computeSignature,
  PatternSignature,
  SurfacePattern,
  DependencyPattern,
  formatSignature
} from './pattern-signature';

interface InventoryResult {
  surface_patterns: SurfacePattern[];
  dependency_patterns: DependencyPattern[];
  signatures: Map<string, PatternSignature>;
  by_family: Map<string, number>;
  by_predicate: Map<string, number>;
  total: number;
}

/**
 * Map predicates to relation families
 */
const PREDICATE_TO_FAMILY: Record<string, string> = {
  // A. Kinship / Family
  'parent_of': 'kinship',
  'child_of': 'kinship',
  'sibling_of': 'kinship',
  'married_to': 'kinship',
  'alias_of': 'identity',

  // B. Ownership / Possession
  'owns': 'ownership',
  'possessed_by': 'ownership',
  'wields': 'ownership',
  'possesses': 'ownership',
  'part_of': 'part_whole',

  // C. Employment / Affiliation
  'member_of': 'employment',
  'works_at': 'employment',
  'employed_by': 'employment',
  'leads': 'employment',
  'manages': 'employment',
  'partner_of': 'employment',

  // D. Creation / Authorship
  'authored': 'creation',
  'created_by': 'creation',
  'written_by': 'creation',
  'invented_by': 'creation',
  'founded': 'creation',

  // E. Location / Spatial
  'located_at': 'location',
  'born_in': 'location',
  'dies_in': 'location',
  'lives_in': 'location',
  'located_beneath': 'location',
  'hidden_in': 'location',
  'near': 'location',
  'within': 'location',

  // F. Temporal
  'before': 'temporal',
  'after': 'temporal',
  'during': 'temporal',
  'since': 'temporal',

  // G. Causation / Influence
  'caused_by': 'causation',
  'led_to': 'causation',
  'resulted_from': 'causation',

  // I. Equivalence / Identity
  'is': 'identity',
  'equals': 'identity',
  'same_as': 'identity',
  'represents': 'identity',

  // J. Event Participation
  'attended': 'event',
  'participated_in': 'event',
  'fought_in': 'event',
  'hosted': 'event',
  'performed_at': 'event',

  // K. Communication
  'spoke_to': 'communication',
  'said_to': 'communication',
  'wrote_to': 'communication',
  'told': 'communication',
  'asked': 'communication',
  'mentions': 'communication',

  // L. Power / Control
  'rules': 'power',
  'controlled_by': 'power',
  'commanded_by': 'power',
  'governed_by': 'power',

  // M. Measurement / Comparison
  'greater_than': 'comparison',
  'less_than': 'comparison',
  'similar_to': 'comparison',

  // N. Emotional / Social
  'friends_with': 'social',
  'ally_of': 'social',
  'enemy_of': 'social',
  'loved': 'emotional',
  'hated': 'emotional',
  'feared': 'emotional',
  'admired': 'emotional',

  // Other predicates
  'acquired': 'ownership',
  'invested_in': 'employment',
  'studies_at': 'employment',
  'teaches_at': 'employment',
  'advised_by': 'employment',
  'traveled_to': 'event',
  'met': 'social',
  'mentored': 'employment',
  'mentored_by': 'employment',
  'guards': 'power',
  'seeks': 'event',
  'defeated': 'power',
  'killed': 'power',
  'imprisoned_in': 'power',
  'freed_from': 'power',
  'summoned': 'power',
  'uses': 'ownership',
};

/**
 * Extract dependency patterns from dependency-paths.ts
 */
function extractDependencyPatterns(): DependencyPattern[] {
  const filePath = path.join(process.cwd(), 'app/engine/extract/relations/dependency-paths.ts');

  if (!fs.existsSync(filePath)) {
    console.warn(`Dependency patterns file not found: ${filePath}`);
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const patterns: DependencyPattern[] = [];

  // Match patterns like: { signature: /^pattern$/, predicate: 'pred', subjectFirst: true }
  const patternRegex = /{\s*signature:\s*\/\^([^$]+)\$\/[^,]*,\s*predicate:\s*['"](\w+)['"]/g;

  let match;
  let id = 0;

  while ((match = patternRegex.exec(content)) !== null) {
    const signaturePattern = match[1];
    const predicate = match[2];

    // Extract lemmas and roles from signature
    const lemmas = signaturePattern.match(/:\w+/g)?.map(l => l.slice(1)) || [];
    const roles = signaturePattern.match(/(?:↑|↓)(\w+)/g)?.map(r => r.slice(1)) || [];

    const family = PREDICATE_TO_FAMILY[predicate] || 'other';

    patterns.push({
      id: `dep_${String(id++).padStart(4, '0')}`,
      signature_regex: signaturePattern,
      predicate,
      family,
      dep_roles: roles,
      lemmas,
      examples: []
    });
  }

  console.log(`✓ Extracted ${patterns.length} dependency patterns`);
  return patterns;
}

/**
 * Extract surface patterns from narrative-relations.ts
 */
function extractSurfacePatterns(): SurfacePattern[] {
  const filePath = path.join(process.cwd(), 'app/engine/narrative-relations.ts');

  if (!fs.existsSync(filePath)) {
    console.warn(`Surface patterns file not found: ${filePath}`);
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const patterns: SurfacePattern[] = [];

  // Match patterns like: { regex: /pattern/g, predicate: 'pred' }
  const patternRegex = /{\s*regex:\s*\/([^\/]+)\/[^,]*,\s*predicate:\s*['"](\w+)['"]/g;

  let match;
  let id = 0;

  while ((match = patternRegex.exec(content)) !== null) {
    const regexPattern = match[1];
    const predicate = match[2];
    const family = PREDICATE_TO_FAMILY[predicate] || 'other';

    patterns.push({
      id: `surf_${String(id++).padStart(4, '0')}`,
      regex: regexPattern,
      predicate,
      family,
      lemma_form: regexPattern.toLowerCase(),
      examples: []
    });
  }

  console.log(`✓ Extracted ${patterns.length} surface patterns`);
  return patterns;
}

/**
 * Extract patterns from relations.ts (inline regex patterns)
 */
function extractInlinePatterns(): SurfacePattern[] {
  const filePath = path.join(process.cwd(), 'app/engine/extract/relations.ts');

  if (!fs.existsSync(filePath)) {
    console.warn(`Relations file not found: ${filePath}`);
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const patterns: SurfacePattern[] = [];

  // Match patterns like: const xPattern = /regex/g;
  const patternRegex = /const\s+(\w+Pattern)\s*=\s*\/([^\/]+)\/g/g;

  let match;
  let id = 100; // Offset to avoid conflicts

  while ((match = patternRegex.exec(content)) !== null) {
    const name = match[1];
    const regexPattern = match[2];

    // Try to infer predicate from variable name
    const predicateMatch = name.match(/^(\w+)Pattern$/);
    let predicate = 'unknown';

    if (predicateMatch) {
      const baseName = predicateMatch[1];
      // Map common names to predicates
      if (baseName === 'sonOf' || baseName === 'son') predicate = 'child_of';
      if (baseName === 'married') predicate = 'married_to';
      if (baseName === 'begat') predicate = 'parent_of';
      if (baseName === 'bornTo') predicate = 'child_of';
      if (baseName === 'travel') predicate = 'traveled_to';
      if (baseName === 'studies') predicate = 'studies_at';
      if (baseName === 'teaches') predicate = 'teaches_at';
      if (baseName === 'dwelt') predicate = 'lives_in';
      if (baseName === 'king' || baseName === 'ruled') predicate = 'rules';
      if (baseName === 'conquered') predicate = 'rules';
      if (baseName === 'friends') predicate = 'friends_with';
      if (baseName === 'attended') predicate = 'attended';
    }

    const family = PREDICATE_TO_FAMILY[predicate] || 'other';

    patterns.push({
      id: `inline_${String(id++).padStart(4, '0')}`,
      regex: regexPattern,
      predicate,
      family,
      lemma_form: regexPattern.toLowerCase(),
      examples: []
    });
  }

  console.log(`✓ Extracted ${patterns.length} inline regex patterns`);
  return patterns;
}

/**
 * Build complete inventory with signatures
 */
export async function buildInventory(): Promise<InventoryResult> {
  console.log('\n=== Building Pattern Inventory ===\n');

  const depPatterns = extractDependencyPatterns();
  const surfPatterns = extractSurfacePatterns();
  const inlinePatterns = extractInlinePatterns();

  const allSurfacePatterns = [...surfPatterns, ...inlinePatterns];

  // Compute signatures
  const signatures = new Map<string, PatternSignature>();
  const byFamily = new Map<string, number>();
  const byPredicate = new Map<string, number>();

  // Process dependency patterns
  for (const pattern of depPatterns) {
    const sig = computeSignature(
      pattern.signature_regex,
      pattern.predicate,
      pattern.family,
      'dependency'
    );
    signatures.set(sig.hash, sig);

    byFamily.set(pattern.family, (byFamily.get(pattern.family) || 0) + 1);
    byPredicate.set(pattern.predicate, (byPredicate.get(pattern.predicate) || 0) + 1);
  }

  // Process surface patterns
  for (const pattern of allSurfacePatterns) {
    const sig = computeSignature(
      pattern.regex,
      pattern.predicate,
      pattern.family,
      'surface'
    );
    signatures.set(sig.hash, sig);

    byFamily.set(pattern.family, (byFamily.get(pattern.family) || 0) + 1);
    byPredicate.set(pattern.predicate, (byPredicate.get(pattern.predicate) || 0) + 1);
  }

  const total = depPatterns.length + allSurfacePatterns.length;

  console.log(`\n✓ Total patterns: ${total}`);
  console.log(`  - Dependency: ${depPatterns.length}`);
  console.log(`  - Surface: ${allSurfacePatterns.length}`);
  console.log(`  - Unique signatures: ${signatures.size}`);

  return {
    surface_patterns: allSurfacePatterns,
    dependency_patterns: depPatterns,
    signatures,
    by_family: byFamily,
    by_predicate: byPredicate,
    total
  };
}

/**
 * Save inventory to JSON files
 */
export async function saveInventory(inventory: InventoryResult): Promise<void> {
  const outputDir = path.join(process.cwd(), 'patterns');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save signatures
  const signaturesArray = Array.from(inventory.signatures.entries()).map(([hash, sig]) => ({
    hash,
    ...sig
  }));

  fs.writeFileSync(
    path.join(outputDir, '_signatures_all_relations.json'),
    JSON.stringify(signaturesArray, null, 2)
  );

  // Save patterns
  fs.writeFileSync(
    path.join(outputDir, '_existing_surface.json'),
    JSON.stringify(inventory.surface_patterns, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, '_existing_dependency.json'),
    JSON.stringify(inventory.dependency_patterns, null, 2)
  );

  // Save statistics
  const stats = {
    total: inventory.total,
    by_family: Object.fromEntries(inventory.by_family),
    by_predicate: Object.fromEntries(inventory.by_predicate),
    unique_signatures: inventory.signatures.size
  };

  fs.writeFileSync(
    path.join(outputDir, '_inventory_stats.json'),
    JSON.stringify(stats, null, 2)
  );

  console.log(`\n✓ Saved inventory to ${outputDir}/`);
}

// Main execution
if (require.main === module) {
  buildInventory()
    .then(saveInventory)
    .then(() => console.log('\n✓ Inventory complete!\n'))
    .catch(console.error);
}
