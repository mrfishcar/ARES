import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import * as path from 'path';

const testCases = [
  {
    id: '3.1',
    text: `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic.`,
    gold: ['Harry Potter', 'James', 'Lily Potter', 'Dursleys', 'Privet Drive', 'Ron Weasley', 'Arthur', 'Ministry of Magic']
  },
  {
    id: '3.2',
    text: `Hermione Granger was sorted into Gryffindor House. Harry Potter and Ron Weasley were also in Gryffindor.

Draco Malfoy, on the other hand, joined Slytherin. He became a rival to Harry.`,
    gold: ['Hermione Granger', 'Gryffindor', 'Harry Potter', 'Ron Weasley', 'Draco Malfoy', 'Slytherin']
  },
  {
    id: '3.3',
    text: `Albus Dumbledore was the headmaster of Hogwarts. The wise wizard had a phoenix named Fawkes.

He trusted Severus Snape completely. The headmaster believed Snape was loyal to the Order.`,
    gold: ['Albus Dumbledore', 'Hogwarts', 'Fawkes', 'Severus Snape']
  }
];

(async () => {
  const testPath = path.join(process.cwd(), 'test-ladder-3.json');
  for (const tc of testCases) {
    clearStorage(testPath);
    await appendDoc(tc.id, tc.text, testPath);
    const graph = loadGraph(testPath)!;
    const extracted = new Set(graph.entities.map(e => `${e.type}::${e.canonical.toLowerCase()}`));
    const gold = new Set(tc.gold.map(text => `${'PERSON'}::${text.toLowerCase()}`));
    console.log(tc.id, 'entities', graph.entities.map(e => `${e.type}:${e.canonical}`));
  }
  clearStorage(testPath);
})();
