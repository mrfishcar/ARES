/**
 * Mega Regression Suite
 *
 * Runs large (≈1000 word) narrative samples to track precision/recall
 * across complex, long-form documents. Results are persisted under
 * tmp/mega-regression-summary.json for inspection.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { appendDoc, loadGraph, clearStorage } from '../../app/storage/storage';
import { INVERSE } from '../../app/engine/schema';

interface GoldEntity {
  text: string;
  type: string;
}

interface GoldRelation {
  subj: string;
  pred: string;
  obj: string;
}

/**
 * Normalize a relation to canonical form (always child_of, not parent_of)
 * This allows matching parent_of(A, B) with child_of(B, A)
 */
function normalizeRelation(subj: string, pred: string, obj: string): string {
  // If predicate has an inverse, convert to canonical direction
  // For parent_of/child_of: always use child_of (child → parent direction)
  if (pred === 'parent_of') {
    return `${obj.toLowerCase()}::child_of::${subj.toLowerCase()}`;
  }
  // For symmetric relations (married_to, sibling_of, etc.), normalize alphabetically
  const inversePred = INVERSE[pred as keyof typeof INVERSE];
  if (inversePred === pred) {
    // Symmetric: normalize to alphabetical order
    if (subj.toLowerCase() > obj.toLowerCase()) {
      return `${obj.toLowerCase()}::${pred}::${subj.toLowerCase()}`;
    }
  }
  return `${subj.toLowerCase()}::${pred}::${obj.toLowerCase()}`;
}

interface MegaCase {
  id: string;
  title: string;
  text: string;
  gold: {
    entities: GoldEntity[];
    relations: GoldRelation[];
  };
}

interface MegaIndex {
  suite: string;
  description?: string;
  targets?: {
    entityPrecision?: number;
    entityRecall?: number;
    relationPrecision?: number;
    relationRecall?: number;
  };
  cases: Array<{
    id: string;
    file: string;
    domain?: string;
    approx_word_count?: number;
    notes?: string;
  }>;
}

function computePrecision(extracted: Set<string>, gold: Set<string>): number {
  if (extracted.size === 0) return gold.size === 0 ? 1 : 0;
  const correct = Array.from(extracted).filter(e => gold.has(e)).length;
  return correct / extracted.size;
}

function computeRecall(extracted: Set<string>, gold: Set<string>): number {
  if (gold.size === 0) return 1;
  const correct = Array.from(extracted).filter(e => gold.has(e)).length;
  return correct / gold.size;
}

function computeF1(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

const SUITE_DIR = __dirname;
const INDEX_PATH = path.join(SUITE_DIR, 'index.json');
const TMP_DIR = path.join(process.cwd(), 'tmp');
const STORAGE_PATH = path.join(TMP_DIR, 'mega-regression-storage.json');
const SUMMARY_PATH = path.join(TMP_DIR, 'mega-regression-summary.json');

describe('Mega Regression Suite', () => {
  it('should evaluate high-word-count narratives for precision/recall', async () => {
    const indexRaw = fs.readFileSync(INDEX_PATH, 'utf-8');
    const index: MegaIndex = JSON.parse(indexRaw);

    const targets = {
      entityPrecision: index.targets?.entityPrecision ?? 0.8,
      entityRecall: index.targets?.entityRecall ?? 0.75,
      relationPrecision: index.targets?.relationPrecision ?? 0.8,
      relationRecall: index.targets?.relationRecall ?? 0.75
    };

    expect(index.cases.length).toBeGreaterThan(0);

    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
    }

    const results: Array<{
      id: string;
      title: string;
      words: number;
      entityPrecision: number;
      entityRecall: number;
      relationPrecision: number;
      relationRecall: number;
    }> = [];

    for (const entry of index.cases) {
      const casePath = path.join(SUITE_DIR, entry.file);
      const caseRaw = fs.readFileSync(casePath, 'utf-8');
      const megaCase: MegaCase = JSON.parse(caseRaw);

      const words = megaCase.text.trim().split(/\s+/).filter(Boolean).length;

      clearStorage(STORAGE_PATH);
      await appendDoc(megaCase.id, megaCase.text, STORAGE_PATH);
      const graph = loadGraph(STORAGE_PATH);
      expect(graph).not.toBeNull();

      const goldEntities = new Set(
        megaCase.gold.entities.map(e => `${e.type.toUpperCase()}::${e.text.toLowerCase()}`)
      );
      const goldRelations = new Set(
        megaCase.gold.relations.map(r => normalizeRelation(r.subj, r.pred, r.obj))
      );

      const extractedEntities = new Set(
        graph!.entities.map(e => `${e.type.toUpperCase()}::${e.canonical.toLowerCase()}`)
      );
      const extractedRelations = new Set(
        graph!.relations.map(rel => {
          const subj = graph!.entities.find(e => e.id === rel.subj)?.canonical ?? '';
          const obj = graph!.entities.find(e => e.id === rel.obj)?.canonical ?? '';
          return normalizeRelation(subj, rel.pred, obj);
        })
      );

      const entityPrecision = computePrecision(extractedEntities, goldEntities);
      const entityRecall = computeRecall(extractedEntities, goldEntities);
      const relationPrecision = computePrecision(extractedRelations, goldRelations);
      const relationRecall = computeRecall(extractedRelations, goldRelations);

      results.push({
        id: megaCase.id,
        title: megaCase.title,
        words,
        entityPrecision,
        entityRecall,
        relationPrecision,
        relationRecall
      });
    }

    const avgEntityPrecision = results.reduce((sum, r) => sum + r.entityPrecision, 0) / results.length;
    const avgEntityRecall = results.reduce((sum, r) => sum + r.entityRecall, 0) / results.length;
    const avgRelationPrecision = results.reduce((sum, r) => sum + r.relationPrecision, 0) / results.length;
    const avgRelationRecall = results.reduce((sum, r) => sum + r.relationRecall, 0) / results.length;

    const entityF1 = computeF1(avgEntityPrecision, avgEntityRecall);
    const relationF1 = computeF1(avgRelationPrecision, avgRelationRecall);

    const summary = {
      generatedAt: new Date().toISOString(),
      suite: index.suite,
      description: index.description,
      targets,
      averages: {
        entityPrecision: avgEntityPrecision,
        entityRecall: avgEntityRecall,
        entityF1,
        relationPrecision: avgRelationPrecision,
        relationRecall: avgRelationRecall,
        relationF1
      },
      cases: results
    };

    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2), 'utf-8');

    console.log('\n📈 MEGA REGRESSION RESULTS');
    for (const result of results) {
      console.log(
        `• ${result.id} (${result.words} words) → Entities P/R ${(result.entityPrecision * 100).toFixed(1)}% / ${(result.entityRecall * 100).toFixed(1)}%, ` +
        `Relations P/R ${(result.relationPrecision * 100).toFixed(1)}% / ${(result.relationRecall * 100).toFixed(1)}%`
      );
    }
    console.log('\nAverages:');
    console.log(`  Entity P/R/F1: ${(avgEntityPrecision * 100).toFixed(1)}% / ${(avgEntityRecall * 100).toFixed(1)}% / ${(entityF1 * 100).toFixed(1)}%`);
    console.log(`  Relation P/R/F1: ${(avgRelationPrecision * 100).toFixed(1)}% / ${(avgRelationRecall * 100).toFixed(1)}% / ${(relationF1 * 100).toFixed(1)}%`);

    const enforce = process.env.MEGA_ENFORCE === '1';

    if (enforce) {
      expect(avgEntityPrecision).toBeGreaterThanOrEqual(targets.entityPrecision);
      expect(avgEntityRecall).toBeGreaterThanOrEqual(targets.entityRecall);
      expect(avgRelationPrecision).toBeGreaterThanOrEqual(targets.relationPrecision);
      expect(avgRelationRecall).toBeGreaterThanOrEqual(targets.relationRecall);
    } else {
      const misses: string[] = [];
      if (avgEntityPrecision < targets.entityPrecision) {
        misses.push(`entityPrecision ${(avgEntityPrecision * 100).toFixed(1)}% < ${(targets.entityPrecision * 100).toFixed(1)}%`);
      }
      if (avgEntityRecall < targets.entityRecall) {
        misses.push(`entityRecall ${(avgEntityRecall * 100).toFixed(1)}% < ${(targets.entityRecall * 100).toFixed(1)}%`);
      }
      if (avgRelationPrecision < targets.relationPrecision) {
        misses.push(`relationPrecision ${(avgRelationPrecision * 100).toFixed(1)}% < ${(targets.relationPrecision * 100).toFixed(1)}%`);
      }
      if (avgRelationRecall < targets.relationRecall) {
        misses.push(`relationRecall ${(avgRelationRecall * 100).toFixed(1)}% < ${(targets.relationRecall * 100).toFixed(1)}%`);
      }
      if (misses.length) {
        console.log(`
⚠️  Mega regression targets not met yet. Set MEGA_ENFORCE=1 to gate failures.`);
        for (const miss of misses) {
          console.log(`   • ${miss}`);
        }
      }
    }


    clearStorage(STORAGE_PATH);
  }, 120_000);
});
