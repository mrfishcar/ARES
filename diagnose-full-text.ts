import { extractFromSegments } from './app/engine/extract/orchestrator';

async function diagnose() {
  const sentences = [
    "Sarah Chen graduated from Stanford University in 2019 with a degree in Computer Science.",
    "She moved to San Francisco to work at Google, where she met her colleague Marcus Rodriguez.",
    "Marcus had previously worked at Microsoft in Seattle before relocating to California.",
    "Sarah's younger brother David Chen started his own startup in Austin, Texas.",
    "He partnered with his college friend Emma Watson, who brought expertise in machine learning from her time at MIT.",
    "The company, TechVenture Labs, secured funding from Sequoia Capital in 2021.",
    "Meanwhile, Sarah and Marcus got married in Napa Valley in 2022.",
    "They invited David and Emma to the wedding, along with Sarah's former professor Dr. James Mitchell from Stanford."
  ];

  console.log('='.repeat(80));
  console.log('SENTENCE-BY-SENTENCE DIAGNOSTIC');
  console.log('='.repeat(80));

  for (let i = 0; i < sentences.length; i++) {
    const text = sentences[i];
    console.log(`\n[${i + 1}] ${text}`);

    const { entities, relations } = await extractFromSegments(`sent-${i}`, text);
    console.log(`  Entities: ${entities.map(e => e.canonical).join(', ')}`);
    console.log(`  Relations: ${relations.length}`);

    for (const rel of relations) {
      const subj = entities.find(e => e.id === rel.subj)?.canonical || rel.subj;
      const obj = entities.find(e => e.id === rel.obj)?.canonical || rel.obj;
      console.log(`    - ${subj} --[${rel.pred}]--> ${obj}`);
    }

    if (relations.length === 0) {
      console.log('    (none)');
    }
  }

  process.exit(0);
}

diagnose().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
