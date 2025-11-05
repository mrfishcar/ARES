import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';
import * as path from 'path';

// First 3 test cases from Level 3
const testCases = [
  {
    id: '3.1',
    text: `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

    Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic.`,
    gold: {
      entities: ['Harry Potter', 'James', 'Lily Potter', 'Dursleys', 'Privet Drive', 'Ron Weasley', 'Arthur', 'Ministry of Magic']
    }
  },
  {
    id: '3.2',
    text: `Hermione Granger was sorted into Gryffindor House. Harry Potter and Ron Weasley were also in Gryffindor.

    Draco Malfoy, on the other hand, joined Slytherin. He became a rival to Harry.`,
    gold: {
      entities: ['Hermione Granger', 'Gryffindor', 'Harry Potter', 'Ron Weasley', 'Draco Malfoy', 'Slytherin']
    }
  },
  {
    id: '3.3',
    text: `Albus Dumbledore was the headmaster of Hogwarts. The wise wizard had a phoenix named Fawkes.

    He trusted Severus Snape completely. The headmaster believed Snape was loyal to the Order.`,
    gold: {
      entities: ['Albus Dumbledore', 'Hogwarts', 'Fawkes', 'Severus Snape']
    }
  }
];

async function diagnose() {
  const testPath = path.join(process.cwd(), 'test-diagnose-l3.json');

  console.log('\n🔍 LEVEL 3 ENTITY EXTRACTION DIAGNOSIS\n');

  for (const tc of testCases) {
    clearStorage(testPath);
    await appendDoc(tc.id, tc.text, testPath);
    const graph = loadGraph(testPath)!;
    if (tc.id === '3.1') {
      console.log('DEBUG 3.1 entities', graph.entities.map(e => e.canonical));
    }

    const extracted = new Set(graph.entities.map(e => e.canonical.toLowerCase()));
    const gold = new Set(tc.gold.entities.map(e => e.toLowerCase()));

    const correct = Array.from(extracted).filter(e => gold.has(e)).length;
    const missing = Array.from(gold).filter(e => !extracted.has(e));
    const extra = Array.from(extracted).filter(e => !gold.has(e));

    const precision = extracted.size > 0 ? correct / extracted.size : 0;
    const recall = gold.size > 0 ? correct / gold.size : 0;

    console.log(`Test ${tc.id}: P=${(precision * 100).toFixed(1)}%, R=${(recall * 100).toFixed(1)}%`);
    console.log(`  Gold (${gold.size}): ${Array.from(gold).join(', ')}`);
    console.log(`  Extracted (${extracted.size}): ${Array.from(extracted).join(', ')}`);
    if (missing.length > 0) console.log(`  Missing: ${missing.join(', ')}`);
    if (extra.length > 0) console.log(`  Extra: ${extra.join(', ')}`);
    console.log();
  }

  clearStorage(testPath);
}

diagnose().catch(console.error);
