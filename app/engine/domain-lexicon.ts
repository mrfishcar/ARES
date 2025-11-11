/**
 * Domain Lexicon - Micro-Semantic Layer (Phase 4)
 *
 * Handles implicit relations common in fiction:
 * - "sorted into Gryffindor" → member_of(Harry, Gryffindor)
 * - "captain of Quidditch team" → role_in(Harry, Quidditch team)
 * - "head of Slytherin" → leads(Snape, Slytherin)
 *
 * Provides:
 * 1. Lexical rules with argument typing constraints
 * 2. Symmetry & antisymmetry rules
 * 3. Graph consistency validation
 */

import type { EntityType, Relation } from './schema';

/**
 * Lexical rule for implicit relations
 */
export interface LexicalRule {
  // Trigger pattern
  cue: string | RegExp;              // Verb/noun that triggers the rule
  cueType: 'verb' | 'noun' | 'phrase';

  // Relation mapping
  predicate: string;                 // Target predicate
  inverseOf?: string;                // Inverse relation if applicable

  // Directionality
  symmetric: boolean;                // Is relation symmetric?
  direction: 'subj_obj' | 'obj_subj'; // Subject → Object or Object → Subject

  // Type constraints
  typeConstraint: {
    subj: EntityType[];              // Allowed types for subject
    obj: EntityType[];               // Allowed types for object
  };

  // Argument structure
  argStructure: 'transitive' | 'prepositional';  // "sorted X" vs "sorted into X"
  preposition?: string;              // Required preposition if prepositional

  // Confidence
  confidence: number;                // Base confidence for this rule
}

/**
 * Fiction domain lexicon
 * Organized by semantic category
 */
export const FICTION_LEXICON: Record<string, LexicalRule[]> = {
  // MEMBERSHIP RELATIONS
  membership: [
    // "sorted into X" → member_of(subject, X)
    {
      cue: /\bsorted\s+into\b/i,
      cueType: 'verb',
      predicate: 'member_of',
      symmetric: false,
      direction: 'subj_obj',
      typeConstraint: {
        subj: ['PERSON'],
        obj: ['ORG', 'PLACE']
      },
      argStructure: 'prepositional',
      preposition: 'into',
      confidence: 0.90
    },

    // "assigned to X" → member_of(subject, X)
    {
      cue: /\bassigned\s+to\b/i,
      cueType: 'verb',
      predicate: 'member_of',
      symmetric: false,
      direction: 'subj_obj',
      typeConstraint: {
        subj: ['PERSON'],
        obj: ['ORG', 'PLACE']
      },
      argStructure: 'prepositional',
      preposition: 'to',
      confidence: 0.85
    },

    // "placed in X" → member_of(subject, X)
    {
      cue: /\bplaced\s+in\b/i,
      cueType: 'verb',
      predicate: 'member_of',
      symmetric: false,
      direction: 'subj_obj',
      typeConstraint: {
        subj: ['PERSON'],
        obj: ['ORG', 'PLACE']
      },
      argStructure: 'prepositional',
      preposition: 'in',
      confidence: 0.80
    },

    // "joined X" → member_of(subject, X)
    {
      cue: /\bjoined\b/i,
      cueType: 'verb',
      predicate: 'member_of',
      symmetric: false,
      direction: 'subj_obj',
      typeConstraint: {
        subj: ['PERSON'],
        obj: ['ORG']
      },
      argStructure: 'transitive',
      confidence: 0.85
    },

    // "entered X" → member_of(subject, X) [context-dependent]
    {
      cue: /\bentered\b/i,
      cueType: 'verb',
      predicate: 'member_of',
      symmetric: false,
      direction: 'subj_obj',
      typeConstraint: {
        subj: ['PERSON'],
        obj: ['ORG']
      },
      argStructure: 'transitive',
      confidence: 0.75  // Lower confidence - ambiguous with physical entering
    }
  ],

  // LEADERSHIP/ROLE RELATIONS
  leadership: [
    // "captain of X" → role_in(subject, X)
    {
      cue: /\bcaptain\s+of\b/i,
      cueType: 'noun',
      predicate: 'role_in',
      symmetric: false,
      direction: 'subj_obj',
      typeConstraint: {
        subj: ['PERSON'],
        obj: ['ORG', 'PLACE']
      },
      argStructure: 'prepositional',
      preposition: 'of',
      confidence: 0.90
    },

    // "head of X" → leads(subject, X)
    {
      cue: /\bhead\s+of\b/i,
      cueType: 'noun',
      predicate: 'leads',
      symmetric: false,
      direction: 'subj_obj',
      typeConstraint: {
        subj: ['PERSON'],
        obj: ['ORG', 'PLACE']
      },
      argStructure: 'prepositional',
      preposition: 'of',
      confidence: 0.90
    },

    // "leader of X" → leads(subject, X)
    {
      cue: /\bleader\s+of\b/i,
      cueType: 'noun',
      predicate: 'leads',
      symmetric: false,
      direction: 'subj_obj',
      typeConstraint: {
        subj: ['PERSON'],
        obj: ['ORG', 'PLACE']
      },
      argStructure: 'prepositional',
      preposition: 'of',
      confidence: 0.90
    },

    // "commander of X" → leads(subject, X)
    {
      cue: /\bcommander\s+of\b/i,
      cueType: 'noun',
      predicate: 'leads',
      symmetric: false,
      direction: 'subj_obj',
      typeConstraint: {
        subj: ['PERSON'],
        obj: ['ORG', 'PLACE']
      },
      argStructure: 'prepositional',
      preposition: 'of',
      confidence: 0.90
    },

    // "headmaster of X" → leads(subject, X)
    {
      cue: /\bheadmaster\s+of\b/i,
      cueType: 'noun',
      predicate: 'leads',
      symmetric: false,
      direction: 'subj_obj',
      typeConstraint: {
        subj: ['PERSON'],
        obj: ['ORG']
      },
      argStructure: 'prepositional',
      preposition: 'of',
      confidence: 0.95
    }
  ],

  // EMPLOYMENT RELATIONS
  employment: [
    // "worked at X" → works_at(subject, X)
    {
      cue: /\bworked\s+at\b/i,
      cueType: 'verb',
      predicate: 'works_at',
      symmetric: false,
      direction: 'subj_obj',
      typeConstraint: {
        subj: ['PERSON'],
        obj: ['ORG', 'PLACE']
      },
      argStructure: 'prepositional',
      preposition: 'at',
      confidence: 0.90
    },

    // "worked for X" → works_at(subject, X)
    {
      cue: /\bworked\s+for\b/i,
      cueType: 'verb',
      predicate: 'works_at',
      symmetric: false,
      direction: 'subj_obj',
      typeConstraint: {
        subj: ['PERSON'],
        obj: ['ORG']
      },
      argStructure: 'prepositional',
      preposition: 'for',
      confidence: 0.90
    },

    // "employed by X" → works_at(subject, X)
    {
      cue: /\bemployed\s+by\b/i,
      cueType: 'verb',
      predicate: 'works_at',
      symmetric: false,
      direction: 'subj_obj',
      typeConstraint: {
        subj: ['PERSON'],
        obj: ['ORG']
      },
      argStructure: 'prepositional',
      preposition: 'by',
      confidence: 0.90
    },

    // "served at X" → works_at(subject, X)
    {
      cue: /\bserved\s+at\b/i,
      cueType: 'verb',
      predicate: 'works_at',
      symmetric: false,
      direction: 'subj_obj',
      typeConstraint: {
        subj: ['PERSON'],
        obj: ['ORG', 'PLACE']
      },
      argStructure: 'prepositional',
      preposition: 'at',
      confidence: 0.85
    }
  ],

  // SOCIAL RELATIONS
  social: [
    // "friends with X" → friends_with(subject, X) [symmetric]
    {
      cue: /\bfriends?\s+with\b/i,
      cueType: 'noun',
      predicate: 'friends_with',
      symmetric: true,
      direction: 'subj_obj',
      typeConstraint: {
        subj: ['PERSON'],
        obj: ['PERSON']
      },
      argStructure: 'prepositional',
      preposition: 'with',
      confidence: 0.90
    },

    // "allied with X" → allied_with(subject, X) [symmetric]
    {
      cue: /\ballied\s+with\b/i,
      cueType: 'verb',
      predicate: 'allied_with',
      symmetric: true,
      direction: 'subj_obj',
      typeConstraint: {
        subj: ['PERSON', 'ORG'],
        obj: ['PERSON', 'ORG']
      },
      argStructure: 'prepositional',
      preposition: 'with',
      confidence: 0.85
    }
  ]
};

/**
 * Relation symmetry rules
 * Based on user spec: "friends_with symmetric; child_of antisymmetric"
 */
export const SYMMETRY_RULES: Record<string, {
  symmetric: boolean;
  inverseOf?: string;
  typeConstraint?: { from: EntityType; to: EntityType };
}> = {
  // Symmetric relations
  'married_to': { symmetric: true },
  'friends_with': { symmetric: true },
  'sibling_of': { symmetric: true },
  'allied_with': { symmetric: true },
  'cousin_of': { symmetric: true },
  'enemy_of': { symmetric: true },
  'rival_of': { symmetric: true },

  // Antisymmetric relations with type constraints
  'parent_of': {
    symmetric: false,
    inverseOf: 'child_of',
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },
  'child_of': {
    symmetric: false,
    inverseOf: 'parent_of',
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },
  'grandparent_of': {
    symmetric: false,
    inverseOf: 'grandchild_of',
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },
  'grandchild_of': {
    symmetric: false,
    inverseOf: 'grandparent_of',
    typeConstraint: { from: 'PERSON', to: 'PERSON' }
  },

  // Directional relations with type constraints
  'works_at': {
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'ORG' }
  },
  'studies_at': {
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'ORG' }
  },
  'teaches_at': {
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'ORG' }
  },
  'member_of': {
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'ORG' }
  },
  'leads': {
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'ORG' }
  },
  'lives_in': {
    symmetric: false,
    typeConstraint: { from: 'PERSON', to: 'PLACE' }
  }
};

/**
 * Validate relation against type constraints
 */
export function validateTypeConstraints(
  relation: Relation,
  subjEntity: { type: EntityType },
  objEntity: { type: EntityType }
): boolean {
  const rule = SYMMETRY_RULES[relation.pred];
  if (!rule || !rule.typeConstraint) return true;

  return (
    subjEntity.type === rule.typeConstraint.from &&
    objEntity.type === rule.typeConstraint.to
  );
}

/**
 * Graph consistency validation
 * Checks for impossible combinations:
 * - If child_of(A, B) and child_of(A, C), allow both (siblings B and C)
 * - If parent_of(A, B) exists, ensure child_of(B, A) is consistent
 * - No cycles in antisymmetric relations (e.g., A parent of B parent of A)
 */
export interface ConsistencyViolation {
  type: 'cycle' | 'type_mismatch' | 'inverse_missing';
  relation: Relation;
  message: string;
}

/**
 * Check for cycles in antisymmetric relations
 */
export function detectCycles(
  relations: Relation[],
  predicate: string
): ConsistencyViolation[] {
  const violations: ConsistencyViolation[] = [];

  // Build adjacency list
  const graph = new Map<string, Set<string>>();

  for (const rel of relations) {
    if (rel.pred !== predicate) continue;

    if (!graph.has(rel.subj)) {
      graph.set(rel.subj, new Set());
    }
    graph.get(rel.subj)!.add(rel.obj);
  }

  // DFS to detect cycles
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function hasCycleDFS(node: string, path: string[]): boolean {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || new Set();

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycleDFS(neighbor, path)) {
          return true;
        }
      } else if (recStack.has(neighbor)) {
        // Cycle detected
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart).concat(neighbor);

        const cycleRelation = relations.find(
          r => r.pred === predicate && r.subj === node && r.obj === neighbor
        );

        if (cycleRelation) {
          violations.push({
            type: 'cycle',
            relation: cycleRelation,
            message: `Cycle detected in ${predicate}: ${cycle.join(' → ')}`
          });
        }

        return true;
      }
    }

    recStack.delete(node);
    path.pop();
    return false;
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      hasCycleDFS(node, []);
    }
  }

  return violations;
}

/**
 * Validate relation graph consistency
 */
export function validateGraphConsistency(
  relations: Relation[],
  entities: Map<string, { type: EntityType }>
): ConsistencyViolation[] {
  const violations: ConsistencyViolation[] = [];

  // Check type constraints
  for (const relation of relations) {
    const subjEntity = entities.get(relation.subj);
    const objEntity = entities.get(relation.obj);

    if (!subjEntity || !objEntity) continue;

    const rule = SYMMETRY_RULES[relation.pred];
    if (rule?.typeConstraint) {
      if (
        subjEntity.type !== rule.typeConstraint.from ||
        objEntity.type !== rule.typeConstraint.to
      ) {
        violations.push({
          type: 'type_mismatch',
          relation,
          message: `Type mismatch for ${relation.pred}: expected ${rule.typeConstraint.from}→${rule.typeConstraint.to}, got ${subjEntity.type}→${objEntity.type}`
        });
      }
    }
  }

  // Check for cycles in antisymmetric relations
  const antisymmetricPredicates = Object.entries(SYMMETRY_RULES)
    .filter(([_, rule]) => !rule.symmetric && rule.inverseOf)
    .map(([pred]) => pred);

  for (const predicate of antisymmetricPredicates) {
    const cycleViolations = detectCycles(relations, predicate);
    violations.push(...cycleViolations);
  }

  return violations;
}

/**
 * Match lexical rule to text pattern
 */
export function matchLexicalRule(
  text: string,
  cue: string | RegExp
): boolean {
  if (typeof cue === 'string') {
    return text.toLowerCase().includes(cue.toLowerCase());
  }
  return cue.test(text);
}

/**
 * Get all applicable lexical rules for a text span
 */
export function getApplicableRules(evidenceText: string): LexicalRule[] {
  const applicable: LexicalRule[] = [];

  for (const category of Object.values(FICTION_LEXICON)) {
    for (const rule of category) {
      if (matchLexicalRule(evidenceText, rule.cue)) {
        applicable.push(rule);
      }
    }
  }

  return applicable;
}
