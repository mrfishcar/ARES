/**
 * Salience-Based Pronoun Resolver
 *
 * Maintains a rolling salience stack of entity mentions and resolves
 * pronouns to entities using recency, grammatical role, and gender matching.
 *
 * Key principles:
 * - Conservative: returns UNRESOLVED when ambiguous
 * - Deterministic: same input → same output
 * - Auditable: full candidate list available for debugging
 * - PERSON-only: v1 focuses on personal pronouns → PERSON entities
 *
 * Based on centering theory and BookNLP's salience heuristics.
 *
 * @module ir/salience-resolver
 */

import type { EntitySpan, ParsedSentence, Token } from './predicate-extractor';

// =============================================================================
// TYPES
// =============================================================================

export interface SalienceEntry {
  entityId: string;
  name: string;
  gender: 'male' | 'female' | 'neutral' | 'unknown';
  number: 'singular' | 'plural';
  lastMentionPos: number;
  lastMentionSentence: number;
  salience: number;
  grammaticalRole: 'subject' | 'object' | 'other';
  entityType?: string;
}

export type ResolutionMethod = 'salience' | 'gender-unique' | 'unresolved';

export type UnresolvedReason =
  | 'no_candidates'
  | 'ambiguous'
  | 'too_far'
  | 'gender_mismatch'
  | 'number_mismatch';

export interface ResolvedPronoun {
  pronounText: string;
  pronounStart: number;
  pronounEnd: number;
  sentenceIndex: number;
  resolvedEntityId: string | null;
  resolvedName: string | null;
  confidence: number;
  method: ResolutionMethod;
  unresolvedReason?: UnresolvedReason;
  candidates: SalienceEntry[];
}

export interface SalienceConfig {
  /** Max character distance for candidate consideration (default: 500) */
  maxRecencyWindow: number;
  /** Weight for subject grammatical role (default: 3.0) */
  subjectWeight: number;
  /** Weight for object grammatical role (default: 2.0) */
  objectWeight: number;
  /** Weight for other grammatical roles (default: 1.0) */
  otherWeight: number;
  /** Salience decay factor per sentence (default: 0.8) */
  sentenceDecayFactor: number;
  /** Salience decay factor at paragraph boundaries (default: 0.4) */
  paragraphDecayFactor: number;
  /** Min ratio between top candidate and second for clear winner (default: 1.5) */
  ambiguityThreshold: number;
  /** Paragraph boundary behavior: 'decay' or 'reset' (default: 'decay') */
  paragraphBoundary: 'decay' | 'reset';
  /** Only resolve pronouns to PERSON entities (default: true) */
  personOnly: boolean;
}

const DEFAULT_CONFIG: SalienceConfig = {
  maxRecencyWindow: 500,
  subjectWeight: 3.0,
  objectWeight: 2.0,
  otherWeight: 1.0,
  sentenceDecayFactor: 0.8,
  paragraphDecayFactor: 0.4,
  ambiguityThreshold: 1.5,
  paragraphBoundary: 'decay',
  personOnly: true,
};

// =============================================================================
// PRONOUN DATA
// =============================================================================

interface PronounInfo {
  gender: 'male' | 'female' | 'neutral';
  number: 'singular' | 'plural';
}

const PERSONAL_PRONOUNS: Record<string, PronounInfo> = {
  // Male singular
  'he': { gender: 'male', number: 'singular' },
  'him': { gender: 'male', number: 'singular' },
  'his': { gender: 'male', number: 'singular' },
  'himself': { gender: 'male', number: 'singular' },
  // Female singular
  'she': { gender: 'female', number: 'singular' },
  'her': { gender: 'female', number: 'singular' },
  'hers': { gender: 'female', number: 'singular' },
  'herself': { gender: 'female', number: 'singular' },
  // Neutral/plural
  'they': { gender: 'neutral', number: 'plural' },
  'them': { gender: 'neutral', number: 'plural' },
  'their': { gender: 'neutral', number: 'plural' },
  'theirs': { gender: 'neutral', number: 'plural' },
  'themselves': { gender: 'neutral', number: 'plural' },
  // Singular they (treated as neutral singular)
  'themself': { gender: 'neutral', number: 'singular' },
};

// =============================================================================
// GENDER INFERENCE
// =============================================================================

const MALE_NAMES = new Set([
  'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph',
  'thomas', 'charles', 'christopher', 'daniel', 'matthew', 'anthony', 'mark',
  'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian',
  'george', 'edward', 'ronald', 'timothy', 'jason', 'jeffrey', 'ryan', 'jacob',
  'marcus', 'henry', 'peter', 'jack', 'harry', 'arthur', 'barty', 'preston',
  'tom', 'benjamin', 'samuel', 'alexander', 'nicholas', 'tyler', 'dylan',
  'nathan', 'zachary', 'adam', 'justin', 'evan', 'brandon', 'aaron', 'patrick',
  'luke', 'jordan', 'kyle', 'caleb', 'hunter', 'austin', 'ethan', 'noah',
  'sullivan', 'foster', 'chen', 'david', 'marcus',
]);

const FEMALE_NAMES = new Set([
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan',
  'jessica', 'sarah', 'karen', 'nancy', 'lisa', 'betty', 'margaret', 'sandra',
  'ashley', 'dorothy', 'kimberly', 'emily', 'donna', 'michelle', 'carol',
  'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura',
  'kelly', 'rachel', 'emma', 'olivia', 'lily', 'sophia', 'anna', 'grace',
  'martha', 'jennifer', 'patricia', 'maine', 'helen', 'ruth', 'alice',
  'catherine', 'diana', 'julia', 'victoria', 'claire', 'hannah', 'natalie',
]);

/**
 * Infer gender from entity name using heuristics.
 */
export function inferGender(name: string): 'male' | 'female' | 'neutral' | 'unknown' {
  const nameLower = name.toLowerCase();
  const firstName = nameLower.split(/\s+/)[0];

  // Check title prefixes
  if (nameLower.startsWith('mr.') || nameLower.startsWith('mr ')) return 'male';
  if (nameLower.startsWith('mrs.') || nameLower.startsWith('mrs ') ||
      nameLower.startsWith('ms.') || nameLower.startsWith('ms ') ||
      nameLower.startsWith('miss ')) return 'female';

  // Check name lists
  if (MALE_NAMES.has(firstName)) return 'male';
  if (FEMALE_NAMES.has(firstName)) return 'female';

  return 'unknown';
}

// =============================================================================
// GRAMMATICAL ROLE HELPER
// =============================================================================

/**
 * Infer grammatical role from dependency label.
 */
export function getGrammaticalRole(depLabel: string): 'subject' | 'object' | 'other' {
  const label = depLabel.toLowerCase();

  // Subject relations
  if (label === 'nsubj' || label === 'nsubjpass' || label === 'csubj' || label === 'csubjpass') {
    return 'subject';
  }

  // Object relations
  if (label === 'dobj' || label === 'iobj' || label === 'pobj' || label === 'obj') {
    return 'object';
  }

  return 'other';
}

// =============================================================================
// SALIENCE RESOLVER CLASS
// =============================================================================

export class SalienceResolver {
  private entries: SalienceEntry[] = [];
  private config: SalienceConfig;
  private currentSentence: number = 0;

  constructor(config: Partial<SalienceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register an entity mention.
   */
  mention(
    entityId: string,
    name: string,
    pos: number,
    sentenceIndex: number,
    role: 'subject' | 'object' | 'other',
    entityType?: string
  ): void {
    // Skip non-PERSON if personOnly is enabled
    if (this.config.personOnly && entityType && entityType !== 'PERSON') {
      return;
    }

    const weight = this.getRoleWeight(role);
    const gender = inferGender(name);

    const existing = this.entries.find(e => e.entityId === entityId);

    if (existing) {
      // Update existing entry
      existing.lastMentionPos = pos;
      existing.lastMentionSentence = sentenceIndex;
      existing.salience += weight;
      existing.grammaticalRole = role;
      if (gender !== 'unknown') {
        existing.gender = gender;
      }
    } else {
      // Add new entry
      this.entries.push({
        entityId,
        name,
        gender,
        number: 'singular',
        lastMentionPos: pos,
        lastMentionSentence: sentenceIndex,
        salience: weight,
        grammaticalRole: role,
        entityType,
      });
    }

    // Keep sorted by salience (descending) for deterministic results
    this.entries.sort((a, b) => b.salience - a.salience);
    this.currentSentence = sentenceIndex;
  }

  /**
   * Attempt to resolve a pronoun.
   */
  resolve(
    pronoun: string,
    pos: number,
    sentenceIndex: number
  ): ResolvedPronoun {
    const pronounLower = pronoun.toLowerCase();
    const pronounInfo = PERSONAL_PRONOUNS[pronounLower];

    const baseResult: Omit<ResolvedPronoun, 'resolvedEntityId' | 'resolvedName' | 'confidence' | 'method' | 'candidates'> = {
      pronounText: pronoun,
      pronounStart: pos,
      pronounEnd: pos + pronoun.length,
      sentenceIndex,
    };

    // Not a personal pronoun we handle
    if (!pronounInfo) {
      return {
        ...baseResult,
        resolvedEntityId: null,
        resolvedName: null,
        confidence: 0,
        method: 'unresolved',
        unresolvedReason: 'no_candidates',
        candidates: [],
      };
    }

    // Filter candidates by constraints
    const candidates = this.entries.filter(entry => {
      // Recency check
      if (pos - entry.lastMentionPos > this.config.maxRecencyWindow) {
        return false;
      }

      // Gender match (neutral pronouns like 'they' match any)
      if (pronounInfo.gender !== 'neutral' && entry.gender !== 'unknown') {
        if (pronounInfo.gender !== entry.gender) {
          return false;
        }
      }

      return true;
    });

    // No candidates
    if (candidates.length === 0) {
      // Check if we have entries but they're too far
      const anyEntries = this.entries.length > 0;
      const tooFar = anyEntries && this.entries.every(e => pos - e.lastMentionPos > this.config.maxRecencyWindow);
      const genderMismatch = anyEntries && !tooFar;

      return {
        ...baseResult,
        resolvedEntityId: null,
        resolvedName: null,
        confidence: 0,
        method: 'unresolved',
        unresolvedReason: tooFar ? 'too_far' : (genderMismatch ? 'gender_mismatch' : 'no_candidates'),
        candidates: [...this.entries],
      };
    }

    // Exactly one candidate - gender-unique resolution
    if (candidates.length === 1) {
      return {
        ...baseResult,
        resolvedEntityId: candidates[0].entityId,
        resolvedName: candidates[0].name,
        confidence: 0.85,
        method: 'gender-unique',
        candidates: [...candidates],
      };
    }

    // Multiple candidates - use salience
    const sorted = [...candidates].sort((a, b) => b.salience - a.salience);
    const top = sorted[0];
    const second = sorted[1];

    // Check ambiguity threshold
    if (top.salience >= second.salience * this.config.ambiguityThreshold) {
      return {
        ...baseResult,
        resolvedEntityId: top.entityId,
        resolvedName: top.name,
        confidence: 0.75,
        method: 'salience',
        candidates: [...sorted],
      };
    }

    // Too ambiguous
    return {
      ...baseResult,
      resolvedEntityId: null,
      resolvedName: null,
      confidence: 0,
      method: 'unresolved',
      unresolvedReason: 'ambiguous',
      candidates: [...sorted],
    };
  }

  /**
   * Decay salience (call at sentence boundaries).
   */
  advanceSentence(): void {
    for (const entry of this.entries) {
      entry.salience *= this.config.sentenceDecayFactor;
    }
    this.pruneWeakEntries();
    this.currentSentence++;
  }

  /**
   * Handle paragraph boundary (stronger decay or reset).
   */
  advanceParagraph(): void {
    if (this.config.paragraphBoundary === 'reset') {
      this.reset();
    } else {
      for (const entry of this.entries) {
        entry.salience *= this.config.paragraphDecayFactor;
      }
      this.pruneWeakEntries();
    }
  }

  /**
   * Get current state (for debugging/audit).
   */
  getState(): SalienceEntry[] {
    return [...this.entries];
  }

  /**
   * Reset for new document/scene.
   */
  reset(): void {
    this.entries = [];
    this.currentSentence = 0;
  }

  private getRoleWeight(role: 'subject' | 'object' | 'other'): number {
    switch (role) {
      case 'subject': return this.config.subjectWeight;
      case 'object': return this.config.objectWeight;
      default: return this.config.otherWeight;
    }
  }

  private pruneWeakEntries(): void {
    const threshold = 0.3;
    this.entries = this.entries.filter(e => e.salience >= threshold);
  }
}

// =============================================================================
// PIPELINE INTEGRATION
// =============================================================================

export interface PronounResolutionStats {
  total: number;
  resolved: number;
  unresolved: number;
  byMethod: Record<ResolutionMethod, number>;
  byUnresolvedReason: Record<UnresolvedReason, number>;
}

/**
 * Find all pronouns in parsed sentences.
 */
function findPronouns(sentences: ParsedSentence[]): Array<{
  token: Token;
  sentenceIndex: number;
}> {
  const pronouns: Array<{ token: Token; sentenceIndex: number }> = [];

  for (const sentence of sentences) {
    for (const token of sentence.tokens) {
      const textLower = token.text.toLowerCase();
      if (PERSONAL_PRONOUNS[textLower]) {
        pronouns.push({
          token,
          sentenceIndex: sentence.sentence_index,
        });
      }
    }
  }

  return pronouns;
}

/**
 * Resolve all pronouns in a document given entity spans.
 */
export function resolvePronouns(
  sentences: ParsedSentence[],
  entitySpans: EntitySpan[],
  config: Partial<SalienceConfig> = {}
): {
  resolved: ResolvedPronoun[];
  stats: PronounResolutionStats;
} {
  const resolver = new SalienceResolver(config);
  const resolved: ResolvedPronoun[] = [];

  const stats: PronounResolutionStats = {
    total: 0,
    resolved: 0,
    unresolved: 0,
    byMethod: {
      'salience': 0,
      'gender-unique': 0,
      'unresolved': 0,
    },
    byUnresolvedReason: {
      'no_candidates': 0,
      'ambiguous': 0,
      'too_far': 0,
      'gender_mismatch': 0,
      'number_mismatch': 0,
    },
  };

  // Build a map of sentence index → entity spans in that sentence
  const spansBySentence = new Map<number, EntitySpan[]>();
  for (const span of entitySpans) {
    // Find which sentence this span belongs to
    for (const sentence of sentences) {
      if (span.start >= sentence.start && span.end <= sentence.end) {
        const existing = spansBySentence.get(sentence.sentence_index) || [];
        existing.push(span);
        spansBySentence.set(sentence.sentence_index, existing);
        break;
      }
    }
  }

  // Process sentences in order
  let lastSentenceIndex = -1;

  for (const sentence of sentences) {
    // Advance sentence if needed
    if (lastSentenceIndex >= 0 && sentence.sentence_index > lastSentenceIndex) {
      resolver.advanceSentence();
    }
    lastSentenceIndex = sentence.sentence_index;

    // Register entity mentions in this sentence
    const sentenceSpans = spansBySentence.get(sentence.sentence_index) || [];
    for (const span of sentenceSpans) {
      // Find the token for this span to get grammatical role
      const token = sentence.tokens.find(t =>
        t.start_char !== undefined && t.start_char >= span.start && t.start_char < span.end
      );
      const role = token ? getGrammaticalRole(token.dep || 'other') : 'other';

      resolver.mention(
        span.entityId,
        span.name,
        span.start,
        sentence.sentence_index,
        role,
        span.type
      );
    }

    // Find and resolve pronouns in this sentence
    for (const token of sentence.tokens) {
      const textLower = token.text.toLowerCase();
      if (PERSONAL_PRONOUNS[textLower]) {
        const pos = token.start_char ?? sentence.start + token.idx;

        const result = resolver.resolve(
          token.text,
          pos,
          sentence.sentence_index
        );

        resolved.push(result);
        stats.total++;

        if (result.method === 'unresolved') {
          stats.unresolved++;
          if (result.unresolvedReason) {
            stats.byUnresolvedReason[result.unresolvedReason]++;
          }
        } else {
          stats.resolved++;
        }
        stats.byMethod[result.method]++;
      }
    }
  }

  return { resolved, stats };
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  SalienceConfig,
  SalienceEntry,
  ResolvedPronoun,
  ResolutionMethod,
  UnresolvedReason,
  PronounResolutionStats,
};
