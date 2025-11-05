/**
 * Biography/Timeline Composer Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import { compose } from '../app/generate/exposition';
import * as path from 'path';

describe('Biography Composer', () => {
  const testPath = path.join(process.cwd(), 'test-biography.json');

  beforeEach(() => {
    clearStorage(testPath);
  });

  afterEach(() => {
    clearStorage(testPath);
  });

  it('Case A: David-like data with rules, marriages, enemies, travels', async () => {
    // Ingest documents with temporal events
    await appendDoc('doc1', 'David, son of Jesse, was born in Bethlehem in 1040 BCE.', testPath);
    await appendDoc('doc2', 'David married Michal, daughter of Saul, in 1025 BCE.', testPath);
    await appendDoc('doc3', 'David became king of Israel and began ruling in 1010 BCE.', testPath);
    await appendDoc('doc4', 'David fought in the Battle of the Valley of Elah in 1020 BCE.', testPath);
    await appendDoc('doc5', 'David traveled to Hebron in 1015 BCE.', testPath);
    await appendDoc('doc6', 'David was an enemy of Goliath.', testPath);
    await appendDoc('doc7', 'David authored the Book of Psalms.', testPath);

    const graph = loadGraph(testPath);
    expect(graph).not.toBeNull();

    const davidEntity = graph!.entities.find(e =>
      e.canonical === 'David' || e.aliases.includes('David')
    );
    expect(davidEntity).toBeDefined();

    const page = compose(davidEntity!.id, graph!.entities, graph!.relations, graph!.conflicts);

    // Verify Biography section exists
    expect(page.biography).toBeDefined();
    expect(page.biography!.length).toBeGreaterThan(0);

    // Verify timeline events are present
    expect(page.timeline).toBeDefined();
    expect(page.timeline!.length).toBeGreaterThan(0);

    // Verify chronological ordering (dated events should come first, sorted by year)
    const datedEvents = page.timeline!.filter(e => e.t !== Infinity);
    for (let i = 1; i < datedEvents.length; i++) {
      expect(datedEvents[i].t).toBeGreaterThanOrEqual(datedEvents[i - 1].t);
    }

    // Verify max 10 sentences in biography (for dated events)
    const sentenceCount = page.biography!.split(/[.!?]\s+/).filter(s => s.trim().length > 0).length;
    expect(sentenceCount).toBeLessThanOrEqual(10);

    // Verify no duplication between Biography and Relationships sections
    const biographyText = page.biography!.toLowerCase();
    const relationshipsText = page.sections.relationships.join(' ').toLowerCase();

    // Check for key events that should be in biography
    if (biographyText.includes('married') && biographyText.includes('michal')) {
      // If marriage is in biography, it should be suppressed from relationships
      // (or if in relationships, should not duplicate the exact same year/entity combo)
      const biographyHasMarriageMichal1025 =
        biographyText.includes('married') &&
        biographyText.includes('michal') &&
        biographyText.includes('1025');

      const relationshipsHasMarriageMichal1025 =
        relationshipsText.includes('married') &&
        relationshipsText.includes('michal') &&
        relationshipsText.includes('1025');

      // They should not both have the exact same dated marriage fact
      expect(biographyHasMarriageMichal1025 && relationshipsHasMarriageMichal1025).toBe(false);
    }
  });

  it('Case B: Only undated events', async () => {
    // Ingest documents without dates
    await appendDoc('doc1', 'Gandalf traveled to Rivendell.', testPath);
    await appendDoc('doc2', 'Gandalf fought in the Battle of Five Armies.', testPath);
    await appendDoc('doc3', 'Gandalf was friends with Aragorn.', testPath);
    await appendDoc('doc4', 'Gandalf lived in Middle-earth.', testPath);
    await appendDoc('doc5', 'Gandalf was an ally of the Free Peoples.', testPath);

    const graph = loadGraph(testPath);
    expect(graph).not.toBeNull();

    const gandalfEntity = graph!.entities.find(e =>
      e.canonical === 'Gandalf' || e.aliases.includes('Gandalf')
    );
    expect(gandalfEntity).toBeDefined();

    const page = compose(gandalfEntity!.id, graph!.entities, graph!.relations, graph!.conflicts);

    // Verify Biography section exists
    expect(page.biography).toBeDefined();

    // Verify timeline has undated events
    expect(page.timeline).toBeDefined();
    const undatedEvents = page.timeline!.filter(e => e.t === Infinity);
    expect(undatedEvents.length).toBeGreaterThan(0);

    // Verify max 5 sentences for undated events
    if (page.biography!.length > 0) {
      const sentenceCount = page.biography!.split(/[.!?]\s+/).filter(s => s.trim().length > 0).length;
      expect(sentenceCount).toBeLessThanOrEqual(5);
    }

    // Verify deterministic ordering (should be sorted by predicate weight)
    // Higher weight predicates should come first for undated events
    const weights: Record<string, number> = {
      married_to: 1.0,
      rules: 0.95,
      leads: 0.9,
      fought_in: 0.85,
      traveled_to: 0.8,
      authored: 0.75,
      lives_in: 0.7,
      ally_of: 0.4,
      friends_with: 0.45
    };

    for (let i = 1; i < undatedEvents.length; i++) {
      const prevWeight = weights[undatedEvents[i - 1].predicate] || 0;
      const currWeight = weights[undatedEvents[i].predicate] || 0;
      expect(prevWeight).toBeGreaterThanOrEqual(currWeight);
    }
  });

  it('Case C: Deduplication test', async () => {
    // Two documents with same married_to + year
    await appendDoc('doc1', 'Aragorn married Arwen in 3019.', testPath);
    await appendDoc('doc2', 'Aragorn, son of Arathorn, married Arwen in 3019.', testPath);
    await appendDoc('doc3', 'Aragorn fought in the Battle of the Pelennor Fields in 3019.', testPath);

    const graph = loadGraph(testPath);
    expect(graph).not.toBeNull();

    const aragornEntity = graph!.entities.find(e =>
      e.canonical === 'Aragorn' || e.aliases.includes('Aragorn')
    );
    expect(aragornEntity).toBeDefined();

    const page = compose(aragornEntity!.id, graph!.entities, graph!.relations, graph!.conflicts);

    // Verify Biography section exists
    expect(page.biography).toBeDefined();
    expect(page.timeline).toBeDefined();

    // Count how many times "married Arwen in 3019" appears in biography
    const biographyText = page.biography!;
    const marriageMatches = biographyText.match(/married.*?Arwen.*?3019/gi) || [];

    // Should appear exactly once (deduplicated)
    expect(marriageMatches.length).toBe(1);

    // Verify timeline has no duplicate keys
    const keys = page.timeline!.map(e => e.key);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);

    // Verify the marriage event key appears only once
    const marriageKeys = keys.filter(k => k.includes('married_to'));
    expect(marriageKeys.length).toBe(1);
  });
});
