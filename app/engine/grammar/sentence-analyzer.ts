/**
 * Sentence Structure Analyzer
 *
 * Applies formal English grammar rules from Purdue OWL to parse sentences
 * into structured components for knowledge extraction.
 *
 * Reference: https://owl.purdue.edu/owl/general_writing/mechanics/sentence_structure.html
 *
 * Sentence Patterns (Purdue OWL):
 * 1. Subject + Verb (SV)
 * 2. Subject + Verb + Object (SVO)
 * 3. Subject + Verb + Complement (SVC)
 * 4. Subject + Verb + Indirect Object + Direct Object (SVOO)
 * 5. Subject + Verb + Object + Complement (SVOC)
 */

import type { Token, ParsedSentence } from '../extract/parse-types';
import type { Entity, Relation, Predicate, Qualifier } from '../schema';
import {
  detectVerbCategory,
  detectVerbTense,
  getTenseTemporality,
  extractAttributeFromAdjective,
  extractQualifierFromAdverb,
  detectPrepositionCategory,
  detectEntityDefiniteness,
  VerbCategory,
  type EntityAttribute,
  type RelationQualifier
} from './parts-of-speech';

/**
 * Sentence pattern types (Purdue OWL classification)
 */
export enum SentencePattern {
  SV = 'subject_verb',                    // "Frederick walked."
  SVO = 'subject_verb_object',            // "Frederick met Sarah."
  SVC = 'subject_verb_complement',        // "Frederick is the king."
  SVOO = 'subject_verb_indirect_direct',  // "Frederick gave Sarah a gift."
  SVOC = 'subject_verb_object_complement', // "They made Frederick king."
  UNKNOWN = 'unknown'
}

/**
 * Sentence components extracted using grammar rules
 */
export interface SentenceComponents {
  pattern: SentencePattern;
  subject: ComponentPhrase | null;
  verb: ComponentVerb | null;
  directObject: ComponentPhrase | null;
  indirectObject: ComponentPhrase | null;
  complement: ComponentPhrase | null;
  prepositionalPhrases: PrepositionalPhrase[];
  adjuncts: Adjunct[];  // Adverbial modifiers
  confidence: number;
}

/**
 * Noun phrase component
 */
export interface ComponentPhrase {
  head: Token;                    // Main noun
  determiner: Token | null;       // the, a, an, this, my, etc.
  adjectives: Token[];            // Descriptive adjectives
  prepositionalPhrases: PrepositionalPhrase[];  // "of House Stark"
  text: string;                   // Full phrase text
  span: [number, number];
  entityType: string | null;      // Inferred entity type
  definiteness: {
    isDefinite: boolean;
    isSpecific: boolean;
  };
}

/**
 * Verb phrase component
 */
export interface ComponentVerb {
  mainVerb: Token;
  auxiliaries: Token[];           // has, will, should, etc.
  modals: Token[];                // can, could, may, might, must
  negation: Token | null;         // not, never
  tense: string;                  // past, present, future
  aspect: string;                 // simple, perfect, progressive
  voice: 'active' | 'passive';
  lemma: string;                  // Base form of verb
}

/**
 * Prepositional phrase
 */
export interface PrepositionalPhrase {
  preposition: Token;
  object: ComponentPhrase;
  category: 'location' | 'time' | 'direction' | 'manner' | 'possession' | 'agent';
  span: [number, number];
}

/**
 * Adjunct (adverbial modifier)
 */
export interface Adjunct {
  adverb: Token;
  modifies: 'verb' | 'adjective' | 'adverb';
  category: 'manner' | 'time' | 'place' | 'frequency' | 'degree';
}

/**
 * Enhanced relation with grammar-based qualifiers
 */
export interface GrammarRelation {
  subject: string;              // Entity ID
  predicate: Predicate;
  object: string;               // Entity ID
  qualifiers: Qualifier[];      // Time, place, manner from adverbs/preps
  temporality: 'past' | 'present' | 'future';  // From verb tense
  confidence: number;
  evidence: {
    sentence: string;
    pattern: SentencePattern;
    verbTense: string;
  };
}

/**
 * Analyze sentence structure using formal grammar rules
 */
export function analyzeSentenceStructure(sentence: ParsedSentence): SentenceComponents {
  const tokens = sentence.tokens;

  // Find subject (nsubj or nsubjpass dependency)
  const subject = extractSubject(tokens);

  // Find main verb (ROOT)
  const verb = extractVerb(tokens);

  // Find direct object (dobj)
  const directObject = extractDirectObject(tokens);

  // Find indirect object (dative)
  const indirectObject = extractIndirectObject(tokens);

  // Find complement (attr, acomp)
  const complement = extractComplement(tokens);

  // Find prepositional phrases (prep + pobj)
  const prepositionalPhrases = extractPrepositionalPhrases(tokens);

  // Find adverbial modifiers (advmod)
  const adjuncts = extractAdjuncts(tokens);

  // Determine sentence pattern
  const pattern = determineSentencePattern(
    subject,
    verb,
    directObject,
    indirectObject,
    complement
  );

  // Calculate confidence based on component completeness
  let confidence = 0.5;
  if (subject) confidence += 0.2;
  if (verb) confidence += 0.2;
  if (directObject || complement) confidence += 0.1;

  return {
    pattern,
    subject,
    verb,
    directObject,
    indirectObject,
    complement,
    prepositionalPhrases,
    adjuncts,
    confidence
  };
}

/**
 * Extract subject noun phrase
 */
function extractSubject(tokens: Token[]): ComponentPhrase | null {
  // Find subject token (nsubj or nsubjpass)
  const subjToken = tokens.find(t => t.dep === 'nsubj' || t.dep === 'nsubjpass');
  if (!subjToken) return null;

  return extractNounPhrase(subjToken, tokens);
}

/**
 * Extract verb phrase
 */
function extractVerb(tokens: Token[]): ComponentVerb | null {
  // Find main verb (ROOT)
  const mainVerb = tokens.find(t => t.pos === 'VERB' && t.dep === 'ROOT');
  if (!mainVerb) return null;

  // Find auxiliaries and modals
  const auxiliaries = tokens.filter(t =>
    t.pos === 'AUX' && t.head === mainVerb.idx
  );

  const modals = auxiliaries.filter(t =>
    ['can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would']
      .includes(t.lemma?.toLowerCase() || '')
  );

  // Find negation
  const negation = tokens.find(t =>
    t.dep === 'neg' && t.head === mainVerb.idx
  );

  // Detect tense
  const tense = detectVerbTense(mainVerb.tag || '', mainVerb.lemma || '');
  const temporality = getTenseTemporality(tense);

  // Detect voice (passive if nsubjpass exists)
  const isPassive = tokens.some(t => t.dep === 'nsubjpass');

  return {
    mainVerb,
    auxiliaries,
    modals,
    negation: negation || null,
    tense: tense.toString(),
    aspect: 'simple',  // Simplified for now
    voice: isPassive ? 'passive' : 'active',
    lemma: mainVerb.lemma || mainVerb.text
  };
}

/**
 * Extract direct object noun phrase
 */
function extractDirectObject(tokens: Token[]): ComponentPhrase | null {
  const dobjToken = tokens.find(t => t.dep === 'dobj');
  if (!dobjToken) return null;

  return extractNounPhrase(dobjToken, tokens);
}

/**
 * Extract indirect object noun phrase
 */
function extractIndirectObject(tokens: Token[]): ComponentPhrase | null {
  const datToken = tokens.find(t => t.dep === 'dative');
  if (!datToken) return null;

  return extractNounPhrase(datToken, tokens);
}

/**
 * Extract complement
 */
function extractComplement(tokens: Token[]): ComponentPhrase | null {
  const compToken = tokens.find(t => t.dep === 'attr' || t.dep === 'acomp');
  if (!compToken) return null;

  return extractNounPhrase(compToken, tokens);
}

/**
 * Extract noun phrase with all modifiers
 */
function extractNounPhrase(headNoun: Token, tokens: Token[]): ComponentPhrase {
  // Find determiner (det)
  const determiner = tokens.find(t =>
    t.dep === 'det' && t.head === headNoun.idx
  ) || null;

  // Find adjectives (amod)
  const adjectives = tokens.filter(t =>
    t.dep === 'amod' && t.head === headNoun.idx
  );

  // Find prepositional phrases modifying this noun
  const preps = extractPrepositionalPhrases(tokens, headNoun.idx);

  // Build full phrase text
  const phraseTokens = [determiner, ...adjectives, headNoun]
    .filter(t => t !== null)
    .sort((a, b) => (a?.idx || 0) - (b?.idx || 0));

  const text = phraseTokens.map(t => t?.text || '').join(' ');

  // Calculate span
  const start = headNoun.char_start || 0;
  const end = headNoun.char_end || start + text.length;

  // Determine definiteness from determiner
  const definiteness = detectEntityDefiniteness(determiner?.text || null);

  return {
    head: headNoun,
    determiner,
    adjectives,
    prepositionalPhrases: preps,
    text,
    span: [start, end],
    entityType: headNoun.ent_type || null,
    definiteness
  };
}

/**
 * Extract prepositional phrases
 */
function extractPrepositionalPhrases(
  tokens: Token[],
  headIdx?: number
): PrepositionalPhrase[] {
  const phrases: PrepositionalPhrase[] = [];

  // Find all prepositions
  const prepositions = tokens.filter(t =>
    t.pos === 'ADP' && (headIdx === undefined || t.head === headIdx)
  );

  for (const prep of prepositions) {
    // Find object of preposition (pobj)
    const objToken = tokens.find(t => t.dep === 'pobj' && t.head === prep.idx);
    if (!objToken) continue;

    const object = extractNounPhrase(objToken, tokens);

    // Determine preposition category
    const category = detectPrepositionCategory(prep.text, 'unknown');

    const start = prep.char_start || 0;
    const end = object.span[1];

    phrases.push({
      preposition: prep,
      object,
      category: category.toString() as any,
      span: [start, end]
    });
  }

  return phrases;
}

/**
 * Extract adverbial modifiers (adjuncts)
 */
function extractAdjuncts(tokens: Token[]): Adjunct[] {
  const adjuncts: Adjunct[] = [];

  // Find all adverbs (advmod)
  const adverbs = tokens.filter(t => t.dep === 'advmod');

  for (const adverb of adverbs) {
    // Determine what the adverb modifies
    const headToken = tokens.find(t => t.idx === adverb.head);
    if (!headToken) continue;

    let modifies: 'verb' | 'adjective' | 'adverb' = 'verb';
    if (headToken.pos === 'ADJ') modifies = 'adjective';
    if (headToken.pos === 'ADV') modifies = 'adverb';

    // Categorize adverb
    const qualifier = extractQualifierFromAdverb(adverb.text);

    adjuncts.push({
      adverb,
      modifies,
      category: qualifier.type as any
    });
  }

  return adjuncts;
}

/**
 * Determine sentence pattern (Purdue OWL classification)
 */
function determineSentencePattern(
  subject: ComponentPhrase | null,
  verb: ComponentVerb | null,
  directObject: ComponentPhrase | null,
  indirectObject: ComponentPhrase | null,
  complement: ComponentPhrase | null
): SentencePattern {
  if (!subject || !verb) {
    return SentencePattern.UNKNOWN;
  }

  // SVOO: Subject + Verb + Indirect Object + Direct Object
  if (indirectObject && directObject) {
    return SentencePattern.SVOO;
  }

  // SVOC: Subject + Verb + Object + Complement
  if (directObject && complement) {
    return SentencePattern.SVOC;
  }

  // SVC: Subject + Verb + Complement (linking verb)
  if (complement && !directObject) {
    return SentencePattern.SVC;
  }

  // SVO: Subject + Verb + Object
  if (directObject) {
    return SentencePattern.SVO;
  }

  // SV: Subject + Verb
  return SentencePattern.SV;
}

/**
 * Create grammar-enhanced relation from sentence components
 */
export function createGrammarRelation(
  components: SentenceComponents,
  entities: Map<string, Entity>
): GrammarRelation | null {
  if (!components.subject || !components.verb) {
    return null;
  }

  // Find subject entity
  const subjectEntity = findEntityByPhrase(components.subject, entities);
  if (!subjectEntity) return null;

  // Find object entity (direct object or complement)
  const objectPhrase = components.directObject || components.complement;
  if (!objectPhrase) return null;

  const objectEntity = findEntityByPhrase(objectPhrase, entities);
  if (!objectEntity) return null;

  // Map verb to predicate
  const predicate = mapVerbToPredicate(components.verb.lemma);
  if (!predicate) return null;

  // Extract qualifiers from prepositional phrases and adjuncts
  const qualifiers: Qualifier[] = [];

  // Add time qualifiers from prepositional phrases
  for (const prep of components.prepositionalPhrases) {
    if (prep.category === 'time') {
      qualifiers.push({
        type: 'time',
        value: prep.object.text,
        span: prep.span
      });
    } else if (prep.category === 'location') {
      qualifiers.push({
        type: 'place',
        value: prep.object.text,
        span: prep.span
      });
    }
  }

  // Add manner qualifiers from adverbs
  for (const adjunct of components.adjuncts) {
    if (adjunct.category === 'manner') {
      qualifiers.push({
        type: 'source',  // Using 'source' type for manner
        value: adjunct.adverb.text
      });
    }
  }

  // Determine temporality from verb tense
  const temporality = getTenseTemporality(components.verb.tense as any);

  return {
    subject: subjectEntity.id,
    predicate,
    object: objectEntity.id,
    qualifiers,
    temporality,
    confidence: components.confidence,
    evidence: {
      sentence: components.subject.text + ' ' + components.verb.mainVerb.text + ' ' + objectPhrase.text,
      pattern: components.pattern,
      verbTense: components.verb.tense
    }
  };
}

/**
 * Find entity matching noun phrase
 */
function findEntityByPhrase(
  phrase: ComponentPhrase,
  entities: Map<string, Entity>
): Entity | null {
  const phraseText = phrase.text.toLowerCase();

  // Try exact match on canonical name
  for (const entity of entities.values()) {
    if (entity.canonical.toLowerCase() === phraseText) {
      return entity;
    }
  }

  // Try match on aliases
  for (const entity of entities.values()) {
    if (entity.aliases.some(alias => alias.toLowerCase() === phraseText)) {
      return entity;
    }
  }

  // Try partial match on head noun
  const headText = phrase.head.text.toLowerCase();
  for (const entity of entities.values()) {
    if (entity.canonical.toLowerCase().includes(headText) ||
        entity.aliases.some(alias => alias.toLowerCase().includes(headText))) {
      return entity;
    }
  }

  return null;
}

/**
 * Map verb lemma to ARES predicate
 * This is a simplified version - full implementation would use the predicate library
 */
function mapVerbToPredicate(verb: string): Predicate | null {
  const verbMap: Record<string, Predicate> = {
    'marry': 'married_to',
    'kill': 'killed',
    'rule': 'rules',
    'live': 'lives_in',
    'work': 'works_for',
    'lead': 'leads',
    'teach': 'teaches_at',
    'study': 'studies_at',
    'meet': 'met',
    'speak': 'spoke_to',
    'tell': 'told',
    'fight': 'fought_in',
    'travel': 'traveled_to'
  };

  return verbMap[verb.toLowerCase()] || null;
}
