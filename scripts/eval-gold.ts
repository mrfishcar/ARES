#!/usr/bin/env npx tsx
/**
 * Gold Standard Evaluation Script
 *
 * Evaluates entity extraction against gold standard files.
 *
 * Usage:
 *   npx tsx scripts/eval-gold.ts [options]
 *
 * Options:
 *   --pipeline    Use new grammar-first pipeline (recommended)
 *   --legacy      Use legacy extraction (default if ARES_PIPELINE not set)
 *   --verbose     Show detailed output
 */

import fs from 'fs';
import path from 'path';
import { extractFromSegments } from '../app/engine/extract/orchestrator';

type GoldEntity = {
  canonicalId: string;
  type: string;
  aliases?: string[];
  required?: boolean;
};

type GoldFile = {
  entities: GoldEntity[];
  negatives: string[];
  statsRequirements?: {
    rejectedMentions_min?: number;
    contextOnlyMentions_min?: number;
  };
  description?: string;
};

function canonicalize(s: string): string {
  return s.trim().toLowerCase();
}

// Parse CLI args
const args = process.argv.slice(2);
const usePipeline = args.includes('--pipeline') || process.env.ARES_PIPELINE === 'true';
const verbose = args.includes('--verbose');

if (usePipeline) {
  process.env.ARES_PIPELINE = 'true';
  console.log('🔧 Using NEW grammar-first pipeline\n');
} else {
  console.log('🔧 Using legacy extraction\n');
}

async function main() {
  const goldPath = path.resolve(__dirname, '../tests/gold/barty.gold.json');
  const fixturePath = path.resolve(__dirname, '../Barty Beauregard and the Fabulous Fraud PLAIN TEXT.txt');

  // Check if fixture exists
  if (!fs.existsSync(fixturePath)) {
    console.error(`ERROR: Fixture not found: ${fixturePath}`);
    console.log('Please ensure the Barty text file is in the project root.');
    process.exit(1);
  }

  const gold: GoldFile = JSON.parse(fs.readFileSync(goldPath, 'utf-8'));
  const text = fs.readFileSync(fixturePath, 'utf-8');

  console.log(`📄 Text length: ${text.length} characters`);
  console.log(`📋 Gold entities: ${gold.entities.length}`);
  console.log(`🚫 Negatives: ${gold.negatives.length}\n`);

  const result = await extractFromSegments('barty-gold', text);

  const extracted = result.entities.map(e => ({
    canonical: canonicalize(e.canonical),
    type: e.type,
    aliases: (e.aliases || []).map(canonicalize)
  }));

  const goldByCanon = new Map<string, GoldEntity>();
  gold.entities.forEach(ge => goldByCanon.set(canonicalize(ge.canonicalId), ge));

  const matched = new Set<number>();
  const falsePos: string[] = [];
  const falseNeg: string[] = [];
  const typeErrors: Array<{ expected: string; got: string; name: string }> = [];

  for (let i = 0; i < extracted.length; i++) {
    const ex = extracted[i];
    const goldHit = gold.entities.find(g => {
      const canon = canonicalize(g.canonicalId);
      if (canon === ex.canonical) return true;
      const aliases = (g.aliases || []).map(canonicalize);
      return aliases.includes(ex.canonical) || aliases.some(a => ex.aliases.includes(a));
    });
    if (!goldHit) {
      falsePos.push(ex.canonical);
      continue;
    }

    matched.add(i);
    if (goldHit.type !== ex.type) {
      typeErrors.push({ expected: goldHit.type, got: ex.type, name: goldHit.canonicalId });
    }
  }

  for (const ge of gold.entities) {
    const canon = canonicalize(ge.canonicalId);
    const aliases = (ge.aliases || []).map(canonicalize);
    const hit = extracted.find(ex => ex.canonical === canon || ex.aliases.some(a => aliases.includes(a)) || aliases.includes(ex.canonical));
    if (!hit) {
      falseNeg.push(ge.canonicalId);
    }
  }

  const tp = gold.entities.length - falseNeg.length;
  const fp = falsePos.length;
  const fn = falseNeg.length;
  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  const negativesHit = extracted.filter(ex => gold.negatives.map(canonicalize).includes(ex.canonical));

  const report = {
    totals: { tp, fp, fn, precision, recall, f1 },
    falsePos,
    falseNeg,
    typeErrors,
    negativesHit: negativesHit.map(n => n.canonical),
    stats: result.stats
  };

  const outPath = path.resolve(__dirname, '../tmp/barty-gold-report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('--- Barty Gold Evaluation ---');
  console.log(`Precision: ${precision.toFixed(3)} Recall: ${recall.toFixed(3)} F1: ${f1.toFixed(3)}`);
  console.log(`TP: ${tp} FP: ${fp} FN: ${fn}`);
  console.log(`Negatives hit: ${negativesHit.length}`);
  if (result.stats?.entities.rejected !== undefined) {
    console.log(`Entities rejected: ${result.stats.entities.rejected}`);
  }
  if (result.stats?.mentions) {
    console.log(`Mentions -> durable: ${result.stats.mentions.durable}, contextOnly: ${result.stats.mentions.contextOnly}, rejected: ${result.stats.mentions.rejected}`);
  }

  const minPrecision = parseFloat(process.env.GOLD_MIN_PRECISION || '0.15');
  const maxFalsePos = parseInt(process.env.GOLD_MAX_FP || '20', 10);

  if (negativesHit.length > 0) {
    throw new Error(`Gold check failed: negatives present -> ${negativesHit.map(n => n.canonical).join(', ')}`);
  }
  if (precision < minPrecision) {
    throw new Error(`Gold check failed: precision ${precision.toFixed(3)} < ${minPrecision}`);
  }
  if (fp > maxFalsePos) {
    throw new Error(`Gold check failed: FP ${fp} > ${maxFalsePos}`);
  }
  if ((result.stats?.entities.rejected || 0) === 0 && (falsePos.length > 0)) {
    throw new Error('Gold check failed: rejected count is zero but junk exists');
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
