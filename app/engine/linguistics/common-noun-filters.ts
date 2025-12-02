import { TokenStats, hasLowercaseEcho } from './token-stats';

export const PERSON_HEAD_BLOCKLIST = new Set([
  // spatial/building
  'hall', 'room', 'corridor', 'hallway', 'building', 'cafeteria', 'gym',
  'office', 'classroom', 'auditorium', 'lab',
  // discourse markers
  'well', 'oh', 'ah', 'hey', 'hi',
  // relational roles
  'friend', 'enemy', 'neighbor', 'neighbour', 'teacher', 'student',
  'boy', 'girl', 'kid', 'mom', 'dad', 'mother', 'father',
  'brother', 'sister', 'aunt', 'uncle',
  // world-specific
  'hell', 'trail', // you can expand as you discover junk entities
]);

export interface NounPhraseContext {
  headToken: string;          // e.g. "Friend"
  tokens: string[];           // whole NP tokens, original casing
  hasDeterminer: boolean;     // true if starts with "the", "a", "an", "my", etc.
  isSentenceInitial: boolean; // NP starts at sentence beginning
  followedByComma: boolean;   // pattern "Head," (vocative)
}

/**
 * CN-2: blocklist-based check: should this head token EVER be a PERSON?
 */
export function isBlocklistedPersonHead(headToken: string): boolean {
  return PERSON_HEAD_BLOCKLIST.has(headToken.toLowerCase());
}

/**
 * CN-3/CN-4 + CN-1 (lowercase echo):
 * Decide if a candidate NP should be considered a PERSON name.
 *
 * This is meant as a "filter": if it returns false, do NOT emit PERSON.
 *
 * If it returns true, you still might run additional name heuristics.
 */
export function looksLikePersonName(
  ctx: NounPhraseContext,
  tokenStats: TokenStats
): boolean {
  const headLower = ctx.headToken.toLowerCase();

  // 1) Hard blocklist
  if (isBlocklistedPersonHead(ctx.headToken)) {
    // For single-token names, ALWAYS reject if blocklisted
    if (ctx.tokens.length === 1) {
      return false;
    }
    // For multi-token names, allow exceptions like "Aunt May"
    const hasExplicitName = ctx.tokens.some(t =>
      /^[A-Z][a-z]+$/.test(t) && !PERSON_HEAD_BLOCKLIST.has(t.toLowerCase())
    );
    if (!hasExplicitName) {
      return false;
    }
  }

  // 2) Lowercase echo: if the head appears commonly in lowercase,
  // and this is the only capitalized use, be suspicious.
  if (hasLowercaseEcho(tokenStats, ctx.headToken)) {
    // relax this for clear name patterns later if needed
    if (ctx.tokens.length === 1 && ctx.isSentenceInitial && !ctx.followedByComma) {
      return false;
    }
  }

  // 3) Determiner: "the friend", "a hall" -> probably common noun
  if (ctx.hasDeterminer && ctx.tokens.length === 2) {
    // det + head
    return false;
  }

  // 4) Sentence-initial "Well," pattern
  if (
    ctx.isSentenceInitial &&
    headLower === 'well' &&
    ctx.followedByComma
  ) {
    return false;
  }

  // 5) Vocative: "Name," pattern is strong PERSON cue
  if (!ctx.hasDeterminer && ctx.followedByComma) {
    // e.g. "Barty,"  "Kelly,"  "Friend," (nickname)
    return true;
  }

  // Default: let higher-level name heuristics decide,
  // but don't ban it outright.
  return true;
}
