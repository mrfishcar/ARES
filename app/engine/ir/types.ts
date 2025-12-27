/**
 * Story World IR - Core Type Definitions
 *
 * This module defines the Intermediate Representation (IR) that ARES compiles
 * narrative text into. The IR is a queryable, evidence-backed representation
 * of entities, events, assertions, and facts in a story world.
 *
 * Design principles:
 * - Evidence-first: Every object carries provenance
 * - Uncertainty-preserved: Confidence and modality throughout
 * - Renderer-safe: All semantic work happens in compiler passes
 *
 * @module ir/types
 */

// =============================================================================
// PRIMITIVE TYPES
// =============================================================================

/** Stable identifier for entities */
export type EntityId = string;

/** Stable identifier for events */
export type EventId = string;

/** Stable identifier for assertions */
export type AssertionId = string;

/** Stable identifier for facts */
export type FactId = string;

/** Document identifier */
export type DocId = string;

// =============================================================================
// EVIDENCE & PROVENANCE
// =============================================================================

/**
 * A span of text that provides evidence for an IR object.
 * This is the fundamental unit of provenance.
 */
export interface EvidenceSpan {
  /** Document containing this evidence */
  docId: DocId;

  /** Chapter index (0-based, optional) */
  chapterIndex?: number;

  /** Paragraph index within chapter or document */
  paragraphIndex?: number;

  /** Sentence index within paragraph */
  sentenceIndex?: number;

  /** Character offset start (0-based) */
  charStart: number;

  /** Character offset end (exclusive) */
  charEnd: number;

  /** The actual text (cached for display, not for inference) */
  text: string;
}

/**
 * Who asserts this information and how reliable are they?
 */
export interface Attribution {
  /** The source type */
  source: 'NARRATOR' | 'CHARACTER' | 'OMNISCIENT' | 'DOCUMENT';

  /** If source is CHARACTER, which one */
  character?: EntityId;

  /** How reliable is this source? (0-1) */
  reliability: number;

  /** Was this stated in dialogue? */
  isDialogue: boolean;

  /** Was this a character's thought/internal monologue? */
  isThought: boolean;
}

/**
 * Modality: what is the epistemic status of this information?
 */
export type Modality =
  | 'FACT'          // Presented as true by narrator
  | 'BELIEF'        // Character believes (may be false)
  | 'CLAIM'         // Character/narrator claims (reliability uncertain)
  | 'RUMOR'         // Unverified social knowledge
  | 'PLAN'          // Intended future action
  | 'HYPOTHETICAL'  // Imagined, conditional, counterfactual
  | 'NEGATED'       // Explicitly stated as not true
  | 'UNCERTAIN';    // Ambiguous in text

/**
 * Confidence scores at different stages of processing.
 */
export interface Confidence {
  /** How well did we parse/extract this? */
  extraction: number;

  /** How sure are we about entity resolution? */
  identity: number;

  /** How sure are we about semantic interpretation? */
  semantic: number;

  /** How sure are we about temporal placement? */
  temporal: number;

  /** Aggregated confidence (computed) */
  composite: number;
}

// =============================================================================
// TIME ANCHORING
// =============================================================================

/**
 * Absolute time anchor with precision indicator.
 */
export interface AbsoluteTime {
  type: 'ABSOLUTE';
  /** ISO date string or partial (e.g., "1991", "1991-09", "1991-09-01") */
  date: string;
  precision: 'year' | 'month' | 'day' | 'time';
}

/**
 * Time relative to another event.
 */
export interface RelativeTime {
  type: 'RELATIVE';
  /** The anchor event */
  anchor: EventId;
  /** Offset expression (e.g., "+3 days", "-1 year", "immediately after") */
  offset: string;
}

/**
 * Time bounded by other events/times.
 */
export interface BoundedTime {
  type: 'BOUNDED';
  /** Must be before this (if known) */
  before?: EventId | TimeAnchor;
  /** Must be after this (if known) */
  after?: EventId | TimeAnchor;
}

/**
 * Uncertain time within a range.
 */
export interface UncertainTime {
  type: 'UNCERTAIN';
  /** Earliest possible time */
  earliest: TimeAnchor;
  /** Latest possible time */
  latest: TimeAnchor;
}

/**
 * Time anchored to discourse position (chapter, paragraph).
 * Used when story time is unclear but narrative position is known.
 */
export interface DiscourseTime {
  type: 'DISCOURSE';
  chapter?: number;
  paragraph?: number;
  sentence?: number;
}

/**
 * Unknown time.
 */
export interface UnknownTime {
  type: 'UNKNOWN';
}

/**
 * Union of all time anchor types.
 */
export type TimeAnchor =
  | AbsoluteTime
  | RelativeTime
  | BoundedTime
  | UncertainTime
  | DiscourseTime
  | UnknownTime;

/**
 * Duration of an event or state.
 */
export interface Duration {
  /** Duration expression (e.g., "3 days", "several years", "a moment") */
  value: string;
  /** Is this an exact or approximate duration? */
  isApproximate: boolean;
}

// =============================================================================
// ENTITIES
// =============================================================================

/**
 * Core entity types (extensible by project).
 */
export type EntityType =
  | 'PERSON'
  | 'PLACE'
  | 'ORG'
  | 'ITEM'         // Objects, artifacts
  | 'EVENT'        // Named events (The Battle of Hogwarts)
  | 'CREATURE'     // Non-human beings
  | 'GROUP'        // Collectives (The Order of the Phoenix)
  | 'CONCEPT'      // Abstract ideas
  | 'WORK'         // Books, songs, spells
  | 'TIME_PERIOD'  // Named periods (The First Wizarding War)
  | 'CUSTOM';      // Project-defined types

/**
 * A canonical entity in the story world.
 *
 * Entities are stable identities that persist across documents and reprocessing.
 * They're not "sacred" - they're data types that can be filtered/extended.
 */
export interface Entity {
  /** Stable canonical ID */
  id: EntityId;

  /** Primary type (can have subtypes via attrs) */
  type: EntityType;

  /** Custom type name (if type === 'CUSTOM') */
  customType?: string;

  /** Canonical name (most complete/formal form) */
  canonical: string;

  /** All known surface forms */
  aliases: string[];

  /** When this entity was created in IR */
  createdAt: string;

  /** When this entity was last updated */
  updatedAt: string;

  /** Type-specific attributes */
  attrs: Record<string, string | number | boolean | null>;

  /** Merge history (if result of merge) */
  mergedFrom?: EntityId[];

  /** Split history (if result of split) */
  splitFrom?: EntityId;

  /** Evidence for entity existence */
  evidence: EvidenceSpan[];

  /** Confidence in this entity */
  confidence: Confidence;

  /** User override status */
  userConfirmed?: boolean;
  userRejected?: boolean;
  userLocked?: boolean;  // Prevents automatic changes
}

// =============================================================================
// ASSERTIONS
// =============================================================================

/**
 * Predicate types for assertions and facts.
 */
export type PredicateType =
  // Family relations
  | 'parent_of'
  | 'child_of'
  | 'sibling_of'
  | 'married_to'
  | 'ancestor_of'
  | 'descendant_of'

  // Social relations
  | 'friend_of'
  | 'enemy_of'
  | 'ally_of'
  | 'member_of'
  | 'leader_of'
  | 'servant_of'
  | 'mentor_of'
  | 'student_of'

  // Spatial relations
  | 'located_in'
  | 'lives_in'
  | 'works_at'
  | 'visited'
  | 'born_in'
  | 'died_in'

  // Temporal relations
  | 'contemporary_with'
  | 'preceded_by'
  | 'succeeded_by'

  // Possession/ownership
  | 'owns'
  | 'created'
  | 'possesses'

  // Identity/classification
  | 'is_a'
  | 'has_role'
  | 'has_title'
  | 'has_alias'

  // Attributes
  | 'has_property'
  | 'has_age'
  | 'has_gender'

  // Custom
  | string;  // Allow project-defined predicates

/**
 * An assertion is a claim about the story world.
 *
 * Assertions carry full epistemics: who says this, how confident,
 * what modality, when valid.
 */
export interface Assertion {
  /** Stable ID */
  id: AssertionId;

  /** Assertion type */
  assertionType: 'DIRECT' | 'BELIEF' | 'CLAIM' | 'NEGATION' | 'HYPOTHETICAL';

  // For DIRECT assertions: subject-predicate-object
  subject?: EntityId;
  predicate?: PredicateType;
  object?: EntityId | string | number | boolean;  // Entity or literal value

  // For BELIEF/CLAIM assertions: holder + nested content
  holder?: EntityId;          // Who believes/claims this
  content?: Assertion;        // What they believe/claim

  // For NEGATION: what is being negated
  negates?: AssertionId;

  // Evidence and epistemics
  evidence: EvidenceSpan[];
  attribution: Attribution;
  modality: Modality;
  confidence: Confidence;

  // Temporal validity
  validFrom?: TimeAnchor;
  validUntil?: TimeAnchor;

  // Provenance
  derivedFromEvents?: EventId[];
  derivedFromAssertions?: AssertionId[];

  // Metadata
  createdAt: string;
  compiler_pass: string;       // Which pass produced this

  // User override status
  userConfirmed?: boolean;
  userRejected?: boolean;
}

// =============================================================================
// EVENTS
// =============================================================================

/**
 * Event types (literary-focused ontology v1).
 */
export type EventType =
  // State changes
  | 'BECOME'        // Entity gains property
  | 'CEASE'         // Entity loses property
  | 'TRANSFORM'     // Entity changes form

  // Physical actions
  | 'MOVE'          // Physical movement
  | 'TRANSFER'      // Object changes possession
  | 'CREATE'        // Something comes into existence
  | 'DESTROY'       // Something ceases to exist
  | 'ATTACK'        // Hostile action
  | 'HELP'          // Beneficial action

  // Social/relational
  | 'MEET'          // Entities encounter each other
  | 'BEFRIEND'      // Friendship forms
  | 'MARRY'         // Marriage event
  | 'BETRAY'        // Trust violation
  | 'ALLY'          // Alliance forms
  | 'CONFLICT'      // Opposition emerges
  | 'SEPARATE'      // Entities part ways

  // Cognitive
  | 'LEARN'         // Entity gains knowledge
  | 'DISCOVER'      // Entity finds something
  | 'REALIZE'       // Insight/understanding
  | 'DECIDE'        // Choice made
  | 'PLAN'          // Future intention formed
  | 'REMEMBER'      // Recall past event
  | 'FORGET'        // Lose memory

  // Communicative
  | 'TELL'          // Information transfer
  | 'ASK'           // Question posed
  | 'PROMISE'       // Commitment made
  | 'LIE'           // False statement (knowingly)
  | 'REVEAL'        // Hidden information exposed
  | 'CONCEAL'       // Information hidden
  | 'COMMAND'       // Order given
  | 'REQUEST'       // Ask for something

  // Biological/physical
  | 'BIRTH'         // Entity comes into existence
  | 'DEATH'         // Entity ceases to exist
  | 'INJURE'        // Physical harm
  | 'HEAL'          // Recovery from harm

  // Meta/narrative
  | 'FLASHBACK'     // Narrative returns to past
  | 'FORESHADOW'    // Hint at future
  | 'RETCON'        // Contradiction of earlier info

  // Custom
  | string;         // Allow project-defined event types

/**
 * Participant roles in events.
 */
export type ParticipantRole =
  | 'AGENT'         // Who does the action
  | 'PATIENT'       // Who is affected
  | 'EXPERIENCER'   // Who experiences (cognitive events)
  | 'RECIPIENT'     // Who receives
  | 'SOURCE'        // Where something comes from
  | 'DESTINATION'   // Where something goes to
  | 'INSTRUMENT'    // What is used
  | 'LOCATION'      // Where it happens
  | 'WITNESS'       // Who observes
  | 'BENEFICIARY'   // Who benefits
  | 'MALEFICIARY'   // Who is harmed
  | 'SPEAKER'       // Who speaks (communicative)
  | 'ADDRESSEE'     // Who is spoken to
  | 'TOPIC'         // What is discussed
  | string;         // Allow custom roles

/**
 * A participant in an event.
 */
export interface Participant {
  role: ParticipantRole;
  entity: EntityId;
  /** Is this participant optional or required for the event type? */
  isRequired: boolean;
}

/**
 * Link between events (temporal, causal).
 */
export interface EventLink {
  type: 'BEFORE' | 'AFTER' | 'SIMULTANEOUS' | 'CAUSES' | 'ENABLES' | 'PREVENTS' | 'PART_OF';
  target: EventId;
  confidence: number;
  evidence?: EvidenceSpan[];
}

/**
 * A story event - something that happens in the narrative.
 *
 * Events are first-class IR objects. They're the bridge between
 * extraction and timeline generation.
 */
export interface StoryEvent {
  /** Stable ID */
  id: EventId;

  /** Event type from ontology */
  type: EventType;

  /** Human-readable summary */
  summary?: string;

  /** Participants with roles */
  participants: Participant[];

  /** When this happened */
  time: TimeAnchor;

  /** How long it lasted */
  duration?: Duration;

  /** Where it happened */
  location?: EntityId;

  /** Evidence spans */
  evidence: EvidenceSpan[];

  /** Attribution */
  attribution: Attribution;

  /** Modality */
  modality: Modality;

  /** Confidence */
  confidence: Confidence;

  /** Links to other events */
  links: EventLink[];

  /** Assertions produced by this event (state changes) */
  produces: AssertionId[];

  /** What triggered this event extraction */
  extractedFrom: 'dependency' | 'pattern' | 'narrative' | 'quote' | 'explicit';

  /** Assertions this event was derived from (required for provenance) */
  derivedFrom: AssertionId[];

  /** Metadata */
  createdAt: string;
  compiler_pass: string;

  /** User override status */
  userConfirmed?: boolean;
  userRejected?: boolean;
}

// =============================================================================
// FACTS (MATERIALIZED VIEW ROWS)
// =============================================================================

/**
 * A FactViewRow is a single row in a materialized view over assertions/events.
 *
 * DESIGN RULES:
 * 1. Facts are NOT a second truth store - they are index rows
 * 2. derivedFrom is REQUIRED - orphan facts must be deleted
 * 3. No edit fields - to change a fact, edit the source assertion
 * 4. Recomputable - can drop all facts and regenerate from assertions
 * 5. No lifecycle - no createdAt, no user overrides on facts
 *
 * Think: database index row, not a table with its own identity.
 */
export interface FactViewRow {
  /** Computed ID (deterministic hash of derivedFrom) */
  id: FactId;

  /** Subject entity */
  subject: EntityId;

  /** Predicate */
  predicate: PredicateType;

  /** Object (entity or literal) */
  object: EntityId | string | number | boolean;

  /** When this fact became true (computed from source) */
  validFrom: TimeAnchor;

  /** When this fact stopped being true (computed from source) */
  validUntil?: TimeAnchor;

  /**
   * REQUIRED: Source assertions/events this fact was derived from.
   * If empty, this fact is orphaned and should be deleted.
   */
  derivedFrom: (EventId | AssertionId)[];

  /** Composite confidence (computed from source objects) */
  confidence: number;
}

/** Alias for clarity */
export type FactView = FactViewRow;

/** @deprecated Use FactViewRow */
export type Fact = FactViewRow;

// =============================================================================
// OVERRIDES
// =============================================================================

/**
 * Types of user overrides.
 */
export type OverrideAction =
  | 'MERGE'         // Merge two entities
  | 'SPLIT'         // Split one entity into multiple
  | 'RETYPE'        // Change entity type
  | 'RENAME'        // Change canonical name
  | 'ADD_ALIAS'     // Add alias to entity
  | 'REJECT'        // Mark as false/invalid
  | 'CONFIRM'       // Mark as true/valid
  | 'CORRECT_TIME'  // Fix temporal anchor
  | 'ADD_RELATION'  // Manually add relation
  | 'REMOVE_RELATION'  // Manually remove relation
  | 'LOCK'          // Prevent automatic changes
  | 'UNLOCK';       // Allow automatic changes

/**
 * A user override - changes to the IR that represent human corrections.
 *
 * Overrides are first-class IR objects, not hidden state.
 * They're auditable and can trigger recompilation.
 */
export interface Override {
  /** Stable ID */
  id: string;

  /** When this override was created */
  timestamp: string;

  /** Who made this override */
  user: string;

  /** What is being overridden */
  target: {
    type: 'entity' | 'event' | 'assertion' | 'fact';
    id: string;
  };

  /** What action is being taken */
  action: OverrideAction;

  /** Action-specific payload */
  payload: Record<string, any>;

  /** Human-readable reason */
  reason?: string;

  /** Objects affected by this override (computed) */
  rippleAffects: string[];

  /** Has this override been applied? */
  applied: boolean;

  /** When was it applied? */
  appliedAt?: string;
}

// =============================================================================
// PROJECT & DOCUMENT STRUCTURE
// =============================================================================

/**
 * A document in the project (chapter, book, etc.).
 */
export interface Document {
  id: DocId;
  title: string;
  projectId: string;
  orderIndex: number;       // For ordering chapters
  charCount: number;
  wordCount: number;
  compiledAt?: string;      // When IR was last compiled
  compilationVersion?: number;
}

/**
 * A project (novel, series, etc.).
 */
export interface Project {
  id: string;
  name: string;
  description?: string;
  documents: DocId[];
  createdAt: string;
  updatedAt: string;

  /** Project-level priors for extraction */
  priors: {
    aliasDictionary: Map<string, EntityId>;
    rejectList: Set<string>;
    typeLocks: Map<EntityId, EntityType>;
  };
}

// =============================================================================
// COMPILED IR
// =============================================================================

/**
 * The complete compiled IR for a document or project.
 *
 * This is what renderers consume.
 */
export interface CompiledIR {
  /** Project metadata */
  projectId: string;
  documents: Document[];

  /** Compilation metadata */
  compiledAt: string;
  compilerVersion: string;

  /** Core IR objects */
  entities: Entity[];
  events: StoryEvent[];
  assertions: Assertion[];
  facts: Fact[];

  /** User overrides (part of IR, not separate) */
  overrides: Override[];

  /** Statistics */
  stats: {
    entityCount: number;
    eventCount: number;
    assertionCount: number;
    factCount: number;
    overrideCount: number;
    evidenceSpanCount: number;
  };
}

// =============================================================================
// PROJECT IR (STABLE CONTRACT)
// =============================================================================

/**
 * ProjectIR is the stable JSON contract between adapter and renderers.
 *
 * This interface is versioned and should not change shape without
 * a version bump. Renderers depend on this shape.
 *
 * Adapter produces ProjectIR. Renderers consume ProjectIR.
 * They can evolve independently as long as this contract is stable.
 */
export interface ProjectIR {
  /** Schema version for compatibility checking */
  version: '1.0';

  /** Project/document identifier */
  projectId: string;
  docId?: string;

  /** When this IR was produced */
  createdAt: string;

  /** Core IR objects */
  entities: Entity[];
  assertions: Assertion[];
  events: StoryEvent[];

  /** Facts are optional - computed on demand as views */
  facts?: FactViewRow[];

  /** Statistics for quick overview */
  stats: {
    entityCount: number;
    assertionCount: number;
    eventCount: number;
  };
}

// =============================================================================
// RENDERER CONTRACTS
// =============================================================================

/**
 * Input for wiki renderer.
 */
export interface WikiRendererInput {
  /** The entity to render */
  entity: Entity;

  /** Facts about this entity */
  facts: Fact[];

  /** Events this entity participated in */
  events: StoryEvent[];

  /** Evidence spans for citations */
  evidenceSpans: EvidenceSpan[];

  /** Related entities (for links) */
  relatedEntities: Entity[];
}

/**
 * Input for timeline renderer.
 */
export interface TimelineRendererInput {
  /** Events to display */
  events: StoryEvent[];

  /** Entity filter (optional) */
  entityFilter?: EntityId[];

  /** Time range filter (optional) */
  timeRange?: {
    from?: TimeAnchor;
    to?: TimeAnchor;
  };

  /** Include uncertain times? */
  includeUncertain: boolean;
}

/**
 * Input for query interface.
 */
export interface QueryInput {
  /** Full compiled IR */
  ir: CompiledIR;

  /** Query type */
  queryType: 'events' | 'facts' | 'entities' | 'assertions';

  /** Filter predicate (function or structured filter) */
  filter?: Record<string, any>;

  /** Sort options */
  sort?: {
    field: string;
    direction: 'asc' | 'desc';
  };

  /** Pagination */
  limit?: number;
  offset?: number;
}

// =============================================================================
// HELPER TYPES
// =============================================================================

/**
 * Result of a compiler pass.
 */
export interface PassResult<T> {
  /** Output of the pass */
  output: T;

  /** Errors/warnings encountered */
  diagnostics: {
    level: 'error' | 'warning' | 'info';
    message: string;
    location?: EvidenceSpan;
  }[];

  /** Pass metadata */
  passName: string;
  duration: number;
}

/**
 * Compiler configuration.
 */
export interface CompilerConfig {
  /** Which passes to run */
  passes: string[];

  /** Pass-specific configuration */
  passConfig: Record<string, Record<string, any>>;

  /** Project-level priors */
  priors: Project['priors'];

  /** Should we preserve uncertainty or collapse to best guess? */
  preserveUncertainty: boolean;

  /** Minimum confidence to include in IR */
  minConfidence: number;
}
