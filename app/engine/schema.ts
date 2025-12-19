/**
 * ARES Core Schema
 * Entity types, predicates, relations, events with evidence
 */

// Entity Types
export type EntityType =
  // Core types
  | 'PERSON'
  | 'ORG'
  | 'PLACE'
  | 'DATE'
  | 'TIME'
  | 'WORK'
  | 'ITEM'
  | 'MISC'
  | 'OBJECT'
  | 'SPECIES'
  | 'HOUSE'
  | 'TRIBE'
  | 'TITLE'
  | 'EVENT'
  // Fiction/world-building types
  | 'RACE'
  | 'CREATURE'
  | 'ARTIFACT'
  | 'TECHNOLOGY'
  | 'MAGIC'
  | 'LANGUAGE'
  | 'CURRENCY'
  | 'MATERIAL'
  | 'DRUG'
  | 'DEITY'
  // Ability/skill types
  | 'ABILITY'
  | 'SKILL'
  | 'POWER'
  | 'TECHNIQUE'
  | 'SPELL';

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
  | 'hidden_in'  // Fiction: X hidden in Y
  | 'created_by'  // Creation: Y created_by X (author, painter, composer)
  | 'located_in'  // Location: X located_in Y (city, country)
  | 'wrote_to'  // Communication: X wrote_to Y
  | 'hosted'  // Event: X hosted Y
  | 'ruled_by'  // Power: Y ruled_by X
  | 'loved'  // Emotional: X loved Y
  | 'is'  // Identity: X is Y (alias, equivalence)
  | 'greater_than'  // Comparison: X greater_than Y
  | 'after'  // Temporal: X after Y
  | 'before'  // Temporal: X before Y
  | 'during'
  | 'cousin_of'  // kinship
  | 'ancestor_of'  // kinship
  | 'descendant_of'  // kinship
  | 'owned_by'  // ownership
  | 'belongs_to'  // ownership
  | 'property_of'  // ownership
  | 'possessed_by'  // ownership
  | 'works_for'  // employment
  | 'employed_by'  // employment
  | 'affiliated_with'  // employment
  | 'partner_at'  // employment
  | 'serves'  // employment
  | 'invented_by'  // creation
  | 'painted_by'  // creation
  | 'built_by'  // creation
  | 'composed_by'  // creation
  | 'designed_by'  // creation
  | 'written_by'  // creation
  | 'near'  // location
  | 'within'  // location
  | 'across_from'  // location
  | 'adjacent_to'  // location
  | 'based_in'  // location
  | 'north_of'  // location
  | 'south_of'  // location
  | 'since'  // temporal
  | 'until'  // temporal
  | 'on'  // temporal
  | 'between'  // temporal
  | 'caused_by'  // causation
  | 'led_to'  // causation
  | 'influenced_by'  // causation
  | 'resulted_from'  // causation
  | 'due_to'  // causation
  | 'triggered_by'  // causation
  | 'consists_of'  // part_whole
  | 'includes'  // part_whole
  | 'contains'  // part_whole
  | 'made_of'  // part_whole
  | 'comprises'  // part_whole
  | 'equals'  // identity
  | 'same_as'  // identity
  | 'also_known_as'  // identity
  | 'represents'  // identity
  | 'participated_in'  // event
  | 'performed_at'  // event
  | 'witnessed'  // event
  | 'organized'  // event
  | 'told'  // communication
  | 'said_to'  // communication
  | 'asked'  // communication
  | 'informed'  // communication
  | 'replied'  // communication
  | 'reported'  // communication
  | 'controlled_by'  // power
  | 'commanded_by'  // power
  | 'managed_by'  // power
  | 'governed_by'  // power
  | 'led_by'  // power
  | 'less_than'  // comparison
  | 'equal_to'  // comparison
  | 'higher_than'  // comparison
  | 'similar_to'  // comparison
  | 'different_from'  // comparison
  | 'hated'  // emotional
  | 'respected'  // emotional
  | 'disliked'  // emotional
  | 'admired'  // emotional
  | 'envied'  // emotional
  | 'feared'  // emotional
  | 'not_related_to'  // negation
  | 'alleged'  // negation
  | 'rumored'  // negation
  | 'denied'  // negation
  | 'disputed'  // negation
  | 'uncertain_link'  // negation
  | 'painted'  // creation
  | 'composed'  // creation
  | 'designed'  // creation
  | 'sculpted'  // creation
  // Ability/skill predicates
  | 'possesses_ability'  // X possesses ability Y
  | 'learned'  // X learned ability Y
  | 'mastered'  // X mastered skill Y
  | 'trained_in'  // X trained in technique Y
  | 'grants'  // Ability X grants effect Y
  | 'requires'  // Ability X requires condition Y
  | 'countered_by'  // Ability X countered by ability Y
  | 'enhances'  // Ability X enhances stat/attribute Y
  | 'cast_by'  // Spell X cast by person Y

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

/**
 * Entity Tier System for Recall/Precision Balancing
 *
 * TIER_A (Core): High-confidence, graph-worthy entities
 *   - NER-backed entities
 *   - Multi-token proper names
 *   - Full alias merging enabled
 *   - Confidence threshold: ≥0.70
 *
 * TIER_B (Supporting): Medium-confidence, useful for indexing
 *   - Single-token proper names with contextual support
 *   - Title-prefixed names (Mr., Dr., etc.)
 *   - Cautious alias merging (same-type only)
 *   - Confidence threshold: ≥0.50
 *
 * TIER_C (Candidate): Low-confidence, provisional entities
 *   - Sentence-initial single tokens without NER
 *   - Title-based references ("the librarian")
 *   - NO alias merging (kept isolated)
 *   - Confidence threshold: ≥0.30
 *   - Can be promoted to Tier B if corroborated
 */
export type EntityTier = 'TIER_A' | 'TIER_B' | 'TIER_C';

// Entity
export interface Entity {
  id: string;
  type: EntityType;
  canonical: string;
  aliases: string[];
  meta?: {
    isCollective?: boolean;
    surnameKey?: string;
    nameSuffix?: string;
  };
  source?: string;
  booknlp_id?: string;
  mention_count?: number;
  gender?: string;
  attrs?: Record<string, string | number | boolean>;
  created_at: string;
  centrality?: number;
  confidence?: number;   // Extraction confidence (0-1) from confidence-scoring.ts

  // Tier system for recall/precision balancing
  tier?: EntityTier;     // TIER_A (core), TIER_B (supporting), TIER_C (candidate)

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
  subj_surface?: string;
  obj_surface?: string;

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

// Meaning Record - Canonical intermediate representation for extracted meaning
// This is the clean layer between extraction mechanics and semantic content
export interface MeaningRecord {
  subjectId: string;           // Normalized entity ID (after alias resolution)
  relation: string;            // Canonical verb class / relation type (Predicate or custom)
  objectId?: string | null;    // Optional target entity ID (location, person, item, etc.)
  qualifiers?: {
    time?: string | null;      // Temporal qualifier ("in 3019", "yesterday", etc.)
    place?: string | null;     // Location qualifier ("in Gondor", "at Hogwarts", etc.)
    manner?: string | null;    // Manner qualifier ("wisely", "quickly", etc.)
  };
  source: {
    docId: string;             // Document identifier
    sentenceIndex: number;     // Sentence number in document
    spanStart: number;         // Character offset start
    spanEnd: number;           // Character offset end
  };
  confidence?: number;         // Optional confidence score
}

// Type Guards
export const GUARD: Record<Predicate, { subj: EntityType[]; obj: EntityType[] }> = {
  alias_of: { subj: ['PERSON', 'ORG', 'PLACE', 'ITEM', 'ARTIFACT', 'CREATURE', 'RACE', 'DEITY', 'ABILITY', 'SKILL', 'SPELL'], obj: ['PERSON', 'ORG', 'PLACE', 'ITEM', 'ARTIFACT', 'CREATURE', 'RACE', 'DEITY', 'ABILITY', 'SKILL', 'SPELL'] },
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
  hidden_in: { subj: ['ITEM', 'PERSON'], obj: ['PLACE'] },  // X hidden in Y
  created_by: { subj: ['WORK', 'ITEM', 'PLACE'], obj: ['PERSON', 'ORG'] },  // Y created_by X
  located_in: { subj: ['PERSON', 'ORG', 'PLACE', 'ITEM'], obj: ['PLACE', 'ORG'] },  // X located_in Y
  wrote_to: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] },  // X wrote_to Y
  hosted: { subj: ['PERSON', 'ORG'], obj: ['EVENT', 'PERSON'] },  // X hosted Y
  ruled_by: { subj: ['ORG', 'PLACE'], obj: ['PERSON', 'ORG'] },  // Y ruled_by X
  loved: { subj: ['PERSON'], obj: ['PERSON'] },  // X loved Y
  is: { subj: ['PERSON', 'ORG', 'PLACE', 'ITEM'], obj: ['PERSON', 'ORG', 'PLACE', 'ITEM'] },  // X is Y
  greater_than: { subj: ['PERSON', 'ORG', 'PLACE', 'ITEM'], obj: ['PERSON', 'ORG', 'PLACE', 'ITEM'] },  // X > Y
  after: { subj: ['PERSON', 'ORG', 'EVENT', 'WORK'], obj: ['PERSON', 'ORG', 'EVENT', 'WORK'] },  // X after Y
  before: { subj: ['PERSON', 'ORG', 'EVENT', 'WORK'], obj: ['PERSON', 'ORG', 'EVENT', 'WORK'] },  // X before Y
  during: { subj: ['PERSON', 'ORG', 'EVENT'], obj: ['EVENT', 'WORK'] },  // X during Y

  cousin_of: { subj: ['PERSON'], obj: ['PERSON'] }, // kinship
  ancestor_of: { subj: ['PERSON'], obj: ['PERSON'] }, // kinship
  descendant_of: { subj: ['PERSON'], obj: ['PERSON'] }, // kinship
  owned_by: { subj: ['PERSON','ORG'], obj: ['PERSON','ORG','PLACE','ITEM','WORK'] }, // ownership
  belongs_to: { subj: ['PERSON','ORG'], obj: ['PERSON','ORG','PLACE','ITEM','WORK'] }, // ownership
  property_of: { subj: ['PERSON','ORG'], obj: ['PERSON','ORG','PLACE','ITEM','WORK'] }, // ownership
  possessed_by: { subj: ['PERSON','ORG'], obj: ['PERSON','ORG','PLACE','ITEM','WORK'] }, // ownership
  works_for: { subj: ['PERSON'], obj: ['ORG','PLACE'] }, // employment
  employed_by: { subj: ['PERSON'], obj: ['ORG','PLACE'] }, // employment
  affiliated_with: { subj: ['PERSON'], obj: ['ORG','PLACE'] }, // employment
  partner_at: { subj: ['PERSON'], obj: ['ORG','PLACE'] }, // employment
  serves: { subj: ['PERSON'], obj: ['ORG','PLACE'] }, // employment
  invented_by: { subj: ['PERSON','ORG'], obj: ['WORK','ITEM','PLACE'] }, // creation
  painted_by: { subj: ['PERSON','ORG'], obj: ['WORK','ITEM','PLACE'] }, // creation
  built_by: { subj: ['PERSON','ORG'], obj: ['WORK','ITEM','PLACE'] }, // creation
  composed_by: { subj: ['PERSON','ORG'], obj: ['WORK','ITEM','PLACE'] }, // creation
  designed_by: { subj: ['PERSON','ORG'], obj: ['WORK','ITEM','PLACE'] }, // creation
  written_by: { subj: ['PERSON','ORG'], obj: ['WORK','ITEM','PLACE'] }, // creation
  near: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PLACE','ORG'] }, // location
  within: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PLACE','ORG'] }, // location
  across_from: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PLACE','ORG'] }, // location
  adjacent_to: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PLACE','ORG'] }, // location
  based_in: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PLACE','ORG'] }, // location
  north_of: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PLACE','ORG'] }, // location
  south_of: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PLACE','ORG'] }, // location
  since: { subj: ['PERSON','ORG','EVENT','WORK'], obj: ['PERSON','ORG','EVENT','WORK'] }, // temporal
  until: { subj: ['PERSON','ORG','EVENT','WORK'], obj: ['PERSON','ORG','EVENT','WORK'] }, // temporal
  on: { subj: ['PERSON','ORG','EVENT','WORK'], obj: ['PERSON','ORG','EVENT','WORK'] }, // temporal
  between: { subj: ['PERSON','ORG','EVENT','WORK'], obj: ['PERSON','ORG','EVENT','WORK'] }, // temporal
  caused_by: { subj: ['PERSON','ORG','EVENT'], obj: ['PERSON','ORG','EVENT','WORK'] }, // causation
  led_to: { subj: ['PERSON','ORG','EVENT'], obj: ['PERSON','ORG','EVENT','WORK'] }, // causation
  influenced_by: { subj: ['PERSON','ORG','EVENT'], obj: ['PERSON','ORG','EVENT','WORK'] }, // causation
  resulted_from: { subj: ['PERSON','ORG','EVENT'], obj: ['PERSON','ORG','EVENT','WORK'] }, // causation
  due_to: { subj: ['PERSON','ORG','EVENT'], obj: ['PERSON','ORG','EVENT','WORK'] }, // causation
  triggered_by: { subj: ['PERSON','ORG','EVENT'], obj: ['PERSON','ORG','EVENT','WORK'] }, // causation
  consists_of: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PERSON','ORG','PLACE','ITEM'] }, // part_whole
  includes: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PERSON','ORG','PLACE','ITEM'] }, // part_whole
  contains: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PERSON','ORG','PLACE','ITEM'] }, // part_whole
  made_of: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PERSON','ORG','PLACE','ITEM'] }, // part_whole
  comprises: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PERSON','ORG','PLACE','ITEM'] }, // part_whole
  equals: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PERSON','ORG','PLACE','ITEM'] }, // identity
  same_as: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PERSON','ORG','PLACE','ITEM'] }, // identity
  also_known_as: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PERSON','ORG','PLACE','ITEM'] }, // identity
  represents: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PERSON','ORG','PLACE','ITEM'] }, // identity
  participated_in: { subj: ['PERSON','ORG'], obj: ['EVENT','PLACE'] }, // event
  performed_at: { subj: ['PERSON','ORG'], obj: ['EVENT','PLACE'] }, // event
  witnessed: { subj: ['PERSON','ORG'], obj: ['EVENT','PLACE'] }, // event
  organized: { subj: ['PERSON','ORG'], obj: ['EVENT','PLACE'] }, // event
  told: { subj: ['PERSON','ORG'], obj: ['PERSON','ORG'] }, // communication
  said_to: { subj: ['PERSON','ORG'], obj: ['PERSON','ORG'] }, // communication
  asked: { subj: ['PERSON','ORG'], obj: ['PERSON','ORG'] }, // communication
  informed: { subj: ['PERSON','ORG'], obj: ['PERSON','ORG'] }, // communication
  replied: { subj: ['PERSON','ORG'], obj: ['PERSON','ORG'] }, // communication
  reported: { subj: ['PERSON','ORG'], obj: ['PERSON','ORG'] }, // communication
  controlled_by: { subj: ['PERSON','ORG'], obj: ['ORG','PLACE','PERSON'] }, // power
  commanded_by: { subj: ['PERSON','ORG'], obj: ['ORG','PLACE','PERSON'] }, // power
  managed_by: { subj: ['PERSON','ORG'], obj: ['ORG','PLACE','PERSON'] }, // power
  governed_by: { subj: ['PERSON','ORG'], obj: ['ORG','PLACE','PERSON'] }, // power
  led_by: { subj: ['PERSON','ORG'], obj: ['ORG','PLACE','PERSON'] }, // power
  less_than: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PERSON','ORG','PLACE','ITEM'] }, // comparison
  equal_to: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PERSON','ORG','PLACE','ITEM'] }, // comparison
  higher_than: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PERSON','ORG','PLACE','ITEM'] }, // comparison
  similar_to: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PERSON','ORG','PLACE','ITEM'] }, // comparison
  different_from: { subj: ['PERSON','ORG','PLACE','ITEM'], obj: ['PERSON','ORG','PLACE','ITEM'] }, // comparison
  hated: { subj: ['PERSON'], obj: ['PERSON'] }, // emotional
  respected: { subj: ['PERSON'], obj: ['PERSON'] }, // emotional
  disliked: { subj: ['PERSON'], obj: ['PERSON'] }, // emotional
  admired: { subj: ['PERSON'], obj: ['PERSON'] }, // emotional
  envied: { subj: ['PERSON'], obj: ['PERSON'] }, // emotional
  feared: { subj: ['PERSON'], obj: ['PERSON'] }, // emotional
  not_related_to: { subj: ['PERSON','ORG'], obj: ['PERSON','ORG','WORK','EVENT'] }, // negation
  alleged: { subj: ['PERSON','ORG'], obj: ['PERSON','ORG','WORK','EVENT'] }, // negation
  rumored: { subj: ['PERSON','ORG'], obj: ['PERSON','ORG','WORK','EVENT'] }, // negation
  denied: { subj: ['PERSON','ORG'], obj: ['PERSON','ORG','WORK','EVENT'] }, // negation
  disputed: { subj: ['PERSON','ORG'], obj: ['PERSON','ORG','WORK','EVENT'] }, // negation
  uncertain_link: { subj: ['PERSON','ORG'], obj: ['PERSON','ORG','WORK','EVENT'] }, // negation
  painted: { subj: ['PERSON','ORG'], obj: ['WORK','ITEM','PLACE'] }, // creation
  composed: { subj: ['PERSON','ORG'], obj: ['WORK','ITEM','PLACE'] }, // creation
  designed: { subj: ['PERSON','ORG'], obj: ['WORK','ITEM','PLACE'] }, // creation
  sculpted: { subj: ['PERSON','ORG'], obj: ['WORK','ITEM','PLACE'] }, // creation
  // Ability/skill predicates
  possesses_ability: { subj: ['PERSON','CREATURE','DEITY','RACE'], obj: ['ABILITY','SKILL','POWER','SPELL','TECHNIQUE'] }, // X possesses ability Y
  learned: { subj: ['PERSON','CREATURE'], obj: ['SKILL','TECHNIQUE','SPELL','ABILITY'] }, // X learned Y
  mastered: { subj: ['PERSON','CREATURE'], obj: ['SKILL','TECHNIQUE','SPELL','ABILITY'] }, // X mastered Y
  trained_in: { subj: ['PERSON','CREATURE'], obj: ['TECHNIQUE','SKILL','ABILITY'] }, // X trained in Y
  grants: { subj: ['ABILITY','SPELL','POWER','ARTIFACT','TECHNOLOGY','MAGIC'], obj: ['ABILITY','POWER','SKILL'] }, // X grants Y
  requires: { subj: ['ABILITY','SPELL','TECHNIQUE'], obj: ['ABILITY','SPELL','TECHNIQUE','MATERIAL','ITEM'] }, // X requires Y
  countered_by: { subj: ['ABILITY','SPELL','POWER','TECHNIQUE'], obj: ['ABILITY','SPELL','POWER','TECHNIQUE'] }, // X countered by Y
  enhances: { subj: ['ABILITY','SPELL','POWER','ARTIFACT','TECHNOLOGY'], obj: ['ABILITY','POWER','SKILL'] }, // X enhances Y
  cast_by: { subj: ['SPELL','MAGIC'], obj: ['PERSON','CREATURE','DEITY'] }, // X cast by Y
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
  killed: 'killed',  // No inverse - death is one-way

  ancestor_of: 'descendant_of',
  descendant_of: 'ancestor_of',
  owned_by: 'owns' as Predicate,
  owns: 'owned_by' as Predicate,
  possessed_by: 'possesses' as Predicate,
  possesses: 'possessed_by' as Predicate,
  painted_by: 'painted' as Predicate,
  painted: 'painted_by' as Predicate,
  composed_by: 'composed' as Predicate,
  composed: 'composed_by' as Predicate,
  designed_by: 'designed' as Predicate,
  designed: 'designed_by' as Predicate
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
