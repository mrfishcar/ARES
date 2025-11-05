/**
 * Complete Wiki Generation Test
 *
 * Performs extraction with entity typing, then generates wiki pages
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';
import { getHERTQuery } from './app/api/hert-query';
import { WikiGenerator, renderWikiPageToMarkdown } from './app/generate/wiki-generator';
import { WikiIndexGenerator } from './app/generate/wiki-index';
import { DEFAULT_LLM_CONFIG } from './app/engine/llm-config';
import type { EntityType } from './app/engine/schema';
import * as fs from 'fs';
import * as path from 'path';

const WIKI_OUTPUT_DIR = './wiki-output-full';

const TEST_TEXT = `
In the year 3019 of the Third Age, a great war was fought for Middle-earth. Aragorn son of Arathorn,
the rightful heir to the throne of Gondor, led the Free Peoples against the forces of Sauron.

At Minas Tirith, the capital of Gondor, Gandalf the White stood alongside Aragorn. Together they
defended the city against Mordor's armies. The Battle of the Pelennor Fields was fought before the
gates of the city.

Frodo Baggins, bearer of the One Ring, journeyed through Mordor with his loyal friend Samwise Gamgee.
Their quest was to destroy the Ring in the fires of Mount Doom. Meanwhile, in the lands of Rohan,
King Théoden rallied his forces.

The Fellowship of the Ring, formed at the Council of Elrond in Rivendell, had long since broken.
Legolas of the Woodland Realm and Gimli son of Glóin fought side by side. Merry and Pippin,
hobbits of the Shire, aided the forces of Gondor and Rohan.

At the Black Gate of Mordor, Aragorn led a desperate assault to draw Sauron's eye away from Frodo.
The armies of the West faced overwhelming numbers. But when the One Ring was destroyed,
Sauron's power broke, and his dark tower of Barad-dûr fell.`;

async function testFullWiki() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Complete Wiki Generation Test (Fresh Extraction)      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Step 1: Extract entities with typing
  console.log('📝 Step 1: Extracting entities from text...\n');

  const result = await extractFromSegments(
    'lotr-war.txt',
    TEST_TEXT,
    undefined,
    DEFAULT_LLM_CONFIG,
    undefined,
    { generateHERTs: true, autoSaveHERTs: false } // Don't save to global store
  );

  console.log(`✅ Extracted ${result.entities.length} entities`);
  console.log(`✅ Extracted ${result.relations.length} relationships\n`);

  // Check entity types
  const typeCounts = new Map<EntityType, number>();
  result.entities.forEach(e => {
    if (e.type) {
      typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1);
    }
  });

  console.log('Entity types found:');
  Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
  console.log('');

  if (typeCounts.size === 0) {
    console.log('⚠️  No entity types found! Extraction may have failed.\n');
    return;
  }

  // Step 2: Load into Query API
  console.log('📚 Step 2: Loading data into Query API...\n');

  const queryAPI = getHERTQuery();
  queryAPI.loadRelations(result.relations, result.entities);

  // Step 3: Initialize generators
  const wikiGen = new WikiGenerator(queryAPI);
  const indexGen = new WikiIndexGenerator(queryAPI);

  // Create output directory
  if (!fs.existsSync(WIKI_OUTPUT_DIR)) {
    fs.mkdirSync(WIKI_OUTPUT_DIR, { recursive: true });
  }

  // Step 4: Generate entity pages
  console.log('═══ Step 3: Generating Entity Pages ═══\n');

  const types: EntityType[] = ['PERSON', 'ORG', 'PLACE', 'EVENT', 'DATE', 'ITEM', 'WORK'];
  const generatedPages: Array<{ type: EntityType; title: string; filename: string }> = [];

  for (const type of types) {
    // Find entities of this type
    const entitiesOfType = result.entities.filter(e => e.type === type);

    if (entitiesOfType.length === 0) {
      console.log(`⚠️  No ${type} entities found, skipping...`);
      continue;
    }

    // Pick the entity with most mentions or relationships
    const entity = entitiesOfType.sort((a, b) => {
      const aRels = result.relations.filter(r => r.subj === a.id || r.obj === a.id).length;
      const bRels = result.relations.filter(r => r.subj === b.id || r.obj === b.id).length;
      return bRels - aRels;
    })[0];

    console.log(`📄 Generating ${type} page: "${entity.canonical}"`);
    console.log(`   EID: ${entity.eid}, Type: ${entity.type}`);

    if (entity.eid === undefined) {
      console.log(`   ❌ No EID assigned, skipping...`);
      continue;
    }

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
    } else {
      console.log(`   ❌ Failed to generate page`);
    }
    console.log('');
  }

  // Step 5: Generate index pages
  console.log('═══ Step 4: Generating Index Pages ═══\n');

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

  // Step 6: Display sample content
  console.log('═══ Step 5: Sample Generated Content ═══\n');

  if (generatedPages.length > 0) {
    const samplePage = generatedPages[0];
    console.log(`📄 Sample page: ${samplePage.title} (${samplePage.type})\n`);

    const content = fs.readFileSync(samplePage.filename, 'utf8');
    const lines = content.split('\n');
    const preview = lines.slice(0, 80).join('\n');

    console.log('─────────────────────────────────────────────────');
    console.log(preview);
    if (lines.length > 80) {
      console.log(`\n... (${lines.length - 80} more lines)`);
    }
    console.log('─────────────────────────────────────────────────\n');
  }

  // Summary
  console.log('═══ Summary ═══\n');

  console.log('✅ Wiki Generation Complete!\n');
  console.log(`📄 Entity Pages Generated: ${generatedPages.length}`);
  generatedPages.forEach(p => {
    console.log(`   - ${p.type}: ${p.title}`);
  });
  console.log('');

  console.log('📑 Index Pages Generated:');
  console.log('   - Main Index (index.md)');

  const categoryCount = types.filter(t =>
    queryAPI.findEntitiesByType(t).length > 0
  ).length;
  console.log(`   - ${categoryCount} Category Indexes\n`);

  console.log(`📁 Output Directory: ${WIKI_OUTPUT_DIR}/`);
  console.log(`📊 Total Files: ${fs.readdirSync(WIKI_OUTPUT_DIR).length}\n`);

  console.log('💡 Check the generated files to see the wiki pages!');
  console.log(`   ls ${WIKI_OUTPUT_DIR}/\n`);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

testFullWiki().catch(console.error);
