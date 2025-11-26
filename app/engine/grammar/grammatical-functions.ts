/**
 * Complete Grammatical Functions Module
 *
 * Implements ALL traditional grammatical functions for comprehensive sentence analysis.
 * Based on Grammar Monster and traditional grammar terminology.
 *
 * References:
 * - Grammar Monster: https://www.grammar-monster.com/glossary/grammar_glossary.htm
 * - Traditional Grammar: Subject, Object, Complement, Modifier functions
 */

import type { Token } from '../extract/parse-types';

/**
 * Complete enumeration of grammatical functions
 */
export enum GrammaticalFunction {
  // SUBJECT FUNCTIONS
  SUBJECT = 'subject',                          // Simple subject: "Frederick walks"
  SUBJECT_PASSIVE = 'subject_passive',          // Passive subject: "Frederick was seen"
  COMPOUND_SUBJECT = 'compound_subject',        // "Frederick and Sarah walk"

  // OBJECT FUNCTIONS
  DIRECT_OBJECT = 'direct_object',              // "Frederick met Sarah"
  INDIRECT_OBJECT = 'indirect_object',          // "Frederick gave Sarah a gift"
  OBJECT_OF_PREPOSITION = 'object_of_prep',     // "at the house"
  RETAINED_OBJECT = 'retained_object',          // Passive: "Frederick was given a gift"

  // COMPLEMENT FUNCTIONS
  PREDICATE_NOMINATIVE = 'predicate_nominative', // "Frederick is the king" (noun)
  PREDICATE_ADJECTIVE = 'predicate_adjective',   // "Frederick is wise" (adjective)
  OBJECT_COMPLEMENT = 'object_complement',       // "They made Frederick king"

  // MODIFIER FUNCTIONS
  ADJECTIVE_MODIFIER = 'adjective_modifier',     // "old wizard"
  ADVERB_MODIFIER = 'adverb_modifier',          // "walked quickly"
  APPOSITIVE = 'appositive',                    // "Frederick, the king, ruled"

  // PHRASE FUNCTIONS
  PREPOSITIONAL_PHRASE = 'prepositional_phrase', // "at the house"
  INFINITIVE_PHRASE = 'infinitive_phrase',       // "to walk"
  PARTICIPIAL_PHRASE = 'participial_phrase',     // "walking slowly"
  GERUND_PHRASE = 'gerund_phrase',              // "Walking is good"

  // CLAUSE FUNCTIONS
  INDEPENDENT_CLAUSE = 'independent_clause',     // "Frederick walked"
  DEPENDENT_CLAUSE = 'dependent_clause',         // "because he was tired"
  RELATIVE_CLAUSE = 'relative_clause',           // "who was wise"
  NOUN_CLAUSE = 'noun_clause',                  // "what he said"

  // SPECIAL FUNCTIONS
  EXPLETIVE = 'expletive',                      // "There is a house" (dummy "there")
  VOCATIVE = 'vocative',                        // "Frederick, come here!"
  ABSOLUTE_PHRASE = 'absolute_phrase'            // "His work done, Frederick rested"
}

/**
 * Grammatical function analysis result
 */
export interface FunctionAnalysis {
  token: Token;
  function: GrammaticalFunction;
  text: string;
  head?: Token;  // What this modifies/relates to
  dependents?: Token[];  // What modifies this
  category?: string;  // Additional categorization
  confidence: number;
}

/**
 * Extract subject (all types)
 */
export function extractAllSubjects(tokens: Token[]): FunctionAnalysis[] {
  const subjects: FunctionAnalysis[] = [];

  // Simple subject (nsubj)
  const simpleSubj = tokens.filter(t => t.dep === 'nsubj');
  for (const subj of simpleSubj) {
    subjects.push({
      token: subj,
      function: GrammaticalFunction.SUBJECT,
      text: subj.text,
      confidence: 0.95
    });
  }

  // Passive subject (nsubjpass)
  const passiveSubj = tokens.filter(t => t.dep === 'nsubjpass');
  for (const subj of passiveSubj) {
    subjects.push({
      token: subj,
      function: GrammaticalFunction.SUBJECT_PASSIVE,
      text: subj.text,
      confidence: 0.95
    });
  }

  // Compound subject (conj with nsubj head)
  for (const subj of simpleSubj) {
    const conjuncts = tokens.filter(t =>
      t.dep === 'conj' && t.head === subj.idx
    );

    if (conjuncts.length > 0) {
      subjects.push({
        token: subj,
        function: GrammaticalFunction.COMPOUND_SUBJECT,
        text: [subj.text, ...conjuncts.map(c => c.text)].join(' and '),
        dependents: conjuncts,
        confidence: 0.9
      });
    }
  }

  return subjects;
}

/**
 * Extract objects (all types)
 */
export function extractAllObjects(tokens: Token[]): FunctionAnalysis[] {
  const objects: FunctionAnalysis[] = [];

  // Direct object (dobj)
  const directObjs = tokens.filter(t => t.dep === 'dobj');
  for (const obj of directObjs) {
    objects.push({
      token: obj,
      function: GrammaticalFunction.DIRECT_OBJECT,
      text: obj.text,
      confidence: 0.95
    });
  }

  // Indirect object (dative)
  const indirectObjs = tokens.filter(t => t.dep === 'dative');
  for (const obj of indirectObjs) {
    objects.push({
      token: obj,
      function: GrammaticalFunction.INDIRECT_OBJECT,
      text: obj.text,
      confidence: 0.95
    });
  }

  // Object of preposition (pobj)
  const prepObjs = tokens.filter(t => t.dep === 'pobj');
  for (const obj of prepObjs) {
    const prep = tokens.find(t => t.idx === obj.head);
    objects.push({
      token: obj,
      function: GrammaticalFunction.OBJECT_OF_PREPOSITION,
      text: obj.text,
      head: prep,
      category: prep?.text || 'unknown_prep',
      confidence: 0.95
    });
  }

  // Retained object (in passive constructions)
  // Example: "Frederick was given a gift" - "gift" is retained object
  const passiveVerbs = tokens.filter(t =>
    t.pos === 'VERB' && tokens.some(s => s.dep === 'nsubjpass' && s.head === t.idx)
  );

  for (const verb of passiveVerbs) {
    const retainedObj = tokens.find(t =>
      t.dep === 'dobj' && t.head === verb.idx
    );

    if (retainedObj) {
      objects.push({
        token: retainedObj,
        function: GrammaticalFunction.RETAINED_OBJECT,
        text: retainedObj.text,
        confidence: 0.85
      });
    }
  }

  return objects;
}

/**
 * Extract complements (all types)
 */
export function extractAllComplements(tokens: Token[]): FunctionAnalysis[] {
  const complements: FunctionAnalysis[] = [];

  // Find linking verbs (be, become, seem, appear, etc.)
  const linkingVerbs = tokens.filter(t =>
    t.pos === 'VERB' &&
    ['be', 'is', 'are', 'was', 'were', 'been', 'become', 'became', 'seem', 'appear', 'remain'].includes(t.lemma?.toLowerCase() || '')
  );

  for (const verb of linkingVerbs) {
    // Predicate nominative (noun following linking verb)
    // attr dependency: "Frederick is the king"
    const predNom = tokens.filter(t =>
      t.dep === 'attr' && t.head === verb.idx && t.pos === 'NOUN'
    );

    for (const nom of predNom) {
      complements.push({
        token: nom,
        function: GrammaticalFunction.PREDICATE_NOMINATIVE,
        text: nom.text,
        head: verb,
        confidence: 0.95
      });
    }

    // Predicate adjective (adjective following linking verb)
    // acomp dependency: "Frederick is wise"
    const predAdj = tokens.filter(t =>
      (t.dep === 'acomp' || t.dep === 'attr') && t.head === verb.idx && t.pos === 'ADJ'
    );

    for (const adj of predAdj) {
      complements.push({
        token: adj,
        function: GrammaticalFunction.PREDICATE_ADJECTIVE,
        text: adj.text,
        head: verb,
        confidence: 0.95
      });
    }
  }

  // Object complement (describes the object)
  // Example: "They made Frederick king" - "king" describes "Frederick"
  const objectComps = tokens.filter(t =>
    t.dep === 'xcomp' || (t.dep === 'oprd')
  );

  for (const comp of objectComps) {
    complements.push({
      token: comp,
      function: GrammaticalFunction.OBJECT_COMPLEMENT,
      text: comp.text,
      confidence: 0.85
    });
  }

  return complements;
}

/**
 * Extract modifiers (all types)
 */
export function extractAllModifiers(tokens: Token[]): FunctionAnalysis[] {
  const modifiers: FunctionAnalysis[] = [];

  // Adjective modifiers (amod)
  const adjMods = tokens.filter(t => t.dep === 'amod');
  for (const mod of adjMods) {
    const head = tokens.find(t => t.idx === mod.head);
    modifiers.push({
      token: mod,
      function: GrammaticalFunction.ADJECTIVE_MODIFIER,
      text: mod.text,
      head,
      category: 'descriptive',
      confidence: 0.95
    });
  }

  // Adverb modifiers (advmod)
  const advMods = tokens.filter(t => t.dep === 'advmod');
  for (const mod of advMods) {
    const head = tokens.find(t => t.idx === mod.head);
    modifiers.push({
      token: mod,
      function: GrammaticalFunction.ADVERB_MODIFIER,
      text: mod.text,
      head,
      category: detectAdverbCategory(mod.text),
      confidence: 0.95
    });
  }

  // Appositives (appos)
  // Example: "Frederick, the king, ruled" - "the king" is appositive to "Frederick"
  const appositives = tokens.filter(t => t.dep === 'appos');
  for (const app of appositives) {
    const head = tokens.find(t => t.idx === app.head);
    modifiers.push({
      token: app,
      function: GrammaticalFunction.APPOSITIVE,
      text: app.text,
      head,
      category: 'renaming',
      confidence: 0.95
    });
  }

  return modifiers;
}

/**
 * Extract phrases (all types)
 */
export function extractAllPhrases(tokens: Token[]): FunctionAnalysis[] {
  const phrases: FunctionAnalysis[] = [];

  // Prepositional phrases (prep + pobj)
  const preps = tokens.filter(t => t.pos === 'ADP');
  for (const prep of preps) {
    const obj = tokens.find(t => t.dep === 'pobj' && t.head === prep.idx);
    if (obj) {
      phrases.push({
        token: prep,
        function: GrammaticalFunction.PREPOSITIONAL_PHRASE,
        text: `${prep.text} ${obj.text}`,
        dependents: [obj],
        category: detectPrepCategory(prep.text),
        confidence: 0.95
      });
    }
  }

  // Infinitive phrases (to + verb)
  // Example: "to walk", "to study magic"
  const infinitives = tokens.filter(t =>
    t.dep === 'aux' && t.text.toLowerCase() === 'to'
  );

  for (const inf of infinitives) {
    const verb = tokens.find(t => t.idx === inf.head);
    if (verb && verb.pos === 'VERB') {
      phrases.push({
        token: verb,
        function: GrammaticalFunction.INFINITIVE_PHRASE,
        text: `to ${verb.text}`,
        confidence: 0.9
      });
    }
  }

  // Participial phrases (verb ending in -ing/-ed modifying noun)
  // Example: "walking slowly", "painted by Leonardo"
  const participles = tokens.filter(t =>
    (t.tag === 'VBG' || t.tag === 'VBN') && t.dep === 'amod'
  );

  for (const part of participles) {
    phrases.push({
      token: part,
      function: GrammaticalFunction.PARTICIPIAL_PHRASE,
      text: part.text,
      category: part.tag === 'VBG' ? 'present' : 'past',
      confidence: 0.85
    });
  }

  // Gerund phrases (verb-ing used as noun)
  // Example: "Walking is good exercise"
  const gerunds = tokens.filter(t =>
    t.tag === 'VBG' && (t.dep === 'nsubj' || t.dep === 'dobj' || t.dep === 'pobj')
  );

  for (const ger of gerunds) {
    phrases.push({
      token: ger,
      function: GrammaticalFunction.GERUND_PHRASE,
      text: ger.text,
      confidence: 0.85
    });
  }

  return phrases;
}

/**
 * Extract clauses (all types)
 */
export function extractAllClauses(tokens: Token[]): FunctionAnalysis[] {
  const clauses: FunctionAnalysis[] = [];

  // Independent clause (main clause with ROOT verb)
  const rootVerb = tokens.find(t => t.dep === 'ROOT' && t.pos === 'VERB');
  if (rootVerb) {
    clauses.push({
      token: rootVerb,
      function: GrammaticalFunction.INDEPENDENT_CLAUSE,
      text: extractClauseText(rootVerb, tokens),
      confidence: 1.0
    });
  }

  // Dependent clauses (advcl, ccomp, xcomp)
  const depClauses = tokens.filter(t =>
    ['advcl', 'ccomp', 'relcl'].includes(t.dep || '') && t.pos === 'VERB'
  );

  for (const clause of depClauses) {
    const func = clause.dep === 'relcl'
      ? GrammaticalFunction.RELATIVE_CLAUSE
      : GrammaticalFunction.DEPENDENT_CLAUSE;

    clauses.push({
      token: clause,
      function: func,
      text: extractClauseText(clause, tokens),
      category: clause.dep || 'unknown',
      confidence: 0.85
    });
  }

  // Noun clauses (that, what, whether, etc.)
  const nounClauses = tokens.filter(t =>
    t.dep === 'ccomp' && ['that', 'what', 'whether', 'if'].includes(
      tokens.find(s => s.head === t.idx && s.dep === 'mark')?.text.toLowerCase() || ''
    )
  );

  for (const clause of nounClauses) {
    clauses.push({
      token: clause,
      function: GrammaticalFunction.NOUN_CLAUSE,
      text: extractClauseText(clause, tokens),
      confidence: 0.85
    });
  }

  return clauses;
}

/**
 * Extract special functions
 */
export function extractSpecialFunctions(tokens: Token[]): FunctionAnalysis[] {
  const special: FunctionAnalysis[] = [];

  // Expletive "there/it" (dummy subject)
  // Example: "There is a house" - "there" is expletive, "house" is real subject
  const expletives = tokens.filter(t =>
    t.dep === 'expl' && ['there', 'it'].includes(t.text.toLowerCase())
  );

  for (const expl of expletives) {
    special.push({
      token: expl,
      function: GrammaticalFunction.EXPLETIVE,
      text: expl.text,
      category: 'dummy_subject',
      confidence: 0.95
    });
  }

  // Vocative (direct address)
  // Example: "Frederick, come here!" - "Frederick" is vocative
  const vocatives = tokens.filter(t => t.dep === 'vocative');
  for (const voc of vocatives) {
    special.push({
      token: voc,
      function: GrammaticalFunction.VOCATIVE,
      text: voc.text,
      category: 'direct_address',
      confidence: 0.9
    });
  }

  return special;
}

/**
 * Comprehensive grammatical analysis
 */
export function analyzeGrammaticalFunctions(tokens: Token[]): {
  subjects: FunctionAnalysis[];
  objects: FunctionAnalysis[];
  complements: FunctionAnalysis[];
  modifiers: FunctionAnalysis[];
  phrases: FunctionAnalysis[];
  clauses: FunctionAnalysis[];
  special: FunctionAnalysis[];
} {
  return {
    subjects: extractAllSubjects(tokens),
    objects: extractAllObjects(tokens),
    complements: extractAllComplements(tokens),
    modifiers: extractAllModifiers(tokens),
    phrases: extractAllPhrases(tokens),
    clauses: extractAllClauses(tokens),
    special: extractSpecialFunctions(tokens)
  };
}

// Helper functions

function detectAdverbCategory(text: string): string {
  const lower = text.toLowerCase();
  if (['quickly', 'slowly', 'carefully'].some(w => lower.includes(w))) return 'manner';
  if (['yesterday', 'today', 'now', 'then'].includes(lower)) return 'time';
  if (['here', 'there', 'everywhere'].includes(lower)) return 'place';
  if (['always', 'never', 'often'].includes(lower)) return 'frequency';
  return 'manner';
}

function detectPrepCategory(text: string): string {
  const lower = text.toLowerCase();
  if (['in', 'at', 'on', 'near'].includes(lower)) return 'location';
  if (['during', 'before', 'after'].includes(lower)) return 'time';
  if (['to', 'from', 'toward'].includes(lower)) return 'direction';
  return 'location';
}

function extractClauseText(verb: Token, tokens: Token[]): string {
  // Get all tokens that depend on this verb
  const clauseTokens = tokens.filter(t =>
    isDescendant(t, verb, tokens)
  );

  clauseTokens.push(verb);
  clauseTokens.sort((a, b) => (a.idx || 0) - (b.idx || 0));

  return clauseTokens.map(t => t.text).join(' ');
}

function isDescendant(token: Token, ancestor: Token, allTokens: Token[]): boolean {
  let current = token;
  while (current.head !== undefined && current.head !== current.idx) {
    if (current.head === ancestor.idx) return true;
    const parent = allTokens.find(t => t.idx === current.head);
    if (!parent) break;
    current = parent;
  }
  return false;
}
