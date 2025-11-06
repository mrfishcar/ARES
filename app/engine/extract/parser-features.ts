/**
 * Enhanced Parser Feature Extraction
 *
 * Leverages the full power of spaCy's dependency parser to extract
 * sophisticated linguistic features for entity recognition and classification.
 *
 * Features extracted:
 * - Dependency paths between entities
 * - Subject-verb-object patterns
 * - Prepositional phrase attachments
 * - Appositives and relative clauses
 * - Coordination patterns (e.g., "X and Y")
 * - Possession patterns (e.g., "X's Y")
 */

import type { ParsedSentence, Token } from './parse-types';
import type { EntityType } from '../schema';

/**
 * Dependency path between two entities
 */
export interface DependencyPath {
  entity1: string;
  entity2: string;
  path: string[];          // Sequence of dependency labels
  tokens: string[];        // Tokens along the path
  length: number;          // Path length
  pattern: string;         // Pattern signature (e.g., "nsubj-ROOT-dobj")
}

/**
 * Subject-verb-object triple
 */
export interface SVOTriple {
  subject: string;
  subjectStart: number;
  subjectEnd: number;
  verb: string;
  verbLemma: string;
  object?: string;
  objectStart?: number;
  objectEnd?: number;
  preposition?: string;    // For prepositional objects
}

/**
 * Appositive pattern (e.g., "Gandalf, the wizard")
 */
export interface Appositive {
  head: string;            // "Gandalf"
  headStart: number;
  headEnd: number;
  appositive: string;      // "the wizard"
  appositiveStart: number;
  appositiveEnd: number;
  confidence: number;
}

/**
 * Coordination pattern (e.g., "Harry and Hermione")
 */
export interface Coordination {
  entities: Array<{ text: string; start: number; end: number }>;
  coordinator: string;     // "and", "or", "but"
  sharedType?: EntityType; // Likely same type
}

/**
 * Possession pattern (e.g., "Sarah's brother", "the wizard's staff")
 */
export interface Possession {
  possessor: string;
  possessorStart: number;
  possessorEnd: number;
  possessed: string;
  possessedStart: number;
  possessedEnd: number;
  relationship?: string;   // Family relation, ownership, etc.
}

/**
 * Title modifier pattern (e.g., "King Aragorn", "Professor McGonagall")
 */
export interface TitleModifier {
  title: string;
  entity: string;
  entityStart: number;
  entityEnd: number;
  fullText: string;
  typeHint: EntityType;    // Title suggests entity type
}

/**
 * Extract all SVO triples from sentence
 */
export function extractSVOTriples(sent: ParsedSentence): SVOTriple[] {
  const triples: SVOTriple[] = [];
  const tokens = sent.tokens;

  // Find verbs (potential predicates)
  for (const token of tokens) {
    if (token.pos === 'VERB' || token.dep === 'ROOT') {
      // Find subject
      const subject = tokens.find(t => t.head === token.i && (t.dep === 'nsubj' || t.dep === 'nsubjpass'));

      if (subject) {
        // Expand subject to full NP
        const subjectSpan = expandNounPhrase(tokens, subject.i);

        // Find object
        const directObj = tokens.find(t => t.head === token.i && t.dep === 'dobj');
        const prepObj = tokens.find(t => t.head === token.i && t.dep === 'pobj');

        let triple: SVOTriple = {
          subject: tokens.slice(subjectSpan.start, subjectSpan.end + 1).map(t => t.text).join(' '),
          subjectStart: tokens[subjectSpan.start].start,
          subjectEnd: tokens[subjectSpan.end].end,
          verb: token.text,
          verbLemma: token.lemma
        };

        if (directObj) {
          const objSpan = expandNounPhrase(tokens, directObj.i);
          triple.object = tokens.slice(objSpan.start, objSpan.end + 1).map(t => t.text).join(' ');
          triple.objectStart = tokens[objSpan.start].start;
          triple.objectEnd = tokens[objSpan.end].end;
        } else if (prepObj) {
          // Find preposition
          const prep = tokens.find(t => t.i === prepObj.head && t.dep === 'prep');
          const objSpan = expandNounPhrase(tokens, prepObj.i);

          triple.object = tokens.slice(objSpan.start, objSpan.end + 1).map(t => t.text).join(' ');
          triple.objectStart = tokens[objSpan.start].start;
          triple.objectEnd = tokens[objSpan.end].end;
          triple.preposition = prep?.text;
        }

        triples.push(triple);
      }
    }
  }

  return triples;
}

/**
 * Extract appositive patterns
 */
export function extractAppositives(sent: ParsedSentence): Appositive[] {
  const appositives: Appositive[] = [];
  const tokens = sent.tokens;

  for (const token of tokens) {
    if (token.dep === 'appos') {
      // Find head
      const head = tokens.find(t => t.i === token.head);
      if (!head) continue;

      // Expand both to full noun phrases
      const headSpan = expandNounPhrase(tokens, head.i);
      const apposSpan = expandNounPhrase(tokens, token.i);

      appositives.push({
        head: tokens.slice(headSpan.start, headSpan.end + 1).map(t => t.text).join(' '),
        headStart: tokens[headSpan.start].start,
        headEnd: tokens[headSpan.end].end,
        appositive: tokens.slice(apposSpan.start, apposSpan.end + 1).map(t => t.text).join(' '),
        appositiveStart: tokens[apposSpan.start].start,
        appositiveEnd: tokens[apposSpan.end].end,
        confidence: 0.9 // Appositives are high-confidence patterns
      });
    }
  }

  return appositives;
}

/**
 * Extract coordination patterns
 */
export function extractCoordinations(sent: ParsedSentence): Coordination[] {
  const coordinations: Coordination[] = [];
  const tokens = sent.tokens;

  for (const token of tokens) {
    if (token.dep === 'conj') {
      // Find head and coordinator
      const head = tokens.find(t => t.i === token.head);
      const coordinator = tokens.find(t => t.head === token.head && t.dep === 'cc');

      if (head && coordinator) {
        // Check if both are entities (proper nouns or named entities)
        if ((head.pos === 'PROPN' || head.ent) && (token.pos === 'PROPN' || token.ent)) {
          // Expand to full NPs
          const headSpan = expandNounPhrase(tokens, head.i);
          const conjSpan = expandNounPhrase(tokens, token.i);

          // Collect all coordinated entities
          const entities = [
            {
              text: tokens.slice(headSpan.start, headSpan.end + 1).map(t => t.text).join(' '),
              start: tokens[headSpan.start].start,
              end: tokens[headSpan.end].end
            },
            {
              text: tokens.slice(conjSpan.start, conjSpan.end + 1).map(t => t.text).join(' '),
              start: tokens[conjSpan.start].start,
              end: tokens[conjSpan.end].end
            }
          ];

          // Check if they have same NER tag (suggests same type)
          const sharedNERTag = head.ent === token.ent ? head.ent : undefined;

          coordinations.push({
            entities,
            coordinator: coordinator.text,
            sharedType: mapNERToEntityType(sharedNERTag)
          });
        }
      }
    }
  }

  return coordinations;
}

/**
 * Extract possession patterns
 */
export function extractPossessions(sent: ParsedSentence): Possession[] {
  const possessions: Possession[] = [];
  const tokens = sent.tokens;

  for (const token of tokens) {
    // Pattern 1: Possessive marker (e.g., "Sarah's brother")
    if (token.dep === 'poss') {
      const possessed = tokens.find(t => t.i === token.head);
      if (!possessed) continue;

      const possessorSpan = expandNounPhrase(tokens, token.i);
      const possessedSpan = expandNounPhrase(tokens, possessed.i);

      // Infer relationship from possessed noun
      const relationship = inferRelationship(possessed.text.toLowerCase());

      possessions.push({
        possessor: tokens.slice(possessorSpan.start, possessorSpan.end + 1).map(t => t.text).join(' '),
        possessorStart: tokens[possessorSpan.start].start,
        possessorEnd: tokens[possessorSpan.end].end,
        possessed: tokens.slice(possessedSpan.start, possessedSpan.end + 1).map(t => t.text).join(' '),
        possessedStart: tokens[possessedSpan.start].start,
        possessedEnd: tokens[possessedSpan.end].end,
        relationship
      });
    }

    // Pattern 2: "of" possession (e.g., "brother of Sarah")
    if (token.text.toLowerCase() === 'of' && token.dep === 'prep') {
      const possessed = tokens.find(t => t.i === token.head);
      const possessor = tokens.find(t => t.head === token.i && t.dep === 'pobj');

      if (possessed && possessor) {
        const possessorSpan = expandNounPhrase(tokens, possessor.i);
        const possessedSpan = expandNounPhrase(tokens, possessed.i);

        const relationship = inferRelationship(possessed.text.toLowerCase());

        possessions.push({
          possessor: tokens.slice(possessorSpan.start, possessorSpan.end + 1).map(t => t.text).join(' '),
          possessorStart: tokens[possessorSpan.start].start,
          possessorEnd: tokens[possessorSpan.end].end,
          possessed: tokens.slice(possessedSpan.start, possessedSpan.end + 1).map(t => t.text).join(' '),
          possessedStart: tokens[possessedSpan.start].start,
          possessedEnd: tokens[possessedSpan.end].end,
          relationship
        });
      }
    }
  }

  return possessions;
}

/**
 * Extract title modifier patterns
 */
export function extractTitleModifiers(sent: ParsedSentence): TitleModifier[] {
  const modifiers: TitleModifier[] = [];
  const tokens = sent.tokens;

  // Title patterns
  const PERSON_TITLES = new Set(['king', 'queen', 'prince', 'princess', 'lord', 'lady', 'sir', 'dame',
    'mr', 'mrs', 'ms', 'miss', 'dr', 'doctor', 'professor', 'captain', 'commander',
    'father', 'mother', 'brother', 'sister', 'saint', 'reverend']);

  const ORG_TITLES = new Set(['university', 'college', 'institute', 'academy', 'school',
    'company', 'corporation', 'inc', 'corp', 'llc', 'ltd']);

  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];

    const titleLower = token.text.toLowerCase().replace(/\.$/, '');

    // Check if this is a title followed by a proper noun
    if ((PERSON_TITLES.has(titleLower) || ORG_TITLES.has(titleLower)) &&
      (next.pos === 'PROPN' || next.ent)) {

      // Expand entity to full NP
      const entitySpan = expandNounPhrase(tokens, next.i);
      const entityText = tokens.slice(entitySpan.start, entitySpan.end + 1).map(t => t.text).join(' ');
      const fullText = token.text + ' ' + entityText;

      // Determine type hint
      let typeHint: EntityType = 'PERSON';
      if (ORG_TITLES.has(titleLower)) {
        typeHint = 'ORG';
      }

      modifiers.push({
        title: token.text,
        entity: entityText,
        entityStart: tokens[entitySpan.start].start,
        entityEnd: tokens[entitySpan.end].end,
        fullText,
        typeHint
      });
    }
  }

  return modifiers;
}

/**
 * Extract dependency path between two tokens
 */
export function extractDependencyPath(
  tokens: Token[],
  start: number,
  end: number
): DependencyPath | null {
  // Find lowest common ancestor in dependency tree
  const startAncestors = getAncestors(tokens, start);
  const endAncestors = getAncestors(tokens, end);

  // Find LCA
  const lca = startAncestors.find(a => endAncestors.includes(a));
  if (lca === undefined) return null;

  // Build path from start to LCA to end
  const startPath = getPathToAncestor(tokens, start, lca);
  const endPath = getPathToAncestor(tokens, end, lca);

  const path = [...startPath, ...endPath.reverse()];
  const pathTokens = path.map(i => tokens[i].text);
  const pathLabels = path.slice(1).map(i => tokens[i].dep);

  return {
    entity1: tokens[start].text,
    entity2: tokens[end].text,
    path: pathLabels,
    tokens: pathTokens,
    length: path.length - 1,
    pattern: pathLabels.join('-')
  };
}

/**
 * Expand a token to full noun phrase
 */
function expandNounPhrase(tokens: Token[], headIdx: number): { start: number; end: number } {
  let start = headIdx;
  let end = headIdx;

  // Expand left (determiners, adjectives, compounds)
  for (let i = headIdx - 1; i >= 0; i--) {
    const token = tokens[i];
    if (token.head === headIdx || token.i === headIdx - 1) {
      if (token.dep === 'det' || token.dep === 'amod' || token.dep === 'compound' ||
        token.dep === 'nummod' || token.pos === 'PROPN') {
        start = i;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  // Expand right (compounds, appositives, prepositional modifiers)
  for (let i = headIdx + 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.head === headIdx) {
      if (token.dep === 'compound' || token.dep === 'flat' || token.pos === 'PROPN') {
        end = i;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return { start, end };
}

/**
 * Get ancestors of a token in dependency tree
 */
function getAncestors(tokens: Token[], idx: number): number[] {
  const ancestors: number[] = [idx];
  let current = idx;

  while (current !== tokens[current].head) {
    current = tokens[current].head;
    ancestors.push(current);

    // Safety check to avoid infinite loops
    if (ancestors.length > tokens.length) break;
  }

  return ancestors;
}

/**
 * Get path from token to ancestor
 */
function getPathToAncestor(tokens: Token[], idx: number, ancestor: number): number[] {
  const path: number[] = [idx];
  let current = idx;

  while (current !== ancestor) {
    current = tokens[current].head;
    path.push(current);

    // Safety check
    if (path.length > tokens.length) break;
  }

  return path;
}

/**
 * Infer relationship type from noun
 */
function inferRelationship(noun: string): string | undefined {
  const FAMILY_RELATIONS = new Set(['father', 'mother', 'brother', 'sister', 'son', 'daughter',
    'parent', 'child', 'uncle', 'aunt', 'cousin', 'grandfather', 'grandmother',
    'husband', 'wife', 'spouse']);

  const ORGANIZATIONAL_RELATIONS = new Set(['member', 'leader', 'founder', 'employee',
    'president', 'ceo', 'director', 'manager']);

  const OWNERSHIP_RELATIONS = new Set(['owner', 'creator', 'inventor', 'author', 'maker']);

  if (FAMILY_RELATIONS.has(noun)) return 'family';
  if (ORGANIZATIONAL_RELATIONS.has(noun)) return 'organizational';
  if (OWNERSHIP_RELATIONS.has(noun)) return 'ownership';

  return undefined;
}

/**
 * Map spaCy NER tag to ARES entity type
 */
function mapNERToEntityType(nerTag?: string): EntityType | undefined {
  if (!nerTag || nerTag === 'O') return undefined;

  const tag = nerTag.replace(/^[BI]-/, '');

  switch (tag) {
    case 'PERSON': return 'PERSON';
    case 'ORG': return 'ORG';
    case 'GPE':
    case 'LOC': return 'PLACE';
    case 'WORK_OF_ART': return 'WORK';
    case 'PRODUCT': return 'ITEM';
    case 'EVENT': return 'EVENT';
    default: return undefined;
  }
}

/**
 * Aggregate all parser features for a sentence
 */
export interface ParserFeatures {
  svoTriples: SVOTriple[];
  appositives: Appositive[];
  coordinations: Coordination[];
  possessions: Possession[];
  titleModifiers: TitleModifier[];
}

export function extractAllParserFeatures(sent: ParsedSentence): ParserFeatures {
  return {
    svoTriples: extractSVOTriples(sent),
    appositives: extractAppositives(sent),
    coordinations: extractCoordinations(sent),
    possessions: extractPossessions(sent),
    titleModifiers: extractTitleModifiers(sent)
  };
}
