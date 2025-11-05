/**
 * Demo: Generate wiki pages from 1 Samuel biblical text
 * Demonstrates salience-ranked Overview, deterministic Infobox, and segmented extraction
 */

import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import { compose } from '../app/generate/exposition';
import { toMarkdownPage } from '../app/generate/markdown';
import * as path from 'path';
import * as fs from 'fs';

async function generate1SamuelDemo() {
  const testPath = path.join(process.cwd(), 'demo-1samuel.json');
  const textPath = path.join(process.cwd(), 'data', '1_samuel.txt');

  console.log('\n📖 1 SAMUEL WIKI GENERATION DEMO\n');
  console.log('━'.repeat(90));

  // Clean slate
  clearStorage(testPath);

  // Read the 1 Samuel text
  console.log('\n📚 Reading 1 Samuel text file...\n');
  const fullText = fs.readFileSync(textPath, 'utf-8');
  const textLength = fullText.length;
  const lineCount = fullText.split('\n').length;
  console.log(`✓ Loaded ${textLength} characters (${lineCount} lines)\n`);

  // Ingest the text (will use segmented extraction)
  console.log('🔄 Ingesting text with segmented extraction...\n');
  const startTime = Date.now();
  await appendDoc('1_samuel', fullText, testPath);
  const elapsedMs = Date.now() - startTime;
  console.log(`✓ Ingestion complete in ${elapsedMs}ms\n`);

  // Load graph
  const graph = loadGraph(testPath);
  if (!graph) {
    console.log('❌ Failed to load graph');
    return;
  }

  console.log('📊 KNOWLEDGE GRAPH STATISTICS:\n');
  console.log(`  Entities: ${graph.entities.length}`);
  console.log(`  Relations: ${graph.relations.length}`);
  console.log(`  Conflicts: ${graph.conflicts.length}\n`);

  // Show entity type breakdown
  const entityTypes = new Map<string, number>();
  for (const entity of graph.entities) {
    const count = entityTypes.get(entity.type) || 0;
    entityTypes.set(entity.type, count + 1);
  }
  console.log('  Entity Types:');
  for (const [type, count] of Array.from(entityTypes.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`);
  }
  console.log();

  // Find key biblical figures
  const keyFigures = [
    'Samuel',
    'Hannah',
    'Elkanah',
    'Eli',
    'Saul',
    'David',
    'Jonathan',
    'Jesse'
  ];

  console.log('🔍 SEARCHING FOR KEY BIBLICAL FIGURES:\n');
  const foundEntities: Array<{name: string; entity: any}> = [];

  for (const figureName of keyFigures) {
    const entity = graph.entities.find(e =>
      e.canonical === figureName ||
      e.aliases.includes(figureName) ||
      e.canonical.toLowerCase() === figureName.toLowerCase() ||
      e.aliases.some(a => a.toLowerCase() === figureName.toLowerCase())
    );

    if (entity) {
      const relationCount = graph.relations.filter(r =>
        r.subj === entity.id || r.obj === entity.id
      ).length;
      console.log(`  ✓ ${entity.canonical} (${entity.type}) - ${relationCount} relations`);
      foundEntities.push({ name: entity.canonical, entity });
    } else {
      console.log(`  ✗ ${figureName} - not found`);
    }
  }
  console.log();

  // Generate pages for top 3 figures with most relations
  const sortedFigures = foundEntities
    .map(f => ({
      ...f,
      relationCount: graph.relations.filter(r =>
        r.subj === f.entity.id || r.obj === f.entity.id
      ).length
    }))
    .sort((a, b) => b.relationCount - a.relationCount)
    .slice(0, 3);

  console.log(`📝 GENERATING WIKI PAGES FOR TOP ${sortedFigures.length} FIGURES:\n`);
  console.log('━'.repeat(90));

  for (const figure of sortedFigures) {
    console.log(`\n# ${figure.name.toUpperCase()}\n`);
    console.log(`Relations: ${figure.relationCount}\n`);

    const page = compose(figure.entity.id, graph.entities, graph.relations, graph.conflicts);
    const markdown = toMarkdownPage(page);

    console.log(markdown);
    console.log('\n' + '─'.repeat(90));

    // Quality analysis
    console.log('\n📊 PAGE QUALITY METRICS:\n');

    // Overview analysis
    const overviewSentences = page.overview.split(/[.!?]\s+/).filter(s => s.trim().length > 0);
    console.log('📝 Overview:');
    console.log(`  Sentences: ${overviewSentences.length} (target: 2-3)`);
    console.log(`  Contains dates: ${/\d{4}/.test(page.overview) ? 'YES' : 'NO'}`);
    console.log(`  Length: ${page.overview.length} characters`);

    // Infobox analysis
    console.log('\n📋 Infobox:');
    console.log(`  Total fields: ${Object.keys(page.infobox).length}`);
    if (page.infobox.aliases && page.infobox.aliases.length > 0) {
      console.log(`  Aliases: ${page.infobox.aliases.join(', ')}`);
    }
    if (page.infobox.relatives && page.infobox.relatives.length > 0) {
      console.log('  Relatives ordering:');
      page.infobox.relatives.forEach((rel, i) => {
        console.log(`    ${i + 1}. ${rel}`);
      });
    }
    if (page.infobox.titles && page.infobox.titles.length > 0) {
      console.log(`  Titles: ${page.infobox.titles.join(', ')}`);
    }

    // Section analysis
    console.log('\n📑 Sections:');
    if (page.biography) {
      const bioSentences = page.biography.split(/[.!?]/).filter(s => s.trim()).length;
      console.log(`  Biography: ${bioSentences} sentences`);
    } else {
      console.log('  Biography: Empty');
    }
    console.log(`  Relationships: ${page.sections.relationships.length} items`);
    console.log(`  Affiliations: ${page.sections.affiliations.length} items`);
    console.log(`  Items: ${page.sections.items.length} items`);

    // Deduplication check
    console.log('\n🔍 Deduplication Check:');
    const overviewLower = page.overview.toLowerCase();
    const biographyLower = (page.biography || '').toLowerCase();
    const relationshipsText = page.sections.relationships.join(' ').toLowerCase();

    // Check for marriage duplication
    if (overviewLower.includes('married') || biographyLower.includes('married')) {
      const inOverview = overviewLower.includes('married');
      const inBiography = biographyLower.includes('married');
      const inRelationships = relationshipsText.includes('married');
      console.log('  Marriage facts:');
      console.log(`    Overview: ${inOverview ? 'YES' : 'NO'}`);
      console.log(`    Biography: ${inBiography ? 'YES' : 'NO'}`);
      console.log(`    Relationships: ${inRelationships ? 'DUPLICATE!' : 'NO (suppressed)'}`);
    }

    // Check for parent/child duplication
    if (overviewLower.includes('son of') || overviewLower.includes('daughter of') ||
        biographyLower.includes('son of') || biographyLower.includes('daughter of')) {
      const inOverview = overviewLower.includes('son of') || overviewLower.includes('daughter of');
      const inBiography = biographyLower.includes('son of') || biographyLower.includes('daughter of');
      const inRelationships = relationshipsText.includes('son of') || relationshipsText.includes('daughter of');
      console.log('  Parent/Child facts:');
      console.log(`    Overview: ${inOverview ? 'YES' : 'NO'}`);
      console.log(`    Biography: ${inBiography ? 'YES' : 'NO'}`);
      console.log(`    Relationships: ${inRelationships ? 'DUPLICATE!' : 'NO (suppressed)'}`);
    }

    console.log('\n' + '━'.repeat(90));
  }

  console.log('\n✅ DEMO COMPLETE!\n');
  console.log('Key Improvements Demonstrated:');
  console.log('  ✓ Segmented extraction with context windows');
  console.log('  ✓ Salience-ranked 2-3 sentence overviews');
  console.log('  ✓ Deterministic Infobox field ordering');
  console.log('  ✓ Deduplication by object_id');
  console.log('  ✓ Section suppression preventing repetition');
  console.log('  ✓ Dated facts prioritized over undated\n');

  // Cleanup
  clearStorage(testPath);
}

generate1SamuelDemo().catch(console.error);
