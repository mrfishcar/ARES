/**
 * coref-utils.ts
 * Small utilities for mention-aware coreference resolution used by narrative patterns.
 *
 * Exports:
 *  - resolveMentionToCanonical(mentionId, corefLinks): string | null
 *  - isPronoun(text): boolean
 *
 * Notes:
 *  - This file is intentionally small and dependency-free so it can be reused where needed.
 */

export type CorefLink = {
  mentionId: string;           // unique mention identifier (must match mention metadata used elsewhere)
  canonicalEntityId: string;   // entity id that this mention resolves to
  confidence?: number;         // optional confidence in [0..1]
};

/**
 * Resolve a mention (by mentionId) to the canonical entity id using the provided coref links.
 * Returns the canonicalEntityId with the highest confidence for that mentionId, or null if none found.
 */
export function resolveMentionToCanonical(mentionId: string | undefined, corefLinks: CorefLink[] | undefined): string | null {
  if (!mentionId || !corefLinks || corefLinks.length === 0) return null;
  let best: CorefLink | null = null;
  for (const l of corefLinks) {
    if (l.mentionId !== mentionId) continue;
    if (!best || (l.confidence ?? 0) > (best.confidence ?? 0)) best = l;
  }
  return best ? best.canonicalEntityId : null;
}

const PRONOUNS = new Set([
  'i','me','you','he','she','it','we','they','him','her','them','us',
  'his','her','hers','its','our','ours','their','theirs','my','mine','your','yours'
]);

/**
 * Lightweight pronoun detector used to decide when to invoke mention-aware resolution.
 * Conservative and lowercase-based.
 */
export function isPronoun(tokenText: string | undefined): boolean {
  if (!tokenText) return false;
  return PRONOUNS.has(tokenText.trim().toLowerCase());
}

export default {
  resolveMentionToCanonical,
  isPronoun,
};
