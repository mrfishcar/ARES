/**
 * Minimal Supersense Module
 *
 * Task-oriented semantic class lookup for:
 * 1. Entity type hints (person, location, group, artifact)
 * 2. IR event-builder verb routing (motion, communication, etc.)
 *
 * This is a SLIMMED module with only essential classes:
 * - 4 noun classes: person, location, group, artifact
 * - 10 verb classes: motion, communication, perception, cognition, contact,
 *                    change, possession, social, creation, emotion
 *
 * NO external dependencies, NO large lexicons.
 * Deterministic lookup tables only.
 */

import type { Token } from '../../parser/parse-types';
import type { EntityType } from '../schema';

// ============================================================================
// VERB SEMANTIC CLASSES (10 classes for IR event routing)
// ============================================================================

export type VerbClass =
  | 'motion'        // go, walk, run, travel, flee
  | 'communication' // say, tell, ask, speak, shout
  | 'perception'    // see, hear, watch, notice, observe
  | 'cognition'     // think, know, believe, remember, learn
  | 'contact'       // hit, strike, kill, attack, fight
  | 'change'        // become, die, grow, transform, wake
  | 'possession'    // have, take, give, get, steal
  | 'social'        // meet, marry, serve, help, betray
  | 'creation'      // make, create, build, write, destroy
  | 'emotion';      // love, hate, fear, hope, mourn

/**
 * Core verb class lookup table (~200 verbs)
 * Expanded for fiction narrative coverage
 */
const VERB_CLASS_MAP: Record<string, VerbClass> = {
  // -------------------------------------------------------------------------
  // MOTION (40 verbs) - Movement and travel
  // -------------------------------------------------------------------------
  // Core movement
  go: 'motion', come: 'motion', walk: 'motion', run: 'motion', ride: 'motion',
  fly: 'motion', fall: 'motion', climb: 'motion', travel: 'motion', return: 'motion',
  // Escape/pursuit
  flee: 'motion', escape: 'motion', chase: 'motion', pursue: 'motion', hunt: 'motion',
  // Entry/exit
  enter: 'motion', leave: 'motion', exit: 'motion', depart: 'motion', arrive: 'motion',
  // Following/leading
  follow: 'motion', lead: 'motion', guide: 'motion', trail: 'motion',
  // Crossing
  cross: 'motion', pass: 'motion', traverse: 'motion',
  // Direction
  approach: 'motion', retreat: 'motion', advance: 'motion', withdraw: 'motion',
  // Speed variants
  sprint: 'motion', dash: 'motion', hurry: 'motion', rush: 'motion', race: 'motion',
  // Slow/careful
  stroll: 'motion', wander: 'motion', creep: 'motion', crawl: 'motion', sneak: 'motion',
  // Vertical
  jump: 'motion', leap: 'motion', dive: 'motion', descend: 'motion', ascend: 'motion',
  plunge: 'motion', soar: 'motion', drop: 'motion',

  // -------------------------------------------------------------------------
  // COMMUNICATION (35 verbs) - Speech and expression
  // -------------------------------------------------------------------------
  // Core speech
  say: 'communication', tell: 'communication', ask: 'communication', speak: 'communication',
  talk: 'communication', answer: 'communication', reply: 'communication', respond: 'communication',
  // Volume variants
  shout: 'communication', yell: 'communication', scream: 'communication', cry: 'communication',
  whisper: 'communication', murmur: 'communication', mutter: 'communication', mumble: 'communication',
  // Formal speech
  declare: 'communication', announce: 'communication', proclaim: 'communication', state: 'communication',
  // Questions/requests
  inquire: 'communication', query: 'communication', request: 'communication',
  // Emotional speech
  plead: 'communication', beg: 'communication', demand: 'communication', insist: 'communication',
  // Warnings/promises
  warn: 'communication', promise: 'communication', threaten: 'communication', vow: 'communication',
  // Commands
  command: 'communication', order: 'communication', instruct: 'communication',
  // Reactions
  exclaim: 'communication', gasp: 'communication', sigh: 'communication', groan: 'communication',
  retort: 'communication',

  // -------------------------------------------------------------------------
  // PERCEPTION (25 verbs) - Sensing and observing
  // -------------------------------------------------------------------------
  // Sight
  see: 'perception', look: 'perception', watch: 'perception', gaze: 'perception',
  stare: 'perception', glance: 'perception', glimpse: 'perception', peer: 'perception',
  examine: 'perception', inspect: 'perception', scan: 'perception', survey: 'perception',
  // Hearing
  hear: 'perception', listen: 'perception', overhear: 'perception',
  // Other senses
  feel: 'perception', smell: 'perception', taste: 'perception', sense: 'perception',
  // Discovery
  notice: 'perception', observe: 'perception', spot: 'perception', detect: 'perception',
  perceive: 'perception', discern: 'perception', witness: 'perception',

  // -------------------------------------------------------------------------
  // COGNITION (30 verbs) - Thinking and knowing
  // -------------------------------------------------------------------------
  // Core thinking
  think: 'cognition', know: 'cognition', believe: 'cognition', understand: 'cognition',
  comprehend: 'cognition', grasp: 'cognition', ponder: 'cognition', contemplate: 'cognition',
  // Memory
  remember: 'cognition', forget: 'cognition', recall: 'cognition', recognize: 'cognition',
  recollect: 'cognition',
  // Imagination
  imagine: 'cognition', dream: 'cognition', envision: 'cognition', fantasize: 'cognition',
  // Uncertainty
  wonder: 'cognition', doubt: 'cognition', suspect: 'cognition', assume: 'cognition',
  guess: 'cognition', speculate: 'cognition',
  // Decision
  decide: 'cognition', choose: 'cognition', consider: 'cognition', conclude: 'cognition',
  determine: 'cognition', resolve: 'cognition',
  // Learning/discovery
  learn: 'cognition', discover: 'cognition', realize: 'cognition', figure: 'cognition',
  deduce: 'cognition', infer: 'cognition',

  // -------------------------------------------------------------------------
  // CONTACT (30 verbs) - Physical interaction
  // -------------------------------------------------------------------------
  // Violence
  hit: 'contact', strike: 'contact', kill: 'contact', fight: 'contact', attack: 'contact',
  beat: 'contact', punch: 'contact', kick: 'contact', slap: 'contact',
  // Defense
  defend: 'contact', block: 'contact', parry: 'contact', shield: 'contact',
  // Weapons
  stab: 'contact', slash: 'contact', cut: 'contact', pierce: 'contact',
  shoot: 'contact', slay: 'contact', murder: 'contact',
  // Physical force
  push: 'contact', pull: 'contact', throw: 'contact', catch: 'contact',
  grab: 'contact', seize: 'contact', grip: 'contact', clutch: 'contact',
  // Impact
  slam: 'contact', crash: 'contact', smash: 'contact', crush: 'contact',
  shatter: 'contact', break: 'contact', wound: 'contact',
  // Touch
  touch: 'contact', hold: 'contact', embrace: 'contact', hug: 'contact',

  // -------------------------------------------------------------------------
  // CHANGE (20 verbs) - State transformation
  // -------------------------------------------------------------------------
  // State change
  become: 'change', turn: 'change', grow: 'change', shrink: 'change',
  expand: 'change', contract: 'change',
  // Life/death
  die: 'change', perish: 'change', survive: 'change', revive: 'change',
  // Consciousness
  wake: 'change', awaken: 'change', sleep: 'change', faint: 'change',
  // Physical
  heal: 'change', recover: 'change', mend: 'change', repair: 'change',
  // Transformation
  transform: 'change', convert: 'change', evolve: 'change', mutate: 'change',
  // Rising/falling
  rise: 'change', fade: 'change', wither: 'change', decay: 'change',

  // -------------------------------------------------------------------------
  // POSSESSION (20 verbs) - Ownership and transfer
  // -------------------------------------------------------------------------
  // Having
  have: 'possession', own: 'possession', possess: 'possession',
  // Acquiring
  take: 'possession', get: 'possession', receive: 'possession', obtain: 'possession',
  acquire: 'possession', gain: 'possession', earn: 'possession',
  // Giving
  give: 'possession', hand: 'possession', offer: 'possession', present: 'possession',
  donate: 'possession', grant: 'possession',
  // Keeping
  keep: 'possession', retain: 'possession', // 'hold' already in contact
  // Losing
  lose: 'possession', abandon: 'possession', surrender: 'possession', forfeit: 'possession',
  // Transfer
  steal: 'possession', rob: 'possession', borrow: 'possession', lend: 'possession',
  bring: 'possession', carry: 'possession', deliver: 'possession',

  // -------------------------------------------------------------------------
  // SOCIAL (25 verbs) - Interpersonal interactions
  // -------------------------------------------------------------------------
  // Meeting
  meet: 'social', encounter: 'social', greet: 'social', welcome: 'social',
  // Relationships
  marry: 'social', wed: 'social', divorce: 'social', befriend: 'social',
  // Service
  serve: 'social', help: 'social', assist: 'social', aid: 'social', support: 'social',
  // Authority
  rule: 'social', govern: 'social', reign: 'social', // 'lead' already in motion
  obey: 'social', submit: 'social', comply: 'social',
  // Groups
  join: 'social', unite: 'social', gather: 'social', assemble: 'social',
  divide: 'social', separate: 'social',
  // Conflict
  betray: 'social', deceive: 'social', trick: 'social', // 'abandon' already in possession
  reject: 'social', dismiss: 'social', banish: 'social', exile: 'social',
  // Trust
  trust: 'social', rely: 'social', depend: 'social',

  // -------------------------------------------------------------------------
  // CREATION (15 verbs) - Making and destroying
  // -------------------------------------------------------------------------
  // Making
  make: 'creation', create: 'creation', build: 'creation', construct: 'creation',
  erect: 'creation', establish: 'creation',
  // Crafting
  craft: 'creation', forge: 'creation', shape: 'creation', form: 'creation',
  mold: 'creation', sculpt: 'creation',
  // Writing/art
  write: 'creation', compose: 'creation', author: 'creation',
  paint: 'creation', draw: 'creation', design: 'creation',
  // Destruction
  destroy: 'creation', demolish: 'creation', ruin: 'creation',
  burn: 'creation', erase: 'creation', annihilate: 'creation',

  // -------------------------------------------------------------------------
  // EMOTION (20 verbs) - Feeling and expressing emotion
  // -------------------------------------------------------------------------
  // Positive
  love: 'emotion', adore: 'emotion', cherish: 'emotion', treasure: 'emotion',
  like: 'emotion', enjoy: 'emotion', appreciate: 'emotion',
  // Negative
  hate: 'emotion', despise: 'emotion', loathe: 'emotion', detest: 'emotion',
  resent: 'emotion', envy: 'emotion',
  // Fear
  fear: 'emotion', dread: 'emotion', worry: 'emotion', panic: 'emotion',
  // Sadness
  mourn: 'emotion', grieve: 'emotion', lament: 'emotion', weep: 'emotion',
  // Joy
  rejoice: 'emotion', celebrate: 'emotion', delight: 'emotion',
  laugh: 'emotion', smile: 'emotion',
  // Hope
  hope: 'emotion', wish: 'emotion', long: 'emotion', yearn: 'emotion',
  // Anger
  rage: 'emotion', fume: 'emotion',
};

/**
 * Get verb semantic class for IR event routing
 */
export function getVerbClass(lemma: string): VerbClass | null {
  return VERB_CLASS_MAP[lemma.toLowerCase()] ?? null;
}

// ============================================================================
// NOUN SEMANTIC CLASSES (4 classes for entity type hints)
// ============================================================================

export type NounClass = 'person' | 'location' | 'group' | 'artifact';

/**
 * Core noun class lookup table (~150 nouns)
 */
const NOUN_CLASS_MAP: Record<string, NounClass> = {
  // person - Human beings, titles, roles, fantasy races
  person: 'person', man: 'person', woman: 'person', boy: 'person', girl: 'person',
  child: 'person', king: 'person', queen: 'person', prince: 'person', princess: 'person',
  lord: 'person', lady: 'person', knight: 'person', wizard: 'person', witch: 'person',
  warrior: 'person', soldier: 'person', captain: 'person', general: 'person', servant: 'person',
  friend: 'person', enemy: 'person', hero: 'person', villain: 'person',
  father: 'person', mother: 'person', son: 'person', daughter: 'person',
  brother: 'person', sister: 'person', uncle: 'person', aunt: 'person',
  cousin: 'person', nephew: 'person', niece: 'person', grandfather: 'person', grandmother: 'person',
  husband: 'person', wife: 'person', master: 'person', student: 'person', teacher: 'person',
  professor: 'person', doctor: 'person', healer: 'person', thief: 'person', assassin: 'person',
  ranger: 'person', dwarf: 'person', elf: 'person', hobbit: 'person', orc: 'person',
  goblin: 'person', troll: 'person',

  // location - Geographic places, structures
  place: 'location', land: 'location', realm: 'location', country: 'location',
  city: 'location', town: 'location', village: 'location', castle: 'location',
  tower: 'location', fortress: 'location', mountain: 'location', river: 'location',
  forest: 'location', sea: 'location', ocean: 'location', lake: 'location',
  valley: 'location', cave: 'location', dungeon: 'location', palace: 'location',
  hall: 'location', room: 'location', chamber: 'location', gate: 'location',
  bridge: 'location', road: 'location', path: 'location', garden: 'location',
  inn: 'location', tavern: 'location', temple: 'location', shrine: 'location',
  north: 'location', south: 'location', east: 'location', west: 'location',

  // group - Collections of people/things
  group: 'group', army: 'group', council: 'group', company: 'group',
  fellowship: 'group', family: 'group', house: 'group', kingdom: 'group',
  nation: 'group', people: 'group', tribe: 'group', clan: 'group',
  guild: 'group', order: 'group', band: 'group', party: 'group',
  team: 'group', crew: 'group',

  // artifact - Man-made objects
  sword: 'artifact', blade: 'artifact', dagger: 'artifact', bow: 'artifact',
  arrow: 'artifact', axe: 'artifact', spear: 'artifact', shield: 'artifact',
  armor: 'artifact', helm: 'artifact', helmet: 'artifact', ring: 'artifact',
  staff: 'artifact', wand: 'artifact', crown: 'artifact', throne: 'artifact',
  book: 'artifact', scroll: 'artifact', map: 'artifact', key: 'artifact',
  door: 'artifact', chest: 'artifact', treasure: 'artifact', gold: 'artifact',
  silver: 'artifact', gem: 'artifact', jewel: 'artifact', stone: 'artifact',
  crystal: 'artifact', cloak: 'artifact', rope: 'artifact', lamp: 'artifact',
  torch: 'artifact', banner: 'artifact', flag: 'artifact', ship: 'artifact',
  boat: 'artifact', cart: 'artifact',
};

/**
 * Get noun semantic class for entity type hints
 */
export function getNounClass(lemma: string): NounClass | null {
  return NOUN_CLASS_MAP[lemma.toLowerCase()] ?? null;
}

// ============================================================================
// COMPATIBILITY LAYER (for entity-type-validators.ts and tests)
// ============================================================================

// Legacy supersense types for backward compatibility
export type NounSupersense = `n.${NounClass}`;
export type VerbSupersense = `v.${VerbClass}`;
export type Supersense = NounSupersense | VerbSupersense;

/**
 * Get supersense (legacy format: 'n.person', 'v.motion', etc.)
 * Used by tests and for backward compatibility
 */
export function getSupersense(lemma: string, pos: string): Supersense | undefined {
  const normalizedLemma = lemma.toLowerCase();

  if (pos.startsWith('NN') || pos === 'NOUN') {
    const nounClass = getNounClass(normalizedLemma);
    return nounClass ? `n.${nounClass}` : undefined;
  }

  if (pos.startsWith('VB') || pos === 'VERB') {
    const verbClass = getVerbClass(normalizedLemma);
    return verbClass ? `v.${verbClass}` : undefined;
  }

  return undefined;
}

/**
 * Check if a word is a person indicator
 */
export function isPersonIndicator(lemma: string): boolean {
  return getNounClass(lemma) === 'person';
}

/**
 * Check if a word is a location indicator
 */
export function isLocationIndicator(lemma: string): boolean {
  return getNounClass(lemma) === 'location';
}

/**
 * Check if a word is a group indicator
 */
export function isGroupIndicator(lemma: string): boolean {
  return getNounClass(lemma) === 'group';
}

/**
 * Check if a word is an artifact indicator
 */
export function isArtifactIndicator(lemma: string): boolean {
  return getNounClass(lemma) === 'artifact';
}

// ============================================================================
// MINIMAL TAGGER (for tests)
// ============================================================================

export interface SupersenseToken extends Token {
  supersense?: Supersense;
  supersenseConfidence?: number;
}

export function tagWithSupersenses(tokens: Token[]): SupersenseToken[] {
  return tokens.map(token => {
    const supersense = getSupersense(token.lemma, token.pos);
    return {
      ...token,
      supersense,
      supersenseConfidence: supersense ? 0.9 : undefined,
    };
  });
}

export interface SupersenseAnalysis {
  tokens: SupersenseToken[];
  stats: {
    totalTokens: number;
    taggedTokens: number;
    nounTags: number;
    verbTags: number;
    personTags: number;
    locationTags: number;
    groupTags: number;
    artifactTags: number;
    eventTags: number;
    coveragePercent: number;
  };
}

export function analyzeSupersenses(tokens: Token[]): SupersenseAnalysis {
  const taggedTokens = tagWithSupersenses(tokens);

  let nounTags = 0, verbTags = 0;
  let personTags = 0, locationTags = 0, groupTags = 0, artifactTags = 0;
  let totalTagged = 0;

  for (const token of taggedTokens) {
    if (token.supersense) {
      totalTagged++;
      if (token.supersense.startsWith('n.')) {
        nounTags++;
        if (token.supersense === 'n.person') personTags++;
        if (token.supersense === 'n.location') locationTags++;
        if (token.supersense === 'n.group') groupTags++;
        if (token.supersense === 'n.artifact') artifactTags++;
      } else if (token.supersense.startsWith('v.')) {
        verbTags++;
      }
    }
  }

  return {
    tokens: taggedTokens,
    stats: {
      totalTokens: tokens.length,
      taggedTokens: totalTagged,
      nounTags, verbTags,
      personTags, locationTags, groupTags, artifactTags,
      eventTags: 0, // Not tracked in slim version
      coveragePercent: tokens.length > 0 ? (totalTagged / tokens.length) * 100 : 0,
    },
  };
}

// ============================================================================
// ENTITY TYPE SUGGESTION (for tests)
// ============================================================================

const NOUN_CLASS_TO_ENTITY_TYPE: Record<NounClass, EntityType> = {
  person: 'PERSON',
  group: 'ORG',
  location: 'PLACE',
  artifact: 'ITEM',
};

export function suggestEntityType(tokens: Token[]): {
  suggestedType?: EntityType;
  confidence: number;
  supersense?: Supersense;
} {
  const nouns = tokens.filter(t => t.pos.startsWith('NN') || t.pos === 'NOUN');
  if (nouns.length === 0) return { confidence: 0 };

  const headNoun = nouns[nouns.length - 1];
  const nounClass = getNounClass(headNoun.lemma);

  if (!nounClass) return { confidence: 0.3 };

  return {
    suggestedType: NOUN_CLASS_TO_ENTITY_TYPE[nounClass],
    confidence: 0.85,
    supersense: `n.${nounClass}`,
  };
}

// ============================================================================
// LEXICON UTILITIES (for tests - minimal implementation)
// ============================================================================

export function getPersonLemmas(): string[] {
  return Object.entries(NOUN_CLASS_MAP)
    .filter(([, cls]) => cls === 'person')
    .map(([lemma]) => lemma);
}

export function getLocationLemmas(): string[] {
  return Object.entries(NOUN_CLASS_MAP)
    .filter(([, cls]) => cls === 'location')
    .map(([lemma]) => lemma);
}

export function addSupersenseEntry(lemma: string, supersense: Supersense): void {
  // No-op in slim version - lexicon is fixed
  // This function exists for test compatibility only
}

export function extractSupersenseFeatures(
  spanTokens: Token[],
  contextTokens: Token[]
): {
  headSupersense?: Supersense;
  modifierSupersenses: Supersense[];
  contextSupersenses: Supersense[];
  personScore: number;
  locationScore: number;
  groupScore: number;
  artifactScore: number;
} {
  const taggedSpan = tagWithSupersenses(spanTokens);
  const nouns = taggedSpan.filter(t => t.pos.startsWith('NN') && t.supersense);
  const headSupersense = nouns.length > 0 ? nouns[nouns.length - 1].supersense : undefined;

  // Simplified feature extraction
  let personScore = headSupersense === 'n.person' ? 1 : 0;
  let locationScore = headSupersense === 'n.location' ? 1 : 0;
  let groupScore = headSupersense === 'n.group' ? 1 : 0;
  let artifactScore = headSupersense === 'n.artifact' ? 1 : 0;

  return {
    headSupersense,
    modifierSupersenses: [],
    contextSupersenses: [],
    personScore,
    locationScore,
    groupScore,
    artifactScore,
  };
}
