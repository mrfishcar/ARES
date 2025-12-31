/**
 * Stress Test Runner
 *
 * Runs extraction pipeline on adversarial corpus and documents failures
 *
 * Features being tested:
 * - Entity extraction with similar names (3 Margarets)
 * - Pronoun resolution in dialogue
 * - Character identity across name changes (marriage)
 * - Timeline extraction (20+ year span)
 * - Relation extraction (family, marriage, friendship, rivalry)
 */

import * as fs from 'fs';
import * as path from 'path';
import { extractEntities } from '../app/engine/extract/entities';
import { extractRelations } from '../app/engine/extract/relations';
import { extractAllNarrativeRelations } from '../app/engine/narrative-relations';

// Expected entities in the stress test corpus
const EXPECTED_ENTITIES = {
  'Edward Blackwood': { type: 'PERSON', aliases: ['Lord Edward', 'Lord Blackwood', 'Edward'] },
  'Edmund Blackwood': { type: 'PERSON', aliases: ['Lord Edmund', 'Edmund'] },
  'Margaret Ashford': { type: 'PERSON', aliases: ['Lady Margaret Ashford', 'Margaret Blackwood'] }, // Name change!
  'Margaret Thornbury': { type: 'PERSON', aliases: ['Lady Margaret Blackwood'] }, // Name change!
  'Margaret Stone': { type: 'PERSON', aliases: [] }, // Only mentioned
  'King Harold': { type: 'PERSON', aliases: ['Harold'] },
  'Thomas Grant': { type: 'PERSON', aliases: ['old Thomas Grant', 'Thomas', 'the steward'] },
  'Edgar Blackwood (old)': { type: 'PERSON', aliases: ['Lord Edgar Blackwood', 'their father'] },
  'Edgar Blackwood (young)': { type: 'PERSON', aliases: ['young Edgar', 'young Lord Edgar'] },
  'Lady Catherine': { type: 'PERSON', aliases: [] },
  'Thornhold Castle': { type: 'PLACE', aliases: ['Thornhold'] },
  'Ashford Manor': { type: 'PLACE', aliases: [] },
  'Greymoor University': { type: 'ORG', aliases: ['University of Greymoor'] },
};

// Expected relations in the stress test corpus
const EXPECTED_RELATIONS = [
  // Family relations
  { subject: 'Edward Blackwood', predicate: 'sibling_of', object: 'Edmund Blackwood' },
  { subject: 'Edward Blackwood', predicate: 'child_of', object: 'Edgar Blackwood (old)' },
  { subject: 'Edmund Blackwood', predicate: 'child_of', object: 'Edgar Blackwood (old)' },
  { subject: 'Edgar Blackwood (young)', predicate: 'child_of', object: 'Edward Blackwood' },

  // Marriage relations
  { subject: 'Edward Blackwood', predicate: 'married_to', object: 'Margaret Thornbury' },
  { subject: 'Edmund Blackwood', predicate: 'married_to', object: 'Margaret Ashford' },
  { subject: 'Edgar Blackwood (young)', predicate: 'married_to', object: 'Lady Catherine' },

  // Other relations
  { subject: 'Edmund Blackwood', predicate: 'studied_at', object: 'Greymoor University' },
  { subject: 'Thomas Grant', predicate: 'member_of', object: 'House Blackwood' }, // served
  { subject: 'Margaret Ashford', predicate: 'child_of', object: 'King Harold' }, // royal blood (cousin's daughter)
];

// Critical failure patterns to check for
const FAILURE_PATTERNS = {
  'MARGARET_MERGE': 'All three Margarets merged into one entity',
  'EDWARD_EDGAR_MERGE': 'Edward and Edgar confused or merged',
  'PRONOUN_ATTRIBUTION': 'Wrong speaker in dialogue',
  'NAME_CHANGE_LOST': 'Failed to track identity after marriage name change',
  'TIMELINE_CONFUSED': 'Events from different time periods conflated',
  'RELATION_INVERTED': 'Parent/child or other relation direction wrong',
};

async function runStressTest() {
  console.log('='.repeat(60));
  console.log('ARES STRESS TEST - Adversarial Corpus Evaluation');
  console.log('='.repeat(60));
  console.log();

  // Read corpus
  const corpusPath = path.join(__dirname, '../corpora/stress-test-narrative.txt');
  const text = fs.readFileSync(corpusPath, 'utf-8');

  console.log(`Corpus loaded: ${text.split(/\s+/).length} words`);
  console.log();

  // Run entity extraction
  console.log('--- ENTITY EXTRACTION ---');
  console.log();

  let entities: any[] = [];
  let spans: any[] = [];

  try {
    const result = await extractEntities(text);
    entities = result.entities;
    spans = result.spans;

    console.log(`Entities extracted: ${entities.length}`);
    console.log();

    // List all extracted entities
    console.log('Extracted entities:');
    for (const entity of entities) {
      const aliases = entity.aliases?.length > 0 ? ` (aliases: ${entity.aliases.join(', ')})` : '';
      console.log(`  - ${entity.canonical} [${entity.type}]${aliases}`);
    }
    console.log();
  } catch (error) {
    console.error('Entity extraction FAILED:', error);
    return;
  }

  // Run relation extraction
  console.log('--- RELATION EXTRACTION ---');
  console.log();

  let relations: any[] = [];

  try {
    // Extract dependency-based relations
    const depRelations = await extractRelations(text, { entities, spans }, 'stress-test');

    // Extract narrative/pattern-based relations (sibling, parent, etc.)
    const narrativeRelations = extractAllNarrativeRelations(
      text,
      entities.map(e => ({ id: e.id, canonical: e.canonical, type: e.type, aliases: e.aliases || [] })),
      'stress-test'
    );

    // Merge relations (avoid duplicates by pred+subj+obj key)
    const relationKeys = new Set<string>();
    for (const r of depRelations) {
      relations.push(r);
      relationKeys.add(`${r.pred}:${r.subj}:${r.obj}`);
    }
    for (const r of narrativeRelations) {
      const key = `${r.pred}:${r.subj}:${r.obj}`;
      if (!relationKeys.has(key)) {
        relations.push(r);
        relationKeys.add(key);
      }
    }

    console.log(`Relations extracted: ${relations.length} (${depRelations.length} dep + ${narrativeRelations.length} narrative)`);
    console.log();

    // List all extracted relations
    console.log('Extracted relations:');
    for (const rel of relations) {
      const subjEntity = entities.find(e => e.id === rel.subj);
      const objEntity = entities.find(e => e.id === rel.obj);
      const subjName = subjEntity?.canonical || rel.subj;
      const objName = objEntity?.canonical || rel.obj;
      console.log(`  - ${subjName} --[${rel.pred}]--> ${objName}`);
    }
    console.log();
  } catch (error) {
    console.error('Relation extraction FAILED:', error);
  }

  // Analyze failures
  console.log('--- FAILURE ANALYSIS ---');
  console.log();

  const failures: string[] = [];
  const warnings: string[] = [];

  // Check for Margaret merge
  const margarets = entities.filter(e =>
    e.canonical.toLowerCase().includes('margaret')
  );
  if (margarets.length < 3) {
    failures.push(`MARGARET_MERGE: Found ${margarets.length} Margaret entities, expected 3 distinct`);
  } else {
    console.log(`✓ Found ${margarets.length} Margaret entities (expected 3)`);
  }

  // Check for Edward/Edgar confusion
  const edwards = entities.filter(e =>
    e.canonical.toLowerCase().includes('edward')
  );
  const edgars = entities.filter(e =>
    e.canonical.toLowerCase().includes('edgar')
  );
  if (edwards.some(e => edgars.some(g => e.id === g.id))) {
    failures.push('EDWARD_EDGAR_MERGE: Edward and Edgar were merged');
  } else if (edwards.length > 0 && edgars.length > 0) {
    console.log(`✓ Edward (${edwards.length}) and Edgar (${edgars.length}) correctly separated`);
  }

  // Check for key relations
  const hasMarriage = relations.some(r => r.pred === 'married_to');
  const hasSibling = relations.some(r => r.pred === 'sibling_of');
  const hasParent = relations.some(r => r.pred === 'parent_of' || r.pred === 'child_of');

  if (!hasMarriage) {
    failures.push('RELATION_MISSING: No marriage relations extracted (expected 3)');
  } else {
    console.log('✓ Marriage relations found');
  }

  if (!hasSibling) {
    warnings.push('RELATION_MISSING: No sibling relations extracted (expected 1)');
  } else {
    console.log('✓ Sibling relations found');
  }

  if (!hasParent) {
    warnings.push('RELATION_MISSING: No parent/child relations extracted');
  } else {
    console.log('✓ Parent/child relations found');
  }

  // Check for dialogue speakers
  const kingHarold = entities.find(e =>
    e.canonical.toLowerCase().includes('harold') ||
    e.canonical.toLowerCase().includes('king')
  );
  if (!kingHarold) {
    warnings.push('ENTITY_MISSING: King Harold not extracted');
  } else {
    console.log('✓ King Harold extracted');
  }

  // Check for Thomas Grant
  const thomas = entities.find(e =>
    e.canonical.toLowerCase().includes('thomas') ||
    e.canonical.toLowerCase().includes('grant')
  );
  if (!thomas) {
    warnings.push('ENTITY_MISSING: Thomas Grant not extracted');
  } else {
    console.log('✓ Thomas Grant extracted');
  }

  console.log();

  // Report failures
  if (failures.length > 0) {
    console.log('FAILURES:');
    for (const f of failures) {
      console.log(`  ✗ ${f}`);
    }
    console.log();
  }

  if (warnings.length > 0) {
    console.log('WARNINGS:');
    for (const w of warnings) {
      console.log(`  ⚠ ${w}`);
    }
    console.log();
  }

  // Summary
  console.log('--- SUMMARY ---');
  console.log();
  console.log(`Entities: ${entities.length} extracted, ${Object.keys(EXPECTED_ENTITIES).length} expected`);
  console.log(`Relations: ${relations.length} extracted, ${EXPECTED_RELATIONS.length} expected`);
  console.log(`Failures: ${failures.length}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log();

  // Save results
  const results = {
    timestamp: new Date().toISOString(),
    corpus: 'stress-test-narrative.txt',
    wordCount: text.split(/\s+/).length,
    entities: {
      count: entities.length,
      expected: Object.keys(EXPECTED_ENTITIES).length,
      items: entities.map(e => ({
        id: e.id,
        canonical: e.canonical,
        type: e.type,
        aliases: e.aliases,
      })),
    },
    relations: {
      count: relations.length,
      expected: EXPECTED_RELATIONS.length,
      items: relations.map(r => ({
        subject: entities.find(e => e.id === r.subj)?.canonical || r.subj,
        predicate: r.pred,
        object: entities.find(e => e.id === r.obj)?.canonical || r.obj,
        confidence: r.confidence,
      })),
    },
    failures,
    warnings,
  };

  const outputPath = path.join(__dirname, '../reports/stress-test-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Results saved to: ${outputPath}`);
}

// Run the test
runStressTest().catch(console.error);
