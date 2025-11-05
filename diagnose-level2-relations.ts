import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';
import * as path from 'path';

type EntityType = 'PERSON' | 'PLACE' | 'ORG' | 'DATE' | 'HOUSE' | 'ITEM' | 'WORK' | 'EVENT';

// Test cases with relations
const testCases = [
  {
    id: '2.1',
    text: 'Harry went to Hogwarts. He studied magic there.',
    gold: {
      relations: [
        { subj: 'Harry', pred: 'traveled_to', obj: 'Hogwarts' },
        { subj: 'Harry', pred: 'studies_at', obj: 'Hogwarts' }
      ]
    }
  },
  {
    id: '2.2',
    text: 'Hermione lives in London. She studies at Hogwarts.',
    gold: {
      relations: [
        { subj: 'Hermione', pred: 'lives_in', obj: 'London' },
        { subj: 'Hermione', pred: 'studies_at', obj: 'Hogwarts' }
      ]
    }
  },
  {
    id: '2.3',
    text: 'Frodo lived in the Shire. He traveled to Mordor.',
    gold: {
      relations: [
        { subj: 'Frodo', pred: 'lives_in', obj: 'Shire' },
        { subj: 'Frodo', pred: 'traveled_to', obj: 'Mordor' }
      ]
    }
  },
  {
    id: '2.4',
    text: 'Aragorn married Arwen. He loved her deeply.',
    gold: {
      relations: [
        { subj: 'Aragorn', pred: 'married_to', obj: 'Arwen' },
        { subj: 'Arwen', pred: 'married_to', obj: 'Aragorn' }
      ]
    }
  },
  {
    id: '2.5',
    text: 'Ginny studied at Hogwarts. She married Harry.',
    gold: {
      relations: [
        { subj: 'Ginny', pred: 'studies_at', obj: 'Hogwarts' },
        { subj: 'Ginny', pred: 'married_to', obj: 'Harry' },
        { subj: 'Harry', pred: 'married_to', obj: 'Ginny' }
      ]
    }
  },
  {
    id: '2.7',
    text: 'Harry and Ron studied at Hogwarts.',
    gold: {
      relations: [
        { subj: 'Harry', pred: 'studies_at', obj: 'Hogwarts' },
        { subj: 'Ron', pred: 'studies_at', obj: 'Hogwarts' }
      ]
    }
  },
];

async function diagnose() {
  const testPath = path.join(process.cwd(), 'test-diagnose-l2-rel.json');

  console.log('\n🔍 LEVEL 2 RELATION EXTRACTION DIAGNOSIS\n');

  let totalGold = 0;
  let totalExtracted = 0;
  let totalCorrect = 0;
  let failures = 0;

  for (const tc of testCases) {
    clearStorage(testPath);
    await appendDoc(tc.id, tc.text, testPath);
    const graph = loadGraph(testPath)!;

    const extracted = new Set(
      graph.relations.map(r => {
        const subj = graph.entities.find(e => e.id === r.subj)?.canonical.toLowerCase() || '';
        const obj = graph.entities.find(e => e.id === r.obj)?.canonical.toLowerCase() || '';
        return `${subj}::${r.pred}::${obj}`;
      })
    );
    const gold = new Set(tc.gold.relations.map(r => `${r.subj.toLowerCase()}::${r.pred}::${r.obj.toLowerCase()}`));

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
      console.log(`   Gold: ${Array.from(gold).join(', ')}`);
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

  console.log(`\n📊 Overall Stats (sample tests):`)
  console.log(`   Precision: ${(overallP * 100).toFixed(1)}%`);
  console.log(`   Recall: ${(overallR * 100).toFixed(1)}%`);
  console.log(`   F1: ${(f1 * 100).toFixed(1)}%`);
  console.log(`   Failures: ${failures}/${testCases.length}\n`);

  clearStorage(testPath);
}

diagnose().catch(console.error);
