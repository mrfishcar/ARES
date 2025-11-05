import { extractFromSegments } from './app/engine/extract/orchestrator';
import { parseSentence } from './app/engine/extract/parser';
import { findShortestPath, matchDependencyPath, describePath } from './app/engine/extract/relations/dependency-paths';

async function testComplexPatterns() {
  const tests = [
    // Your complex example
    "She made him a husband",

    // Other creative variations
    "Mary became John's wife in 1995",
    "He took her as his bride",

    // Complex founding examples
    "DataVision Systems, which had been founded by Eric Nelson, was acquired",
    "CloudTech, founded by two Berkeley graduates, received funding",

    // Standard cases (should still work)
    "Jessica Martinez founded DataFlow Technologies",
    "Alexander Petrov invested in Zenith Computing",
  ];

  console.log('DEPENDENCY PATH ANALYSIS');
  console.log('='.repeat(80));

  for (let i = 0; i < tests.length; i++) {
    const text = tests[i];
    console.log(`\n${i + 1}. "${text}"`);
    console.log('-'.repeat(80));

    try {
      // Parse sentence
      const { tokens } = await parseSentence(text);

      // Find all PERSON/ORG entity tokens (simplified - looking at proper nouns)
      const entityTokens = tokens.filter(t =>
        (t.pos === 'PROPN' || t.text.match(/^(he|she|him|her)$/i)) &&
        t.text.length > 1
      );

      if (entityTokens.length < 2) {
        console.log('  ⚠️  Not enough entities for path analysis');
        continue;
      }

      // Analyze paths between entity pairs
      for (let j = 0; j < entityTokens.length - 1; j++) {
        const e1 = entityTokens[j];
        const e2 = entityTokens[j + 1];

        console.log(`\n  Path: "${e1.text}" → "${e2.text}"`);

        const path = findShortestPath(e1, e2, tokens);

        if (!path) {
          console.log('    No path found');
          continue;
        }

        console.log(`    Signature: ${path.signature}`);
        console.log(`    Description: ${describePath(path)}`);

        const match = matchDependencyPath(path);
        if (match) {
          console.log(`    ✓ MATCH: ${match.predicate} (confidence: ${match.confidence})`);
        } else {
          console.log(`    ✗ No pattern match`);
        }
      }

    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
}

async function testOnRealSentences() {
  console.log('\n\n' + '='.repeat(80));
  console.log('REAL EXTRACTION TEST');
  console.log('='.repeat(80));

  const sentences = [
    "She made him a husband",
    "Jessica Martinez founded DataFlow Technologies",
    "DataVision Systems was founded by Eric Nelson",
  ];

  for (const text of sentences) {
    console.log(`\n"${text}"`);
    console.log('-'.repeat(80));

    const { entities, relations } = await extractFromSegments(`path-test`, text);

    console.log(`Entities (${entities.length}):`);
    for (const e of entities) {
      console.log(`  - ${e.canonical} (${e.type})`);
    }

    console.log(`Relations (${relations.length}):`);
    for (const rel of relations) {
      const subj = entities.find(e => e.id === rel.subj)?.canonical || rel.subj.slice(0, 8);
      const obj = entities.find(e => e.id === rel.obj)?.canonical || rel.obj.slice(0, 8);
      console.log(`  ${rel.pred}: ${subj} → ${obj}`);
    }
  }
}

async function main() {
  await testComplexPatterns();
  await testOnRealSentences();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
