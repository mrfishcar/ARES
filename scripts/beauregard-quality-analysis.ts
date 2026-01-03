/**
 * Beauregard Quality Extraction Analysis
 *
 * This script extracts from the first portion of the Barty Beauregard novel
 * and compares against expected entities and relations to identify gaps.
 */

import { appendDoc, clearStorage } from '../app/storage/storage';
import * as fs from 'fs';
import * as path from 'path';
import type { Entity, Relation } from '../app/engine/schema';

// Debug: Skip pattern library and entity filter to see raw extractions
process.env.SKIP_PATTERN_LIBRARY = '1';
process.env.ARES_ENTITY_FILTER = 'off';

// Expected entities from Chapter 1-2 (ground truth)
const EXPECTED_ENTITIES = [
  // Chapter 1 characters
  { name: 'Frederick', type: 'PERSON', description: 'the mail carrier' },
  { name: 'Saul', type: 'PERSON', description: 'the demon/King of Souls' },
  { name: 'Honey', type: 'PERSON', description: 'elderly woman watering lawn' },
  { name: 'Charles Garrison', type: 'PERSON', description: 'rich man in pool' },

  // Chapter 2 characters
  { name: 'Barty Beauregard', type: 'PERSON', description: 'protagonist, 13 years old' },
  { name: 'Andrew Beauregard', type: 'PERSON', description: "Barty's father" },
  { name: 'Dr. Wilson', type: 'PERSON', description: 'doctor who examined Barty' },
  { name: 'Preston Farrell', type: 'PERSON', description: '14 year old boy' },
  { name: 'Kelly Prescott', type: 'PERSON', description: 'popular girl' },
  { name: 'Beau Adams', type: 'PERSON', description: '15 year old bully' },
  { name: 'Mad Addy', type: 'PERSON', description: 'fortune teller' },

  // Places
  { name: 'Mont Linola Junior High', type: 'ORG', description: 'the school' },
  { name: 'Hell Hall', type: 'PLACE', description: 'abandoned corridor' },
  { name: 'Pool of Souls', type: 'PLACE', description: "Saul's mystical pool" },
];

// Expected relations
const EXPECTED_RELATIONS = [
  { subj: 'Andrew Beauregard', pred: 'parent_of', obj: 'Barty Beauregard' },
  { subj: 'Barty Beauregard', pred: 'child_of', obj: 'Andrew Beauregard' },
  { subj: 'Charles Garrison', pred: 'killed', obj: 'first wife' },
  { subj: 'Kelly Prescott', pred: 'dating', obj: 'Beau Adams' },
  { subj: 'Saul', pred: 'uncle_of', obj: 'niece' },
  { subj: 'Dr. Wilson', pred: 'examined', obj: 'Barty Beauregard' },
];

/**
 * Normalize text encoding for proper extraction
 * - Converts Windows-1252 curly quotes to ASCII equivalents
 * - Normalizes line endings
 * - Removes special characters that break tokenization
 */
function normalizeText(text: string): string {
  return text
    // Curly quotes to straight quotes
    .replace(/[\u2018\u2019\u201A\u201B\u0092]/g, "'")  // Single quotes
    .replace(/[\u201C\u201D\u201E\u201F\u0093\u0094]/g, '"')  // Double quotes
    // Em/en dashes to hyphens
    .replace(/[\u2013\u2014]/g, '-')
    // Normalize line endings
    .replace(/\r\n?/g, '\n')
    // Remove other problematic characters
    .replace(/[\u00A0]/g, ' ')  // Non-breaking space
    .replace(/[\u0085]/g, '\n');  // Next line character
}

async function analyzeQuality() {
  // Load the first portion of Beauregard (first ~15000 chars = ~2500 words = first 2 chapters)
  const filePath = path.join(__dirname, '..', 'Barty Beauregard and the Fabulous Fraud PLAIN TEXT.txt');
  const rawText = fs.readFileSync(filePath, 'latin1');  // Read as latin1 to preserve Windows-1252 chars
  const fullText = normalizeText(rawText);

  // Extract first portion (Chapters 1-2 need ~25000 chars for all expected entities)
  const sampleText = fullText.slice(0, 25000);  // Full chapters 1-2
  const wordCount = sampleText.split(/\s+/).length;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`BEAUREGARD QUALITY EXTRACTION ANALYSIS`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Sample: ${wordCount} words (first ~2 chapters)`);
  console.log(`${'='.repeat(70)}\n`);

  const storagePath = './data/beauregard-quality-test.json';
  clearStorage(storagePath);

  const start = Date.now();
  const result = await appendDoc('beauregard-quality', sampleText, storagePath);
  const elapsed = Date.now() - start;

  console.log(`\n--- EXTRACTION RESULTS ---`);
  console.log(`Time: ${elapsed}ms`);
  console.log(`Entities extracted: ${result.entities.length}`);
  console.log(`Relations extracted: ${result.relations.length}`);

  // Analyze entity coverage
  console.log(`\n--- ENTITY ANALYSIS ---`);
  const extractedNames = new Set(result.entities.map((e: Entity) => e.canonical.toLowerCase()));

  let foundEntities = 0;
  let missingEntities: string[] = [];

  for (const expected of EXPECTED_ENTITIES) {
    const found = result.entities.some((e: Entity) => {
      const canonical = e.canonical.toLowerCase();
      return canonical.includes(expected.name.toLowerCase()) ||
        expected.name.toLowerCase().includes(canonical);
    });
    if (found) {
      foundEntities++;
      console.log(`  ✅ ${expected.name} (${expected.type})`);
    } else {
      missingEntities.push(`${expected.name} (${expected.type}) - ${expected.description}`);
      console.log(`  ❌ MISSING: ${expected.name} (${expected.type}) - ${expected.description}`);
    }
  }

  console.log(`\nEntity Recall: ${foundEntities}/${EXPECTED_ENTITIES.length} (${(foundEntities/EXPECTED_ENTITIES.length*100).toFixed(1)}%)`);

  // Show all extracted entities
  console.log(`\n--- ALL EXTRACTED ENTITIES ---`);
  const byType: Record<string, string[]> = {};
  for (const e of result.entities as Entity[]) {
    if (!byType[e.type]) byType[e.type] = [];
    byType[e.type].push(e.canonical);
  }
  for (const [type, names] of Object.entries(byType).sort()) {
    console.log(`  ${type}: ${names.join(', ')}`);
  }

  // Analyze relation coverage
  console.log(`\n--- RELATION ANALYSIS ---`);
  let foundRelations = 0;
  let missingRelations: string[] = [];

  for (const expected of EXPECTED_RELATIONS) {
    const found = result.relations.some((r: Relation) =>
      r.subj.toLowerCase().includes(expected.subj.toLowerCase()) &&
      r.pred.toLowerCase().includes(expected.pred.toLowerCase())
    );
    if (found) {
      foundRelations++;
      console.log(`  ✅ ${expected.subj} --[${expected.pred}]--> ${expected.obj}`);
    } else {
      missingRelations.push(`${expected.subj} --[${expected.pred}]--> ${expected.obj}`);
      console.log(`  ❌ MISSING: ${expected.subj} --[${expected.pred}]--> ${expected.obj}`);
    }
  }

  console.log(`\nRelation Recall: ${foundRelations}/${EXPECTED_RELATIONS.length} (${(foundRelations/EXPECTED_RELATIONS.length*100).toFixed(1)}%)`);

  // Show all extracted relations
  console.log(`\n--- ALL EXTRACTED RELATIONS ---`);
  if (result.relations.length === 0) {
    console.log(`  (none extracted)`);
  } else {
    for (const r of result.relations as Relation[]) {
      console.log(`  ${r.subj} --[${r.pred}]--> ${r.obj}`);
    }
  }

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log(`QUALITY SUMMARY`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Entity Recall: ${(foundEntities/EXPECTED_ENTITIES.length*100).toFixed(1)}%`);
  console.log(`Relation Recall: ${(foundRelations/EXPECTED_RELATIONS.length*100).toFixed(1)}%`);
  console.log(`\nMissing Entities (${missingEntities.length}):`);
  missingEntities.forEach(e => console.log(`  - ${e}`));
  console.log(`\nMissing Relations (${missingRelations.length}):`);
  missingRelations.forEach(r => console.log(`  - ${r}`));
  console.log(`${'='.repeat(70)}\n`);

  return { foundEntities, foundRelations, missingEntities, missingRelations };
}

analyzeQuality().catch(console.error);
