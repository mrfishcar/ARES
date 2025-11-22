/**
 * Deictic Reference Resolution
 *
 * Resolves spatial and temporal deictic words like "there", "here", "then" to previously mentioned entities.
 *
 * Example:
 *   "Harry went to Hogwarts. He studied magic there."
 *   → "there" resolves to "Hogwarts"
 *
 * This module fixes the missing pattern:
 *   - "lived there" → lives_in
 *   - "studied there" → studies_at
 *   - "became king there" → rules
 */

import type { CanonicalEntity } from './entity-census';
import type { ParsedSentence, Token } from './parse-types';

export interface DeicticResolution {
  deictic_word: string;  // "there", "here", "then"
  deictic_position: number;
  resolved_entity_id: string;
  resolved_entity_name: string;
  entity_type: string;
  confidence: number;
}

/**
 * Deictic words we can resolve
 */
const SPATIAL_DEICTICS = new Set(['there', 'here']);
const TEMPORAL_DEICTICS = new Set(['then']);

/**
 * Find the most recent location mentioned before this position
 */
function findMostRecentLocation(
  sentenceIndex: number,
  tokenIndex: number,
  allSentences: ParsedSentence[],
  registry: Map<string, CanonicalEntity>
): CanonicalEntity | null {
  // Look back through sentences starting from current
  for (let si = sentenceIndex; si >= 0; si--) {
    const sentence = allSentences[si];

    // In current sentence, only look at tokens before the deictic
    const tokensToCheck = si === sentenceIndex
      ? sentence.tokens.slice(0, tokenIndex)
      : sentence.tokens;

    // Search tokens in reverse order (most recent first)
    for (let ti = tokensToCheck.length - 1; ti >= 0; ti--) {
      const token = tokensToCheck[ti];

      // Check if this token matches any PLACE entity
      for (const entity of registry.values()) {
        if (entity.type !== 'PLACE') continue;

        // Check if token text matches any alias
        const matches = entity.aliases.some(alias =>
          alias.toLowerCase() === token.text.toLowerCase() ||
          token.text.toLowerCase().includes(alias.toLowerCase()) ||
          alias.toLowerCase().includes(token.text.toLowerCase())
        );

        if (matches) {
          return entity;  // Found most recent location
        }
      }
    }

    // Stop looking back after 3 sentences
    if (sentenceIndex - si >= 2) break;
  }

  return null;
}

/**
 * Find the most recent time/event mentioned
 */
function findMostRecentTime(
  sentenceIndex: number,
  tokenIndex: number,
  allSentences: ParsedSentence[],
  registry: Map<string, CanonicalEntity>
): CanonicalEntity | null {
  // Similar to location, but look for DATE or EVENT entities
  for (let si = sentenceIndex; si >= 0; si--) {
    const sentence = allSentences[si];

    const tokensToCheck = si === sentenceIndex
      ? sentence.tokens.slice(0, tokenIndex)
      : sentence.tokens;

    for (let ti = tokensToCheck.length - 1; ti >= 0; ti--) {
      const token = tokensToCheck[ti];

      for (const entity of registry.values()) {
        if (!['DATE', 'EVENT'].includes(entity.type)) continue;

        const matches = entity.aliases.some(alias =>
          alias.toLowerCase() === token.text.toLowerCase() ||
          token.text.toLowerCase().includes(alias.toLowerCase())
        );

        if (matches) {
          return entity;
        }
      }
    }

    if (sentenceIndex - si >= 2) break;
  }

  return null;
}

/**
 * Resolve all deictic references in parsed sentences
 */
export async function resolveDeictics(
  parsedSentences: ParsedSentence[],
  registry: Map<string, CanonicalEntity>
): Promise<{
  resolutions: DeicticResolution[];
  resolutionMap: Map<number, DeicticResolution>;
}> {
  const resolutions: DeicticResolution[] = [];

  for (let si = 0; si < parsedSentences.length; si++) {
    const sentence = parsedSentences[si];

    for (let ti = 0; ti < sentence.tokens.length; ti++) {
      const token = sentence.tokens[ti];
      const word = token.text.toLowerCase();

      // Check if this is a deictic word
      if (SPATIAL_DEICTICS.has(word)) {
        const location = findMostRecentLocation(si, ti, parsedSentences, registry);

        if (location) {
          resolutions.push({
            deictic_word: token.text,
            deictic_position: token.start,
            resolved_entity_id: location.id,
            resolved_entity_name: location.canonical_name,
            entity_type: location.type,
            confidence: 0.9  // High confidence for spatial deictics
          });
        }
      } else if (TEMPORAL_DEICTICS.has(word)) {
        const timeEvent = findMostRecentTime(si, ti, parsedSentences, registry);

        if (timeEvent) {
          resolutions.push({
            deictic_word: token.text,
            deictic_position: token.start,
            resolved_entity_id: timeEvent.id,
            resolved_entity_name: timeEvent.canonical_name,
            entity_type: timeEvent.type,
            confidence: 0.85  // Slightly lower for temporal
          });
        }
      }
    }
  }

  // Build map for quick lookup by position
  const resolutionMap = new Map<number, DeicticResolution>();
  for (const res of resolutions) {
    resolutionMap.set(res.deictic_position, res);
  }

  // Log statistics
  console.log(`[DEICTIC] Resolved ${resolutions.length} deictic references`);

  const byType = {
    spatial: resolutions.filter(r => SPATIAL_DEICTICS.has(r.deictic_word.toLowerCase())).length,
    temporal: resolutions.filter(r => TEMPORAL_DEICTICS.has(r.deictic_word.toLowerCase())).length
  };

  console.log(`  Types: spatial=${byType.spatial}, temporal=${byType.temporal}`);

  return {
    resolutions,
    resolutionMap
  };
}

/**
 * Get the resolved entity for a deictic word at a specific position
 */
export function getResolvedEntity(
  position: number,
  resolutionMap: Map<number, DeicticResolution>
): DeicticResolution | null {
  return resolutionMap.get(position) || null;
}
