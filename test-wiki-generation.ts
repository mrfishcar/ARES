/**
 * Test Wiki Generation
 *
 * Generates actual wiki pages from existing HERT data:
 * 1. Entity pages (one of each type)
 * 2. Index pages (category listings, main index, stats)
 * 3. Saves to disk as markdown
 */

import { getHERTQuery } from './app/api/hert-query';
import { WikiGenerator, renderWikiPageToMarkdown } from './app/generate/wiki-generator';
import { WikiIndexGenerator } from './app/generate/wiki-index';
import type { EntityType } from './app/engine/schema';
import * as fs from 'fs';
import * as path from 'path';

const WIKI_OUTPUT_DIR = './wiki-output';

async function testWikiGeneration() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Wiki Generation Test                                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Initialize Query API
  const queryAPI = getHERTQuery();
  const stats = queryAPI.getGlobalStats();

  console.log('📊 System Data:');
  console.log(`   Total entities: ${stats.total_entities}`);
  console.log(`   Total HERTs: ${stats.total_herts}`);
  console.log(`   Total documents: ${stats.total_documents}\n`);

  if (stats.total_entities === 0) {
    console.log('⚠️  No entities found. Run extraction first.\n');
    return;
  }

  // Initialize generators
  const wikiGen = new WikiGenerator(queryAPI);
  const indexGen = new WikiIndexGenerator(queryAPI);

  // Create output directory
  if (!fs.existsSync(WIKI_OUTPUT_DIR)) {
    fs.mkdirSync(WIKI_OUTPUT_DIR, { recursive: true });
  }

  // === Test 1: Generate Entity Pages (One of Each Type) ===
  console.log('═══ Test 1: Generating Entity Pages ═══\n');

  const types: EntityType[] = ['PERSON', 'ORG', 'PLACE', 'EVENT', 'DATE', 'ITEM', 'WORK'];
  const generatedPages: Array<{ type: EntityType; title: string; filename: string }> = [];

  for (const type of types) {
    const entities = queryAPI.findEntitiesByType(type);

    if (entities.length === 0) {
      console.log(`⚠️  No ${type} entities found, skipping...`);
      continue;
    }

    // Pick the entity with the most mentions
    const entity = entities.sort((a, b) => b.mention_count - a.mention_count)[0];

    console.log(`📄 Generating ${type} page: "${entity.canonical}"`);
    console.log(`   EID: ${entity.eid}, Mentions: ${entity.mention_count}`);

    const page = wikiGen.generatePage(entity.eid);

    if (page) {
      const markdown = renderWikiPageToMarkdown(page);
      const filename = path.join(WIKI_OUTPUT_DIR, `${slugify(entity.canonical)}.md`);

      fs.writeFileSync(filename, markdown);

      generatedPages.push({
        type,
        title: page.title,
        filename
      });

      console.log(`   ✅ Saved to: ${filename}`);
      console.log(`   Sections: ${page.sections.length}`);
      console.log(`   Infobox entries: ${Object.keys(page.infobox).length}`);
      console.log(`   Categories: ${page.categories.length}`);
    } else {
      console.log(`   ❌ Failed to generate page`);
    }
    console.log('');
  }

  // === Test 2: Generate Index Pages ===
  console.log('═══ Test 2: Generating Index Pages ═══\n');

  // Main index
  console.log('📑 Generating main index...');
  const mainIndex = indexGen.generateMainIndex();
  const mainIndexPath = path.join(WIKI_OUTPUT_DIR, 'index.md');
  fs.writeFileSync(mainIndexPath, mainIndex.content);
  console.log(`   ✅ Saved to: ${mainIndexPath}\n`);

  // Category indexes
  for (const type of types) {
    const entities = queryAPI.findEntitiesByType(type);

    if (entities.length === 0) {
      continue;
    }

    console.log(`📑 Generating ${type} category index (${entities.length} entities)...`);
    const categoryIndex = indexGen.generateCategoryIndex(type);
    const filename = path.join(WIKI_OUTPUT_DIR, `${slugify(categoryIndex.title)}.md`);
    fs.writeFileSync(filename, categoryIndex.content);
    console.log(`   ✅ Saved to: ${filename}\n`);
  }

  // All pages index
  console.log('📑 Generating all pages index...');
  const allPagesIndex = indexGen.generateAllPagesIndex();
  const allPagesPath = path.join(WIKI_OUTPUT_DIR, 'all-pages.md');
  fs.writeFileSync(allPagesPath, allPagesIndex.content);
  console.log(`   ✅ Saved to: ${allPagesPath}\n`);

  // Statistics page
  console.log('📑 Generating statistics page...');
  const statsPage = indexGen.generateStatsPage();
  const statsPath = path.join(WIKI_OUTPUT_DIR, 'statistics.md');
  fs.writeFileSync(statsPath, statsPage.content);
  console.log(`   ✅ Saved to: ${statsPath}\n`);

  // === Test 3: Display Sample Content ===
  console.log('═══ Test 3: Sample Generated Content ═══\n');

  if (generatedPages.length > 0) {
    const samplePage = generatedPages[0];
    console.log(`📄 Sample page: ${samplePage.title} (${samplePage.type})\n`);

    const content = fs.readFileSync(samplePage.filename, 'utf8');
    const lines = content.split('\n');
    const preview = lines.slice(0, 50).join('\n');

    console.log('─────────────────────────────────────────────────');
    console.log(preview);
    if (lines.length > 50) {
      console.log(`\n... (${lines.length - 50} more lines)`);
    }
    console.log('─────────────────────────────────────────────────\n');
  }

  // === Test 4: Validate Structure ===
  console.log('═══ Test 4: Validating Structure ═══\n');

  let validationPassed = true;

  for (const pageInfo of generatedPages) {
    const content = fs.readFileSync(pageInfo.filename, 'utf8');

    // Check for required sections
    const hasTitle = content.includes('# ');
    const hasInfobox = content.includes('**');
    const hasSections = content.includes('## ');
    const hasCitations = content.includes('[^') || content.includes('Source:');

    console.log(`${pageInfo.title} (${pageInfo.type}):`);
    console.log(`   ${hasTitle ? '✅' : '❌'} Has title`);
    console.log(`   ${hasInfobox ? '✅' : '❌'} Has infobox`);
    console.log(`   ${hasSections ? '✅' : '❌'} Has sections`);
    console.log(`   ${hasCitations ? '✅' : '⚠️ '} Has citations`);

    if (!hasTitle || !hasInfobox || !hasSections) {
      validationPassed = false;
    }
    console.log('');
  }

  // === Test 5: Check Navigation Links ===
  console.log('═══ Test 5: Testing Navigation Links ═══\n');

  const mainIndexContent = fs.readFileSync(mainIndexPath, 'utf8');

  // Check if main index links to category pages
  const categoryLinksFound = types.some(type => {
    const entities = queryAPI.findEntitiesByType(type);
    if (entities.length === 0) return false;

    const typeName = getTypeName(type);
    return mainIndexContent.includes(`[${typeName}]`);
  });

  console.log(`Main index navigation: ${categoryLinksFound ? '✅' : '❌'}`);

  // Check if entity pages link to each other
  let crossLinks = 0;
  for (const pageInfo of generatedPages) {
    const content = fs.readFileSync(pageInfo.filename, 'utf8');
    const linkMatches = content.match(/\[([^\]]+)\]\(([^\)]+)\.md\)/g);
    if (linkMatches) {
      crossLinks += linkMatches.length;
    }
  }

  console.log(`Cross-page links found: ${crossLinks}`);
  console.log('');

  // === Summary ===
  console.log('═══ Summary ═══\n');

  console.log('✅ Wiki Generation Complete!\n');
  console.log(`📄 Entity Pages Generated: ${generatedPages.length}`);
  generatedPages.forEach(p => {
    console.log(`   - ${p.type}: ${p.title}`);
  });
  console.log('');

  console.log('📑 Index Pages Generated:');
  console.log('   - Main Index (index.md)');
  console.log('   - All Pages (all-pages.md)');
  console.log('   - Statistics (statistics.md)');

  const categoryCount = types.filter(t =>
    queryAPI.findEntitiesByType(t).length > 0
  ).length;
  console.log(`   - ${categoryCount} Category Indexes\n`);

  console.log(`📁 Output Directory: ${WIKI_OUTPUT_DIR}/`);
  console.log(`📊 Total Files: ${fs.readdirSync(WIKI_OUTPUT_DIR).length}\n`);

  if (validationPassed) {
    console.log('🎉 All pages passed validation!\n');
  } else {
    console.log('⚠️  Some pages failed validation checks\n');
  }

  console.log('💡 Next steps:');
  console.log('   1. Review generated pages');
  console.log('   2. Test with more entity types');
  console.log('   3. Add CSS/styling templates');
  console.log('   4. Build HTML export option');
  console.log('   5. Create wiki navigation system\n');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getTypeName(type: EntityType): string {
  const names: Record<EntityType, string> = {
    'PERSON': 'People',
    'ORG': 'Organizations',
    'PLACE': 'Places',
    'EVENT': 'Events',
    'DATE': 'Dates',
    'ITEM': 'Items',
    'WORK': 'Works',
    'SPECIES': 'Species',
    'HOUSE': 'Houses',
    'TRIBE': 'Tribes',
    'TITLE': 'Titles',
  };
  return names[type] || type;
}

testWikiGeneration().catch(console.error);
