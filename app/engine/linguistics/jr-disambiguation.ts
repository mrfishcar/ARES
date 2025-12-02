import { PlaceEvidence } from './school-names';

export type EntityTypeGuess = 'PERSON' | 'ORG' | 'UNKNOWN';

export interface JrContext {
  fullName: string;          // e.g. "Mont Linola Jr"
  tokens: string[];          // ["Mont", "Linola", "Jr"]
  surroundingTokens: string[]; // small window ±3 around the NP
  // optional hints:
  placeEvidenceForRoot?: PlaceEvidence;
  rootIsKnownPlace?: boolean; // derived from evidence or gazetteer
}

/**
 * JR-1 vs JR-2: classify ambiguous "X Y Jr" patterns.
 */
export function guessTypeForJrName(ctx: JrContext): EntityTypeGuess {
  const lowerTokens = ctx.tokens.map(t => t.toLowerCase());
  const last = lowerTokens[lowerTokens.length - 1];
  const hasJr =
    last === 'jr' || last === 'jr.' || last === 'junior';

  if (!hasJr || ctx.tokens.length < 2) {
    return 'UNKNOWN';
  }

  const rootTokens = lowerTokens.slice(0, -1);
  const rootName = rootTokens.join(' ');

  const schoolContextWords = new Set([
    'students', 'student', 'teacher', 'teachers', 'principal', 'school',
    'class', 'classes', 'hall', 'hallway', 'locker', 'lockers',
    'cafeteria', 'gym', 'campus',
  ]);

  const contextHasSchoolWord = ctx.surroundingTokens.some(t =>
    schoolContextWords.has(t.toLowerCase())
  );

  const rootLooksLikePlace =
    ctx.rootIsKnownPlace ||
    !!ctx.placeEvidenceForRoot?.usedWithLocationPreposition ||
    (ctx.placeEvidenceForRoot?.standAlonePlaceCount ?? 0) > 0;

  // If root is clearly a place + schoolish context -> treat as ORG (junior high)
  if (rootLooksLikePlace && contextHasSchoolWord) {
    return 'ORG';
  }

  // PERSON pattern: 2+ name-like tokens before Jr, and no school context
  if (ctx.tokens.length >= 3 && !contextHasSchoolWord) {
    // simple heuristic: treat as PERSON if we have at least two capitalized tokens
    const nameLike = ctx.tokens.slice(0, -1).every(t => /^[A-Z]/.test(t));
    if (nameLike) {
      return 'PERSON';
    }
  }

  return 'UNKNOWN';
}
