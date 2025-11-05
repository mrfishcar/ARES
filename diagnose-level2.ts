import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';
import * as path from 'path';

// Same test cases from level-2-multisentence.spec.ts
const testCases = [
  {
    id: '2.1',
    text: 'Harry went to Hogwarts. He studied magic there.',
    gold: {
      entities: [{text: 'Harry', type: 'PERSON'}, {text: 'Hogwarts', type: 'ORG'}],
    }
  },
  {
    id: '2.2',
    text: 'Hermione lives in London. She studies at Hogwarts.',
    gold: {
      entities: ['Hermione', 'London', 'Hogwarts'],
    }
  },
  {
    id: '2.3',
    text: 'Frodo lived in the Shire. He traveled to Mordor.',
    gold: {
      entities: ['Frodo', 'Shire', 'Mordor'],
    }
  },
  {
    id: '2.4',
    text: 'Aragorn married Arwen. He loved her deeply.',
    gold: {
      entities: ['Aragorn', 'Arwen'],
    }
  },
  {
    id: '2.5',
    text: 'Ginny studied at Hogwarts. She married Harry.',
    gold: {
      entities: ['Ginny', 'Hogwarts', 'Harry'],
    }
  },
  {
    id: '2.6',
    text: 'Gandalf traveled to Rivendell. Elrond lived there. He welcomed Gandalf.',
    gold: {
      entities: ['Gandalf', 'Rivendell', 'Elrond'],
    }
  },
  {
    id: '2.7',
    text: 'Harry and Ron studied at Hogwarts.',
    gold: {
      entities: ['Harry', 'Ron', 'Hogwarts'],
    }
  },
  {
    id: '2.8',
    text: 'Frodo and Sam traveled to Mordor.',
    gold: {
      entities: ['Frodo', 'Sam', 'Mordor'],
    }
  },
  {
    id: '2.9',
    text: 'Aragorn became king of Gondor. The king ruled wisely.',
    gold: {
      entities: ['Aragorn', 'Gondor'],
    }
  },
  {
    id: '2.10',
    text: 'Dumbledore is a wizard. The wizard teaches at Hogwarts.',
    gold: {
      entities: ['Dumbledore', 'Hogwarts'],
    }
  },
  {
    id: '2.11',
    text: 'Boromir is the son of Denethor. He was a brave warrior.',
    gold: {
      entities: ['Boromir', 'Denethor'],
    }
  },
  {
    id: '2.12',
    text: 'Aragorn, son of Arathorn, traveled to Gondor. He became king there.',
    gold: {
      entities: ['Aragorn', 'Arathorn', 'Gondor'],
    }
  },
  {
    id: '2.13',
    text: 'Legolas was an elf. He was friends with Gimli. They traveled together.',
    gold: {
      entities: ['Legolas', 'Gimli'],
    }
  },
  {
    id: '2.14',
    text: 'Theoden ruled Rohan. Eowyn was his niece. She lived in Rohan.',
    gold: {
      entities: ['Theoden', 'Rohan', 'Eowyn'],
    }
  },
  {
    id: '2.15',
    text: 'Elrond dwelt in Rivendell. The elf lord welcomed travelers. He was wise and ancient.',
    gold: {
      entities: ['Elrond', 'Rivendell'],
    }
  },
];

async function diagnose() {
  const testPath = path.join(process.cwd(), 'test-diagnose-l2.json');

  console.log('\n🔍 LEVEL 2 ENTITY EXTRACTION DIAGNOSIS\n');

  let totalGold = 0;
  let totalExtracted = 0;
  let totalCorrect = 0;
  let failures = 0;

  for (const tc of testCases) {
    clearStorage(testPath);
    await appendDoc(tc.id, tc.text, testPath);
    const graph = loadGraph(testPath)!;

    const extracted = new Set(graph.entities.map(e => e.canonical.toLowerCase()));
    const gold = new Set(tc.gold.entities.map(e => e.toLowerCase()));

    const correct = Array.from(extracted).filter(e => gold.has(e)).length;
    const missing = Array.from(gold).filter(e => !extracted.has(e));
    const extra = Array.from(extracted).filter(e => !gold.has(e));

    const precision = extracted.size > 0 ? correct / extracted.size : 0;
    const recall = gold.size > 0 ? correct / gold.size : 0;

    totalGold += gold.size;
    totalExtracted += extracted.size;
    totalCorrect += correct;

    if (precision < 1.0 || recall < 1.0) {
      failures++;
      console.log(`❌ Test ${tc.id}: "${tc.text}"`);
      console.log(`   P: ${(precision * 100).toFixed(0)}%  R: ${(recall * 100).toFixed(0)}%`);
      console.log(`   Gold: ${tc.gold.entities.join(', ')}`);
      console.log(`   Extracted: ${Array.from(extracted).join(', ')}`);
      if (missing.length > 0) console.log(`   Missing: ${missing.join(', ')}`);
      if (extra.length > 0) console.log(`   Extra: ${extra.join(', ')}`);
      console.log();
    } else {
      console.log(`✅ Test ${tc.id}: Perfect`);
    }
  }

  const overallP = totalExtracted > 0 ? totalCorrect / totalExtracted : 0;
  const overallR = totalGold > 0 ? totalCorrect / totalGold : 0;
  const f1 = overallP + overallR > 0 ? (2 * overallP * overallR) / (overallP + overallR) : 0;

  console.log(`\n📊 Overall Stats (all 15 tests):`);
  console.log(`   Precision: ${(overallP * 100).toFixed(1)}%`);
  console.log(`   Recall: ${(overallR * 100).toFixed(1)}%`);
  console.log(`   F1: ${(f1 * 100).toFixed(1)}%`);
  console.log(`   Failures: ${failures}/15\n`);

  clearStorage(testPath);
}

diagnose().catch(console.error);
