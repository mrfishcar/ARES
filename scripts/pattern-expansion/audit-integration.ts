/**
 * Pattern Integration Audit
 *
 * Audits which generated patterns have been integrated into the extraction pipeline
 * and identifies the biggest missing families.
 */

import * as fs from 'fs';
import * as path from 'path';

interface Pattern {
  id: string;
  regex?: string;
  signature_regex?: string;
  predicate: string;
  family: string;
  lemma_form?: string;
  dep_roles?: string[];
  lemmas?: string[];
}

interface FamilyAudit {
  family: string;
  generated_count: number;
  integrated_count: number;
  missing_count: number;
  coverage_percent: number;
  missing_patterns: string[];
}

interface AuditReport {
  timestamp: string;
  summary: {
    total_generated: number;
    total_integrated: number;
    total_missing: number;
    overall_coverage: number;
  };
  by_family: FamilyAudit[];
  biggest_missing: {
    family: string;
    missing_count: number;
    missing_patterns: string[];
  }[];
}

/**
 * Load patterns from JSON file
 */
function loadPatterns(filePath: string): Pattern[] {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return [];
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Normalize pattern for comparison
 */
function normalizePattern(pattern: Pattern): string {
  const key = pattern.regex || pattern.signature_regex || '';
  return `${pattern.family}:${pattern.predicate}:${key.toLowerCase()}`;
}

/**
 * Build audit report
 */
function auditIntegration(): AuditReport {
  const patternsDir = path.join(process.cwd(), 'patterns');

  // Load generated patterns
  const generatedSurface = loadPatterns(path.join(patternsDir, 'new_surface_patterns.json'));
  const generatedDep = loadPatterns(path.join(patternsDir, 'new_dependency_patterns.json'));
  const allGenerated = [...generatedSurface, ...generatedDep];

  // Load existing/integrated patterns
  const existingSurface = loadPatterns(path.join(patternsDir, '_existing_surface.json'));
  const existingDep = loadPatterns(path.join(patternsDir, '_existing_dependency.json'));
  const allExisting = [...existingSurface, ...existingDep];

  // Build set of integrated patterns (normalized)
  const integratedSet = new Set(allExisting.map(normalizePattern));

  // Group by family
  const familyMap = new Map<string, {
    generated: Pattern[];
    integrated: Pattern[];
    missing: Pattern[];
  }>();

  // Process all generated patterns
  for (const pattern of allGenerated) {
    if (!familyMap.has(pattern.family)) {
      familyMap.set(pattern.family, { generated: [], integrated: [], missing: [] });
    }

    const familyData = familyMap.get(pattern.family)!;
    familyData.generated.push(pattern);

    const normalizedKey = normalizePattern(pattern);
    if (integratedSet.has(normalizedKey)) {
      familyData.integrated.push(pattern);
    } else {
      familyData.missing.push(pattern);
    }
  }

  // Build family audits
  const familyAudits: FamilyAudit[] = [];

  for (const [family, data] of familyMap.entries()) {
    const generatedCount = data.generated.length;
    const integratedCount = data.integrated.length;
    const missingCount = data.missing.length;
    const coveragePercent = generatedCount > 0
      ? Math.round((integratedCount / generatedCount) * 100)
      : 0;

    familyAudits.push({
      family,
      generated_count: generatedCount,
      integrated_count: integratedCount,
      missing_count: missingCount,
      coverage_percent: coveragePercent,
      missing_patterns: data.missing.map(p => `${p.predicate} (${p.id})`).slice(0, 10)
    });
  }

  // Sort by missing count (descending)
  familyAudits.sort((a, b) => b.missing_count - a.missing_count);

  // Get top 5 biggest missing families
  const biggestMissing = familyAudits.slice(0, 5).map(f => ({
    family: f.family,
    missing_count: f.missing_count,
    missing_patterns: f.missing_patterns
  }));

  // Calculate summary
  const totalGenerated = allGenerated.length;
  const totalIntegrated = familyAudits.reduce((sum, f) => sum + f.integrated_count, 0);
  const totalMissing = totalGenerated - totalIntegrated;
  const overallCoverage = totalGenerated > 0
    ? Math.round((totalIntegrated / totalGenerated) * 100)
    : 0;

  return {
    timestamp: new Date().toISOString(),
    summary: {
      total_generated: totalGenerated,
      total_integrated: totalIntegrated,
      total_missing: totalMissing,
      overall_coverage: overallCoverage
    },
    by_family: familyAudits,
    biggest_missing: biggestMissing
  };
}

/**
 * Save audit report
 */
function saveAuditReport(report: AuditReport): void {
  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const outputPath = path.join(reportsDir, 'pattern_integration_audit.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(`\n✓ Audit report saved to: ${outputPath}\n`);
}

/**
 * Print audit summary to console
 */
function printSummary(report: AuditReport): void {
  console.log('\n=== Pattern Integration Audit ===\n');

  console.log('Summary:');
  console.log(`  Total Generated:  ${report.summary.total_generated}`);
  console.log(`  Total Integrated: ${report.summary.total_integrated}`);
  console.log(`  Total Missing:    ${report.summary.total_missing}`);
  console.log(`  Overall Coverage: ${report.summary.overall_coverage}%\n`);

  console.log('Top 5 Biggest Missing Families:');
  report.biggest_missing.forEach((item, idx) => {
    console.log(`  ${idx + 1}. ${item.family.toUpperCase()}`);
    console.log(`     Missing: ${item.missing_count} patterns`);
    if (item.missing_patterns.length > 0) {
      console.log(`     Examples: ${item.missing_patterns.slice(0, 3).join(', ')}`);
    }
    console.log();
  });

  console.log('Coverage by Family:');
  report.by_family.forEach(family => {
    const bar = '█'.repeat(Math.floor(family.coverage_percent / 5));
    const empty = '░'.repeat(20 - Math.floor(family.coverage_percent / 5));
    console.log(`  ${family.family.padEnd(15)} [${bar}${empty}] ${family.coverage_percent}% (${family.integrated_count}/${family.generated_count})`);
  });
  console.log();
}

// Main execution
if (require.main === module) {
  try {
    const report = auditIntegration();
    printSummary(report);
    saveAuditReport(report);
    console.log('✓ Audit complete!\n');
  } catch (error) {
    console.error('Error running audit:', error);
    process.exit(1);
  }
}

export { auditIntegration, AuditReport, FamilyAudit };
