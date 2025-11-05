/**
 * Debug PhD supervision pattern
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';
import { parseWithService } from './app/engine/extract/entities';
import { findShortestPath, describePath } from './app/engine/extract/relations/dependency-paths';
import type { Token } from './app/engine/extract/relations/types';

async function debugPhdSupervision() {
  const text = 'Gabriel Santos completed his PhD at MIT under Professor Richard Foster';

  console.log('DEBUG: PhD Supervision Pattern');
  console.log('='.repeat(80));
  console.log(`Text: "${text}"`);
  console.log('');

  // First, get extraction results
  const { entities, relations } = await extractFromSegments('debug', text);

  console.log(`Entities (${entities.length}):`);
  for (const e of entities) {
    console.log(`  - ${e.canonical} (${e.type})`);
  }
  console.log('');

  console.log(`Relations (${relations.length}):`);
  for (const rel of relations) {
    const subj = entities.find(e => e.id === rel.subj)?.canonical || 'unknown';
    const obj = entities.find(e => e.id === rel.obj)?.canonical || 'unknown';
    console.log(`  - ${rel.pred}: ${subj} → ${obj} (conf: ${rel.confidence.toFixed(2)})`);
  }
  console.log('');

  // Parse with dependency parser
  const parsed = await parseWithService(text);

  if (parsed.sentences.length > 0) {
    const sent = parsed.sentences[0];
    console.log('Dependency Structure:');
    console.log('Token | POS | Dep | Head | Head_Text');
    console.log('-'.repeat(80));
    for (const tok of sent.tokens) {
      const headText = tok.head !== tok.i ? sent.tokens[tok.head]?.text : 'ROOT';
      console.log(`${tok.i.toString().padEnd(6)}| ${tok.pos.padEnd(4)}| ${tok.dep.padEnd(8)}| ${tok.head.toString().padEnd(5)}| ${headText}`);
    }
    console.log('');

    // Find paths between key entities
    const gabrielToken = sent.tokens.find((t: Token) => t.text.toLowerCase() === 'santos');
    const fosterToken = sent.tokens.find((t: Token) => t.text.toLowerCase() === 'foster');

    if (gabrielToken && fosterToken) {
      console.log(`Finding path: Santos (token ${gabrielToken.i}) → Foster (token ${fosterToken.i})`);
      const path12 = findShortestPath(gabrielToken, fosterToken, sent.tokens);
      const path21 = findShortestPath(fosterToken, gabrielToken, sent.tokens);

      if (path12) {
        console.log(`\nPath Santos → Foster:`);
        console.log(`  Signature: ${path12.signature}`);
        console.log(`  Description: ${describePath(path12)}`);
      } else {
        console.log('\nNo path found Santos → Foster');
      }

      if (path21) {
        console.log(`\nPath Foster → Santos:`);
        console.log(`  Signature: ${path21.signature}`);
        console.log(`  Description: ${describePath(path21)}`);
      } else {
        console.log('\nNo path found Foster → Santos');
      }
    } else {
      console.log('Could not find entity tokens');
      console.log(`Gabriel token: ${gabrielToken?.text || 'NOT FOUND'}`);
      console.log(`Foster token: ${fosterToken?.text || 'NOT FOUND'}`);
    }
  }
}

debugPhdSupervision()
  .then(() => {
    console.log('\nDebug complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
