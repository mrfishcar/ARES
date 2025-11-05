import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const fullText = `Sarah Chen graduated from Stanford University in 2019 with a degree in Computer Science. She moved to San Francisco to work at Google, where she met her colleague Marcus Rodriguez. Marcus had previously worked at Microsoft in Seattle before relocating to California. Sarah's younger brother David Chen started his own startup in Austin, Texas. He partnered with his college friend Emma Watson, who brought expertise in machine learning from her time at MIT. The company, TechVenture Labs, secured funding from Sequoia Capital in 2021. Meanwhile, Sarah and Marcus got married in Napa Valley in 2022. They invited David and Emma to the wedding, along with Sarah's former professor Dr. James Mitchell from Stanford.`;

  console.log('FULL NARRATIVE TEST');
  console.log('='.repeat(80));

  const { entities, relations } = await extractFromSegments('full-narrative', fullText);

  console.log(`\nEntities: ${entities.length}`);
  for (const e of entities) {
    console.log(`  [${e.id.slice(0, 8)}] ${e.canonical} (${e.type})`);
  }

  console.log(`\nRelations: ${relations.length}`);
  for (const rel of relations) {
    const subjEntity = entities.find(e => e.id === rel.subj);
    const objEntity = entities.find(e => e.id === rel.obj);

    const subj = subjEntity?.canonical || `[MISSING: ${rel.subj.slice(0, 8)}]`;
    const obj = objEntity?.canonical || `[MISSING: ${rel.obj.slice(0, 8)}]`;
    console.log(`  ${subj} --[${rel.pred}]--> ${obj}`);
  }

  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
