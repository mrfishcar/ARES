/**
 * Stage 5: Coreference Stage
 *
 * Responsibility: Resolve pronouns and descriptive mentions to entities
 *
 * Resolution methods:
 * - Recency-based pronoun resolution ("He" → most recent PERSON)
 * - Descriptor matching ("the wizard" → Gandalf)
 * - Name variant matching ("Harry" → "Harry Potter")
 *
 * Output:
 * - Coreference links (pronoun/descriptor → entity)
 * - Virtual spans (treat pronouns as entity mentions for relation extraction)
 *
 * This enables relation extraction like:
 * "Harry studied at Hogwarts. He lived there." → Harry --[lived_in]--> Hogwarts
 */

import { resolveCoref } from '../coref';
import type {
  CoreferenceInput,
  CoreferenceOutput,
  CorefLink,
  Span
} from './types';

const STAGE_NAME = 'CoreferenceStage';

/**
 * Resolve pronouns and descriptive mentions to entities
 */
export async function runCoreferenceStage(
  input: CoreferenceInput
): Promise<CoreferenceOutput> {
  const startTime = Date.now();
  console.log(
    `[${STAGE_NAME}] Starting with ${input.entities.length} entities, ${input.sentences.length} sentences`
  );

  try {
    // Validate input
    if (!input.sentences || !Array.isArray(input.sentences)) {
      throw new Error('Invalid input: sentences must be an array');
    }

    if (!input.entities || !Array.isArray(input.entities)) {
      throw new Error('Invalid input: entities must be an array');
    }

    if (!input.spans || !Array.isArray(input.spans)) {
      throw new Error('Invalid input: spans must be an array');
    }

    if (!input.fullText || typeof input.fullText !== 'string') {
      throw new Error('Invalid input: fullText must be a non-empty string');
    }

    if (!input.profiles || !(input.profiles instanceof Map)) {
      throw new Error('Invalid input: profiles must be a Map');
    }

    // Run coreference resolution
    // This creates pronoun → entity mappings that can be used by relation extraction
    // Pass profiles to enable descriptor-based resolution ("the wizard" → Gandalf)
    const corefResult = resolveCoref(
      input.sentences,
      input.entities,
      input.spans,
      input.fullText,
      input.profiles
    );

    const corefLinks: CorefLink[] = corefResult.links;

    // DEBUG: Log coreference links
    console.log(`[${STAGE_NAME}] Found ${corefLinks.length} coreference links`);

    for (const link of corefLinks) {
      const entity = input.entities.find(e => e.id === link.entity_id);
      console.log(
        `[${STAGE_NAME}] "${link.mention.text}" [${link.mention.start},${link.mention.end}] -> ${entity?.canonical} (${link.method}, conf=${link.confidence.toFixed(2)})`
      );
    }

    // Create virtual entity spans for pronouns that were resolved
    // This allows relation extraction to "see" pronouns as entity mentions
    const virtualSpans: Span[] = [];

    for (const link of corefLinks) {
      virtualSpans.push({
        entity_id: link.entity_id,
        start: link.mention.start,
        end: link.mention.end
      });
    }

    const duration = Date.now() - startTime;
    console.log(
      `[${STAGE_NAME}] Complete in ${duration}ms: ${corefLinks.length} links, ${virtualSpans.length} virtual spans`
    );

    return {
      corefLinks,
      virtualSpans
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${STAGE_NAME}] Failed after ${duration}ms:`, error);
    const err = new Error(`[${STAGE_NAME}] ${(error as Error).message}`);
          (err as any).cause = error;
    throw err;
  }
}
