/**
 * Page Quality Tests - Overview and Infobox improvements
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import { compose, scoreClaim } from '../app/generate/exposition';
import { toMarkdownPage } from '../app/generate/markdown';
import * as path from 'path';

describe('Page Quality Improvements', () => {
  const testPath = path.join(process.cwd(), 'test-page-quality.json');

  beforeEach(() => {
    clearStorage(testPath);
  });

  afterEach(() => {
    clearStorage(testPath);
  });

  it('Case A: David-like data - crisp overview and ordered infobox', async () => {
    // Ingest David-like biographical data
    await appendDoc('doc1', 'David, son of Jesse, was born in Bethlehem.', testPath);
    await appendDoc('doc2', 'David married Michal in 1025 BCE.', testPath);
    await appendDoc('doc3', 'David became king and ruled Israel in 1010 BCE.', testPath);
    await appendDoc('doc4', 'David was an enemy of Goliath.', testPath);
    await appendDoc('doc5', 'David authored the Book of Psalms.', testPath);

    const graph = loadGraph(testPath);
    expect(graph).not.toBeNull();

    const davidEntity = graph!.entities.find(e =>
      e.canonical === 'David' || e.aliases.includes('David')
    );
    expect(davidEntity).toBeDefined();

    const page = compose(davidEntity!.id, graph!.entities, graph!.relations, graph!.conflicts);

    // Overview should contain 2-3 crisp sentences
    const overviewSentences = page.overview.split(/[.!?]\s+/).filter(s => s.trim().length > 0);
    expect(overviewSentences.length).toBeGreaterThanOrEqual(2);
    expect(overviewSentences.length).toBeLessThanOrEqual(3);

    // Overview should prioritize: marriage, rule, or enemy/authored
    const overviewLower = page.overview.toLowerCase();
    const hasImportantFact =
      overviewLower.includes('married') ||
      overviewLower.includes('ruled') ||
      overviewLower.includes('king') ||
      overviewLower.includes('enemy') ||
      overviewLower.includes('authored');
    expect(hasImportantFact).toBe(true);

    // Infobox should show fields in correct order
    // Check that relatives are present (Parents/Spouse/Children)
    expect(page.infobox.relatives).toBeDefined();
    if (page.infobox.relatives) {
      // Parents should come before Spouse
      const relativesStr = page.infobox.relatives.join(' ');
      const parentsIndex = relativesStr.indexOf('Parents');
      const spouseIndex = relativesStr.indexOf('Spouse');

      if (parentsIndex >= 0 && spouseIndex >= 0) {
        expect(parentsIndex).toBeLessThan(spouseIndex);
      }
    }

    // If marriage appears in Biography, it should NOT be duplicated in Infobox with year
    if (page.biography && page.biography.includes('married')) {
      // Infobox should show spouse name but not repeat the year
      const infoboxText = JSON.stringify(page.infobox).toLowerCase();
      expect(infoboxText.includes('michal')).toBe(true);
    }

    // Rules/Titles should appear if present
    if (page.overview.toLowerCase().includes('israel')) {
      expect(page.infobox.titles).toBeDefined();
    }
  });

  it('Case B: Duplicate facts from multiple docs - deduplication works', async () => {
    // Ingest same facts from multiple documents
    await appendDoc('doc1', 'Aragorn married Arwen in 3019.', testPath);
    await appendDoc('doc2', 'Aragorn, son of Arathorn, married Arwen in 3019.', testPath);
    await appendDoc('doc3', 'Arwen married Aragorn in 3019.', testPath);  // Symmetric
    await appendDoc('doc4', 'Aragorn is the son of Arathorn.', testPath);
    await appendDoc('doc5', 'Arathorn is the father of Aragorn.', testPath);  // Inverse

    const graph = loadGraph(testPath);
    expect(graph).not.toBeNull();

    const aragornEntity = graph!.entities.find(e =>
      e.canonical === 'Aragorn' || e.aliases.includes('Aragorn')
    );
    expect(aragornEntity).toBeDefined();

    const page = compose(aragornEntity!.id, graph!.entities, graph!.relations, graph!.conflicts);

    // Overview should deduplicate - marriage should appear only once
    const overviewText = page.overview.toLowerCase();
    const marriageCount = (overviewText.match(/married.*arwen/g) || []).length;
    expect(marriageCount).toBeLessThanOrEqual(1);

    // Infobox should dedupe spouses (only show Arwen once)
    if (page.infobox.relatives) {
      const spouseLine = page.infobox.relatives.find(r => r.includes('Spouse'));
      if (spouseLine) {
        const arwenCount = (spouseLine.match(/Arwen/g) || []).length;
        expect(arwenCount).toBe(1);
      }
    }

    // Infobox should dedupe parents (only show Arathorn once if present)
    if (page.infobox.relatives) {
      const parentLine = page.infobox.relatives.find(r => r.includes('Parent'));
      if (parentLine && parentLine.includes('Arathorn')) {
        const arathornCount = (parentLine.match(/Arathorn/g) || []).length;
        expect(arathornCount).toBe(1);
      }
    }

    // Overall check: Infobox relatives should not have duplicate names
    if (page.infobox.relatives) {
      const allRelativesText = page.infobox.relatives.join(' ');
      // Count unique entity names - each should appear at most once per line
      const lines = page.infobox.relatives;
      for (const line of lines) {
        const names = line.match(/[A-Z][a-z]+/g) || [];
        const uniqueNames = new Set(names);
        // Allow "Parents" "Spouse" etc. but entity names should not repeat
        const entityNames = names.filter(n => !['Parents', 'Spouse', 'Children', 'Siblings'].includes(n));
        const uniqueEntityNames = new Set(entityNames);
        expect(entityNames.length).toBe(uniqueEntityNames.size);
      }
    }

    // Relationships section should suppress facts already in Overview or Biography
    const relationshipsText = page.sections.relationships.join(' ').toLowerCase();

    // If marriage is in biography with year, it should be suppressed from relationships
    if (page.biography && page.biography.toLowerCase().includes('married') && page.biography.includes('3019')) {
      // Relationships shouldn't have the exact same marriage with year
      expect(relationshipsText.includes('married arwen in 3019')).toBe(false);
    }
  });

  it('Case C: Dated vs undated preference - dated facts prioritized', async () => {
    // Ingest both dated and undated travel facts
    await appendDoc('doc1', 'Frodo traveled to Mordor.', testPath);
    await appendDoc('doc2', 'Frodo traveled to Rivendell in 3018.', testPath);
    await appendDoc('doc3', 'Frodo traveled to Lothlorien in 3019.', testPath);
    await appendDoc('doc4', 'Frodo lived in the Shire.', testPath);
    await appendDoc('doc5', 'Frodo lived in Bag End in 3001.', testPath);

    const graph = loadGraph(testPath);
    expect(graph).not.toBeNull();

    const frodoEntity = graph!.entities.find(e =>
      e.canonical === 'Frodo' || e.aliases.includes('Frodo')
    );
    expect(frodoEntity).toBeDefined();

    const page = compose(frodoEntity!.id, graph!.entities, graph!.relations, graph!.conflicts);

    // Overview should prefer dated facts over undated
    const overviewLower = page.overview.toLowerCase();

    // If traveled_to appears in overview, it should be one of the dated versions
    if (overviewLower.includes('traveled')) {
      // Should mention year
      const hasYear = /\d{4}/.test(page.overview);
      expect(hasYear).toBe(true);

      // Should be Rivendell (3018) or Lothlorien (3019), not Mordor (undated)
      const hasDatedLocation =
        overviewLower.includes('rivendell') ||
        overviewLower.includes('lothlorien');
      expect(hasDatedLocation).toBe(true);
    }

    // If lives_in appears, dated version (Bag End 3001) should be preferred
    if (overviewLower.includes('lived') || overviewLower.includes('bag end')) {
      // Should include year or specific place name
      const hasSpecificity =
        overviewLower.includes('bag end') ||
        overviewLower.includes('3001');
      expect(hasSpecificity).toBe(true);
    }

    // Test scoreClaim directly to verify dated facts score higher
    const relations = graph!.relations.filter(r => r.subj === frodoEntity!.id);
    const claims = relations.map(rel => {
      const objEntity = graph!.entities.find(e => e.id === rel.obj);
      return {
        relation: rel,
        subjectEntity: frodoEntity!,
        objectEntity: objEntity!,
        salience: 0
      };
    }).filter(c => c.objectEntity);

    const travelClaims = claims.filter(c => c.relation.pred === 'traveled_to');
    if (travelClaims.length > 1) {
      const scores = travelClaims.map(c => ({
        claim: c,
        score: scoreClaim(c),
        hasYear: c.relation.qualifiers?.some(q => q.type === 'time')
      }));

      // Dated claims should score higher
      const datedScore = scores.find(s => s.hasYear)?.score;
      const undatedScore = scores.find(s => !s.hasYear)?.score;

      if (datedScore !== undefined && undatedScore !== undefined) {
        expect(datedScore).toBeGreaterThan(undatedScore);
      }
    }
  });
});
