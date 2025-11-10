# Stage Test Runner Implementation Guide

**Purpose**: Guide for implementing unified stage test runners that combine component health checks + extraction quality tests

**Status**: Design complete, implementation pending

---

## Overview

Each stage should have a single test runner script that:
1. Runs all component health checks for that stage
2. Runs the extraction quality test for that stage
3. Reports clear pass/fail with blocking issue identified
4. Returns structured results for automation

---

## File Structure

```
scripts/
└── stages/
    ├── test-stage-1.ts   # Foundation
    ├── test-stage-2.ts   # Component Validation
    ├── test-stage-3.ts   # Complex Extraction
    ├── test-stage-4.ts   # Scale Testing
    ├── test-stage-5.ts   # Production Readiness
    └── common.ts         # Shared utilities
```

---

## Template: Stage Test Runner

```typescript
// scripts/stages/test-stage-1.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';

const execAsync = promisify(exec);

interface StageResult {
  stage: number;
  stageName: string;
  passed: boolean;
  blocker?: string;
  checks: CheckResult[];
  timestamp: string;
}

interface CheckResult {
  checkId: string;
  checkName: string;
  passed: boolean;
  metric?: number;
  target?: number;
  message: string;
}

async function runStage1(): Promise<StageResult> {
  console.log('🏗️  STAGE 1: FOUNDATION\n');

  const checks: CheckResult[] = [];

  // ========================================
  // 1.1 Pattern Coverage Audit
  // ========================================
  console.log('1.1 Pattern Coverage Audit...');

  try {
    await execAsync('npx ts-node scripts/pattern-expansion/inventory-patterns.ts');

    // Parse output to get coverage percentage
    const report = await readFile('reports/rung1_pattern_coverage_summary.md', 'utf-8');
    const coverageMatch = report.match(/Coverage: (\d+)%/);
    const coverage = coverageMatch ? parseInt(coverageMatch[1]) / 100 : 0;

    const passed = coverage >= 0.30;
    checks.push({
      checkId: '1.1',
      checkName: 'Pattern Coverage Audit',
      passed,
      metric: coverage,
      target: 0.30,
      message: passed
        ? `✅ Pattern coverage: ${(coverage * 100).toFixed(0)}%`
        : `❌ Pattern coverage too low: ${(coverage * 100).toFixed(0)}% (need ≥30%)`
    });

    console.log(checks[checks.length - 1].message);

    if (!passed) {
      return {
        stage: 1,
        stageName: 'Foundation',
        passed: false,
        blocker: '1.1 Pattern Coverage',
        checks,
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    checks.push({
      checkId: '1.1',
      checkName: 'Pattern Coverage Audit',
      passed: false,
      message: `❌ Error running pattern audit: ${error.message}`
    });

    return {
      stage: 1,
      stageName: 'Foundation',
      passed: false,
      blocker: '1.1 Pattern Coverage (Error)',
      checks,
      timestamp: new Date().toISOString()
    };
  }

  // ========================================
  // 1.2 Entity Quality Check
  // ========================================
  console.log('\n1.2 Entity Quality Check...');

  try {
    // Check if entity pass is configured correctly
    // This is a placeholder - actual implementation would test entity quality
    const entityPassWorking = true; // TODO: Implement actual check

    checks.push({
      checkId: '1.2',
      checkName: 'Entity Quality Check',
      passed: entityPassWorking,
      message: entityPassWorking
        ? '✅ Entity quality check passed'
        : '❌ Entity quality issues detected'
    });

    console.log(checks[checks.length - 1].message);

    if (!entityPassWorking) {
      return {
        stage: 1,
        stageName: 'Foundation',
        passed: false,
        blocker: '1.2 Entity Quality',
        checks,
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    checks.push({
      checkId: '1.2',
      checkName: 'Entity Quality Check',
      passed: false,
      message: `❌ Error checking entity quality: ${error.message}`
    });

    return {
      stage: 1,
      stageName: 'Foundation',
      passed: false,
      blocker: '1.2 Entity Quality (Error)',
      checks,
      timestamp: new Date().toISOString()
    };
  }

  // ========================================
  // 1.3 Simple Sentence Extraction
  // ========================================
  console.log('\n1.3 Simple Sentence Extraction...');

  try {
    const { stdout } = await execAsync('npm test tests/ladder/level-1-simple.spec.ts');

    // Parse test output for metrics
    // This is simplified - actual implementation would parse vitest output
    const passed = stdout.includes('passing') && !stdout.includes('failing');

    checks.push({
      checkId: '1.3',
      checkName: 'Simple Sentence Extraction',
      passed,
      message: passed
        ? '✅ Simple sentence extraction passed (P≥90%, R≥85%)'
        : '❌ Simple sentence extraction failed'
    });

    console.log(checks[checks.length - 1].message);

    if (!passed) {
      return {
        stage: 1,
        stageName: 'Foundation',
        passed: false,
        blocker: '1.3 Simple Extraction',
        checks,
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    checks.push({
      checkId: '1.3',
      checkName: 'Simple Sentence Extraction',
      passed: false,
      message: `❌ Test execution failed: ${error.message}`
    });

    return {
      stage: 1,
      stageName: 'Foundation',
      passed: false,
      blocker: '1.3 Simple Extraction (Error)',
      checks,
      timestamp: new Date().toISOString()
    };
  }

  // ========================================
  // All checks passed!
  // ========================================
  console.log('\n✅ STAGE 1 PASSED\n');

  return {
    stage: 1,
    stageName: 'Foundation',
    passed: true,
    checks,
    timestamp: new Date().toISOString()
  };
}

// Main execution
if (require.main === module) {
  runStage1()
    .then(result => {
      console.log('\n' + '='.repeat(60));
      console.log(`Stage ${result.stage}: ${result.stageName}`);
      console.log('='.repeat(60));
      console.log(`Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);

      if (!result.passed) {
        console.log(`Blocker: ${result.blocker}`);
      }

      console.log('\nCheck Details:');
      result.checks.forEach(check => {
        console.log(`  ${check.checkId} ${check.checkName}: ${check.message}`);
      });

      console.log('='.repeat(60) + '\n');

      // Save results to file
      const fs = require('fs');
      fs.writeFileSync(
        'reports/stage_1_result.json',
        JSON.stringify(result, null, 2)
      );

      process.exit(result.passed ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Unexpected error:', error);
      process.exit(1);
    });
}

export { runStage1, StageResult, CheckResult };
```

---

## Common Utilities

```typescript
// scripts/stages/common.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CheckResult {
  checkId: string;
  checkName: string;
  passed: boolean;
  metric?: number;
  target?: number;
  message: string;
}

export interface StageResult {
  stage: number;
  stageName: string;
  passed: boolean;
  blocker?: string;
  checks: CheckResult[];
  timestamp: string;
}

/**
 * Parse precision/recall/F1 from evaluation output
 */
export function parseMetrics(output: string): {
  precision: number;
  recall: number;
  f1: number;
} {
  const precisionMatch = output.match(/Precision:\s*([\d.]+)/);
  const recallMatch = output.match(/Recall:\s*([\d.]+)/);
  const f1Match = output.match(/F1:\s*([\d.]+)/);

  return {
    precision: precisionMatch ? parseFloat(precisionMatch[1]) : 0,
    recall: recallMatch ? parseFloat(recallMatch[1]) : 0,
    f1: f1Match ? parseFloat(f1Match[1]) : 0
  };
}

/**
 * Run a command and capture output
 */
export async function runCommand(
  command: string,
  description: string
): Promise<{ stdout: string; stderr: string }> {
  console.log(`  Running: ${description}...`);
  try {
    const result = await execAsync(command);
    return result;
  } catch (error) {
    // exec throws on non-zero exit, but we still get stdout/stderr
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || ''
    };
  }
}

/**
 * Create a check result
 */
export function createCheck(
  checkId: string,
  checkName: string,
  passed: boolean,
  message: string,
  metric?: number,
  target?: number
): CheckResult {
  return {
    checkId,
    checkName,
    passed,
    metric,
    target,
    message
  };
}

/**
 * Print stage header
 */
export function printStageHeader(stageNum: number, stageName: string) {
  console.log('\n' + '='.repeat(60));
  console.log(`STAGE ${stageNum}: ${stageName.toUpperCase()}`);
  console.log('='.repeat(60) + '\n');
}

/**
 * Print stage result
 */
export function printStageResult(result: StageResult) {
  console.log('\n' + '='.repeat(60));
  console.log(`Stage ${result.stage}: ${result.stageName}`);
  console.log('='.repeat(60));
  console.log(`Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);

  if (!result.passed && result.blocker) {
    console.log(`Blocker: ${result.blocker}`);
  }

  console.log('\nCheck Details:');
  result.checks.forEach(check => {
    const metricStr = check.metric !== undefined
      ? ` (${check.metric.toFixed(3)} vs ${check.target?.toFixed(3)})`
      : '';
    console.log(`  ${check.checkId} ${check.checkName}${metricStr}`);
    console.log(`    ${check.message}`);
  });

  console.log('='.repeat(60) + '\n');
}

/**
 * Save stage result to file
 */
export function saveStageResult(result: StageResult, filename: string) {
  const fs = require('fs');
  const path = require('path');

  // Ensure reports directory exists
  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const filepath = path.join(reportsDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
  console.log(`Results saved to: ${filepath}`);
}
```

---

## Stage 2 Example

```typescript
// scripts/stages/test-stage-2.ts
import {
  StageResult,
  CheckResult,
  printStageHeader,
  printStageResult,
  saveStageResult,
  createCheck,
  runCommand,
  parseMetrics
} from './common';

async function runStage2(): Promise<StageResult> {
  printStageHeader(2, 'Component Validation');

  const checks: CheckResult[] = [];

  // ========================================
  // 2.1 Synthetic Baseline Evaluation
  // ========================================
  console.log('2.1 Synthetic Baseline Evaluation...');

  try {
    const { stdout } = await runCommand(
      'npx tsx scripts/pattern-expansion/evaluate-coverage.ts',
      'Synthetic baseline evaluation'
    );

    const metrics = parseMetrics(stdout);
    const passed = metrics.f1 >= 0.10;

    checks.push(createCheck(
      '2.1',
      'Synthetic Baseline Evaluation',
      passed,
      passed
        ? `✅ F1=${metrics.f1.toFixed(3)} (≥0.10)`
        : `❌ F1=${metrics.f1.toFixed(3)} < 0.10`,
      metrics.f1,
      0.10
    ));

    console.log(checks[checks.length - 1].message);

    if (!passed) {
      return {
        stage: 2,
        stageName: 'Component Validation',
        passed: false,
        blocker: '2.1 Synthetic Baseline',
        checks,
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    checks.push(createCheck(
      '2.1',
      'Synthetic Baseline Evaluation',
      false,
      `❌ Error: ${error.message}`
    ));

    return {
      stage: 2,
      stageName: 'Component Validation',
      passed: false,
      blocker: '2.1 Synthetic Baseline (Error)',
      checks,
      timestamp: new Date().toISOString()
    };
  }

  // 2.2 and 2.3 follow similar pattern...

  // All checks passed
  return {
    stage: 2,
    stageName: 'Component Validation',
    passed: true,
    checks,
    timestamp: new Date().toISOString()
  };
}

// Main execution
if (require.main === module) {
  runStage2()
    .then(result => {
      printStageResult(result);
      saveStageResult(result, 'stage_2_result.json');
      process.exit(result.passed ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Unexpected error:', error);
      process.exit(1);
    });
}

export { runStage2 };
```

---

## Package.json Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test:stage:1": "npx ts-node scripts/stages/test-stage-1.ts",
    "test:stage:2": "npx ts-node scripts/stages/test-stage-2.ts",
    "test:stage:3": "npx ts-node scripts/stages/test-stage-3.ts",
    "test:stage:4": "npx ts-node scripts/stages/test-stage-4.ts",
    "test:stage:5": "npx ts-node scripts/stages/test-stage-5.ts",

    "test:current": "npx ts-node scripts/stages/test-current-stage.ts",
    "test:all": "npx ts-node scripts/stages/test-all-stages.ts"
  }
}
```

---

## Current Stage Runner

```typescript
// scripts/stages/test-current-stage.ts
import { readFileSync } from 'fs';

/**
 * Determines the current stage based on INTEGRATED_TESTING_STRATEGY.md
 * and runs appropriate tests
 */
async function runCurrentStage() {
  const strategy = readFileSync('INTEGRATED_TESTING_STRATEGY.md', 'utf-8');

  // Parse current stage from status
  // Look for lines like: | **Stage 1** | ✅ PASSED |
  const stageMatches = strategy.matchAll(/\*\*Stage (\d+)\*\*\s*\|\s*([✅⚠️⏸️])\s*([^|]*)/g);

  let currentStage = 1;
  for (const match of stageMatches) {
    const stageNum = parseInt(match[1]);
    const status = match[2];

    if (status === '✅') {
      currentStage = stageNum + 1; // Move to next stage
    } else if (status === '⚠️') {
      currentStage = stageNum; // Continue on this stage
      break;
    } else {
      break; // Hit a not-started stage
    }
  }

  console.log(`\n🎯 Current stage: ${currentStage}\n`);

  // Dynamically import and run the stage
  const { [`runStage${currentStage}`]: runStage } = await import(`./test-stage-${currentStage}`);
  const result = await runStage();

  return result;
}

if (require.main === module) {
  runCurrentStage()
    .then(result => {
      process.exit(result.passed ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}
```

---

## Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Create `scripts/stages/` directory
- [ ] Implement `common.ts` with shared utilities
- [ ] Test common utilities work

### Phase 2: Stage 1 (Current)
- [ ] Implement `test-stage-1.ts`
- [ ] Test Stage 1 runner end-to-end
- [ ] Verify output format and JSON export

### Phase 3: Stage 2 (Current)
- [ ] Implement `test-stage-2.ts`
- [ ] Test Stage 2 runner end-to-end
- [ ] Verify all checks work correctly

### Phase 4: Stages 3-5 (Future)
- [ ] Implement `test-stage-3.ts`
- [ ] Implement `test-stage-4.ts`
- [ ] Implement `test-stage-5.ts`

### Phase 5: Meta Runners
- [ ] Implement `test-current-stage.ts`
- [ ] Implement `test-all-stages.ts`
- [ ] Update package.json scripts

### Phase 6: Documentation
- [ ] Update README with new commands
- [ ] Add examples to INTEGRATED_TESTING_STRATEGY.md
- [ ] Create developer guide for adding new checks

---

## Benefits of This Approach

1. **Single command per stage**: `npm run test:stage:2` runs everything
2. **Clear failure reporting**: Immediately know which check blocked the stage
3. **Structured output**: JSON results for CI/CD automation
4. **Progressive execution**: Fails fast on first blocker
5. **Audit trail**: Timestamped results saved to reports/
6. **Easy debugging**: Each check is isolated and testable

---

## Future Enhancements

### CI/CD Integration
```yaml
# .github/workflows/test.yml
- name: Run current stage tests
  run: npm run test:current

- name: Upload stage results
  uses: actions/upload-artifact@v3
  with:
    name: stage-results
    path: reports/stage_*_result.json
```

### Dashboard Generation
```typescript
// Generate HTML dashboard from stage results
function generateDashboard() {
  const stages = [1, 2, 3, 4, 5];
  const results = stages.map(s =>
    JSON.parse(readFileSync(`reports/stage_${s}_result.json`))
  );

  // Create HTML visualization of stage status
  // Show progress bar, check details, blockers, etc.
}
```

### Auto-Retry on Transient Failures
```typescript
async function runWithRetry(checkFn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await checkFn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`Retry ${i + 1}/${maxRetries}...`);
      await sleep(1000 * (i + 1));
    }
  }
}
```

---

## Summary

This guide provides the blueprint for implementing unified stage test runners. The key design principles:

1. **Progressive validation**: Component health → Extraction quality
2. **Fail fast**: Stop at first blocker, report clearly
3. **Structured output**: Machine-readable results
4. **Single command**: One command per stage
5. **Clear progression**: Pass Stage N before starting Stage N+1

Implementation can proceed incrementally:
- Start with Stages 1-2 (current focus)
- Add Stages 3-5 as development progresses
- Enhance with CI/CD integration and dashboards later

**Next step**: Implement `scripts/stages/common.ts` and `scripts/stages/test-stage-1.ts` to start using the new system.
