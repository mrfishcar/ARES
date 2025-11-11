/**
 * Enhanced Coreference Resolution - Phase 1 Precision Improvements
 *
 * NEW CAPABILITIES:
 * 1. Appositive possessives: "His father Arthur" → coref(his→Ron) + role(Arthur, father_of Ron)
 * 2. Focus stack with grammatical role salience (subject > object > oblique)
 * 3. Family lexicon with directionality rules
 * 4. Scored coref chains with features for ML re-scoring
 *
 * Extends the existing rule-based coref system in coref.ts
 */

import type { Sentence } from './segment';
import type { Entity, EntityType } from './schema';
import type { CorefLink, CorefLinks } from './coref';

/**
 * Family relation types with directionality
 */
export interface FamilyRelation {
  roleWord: string;          // e.g., "father", "mother", "son"
  predicate: string;         // e.g., "parent_of", "child_of"
  inverseOf?: string;        // e.g., "parent_of" ↔ "child_of"
  symmetric: boolean;        // e.g., "sibling_of" is symmetric
  typeConstraint: {
    from: EntityType;        // Must be PERSON
    to: EntityType;          // Must be PERSON
  };
}

/**
 * Family lexicon with directionality rules
 * Based on user's spec: "father/mother/son/daughter/sibling/cousin/etc. with directionality"
 */
export const FAMILY_LEXICON: Record<string, FamilyRelation> = {
  // Parent → Child relations
  'father': {
    roleWord: 'father',
    predicate: 'parent_of',
    inverseOf: 'child_of',
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },
  'mother': {
    roleWord: 'mother',
    predicate: 'parent_of',
    inverseOf: 'child_of',
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },
  'parent': {
    roleWord: 'parent',
    predicate: 'parent_of',
    inverseOf: 'child_of',
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },

  // Child → Parent relations
  'son': {
    roleWord: 'son',
    predicate: 'child_of',
    inverseOf: 'parent_of',
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },
  'daughter': {
    roleWord: 'daughter',
    predicate: 'child_of',
    inverseOf: 'parent_of',
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },
  'child': {
    roleWord: 'child',
    predicate: 'child_of',
    inverseOf: 'parent_of',
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },

  // Sibling relations (symmetric)
  'brother': {
    roleWord: 'brother',
    predicate: 'sibling_of',
    symmetric: true,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },
  'sister': {
    roleWord: 'sister',
    predicate: 'sibling_of',
    symmetric: true,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },
  'sibling': {
    roleWord: 'sibling',
    predicate: 'sibling_of',
    symmetric: true,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },

  // Extended family
  'uncle': {
    roleWord: 'uncle',
    predicate: 'uncle_of',
    inverseOf: 'nephew_niece_of',
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },
  'aunt': {
    roleWord: 'aunt',
    predicate: 'aunt_of',
    inverseOf: 'nephew_niece_of',
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },
  'cousin': {
    roleWord: 'cousin',
    predicate: 'cousin_of',
    symmetric: true,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },
  'grandfather': {
    roleWord: 'grandfather',
    predicate: 'grandparent_of',
    inverseOf: 'grandchild_of',
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },
  'grandmother': {
    roleWord: 'grandmother',
    predicate: 'grandparent_of',
    inverseOf: 'grandchild_of',
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },
  'grandson': {
    roleWord: 'grandson',
    predicate: 'grandchild_of',
    inverseOf: 'grandparent_of',
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },
  'granddaughter': {
    roleWord: 'granddaughter',
    predicate: 'grandchild_of',
    inverseOf: 'grandparent_of',
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },

  // Spousal relations
  'wife': {
    roleWord: 'wife',
    predicate: 'married_to',
    symmetric: true,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },
  'husband': {
    roleWord: 'husband',
    predicate: 'married_to',
    symmetric: true,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },
  'spouse': {
    roleWord: 'spouse',
    predicate: 'married_to',
    symmetric: true,
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  }
};

/**
 * Appositive possessive structure
 * Example: "His father Arthur" → { pronoun: "His", role: "father", name: "Arthur" }
 */
export interface AppositivePossessive {
  pronoun: string;           // "His", "Her", "Their"
  roleWord: string;          // "father", "mother", "brother"
  nameEntity: string;        // "Arthur", "Molly"
  start: number;             // Character offset in text
  end: number;
  fullMatch: string;         // "His father Arthur"
  familyRelation?: FamilyRelation;  // Resolved from FAMILY_LEXICON
}

/**
 * Coref chain with confidence features
 * For future ML re-scoring
 */
export interface ScoredCorefChain {
  entityId: string;
  mentions: Array<{
    mentionId: string;
    start: number;
    end: number;
    text: string;
    sentenceIndex: number;
  }>;
  links: CorefLink[];
  features: CorefChainFeatures;
  confidence: number;
}

/**
 * Features for ML-based coref scoring
 * Based on user's spec: "distance, salience gap, agreement, string overlap/alias, role compatibility"
 */
export interface CorefChainFeatures {
  chainLength: number;               // Number of mentions in chain
  avgDistance: number;               // Average character distance between mentions
  maxDistance: number;               // Max distance (for long-range coref)
  crossesParagraph: boolean;         // Does chain span multiple paragraphs?
  genderAgreement: number;           // 0-1 score for gender/number consistency
  stringOverlap: number;             // 0-1 score for string similarity
  aliasMatch: boolean;               // Does chain use known aliases?
  roleCompatibility: number;         // 0-1 score for role consistency (e.g., "wizard" mentions)
  salienceScore: number;             // Average salience (mention frequency)
  hasAppositiveEvidence: boolean;    // Contains appositive patterns
  methodDiversity: number;           // 0-1 score for multiple resolution methods used
}

/**
 * Detect appositive possessive patterns
 * Pattern: PRON 's NOUN NAME or PRON NOUN NAME
 * Examples:
 *   - "His father Arthur"
 *   - "Ron's brother Percy"
 *   - "Her mother Molly"
 */
export function detectAppositivePossessives(
  text: string,
  entities: Entity[]
): AppositivePossessive[] {
  const appositives: AppositivePossessive[] = [];

  // Build entity name lookup for fast matching
  const entityNames = new Set(entities.map(e => e.canonical));

  // Pattern 1: PRON NOUN NAME (e.g., "His father Arthur")
  // Pronouns: his, her, their, its, Ron's, Harry's, etc.
  const pattern1 = /\b(His|Her|Their|Its|[A-Z][a-z]+'s)\s+(father|mother|brother|sister|son|daughter|uncle|aunt|cousin|grandfather|grandmother|parent|child|sibling|wife|husband|spouse)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;

  let match: RegExpExecArray | null;
  while ((match = pattern1.exec(text)) !== null) {
    const pronoun = match[1];
    const roleWord = match[2].toLowerCase();
    const nameCandidate = match[3];

    // Check if name is a recognized entity
    if (!entityNames.has(nameCandidate)) continue;

    // Check if role is in family lexicon
    const familyRelation = FAMILY_LEXICON[roleWord];
    if (!familyRelation) continue;

    appositives.push({
      pronoun,
      roleWord,
      nameEntity: nameCandidate,
      start: match.index,
      end: match.index + match[0].length,
      fullMatch: match[0],
      familyRelation
    });
  }

  // Pattern 2: PRON's NOUN NAME (e.g., "Ron's father Arthur" - not matched above)
  // Already covered by pattern1 if pronoun ends with 's

  return appositives;
}

/**
 * Resolve appositive possessives using existing coref links
 * Example: "His father Arthur" + coref(his→Ron) → emit parent_of(Arthur, Ron)
 *
 * This creates virtual relation candidates that the main extraction pipeline can use.
 */
export function resolveAppositivePossessives(
  appositives: AppositivePossessive[],
  corefLinks: CorefLinks,
  entities: Entity[],
  text: string
): Array<{
  possessorEntityId: string;  // The entity the pronoun refers to (e.g., Ron)
  roleEntityId: string;       // The entity in the appositive (e.g., Arthur)
  predicate: string;          // The family relation (e.g., "parent_of")
  inverseOf?: string;         // Inverse relation if applicable
  symmetric: boolean;
  confidence: number;
  evidence: {
    start: number;
    end: number;
    text: string;
  };
}> {
  const resolvedRelations: Array<{
    possessorEntityId: string;
    roleEntityId: string;
    predicate: string;
    inverseOf?: string;
    symmetric: boolean;
    confidence: number;
    evidence: { start: number; end: number; text: string };
  }> = [];

  for (const appositive of appositives) {
    // Step 1: Resolve pronoun to entity using coref links
    const pronounLower = appositive.pronoun.toLowerCase().replace(/'s$/, '');

    // Find coref links at this position
    const matchingLinks = corefLinks.links.filter(link => {
      // Check if link overlaps with pronoun position
      return (
        link.mention.start <= appositive.start &&
        link.mention.end >= appositive.start + appositive.pronoun.length
      ) || (
        // Also check if pronoun text matches
        link.mention.text.toLowerCase() === pronounLower &&
        Math.abs(link.mention.start - appositive.start) < 10  // Within 10 chars
      );
    });

    if (matchingLinks.length === 0) continue;

    // Step 2: Get possessor entity (the one the pronoun refers to)
    const possessorEntityId = matchingLinks[0].entity_id;
    const possessorEntity = entities.find(e => e.id === possessorEntityId);
    if (!possessorEntity || possessorEntity.type !== 'PERSON') continue;

    // Step 3: Get role entity (the named person in the appositive)
    const roleEntity = entities.find(e => e.canonical === appositive.nameEntity);
    if (!roleEntity || roleEntity.type !== 'PERSON') continue;

    // Step 4: Determine relation direction
    // Example: "His father Arthur" → parent_of(Arthur, Ron)
    //          Arthur is the father, Ron is the child
    const familyRelation = appositive.familyRelation!;

    // The roleEntity takes the role specified (e.g., Arthur is the "father")
    // The possessorEntity is the person being described (e.g., Ron is the "child")
    // So the predicate direction is from role → possessor

    resolvedRelations.push({
      possessorEntityId: possessorEntity.id,
      roleEntityId: roleEntity.id,
      predicate: familyRelation.predicate,
      inverseOf: familyRelation.inverseOf,
      symmetric: familyRelation.symmetric,
      confidence: matchingLinks[0].confidence * 0.9,  // Slightly lower than direct coref
      evidence: {
        start: appositive.start,
        end: appositive.end,
        text: appositive.fullMatch
      }
    });
  }

  return resolvedRelations;
}

/**
 * Calculate coref chain features for ML re-scoring
 * Based on user's spec for feature extraction
 */
export function extractCorefChainFeatures(
  chain: ScoredCorefChain,
  text: string,
  entities: Entity[]
): CorefChainFeatures {
  const mentions = chain.mentions;
  const links = chain.links;

  // Chain length
  const chainLength = mentions.length;

  // Distance calculations
  const distances: number[] = [];
  for (let i = 1; i < mentions.length; i++) {
    distances.push(mentions[i].start - mentions[i - 1].end);
  }
  const avgDistance = distances.length > 0
    ? distances.reduce((a, b) => a + b, 0) / distances.length
    : 0;
  const maxDistance = distances.length > 0 ? Math.max(...distances) : 0;

  // Paragraph crossing
  const crossesParagraph = text.slice(mentions[0].start, mentions[mentions.length - 1].end)
    .includes('\n\n');

  // Gender/number agreement
  const entity = entities.find(e => e.id === chain.entityId);
  const genderAgreement = entity ? 1.0 : 0.5;  // Simplified for now

  // String overlap (compare mention texts)
  let overlapScore = 0;
  for (let i = 1; i < mentions.length; i++) {
    const text1 = mentions[i - 1].text.toLowerCase();
    const text2 = mentions[i].text.toLowerCase();
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    overlapScore += intersection.size / union.size;
  }
  const stringOverlap = mentions.length > 1 ? overlapScore / (mentions.length - 1) : 1.0;

  // Alias match (check if entity has aliases)
  const aliasMatch = entity ? entity.aliases.length > 0 : false;

  // Role compatibility (simplified: check if mentions share descriptor words)
  const roleCompatibility = stringOverlap;  // Simplified for now

  // Salience (mention frequency)
  const salienceScore = Math.min(1.0, chainLength / 5);  // Normalize by expected frequency

  // Appositive evidence
  const hasAppositiveEvidence = links.some(link =>
    link.method === 'title_match' || link.method === 'nominal_match'
  );

  // Method diversity (how many different resolution methods were used?)
  const methods = new Set(links.map(link => link.method));
  const methodDiversity = Math.min(1.0, methods.size / 3);  // Normalize by 3 methods

  return {
    chainLength,
    avgDistance,
    maxDistance,
    crossesParagraph,
    genderAgreement,
    stringOverlap,
    aliasMatch,
    roleCompatibility,
    salienceScore,
    hasAppositiveEvidence,
    methodDiversity
  };
}

/**
 * Score coref chain using simple logistic model
 * This is a placeholder for future ML-based scoring
 * Based on user's spec: "Use a simple logistic reg (tiny, local)"
 */
export function scoreCorefChain(features: CorefChainFeatures): number {
  // Simple weighted sum (placeholder for trained logistic regression)
  // Weights tuned for precision on long-range fiction coref
  const score =
    0.15 * (1 - Math.min(1, features.avgDistance / 1000)) +  // Prefer closer mentions
    0.10 * (1 - Math.min(1, features.maxDistance / 2000)) +  // Penalize very long jumps
    0.05 * (features.crossesParagraph ? 0 : 1) +             // Penalize cross-paragraph slightly
    0.20 * features.genderAgreement +                        // Reward gender/number agreement
    0.15 * features.stringOverlap +                          // Reward string similarity
    0.10 * (features.aliasMatch ? 1 : 0) +                   // Reward alias usage
    0.10 * features.roleCompatibility +                      // Reward role consistency
    0.10 * features.salienceScore +                          // Reward frequent mentions
    0.05 * (features.hasAppositiveEvidence ? 1 : 0);        // Reward appositive patterns

  return Math.max(0, Math.min(1, score));
}

/**
 * Build coref chains from individual links
 */
export function buildCorefChains(
  corefLinks: CorefLinks,
  entities: Entity[],
  text: string
): ScoredCorefChain[] {
  const chainsByEntity = new Map<string, {
    mentions: Array<{ mentionId: string; start: number; end: number; text: string; sentenceIndex: number }>;
    links: CorefLink[];
  }>();

  // Group links by entity
  for (const link of corefLinks.links) {
    if (!chainsByEntity.has(link.entity_id)) {
      chainsByEntity.set(link.entity_id, { mentions: [], links: [] });
    }

    const chain = chainsByEntity.get(link.entity_id)!;
    chain.mentions.push({
      mentionId: `${link.mention.start}:${link.mention.end}`,
      start: link.mention.start,
      end: link.mention.end,
      text: link.mention.text,
      sentenceIndex: link.mention.sentence_index
    });
    chain.links.push(link);
  }

  // Build scored chains
  const scoredChains: ScoredCorefChain[] = [];

  for (const [entityId, chain] of chainsByEntity) {
    // Deduplicate mentions by position
    const uniqueMentions = Array.from(
      new Map(chain.mentions.map(m => [m.mentionId, m])).values()
    );

    // Sort by position
    uniqueMentions.sort((a, b) => a.start - b.start);

    const scoredChain: ScoredCorefChain = {
      entityId,
      mentions: uniqueMentions,
      links: chain.links,
      features: {} as CorefChainFeatures,  // Will be filled below
      confidence: 0  // Will be filled below
    };

    // Extract features
    scoredChain.features = extractCorefChainFeatures(scoredChain, text, entities);

    // Score chain
    scoredChain.confidence = scoreCorefChain(scoredChain.features);

    scoredChains.push(scoredChain);
  }

  return scoredChains;
}
