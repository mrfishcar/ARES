/**
 * Evidence Accumulator for Deferred Entity Classification
 *
 * Instead of immediately classifying entities based on first mention,
 * this module accumulates evidence across ALL mentions and classifies
 * entities only after gathering sufficient context.
 *
 * This mimics how advanced readers process text:
 * - Notice an ambiguous entity
 * - Keep track of contextual clues
 * - Defer final classification until confident
 * - Use co-occurrence with known entities to disambiguate
 */

import type { EntityType } from '../schema';
import type { EntityMention, EntitySalience, MacroAnalysis } from './macro-analyzer';
import type { ParserFeatures } from './parser-features';
import type { GenrePriors } from './genre-detector';

/**
 * Evidence for entity type classification
 */
export interface TypeEvidence {
  type: EntityType;
  score: number;
  sources: string[];  // What contributed to this score
}

/**
 * Accumulated evidence for an entity
 */
export interface EntityEvidence {
  surface: string;
  normalized: string;

  // All mentions (for full-document context)
  mentions: EntityMention[];

  // Type evidence from different sources
  nerTags: Map<string, number>;        // NER tag → count
  syntacticRoles: Map<string, number>; // Dependency role → count
  verbContexts: Map<string, number>;   // Head verb → count

  // Contextual clues
  prepositionalContexts: string[];     // "in X", "at X", "to X"
  appositives: string[];               // "X, the wizard"
  titleModifiers: string[];            // "King X", "Professor X"
  possessiveRelations: string[];       // "X's brother" (X is likely PERSON)

  // Co-occurrence evidence
  cooccurringEntities: Map<string, { type?: EntityType; count: number }>;

  // Salience information
  salience: EntitySalience | null;

  // Genre alignment
  matchesGenrePattern: boolean;

  // Final type scores (computed after evidence accumulation)
  typeScores: Map<EntityType, number>;
}

/**
 * Create empty evidence container
 */
export function createEntityEvidence(
  surface: string,
  normalized: string
): EntityEvidence {
  return {
    surface,
    normalized,
    mentions: [],
    nerTags: new Map(),
    syntacticRoles: new Map(),
    verbContexts: new Map(),
    prepositionalContexts: [],
    appositives: [],
    titleModifiers: [],
    possessiveRelations: [],
    cooccurringEntities: new Map(),
    salience: null,
    matchesGenrePattern: false,
    typeScores: new Map()
  };
}

/**
 * Accumulate evidence from a mention
 */
export function accumulateMentionEvidence(
  evidence: EntityEvidence,
  mention: EntityMention,
  parserFeatures: ParserFeatures,
  fullText: string
): void {
  // Add mention to list
  evidence.mentions.push(mention);

  // Accumulate NER tags
  if (mention.nerTag) {
    const count = evidence.nerTags.get(mention.nerTag) || 0;
    evidence.nerTags.set(mention.nerTag, count + 1);
  }

  // Accumulate syntactic roles
  if (mention.syntacticRole) {
    const count = evidence.syntacticRoles.get(mention.syntacticRole) || 0;
    evidence.syntacticRoles.set(mention.syntacticRole, count + 1);
  }

  // Accumulate verb contexts
  if (mention.headVerb) {
    const count = evidence.verbContexts.get(mention.headVerb) || 0;
    evidence.verbContexts.set(mention.headVerb, count + 1);
  }

  // Extract prepositional context
  const beforeContext = fullText.slice(Math.max(0, mention.start - 20), mention.start);
  const prepPattern = /\b(in|at|to|from|into|near|by|within|toward)\s*$/i;
  const prepMatch = beforeContext.match(prepPattern);
  if (prepMatch) {
    evidence.prepositionalContexts.push(prepMatch[1].toLowerCase());
  }

  // Check for appositives from parser features
  for (const appos of parserFeatures.appositives) {
    if (appos.headStart === mention.start || appos.appositiveStart === mention.start) {
      const descriptor = appos.headStart === mention.start ? appos.appositive : appos.head;
      evidence.appositives.push(descriptor);
    }
  }

  // Check for title modifiers
  for (const title of parserFeatures.titleModifiers) {
    if (title.entityStart === mention.start) {
      evidence.titleModifiers.push(title.title);
    }
  }

  // Check for possessive relations
  for (const poss of parserFeatures.possessions) {
    // If this entity is the possessor, record the relationship
    if (poss.possessorStart === mention.start && poss.relationship) {
      evidence.possessiveRelations.push(poss.relationship);
    }
    // If this entity is possessed by someone, record inverse
    if (poss.possessedStart === mention.start && poss.relationship) {
      evidence.possessiveRelations.push(`possessive-${poss.relationship}`);
    }
  }
}

/**
 * Accumulate co-occurrence evidence from macro analysis
 */
export function accumulateCooccurrenceEvidence(
  evidence: EntityEvidence,
  macroAnalysis: MacroAnalysis,
  resolvedEntities: Map<string, EntityType>
): void {
  // Get neighbors from entity graph
  const neighbors = macroAnalysis.entityGraph.neighbors(evidence.normalized);

  for (const neighbor of neighbors) {
    // Check if we know this neighbor's type
    const neighborType = resolvedEntities.get(neighbor);

    // Find co-occurrence in analysis
    const cooccur = macroAnalysis.cooccurrences.find(
      c => (c.entity1 === evidence.normalized && c.entity2 === neighbor) ||
        (c.entity2 === evidence.normalized && c.entity1 === neighbor)
    );

    if (cooccur) {
      evidence.cooccurringEntities.set(neighbor, {
        type: neighborType,
        count: cooccur.cooccurrenceCount
      });
    }
  }
}

/**
 * Add salience information
 */
export function addSalienceEvidence(
  evidence: EntityEvidence,
  macroAnalysis: MacroAnalysis
): void {
  evidence.salience = macroAnalysis.salience.get(evidence.normalized) || null;
}

/**
 * Classify entity type based on accumulated evidence
 */
export function classifyWithEvidence(
  evidence: EntityEvidence,
  genre: GenrePriors
): EntityType {
  // Initialize type scores
  const scores = new Map<EntityType, number>();
  const ALL_TYPES: EntityType[] = ['PERSON', 'PLACE', 'ORG', 'ITEM', 'EVENT', 'WORK'];

  for (const type of ALL_TYPES) {
    scores.set(type, 0);
  }

  // Source 1: NER tags (strongest signal)
  for (const [nerTag, count] of evidence.nerTags) {
    const mappedType = mapNERToType(nerTag);
    if (mappedType) {
      const current = scores.get(mappedType) || 0;
      scores.set(mappedType, current + (count * 0.35)); // High weight for NER
    }
  }

  // Source 2: Title modifiers (very strong signal)
  if (evidence.titleModifiers.length > 0) {
    for (const title of evidence.titleModifiers) {
      const titleLower = title.toLowerCase();

      if (PERSON_TITLES.has(titleLower)) {
        const current = scores.get('PERSON') || 0;
        scores.set('PERSON', current + 0.30);
      } else if (ORG_TITLES.has(titleLower)) {
        const current = scores.get('ORG') || 0;
        scores.set('ORG', current + 0.30);
      }
    }
  }

  // Source 3: Appositives (strong signal)
  if (evidence.appositives.length > 0) {
    for (const appos of evidence.appositives) {
      const apposLower = appos.toLowerCase();

      // Check for person descriptors
      if (PERSON_DESCRIPTORS.has(apposLower) || /\b(wizard|king|queen|warrior|explorer)\b/.test(apposLower)) {
        const current = scores.get('PERSON') || 0;
        scores.set('PERSON', current + 0.25);
      }
      // Check for organization descriptors
      else if (/\b(company|organization|institution|school|university)\b/.test(apposLower)) {
        const current = scores.get('ORG') || 0;
        scores.set('ORG', current + 0.25);
      }
      // Check for place descriptors
      else if (/\b(city|town|village|kingdom|realm|land|country)\b/.test(apposLower)) {
        const current = scores.get('PLACE') || 0;
        scores.set('PLACE', current + 0.25);
      }
    }
  }

  // Source 4: Prepositional contexts
  const placePreps = evidence.prepositionalContexts.filter(p =>
    ['in', 'at', 'to', 'from', 'near', 'within'].includes(p)
  ).length;
  if (placePreps > 0) {
    const current = scores.get('PLACE') || 0;
    scores.set('PLACE', current + (placePreps * 0.15));
  }

  // Source 5: Syntactic roles
  for (const [role, count] of evidence.syntacticRoles) {
    if (role === 'nsubj' || role === 'nsubjpass') {
      // Subjects are often PERSONs or ORGs
      const personScore = scores.get('PERSON') || 0;
      scores.set('PERSON', personScore + (count * 0.10));
    } else if (role === 'pobj' && placePreps > 0) {
      // Prepositional objects with place preps → PLACE
      const placeScore = scores.get('PLACE') || 0;
      scores.set('PLACE', placeScore + (count * 0.10));
    }
  }

  // Source 6: Verb contexts (action verbs suggest PERSON subjects)
  for (const [verb, count] of evidence.verbContexts) {
    const verbLower = verb.toLowerCase();

    if (MOTION_VERBS.has(verbLower) || SOCIAL_VERBS.has(verbLower)) {
      const current = scores.get('PERSON') || 0;
      scores.set('PERSON', current + (count * 0.12));
    }
  }

  // Source 7: Possessive relations
  for (const relation of evidence.possessiveRelations) {
    if (relation === 'family' || relation === 'organizational') {
      // "X's brother" → X is PERSON
      const current = scores.get('PERSON') || 0;
      scores.set('PERSON', current + 0.20);
    }
  }

  // Source 8: Co-occurrence with known entities
  for (const [neighbor, info] of evidence.cooccurringEntities) {
    if (info.type) {
      // Entities that co-occur often have same type (especially in coordination)
      const current = scores.get(info.type) || 0;
      scores.set(info.type, current + (info.count * 0.08));
    }
  }

  // Source 9: Salience boost (high-salience entities more likely to be PERSON in narrative)
  if (evidence.salience && evidence.salience.score > 0.7) {
    // Very important entity → likely protagonist (PERSON)
    const current = scores.get('PERSON') || 0;
    scores.set('PERSON', current + 0.15);
  }

  // Source 10: Genre priors for ambiguous cases
  // Apply priors only if evidence is weak
  const totalEvidence = Array.from(scores.values()).reduce((a, b) => a + b, 0);
  if (totalEvidence < 0.5) {
    // Weak evidence → rely on genre priors
    for (const type of ALL_TYPES) {
      const prior = genre.singleWordPriors[type] || 0;
      const current = scores.get(type) || 0;
      scores.set(type, current + (prior * 0.20));
    }
  }

  // Find highest scoring type
  let bestType: EntityType = 'PERSON'; // Default fallback
  let bestScore = 0;

  for (const [type, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  // Store final scores for debugging
  evidence.typeScores = scores;

  return bestType;
}

/**
 * Map spaCy NER tag to entity type
 */
function mapNERToType(nerTag: string): EntityType | null {
  const tag = nerTag.replace(/^[BI]-/, '');

  switch (tag) {
    case 'PERSON': return 'PERSON';
    case 'ORG': return 'ORG';
    case 'GPE':
    case 'LOC': return 'PLACE';
    case 'WORK_OF_ART': return 'WORK';
    case 'PRODUCT': return 'ITEM';
    case 'EVENT': return 'EVENT';
    default: return null;
  }
}

/**
 * Title sets
 */
const PERSON_TITLES = new Set([
  'king', 'queen', 'prince', 'princess', 'lord', 'lady', 'sir', 'dame',
  'mr', 'mrs', 'ms', 'miss', 'dr', 'doctor', 'professor', 'captain',
  'commander', 'father', 'mother', 'brother', 'sister', 'saint', 'reverend'
]);

const ORG_TITLES = new Set([
  'university', 'college', 'institute', 'academy', 'school',
  'company', 'corporation', 'inc', 'corp', 'llc', 'ltd'
]);

const PERSON_DESCRIPTORS = new Set([
  'man', 'woman', 'boy', 'girl', 'child', 'person', 'human',
  'wizard', 'mage', 'sorcerer', 'witch',
  'king', 'queen', 'prince', 'princess',
  'warrior', 'knight', 'soldier',
  'explorer', 'scientist', 'researcher'
]);

const MOTION_VERBS = new Set([
  'travel', 'go', 'move', 'walk', 'run', 'journey', 'venture',
  'dwell', 'live', 'reside', 'stay'
]);

const SOCIAL_VERBS = new Set([
  'marry', 'befriend', 'meet', 'know', 'love', 'hate',
  'speak', 'talk', 'say', 'tell', 'ask', 'answer'
]);

/**
 * Explain classification decision (for debugging)
 */
export function explainClassification(evidence: EntityEvidence): string {
  const lines: string[] = [];

  lines.push(`Entity: "${evidence.surface}" (${evidence.normalized})`);
  lines.push(`Mentions: ${evidence.mentions.length}`);
  lines.push('');

  lines.push('Evidence Summary:');

  if (evidence.nerTags.size > 0) {
    lines.push('  NER Tags:');
    for (const [tag, count] of evidence.nerTags) {
      lines.push(`    - ${tag}: ${count}x`);
    }
  }

  if (evidence.titleModifiers.length > 0) {
    lines.push('  Title Modifiers:');
    for (const title of evidence.titleModifiers) {
      lines.push(`    - "${title}"`);
    }
  }

  if (evidence.appositives.length > 0) {
    lines.push('  Appositives:');
    for (const appos of evidence.appositives) {
      lines.push(`    - "${appos}"`);
    }
  }

  if (evidence.prepositionalContexts.length > 0) {
    lines.push('  Prepositional Contexts:');
    const prepCounts = new Map<string, number>();
    for (const prep of evidence.prepositionalContexts) {
      prepCounts.set(prep, (prepCounts.get(prep) || 0) + 1);
    }
    for (const [prep, count] of prepCounts) {
      lines.push(`    - "${prep}": ${count}x`);
    }
  }

  if (evidence.verbContexts.size > 0) {
    lines.push('  Verb Contexts:');
    for (const [verb, count] of evidence.verbContexts) {
      lines.push(`    - ${verb}: ${count}x`);
    }
  }

  if (evidence.salience) {
    lines.push(`  Salience: ${evidence.salience.score.toFixed(3)} (${evidence.salience.mentionCount} mentions)`);
  }

  if (evidence.cooccurringEntities.size > 0) {
    lines.push('  Co-occurring Entities:');
    const sorted = Array.from(evidence.cooccurringEntities.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
    for (const [neighbor, info] of sorted) {
      const typeStr = info.type ? ` (${info.type})` : '';
      lines.push(`    - ${neighbor}${typeStr}: ${info.count}x`);
    }
  }

  lines.push('');
  lines.push('Type Scores:');
  const sorted = Array.from(evidence.typeScores.entries())
    .sort((a, b) => b[1] - a[1]);
  for (const [type, score] of sorted) {
    const bar = '█'.repeat(Math.floor(score * 20));
    lines.push(`  ${type.padEnd(10)} ${score.toFixed(3)} ${bar}`);
  }

  return lines.join('\n');
}
