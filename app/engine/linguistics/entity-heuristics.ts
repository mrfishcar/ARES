import type { Entity, EntityType } from '../schema';
import { hasLowercaseEcho, isAttachedOnlyFragment, type TokenStats } from './token-stats';
import { isBlocklistedPersonHead } from './common-noun-filters';

type SpanLike = { start: number; end: number; type?: EntityType };

const SENTENCE_STARTERS = new Set([
  'when', 'once', 'suddenly', 'originally', 'exactly', 'fortunately', 'meanwhile',
  'however', 'therefore', 'then', 'next', 'finally', 'afterward', 'afterwards',
  'someday', 'eventually'
]);

const TITLE_WORDS = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'doctor', 'coach', 'detective', 'nurse',
  'principal', 'prof', 'professor'
]);

const COLOR_ADJECTIVES = new Set([
  'black', 'white', 'blue', 'green', 'gold', 'silver', 'brown', 'gray', 'grey',
  'scarlet', 'crimson', 'amber', 'blonde', 'blond', 'hot', 'cold', 'aged', 'stained'
]);

export const VERB_LEADS = new Set([
  'fix', 'draw', 'handle', 'agree', 'react', 'allow', 'stop', 'start', 'begin',
  'keep', 'make', 'do', 'does', 'did', 'have', 'has', 'had', 'be', 'been', 'being',
  'can', 'could', 'would', 'should', 'might', 'will', 'shall'
]);

const FRAGMENT_ENDINGS = new Set(['this', 'that', 'it', 'anything', 'something', 'someone']);

const ORG_HEADWORDS = /\b(School|Department|Society|Office|Times|Bureau|Preservation|High School|Junior High)\b/i;
const PLACE_HEADWORDS = /\b(Street|Parish|Lake|River|Trail|Town|County|Bayou)\b/;
const ARTIFACT_HEADWORDS = /\b(Mirror|Ring|Cup|Blade|Book|Yearbook|Letter|Key|Crown)\b/;

const CONNECTOR_TOKENS = new Set(['of', 'the', 'and', 'de', 'di', 'del', 'la', 'le', 'st', 'st.', 'mt', 'mt.']);

const TYPE_PRIORITY: EntityType[] = ['PERSON', 'PLACE', 'ORG', 'ARTIFACT', 'ITEM', 'WORK', 'EVENT', 'HOUSE', 'TRIBE', 'SPECIES', 'TITLE'];
const CORE_TYPES = new Set<EntityType>(['PERSON', 'PLACE', 'ORG']);
const typeRank = (type: EntityType): number => {
  const idx = TYPE_PRIORITY.indexOf(type);
  return idx === -1 ? TYPE_PRIORITY.length : idx;
};

const DEBUG_HEURISTICS = process.env.ENTITY_HEURISTIC_DEBUG === '1';

function logDebug(message: string) {
  if (DEBUG_HEURISTICS) {
    console.log(`[ENTITY-HEURISTICS] ${message}`);
  }
}

export function isViableSingleTokenPerson(
  token: string,
  args: {
    tokenStats: TokenStats;
    isSentenceInitial: boolean;
    hasDeterminer?: boolean;
  }
): boolean {
  const surface = token.trim();
  if (!surface) return false;

  if (isAttachedOnlyFragment(args.tokenStats, surface)) return false;
  if (isBlocklistedPersonHead(surface)) return false;
  if (args.isSentenceInitial && hasLowercaseEcho(args.tokenStats, surface)) return false;
  if (args.hasDeterminer) return false;

  return true;
}

function getSurroundingTokens(text: string, start: number, end: number): { prev?: string; next?: string; nextTwo?: string[] } {
  const before = text.slice(0, start).match(/[A-Za-z']+/g) || [];
  const after = text.slice(end).match(/[A-Za-z']+/g) || [];
  const prev = before.length ? before[before.length - 1] : undefined;
  const next = after.length ? after[0] : undefined;
  const nextTwo = after.slice(0, 2);
  return { prev, next, nextTwo };
}

export function shouldSuppressSentenceInitialPerson(
  entity: Entity,
  span: SpanLike,
  text: string,
  isSentenceInitialPosition?: (pos: number) => boolean
): { suppress: boolean; reason?: string } {
  const tokens = entity.canonical.split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) return { suppress: false };

  const token = tokens[0];
  if (!/^[A-Z]/.test(token)) return { suppress: false };

  const prefix = text.slice(Math.max(0, span.start - 2), span.start);
  const atSentenceStart = isSentenceInitialPosition
    ? isSentenceInitialPosition(span.start)
    : span.start === 0 || /[.!?\n]\s*$/.test(prefix);
  if (!atSentenceStart) return { suppress: false };

  const { prev, next, nextTwo } = getSurroundingTokens(text, span.start, span.end);
  const hasTitleNeighbor = (prev && TITLE_WORDS.has(prev.toLowerCase())) || (next && TITLE_WORDS.has(next.toLowerCase()));
  if (hasTitleNeighbor) return { suppress: false };

  const hasNearbyProperContinuation = nextTwo?.some(tok => tok && /^[A-Z]/.test(tok)) ?? false;
  if (hasNearbyProperContinuation) return { suppress: false };

  const followingDialogue = /^\s*(?:,|—|-)\s*(said|asked|replied)/i.test(text.slice(span.end, span.end + 25));
  if (followingDialogue) return { suppress: false };

  // Check for appositive patterns: "X, son/daughter/king/prince/etc. of Y"
  // These strongly indicate X is a proper name
  const followingAppositive = /^\s*,\s*(son|daughter|child|heir|king|queen|prince|princess|lord|lady|duke|duchess|brother|sister|father|mother|wife|husband|widow|widower|cousin|nephew|niece|ruler|chief|leader)\s+(of|to)\s+/i.test(text.slice(span.end, span.end + 40));
  if (followingAppositive) return { suppress: false };

  // Check for comma followed by capitalized word (likely appositive with name)
  // Pattern: "Aragorn, Arathorn's son" or "Aragorn, the heir"
  const followingCommaCapital = /^\s*,\s+[A-Z]/.test(text.slice(span.end, span.end + 20));
  if (followingCommaCapital) return { suppress: false };

  // Check if followed by a verb - indicates name as subject ("Frodo is", "Harry married")
  const COMMON_VERBS = new Set(['could', 'would', 'should', 'will', 'can', 'may', 'might', 'must', 'shall', 'was', 'is', 'are', 'were', 'has', 'had', 'have', 'did', 'does', 'do', 'walked', 'smiled', 'spoke', 'said', 'went', 'came', 'looked', 'turned', 'stood', 'sat', 'ran', 'fell', 'woke', 'slept', 'ate', 'drank', 'thought', 'felt', 'knew', 'saw', 'heard', 'asked', 'told', 'replied', 'nodded', 'shook', 'laughed', 'cried', 'screamed', 'whispered', 'shouted', 'arrived', 'left', 'entered', 'exited', 'began', 'started', 'finished', 'stopped', 'continued', 'tried', 'wanted', 'needed', 'loved', 'hated', 'liked', 'married', 'dwelt', 'lived', 'taught', 'fought', 'brought', 'caught', 'bought', 'sought', 'wrought', 'ruled', 'worked', 'traveled', 'travelled', 'founded', 'attended', 'carried', 'followed', 'helped', 'reached', 'returned', 'saved', 'killed', 'died', 'rose', 'flew', 'swam', 'drove', 'rode', 'climbed', 'jumped', 'held', 'kept', 'gave', 'took', 'made', 'created', 'built', 'destroyed', 'teaches', 'teaches', 'played', 'claimed', 'owns', 'runs', 'leads', 'serves', 'writes', 'reads', 'lives', 'works', 'rules', 'guards', 'fights', 'travels', 'wanders', 'visits', 'meets', 'joins', 'becomes', 'became', 'remains', 'studies', 'studied', 'passed', 'decided', 'discovered', 'learned', 'learned', 'found', 'met', 'lost', 'won', 'defeated']);
  if (next && COMMON_VERBS.has(next.toLowerCase())) {
    return { suppress: false };
  }

  const starter = SENTENCE_STARTERS.has(token.toLowerCase());
  if (starter) {
    logDebug(`Suppressing sentence-initial starter ${token}`);
    return { suppress: true, reason: 'sentence_initial_starter' };
  }

  return { suppress: true, reason: 'sentence_initial_single_token' };
}

export function shouldSuppressAdjectiveColorPerson(
  entity: Entity,
  span: SpanLike,
  text: string
): { suppress: boolean; reason?: string } {
  const tokens = entity.canonical.split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) return { suppress: false };

  const token = tokens[0].toLowerCase();
  if (!COLOR_ADJECTIVES.has(token)) return { suppress: false };

  const { prev, next } = getSurroundingTokens(text, span.start, span.end);
  const hasTitle = prev && TITLE_WORDS.has(prev.toLowerCase());
  const followedByProper = next ? /^[A-Z]/.test(next) : false;
  if (hasTitle || followedByProper) return { suppress: false };

  return { suppress: true, reason: 'color_adj_person' };
}

const NON_NAME_PERSON_SINGLETONS = new Set([
  // discourse/grammar words frequently mis-tagged as PERSON
  'when',
  'whatever',
  'wherever',
  'however',
  'therefore',
  'meanwhile',
  'instinctively',
  'hearing',
  'visitors',
  'ghosts',
  'tears',
  // time / calendar
  'saturday',
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  // directions / demonyms / languages
  'west',
  'east',
  'north',
  'south',
  'european',
  'english',
  'spanish',
  'french',
  'african',
  'native',
  // other common false positives
  'dead',
  'aged',
  'stained',
  'weak',
  'fainting',
  'mid-bite',
]);

export function shouldSuppressCommonNonNamePerson(
  entity: Entity,
  span: SpanLike,
  text: string,
): { suppress: boolean; reason?: string } {
  if (entity.type !== 'PERSON') return { suppress: false };

  const tokens = entity.canonical.split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) return { suppress: false };

  const head = tokens[0].toLowerCase();

  // If preceded by an honorific, let it through (e.g., "Mr. Green")
  const prefix = text.slice(Math.max(0, span.start - 6), span.start);
  if (/\b(Mr|Mrs|Ms|Dr|Prof)\.?\s*$/i.test(prefix)) {
    return { suppress: false };
  }

  if (NON_NAME_PERSON_SINGLETONS.has(head)) {
    return { suppress: true, reason: 'common_non_name_person' };
  }

  return { suppress: false };
}

export function isFragmentaryItem(entity: Entity): boolean {
  if (entity.type !== 'ITEM') return false;

  const tokens = entity.canonical.split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;

  const lowerTokens = tokens.map(t => t.toLowerCase());
  const first = lowerTokens[0];
  const last = lowerTokens[lowerTokens.length - 1];

  // obvious verb/fragment leads or endings
  if (VERB_LEADS.has(first) || FRAGMENT_ENDINGS.has(last)) return true;

  // short, all-lowercase phrases are overwhelmingly clause fragments, not "items"
  const isAllLower = tokens.every(t => t === t.toLowerCase());
  if (isAllLower && tokens.length <= 3) return true;

  // If it doesn't contain any noun-like token, toss it.
  const hasNounLike = tokens.some(tok => /^[A-Z]/.test(tok) || /[a-z]{3,}/.test(tok));
  if (!hasNounLike) return true;

  return false;
}

export function applyTypeOverrides(
  entity: Entity,
  span: SpanLike,
  text: string
): { type: EntityType; reason?: string } {
  const { prev } = getSurroundingTokens(text, span.start, span.end);
  const prevLower = prev?.toLowerCase();
  if (prevLower && TITLE_WORDS.has(prevLower)) {
    return { type: 'PERSON', reason: 'title_prefix' };
  }

  const canonical = entity.canonical;

  if (ORG_HEADWORDS.test(canonical) && entity.type !== 'ORG') {
    const preText = text.slice(Math.max(0, span.start - 10), span.start).toLowerCase();
    if (!/\b(in|at|on|from)\s+$/.test(preText)) {
      return { type: 'ORG', reason: 'org_headword' };
    }
  }

  if (PLACE_HEADWORDS.test(canonical) && entity.type !== 'PLACE') {
    return { type: 'PLACE', reason: 'place_headword' };
  }

  if (ARTIFACT_HEADWORDS.test(canonical)) {
    return { type: 'ARTIFACT', reason: 'artifact_headword' };
  }

  return { type: entity.type };
}

export function stitchTitlecaseSpans<T extends SpanLike & { text: string; type: EntityType }>(
  spans: T[],
  text: string
): T[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const stitched: T[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    if (current.end >= next.start) continue;

    const between = text.slice(current.end, next.start);
    if (!/^\s+(?:[A-Za-z\.'’]+\s+)?$/.test(between)) continue;

    const combined = text.slice(current.start, next.end);
    const tokens = combined.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) continue;

    const connectorOk = tokens.slice(1, -1).every(tok => CONNECTOR_TOKENS.has(tok.toLowerCase()) || /^[A-Z]/.test(tok));
    const allTitlecase = tokens.filter(tok => !CONNECTOR_TOKENS.has(tok.toLowerCase())).every(tok => /^[A-Z]/.test(tok));
    if (!connectorOk || !allTitlecase) continue;

    // COORDINATION FIX: Don't stitch PERSON spans separated by coordination conjunctions
    // "Harry and Ron" should remain two separate entities, not be combined into one
    // This prevents coordinated subjects from being merged incorrectly
    const COORD_CONJUNCTIONS = new Set(['and', 'or', '&']);
    const middleTokens = tokens.slice(1, -1).map(t => t.toLowerCase());
    const hasCoordConjunction = middleTokens.some(t => COORD_CONJUNCTIONS.has(t));

    // If both spans are the same type (PERSON, ORG, PLACE) and there's a coordination conjunction,
    // skip stitching - they are likely separate coordinated entities
    // Example: "Harry and Ron" → two PERSON entities, "Gryffindor and Slytherin" → two ORG entities
    // Note: Legitimate compound names like "Johnson and Johnson" are typically recognized as
    // a single NER span, not two separate spans being stitched, so this shouldn't break those
    if (hasCoordConjunction && current.type === next.type) {
      continue;
    }

    const typeChoice = TYPE_PRIORITY.reduce((best, candidate) => {
      if (candidate === best) return best;
      const typesPresent = new Set([current.type, next.type]);
      if (typesPresent.has(candidate) && typeRank(candidate) < typeRank(best)) {
        return candidate;
      }
      return best;
    }, current.type);

    const stitchedSpan: T = {
      ...current,
      start: current.start,
      end: next.end,
      text: combined.trim(),
      type: typeChoice,
    };
    stitched.push(stitchedSpan);
  }

  return stitched;
}

export function resolveSpanConflicts(
  entities: Entity[],
  spans: Array<{ entity_id: string; start: number; end: number }>
): { entities: Entity[]; spans: Array<{ entity_id: string; start: number; end: number }> } {
  const entityById = new Map(entities.map(e => [e.id, e]));
  const keptSpans: Array<{ entity_id: string; start: number; end: number }> = [];

  const grouped = new Map<string, Array<{ entity: Entity; span: { entity_id: string; start: number; end: number } }>>();
  for (const span of spans) {
    const entity = entityById.get(span.entity_id);
    if (!entity) continue;
    const key = `${span.start}:${span.end}`;
    const list = grouped.get(key) || [];
    list.push({ entity, span });
    grouped.set(key, list);
  }

    for (const [key, list] of grouped.entries()) {
      if (list.length === 1) {
        keptSpans.push(list[0].span);
        continue;
      }
      const best = list.sort((a, b) => {
        const confA = a.entity.confidence ?? 0.5;
        const confB = b.entity.confidence ?? 0.5;
        if (confA !== confB) return confB - confA;
        const coreA = CORE_TYPES.has(a.entity.type);
        const coreB = CORE_TYPES.has(b.entity.type);
        if (coreA !== coreB) return coreB ? -1 : 1;
        const rankDiff = typeRank(a.entity.type) - typeRank(b.entity.type);
        if (rankDiff !== 0) return rankDiff;
        return a.entity.id.localeCompare(b.entity.id);
      })[0];
      logDebug(`Resolved exact-span conflict at ${key} to ${best.entity.canonical} (${best.entity.type})`);
      keptSpans.push(best.span);
    }

  const entityIdsWithSpans = new Set(keptSpans.map(span => span.entity_id));
  const prunedEntities = entities.filter(entity => entityIdsWithSpans.has(entity.id));

  // Overlap resolution: prefer longer spans of same or higher priority type
  keptSpans.sort((a, b) => a.start - b.start || b.end - a.end);
  const finalSpans: Array<{ entity_id: string; start: number; end: number }> = [];
  for (const span of keptSpans) {
    const overlaps = finalSpans.find(s => s.start <= span.start && s.end >= span.end && s.entity_id !== span.entity_id);
    if (overlaps) {
      const outer = entityById.get(overlaps.entity_id);
      const inner = entityById.get(span.entity_id);
      if (!outer || !inner) continue;
      const outerPriority = typeRank(outer.type);
      const innerPriority = typeRank(inner.type);
      const keepOuter = (overlaps.end - overlaps.start) >= (span.end - span.start) || outerPriority <= innerPriority;
      if (!keepOuter) {
        finalSpans.splice(finalSpans.indexOf(overlaps), 1, span);
      }
      continue;
    }
    finalSpans.push(span);
  }

  return { entities: prunedEntities, spans: finalSpans };
}

