// Basic stats over the whole document or corpus chunk
export interface TokenStats {
  // case-insensitive key → info
  byToken: Map<string, TokenInfo>;
}

export interface TokenInfo {
  token: string;               // canonical lowercase form
  totalCount: number;
  lowercaseCount: number;      // how many times we saw it in lowercase
  capitalizedCount: number;    // how many times we saw it capitalized
  standaloneCapitalizedCount: number; // as its own NP/head
  alwaysEmbeddedInProperName: boolean; // derived
}

export interface TokenOccurrence {
  token: string;
  isLowercase: boolean;
  isCapitalized: boolean;
  isSentenceInitial: boolean;
  isStandaloneNP: boolean;
  insideLongerProperName: boolean;
}

/**
 * Build global TokenStats from a list of token occurrences.
 * Claude can call this once per doc before extraction/classification.
 */
export function buildTokenStats(
  occurrences: TokenOccurrence[]
): TokenStats {
  const byToken = new Map<string, TokenInfo>();

  for (const occ of occurrences) {
    const key = occ.token.toLowerCase();
    let info = byToken.get(key);
    if (!info) {
      info = {
        token: key,
        totalCount: 0,
        lowercaseCount: 0,
        capitalizedCount: 0,
        standaloneCapitalizedCount: 0,
        alwaysEmbeddedInProperName: true,
      };
      byToken.set(key, info);
    }

    info.totalCount += 1;
    if (occ.isLowercase) info.lowercaseCount += 1;
    if (occ.isCapitalized) info.capitalizedCount += 1;
    if (occ.isStandaloneNP && occ.isCapitalized) {
      info.standaloneCapitalizedCount += 1;
    }
    if (!occ.insideLongerProperName) {
      info.alwaysEmbeddedInProperName = false;
    }
  }

  return { byToken };
}

/**
 * Helper: get or undefined if we never saw this token.
 */
export function getTokenInfo(
  stats: TokenStats,
  token: string
): TokenInfo | undefined {
  return stats.byToken.get(token.toLowerCase());
}

/**
 * NF-1: A token is an "attached-only fragment" if it NEVER appears
 * capitalized as a standalone NP and is ALWAYS embedded in a longer proper name.
 *
 * Use this to decide whether "Mont" / "Linola" should be suppressed as
 * separate PERSON entities.
 */
export function isAttachedOnlyFragment(
  stats: TokenStats,
  token: string
): boolean {
  const info = getTokenInfo(stats, token);
  if (!info) return false;

  // no standalone capitalized uses, and always embedded
  return (
    info.capitalizedCount > 0 &&
    info.standaloneCapitalizedCount === 0 &&
    info.alwaysEmbeddedInProperName === true
  );
}

/**
 * CN-1: Did we ever see this token in lowercase?
 * If yes, then capitalized-only occurrences at sentence start are suspicious.
 */
export function hasLowercaseEcho(
  stats: TokenStats,
  token: string
): boolean {
  const info = getTokenInfo(stats, token);
  return !!info && info.lowercaseCount > 0;
}
