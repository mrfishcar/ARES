/**
 * ARES Core Schema
 * Entity types, predicates, relations, events with evidence
 */

// Entity Types
export type EntityType =
  | 'PERSON'
  | 'ORG'
  | 'PLACE'
  | 'DATE'
  | 'WORK'
  | 'ITEM'
  | 'SPECIES'
  | 'HOUSE'
  | 'TRIBE'
  | 'TITLE'
  | 'EVENT';

// Relation Predicates
export type Predicate =
  | 'alias_of'
  | 'married_to'
  | 'parent_of'
  | 'child_of'
  | 'sibling_of'
  | 'ally_of'
  | 'enemy_of'
  | 'member_of'
  | 'leads'
  | 'rules'
  | 'born_in'
  | 'dies_in'
  | 'lives_in'
  | 'studies_at'
  | 'teaches_at'
  | 'attended'
  | 'advised_by'
  | 'invested_in'
  | 'acquired'
  | 'wields'
  | 'owns'
  | 'uses'
  | 'friends_with'
  | 'traveled_to'
  | 'fought_in'
  | 'authored'
  | 'mentions'
  | 'part_of'
  | 'spoke_to'  // Fiction: dialogue/communication
  | 'met'      // Fiction: character encounters
  | 'mentored'  // Fiction: X mentored Y
  | 'mentored_by'  // Fiction: Y mentored_by X
  | 'guards'  // Fiction: X guards Y (artifact/place)
  | 'seeks'  // Fiction: X seeks Y (artifact)
  | 'possesses'  // Fiction: X possesses/holds Y
  | 'defeated'  // Fiction: X defeated Y in combat
  | 'killed'  // Fiction: X killed Y
  | 'imprisoned_in'  // Fiction: X imprisoned in Y
  | 'freed_from'  // Fiction: X freed from Y
  | 'summoned'  // Fiction: X summoned Y
  | 'located_at'  // Fiction: X located at Y
  | 'located_beneath'  // Fiction: X located beneath Y
  | 'hidden_in';  // Fiction: X hidden in Y

// Evidence Source
export interface Evidence {
  doc_id: string;
  span: { start: number; end: number; text: string };
  sentence_index: number;
  source: 'RAW' | 'RULE' | 'LLM_HINT';
}

// Qualifier (Phase 3)
export interface Qualifier {
  type: 'time' | 'place' | 'source';
  value: string;
  entity_id?: string;  // Link to DATE/PLACE entity
  span?: [number, number];  // Character offsets
}

// Entity
export interface Entity {
  id: string;
  type: EntityType;
  canonical: string;
  aliases: string[];
  meta?: {
    isCollective?: boolean;
    surnameKey?: string;
  };
  attrs?: Record<string, string | number | boolean>;
  created_at: string;
  centrality?: number;

  // HERT integration (Phase 1-3)
  eid?: number;          // Stable entity ID (cross-document)
  aid?: number;          // Alias ID (surface form identifier)
  sp?: number[];         // Sense path for disambiguation (e.g., [2, 1, 0])
}

// Relation (Extended in Phase 3)
export interface Relation {
  id: string;
  subj: string;
  pred: Predicate;
  obj: string;
  evidence: Evidence[];
  confidence: number;

  // Phase 3 additions
  qualifiers?: Qualifier[];  // Time/place/source metadata
  extractor?: 'dep' | 'regex' | 'fiction-dialogue' | 'fiction-action' | 'fiction-family';  // Extraction method
}

// Event
export interface Event {
  id: string;
  type: string;
  time?: string;
  place?: string;
  roles: { role: string; entity_id: string }[];
  evidence: Evidence[];
  confidence: number;
}

// Type Guards
export const GUARD: Record<Predicate, { subj: EntityType[]; obj: EntityType[] }> = {
  alias_of: { subj: ['PERSON', 'ORG', 'PLACE', 'ITEM'], obj: ['PERSON', 'ORG', 'PLACE', 'ITEM'] },
  married_to: { subj: ['PERSON'], obj: ['PERSON'] },
  parent_of: { subj: ['PERSON'], obj: ['PERSON'] },
  child_of: { subj: ['PERSON'], obj: ['PERSON'] },
  sibling_of: { subj: ['PERSON'], obj: ['PERSON'] },
  ally_of: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] },
  enemy_of: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] },
  member_of: { subj: ['PERSON'], obj: ['ORG', 'HOUSE', 'TRIBE'] },
  leads: { subj: ['PERSON'], obj: ['ORG', 'HOUSE', 'TRIBE'] },
  rules: { subj: ['PERSON'], obj: ['PLACE', 'ORG'] },
  born_in: { subj: ['PERSON'], obj: ['PLACE'] },
  dies_in: { subj: ['PERSON'], obj: ['PLACE'] },
  lives_in: { subj: ['PERSON'], obj: ['PLACE'] },
  studies_at: { subj: ['PERSON'], obj: ['ORG', 'PLACE'] },
  teaches_at: { subj: ['PERSON'], obj: ['ORG', 'PLACE'] },
  attended: { subj: ['PERSON'], obj: ['ORG', 'PLACE'] },
  advised_by: { subj: ['PERSON', 'ORG'], obj: ['PERSON'] },
  invested_in: { subj: ['PERSON', 'ORG'], obj: ['ORG'] },
  acquired: { subj: ['ORG'], obj: ['ORG'] },
  wields: { subj: ['PERSON'], obj: ['ITEM'] },
  owns: { subj: ['PERSON', 'ORG'], obj: ['ITEM', 'ORG'] }, // Allow owning companies
  uses: { subj: ['PERSON'], obj: ['ITEM'] },
  traveled_to: { subj: ['PERSON', 'ORG'], obj: ['PLACE', 'ORG'] },
  fought_in: { subj: ['PERSON', 'ORG'], obj: ['PLACE', 'EVENT'] },
  authored: { subj: ['PERSON', 'ORG'], obj: ['WORK'] },
  mentions: { subj: ['WORK'], obj: ['PERSON', 'ORG', 'PLACE', 'ITEM'] },
  friends_with: { subj: ['PERSON'], obj: ['PERSON'] },
  part_of: { subj: ['ORG', 'HOUSE', 'TRIBE'], obj: ['PLACE', 'ORG'] },
  spoke_to: { subj: ['PERSON'], obj: ['PERSON'] },  // Fiction: dialogue/communication
  met: { subj: ['PERSON'], obj: ['PERSON'] },  // Fiction: character encounters
  mentored: { subj: ['PERSON'], obj: ['PERSON'] },  // X mentored Y
  mentored_by: { subj: ['PERSON'], obj: ['PERSON'] },  // Y mentored by X
  guards: { subj: ['PERSON'], obj: ['ITEM', 'PLACE', 'ORG'] },  // X guards Y
  seeks: { subj: ['PERSON', 'ORG'], obj: ['ITEM', 'PERSON', 'PLACE'] },  // X seeks Y
  possesses: { subj: ['PERSON', 'ORG'], obj: ['ITEM'] },  // X possesses Y
  defeated: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] },  // X defeated Y
  killed: { subj: ['PERSON'], obj: ['PERSON'] },  // X killed Y
  imprisoned_in: { subj: ['PERSON'], obj: ['PLACE'] },  // X imprisoned in Y
  freed_from: { subj: ['PERSON'], obj: ['PLACE'] },  // X freed from Y
  summoned: { subj: ['PERSON', 'ORG'], obj: ['PERSON'] },  // X summoned Y
  located_at: { subj: ['PERSON', 'ORG', 'ITEM', 'PLACE'], obj: ['PLACE'] },  // X located at Y
  located_beneath: { subj: ['PLACE', 'ITEM', 'ORG'], obj: ['PLACE'] },  // X beneath Y
  hidden_in: { subj: ['ITEM', 'PERSON'], obj: ['PLACE'] }  // X hidden in Y
};

// Inverse predicates
export const INVERSE: Partial<Record<Predicate, Predicate>> = {
  married_to: 'married_to',
  parent_of: 'child_of',
  child_of: 'parent_of',
  sibling_of: 'sibling_of',
  ally_of: 'ally_of',
  enemy_of: 'enemy_of',
  friends_with: 'friends_with',
  alias_of: 'alias_of',
  spoke_to: 'spoke_to',  // Symmetric: if A spoke to B, B spoke to A
  met: 'met',  // Symmetric: if A met B, B met A
  mentored: 'mentored_by',
  mentored_by: 'mentored',
  defeated: 'defeated',  // Asymmetric but can be symmetric in conflict
  killed: 'killed'  // No inverse - death is one-way
};

// Single-valued predicates (for conflict detection)
export const SINGLE_VALUED: Set<Predicate> = new Set<Predicate>([
  'parent_of',
  'married_to',
  'born_in',
  'dies_in'
]);

// Check if entity types pass guard for a predicate
export function passesGuard(pred: Predicate, subj: Entity, obj: Entity): boolean {
  const guard = GUARD[pred];
  if (!guard) return true;
  return guard.subj.includes(subj.type) && guard.obj.includes(obj.type);
}
