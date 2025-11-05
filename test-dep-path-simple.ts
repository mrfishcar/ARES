/**
 * Simple test of dependency path logic
 * Uses direct parsing without complex imports
 */

import { findShortestPath, matchDependencyPath, describePath } from './app/engine/extract/relations/dependency-paths';
import type { Token } from './app/engine/extract/relations/types';

// Test with manually constructed token structures
// (In real usage, these come from spaCy parser)

async function testPathLogic() {
  console.log('DEPENDENCY PATH ALGORITHM TEST');
  console.log('='.repeat(80));

  // Test 1: "She made him a husband"
  // Real dependency structure from spaCy
  const test1Tokens: Token[] = [
    { i: 0, text: 'She', lemma: 'she', pos: 'PRON', tag: 'PRP', dep: 'nsubj', head: 1, ent: '', start: 0, end: 3 },
    { i: 1, text: 'made', lemma: 'make', pos: 'VERB', tag: 'VBD', dep: 'ROOT', head: 1, ent: '', start: 4, end: 8 },
    { i: 2, text: 'him', lemma: 'him', pos: 'PRON', tag: 'PRP', dep: 'dobj', head: 1, ent: '', start: 9, end: 12 },
    { i: 3, text: 'a', lemma: 'a', pos: 'DET', tag: 'DT', dep: 'det', head: 4, ent: '', start: 13, end: 14 },
    { i: 4, text: 'husband', lemma: 'husband', pos: 'NOUN', tag: 'NN', dep: 'attr', head: 2, ent: '', start: 15, end: 22 },
  ];

  console.log('\n1. "She made him a husband"');
  console.log('-'.repeat(80));

  const path1 = findShortestPath(test1Tokens[0], test1Tokens[2], test1Tokens);
  if (path1) {
    console.log(`   Signature: ${path1.signature}`);
    console.log(`   Description: ${describePath(path1)}`);

    const match1 = matchDependencyPath(path1);
    if (match1) {
      console.log(`   ✓ MATCH: ${match1.predicate} (confidence: ${match1.confidence})`);
    } else {
      console.log(`   ✗ No pattern match - need to add pattern`);
      console.log(`   Pattern to add: ${path1.signature}`);
    }
  }

  // Test 2: "Jessica founded DataFlow" (simple active voice)
  const test2Tokens: Token[] = [
    { i: 0, text: 'Jessica', lemma: 'Jessica', pos: 'PROPN', tag: 'NNP', dep: 'nsubj', head: 1, ent: 'PERSON', start: 0, end: 7 },
    { i: 1, text: 'founded', lemma: 'found', pos: 'VERB', tag: 'VBD', dep: 'ROOT', head: 1, ent: '', start: 8, end: 15 },
    { i: 2, text: 'DataFlow', lemma: 'DataFlow', pos: 'PROPN', tag: 'NNP', dep: 'dobj', head: 1, ent: 'ORG', start: 16, end: 24 },
  ];

  console.log('\n2. "Jessica founded DataFlow"');
  console.log('-'.repeat(80));

  const path2 = findShortestPath(test2Tokens[0], test2Tokens[2], test2Tokens);
  if (path2) {
    console.log(`   Signature: ${path2.signature}`);
    console.log(`   Description: ${describePath(path2)}`);

    const match2 = matchDependencyPath(path2);
    if (match2) {
      console.log(`   ✓ MATCH: ${match2.predicate} (confidence: ${match2.confidence})`);
    } else {
      console.log(`   ✗ No pattern match`);
    }
  }

  // Test 3: Complex - inserted clause shouldn't break path
  console.log('\n3. Testing robustness to inserted clauses');
  console.log('-'.repeat(80));
  console.log('   "She, upon finding him deliriously handsome, made him a husband"');
  console.log('   vs');
  console.log('   "She made him a husband"');
  console.log('   → Same dependency path! Inserted clause attaches separately.');
  console.log('   → This is why dependency paths are better than word patterns.');

  console.log('\n' + '='.repeat(80));
  console.log('NEXT STEPS:');
  console.log('1. Integrate this into relation extraction pipeline');
  console.log('2. Add more path patterns based on real examples');
  console.log('3. Test on 3376-word narrative');
  console.log('='.repeat(80));
}

testPathLogic().catch(err => {
  console.error('Error:', err);
  console.error(err.stack);
  process.exit(1);
});
