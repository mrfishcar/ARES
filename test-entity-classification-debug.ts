/**
 * Debug entity classification for "Zenith Computing"
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function debugEntityClassification() {
  const tests = [
    'Zenith Computing acquired DataVision Systems',
    'Zenith Computing purchased MobileFirst Technologies',
    'DataVision Systems was acquired by Zenith Computing'
  ];

  for (const text of tests) {
    console.log('='.repeat(80));
    console.log(`Text: "${text}"`);
    console.log('-'.repeat(80));

    // Get extraction output
    const { entities, relations } = await extractFromSegments('debug', text);
    console.log('Extracted entities:');
    for (const e of entities) {
      console.log(`  - ${e.canonical} (${e.type})`);
    }

    console.log('\nExtracted relations:');
    for (const rel of relations) {
      const subj = entities.find(e => e.id === rel.subj)?.canonical || 'unknown';
      const obj = entities.find(e => e.id === rel.obj)?.canonical || 'unknown';
      console.log(`  - ${rel.pred}: ${subj} → ${obj}`);
    }
    console.log('');
  }
}

debugEntityClassification()
  .then(() => {
    console.log('Debug complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
