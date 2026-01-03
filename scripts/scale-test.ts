import { appendDoc, clearStorage } from '../app/storage/storage';

// Generate a 10k word document
const paragraphs: string[] = [];
const names = ['John Smith', 'Sarah Chen', 'Michael Johnson', 'Emily Davis', 'David Wilson',
               'Jennifer Brown', 'Robert Garcia', 'Maria Martinez', 'William Anderson', 'Elizabeth Taylor'];
const places = ['New York', 'London', 'Tokyo', 'Paris', 'Berlin', 'Sydney', 'Toronto', 'Mumbai', 'Beijing', 'Seoul'];
const orgs = ['Microsoft', 'Google', 'Apple', 'Amazon', 'Meta', 'Tesla', 'IBM', 'Intel', 'Oracle', 'Cisco'];

for (let i = 0; i < 200; i++) {
  const name1 = names[i % names.length];
  const name2 = names[(i + 3) % names.length];
  const place = places[i % places.length];
  const org = orgs[i % orgs.length];
  paragraphs.push(`${name1} traveled to ${place} to meet with executives at ${org}. ` +
    `During the meeting, ${name1} discussed the partnership with ${name2}, who had been ` +
    `working on the project for several months. The ${org} headquarters in ${place} ` +
    `provided an excellent venue for the strategic discussions.`);
}

const text = paragraphs.join('\n\n');
const wordCount = text.split(/\s+/).length;

console.log(`Generated document: ${wordCount} words`);

async function runTest() {
  const start = Date.now();
  clearStorage('./data/scale-test.json');

  try {
    const result = await appendDoc('scale-test', text, './data/scale-test.json');
    const elapsed = (Date.now() - start) / 1000;
    const wordsPerSec = Math.round(wordCount / elapsed);

    console.log(`\n=== SCALE TEST RESULTS ===`);
    console.log(`Text: ${wordCount} words`);
    console.log(`Time: ${elapsed.toFixed(2)}s`);
    console.log(`Speed: ${wordsPerSec} words/sec`);
    console.log(`Entities: ${result.entities.length}`);
    console.log(`Relations: ${result.relations.length}`);
    console.log(`Target: >= 100 words/sec`);
    console.log(`Status: ${wordsPerSec >= 100 ? 'PASSED' : 'FAILED'}`);
  } catch (err) {
    console.error('Test failed:', err);
  }
}

runTest();
