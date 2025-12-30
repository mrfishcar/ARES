/**
 * Supersense Tagging System
 *
 * Implements WordNet-style coarse semantic categories for improved entity typing.
 * BookNLP uses supersense tags to enhance character/entity classification.
 *
 * Supersense Categories (26 noun + 15 verb):
 * - Nouns: person, location, group, artifact, substance, etc.
 * - Verbs: motion, communication, cognition, perception, etc.
 *
 * @see docs/BOOKNLP_COMPARISON.md - Critical gap implementation
 */

import type { Token } from '../../parser/parse-types';
import type { EntityType } from '../schema';

// ============================================================================
// SUPERSENSE CATEGORIES
// ============================================================================

/**
 * WordNet Noun Supersenses (26 categories)
 * Used for entity type refinement
 */
export type NounSupersense =
  | 'n.person'      // Human being
  | 'n.group'       // Collection of people/things
  | 'n.location'    // Geographic location
  | 'n.artifact'    // Man-made object
  | 'n.substance'   // Material/chemical
  | 'n.plant'       // Plant life
  | 'n.animal'      // Animal life
  | 'n.body'        // Body parts
  | 'n.cognition'   // Mental concepts
  | 'n.communication' // Communication acts/objects
  | 'n.event'       // Events/happenings
  | 'n.feeling'     // Emotions
  | 'n.food'        // Food/drink
  | 'n.motive'      // Motives/goals
  | 'n.object'      // Physical objects
  | 'n.phenomenon'  // Natural phenomena
  | 'n.possession'  // Possessions/ownership concepts
  | 'n.process'     // Ongoing processes
  | 'n.quantity'    // Quantities/measures
  | 'n.relation'    // Relations between entities
  | 'n.shape'       // Shapes
  | 'n.state'       // States of being
  | 'n.time'        // Temporal concepts
  | 'n.act'         // Acts/actions
  | 'n.attribute'   // Attributes/qualities
  | 'n.tops';       // Generic concepts

/**
 * WordNet Verb Supersenses (15 categories)
 * Used for event/relation extraction
 */
export type VerbSupersense =
  | 'v.body'        // Bodily functions
  | 'v.change'      // Change of state
  | 'v.cognition'   // Mental activities
  | 'v.communication' // Communication acts
  | 'v.competition' // Competition
  | 'v.consumption' // Consumption
  | 'v.contact'     // Physical contact
  | 'v.creation'    // Creation acts
  | 'v.emotion'     // Emotional expressions
  | 'v.motion'      // Movement
  | 'v.perception'  // Sensory perception
  | 'v.possession'  // Possession acts
  | 'v.social'      // Social interactions
  | 'v.stative'     // States
  | 'v.weather';    // Weather phenomena

export type Supersense = NounSupersense | VerbSupersense;

// ============================================================================
// SUPERSENSE LEXICON
// ============================================================================

/**
 * Core lexicon mapping lemmas to supersenses
 * This is a curated subset covering common fiction/narrative terms
 */
const NOUN_SUPERSENSE_LEXICON: Record<string, NounSupersense> = {
  // n.person - Human beings and titles
  person: 'n.person',
  man: 'n.person',
  woman: 'n.person',
  boy: 'n.person',
  girl: 'n.person',
  child: 'n.person',
  king: 'n.person',
  queen: 'n.person',
  prince: 'n.person',
  princess: 'n.person',
  lord: 'n.person',
  lady: 'n.person',
  knight: 'n.person',
  wizard: 'n.person',
  witch: 'n.person',
  warrior: 'n.person',
  soldier: 'n.person',
  captain: 'n.person',
  general: 'n.person',
  servant: 'n.person',
  friend: 'n.person',
  enemy: 'n.person',
  hero: 'n.person',
  villain: 'n.person',
  father: 'n.person',
  mother: 'n.person',
  son: 'n.person',
  daughter: 'n.person',
  brother: 'n.person',
  sister: 'n.person',
  uncle: 'n.person',
  aunt: 'n.person',
  cousin: 'n.person',
  nephew: 'n.person',
  niece: 'n.person',
  grandfather: 'n.person',
  grandmother: 'n.person',
  husband: 'n.person',
  wife: 'n.person',
  master: 'n.person',
  student: 'n.person',
  teacher: 'n.person',
  professor: 'n.person',
  doctor: 'n.person',
  healer: 'n.person',
  thief: 'n.person',
  assassin: 'n.person',
  ranger: 'n.person',
  dwarf: 'n.person',
  elf: 'n.person',
  hobbit: 'n.person',
  orc: 'n.person',
  goblin: 'n.person',
  troll: 'n.person',

  // n.group - Collections of people
  group: 'n.group',
  army: 'n.group',
  council: 'n.group',
  company: 'n.group',
  fellowship: 'n.group',
  family: 'n.group',
  house: 'n.group',
  kingdom: 'n.group',
  nation: 'n.group',
  people: 'n.group',
  tribe: 'n.group',
  clan: 'n.group',
  guild: 'n.group',
  order: 'n.group',
  band: 'n.group',
  party: 'n.group',
  team: 'n.group',
  crew: 'n.group',

  // n.location - Places
  place: 'n.location',
  land: 'n.location',
  realm: 'n.location',
  country: 'n.location',
  city: 'n.location',
  town: 'n.location',
  village: 'n.location',
  castle: 'n.location',
  tower: 'n.location',
  fortress: 'n.location',
  mountain: 'n.location',
  river: 'n.location',
  forest: 'n.location',
  sea: 'n.location',
  ocean: 'n.location',
  lake: 'n.location',
  valley: 'n.location',
  cave: 'n.location',
  dungeon: 'n.location',
  palace: 'n.location',
  hall: 'n.location',
  room: 'n.location',
  chamber: 'n.location',
  gate: 'n.location',
  bridge: 'n.location',
  road: 'n.location',
  path: 'n.location',
  garden: 'n.location',
  inn: 'n.location',
  tavern: 'n.location',
  temple: 'n.location',
  shrine: 'n.location',
  north: 'n.location',
  south: 'n.location',
  east: 'n.location',
  west: 'n.location',

  // n.artifact - Objects
  sword: 'n.artifact',
  blade: 'n.artifact',
  dagger: 'n.artifact',
  bow: 'n.artifact',
  arrow: 'n.artifact',
  axe: 'n.artifact',
  spear: 'n.artifact',
  shield: 'n.artifact',
  armor: 'n.artifact',
  helm: 'n.artifact',
  helmet: 'n.artifact',
  ring: 'n.artifact',
  staff: 'n.artifact',
  wand: 'n.artifact',
  crown: 'n.artifact',
  throne: 'n.artifact',
  book: 'n.artifact',
  scroll: 'n.artifact',
  map: 'n.artifact',
  key: 'n.artifact',
  door: 'n.artifact',
  chest: 'n.artifact',
  treasure: 'n.artifact',
  gold: 'n.artifact',
  silver: 'n.artifact',
  gem: 'n.artifact',
  jewel: 'n.artifact',
  stone: 'n.artifact',
  crystal: 'n.artifact',
  cloak: 'n.artifact',
  rope: 'n.artifact',
  lamp: 'n.artifact',
  torch: 'n.artifact',
  banner: 'n.artifact',
  flag: 'n.artifact',
  ship: 'n.artifact',
  boat: 'n.artifact',
  horse: 'n.artifact',
  cart: 'n.artifact',

  // n.animal - Animals
  animal: 'n.animal',
  beast: 'n.animal',
  creature: 'n.animal',
  dragon: 'n.animal',
  wolf: 'n.animal',
  bear: 'n.animal',
  eagle: 'n.animal',
  hawk: 'n.animal',
  raven: 'n.animal',
  spider: 'n.animal',
  snake: 'n.animal',
  serpent: 'n.animal',
  warg: 'n.animal',
  bat: 'n.animal',
  bird: 'n.animal',
  fish: 'n.animal',
  hound: 'n.animal',
  steed: 'n.animal',
  pony: 'n.animal',

  // n.event - Events
  battle: 'n.event',
  war: 'n.event',
  fight: 'n.event',
  journey: 'n.event',
  quest: 'n.event',
  adventure: 'n.event',
  meeting: 'n.event',
  council: 'n.event',
  feast: 'n.event',
  wedding: 'n.event',
  funeral: 'n.event',
  ceremony: 'n.event',
  siege: 'n.event',
  attack: 'n.event',
  escape: 'n.event',
  return: 'n.event',

  // n.time - Temporal
  day: 'n.time',
  night: 'n.time',
  morning: 'n.time',
  evening: 'n.time',
  dawn: 'n.time',
  dusk: 'n.time',
  year: 'n.time',
  month: 'n.time',
  week: 'n.time',
  hour: 'n.time',
  moment: 'n.time',
  age: 'n.time',
  era: 'n.time',
  time: 'n.time',
  past: 'n.time',
  future: 'n.time',

  // n.cognition - Mental
  thought: 'n.cognition',
  memory: 'n.cognition',
  dream: 'n.cognition',
  vision: 'n.cognition',
  plan: 'n.cognition',
  idea: 'n.cognition',
  secret: 'n.cognition',
  knowledge: 'n.cognition',
  wisdom: 'n.cognition',
  prophecy: 'n.cognition',
  riddle: 'n.cognition',
  mystery: 'n.cognition',

  // n.communication - Communication
  word: 'n.communication',
  name: 'n.communication',
  message: 'n.communication',
  letter: 'n.communication',
  story: 'n.communication',
  tale: 'n.communication',
  song: 'n.communication',
  poem: 'n.communication',
  language: 'n.communication',
  speech: 'n.communication',
  voice: 'n.communication',
  cry: 'n.communication',
  call: 'n.communication',
  command: 'n.communication',
  oath: 'n.communication',
  promise: 'n.communication',

  // n.feeling - Emotions
  love: 'n.feeling',
  hate: 'n.feeling',
  fear: 'n.feeling',
  hope: 'n.feeling',
  joy: 'n.feeling',
  sorrow: 'n.feeling',
  anger: 'n.feeling',
  grief: 'n.feeling',
  despair: 'n.feeling',
  courage: 'n.feeling',

  // n.substance - Materials
  water: 'n.substance',
  fire: 'n.substance',
  air: 'n.substance',
  earth: 'n.substance',
  smoke: 'n.substance',
  mist: 'n.substance',
  shadow: 'n.substance',
  light: 'n.substance',
  darkness: 'n.substance',
  blood: 'n.substance',
  iron: 'n.substance',
  steel: 'n.substance',
  wood: 'n.substance',

  // n.act - Actions (nominalized)
  death: 'n.act',
  birth: 'n.act',
  murder: 'n.act',
  betrayal: 'n.act',
  sacrifice: 'n.act',
  victory: 'n.act',
  defeat: 'n.act',
  rescue: 'n.act',
  destruction: 'n.act',

  // n.state - States
  life: 'n.state',
  peace: 'n.state',
  freedom: 'n.state',
  power: 'n.state',
  magic: 'n.state',
  evil: 'n.state',
  good: 'n.state',
  doom: 'n.state',
  fate: 'n.state',
  destiny: 'n.state',
};

/**
 * Verb supersense lexicon for event detection
 */
const VERB_SUPERSENSE_LEXICON: Record<string, VerbSupersense> = {
  // v.motion - Movement
  go: 'v.motion',
  come: 'v.motion',
  walk: 'v.motion',
  run: 'v.motion',
  ride: 'v.motion',
  fly: 'v.motion',
  fall: 'v.motion',
  climb: 'v.motion',
  travel: 'v.motion',
  return: 'v.motion',
  flee: 'v.motion',
  escape: 'v.motion',
  enter: 'v.motion',
  leave: 'v.motion',
  follow: 'v.motion',
  lead: 'v.motion',
  cross: 'v.motion',
  pass: 'v.motion',
  approach: 'v.motion',
  depart: 'v.motion',

  // v.communication - Speech
  say: 'v.communication',
  tell: 'v.communication',
  ask: 'v.communication',
  answer: 'v.communication',
  speak: 'v.communication',
  call: 'v.communication',
  cry: 'v.communication',
  shout: 'v.communication',
  whisper: 'v.communication',
  sing: 'v.communication',
  declare: 'v.communication',
  announce: 'v.communication',
  warn: 'v.communication',
  promise: 'v.communication',
  name: 'v.communication',
  command: 'v.communication',

  // v.cognition - Thinking
  think: 'v.cognition',
  know: 'v.cognition',
  believe: 'v.cognition',
  remember: 'v.cognition',
  forget: 'v.cognition',
  understand: 'v.cognition',
  wonder: 'v.cognition',
  dream: 'v.cognition',
  plan: 'v.cognition',
  decide: 'v.cognition',
  doubt: 'v.cognition',
  realize: 'v.cognition',
  learn: 'v.cognition',

  // v.perception - Seeing/Hearing
  see: 'v.perception',
  look: 'v.perception',
  watch: 'v.perception',
  hear: 'v.perception',
  listen: 'v.perception',
  feel: 'v.perception',
  sense: 'v.perception',
  notice: 'v.perception',
  observe: 'v.perception',
  smell: 'v.perception',
  taste: 'v.perception',

  // v.contact - Physical contact
  hit: 'v.contact',
  strike: 'v.contact',
  kill: 'v.contact',
  fight: 'v.contact',
  attack: 'v.contact',
  defend: 'v.contact',
  cut: 'v.contact',
  break: 'v.contact',
  hold: 'v.contact',
  catch: 'v.contact',
  throw: 'v.contact',
  push: 'v.contact',
  pull: 'v.contact',
  touch: 'v.contact',
  grab: 'v.contact',
  seize: 'v.contact',
  wound: 'v.contact',
  pierce: 'v.contact',

  // v.change - State change
  become: 'v.change',
  change: 'v.change',
  turn: 'v.change',
  grow: 'v.change',
  die: 'v.change',
  wake: 'v.change',
  sleep: 'v.change',
  rise: 'v.change',
  fall: 'v.change',
  break: 'v.change',
  heal: 'v.change',
  transform: 'v.change',

  // v.possession - Ownership
  have: 'v.possession',
  take: 'v.possession',
  give: 'v.possession',
  get: 'v.possession',
  find: 'v.possession',
  lose: 'v.possession',
  keep: 'v.possession',
  bring: 'v.possession',
  carry: 'v.possession',
  steal: 'v.possession',
  receive: 'v.possession',

  // v.social - Social interaction
  meet: 'v.social',
  marry: 'v.social',
  serve: 'v.social',
  help: 'v.social',
  rule: 'v.social',
  obey: 'v.social',
  betray: 'v.social',
  trust: 'v.social',
  join: 'v.social',
  unite: 'v.social',
  divide: 'v.social',

  // v.creation - Making things
  make: 'v.creation',
  create: 'v.creation',
  build: 'v.creation',
  forge: 'v.creation',
  write: 'v.creation',
  destroy: 'v.creation',
  burn: 'v.creation',

  // v.emotion - Emotional expression
  love: 'v.emotion',
  hate: 'v.emotion',
  fear: 'v.emotion',
  hope: 'v.emotion',
  laugh: 'v.emotion',
  cry: 'v.emotion',
  weep: 'v.emotion',
  mourn: 'v.emotion',
  rejoice: 'v.emotion',

  // v.stative - States
  be: 'v.stative',
  exist: 'v.stative',
  remain: 'v.stative',
  stay: 'v.stative',
  live: 'v.stative',
  dwell: 'v.stative',
  lie: 'v.stative',
  sit: 'v.stative',
  stand: 'v.stative',
  wait: 'v.stative',
};

// ============================================================================
// SUPERSENSE TAGGER
// ============================================================================

/**
 * Token with supersense annotation
 */
export interface SupersenseToken extends Token {
  supersense?: Supersense;
  supersenseConfidence?: number;
}

/**
 * Supersense analysis result for a sentence/document
 */
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

/**
 * Look up supersense for a lemma
 */
export function getSupersense(lemma: string, pos: string): Supersense | undefined {
  const normalizedLemma = lemma.toLowerCase();

  if (pos.startsWith('NN') || pos === 'NOUN') {
    return NOUN_SUPERSENSE_LEXICON[normalizedLemma];
  }

  if (pos.startsWith('VB') || pos === 'VERB') {
    return VERB_SUPERSENSE_LEXICON[normalizedLemma];
  }

  return undefined;
}

/**
 * Tag tokens with supersenses
 */
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

/**
 * Analyze supersenses in a token sequence
 */
export function analyzeSupersenses(tokens: Token[]): SupersenseAnalysis {
  const taggedTokens = tagWithSupersenses(tokens);

  let nounTags = 0;
  let verbTags = 0;
  let personTags = 0;
  let locationTags = 0;
  let groupTags = 0;
  let artifactTags = 0;
  let eventTags = 0;
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
        if (token.supersense === 'n.event') eventTags++;
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
      nounTags,
      verbTags,
      personTags,
      locationTags,
      groupTags,
      artifactTags,
      eventTags,
      coveragePercent: tokens.length > 0 ? (totalTagged / tokens.length) * 100 : 0,
    },
  };
}

// ============================================================================
// ENTITY TYPE INFERENCE FROM SUPERSENSES
// ============================================================================

/**
 * Mapping from supersenses to ARES entity types
 */
const SUPERSENSE_TO_ENTITY_TYPE: Partial<Record<NounSupersense, EntityType>> = {
  'n.person': 'PERSON',
  'n.group': 'ORG',
  'n.location': 'PLACE',
  'n.artifact': 'ITEM',
  'n.animal': 'CREATURE',
  'n.event': 'EVENT',
  'n.time': 'DATE',
  'n.communication': 'WORK',
};

/**
 * Infer entity type from supersense
 */
export function inferEntityTypeFromSupersense(supersense: Supersense): EntityType | undefined {
  if (supersense.startsWith('n.')) {
    return SUPERSENSE_TO_ENTITY_TYPE[supersense as NounSupersense];
  }
  return undefined;
}

/**
 * Get entity type suggestion for a noun phrase based on its head word
 */
export function suggestEntityType(tokens: Token[]): {
  suggestedType?: EntityType;
  confidence: number;
  supersense?: Supersense;
} {
  // Find the head noun (typically the last noun in the phrase)
  const nouns = tokens.filter(t => t.pos.startsWith('NN') || t.pos === 'NOUN');

  if (nouns.length === 0) {
    return { confidence: 0 };
  }

  const headNoun = nouns[nouns.length - 1];
  const supersense = getSupersense(headNoun.lemma, headNoun.pos);

  if (!supersense) {
    return { confidence: 0.3 }; // Low confidence without supersense
  }

  const suggestedType = inferEntityTypeFromSupersense(supersense);

  return {
    suggestedType,
    confidence: suggestedType ? 0.85 : 0.5,
    supersense,
  };
}

/**
 * Check if a word is a person indicator based on supersense
 */
export function isPersonIndicator(lemma: string): boolean {
  const ss = getSupersense(lemma, 'NN');
  return ss === 'n.person';
}

/**
 * Check if a word is a location indicator based on supersense
 */
export function isLocationIndicator(lemma: string): boolean {
  const ss = getSupersense(lemma, 'NN');
  return ss === 'n.location';
}

/**
 * Check if a word is a group indicator based on supersense
 */
export function isGroupIndicator(lemma: string): boolean {
  const ss = getSupersense(lemma, 'NN');
  return ss === 'n.group';
}

/**
 * Check if a word is an artifact indicator based on supersense
 */
export function isArtifactIndicator(lemma: string): boolean {
  const ss = getSupersense(lemma, 'NN');
  return ss === 'n.artifact';
}

// ============================================================================
// SUPERSENSE CONTEXT FEATURES
// ============================================================================

/**
 * Extract supersense-based features for entity classification
 */
export interface SupersenseFeatures {
  headSupersense?: Supersense;
  modifierSupersenses: Supersense[];
  contextSupersenses: Supersense[];
  personScore: number;
  locationScore: number;
  groupScore: number;
  artifactScore: number;
}

/**
 * Extract supersense features for a span within a sentence
 */
export function extractSupersenseFeatures(
  spanTokens: Token[],
  contextTokens: Token[]
): SupersenseFeatures {
  const taggedSpan = tagWithSupersenses(spanTokens);
  const taggedContext = tagWithSupersenses(contextTokens);

  // Find head noun supersense
  const nouns = taggedSpan.filter(t => t.pos.startsWith('NN') && t.supersense);
  const headSupersense = nouns.length > 0 ? nouns[nouns.length - 1].supersense : undefined;

  // Modifier supersenses (adjectives, other nouns)
  const modifierSupersenses = taggedSpan
    .filter(t => t.supersense && t !== nouns[nouns.length - 1])
    .map(t => t.supersense!)
    .filter((ss): ss is Supersense => ss !== undefined);

  // Context supersenses (surrounding tokens)
  const contextSupersenses = taggedContext
    .filter(t => t.supersense)
    .map(t => t.supersense!)
    .filter((ss): ss is Supersense => ss !== undefined);

  // Compute type scores based on supersense distribution
  const allSupersenses = [headSupersense, ...modifierSupersenses, ...contextSupersenses]
    .filter((ss): ss is Supersense => ss !== undefined);

  let personScore = 0;
  let locationScore = 0;
  let groupScore = 0;
  let artifactScore = 0;

  for (const ss of allSupersenses) {
    if (ss === 'n.person') personScore += (ss === headSupersense ? 1.5 : 0.5);
    if (ss === 'n.location') locationScore += (ss === headSupersense ? 1.5 : 0.5);
    if (ss === 'n.group') groupScore += (ss === headSupersense ? 1.5 : 0.5);
    if (ss === 'n.artifact') artifactScore += (ss === headSupersense ? 1.5 : 0.5);
  }

  // Normalize scores
  const total = Math.max(personScore + locationScore + groupScore + artifactScore, 1);
  personScore = personScore / total;
  locationScore = locationScore / total;
  groupScore = groupScore / total;
  artifactScore = artifactScore / total;

  return {
    headSupersense,
    modifierSupersenses,
    contextSupersenses,
    personScore,
    locationScore,
    groupScore,
    artifactScore,
  };
}

// ============================================================================
// SUPERSENSE LEXICON EXTENSION
// ============================================================================

/**
 * Add custom supersense entries (for domain-specific vocabulary)
 */
export function addSupersenseEntry(
  lemma: string,
  supersense: Supersense
): void {
  const normalizedLemma = lemma.toLowerCase();
  if (supersense.startsWith('n.')) {
    NOUN_SUPERSENSE_LEXICON[normalizedLemma] = supersense as NounSupersense;
  } else if (supersense.startsWith('v.')) {
    VERB_SUPERSENSE_LEXICON[normalizedLemma] = supersense as VerbSupersense;
  }
}

/**
 * Add multiple supersense entries from a list
 */
export function addSupersenseEntries(
  entries: Array<{ lemma: string; supersense: Supersense }>
): void {
  for (const entry of entries) {
    addSupersenseEntry(entry.lemma, entry.supersense);
  }
}

/**
 * Check if a lemma has a supersense entry
 */
export function hasSupersenseEntry(lemma: string): boolean {
  const normalizedLemma = lemma.toLowerCase();
  return lemma in NOUN_SUPERSENSE_LEXICON || lemma in VERB_SUPERSENSE_LEXICON;
}

/**
 * Get all person-type lemmas from the lexicon
 */
export function getPersonLemmas(): string[] {
  return Object.entries(NOUN_SUPERSENSE_LEXICON)
    .filter(([, ss]) => ss === 'n.person')
    .map(([lemma]) => lemma);
}

/**
 * Get all location-type lemmas from the lexicon
 */
export function getLocationLemmas(): string[] {
  return Object.entries(NOUN_SUPERSENSE_LEXICON)
    .filter(([, ss]) => ss === 'n.location')
    .map(([lemma]) => lemma);
}
