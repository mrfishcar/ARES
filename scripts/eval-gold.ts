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
const verbose = args.includes('--verbose');

// Determine extraction mode
let expectedMode: string;
if (args.includes('--booknlp')) {
  process.env.ARES_MODE = 'booknlp';
  expectedMode = 'booknlp';
  console.log('🔧 Using BOOKNLP mode (BookNLP baseline)\n');
} else if (args.includes('--hybrid')) {
  process.env.ARES_MODE = 'hybrid';
  expectedMode = 'hybrid';
  console.log('🔧 Using HYBRID mode (BookNLP + ARES refinement)\n');
} else if (args.includes('--pipeline') || process.env.ARES_PIPELINE === 'true') {
  process.env.ARES_PIPELINE = 'true';
  expectedMode = 'pipeline';
  console.log('🔧 Using NEW grammar-first pipeline\n');
} else {
  expectedMode = 'legacy';
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

  // ✅ RUNTIME ASSERTION: Verify correct mode was used
  console.log(`\n📊 Extraction Mode: ${result.mode}`);
  if (expectedMode !== 'legacy' && result.mode !== expectedMode) {
    throw new Error(`CRITICAL BUG: Expected mode='${expectedMode}' but extraction used mode='${result.mode}'. The wiring is broken.`);
  }

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

  // 🚫 GOLD-NEGATIVE ENFORCEMENT
  const negativesHit = extracted.filter(ex =>
    gold.negatives.map(canonicalize).includes(ex.canonical)
  );

  const report: Record<string, unknown> = {
    mode: result.mode,
    totals: { tp, fp, fn, precision, recall, f1 },
    falsePos,
    falseNeg,
    typeErrors,
    negativesHit: negativesHit.map(n => n.canonical),
    stats: result.stats,
  };

  // Include pipeline stats if available
  if (result.pipelineStats) {
    report.pipelineStats = result.pipelineStats;
  }

  const outPath = path.resolve(__dirname, '../tmp/barty-gold-report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('\n--- Barty Gold Evaluation ---');
  console.log(`Mode: ${result.mode}`);
  console.log(`Precision: ${precision.toFixed(3)} Recall: ${recall.toFixed(3)} F1: ${f1.toFixed(3)}`);
  console.log(`TP: ${tp} FP: ${fp} FN: ${fn}`);
  console.log(`Negatives hit: ${negativesHit.length}`);

  if (result.stats?.entities) {
    console.log(`Entities: kept=${result.stats.entities.kept} rejected=${result.stats.entities.rejected}`);
  }
  if (result.stats?.mentions) {
    console.log(`Mentions: durable=${result.stats.mentions.durable} contextOnly=${result.stats.mentions.contextOnly} rejected=${result.stats.mentions.rejected}`);
  }

  // Show pipeline-specific stats if available
  if (result.pipelineStats) {
    const ps = result.pipelineStats;
    console.log('\n--- Pipeline Stats ---');
    console.log(`Nominations: ${ps.totalNominations} (NER: ${ps.nominationsBySource.NER}, DEP: ${ps.nominationsBySource.DEP})`);
    console.log(`Gate Results: NON_ENTITY=${ps.gateResults.nonEntity}, CONTEXT_ONLY=${ps.gateResults.contextOnly}, DURABLE=${ps.gateResults.durableCandidate}`);
    console.log(`Clusters: ${ps.clustersFormed} (promoted: ${ps.clustersPromoted}, deferred: ${ps.clustersDeferred})`);

    // Show top rejection reasons
    const reasons = Object.entries(ps.rejectReasons as Record<string, number>)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    if (reasons.length > 0) {
      console.log('\nTop Rejection Reasons:');
      for (const [reason, count] of reasons) {
        console.log(`  ${reason}: ${count}`);
      }
    }
  }

  // Show BookNLP-specific stats if available
  if ((result as any).booknlpStats) {
    const bs = (result as any).booknlpStats;
    console.log('\n--- BookNLP Stats ---');
    console.log(`Characters: ${bs.characters}`);
    console.log(`Mentions: ${bs.mentions}`);
    console.log(`Quotes: ${bs.quotes}`);
    console.log(`Coref Links: ${bs.corefLinks}`);
    console.log(`Processing Time: ${bs.processingTimeSeconds?.toFixed(2)}s`);
  }

  // Show verbose output if requested
  if (verbose) {
    console.log('\n--- False Positives ---');
    for (const fp of falsePos.slice(0, 20)) {
      console.log(`  ❌ ${fp}`);
    }
    if (falsePos.length > 20) {
      console.log(`  ... and ${falsePos.length - 20} more`);
    }

    console.log('\n--- False Negatives ---');
    for (const fn of falseNeg) {
      console.log(`  ⚠️ ${fn}`);
    }

    if (negativesHit.length > 0) {
      console.log('\n--- Negatives Hit (CRITICAL) ---');
      for (const n of negativesHit) {
        console.log(`  🚫 ${n.canonical}`);
      }
    }
  }

  const minPrecision = parseFloat(process.env.GOLD_MIN_PRECISION || '0.15');
  const maxFalsePos = parseInt(process.env.GOLD_MAX_FP || '20', 10);

  // ✅ GOLD-NEGATIVE ENFORCEMENT: Any negative in output = FAIL
  if (negativesHit.length > 0) {
    throw new Error(`Gold check failed: negatives present -> ${negativesHit.map(n => n.canonical).join(', ')}`);
  }
  if (precision < minPrecision) {
    throw new Error(`Gold check failed: precision ${precision.toFixed(3)} < ${minPrecision}`);
  }
  if (fp > maxFalsePos) {
    throw new Error(`Gold check failed: FP ${fp} > ${maxFalsePos}`);
  }

  // ✅ HONEST STATS CHECK: rejected must be > 0 if junk exists
  const rejectedCount = result.stats?.entities?.rejected ??
                        result.stats?.mentions?.rejected ??
                        result.pipelineStats?.gateResults?.nonEntity ?? 0;
  if (rejectedCount === 0 && falsePos.length > 0) {
    throw new Error(`Gold check failed: rejected count is zero but ${falsePos.length} junk entities exist. Stats are lying.`);
  }

  console.log('\n✅ Gold evaluation passed!');
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ ' + (err instanceof Error ? err.message : err));
  process.exit(1);
});
