#!/usr/bin/env tsx
/**
 * Automatically add missing predicates to schema.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface PredicateInfo {
  predicate: string;
  family: string;
}

// Type guard defaults based on family
const FAMILY_TYPE_GUARDS: Record<string, { subj: string[]; obj: string[] }> = {
  kinship: { subj: ['PERSON'], obj: ['PERSON'] },
  ownership: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG', 'PLACE', 'ITEM', 'WORK'] },
  employment: { subj: ['PERSON'], obj: ['ORG', 'PLACE'] },
  creation: { subj: ['PERSON', 'ORG'], obj: ['WORK', 'ITEM', 'PLACE'] },
  location: { subj: ['PERSON', 'ORG', 'PLACE', 'ITEM'], obj: ['PLACE', 'ORG'] },
  temporal: { subj: ['PERSON', 'ORG', 'EVENT', 'WORK'], obj: ['PERSON', 'ORG', 'EVENT', 'WORK'] },
  causation: { subj: ['PERSON', 'ORG', 'EVENT'], obj: ['PERSON', 'ORG', 'EVENT', 'WORK'] },
  part_whole: { subj: ['PERSON', 'ORG', 'PLACE', 'ITEM'], obj: ['PERSON', 'ORG', 'PLACE', 'ITEM'] },
  identity: { subj: ['PERSON', 'ORG', 'PLACE', 'ITEM'], obj: ['PERSON', 'ORG', 'PLACE', 'ITEM'] },
  event: { subj: ['PERSON', 'ORG'], obj: ['EVENT', 'PLACE'] },
  communication: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] },
  power: { subj: ['PERSON', 'ORG'], obj: ['ORG', 'PLACE', 'PERSON'] },
  comparison: { subj: ['PERSON', 'ORG', 'PLACE', 'ITEM'], obj: ['PERSON', 'ORG', 'PLACE', 'ITEM'] },
  emotional: { subj: ['PERSON'], obj: ['PERSON'] },
  negation: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG', 'WORK', 'EVENT'] },
};

function getGeneratedPredicates(): PredicateInfo[] {
  const patternsPath = path.join(process.cwd(), 'patterns/new_dependency_patterns.json');
  const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));

  const predicateMap = new Map<string, string>();
  patterns.forEach((p: any) => {
    if (!predicateMap.has(p.predicate)) {
      predicateMap.set(p.predicate, p.family);
    }
  });

  return Array.from(predicateMap.entries()).map(([predicate, family]) => ({ predicate, family }));
}

function getExistingPredicates(schemaContent: string): Set<string> {
  const predicates = new Set<string>();
  const typeStart = schemaContent.indexOf('export type Predicate =');
  const typeEnd = schemaContent.indexOf(';', typeStart);
  const typeSection = schemaContent.substring(typeStart, typeEnd);

  const matches = typeSection.match(/'([^']+)'/g);
  if (matches) {
    matches.forEach(match => {
      predicates.add(match.replace(/'/g, ''));
    });
  }

  return predicates;
}

function main() {
  console.log('🔧 Adding missing predicates to schema...\n');

  const schemaPath = path.join(process.cwd(), 'app/engine/schema.ts');
  let content = fs.readFileSync(schemaPath, 'utf8');

  const existing = getExistingPredicates(content);
  const generated = getGeneratedPredicates();

  const missing = generated.filter(({ predicate }) => !existing.has(predicate));

  if (missing.length === 0) {
    console.log('✅ All predicates already exist!');
    return;
  }

  console.log(`Adding ${missing.length} missing predicates...`);

  // 1. Add to Predicate type
  const predicateTypeEnd = content.indexOf(';', content.indexOf('export type Predicate ='));
  const predicateLines = missing.map(({ predicate, family }) => `  | '${predicate}'  // ${family}`).join('\n');

  const beforeType = content.substring(0, predicateTypeEnd);
  const afterType = content.substring(predicateTypeEnd);
  content = beforeType + '\n' + predicateLines + afterType;

  console.log(`✓ Added ${missing.length} predicates to Predicate type`);

  // 2. Add to GUARD object
  const guardStart = content.indexOf('export const GUARD: Record<Predicate, { subj: EntityType[]; obj: EntityType[] }> = {');
  const guardEnd = content.indexOf('};', guardStart);

  const guardLines = missing.map(({ predicate, family }) => {
    const guard = FAMILY_TYPE_GUARDS[family] || { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG', 'ITEM'] };
    const subjStr = JSON.stringify(guard.subj).replace(/"/g, "'");
    const objStr = JSON.stringify(guard.obj).replace(/"/g, "'");
    return `  ${predicate}: { subj: ${subjStr}, obj: ${objStr} }, // ${family}`;
  }).join('\n');

  const beforeGuard = content.substring(0, guardEnd);
  const afterGuard = content.substring(guardEnd);
  content = beforeGuard + '\n' + guardLines + '\n' + afterGuard;

  console.log(`✓ Added ${missing.length} type guards to GUARD object`);

  // 3. Add INVERSE mappings for bidirectional relations
  const inverseStart = content.indexOf('export const INVERSE: Partial<Record<Predicate, Predicate>> = {');
  const inverseEnd = content.indexOf('};', inverseStart);

  const inverseLines: string[] = [];
  missing.forEach(({ predicate, family }) => {
    // Add inverse for *_by predicates
    if (predicate.endsWith('_by')) {
      const base = predicate.replace(/_by$/, '');
      inverseLines.push(`  ${predicate}: '${base}' as Predicate,`);
      inverseLines.push(`  ${base}: '${predicate}' as Predicate,`);
    }
    // Add inverse for directional relations
    if (family === 'kinship' && ['ancestor_of', 'descendant_of'].includes(predicate)) {
      const inverse = predicate === 'ancestor_of' ? 'descendant_of' : 'ancestor_of';
      inverseLines.push(`  ${predicate}: '${inverse}',`);
    }
  });

  if (inverseLines.length > 0) {
    const beforeInverse = content.substring(0, inverseEnd);
    const afterInverse = content.substring(inverseEnd);
    content = beforeInverse + '\n' + inverseLines.join('\n') + '\n' + afterInverse;
    console.log(`✓ Added ${inverseLines.length} inverse mappings`);
  }

  // 4. Write back
  fs.writeFileSync(schemaPath, content, 'utf8');

  console.log(`\n✅ Successfully added ${missing.length} predicates to schema.ts!`);
  console.log(`   Run TypeScript compiler to verify: npx tsc --noEmit\n`);
}

main();
