/**
 * ReferenceResolver - Unified Reference Resolution Service
 *
 * This module consolidates all pronoun resolution, entity tracking, and coreference
 * linking into a single, consistent API. It replaces the scattered implementations in:
 * - coref.ts (pronoun stack, title matching, nominal matching)
 * - narrative-relations.ts (pronounMap, findPronounResolution)
 * - relations.ts (lastNamedSubject tracking)
 * - coref-enhanced.ts (appositive detection)
 *
 * Design Principles:
 * 1. Single source of truth for all reference resolution
 * 2. Position-aware pronoun resolution
 * 3. Consistent confidence scoring
 * 4. Unified entity context tracking
 * 5. Gender/number agreement validation
 *
 * @module reference-resolver
 * @version 1.0.0
 * @created 2025-12-31
 */

import type { Entity, EntityType } from './schema';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export type Gender = 'male' | 'female' | 'neutral' | 'unknown';
export type NumberType = 'singular' | 'plural' | 'unknown';

export interface Span {
  start: number;
  end: number;
  text?: string;
}

export interface Sentence {
  text: string;
  start: number;
  end: number;
}

export interface Mention {
  text: string;
  start: number;
  end: number;
  sentence_index: number;
  type: 'pronoun' | 'title' | 'nominal' | 'name' | 'quote';
}

export interface EntitySpan {
  entity_id: string;
  start: number;
  end: number;
  text?: string;
}

export interface CorefLink {
  mention: Mention;
  entity_id: string;
  confidence: number;
  method: 'pronoun' | 'title' | 'nominal' | 'quote' | 'coordination' | 'appositive';
}

export interface CorefLinks {
  links: CorefLink[];
  quotes: Array<{
    text: string;
    start: number;
    end: number;
    speaker_entity_id: string;
    sentence_index: number;
  }>;
}

/**
 * Resolution context affects the algorithm used
 */
export type ResolutionContext =
  | 'SENTENCE_START'   // Pronoun at start of sentence - prefer subject of previous
  | 'SENTENCE_MID'     // Mid-sentence pronoun - recency-based
  | 'PATTERN_MATCH'    // During regex pattern matching - position-aware
  | 'POSSESSIVE';      // Possessive pronoun (his/her/their)

/**
 * Entity lookup result with additional context
 */
export interface ResolvedEntity {
  id: string;
  canonical: string;
  type: EntityType;
  confidence: number;
  method: CorefLink['method'];
}

/**
 * Pronoun information for resolution
 */
interface PronounInfo {
  gender: Gender;
  number: NumberType;
  case: 'subject' | 'object' | 'possessive' | 'reflexive';
}

/**
 * Scored resolution candidate
 */
interface ResolutionCandidate {
  entity: Entity;
  entitySpan: EntitySpan;
  score: number;
  reason: string;
}

// =============================================================================
// PRONOUN DATABASE
// =============================================================================

const PRONOUNS: Map<string, PronounInfo> = new Map([
  // Subject pronouns
  ['he', { gender: 'male', number: 'singular', case: 'subject' }],
  ['she', { gender: 'female', number: 'singular', case: 'subject' }],
  ['it', { gender: 'neutral', number: 'singular', case: 'subject' }],
  ['they', { gender: 'unknown', number: 'plural', case: 'subject' }],

  // Object pronouns
  ['him', { gender: 'male', number: 'singular', case: 'object' }],
  ['her', { gender: 'female', number: 'singular', case: 'object' }],
  ['them', { gender: 'unknown', number: 'plural', case: 'object' }],

  // Possessive pronouns
  ['his', { gender: 'male', number: 'singular', case: 'possessive' }],
  ['her', { gender: 'female', number: 'singular', case: 'possessive' }],
  ['its', { gender: 'neutral', number: 'singular', case: 'possessive' }],
  ['their', { gender: 'unknown', number: 'plural', case: 'possessive' }],

  // Reflexive pronouns
  ['himself', { gender: 'male', number: 'singular', case: 'reflexive' }],
  ['herself', { gender: 'female', number: 'singular', case: 'reflexive' }],
  ['itself', { gender: 'neutral', number: 'singular', case: 'reflexive' }],
  ['themselves', { gender: 'unknown', number: 'plural', case: 'reflexive' }],
]);

// =============================================================================
// GENDER INFERENCE
// =============================================================================

/**
 * Known male names for gender inference
 */
const MALE_NAMES = new Set([
  // Common names
  'harry', 'ron', 'james', 'john', 'michael', 'david', 'robert', 'william', 'richard',
  'mark', 'tom', 'sam', 'george', 'edward', 'henry', 'charles', 'peter', 'paul',
  // Fantasy names
  'aragorn', 'frodo', 'gandalf', 'bilbo', 'legolas', 'gimli', 'boromir', 'faramir',
  'elrond', 'théoden', 'éomer', 'denethor', 'saruman', 'sauron',
  // Harry Potter names
  'draco', 'severus', 'albus', 'voldemort', 'neville', 'remus', 'sirius',
  'arthur', 'bill', 'charlie', 'percy', 'fred', 'george', 'cedric', 'viktor',
  'dumbledore', 'hagrid', 'lupin', 'snape', 'malfoy', 'riddle', 'grindelwald',
  'scrimgeour', 'fudge', 'lockhart', 'slughorn', 'quirrell', 'moody', 'lucius',
  // Generic
  'king', 'prince', 'lord', 'duke', 'earl', 'baron', 'knight',
]);

/**
 * Known female names for gender inference
 */
const FEMALE_NAMES = new Set([
  // Common names
  'mary', 'elizabeth', 'anne', 'sarah', 'jane', 'margaret', 'catherine', 'alice',
  'emma', 'rose', 'grace', 'claire', 'sophie', 'lucy', 'helen', 'martha',
  // Fantasy names
  'arwen', 'galadriel', 'éowyn', 'rosie', 'goldberry', 'lobelia',
  // Harry Potter names
  'hermione', 'ginny', 'lily', 'molly', 'bellatrix', 'narcissa', 'petunia',
  'minerva', 'dolores', 'nymphadora', 'fleur', 'cho', 'luna', 'lavender',
  'parvati', 'padma', 'pansy', 'katie', 'angelina', 'alice', 'helena',
  'rowena', 'helga', 'andromeda', 'rita', 'sybill', 'poppy', 'pomona',
  // Generic
  'queen', 'princess', 'lady', 'duchess', 'countess', 'baroness', 'dame',
]);

/**
 * Patterns indicating male gender
 */
const MALE_PATTERNS = /\b(mr\.?|mister|sir|king|prince|lord|duke|earl|baron|father|dad|daddy|son|brother|uncle|nephew|grandfather|grandson|husband|boyfriend|man|boy|gentleman|wizard|sorcerer|warlock)\b/i;

/**
 * Patterns indicating female gender
 */
const FEMALE_PATTERNS = /\b(mrs\.?|ms\.?|miss|madam|lady|queen|princess|duchess|countess|baroness|mother|mom|mum|mommy|mummy|daughter|sister|aunt|niece|grandmother|granddaughter|wife|girlfriend|woman|girl|witch|sorceress|enchantress)\b/i;

// =============================================================================
// REFERENCE RESOLVER CLASS
// =============================================================================

/**
 * Unified Reference Resolution Service
 *
 * Usage:
 * ```typescript
 * const resolver = new ReferenceResolver();
 * resolver.initialize(entities, entitySpans, sentences, text);
 *
 * // Resolve a pronoun at a specific position
 * const entity = resolver.resolvePronoun('he', 245, 'SENTENCE_MID');
 *
 * // Update context as you process tokens
 * resolver.updateContext(entity, 'PERSON');
 *
 * // Get coref links for downstream use
 * const corefLinks = resolver.getCorefLinks();
 * ```
 */
export class ReferenceResolver {
  // Core data
  private entities: Entity[] = [];
  private entitySpans: EntitySpan[] = [];
  private sentences: Sentence[] = [];
  private text: string = '';

  // Entity lookup maps
  private entitiesById: Map<string, Entity> = new Map();
  private entityGenders: Map<string, Gender> = new Map();

  // Resolution state
  private corefLinks: CorefLink[] = [];
  private pronounResolutionMap: Map<string, Array<{ entityId: string; start: number; end: number }>> = new Map();

  // Context tracking (replaces scattered lastNamedSubject patterns)
  private lastNamedPerson: Entity | null = null;
  private lastNamedOrg: Entity | null = null;
  private lastNamedPlace: Entity | null = null;
  private recentPersons: Entity[] = [];
  private readonly MAX_RECENT_PERSONS = 6;

  // Paragraph tracking
  private paragraphBoundaries: number[] = [];

  // Debug flag
  private debug: boolean = process.env.COREF_DEBUG === '1';

  // =============================================================================
  // INITIALIZATION
  // =============================================================================

  /**
   * Initialize the resolver with document context
   */
  initialize(
    entities: Entity[],
    entitySpans: EntitySpan[],
    sentences: Sentence[],
    text: string
  ): void {
    this.entities = entities;
    this.entitySpans = entitySpans;
    this.sentences = sentences;
    this.text = text;

    // Build lookup maps
    this.entitiesById = new Map(entities.map(e => [e.id, e]));

    // Infer genders for all entities
    for (const entity of entities) {
      this.entityGenders.set(entity.id, this.inferGender(entity));
    }

    // Find paragraph boundaries
    this.paragraphBoundaries = this.findParagraphBoundaries(text);

    // Reset state
    this.resetContext();
    this.corefLinks = [];
    this.pronounResolutionMap = new Map();

    if (this.debug) {
      console.log(`[ReferenceResolver] Initialized with ${entities.length} entities, ${sentences.length} sentences`);
    }
  }

  /**
   * Reset context tracking state
   */
  resetContext(): void {
    this.lastNamedPerson = null;
    this.lastNamedOrg = null;
    this.lastNamedPlace = null;
    this.recentPersons = [];
  }

  // =============================================================================
  // GENDER INFERENCE
  // =============================================================================

  /**
   * Infer gender from entity name and context
   */
  inferGender(entity: Entity): Gender {
    const name = entity.canonical.toLowerCase();
    const firstName = name.split(/\s+/)[0];

    // Check known name lists
    if (MALE_NAMES.has(firstName)) return 'male';
    if (FEMALE_NAMES.has(firstName)) return 'female';

    // Check full name against patterns
    if (MALE_PATTERNS.test(entity.canonical)) return 'male';
    if (FEMALE_PATTERNS.test(entity.canonical)) return 'female';

    // Check aliases
    if (entity.aliases) {
      for (const alias of entity.aliases) {
        const aliasLower = alias.toLowerCase();
        const aliasFirst = aliasLower.split(/\s+/)[0];
        if (MALE_NAMES.has(aliasFirst)) return 'male';
        if (FEMALE_NAMES.has(aliasFirst)) return 'female';
        if (MALE_PATTERNS.test(alias)) return 'male';
        if (FEMALE_PATTERNS.test(alias)) return 'female';
      }
    }

    // Non-PERSON entities are typically neutral
    if (entity.type !== 'PERSON') return 'neutral';

    return 'unknown';
  }

  /**
   * Get cached gender for entity
   */
  getEntityGender(entityId: string): Gender {
    return this.entityGenders.get(entityId) ?? 'unknown';
  }

  /**
   * Learn gender from context patterns
   * Patterns: "their son, X" → X is male, "the couple's daughter, Y" → Y is female
   */
  learnGenderFromContext(): void {
    // Pattern: "their son, X" or "their daughter, X"
    const sonDaughterPattern = /\b(?:their|his|her)\s+(son|daughter)[,\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi;
    let match;
    while ((match = sonDaughterPattern.exec(this.text)) !== null) {
      const role = match[1].toLowerCase();
      const name = match[2];
      const gender: Gender = role === 'son' ? 'male' : 'female';

      // Find matching entity
      for (const entity of this.entities) {
        if (entity.canonical.toLowerCase().includes(name.toLowerCase()) ||
            entity.aliases?.some((a: string) => a.toLowerCase().includes(name.toLowerCase()))) {
          this.entityGenders.set(entity.id, gender);
          if (this.debug) {
            console.log(`[ReferenceResolver] Learned gender: ${entity.canonical} = ${gender} (from "${match[0]}")`);
          }
        }
      }
    }

    // Pattern: "X, his/her brother/sister"
    const siblingPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s+(?:his|her)\s+(brother|sister)\b/gi;
    while ((match = siblingPattern.exec(this.text)) !== null) {
      const name = match[1];
      const role = match[2].toLowerCase();
      const gender: Gender = role === 'brother' ? 'male' : 'female';

      for (const entity of this.entities) {
        if (entity.canonical.toLowerCase().includes(name.toLowerCase())) {
          this.entityGenders.set(entity.id, gender);
          if (this.debug) {
            console.log(`[ReferenceResolver] Learned gender: ${entity.canonical} = ${gender} (from sibling pattern)`);
          }
        }
      }
    }
  }

  // =============================================================================
  // PRONOUN RESOLUTION
  // =============================================================================

  /**
   * Check if string is a pronoun
   */
  isPronoun(text: string): boolean {
    return PRONOUNS.has(text.toLowerCase());
  }

  /**
   * Get pronoun info
   */
  getPronounInfo(pronoun: string): PronounInfo | null {
    return PRONOUNS.get(pronoun.toLowerCase()) ?? null;
  }

  /**
   * Check if entity matches pronoun's gender and number constraints
   */
  matchesGenderNumber(entity: Entity, pronoun: string): boolean {
    const info = this.getPronounInfo(pronoun);
    if (!info) return false;

    const entityGender = this.getEntityGender(entity.id);

    // Number check
    if (info.number === 'plural') {
      // "they" can refer to groups or unknown gender
      return true;
    }

    // Gender check for gendered pronouns
    if (info.gender === 'male' && entityGender !== 'male' && entityGender !== 'unknown') {
      return false;
    }
    if (info.gender === 'female' && entityGender !== 'female' && entityGender !== 'unknown') {
      return false;
    }

    // Neutral pronouns ("it") typically refer to non-PERSON entities
    if (info.gender === 'neutral' && entity.type === 'PERSON') {
      return false;
    }

    return true;
  }

  /**
   * Resolve a pronoun to an entity
   *
   * This is the main entry point for pronoun resolution. It dispatches to
   * different algorithms based on the resolution context.
   */
  resolvePronoun(
    pronoun: string,
    position: number,
    context: ResolutionContext,
    allowedTypes?: EntityType[]
  ): ResolvedEntity | null {
    const info = this.getPronounInfo(pronoun);
    if (!info) return null;

    // Determine allowed types based on pronoun if not explicitly provided
    if (!allowedTypes) {
      if (info.gender === 'neutral') {
        // Neutral pronouns (it, its, itself) can refer to non-PERSON entities
        allowedTypes = ['ORG', 'PLACE', 'ITEM', 'WORK', 'EVENT'];
      } else {
        // Gendered and plural pronouns typically refer to PERSON
        allowedTypes = ['PERSON'];
      }
    }

    // Try existing coref links first (if already resolved)
    const existingLink = this.findExistingLink(pronoun, position);
    if (existingLink) {
      const entity = this.entitiesById.get(existingLink.entity_id);
      if (entity && allowedTypes.includes(entity.type)) {
        return {
          id: entity.id,
          canonical: entity.canonical,
          type: entity.type,
          confidence: existingLink.confidence,
          method: existingLink.method,
        };
      }
    }

    // Dispatch based on context
    switch (context) {
      case 'SENTENCE_START':
        return this.resolveSentenceStartPronoun(pronoun, position, info, allowedTypes);
      case 'POSSESSIVE':
        return this.resolvePossessivePronoun(pronoun, position, info, allowedTypes);
      case 'PATTERN_MATCH':
        return this.resolvePatternMatchPronoun(pronoun, position, info, allowedTypes);
      case 'SENTENCE_MID':
      default:
        return this.resolveMidSentencePronoun(pronoun, position, info, allowedTypes);
    }
  }

  /**
   * Resolve multiple entities for plural pronouns (e.g., "they", "their")
   */
  resolvePronounMultiple(
    pronoun: string,
    position: number,
    limit: number = 2
  ): ResolvedEntity[] {
    const info = this.getPronounInfo(pronoun);
    if (!info) return [];

    // For plural pronouns, return recent persons
    if (info.number === 'plural' && this.recentPersons.length > 0) {
      return this.recentPersons.slice(0, limit).map(entity => ({
        id: entity.id,
        canonical: entity.canonical,
        type: entity.type,
        confidence: 0.7,
        method: 'pronoun' as const,
      }));
    }

    // For singular, try normal resolution
    const single = this.resolvePronoun(pronoun, position, 'SENTENCE_MID');
    return single ? [single] : [];
  }

  /**
   * Find existing coref link for a pronoun at a position
   */
  private findExistingLink(pronoun: string, position: number): CorefLink | null {
    for (const link of this.corefLinks) {
      if (link.mention.text.toLowerCase() === pronoun.toLowerCase() &&
          position >= link.mention.start && position < link.mention.end) {
        return link;
      }
    }
    return null;
  }

  /**
   * Resolve pronoun at start of sentence
   * Strategy: Prefer subject of previous sentence for subject pronouns,
   * most recent entity for possessive pronouns
   */
  private resolveSentenceStartPronoun(
    pronoun: string,
    position: number,
    info: PronounInfo,
    allowedTypes: EntityType[]
  ): ResolvedEntity | null {
    const sentenceIndex = this.getSentenceIndex(position);
    if (sentenceIndex <= 0) {
      return this.resolveMidSentencePronoun(pronoun, position, info, allowedTypes);
    }

    const prevSentence = this.sentences[sentenceIndex - 1];
    const currentParagraph = this.getParagraphIndex(position);
    const prevParagraph = this.getParagraphIndex(prevSentence.start);

    // Cross-paragraph resolution: still look for subject of last sentence in prev paragraph
    // but use slightly lower confidence and check for paragraph topic entity
    let targetSentence = prevSentence;
    let confidenceModifier = 0;

    if (currentParagraph !== prevParagraph) {
      // For cross-paragraph, find the FIRST sentence of the previous paragraph
      // (the topic-setting sentence) rather than the last
      const prevParaStart = this.paragraphBoundaries[prevParagraph] ?? 0;
      const firstSentenceOfPrevPara = this.sentences.find(s => s.start >= prevParaStart);
      if (firstSentenceOfPrevPara) {
        targetSentence = firstSentenceOfPrevPara;
        confidenceModifier = -0.1; // Lower confidence for cross-paragraph
      } else {
        return this.resolveMidSentencePronoun(pronoun, position, info, allowedTypes);
      }
    }

    // Get entities from target sentence
    const prevSpans = this.entitySpans
      .filter(span => span.start >= targetSentence.start && span.start < targetSentence.end)
      .sort((a, b) => a.start - b.start);

    if (prevSpans.length === 0) {
      return this.resolveMidSentencePronoun(pronoun, position, info, allowedTypes);
    }

    // For subject pronouns (he, she, they), prefer FIRST entity (subject of sentence)
    // For possessive pronouns (his, her, their), prefer LAST entity (recency)
    const isSubjectPronoun = info.case === 'subject';
    const spans = isSubjectPronoun ? prevSpans : [...prevSpans].reverse();

    for (const span of spans) {
      const entity = this.entitiesById.get(span.entity_id);
      if (!entity) continue;
      if (!allowedTypes.includes(entity.type)) continue;
      if (!this.matchesGenderNumber(entity, pronoun)) continue;

      return {
        id: entity.id,
        canonical: entity.canonical,
        type: entity.type,
        confidence: 0.75 + confidenceModifier,
        method: 'pronoun',
      };
    }

    return this.resolveMidSentencePronoun(pronoun, position, info, allowedTypes);
  }

  /**
   * Resolve mid-sentence pronoun
   * Strategy: Recency-based with gender/number filtering
   */
  private resolveMidSentencePronoun(
    pronoun: string,
    position: number,
    info: PronounInfo,
    allowedTypes: EntityType[]
  ): ResolvedEntity | null {
    // Get candidates before the pronoun
    const candidates = this.entitySpans
      .filter(span => span.start < position)
      .sort((a, b) => b.start - a.start); // Most recent first

    for (const span of candidates) {
      const entity = this.entitiesById.get(span.entity_id);
      if (!entity) continue;
      if (!allowedTypes.includes(entity.type)) continue;
      if (!this.matchesGenderNumber(entity, pronoun)) continue;

      // Calculate distance-based confidence
      const distance = position - span.end;
      const confidence = Math.max(0.5, 0.75 - (distance / 2000) * 0.25);

      return {
        id: entity.id,
        canonical: entity.canonical,
        type: entity.type,
        confidence,
        method: 'pronoun',
      };
    }

    // Fallback to context tracking
    if (allowedTypes.includes('PERSON') && this.lastNamedPerson) {
      if (this.matchesGenderNumber(this.lastNamedPerson, pronoun)) {
        return {
          id: this.lastNamedPerson.id,
          canonical: this.lastNamedPerson.canonical,
          type: this.lastNamedPerson.type,
          confidence: 0.6,
          method: 'pronoun',
        };
      }
    }

    return null;
  }

  /**
   * Resolve possessive pronoun (his, her, their, its)
   * Strategy: Strongly prefer most recent entity of matching gender
   */
  private resolvePossessivePronoun(
    pronoun: string,
    position: number,
    info: PronounInfo,
    allowedTypes: EntityType[]
  ): ResolvedEntity | null {
    // For "their", try returning multiple entities
    if (pronoun.toLowerCase() === 'their' && this.recentPersons.length >= 2) {
      // Return the most recent person as the primary resolution
      const entity = this.recentPersons[0];
      if (allowedTypes.includes(entity.type)) {
        return {
          id: entity.id,
          canonical: entity.canonical,
          type: entity.type,
          confidence: 0.7,
          method: 'pronoun',
        };
      }
    }

    // Use recency-based resolution
    return this.resolveMidSentencePronoun(pronoun, position, info, allowedTypes);
  }

  /**
   * Resolve pronoun during pattern matching
   * Strategy: Position-aware, uses pronoun resolution map
   */
  private resolvePatternMatchPronoun(
    pronoun: string,
    position: number,
    info: PronounInfo,
    allowedTypes: EntityType[]
  ): ResolvedEntity | null {
    const pronounLower = pronoun.toLowerCase();
    const entries = this.pronounResolutionMap.get(pronounLower);

    if (entries && entries.length > 0) {
      // Find exact position match or closest
      let best: { entityId: string; distance: number } | null = null;

      for (const entry of entries) {
        // Exact match
        if (position >= entry.start && position < entry.end) {
          const entity = this.entitiesById.get(entry.entityId);
          if (entity && allowedTypes.includes(entity.type)) {
            return {
              id: entity.id,
              canonical: entity.canonical,
              type: entity.type,
              confidence: 0.8,
              method: 'pronoun',
            };
          }
        }

        // Track closest
        const distance = Math.abs(position - entry.start);
        if (!best || distance < best.distance) {
          best = { entityId: entry.entityId, distance };
        }
      }

      // Use closest if within reasonable range
      if (best && best.distance < 50) {
        const entity = this.entitiesById.get(best.entityId);
        if (entity && allowedTypes.includes(entity.type)) {
          return {
            id: entity.id,
            canonical: entity.canonical,
            type: entity.type,
            confidence: Math.max(0.5, 0.75 - best.distance / 100),
            method: 'pronoun',
          };
        }
      }
    }

    // Fallback to mid-sentence resolution
    return this.resolveMidSentencePronoun(pronoun, position, info, allowedTypes);
  }

  // =============================================================================
  // CONTEXT TRACKING
  // =============================================================================

  /**
   * Update context with a newly encountered entity
   * Call this as you process tokens/entities in order
   */
  updateContext(entity: Entity): void {
    switch (entity.type) {
      case 'PERSON':
        this.lastNamedPerson = entity;
        // Add to recent persons, avoiding duplicates
        const existing = this.recentPersons.findIndex(e => e.id === entity.id);
        if (existing >= 0) {
          this.recentPersons.splice(existing, 1);
        }
        this.recentPersons.unshift(entity);
        if (this.recentPersons.length > this.MAX_RECENT_PERSONS) {
          this.recentPersons.pop();
        }
        break;
      case 'ORG':
        this.lastNamedOrg = entity;
        break;
      case 'PLACE':
        this.lastNamedPlace = entity;
        break;
    }
  }

  /**
   * Get last named entity of a specific type
   */
  getLastNamedEntity(type: EntityType): Entity | null {
    switch (type) {
      case 'PERSON':
        return this.lastNamedPerson;
      case 'ORG':
        return this.lastNamedOrg;
      case 'PLACE':
        return this.lastNamedPlace;
      default:
        return null;
    }
  }

  /**
   * Get recent entities of a specific type
   */
  getRecentEntities(type: EntityType, limit: number = 3): Entity[] {
    if (type === 'PERSON') {
      return this.recentPersons.slice(0, limit);
    }
    // For other types, we only track the last one
    const last = this.getLastNamedEntity(type);
    return last ? [last] : [];
  }

  // =============================================================================
  // COREF LINK MANAGEMENT
  // =============================================================================

  /**
   * Add a coref link
   */
  addCorefLink(link: CorefLink): void {
    this.corefLinks.push(link);

    // Also update pronoun resolution map
    if (link.mention.type === 'pronoun') {
      const key = link.mention.text.toLowerCase();
      if (!this.pronounResolutionMap.has(key)) {
        this.pronounResolutionMap.set(key, []);
      }
      this.pronounResolutionMap.get(key)!.push({
        entityId: link.entity_id,
        start: link.mention.start,
        end: link.mention.end,
      });
    }
  }

  /**
   * Get all coref links
   */
  getCorefLinks(): CorefLinks {
    return {
      links: this.corefLinks,
      quotes: [], // Quote attribution handled separately
    };
  }

  /**
   * Build pronoun resolution map from existing coref links
   * Call this after processing coref links from another source
   */
  buildPronounMap(links: CorefLink[]): void {
    this.pronounResolutionMap.clear();
    for (const link of links) {
      if (link.mention.type === 'pronoun' || this.isPronoun(link.mention.text)) {
        const key = link.mention.text.toLowerCase();
        if (!this.pronounResolutionMap.has(key)) {
          this.pronounResolutionMap.set(key, []);
        }
        this.pronounResolutionMap.get(key)!.push({
          entityId: link.entity_id,
          start: link.mention.start,
          end: link.mention.end,
        });
      }
    }

    if (this.debug) {
      let total = 0;
      for (const entries of this.pronounResolutionMap.values()) {
        total += entries.length;
      }
      console.log(`[ReferenceResolver] Built pronoun map: ${total} resolutions across ${this.pronounResolutionMap.size} pronouns`);
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Find paragraph boundaries in text
   */
  private findParagraphBoundaries(text: string): number[] {
    const boundaries: number[] = [0];
    const pattern = /\n\s*\n/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      boundaries.push(match.index + match[0].length);
    }
    return boundaries;
  }

  /**
   * Get paragraph index for a position
   */
  getParagraphIndex(position: number): number {
    for (let i = this.paragraphBoundaries.length - 1; i >= 0; i--) {
      if (position >= this.paragraphBoundaries[i]) {
        return i;
      }
    }
    return 0;
  }

  /**
   * Get sentence index for a position
   */
  getSentenceIndex(position: number): number {
    for (let i = 0; i < this.sentences.length; i++) {
      if (position >= this.sentences[i].start && position < this.sentences[i].end) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Check if position is at start of sentence (within first 5 chars)
   */
  isAtSentenceStart(position: number): boolean {
    const sentenceIndex = this.getSentenceIndex(position);
    if (sentenceIndex < 0) return false;
    const sentence = this.sentences[sentenceIndex];
    return (position - sentence.start) <= 5;
  }

  /**
   * Get entity by ID (for TokenResolver adapter)
   */
  getEntityById(entityId: string): Entity | undefined {
    return this.entitiesById.get(entityId);
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create and initialize a ReferenceResolver
 */
export function createReferenceResolver(
  entities: Entity[],
  entitySpans: EntitySpan[],
  sentences: Sentence[],
  text: string
): ReferenceResolver {
  const resolver = new ReferenceResolver();
  resolver.initialize(entities, entitySpans, sentences, text);
  resolver.learnGenderFromContext();
  return resolver;
}

// =============================================================================
// LEGACY COMPATIBILITY
// =============================================================================

/**
 * Compatibility function for code that expects the old isPronoun function
 */
export function isPronoun(text: string): boolean {
  return PRONOUNS.has(text.toLowerCase());
}

/**
 * Compatibility function for code that uses inferGender
 */
export function inferGender(entity: Entity): Gender {
  const resolver = new ReferenceResolver();
  return resolver.inferGender(entity);
}

/**
 * Compatibility function for matchesGenderNumber
 * Creates a resolver, initializes the entity's gender, then checks compatibility
 */
export function matchesGenderNumber(entity: Entity, pronoun: string): boolean {
  const resolver = new ReferenceResolver();
  // Need to initialize with the entity so gender is inferred
  resolver.initialize([entity], [], [], '');
  return resolver.matchesGenderNumber(entity, pronoun);
}

// =============================================================================
// TOKEN RESOLVER ADAPTER
// =============================================================================
// This adapter bridges between Token-level operations (used by relations.ts)
// and the ReferenceResolver service.

/**
 * Token type from parse-types.ts
 */
export interface AdapterToken {
  i: number;
  text: string;
  lemma: string;
  pos: string;
  tag: string;
  dep: string;
  head: number;
  ent: string;
  start: number;
  end: number;
}

/**
 * TokenResolver provides Token-level pronoun resolution using ReferenceResolver.
 * This allows relations.ts to gradually migrate from lastNamedSubject tracking
 * to the unified ReferenceResolver.
 *
 * Usage in relations.ts:
 * 1. Create TokenResolver with entities and their first mention tokens
 * 2. Use resolveToken() instead of checking lastNamedSubject
 *
 * Example migration:
 *   Before: if (tok.pos === 'PRON' && lastNamedSubject) { tok = lastNamedSubject; }
 *   After:  tok = tokenResolver.resolveToken(tok, position, context);
 */
export class TokenResolver {
  private referenceResolver: ReferenceResolver;
  private entityTokenMap: Map<string, AdapterToken>; // entity_id -> first mention token
  private recentPersonTokens: AdapterToken[] = [];

  constructor() {
    this.referenceResolver = new ReferenceResolver();
    this.entityTokenMap = new Map();
  }

  /**
   * Initialize with entities, their tokens, and the text context
   */
  initialize(
    entities: Entity[],
    entitySpans: EntitySpan[],
    sentences: Sentence[],
    text: string,
    sentenceTokens: AdapterToken[][]
  ): void {
    // Initialize the underlying ReferenceResolver
    this.referenceResolver.initialize(entities, entitySpans, sentences, text);
    this.referenceResolver.learnGenderFromContext();

    // Build mapping from entity_id -> first mention token
    this.entityTokenMap.clear();
    this.recentPersonTokens = [];

    for (const span of entitySpans) {
      if (this.entityTokenMap.has(span.entity_id)) continue; // Only keep first mention

      // Find the token at this position
      for (const tokens of sentenceTokens) {
        for (const tok of tokens) {
          if (tok.start === span.start) {
            this.entityTokenMap.set(span.entity_id, tok);

            // Track recent person tokens for plural pronoun resolution
            const entity = entities.find(e => e.id === span.entity_id);
            if (entity?.type === 'PERSON') {
              this.recentPersonTokens.push(tok);
            }
            break;
          }
        }
      }
    }
  }

  /**
   * Resolve a pronoun token to its antecedent token
   *
   * @param tok The token to potentially resolve
   * @param context The resolution context
   * @returns The resolved token (original if not a pronoun or no resolution found)
   */
  resolveToken(
    tok: AdapterToken,
    context: ResolutionContext = 'SENTENCE_MID'
  ): AdapterToken {
    // Only resolve pronouns
    if (tok.pos !== 'PRON') return tok;

    // Use ReferenceResolver to find the antecedent entity
    const resolved = this.referenceResolver.resolvePronoun(
      tok.text,
      tok.start,
      context,
      ['PERSON'] // Default to person resolution
    );

    if (!resolved) return tok;

    // Look up the token for the resolved entity
    const resolvedToken = this.entityTokenMap.get(resolved.id);
    if (!resolvedToken) return tok;

    return resolvedToken;
  }

  /**
   * Resolve possessive pronouns (his/her/their) to owner token(s)
   *
   * @param tok The possessive pronoun token
   * @returns Array of resolved tokens (for plural) or single token (for singular)
   */
  resolvePossessors(tok: AdapterToken): AdapterToken[] {
    if (tok.pos !== 'PRON') return [tok];

    const lower = tok.text.toLowerCase();

    // Handle plural possessives
    if (lower === 'their' && this.recentPersonTokens.length >= 2) {
      return this.recentPersonTokens.slice(0, 2);
    }

    // Handle singular possessives
    if (lower === 'his' || lower === 'her') {
      const resolved = this.referenceResolver.resolvePronoun(
        tok.text,
        tok.start,
        'POSSESSIVE',
        ['PERSON']
      );

      if (resolved) {
        const resolvedToken = this.entityTokenMap.get(resolved.id);
        if (resolvedToken) return [resolvedToken];
      }
    }

    // Fallback to most recent person
    if (this.recentPersonTokens.length > 0) {
      return [this.recentPersonTokens[0]];
    }

    return [];
  }

  /**
   * Check if a token is a pronoun
   */
  isPronoun(tok: AdapterToken): boolean {
    return tok.pos === 'PRON';
  }

  /**
   * Get the ReferenceResolver for direct access if needed
   */
  getResolver(): ReferenceResolver {
    return this.referenceResolver;
  }

  /**
   * Track a new named entity mention (updates recent persons list)
   */
  trackMention(tok: AdapterToken, entityId: string): void {
    if (!this.entityTokenMap.has(entityId)) {
      this.entityTokenMap.set(entityId, tok);
    }

    // Update recent persons list
    const entity = this.referenceResolver.getEntityById(entityId);
    if (entity?.type === 'PERSON') {
      // Add to front, remove duplicates
      this.recentPersonTokens = this.recentPersonTokens.filter(
        t => t.start !== tok.start
      );
      this.recentPersonTokens.unshift(tok);
      if (this.recentPersonTokens.length > 6) {
        this.recentPersonTokens.pop();
      }
    }
  }
}

/**
 * Factory function to create a TokenResolver
 */
export function createTokenResolver(
  entities: Entity[],
  entitySpans: EntitySpan[],
  sentences: Sentence[],
  text: string,
  sentenceTokens: AdapterToken[][]
): TokenResolver {
  const resolver = new TokenResolver();
  resolver.initialize(entities, entitySpans, sentences, text, sentenceTokens);
  return resolver;
}
