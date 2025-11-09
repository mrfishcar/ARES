import { describe, it, expect } from 'vitest';
import { appendDoc, loadGraph, clearStorage } from '../../app/storage/storage';

/**
 * Real Literature Test
 *
 * This test uses a passage from "A Tale of Two Cities" by Charles Dickens (1859)
 * Public domain text to validate extraction quality on real narrative prose.
 */
describe('Real Literature - A Tale of Two Cities', { timeout: 60000 }, () => {
  const literaryText = `
It was the best of times, it was the worst of times, it was the age of wisdom,
it was the age of foolishness, it was the epoch of belief, it was the epoch of
incredulity, it was the season of Light, it was the season of Darkness, it was
the spring of hope, it was the winter of despair, we had everything before us,
we had nothing before us, we were all going direct to Heaven, we were all going
direct the other way—in short, the period was so far like the present period,
that some of its noisiest authorities insisted on its being received, for good
or for evil, in the superlative degree of comparison only.

There were a king with a large jaw and a queen with a plain face, on the throne
of England; there were a king with a large jaw and a queen with a fair face, on
the throne of France. In both countries it was clearer than crystal to the lords
of the State preserves of loaves and fishes, that things in general were settled
for ever.

It was the year of Our Lord one thousand seven hundred and seventy-five. Spiritual
revelations were conceded to England at that favoured period, as at this. Mrs.
Southcott had recently attained her five-and-twentieth year, and Monsieur the
Marquis had carried away the four strong men besides the cook to summon them to
a Court at Versailles.
  `.trim();

  it('should extract place entities from real literature', async () => {
    const testPath = '/tmp/test-literature.json';
    clearStorage(testPath);

    await appendDoc('tale-of-two-cities', literaryText, testPath);
    const graph = loadGraph(testPath);

    expect(graph).toBeDefined();
    expect(graph!.entities.length).toBeGreaterThan(0);

    const places = graph!.entities
      .filter(e => e.type === 'PLACE')
      .map(e => e.canonical);

    console.log('\n=== PLACES EXTRACTED ===');
    console.log(places.join(', '));

    // Should extract major place names
    expect(places).toContain('England');
    expect(places).toContain('France');
    // Versailles might be extracted
    const hasVersailles = places.some(p => p.includes('Versailles'));
    console.log('Versailles extracted:', hasVersailles);
  });

  it('should extract person entities from real literature', async () => {
    const testPath = '/tmp/test-literature.json';
    clearStorage(testPath);

    await appendDoc('tale-of-two-cities', literaryText, testPath);
    const graph = loadGraph(testPath);

    const people = graph!.entities
      .filter(e => e.type === 'PERSON')
      .map(e => e.canonical);

    console.log('\n=== PEOPLE EXTRACTED ===');
    console.log(people.join(', '));

    // Should extract named people
    const hasSouthcott = people.some(p => p.includes('Southcott'));
    console.log('Mrs. Southcott extracted:', hasSouthcott);
    expect(hasSouthcott).toBe(true);
  });

  it('should extract dates from real literature', async () => {
    const testPath = '/tmp/test-literature.json';
    clearStorage(testPath);

    await appendDoc('tale-of-two-cities', literaryText, testPath);
    const graph = loadGraph(testPath);

    const dates = graph!.entities
      .filter(e => e.type === 'DATE')
      .map(e => e.canonical);

    console.log('\n=== DATES EXTRACTED ===');
    console.log(dates.join(', '));

    // Should extract the year 1775
    const has1775 = dates.some(d => d.includes('1775'));
    expect(has1775).toBe(true);
  });

  it('should show overall extraction statistics', async () => {
    const testPath = '/tmp/test-literature.json';
    clearStorage(testPath);

    await appendDoc('tale-of-two-cities', literaryText, testPath);
    const graph = loadGraph(testPath);

    console.log('\n=== EXTRACTION STATISTICS ===');
    console.log('Total entities:', graph!.entities.length);
    console.log('Total relations:', graph!.relations.length);

    // Group by type
    const byType: Record<string, number> = {};
    for (const entity of graph!.entities) {
      byType[entity.type] = (byType[entity.type] || 0) + 1;
    }

    console.log('\nEntities by type:');
    for (const [type, count] of Object.entries(byType)) {
      console.log(`  ${type}: ${count}`);
    }

    console.log('\nAll entities:');
    for (const entity of graph!.entities) {
      console.log(`  - ${entity.canonical} (${entity.type})`);
    }

    console.log('\nAll relations:');
    for (const rel of graph!.relations) {
      const subj = graph!.entities.find(e => e.id === rel.subj)?.canonical || rel.subj;
      const obj = graph!.entities.find(e => e.id === rel.obj)?.canonical || rel.obj;
      console.log(`  - ${subj} --[${rel.pred}]--> ${obj}`);
    }

    // Basic sanity checks
    expect(graph!.entities.length).toBeGreaterThan(2);
  });
});

/**
 * Bible Passage Test
 *
 * Using Ruth 1:1-5 (King James Version) - public domain
 * Tests family relationships and place names from biblical text
 */
describe('Real Literature - Book of Ruth', { timeout: 60000 }, () => {
  const biblicalText = `
Now it came to pass in the days when the judges ruled, that there was a famine
in the land. And a certain man of Bethlehem-judah went to sojourn in the country
of Moab, he, and his wife, and his two sons. And the name of the man was Elimelech,
and the name of his wife Naomi, and the name of his two sons Mahlon and Chilion,
Ephrathites of Bethlehem-judah. And they came into the country of Moab, and
continued there. And Elimelech Naomi's husband died; and she was left, and her
two sons. And they took them wives of the women of Moab; the name of the one was
Orpah, and the name of the other Ruth: and they dwelled there about ten years.
And Mahlon and Chilion died also both of them; and the woman was left of her two
sons and her husband.
  `.trim();

  it('should extract family members from Ruth', async () => {
    const testPath = '/tmp/test-ruth.json';
    clearStorage(testPath);

    await appendDoc('ruth-1', biblicalText, testPath);
    const graph = loadGraph(testPath);

    const people = graph!.entities
      .filter(e => e.type === 'PERSON')
      .map(e => e.canonical)
      .sort();

    console.log('\n=== PEOPLE FROM RUTH ===');
    console.log(people.join(', '));

    // Should extract main characters
    expect(people).toContain('Elimelech');
    expect(people).toContain('Naomi');
    expect(people).toContain('Mahlon');
    expect(people).toContain('Chilion');
    expect(people).toContain('Ruth');
    expect(people).toContain('Orpah');
  });

  it('should extract places from Ruth', async () => {
    const testPath = '/tmp/test-ruth.json';
    clearStorage(testPath);

    await appendDoc('ruth-1', biblicalText, testPath);
    const graph = loadGraph(testPath);

    const places = graph!.entities
      .filter(e => e.type === 'PLACE')
      .map(e => e.canonical);

    console.log('\n=== PLACES FROM RUTH ===');
    console.log(places.join(', '));

    // Should extract place names
    const hasMoab = places.some(p => p.includes('Moab'));
    expect(hasMoab).toBe(true);

    // Bethlehem-judah might be extracted
    const hasBethlehem = places.some(p => p.toLowerCase().includes('bethlehem'));
    console.log('Bethlehem extracted:', hasBethlehem);
  });

  it('should extract family relationships', async () => {
    const testPath = '/tmp/test-ruth.json';
    clearStorage(testPath);

    await appendDoc('ruth-1', biblicalText, testPath);
    const graph = loadGraph(testPath);

    console.log('\n=== RELATIONS FROM RUTH ===');
    console.log('Total relations:', graph!.relations.length);

    for (const rel of graph!.relations) {
      const subj = graph!.entities.find(e => e.id === rel.subj)?.canonical || rel.subj;
      const obj = graph!.entities.find(e => e.id === rel.obj)?.canonical || rel.obj;
      console.log(`  - ${subj} --[${rel.pred}]--> ${obj}`);
    }

    // Should extract at least some family relations
    expect(graph!.relations.length).toBeGreaterThan(0);

    // Check for married_to relation
    const hasMarried = graph!.relations.some(r => r.pred === 'married_to');
    console.log('Has married_to relations:', hasMarried);
  });
});
