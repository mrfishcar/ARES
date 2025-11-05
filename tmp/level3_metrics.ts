import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import * as path from 'path';

type EntityType = 'PERSON' | 'PLACE' | 'ORG' | 'DATE' | 'HOUSE' | 'ITEM' | 'WORK' | 'EVENT';
interface TestCase {
  id: string;
  text: string;
  gold: {
    entities: { text: string; type: EntityType }[];
    relations: { subj: string; pred: string; obj: string }[];
  };
}

const testCases: TestCase[] = [
  {
    id: '3.1',
    text: `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic.`,
    gold: {
      entities: [
        { text: 'Harry Potter', type: 'PERSON' },
        { text: 'James', type: 'PERSON' },
        { text: 'Lily Potter', type: 'PERSON' },
        { text: 'Dursleys', type: 'PERSON' },
        { text: 'Privet Drive', type: 'PLACE' },
        { text: 'Ron Weasley', type: 'PERSON' },
        { text: 'Arthur', type: 'PERSON' },
        { text: 'Ministry of Magic', type: 'ORG' }
      ],
      relations: []
    }
  },
  {
    id: '3.2',
    text: `Hermione Granger was sorted into Gryffindor House. Harry Potter and Ron Weasley were also in Gryffindor.

Draco Malfoy, on the other hand, joined Slytherin. He became a rival to Harry.`,
    gold: {
      entities: [
        { text: 'Hermione Granger', type: 'PERSON' },
        { text: 'Gryffindor', type: 'ORG' },
        { text: 'Harry Potter', type: 'PERSON' },
        { text: 'Ron Weasley', type: 'PERSON' },
        { text: 'Draco Malfoy', type: 'PERSON' },
        { text: 'Slytherin', type: 'ORG' }
      ],
      relations: []
    }
  },
  {
    id: '3.3',
    text: `Albus Dumbledore was the headmaster of Hogwarts. The wise wizard had a phoenix named Fawkes.

He trusted Severus Snape completely. The headmaster believed Snape was loyal to the Order.`,
    gold: {
      entities: [
        { text: 'Albus Dumbledore', type: 'PERSON' },
        { text: 'Hogwarts', type: 'ORG' },
        { text: 'Fawkes', type: 'PERSON' },
        { text: 'Severus Snape', type: 'PERSON' }
      ],
      relations: []
    }
  },
  {
    id: '3.4',
    text: `In 1991, Harry Potter started at Hogwarts School. He quickly became friends with Ron and Hermione.

During his first year, Harry faced Voldemort in the chamber. The young wizard survived the encounter.`,
    gold: {
      entities: [
        { text: '1991', type: 'DATE' },
        { text: 'Harry Potter', type: 'PERSON' },
        { text: 'Hogwarts School', type: 'ORG' },
        { text: 'Ron', type: 'PERSON' },
        { text: 'Hermione', type: 'PERSON' },
        { text: 'Voldemort', type: 'PERSON' }
      ],
      relations: []
    }
  },
  {
    id: '3.5',
    text: `The Weasley family lived at the Burrow. Molly Weasley was Arthur's wife. Their children included Ron, Ginny, Fred, and George.

Bill Weasley, the eldest son, worked for Gringotts Bank.`,
    gold: {
      entities: [
        { text: 'Burrow', type: 'PLACE' },
        { text: 'Molly Weasley', type: 'PERSON' },
        { text: 'Arthur', type: 'PERSON' },
        { text: 'Ron', type: 'PERSON' },
        { text: 'Ginny', type: 'PERSON' },
        { text: 'Fred', type: 'PERSON' },
        { text: 'George', type: 'PERSON' },
        { text: 'Bill Weasley', type: 'PERSON' },
        { text: 'Gringotts Bank', type: 'ORG' }
      ],
      relations: []
    }
  },
  {
    id: '3.6',
    text: `Luna Lovegood was a unique student at Hogwarts. She was sorted into Ravenclaw House.

The eccentric girl became close friends with Ginny Weasley. Luna believed in many unusual creatures.

Her father published The Quibbler, a magazine about mysterious phenomena.`,
    gold: {
      entities: [
        { text: 'Luna Lovegood', type: 'PERSON' },
        { text: 'Hogwarts', type: 'ORG' },
        { text: 'Ravenclaw', type: 'ORG' },
        { text: 'Ginny Weasley', type: 'PERSON' },
        { text: 'Quibbler', type: 'WORK' }
      ],
      relations: []
    }
  }
];

const testPath = path.join(process.cwd(), 'test-ladder-3.json');

function toKey(type: string, text: string) {
  return `${type}::${text.toLowerCase()}`;
}

function precision(extracted: Set<string>, gold: Set<string>) {
  if (extracted.size === 0) return 0;
  let correct = 0;
  for (const item of extracted) {
    if (gold.has(item)) correct++;
  }
  return correct / extracted.size;
}

function recall(extracted: Set<string>, gold: Set<string>) {
  if (gold.size === 0) return 1;
  let correct = 0;
  for (const item of gold) {
    if (extracted.has(item)) correct++;
  }
  return correct / gold.size;
}

(async () => {
  const results: { id: string; p: number; r: number; gold: string[]; extracted: string[]; missing: string[]; extra: string[] }[] = [];
  for (const tc of testCases) {
    clearStorage(testPath);
    await appendDoc(tc.id, tc.text, testPath);
    const graph = loadGraph(testPath)!;
    const extracted = new Set(graph.entities.map(e => toKey(e.type, e.canonical)));
    const gold = new Set(tc.gold.entities.map(e => toKey(e.type, e.text)));
    const p = precision(extracted, gold);
    const r = recall(extracted, gold);
    const missing = Array.from(gold).filter(item => !extracted.has(item));
    const extra = Array.from(extracted).filter(item => !gold.has(item));
    results.push({
      id: tc.id,
      p,
      r,
      gold: Array.from(gold),
      extracted: Array.from(extracted),
      missing,
      extra
    });
  }
  clearStorage(testPath);
  console.log(JSON.stringify(results, null, 2));
})();
