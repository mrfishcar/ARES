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
  // collective nouns / organization members (often capitalized as part of "Guild of X")
  'cartographers', 'professors', 'engineers', 'farmers', 'volunteers',
  'members', 'workers', 'soldiers', 'guards', 'merchants', 'scholars',
  // world-specific
  'hell', 'trail', // you can expand as you discover junk entities
  'dead',
]);

export interface NounPhraseContext {
  headToken: string;          // e.g. "Friend"
  tokens: string[];           // whole NP tokens, original casing
  hasDeterminer: boolean;     // true if starts with "the", "a", "an", "my", etc.
  isSentenceInitial: boolean; // NP starts at sentence beginning
  followedByComma: boolean;   // pattern "Head," (vocative)
  followingWord?: string;     // the word immediately after the entity (for verb detection)
}

/**
 * Verbs that typically take PERSON subjects.
 * Used to distinguish "Hope visited" (name) from "Song played" (common noun).
 *
 * Linguistic basis: These are agentive verbs requiring animate/human subjects.
 * Non-agentive verbs (shone, broke, fell) don't provide person evidence.
 */
const PERSON_SUBJECT_VERBS = new Set([
  // Motion verbs (require animate agent)
  'visited', 'visits', 'visit',
  'walked', 'walks', 'walk',
  'ran', 'runs', 'run',
  'went', 'goes', 'go',
  'came', 'comes', 'come',
  'arrived', 'arrives', 'arrive',
  'left', 'leaves', 'leave',
  'returned', 'returns', 'return',
  'traveled', 'travels', 'travel',
  'moved', 'moves', 'move',
  // Communication verbs
  'said', 'says', 'say',
  'spoke', 'speaks', 'speak',
  'asked', 'asks', 'ask',
  'answered', 'answers', 'answer',
  'replied', 'replies', 'reply',
  'shouted', 'shouts', 'shout',
  'whispered', 'whispers', 'whisper',
  'called', 'calls', 'call',
  'told', 'tells', 'tell',
  'wrote', 'writes', 'write',
  // Work/activity verbs
  'worked', 'works', 'work',
  'studied', 'studies', 'study',
  'taught', 'teaches', 'teach',
  'learned', 'learns', 'learn',
  'played', 'plays', 'play',
  'helped', 'helps', 'help',
  'tried', 'tries', 'try',
  'started', 'starts', 'start',
  'finished', 'finishes', 'finish',
  // Social/emotional verbs
  'loved', 'loves', 'love',
  'hated', 'hates', 'hate',
  'married', 'marries', 'marry',
  'met', 'meets', 'meet',
  'joined', 'joins', 'join',
  'smiled', 'smiles', 'smile',
  'laughed', 'laughs', 'laugh',
  'cried', 'cries', 'cry',
  // Cognitive verbs
  'thought', 'thinks', 'think',
  'knew', 'knows', 'know',
  'believed', 'believes', 'believe',
  'wondered', 'wonders', 'wonder',
  'decided', 'decides', 'decide',
  'remembered', 'remembers', 'remember',
  'forgot', 'forgets', 'forget',
  // Perception verbs (with animate experiencer)
  'saw', 'sees', 'see',
  'heard', 'hears', 'hear',
  'watched', 'watches', 'watch',
  'looked', 'looks', 'look',
  'noticed', 'notices', 'notice',
  // Physical actions
  'sat', 'sits', 'sit',
  'stood', 'stands', 'stand',
  'held', 'holds', 'hold',
  'took', 'takes', 'take',
  'gave', 'gives', 'give',
  'put', 'puts',
  'opened', 'opens', 'open',
  'closed', 'closes', 'close',
  // Life events
  'lived', 'lives', 'live',
  'died', 'dies', 'die',
  'born', // "was born" pattern
]);

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
  // BUT: allow if followed by a person-verb (syntactic evidence of personhood)
  if (hasLowercaseEcho(tokenStats, ctx.headToken)) {
    if (ctx.tokens.length === 1 && ctx.isSentenceInitial && !ctx.followedByComma) {
      // Check if followed by a person-verb: "Hope visited" → Hope is likely a name
      if (ctx.followingWord && PERSON_SUBJECT_VERBS.has(ctx.followingWord.toLowerCase())) {
        // Syntactic evidence: subject of person-verb → allow as name
        return true;
      }
      // No syntactic evidence → reject as likely capitalization-only
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
