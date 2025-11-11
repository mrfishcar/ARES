/**
 * Appositive Span Cache
 *
 * Precomputes which tokens are inside appositive phrases for O(1) lookup.
 * This avoids repeated parent-walking during relation extraction.
 *
 * Example: "Aragorn, son of Arathorn, traveled to Gondor"
 * - "son" is marked as appos
 * - "Arathorn" is a child of "son" → also in appositive span
 */

import type { Token } from './parse-types';

export interface ApposCache {
  inAppos: boolean[];
  indexOf: Map<Token, number>;
}

/**
 * Build appositive span cache for a sentence's tokens
 *
 * Algorithm:
 * 1. Create index map for O(1) token→index lookup
 * 2. Mark all tokens with dep='appos' as in appositive span
 * 3. Recursively mark their descendants (children and conj chains)
 *
 * @param tokens - Array of tokens from a single sentence
 * @returns Cache with boolean array and token index map
 */
export function buildApposCache(tokens: Token[]): ApposCache {
  const indexOf = new Map<Token, number>();
  const inAppos = new Array(tokens.length).fill(false);

  // Build index map for O(1) lookups
  for (let i = 0; i < tokens.length; i++) {
    indexOf.set(tokens[i], i);
  }

  // Find all appositive roots
  const apposRoots: Token[] = [];
  for (const tok of tokens) {
    if (tok.dep === 'appos') {
      apposRoots.push(tok);
    }
  }

  // Mark appositive tokens and their descendants
  for (const root of apposRoots) {
    markAppositiveSpan(root, tokens, indexOf, inAppos);
  }

  return { inAppos, indexOf };
}

/**
 * Recursively mark a token and its descendants as being in an appositive span
 */
function markAppositiveSpan(
  tok: Token,
  tokens: Token[],
  indexOf: Map<Token, number>,
  inAppos: boolean[]
): void {
  const idx = indexOf.get(tok);
  if (idx === undefined) return;

  // Mark this token
  inAppos[idx] = true;

  // Mark all children (including conj chains)
  for (const child of tokens) {
    if (child.head === tok.i && !inAppos[indexOf.get(child)!]) {
      markAppositiveSpan(child, tokens, indexOf, inAppos);
    }
  }
}

/**
 * Create a no-op checker when sentence has no appositives
 */
export function createNoOpChecker(): (tok: Token) => boolean {
  return () => false;
}

/**
 * Create a fast O(1) checker from a precomputed cache
 */
export function createFastChecker(cache: ApposCache): (tok: Token) => boolean {
  return (tok: Token) => {
    const idx = cache.indexOf.get(tok);
    return idx !== undefined ? cache.inAppos[idx] : false;
  };
}
