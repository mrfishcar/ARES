/**
 * Relation Re-scorer - Phase 3
 *
 * Learned re-scoring layer for relation candidates.
 * Based on user spec:
 *   "Switch from 'pattern firehose' to candidate → learned re-scorer.
 *    Keep patterns for recall, use ML for precision."
 *
 * Provides:
 * 1. Simple logistic regression model (placeholder for ONNX)
 * 2. PR-curve threshold tuning for 80% precision target
 * 3. Training data export for offline learning
 */

import type { RelationCandidate, RelationFeatures } from './relation-features';

/**
 * Re-scorer decision
 */
export interface RescorerDecision {
  accept: boolean;              // Should this relation be accepted?
  score: number;                // Re-scored confidence (0-1)
  originalScore: number;        // Original pattern confidence
  adjustment: number;           // Delta from original
  reason: string;               // Human-readable explanation
}

/**
 * Re-scorer configuration
 */
export interface RescorerConfig {
  threshold: number;            // Acceptance threshold (0-1)
  mode: 'strict' | 'balanced' | 'lenient';
  enableCorefBoost: boolean;    // Boost relations with high coref confidence
  enableLexiconBoost: boolean;  // Boost relations matching domain lexicon
  penalizeLongDistance: boolean; // Penalize cross-paragraph relations
}

/**
 * Default configuration optimized for Stage 3 (complex fiction)
 */
export const DEFAULT_RESCORER_CONFIG: RescorerConfig = {
  threshold: 0.70,              // Target 80% precision
  mode: 'balanced',
  enableCorefBoost: true,
  enableLexiconBoost: true,
  penalizeLongDistance: true
};

/**
 * Simple logistic regression re-scorer
 * This is a placeholder for future ONNX model
 * Based on user spec: "Use a simple logistic reg (scikit/ONNX → Node via onnxruntime)"
 */
export class RelationRescorer {
  private config: RescorerConfig;
  private weights: Map<string, number>;

  constructor(config: RescorerConfig = DEFAULT_RESCORER_CONFIG) {
    this.config = config;
    this.weights = this.initializeWeights();
  }

  /**
   * Initialize feature weights
   * These are hand-tuned for now; will be replaced by trained model
   */
  private initializeWeights(): Map<string, number> {
    return new Map([
      // Pattern reliability (most important)
      ['pattern_reliability', 0.25],

      // Distance features (penalize long-range)
      ['token_distance_inv', 0.15],       // Inverse distance (closer = better)
      ['char_distance_inv', 0.10],
      ['same_sentence_bonus', 0.15],
      ['crosses_paragraph_penalty', -0.20],

      // Coref features (reward good coref)
      ['coref_chain_conf', 0.20],
      ['uses_pronoun_penalty', -0.10],    // Slight penalty for pronoun-based

      // Type features
      ['type_match_bonus', 0.10],

      // Syntactic features
      ['apposition_bonus', 0.10],
      ['negation_penalty', -0.25],        // Strong penalty for negation
      ['modal_penalty', -0.15],           // Penalty for uncertainty

      // Lexicon features
      ['lexicon_match_bonus', 0.15],

      // Salience features
      ['salience_avg', 0.10]
    ]);
  }

  /**
   * Extract numeric features from RelationFeatures
   */
  private featurizeForScoring(features: RelationFeatures): Map<string, number> {
    const numericFeatures = new Map<string, number>();

    // Pattern reliability
    numericFeatures.set('pattern_reliability', features.pattern_reliability);

    // Distance features (inverse for "closer is better")
    const tokenDistInv = 1 / (1 + features.token_distance);
    const charDistInv = 1 / (1 + features.char_distance / 100);
    numericFeatures.set('token_distance_inv', tokenDistInv);
    numericFeatures.set('char_distance_inv', charDistInv);

    // Window tier bonuses
    numericFeatures.set('same_sentence_bonus', features.window_tier === 'same_sentence' ? 1 : 0);
    numericFeatures.set('crosses_paragraph_penalty', features.crosses_paragraph ? 1 : 0);

    // Coref features
    numericFeatures.set('coref_chain_conf', features.coref_chain_conf);
    numericFeatures.set('uses_pronoun_penalty', features.uses_pronoun_resolution ? 1 : 0);

    // Type match (PERSON-PERSON for kinship, PERSON-ORG for employment, etc.)
    const typeMatch = this.typeMatchScore(features);
    numericFeatures.set('type_match_bonus', typeMatch);

    // Syntactic features
    numericFeatures.set('apposition_bonus', features.apposition_present ? 1 : 0);
    numericFeatures.set('negation_penalty', features.negation_present ? 1 : 0);
    numericFeatures.set('modal_penalty', features.modal_present ? 1 : 0);

    // Lexicon features
    numericFeatures.set('lexicon_match_bonus', features.lexicon_match_strength);

    // Salience (average of subject and object)
    const salienceAvg = (features.subj_salience + features.obj_salience) / 2;
    numericFeatures.set('salience_avg', salienceAvg);

    return numericFeatures;
  }

  /**
   * Calculate type match score
   */
  private typeMatchScore(features: RelationFeatures): number {
    const { pattern_family, subj_type, obj_type } = features;

    // Expected type combinations by pattern family
    const expectedTypes: Record<string, Array<[EntityType, EntityType]>> = {
      kinship: [['PERSON', 'PERSON']],
      social: [['PERSON', 'PERSON']],
      employment: [['PERSON', 'ORG'], ['PERSON', 'PLACE']],
      education: [['PERSON', 'ORG'], ['PERSON', 'PLACE']],
      membership: [['PERSON', 'ORG'], ['PERSON', 'PLACE']],
      location: [['PERSON', 'PLACE']],
      leadership: [['PERSON', 'ORG'], ['PERSON', 'PLACE']]
    };

    const expected = expectedTypes[pattern_family] || [];

    for (const [expectedSubj, expectedObj] of expected) {
      if (subj_type === expectedSubj && obj_type === expectedObj) {
        return 1.0;
      }
    }

    return 0.0;  // Type mismatch
  }

  /**
   * Compute logistic regression score
   * score = sigmoid(w0 + w1*f1 + w2*f2 + ... + wn*fn)
   */
  private computeScore(features: Map<string, number>): number {
    let logit = 0.0;

    for (const [featureName, featureValue] of features) {
      const weight = this.weights.get(featureName) || 0;
      logit += weight * featureValue;
    }

    // Sigmoid: 1 / (1 + exp(-logit))
    const score = 1 / (1 + Math.exp(-logit));

    return score;
  }

  /**
   * Re-score a single relation candidate
   */
  rescore(candidate: RelationCandidate): RescorerDecision {
    const numericFeatures = this.featurizeForScoring(candidate.features);
    const score = this.computeScore(numericFeatures);

    // Apply configuration-based adjustments
    let adjustedScore = score;
    const reasons: string[] = [];

    // Coref boost
    if (this.config.enableCorefBoost && candidate.features.coref_chain_conf > 0.8) {
      adjustedScore += 0.05;
      reasons.push('high coref confidence');
    }

    // Lexicon boost
    if (this.config.enableLexiconBoost && candidate.features.lexicon_match_strength > 0.8) {
      adjustedScore += 0.05;
      reasons.push('strong lexicon match');
    }

    // Long distance penalty
    if (this.config.penalizeLongDistance && candidate.features.crosses_paragraph) {
      adjustedScore -= 0.10;
      reasons.push('crosses paragraph');
    }

    // Negation veto (hard reject)
    if (candidate.features.negation_present) {
      adjustedScore = Math.min(adjustedScore, 0.40);  // Cap at 0.40
      reasons.push('negation detected');
    }

    // Clamp to [0, 1]
    adjustedScore = Math.max(0, Math.min(1, adjustedScore));

    // Acceptance decision
    const accept = adjustedScore >= this.config.threshold;

    return {
      accept,
      score: adjustedScore,
      originalScore: candidate.patternConfidence,
      adjustment: adjustedScore - candidate.patternConfidence,
      reason: reasons.length > 0 ? reasons.join(', ') : 'baseline score'
    };
  }

  /**
   * Batch re-score multiple candidates
   */
  rescoreBatch(candidates: RelationCandidate[]): Array<{
    candidate: RelationCandidate;
    decision: RescorerDecision;
  }> {
    return candidates.map(candidate => ({
      candidate,
      decision: this.rescore(candidate)
    }));
  }

  /**
   * Get statistics for tuning threshold
   */
  getStatistics(
    scoredCandidates: Array<{ candidate: RelationCandidate; decision: RescorerDecision }>,
    goldLabels?: boolean[]  // True if relation is correct
  ): {
    totalCandidates: number;
    accepted: number;
    rejected: number;
    avgScore: number;
    precision?: number;  // If gold labels provided
    recall?: number;
  } {
    const total = scoredCandidates.length;
    const accepted = scoredCandidates.filter(s => s.decision.accept).length;
    const rejected = total - accepted;
    const avgScore = scoredCandidates.reduce((sum, s) => sum + s.decision.score, 0) / total;

    const stats: any = {
      totalCandidates: total,
      accepted,
      rejected,
      avgScore
    };

    // Calculate precision/recall if gold labels provided
    if (goldLabels && goldLabels.length === total) {
      let truePositives = 0;
      let falsePositives = 0;
      let falseNegatives = 0;

      for (let i = 0; i < total; i++) {
        const isCorrect = goldLabels[i];
        const wasAccepted = scoredCandidates[i].decision.accept;

        if (wasAccepted && isCorrect) {
          truePositives++;
        } else if (wasAccepted && !isCorrect) {
          falsePositives++;
        } else if (!wasAccepted && isCorrect) {
          falseNegatives++;
        }
      }

      stats.precision = truePositives / (truePositives + falsePositives) || 0;
      stats.recall = truePositives / (truePositives + falseNegatives) || 0;
    }

    return stats;
  }

  /**
   * Tune threshold to achieve target precision
   * Based on user spec: "Optimize PR-curve threshold to meet 80% precision target"
   */
  tuneThreshold(
    candidates: RelationCandidate[],
    goldLabels: boolean[],
    targetPrecision: number = 0.80
  ): number {
    // Sort candidates by score descending
    const sorted = candidates
      .map((c, i) => ({ candidate: c, score: this.rescore(c).score, isCorrect: goldLabels[i] }))
      .sort((a, b) => b.score - a.score);

    let bestThreshold = 0.5;
    let bestF1 = 0;

    // Try different thresholds
    for (let threshold = 0.3; threshold <= 0.95; threshold += 0.05) {
      let truePositives = 0;
      let falsePositives = 0;
      let falseNegatives = 0;

      for (const item of sorted) {
        const wasAccepted = item.score >= threshold;

        if (wasAccepted && item.isCorrect) {
          truePositives++;
        } else if (wasAccepted && !item.isCorrect) {
          falsePositives++;
        } else if (!wasAccepted && item.isCorrect) {
          falseNegatives++;
        }
      }

      const precision = truePositives / (truePositives + falsePositives) || 0;
      const recall = truePositives / (truePositives + falseNegatives) || 0;
      const f1 = 2 * (precision * recall) / (precision + recall) || 0;

      // If precision meets target, optimize for F1
      if (precision >= targetPrecision && f1 > bestF1) {
        bestF1 = f1;
        bestThreshold = threshold;
      }
    }

    return bestThreshold;
  }
}

/**
 * Export training data for offline ML training
 * Based on user spec: "Train a tiny classifier for precision (scikit/ONNX)"
 */
export function exportTrainingData(
  candidates: RelationCandidate[],
  goldLabels: boolean[]
): string {
  const lines: string[] = [];

  // Header
  lines.push([
    'pattern_id',
    'pattern_family',
    'dep_path_len',
    'token_distance',
    'char_distance',
    'crosses_paragraph',
    'crosses_dialogue',
    'sentence_position',
    'subj_type',
    'obj_type',
    'subj_salience',
    'obj_salience',
    'coref_chain_conf',
    'uses_pronoun_resolution',
    'apposition_present',
    'negation_present',
    'modal_present',
    'cue_lemma',
    'lexicon_match_strength',
    'pattern_reliability',
    'window_tier',
    'label'  // Target variable
  ].join(','));

  // Data rows
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const label = goldLabels[i] ? 1 : 0;
    const features = candidate.features;

    lines.push([
      features.pattern_id,
      features.pattern_family,
      features.dep_path_len ?? '',
      features.token_distance,
      features.char_distance,
      features.crosses_paragraph ? 1 : 0,
      features.crosses_dialogue ? 1 : 0,
      features.sentence_position.toFixed(4),
      features.subj_type,
      features.obj_type,
      features.subj_salience.toFixed(4),
      features.obj_salience.toFixed(4),
      features.coref_chain_conf.toFixed(4),
      features.uses_pronoun_resolution ? 1 : 0,
      features.apposition_present ? 1 : 0,
      features.negation_present ? 1 : 0,
      features.modal_present ? 1 : 0,
      features.cue_lemma ?? '',
      features.lexicon_match_strength.toFixed(4),
      features.pattern_reliability.toFixed(4),
      features.window_tier,
      label
    ].join(','));
  }

  return lines.join('\n');
}
