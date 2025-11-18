/**
 * Meaning Layer Test Utilities
 *
 * Helper functions for testing extracted meaning without dealing with:
 * - String spans
 * - Raw text dependencies
 * - Extraction mechanics
 *
 * Focus on: "Did we extract the correct meaning?"
 */

import type { MeaningRecord } from "./schema";
import * as fs from "fs";
import * as path from "path";

/**
 * Expectation builder for meaning-based testing
 *
 * Usage:
 *   expectMeaning(actualRecords).toMatchExpected("test-name");
 *   expectMeaning(actualRecords).toContain({ subj: "Frederick", rel: "rules", obj: "Gondor" });
 */
export function expectMeaning(actualRecords: MeaningRecord[]) {
  return {
    /**
     * Match against expected JSON file
     * File should be in /expected/meaning/<test-name>.json
     */
    toMatchExpected(testName: string): void {
      const expectedPath = path.join(process.cwd(), 'expected', 'meaning', `${testName}.json`);

      if (!fs.existsSync(expectedPath)) {
        throw new Error(
          `Expected meaning file not found: ${expectedPath}\n` +
          `Create it with:\n` +
          `  mkdir -p expected/meaning\n` +
          `  echo '${JSON.stringify(toCompactFormat(actualRecords), null, 2)}' > ${expectedPath}`
        );
      }

      const expectedJson = fs.readFileSync(expectedPath, 'utf-8');
      const expected = JSON.parse(expectedJson);

      const actual = toCompactFormat(actualRecords);

      // Deep comparison
      const diff = findDifferences(expected, actual);

      if (diff.length > 0) {
        const diffReport = diff.map(d => `  - ${d}`).join('\n');
        throw new Error(
          `Meaning records don't match expected:\n${diffReport}\n\n` +
          `Expected: ${JSON.stringify(expected, null, 2)}\n\n` +
          `Actual: ${JSON.stringify(actual, null, 2)}`
        );
      }

      console.log(`✅ Meaning matches expected (${testName}): ${actualRecords.length} records`);
    },

    /**
     * Check if records contain a specific meaning
     * Partial match - only checks specified fields
     */
    toContain(partial: {
      subj?: string;
      rel?: string;
      obj?: string | null;
      quals?: any;
    }): void {
      const matches = actualRecords.filter(r => {
        if (partial.subj && r.subjectId !== partial.subj) return false;
        if (partial.rel && r.relation !== partial.rel) return false;
        if (partial.obj !== undefined && r.objectId !== partial.obj) return false;
        if (partial.quals) {
          if (!r.qualifiers) return false;
          for (const key of Object.keys(partial.quals)) {
            if ((r.qualifiers as any)[key] !== (partial.quals as any)[key]) return false;
          }
        }
        return true;
      });

      if (matches.length === 0) {
        const actualSummary = actualRecords.map(r =>
          `  ${r.subjectId} → ${r.relation} → ${r.objectId || '(none)'}`
        ).join('\n');

        throw new Error(
          `Expected to find meaning: ${JSON.stringify(partial)}\n\n` +
          `Actual records:\n${actualSummary}`
        );
      }

      console.log(`✅ Found meaning: ${JSON.stringify(partial)} (${matches.length} matches)`);
    },

    /**
     * Check that records DON'T contain a specific meaning
     */
    toNotContain(partial: {
      subj?: string;
      rel?: string;
      obj?: string | null;
    }): void {
      const matches = actualRecords.filter(r => {
        if (partial.subj && r.subjectId !== partial.subj) return false;
        if (partial.rel && r.relation !== partial.rel) return false;
        if (partial.obj !== undefined && r.objectId !== partial.obj) return false;
        return true;
      });

      if (matches.length > 0) {
        const matchSummary = matches.map(r =>
          `  ${r.subjectId} → ${r.relation} → ${r.objectId || '(none)'}`
        ).join('\n');

        throw new Error(
          `Expected NOT to find meaning: ${JSON.stringify(partial)}\n\n` +
          `But found ${matches.length} matches:\n${matchSummary}`
        );
      }

      console.log(`✅ Correctly does not contain: ${JSON.stringify(partial)}`);
    },

    /**
     * Check count of records
     */
    toHaveLength(expectedLength: number): void {
      if (actualRecords.length !== expectedLength) {
        throw new Error(
          `Expected ${expectedLength} meaning records, got ${actualRecords.length}`
        );
      }
      console.log(`✅ Has ${expectedLength} meaning records`);
    }
  };
}

/**
 * Convert MeaningRecords to compact format for comparison
 * Strips source info and focuses on semantic content
 */
function toCompactFormat(records: MeaningRecord[]): any[] {
  return records.map(r => {
    const compact: any = {
      subj: r.subjectId,
      rel: r.relation,
      obj: r.objectId || null
    };

    if (r.qualifiers && Object.keys(r.qualifiers).length > 0) {
      compact.quals = r.qualifiers;
    }

    return compact;
  });
}

/**
 * Find differences between expected and actual records
 */
function findDifferences(expected: any[], actual: any[]): string[] {
  const diffs: string[] = [];

  // Check length
  if (expected.length !== actual.length) {
    diffs.push(`Length mismatch: expected ${expected.length}, got ${actual.length}`);
  }

  // Check each record
  const maxLen = Math.max(expected.length, actual.length);
  for (let i = 0; i < maxLen; i++) {
    const exp = expected[i];
    const act = actual[i];

    if (!exp) {
      diffs.push(`Extra record at index ${i}: ${JSON.stringify(act)}`);
      continue;
    }

    if (!act) {
      diffs.push(`Missing record at index ${i}: ${JSON.stringify(exp)}`);
      continue;
    }

    // Compare fields
    if (exp.subj !== act.subj) {
      diffs.push(`Record ${i}: subject mismatch (expected: ${exp.subj}, got: ${act.subj})`);
    }

    if (exp.rel !== act.rel) {
      diffs.push(`Record ${i}: relation mismatch (expected: ${exp.rel}, got: ${act.rel})`);
    }

    if (exp.obj !== act.obj) {
      diffs.push(`Record ${i}: object mismatch (expected: ${exp.obj}, got: ${act.obj})`);
    }

    // Compare qualifiers if present
    if (exp.quals || act.quals) {
      const expQuals = JSON.stringify(exp.quals || {});
      const actQuals = JSON.stringify(act.quals || {});
      if (expQuals !== actQuals) {
        diffs.push(`Record ${i}: qualifiers mismatch (expected: ${expQuals}, got: ${actQuals})`);
      }
    }
  }

  return diffs;
}

/**
 * Create expected meaning file from actual records
 * Useful for creating test fixtures
 */
export function createExpectedMeaningFile(
  records: MeaningRecord[],
  testName: string
): void {
  const expectedDir = path.join(process.cwd(), 'expected', 'meaning');

  if (!fs.existsSync(expectedDir)) {
    fs.mkdirSync(expectedDir, { recursive: true});
  }

  const outputPath = path.join(expectedDir, `${testName}.json`);
  const compact = toCompactFormat(records);

  fs.writeFileSync(
    outputPath,
    JSON.stringify(compact, null, 2),
    'utf-8'
  );

  console.log(`📝 Created expected meaning file: ${outputPath}`);
  console.log(`   ${records.length} records`);
}
