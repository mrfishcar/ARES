/**
 * Relation Feature Extraction - Phase 2
 *
 * Extracts features from relation candidates for ML re-scoring.
 * Based on user spec:
 *   "pattern_id, dep_path_len, token_distance, crosses_paragraph, crosses_dialogue,
 *    entity_types, head/tail salience, coref_chain_conf, apposition_present,
 *    negation_present, cue_lemma, lexicon match strength, sentence_position"
 *
 * This replaces the "pattern firehose" approach with scored candidates.
 */

import type { Entity, EntityType, Relation } from './schema';
import type { ScoredCorefChain } from './coref-enhanced';

/**
 * Relation candidate with extracted features
 * Ready for ML re-scoring
 */
export interface RelationCandidate {
  // Core relation data
  subjEntityId: string;
  objEntityId: string;
  predicate: string;

  // Evidence
  evidence: {
    text: string;
    start: number;
    end: number;
    sentenceIndex: number;
  };

  // Extracted features
  features: RelationFeatures;

  // Original confidence from pattern
  patternConfidence: number;

  // Metadata
  extractor: 'dependency' | 'regex' | 'narrative';
  patternId?: string;
}

/**
 * Feature vector for relation candidates
 * Based on user's specification
 */
export interface RelationFeatures {
  // Pattern characteristics
  pattern_id: string;                // Which pattern matched (for pattern_reliability)
  pattern_family: string;            // Pattern type: kinship, employment, location, etc.
  dep_path_len: number | null;       // Dependency path length (null for regex patterns)

  // Distance features
  token_distance: number;            // Token count between subject and object
  char_distance: number;             // Character count between subject and object

  // Context features
  crosses_paragraph: boolean;        // Spans multiple paragraphs
  crosses_dialogue: boolean;         // Spans dialogue boundaries (quotes)
  sentence_position: number;         // 0-1 position within document

  // Entity features
  subj_type: EntityType;             // Subject entity type
  obj_type: EntityType;              // Object entity type
  subj_salience: number;             // Subject mention frequency (0-1)
  obj_salience: number;              // Object mention frequency (0-1)

  // Coreference features
  coref_chain_conf: number;          // Average coref confidence for entities involved
  uses_pronoun_resolution: boolean;  // Does relation rely on pronoun coref?

  // Syntactic features
  apposition_present: boolean;       // Contains appositive structure
  negation_present: boolean;         // Contains negation keywords
  modal_present: boolean;            // Contains modal verbs (may, might, could)

  // Lexical features
  cue_lemma: string | null;          // Main relation cue word (verb/noun)
  lexicon_match_strength: number;    // 0-1 score for domain lexicon match

  // Reliability features (from historical data)
  pattern_reliability: number;       // Historical precision of this pattern

  // Additional context
  window_tier: 'same_sentence' | 'same_paragraph' | 'cross_paragraph';
}

/**
 * Negation keywords
 */
const NEGATION_KEYWORDS = new Set([
  'not', 'no', 'never', 'neither', 'nor', 'nobody', 'nothing', 'nowhere',
  'hardly', 'scarcely', 'barely', "n't", 'without'
]);

/**
 * Modal verbs
 */
const MODAL_VERBS = new Set([
  'may', 'might', 'could', 'would', 'should', 'must', 'can', 'will', 'shall'
]);

/**
 * Relation cue verbs by family
 */
const RELATION_CUE_VERBS: Record<string, string[]> = {
  kinship: ['born', 'adopted', 'raised', 'parented', 'fathered', 'mothered'],
  employment: ['hired', 'employed', 'worked', 'served', 'joined', 'appointed'],
  education: ['studied', 'graduated', 'enrolled', 'attended', 'taught', 'lectured'],
  location: ['lived', 'resided', 'dwelt', 'moved', 'settled', 'inhabited'],
  membership: ['sorted', 'assigned', 'placed', 'joined', 'became', 'elected'],
  social: ['married', 'befriended', 'met', 'knew', 'loved', 'hated']
};

/**
 * Detect if text crosses paragraph boundaries
 */
function crossesParagraph(text: string, start: number, end: number): boolean {
  const span = text.slice(start, end);
  return /\n\s*\n/.test(span);
}

/**
 * Detect if text crosses dialogue boundaries (quotes)
 */
function crossesDialogue(text: string, start: number, end: number): boolean {
  const span = text.slice(start, end);
  // Count quote marks (straight and curly)
  const quoteCount = (span.match(/["""]/g) || []).length;
  // If odd number of quotes, we're crossing dialogue boundaries
  return quoteCount % 2 === 1;
}

/**
 * Detect appositive structure
 * Patterns: "X, a Y", "X, the Y of Z"
 */
function hasApposition(evidenceText: string): boolean {
  // Simple heuristic: contains comma followed by article/indefinite
  return /,\s+(a|an|the)\s+\w+/i.test(evidenceText);
}

/**
 * Detect negation in evidence text
 */
function hasNegation(evidenceText: string): boolean {
  const words = evidenceText.toLowerCase().split(/\b/);
  return words.some(word => NEGATION_KEYWORDS.has(word));
}

/**
 * Detect modal verbs in evidence text
 */
function hasModal(evidenceText: string): boolean {
  const words = evidenceText.toLowerCase().split(/\b/);
  return words.some(word => MODAL_VERBS.has(word));
}

/**
 * Extract main cue lemma (verb or noun that indicates the relation)
 */
function extractCueLemma(evidenceText: string, predicate: string): string | null {
  // Get predicate family
  const predicateLower = predicate.toLowerCase();
  let family: string | null = null;

  if (predicateLower.includes('parent') || predicateLower.includes('child') ||
      predicateLower.includes('sibling') || predicateLower.includes('married')) {
    family = 'kinship';
  } else if (predicateLower.includes('work') || predicateLower.includes('employ')) {
    family = 'employment';
  } else if (predicateLower.includes('stud') || predicateLower.includes('teach')) {
    family = 'education';
  } else if (predicateLower.includes('live') || predicateLower.includes('resid')) {
    family = 'location';
  } else if (predicateLower.includes('member') || predicateLower.includes('sorted')) {
    family = 'membership';
  } else if (predicateLower.includes('friend') || predicateLower.includes('enemy')) {
    family = 'social';
  }

  if (!family) return null;

  // Look for cue verbs from this family
  const cueVerbs = RELATION_CUE_VERBS[family] || [];
  const evidenceLower = evidenceText.toLowerCase();

  for (const verb of cueVerbs) {
    if (evidenceLower.includes(verb)) {
      return verb;
    }
  }

  return null;
}

/**
 * Calculate entity salience (mention frequency)
 * Returns 0-1 score based on how often entity appears in document
 */
function calculateEntitySalience(
  entityId: string,
  allEntities: Entity[],
  documentLength: number
): number {
  const entity = allEntities.find(e => e.id === entityId);
  if (!entity) return 0;

  // Use alias count as proxy for mention frequency
  const mentionCount = entity.aliases.length + 1;  // +1 for canonical

  // Normalize by expected frequency (5+ mentions = salient)
  return Math.min(1.0, mentionCount / 5);
}

/**
 * Get coref chain confidence for entity
 */
function getCorefChainConfidence(
  entityId: string,
  corefChains: ScoredCorefChain[]
): number {
  const chain = corefChains.find(c => c.entityId === entityId);
  return chain ? chain.confidence : 0.5;  // Default to neutral if no chain
}

/**
 * Check if relation uses pronoun resolution
 */
function usesPronounResolution(
  evidenceText: string,
  corefChains: ScoredCorefChain[]
): boolean {
  // Simple heuristic: check if evidence contains common pronouns
  const pronouns = /\b(he|she|it|they|him|her|them|his|hers|their|its)\b/i;
  if (!pronouns.test(evidenceText)) return false;

  // Check if any coref chains have pronoun mentions
  return corefChains.some(chain =>
    chain.mentions.some(m => pronouns.test(m.text))
  );
}

/**
 * Calculate window tier based on distance
 */
function getWindowTier(
  subjStart: number,
  objEnd: number,
  text: string
): 'same_sentence' | 'same_paragraph' | 'cross_paragraph' {
  const span = text.slice(subjStart, objEnd);

  // Check for sentence boundaries (periods, exclamation, question marks)
  const sentenceBoundaries = (span.match(/[.!?]+/g) || []).length;

  if (sentenceBoundaries === 0) {
    return 'same_sentence';
  }

  // Check for paragraph boundaries
  if (crossesParagraph(text, subjStart, objEnd)) {
    return 'cross_paragraph';
  }

  return 'same_paragraph';
}

/**
 * Main feature extraction function
 * Converts a relation candidate into a feature vector
 */
export function extractRelationFeatures(
  relation: Relation,
  fullText: string,
  allEntities: Entity[],
  corefChains: ScoredCorefChain[],
  patternReliability: Map<string, number>,  // Historical precision per pattern
  options: {
    subjStart?: number;
    objEnd?: number;
    depPathLen?: number;
    patternId?: string;
    patternFamily?: string;
  } = {}
): RelationFeatures {
  const evidence = relation.evidence[0];  // Use first evidence
  const evidenceText = evidence.span?.text || fullText.slice(evidence.span.start, evidence.span.end);
  const evidenceStart = evidence.span.start;
  const evidenceEnd = evidence.span.end;

  // Calculate token distance
  const tokens = evidenceText.split(/\s+/);
  const tokenDistance = tokens.length;

  // Calculate character distance
  const subjStart = options.subjStart ?? evidenceStart;
  const objEnd = options.objEnd ?? evidenceEnd;
  const charDistance = Math.abs(objEnd - subjStart);

  // Get entity types
  const subjEntity = allEntities.find(e => e.id === relation.subj);
  const objEntity = allEntities.find(e => e.id === relation.obj);
  const subjType = subjEntity?.type || 'PERSON';
  const objType = objEntity?.type || 'PERSON';

  // Calculate salience
  const subjSalience = calculateEntitySalience(relation.subj, allEntities, fullText.length);
  const objSalience = calculateEntitySalience(relation.obj, allEntities, fullText.length);

  // Get coref confidence
  const subjCorefConf = getCorefChainConfidence(relation.subj, corefChains);
  const objCorefConf = getCorefChainConfidence(relation.obj, corefChains);
  const corefChainConf = (subjCorefConf + objCorefConf) / 2;

  // Determine pattern ID and family
  const patternId = options.patternId || `${relation.extractor}_${relation.pred}`;
  const patternFamily = options.patternFamily || inferPatternFamily(relation.pred);

  // Get pattern reliability
  const patternReliabilityScore = patternReliability.get(patternId) ?? 0.75;  // Default

  // Extract cue lemma
  const cueLemma = extractCueLemma(evidenceText, relation.pred);

  // Calculate lexicon match strength (simplified for now)
  const lexiconMatchStrength = cueLemma ? 1.0 : 0.5;

  // Window tier
  const windowTier = getWindowTier(subjStart, objEnd, fullText);

  // Sentence position (0-1 normalized)
  const sentencePosition = evidenceStart / fullText.length;

  return {
    pattern_id: patternId,
    pattern_family: patternFamily,
    dep_path_len: options.depPathLen ?? null,

    token_distance: tokenDistance,
    char_distance: charDistance,

    crosses_paragraph: crossesParagraph(fullText, evidenceStart, evidenceEnd),
    crosses_dialogue: crossesDialogue(fullText, evidenceStart, evidenceEnd),
    sentence_position: sentencePosition,

    subj_type: subjType,
    obj_type: objType,
    subj_salience: subjSalience,
    obj_salience: objSalience,

    coref_chain_conf: corefChainConf,
    uses_pronoun_resolution: usesPronounResolution(evidenceText, corefChains),

    apposition_present: hasApposition(evidenceText),
    negation_present: hasNegation(evidenceText),
    modal_present: hasModal(evidenceText),

    cue_lemma: cueLemma,
    lexicon_match_strength: lexiconMatchStrength,

    pattern_reliability: patternReliabilityScore,

    window_tier: windowTier
  };
}

/**
 * Infer pattern family from predicate
 */
function inferPatternFamily(predicate: string): string {
  const pred = predicate.toLowerCase();

  if (pred.includes('parent') || pred.includes('child') || pred.includes('sibling') ||
      pred.includes('married') || pred.includes('spouse')) {
    return 'kinship';
  }

  if (pred.includes('work') || pred.includes('employ') || pred.includes('hired')) {
    return 'employment';
  }

  if (pred.includes('stud') || pred.includes('teach') || pred.includes('graduate')) {
    return 'education';
  }

  if (pred.includes('live') || pred.includes('resid') || pred.includes('dwell')) {
    return 'location';
  }

  if (pred.includes('member') || pred.includes('sorted') || pred.includes('belongs')) {
    return 'membership';
  }

  if (pred.includes('friend') || pred.includes('enemy') || pred.includes('rival')) {
    return 'social';
  }

  return 'other';
}

/**
 * Convert relation to candidate with features
 */
export function relationToCandidate(
  relation: Relation,
  fullText: string,
  allEntities: Entity[],
  corefChains: ScoredCorefChain[],
  patternReliability: Map<string, number>,
  options: {
    subjStart?: number;
    objEnd?: number;
    depPathLen?: number;
    patternId?: string;
    patternFamily?: string;
  } = {}
): RelationCandidate {
  const features = extractRelationFeatures(
    relation,
    fullText,
    allEntities,
    corefChains,
    patternReliability,
    options
  );

  return {
    subjEntityId: relation.subj,
    objEntityId: relation.obj,
    predicate: relation.pred,
    evidence: {
      text: relation.evidence[0].span?.text || '',
      start: relation.evidence[0].span.start,
      end: relation.evidence[0].span.end,
      sentenceIndex: relation.evidence[0].sentence_index || 0
    },
    features,
    patternConfidence: relation.confidence,
    extractor: relation.extractor as 'dependency' | 'regex' | 'narrative',
    patternId: options.patternId
  };
}

/**
 * Serialize features to CSV format for training
 * Used to create training data for ML re-scorer
 */
export function featuresToCSV(features: RelationFeatures): string {
  return [
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
    features.window_tier
  ].join(',');
}

/**
 * CSV header for training data
 */
export const FEATURE_CSV_HEADER = [
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
  'window_tier'
].join(',');
