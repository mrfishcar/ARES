import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';

const testPath = '/tmp/coord-debug.json';

async function testCoordination() {
  clearStorage(testPath);

  console.log('\n=== Testing Coordination: "Harry and Ron studied at Hogwarts" ===\n');

  await appendDoc('coord-test', 'Harry and Ron studied at Hogwarts.', testPath);
  const graph = loadGraph(testPath);

  console.log('\n📋 ENTITIES:');
  for (const entity of graph!.entities) {
    console.log(`  - ${entity.canonical} (${entity.type})`);
  }

  console.log('\n📊 RELATIONS:');
  for (const rel of graph!.relations) {
    const subj = graph!.entities.find(e => e.id === rel.subj);
    const obj = graph!.entities.find(e => e.id === rel.obj);
    console.log(`  - ${subj?.canonical} --[${rel.pred}]--> ${obj?.canonical}`);
  }

  // Check expected results
  const hasHarryStudies = graph!.relations.some(r => {
    const subj = graph!.entities.find(e => e.id === r.subj);
    const obj = graph!.entities.find(e => e.id === r.obj);
    return subj?.canonical.toLowerCase() === 'harry' &&
           r.pred === 'studies_at' &&
           obj?.canonical.toLowerCase() === 'hogwarts';
  });

  const hasRonStudies = graph!.relations.some(r => {
    const subj = graph!.entities.find(e => e.id === r.subj);
    const obj = graph!.entities.find(e => e.id === r.obj);
    return subj?.canonical.toLowerCase() === 'ron' &&
           r.pred === 'studies_at' &&
           obj?.canonical.toLowerCase() === 'hogwarts';
  });

  console.log('\n✅ RESULTS:');
  console.log(`  Harry studies_at Hogwarts: ${hasHarryStudies ? '✓' : '✗'}`);
  console.log(`  Ron studies_at Hogwarts: ${hasRonStudies ? '✓' : '✗'}`);

  if (hasHarryStudies && hasRonStudies) {
    console.log('\n🎉 Coordination working correctly!\n');
  } else {
    console.log('\n❌ Coordination NOT working - only one entity extracted\n');
  }

  clearStorage(testPath);
}

testCoordination().catch(console.error);
