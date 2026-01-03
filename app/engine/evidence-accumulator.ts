/**
 * Evidence Accumulator - Entity Candidate Promotion System
 *
 * Accumulates evidence for entity candidates during extraction.
 * Candidates are promoted to entities only when evidence threshold is met.
 *
 * Evidence signals:
 * - mentionCount: How many times this form appears
 * - nerLabel: spaCy's NER label (PERSON, ORG, etc.)
 * - isVerbSubject: Subject of action verbs (said, walked, went)
 * - isVerbObject: Object of verbs (saw X, told X)
 * - hasRoleWord: Nearby role words (father, doctor, professor, the X)
 * - hasTitle: Has title prefix (Dr., Mr., Mrs., Professor)
 * - corefCount: Pronoun back-references pointing to this entity
 * - vocativeCount: Direct address in dialogue ("Hello, X")
 * - isPossessive: Used in possessive ("X's father", "X's house")
 *
 * Promotion levels:
 * - DEFINITE: Strong syntactic evidence (verb subject + NER, or title + name)
 * - LIKELY: Moderate evidence (2+ mentions, or NER + role word)
 * - POSSIBLE: Weak evidence (single NER mention with some context)
 * - REJECT: Insufficient evidence (common word, no syntactic role)
 */

import type { EntityType } from './schema';

export interface MentionContext {
  text: string;           // The mention text
  nerLabel: string;       // NER label from spaCy
  start: number;          // Character offset
  end: number;

  // Syntactic context
  isVerbSubject?: boolean;   // Subject of a verb
  isVerbObject?: boolean;    // Object of a verb
  verbLemma?: string;        // The verb lemma (said, walked, etc.)

  // Surrounding context
  hasRoleWord?: boolean;     // Nearby role word (father, doctor, etc.)
  roleWord?: string;         // The actual role word
  hasTitle?: boolean;        // Has title prefix (Dr., Mr., etc.)
  title?: string;            // The title

  // Dialogue context
  isVocative?: boolean;      // Direct address in dialogue
  isInDialogue?: boolean;    // Within quoted speech

  // Coreference
  corefLinks?: number;       // Pronouns pointing to this

  // Possessive
  isPossessive?: boolean;    // "X's father" pattern
}

export interface EntityEvidence {
  // Core identity
  surfaceForm: string;         // The exact text matched
  normalizedForm: string;      // Lowercased, trimmed
  type: EntityType;            // Inferred entity type

  // Accumulated evidence
  mentions: MentionContext[];  // All mentions
  mentionCount: number;        // Total mentions

  // Evidence scores (0-1 each)
  nerScore: number;            // Strength of NER evidence
  syntaxScore: number;         // Verb subject/object evidence
  roleScore: number;           // Role word evidence
  corefScore: number;          // Coreference evidence
  vocativeScore: number;       // Vocative/dialogue evidence

  // Combined score and promotion
  evidenceScore: number;       // Weighted combination
  promotionLevel: 'definite' | 'likely' | 'possible' | 'reject';
}

// Common words that are often NER false positives
const COMMON_WORD_BLOCKLIST = new Set([
  // Exclamations mistaken for names
  'help', 'please', 'god', 'hello', 'yes', 'no', 'well', 'oh', 'ah',

  // Verbs/gerunds
  'growing', 'learning', 'littering', 'running', 'walking', 'coming', 'going',
  'calling', 'checking', 'driving', 'taking', 'making',

  // Common nouns
  'blood', 'legend', 'famous', 'gluttony', 'darkness', 'caged', 'next',
  'land', 'questions', 'sounds', 'teachers', 'animals',

  // Time/place
  'today', 'tomorrow', 'yesterday', 'here', 'there',

  // Single letters/fragments
  't', 's', 'd', 'm',
]);

// Role words that provide entity evidence
const ROLE_WORDS = new Set([
  // Family
  'father', 'mother', 'son', 'daughter', 'brother', 'sister',
  'uncle', 'aunt', 'cousin', 'grandfather', 'grandmother',
  'husband', 'wife', 'parent', 'child',

  // Professional
  'doctor', 'professor', 'teacher', 'coach', 'captain', 'general',
  'president', 'director', 'manager', 'boss', 'chief',
  'king', 'queen', 'prince', 'princess', 'lord', 'lady',

  // Social
  'friend', 'neighbor', 'colleague', 'partner', 'companion',
  'boy', 'girl', 'man', 'woman', 'person', 'stranger',

  // Occupational
  'mailman', 'driver', 'waiter', 'waitress', 'nurse', 'clerk',
  'student', 'worker', 'employee', 'owner',
]);

// Verbs that strongly indicate entity subject
const STRONG_SUBJECT_VERBS = new Set([
  'said', 'asked', 'replied', 'answered', 'shouted', 'whispered',
  'walked', 'ran', 'went', 'came', 'left', 'arrived',
  'saw', 'looked', 'watched', 'noticed', 'heard',
  'thought', 'knew', 'believed', 'felt', 'wanted',
  'took', 'gave', 'put', 'made', 'did',
]);

// Titles that indicate person names
const TITLE_PREFIXES = new Set([
  'dr', 'dr.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'miss',
  'professor', 'prof', 'prof.', 'coach', 'captain', 'general',
  'king', 'queen', 'prince', 'princess', 'lord', 'lady',
  'sir', 'dame', 'father', 'mother', 'brother', 'sister',
]);

/**
 * Evidence Accumulator - collects and scores entity candidates
 */
export class EvidenceAccumulator {
  private candidates: Map<string, EntityEvidence> = new Map();
  private fullText: string = '';

  constructor() {}

  /**
   * Set the full text for context lookups
   */
  setFullText(text: string): void {
    this.fullText = text;
  }

  /**
   * Add a mention of an entity candidate
   */
  addMention(context: MentionContext): void {
    const normalized = context.text.toLowerCase().trim();

    // Skip obvious blocklist words
    if (COMMON_WORD_BLOCKLIST.has(normalized)) {
      return;
    }

    // Skip very short forms
    if (context.text.length < 2) {
      return;
    }

    // Get or create evidence record
    let evidence = this.candidates.get(normalized);
    if (!evidence) {
      evidence = this.createEvidence(context);
      this.candidates.set(normalized, evidence);
    }

    // Add this mention
    evidence.mentions.push(context);
    evidence.mentionCount++;

    // Update scores based on new mention
    this.updateScores(evidence, context);
  }

  /**
   * Create initial evidence record for a candidate
   */
  private createEvidence(context: MentionContext): EntityEvidence {
    return {
      surfaceForm: context.text,
      normalizedForm: context.text.toLowerCase().trim(),
      type: this.inferType(context.nerLabel),
      mentions: [],
      mentionCount: 0,
      nerScore: 0,
      syntaxScore: 0,
      roleScore: 0,
      corefScore: 0,
      vocativeScore: 0,
      evidenceScore: 0,
      promotionLevel: 'reject',
    };
  }

  /**
   * Infer entity type from NER label
   */
  private inferType(nerLabel: string): EntityType {
    switch (nerLabel) {
      case 'PERSON': return 'PERSON';
      case 'ORG': return 'ORG';
      case 'GPE':
      case 'LOC':
      case 'FAC': return 'PLACE';
      case 'DATE': return 'DATE';
      case 'WORK_OF_ART': return 'WORK';
      default: return 'ITEM';
    }
  }

  /**
   * Update evidence scores based on a new mention
   */
  private updateScores(evidence: EntityEvidence, context: MentionContext): void {
    // NER score: strength based on label consistency
    if (context.nerLabel && context.nerLabel !== 'O') {
      evidence.nerScore = Math.min(1, evidence.nerScore + 0.3);
    }

    // Syntax score: verb subject/object
    if (context.isVerbSubject && context.verbLemma) {
      const verbStrength = STRONG_SUBJECT_VERBS.has(context.verbLemma) ? 0.4 : 0.2;
      evidence.syntaxScore = Math.min(1, evidence.syntaxScore + verbStrength);
    }
    if (context.isVerbObject) {
      evidence.syntaxScore = Math.min(1, evidence.syntaxScore + 0.15);
    }

    // Role score: nearby role words or titles
    if (context.hasRoleWord && context.roleWord) {
      const roleStrength = ROLE_WORDS.has(context.roleWord.toLowerCase()) ? 0.35 : 0.15;
      evidence.roleScore = Math.min(1, evidence.roleScore + roleStrength);
    }
    if (context.hasTitle) {
      evidence.roleScore = Math.min(1, evidence.roleScore + 0.4);
    }

    // Coreference score
    if (context.corefLinks && context.corefLinks > 0) {
      evidence.corefScore = Math.min(1, evidence.corefScore + (context.corefLinks * 0.1));
    }

    // Vocative score: dialogue direct address
    if (context.isVocative) {
      evidence.vocativeScore = Math.min(1, evidence.vocativeScore + 0.3);
    }

    // Calculate combined score
    this.calculateCombinedScore(evidence);
  }

  /**
   * Calculate combined evidence score and promotion level
   */
  private calculateCombinedScore(evidence: EntityEvidence): void {
    // Weighted combination
    const weights = {
      ner: 0.2,
      syntax: 0.35,  // Verb subject is strong signal
      role: 0.2,
      coref: 0.15,
      vocative: 0.1,
    };

    evidence.evidenceScore =
      (evidence.nerScore * weights.ner) +
      (evidence.syntaxScore * weights.syntax) +
      (evidence.roleScore * weights.role) +
      (evidence.corefScore * weights.coref) +
      (evidence.vocativeScore * weights.vocative);

    // Boost for multiple mentions
    if (evidence.mentionCount >= 3) {
      evidence.evidenceScore = Math.min(1, evidence.evidenceScore + 0.2);
    } else if (evidence.mentionCount >= 2) {
      evidence.evidenceScore = Math.min(1, evidence.evidenceScore + 0.1);
    }

    // Determine promotion level
    if (evidence.evidenceScore >= 0.5 ||
        (evidence.syntaxScore >= 0.4 && evidence.nerScore >= 0.3) ||
        (evidence.mentionCount >= 3 && evidence.nerScore >= 0.3)) {
      evidence.promotionLevel = 'definite';
    } else if (evidence.evidenceScore >= 0.3 ||
               evidence.mentionCount >= 2 ||
               (evidence.nerScore >= 0.3 && evidence.roleScore >= 0.2)) {
      evidence.promotionLevel = 'likely';
    } else if (evidence.nerScore >= 0.2) {
      evidence.promotionLevel = 'possible';
    } else {
      evidence.promotionLevel = 'reject';
    }
  }

  /**
   * Check if a word is in the common blocklist
   */
  isBlocklisted(text: string): boolean {
    return COMMON_WORD_BLOCKLIST.has(text.toLowerCase().trim());
  }

  /**
   * Get all accumulated evidence
   */
  getAllEvidence(): EntityEvidence[] {
    return Array.from(this.candidates.values());
  }

  /**
   * Get only promoted entities (meeting minimum threshold)
   */
  getPromotedEntities(minLevel: 'possible' | 'likely' | 'definite' = 'possible'): EntityEvidence[] {
    const levelRanks = { reject: 0, possible: 1, likely: 2, definite: 3 };
    const minRank = levelRanks[minLevel];

    return this.getAllEvidence()
      .filter(e => levelRanks[e.promotionLevel] >= minRank)
      .sort((a, b) => b.evidenceScore - a.evidenceScore);
  }

  /**
   * Get entities that should be filtered out
   */
  getRejectedEntities(): EntityEvidence[] {
    return this.getAllEvidence()
      .filter(e => e.promotionLevel === 'reject');
  }

  /**
   * Check if an entity name should be promoted
   */
  shouldPromote(name: string, minLevel: 'possible' | 'likely' | 'definite' = 'possible'): boolean {
    const normalized = name.toLowerCase().trim();
    const evidence = this.candidates.get(normalized);
    if (!evidence) return false;

    const levelRanks = { reject: 0, possible: 1, likely: 2, definite: 3 };
    return levelRanks[evidence.promotionLevel] >= levelRanks[minLevel];
  }

  /**
   * Get evidence for a specific entity
   */
  getEvidence(name: string): EntityEvidence | undefined {
    return this.candidates.get(name.toLowerCase().trim());
  }

  /**
   * Merge similar entities (typos, aliases)
   */
  mergeAliases(): void {
    const entities = this.getAllEvidence();
    const merged = new Map<string, EntityEvidence>();

    for (const entity of entities) {
      // Find if this should merge with an existing entity
      let mergeTarget: EntityEvidence | null = null;

      for (const [key, existing] of Array.from(merged.entries())) {
        if (this.shouldMerge(entity, existing)) {
          mergeTarget = existing;
          break;
        }
      }

      if (mergeTarget) {
        // Merge into existing
        this.mergeEvidence(mergeTarget, entity);
      } else {
        // Keep as separate
        merged.set(entity.normalizedForm, entity);
      }
    }

    this.candidates = merged;
  }

  /**
   * Check if two entities should be merged
   */
  private shouldMerge(a: EntityEvidence, b: EntityEvidence): boolean {
    // Same normalized form
    if (a.normalizedForm === b.normalizedForm) return true;

    // One is substring of other (e.g., "Beau" and "Beau Adams")
    const aLower = a.normalizedForm;
    const bLower = b.normalizedForm;

    if (aLower.includes(bLower) || bLower.includes(aLower)) {
      // Check they're same type
      return a.type === b.type;
    }

    // Levenshtein distance for typos (e.g., "Farrel" vs "Farrell")
    if (a.type === b.type && this.levenshtein(aLower, bLower) <= 1) {
      return true;
    }

    return false;
  }

  /**
   * Merge evidence from source into target
   */
  private mergeEvidence(target: EntityEvidence, source: EntityEvidence): void {
    // Use longer form as canonical
    if (source.surfaceForm.length > target.surfaceForm.length) {
      target.surfaceForm = source.surfaceForm;
    }

    // Combine mentions
    target.mentions.push(...source.mentions);
    target.mentionCount += source.mentionCount;

    // Take max of each score
    target.nerScore = Math.max(target.nerScore, source.nerScore);
    target.syntaxScore = Math.max(target.syntaxScore, source.syntaxScore);
    target.roleScore = Math.max(target.roleScore, source.roleScore);
    target.corefScore = Math.max(target.corefScore, source.corefScore);
    target.vocativeScore = Math.max(target.vocativeScore, source.vocativeScore);

    // Recalculate combined score
    this.calculateCombinedScore(target);
  }

  /**
   * Simple Levenshtein distance for typo detection
   */
  private levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Clear all accumulated evidence
   */
  clear(): void {
    this.candidates.clear();
    this.fullText = '';
  }

  /**
   * Debug: print summary of evidence
   */
  printSummary(): void {
    console.log('\n=== EVIDENCE ACCUMULATOR SUMMARY ===');
    const entities = this.getAllEvidence()
      .sort((a, b) => b.evidenceScore - a.evidenceScore);

    console.log(`Total candidates: ${entities.length}`);
    console.log(`Definite: ${entities.filter(e => e.promotionLevel === 'definite').length}`);
    console.log(`Likely: ${entities.filter(e => e.promotionLevel === 'likely').length}`);
    console.log(`Possible: ${entities.filter(e => e.promotionLevel === 'possible').length}`);
    console.log(`Rejected: ${entities.filter(e => e.promotionLevel === 'reject').length}`);

    console.log('\nTop entities:');
    entities.slice(0, 20).forEach(e => {
      console.log(`  [${e.promotionLevel.toUpperCase().padEnd(8)}] ${e.surfaceForm} (${e.type}) - score: ${e.evidenceScore.toFixed(2)}, mentions: ${e.mentionCount}`);
    });
  }
}

// Export singleton instance for easy use
export const evidenceAccumulator = new EvidenceAccumulator();

// Export role words and blocklist for use elsewhere
export { ROLE_WORDS, COMMON_WORD_BLOCKLIST, TITLE_PREFIXES, STRONG_SUBJECT_VERBS };
