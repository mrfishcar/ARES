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
  // SVO action predicates (expanded for benchmark)
  | 'trusted'  // X trusted Y
  | 'helped'  // X helped Y
  | 'saved'  // X saved Y
  | 'betrayed'  // X betrayed Y
  | 'protected'  // X protected Y
  | 'captured'  // X captured Y
  | 'followed'  // X followed Y
  | 'attacked'  // X attacked Y
  | 'wrote'  // X wrote Y
  | 'created'  // X created Y
  | 'destroyed'  // X destroyed Y
  | 'built'  // X built Y
  | 'taught'  // X taught Y
  | 'trained'  // X trained Y
  | 'found'  // X found Y
  | 'defended'  // X defended Y
  | 'warned'  // X warned Y
  | 'saw'  // X saw Y
  | 'heard'  // X heard Y
  | 'discovered'  // X discovered Y
  | 'lost'  // X lost Y
  | 'read'  // X read Y
  | 'knew'  // X knew Y
  | 'guided'  // X guided Y
  | 'took'  // X took Y
  | 'gave'  // X gave Y
  | 'received'  // X received Y
  | 'sent'  // X sent Y
  | 'visited'  // X visited Y
  | 'escaped'  // X escaped from Y
  | 'joined'  // X joined Y
  | 'rival_of'  // X rival_of Y
  | 'mentor_of'  // X mentor_of Y
  | 'owned'  // X owned Y
  | 'studied'  // X studied Y
  | 'led'  // X led Y

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
  attrs?: Record<string, string | number | boolean | undefined | object | null>;
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
  extractor?: 'dep' | 'regex' | 'fiction-dialogue' | 'fiction-action' | 'fiction-family' | 'manual';  // Extraction method
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
  defeated: { subj: ['PERSON', 'ORG', 'CREATURE'], obj: ['PERSON', 'ORG', 'CREATURE', 'ARTIFACT', 'ITEM'] },  // X defeated Y (expanded for artifacts/creatures)
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
  // SVO action predicates (expanded for benchmark)
  trusted: { subj: ['PERSON'], obj: ['PERSON'] },  // X trusted Y
  helped: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG'] },  // X helped Y
  saved: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'CREATURE', 'ORG', 'PLACE'] },  // X saved Y
  betrayed: { subj: ['PERSON'], obj: ['PERSON', 'ORG'] },  // X betrayed Y
  protected: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'PLACE', 'ORG', 'ITEM'] },  // X protected Y
  captured: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'CREATURE'] },  // X captured Y
  followed: { subj: ['PERSON'], obj: ['PERSON'] },  // X followed Y
  attacked: { subj: ['PERSON', 'ORG', 'CREATURE'], obj: ['PERSON', 'ORG', 'CREATURE', 'PLACE'] },  // X attacked Y
  wrote: { subj: ['PERSON'], obj: ['WORK', 'ITEM'] },  // X wrote Y
  created: { subj: ['PERSON', 'ORG'], obj: ['WORK', 'ITEM', 'ARTIFACT', 'ORG'] },  // X created Y
  destroyed: { subj: ['PERSON', 'ORG', 'CREATURE'], obj: ['ITEM', 'ARTIFACT', 'PLACE', 'ORG'] },  // X destroyed Y
  built: { subj: ['PERSON', 'ORG'], obj: ['PLACE', 'ITEM', 'ORG'] },  // X built Y
  taught: { subj: ['PERSON'], obj: ['PERSON'] },  // X taught Y
  trained: { subj: ['PERSON'], obj: ['PERSON'] },  // X trained Y
  found: { subj: ['PERSON', 'ORG'], obj: ['ITEM', 'PLACE', 'PERSON', 'ARTIFACT'] },  // X found Y
  defended: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'PLACE', 'ORG'] },  // X defended Y
  warned: { subj: ['PERSON'], obj: ['PERSON', 'ORG'] },  // X warned Y
  saw: { subj: ['PERSON'], obj: ['PERSON', 'ITEM', 'PLACE', 'CREATURE'] },  // X saw Y
  heard: { subj: ['PERSON'], obj: ['PERSON', 'ITEM', 'WORK'] },  // X heard Y
  discovered: { subj: ['PERSON', 'ORG'], obj: ['ITEM', 'PLACE', 'PERSON', 'ARTIFACT'] },  // X discovered Y
  lost: { subj: ['PERSON'], obj: ['ITEM', 'PERSON'] },  // X lost Y
  read: { subj: ['PERSON'], obj: ['WORK', 'ITEM'] },  // X read Y
  knew: { subj: ['PERSON'], obj: ['PERSON'] },  // X knew Y
  guided: { subj: ['PERSON'], obj: ['PERSON'] },  // X guided Y
  took: { subj: ['PERSON', 'ORG'], obj: ['ITEM', 'PERSON', 'PLACE'] },  // X took Y
  gave: { subj: ['PERSON', 'ORG'], obj: ['ITEM', 'PERSON'] },  // X gave Y
  received: { subj: ['PERSON', 'ORG'], obj: ['ITEM'] },  // X received Y
  sent: { subj: ['PERSON', 'ORG'], obj: ['ITEM', 'PERSON'] },  // X sent Y
  visited: { subj: ['PERSON'], obj: ['PERSON', 'PLACE'] },  // X visited Y
  escaped: { subj: ['PERSON'], obj: ['PLACE', 'ORG', 'PERSON'] },  // X escaped Y
  joined: { subj: ['PERSON'], obj: ['ORG', 'PERSON'] },  // X joined Y
  rival_of: { subj: ['PERSON'], obj: ['PERSON'] },  // X rival_of Y
  mentor_of: { subj: ['PERSON'], obj: ['PERSON'] },  // X mentor_of Y
  owned: { subj: ['PERSON', 'ORG'], obj: ['ITEM', 'ARTIFACT', 'CREATURE'] },  // X owned Y
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
  studied: { subj: ['PERSON'], obj: ['PERSON', 'ITEM', 'WORK', 'SKILL'] }, // X studied Y
  led: { subj: ['PERSON', 'ORG'], obj: ['PERSON', 'ORG', 'PLACE'] }, // X led Y
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

// ============================================================================
// USER OVERRIDE SYSTEM (Phase 2 - 2025-12-20)
// ============================================================================

/**
 * Types of corrections a user can make to the knowledge graph
 */
export type CorrectionType =
  | 'entity_type'     // Change entity type (PERSON → ORG)
  | 'entity_merge'    // Merge two entities into one
  | 'entity_split'    // Split one entity into multiple
  | 'entity_reject'   // Mark entity as invalid
  | 'entity_restore'  // Restore a rejected entity
  | 'relation_add'    // Add a new relation
  | 'relation_remove' // Remove an existing relation
  | 'relation_edit'   // Modify relation predicate or confidence
  | 'alias_add'       // Add alias to entity
  | 'alias_remove'    // Remove alias from entity
  | 'canonical_change'; // Change canonical name

/**
 * User correction record - first-class delta for the meaning layer
 *
 * These corrections are preserved across reprocessing and applied
 * after extraction to maintain user edits.
 */
export interface Correction {
  id: string;
  type: CorrectionType;
  timestamp: string;  // ISO date string
  author?: string;    // User/system that made the correction

  // Target of the correction
  entityId?: string;       // Entity being corrected
  relationId?: string;     // Relation being corrected
  entityIds?: string[];    // For merge operations

  // Before/after snapshots for rollback
  before?: {
    entityType?: EntityType;
    canonical?: string;
    aliases?: string[];
    alias?: string;             // Single alias for alias_add/remove
    predicate?: Predicate;
    confidence?: number;
    rejected?: boolean;
    entity?: Partial<Entity>;   // For rejection: the entity being rejected
    entities?: Partial<Entity>[]; // For merge: the entities being merged
    relation?: Partial<Relation>; // For relation operations
    snapshot?: Partial<Entity | Relation>;
  };
  after?: {
    entityType?: EntityType;
    canonical?: string;
    aliases?: string[];
    alias?: string;             // Single alias for alias_add/remove
    predicate?: Predicate;
    confidence?: number;
    rejected?: boolean;
    mergedEntityId?: string;    // For merge: the resulting entity ID
    splitEntityIds?: string[];  // For split: the resulting entity IDs
    relation?: Partial<Relation>; // For relation operations
    snapshot?: Partial<Entity | Relation>;
  };

  // Context for learning
  context?: {
    sourceText?: string;      // Text that triggered correction
    extractionMethod?: string; // How the entity was originally extracted
    originalConfidence?: number;
  };

  // User-provided reason
  reason?: string;

  // Learning metadata
  learned?: {
    patternExtracted?: boolean;  // Did we learn from this correction?
    patternId?: string;          // ID of learned pattern
    appliedToCount?: number;     // How many times pattern was applied
  };

  // Status flags
  rolledBack?: boolean;
  rolledBackAt?: string;
  rolledBackBy?: string;
}

/**
 * Version snapshot for rollback capability
 */
export interface VersionSnapshot {
  id: string;
  timestamp?: string;
  createdAt?: string;     // Alias for timestamp
  correctionId: string;   // Correction that triggered this snapshot
  description?: string;
  entityCount?: number;   // For lightweight snapshots
  relationCount?: number; // For lightweight snapshots

  // Changed IDs for efficient diffing
  changedEntities?: string[];
  changedRelations?: string[];

  // Full state snapshot (for complete rollback)
  snapshot?: {
    entities: Entity[];
    relations: Relation[];
  };
}

/**
 * Learned pattern from user corrections
 */
export interface LearnedPattern {
  id: string;
  type: 'entity_type' | 'entity_name' | 'relation' | 'confidence';

  // Pattern matching
  pattern: string;  // Regex or rule
  condition: {
    textPattern?: string;    // e.g., "Kingdom of *"
    contextPattern?: string; // e.g., "ruled by"
    entityType?: EntityType;
    predicate?: Predicate;
  };

  // Action to take when pattern matches
  action: {
    setType?: EntityType;
    setConfidence?: number;
    setPredicate?: Predicate;
    merge?: boolean;
    reject?: boolean;
  };

  // Statistics
  stats: {
    timesApplied: number;
    timesValidated: number;  // User confirmed pattern was correct
    timesRejected: number;   // User overrode pattern
    lastApplied?: string;
  };

  // Derived from correction
  sourceCorrections: string[];  // IDs of corrections that created this pattern

  // Status
  active: boolean;
  confidence: number;  // Pattern confidence (higher = more reliable)
}

/**
 * Extended Entity with manual override tracking
 */
export interface EntityWithOverrides extends Entity {
  manualOverride?: {
    hasOverride: boolean;
    overrideType?: CorrectionType;
    correctionId?: string;
    overrideAt?: string;
    originalType?: EntityType;
    originalCanonical?: string;
  };
  rejected?: boolean;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
}

/**
 * Extended Relation with manual override tracking
 */
export interface RelationWithOverrides extends Relation {
  manualOverride?: {
    hasOverride: boolean;
    overrideType?: CorrectionType;
    correctionId?: string;
    overrideAt?: string;
    originalPredicate?: Predicate;
  };
  rejected?: boolean;
  rejectedAt?: string;
}

// ============================================================================
// QUALITY PROVENANCE SYSTEM (Phase 3.4 - 2025-12-20)
// ============================================================================

/**
 * Filter rule that was checked during quality filtering
 */
export interface FilterRuleCheck {
  /** Rule identifier */
  rule: string;
  /** Whether the rule triggered (resulted in rejection) */
  triggered: boolean;
  /** Specific value that triggered the rule */
  triggerValue?: string | number | boolean;
}

/**
 * Confidence components that contributed to final confidence score
 */
export interface ConfidenceBreakdown {
  /** Base confidence from extraction source */
  base: number;
  /** NER-backed bonus (+0.15 typical) */
  nerBonus?: number;
  /** Multi-token bonus (+0.10 typical) */
  multiTokenBonus?: number;
  /** Title prefix bonus (+0.08 typical) */
  titlePrefixBonus?: number;
  /** Context promotion bonus (dialogue, relation, coreference) */
  contextBonus?: number;
  /** Penalty from low-quality signals */
  qualityPenalty?: number;
  /** Namehood score from structural evidence (0-10+, maps to tier assignment) */
  namehoodScore?: number;
  /** Final computed confidence */
  final: number;
}

/**
 * Unified Entity Quality Score
 *
 * Bridges confidence scoring (0-1) with namehood scoring (0-10+) and tier assignment.
 * This interface provides a single view of entity quality across all scoring systems.
 *
 * Score Mapping:
 * - namehoodScore >= 3 → TIER_A (confidence ~0.75+)
 * - namehoodScore >= 2 → TIER_B (confidence ~0.55+)
 * - namehoodScore < 2  → TIER_C (confidence < 0.55)
 *
 * The unified score allows consistent quality decisions across the pipeline.
 */
export interface EntityQualityScore {
  /** Raw confidence from extraction source (0-1) */
  rawConfidence: number;

  /** Structural namehood score from evidence (0-10+) */
  namehoodScore: number;

  /** Final computed confidence after all adjustments (0-1) */
  finalConfidence: number;

  /** Assigned tier based on evidence */
  tier: EntityTier;

  /** Primary reason for tier assignment */
  tierReason: string;

  /** Whether entity passes quality filter threshold */
  passesFilter: boolean;

  /** Confidence breakdown components */
  breakdown: ConfidenceBreakdown;

  /** Evidence signals that contributed to score */
  evidence: {
    occursNonInitial: boolean;
    isMultiToken: boolean;
    hasHonorific: boolean;
    hasNERSupport: boolean;
    mentionCount: number;
    appearsInDialogue: boolean;
    hasAppositive: boolean;
  };
}

/**
 * Quality decision record for debugging and auditing
 *
 * Attached to each entity to explain why it was:
 * - Assigned to a specific tier
 * - Rejected from the graph
 * - Promoted or demoted
 *
 * Enables post-hoc debugging of quality filtering decisions.
 */
export interface QualityDecision {
  /** When the decision was made */
  timestamp: string;

  /** Decision outcome */
  outcome: 'accepted' | 'rejected';

  /** Assigned tier (if accepted) */
  tier?: EntityTier;

  /** Reason for tier assignment */
  tierReason?: string;

  /** Rejection reason (if rejected) */
  rejectionReason?: string;

  /** Filter rules that were checked */
  rulesChecked: FilterRuleCheck[];

  /** Confidence score breakdown */
  confidenceBreakdown?: ConfidenceBreakdown;

  /** Context signals that influenced the decision */
  contextSignals?: {
    appearsInDialogue?: boolean;
    appearsInRelation?: boolean;
    hasCoreferenceLink?: boolean;
    hasAppositiveDescription?: boolean;
    multiParagraphMentions?: number;
  };

  /** If promoted from a lower tier */
  promotion?: {
    originalTier: EntityTier;
    newTier: EntityTier;
    promotionReason: string;
  };

  /** Source of the entity (NER, pattern, fallback, etc.) */
  source?: string;

  /** Whether this was a sentence-initial-only occurrence */
  sentenceInitialOnly?: boolean;

  /** Whether entity had NER backing */
  hasNERSupport?: boolean;

  /** Pipeline version that made this decision */
  pipelineVersion?: string;
}

/**
 * Extended Entity with quality decision tracking
 */
export interface EntityWithQuality extends Entity {
  qualityDecision?: QualityDecision;
}
