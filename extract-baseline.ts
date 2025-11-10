/**
 * Phase 2: Baseline Extraction
 * Run current extraction pipeline on long-form chapters and measure performance
 */

import fs from 'fs';
import path from 'path';
import { extractFromSegments } from './app/engine/extract/orchestrator';

interface BaselineMetrics {
  fileName: string;
  wordCount: number;
  processingTimeMs: number;
  entityCount: number;
  relationCount: number;
  entitiesByType: Record<string, number>;
  relationsByPredicate: Record<string, number>;
  uniqueEntityCount: number;
  memoryUsageMB: number;
}

async function extractChapter(filePath: string): Promise<BaselineMetrics> {
  const fileName = path.basename(filePath);
  const text = fs.readFileSync(filePath, 'utf-8');
  const wordCount = text.split(/\s+/).length;

  // Measure memory before
  const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;

  // Extract with timing
  const startTime = Date.now();
  const { entities, relations } = await extractFromSegments(fileName, text);
  const processingTimeMs = Date.now() - startTime;

  // Measure memory after
  const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;
  const memoryUsageMB = memAfter - memBefore;

  // Count entities by type
  const entitiesByType: Record<string, number> = {};
  for (const entity of entities) {
    entitiesByType[entity.type] = (entitiesByType[entity.type] || 0) + 1;
  }

  // Count relations by predicate
  const relationsByPredicate: Record<string, number> = {};
  for (const relation of relations) {
    relationsByPredicate[relation.pred] = (relationsByPredicate[relation.pred] || 0) + 1;
  }

  // Count unique entities (by canonical name)
  const uniqueNames = new Set(entities.map((e: any) => e.canonical?.toLowerCase().trim() || e.name.toLowerCase().trim()));

  // Save extracted data for later analysis
  const outputPath = `/home/user/ARES/output/baseline-${fileName}.json`;
  fs.writeFileSync(outputPath, JSON.stringify({ entities, relations }, null, 2));

  return {
    fileName,
    wordCount,
    processingTimeMs,
    entityCount: entities.length,
    relationCount: relations.length,
    entitiesByType,
    relationsByPredicate,
    uniqueEntityCount: uniqueNames.size,
    memoryUsageMB: Math.round(memoryUsageMB * 100) / 100
  };
}

async function runBaseline() {
  console.log('=== PHASE 2: BASELINE EXTRACTION ===\n');

  const corpusDir = '/home/user/ARES/corpus';
  const files = fs.readdirSync(corpusDir)
    .filter(f => f.endsWith('.txt') && !f.includes('README'))
    .map(f => path.join(corpusDir, f));

  const results: BaselineMetrics[] = [];

  for (const file of files) {
    console.log(`\nProcessing: ${path.basename(file)}`);
    const metrics = await extractChapter(file);
    results.push(metrics);

    console.log(`  Words: ${metrics.wordCount}`);
    console.log(`  Processing time: ${metrics.processingTimeMs}ms (${Math.round(metrics.processingTimeMs / metrics.wordCount * 1000)}ms per 1000 words)`);
    console.log(`  Entities: ${metrics.entityCount} (${metrics.uniqueEntityCount} unique)`);
    console.log(`  Relations: ${metrics.relationCount}`);
    console.log(`  Memory: ${metrics.memoryUsageMB}MB`);
  }

  // Generate summary statistics
  console.log('\n=== SUMMARY STATISTICS ===\n');

  const totalWords = results.reduce((sum, r) => sum + r.wordCount, 0);
  const totalTime = results.reduce((sum, r) => sum + r.processingTimeMs, 0);
  const totalEntities = results.reduce((sum, r) => sum + r.entityCount, 0);
  const totalRelations = results.reduce((sum, r) => sum + r.relationCount, 0);
  const avgMemory = results.reduce((sum, r) => sum + r.memoryUsageMB, 0) / results.length;

  console.log(`Total words processed: ${totalWords}`);
  console.log(`Total processing time: ${totalTime}ms`);
  console.log(`Average time per 1000 words: ${Math.round(totalTime / totalWords * 1000)}ms`);
  console.log(`Total entities extracted: ${totalEntities}`);
  console.log(`Total relations extracted: ${totalRelations}`);
  console.log(`Average memory usage: ${Math.round(avgMemory * 100) / 100}MB`);
  console.log(`Entities per 1000 words: ${Math.round(totalEntities / totalWords * 1000 * 10) / 10}`);
  console.log(`Relations per 1000 words: ${Math.round(totalRelations / totalWords * 1000 * 10) / 10}`);

  // Aggregate entity types
  console.log('\n=== ENTITY TYPES (AGGREGATED) ===\n');
  const allEntityTypes: Record<string, number> = {};
  for (const result of results) {
    for (const [type, count] of Object.entries(result.entitiesByType)) {
      allEntityTypes[type] = (allEntityTypes[type] || 0) + count;
    }
  }
  for (const [type, count] of Object.entries(allEntityTypes).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  // Aggregate relation predicates
  console.log('\n=== RELATION PREDICATES (AGGREGATED) ===\n');
  const allPredicates: Record<string, number> = {};
  for (const result of results) {
    for (const [pred, count] of Object.entries(result.relationsByPredicate)) {
      allPredicates[pred] = (allPredicates[pred] || 0) + count;
    }
  }
  for (const [pred, count] of Object.entries(allPredicates).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pred}: ${count}`);
  }

  // Save detailed results
  const reportPath = '/home/user/ARES/reports/baseline-metrics.json';
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed metrics saved to: ${reportPath}`);

  // Generate markdown report
  const mdReport = generateMarkdownReport(results);
  const mdPath = '/home/user/ARES/reports/baseline-metrics.md';
  fs.writeFileSync(mdPath, mdReport);
  console.log(`Markdown report saved to: ${mdPath}`);
}

function generateMarkdownReport(results: BaselineMetrics[]): string {
  let report = '# Phase 2: Baseline Extraction Metrics\n\n';
  report += `**Date:** ${new Date().toISOString()}\n\n`;
  report += '## Overview\n\n';
  report += 'Baseline extraction performance on long-form narratives (2000-5000 words each).\n\n';

  // Summary table
  report += '## Summary Statistics\n\n';
  const totalWords = results.reduce((sum, r) => sum + r.wordCount, 0);
  const totalTime = results.reduce((sum, r) => sum + r.processingTimeMs, 0);
  const totalEntities = results.reduce((sum, r) => sum + r.entityCount, 0);
  const totalRelations = results.reduce((sum, r) => sum + r.relationCount, 0);
  const avgMemory = results.reduce((sum, r) => sum + r.memoryUsageMB, 0) / results.length;

  report += `- **Total words:** ${totalWords.toLocaleString()}\n`;
  report += `- **Total processing time:** ${totalTime}ms (${Math.round(totalTime / totalWords * 1000)}ms per 1000 words)\n`;
  report += `- **Total entities:** ${totalEntities}\n`;
  report += `- **Total relations:** ${totalRelations}\n`;
  report += `- **Average memory:** ${Math.round(avgMemory * 100) / 100}MB\n`;
  report += `- **Entities per 1000 words:** ${Math.round(totalEntities / totalWords * 1000 * 10) / 10}\n`;
  report += `- **Relations per 1000 words:** ${Math.round(totalRelations / totalWords * 1000 * 10) / 10}\n\n`;

  // Per-chapter breakdown
  report += '## Per-Chapter Results\n\n';
  report += '| Chapter | Words | Time (ms) | Entities | Relations | Memory (MB) |\n';
  report += '|---------|-------|-----------|----------|-----------|-------------|\n';

  for (const r of results) {
    report += `| ${r.fileName} | ${r.wordCount} | ${r.processingTimeMs} | ${r.entityCount} | ${r.relationCount} | ${r.memoryUsageMB} |\n`;
  }

  // Entity types
  report += '\n## Entity Type Distribution\n\n';
  const allEntityTypes: Record<string, number> = {};
  for (const result of results) {
    for (const [type, count] of Object.entries(result.entitiesByType)) {
      allEntityTypes[type] = (allEntityTypes[type] || 0) + count;
    }
  }

  report += '| Type | Count | Percentage |\n';
  report += '|------|-------|------------|\n';
  for (const [type, count] of Object.entries(allEntityTypes).sort((a, b) => b[1] - a[1])) {
    const pct = Math.round(count / totalEntities * 100);
    report += `| ${type} | ${count} | ${pct}% |\n`;
  }

  // Relation predicates
  report += '\n## Relation Predicate Distribution\n\n';
  const allPredicates: Record<string, number> = {};
  for (const result of results) {
    for (const [pred, count] of Object.entries(result.relationsByPredicate)) {
      allPredicates[pred] = (allPredicates[pred] || 0) + count;
    }
  }

  report += '| Predicate | Count | Percentage |\n';
  report += '|-----------|-------|------------|\n';
  for (const [pred, count] of Object.entries(allPredicates).sort((a, b) => b[1] - a[1])) {
    const pct = Math.round(count / totalRelations * 100);
    report += `| ${pred} | ${count} | ${pct}% |\n`;
  }

  // Performance analysis
  report += '\n## Performance Analysis\n\n';
  report += '### Processing Speed\n\n';
  const avgTimePerK = Math.round(totalTime / totalWords * 1000);
  const targetTimePerK = 5000; // 5 seconds per 1000 words (target from plan)

  if (avgTimePerK < targetTimePerK) {
    report += `✅ **PASS:** Average processing time (${avgTimePerK}ms per 1000 words) is below target (${targetTimePerK}ms).\n\n`;
  } else {
    report += `❌ **FAIL:** Average processing time (${avgTimePerK}ms per 1000 words) exceeds target (${targetTimePerK}ms).\n\n`;
  }

  report += '### Memory Usage\n\n';
  const targetMemory = 500; // 500MB target from plan

  if (avgMemory < targetMemory) {
    report += `✅ **PASS:** Average memory usage (${Math.round(avgMemory)}MB) is below target (${targetMemory}MB).\n\n`;
  } else {
    report += `❌ **FAIL:** Average memory usage (${Math.round(avgMemory)}MB) exceeds target (${targetMemory}MB).\n\n`;
  }

  // Observations
  report += '\n## Observations\n\n';
  report += '### Extraction Density\n\n';
  const entitiesPerK = Math.round(totalEntities / totalWords * 1000 * 10) / 10;
  const relationsPerK = Math.round(totalRelations / totalWords * 1000 * 10) / 10;

  report += `- **Entity density:** ${entitiesPerK} entities per 1000 words\n`;
  report += `- **Relation density:** ${relationsPerK} relations per 1000 words\n`;
  report += `- **Relation/Entity ratio:** ${Math.round(totalRelations / totalEntities * 100)}%\n\n`;

  report += 'These metrics will serve as the baseline for measuring improvements in Phase 4.\n\n';

  // Next steps
  report += '## Next Steps\n\n';
  report += '1. Manual review of extracted entities and relations\n';
  report += '2. Create gold standard annotations for 20% sample\n';
  report += '3. Calculate precision and recall\n';
  report += '4. Proceed to Phase 3: Failure Analysis\n';

  return report;
}

// Run baseline extraction
runBaseline().catch(console.error);
