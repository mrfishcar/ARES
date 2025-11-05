/**
 * Active Learning Module (Phase 3)
 *
 * Implements human-in-the-loop entity confirmation with minimal labeling effort.
 *
 * Workflow:
 * 1. Bootstrap patterns from seeds → get candidates
 * 2. Score candidates by uncertainty (which need confirmation?)
 * 3. Ask user to confirm top-N uncertain candidates
 * 4. Re-bootstrap with confirmed entities → better patterns
 * 5. Repeat until patterns stabilize
 *
 * Benefits:
 * - Minimal labeling (20 samples vs 100+)
 * - Focus on uncertain cases (not obvious ones)
 * - Continuous improvement
 * - Reduces false positives
 */

import type { PatternMatch, Pattern, SeedEntity } from './bootstrap';
import { bootstrapPatterns } from './bootstrap';
import type { PatternLibrary } from './pattern-library';
import { addPatterns, savePatternLibrary } from './pattern-library';

/**
 * Uncertainty score for a candidate entity
 */
export interface UncertaintyScore {
  candidate: PatternMatch;
  uncertainty: number;        // 0-1, higher = more uncertain
  reasons: string[];          // Why this candidate is uncertain
}

/**
 * User feedback on a candidate
 */
export interface UserFeedback {
  entity: string;
  is_correct: boolean;        // User confirmed entity is correct
  correct_type?: string;      // If wrong type, what is the correct type?
  notes?: string;             // Optional user notes
}

/**
 * Active learning iteration result
 */
export interface ActiveLearningIteration {
  iteration: number;
  patterns_before: number;
  patterns_after: number;
  candidates_reviewed: number;
  confirmed: string[];
  rejected: string[];
  patterns: Pattern[];
  new_candidates: PatternMatch[];
}

/**
 * Calculate uncertainty score for a candidate entity
 *
 * Higher uncertainty means more likely to need user confirmation.
 *
 * Factors:
 * - Low pattern confidence
 * - Pattern has low extraction count (rarely used)
 * - Entity appears in only one context
 * - Conflicting patterns (same entity, different types)
 */
export function calculateUncertainty(
  candidate: PatternMatch,
  allCandidates: PatternMatch[]
): UncertaintyScore {
  const reasons: string[] = [];
  let uncertainty = 0;

  // Factor 1: Low pattern confidence
  if (candidate.confidence < 0.5) {
    uncertainty += 0.3;
    reasons.push(`Low pattern confidence (${candidate.confidence.toFixed(2)})`);
  } else if (candidate.confidence < 0.8) {
    uncertainty += 0.15;
    reasons.push(`Medium pattern confidence (${candidate.confidence.toFixed(2)})`);
  }

  // Factor 2: Pattern has low extraction count
  if (candidate.pattern.extractionCount < 3) {
    uncertainty += 0.25;
    reasons.push(`Pattern rarely used (${candidate.pattern.extractionCount} extractions)`);
  } else if (candidate.pattern.extractionCount < 5) {
    uncertainty += 0.1;
    reasons.push(`Pattern moderately used (${candidate.pattern.extractionCount} extractions)`);
  }

  // Factor 3: Entity appears in multiple conflicting patterns
  const sameEntityCandidates = allCandidates.filter(
    c => c.entity.toLowerCase() === candidate.entity.toLowerCase()
  );

  if (sameEntityCandidates.length > 1) {
    const uniquePatterns = new Set(sameEntityCandidates.map(c => c.pattern.template));
    if (uniquePatterns.size > 1) {
      uncertainty += 0.2;
      reasons.push(`Multiple conflicting patterns (${uniquePatterns.size} patterns)`);
    }
  }

  // Factor 4: Entity is very short (likely a false positive)
  if (candidate.entity.length < 4) {
    uncertainty += 0.15;
    reasons.push('Very short entity name');
  }

  // Normalize uncertainty to [0, 1]
  uncertainty = Math.min(1, uncertainty);

  return {
    candidate,
    uncertainty,
    reasons
  };
}

/**
 * Rank candidates by uncertainty (highest first)
 *
 * Returns candidates that most need user confirmation.
 */
export function rankByUncertainty(
  candidates: PatternMatch[],
  limit?: number
): UncertaintyScore[] {
  const scored = candidates.map(c => calculateUncertainty(c, candidates));

  // Sort by uncertainty (highest first)
  scored.sort((a, b) => b.uncertainty - a.uncertainty);

  return limit ? scored.slice(0, limit) : scored;
}

/**
 * Request user feedback on uncertain candidates
 *
 * This function should be implemented by the caller (CLI, UI, etc.)
 * to prompt the user for confirmation.
 *
 * Default implementation: auto-accept all (for testing)
 */
export type UserFeedbackProvider = (
  candidates: UncertaintyScore[],
  entityType: string
) => Promise<UserFeedback[]>;

/**
 * Default feedback provider (auto-accept for testing)
 */
export const autoAcceptFeedback: UserFeedbackProvider = async (
  candidates: UncertaintyScore[],
  entityType: string
): Promise<UserFeedback[]> => {
  return candidates.map(c => ({
    entity: c.candidate.entity,
    is_correct: true,
    notes: 'Auto-accepted for testing'
  }));
};

/**
 * Run one iteration of active learning
 *
 * Steps:
 * 1. Bootstrap patterns from current seeds
 * 2. Rank candidates by uncertainty
 * 3. Get user feedback on top-N candidates
 * 4. Add confirmed entities to seeds
 * 5. Re-bootstrap with enriched seeds
 *
 * Returns updated patterns and new candidates.
 */
export async function runActiveLearningIteration(
  seeds: SeedEntity,
  corpus: string[],
  feedbackProvider: UserFeedbackProvider,
  options: {
    max_candidates_to_review?: number;  // How many to ask user about
    uncertainty_threshold?: number;      // Only review if uncertainty > threshold
  } = {}
): Promise<ActiveLearningIteration> {
  const {
    max_candidates_to_review = 10,
    uncertainty_threshold = 0.3
  } = options;

  // Step 1: Bootstrap patterns from current seeds
  const initialResult = bootstrapPatterns(seeds, corpus);

  console.log(`[ACTIVE-LEARNING] Initial bootstrapping:`);
  console.log(`  Patterns learned: ${initialResult.patterns.length}`);
  console.log(`  Candidates found: ${initialResult.candidates.length}`);

  if (initialResult.candidates.length === 0) {
    console.log(`[ACTIVE-LEARNING] No candidates found - stopping iteration`);
    return {
      iteration: 1,
      patterns_before: initialResult.patterns.length,
      patterns_after: initialResult.patterns.length,
      candidates_reviewed: 0,
      confirmed: [],
      rejected: [],
      patterns: initialResult.patterns,
      new_candidates: []
    };
  }

  // Step 2: Rank candidates by uncertainty
  const uncertainCandidates = rankByUncertainty(initialResult.candidates)
    .filter(s => s.uncertainty >= uncertainty_threshold)
    .slice(0, max_candidates_to_review);

  console.log(`[ACTIVE-LEARNING] Uncertain candidates: ${uncertainCandidates.length}`);

  if (uncertainCandidates.length === 0) {
    console.log(`[ACTIVE-LEARNING] No uncertain candidates - patterns are stable!`);
    return {
      iteration: 1,
      patterns_before: initialResult.patterns.length,
      patterns_after: initialResult.patterns.length,
      candidates_reviewed: 0,
      confirmed: [],
      rejected: [],
      patterns: initialResult.patterns,
      new_candidates: initialResult.candidates
    };
  }

  // Step 3: Get user feedback
  console.log(`[ACTIVE-LEARNING] Requesting user feedback on ${uncertainCandidates.length} candidates...`);
  const feedback = await feedbackProvider(uncertainCandidates, seeds.type);

  // Step 4: Process feedback
  const confirmed = feedback
    .filter(f => f.is_correct)
    .map(f => f.entity);

  const rejected = feedback
    .filter(f => !f.is_correct)
    .map(f => f.entity);

  console.log(`[ACTIVE-LEARNING] Feedback received:`);
  console.log(`  Confirmed: ${confirmed.length}`);
  console.log(`  Rejected: ${rejected.length}`);

  // Step 5: Re-bootstrap with confirmed entities
  const enrichedSeeds: SeedEntity = {
    type: seeds.type,
    examples: [...seeds.examples, ...confirmed]
  };

  console.log(`[ACTIVE-LEARNING] Re-bootstrapping with ${enrichedSeeds.examples.length} seeds (was ${seeds.examples.length})...`);
  const refinedResult = bootstrapPatterns(enrichedSeeds, corpus);

  console.log(`[ACTIVE-LEARNING] Refined bootstrapping:`);
  console.log(`  Patterns learned: ${refinedResult.patterns.length} (was ${initialResult.patterns.length})`);
  console.log(`  Candidates found: ${refinedResult.candidates.length} (was ${initialResult.candidates.length})`);

  return {
    iteration: 1,
    patterns_before: initialResult.patterns.length,
    patterns_after: refinedResult.patterns.length,
    candidates_reviewed: uncertainCandidates.length,
    confirmed,
    rejected,
    patterns: refinedResult.patterns,
    new_candidates: refinedResult.candidates
  };
}

/**
 * Run multiple iterations of active learning until convergence
 *
 * Convergence criteria:
 * - No new candidates found
 * - No uncertain candidates above threshold
 * - Max iterations reached
 */
export async function runActiveLearningLoop(
  seeds: SeedEntity,
  corpus: string[],
  feedbackProvider: UserFeedbackProvider,
  options: {
    max_iterations?: number;
    max_candidates_per_iteration?: number;
    uncertainty_threshold?: number;
    convergence_threshold?: number;  // Stop if < N new candidates
  } = {}
): Promise<{
  iterations: ActiveLearningIteration[];
  final_seeds: SeedEntity;
  final_patterns: Pattern[];
  total_confirmed: number;
  total_rejected: number;
}> {
  const {
    max_iterations = 5,
    max_candidates_per_iteration = 10,
    uncertainty_threshold = 0.3,
    convergence_threshold = 2
  } = options;

  console.log(`[ACTIVE-LEARNING] Starting active learning loop:`);
  console.log(`  Max iterations: ${max_iterations}`);
  console.log(`  Candidates per iteration: ${max_candidates_per_iteration}`);
  console.log(`  Uncertainty threshold: ${uncertainty_threshold}`);
  console.log();

  const iterations: ActiveLearningIteration[] = [];
  let currentSeeds = seeds;
  let totalConfirmed = 0;
  let totalRejected = 0;

  for (let i = 0; i < max_iterations; i++) {
    console.log(`[ACTIVE-LEARNING] === Iteration ${i + 1}/${max_iterations} ===`);

    const iteration = await runActiveLearningIteration(
      currentSeeds,
      corpus,
      feedbackProvider,
      {
        max_candidates_to_review: max_candidates_per_iteration,
        uncertainty_threshold
      }
    );

    iteration.iteration = i + 1;
    iterations.push(iteration);

    totalConfirmed += iteration.confirmed.length;
    totalRejected += iteration.rejected.length;

    // Update seeds with confirmed entities
    currentSeeds = {
      type: seeds.type,
      examples: [...currentSeeds.examples, ...iteration.confirmed]
    };

    // Check convergence
    if (iteration.confirmed.length < convergence_threshold) {
      console.log(`[ACTIVE-LEARNING] Converged! (< ${convergence_threshold} new confirmations)`);
      break;
    }

    console.log();
  }

  console.log(`[ACTIVE-LEARNING] Active learning complete!`);
  console.log(`  Total iterations: ${iterations.length}`);
  console.log(`  Total confirmed: ${totalConfirmed}`);
  console.log(`  Total rejected: ${totalRejected}`);
  console.log(`  Final seeds: ${currentSeeds.examples.length} (was ${seeds.examples.length})`);

  return {
    iterations,
    final_seeds: currentSeeds,
    final_patterns: iterations[iterations.length - 1]?.patterns || [],
    total_confirmed: totalConfirmed,
    total_rejected: totalRejected
  };
}

/**
 * Update pattern library with active learning results
 */
export function updateLibraryWithActiveLearning(
  library: PatternLibrary,
  entityType: string,
  learningResult: Awaited<ReturnType<typeof runActiveLearningLoop>>
): void {
  console.log(`[ACTIVE-LEARNING] Updating pattern library...`);

  // Add refined patterns to library
  addPatterns(
    library,
    entityType,
    learningResult.final_patterns,
    learningResult.final_seeds.examples
  );

  // Update metadata with active learning stats
  if (!library.metadata.notes) {
    library.metadata.notes = '';
  }

  library.metadata.notes += `\n\nActive Learning (${new Date().toISOString()}):\n`;
  library.metadata.notes += `- Iterations: ${learningResult.iterations.length}\n`;
  library.metadata.notes += `- Confirmed entities: ${learningResult.total_confirmed}\n`;
  library.metadata.notes += `- Rejected entities: ${learningResult.total_rejected}\n`;
  library.metadata.notes += `- Final seeds: ${learningResult.final_seeds.examples.length}\n`;

  console.log(`[ACTIVE-LEARNING] Library updated successfully`);
}
