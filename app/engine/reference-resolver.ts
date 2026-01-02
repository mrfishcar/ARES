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
// ROLE NOUN WHITELIST FOR DEFINITE DESCRIPTION RESOLUTION
// =============================================================================

/**
 * Maps role nouns to their expected entity types.
 * Used for resolving "the senator" → most salient PERSON in context.
 */
const ROLE_NOUNS: Map<string, EntityType> = new Map([
  // PERSON roles - political
  ['senator', 'PERSON'],
  ['candidate', 'PERSON'],
  ['president', 'PERSON'],
  ['vice president', 'PERSON'],
  ['governor', 'PERSON'],
  ['mayor', 'PERSON'],
  ['congressman', 'PERSON'],
  ['congresswoman', 'PERSON'],
  ['representative', 'PERSON'],
  ['minister', 'PERSON'],
  ['ambassador', 'PERSON'],
  ['diplomat', 'PERSON'],
  ['politician', 'PERSON'],
  ['leader', 'PERSON'],
  ['official', 'PERSON'],

  // PERSON roles - professional
  ['director', 'PERSON'],
  ['manager', 'PERSON'],
  ['executive', 'PERSON'],
  ['ceo', 'PERSON'],
  ['cfo', 'PERSON'],
  ['cto', 'PERSON'],
  ['chairman', 'PERSON'],
  ['chairwoman', 'PERSON'],
  ['founder', 'PERSON'],
  ['entrepreneur', 'PERSON'],
  ['lawyer', 'PERSON'],
  ['attorney', 'PERSON'],
  ['doctor', 'PERSON'],
  ['physician', 'PERSON'],
  ['professor', 'PERSON'],
  ['teacher', 'PERSON'],
  ['scientist', 'PERSON'],
  ['researcher', 'PERSON'],
  ['engineer', 'PERSON'],
  ['journalist', 'PERSON'],
  ['reporter', 'PERSON'],
  ['author', 'PERSON'],
  ['writer', 'PERSON'],
  ['artist', 'PERSON'],
  ['actor', 'PERSON'],
  ['actress', 'PERSON'],
  ['singer', 'PERSON'],
  ['musician', 'PERSON'],
  ['athlete', 'PERSON'],
  ['player', 'PERSON'],
  ['coach', 'PERSON'],

  // PERSON roles - family/social
  ['man', 'PERSON'],
  ['woman', 'PERSON'],
  ['boy', 'PERSON'],
  ['girl', 'PERSON'],
  ['child', 'PERSON'],
  ['father', 'PERSON'],
  ['mother', 'PERSON'],
  ['son', 'PERSON'],
  ['daughter', 'PERSON'],
  ['husband', 'PERSON'],
  ['wife', 'PERSON'],
  ['brother', 'PERSON'],
  ['sister', 'PERSON'],
  ['uncle', 'PERSON'],
  ['aunt', 'PERSON'],
  ['grandfather', 'PERSON'],
  ['grandmother', 'PERSON'],

  // PERSON roles - fantasy/titles
  ['king', 'PERSON'],
  ['queen', 'PERSON'],
  ['prince', 'PERSON'],
  ['princess', 'PERSON'],
  ['lord', 'PERSON'],
  ['lady', 'PERSON'],
  ['wizard', 'PERSON'],
  ['witch', 'PERSON'],
  ['knight', 'PERSON'],
  ['warrior', 'PERSON'],
  ['hero', 'PERSON'],
  ['villain', 'PERSON'],

  // ORG roles
  ['company', 'ORG'],
  ['corporation', 'ORG'],
  ['firm', 'ORG'],
  ['organization', 'ORG'],
  ['agency', 'ORG'],
  ['institution', 'ORG'],
  ['university', 'ORG'],
  ['college', 'ORG'],
  ['school', 'ORG'],
  ['hospital', 'ORG'],
  ['bank', 'ORG'],
  ['startup', 'ORG'],
  ['business', 'ORG'],
  ['enterprise', 'ORG'],
  ['team', 'ORG'],
  ['group', 'ORG'],
  ['party', 'ORG'],
  ['government', 'ORG'],
  ['administration', 'ORG'],
  ['department', 'ORG'],
  ['ministry', 'ORG'],
  ['commission', 'ORG'],
  ['committee', 'ORG'],
  ['board', 'ORG'],
  ['council', 'ORG'],
  ['association', 'ORG'],
  ['foundation', 'ORG'],
  ['charity', 'ORG'],
  ['network', 'ORG'],

  // PLACE roles
  ['city', 'PLACE'],
  ['town', 'PLACE'],
  ['village', 'PLACE'],
  ['country', 'PLACE'],
  ['nation', 'PLACE'],
  ['state', 'PLACE'],
  ['province', 'PLACE'],
  ['region', 'PLACE'],
  ['district', 'PLACE'],
  ['county', 'PLACE'],
  ['capital', 'PLACE'],
  ['island', 'PLACE'],
  ['continent', 'PLACE'],
  ['location', 'PLACE'],
  ['place', 'PLACE'],
  ['area', 'PLACE'],
  ['territory', 'PLACE'],
  ['kingdom', 'PLACE'],
  ['empire', 'PLACE'],
  ['realm', 'PLACE'],
]);

// =============================================================================
// TITLE PREFIXES FOR TITLE-APPOSITIVE BRIDGING
// =============================================================================

/**
 * Maps title prefixes to their normalized role nouns.
 * Used for detecting "President Biden" and bridging to "the president".
 */
const TITLE_PREFIXES: Map<string, string> = new Map([
  // Political titles
  ['president', 'president'],
  ['vice president', 'vice president'],
  ['senator', 'senator'],
  ['sen.', 'senator'],
  ['representative', 'representative'],
  ['rep.', 'representative'],
  ['congressman', 'congressman'],
  ['congresswoman', 'congresswoman'],
  ['governor', 'governor'],
  ['gov.', 'governor'],
  ['mayor', 'mayor'],
  ['ambassador', 'ambassador'],
  ['minister', 'minister'],
  ['prime minister', 'prime minister'],
  ['secretary', 'secretary'],
  ['chancellor', 'chancellor'],

  // Business titles
  ['ceo', 'ceo'],
  ['cfo', 'cfo'],
  ['cto', 'cto'],
  ['coo', 'coo'],
  ['chairman', 'chairman'],
  ['chairwoman', 'chairwoman'],
  ['director', 'director'],
  ['manager', 'manager'],
  ['founder', 'founder'],
  ['co-founder', 'founder'],

  // Academic/Professional titles
  ['professor', 'professor'],
  ['prof.', 'professor'],
  ['doctor', 'doctor'],
  ['dr.', 'doctor'],
  ['judge', 'judge'],
  ['attorney', 'attorney'],
  ['general', 'general'],
  ['gen.', 'general'],
  ['colonel', 'colonel'],
  ['col.', 'colonel'],
  ['captain', 'captain'],
  ['capt.', 'captain'],
  ['lieutenant', 'lieutenant'],
  ['lt.', 'lieutenant'],
  ['admiral', 'admiral'],
  ['adm.', 'admiral'],
  ['chief', 'chief'],
  ['coach', 'coach'],
  ['detective', 'detective'],
  ['officer', 'officer'],

  // Religious titles
  ['pope', 'pope'],
  ['cardinal', 'cardinal'],
  ['bishop', 'bishop'],
  ['pastor', 'pastor'],
  ['reverend', 'reverend'],
  ['rev.', 'reverend'],
  ['father', 'father'],
  ['fr.', 'father'],
  ['sister', 'sister'],
  ['rabbi', 'rabbi'],
  ['imam', 'imam'],

  // Nobility/Royalty titles
  ['king', 'king'],
  ['queen', 'queen'],
  ['prince', 'prince'],
  ['princess', 'princess'],
  ['duke', 'duke'],
  ['duchess', 'duchess'],
  ['lord', 'lord'],
  ['lady', 'lady'],
  ['sir', 'knight'],
  ['dame', 'dame'],
  ['count', 'count'],
  ['countess', 'countess'],
  ['baron', 'baron'],
  ['baroness', 'baroness'],
]);

// =============================================================================
// NICKNAME DICTIONARY FOR ALIAS RESOLUTION
// =============================================================================

/**
 * Maps common nicknames to their formal names.
 * Used for resolving "Jim" to "James", "Bill" to "William", etc.
 * Format: nickname → [formal names] (some nicknames can map to multiple formals)
 */
const NICKNAME_TO_FORMAL: Map<string, string[]> = new Map([
  // Male nicknames
  ['jim', ['james']],
  ['jimmy', ['james']],
  ['jamie', ['james']],
  ['bill', ['william']],
  ['billy', ['william']],
  ['will', ['william']],
  ['willie', ['william']],
  ['liam', ['william']],
  ['bob', ['robert']],
  ['bobby', ['robert']],
  ['rob', ['robert']],
  ['robby', ['robert']],
  ['mike', ['michael']],
  ['mikey', ['michael']],
  ['mick', ['michael']],
  ['mickey', ['michael']],
  ['dave', ['david']],
  ['davey', ['david']],
  ['dan', ['daniel']],
  ['danny', ['daniel']],
  ['joe', ['joseph']],
  ['joey', ['joseph']],
  ['jack', ['john', 'jackson']],
  ['johnny', ['john', 'jonathan']],
  ['jon', ['jonathan', 'john']],
  ['tom', ['thomas']],
  ['tommy', ['thomas']],
  ['chris', ['christopher', 'christian']],
  ['topher', ['christopher']],
  ['matt', ['matthew']],
  ['matty', ['matthew']],
  ['nick', ['nicholas']],
  ['nicky', ['nicholas']],
  ['dick', ['richard']],
  ['rick', ['richard', 'frederick', 'eric']],
  ['ricky', ['richard']],
  ['rich', ['richard']],
  ['richie', ['richard']],
  ['tony', ['anthony']],
  ['andy', ['andrew', 'anderson']],
  ['drew', ['andrew']],
  ['ed', ['edward', 'edgar', 'edmund', 'edwin']],
  ['eddie', ['edward', 'edgar']],
  ['ted', ['theodore', 'edward']],
  ['teddy', ['theodore', 'edward']],
  ['theo', ['theodore']],
  ['al', ['alan', 'albert', 'alexander', 'alfred']],
  ['alex', ['alexander', 'alexandra', 'alexis']],
  ['xander', ['alexander']],
  ['lex', ['alexander', 'alexis']],
  ['ben', ['benjamin']],
  ['benny', ['benjamin']],
  ['chuck', ['charles']],
  ['charlie', ['charles', 'charlotte']],
  ['chas', ['charles']],
  ['hank', ['henry']],
  ['harry', ['henry', 'harrison', 'harold']],
  ['hal', ['henry', 'harold']],
  ['gene', ['eugene']],
  ['gus', ['august', 'augustine', 'angus', 'gustav']],
  ['pete', ['peter']],
  ['sam', ['samuel', 'samantha']],
  ['sammy', ['samuel', 'samantha']],
  ['steve', ['steven', 'stephen']],
  ['stevie', ['steven', 'stephen']],
  ['frank', ['francis', 'franklin']],
  ['frankie', ['francis', 'franklin']],
  ['fran', ['francis', 'frances', 'francesca']],
  ['greg', ['gregory']],
  ['jeff', ['jeffrey', 'geoffrey']],
  ['geoff', ['geoffrey', 'jeffrey']],
  ['jerry', ['gerald', 'jeremy', 'jerome']],
  ['larry', ['lawrence', 'laurence']],
  ['len', ['leonard']],
  ['lenny', ['leonard']],
  ['leo', ['leonard', 'leon', 'leopold']],
  ['max', ['maxwell', 'maximilian']],
  ['nate', ['nathan', 'nathaniel']],
  ['nat', ['nathan', 'nathaniel', 'natalie']],
  ['pat', ['patrick', 'patricia']],
  ['paddy', ['patrick']],
  ['phil', ['philip', 'phillip']],
  ['ray', ['raymond']],
  ['ron', ['ronald']],
  ['ronnie', ['ronald', 'veronica']],
  ['stu', ['stuart', 'stewart']],
  ['tim', ['timothy']],
  ['timmy', ['timothy']],
  ['vince', ['vincent']],
  ['vinny', ['vincent']],
  ['wally', ['walter', 'wallace']],
  ['walt', ['walter']],
  ['zach', ['zachary', 'zachariah']],
  ['zack', ['zachary', 'zachariah']],

  // Female nicknames
  ['kate', ['katherine', 'catherine', 'kathryn']],
  ['katie', ['katherine', 'catherine', 'kathryn']],
  ['kathy', ['katherine', 'catherine', 'kathryn']],
  ['cathy', ['catherine', 'katherine']],
  ['beth', ['elizabeth', 'bethany']],
  ['betty', ['elizabeth']],
  ['liz', ['elizabeth']],
  ['lizzy', ['elizabeth']],
  ['eliza', ['elizabeth']],
  ['libby', ['elizabeth']],
  ['sue', ['susan', 'suzanne']],
  ['suzy', ['susan', 'suzanne']],
  ['susie', ['susan', 'suzanne']],
  ['meg', ['margaret', 'megan']],
  ['maggie', ['margaret']],
  ['peggy', ['margaret']],
  ['madge', ['margaret']],
  ['peg', ['margaret']],
  ['jen', ['jennifer', 'jenny']],
  ['jenny', ['jennifer']],
  ['jenn', ['jennifer']],
  ['abby', ['abigail']],
  ['debbie', ['deborah', 'debra']],
  ['deb', ['deborah', 'debra']],
  ['becky', ['rebecca']],
  ['becca', ['rebecca']],
  ['vicky', ['victoria']],
  ['vickie', ['victoria']],
  ['vic', ['victoria', 'victor']],
  ['pam', ['pamela']],
  ['barb', ['barbara']],
  ['barbie', ['barbara']],
  ['nancy', ['ann', 'anne']],
  ['annie', ['ann', 'anne', 'anna']],
  ['mary', ['marian', 'marie', 'maria']],
  ['sally', ['sarah', 'sara']],
  ['sadie', ['sarah', 'sara']],
  ['sandy', ['sandra', 'alexandra', 'alexander']],
  ['mandy', ['amanda']],
  ['candy', ['candace', 'candice']],
  ['chris', ['christine', 'christina', 'christopher']],
  ['tina', ['christina', 'christine', 'valentina', 'martina']],
  ['nina', ['antonina']],
  ['nicky', ['nicole', 'nicola', 'nicholas']],
  ['vero', ['veronica']],
  ['nell', ['eleanor', 'helen', 'ellen']],
  ['nelly', ['eleanor', 'helen', 'ellen']],
  ['ellie', ['eleanor', 'ellen', 'elizabeth']],
  ['ella', ['eleanor', 'gabriella', 'isabella']],
  ['bella', ['isabella', 'arabella', 'annabella']],
  ['izzy', ['isabel', 'isabella', 'isadora']],
  ['gabby', ['gabriella', 'gabrielle']],
  ['gabi', ['gabriella', 'gabrielle']],
  ['maddy', ['madison', 'madeline', 'madeleine']],
  ['madi', ['madison']],
  ['jess', ['jessica', 'jessie']],
  ['jessie', ['jessica', 'jesse']],
  ['jo', ['josephine', 'joanna', 'jolene']],
  ['josie', ['josephine']],
  ['joanie', ['joan', 'joanna']],
  ['val', ['valerie', 'valentine']],
  ['gwen', ['gwendolyn', 'gwyneth']],
  ['wendy', ['gwendolyn']],
  ['trish', ['patricia', 'tricia']],
  ['tricia', ['patricia']],
  ['patty', ['patricia', 'patience']],

  // Gender-neutral / unisex
  ['alex', ['alexander', 'alexandra', 'alexis']],
  ['sam', ['samuel', 'samantha']],
  ['chris', ['christopher', 'christine', 'christina', 'christian']],
  ['pat', ['patrick', 'patricia']],
  ['jo', ['joseph', 'josephine', 'joanna']],
  ['terry', ['terence', 'teresa', 'theresa']],
  ['lee', ['lee', 'leah', 'leigh']],
  ['robin', ['robert', 'robin']],
  ['jackie', ['jack', 'jacqueline']],
  ['freddie', ['frederick', 'fredericka', 'winifred']],
  ['gerry', ['gerald', 'geraldine']],
  ['nicky', ['nicholas', 'nicole']],
]);

/**
 * Reverse mapping: formal name → [nicknames]
 * Built from NICKNAME_TO_FORMAL
 */
const FORMAL_TO_NICKNAMES: Map<string, string[]> = new Map();

// Build the reverse mapping
for (const [nickname, formals] of Array.from(NICKNAME_TO_FORMAL.entries())) {
  for (const formal of formals) {
    const existing = FORMAL_TO_NICKNAMES.get(formal) || [];
    if (!existing.includes(nickname)) {
      existing.push(nickname);
    }
    FORMAL_TO_NICKNAMES.set(formal, existing);
  }
}

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

  // Title-to-entity bridging (e.g., "President Biden" → entity for later "the president" resolution)
  private titleToEntity: Map<string, { entityId: string; position: number }> = new Map();

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
    this.titleToEntity.clear();
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
    let resolved: ResolvedEntity | null = null;
    switch (context) {
      case 'SENTENCE_START':
        resolved = this.resolveSentenceStartPronoun(pronoun, position, info, allowedTypes);
        break;
      case 'POSSESSIVE':
        resolved = this.resolvePossessivePronoun(pronoun, position, info, allowedTypes);
        break;
      case 'PATTERN_MATCH':
        resolved = this.resolvePatternMatchPronoun(pronoun, position, info, allowedTypes);
        break;
      case 'SENTENCE_MID':
      default:
        resolved = this.resolveMidSentencePronoun(pronoun, position, info, allowedTypes);
        break;
    }

    // Role reinforcement: if we resolved a pronoun to an entity that has titles,
    // update those title associations with the current position
    if (resolved) {
      this.reinforceTitleAssociations(resolved.id, position);
    }

    return resolved;
  }

  /**
   * Reinforce title associations for an entity at a new position.
   * Called after successful pronoun resolution to maintain title → entity bridging.
   *
   * Example: "Senator Warren spoke. She said..."
   * When "She" resolves to Warren at position X, we update the "senator" → Warren
   * association to position X, so later "the senator" still resolves correctly.
   */
  private reinforceTitleAssociations(entityId: string, position: number): void {
    // Find all titles currently associated with this entity
    for (const [title, association] of Array.from(this.titleToEntity.entries())) {
      if (association.entityId === entityId) {
        // Update the position to reinforce the association
        this.titleToEntity.set(title, { entityId, position });

        if (this.debug) {
          const entity = this.entitiesById.get(entityId);
          console.log(`[ReferenceResolver] Reinforced title: "${title}" → ${entity?.canonical} at position ${position}`);
        }
      }
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
  // DEFINITE DESCRIPTION RESOLUTION
  // =============================================================================

  /**
   * Check if a phrase is a definite description (the + role noun)
   * Returns the role noun if found, null otherwise
   */
  isDefiniteDescription(phrase: string): string | null {
    const lower = phrase.toLowerCase().trim();

    // Must start with "the "
    if (!lower.startsWith('the ')) return null;

    const rest = lower.slice(4).trim();

    // Check against role noun whitelist
    if (ROLE_NOUNS.has(rest)) return rest;

    // Check for multi-word role nouns
    for (const roleNoun of Array.from(ROLE_NOUNS.keys())) {
      if (rest === roleNoun || rest.startsWith(roleNoun + ' ')) {
        return roleNoun;
      }
    }

    return null;
  }

  /**
   * Get the expected entity type for a role noun
   */
  getRoleNounType(roleNoun: string): EntityType | null {
    return ROLE_NOUNS.get(roleNoun.toLowerCase()) ?? null;
  }

  // =============================================================================
  // TITLE-APPOSITIVE BRIDGING
  // =============================================================================

  /**
   * Detect if a phrase starts with a title prefix.
   * Returns the normalized title if found, null otherwise.
   *
   * Examples:
   * - "President Biden" → "president"
   * - "Sen. Warren" → "senator"
   * - "Dr. Smith" → "doctor"
   * - "CEO Musk" → "ceo"
   */
  detectTitlePrefix(phrase: string): string | null {
    const lower = phrase.toLowerCase().trim();

    // Check each title prefix
    for (const [prefix, normalizedTitle] of Array.from(TITLE_PREFIXES.entries())) {
      // Match "Title Name" pattern (title followed by space)
      if (lower.startsWith(prefix + ' ')) {
        return normalizedTitle;
      }
    }

    return null;
  }

  /**
   * Register a title-entity association.
   * Called when we encounter "President Biden" to register that
   * "the president" should resolve to Biden.
   *
   * @param title The title (e.g., "president", "senator")
   * @param entityId The entity ID to associate
   * @param position The position where this association was made
   */
  registerTitleAssociation(title: string, entityId: string, position: number): void {
    const normalizedTitle = title.toLowerCase();

    // Check if this title already has an association
    const existing = this.titleToEntity.get(normalizedTitle);

    // Only update if new position is after existing (recency wins)
    if (!existing || position > existing.position) {
      this.titleToEntity.set(normalizedTitle, { entityId, position });

      if (this.debug) {
        const entity = this.entitiesById.get(entityId);
        console.log(`[ReferenceResolver] Registered title: "${normalizedTitle}" → ${entity?.canonical || entityId}`);
      }
    }
  }

  /**
   * Process an entity span to detect and register title associations.
   * Call this when processing entities to build the title-entity map.
   *
   * @param entityId The entity ID
   * @param spanText The text of the entity span (e.g., "President Biden")
   * @param position The position in the text
   */
  processEntityForTitleBridging(entityId: string, spanText: string, position: number): void {
    const title = this.detectTitlePrefix(spanText);
    if (title) {
      this.registerTitleAssociation(title, entityId, position);
    }
  }

  /**
   * Build title associations from entity spans.
   * Call this after initialization to scan for title-prefixed entities.
   */
  buildTitleAssociations(): void {
    for (const span of this.entitySpans) {
      // Get the text for this span
      const spanText = span.text || this.text.slice(span.start, span.end);
      this.processEntityForTitleBridging(span.entity_id, spanText, span.start);
    }

    if (this.debug && this.titleToEntity.size > 0) {
      console.log(`[ReferenceResolver] Built ${this.titleToEntity.size} title associations`);
    }
  }

  /**
   * Resolve a title-based definite description using bridging.
   * Checks if we have a registered title → entity association.
   *
   * @param roleNoun The role noun from the definite description (e.g., "president")
   * @param position The position where the description appears
   * @returns Resolved entity or null
   */
  resolveViaTitle(roleNoun: string, position: number): ResolvedEntity | null {
    const association = this.titleToEntity.get(roleNoun.toLowerCase());
    if (!association) return null;

    // Only resolve if the title was registered BEFORE this position
    if (association.position >= position) return null;

    const entity = this.entitiesById.get(association.entityId);
    if (!entity) return null;

    if (this.debug) {
      console.log(`[ReferenceResolver] Title bridging: "the ${roleNoun}" → ${entity.canonical}`);
    }

    return {
      id: entity.id,
      canonical: entity.canonical,
      type: entity.type,
      confidence: 0.90, // High confidence for explicit title bridging
      method: 'title',
    };
  }

  // =============================================================================
  // NICKNAME & ALIAS RESOLUTION
  // =============================================================================

  /**
   * Get possible formal names for a nickname.
   * Example: "Jim" → ["James"]
   */
  getFormalNames(nickname: string): string[] {
    return NICKNAME_TO_FORMAL.get(nickname.toLowerCase()) || [];
  }

  /**
   * Get possible nicknames for a formal name.
   * Example: "James" → ["jim", "jimmy", "jamie"]
   */
  getNicknames(formalName: string): string[] {
    return FORMAL_TO_NICKNAMES.get(formalName.toLowerCase()) || [];
  }

  /**
   * Check if two first names could refer to the same person based on nickname matching.
   * Returns true if the names are the same, or one is a nickname of the other.
   *
   * Examples:
   * - "James" and "Jim" → true (Jim is nickname of James)
   * - "Jim" and "Jimmy" → true (both nicknames of James)
   * - "James" and "John" → false (unrelated)
   */
  areNamesEquivalent(name1: string, name2: string): boolean {
    const n1 = name1.toLowerCase();
    const n2 = name2.toLowerCase();

    // Exact match
    if (n1 === n2) return true;

    // Check if n1 is a nickname of n2's formal form
    const n1Formals = this.getFormalNames(n1);
    if (n1Formals.includes(n2)) return true;

    // Check if n2 is a nickname of n1's formal form
    const n2Formals = this.getFormalNames(n2);
    if (n2Formals.includes(n1)) return true;

    // Check if both are nicknames of the same formal name
    for (const formal1 of n1Formals) {
      for (const formal2 of n2Formals) {
        if (formal1 === formal2) return true;
      }
    }

    // Check if n1 is a formal name and n2 is one of its nicknames
    const n1Nicknames = this.getNicknames(n1);
    if (n1Nicknames.includes(n2)) return true;

    // Check if n2 is a formal name and n1 is one of its nicknames
    const n2Nicknames = this.getNicknames(n2);
    if (n2Nicknames.includes(n1)) return true;

    return false;
  }

  /**
   * Check if two full names could refer to the same person.
   * Compares first names using nickname matching, and last names using exact match.
   *
   * Examples:
   * - "James Smith" and "Jim Smith" → true
   * - "James Smith" and "James Jones" → false (different last name)
   * - "James Smith" and "John Smith" → false (different first name)
   */
  areFullNamesEquivalent(fullName1: string, fullName2: string): boolean {
    const parts1 = fullName1.trim().split(/\s+/);
    const parts2 = fullName2.trim().split(/\s+/);

    // Must have at least first and last name
    if (parts1.length < 2 || parts2.length < 2) {
      // Single name - just check if they're equivalent
      return this.areNamesEquivalent(parts1[0], parts2[0]);
    }

    // Compare last names (must match exactly)
    const lastName1 = parts1[parts1.length - 1].toLowerCase();
    const lastName2 = parts2[parts2.length - 1].toLowerCase();
    if (lastName1 !== lastName2) return false;

    // Compare first names (allow nickname equivalence)
    const firstName1 = parts1[0];
    const firstName2 = parts2[0];
    return this.areNamesEquivalent(firstName1, firstName2);
  }

  /**
   * Find an entity that could match a name based on nickname resolution.
   * Returns the matching entity or null if no match is found.
   *
   * Example: If entities contains "James Smith" and we search for "Jim Smith",
   * this will return the "James Smith" entity.
   */
  findEntityByNameWithNickname(name: string): Entity | null {
    for (const entity of this.entities) {
      if (entity.type !== 'PERSON') continue;

      // Check canonical name
      if (this.areFullNamesEquivalent(entity.canonical, name)) {
        return entity;
      }

      // Check aliases
      if (entity.aliases) {
        for (const alias of entity.aliases) {
          if (this.areFullNamesEquivalent(alias, name)) {
            return entity;
          }
        }
      }
    }

    return null;
  }

  /**
   * Generate possible alias variants for a name using nicknames.
   * Returns an array of name variants.
   *
   * Example: "James Smith" → ["Jim Smith", "Jimmy Smith", "Jamie Smith"]
   */
  generateNicknameVariants(fullName: string): string[] {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length < 2) return [];

    const firstName = parts[0];
    const restOfName = parts.slice(1).join(' ');

    const variants: string[] = [];

    // Get nicknames for the first name
    const nicknames = this.getNicknames(firstName.toLowerCase());
    for (const nickname of nicknames) {
      // Capitalize the nickname
      const capitalizedNickname = nickname.charAt(0).toUpperCase() + nickname.slice(1);
      variants.push(`${capitalizedNickname} ${restOfName}`);
    }

    // Also get formal names if the first name is a nickname
    const formals = this.getFormalNames(firstName.toLowerCase());
    for (const formal of formals) {
      // Capitalize the formal name
      const capitalizedFormal = formal.charAt(0).toUpperCase() + formal.slice(1);
      if (capitalizedFormal.toLowerCase() !== firstName.toLowerCase()) {
        variants.push(`${capitalizedFormal} ${restOfName}`);
      }
    }

    return variants;
  }

  /**
   * Resolve a definite description to an entity
   *
   * Pattern: "the + role noun" → resolve to most salient entity of compatible type
   *
   * Constraints:
   * - Same entity type (PERSON, ORG, PLACE)
   * - Highest salience score (most recent in discourse)
   * - Appears within last N sentences
   * - If multiple candidates exist with same salience → return UNRESOLVED (do not guess)
   *
   * @param phrase The definite description (e.g., "the senator", "the company")
   * @param position The position in text where the description appears
   * @param maxSentenceDistance Maximum number of sentences to look back (default: 5)
   * @returns Resolved entity or null if unresolvable
   */
  resolveDefiniteDescription(
    phrase: string,
    position: number,
    maxSentenceDistance: number = 5
  ): ResolvedEntity | null {
    const roleNoun = this.isDefiniteDescription(phrase);
    if (!roleNoun) return null;

    // First, try title bridging (e.g., "President Biden" → "the president")
    const titleResolution = this.resolveViaTitle(roleNoun, position);
    if (titleResolution) return titleResolution;

    const expectedType = this.getRoleNounType(roleNoun);
    if (!expectedType) return null;

    // Get current sentence index
    const currentSentenceIndex = this.getSentenceIndex(position);
    if (currentSentenceIndex < 0) return null;

    // Calculate the earliest sentence to consider
    const earliestSentenceIndex = Math.max(0, currentSentenceIndex - maxSentenceDistance);
    const earliestPosition = this.sentences[earliestSentenceIndex]?.start ?? 0;

    // Find candidate entities within the window
    const candidates: Array<{
      entity: Entity;
      span: EntitySpan;
      salience: number;
    }> = [];

    for (const span of this.entitySpans) {
      // Must be before the definite description
      if (span.start >= position) continue;

      // Must be within the sentence window
      if (span.start < earliestPosition) continue;

      const entity = this.entitiesById.get(span.entity_id);
      if (!entity) continue;

      // Type must match
      if (entity.type !== expectedType) continue;

      // Calculate salience based on recency (more recent = higher salience)
      const distance = position - span.end;
      const salience = 1.0 / (1.0 + distance / 100);

      // Check if we already have this entity
      const existingIdx = candidates.findIndex(c => c.entity.id === entity.id);
      if (existingIdx >= 0) {
        // Update if this mention is more recent
        if (salience > candidates[existingIdx].salience) {
          candidates[existingIdx] = { entity, span, salience };
        }
      } else {
        candidates.push({ entity, span, salience });
      }
    }

    if (candidates.length === 0) {
      if (this.debug) {
        console.log(`[ReferenceResolver] resolveDefiniteDescription: no candidates for "${phrase}" (type=${expectedType})`);
      }
      return null;
    }

    // Sort by salience (highest first)
    candidates.sort((a, b) => b.salience - a.salience);

    // If multiple candidates have very similar salience, return UNRESOLVED
    if (candidates.length > 1) {
      const topSalience = candidates[0].salience;
      const secondSalience = candidates[1].salience;

      // If salience difference is < 10%, consider them ambiguous
      if (secondSalience / topSalience > 0.9) {
        if (this.debug) {
          console.log(`[ReferenceResolver] resolveDefiniteDescription: ambiguous candidates for "${phrase}"`);
          console.log(`  Top: ${candidates[0].entity.canonical} (salience=${topSalience.toFixed(3)})`);
          console.log(`  Second: ${candidates[1].entity.canonical} (salience=${secondSalience.toFixed(3)})`);
        }
        return null;
      }
    }

    // Return the most salient candidate
    const winner = candidates[0];

    if (this.debug) {
      console.log(`[ReferenceResolver] resolveDefiniteDescription: "${phrase}" → ${winner.entity.canonical}`);
    }

    return {
      id: winner.entity.id,
      canonical: winner.entity.canonical,
      type: winner.entity.type,
      confidence: Math.min(0.85, 0.6 + winner.salience * 0.3),
      method: 'nominal',
    };
  }

  /**
   * Resolve a generic reference ("the" + role noun or title)
   * This is the main entry point for nominal reference resolution.
   */
  resolveNominalReference(
    phrase: string,
    position: number
  ): ResolvedEntity | null {
    // Try definite description resolution first
    const resolved = this.resolveDefiniteDescription(phrase, position);
    if (resolved) return resolved;

    // Future: Add title resolution (e.g., "President Biden" → the president)
    // Future: Add appositive bridging

    return null;
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
      for (const entries of Array.from(this.pronounResolutionMap.values())) {
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
  resolver.buildTitleAssociations();
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
