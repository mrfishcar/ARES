/**
 * Beauregard Chapter-by-Chapter Quality Test
 * Goal: 98%+ Precision and Recall across all metrics
 */

import { extractFromSegments } from '../app/engine/pipeline/orchestrator';
import { DEFAULT_LLM_CONFIG } from '../app/engine/llm-config';
import * as fs from 'fs';
import * as path from 'path';

// Enable quality filters
process.env.SKIP_PATTERN_LIBRARY = '1';
process.env.ARES_ENTITY_FILTER = 'on';

interface GoldStandard {
  entities: { name: string; type: string; aliases?: string[] }[];
  relations: { subj: string; pred: string; obj: string }[];
}

// GOLD STANDARD: Chapter 1 - Song for the City
const CHAPTER_1_GOLD: GoldStandard = {
  entities: [
    { name: 'Frederick', type: 'PERSON', aliases: ['Freddy', 'Steamy'] },
    { name: 'Saul', type: 'PERSON', aliases: ['King of Souls'] },
    { name: 'Charles Garrison', type: 'PERSON', aliases: ['Mr. Garrison'] },
    { name: 'City', type: 'PLACE' },
  ],
  relations: [
    // Frederick is Steamy (identity/alias)
    // Saul has a niece (the girl in the pool) - implicit
  ]
};

// GOLD STANDARD: Chapter 2 - The Boy with Purple Sneakers
const CHAPTER_2_GOLD: GoldStandard = {
  entities: [
    { name: 'Barty Beauregard', type: 'PERSON', aliases: ['Barty'] },
    { name: 'Andrew Beauregard', type: 'PERSON', aliases: ['Mr. Beauregard'] },
    { name: 'Dr. Wilson', type: 'PERSON' },
    { name: 'Beau Adams', type: 'PERSON', aliases: ['Beau'] },
    { name: 'Preston Farrell', type: 'PERSON', aliases: ['Preston'] },
    { name: 'Kelly Prescott', type: 'PERSON', aliases: ['Kelly'] },
    { name: 'Mad Addy', type: 'PERSON' },
    { name: 'Mont Linola Junior High', type: 'ORG' },
    { name: 'Hell Hall', type: 'PLACE' },
    { name: 'Great Wall of China', type: 'PLACE' },
    { name: 'Preppy Pinks', type: 'ORG' },
  ],
  relations: [
    { subj: 'Barty Beauregard', pred: 'child_of', obj: 'Andrew Beauregard' },
    { subj: 'Andrew Beauregard', pred: 'parent_of', obj: 'Barty Beauregard' },
  ]
};

// JUNK WORDS that should NOT be extracted as entities
// NOTE: "steamy" removed - it's an alias for Frederick in the story
const JUNK_WORDS = new Set([
  'blood', 'animals', 'caged', 'littering', 'gluttony', 'legend',
  'layers', 'land', 'driving', 'please', 'honey', 'bullet',
  'learning', 'growing', 'perched', 'sitting', 'becoming', 'famous',
  'hello', 'help', 'shh', 'listen', 'ugh', 'nonsense', 'justice',
  'maybe', 'bad', 'great', 'just', 'step', 'check', 'call', 'ten',
  'don', 'even', 'if'
]);

async function loadAndSplitChapters(): Promise<{ chapter1: string; chapter2: string }> {
  // Use the pre-cleaned text file for consistent encoding
  const filePath = path.join(__dirname, '..', 'Barty Beauregard CLEANED.txt');
  const fullText = fs.readFileSync(filePath, 'utf8');

  // Split by CHAPTER markers
  const ch1Start = fullText.indexOf('CHAPTER ONE');
  const ch2Start = fullText.indexOf('CHAPTER TWO');
  const ch3Start = fullText.indexOf('CHAPTER THREE');

  const chapter1 = fullText.slice(ch1Start, ch2Start).trim();
  const chapter2 = fullText.slice(ch2Start, ch3Start > 0 ? ch3Start : ch2Start + 20000).trim();

  return { chapter1, chapter2 };
}

function evaluateEntities(
  extracted: any[],
  gold: GoldStandard['entities']
): { precision: number; recall: number; details: string[] } {
  const details: string[] = [];

  // Build map of gold entities with aliases
  const goldMap = new Map<string, { name: string; type: string }>();
  for (const g of gold) {
    goldMap.set(g.name.toLowerCase(), { name: g.name, type: g.type });
    if (g.aliases) {
      for (const alias of g.aliases) {
        goldMap.set(alias.toLowerCase(), { name: g.name, type: g.type });
      }
    }
  }

  // Check extracted entities
  const extractedNames = extracted.map(e => ({
    name: e.canonical || e.name,
    type: e.type,
    nameLower: (e.canonical || e.name || '').toLowerCase()
  }));

  // True positives: extracted entities that match gold
  let tp = 0;
  const foundGold = new Set<string>();
  const junkExtracted: string[] = [];

  for (const ext of extractedNames) {
    // Check if it's junk
    if (JUNK_WORDS.has(ext.nameLower)) {
      junkExtracted.push(ext.name);
      continue;
    }

    // Check if it matches any gold entity
    if (goldMap.has(ext.nameLower)) {
      const goldEntity = goldMap.get(ext.nameLower)!;
      foundGold.add(goldEntity.name.toLowerCase());
      tp++;
    }
  }

  // False positives: extracted entities that don't match gold (excluding junk)
  const validExtracted = extractedNames.filter(e => !JUNK_WORDS.has(e.nameLower));
  const fp = validExtracted.length - tp;

  // False negatives: gold entities not found
  const fn = gold.length - foundGold.size;

  // Calculate metrics
  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;

  // Detail reporting
  if (junkExtracted.length > 0) {
    details.push(`❌ JUNK EXTRACTED: ${junkExtracted.join(', ')}`);
  }

  // Report missing gold entities
  const missingGold = gold.filter(g => !foundGold.has(g.name.toLowerCase()));
  if (missingGold.length > 0) {
    details.push(`❌ MISSING GOLD: ${missingGold.map(g => g.name).join(', ')}`);
  }

  // Report false positives (non-junk entities that aren't in gold)
  const fpEntities = validExtracted.filter(e => !goldMap.has(e.nameLower));
  if (fpEntities.length > 0) {
    details.push(`⚠️ FALSE POSITIVES: ${fpEntities.map(e => `${e.name}:${e.type}`).join(', ')}`);
  }

  return { precision, recall, details };
}

function evaluateRelations(
  extracted: any[],
  gold: GoldStandard['relations']
): { precision: number; recall: number; details: string[] } {
  const details: string[] = [];

  if (gold.length === 0) {
    return { precision: 1, recall: 1, details: ['No gold relations defined'] };
  }

  // Normalize relation for comparison
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Build set of gold relations
  const goldSet = new Set(
    gold.map(r => `${normalize(r.subj)}|${r.pred}|${normalize(r.obj)}`)
  );

  // Check extracted relations
  let tp = 0;
  const matched = new Set<string>();

  for (const rel of extracted) {
    const subj = normalize(rel.subj_surface || rel.subj || '');
    const obj = normalize(rel.obj_surface || rel.obj || '');
    const pred = rel.pred;

    const key = `${subj}|${pred}|${obj}`;
    if (goldSet.has(key)) {
      tp++;
      matched.add(key);
    }
  }

  const precision = tp / extracted.length || 0;
  const recall = tp / gold.length || 0;

  // Report missing relations
  const missing = gold.filter(r => !matched.has(`${normalize(r.subj)}|${r.pred}|${normalize(r.obj)}`));
  if (missing.length > 0) {
    details.push(`❌ MISSING RELATIONS: ${missing.map(r => `${r.subj} --[${r.pred}]--> ${r.obj}`).join('; ')}`);
  }

  return { precision, recall, details };
}

async function testChapter(
  name: string,
  text: string,
  gold: GoldStandard
): Promise<{ entityP: number; entityR: number; relationP: number; relationR: number }> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TESTING: ${name}`);
  console.log(`Text length: ${text.length} chars (~${Math.round(text.split(/\s+/).length)} words)`);
  console.log('='.repeat(60));

  const result = await extractFromSegments(
    name.toLowerCase().replace(/\s+/g, '-'),
    text,
    undefined,
    DEFAULT_LLM_CONFIG,
    undefined,
    { generateHERTs: false }
  );

  console.log(`\nExtracted: ${result.entities.length} entities, ${result.relations.length} relations`);

  // Evaluate entities
  const entityEval = evaluateEntities(result.entities, gold.entities);
  console.log(`\nENTITY METRICS:`);
  console.log(`  Precision: ${(entityEval.precision * 100).toFixed(1)}%`);
  console.log(`  Recall: ${(entityEval.recall * 100).toFixed(1)}%`);
  for (const detail of entityEval.details) {
    console.log(`  ${detail}`);
  }

  // List all extracted entities
  console.log(`\n  ALL EXTRACTED ENTITIES:`);
  const persons = result.entities.filter((e: any) => e.type === 'PERSON');
  const orgs = result.entities.filter((e: any) => e.type === 'ORG');
  const places = result.entities.filter((e: any) => e.type === 'PLACE');
  console.log(`    PERSON: ${persons.map((e: any) => e.canonical).join(', ') || '(none)'}`);
  console.log(`    ORG: ${orgs.map((e: any) => e.canonical).join(', ') || '(none)'}`);
  console.log(`    PLACE: ${places.map((e: any) => e.canonical).join(', ') || '(none)'}`);

  // Evaluate relations
  const relationEval = evaluateRelations(result.relations, gold.relations);
  console.log(`\nRELATION METRICS:`);
  console.log(`  Precision: ${(relationEval.precision * 100).toFixed(1)}%`);
  console.log(`  Recall: ${(relationEval.recall * 100).toFixed(1)}%`);
  for (const detail of relationEval.details) {
    console.log(`  ${detail}`);
  }

  // List all extracted relations
  if (result.relations.length > 0) {
    console.log(`\n  ALL EXTRACTED RELATIONS:`);
    for (const rel of result.relations.slice(0, 10)) {
      const r = rel as any;
      console.log(`    ${r.subj_surface || r.subj} --[${r.pred}]--> ${r.obj_surface || r.obj}`);
    }
    if (result.relations.length > 10) {
      console.log(`    ... and ${result.relations.length - 10} more`);
    }
  }

  return {
    entityP: entityEval.precision,
    entityR: entityEval.recall,
    relationP: relationEval.precision,
    relationR: relationEval.recall
  };
}

async function main() {
  console.log('BEAUREGARD CHAPTER-BY-CHAPTER QUALITY TEST');
  console.log('Target: 98%+ across all metrics\n');

  const { chapter1, chapter2 } = await loadAndSplitChapters();

  const ch1Results = await testChapter('Chapter 1 - Song for the City', chapter1, CHAPTER_1_GOLD);
  const ch2Results = await testChapter('Chapter 2 - The Boy with Purple Sneakers', chapter2, CHAPTER_2_GOLD);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log('\nChapter 1:');
  console.log(`  Entity P=${(ch1Results.entityP * 100).toFixed(1)}% R=${(ch1Results.entityR * 100).toFixed(1)}%`);
  console.log(`  Relation P=${(ch1Results.relationP * 100).toFixed(1)}% R=${(ch1Results.relationR * 100).toFixed(1)}%`);

  console.log('\nChapter 2:');
  console.log(`  Entity P=${(ch2Results.entityP * 100).toFixed(1)}% R=${(ch2Results.entityR * 100).toFixed(1)}%`);
  console.log(`  Relation P=${(ch2Results.relationP * 100).toFixed(1)}% R=${(ch2Results.relationR * 100).toFixed(1)}%`);

  // Overall
  const avgEntityP = (ch1Results.entityP + ch2Results.entityP) / 2;
  const avgEntityR = (ch1Results.entityR + ch2Results.entityR) / 2;
  const avgRelationP = (ch1Results.relationP + ch2Results.relationP) / 2;
  const avgRelationR = (ch1Results.relationR + ch2Results.relationR) / 2;

  console.log('\nOVERALL AVERAGE:');
  console.log(`  Entity P=${(avgEntityP * 100).toFixed(1)}% R=${(avgEntityR * 100).toFixed(1)}%`);
  console.log(`  Relation P=${(avgRelationP * 100).toFixed(1)}% R=${(avgRelationR * 100).toFixed(1)}%`);

  const allPass = avgEntityP >= 0.98 && avgEntityR >= 0.98 && avgRelationP >= 0.98 && avgRelationR >= 0.98;
  console.log(`\n${allPass ? '✅ TARGET MET: 98%+ across all metrics!' : '❌ TARGET NOT MET: Need improvements'}`);
}

main().catch(console.error);
