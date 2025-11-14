/**
 * HARRY POTTER KNOWLEDGE GRAPH TEST
 *
 * This will test ARES on complex, real-world narrative text with:
 * - Multiple characters with nicknames and titles
 * - Complex relationships
 * - Coreference chains
 * - Location tracking
 * - Event extraction
 */

import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';
import * as path from 'path';

const HARRY_POTTER_TEXT = `
Harry Potter, also known as "The Boy Who Lived," attended Hogwarts School of Witchcraft and Wizardry.
He was best friends with Ron Weasley and Hermione Granger. The trio met on the Hogwarts Express during
their first year.

Ron, the youngest Weasley brother, came from a large wizarding family. His father, Arthur Weasley, worked
at the Ministry of Magic. Ron's mother, Molly Weasley, was a caring witch who treated Harry like her own son.

Hermione, often called the brightest witch of her age, was born to Muggle parents. She studied at Hogwarts
where she became the top student in her class. The young witch was particularly skilled in Charms and
Transfiguration.

Professor Albus Dumbledore, the headmaster of Hogwarts, was known as one of the greatest wizards of all time.
The elderly wizard mentored Harry throughout his years at the school. Dumbledore had defeated the dark wizard
Grindelwald in 1945.

Lord Voldemort, whose real name was Tom Riddle, was the most dangerous dark wizard in history. He killed
Harry's parents, James Potter and Lily Potter, when the boy was just one year old. The Dark Lord tried to
kill Harry but failed, leaving him with a lightning-bolt scar.

Severus Snape, the Potions Master at Hogwarts, had a complicated relationship with Harry. The strict professor
taught at the school for many years. He was secretly in love with Lily, Harry's mother.

Rubeus Hagrid, the Keeper of Keys and Grounds at Hogwarts, was a half-giant who befriended Harry. The gentle
giant introduced Harry to the wizarding world. Hagrid lived in a hut on the school grounds near the Forbidden Forest.

Draco Malfoy, Harry's rival at school, came from an old pure-blood wizarding family. His father, Lucius Malfoy,
was a Death Eater who served Voldemort. The young Slytherin student often clashed with Harry and his friends.

Sirius Black, Harry's godfather, was falsely imprisoned in Azkaban for twelve years. The innocent man escaped
and helped Harry during his later years at Hogwarts. Black was James Potter's best friend during their school days.

The castle of Hogwarts stood in the Scottish Highlands. The magical school had four houses: Gryffindor, Slytherin,
Ravenclaw, and Hufflepuff. Harry was sorted into Gryffindor, the house founded by Godric Gryffindor.
`;

async function testHarryPotter() {
  const testPath = path.join(process.cwd(), 'test-harry-potter-kg.json');

  console.log('🔥 TESTING ARES ON HARRY POTTER TEXT 🔥\n');
  console.log('=' .repeat(80));

  // Clear previous test
  clearStorage(testPath);

  console.log('\n📖 Processing Harry Potter narrative...\n');
  console.log('Text length:', HARRY_POTTER_TEXT.length, 'characters');
  console.log('Paragraphs:', HARRY_POTTER_TEXT.split('\n\n').filter(p => p.trim()).length);

  // Extract knowledge graph
  const startTime = Date.now();
  await appendDoc('harry-potter-test', HARRY_POTTER_TEXT, testPath);
  const extractionTime = Date.now() - startTime;

  // Load and analyze the knowledge graph
  const graph = loadGraph(testPath);

  if (!graph) {
    console.error('❌ Failed to load knowledge graph!');
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 KNOWLEDGE GRAPH ANALYSIS');
  console.log('='.repeat(80) + '\n');

  console.log(`⏱️  Extraction time: ${extractionTime}ms`);
  console.log(`📦 Total entities: ${graph.entities.length}`);
  console.log(`🔗 Total relations: ${graph.relations.length}`);
  console.log(`📄 Documents: ${graph.metadata.doc_count}`);

  // Analyze entities by type
  const entityTypes = new Map<string, number>();
  for (const entity of graph.entities) {
    entityTypes.set(entity.type, (entityTypes.get(entity.type) || 0) + 1);
  }

  console.log('\n📋 ENTITIES BY TYPE:');
  for (const [type, count] of Array.from(entityTypes.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  // Show main characters with their aliases
  console.log('\n👥 MAIN CHARACTERS WITH ALIASES:');
  const mainCharacters = ['Harry', 'Ron', 'Hermione', 'Dumbledore', 'Voldemort', 'Snape', 'Hagrid', 'Draco', 'Sirius'];
  for (const name of mainCharacters) {
    const entity = graph.entities.find(e =>
      e.type === 'PERSON' && e.canonical.toLowerCase().includes(name.toLowerCase())
    );
    if (entity) {
      console.log(`\n  🧙 ${entity.canonical}`);
      if (entity.aliases && entity.aliases.length > 0) {
        console.log(`     Aliases: ${entity.aliases.slice(0, 5).join(', ')}${entity.aliases.length > 5 ? '...' : ''}`);
      }
      if (entity.eid) {
        console.log(`     EID: ${entity.eid}`);
      }
    }
  }

  // Show key locations
  console.log('\n\n🏰 LOCATIONS DISCOVERED:');
  const locations = graph.entities.filter(e => ['PLACE', 'ORG'].includes(e.type));
  for (const loc of locations.slice(0, 10)) {
    console.log(`  📍 ${loc.canonical} (${loc.type})`);
    if (loc.aliases && loc.aliases.length > 0) {
      console.log(`     Aliases: ${loc.aliases.slice(0, 3).join(', ')}`);
    }
  }

  // Analyze relationships
  console.log('\n\n💕 KEY RELATIONSHIPS:');
  const relationTypes = new Map<string, number>();
  for (const rel of graph.relations) {
    relationTypes.set(rel.pred, (relationTypes.get(rel.pred) || 0) + 1);
  }

  for (const [predicate, count] of Array.from(relationTypes.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${predicate}: ${count} instances`);
  }

  // Show some example relationships
  console.log('\n📖 EXAMPLE RELATIONSHIPS:');
  const exampleRelations = graph.relations.slice(0, 15);
  for (const rel of exampleRelations) {
    const subj = graph.entities.find(e => e.id === rel.subj);
    const obj = graph.entities.find(e => e.id === rel.obj);
    if (subj && obj) {
      console.log(`  ${subj.canonical} --[${rel.pred}]--> ${obj.canonical}`);
    }
  }

  // Show family relationships specifically
  console.log('\n\n👨‍👩‍👦 FAMILY RELATIONSHIPS:');
  const familyRels = graph.relations.filter(r =>
    ['child_of', 'parent_of', 'sibling_of'].includes(r.pred)
  );
  for (const rel of familyRels) {
    const subj = graph.entities.find(e => e.id === rel.subj);
    const obj = graph.entities.find(e => e.id === rel.obj);
    if (subj && obj) {
      console.log(`  ${subj.canonical} --[${rel.pred}]--> ${obj.canonical}`);
    }
  }

  // Show friendship relationships
  console.log('\n\n🤝 FRIENDSHIPS & SOCIAL BONDS:');
  const friendRels = graph.relations.filter(r =>
    ['friends_with', 'befriended', 'mentored'].includes(r.pred)
  );
  for (const rel of friendRels) {
    const subj = graph.entities.find(e => e.id === rel.subj);
    const obj = graph.entities.find(e => e.id === rel.obj);
    if (subj && obj) {
      console.log(`  ${subj.canonical} --[${rel.pred}]--> ${obj.canonical}`);
    }
  }

  // Show location relationships
  console.log('\n\n🗺️  LOCATION RELATIONSHIPS:');
  const locRels = graph.relations.filter(r =>
    ['lives_in', 'traveled_to', 'studies_at', 'works_at', 'born_in'].includes(r.pred)
  );
  for (const rel of locRels.slice(0, 10)) {
    const subj = graph.entities.find(e => e.id === rel.subj);
    const obj = graph.entities.find(e => e.id === rel.obj);
    if (subj && obj) {
      console.log(`  ${subj.canonical} --[${rel.pred}]--> ${obj.canonical}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ ARES SUCCESSFULLY PROCESSED COMPLEX NARRATIVE TEXT!');
  console.log('='.repeat(80) + '\n');

  // Performance metrics
  console.log('⚡ PERFORMANCE METRICS:');
  console.log(`  Extraction speed: ${(HARRY_POTTER_TEXT.length / extractionTime * 1000).toFixed(0)} chars/sec`);
  console.log(`  Entities/second: ${(graph.entities.length / extractionTime * 1000).toFixed(1)}`);
  console.log(`  Relations/second: ${(graph.relations.length / extractionTime * 1000).toFixed(1)}`);

  console.log('\n📊 KNOWLEDGE GRAPH QUALITY:');
  const entitiesWithAliases = graph.entities.filter(e => e.aliases && e.aliases.length > 0).length;
  const entitiesWithEID = graph.entities.filter(e => e.eid).length;
  console.log(`  Entities with aliases: ${entitiesWithAliases} (${(entitiesWithAliases/graph.entities.length*100).toFixed(1)}%)`);
  console.log(`  Entities with stable EID: ${entitiesWithEID} (${(entitiesWithEID/graph.entities.length*100).toFixed(1)}%)`);

  console.log('\n🎯 READY FOR DIGITAL KINGDOM DEPLOYMENT! 🎯\n');
}

// Run the test
testHarryPotter().catch(console.error);
