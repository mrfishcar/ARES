/**
 * Barty Tiered Extraction Analysis
 *
 * Runs full Barty extraction and reports results broken down by tier:
 * - Total entities by tier (A/B/C)
 * - Top entities per tier by mention count
 * - Alias cluster sizes per tier
 * - Title-based entities detected
 */

import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

import { extractFromSegments } from '../app/engine/extract/orchestrator';
import { segmentDocument } from '../app/engine/segmenter';
import type { Entity, EntityTier, EntityType } from '../app/engine/schema';
import {
  assignTiersToEntities,
  getTierStats,
  extractTierFeatures,
  TIER_CONFIDENCE_THRESHOLDS
} from '../app/engine/entity-tier-assignment';
import { extractTitleBasedEntities } from '../app/engine/linguistics/title-based-entities';

/* ---------------------------
   Analysis Types
---------------------------- */

interface TieredEntitySummary {
  id: string;
  canonicalName: string;
  type: EntityType;
  tier: EntityTier;
  tierReason: string;
  confidence: number;
  mentionCount: number;
  aliasCount: number;
  aliases: string[];
}

interface TierReport {
  tier: EntityTier;
  count: number;
  entities: TieredEntitySummary[];
  largestClusters: { name: string; aliasCount: number; aliases: string[] }[];
}

interface TitleEntityReport {
  count: number;
  examples: { text: string; type: EntityType; confidence: number }[];
}

/* ---------------------------
   Helpers
---------------------------- */

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function sortByMentionCount(a: TieredEntitySummary, b: TieredEntitySummary): number {
  if (b.mentionCount !== a.mentionCount) return b.mentionCount - a.mentionCount;
  if (b.aliasCount !== a.aliasCount) return b.aliasCount - a.aliasCount;
  return a.canonicalName.localeCompare(b.canonicalName);
}

function buildTierReport(entities: TieredEntitySummary[], tier: EntityTier, topN: number = 30): TierReport {
  const tierEntities = entities.filter(e => e.tier === tier);
  const sorted = [...tierEntities].sort(sortByMentionCount);

  // Find largest alias clusters
  const largestClusters = [...tierEntities]
    .sort((a, b) => b.aliasCount - a.aliasCount)
    .slice(0, 10)
    .map(e => ({
      name: e.canonicalName,
      aliasCount: e.aliasCount,
      aliases: e.aliases
    }));

  return {
    tier,
    count: tierEntities.length,
    entities: sorted.slice(0, topN),
    largestClusters
  };
}

/* ---------------------------
   Main Runner
---------------------------- */

async function run() {
  const start = performance.now();

  // Load Barty text
  const manuscriptPath = path.join(process.cwd(), 'barty.txt');
  if (!fs.existsSync(manuscriptPath)) {
    console.error('[ERROR] barty.txt not found in project root');
    process.exit(1);
  }

  const text = fs.readFileSync(manuscriptPath, 'utf-8');
  const totalWords = countWords(text);

  console.log('═'.repeat(70));
  console.log('BARTY TIERED EXTRACTION ANALYSIS');
  console.log('═'.repeat(70));
  console.log(`\nManuscript: ${totalWords.toLocaleString()} words`);
  console.log(`Tier Thresholds: A≥${TIER_CONFIDENCE_THRESHOLDS.TIER_A}, B≥${TIER_CONFIDENCE_THRESHOLDS.TIER_B}, C≥${TIER_CONFIDENCE_THRESHOLDS.TIER_C}`);

  // Segment document
  const segments = segmentDocument('barty-tiered', text);
  console.log(`Segments: ${segments.length} chunks\n`);

  // Extract title-based entities first (before main extraction)
  console.log('─'.repeat(70));
  console.log('TITLE-BASED ENTITY DETECTION');
  console.log('─'.repeat(70));

  const titleEntities = extractTitleBasedEntities(text);
  const titleReport: TitleEntityReport = {
    count: titleEntities.length,
    examples: titleEntities.slice(0, 20).map(e => ({
      text: e.canonical,
      type: e.type,
      confidence: e.confidence ?? 0.4
    }))
  };

  console.log(`Found ${titleReport.count} title-based entities`);
  if (titleReport.examples.length > 0) {
    console.log('\nExamples:');
    titleReport.examples.forEach(e => {
      console.log(`  - "${e.text}" (${e.type}, conf: ${e.confidence.toFixed(2)})`);
    });
  }

  // Main extraction
  console.log('\n' + '─'.repeat(70));
  console.log('MAIN EXTRACTION');
  console.log('─'.repeat(70));

  const results = await extractFromSegments('barty-tiered', text);
  const { entities, relations } = results;

  console.log(`\nRaw extraction: ${entities.length} entities, ${relations.length} relations`);

  // Assign tiers to entities
  const tieredEntities = assignTiersToEntities(entities, text);

  // Build summaries
  const summaries: TieredEntitySummary[] = tieredEntities.map(e => ({
    id: e.id,
    canonicalName: e.canonical,
    type: e.type,
    tier: e.tier ?? 'TIER_A',
    tierReason: (e.attrs?.tierReason as string) ?? 'default',
    confidence: e.confidence ?? 0.5,
    mentionCount: (e.attrs?.mentionCount as number) ?? 1,
    aliasCount: e.aliases?.length ?? 1,
    aliases: e.aliases ?? [e.canonical]
  }));

  // Generate tier reports
  const tierStats = getTierStats(tieredEntities);
  const tierAReport = buildTierReport(summaries, 'TIER_A');
  const tierBReport = buildTierReport(summaries, 'TIER_B');
  const tierCReport = buildTierReport(summaries, 'TIER_C');

  // Print results
  console.log('\n' + '═'.repeat(70));
  console.log('TIER DISTRIBUTION');
  console.log('═'.repeat(70));
  console.log(`\nTotal Entities: ${tierStats.total}`);
  console.log(`  TIER_A (Core):       ${tierStats.tierA} (${((tierStats.tierA/tierStats.total)*100).toFixed(1)}%)`);
  console.log(`  TIER_B (Supporting): ${tierStats.tierB} (${((tierStats.tierB/tierStats.total)*100).toFixed(1)}%)`);
  console.log(`  TIER_C (Candidate):  ${tierStats.tierC} (${((tierStats.tierC/tierStats.total)*100).toFixed(1)}%)`);
  if (tierStats.unassigned > 0) {
    console.log(`  Unassigned:          ${tierStats.unassigned}`);
  }

  // Print each tier report
  for (const report of [tierAReport, tierBReport, tierCReport]) {
    console.log('\n' + '─'.repeat(70));
    console.log(`${report.tier} ENTITIES (${report.count} total)`);
    console.log('─'.repeat(70));

    if (report.entities.length === 0) {
      console.log('  (none)');
      continue;
    }

    console.log('\nTop 30 by mention count:');
    report.entities.slice(0, 30).forEach((e, i) => {
      console.log(`  ${(i+1).toString().padStart(2)}. ${e.canonicalName.padEnd(30)} ${e.type.padEnd(8)} conf:${e.confidence.toFixed(2)} aliases:${e.aliasCount} reason:${e.tierReason}`);
    });

    console.log('\nLargest alias clusters:');
    report.largestClusters.slice(0, 5).forEach((c, i) => {
      const aliasPreview = c.aliases.slice(0, 5).join(', ');
      const more = c.aliases.length > 5 ? ` (+${c.aliases.length - 5} more)` : '';
      console.log(`  ${(i+1).toString().padStart(2)}. ${c.name.padEnd(30)} ${c.aliasCount} aliases: [${aliasPreview}${more}]`);
    });
  }

  // Type distribution per tier
  console.log('\n' + '═'.repeat(70));
  console.log('TYPE DISTRIBUTION BY TIER');
  console.log('═'.repeat(70));

  for (const tier of ['TIER_A', 'TIER_B', 'TIER_C'] as EntityTier[]) {
    const tierEnts = summaries.filter(e => e.tier === tier);
    const typeCounts: Record<string, number> = {};
    tierEnts.forEach(e => {
      typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
    });

    console.log(`\n${tier}:`);
    Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`  ${type.padEnd(12)} ${count}`);
      });
  }

  // Tier reason distribution
  console.log('\n' + '═'.repeat(70));
  console.log('TIER ASSIGNMENT REASONS');
  console.log('═'.repeat(70));

  const reasonCounts: Record<string, number> = {};
  summaries.forEach(e => {
    reasonCounts[e.tierReason] = (reasonCounts[e.tierReason] || 0) + 1;
  });

  Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([reason, count]) => {
      console.log(`  ${reason.padEnd(30)} ${count}`);
    });

  // Write JSON output
  const output = {
    meta: {
      totalWords,
      segmentCount: segments.length,
      extractionTime: ((performance.now() - start) / 1000).toFixed(2),
      tierThresholds: TIER_CONFIDENCE_THRESHOLDS
    },
    tierStats,
    titleEntities: titleReport,
    tiers: {
      TIER_A: tierAReport,
      TIER_B: tierBReport,
      TIER_C: tierCReport
    },
    relations: relations.map(r => ({
      id: r.id,
      pred: r.pred,
      subj: r.subj,
      obj: r.obj,
      confidence: r.confidence
    }))
  };

  const outPath = path.join(process.cwd(), 'out', 'barty-tiered-analysis.json');
  if (!fs.existsSync(path.dirname(outPath))) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
  }
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

  const elapsed = performance.now() - start;
  console.log('\n' + '═'.repeat(70));
  console.log(`Completed in ${(elapsed / 1000).toFixed(2)}s`);
  console.log(`Output: ${outPath}`);
  console.log('═'.repeat(70));

  process.exit(0);
}

run().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
