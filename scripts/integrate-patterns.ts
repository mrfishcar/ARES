#!/usr/bin/env tsx
/**
 * Integrate generated patterns into the extraction pipeline
 *
 * This script:
 * 1. Loads generated patterns from JSON files
 * 2. Converts them to the extraction format (adds subjectFirst)
 * 3. Appends them to dependency-paths.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface GeneratedPattern {
  id: string;
  signature_regex: string;
  predicate: string;
  family: string;
  dep_roles: string[];
  lemmas: string[];
  examples: string[];
}

interface PathPattern {
  signature: RegExp;
  predicate: string;
  subjectFirst: boolean;
}

/**
 * Infer subjectFirst from pattern structure
 *
 * Rules:
 * - If pattern has nsubj before obj/dobj: subjectFirst = true (active voice)
 * - If pattern has nsubjpass before agent: subjectFirst = false (passive voice)
 * - If pattern has appos: check what comes first
 */
function inferSubjectFirst(signatureRegex: string): boolean {
  // Passive voice indicators
  if (signatureRegex.includes('nsubjpass')) {
    return false;
  }

  // Active voice with agent (passive construction)
  if (signatureRegex.includes('agent') && signatureRegex.includes('by')) {
    return false;
  }

  // Check order of nsubj vs obj/dobj
  const nsubjIndex = signatureRegex.indexOf('nsubj');
  const objIndex = Math.min(
    signatureRegex.indexOf(':obj:') !== -1 ? signatureRegex.indexOf(':obj:') : Infinity,
    signatureRegex.indexOf(':dobj:') !== -1 ? signatureRegex.indexOf(':dobj:') : Infinity
  );

  if (nsubjIndex !== -1 && objIndex !== Infinity && nsubjIndex < objIndex) {
    return true; // Subject comes before object
  }

  // Appositive patterns - usually subject first
  if (signatureRegex.includes('appos')) {
    return true;
  }

  // Default to active voice
  return true;
}

/**
 * Convert generated pattern to PathPattern format
 */
function convertPattern(gen: GeneratedPattern): PathPattern {
  return {
    signature: new RegExp(`^${gen.signature_regex}$`),
    predicate: gen.predicate as any,
    subjectFirst: inferSubjectFirst(gen.signature_regex)
  };
}

/**
 * Load and convert patterns
 */
function loadPatterns(): PathPattern[] {
  const patternsPath = path.join(process.cwd(), 'patterns/new_dependency_patterns.json');

  if (!fs.existsSync(patternsPath)) {
    console.error(`❌ Pattern file not found: ${patternsPath}`);
    process.exit(1);
  }

  const generated: GeneratedPattern[] = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
  console.log(`📂 Loaded ${generated.length} generated patterns`);

  const converted = generated.map(convertPattern);
  console.log(`✓ Converted ${converted.length} patterns to PathPattern format`);

  return converted;
}

/**
 * Generate TypeScript code for patterns
 */
function generatePatternCode(patterns: PathPattern[]): string {
  const lines: string[] = [];

  lines.push('  // === GENERATED PATTERNS ===');
  lines.push('  // Auto-generated from scripts/integrate-patterns.ts');
  lines.push('');

  // Group by family
  const byFamily = new Map<string, PathPattern[]>();
  patterns.forEach((pattern, idx) => {
    const family = 'generated'; // We don't have family info in PathPattern
    if (!byFamily.has(family)) {
      byFamily.set(family, []);
    }
    byFamily.get(family)!.push(pattern);
  });

  for (const pattern of patterns) {
    // Extract the regex source (without ^ and $ which we'll add back)
    const regexSource = pattern.signature.source.replace(/^\^/, '').replace(/\$$/, '');
    const subjectFirstStr = pattern.subjectFirst.toString();

    lines.push(`  { signature: /^${regexSource}$/, predicate: '${pattern.predicate}', subjectFirst: ${subjectFirstStr} },`);
  }

  return lines.join('\n');
}

/**
 * Find the insertion point in dependency-paths.ts
 */
function findInsertionPoint(content: string): number {
  // Find the closing bracket of PATH_PATTERNS array
  const pathPatternsStart = content.indexOf('const PATH_PATTERNS: PathPattern[] = [');
  if (pathPatternsStart === -1) {
    throw new Error('Could not find PATH_PATTERNS array');
  }

  // Find the closing bracket - search backwards from the end
  const closingBracketPattern = /\n\];/g;
  let match;
  let lastMatch = -1;

  while ((match = closingBracketPattern.exec(content)) !== null) {
    if (match.index > pathPatternsStart) {
      lastMatch = match.index;
    }
  }

  if (lastMatch === -1) {
    throw new Error('Could not find closing bracket of PATH_PATTERNS');
  }

  return lastMatch;
}

/**
 * Main integration function
 */
async function integratePatterns() {
  console.log('🔧 Integrating generated patterns into extraction pipeline...\n');

  // 1. Load patterns
  const patterns = loadPatterns();

  // 2. Generate code
  const code = generatePatternCode(patterns);
  console.log(`✓ Generated ${code.split('\n').length} lines of code\n`);

  // 3. Read dependency-paths.ts
  const depPathsPath = path.join(process.cwd(), 'app/engine/extract/relations/dependency-paths.ts');
  let content = fs.readFileSync(depPathsPath, 'utf8');

  // 4. Check if already integrated
  if (content.includes('=== GENERATED PATTERNS ===')) {
    console.log('⚠️  Generated patterns already exist in dependency-paths.ts');
    console.log('   Remove the existing section first if you want to regenerate.\n');
    return;
  }

  // 5. Find insertion point
  const insertionPoint = findInsertionPoint(content);
  console.log(`✓ Found insertion point at position ${insertionPoint}\n`);

  // 6. Insert patterns
  const before = content.substring(0, insertionPoint);
  const after = content.substring(insertionPoint);
  const newContent = before + '\n\n' + code + '\n' + after;

  // 7. Write back
  fs.writeFileSync(depPathsPath, newContent, 'utf8');
  console.log(`✓ Integrated ${patterns.length} patterns into ${depPathsPath}\n`);

  // 8. Summary
  console.log('✅ Integration complete!');
  console.log(`   Added ${patterns.length} new dependency patterns to the extraction pipeline.`);
  console.log(`   Run tests to verify: npm test or npx tsx tests/demo-phase4.ts\n`);
}

// Run
if (require.main === module) {
  integratePatterns().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}
