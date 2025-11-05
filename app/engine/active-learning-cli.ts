/**
 * Active Learning CLI Interface
 *
 * Provides an interactive command-line interface for user feedback.
 * Users can confirm/reject entity candidates and provide corrections.
 */

import * as readline from 'readline';
import type { UncertaintyScore, UserFeedback } from './active-learning';

/**
 * Create readline interface for user input
 */
function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Prompt user for yes/no confirmation
 */
async function askYesNo(rl: readline.Interface, question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

/**
 * Prompt user for text input
 */
async function askText(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${question}: `, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Interactive CLI feedback provider
 *
 * Asks user to confirm/reject each candidate one by one.
 */
export async function interactiveCLIFeedback(
  candidates: UncertaintyScore[],
  entityType: string
): Promise<UserFeedback[]> {
  const feedback: UserFeedback[] = [];
  const rl = createInterface();

  console.log();
  console.log('='.repeat(80));
  console.log(`ACTIVE LEARNING: Review ${entityType} Candidates`);
  console.log('='.repeat(80));
  console.log();
  console.log(`Found ${candidates.length} uncertain candidates that need your confirmation.`);
  console.log();

  for (let i = 0; i < candidates.length; i++) {
    const score = candidates[i];
    const { entity, pattern, context } = score.candidate;

    console.log('-'.repeat(80));
    console.log(`Candidate ${i + 1}/${candidates.length}`);
    console.log();
    console.log(`  Entity: "${entity}"`);
    console.log(`  Type: ${entityType}`);
    console.log(`  Pattern: "${pattern.template}"`);
    console.log(`  Uncertainty: ${score.uncertainty.toFixed(2)}`);
    console.log(`  Reasons: ${score.reasons.join(', ')}`);
    console.log();
    console.log(`  Context: "...${context}..."`);
    console.log();

    // Ask user if this is a correct entity
    const isCorrect = await askYesNo(rl, `  Is "${entity}" a valid ${entityType}?`);

    if (isCorrect) {
      feedback.push({
        entity,
        is_correct: true
      });
      console.log(`  ✅ Confirmed: "${entity}"`);
    } else {
      // Ask if they want to provide the correct type or just reject
      const provideCorrection = await askYesNo(rl, `  Do you want to specify the correct type?`);

      if (provideCorrection) {
        const correctType = await askText(rl, `  What is the correct type for "${entity}"?`);
        feedback.push({
          entity,
          is_correct: false,
          correct_type: correctType
        });
        console.log(`  ⚠️  Rejected: "${entity}" (correct type: ${correctType})`);
      } else {
        feedback.push({
          entity,
          is_correct: false
        });
        console.log(`  ❌ Rejected: "${entity}"`);
      }
    }

    console.log();
  }

  rl.close();

  console.log('='.repeat(80));
  console.log('Feedback Summary:');
  console.log(`  Confirmed: ${feedback.filter(f => f.is_correct).length}`);
  console.log(`  Rejected: ${feedback.filter(f => !f.is_correct).length}`);
  console.log('='.repeat(80));
  console.log();

  return feedback;
}

/**
 * Batch CLI feedback provider
 *
 * Shows all candidates at once, then asks for a single confirmation.
 * Faster for users who want to quickly accept/reject all.
 */
export async function batchCLIFeedback(
  candidates: UncertaintyScore[],
  entityType: string
): Promise<UserFeedback[]> {
  const rl = createInterface();

  console.log();
  console.log('='.repeat(80));
  console.log(`ACTIVE LEARNING: Review ${entityType} Candidates (Batch Mode)`);
  console.log('='.repeat(80));
  console.log();
  console.log(`Found ${candidates.length} uncertain candidates:`);
  console.log();

  // Show all candidates
  candidates.forEach((score, i) => {
    console.log(`${i + 1}. ${score.candidate.entity}`);
    console.log(`   Pattern: "${score.candidate.pattern.template}"`);
    console.log(`   Uncertainty: ${score.uncertainty.toFixed(2)} - ${score.reasons.join(', ')}`);
    console.log();
  });

  // Ask user to provide comma-separated list of correct entities
  const correctEntities = await askText(
    rl,
    'Enter numbers of CORRECT entities (comma-separated, or "all" to accept all)'
  );

  rl.close();

  const feedback: UserFeedback[] = [];

  if (correctEntities.toLowerCase().trim() === 'all') {
    // Accept all
    feedback.push(...candidates.map(s => ({
      entity: s.candidate.entity,
      is_correct: true
    })));
  } else {
    // Parse user input
    const correctIndices = new Set(
      correctEntities
        .split(',')
        .map(s => parseInt(s.trim()) - 1)
        .filter(n => !isNaN(n) && n >= 0 && n < candidates.length)
    );

    candidates.forEach((score, i) => {
      feedback.push({
        entity: score.candidate.entity,
        is_correct: correctIndices.has(i)
      });
    });
  }

  console.log();
  console.log('='.repeat(80));
  console.log('Feedback Summary:');
  console.log(`  Confirmed: ${feedback.filter(f => f.is_correct).length}`);
  console.log(`  Rejected: ${feedback.filter(f => !f.is_correct).length}`);
  console.log('='.repeat(80));
  console.log();

  return feedback;
}

/**
 * Silent feedback provider (auto-accept top N by confidence)
 *
 * Useful for automated testing or when user wants to skip confirmation.
 * Accepts candidates with uncertainty below threshold.
 */
export function createSilentFeedback(options: {
  accept_threshold?: number;  // Auto-accept if uncertainty < threshold
} = {}) {
  const { accept_threshold = 0.5 } = options;

  return async (
    candidates: UncertaintyScore[],
    entityType: string
  ): Promise<UserFeedback[]> => {
    console.log(`[SILENT-FEEDBACK] Auto-reviewing ${candidates.length} candidates...`);

    const feedback = candidates.map(score => ({
      entity: score.candidate.entity,
      is_correct: score.uncertainty < accept_threshold,
      notes: `Auto-${score.uncertainty < accept_threshold ? 'accepted' : 'rejected'} (uncertainty: ${score.uncertainty.toFixed(2)})`
    }));

    const confirmed = feedback.filter(f => f.is_correct).length;
    const rejected = feedback.filter(f => !f.is_correct).length;

    console.log(`[SILENT-FEEDBACK] Confirmed: ${confirmed}, Rejected: ${rejected}`);

    return feedback;
  };
}
