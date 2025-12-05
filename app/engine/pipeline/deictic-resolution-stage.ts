/**
 * Stage 6: Deictic Resolution Stage
 *
 * Responsibility: Resolve spatial/locative deictic references
 *
 * Deictic references are context-dependent words that rely on prior mentions:
 * - "there" → most recent location
 * - "here" → current/immediate location
 *
 * Example:
 * "Frodo studied at Rivendell. He lived there for many years."
 * → "there" resolves to "Rivendell"
 * → "He lived in Rivendell for many years."
 *
 * This transformation enables relation extraction to find "lived_in" relations
 * that would otherwise be missed due to the pronominalized location.
 */

import type {
  DeicticResolutionInput,
  DeicticResolutionOutput,
  DeicticSpan
} from './types';

const STAGE_NAME = 'DeicticResolutionStage';

// Location-like entity types that can be deictic referents
const LOCATION_TYPES = new Set(['PLACE', 'ORG', 'HOUSE']);

/**
 * Resolve deictic references ("there", "here") to locations
 */
export async function runDeicticResolutionStage(
  input: DeicticResolutionInput
): Promise<DeicticResolutionOutput> {
  const startTime = Date.now();
  console.log(`[${STAGE_NAME}] Starting with ${input.entities.length} entities`);

  try {
    // Validate input
    if (!input.fullText || typeof input.fullText !== 'string') {
      throw new Error('Invalid input: fullText must be a non-empty string');
    }

    if (!input.entities || !Array.isArray(input.entities)) {
      throw new Error('Invalid input: entities must be an array');
    }

    if (!input.spans || !Array.isArray(input.spans)) {
      throw new Error('Invalid input: spans must be an array');
    }

    let processedText = input.fullText;
    const deicticSpans: DeicticSpan[] = [];

    // Find all location-like entities with their positions in text
    // These can be referents for deictic "there"
    const placePositions: Array<{ position: number; name: string }> = [];

    for (const span of input.spans) {
      const entity = input.entities.find(e => e.id === span.entity_id);

      if (entity && LOCATION_TYPES.has(entity.type)) {
        placePositions.push({
          position: span.start,
          name: entity.canonical
        });
      }
    }

    // Sort by position so we can find the "most recent" location
    placePositions.sort((a, b) => a.position - b.position);

    console.log(
      `[${STAGE_NAME}] Found ${placePositions.length} location entities for deictic resolution`
    );

    // Find all "there" occurrences and replace with most recent location
    const thereRegex = /\bthere\b/gi;
    let thereMatch: RegExpExecArray | null;
    const thereMatches: Array<{ index: number; text: string }> = [];

    while ((thereMatch = thereRegex.exec(input.fullText)) !== null) {
      thereMatches.push({
        index: thereMatch.index,
        text: thereMatch[0]
      });
    }

    console.log(`[${STAGE_NAME}] Found ${thereMatches.length} "there" occurrences`);

    // For each "there", find the most recent location-like entity before it
    for (const match of thereMatches) {
      const previousPlace = placePositions
        .filter(p => p.position < match.index)
        .pop();

      if (previousPlace) {
        console.log(
          `[${STAGE_NAME}] Resolved "there" at position ${match.index} to "${previousPlace.name}"`
        );

        // Replace "there" with "in LocationName" to match extraction patterns
        // This works for both "lived in Rivendell" and "studied in Hogwarts"
        deicticSpans.push({
          start: match.index,
          end: match.index + match.text.length,
          replacement: `in ${previousPlace.name}`
        });
      } else {
        console.log(
          `[${STAGE_NAME}] Could not resolve "there" at position ${match.index}: no prior location`
        );
      }
    }

    // Apply replacements in reverse order to maintain positions
    for (let i = deicticSpans.length - 1; i >= 0; i--) {
      const span = deicticSpans[i];
      processedText =
        processedText.substring(0, span.start) +
        span.replacement +
        processedText.substring(span.end);
    }

    const duration = Date.now() - startTime;

    if (deicticSpans.length > 0) {
      console.log(
        `[${STAGE_NAME}] Complete in ${duration}ms: Resolved ${deicticSpans.length} deictic references`
      );
    } else {
      console.log(
        `[${STAGE_NAME}] Complete in ${duration}ms: No deictic references found`
      );
    }

    return {
      processedText,
      deicticSpans
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${STAGE_NAME}] Failed after ${duration}ms:`, error);
    const err = new Error(`[${STAGE_NAME}] ${(error as Error).message}`);
          (err as any).cause = error;
    throw err;
  }
}
