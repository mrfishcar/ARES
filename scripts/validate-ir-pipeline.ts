#!/usr/bin/env npx ts-node
/**
 * IR Pipeline Validation Script
 *
 * Runs the full compile → inspect → render loop on a real chapter:
 * 1. Legacy extraction (current ARES pipeline)
 * 2. Adapter → ProjectIR
 * 3. Assertion Builder (epistemics)
 * 4. Event Builder (timeline objects)
 * 5. Fact Builder (materialized views)
 * 6. Renderers (timeline + entity pages)
 *
 * Outputs to /tmp/ir-validation/:
 * - project-ir.json
 * - timeline.md
 * - entity_<id>.md (top N entities)
 * - metrics.json
 *
 * Usage:
 *   npx ts-node scripts/validate-ir-pipeline.ts [chapter-path]
 */

import * as fs from 'fs';
import * as path from 'path';
import { extractFromSegments } from '../app/engine/extract/orchestrator';
import { parseWithService } from '../app/engine/extract/entities';
import { adaptLegacyExtraction, type LegacyExtractionResult } from '../app/engine/ir/adapter';
import { buildAssertions } from '../app/engine/ir/assertion-builder';
import {
  buildEvents,
  type DocOrderInfo,
  type EligibilityStats,
  type BuildEventsResult,
  MOVE_PREDICATES,
  LEARN_PREDICATES,
  TELL_PREDICATES,
  PROMISE_PREDICATES,
  ATTACK_PREDICATES,
  MEET_PREDICATES,
  DEATH_PREDICATES,
  TRANSFER_PREDICATES,
  normalizePredicate,
} from '../app/engine/ir/event-builder';
import { buildFactsFromEvents } from '../app/engine/ir/fact-builder';
import { renderEntityPage } from '../app/engine/ir/entity-renderer';
import { renderTimeline } from '../app/engine/ir/timeline-renderer';
import {
  extractAssertionsFromSentences,
  type ParsedSentence,
  type EntitySpan,
} from '../app/engine/ir/predicate-extractor';
import {
  extractTellFromQuotes,
  buildQuoteIndex,
  filterOverlappingVerbTells,
  type QuoteSignal,
} from '../app/engine/ir/quote-tell-extractor';
import type { ProjectIR, StoryEvent, Assertion, Modality, Entity, EntityId } from '../app/engine/ir/types';

// =============================================================================
// CONFIG
// =============================================================================

const OUTPUT_DIR = '/tmp/ir-validation';
const DEFAULT_CHAPTER = 'corpus/contemporary-chapter-01.txt';
const TOP_N_ENTITIES = 5;

// Build mappedPredicates from imported sets (using canonical/normalized forms)
const ALL_EVENT_PREDICATES = new Set<string>([
  ...Array.from(MOVE_PREDICATES),
  ...Array.from(LEARN_PREDICATES),
  ...Array.from(TELL_PREDICATES),
  ...Array.from(PROMISE_PREDICATES),
  ...Array.from(ATTACK_PREDICATES),
  ...Array.from(MEET_PREDICATES),
  ...Array.from(DEATH_PREDICATES),
  ...Array.from(TRANSFER_PREDICATES),
]);

/**
 * Check if a predicate (after normalization) maps to any event type.
 */
function predicateMapsToEvent(predicate: string): boolean {
  const normalized = normalizePredicate(predicate);
  return ALL_EVENT_PREDICATES.has(normalized);
}

// =============================================================================
// PARSER HEALTH CHECK
// =============================================================================

const PARSER_URL = 'http://127.0.0.1:8000';

/**
 * Check if the spaCy parser service is running and healthy.
 * Returns true if reachable, false otherwise.
 */
async function checkParserHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${PARSER_URL}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.status === 'ok';
  } catch (error) {
    // Connection refused, timeout, or other network error
    return false;
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const chapterPath = process.argv[2] || DEFAULT_CHAPTER;
  const absolutePath = path.resolve(chapterPath);

  console.log('='.repeat(60));
  console.log('IR PIPELINE VALIDATION');
  console.log('='.repeat(60));
  console.log(`Chapter: ${chapterPath}`);
  console.log(`Output:  ${OUTPUT_DIR}`);
  console.log('');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Read chapter
  if (!fs.existsSync(absolutePath)) {
    console.error(`ERROR: Chapter file not found: ${absolutePath}`);
    process.exit(1);
  }
  const chapterText = fs.readFileSync(absolutePath, 'utf-8');
  const wordCount = chapterText.split(/\s+/).length;
  console.log(`Chapter loaded: ${wordCount} words`);

  // ==========================================================================
  // PARSER HEALTH CHECK (required for extraction)
  // ==========================================================================
  console.log('\n[0/6] Checking parser service...');
  const parserOk = await checkParserHealth();
  if (!parserOk) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ PARSER SERVICE NOT REACHABLE');
    console.error('='.repeat(60));
    console.error('');
    console.error('The spaCy parser service is not running at http://127.0.0.1:8000');
    console.error('');
    console.error('To start the parser, run:');
    console.error('');
    console.error('    make parser');
    console.error('');
    console.error('or:');
    console.error('');
    console.error('    python scripts/parser_service.py');
    console.error('');
    console.error('Wait for "Application startup complete" before running validation.');
    console.error('='.repeat(60));
    process.exit(1);
  }
  console.log('  ✅ Parser service is running');

  // ==========================================================================
  // STEP 1: Legacy Extraction
  // ==========================================================================
  console.log('\n[1/6] Running legacy extraction...');
  const extractionStart = Date.now();

  const docId = path.basename(chapterPath, path.extname(chapterPath));
  const extractionResult = await extractFromSegments(docId, chapterText);

  const extractionTime = Date.now() - extractionStart;
  console.log(`  Entities: ${extractionResult.entities.length}`);
  console.log(`  Relations: ${extractionResult.relations.length}`);
  console.log(`  Mode: ${extractionResult.mode}`);
  console.log(`  Time: ${(extractionTime / 1000).toFixed(2)}s`);

  // ==========================================================================
  // STEP 2: Adapter → ProjectIR
  // ==========================================================================
  console.log('\n[2/6] Adapting to ProjectIR...');

  const legacyResult: LegacyExtractionResult = {
    entities: extractionResult.entities,
    relations: extractionResult.relations,
    docId,
  };

  let ir = adaptLegacyExtraction(legacyResult);
  console.log(`  IR Entities: ${ir.entities.length}`);
  console.log(`  IR Assertions (from legacy): ${ir.assertions.length}`);

  // ==========================================================================
  // STEP 2.5: Predicate Extraction (NEW!)
  // ==========================================================================
  console.log('\n[2.5/6] Extracting predicates from dependency trees...');

  // Parse the text with spaCy
  const parseResponse = await parseWithService(chapterText);
  const sentences: ParsedSentence[] = parseResponse.sentences;
  console.log(`  Parsed ${sentences.length} sentences`);

  // Build entity spans from extraction result
  const entitySpans: EntitySpan[] = extractionResult.spans.map((span) => {
    const entity = extractionResult.entities.find(e => e.id === span.entity_id);
    return {
      entityId: span.entity_id,
      name: entity?.canonical || entity?.id || span.entity_id,
      start: span.start,
      end: span.end,
      type: entity?.type,
    };
  });
  console.log(`  Using ${entitySpans.length} entity spans for resolution`);

  // Extract predicate-based assertions
  const predicateAssertions = extractAssertionsFromSentences(
    sentences,
    entitySpans,
    { docId, minConfidence: 0.4 }
  );
  console.log(`  Extracted ${predicateAssertions.length} predicate assertions`);

  // ==========================================================================
  // STEP 2.6: Quote-Aware TELL Extraction
  // ==========================================================================
  console.log('\n[2.6/6] Extracting TELL events from quotes...');

  // Check if we have quotes from BookNLP
  let quoteAssertions: Assertion[] = [];
  let quoteTellStats = { totalQuotes: 0, withSpeaker: 0, withoutSpeaker: 0, tellEventsCreated: 0 };

  if (extractionResult.quotes && extractionResult.quotes.length > 0) {
    // Convert to QuoteSignal format
    const quoteSignals: QuoteSignal[] = extractionResult.quotes.map(q => ({
      id: q.id,
      text: q.text,
      start: q.start,
      end: q.end,
      speakerId: q.speaker_id,
      speakerName: q.speaker_name,
      confidence: q.confidence,
    }));

    // Build quote index for deduplication
    const quoteIndex = buildQuoteIndex(quoteSignals);

    // Extract TELL assertions from quotes (quote beats verb)
    const quoteTellResult = extractTellFromQuotes(quoteSignals, docId, {
      minSpeakerConfidence: 0.5,
      includeUnattributed: false,
    });
    quoteAssertions = quoteTellResult.assertions;
    quoteTellStats = quoteTellResult.stats;

    console.log(`  Quotes found: ${quoteTellStats.totalQuotes}`);
    console.log(`    With speaker: ${quoteTellStats.withSpeaker}`);
    console.log(`    Without speaker: ${quoteTellStats.withoutSpeaker}`);
    console.log(`    TELL events created: ${quoteTellStats.tellEventsCreated}`);

    // Filter verb-based TELL that overlap with quotes (prevent double-counting)
    const { kept, filtered, merged } = filterOverlappingVerbTells(
      predicateAssertions,
      quoteIndex,
      quoteAssertions
    );
    console.log(`  Verb-TELL fusion:`);
    console.log(`    Verb assertions kept: ${kept.length}`);
    console.log(`    Verb assertions filtered (overlap): ${filtered.length}`);
    console.log(`    Merged with quotes: ${merged.length}`);

    // Use filtered predicate assertions
    const filteredPredicateAssertions = kept;

    // Merge: quote assertions + filtered predicate assertions + legacy
    const mergedAssertions = [...ir.assertions, ...quoteAssertions, ...filteredPredicateAssertions];
    ir = { ...ir, assertions: mergedAssertions };
    console.log(`  Total assertions: ${mergedAssertions.length}`);
  } else {
    console.log(`  No quotes available (not using BookNLP mode)`);
    // Merge with legacy assertions (no quote data)
    const mergedAssertions = [...ir.assertions, ...predicateAssertions];
    ir = { ...ir, assertions: mergedAssertions };
    console.log(`  Total assertions: ${mergedAssertions.length}`);
  }

  // Count predicate types
  const predicateCounts = new Map<string, number>();
  for (const a of predicateAssertions) {
    const pred = String(a.predicate);
    predicateCounts.set(pred, (predicateCounts.get(pred) ?? 0) + 1);
  }
  const topPredicates = Array.from(predicateCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  console.log('  Top predicates extracted:');
  for (const [pred, count] of topPredicates) {
    console.log(`    ${pred}: ${count}`);
  }

  // ==========================================================================
  // STEP 3: Assertion Builder
  // ==========================================================================
  console.log('\n[3/6] Building assertions (epistemics)...');

  ir = buildAssertions(ir);
  const enrichedAssertions = ir.assertions;
  console.log(`  Assertions after enrichment: ${enrichedAssertions.length}`);

  // Count modalities
  const modalityCounts = new Map<Modality, number>();
  for (const a of enrichedAssertions) {
    modalityCounts.set(a.modality, (modalityCounts.get(a.modality) ?? 0) + 1);
  }
  for (const [mod, count] of Array.from(modalityCounts.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${mod}: ${count}`);
  }

  // ==========================================================================
  // STEP 4: Event Builder
  // ==========================================================================
  console.log('\n[4/6] Building events (timeline objects)...');

  // Build entity map
  const entityMap = new Map<EntityId, Entity>();
  for (const e of ir.entities) {
    entityMap.set(e.id, e);
  }

  // Build doc order info (single document)
  const docOrder: DocOrderInfo[] = [{
    docId,
    orderIndex: 0,
  }];

  const buildResult = buildEvents(enrichedAssertions, entityMap, docOrder, true);
  const events = buildResult.events;
  const eligibilityStats = buildResult.eligibilityStats!;
  ir = { ...ir, events };
  console.log(`  Events: ${events.length}`);

  // Show eligibility gate stats
  const blocked = eligibilityStats.total - eligibilityStats.passed;
  console.log(`  Eligibility gate:`);
  console.log(`    Assertions considered: ${eligibilityStats.total}`);
  console.log(`    Passed: ${eligibilityStats.passed}`);
  console.log(`    Blocked: ${blocked}`);
  if (blocked > 0) {
    if (eligibilityStats.blockedUnresolvedPronoun > 0)
      console.log(`      - unresolved pronoun: ${eligibilityStats.blockedUnresolvedPronoun}`);
    if (eligibilityStats.blockedGroupPlaceholder > 0)
      console.log(`      - group placeholder: ${eligibilityStats.blockedGroupPlaceholder}`);
    if (eligibilityStats.blockedMissingObject > 0)
      console.log(`      - missing object: ${eligibilityStats.blockedMissingObject}`);
    if (eligibilityStats.blockedNegated > 0)
      console.log(`      - negated modality: ${eligibilityStats.blockedNegated}`);
  }

  // Count event types
  const eventTypeCounts = new Map<string, number>();
  for (const e of events) {
    eventTypeCounts.set(e.type, (eventTypeCounts.get(e.type) ?? 0) + 1);
  }
  for (const [type, count] of Array.from(eventTypeCounts.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`);
  }

  // ==========================================================================
  // STEP 5: Fact Builder
  // ==========================================================================
  console.log('\n[5/6] Building facts (materialized views)...');

  const facts = buildFactsFromEvents(events);
  console.log(`  Facts: ${facts.length}`);

  // Count fact types
  const factTypeCounts = new Map<string, number>();
  for (const f of facts) {
    factTypeCounts.set(f.predicate, (factTypeCounts.get(f.predicate) ?? 0) + 1);
  }
  for (const [pred, count] of Array.from(factTypeCounts.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${pred}: ${count}`);
  }

  // ==========================================================================
  // STEP 6: Renderers
  // ==========================================================================
  console.log('\n[6/6] Rendering outputs...');

  // Global timeline
  const timeline = renderTimeline(ir, {
    includeUncertain: true,
    includeEvidence: false,
    limit: 200,
  });
  fs.writeFileSync(path.join(OUTPUT_DIR, 'timeline.md'), timeline);
  console.log(`  timeline.md written`);

  // Find top entities by event participation
  const entityEventCounts = new Map<string, number>();
  for (const event of events) {
    for (const p of event.participants) {
      entityEventCounts.set(p.entity, (entityEventCounts.get(p.entity) ?? 0) + 1);
    }
  }

  // Also count assertion participation
  for (const a of enrichedAssertions) {
    if (a.subject) {
      entityEventCounts.set(a.subject, (entityEventCounts.get(a.subject) ?? 0) + 1);
    }
    if (typeof a.object === 'string') {
      entityEventCounts.set(a.object, (entityEventCounts.get(a.object) ?? 0) + 1);
    }
  }

  const topEntities = Array.from(entityEventCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N_ENTITIES);

  console.log(`  Top ${TOP_N_ENTITIES} entities by participation:`);
  for (const [entityId, count] of topEntities) {
    const entity = ir.entities.find(e => e.id === entityId);
    const name = entity?.canonical || entityId;
    console.log(`    ${name}: ${count} mentions`);

    // Render entity page
    const entityPage = renderEntityPage(ir, entityId, { includeDebug: true });
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    fs.writeFileSync(path.join(OUTPUT_DIR, `entity_${safeName}.md`), entityPage);
  }

  // Per-entity timelines for top 3
  for (const [entityId] of topEntities.slice(0, 3)) {
    const entity = ir.entities.find(e => e.id === entityId);
    const name = entity?.canonical || entityId;
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

    const entityTimeline = renderTimeline(ir, {
      entityId,
      includeUncertain: true,
      includeEvidence: true,
      maxEvidencePerEvent: 1,
    });
    fs.writeFileSync(path.join(OUTPUT_DIR, `timeline_${safeName}.md`), entityTimeline);
  }
  console.log(`  Entity timelines written`);

  // ==========================================================================
  // METRICS
  // ==========================================================================
  console.log('\n' + '='.repeat(60));
  console.log('METRICS');
  console.log('='.repeat(60));

  // Find predicates that didn't map to events (using normalization)
  const allPredicates = new Set<string>();

  for (const a of enrichedAssertions) {
    if (a.predicate) {
      allPredicates.add(a.predicate);
    }
  }

  const unmappedPredicates = Array.from(allPredicates)
    .filter(p => !predicateMapsToEvent(p))
    .sort();

  // Count predicates with their mapping status (using normalization)
  const mappedCounts = new Map<string, number>();
  const unmappedCounts = new Map<string, number>();
  for (const a of enrichedAssertions) {
    const pred = String(a.predicate);
    // Apply normalization to determine if it maps to an event type
    if (predicateMapsToEvent(pred)) {
      // Track by normalized form for clearer metrics
      const normalized = normalizePredicate(pred);
      mappedCounts.set(normalized, (mappedCounts.get(normalized) ?? 0) + 1);
    } else {
      unmappedCounts.set(pred, (unmappedCounts.get(pred) ?? 0) + 1);
    }
  }

  const metrics = {
    chapter: chapterPath,
    wordCount,
    extractionTimeMs: extractionTime,
    counts: {
      entities: ir.entities.length,
      assertions: enrichedAssertions.length,
      events: events.length,
      facts: facts.length,
    },
    eventTypeDistribution: Object.fromEntries(eventTypeCounts),
    modalityDistribution: Object.fromEntries(modalityCounts),
    eligibilityStats: {
      considered: eligibilityStats.total,
      passed: eligibilityStats.passed,
      blocked: eligibilityStats.total - eligibilityStats.passed,
      blockedByReason: {
        unresolvedPronoun: eligibilityStats.blockedUnresolvedPronoun,
        groupPlaceholder: eligibilityStats.blockedGroupPlaceholder,
        missingObject: eligibilityStats.blockedMissingObject,
        negated: eligibilityStats.blockedNegated,
      },
    },
    topEntities: topEntities.map(([id, count]) => ({
      id,
      name: ir.entities.find(e => e.id === id)?.canonical || id,
      count,
    })),
    verbLemmaStats: {
      mappedTotal: Array.from(mappedCounts.values()).reduce((a, b) => a + b, 0),
      unmappedTotal: Array.from(unmappedCounts.values()).reduce((a, b) => a + b, 0),
      topMapped: Array.from(mappedCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([lemma, count]) => ({ lemma, count })),
      topUnmapped: Array.from(unmappedCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([lemma, count]) => ({ lemma, count })),
    },
    unmappedPredicates: unmappedPredicates.slice(0, 20),
    allPredicates: Array.from(allPredicates).sort(),
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'metrics.json'),
    JSON.stringify(metrics, null, 2)
  );
  console.log(`  metrics.json written`);

  // Write full IR
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'project-ir.json'),
    JSON.stringify(ir, null, 2)
  );
  console.log(`  project-ir.json written`);

  // Print summary
  console.log('\nSUMMARY:');
  console.log(`  Entities:   ${metrics.counts.entities}`);
  console.log(`  Assertions: ${metrics.counts.assertions}`);
  console.log(`  Events:     ${metrics.counts.events}`);
  console.log(`  Facts:      ${metrics.counts.facts}`);

  const topMapped = Array.from(mappedCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  const topUnmapped = Array.from(unmappedCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  console.log('\nVERB LEMMAS CAPTURED (mapped to events, top 20):');
  for (const [pred, count] of topMapped) {
    console.log(`  - ${pred}: ${count}`);
  }

  console.log('\nVERB LEMMAS UNMAPPED (no event type, top 20):');
  for (const [pred, count] of topUnmapped) {
    console.log(`  - ${pred}: ${count}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('OUTPUTS WRITTEN TO: ' + OUTPUT_DIR);
  console.log('='.repeat(60));
  console.log('\nNext steps:');
  console.log('  1. cat /tmp/ir-validation/timeline.md');
  console.log('  2. cat /tmp/ir-validation/entity_*.md');
  console.log('  3. Review unmapped predicates in metrics.json');
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
