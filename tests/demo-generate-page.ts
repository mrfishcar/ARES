/**
 * Demo: Generate Wiki Page for Entity
 * Usage: npx ts-node tests/demo-generate-page.ts "EntityName"
 */

import { extractEntities } from '../app/engine/extract/entities';
import { extractRelations } from '../app/engine/extract/relations';
import { compose } from '../app/generate/exposition';
import { toMarkdownPage } from '../app/generate/markdown';

async function generatePageDemo(entityName: string) {
  console.log(`\n🔍 Searching for entity: "${entityName}"\n`);

  // Sample corpus about Mildred
  const corpus = `
Mildred Hubble is a student at Miss Cackle's Academy for Witches. She studies magic and potion-making.
Miss Cackle's Academy is located in the mountains of England. Mildred lives at the academy during the school year.

Mildred has a cat named Tabby. She is friends with Maud Spellbody and Enid Nightshade. Her rival is Ethel Hallow,
who is also a student at the academy.

Mildred was born in 1998 in London. She has the power of transformation and possesses skill in broomstick flying,
though she is reportedly not very skilled at it. She wields a wooden wand given to her by Miss Cackle.

In 2010, Mildred participated in the annual broomstick race at the academy. She traveled to the Forbidden Forest
and discovered ancient magical artifacts. She has been taught by Miss Hardbroom, the strict potions teacher.

Mildred's mother is Mrs. Hubble, a non-magical person. Some sources claim Mildred is the daughter of a witch,
while others say she has no magical heritage. This remains disputed.

Miss Hardbroom teaches at Miss Cackle's Academy. She is known for her strict teaching methods. Maud Spellbody
is Mildred's best friend and fellow student. They study together and help each other with homework.
  `.trim();

  console.log('📚 Processing corpus...\n');

  // Extract entities and relations
  const { entities, spans } = await extractEntities(corpus);
  console.log(`✓ Extracted ${entities.length} entities`);

  const relations = await extractRelations(corpus, { entities, spans }, 'demo-doc');
  console.log(`✓ Extracted ${relations.length} relations\n`);

  // Find the target entity
  const targetEntity = entities.find(e =>
    e.canonical.toLowerCase().includes(entityName.toLowerCase())
  );

  if (!targetEntity) {
    console.log(`❌ Entity "${entityName}" not found in corpus.`);
    console.log('\n📋 Available entities:');
    entities.forEach(e => console.log(`  - ${e.canonical} (${e.type})`));
    return;
  }

  console.log(`✓ Found entity: ${targetEntity.canonical} (${targetEntity.type})\n`);

  // Count relations involving this entity
  const entityRelations = relations.filter(r =>
    r.subj === targetEntity.id || r.obj === targetEntity.id
  );
  console.log(`✓ Found ${entityRelations.length} relations involving ${targetEntity.canonical}\n`);

  // Use actual conflict detection or empty array
  const conflicts: any[] = [];

  // Generate wiki page
  console.log('📝 Generating wiki page...\n');
  const page = compose(targetEntity.id, entities, relations, conflicts);
  const markdown = toMarkdownPage(page);

  console.log('━'.repeat(80));
  console.log(markdown);
  console.log('━'.repeat(80));

  // Print summary
  console.log('\n📊 Page Summary:');
  console.log(`  - Infobox fields: ${Object.keys(page.infobox).length}`);
  console.log(`  - Overview: ${page.overview ? '✓' : '✗'}`);
  console.log(`  - Biography sentences: ${page.sections.biography.length}`);
  console.log(`  - Relationship sentences: ${page.sections.relationships.length}`);
  console.log(`  - Abilities sentences: ${page.sections.abilities.length}`);
  console.log(`  - Items sentences: ${page.sections.items.length}`);
  console.log(`  - Affiliations sentences: ${page.sections.affiliations.length}`);
  console.log(`  - Disputed claims: ${page.sections.disputed.length}`);
  console.log('');
}

// Get entity name from command line
const entityName = process.argv[2] || 'Mildred';
generatePageDemo(entityName).catch(console.error);
