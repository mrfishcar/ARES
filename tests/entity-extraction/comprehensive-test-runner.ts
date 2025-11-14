/**
 * Comprehensive Entity Extraction Test Runner
 *
 * Demonstrates usage of all entity extraction test utilities:
 * - Basic extraction metrics (precision, recall, F1)
 * - Confidence scoring validation
 * - Entity type validation
 * - Alias resolution testing
 * - Pattern-based validation
 *
 * Run with: npx tsx tests/entity-extraction/comprehensive-test-runner.ts
 */

import fs from 'fs';
import path from 'path';
import type { Entity } from '../../app/engine/extract/entities';
import {
  calculateMetrics,
  compareEntities,
  formatMetrics,
  formatComparison,
  aggregateMetrics,
  meetsThresholds,
  generateTestReport,
  validateEntityPatterns,
  type TestEntity,
  type ExtractionMetrics,
} from './test-utils';
import {
  analyzeConfidenceDistribution,
  validateConfidenceCorrelation,
  detectConfidenceIssues,
  generateConfidenceReport,
  DEFAULT_THRESHOLDS,
} from './confidence-validation';
import {
  validateTypeConsistency,
  generateTypeValidationReport,
  formatTypeDistribution,
} from './type-validation';
import {
  validateAliasResolution,
  analyzeAliasQuality,
  generateAliasReport,
} from './alias-resolution';

interface TestCase {
  id: string;
  description: string;
  text: string;
  expectedEntities: TestEntity[];
}

interface TestResult {
  testId: string;
  description: string;
  metrics: ExtractionMetrics;
  passed: boolean;
  issues: string[];
}

/**
 * Load test cases from JSON files
 */
function loadTestCases(testDir: string): TestCase[] {
  const files = fs.readdirSync(testDir).filter(f => f.endsWith('.json'));
  const testCases: TestCase[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(testDir, file), 'utf-8');
    const cases = JSON.parse(content) as TestCase[];
    testCases.push(...cases);
  }

  return testCases;
}

/**
 * Mock extraction function (replace with actual extraction in real tests)
 */
async function mockExtractEntities(text: string): Promise<Entity[]> {
  // This is a mock - in real tests, call the actual extraction function
  // For demonstration, return empty array
  console.log(`  [Mock] Would extract entities from: "${text.substring(0, 50)}..."`);
  return [];
}

/**
 * Run a single test case with full validation
 */
async function runTestCase(
  testCase: TestCase,
  extractFn: (text: string) => Promise<Entity[]>
): Promise<TestResult> {
  console.log(`\nRunning test: ${testCase.id} - ${testCase.description}`);

  const extracted = await extractFn(testCase.text);
  const metrics = calculateMetrics(testCase.expectedEntities, extracted);
  const issues: string[] = [];

  // 1. Check basic metrics
  const thresholds = { precision: 0.8, recall: 0.75, f1: 0.77 };
  const metricsCheck = meetsThresholds(metrics, thresholds);
  if (!metricsCheck.passed) {
    issues.push(...metricsCheck.failures);
  }

  // 2. Validate entity patterns
  const patternValidation = validateEntityPatterns(extracted, testCase.text);
  if (!patternValidation.valid) {
    for (const failure of patternValidation.failures) {
      issues.push(`[${failure.pattern}] ${failure.message}`);
    }
  }

  // 3. Check confidence scores
  const confidenceIssues = detectConfidenceIssues(
    testCase.expectedEntities,
    extracted,
    DEFAULT_THRESHOLDS
  );
  for (const issue of confidenceIssues.filter(i => i.severity === 'error')) {
    issues.push(`Confidence: ${issue.message}`);
  }

  // 4. Validate entity types
  const typeValidation = validateTypeConsistency(extracted, testCase.text);
  if (!typeValidation.valid) {
    for (const violation of typeValidation.violations) {
      issues.push(`Type: ${violation.entity} - ${violation.issues[0]?.message}`);
    }
  }

  return {
    testId: testCase.id,
    description: testCase.description,
    metrics,
    passed: issues.length === 0 && metricsCheck.passed,
    issues,
  };
}

/**
 * Generate comprehensive report
 */
function generateReport(results: TestResult[]): string {
  const lines: string[] = [
    '╔════════════════════════════════════════════════════════════════╗',
    '║    ARES Entity Extraction Test Suite - Comprehensive Report   ║',
    '╚════════════════════════════════════════════════════════════════╝',
    '',
  ];

  // Overall statistics
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const passRate = total > 0 ? (passed / total) * 100 : 0;

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('OVERALL RESULTS');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`Tests Passed:  ${passed}/${total} (${passRate.toFixed(1)}%)`);
  lines.push('');

  // Aggregate metrics
  const allMetrics = results.map(r => r.metrics);
  const aggregated = aggregateMetrics(allMetrics);

  lines.push('Aggregated Metrics:');
  lines.push(`  Precision: ${(aggregated.precision * 100).toFixed(1)}%`);
  lines.push(`  Recall:    ${(aggregated.recall * 100).toFixed(1)}%`);
  lines.push(`  F1 Score:  ${(aggregated.f1 * 100).toFixed(1)}%`);
  lines.push('');
  lines.push(`  True Positives:  ${aggregated.truePositives}`);
  lines.push(`  False Positives: ${aggregated.falsePositives}`);
  lines.push(`  False Negatives: ${aggregated.falseNegatives}`);
  lines.push('');

  // Test results by category
  const testsByCategory: Record<string, TestResult[]> = {
    'Basic': [],
    'Historical': [],
    'Modern': [],
    'Academic': [],
    'Edge Cases': [],
    'Coreference': [],
    'Other': [],
  };

  for (const result of results) {
    if (result.testId.includes('basic')) testsByCategory['Basic'].push(result);
    else if (result.testId.includes('historical')) testsByCategory['Historical'].push(result);
    else if (result.testId.includes('modern')) testsByCategory['Modern'].push(result);
    else if (result.testId.includes('academic')) testsByCategory['Academic'].push(result);
    else if (result.testId.includes('edge-case')) testsByCategory['Edge Cases'].push(result);
    else if (result.testId.includes('coref')) testsByCategory['Coreference'].push(result);
    else testsByCategory['Other'].push(result);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('RESULTS BY CATEGORY');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  for (const [category, tests] of Object.entries(testsByCategory)) {
    if (tests.length === 0) continue;

    const categoryPassed = tests.filter(t => t.passed).length;
    const categoryTotal = tests.length;
    const categoryRate = (categoryPassed / categoryTotal) * 100;

    lines.push(`${category}: ${categoryPassed}/${categoryTotal} (${categoryRate.toFixed(0)}%)`);

    for (const test of tests) {
      const icon = test.passed ? '✅' : '❌';
      const f1 = (test.metrics.f1 * 100).toFixed(0);
      lines.push(`  ${icon} ${test.testId}: F1=${f1}%`);

      if (!test.passed && test.issues.length > 0) {
        for (const issue of test.issues.slice(0, 2)) {
          lines.push(`     ⚠️  ${issue}`);
        }
        if (test.issues.length > 2) {
          lines.push(`     ... and ${test.issues.length - 2} more issues`);
        }
      }
    }
    lines.push('');
  }

  // Failed tests detail
  const failed = results.filter(r => !r.passed);
  if (failed.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('FAILED TESTS DETAIL');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');

    for (const test of failed) {
      lines.push(`❌ ${test.testId}`);
      lines.push(`   Description: ${test.description}`);
      lines.push(`   Metrics: P=${(test.metrics.precision * 100).toFixed(1)}%, R=${(test.metrics.recall * 100).toFixed(1)}%, F1=${(test.metrics.f1 * 100).toFixed(1)}%`);
      lines.push('   Issues:');
      for (const issue of test.issues) {
        lines.push(`     - ${issue}`);
      }
      lines.push('');
    }
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('SUMMARY');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  if (passRate === 100) {
    lines.push('🎉 ALL TESTS PASSED! 🎉');
  } else if (passRate >= 80) {
    lines.push('✅ Most tests passed. Some issues to address.');
  } else if (passRate >= 60) {
    lines.push('⚠️  Significant issues detected. Review failed tests.');
  } else {
    lines.push('❌ Many tests failing. Major improvements needed.');
  }

  lines.push('');
  lines.push(`Overall Grade: ${getGrade(passRate)}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Get letter grade based on pass rate
 */
function getGrade(passRate: number): string {
  if (passRate >= 95) return 'A+ (Excellent)';
  if (passRate >= 90) return 'A (Very Good)';
  if (passRate >= 85) return 'B+ (Good)';
  if (passRate >= 80) return 'B (Satisfactory)';
  if (passRate >= 75) return 'C+ (Needs Improvement)';
  if (passRate >= 70) return 'C (Marginal)';
  if (passRate >= 60) return 'D (Poor)';
  return 'F (Failing)';
}

/**
 * Main test runner
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         ARES Entity Extraction - Comprehensive Tests          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const testDir = path.join(__dirname, 'test-cases');

  console.log(`Loading test cases from: ${testDir}`);
  const testCases = loadTestCases(testDir);
  console.log(`Loaded ${testCases.length} test cases\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('RUNNING TESTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const results: TestResult[] = [];

  for (const testCase of testCases) {
    try {
      const result = await runTestCase(testCase, mockExtractEntities);
      results.push(result);

      const icon = result.passed ? '✅' : '❌';
      console.log(`  ${icon} ${result.testId}: F1=${(result.metrics.f1 * 100).toFixed(1)}%`);
    } catch (error) {
      console.error(`  ❌ ${testCase.id}: Error - ${error}`);
      results.push({
        testId: testCase.id,
        description: testCase.description,
        metrics: {
          precision: 0,
          recall: 0,
          f1: 0,
          truePositives: 0,
          falsePositives: 0,
          falseNegatives: 0,
        },
        passed: false,
        issues: [`Test execution error: ${error}`],
      });
    }
  }

  console.log('\n');

  // Generate and display report
  const report = generateReport(results);
  console.log(report);

  // Save report to file
  const reportPath = path.join(__dirname, '../../reports/entity-extraction-test-report.txt');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report, 'utf-8');
  console.log(`\nReport saved to: ${reportPath}`);

  // Exit with appropriate code
  const passed = results.filter(r => r.passed).length;
  const passRate = (passed / results.length) * 100;
  process.exit(passRate >= 80 ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runTestCase, generateReport, loadTestCases };
