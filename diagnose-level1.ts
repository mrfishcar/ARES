import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';
import * as path from 'path';

// Same test cases from level-1-simple.spec.ts (all 20 tests)
const testCases = [
  {
    id: '1.1',
    text: 'Aragorn, son of Arathorn, married Arwen.',
    gold: {
      entities: ['Aragorn', 'Arathorn', 'Arwen'],
    }
  },
  {
    id: '1.2',
    text: 'Frodo is the son of Drogo.',
    gold: {
      entities: ['Frodo', 'Drogo'],
    }
  },
  {
    id: '1.3',
    text: 'Harry married Ginny.',
    gold: {
      entities: ['Harry', 'Ginny'],
    }
  },
  {
    id: '1.4',
    text: 'Gandalf traveled to Rivendell.',
    gold: {
      entities: ['Gandalf', 'Rivendell'],
    }
  },
  {
    id: '1.5',
    text: 'Bilbo lived in the Shire.',
    gold: {
      entities: ['Bilbo', 'Shire'],
    }
  },
  {
    id: '1.6',
    text: 'Hermione went to Hogwarts.',
    gold: {
      entities: ['Hermione', 'Hogwarts'],
    }
  },
  {
    id: '1.7',
    text: 'Dumbledore teaches at Hogwarts.',
    gold: {
      entities: ['Dumbledore', 'Hogwarts'],
    }
  },
  {
    id: '1.8',
    text: 'Ron studies at Hogwarts.',
    gold: {
      entities: ['Ron', 'Hogwarts'],
    }
  },
  {
    id: '1.9',
    text: 'Aragorn became king of Gondor.',
    gold: {
      entities: ['Aragorn', 'Gondor'],
    }
  },
  {
    id: '1.10',
    text: 'Theoden ruled Rohan.',
    gold: {
      entities: ['Theoden', 'Rohan'],
    }
  },
  {
    id: '1.11',
    text: 'Legolas was friends with Gimli.',
    gold: {
      entities: ['Legolas', 'Gimli'],
    }
  },
  {
    id: '1.12',
    text: 'Frodo fought against Gollum.',
    gold: {
      entities: ['Frodo', 'Gollum'],
    }
  },
  {
    id: '1.13',
    text: 'Aragorn married Arwen in 3019.',
    gold: {
      entities: ['Aragorn', 'Arwen', '3019'],
    }
  },
  {
    id: '1.14',
    text: 'Gandalf traveled to Minas Tirith in 3019.',
    gold: {
      entities: ['Gandalf', 'Minas Tirith', '3019'],
    }
  },
  {
    id: '1.15',
    text: 'Harry Potter attended Hogwarts School.',
    gold: {
      entities: ['Harry Potter', 'Hogwarts School'],
    }
  },
  {
    id: '1.16',
    text: 'Frodo Baggins lived in Bag End.',
    gold: {
      entities: ['Frodo Baggins', 'Bag End'],
    }
  },
  {
    id: '1.17',
    text: 'Sam traveled to Mordor.',
    gold: {
      entities: ['Sam', 'Mordor'],
    }
  },
  {
    id: '1.18',
    text: 'Boromir is the son of Denethor.',
    gold: {
      entities: ['Boromir', 'Denethor'],
    }
  },
  {
    id: '1.19',
    text: 'Eowyn fought in the Battle of Pelennor Fields.',
    gold: {
      entities: ['Eowyn', 'Battle of Pelennor Fields'],
    }
  },
  {
    id: '1.20',
    text: 'Elrond dwelt in Rivendell.',
    gold: {
      entities: ['Elrond', 'Rivendell'],
    }
  },
];

async function diagnose() {
  const testPath = path.join(process.cwd(), 'test-diagnose.json');

  console.log('\n🔍 ENTITY EXTRACTION DIAGNOSIS\n');

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

  console.log(`\n📊 Overall Stats (all 20 tests):`);
  console.log(`   Precision: ${(overallP * 100).toFixed(1)}%`);
  console.log(`   Recall: ${(overallR * 100).toFixed(1)}%`);
  console.log(`   F1: ${(f1 * 100).toFixed(1)}%`);
  console.log(`   Failures: ${failures}/20\n`);

  clearStorage(testPath);
}

diagnose().catch(console.error);
