/**
 * Context-Aware Entity Classification
 *
 * Classifies entity types using linguistic rules, dependency patterns,
 * and English grammar constraints instead of whitelists.
 *
 * Strategy:
 * 1. Analyze syntactic context (governing verb, preposition, dependency role)
 * 2. Apply verb-argument type constraints (e.g., "ruled X" → X is PLACE)
 * 3. Use dependency structure to infer entity roles
 * 4. Fall back to spaCy NER hints when context is ambiguous
 */

import type { EntityType } from '../schema';
import type { Token, ParsedSentence } from './parse-types';

/**
 * Context hints extracted from dependency parse and surrounding text
 */
export interface ContextHints {
  // Syntactic structure
  governingVerb?: string;        // Verb that governs this entity (if any)
  governingVerbLemma?: string;   // Lemma of governing verb
  dependencyRole?: string;       // nsubj, dobj, pobj, etc.
  preposition?: string;          // Preposition before entity (for pobj)

  // Semantic constraints
  isSubjectOf?: string;          // If entity is subject of this verb
  isObjectOf?: string;           // If entity is direct object of this verb
  isPrepObjectOf?: string;       // If entity is prep object, what prep?

  // Nearby context
  nearbyVerbs: string[];         // Verbs in same sentence
  nearbyPreps: string[];         // Prepositions near entity

  // spaCy hint (not absolute truth)
  spacyLabel?: string;           // PERSON, GPE, ORG, etc.
}

/**
 * Verb patterns that constrain argument types
 */
const VERB_PATTERNS = {
  // Governance verbs: X ruled/governed Y → Y is PLACE
  governance_object: {
    verbs: ['rule', 'ruled', 'govern', 'governed', 'reign', 'reigned', 'control', 'controlled'],
    objectType: 'PLACE' as EntityType,
    subjectType: 'PERSON' as EntityType
  },

  // Leadership verbs: X led/headed Y → Y is ORG/GROUP
  leadership_object: {
    verbs: ['lead', 'led', 'head', 'headed', 'chair', 'chaired', 'direct', 'directed', 'manage', 'managed'],
    objectType: 'ORG' as EntityType,
    subjectType: 'PERSON' as EntityType
  },

  // Founding verbs: X founded/established Y → Y is ORG
  founding_object: {
    verbs: ['found', 'founded', 'establish', 'established', 'create', 'created', 'start', 'started', 'launch', 'launched', 'co-found', 'co-founded'],
    objectType: 'ORG' as EntityType,
    subjectType: 'PERSON' as EntityType
  },

  // Social verbs: X married Y → both PERSON
  social_both: {
    verbs: ['marry', 'married', 'befriend', 'befriended', 'meet', 'met', 'know', 'knew', 'love', 'loved', 'hate', 'hated'],
    objectType: 'PERSON' as EntityType,
    subjectType: 'PERSON' as EntityType
  },

  // Motion verbs: X traveled/went/moved → X is PERSON
  motion_subject: {
    verbs: ['travel', 'traveled', 'go', 'went', 'move', 'moved', 'journey', 'journeyed', 'walk', 'walked', 'run', 'ran', 'flee', 'fled', 'return', 'returned'],
    subjectType: 'PERSON' as EntityType
  },

  // Location verbs: X lived/dwelt in Y → X is PERSON, Y is PLACE
  location_subject: {
    verbs: ['live', 'lived', 'dwell', 'dwelt', 'reside', 'resided', 'settle', 'settled', 'stay', 'stayed', 'remain', 'remained'],
    subjectType: 'PERSON' as EntityType
  },

  // Study/teach verbs: X studied/taught at Y → X is PERSON, Y is ORG
  education_subject: {
    verbs: ['study', 'studied', 'teach', 'taught', 'attend', 'attended', 'learn', 'learned', 'graduate', 'graduated'],
    subjectType: 'PERSON' as EntityType
  },

  // Combat verbs: X fought in Y → X is PERSON, Y is EVENT/PLACE
  combat_subject: {
    verbs: ['fight', 'fought', 'battle', 'battled', 'war', 'warred', 'combat', 'combated'],
    subjectType: 'PERSON' as EntityType
  }
};

/**
 * Preposition + verb combinations that determine object type
 */
const PREP_VERB_PATTERNS = {
  // "traveled/went/moved to X" → X is PLACE or ORG
  motion_to: {
    preps: ['to', 'toward', 'towards', 'into'],
    verbs: ['travel', 'traveled', 'go', 'went', 'move', 'moved', 'journey', 'journeyed', 'walk', 'walked', 'run', 'ran', 'flee', 'fled', 'return', 'returned'],
    objectType: 'PLACE' as EntityType  // Default to PLACE, but can be ORG for schools
  },

  // "lived/dwelt in X" → X is PLACE
  location_in: {
    preps: ['in', 'within'],
    verbs: ['live', 'lived', 'dwell', 'dwelt', 'reside', 'resided', 'settle', 'settled', 'stay', 'stayed', 'remain', 'remained'],
    objectType: 'PLACE' as EntityType
  },

  // "studied/taught at X" → X is ORG
  education_at: {
    preps: ['at'],
    verbs: ['study', 'studied', 'teach', 'taught', 'attend', 'attended', 'learn', 'learned', 'work', 'worked'],
    objectType: 'ORG' as EntityType
  },

  // "fought in X" → X is EVENT or PLACE
  combat_in: {
    preps: ['in', 'at', 'during'],
    verbs: ['fight', 'fought', 'battle', 'battled', 'war', 'warred', 'participate', 'participated'],
    objectType: 'EVENT' as EntityType  // Prefer EVENT, but can be PLACE
  }
};

/**
 * Extract context hints for an entity from the dependency parse
 */
export function analyzeEntityContext(
  entityTokens: Token[],
  allTokens: Token[],
  sentence: ParsedSentence
): ContextHints {
  if (entityTokens.length === 0) {
    return { nearbyVerbs: [], nearbyPreps: [] };
  }

  const mainToken = entityTokens[0]; // Use first token as representative
  const hints: ContextHints = {
    nearbyVerbs: [],
    nearbyPreps: [],
    dependencyRole: mainToken.dep
  };

  // Find governing verb (head of dependency chain)
  if (mainToken.head !== mainToken.i) {
    const headToken = allTokens.find(t => t.i === mainToken.head);

    if (headToken) {
      // Direct verbal head
      if (headToken.pos === 'VERB' || headToken.pos === 'AUX') {
        hints.governingVerb = headToken.text;
        hints.governingVerbLemma = headToken.lemma.toLowerCase();

        if (mainToken.dep === 'nsubj') {
          hints.isSubjectOf = hints.governingVerbLemma;
        } else if (mainToken.dep === 'dobj') {
          hints.isObjectOf = hints.governingVerbLemma;
        }
      }

      // Prepositional object: track preposition and its head verb
      if (mainToken.dep === 'pobj' && headToken.pos === 'ADP') {
        hints.preposition = headToken.text.toLowerCase();
        hints.isPrepObjectOf = hints.preposition;

        // Find the verb that governs the preposition
        if (headToken.head !== headToken.i) {
          const prepHead = allTokens.find(t => t.i === headToken.head);
          if (prepHead && (prepHead.pos === 'VERB' || prepHead.pos === 'AUX')) {
            hints.governingVerb = prepHead.text;
            hints.governingVerbLemma = prepHead.lemma.toLowerCase();
          }
        }
      }
    }
  }

  // Collect nearby verbs and prepositions (within 5 tokens)
  const entityStart = entityTokens[0].i;
  const entityEnd = entityTokens[entityTokens.length - 1].i;

  for (const token of allTokens) {
    const distance = Math.min(
      Math.abs(token.i - entityStart),
      Math.abs(token.i - entityEnd)
    );

    if (distance <= 5) {
      if (token.pos === 'VERB' || token.pos === 'AUX') {
        hints.nearbyVerbs.push(token.lemma.toLowerCase());
      }
      if (token.pos === 'ADP') {
        hints.nearbyPreps.push(token.text.toLowerCase());
      }
    }
  }

  // Store spaCy NER label as hint
  hints.spacyLabel = mainToken.ent || undefined;

  return hints;
}

/**
 * Classify entity type using context-aware linguistic rules
 *
 * Priority:
 * 1. Strong syntactic evidence (verb-argument patterns)
 * 2. Dependency role constraints
 * 3. Preposition + verb combinations
 * 4. spaCy NER label (weighted by context)
 * 5. Lexical heuristics (geographic markers, org keywords)
 */
export function classifyWithContext(
  entityText: string,
  context: ContextHints,
  fallbackType?: EntityType
): EntityType {
  const textLower = entityText.toLowerCase();
  const verbLemma = context.governingVerbLemma;
  const prep = context.preposition;

  // Rule 1: Verb-Object Patterns (highest priority)
  // "X ruled Y" → Y is PLACE
  if (context.isObjectOf && verbLemma) {
    // Governance verbs
    if (VERB_PATTERNS.governance_object.verbs.includes(verbLemma)) {
      return VERB_PATTERNS.governance_object.objectType;
    }

    // Leadership verbs
    if (VERB_PATTERNS.leadership_object.verbs.includes(verbLemma)) {
      return VERB_PATTERNS.leadership_object.objectType;
    }

    // Founding verbs
    if (VERB_PATTERNS.founding_object.verbs.includes(verbLemma)) {
      return VERB_PATTERNS.founding_object.objectType;
    }

    // Social verbs
    if (VERB_PATTERNS.social_both.verbs.includes(verbLemma)) {
      return VERB_PATTERNS.social_both.objectType;
    }
  }

  // Rule 2: Verb-Subject Patterns
  // "X traveled" → X is PERSON
  if (context.isSubjectOf && verbLemma) {
    // Check all subject-constraining verb patterns
    for (const pattern of Object.values(VERB_PATTERNS)) {
      if (pattern.subjectType && pattern.verbs.includes(verbLemma)) {
        return pattern.subjectType;
      }
    }
  }

  // Rule 3: Preposition + Verb Patterns
  // "traveled to X" → X is PLACE
  // "studied at X" → X is ORG
  if (context.isPrepObjectOf && prep && verbLemma) {
    // Motion to place
    if (PREP_VERB_PATTERNS.motion_to.preps.includes(prep) &&
        PREP_VERB_PATTERNS.motion_to.verbs.includes(verbLemma)) {
      // Check for school/educational context
      if (/school|university|academy|college|hogwarts/i.test(entityText)) {
        return 'ORG';
      }
      return PREP_VERB_PATTERNS.motion_to.objectType;
    }

    // Location in place
    if (PREP_VERB_PATTERNS.location_in.preps.includes(prep) &&
        PREP_VERB_PATTERNS.location_in.verbs.includes(verbLemma)) {
      return PREP_VERB_PATTERNS.location_in.objectType;
    }

    // Education at organization
    if (PREP_VERB_PATTERNS.education_at.preps.includes(prep) &&
        PREP_VERB_PATTERNS.education_at.verbs.includes(verbLemma)) {
      return PREP_VERB_PATTERNS.education_at.objectType;
    }

    // Combat in event/place
    if (PREP_VERB_PATTERNS.combat_in.preps.includes(prep) &&
        PREP_VERB_PATTERNS.combat_in.verbs.includes(verbLemma)) {
      // Check for battle/war keywords
      if (/battle|war|conflict|siege|skirmish/i.test(entityText)) {
        return 'EVENT';
      }
      return PREP_VERB_PATTERNS.combat_in.objectType;
    }
  }

  // Rule 4: Dependency Role Heuristics
  if (context.dependencyRole === 'nsubj') {
    // Nominal subjects of action verbs are usually PERSON
    if (context.nearbyVerbs.length > 0) {
      return 'PERSON';
    }
  }

  if (context.dependencyRole === 'pobj') {
    // Prepositional objects after location preps are usually PLACE
    if (prep && ['in', 'to', 'from', 'near', 'at'].includes(prep)) {
      // But "at" with work/study verbs → ORG
      if (prep === 'at' && verbLemma &&
          ['work', 'study', 'teach', 'attend', 'learn'].includes(verbLemma)) {
        return 'ORG';
      }
      return 'PLACE';
    }
  }

  // Rule 5: Lexical Markers (intrinsic to entity name)
  // Geographic markers
  if (/\b(river|creek|stream|mountain|mount|peak|hill|valley|lake|sea|ocean|island|forest|desert|plain|city|town|village|kingdom|realm|land)\b/i.test(entityText)) {
    return 'PLACE';
  }

  // Organizational markers
  if (/\b(school|university|academy|college|ministry|department|company|corporation|inc|llc|corp|ltd|bank|institute)\b/i.test(entityText)) {
    return 'ORG';
  }

  // House/Order markers
  if (/\b(house|order|clan|tribe|dynasty)\b/i.test(entityText)) {
    return 'HOUSE';
  }

  // Event markers
  if (/\b(battle|war|treaty|accord|council|conference|summit)\s+of\b/i.test(entityText)) {
    return 'EVENT';
  }

  // Rule 6: spaCy NER Label (contextualized)
  // Trust spaCy more when we have confirming evidence
  if (context.spacyLabel) {
    const spacyType = mapSpacyLabel(context.spacyLabel);
    if (spacyType) {
      // If spaCy says GPE (geopolitical entity), use context to decide PLACE vs ORG
      if (context.spacyLabel === 'GPE') {
        // "ruled X" where X is GPE → PLACE
        if (verbLemma && VERB_PATTERNS.governance_object.verbs.includes(verbLemma) &&
            context.isObjectOf) {
          return 'PLACE';
        }
        // "studied at X" where X is GPE → ORG
        if (verbLemma && ['study', 'teach', 'attend', 'work'].includes(verbLemma) &&
            prep === 'at') {
          return 'ORG';
        }
        // Default GPE → PLACE
        return 'PLACE';
      }

      // Trust spaCy for PERSON, ORG if context doesn't contradict
      return spacyType;
    }
  }

  // Rule 7: Fallback type (from previous classification)
  if (fallbackType) {
    return fallbackType;
  }

  // Rule 8: Default heuristic
  // Single capitalized word in narrative context → likely PERSON
  return 'PERSON';
}

/**
 * Map spaCy NER labels to EntityType
 */
function mapSpacyLabel(label: string): EntityType | null {
  switch (label) {
    case 'PERSON':
      return 'PERSON';
    case 'ORG':
      return 'ORG';
    case 'GPE':
    case 'LOC':
      return 'PLACE';
    case 'DATE':
      return 'DATE';
    case 'WORK_OF_ART':
      return 'WORK';
    case 'NORP':
      return 'HOUSE';
    default:
      return null;
  }
}

/**
 * Check if entity should be classified based on verb pattern
 * Used by dependency-based extraction to decide whether to extract an entity
 */
export function shouldExtractByContext(context: ContextHints): boolean {
  const verbLemma = context.governingVerbLemma;
  const role = context.dependencyRole;

  // Extract subjects of action verbs
  if (role === 'nsubj' && verbLemma) {
    return true;
  }

  // Extract objects of social/governance/founding verbs
  if (role === 'dobj' && verbLemma) {
    for (const pattern of Object.values(VERB_PATTERNS)) {
      if (pattern.verbs.includes(verbLemma)) {
        return true;
      }
    }
  }

  // Extract prepositional objects with meaningful verb+prep combinations
  if (role === 'pobj' && context.preposition && verbLemma) {
    for (const pattern of Object.values(PREP_VERB_PATTERNS)) {
      if (pattern.preps.includes(context.preposition) &&
          pattern.verbs.includes(verbLemma)) {
        return true;
      }
    }
  }

  return false;
}
