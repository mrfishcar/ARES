/**
 * Pattern Coverage Evaluation
 *
 * Evaluates relation extraction on synthetic corpus and computes metrics per family.
 */

import * as fs from 'fs';
import * as path from 'path';
import { appendDoc, loadGraph, clearStorage } from '../../app/storage/storage';

interface TestCase {
  text: string;
  gold_relations: {
    subject: string;
    relation: string;
    object: string;
  }[];
  family: string;
  case_type: 'positive' | 'negative' | 'uncertain' | 'ambiguous';
}

interface FamilyMetrics {
  family: string;
  precision: number;
  recall: number;
  f1: number;
  tp: number;  // True positives
  fp: number;  // False positives
  fn: number;  // False negatives
  total_gold: number;
  total_extracted: number;
  uncovered_phrases: string[];
  top_fn: string[];  // Top false negatives
  top_fp: string[];  // Top false positives
}

interface EvaluationResults {
  overall: {
    precision: number;
    recall: number;
    f1: number;
  };
  by_family: Record<string, FamilyMetrics>;
  uncovered_phrases: string[];
  summary: {
    total_cases: number;
    total_gold: number;
    total_extracted: number;
    total_correct: number;
  };
}

/**
 * Normalize relation predicate for comparison
 */
function normalizeRelation(rel: string | undefined): string {
  if (!rel) return '';
  const normalized = rel.toLowerCase().trim();

  // Map similar predicates
  const mappings: Record<string, string> = {
    'parent_of': 'parent',
    'child_of': 'child',
    'married_to': 'married',
    'sibling_of': 'sibling',
    'member_of': 'member',
    'works_for': 'works',
    'employed_by': 'employed',
    'located_in': 'located',
    'located_at': 'located',
    'born_in': 'born',
    'lives_in': 'lives',
    'wrote_to': 'wrote',
    'said_to': 'said',
    'spoke_to': 'spoke',
    'created_by': 'created',
    'authored': 'authored',
    'written_by': 'written',
    'painted_by': 'painted',
    'invented_by': 'invented',
  };

  return mappings[normalized] || normalized;
}

/**
 * Check if two entity names match (fuzzy matching)
 */
function entitiesMatch(name1: string, name2: string): boolean {
  const norm1 = name1.toLowerCase().trim();
  const norm2 = name2.toLowerCase().trim();

  // Exact match
  if (norm1 === norm2) return true;

  // One contains the other (e.g., "John Smith" matches "Smith")
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

  return false;
}

/**
 * Check if a gold relation was extracted
 */
function isRelationExtracted(
  goldRel: { subject: string; relation: string; object: string },
  extractedRelations: any[]
): boolean {
  const goldRelNorm = normalizeRelation(goldRel.relation);

  for (const extRel of extractedRelations) {
    const extRelNorm = normalizeRelation(extRel.predicate || extRel.pred);

    // Check if relations match
    if (goldRelNorm !== extRelNorm) continue;

    // Check if entities match (subject and object)
    const subjMatch = entitiesMatch(goldRel.subject, extRel.subject || '');
    const objMatch = entitiesMatch(goldRel.object, extRel.object || '');

    if (subjMatch && objMatch) return true;

    // Check inverse direction for symmetric relations
    const subjMatchInv = entitiesMatch(goldRel.subject, extRel.object || '');
    const objMatchInv = entitiesMatch(goldRel.object, extRel.subject || '');

    if (subjMatchInv && objMatchInv) return true;
  }

  return false;
}

/**
 * Evaluate a single test case
 */
async function evaluateTestCase(
  testCase: TestCase,
  testPath: string,
  caseId: number
): Promise<{
  tp: number;
  fp: number;
  fn: number;
  uncovered: string[];
  fn_examples: string[];
  fp_examples: string[];
}> {
  clearStorage(testPath);

  try {
    await appendDoc(`test-${caseId}`, testCase.text, testPath);
    const graph = loadGraph(testPath);

    // Build entity map for resolving relation subject/object
    const entityById = new Map((graph?.entities || []).map(e => [e.id, e.canonical]));

    // Convert relations to include resolved subject/object names
    const extractedRelations = (graph?.relations || []).map(rel => ({
      subject: entityById.get(rel.subj) || rel.subj || '',
      predicate: rel.pred || rel.predicate || '',
      object: entityById.get(rel.obj) || rel.obj || ''
    }));

    const goldRelations = testCase.gold_relations;

    let tp = 0;
    let fp = 0;
    let fn = 0;
    const uncovered: string[] = [];
    const fn_examples: string[] = [];
    const fp_examples: string[] = [];

    // Count true positives and false negatives
    for (const goldRel of goldRelations) {
      if (isRelationExtracted(goldRel, extractedRelations)) {
        tp++;
      } else {
        fn++;
        fn_examples.push(`${goldRel.subject} --[${goldRel.relation}]--> ${goldRel.object}`);
        uncovered.push(testCase.text);
      }
    }

    // Count false positives (extracted but not in gold)
    for (const extRel of extractedRelations) {
      // Skip relations with empty subject or object (filtered out by orchestrator)
      if (!extRel.subject || !extRel.object || !extRel.predicate) {
        continue;
      }

      if (!isRelationExtracted(extRel, goldRelations)) {
        fp++;
        fp_examples.push(`${extRel.subject} --[${extRel.predicate}]--> ${extRel.object}`);
      }
    }

    return { tp, fp, fn, uncovered, fn_examples, fp_examples };
  } catch (error) {
    console.error(`Error evaluating case ${caseId}:`, error);
    return { tp: 0, fp: 0, fn: 0, uncovered: [], fn_examples: [], fp_examples: [] };
  }
}

/**
 * Evaluate all test cases
 */
export async function evaluateCorpus(corpusPath: string): Promise<EvaluationResults> {
  console.log('\n=== Evaluating Pattern Coverage ===\n');

  // Load corpus
  const corpusData = fs.readFileSync(corpusPath, 'utf8');
  const testCases: TestCase[] = corpusData
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));

  console.log(`Loaded ${testCases.length} test cases`);

  // Group by family
  const byFamily = new Map<string, TestCase[]>();
  for (const tc of testCases) {
    if (!byFamily.has(tc.family)) {
      byFamily.set(tc.family, []);
    }
    byFamily.get(tc.family)!.push(tc);
  }

  const testPath = path.join(process.cwd(), 'test-pattern-coverage.json');
  const familyMetrics: Record<string, FamilyMetrics> = {};

  let totalTP = 0;
  let totalFP = 0;
  let totalFN = 0;
  let totalGold = 0;
  let totalExtracted = 0;

  // Evaluate each family
  for (const [family, cases] of byFamily.entries()) {
    console.log(`\nEvaluating ${family} (${cases.length} cases)...`);

    let familyTP = 0;
    let familyFP = 0;
    let familyFN = 0;
    let familyGoldCount = 0;
    const uncovered: string[] = [];
    const fnExamples: string[] = [];
    const fpExamples: string[] = [];

    for (let i = 0; i < cases.length; i++) {
      const tc = cases[i];
      familyGoldCount += tc.gold_relations.length;

      const result = await evaluateTestCase(tc, testPath, i);

      familyTP += result.tp;
      familyFP += result.fp;
      familyFN += result.fn;
      uncovered.push(...result.uncovered);
      fnExamples.push(...result.fn_examples);
      fpExamples.push(...result.fp_examples);
    }

    const precision = familyTP > 0 ? familyTP / (familyTP + familyFP) : 0;
    const recall = familyGoldCount > 0 ? familyTP / familyGoldCount : 0;
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    familyMetrics[family] = {
      family,
      precision,
      recall,
      f1,
      tp: familyTP,
      fp: familyFP,
      fn: familyFN,
      total_gold: familyGoldCount,
      total_extracted: familyTP + familyFP,
      uncovered_phrases: uncovered.slice(0, 10),
      top_fn: fnExamples.slice(0, 5),
      top_fp: fpExamples.slice(0, 5)
    };

    totalTP += familyTP;
    totalFP += familyFP;
    totalFN += familyFN;
    totalGold += familyGoldCount;
    totalExtracted += familyTP + familyFP;

    console.log(`  Precision: ${(precision * 100).toFixed(1)}%`);
    console.log(`  Recall: ${(recall * 100).toFixed(1)}%`);
    console.log(`  F1: ${(f1 * 100).toFixed(1)}%`);
  }

  // Compute overall metrics
  const overallPrecision = totalTP > 0 ? totalTP / (totalTP + totalFP) : 0;
  const overallRecall = totalGold > 0 ? totalTP / totalGold : 0;
  const overallF1 = overallPrecision + overallRecall > 0
    ? 2 * (overallPrecision * overallRecall) / (overallPrecision + overallRecall)
    : 0;

  console.log(`\n=== Overall Metrics ===`);
  console.log(`Precision: ${(overallPrecision * 100).toFixed(1)}%`);
  console.log(`Recall: ${(overallRecall * 100).toFixed(1)}%`);
  console.log(`F1: ${(overallF1 * 100).toFixed(1)}%`);

  // Collect all uncovered phrases
  const allUncovered = new Set<string>();
  for (const metrics of Object.values(familyMetrics)) {
    metrics.uncovered_phrases.forEach(p => allUncovered.add(p));
  }

  return {
    overall: {
      precision: overallPrecision,
      recall: overallRecall,
      f1: overallF1
    },
    by_family: familyMetrics,
    uncovered_phrases: Array.from(allUncovered).slice(0, 50),
    summary: {
      total_cases: testCases.length,
      total_gold: totalGold,
      total_extracted: totalExtracted,
      total_correct: totalTP
    }
  };
}

/**
 * Save evaluation results
 */
export async function saveResults(results: EvaluationResults): Promise<void> {
  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // Save coverage report
  fs.writeFileSync(
    path.join(reportsDir, 'relation_coverage.json'),
    JSON.stringify(results.by_family, null, 2)
  );

  // Save uncovered phrases
  fs.writeFileSync(
    path.join(reportsDir, 'uncovered_phrases.json'),
    JSON.stringify(results.uncovered_phrases, null, 2)
  );

  // Save top FN/FP
  const topFnFp = Object.fromEntries(
    Object.entries(results.by_family).map(([family, metrics]) => [
      family,
      {
        top_fn: metrics.top_fn,
        top_fp: metrics.top_fp
      }
    ])
  );

  fs.writeFileSync(
    path.join(reportsDir, 'top_fn_fp.json'),
    JSON.stringify(topFnFp, null, 2)
  );

  console.log(`\n✓ Saved reports to ${reportsDir}/`);
}

// Main execution
if (require.main === module) {
  const corpusPath = path.join(process.cwd(), 'corpora/synthetic_all_relations.jsonl');

  evaluateCorpus(corpusPath)
    .then(saveResults)
    .then(() => console.log('\n✓ Evaluation complete!\n'))
    .catch(console.error);
}
