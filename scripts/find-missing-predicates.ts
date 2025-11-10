#!/usr/bin/env tsx
/**
 * Find predicates used in generated patterns but missing from schema
 */

import * as fs from 'fs';
import * as path from 'path';

interface GeneratedPattern {
  predicate: string;
  family: string;
}

// Read schema to get existing predicates
function getExistingPredicates(): Set<string> {
  const schemaPath = path.join(process.cwd(), 'app/engine/schema.ts');
  const content = fs.readFileSync(schemaPath, 'utf8');

  const predicates = new Set<string>();

  // Extract from Predicate type definition
  const predicateTypeMatch = content.match(/export type Predicate =\s*\|?\s*'([^']+)'(\s*\|\s*'([^']+)')*/g);
  if (predicateTypeMatch) {
    // Extract all 'predicate_name' strings
    const matches = content.match(/'([^']+)'/g);
    if (matches) {
      // Find the start and end of the Predicate type
      const typeStart = content.indexOf('export type Predicate =');
      const typeEnd = content.indexOf(';', typeStart);
      const typeSection = content.substring(typeStart, typeEnd);

      const typeMatches = typeSection.match(/'([^']+)'/g);
      if (typeMatches) {
        typeMatches.forEach(match => {
          predicates.add(match.replace(/'/g, ''));
        });
      }
    }
  }

  return predicates;
}

// Read generated patterns
function getGeneratedPredicates(): Map<string, string> {
  const patternsPath = path.join(process.cwd(), 'patterns/new_dependency_patterns.json');
  const patterns: GeneratedPattern[] = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));

  const predicateToFamily = new Map<string, string>();
  patterns.forEach(p => {
    if (!predicateToFamily.has(p.predicate)) {
      predicateToFamily.set(p.predicate, p.family);
    }
  });

  return predicateToFamily;
}

function main() {
  console.log('🔍 Finding missing predicates...\n');

  const existing = getExistingPredicates();
  const generated = getGeneratedPredicates();

  console.log(`📊 Schema has ${existing.size} predicates`);
  console.log(`📊 Generated patterns use ${generated.size} predicates\n`);

  const missing: Array<{ predicate: string; family: string }> = [];

  for (const [predicate, family] of generated.entries()) {
    if (!existing.has(predicate)) {
      missing.push({ predicate, family });
    }
  }

  if (missing.length === 0) {
    console.log('✅ All predicates are in the schema!');
    return;
  }

  console.log(`❌ Found ${missing.length} missing predicates:\n`);

  // Group by family
  const byFamily = new Map<string, string[]>();
  missing.forEach(({ predicate, family }) => {
    if (!byFamily.has(family)) {
      byFamily.set(family, []);
    }
    byFamily.get(family)!.push(predicate);
  });

  // Print grouped
  for (const [family, predicates] of byFamily.entries()) {
    console.log(`\n${family.toUpperCase()} (${predicates.length}):`);
    predicates.sort().forEach(p => {
      console.log(`  | '${p}'`);
    });
  }

  // Generate schema addition code
  console.log('\n\n═══════════════════════════════════════');
  console.log('📝 Add these to Predicate type:\n');

  missing.sort((a, b) => a.family.localeCompare(b.family) || a.predicate.localeCompare(b.predicate));
  missing.forEach(({ predicate, family }) => {
    console.log(`  | '${predicate}'  // ${family}`);
  });

  console.log('\n\n═══════════════════════════════════════');
  console.log('📝 Add type guards for these predicates (example):\n');
  console.log('Add to GUARD object in schema.ts:\n');

  missing.slice(0, 5).forEach(({ predicate, family }) => {
    console.log(`  ${predicate}: { subj: ['PERSON', 'ORG'], obj: ['WORK', 'ITEM'] }, // ${family}`);
  });
  console.log('  // ... (add remaining predicates with appropriate type constraints)');
}

main();
