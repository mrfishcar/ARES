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
  },
  {
    id: '3.7',
    text: `Harry, Ron, and Hermione formed a powerful trio. They fought together against the Death Eaters.

The three friends traveled to many dangerous places during their quest.`,
    gold: {
      entities: [
        { text: 'Harry', type: 'PERSON' },
        { text: 'Ron', type: 'PERSON' },
        { text: 'Hermione', type: 'PERSON' }
      ],
      relations: []
    }
  },
  {
    id: '3.8',
    text: `After the war, Harry Potter married Ginny Weasley. They had three children together.

Ron Weasley married Hermione Granger. The couple had two children.`,
    gold: {
      entities: [
        { text: 'Harry Potter', type: 'PERSON' },
        { text: 'Ginny Weasley', type: 'PERSON' },
        { text: 'Ron Weasley', type: 'PERSON' },
        { text: 'Hermione Granger', type: 'PERSON' }
      ],
      relations: []
    }
  },
  {
    id: '3.9',
    text: `Professor McGonagall taught Transfiguration at Hogwarts. She was also the head of Gryffindor House.

Professor Snape taught Potions. The stern professor later became headmaster.`,
    gold: {
      entities: [
        { text: 'Professor McGonagall', type: 'PERSON' },
        { text: 'Hogwarts', type: 'ORG' },
        { text: 'Gryffindor', type: 'ORG' },
        { text: 'Professor Snape', type: 'PERSON' }
      ],
      relations: []
    }
  },
  {
    id: '3.10',
    text: `Hogwarts School was located in Scotland. Students traveled there via the Hogwarts Express from Platform 9¾.

The castle had four houses: Gryffindor, Slytherin, Hufflepuff, and Ravenclaw. Each house had its own common room.`,
    gold: {
      entities: [
        { text: 'Hogwarts School', type: 'ORG' },
        { text: 'Scotland', type: 'PLACE' },
        { text: 'Hogwarts Express', type: 'ITEM' },
        { text: 'Gryffindor', type: 'ORG' },
        { text: 'Slytherin', type: 'ORG' },
        { text: 'Hufflepuff', type: 'ORG' },
        { text: 'Ravenclaw', type: 'ORG' }
      ],
      relations: []
    }
  }
];

function precision(extracted: Set<string>, gold: Set<string>) {
  if (extracted.size === 0) return 0;
  let correct = 0;
  for (const item of extracted) if (gold.has(item)) correct++;
  return correct / extracted.size;
}

function recall(extracted: Set<string>, gold: Set<string>) {
  if (gold.size === 0) return 1;
  let correct = 0;
  for (const item of gold) if (extracted.has(item)) correct++;
  return correct / gold.size;
}

(async () => {
  const testPath = path.join(process.cwd(), 'tmp', 'level3-full.json');
  const results: any[] = [];
  for (const tc of testCases) {
    clearStorage(testPath);
    await appendDoc(tc.id, tc.text, testPath);
    const graph = loadGraph(testPath)!;
    const extracted = new Set(graph.entities.map(e => `${e.type}::${e.canonical.toLowerCase()}`));
    const gold = new Set(tc.gold.entities.map(e => `${e.type}::${e.text.toLowerCase()}`));
    const p = precision(extracted, gold);
    const r = recall(extracted, gold);
    results.push({ id: tc.id, p, r, extracted: Array.from(extracted), gold: Array.from(gold) });
  }
  console.log(JSON.stringify(results, null, 2));
})();
