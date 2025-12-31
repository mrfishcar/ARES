/**
 * Narrative Relation Extraction (Phase E3)
 *
 * Pattern-based extraction for relationships that dependency parsing misses:
 * - Past tense narratives: "married eight years earlier"
 * - Possessive patterns: "their daughter"
 * - Appositive patterns: "Jun Park, their oldest friend"
 */

import { v4 as uuid } from "uuid";
import type { Relation, EntityType } from "./schema";
import type { CorefLinks, CorefLink } from "./coref";
import { getDynamicPatterns, type RelationPattern as DynamicRelationPattern } from "./dynamic-pattern-loader";
import { resolveMentionToCanonical, isPronoun } from "./pipeline/coref-utils";
import { ReferenceResolver, type EntitySpan as RefEntitySpan, type Sentence as RefSentence } from "./reference-resolver";

// =============================================================================
// LIGHTWEIGHT PRONOUN RESOLVER
// =============================================================================

/**
 * Gender type for pronoun resolution
 */
type Gender = 'male' | 'female' | 'neutral' | 'unknown';

/**
 * Pronoun gender/number info
 */
interface PronounInfo {
  gender: Gender;
  plural: boolean;
}

/**
 * Common personal pronouns with gender info
 */
const PRONOUN_INFO: Record<string, PronounInfo> = {
  // Male singular
  'he': { gender: 'male', plural: false },
  'him': { gender: 'male', plural: false },
  'his': { gender: 'male', plural: false },
  'himself': { gender: 'male', plural: false },
  // Female singular
  'she': { gender: 'female', plural: false },
  'her': { gender: 'female', plural: false },
  'hers': { gender: 'female', plural: false },
  'herself': { gender: 'female', plural: false },
  // Plural/neutral
  'they': { gender: 'neutral', plural: true },
  'them': { gender: 'neutral', plural: true },
  'their': { gender: 'neutral', plural: true },
  'theirs': { gender: 'neutral', plural: true },
  'themselves': { gender: 'neutral', plural: true },
};

/**
 * Common male names for gender inference
 */
const MALE_NAMES = new Set([
  'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph',
  'thomas', 'charles', 'christopher', 'daniel', 'matthew', 'anthony', 'mark',
  'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian',
  'george', 'edward', 'ronald', 'timothy', 'jason', 'jeffrey', 'ryan', 'jacob',
  'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott',
  'harry', 'ron', 'draco', 'severus', 'albus', 'sirius', 'remus', 'peter',
  'aragorn', 'gandalf', 'frodo', 'sam', 'legolas', 'gimli', 'boromir', 'faramir',
  'arthur', 'merlin', 'lancelot', 'mordred', 'uther', 'percival', 'gawain',
  'caesar', 'brutus', 'augustus', 'nero', 'tiberius', 'marcus', 'gaius',
  'alexander', 'aristotle', 'plato', 'socrates', 'homer', 'achilles', 'odysseus',
]);

/**
 * Common female names for gender inference
 */
const FEMALE_NAMES = new Set([
  'mary', 'patricia', 'jennifer', 'linda', 'barbara', 'elizabeth', 'susan',
  'jessica', 'sarah', 'karen', 'nancy', 'lisa', 'betty', 'margaret', 'sandra',
  'ashley', 'kimberly', 'emily', 'donna', 'michelle', 'dorothy', 'carol',
  'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura',
  'hermione', 'ginny', 'luna', 'cho', 'minerva', 'molly', 'bellatrix', 'lily',
  'arwen', 'galadriel', 'eowyn', 'rosie',
  'guinevere', 'morgana', 'igraine', 'nimue',
  'cleopatra', 'livia', 'agrippina', 'julia',
  'helen', 'athena', 'aphrodite', 'artemis', 'persephone', 'penelope',
  'catelyn', 'sansa', 'arya', 'cersei', 'daenerys', 'brienne', 'margaery',
]);

/**
 * Infer gender from entity name
 */
function inferGenderFromName(name: string): Gender {
  const firstName = name.split(/\s+/)[0].toLowerCase();

  // Check name lists
  if (MALE_NAMES.has(firstName)) return 'male';
  if (FEMALE_NAMES.has(firstName)) return 'female';

  // Check title prefixes
  if (/^(mr|sir|lord|king|prince|duke|baron)\b/i.test(name)) return 'male';
  if (/^(mrs|ms|miss|lady|queen|princess|duchess|baroness)\b/i.test(name)) return 'female';

  return 'unknown';
}

/**
 * Learn gender from contextual patterns in text
 * E.g., "Their son, Cael Calder" → Cael Calder is male
 *       "The couple's daughter, Mira" → Mira is female
 */
function learnGenderFromContext(text: string): Map<string, Gender> {
  const learnedGender = new Map<string, Gender>();

  // Pattern: "their/the couple's son/daughter, Name" or "their son/daughter Name"
  const sonDaughterPattern = /\b(?:their|the\s+couple'?s?|his|her)\s+(son|daughter|child)\s*,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi;
  let match;
  while ((match = sonDaughterPattern.exec(text)) !== null) {
    const role = match[1].toLowerCase();
    const name = match[2];
    const normalizedName = name.toLowerCase();

    if (role === 'son') {
      learnedGender.set(normalizedName, 'male');
    } else if (role === 'daughter') {
      learnedGender.set(normalizedName, 'female');
    }
  }

  // Pattern: "Name, the/their son/daughter" or "Name, son of X"
  const appositivePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*,\s*(?:the\s+)?(?:their\s+)?(son|daughter|child)\b/gi;
  while ((match = appositivePattern.exec(text)) !== null) {
    const name = match[1];
    const role = match[2].toLowerCase();
    const normalizedName = name.toLowerCase();

    if (role === 'son') {
      learnedGender.set(normalizedName, 'male');
    } else if (role === 'daughter') {
      learnedGender.set(normalizedName, 'female');
    }
  }

  // Pattern: "wife/husband Name" or "his wife Name"
  const spousePattern = /\b(?:his|her|the)\s+(wife|husband)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi;
  while ((match = spousePattern.exec(text)) !== null) {
    const role = match[1].toLowerCase();
    const name = match[2];
    const normalizedName = name.toLowerCase();

    if (role === 'husband') {
      learnedGender.set(normalizedName, 'male');
    } else if (role === 'wife') {
      learnedGender.set(normalizedName, 'female');
    }
  }

  // Pattern: "brother/sister Name"
  const siblingPattern = /\b(?:his|her|their)\s+(brother|sister)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi;
  while ((match = siblingPattern.exec(text)) !== null) {
    const role = match[1].toLowerCase();
    const name = match[2];
    const normalizedName = name.toLowerCase();

    if (role === 'brother') {
      learnedGender.set(normalizedName, 'male');
    } else if (role === 'sister') {
      learnedGender.set(normalizedName, 'female');
    }
  }

  return learnedGender;
}

/**
 * Find sentence boundaries in text
 */
function findSentenceBoundaries(text: string): number[] {
  const boundaries: number[] = [0];
  const sentenceEnders = /[.!?]+\s+/g;
  let match;
  while ((match = sentenceEnders.exec(text)) !== null) {
    boundaries.push(match.index + match[0].length);
  }
  return boundaries;
}

/**
 * Check if position is near start of a sentence (subject position)
 */
function isSubjectPosition(position: number, sentenceBoundaries: number[]): boolean {
  for (const boundary of sentenceBoundaries) {
    // Within first 30% of sentence or first 50 chars after boundary
    if (position >= boundary && position < boundary + 50) {
      return true;
    }
  }
  return false;
}

/**
 * Advanced recency-based pronoun resolver with salience scoring
 *
 * Features:
 * - Gender-based matching (he→male, she→female, they→any)
 * - Recency-based resolution (closer mentions preferred)
 * - Subject position prioritization (entities at sentence start get bonus)
 * - Ambiguity detection (lowers confidence if multiple candidates are close)
 * - Sentence boundary awareness (paragraph breaks reduce salience)
 */
function buildSimpleCorefLinks(
  text: string,
  entities: { id: string; canonical: string; type: EntityType }[]
): CorefLinks {
  const links: CorefLink[] = [];
  const quotes: CorefLinks['quotes'] = [];

  // Learn gender from contextual patterns like "their son, Cael Calder"
  const learnedGenders = learnGenderFromContext(text);

  // Only resolve for PERSON entities
  const personEntities = entities
    .filter(e => e.type === 'PERSON')
    .map(e => {
      // First try name-based inference
      let gender = inferGenderFromName(e.canonical);

      // If unknown, try learned gender from context
      if (gender === 'unknown') {
        const normalizedName = e.canonical.toLowerCase();
        const contextGender = learnedGenders.get(normalizedName);
        if (contextGender) {
          gender = contextGender;
        }
      }

      return { ...e, gender };
    });

  if (personEntities.length === 0) {
    return { links, quotes };
  }

  // Find sentence boundaries for subject position detection
  const sentenceBoundaries = findSentenceBoundaries(text);

  // Find all entity mentions with positions and salience info
  interface EntityMention {
    entityId: string;
    name: string;
    position: number;
    gender: Gender;
    isSubject: boolean;
  }

  const entityMentions: EntityMention[] = [];

  for (const entity of personEntities) {
    // Find canonical name
    const canonicalRegex = new RegExp(`\\b${escapeRegex(entity.canonical)}\\b`, 'gi');
    let match;
    while ((match = canonicalRegex.exec(text)) !== null) {
      entityMentions.push({
        entityId: entity.id,
        name: entity.canonical,
        position: match.index,
        gender: entity.gender,
        isSubject: isSubjectPosition(match.index, sentenceBoundaries),
      });
    }

    // Also search for first names only (e.g., "Harry" for "Harry Potter")
    const firstName = entity.canonical.split(/\s+/)[0];
    if (firstName.length > 2 && firstName !== entity.canonical) {
      const firstNameRegex = new RegExp(`\\b${escapeRegex(firstName)}\\b`, 'gi');
      while ((match = firstNameRegex.exec(text)) !== null) {
        // Avoid duplicates
        if (!entityMentions.some(m => m.position === match!.index)) {
          entityMentions.push({
            entityId: entity.id,
            name: firstName,
            position: match.index,
            gender: entity.gender,
            isSubject: isSubjectPosition(match.index, sentenceBoundaries),
          });
        }
      }
    }
  }

  // Sort by position
  entityMentions.sort((a, b) => a.position - b.position);

  // Find pronouns and resolve them with salience scoring
  const pronounRegex = /\b(He|She|They|he|she|they|Him|Her|Them|him|her|them|His|Her|Their|his|her|their)\b/g;
  let pronounMatch;

  while ((pronounMatch = pronounRegex.exec(text)) !== null) {
    const pronounText = pronounMatch[0];
    const pronounLower = pronounText.toLowerCase();
    const pronounInfo = PRONOUN_INFO[pronounLower];

    if (!pronounInfo) continue;

    const pronounPos = pronounMatch.index;
    const maxDistance = 500;

    // Score all candidates
    interface ScoredCandidate {
      mention: EntityMention;
      score: number;
      distance: number;
    }

    const candidates: ScoredCandidate[] = [];

    for (const mention of entityMentions) {
      // Only consider mentions before the pronoun
      if (mention.position >= pronounPos) continue;

      const distance = pronounPos - mention.position;
      if (distance > maxDistance) continue;

      // Check gender compatibility
      const genderMatch =
        pronounInfo.gender === 'neutral' ||
        mention.gender === 'unknown' ||
        pronounInfo.gender === mention.gender;

      if (!genderMatch) continue;

      // Calculate salience score
      // Base: recency (exponential decay with distance)
      let score = Math.exp(-distance / 200);

      // Bonus: subject position (3x weight like in salience-resolver)
      if (mention.isSubject) {
        score *= 3.0;
      }

      // Penalty: crossing sentence boundaries
      const sentencesCrossed = sentenceBoundaries.filter(
        b => b > mention.position && b < pronounPos
      ).length;
      score *= Math.pow(0.8, sentencesCrossed); // 0.8 decay per sentence

      candidates.push({ mention, score, distance });
    }

    if (candidates.length === 0) continue;

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    const best = candidates[0];
    const second = candidates[1];

    // Check for ambiguity (if second-best is within 1.5x of best)
    let confidence = 0.75;
    if (second && second.score > best.score / 1.5) {
      // Ambiguous case - lower confidence
      confidence = 0.55;
    }

    // Very close match gets higher confidence
    if (best.distance < 50 && !second) {
      confidence = 0.85;
    }

    links.push({
      mention: {
        text: pronounText,
        start: pronounPos,
        end: pronounPos + pronounText.length,
        sentence_index: 0, // Simplified
        type: 'pronoun',
      },
      entity_id: best.mention.entityId,
      confidence,
      method: 'pronoun_stack',
    });
  }

  return { links, quotes };
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================================
// TEXT NORMALIZATION
// =============================================================================

/**
 * Normalize text for pattern matching
 * Removes leading conjunctions and articles that interfere with pattern matching
 */
function normalizeTextForPatterns(text: string): string {
  let normalized = text.trim();

  // Split into sentences, normalize each, then rejoin
  // Use a simple heuristic: split on period + space, exclamation, question mark
  const sentences = normalized.split(/(?<=[.!?])\s+/);

  const normalizedSentences = sentences.map(sent => {
    let s = sent.trim();

    // Remove leading conjunctions at sentence start
    s = s.replace(/^(And|But|Then|So|For|Yet|Nor|Or)\s+/i, '');

    // Remove leading articles
    s = s.replace(/^(The|A|An)\s+/i, '');

    return s;
  });

  normalized = normalizedSentences.join(' ');

  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ');

  return normalized;
}

/**
 * Relation pattern definition
 */
interface RelationPattern {
  regex: RegExp;
  predicate: string;
  symmetric?: boolean;
  extractSubj?: number | null;  // Capture group for subject (default: 1)
  extractObj?: number | null;   // Capture group for object (default: 2)
  typeGuard?: {
    subj?: EntityType[];
    obj?: EntityType[];
  };
  coordination?: boolean;
  listExtraction?: boolean;
  reversed?: boolean;
}

/**
 * Narrative relation patterns
 * Ordered by specificity (more specific patterns first)
 */
const NARRATIVE_PATTERNS: RelationPattern[] = [
  // Multi-subject lives_in: "Aria and Elias lived in Meridian Ridge"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+and\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)+)\s+(?:lived|dwelt|dwelled|resides|resided)\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'lives_in',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] }
  },
  // Pronoun-based rivalry: "Each woman became an enemy of the other"
  {
    regex: /\b((?:Each|each|Both|both|The|the)\s+(?:woman|women|man|men|strategist|strategists|leader|leaders|guardian|guardians))\s+(?:became|remained|was|were)\s+(?:an\s+)?(?:enemy|enemies|rival|rivals|adversary|adversaries|opponent|opponents)\s+of\s+(?:the\s+)?(other|each\s+other|one\s+another)\b/g,
    predicate: 'enemy_of',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] },
    extractSubj: 1,
    extractObj: 2
  },
  // === MARRIAGE PATTERNS ===
  // "X was Y's wife/husband" → married_to (possessive)
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:was|is)\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)'s\s+(?:wife|husband|spouse|partner)\b/g,
    predicate: 'married_to',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X was the husband/wife of Y" → married_to (prepositional)
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:was|is|became)\s+the\s+(?:husband|wife|spouse|partner)\s+of\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'married_to',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "Aria married Elias", "Aria and Elias married"
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:married|wed)\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'married_to',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "Aria and Elias married", "The couple married"
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+and\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:married|wed)\b/g,
    predicate: 'married_to',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] },
    extractSubj: null,
    extractObj: null,  // Both are subjects
    coordination: true
  },
  // "The couple married eight years earlier" - requires coreference for "couple"
  // Note: Use negative lookbehind to exclude possessive "couple's"
  {
    regex: /\b((?:the|a)\s+couple)(?!'s)\s+(?:had\s+)?married\b/gi,
    predicate: 'married_to',
    symmetric: true,
    extractSubj: 1,
    extractObj: 1,  // Same as subject - both are "the couple"
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
    // Note: Will resolve "the couple" to multiple entities via coreference
  },

  // === ARCHAIC/BIBLICAL PATTERNS ===
  // "X's husband/wife died" → married_to(X, husband/wife reference)
  // For biblical text like "And Naomi's husband died"
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)'s\s+(?:husband|wife|spouse)\s+(?:died|had died|was dead)\b/g,
    predicate: 'married_to',
    symmetric: true,
    extractSubj: 1,
    extractObj: 1,  // Same person - indicates marriage to the named person
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X's son/daughter of Y" or "X's two sons" for genealogies
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)'s\s+(?:(?:two|three|four)?\s+)?(?:sons?|daughters?|children?)\b/g,
    predicate: 'parent_of',
    extractSubj: 1,
    extractObj: 1,  // Indicates parenthood for the named person
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X begat Y" - Biblical genealogy pattern
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:begat|begot|fathered)\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'parent_of',
    symmetric: false,
    extractSubj: 1,  // Parent
    extractObj: 2,   // Child
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "son/daughter of X" - Alternative genealogy pattern
  {
    regex: /\b(?:the\s+)?(?:son|daughter|child)\s+of\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b(?:,?\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*))?/g,
    predicate: 'parent_of',
    extractSubj: 1,  // Parent
    extractObj: 2,   // Child (if mentioned)
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // === FRIENDSHIP PATTERNS ===
  // COORDINATION: "Harry and Ron were friends"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:were|are|became|remained)\s+(?:best\s+)?friends?\b/g,
    predicate: 'friends_with',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] },
    extractSubj: null,
    extractObj: null,  // Both are subjects - special handling needed
    coordination: true
  },
  // "Aria remained friends with Elias", "Jun also struck a friendship with Elias"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:also\s+)?(?:remained|stayed|became|was|were|struck)\s+(?:a\s+)?(?:best\s+)?(?:friendship|friends?)\s+with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'friends_with',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "Aria and Elias remained friends"
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+and\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:remained|stayed|became|were)\s+(?:best\s+)?friends?\b/g,
    predicate: 'friends_with',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // Possessive: "Harry's best friend was Ron Weasley"
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)'s\s+(?:best\s+)?friend\s+(?:was|is)\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'friends_with',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X became friends with Y and Z" - extracts FIRST friend
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:became|quickly became)\s+friends?\s+with\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+and\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'friends_with',
    extractSubj: 1,
    extractObj: 2,  // First friend
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X became friends with Y and Z" - extracts SECOND friend (same regex, different extraction)
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:became|quickly became)\s+friends?\s+with\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+and\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'friends_with',
    extractSubj: 1,
    extractObj: 3,  // Second friend (after "and")
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X became friends with Y" (single friend, no coordination)
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:became|quickly became)\s+friends?\s+with\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'friends_with',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X became close/good friends with Y"
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+became\s+(?:close|good|best)\s+friends?\s+with\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'friends_with',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // === EDUCATION/STUDIES PATTERNS ===
  // "X started at Y", "X studies at Y", "X was a student at Y"
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:started|studied|studies)\s+at\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'studies_at',
    typeGuard: { subj: ['PERSON'], obj: ['ORG'] }
  },
  // "X was a [adjective] student at Y" (handles "unique student", "brilliant student")
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:was|is)\s+a\s+(?:\w+\s+)?(?:student|pupil)\s+at\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'studies_at',
    typeGuard: { subj: ['PERSON'], obj: ['ORG'] }
  },

  // === TEACHING/LEADERSHIP PATTERNS ===
  // "X teaches at Y", "Professor X teaches at Y", "X taught [SUBJECT] at Y"
  // Note: subject can be lowercase (e.g., "taught hydrokinetics at") or capitalized
  {
    regex: /\b(?:Professor\s+)?([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:teaches|taught)\s+(?:[a-zA-Z]+\s+)?at\s+(?:the\s+)?(?:same\s+)?([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'teaches_at',
    typeGuard: { subj: ['PERSON'], obj: ['ORG'] }
  },
  // "X was the headmaster/director/dean of Y" → leads
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:was|is)\s+the\s+(?:headmaster|headmistress|director|dean|principal|chancellor)\s+of\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'leads',
    typeGuard: { subj: ['PERSON'], obj: ['ORG'] }
  },
  // "X leads/directs Y"
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:leads|lead|directs|directed|heads|headed)\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'leads',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'HOUSE'] }
  },
  // "X was/is the head of Y"
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:was|is)\s+(?:also\s+)?the\s+head\s+of\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)/g,
    predicate: 'leads',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'HOUSE'] }
  },
  // "She/He was (also) the head of Y" - PRONOUN VERSION
  {
    regex: /\b((?:He|She|They|he|she|they))\s+(?:was|is|were)\s+(?:also\s+)?the\s+head\s+of\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)/g,
    predicate: 'leads',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'HOUSE'] },
    extractSubj: 1,
    extractObj: 2
  },
  // "The X later became headmaster/headmistress" - nominal subject
  {
    regex: /\bThe\s+(?:\w+\s+)?(?:professor|teacher|wizard|witch)\s+(?:later\s+)?became\s+(?:the\s+)?(?:headmaster|headmistress|head|principal)\b/gi,
    predicate: 'leads',
    typeGuard: { subj: ['PERSON'], obj: ['ORG'] },
    extractSubj: null, // Requires nominal resolution
    extractObj: null   // Requires school context
  },

  // === LOCATION/RESIDENCE PATTERNS ===
  // "He/She lived at Y" - PRONOUN VERSION
  {
    regex: /\b((?:He|She|They|he|she|they))\s+(?:lived|dwelt|dwelled|resides|resided|lives)\s+(?:at|in)\s+(?:the\s+)?([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'lives_in',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] },
    extractSubj: 1,  // Pronoun in group 1
    extractObj: 2    // Place in group 2
  },
  // "X lived at Y" (handles "lived at the Burrow")
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:lived|dwelt|dwelled|resides|resided|lives)\s+at\s+(?:the\s+)?([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'lives_in',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] }
  },
  // "lived with X in Y" - extract lives_in(subj, Y) relation
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:lived|dwelt|dwelled|resides|resided)\s+with\s+[^.]+?\s+in\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'lives_in',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] }
  },
  // "He/She lived with X in Y" - PRONOUN VERSION
  {
    regex: /\b((?:He|She|They|he|she|they))\s+(?:lived|dwelt|dwelled|resides|resided)\s+with\s+[^.]+?\s+in\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'lives_in',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] },
    extractSubj: 1,
    extractObj: 2
  },
  // Simple "X lived in Y"
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:lived|dwelt|dwelled|resides|resided|lives)\s+in\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'lives_in',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] }
  },

  // === EMPLOYMENT PATTERNS ===
  // "X worked at/in/for Y"
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:worked|works|labored|labors|served|serves|employed)\s+(?:at|in|for)\s+(?:the\s+)?([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'works_at',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'PLACE'] }
  },

  // === ENEMY PATTERNS ===
  // APPOSITIVE + PRONOUN: "Name, [stuff]. He became rival to Target"
  // This handles cases where pronoun resolution might fail by capturing the name directly
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s*,\s+[^.]{5,100}\.\s+(?:He|She|They|he|she|they)\s+(?:became|remained|was|were)\s+(?:an?\s+)?(?:enemy|enemies|rival|rivals|adversary|adversaries)\s+(?:of|to)\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'enemy_of',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] },
    extractSubj: 1,  // Name before comma
    extractObj: 2    // Target name after "to/of"
  },
  // "X became a rival TO Y" (handles both "of" and "to") - PRONOUN VERSION
  // "He/She became a rival/enemy to/of Y"
  {
    regex: /\b((?:He|She|They|he|she|they))\s+(?:became|remained|was|were)\s+(?:an?\s+)?(?:enemy|enemies|rival|rivals|adversary|adversaries)\s+(?:of|to)\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'enemy_of',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] },
    extractSubj: 1,  // Pronoun in group 1
    extractObj: 2,   // Object name in group 2
    reversed: false
  },
  // "X became a rival TO Y" (handles both "of" and "to") - PROPER NAME VERSION
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:became|remained|was|were)\s+(?:an?\s+)?(?:enemy|enemies|rival|rivals)\s+(?:of|to)\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'enemy_of',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X faced/fought/battled Y" → enemy_of
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:faced|fought|battled|confronted|challenged)\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'enemy_of',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "Aria and Kara became enemies"
  {
    regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+and\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:became|remained|were)\s+(?:enemies|rivals)\b/g,
    predicate: 'enemy_of',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "the rivalry between Aria and Kara"
  {
    regex: /\bthe\s+rivalry\s+between\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+and\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\b/g,
    predicate: 'enemy_of',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // === FAMILY/PARENT PATTERNS ===
  // Pattern: "child of X and Y" - First parent relation
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[^.]{0,100}?\b(?:child|daughter|son)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'parent_of',
    extractSubj: 2,  // First parent
    extractObj: 1,   // Child
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // Pattern: "child of X and Y" - Second parent relation (same regex, different extraction)
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[^.]{0,100}?\b(?:child|daughter|son)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'parent_of',
    extractSubj: 3,  // Second parent (group 3)
    extractObj: 1,   // Child
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // Pronoun-aware: "she/he was the child of X and Y" - First parent
  {
    regex: /\b(she|he)\s+was\s+(?:equally\s+)?(?:the\s+)?(?:child|daughter|son)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
    predicate: 'parent_of',
    extractSubj: 2,  // First parent
    extractObj: 1,   // Pronoun (child) - uses coreference
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // Pronoun-aware: "she/he was the child of X and Y" - Second parent
  {
    regex: /\b(she|he)\s+was\s+(?:equally\s+)?(?:the\s+)?(?:child|daughter|son)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
    predicate: 'parent_of',
    extractSubj: 3,  // Second parent
    extractObj: 1,   // Pronoun (child) - uses coreference
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // Pattern: "X is the son/daughter of Y" or "Mira, daughter of Aria" or "Cael, son of Elias"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+is\s+(?:the\s+)?(?:son|daughter|child)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'parent_of',
    extractSubj: 2,  // Parent is object of "of"
    extractObj: 1,   // Child is subject (the person after "is")
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // Pattern: "Mira, daughter of Aria" or "Cael, son of Elias"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*,?\s+(?:the\s+)?(?:daughter|son|child)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'parent_of',
    extractSubj: 2,  // Parent is object of "of"
    extractObj: 1,   // Child is subject
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // Pattern: "X, descendant of Y" or "X was a descendant of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*,?\s*(?:was\s+)?(?:a\s+)?(?:the\s+)?(?:descendant|offspring)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
    predicate: 'child_of',
    extractSubj: 1,  // Descendant is child
    extractObj: 2,   // Ancestor is parent
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // Pattern: "X, heir of Y" or "X is the heir of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*,?\s*(?:was\s+|is\s+)?(?:the\s+)?heir\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
    predicate: 'child_of',
    extractSubj: 1,  // Heir is child
    extractObj: 2,   // Person being inherited from is parent
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // Pattern: "The couple's daughter, Mira" or "Their son, Cael"
  // Note: This requires special handling - need to resolve "couple"/"their" first
  {
    regex: /\b(the\s+couple'?s?|their)\s+(?:daughter|son|child|children)\s*,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
    predicate: 'parent_of',
    extractSubj: 1,  // This will be "their" or "the couple's" - needs coreference
    extractObj: 2,   // This is the child name
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // Possessive parent: "His/Her father/mother NAME"
  {
    regex: /\b(His|Her|his|her)\s+(father|mother)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'parent_of',
    extractSubj: 3,  // Parent name
    extractObj: 1,   // Pronoun - needs coreference resolution
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // LIST: "Their children included X, Y, Z" → child_of for each
  {
    regex: /\b(Their|His|Her|his|her|their)\s+children\s+included\s*/gi,
    predicate: 'child_of',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] },
    listExtraction: true,
    reversed: true  // Children are child_of the parents (not parents have children)
  },

  // === EDUCATION PATTERNS ===
  // COORDINATION: "Harry and Ron studied at Hogwarts"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:(?:continued\s+(?:to\s+)?)|still\s+|kept\s+)?(?:studied|studying|studies|study|enrolled|attended|attends|attend)\s+(?:at|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'studies_at',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'PLACE'] },
    extractSubj: null,  // Special handling - will extract both subjects
    extractObj: 3,
    coordination: true  // Mark this as a coordination pattern
  },
  // SINGLE SUBJECT: "Aria studied at Meridian Academy"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:(?:continued\s+(?:to\s+)?)|still\s+|kept\s+)?(?:studied|studying|studies|enrolled|attended|attends)\s+(?:at|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'studies_at',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'PLACE'] }
  },
  // Pronoun-aware: "She continued studying at X"
  {
    regex: /\b(He|She)\s+(?:(?:continued\s+(?:to\s+)?)|still\s+|kept\s+)?(?:studied|studying|studies|enrolled|attended|attends)\s+(?:at|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'studies_at',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'PLACE'] }
  },
  // "Kara taught at Meridian Academy", "Kara teaches at ..."
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:(?:continued\s+(?:to\s+)?)|still\s+|kept\s+)?(?:taught|teaches|teach|lectured|lectures)\s+(?:at|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'teaches_at',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'PLACE'] }
  },
  // Pronoun-aware: "He/She taught [subject] at X", "He continued to teach at X"
  // Uses coref resolution to resolve pronoun to entity
  {
    regex: /\b(He|She)\s+(?:(?:continued\s+(?:to\s+)?)|still\s+|kept\s+)?(?:taught|teaches|teach|lectured|lectures)\s+(?:[a-zA-Z]+\s+)?(?:at|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'teaches_at',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'PLACE'] }
  },

  // === LOCATION PATTERNS ===
  // COORDINATION: "Harry and Dudley lived in Privet Drive"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:lived|dwelt|dwelled|resided|reside|live)\s+(?:in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'lives_in',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] },
    extractSubj: null,
    extractObj: 3,
    coordination: true
  },
  // "Aria lived in Meridian Ridge", "The family dwelt in ..."
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:lived|dwelt|dwelled|resides|resided)\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'lives_in',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] }
  },
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+and\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)*)\s+(?:lived|resided|dwelt|dwelled)[^.]{0,150}?\boverlooking\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'lives_in',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] }
  },

  // === TRAVEL PATTERNS ===
  // COORDINATION: "Frodo and Sam traveled to Mordor"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:traveled|travelled|journeyed|went)\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'traveled_to',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] },
    extractSubj: null,  // Special handling - will extract both subjects
    extractObj: 3,
    coordination: true
  },
  // SINGLE SUBJECT: "Aria traveled to Meridian Ridge"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:traveled|travelled|journeyed|went)\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'traveled_to',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] }
  },

  // === BATTLE/EVENT PATTERNS ===
  // "Aria fought in the Battle of X"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+fought\s+in\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'fought_in',
    typeGuard: { subj: ['PERSON'], obj: ['EVENT', 'PLACE'] }
  },

  // === GOVERNANCE/LEADERSHIP PATTERNS ===
  // "Aragorn ruled Gondor", "Theoden rules Rohan"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:ruled|rules|governs|governed|reigned|reigns)\s+(?:over\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'rules',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE', 'ORG'] }
  },
  // "Aragorn became king of Gondor" or "He became king in Gondor"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*|[Hh]e|[Ss]he)\s+became\s+(?:king|queen|ruler|leader|monarch|emperor|empress|sultan|pharaoh)\s+(?:of|in|over)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'rules',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE', 'ORG'] }
  },
  // "He became king there" - requires deictic resolution for "there"
  // Note: Object position capture group would need deictic resolution (TODO: implement)
  {
    regex: /\b([A-Z][a-z]+|[Hh]e|[Ss]he)\s+became\s+(king|queen|ruler|leader|monarch|emperor|empress|sultan|pharaoh)\s+there\b/g,
    predicate: 'rules',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE', 'ORG'] }
  },

  // === LOCATION PATTERNS - EXPANDED ===
  // "X is located in Y", "X is based in Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is\s+)?(?:located|situated|based|founded|established)\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'located_in',
    typeGuard: { subj: ['PLACE', 'ORG'], obj: ['PLACE'] }
  },
  // "X near Y", "X is near Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is\s+)?near\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'near',
    typeGuard: { subj: ['PLACE', 'PERSON'], obj: ['PLACE'] }
  },
  // "X borders Y", "X borders on Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+borders?\s+(?:on\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'borders',
    typeGuard: { subj: ['PLACE'], obj: ['PLACE'] }
  },
  // "X within Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+within\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'within',
    typeGuard: { subj: ['PLACE'], obj: ['PLACE'] }
  },

  // === PART_WHOLE PATTERNS ===

  // LIST EXTRACTION: "The castle had four houses: Gryffindor, Slytherin, Hufflepuff, and Ravenclaw"
  // This pattern triggers special list parsing logic
  // Matches "The [noun] had/has [number] items:" or "[Name] had/has [number] items:"
  {
    regex: /\b(?:The\s+([a-z]+)|([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*))\s+(?:had|has|have)\s+(?:\w+\s+)?(?:houses?|members?|parts?|divisions?|sections?|components?|elements?):\s*/g,
    predicate: 'part_of',
    typeGuard: {},
    listExtraction: true,
    reversed: true  // List items are part_of the container (not container has items)
  },

  // "X is part of Y", "X is a part of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is\s+)?(?:a\s+)?part\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'part_of',
    typeGuard: {}
  },
  // "X consists of Y", "X consist of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+consists?\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'consists_of',
    typeGuard: {}
  },
  // "X includes Y", "X include Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:includes?|contain|contains)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'includes',
    typeGuard: {}
  },
  // "X is made of Y", "X is composed of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is\s+)?(?:made|composed)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'made_of',
    typeGuard: {}
  },

  // === EMPLOYMENT PATTERNS ===
  // COORDINATION: "Alice and Bob worked at NASA"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:worked|works|work)\s+(?:at|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'works_for',
    typeGuard: { subj: ['PERSON'], obj: ['ORG'] },
    extractSubj: null,
    extractObj: 3,
    coordination: true
  },
  // "X works for Y", "X work for Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:works?|worked)\s+(?:as\s+)?(?:for|with|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'works_for',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'PERSON'] }
  },
  // "X employed by Y", "X was employed by Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:was\s+)?employed\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'employed_by',
    typeGuard: { subj: ['PERSON'], obj: ['ORG'] }
  },
  // COORDINATION: "Harry and Ron were members of Gryffindor"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:were|are|was)\s+(?:members?|part)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'member_of',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'HOUSE'] },
    extractSubj: null,
    extractObj: 3,
    coordination: true
  },
  // "X is a member of Y", "X member of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is\s+)?(?:a\s+)?member\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'member_of',
    typeGuard: { subj: ['PERSON'], obj: ['ORG'] }
  },
  // "X was sorted into Y", "X joined Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:was|were)\s+sorted\s+into\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
    predicate: 'member_of',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'HOUSE'] }
  },
  // "She/He was sorted into Y" - PRONOUN VERSION
  {
    regex: /\b((?:He|She|They|he|she|they))\s+(?:was|were)\s+sorted\s+into\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
    predicate: 'member_of',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'HOUSE'] },
    extractSubj: 1,
    extractObj: 2
  },
  // "X joined Y", "X, ..., joined Y" (handles intervening phrases)
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?:,[\s\w]+,)?\s+joined\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'member_of',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'HOUSE'] }
  },
  // "X and Y were also in Z" or "X also in Z"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:was|were)\s+also\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'member_of',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'HOUSE'] }
  },
  // Coordination: "X and Y were also in Z"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+were\s+also\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'member_of',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'HOUSE'] },
    extractSubj: null,
    extractObj: 3,
    coordination: true
  },
  // "X is CEO/president/director of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was)\s+(?:the\s+)?(?:CEO|president|director|founder|manager|leader)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'leads',
    typeGuard: { subj: ['PERSON'], obj: ['ORG'] }
  },
  // "X founded Y", "X founded the Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+founded\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'founded',
    typeGuard: { subj: ['PERSON'], obj: ['ORG'] }
  },

  // === CREATION PATTERNS ===
  // "X wrote Y", "X wrote the Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:wrote|authored|written|penned)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'wrote',
    typeGuard: { subj: ['PERSON'], obj: ['WORK', 'ORG'] }
  },
  // "X created Y", "X created the Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:created|made|produced|composed|designed|invented)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'created',
    typeGuard: { subj: ['PERSON'], obj: ['WORK', 'ITEM'] }
  },
  // "X directed Y", "X directed the Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:directed|filmed|shot)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'directed',
    typeGuard: { subj: ['PERSON'], obj: ['WORK', 'EVENT'] }
  },
  // "X is the author of Y", "X author of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is\s+)?(?:the\s+)?author\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'authored',
    typeGuard: { subj: ['PERSON'], obj: ['WORK'] }
  },
  // "X painted Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+painted\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'painted',
    typeGuard: { subj: ['PERSON'], obj: ['WORK', 'ITEM'] }
  },

  // === BIRTH/ORIGIN PATTERNS ===
  // "X was born in Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:was|were)\s+born\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'born_in',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] }
  },
  // "X, born in Y" (appositive)
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*,\s*born\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'born_in',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] }
  },
  // "X hails from Y", "X comes from Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:hails|came|comes|hailed)\s+from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'born_in',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] }
  },

  // === VIOLENCE/CONFLICT PATTERNS ===
  // "X killed Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:killed|slew|murdered|assassinated|executed|slain)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'killed',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X was killed by Y" (passive)
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:was|were)\s+(?:killed|slain|murdered|assassinated|executed)\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'killed',
    extractSubj: 2,  // Killer
    extractObj: 1,   // Victim
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X attacked Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:attacked|assaulted|ambushed|struck)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'attacked',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X defeated Y" (person vs person)
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:defeated|vanquished|overthrew|overcame)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'defeated',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X conquered Y" (person conquers place)
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:conquered|captured|invaded|seized|occupied)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'conquered',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE', 'ORG'] }
  },

  // === EMOTIONAL/INTERPERSONAL PATTERNS ===
  // "X loves Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:loves|loved|adores|adored)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'loves',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X is in love with Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was|fell)\s+in\s+love\s+with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'loves',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X hates Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:hates|hated|despises|despised|loathes|loathed|detests|detested)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'hates',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X is a friend of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was)\s+(?:a\s+)?(?:close\s+|best\s+|good\s+)?friend\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'friends_with',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X trusts Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:trusts|trusted)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'trusts',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X respects Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:respects|respected|admires|admired)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'respects',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X fears Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:fears|feared|dreads|dreaded)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'fears',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // === BETRAYAL/DECEPTION PATTERNS ===
  // "X betrayed Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:betrayed|deceived|tricked|fooled)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'betrayed',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X was betrayed by Y" (passive)
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:was|were)\s+(?:betrayed|deceived)\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'betrayed',
    extractSubj: 2,  // Betrayer
    extractObj: 1,   // Victim
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // === MENTORSHIP/TEACHING PATTERNS ===
  // "X taught Y" (person taught person)
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:taught|trained|mentored|instructed|tutored)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'taught',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X was taught by Y" (passive)
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:was|were)\s+(?:taught|trained|mentored)\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'taught',
    extractSubj: 2,  // Teacher
    extractObj: 1,   // Student
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X is the mentor of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was)\s+(?:the\s+)?mentor\s+(?:of|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'mentor_of',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X studied under Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:studied|trained|learned)\s+under\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'student_of',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // === ASSISTANCE/COOPERATION PATTERNS ===
  // "X helped Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:helped|assisted|aided|supported)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'helped',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X saved Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:saved|rescued|protected)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'saved',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // === ALLEGIANCE/LOYALTY PATTERNS ===
  // "X served Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:served|serves)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'serves',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'ORG'] }
  },
  // "X followed Y" (loyalty sense)
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:followed|follows)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'follows',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X is loyal to Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was|remained)\s+loyal\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'loyal_to',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'ORG'] }
  },

  // === COMMUNICATION PATTERNS ===
  // "X told Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:told|informed|warned|notified)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'told',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X met Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:met|encountered|visited)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'met',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // === OWNERSHIP/POSSESSION PATTERNS ===
  // "X owns Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:owns|owned|possesses|possessed)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'owns',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'PLACE', 'ITEM'] }
  },
  // "X bought Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:bought|purchased|acquired)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'bought',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'PLACE', 'ITEM'] }
  },
  // "X sold Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:sold)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'sold',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'PLACE', 'ITEM'] }
  },
  // "X inherited Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:inherited)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'inherited',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'PLACE', 'ITEM'] }
  },

  // === CONSTRUCTION/CREATION PATTERNS ===
  // "X built Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:built|constructed|erected)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'built',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE', 'ITEM'] }
  },
  // "X designed Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:designed|architected|planned)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'designed',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE', 'ITEM', 'WORK'] }
  },
  // "X discovered Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:discovered|found|uncovered|revealed)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'discovered',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE', 'ITEM', 'ORG'] }
  },

  // === SOCIAL EVALUATION PATTERNS ===
  // "X praised Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:praised|commended|applauded|honored|honoured)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'praised',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X blamed Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:blamed|accused|condemned|criticized|criticised)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'blamed',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X forgave Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:forgave|pardoned|absolved|excused)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'forgave',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X punished Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:punished|penalized|disciplined|sentenced)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'punished',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // === MOVEMENT PATTERNS ===
  // "X visited Y" (place)
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:visited)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'visited',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] }
  },
  // "X left Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:left|departed|abandoned|fled)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'left',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE', 'ORG'] }
  },
  // "X returned to Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:returned|came back)\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'returned_to',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] }
  },
  // "X arrived at/in Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:arrived|reached|entered)\s+(?:at|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'arrived_at',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] }
  },

  // === INFLUENCE PATTERNS ===
  // "X inspired Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:inspired|motivated|encouraged)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'inspired',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X influenced Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:influenced|affected|shaped|impacted)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'influenced',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X convinced Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:convinced|persuaded|swayed)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'convinced',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // === SUCCESSION PATTERNS ===
  // "X succeeded Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:succeeded|replaced|followed)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'succeeded',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X preceded Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:preceded)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'preceded',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // === AGREEMENT/ALLIANCE PATTERNS ===
  // "X allied with Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:allied|aligned|partnered|cooperated)\s+with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'allied_with',
    symmetric: true,
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },
  // "X opposed Y" → normalize to enemy_of for consistency
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:opposed|resisted)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'enemy_of',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },

  // === PROTECTION/CARE PATTERNS ===
  // "X protected Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:protected|defended|guarded|shielded)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'protected',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'PLACE'] }
  },
  // "X raised Y" (as child)
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:raised|reared|nurtured)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'raised',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // =========================================
  // TEMPORAL RELATIONS
  // =========================================

  // "X before Y" / "X preceded Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:came|happened|occurred)\s+(?:before|prior to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
    predicate: 'before',
    typeGuard: { subj: ['PERSON', 'EVENT'], obj: ['PERSON', 'EVENT'] }
  },
  // "X after Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:came|happened|occurred)\s+after\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
    predicate: 'after',
    typeGuard: { subj: ['PERSON', 'EVENT'], obj: ['PERSON', 'EVENT'] }
  },
  // "During X, Y" pattern
  {
    regex: /\bduring\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
    predicate: 'during',
    typeGuard: { subj: ['PERSON', 'EVENT'], obj: ['EVENT'] }
  },
  // "X outlived Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+outlived\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'outlived',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // =========================================
  // COMMUNICATION PATTERNS
  // =========================================

  // "X warned Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+warned\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'warned',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X asked Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+asked\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'asked',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X answered Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+answered\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'answered',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X informed Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+informed\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'informed',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X promised Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+promised\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'promised',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X thanked Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+thanked\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'thanked',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X greeted Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+greeted\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'greeted',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X called Y" (communication sense)
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+called\s+(?:out\s+to\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'called',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X summoned Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+summoned\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'summoned',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X commanded Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+commanded\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'commanded',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // =========================================
  // CAUSATION PATTERNS
  // =========================================

  // "X caused Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+caused\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'caused',
    typeGuard: { subj: ['PERSON', 'ORG', 'EVENT'], obj: ['EVENT', 'PERSON'] }
  },
  // "X led to Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+led\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'led_to',
    typeGuard: { subj: ['PERSON', 'ORG', 'EVENT'], obj: ['EVENT', 'PERSON'] }
  },
  // "X prevented Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+prevented\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'prevented',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'EVENT'] }
  },
  // "X enabled Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+enabled\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'enabled',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'EVENT'] }
  },
  // "X triggered Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+triggered\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'triggered',
    typeGuard: { subj: ['PERSON', 'ORG', 'EVENT'], obj: ['EVENT'] }
  },
  // "X stopped Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+stopped\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'stopped',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'EVENT'] }
  },

  // =========================================
  // TRANSFER/EXCHANGE PATTERNS
  // =========================================

  // "X gave Y to Z" - captured as gave(X, Z)
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+gave\s+(?:\w+\s+)*to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'gave_to',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'ORG'] }
  },
  // "X received from Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+received\s+(?:\w+\s+)*from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'received_from',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },
  // "X donated to Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+donated\s+(?:\w+\s+)*to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'donated_to',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['ORG', 'PERSON'] }
  },
  // "X sent Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+sent\s+(?:\w+\s+)*to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'sent_to',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'PLACE'] }
  },
  // "X stole from Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+stole\s+(?:\w+\s+)*from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'stole_from',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'ORG'] }
  },
  // "X lent to Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+lent\s+(?:\w+\s+)*to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'lent_to',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },
  // "X borrowed from Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+borrowed\s+(?:\w+\s+)*from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'borrowed_from',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },

  // =========================================
  // PERCEPTION/WITNESS PATTERNS
  // =========================================

  // "X saw Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+saw\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'saw',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'PLACE', 'EVENT'] }
  },
  // "X witnessed Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+witnessed\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'witnessed',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'EVENT'] }
  },
  // "X heard Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+heard\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'heard',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'EVENT'] }
  },
  // "X observed Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+observed\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'observed',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'EVENT'] }
  },
  // "X recognized Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+recognized\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'recognized',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X noticed Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+noticed\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'noticed',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'EVENT'] }
  },

  // =========================================
  // COMPETITION/CONTEST PATTERNS
  // =========================================

  // "X competed against Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+competed\s+(?:against|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'competed_against',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },
  // "X challenged Y" → normalize to enemy_of for consistency
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+challenged\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'enemy_of',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X beat Y" / "X won against Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:beat|won\s+against)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'beat',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },
  // "X lost to Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+lost\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'lost_to',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },

  // =========================================
  // ASSISTANCE/SUPPORT PATTERNS
  // =========================================

  // "X assisted Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+assisted\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'assisted',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },
  // "X supported Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+supported\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'supported',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },
  // "X backed Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+backed\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'backed',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },
  // "X endorsed Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+endorsed\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'endorsed',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },
  // "X funded Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+funded\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'funded',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },
  // "X sponsored Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+sponsored\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'sponsored',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG', 'EVENT'] }
  },

  // =========================================
  // TRANSFORMATION PATTERNS
  // =========================================

  // "X became Y" (role/title change)
  // NOTE: king/queen removed from pattern - those are handled by the 'rules' pattern above
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+became\s+(?:the\s+)?(?:leader|president|ceo|head|chief|director|chairman|chairwoman)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
    predicate: 'became_leader_of',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'PLACE'] }
  },
  // "X replaced Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+replaced\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'replaced',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X overthrew Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+overthrew\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'overthrew',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },
  // "X dethroned Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+dethroned\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'dethroned',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X joined Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+joined\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'joined',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'PERSON'] }
  },

  // =========================================
  // KNOWLEDGE/BELIEF PATTERNS
  // =========================================

  // "X knows Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+knows\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'knows',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X remembered Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+remembered\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'remembered',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'EVENT'] }
  },
  // "X forgot Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+forgot\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'forgot',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'EVENT'] }
  },
  // "X believed in Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+believed\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'believed_in',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'ORG'] }
  },
  // "X doubted Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+doubted\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'doubted',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // =========================================
  // PASSIVE VOICE PATTERNS
  // Using extractSubj: 2, extractObj: 1 to swap capture groups
  // "X was defeated by Y" → Y defeated X
  // =========================================

  // "X was defeated by Y" (passive) → Y defeated X
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+was\s+defeated\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'defeated',
    extractSubj: 2,
    extractObj: 1,
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },
  // "X was saved by Y" (passive) → Y saved X
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+was\s+saved\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'saved',
    extractSubj: 2,
    extractObj: 1,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X was helped by Y" (passive) → Y helped X
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+was\s+helped\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'helped',
    extractSubj: 2,
    extractObj: 1,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X was protected by Y" (passive) → Y protected X
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+was\s+protected\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'protected',
    extractSubj: 2,
    extractObj: 1,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'PLACE'] }
  },
  // "X was attacked by Y" (passive) → Y attacked X
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+was\s+attacked\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'attacked',
    extractSubj: 2,
    extractObj: 1,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'PLACE'] }
  },
  // "X was warned by Y" (passive) → Y warned X
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+was\s+warned\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'warned',
    extractSubj: 2,
    extractObj: 1,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X was summoned by Y" (passive) → Y summoned X
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+was\s+summoned\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'summoned',
    extractSubj: 2,
    extractObj: 1,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X was supported by Y" (passive) → Y supported X
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+was\s+supported\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'supported',
    extractSubj: 2,
    extractObj: 1,
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },
  // "X was replaced by Y" (passive) → Y replaced X
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+was\s+replaced\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'replaced',
    extractSubj: 2,
    extractObj: 1,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X was overthrown by Y" (passive) → Y overthrew X
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+was\s+overthrown\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'overthrew',
    extractSubj: 2,
    extractObj: 1,
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },
  // "X was inspired by Y" (passive) → Y inspired X
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+was\s+inspired\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'inspired',
    extractSubj: 2,
    extractObj: 1,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X was influenced by Y" (passive) → Y influenced X
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+was\s+influenced\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'influenced',
    extractSubj: 2,
    extractObj: 1,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X was raised by Y" (passive) → Y raised X
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+was\s+raised\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'raised',
    extractSubj: 2,
    extractObj: 1,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X was mentored by Y" (passive) → Y mentor_of X
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+was\s+mentored\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'mentor_of',
    extractSubj: 2,
    extractObj: 1,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // =========================================
  // RELATIONAL ADJECTIVE PATTERNS
  // =========================================

  // "X is/was loyal to Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was|remained|stayed)\s+loyal\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'loyal_to',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'ORG'] }
  },
  // "X is/was devoted to Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was|remained)\s+devoted\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'devoted_to',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'ORG'] }
  },
  // "X is/was hostile to Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was|remained|became)\s+hostile\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'hostile_to',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },
  // "X is/was suspicious of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was|remained|became)\s+suspicious\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'suspicious_of',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X is/was jealous of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was|became)\s+jealous\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'jealous_of',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X is/was afraid of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was|became)\s+afraid\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'fears',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X is/was grateful to Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was|remained)\s+grateful\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'grateful_to',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X is/was indebted to Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was)\s+indebted\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'indebted_to',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'ORG'] }
  },
  // "X is/was related to Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was)\s+related\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'related_to',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X is/was close to Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was|remained|grew)\s+close\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'close_to',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X is/was dependent on Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was|became)\s+dependent\s+on\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'dependent_on',
    typeGuard: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] }
  },
  // "X is/was responsible for Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was)\s+responsible\s+for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'responsible_for',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON', 'EVENT'] }
  },
  // "X is/was in love with Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was|fell)\s+in\s+love\s+with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'loves',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "X is/was envious of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was|became)\s+envious\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'envious_of',
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  }
];

/**
 * Entity lookup by surface form
 */
interface EntityLookup {
  id: string;
  canonical: string;
  type: EntityType;
  aliases: string[];
}

/**
 * Resolve collective references using coreference links
 * Examples: "the couple" → [Aria, Elias], "their" → [parent1, parent2]
 */
function resolveCollectiveReference(
  text: string,
  position: number,
  corefLinks: CorefLinks | undefined,
  entities: EntityLookup[]
): EntityLookup[] | null {
  if (!corefLinks) return null;

  // Find coref links that overlap with this position
  const matchingLinks = corefLinks.links.filter(link =>
    position >= link.mention.start && position < link.mention.end
  );

  if (matchingLinks.length === 0) return null;

  // Get all entities referenced by these links
  const entityIds = new Set(matchingLinks.map(link => link.entity_id));
  const resolvedEntities = entities.filter(
    e => entityIds.has(e.id) && e.type === 'PERSON'
  );

  if (!resolvedEntities.length) {
    return null;
  }

  const unique = new Map<string, EntityLookup>();
  for (const entity of resolvedEntities) {
    if (!unique.has(entity.id)) {
      unique.set(entity.id, entity);
    }
  }

  return Array.from(unique.values());
}

/**
 * Resolve possessive pronouns using coref links
 * Examples: "their" → [Aria, Elias], "his" → Gandalf
 */
function resolvePossessivePronoun(
  pronoun: string,
  position: number,
  corefLinks: CorefLinks | undefined,
  entities: EntityLookup[]
): EntityLookup[] | null {
  if (!corefLinks) return null;

  const pronounLower = pronoun.toLowerCase();

  // Find coref links for this pronoun position
  const matchingLinks = corefLinks.links.filter(link => {
    const mentionText = link.mention.text.toLowerCase();
    // Check if mention text contains the pronoun
    return mentionText === pronounLower &&
           position >= link.mention.start &&
           position < link.mention.end;
  });

  if (matchingLinks.length === 0) return null;

  // Get all entities referenced (retain only PERSON entities)
  const entityIds = new Set(matchingLinks.map(link => link.entity_id));
  const resolved = entities.filter(
    e => entityIds.has(e.id) && e.type === 'PERSON'
  );

  if (!resolved.length) {
    return null;
  }

  const unique = new Map<string, EntityLookup>();
  for (const entity of resolved) {
    if (!unique.has(entity.id)) {
      unique.set(entity.id, entity);
    }
  }

  return Array.from(unique.values());
}

function resolvePronounReference(
  pronoun: string,
  position: number,
  corefLinks: CorefLinks | undefined,
  entities: EntityLookup[],
  allowedTypes: EntityType[] = ['PERSON']
): EntityLookup[] | null {
  if (!corefLinks) return null;

  const pronounLower = pronoun.toLowerCase();
  const matchingLinks = corefLinks.links.filter(link => {
    if (link.mention.text.toLowerCase() !== pronounLower) {
      return false;
    }
    return position >= link.mention.start && position < link.mention.end;
  });

  if (!matchingLinks.length) return null;

  const unique = new Map<string, EntityLookup>();
  for (const link of matchingLinks) {
    const entity = entities.find(e => e.id === link.entity_id);
    if (!entity) continue;
    if (allowedTypes.length && !allowedTypes.includes(entity.type)) continue;
    if (!unique.has(entity.id)) {
      unique.set(entity.id, entity);
    }
  }

  return unique.size ? Array.from(unique.values()) : null;
}

/**
 * Pronoun resolution entry with position information
 */
interface PronounResolutionEntry {
  entityId: string;
  start: number;
  end: number;
}

/**
 * Build a position-aware pronoun resolution map
 * Returns a map from pronoun text → array of all resolutions with their positions
 */
function buildPronounResolutionMap(corefLinks: CorefLinks | undefined): Map<string, PronounResolutionEntry[]> {
  const map = new Map<string, PronounResolutionEntry[]>();
  if (!corefLinks || !corefLinks.links) {
    console.log('[buildPronounResolutionMap] No coref links found');
    return map;
  }

  // For each coref link, if the mention text is a pronoun, add it with position
  for (const link of corefLinks.links) {
    if (link.mention && isPronoun(link.mention.text)) {
      const key = link.mention.text.toLowerCase();
      const entry: PronounResolutionEntry = {
        entityId: link.entity_id,
        start: link.mention.start,
        end: link.mention.end
      };

      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(entry);
      console.log(`[buildPronounResolutionMap] Added "${link.mention.text}" @ ${link.mention.start}-${link.mention.end} → ${link.entity_id}`);
    }
  }

  // Count total resolutions
  let total = 0;
  for (const entries of map.values()) {
    total += entries.length;
  }
  console.log(`[buildPronounResolutionMap] Total pronoun mappings: ${total} across ${map.size} pronouns`);
  return map;
}

/**
 * Find the best pronoun resolution for a given position
 * Prefers exact overlap, then closest preceding resolution
 */
function findPronounResolution(
  entries: PronounResolutionEntry[] | undefined,
  position: number
): string | null {
  if (!entries || entries.length === 0) return null;

  // First try exact overlap
  for (const entry of entries) {
    if (position >= entry.start && position < entry.end) {
      return entry.entityId;
    }
  }

  // Then find the closest entry (prefer preceding)
  let closest: PronounResolutionEntry | null = null;
  let closestDistance = Infinity;

  for (const entry of entries) {
    const distance = Math.abs(position - entry.start);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = entry;
    }
  }

  return closest?.entityId ?? null;
}

function matchEntity(surface: string, entities: EntityLookup[]): EntityLookup | null {
  const cleaned = surface
    .replace(/^[\s,.;:"'“”‘’()]+/, '')
    .replace(/[\s,.;:"'“”‘’()]+$/, '')
    .trim();

  if (!cleaned) return null;

  const surfaceLower = cleaned.toLowerCase();

  for (const entity of entities) {
    // Match canonical name
    if (entity.canonical.toLowerCase() === surfaceLower) {
      return entity;
    }

    // Match aliases
    if (entity.aliases.some(alias => alias.toLowerCase() === surfaceLower)) {
      return entity;
    }

    // Partial match (surface is contained in canonical or vice versa)
    const canonicalLower = entity.canonical.toLowerCase();
    if (canonicalLower.includes(surfaceLower) || surfaceLower.includes(canonicalLower)) {
      // Only match if word boundaries align
      const words = surfaceLower.split(/\s+/);
      const canonicalWords = canonicalLower.split(/\s+/);

      if (words.every(w => canonicalWords.includes(w)) ||
          canonicalWords.every(w => words.includes(w))) {
        return entity;
      }
    }
  }

  return null;
}

function matchCompoundEntities(surface: string, entities: EntityLookup[]): EntityLookup[] | null {
  if (!surface.includes(' and ')) {
    return null;
  }

  const parts = surface.split(/\band\b/gi).map(part =>
    part.replace(/^[\s,]+/, '').replace(/[\s,]+$/, '').trim()
  ).filter(Boolean);

  if (parts.length <= 1) return null;

  const matches: EntityLookup[] = [];

  for (const part of parts) {
    const entity = matchEntity(part, entities);
    if (entity && !matches.some(e => e.id === entity.id)) {
      matches.push(entity);
    }
  }

  return matches.length >= 2 ? matches : null;
}

const COLLECTIVE_CUE_REGEX = /\b(?:the|this|that|these|those|each|both)\s+(?:couple|pair|duo|trio|siblings|parents|partners|friend|friends|woman|women|man|men|strategist|strategists|leaders|guardians|rivals|allies|family|councilors|figures)\b/i;
const OTHER_PRONOUN_REGEX = /\b(?:the other|each other|one another)\b/i;

/**
 * Check type guard for relation
 */
function passesTypeGuard(
  pattern: RelationPattern,
  subjEntity: EntityLookup,
  objEntity: EntityLookup
): boolean {
  if (!pattern.typeGuard) return true;

  if (pattern.typeGuard.subj) {
    if (!pattern.typeGuard.subj.includes(subjEntity.type)) {
      return false;
    }
  }

  if (pattern.typeGuard.obj) {
    if (!pattern.typeGuard.obj.includes(objEntity.type)) {
      return false;
    }
  }

  return true;
}

/**
 * Extract narrative relations from text
 */
export function extractNarrativeRelations(
  text: string,
  entities: EntityLookup[],
  docId: string = 'current',
  corefLinks?: CorefLinks
): Relation[] {
  const relations: Relation[] = [];

  // Normalize text for pattern matching (removes leading conjunctions/articles)
  const normalizedText = normalizeTextForPatterns(text);

  // Build entity map for direct lookup
  const entitiesById = new Map(entities.map(e => [e.id, e]));

  // Create unified ReferenceResolver for pronoun resolution
  // Convert EntityLookup[] to format expected by ReferenceResolver
  const schemaEntities = entities.map(e => ({
    id: e.id,
    canonical: e.canonical,
    type: e.type,
    aliases: e.aliases || [],
    created_at: new Date().toISOString(),
    confidence: 0.99,
  }));

  // Build entity spans from coref links (we don't have full span info, so approximate)
  const entitySpans: RefEntitySpan[] = [];
  if (corefLinks?.links) {
    for (const link of corefLinks.links) {
      entitySpans.push({
        entity_id: link.entity_id,
        start: link.mention.start,
        end: link.mention.end,
        text: link.mention.text,
      });
    }
  }

  // Create and initialize the resolver
  const resolver = new ReferenceResolver();
  resolver.initialize(schemaEntities, entitySpans, [], text);

  // Build pronoun map from coref links for position-aware resolution
  if (corefLinks?.links) {
    resolver.buildPronounMap(corefLinks.links.map(link => ({
      mention: link.mention,
      entity_id: link.entity_id,
      confidence: link.confidence,
      method: link.method === 'pronoun_stack' ? 'pronoun' as const :
              link.method === 'title_match' ? 'title' as const :
              link.method === 'nominal_match' ? 'nominal' as const :
              link.method === 'quote_attr' ? 'quote' as const :
              link.method === 'coordination' ? 'coordination' as const :
              'pronoun' as const,
    })));
  }

  /**
   * Mention-aware entity matching using unified ReferenceResolver
   * @param surface - The surface text to match
   * @param position - The character position in the text (for position-aware pronoun resolution)
   */
  const matchEntityWithCoref = (surface: string, position?: number): EntityLookup | null => {
    // Try normal matching first
    let entity = matchEntity(surface, entities);
    if (entity) return entity;

    // If normal matching fails and surface is a pronoun, use ReferenceResolver
    if (isPronoun(surface) && position !== undefined) {
      const resolved = resolver.resolvePronoun(surface, position, 'PATTERN_MATCH');
      if (resolved) {
        const lookupEntity = entitiesById.get(resolved.id);
        if (lookupEntity) {
          console.log(`[NarrativeRelations:coref] Resolved pronoun "${surface}" @ ${position} → ${resolved.canonical}`);
          return lookupEntity;
        }
      }
    }

    return null;
  };

  // Combine static patterns with dynamic patterns
  const dynamicPatterns = getDynamicPatterns();
  const allPatterns = [...NARRATIVE_PATTERNS, ...dynamicPatterns];

  console.log(`[NarrativeRelations] Using ${NARRATIVE_PATTERNS.length} static + ${dynamicPatterns.length} dynamic patterns = ${allPatterns.length} total`);

  for (const pattern of allPatterns) {
    // Reset regex state
    pattern.regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(normalizedText)) !== null) {
      // Handle coordination patterns specially (e.g., "Harry and Ron studied at Hogwarts")
      if ((pattern as any).coordination && match[1] && match[2]) {
        const firstSubj = match[1];
        const secondSubj = match[2];
        const obj = match[3];  // May be undefined for symmetric relations

        // Case 1: Subject-Object coordination (e.g., "Harry and Ron studied at Hogwarts")
        if (obj) {
          const matchStart = match.index;
          for (const subjSurface of [firstSubj, secondSubj]) {
            const subjOffset = match[0].indexOf(subjSurface);
            const subjPosition = subjOffset >= 0 ? matchStart + subjOffset : matchStart;
            const objOffset = match[0].indexOf(obj);
            const objPosition = objOffset >= 0 ? matchStart + objOffset : matchStart;
            const subjEntity = matchEntityWithCoref(subjSurface, subjPosition);
            const objEntity = matchEntityWithCoref(obj, objPosition);

            if (subjEntity && objEntity && passesTypeGuard(pattern, subjEntity, objEntity)) {
              const matchStart = match.index;
              const matchEnd = matchStart + match[0].length;

              relations.push({
                id: uuid(),
                subj: subjEntity.id,
                pred: pattern.predicate as any,
                obj: objEntity.id,
                evidence: [{
                  doc_id: docId,
                  span: { start: matchStart, end: matchEnd, text: match[0] },
                  sentence_index: 0,
                  source: 'RULE'
                }],
                confidence: 0.85,
                extractor: 'regex'
              });

              // For symmetric relations, create inverse
              if (pattern.symmetric) {
                relations.push({
                  id: uuid(),
                  subj: objEntity.id,
                  pred: pattern.predicate as any,
                  obj: subjEntity.id,
                  evidence: [{
                    doc_id: docId,
                    span: { start: matchStart, end: matchEnd, text: match[0] },
                    sentence_index: 0,
                    source: 'RULE'
                  }],
                  confidence: 0.85,
                  extractor: 'regex'
                });
              }
            }
          }
        }
        // Case 2: Symmetric coordination (e.g., "Harry and Ron were friends")
        else if (pattern.symmetric) {
          const matchStart = match.index;
          const firstOffset = match[0].indexOf(firstSubj);
          const secondOffset = match[0].indexOf(secondSubj);
          const firstPosition = firstOffset >= 0 ? matchStart + firstOffset : matchStart;
          const secondPosition = secondOffset >= 0 ? matchStart + secondOffset : matchStart;
          const entity1 = matchEntityWithCoref(firstSubj, firstPosition);
          const entity2 = matchEntityWithCoref(secondSubj, secondPosition);

          if (entity1 && entity2 && passesTypeGuard(pattern, entity1, entity2)) {
            const matchStart = match.index;
            const matchEnd = matchStart + match[0].length;

            // Create forward relation
            relations.push({
              id: uuid(),
              subj: entity1.id,
              pred: pattern.predicate as any,
              obj: entity2.id,
              evidence: [{
                doc_id: docId,
                span: { start: matchStart, end: matchEnd, text: match[0] },
                sentence_index: 0,
                source: 'RULE'
              }],
              confidence: 0.85,
              extractor: 'regex'
            });

            // Create reverse relation (symmetric)
            relations.push({
              id: uuid(),
              subj: entity2.id,
              pred: pattern.predicate as any,
              obj: entity1.id,
              evidence: [{
                doc_id: docId,
                span: { start: matchStart, end: matchEnd, text: match[0] },
                sentence_index: 0,
                source: 'RULE'
              }],
              confidence: 0.85,
              extractor: 'regex'
            });
          }
        }
        continue; // Skip normal processing for coordination patterns
      }

      // Handle list extraction patterns (e.g., "The castle had four houses: Gryffindor, Slytherin, ...")
      if ((pattern as any).listExtraction) {
        // Container could be in match[1] (for "The noun") or match[2] (for "Name")
        const container = match[1] || match[2];

        if (!container) {
          console.log(`[LIST-EXTRACT] Pattern matched but no container captured`);
          continue;
        }

        // Try direct entity match first
        let containerEntity = matchEntity(container, entities);

        // If no direct match, try coreference resolution
        if (!containerEntity && corefLinks) {
          const containerPosition = match.index;
          const containerLinks = corefLinks.links.filter(link =>
            link.mention.start <= containerPosition &&
            containerPosition < link.mention.end &&
            link.mention.text.toLowerCase().includes(container.toLowerCase())
          );

          if (containerLinks.length > 0) {
            const bestLink = containerLinks.sort((a, b) => b.confidence - a.confidence)[0];
            containerEntity = entities.find(e => e.id === bestLink.entity_id) || null;
            console.log(`[LIST-EXTRACT] Resolved "${container}" via coref → entity ${containerEntity?.canonical}`);
          }
        }

        console.log(`[LIST-EXTRACT] Pattern matched: container="${container}" → entity=${containerEntity?.canonical || 'NONE'}`);

        if (containerEntity) {
          const matchEnd = match.index + match[0].length;
          const remainingText = text.slice(matchEnd);

          // Extract comma-separated list until sentence boundary (. ! ? or end of text)
          const sentenceBoundary = remainingText.search(/[.!?]/);
          const listText = sentenceBoundary >= 0
            ? remainingText.slice(0, sentenceBoundary)
            : remainingText;

          console.log(`[LIST-EXTRACT] List text: "${listText}"`);

          // Parse capitalized names from the list
          // Match pattern: "Name", "Name Name", allowing for commas and "and"
          const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
          let nameMatch: RegExpExecArray | null;
          const listItems: string[] = [];

          while ((nameMatch = namePattern.exec(listText)) !== null) {
            listItems.push(nameMatch[1]);
          }

          console.log(`[LIST-EXTRACT] Extracted ${listItems.length} items: ${listItems.join(', ')}`);

          // Create part_of relations for each list item
          for (const itemName of listItems) {
            const itemEntity = matchEntity(itemName, entities);

            if (itemEntity) {
              console.log(`[LIST-EXTRACT]   ✓ Matched "${itemName}" → entity ${itemEntity.id}`);
              const evidenceStart = match.index;
              const evidenceEnd = matchEnd + listText.length;
              const evidenceText = text.slice(evidenceStart, evidenceEnd);

              relations.push({
                id: uuid(),
                subj: itemEntity.id,
                pred: pattern.predicate as any,
                obj: containerEntity.id,
                evidence: [{
                  doc_id: docId,
                  span: { start: evidenceStart, end: evidenceEnd, text: evidenceText },
                  sentence_index: 0,
                  source: 'RULE'
                }],
                confidence: 0.80,  // Slightly lower confidence for inferred relations
                extractor: 'regex'
              });
            } else {
              console.log(`[LIST-EXTRACT]   ✗ No entity match for "${itemName}"`);
            }
          }
        } else {
          console.log(`[LIST-EXTRACT] No entity match for container "${container}"`);
        }
        continue; // Skip normal processing for list patterns
      }

      // Handle deictic object patterns (e.g., "became king there")
      if ((pattern as any).deicticObj) {
        const subjSurface = match[1];  // "He" or proper name
        const matchPosition = match.index;
        const subjOffset = match[0].indexOf(subjSurface);
        const subjPosition = subjOffset >= 0 ? matchPosition + subjOffset : matchPosition;

        // Resolve subject (may be pronoun "He"/"She") using position-aware resolution
        let subjEntity = matchEntityWithCoref(subjSurface, subjPosition);

        // Resolve "there" to most recent PLACE entity before the match
        let objEntity: EntityLookup | null = null;
        for (let i = entities.length - 1; i >= 0; i--) {
          const e = entities[i];
          if (e.type === 'PLACE' || e.type === 'ORG') {
            // Check if this entity appears before the match in the text
            // For simplicity, we'll use the most recent PLACE entity
            objEntity = e;
            break;
          }
        }

        if (subjEntity && objEntity && passesTypeGuard(pattern, subjEntity, objEntity)) {
          const matchStart = match.index;
          const matchEnd = matchStart + match[0].length;

          relations.push({
            id: uuid(),
            subj: subjEntity.id,
            pred: pattern.predicate as any,
            obj: objEntity.id,
            evidence: [{
              doc_id: docId,
              span: { start: matchStart, end: matchEnd, text: match[0] },
              sentence_index: 0,
              source: 'RULE'
            }],
            confidence: 0.85,
            extractor: 'regex'
          });
        }
        continue; // Skip normal processing for deictic patterns
      }

      const subjGroup = pattern.extractSubj ?? 1;
      const objGroup = pattern.extractObj ?? 2;

      let subjSurface = match[subjGroup];
      let objSurface = match[objGroup];

      // Skip if either capture is undefined
      if (!subjSurface || !objSurface) continue;

      // Special handling: if subject matches "Word1 Word2" pattern with no surname in Word2,
      // extract just Word2 (e.g., "Elimelech Naomi" -> "Naomi")
      if (pattern.predicate === 'married_to' && subjSurface) {
        const words = subjSurface.split(/\s+/);
        if (words.length === 2 && /^[A-Z]/.test(words[1])) {
          const secondWord = words[1];
          // Check if second word looks like it could be a first name (not a surname)
          const looksLikeSurname = /(?:son|sen|sson|ton|ham|ley|field|man|stein|berg|ski|sky|wicz|ing|ford|wood|ridge|dale|hill|er|or|ar|kins|kin|well|wall|wick|ape|ope|good|more|ore|grave|grove|stone|strom|water|worth|foy|roy|aw|ew|om|um|in|an|on)$/i.test(secondWord);
          if (!looksLikeSurname) {
            // Use just the second word
            if (process.env.L4_DEBUG === '1') {
              console.log(`[NARRATIVE-RELATIONS] Extracting "${secondWord}" from subject "${subjSurface}"`);
            }
            subjSurface = secondWord;
          }
        }
      }

      const subjOffsetInMatch = match[0].indexOf(subjSurface);
      const subjAbsoluteStart = subjOffsetInMatch >= 0 ? match.index + subjOffsetInMatch : match.index;
      const objOffsetInMatch = match[0].indexOf(objSurface);
      const objAbsoluteStart = objOffsetInMatch >= 0 ? match.index + objOffsetInMatch : match.index;

      // Try to resolve collective references (e.g., "the couple", "their")
      let subjEntities: EntityLookup[] | null = null;
      let objEntities: EntityLookup[] | null = null;

      // Check if subject is a collective reference
      if (/\b(?:the|a)\s+couple\b/i.test(subjSurface) || COLLECTIVE_CUE_REGEX.test(subjSurface)) {
        subjEntities = resolveCollectiveReference(text, subjAbsoluteStart, corefLinks, entities);
      } else {
        // Use mention-aware resolution (includes pronoun→entity mapping from coref)
        const subjEntity = matchEntityWithCoref(subjSurface, subjAbsoluteStart);
        if (subjEntity) subjEntities = [subjEntity];
      }

      if (!subjEntities) {
        const compound = matchCompoundEntities(subjSurface, entities);
        if (compound) subjEntities = compound;
      }

      if (!subjEntities) {
        const allowedSubjTypes: EntityType[] = pattern.typeGuard?.subj
          ? [...pattern.typeGuard.subj]
          : ['PERSON'];
        const pronounEntities = resolvePronounReference(
          subjSurface,
          subjAbsoluteStart,
          corefLinks,
          entities,
          allowedSubjTypes
        );
        if (pronounEntities && pronounEntities.length) {
          subjEntities = pronounEntities;
        }
      }

      // Check if object is a collective reference
      if (
        /\b(?:the|a)\s+couple\b/i.test(objSurface) ||
        COLLECTIVE_CUE_REGEX.test(objSurface) ||
        OTHER_PRONOUN_REGEX.test(objSurface)
      ) {
        objEntities = resolveCollectiveReference(text, objAbsoluteStart, corefLinks, entities);
      } else {
        // Use mention-aware resolution (includes pronoun→entity mapping from coref)
        const objEntity = matchEntityWithCoref(objSurface, objAbsoluteStart);
        if (objEntity) objEntities = [objEntity];
      }

      if (!objEntities && OTHER_PRONOUN_REGEX.test(objSurface) && subjEntities && subjEntities.length > 1) {
        objEntities = [...subjEntities];
      }

      if (!objEntities) {
        const compound = matchCompoundEntities(objSurface, entities);
        if (compound) objEntities = compound;
      }

      if (!objEntities) {
        const allowedObjTypes: EntityType[] = pattern.typeGuard?.obj
          ? [...pattern.typeGuard.obj]
          : ['PERSON', 'ORG', 'PLACE'];
        const pronounEntities = resolvePronounReference(
          objSurface,
          objAbsoluteStart,
          corefLinks,
          entities,
          allowedObjTypes
        );
        if (pronounEntities && pronounEntities.length) {
          objEntities = pronounEntities;
        }
      }

      if (!subjEntities || !objEntities) continue;

      // Check if subject and object are the same collective reference
      // (e.g., "the couple married" where both subj and obj resolve to [Aria, Elias])
      const isSameCollective =
        subjEntities.length > 1 &&
        objEntities.length > 1 &&
        subjEntities.every(e => objEntities.some(o => o.id === e.id)) &&
        objEntities.every(e => subjEntities.some(s => s.id === e.id));

      if (isSameCollective) {
        // For same collective, create pairwise relations without duplicates
        // E.g., [Aria, Elias] -> create Aria->Elias and Elias->Aria (symmetric)
        for (let i = 0; i < subjEntities.length; i++) {
          for (let j = i + 1; j < subjEntities.length; j++) {
            const subjEntity = subjEntities[i];
            const objEntity = subjEntities[j];

            // Type guard
            if (!passesTypeGuard(pattern, subjEntity, objEntity)) continue;

            // Create relation
            const matchStart = match.index;
            const matchEnd = matchStart + match[0].length;

            const relation: Relation = {
              id: uuid(),
              subj: subjEntity.id,
              pred: pattern.predicate as any,
              obj: objEntity.id,
              evidence: [{
                doc_id: docId,
                span: {
                  start: matchStart,
                  end: matchEnd,
                  text: match[0]
                },
                sentence_index: getSentenceIndex(text, matchStart),
                source: 'RULE' as const
              }],
              confidence: 0.85,
              extractor: 'regex'
            };

            relations.push(relation);

            // Add symmetric relation if specified
            if (pattern.symmetric) {
              relations.push({
                ...relation,
                id: uuid(),
                subj: objEntity.id,
                obj: subjEntity.id
              });
            }
          }
        }
      } else {
        // Normal case: different subject and object
        // Create relations for all entity pairs
        for (const subjEntity of subjEntities) {
          for (const objEntity of objEntities) {
            if (subjEntity.id === objEntity.id) continue; // Skip self-relations

            // Type guard
            if (!passesTypeGuard(pattern, subjEntity, objEntity)) continue;

            // Create relation
            const matchStart = match.index;
            const matchEnd = matchStart + match[0].length;

            const relation: Relation = {
              id: uuid(),
              subj: subjEntity.id,
              pred: pattern.predicate as any, // Type assertion for custom predicates
              obj: objEntity.id,
              evidence: [{
                doc_id: docId,
                span: {
                  start: matchStart,
                  end: matchEnd,
                  text: match[0]
                },
                sentence_index: getSentenceIndex(text, matchStart),
                source: 'RULE' as const
              }],
              confidence: 0.85,
              extractor: 'regex'
            };

            relations.push(relation);

            // Add symmetric relation if specified
            if (pattern.symmetric) {
              relations.push({
                ...relation,
                id: uuid(),
                subj: objEntity.id,
                obj: subjEntity.id
              });
            }
          }
        }
      }
    }
  }

  // ============================================================
  // OPTION C: IMPROVE PATTERN SPECIFICITY WITH CONTEXT AWARENESS
  // ============================================================

  // SIBLING DETECTION: Detect entities with sibling indicators
  // Pattern FM-1 from LINGUISTIC_REFERENCE.md v0.6 §7.1
  // Look for pattern: "NAME, the eldest/youngest/etc son/daughter"
  const SIBLING_APPOSITIVE_PATTERN = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*,\s*(?:the\s+)?(?:eldest|oldest|younger|youngest|twin|middle)\s+(?:son|daughter|child|brother|sister|sibling)\b/gi;
  const siblingsWithIndicators = new Set<string>();

  const siblingMatches = text.matchAll(SIBLING_APPOSITIVE_PATTERN);
  for (const match of siblingMatches) {
    // match[1] is the NAME before the comma
    const siblingName = match[1].toLowerCase();
    siblingsWithIndicators.add(siblingName);
    console.log(`[SIBLING-FILTER] Detected sibling indicator for: ${siblingName}`);
  }

  // Create mapping from entity ID to canonical name (lowercase)
  const entityIdToName = new Map<string, string>();
  for (const entity of entities) {
    entityIdToName.set(entity.id, entity.canonical.toLowerCase());
  }
  console.log(`[SIBLING-FILTER] Entity mapping created for ${entityIdToName.size} entities: ${Array.from(entityIdToName.values()).join(', ')}`);
  console.log(`[SIBLING-FILTER] Siblings with indicators: ${Array.from(siblingsWithIndicators).join(', ')}`);


  // When married_to(A, B) exists, remove conflicting parent_of/child_of
  // relations because married_to has higher confidence in romantic contexts
  const marriedPairs = new Set<string>();
  for (const rel of relations) {
    if (rel.pred === 'married_to') {
      // Create normalized pair key (order-independent since married_to is symmetric)
      const key1 = `${rel.subj}:${rel.obj}`;
      const key2 = `${rel.obj}:${rel.subj}`;
      marriedPairs.add(key1);
      marriedPairs.add(key2);
    }
  }

  // Filter out parent_of/child_of relations that conflict with siblings or married_to
  const filteredRelations = relations.filter(rel => {
    // Filter 1: Sibling detection - block parent_of if subject has sibling indicator
    if (rel.pred === 'parent_of') {
      const subjName = entityIdToName.get(rel.subj) || '';
      const hasSiblingIndicator = subjName && siblingsWithIndicators.has(subjName);
      console.log(`[SIBLING-FILTER] Checking parent_of: rel.subj="${rel.subj}", subjName="${subjName}", hasSiblingIndicator=${hasSiblingIndicator}`);
      if (hasSiblingIndicator) {
        console.log(`[SIBLING-FILTER] ✓ Removing parent_of(${subjName}, ${rel.obj}) because ${subjName} has sibling indicator`);
        return false;
      }
    }

    // Filter 2: Married pairs - block parent_of/child_of between married entities
    if (rel.pred === 'parent_of' || rel.pred === 'child_of') {
      const pairKey = `${rel.subj}:${rel.obj}`;
      if (marriedPairs.has(pairKey)) {
        // This person pair is married - don't emit parent_of/child_of
        console.log(`[CONTEXT-FILTER] Removing ${rel.pred}(${rel.subj}, ${rel.obj}) because married_to exists for this pair`);
        return false;
      }
    }
    return true;
  });

  return filteredRelations;
}

/**
 * Helper: Get sentence index from character offset
 * Simple heuristic: count sentence terminators before position
 */
function getSentenceIndex(text: string, position: number): number {
  const before = text.substring(0, position);
  const matches = before.match(/[.!?]+/g);
  return matches ? matches.length : 0;
}

/**
 * Extract possessive family relations
 * Examples: "Aria's daughter", "their son", "the couple's child"
 */
export function extractPossessiveFamilyRelations(
  text: string,
  entities: EntityLookup[],
  docId: string = 'current',
  corefLinks?: CorefLinks
): Relation[] {
  const relations: Relation[] = [];
  const findRecentPersons = (position: number, limit: number = 2): EntityLookup[] => {
    const windowStart = Math.max(0, position - 800);
    const windowText = text.slice(windowStart, position);
    const groupPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
    const groupMatches = Array.from(windowText.matchAll(groupPattern));
    for (let i = groupMatches.length - 1; i >= 0; i--) {
      const [, first, second] = groupMatches[i];
      const firstEntity = matchEntity(first, entities);
      const secondEntity = matchEntity(second, entities);
      if (firstEntity?.type === 'PERSON' && secondEntity?.type === 'PERSON') {
        return [firstEntity, secondEntity];
      }
    }

    const matches = Array.from(windowText.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g));
    const seen = new Set<string>();
    const result: EntityLookup[] = [];

    for (let i = matches.length - 1; i >= 0 && result.length < limit; i--) {
      const candidate = matches[i][1];
      const entity = matchEntity(candidate, entities);
      if (!entity || entity.type !== 'PERSON') continue;
      if (seen.has(entity.id)) continue;
      result.unshift(entity);
      seen.add(entity.id);
    }

    return result;
  };

  let lastPluralPossessors: { entities: EntityLookup[]; position: number } | null = null;

  // Pattern 1: "X's daughter/son/child" → parent_of(X, [child entity])
  // Allow optional adjectives between possessive and family word (e.g., "Sarah's younger brother")
  const possessivePattern = /\b((?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)|(?:the|this|that)\s+(?:couple|pair|trio|siblings|parents))'s\s+(?:[a-z]+\s+)*(daughter|son|child|parent|father|mother|brother|sister|wife|husband|spouse)\b/gi;

  let match: RegExpExecArray | null;
  while ((match = possessivePattern.exec(text)) !== null) {
    const possessorSurface = match[1];
    const possessorLower = possessorSurface.toLowerCase();
    const roleWord = match[2].toLowerCase();

    const possessorMap = new Map<string, EntityLookup>();

    const directMatch = matchEntity(possessorSurface, entities);
    if (directMatch && directMatch.type === 'PERSON') {
      possessorMap.set(directMatch.id, directMatch);
    }

    const collectiveMatches = resolveCollectiveReference(
      text,
      match.index,
      corefLinks,
      entities
    );

    if (collectiveMatches) {
      for (const entity of collectiveMatches) {
        if (entity.type === 'PERSON') {
          possessorMap.set(entity.id, entity);
        }
      }
    }

    if (possessorMap.size === 0) {
      if (/(couple|pair|parents|partners|family|trio)/.test(possessorLower)) {
        const recentPersons = findRecentPersons(match.index);
        for (const entity of recentPersons) {
          possessorMap.set(entity.id, entity);
        }
      }
    }

    if (possessorMap.size === 0) continue;
    const possessorEntities = Array.from(possessorMap.values());

    const qualifiesForMemory = /(couple|parents|partners|pair|family)/.test(possessorLower);
    if (qualifiesForMemory && possessorEntities.length >= 2) {
      lastPluralPossessors = { entities: possessorEntities, position: match.index };
    }

    // Determine predicate based on role
    let predicate: string;

    if (['daughter', 'son', 'child'].includes(roleWord)) {
      predicate = 'parent_of';
    } else if (['parent', 'father', 'mother'].includes(roleWord)) {
      predicate = 'child_of';
    } else if (['brother', 'sister'].includes(roleWord)) {
      predicate = 'sibling_of';
    } else if (['wife', 'husband', 'spouse'].includes(roleWord)) {
      predicate = 'married_to';
    } else {
      continue;
    }

    // Look for entity mentioned shortly after (within 100 chars)
    const afterMatch = text.substring(match.index + match[0].length, match.index + match[0].length + 100);
    const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/;
    const entityMatch = afterMatch.match(entityPattern);

    if (entityMatch) {
      const targetEntity = matchEntity(entityMatch[1], entities);
      if (!targetEntity || targetEntity.type !== 'PERSON') continue;

      for (const possessorEntity of possessorEntities) {
        if (targetEntity.id === possessorEntity.id) continue;

        const evidenceSpan = {
          start: match.index,
          end: match.index + match[0].length + entityMatch[0].length,
          text: match[0] + ' ' + entityMatch[0]
        };

        const relation: Relation = {
          id: uuid(),
          subj: possessorEntity.id,
          pred: predicate as any, // Type assertion for custom predicates
          obj: targetEntity.id,
          evidence: [{
            doc_id: docId,
            span: evidenceSpan,
            sentence_index: getSentenceIndex(text, match.index),
            source: 'RULE' as const
          }],
          confidence: 0.80,
          extractor: 'regex'
        };

        // Create the natural direction only (don't auto-create inverses)
        // Pattern "X's daughter Y" naturally means parent_of(X, Y)
        relations.push(relation);

        // For symmetric relations, create both directions
        if (predicate === 'sibling_of') {
          relations.push({
            ...relation,
            id: uuid(),
            subj: targetEntity.id,
            pred: 'sibling_of',
            obj: possessorEntity.id
          });
        }
      }
    }
  }

  // Pattern 2: "their daughter/son" or "his wife" or "her partner" → resolve pronoun, then create family relations
  // Allow optional adjectives like "late", "younger", "older", etc.
  // NOTE: This pattern is conservative to avoid false positives (e.g., "He loved her" → parent_of)
  const theirPattern = /\b(their|his|her)\s+(?:[a-z]+\s+)*(daughter|son|child|parent|father|mother|wife|husband|spouse|partner|brother|sister)\b/gi;

  while ((match = theirPattern.exec(text)) !== null) {
    const pronoun = match[1].toLowerCase();
    const roleWord = match[2].toLowerCase();

    // CONTEXT AWARENESS: Skip this pattern if it's in a clearly romantic context
    // Check the surrounding context for marriage/love verbs that would indicate
    // the pronouns refer to spouses, not children
    const contextBefore = text.substring(Math.max(0, match.index - 200), match.index);
    const contextAfter = text.substring(match.index + match[0].length, Math.min(text.length, match.index + match[0].length + 100));
    const surroundingContext = contextBefore + match[0] + contextAfter;

    // If we see marriage/love language AND we're trying to extract parent_of/child_of from pronouns,
    // be much more conservative (skip it)
    if (['daughter', 'son', 'child'].includes(roleWord) &&
        pronoun === 'her' || pronoun === 'his') {
      const hasRomanticContext = /\b(married|spouse|wife|husband|beloved|loved|lover|romance|romantic|passion)\b/i.test(surroundingContext);
      const hasPronounPair = pronoun === 'her' && /\b(he|him|his)\b/i.test(contextBefore);

      if (hasRomanticContext || hasPronounPair) {
        // Skip this match - likely a romantic relationship, not parent-child
        continue;
      }
    }

    // Resolve pronoun using coreference links
    let possessorEntities = resolvePossessivePronoun(pronoun, match.index, corefLinks, entities) ?? [];
    possessorEntities = possessorEntities.filter(entity => entity.type === 'PERSON');

    const isPluralPronoun = pronoun === 'their';
    if (isPluralPronoun && possessorEntities.length && lastPluralPossessors) {
      const allowedIds = new Set(lastPluralPossessors.entities.map(e => e.id));
      const overlap = possessorEntities.filter(entity => allowedIds.has(entity.id));
      if (overlap.length >= 2) {
        possessorEntities = overlap;
      }
    }

    if ((!possessorEntities.length || (isPluralPronoun && possessorEntities.length < 2)) &&
        lastPluralPossessors &&
        (match.index - lastPluralPossessors.position) <= 500) {
      possessorEntities = lastPluralPossessors.entities;
    }

    // Aggressive fallback: if still no possessors, look for recent PERSON entities
    if (!possessorEntities.length || (isPluralPronoun && possessorEntities.length < 2)) {
      const recentPersons = findRecentPersons(match.index);
      if (isPluralPronoun) {
        // For "their", need at least 2 persons
        if (recentPersons.length >= 2) {
          possessorEntities = recentPersons.slice(0, 2);
        }
      } else {
        // For "his"/"her", take most recent person
        if (recentPersons.length > 0) {
          possessorEntities = [recentPersons[0]];
        }
      }
    }

    if (!possessorEntities.length) continue;

    if (possessorEntities.length >= 2) {
      lastPluralPossessors = { entities: possessorEntities, position: match.index };
    }

    // Determine predicate based on role
    let predicate: string;
    if (['daughter', 'son', 'child'].includes(roleWord)) {
      predicate = 'parent_of';
    } else if (['parent', 'father', 'mother'].includes(roleWord)) {
      predicate = 'child_of';
    } else if (['wife', 'husband', 'spouse', 'partner'].includes(roleWord)) {
      predicate = 'married_to';
    } else if (['brother', 'sister'].includes(roleWord)) {
      predicate = 'sibling_of';
    } else {
      continue;
    }

    // Look for entity mentioned shortly after (within 100 chars)
    const afterMatch = text.substring(match.index + match[0].length, match.index + match[0].length + 100);
    const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/;
    const entityMatch = afterMatch.match(entityPattern);

    if (!entityMatch) continue;
    const targetEntity = matchEntity(entityMatch[1], entities);
    if (!targetEntity || targetEntity.type !== 'PERSON') continue;

    for (const possessorEntity of possessorEntities) {
      if (targetEntity.id === possessorEntity.id) continue;

      // CONTEXT CHECK: For parent_of/child_of, check if surrounding text suggests a marriage
      // This prevents false positives from "He loved her" being interpreted as parent_of
      if ((predicate === 'parent_of' || predicate === 'child_of') && (roleWord === 'daughter' || roleWord === 'son' || roleWord === 'child')) {
        const contextStart = Math.max(0, match.index - 300);
        const contextEnd = Math.min(text.length, match.index + match[0].length + 200);
        const fullContext = text.substring(contextStart, contextEnd);

        // Check for marriage indicators
        const hasMarriageContext = /\b(married|marri|spouse|wife|husband|lover|beloved|romantic|romance|wedding)\b/i.test(fullContext);

        // If marriage context exists and both entities are mentioned in it, skip parent_of/child_of
        if (hasMarriageContext) {
          console.log(`[NARRATIVE] Skipping ${predicate}(${possessorEntity.id}, ${targetEntity.id}) - marriage context detected`);
          continue;
        }
      }

      const evidenceSpan = {
        start: match.index,
        end: match.index + match[0].length + entityMatch[0].length,
        text: match[0] + ' ' + entityMatch[0]
      };

      const relation: Relation = {
        id: uuid(),
        subj: possessorEntity.id,
        pred: predicate as any,
        obj: targetEntity.id,
        evidence: [{
          doc_id: docId,
          span: evidenceSpan,
          sentence_index: getSentenceIndex(text, match.index),
          source: 'RULE' as const
        }],
        confidence: 0.80,
        extractor: 'regex'
      };

      // Create the natural direction only (don't auto-create inverses)
      relations.push(relation);
    }
  }

  // Pattern 2a: Appositive - "X, his/her [adj] wife/husband/etc." → married_to, sibling_of, etc.
  // Handles: "Lady Elena Blackwood, his estranged wife"
  const appositiveRolePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+(his|her)\s+(?:\w+\s+)?(wife|husband|spouse|brother|sister|father|mother|son|daughter)\b/gi;

  while ((match = appositiveRolePattern.exec(text)) !== null) {
    const entityName = match[1];
    const pronoun = match[2].toLowerCase();
    const roleWord = match[3].toLowerCase();

    const targetEntity = matchEntity(entityName, entities);
    if (!targetEntity || targetEntity.type !== 'PERSON') continue;

    // Resolve the possessive pronoun to find the other entity
    let possessorEntities = resolvePossessivePronoun(pronoun, match.index, corefLinks, entities) ?? [];
    possessorEntities = possessorEntities.filter(e => e.type === 'PERSON' && e.id !== targetEntity.id);

    // Fallback: find recent PERSON entities
    if (!possessorEntities.length) {
      const recentPersons = findRecentPersons(match.index).filter(e => e.id !== targetEntity.id);
      if (recentPersons.length > 0) {
        possessorEntities = [recentPersons[0]];
      }
    }

    if (!possessorEntities.length) continue;

    // Determine predicate based on role
    let predicate: string;
    let subj: string;
    let obj: string;
    if (['wife', 'husband', 'spouse'].includes(roleWord)) {
      predicate = 'married_to';
      subj = possessorEntities[0].id;
      obj = targetEntity.id;
    } else if (['brother', 'sister'].includes(roleWord)) {
      predicate = 'sibling_of';
      subj = possessorEntities[0].id;
      obj = targetEntity.id;
    } else if (['father', 'mother'].includes(roleWord)) {
      predicate = 'child_of';
      subj = possessorEntities[0].id;
      obj = targetEntity.id;
    } else if (['son', 'daughter'].includes(roleWord)) {
      predicate = 'parent_of';
      subj = possessorEntities[0].id;
      obj = targetEntity.id;
    } else {
      continue;
    }

    const evidenceSpan = {
      start: match.index,
      end: match.index + match[0].length,
      text: match[0]
    };

    const relation: Relation = {
      id: uuid(),
      subj: subj,
      pred: predicate as any,
      obj: obj,
      evidence: [{
        doc_id: docId,
        span: evidenceSpan,
        sentence_index: getSentenceIndex(text, match.index),
        source: 'RULE' as const
      }],
      confidence: 0.85,
      extractor: 'regex'
    };

    relations.push(relation);
  }

  // Pattern 2b: Possessive student - "X's graduate student/advisee" → mentor_of(X, student)
  // Handles: "Professor Hartley's graduate student, John Peterson"
  // NOTE: Using 'g' flag only, NOT 'i', to ensure [A-Z] only matches uppercase letters
  const possessiveStudentPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)'s\s+(?:graduate\s+)?(?:student|advisee|mentee|protege|apprentice)\b/g;

  while ((match = possessiveStudentPattern.exec(text)) !== null) {
    const mentorName = match[1];
    const mentorEntity = matchEntity(mentorName, entities);
    if (!mentorEntity || mentorEntity.type !== 'PERSON') continue;

    // Look for student name after (within 150 chars)
    const afterMatch = text.substring(match.index + match[0].length, match.index + match[0].length + 150);

    // First try: Look for "- FullName" pattern (indicates the actual full name after a hyphen)
    // Handles: "also named John - John Peterson" where "John Peterson" is the real name
    const hyphenNameMatch = afterMatch.match(/\s*-\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);

    // Second try: Simple name after comma or space
    const simpleNameMatch = afterMatch.match(/(?:,\s*)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);

    // Prefer hyphen match (more specific), fall back to simple match
    const studentNameMatch = hyphenNameMatch || simpleNameMatch;

    if (!studentNameMatch) continue;
    const studentEntity = matchEntity(studentNameMatch[1], entities);
    if (!studentEntity || studentEntity.type !== 'PERSON') continue;
    if (studentEntity.id === mentorEntity.id) continue;

    const evidenceSpan = {
      start: match.index,
      end: match.index + match[0].length,
      text: match[0]
    };

    const relation: Relation = {
      id: uuid(),
      subj: mentorEntity.id,
      pred: 'mentor_of' as any,
      obj: studentEntity.id,
      evidence: [{
        doc_id: docId,
        span: evidenceSpan,
        sentence_index: getSentenceIndex(text, match.index),
        source: 'RULE' as const
      }],
      confidence: 0.80,
      extractor: 'regex'
    };

    relations.push(relation);
  }

  // Pattern 2c: Colleague pattern - "His/Her colleague, X" → colleague_of
  // Handles: "His colleague, John Williams"
  const colleaguePattern = /\b(His|Her)\s+colleague,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi;

  while ((match = colleaguePattern.exec(text)) !== null) {
    const pronoun = match[1].toLowerCase();
    const colleagueName = match[2];

    // Resolve pronoun to find the first person
    let personEntities = resolvePossessivePronoun(pronoun === 'his' ? 'his' : 'her', match.index, corefLinks, entities) ?? [];
    personEntities = personEntities.filter(e => e.type === 'PERSON');

    // Fallback to recent persons
    if (!personEntities.length) {
      const recentPersons = findRecentPersons(match.index);
      if (recentPersons.length > 0) {
        personEntities = [recentPersons[0]];
      }
    }

    if (!personEntities.length) continue;

    // Find colleague entity
    const colleagueEntity = matchEntity(colleagueName, entities);
    if (!colleagueEntity || colleagueEntity.type !== 'PERSON') continue;
    if (colleagueEntity.id === personEntities[0].id) continue;

    const evidenceSpan = {
      start: match.index,
      end: match.index + match[0].length,
      text: match[0]
    };

    const relation: Relation = {
      id: uuid(),
      subj: personEntities[0].id,
      pred: 'colleague_of' as any,
      obj: colleagueEntity.id,
      evidence: [{
        doc_id: docId,
        span: evidenceSpan,
        sentence_index: getSentenceIndex(text, match.index),
        source: 'RULE' as const
      }],
      confidence: 0.80,
      extractor: 'regex'
    };

    relations.push(relation);
  }

  // Pattern 2d: Pronoun-aware gave_to - "He/She gave it to X" → gave_to(resolved_pronoun, X)
  // Handles: "He gave it to the cathedral"
  const pronounGavePattern = /\b(He|She)\s+gave\s+(?:it|them|this|that|the\s+\w+)\s+to\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi;

  while ((match = pronounGavePattern.exec(text)) !== null) {
    const pronoun = match[1].toLowerCase();
    const recipientName = match[2];

    // Resolve pronoun to find giver
    let giverEntities = resolvePossessivePronoun(pronoun === 'he' ? 'his' : 'her', match.index, corefLinks, entities) ?? [];
    giverEntities = giverEntities.filter(e => e.type === 'PERSON');

    // Fallback to recent persons
    if (!giverEntities.length) {
      const recentPersons = findRecentPersons(match.index);
      if (recentPersons.length > 0) {
        giverEntities = [recentPersons[0]];
      }
    }

    if (!giverEntities.length) continue;

    // Find recipient entity
    const recipientEntity = matchEntity(recipientName, entities);
    if (!recipientEntity) continue;
    if (recipientEntity.id === giverEntities[0].id) continue;

    const evidenceSpan = {
      start: match.index,
      end: match.index + match[0].length,
      text: match[0]
    };

    const relation: Relation = {
      id: uuid(),
      subj: giverEntities[0].id,
      pred: 'gave_to' as any,
      obj: recipientEntity.id,
      evidence: [{
        doc_id: docId,
        span: evidenceSpan,
        sentence_index: getSentenceIndex(text, match.index),
        source: 'RULE' as const
      }],
      confidence: 0.75,
      extractor: 'regex'
    };

    relations.push(relation);
  }

  // Pattern 2d: Gift pattern - "A gift for X" + speaker → gave_to
  // Handles: "A gift for you," Marcus said → gave_to(Marcus, recipient)
  const giftPattern = /\bA\s+gift\s+for\s+(?:you|him|her),?["']?\s*(?:,\s*)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+said\b/gi;

  while ((match = giftPattern.exec(text)) !== null) {
    const giverName = match[1];
    const giverEntity = matchEntity(giverName, entities);
    if (!giverEntity || giverEntity.type !== 'PERSON') continue;

    // Look backwards for the recipient (within 200 chars before "A gift")
    const beforeMatch = text.substring(Math.max(0, match.index - 200), match.index);

    // Find recent person mentioned before the gift
    const recentPersonPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    let lastPerson = null;
    let personMatch;
    while ((personMatch = recentPersonPattern.exec(beforeMatch)) !== null) {
      const possibleRecipient = matchEntity(personMatch[1], entities);
      if (possibleRecipient && possibleRecipient.type === 'PERSON' && possibleRecipient.id !== giverEntity.id) {
        lastPerson = possibleRecipient;
      }
    }

    if (!lastPerson) continue;

    const evidenceSpan = {
      start: match.index,
      end: match.index + match[0].length,
      text: match[0]
    };

    const relation: Relation = {
      id: uuid(),
      subj: giverEntity.id,
      pred: 'gave_to' as any,
      obj: lastPerson.id,
      evidence: [{
        doc_id: docId,
        span: evidenceSpan,
        sentence_index: getSentenceIndex(text, match.index),
        source: 'RULE' as const
      }],
      confidence: 0.75,
      extractor: 'regex'
    };

    relations.push(relation);
  }

  // Pattern 2e: Purchase pattern - "X said" + "placing coins" → bought
  // Handles: "I'll take it," said Marcus Grey, placing three gold coins
  const purchasePattern = /(?:said|replied)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+placing\s+(?:\w+\s+)*(?:coin|gold|silver|money)/gi;

  while ((match = purchasePattern.exec(text)) !== null) {
    const buyerName = match[1];
    const buyerEntity = matchEntity(buyerName, entities);
    if (!buyerEntity || buyerEntity.type !== 'PERSON') continue;

    // Look for item mentioned before (within 100 chars)
    const beforeMatch = text.substring(Math.max(0, match.index - 100), match.index);
    const itemPattern = /\b(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    let itemMatch;
    let itemEntity = null;
    while ((itemMatch = itemPattern.exec(beforeMatch)) !== null) {
      const possibleItem = matchEntity(itemMatch[1], entities);
      if (possibleItem && possibleItem.type === 'ITEM') {
        itemEntity = possibleItem;
      }
    }

    if (itemEntity) {
      const evidenceSpan = {
        start: match.index,
        end: match.index + match[0].length,
        text: match[0]
      };

      const relation: Relation = {
        id: uuid(),
        subj: buyerEntity.id,
        pred: 'bought' as any,
        obj: itemEntity.id,
        evidence: [{
          doc_id: docId,
          span: evidenceSpan,
          sentence_index: getSentenceIndex(text, match.index),
          source: 'RULE' as const
        }],
        confidence: 0.70,
        extractor: 'regex'
      };

      relations.push(relation);
    }
  }

  // Pattern 3: "X had a daughter/son, Y" → parent_of(X, Y)
  const hadChildPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+)?had\s+a\s+(daughter|son|child)\b/gi;

  while ((match = hadChildPattern.exec(text)) !== null) {
    const parent1Name = match[1];
    const parent2Name = match[2]; // Optional "X and Y had..."
    const roleWord = match[3].toLowerCase();

    const parent1 = matchEntity(parent1Name, entities);
    if (!parent1 || parent1.type !== 'PERSON') continue;

    const parents = [parent1];
    if (parent2Name) {
      const parent2 = matchEntity(parent2Name, entities);
      if (parent2 && parent2.type === 'PERSON') {
        parents.push(parent2);
      }
    }

    const predicate = 'parent_of';

    // Look for child name after the pattern (within 100 chars)
    const afterMatch = text.substring(match.index + match[0].length, match.index + match[0].length + 100);
    const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/;
    const entityMatch = afterMatch.match(entityPattern);

    if (!entityMatch) continue;
    const childEntity = matchEntity(entityMatch[1], entities);
    if (!childEntity || childEntity.type !== 'PERSON') continue;

    for (const parentEntity of parents) {
      if (childEntity.id === parentEntity.id) continue;

      const evidenceSpan = {
        start: match.index,
        end: match.index + match[0].length + entityMatch[0].length,
        text: match[0] + ' ' + entityMatch[0]
      };

      const relation: Relation = {
        id: uuid(),
        subj: parentEntity.id,
        pred: predicate as any,
        obj: childEntity.id,
        evidence: [{
          doc_id: docId,
          span: evidenceSpan,
          sentence_index: getSentenceIndex(text, match.index),
          source: 'RULE' as const
        }],
        confidence: 0.85,
        extractor: 'regex'
      };

      relations.push(relation);
    }
  }

  // SIBLING DETECTION FILTER (Pattern FM-1 from LINGUISTIC_REFERENCE.md v0.6 §7.1)
  // Block parent_of relations where the "parent" has a sibling indicator
  console.log(`[POSSESSIVE-SIBLING-FILTER] Starting filter on ${relations.length} relations`);
  const SIBLING_APPOSITIVE_PATTERN = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*,\s*(?:the\s+)?(?:eldest|oldest|younger|youngest|twin|middle)\s+(?:son|daughter|child|brother|sister|sibling)\b/gi;
  const siblingsWithIndicators = new Set<string>();

  const siblingMatches = text.matchAll(SIBLING_APPOSITIVE_PATTERN);
  for (const match of siblingMatches) {
    const siblingName = match[1].toLowerCase();
    siblingsWithIndicators.add(siblingName);
    console.log(`[POSSESSIVE-SIBLING-FILTER] Detected sibling: ${siblingName}`);
  }

  // Create entity ID to name mapping
  const entityIdToName = new Map<string, string>();
  for (const entity of entities) {
    entityIdToName.set(entity.id, entity.canonical.toLowerCase());
  }

  // Filter out parent_of relations where subject has sibling indicator
  const filteredRelations = relations.filter(rel => {
    if (rel.pred === 'parent_of') {
      const subjName = entityIdToName.get(rel.subj) || '';
      if (subjName && siblingsWithIndicators.has(subjName)) {
        console.log(`[POSSESSIVE-SIBLING-FILTER] Removing parent_of(${subjName}, ${rel.obj}) - ${subjName} has sibling indicator`);
        return false;
      }
    }
    return true;
  });

  return filteredRelations;
}

/**
 * Combine all narrative extraction methods
 *
 * If no corefLinks are provided, uses built-in lightweight pronoun resolver
 * for basic recency-based pronoun resolution.
 */
export function extractAllNarrativeRelations(
  text: string,
  entities: EntityLookup[],
  docId: string = 'current',
  corefLinks?: CorefLinks
): Relation[] {
  // If no coref links provided, build simple ones using recency-based resolution
  let effectiveCorefLinks = corefLinks;
  if (!effectiveCorefLinks) {
    effectiveCorefLinks = buildSimpleCorefLinks(text, entities);
    if (effectiveCorefLinks.links.length > 0) {
      console.log(`[NarrativeRelations] Built ${effectiveCorefLinks.links.length} simple coref links`);
    }
  }

  const narrativeRelations = extractNarrativeRelations(text, entities, docId, effectiveCorefLinks);
  const possessiveRelations = extractPossessiveFamilyRelations(text, entities, docId, effectiveCorefLinks);

  return [...narrativeRelations, ...possessiveRelations];
}
