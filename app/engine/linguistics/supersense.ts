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
 * Core verb class lookup table (~100 verbs)
 */
const VERB_CLASS_MAP: Record<string, VerbClass> = {
  // motion
  go: 'motion', come: 'motion', walk: 'motion', run: 'motion', ride: 'motion',
  fly: 'motion', fall: 'motion', climb: 'motion', travel: 'motion', return: 'motion',
  flee: 'motion', escape: 'motion', enter: 'motion', leave: 'motion', follow: 'motion',
  lead: 'motion', cross: 'motion', pass: 'motion', approach: 'motion', depart: 'motion',

  // communication
  say: 'communication', tell: 'communication', ask: 'communication', answer: 'communication',
  speak: 'communication', call: 'communication', shout: 'communication', whisper: 'communication',
  sing: 'communication', declare: 'communication', announce: 'communication', warn: 'communication',
  promise: 'communication', command: 'communication', cry: 'communication',

  // perception
  see: 'perception', look: 'perception', watch: 'perception', hear: 'perception',
  listen: 'perception', feel: 'perception', sense: 'perception', notice: 'perception',
  observe: 'perception', smell: 'perception', taste: 'perception',

  // cognition
  think: 'cognition', know: 'cognition', believe: 'cognition', remember: 'cognition',
  forget: 'cognition', understand: 'cognition', wonder: 'cognition', dream: 'cognition',
  plan: 'cognition', decide: 'cognition', doubt: 'cognition', realize: 'cognition',
  learn: 'cognition',

  // contact
  hit: 'contact', strike: 'contact', kill: 'contact', fight: 'contact', attack: 'contact',
  defend: 'contact', cut: 'contact', break: 'contact', hold: 'contact', catch: 'contact',
  throw: 'contact', push: 'contact', pull: 'contact', touch: 'contact', grab: 'contact',
  seize: 'contact', wound: 'contact', pierce: 'contact', slay: 'contact', murder: 'contact',

  // change
  become: 'change', change: 'change', turn: 'change', grow: 'change', die: 'change',
  wake: 'change', sleep: 'change', rise: 'change', heal: 'change', transform: 'change',

  // possession
  have: 'possession', take: 'possession', give: 'possession', get: 'possession',
  find: 'possession', lose: 'possession', keep: 'possession', bring: 'possession',
  carry: 'possession', steal: 'possession', receive: 'possession',

  // social
  meet: 'social', marry: 'social', serve: 'social', help: 'social', rule: 'social',
  obey: 'social', betray: 'social', trust: 'social', join: 'social', unite: 'social',
  divide: 'social',

  // creation
  make: 'creation', create: 'creation', build: 'creation', forge: 'creation',
  write: 'creation', destroy: 'creation', burn: 'creation',

  // emotion
  love: 'emotion', hate: 'emotion', fear: 'emotion', hope: 'emotion',
  laugh: 'emotion', weep: 'emotion', mourn: 'emotion', rejoice: 'emotion',
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
