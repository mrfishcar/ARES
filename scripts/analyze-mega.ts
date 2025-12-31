/**
 * Analyze mega test results using saved storage
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadGraph, clearStorage, appendDoc } from '../app/storage/storage';
import { INVERSE } from '../app/engine/schema';

const STORAGE_PATH = path.join(process.cwd(), 'tmp', 'analyze-mega-storage.json');

function normalizeRelation(subj: string, pred: string, obj: string): string {
  if (pred === 'parent_of') {
    return `${obj.toLowerCase()}::child_of::${subj.toLowerCase()}`;
  }
  const inversePred = INVERSE[pred as keyof typeof INVERSE];
  if (inversePred === pred) {
    if (subj.toLowerCase() > obj.toLowerCase()) {
      return `${obj.toLowerCase()}::${pred}::${subj.toLowerCase()}`;
    }
  }
  return `${subj.toLowerCase()}::${pred}::${obj.toLowerCase()}`;
}

async function main() {
  const testCase = JSON.parse(fs.readFileSync('./tests/mega/cases/mega-001.json', 'utf-8'));

  // Ensure tmp directory exists
  const tmpDir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  // Run extraction
  clearStorage(STORAGE_PATH);
  await appendDoc(testCase.id, testCase.text, STORAGE_PATH);
  const graph = loadGraph(STORAGE_PATH);

  if (!graph) {
    console.error('Failed to load graph');
    process.exit(1);
  }

  // Build sets
  const goldRelations = new Set<string>();
  for (const r of testCase.gold.relations) {
    goldRelations.add(normalizeRelation(r.subj, r.pred, r.obj));
  }

  const extractedRelations = new Set<string>();
  const extractedRaw: string[] = [];

  for (const rel of graph.relations) {
    const subj = graph.entities.find(e => e.id === rel.subj)?.canonical ?? '???';
    const obj = graph.entities.find(e => e.id === rel.obj)?.canonical ?? '???';
    const normalized = normalizeRelation(subj, rel.pred, obj);
    extractedRelations.add(normalized);
    extractedRaw.push(`${subj}::${rel.pred}::${obj}`);
  }

  // Analyze
  const TP: string[] = [];
  const FP: string[] = [];
  for (const rel of extractedRelations) {
    if (goldRelations.has(rel)) {
      TP.push(rel);
    } else {
      FP.push(rel);
    }
  }
  const FN: string[] = [];
  for (const rel of goldRelations) {
    if (!extractedRelations.has(rel)) {
      FN.push(rel);
    }
  }

  console.log('\\n=== RAW EXTRACTED (' + extractedRaw.length + ') ===');
  for (const r of extractedRaw.sort()) console.log(r);

  console.log('\\n=== TRUE POSITIVES (' + TP.length + ') ===');
  for (const r of TP.sort()) console.log('✓ ' + r);

  console.log('\\n=== FALSE POSITIVES (' + FP.length + ') ===');
  for (const r of FP.sort()) console.log('✗ ' + r);

  console.log('\\n=== MISSING (FN: ' + FN.length + ') ===');
  for (const r of FN.sort()) console.log('✗ ' + r);

  const precision = TP.length / (TP.length + FP.length);
  const recall = TP.length / goldRelations.size;
  console.log('\\n=== METRICS ===');
  console.log('Precision: ' + (precision * 100).toFixed(1) + '% (' + TP.length + '/' + (TP.length + FP.length) + ')');
  console.log('Recall: ' + (recall * 100).toFixed(1) + '% (' + TP.length + '/' + goldRelations.size + ')');

  clearStorage(STORAGE_PATH);
}

main().catch(console.error);
