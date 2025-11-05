/**
 * Demo: Generate improved David wiki page
 * Demonstrates salience-ranked Overview and deterministic Infobox
 */

import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import { compose } from '../app/generate/exposition';
import { toMarkdownPage } from '../app/generate/markdown';
import * as path from 'path';

async function generateDavidDemo() {
  const testPath = path.join(process.cwd(), 'demo-david.json');

  console.log('\n🔍 Generating David wiki page with improved quality...\n');

  // Clean slate
  clearStorage(testPath);

  console.log('📚 Ingesting David biographical data...\n');

  // Ingest rich biographical data about David
  await appendDoc('doc1', 'David, son of Jesse, was born in Bethlehem in 1040 BCE.', testPath);
  await appendDoc('doc2', 'David married Michal, daughter of Saul, in 1025 BCE.', testPath);
  await appendDoc('doc3', 'David became king of Israel and ruled Israel in 1010 BCE.', testPath);
  await appendDoc('doc4', 'David fought in the Battle of the Valley of Elah in 1020 BCE.', testPath);
  await appendDoc('doc5', 'David traveled to Hebron in 1015 BCE.', testPath);
  await appendDoc('doc6', 'David was an enemy of Goliath, the Philistine warrior.', testPath);
  await appendDoc('doc7', 'David authored the Book of Psalms.', testPath);
  await appendDoc('doc8', 'David was friends with Jonathan.', testPath);
  await appendDoc('doc9', 'David lived in Jerusalem after becoming king.', testPath);
  await appendDoc('doc10', 'Jesse was the father of David.', testPath);

  console.log('✓ Ingested 10 documents\n');

  // Load graph
  const graph = loadGraph(testPath);
  if (!graph) {
    console.log('❌ Failed to load graph');
    return;
  }

  // Find David
  const davidEntity = graph.entities.find(e =>
    e.canonical === 'David' || e.aliases.includes('David')
  );

  if (!davidEntity) {
    console.log('❌ David entity not found');
    console.log('\n📋 Available entities:');
    graph.entities.forEach(e => console.log(`  - ${e.canonical} (${e.type})`));
    return;
  }

  console.log(`✓ Found entity: ${davidEntity.canonical} (${davidEntity.type})\n`);

  // Count relations
  const davidRelations = graph.relations.filter(r =>
    r.subj === davidEntity.id || r.obj === davidEntity.id
  );
  console.log(`✓ Found ${davidRelations.length} relations involving David\n`);

  // Generate wiki page
  console.log('📝 Generating wiki page...\n');
  const page = compose(davidEntity.id, graph.entities, graph.relations, graph.conflicts);
  const markdown = toMarkdownPage(page);

  console.log('━'.repeat(90));
  console.log(markdown);
  console.log('━'.repeat(90));

  // Print analysis
  console.log('\n📊 Page Quality Analysis:\n');

  // Overview analysis
  const overviewSentences = page.overview.split(/[.!?]\s+/).filter(s => s.trim().length > 0);
  console.log('📝 Overview Quality:');
  console.log(`  ✓ Sentences: ${overviewSentences.length} (target: 2-3)`);
  console.log(`  ✓ Contains high-value facts: ${
    page.overview.toLowerCase().includes('married') ||
    page.overview.toLowerCase().includes('king') ||
    page.overview.toLowerCase().includes('ruled')
      ? 'YES' : 'NO'
  }`);

  // Infobox analysis
  console.log('\n📋 Infobox Quality:');
  console.log(`  ✓ Total fields: ${Object.keys(page.infobox).length}`);
  if (page.infobox.aliases) {
    console.log(`  ✓ Aliases sorted: ${page.infobox.aliases.join(', ')}`);
  }
  if (page.infobox.relatives) {
    console.log('  ✓ Relatives field ordering:');
    page.infobox.relatives.forEach((rel, i) => {
      console.log(`    ${i + 1}. ${rel}`);
    });
  }

  // Section analysis
  console.log('\n📑 Sections:');
  console.log(`  - Biography: ${page.biography ? 'Present' : 'Empty'} ${page.biography ? `(${page.biography.split(/[.!?]/).filter(s => s.trim()).length} sentences)` : ''}`);
  console.log(`  - Relationships: ${page.sections.relationships.length} items`);
  console.log(`  - Affiliations: ${page.sections.affiliations.length} items`);
  console.log(`  - Items: ${page.sections.items.length} items`);

  // Suppression analysis
  console.log('\n🔍 Deduplication & Suppression:');
  const overviewLower = page.overview.toLowerCase();
  const biographyLower = (page.biography || '').toLowerCase();
  const relationshipsText = page.sections.relationships.join(' ').toLowerCase();

  if (overviewLower.includes('married')) {
    const inBiography = biographyLower.includes('married');
    const inRelationships = relationshipsText.includes('married');
    console.log('  ✓ Marriage fact:');
    console.log(`    - Overview: YES`);
    console.log(`    - Biography: ${inBiography ? 'YES' : 'NO'}`);
    console.log(`    - Relationships: ${inRelationships ? 'DUPLICATE!' : 'NO (suppressed)'}`);
  }

  if (overviewLower.includes('traveled') || biographyLower.includes('traveled')) {
    const inOverview = overviewLower.includes('traveled');
    const inBiography = biographyLower.includes('traveled');
    const inRelationships = relationshipsText.includes('traveled');
    console.log('  ✓ Travel facts:');
    console.log(`    - Overview: ${inOverview ? 'YES' : 'NO'}`);
    console.log(`    - Biography: ${inBiography ? 'YES' : 'NO'}`);
    console.log(`    - Relationships: ${inRelationships ? 'DUPLICATE!' : 'NO (suppressed)'}`);
  }

  console.log('\n✅ Demo complete!\n');

  // Cleanup
  clearStorage(testPath);
}

generateDavidDemo().catch(console.error);
