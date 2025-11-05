/**
 * Contextual Resolution Engine
 *
 * Resolves ambiguous references (pronouns, descriptors) using a multi-tier strategy:
 * 1. Local paragraph context (recent mentions)
 * 2. Document-level proximity
 * 3. Global entity profiles (cross-document)
 *
 * Handles ambiguity: if multiple candidates are equally viable, don't resolve.
 */

import type { Entity } from './schema';
import type { Sentence } from './segment';
import type { EntityProfile } from './entity-profiler';

/**
 * Resolution candidate with scoring
 */
interface ResolutionCandidate {
  entity_id: string;
  entity: Entity;
  score: number;
  reason: string;
}

/**
 * Resolution context
 */
export interface ResolutionContext {
  mention_text: string;
  mention_start: number;
  mention_end: number;
  sentence_index: number;
  paragraph_index: number;
}

/**
 * Get paragraph index for a sentence
 */
function getParagraphIndex(sentences: Sentence[], sentenceIndex: number, text: string): number {
  let paragraphIndex = 0;

  for (let i = 0; i < sentenceIndex && i < sentences.length; i++) {
    const currSent = sentences[i];
    const nextSent = sentences[i + 1];

    if (nextSent) {
      const between = text.slice(currSent.end, nextSent.start);
      if (/\n\s*\n/.test(between)) {
        paragraphIndex++;
      }
    }
  }

  return paragraphIndex;
}

/**
 * Find entities in same paragraph
 */
function findInParagraph(
  context: ResolutionContext,
  entities: Entity[],
  entitySpans: Array<{ entity_id: string; start: number; end: number }>,
  sentences: Sentence[],
  text: string,
  matchFn: (entity: Entity) => boolean
): ResolutionCandidate[] {
  const candidates: ResolutionCandidate[] = [];

  // Filter spans that are in the same paragraph and match the criteria
  const paragraphSpans = entitySpans.filter(span => {
    const sentIndex = sentences.findIndex(s => span.start >= s.start && span.start < s.end);
    if (sentIndex === -1) return false;

    const spanParIndex = getParagraphIndex(sentences, sentIndex, text);
    return spanParIndex === context.paragraph_index && span.start < context.mention_start;
  });

  // Find matching entities
  for (const span of paragraphSpans) {
    const entity = entities.find(e => e.id === span.entity_id);
    if (!entity || !matchFn(entity)) continue;

    // Calculate recency score (closer = higher score)
    const distance = context.mention_start - span.end;
    const recencyScore = 1.0 / (1.0 + distance / 100); // Decay with distance

    candidates.push({
      entity_id: entity.id,
      entity,
      score: recencyScore * 10.0, // High priority for paragraph matches
      reason: 'paragraph_recency'
    });
  }

  return candidates;
}

/**
 * Find entities in same document (outside current paragraph)
 */
function findInDocument(
  context: ResolutionContext,
  entities: Entity[],
  entitySpans: Array<{ entity_id: string; start: number; end: number }>,
  sentences: Sentence[],
  text: string,
  matchFn: (entity: Entity) => boolean
): ResolutionCandidate[] {
  const candidates: ResolutionCandidate[] = [];

  // Filter spans that are in different paragraphs but same document
  const documentSpans = entitySpans.filter(span => {
    const sentIndex = sentences.findIndex(s => span.start >= s.start && span.start < s.end);
    if (sentIndex === -1) return false;

    const spanParIndex = getParagraphIndex(sentences, sentIndex, text);
    return spanParIndex !== context.paragraph_index;
  });

  // Count mentions per entity
  const mentionCounts = new Map<string, number>();
  for (const span of documentSpans) {
    const entity = entities.find(e => e.id === span.entity_id);
    if (!entity || !matchFn(entity)) continue;

    mentionCounts.set(entity.id, (mentionCounts.get(entity.id) || 0) + 1);
  }

  // Create candidates based on mention frequency
  for (const [entityId, count] of mentionCounts) {
    const entity = entities.find(e => e.id === entityId)!;

    candidates.push({
      entity_id: entityId,
      entity,
      score: Math.log10(count + 1) * 2.0, // Medium priority for document-level
      reason: 'document_frequency'
    });
  }

  return candidates;
}

/**
 * Find entities via global profiles
 */
function findViaProfiles(
  context: ResolutionContext,
  descriptor: string,
  entities: Entity[],
  profiles: Map<string, EntityProfile>
): ResolutionCandidate[] {
  const candidates: ResolutionCandidate[] = [];

  // Search profiles for matching descriptor
  for (const [entityId, profile] of profiles) {
    let matches = false;

    // Check descriptors
    if (profile.descriptors.has(descriptor.toLowerCase())) {
      matches = true;
    }

    // Check roles
    if (profile.roles.has(descriptor.toLowerCase())) {
      matches = true;
    }

    // Check titles
    for (const title of profile.titles) {
      if (title.toLowerCase().includes(descriptor.toLowerCase())) {
        matches = true;
        break;
      }
    }

    if (!matches) continue;

    // Verify entity exists in current document
    const entity = entities.find(e => e.id === entityId);
    if (!entity) continue; // Profile for entity not in this document

    // Score based on profile confidence
    const profileScore = profile.confidence_score * profile.mention_count * 0.1;

    candidates.push({
      entity_id: entityId,
      entity,
      score: profileScore, // Lower priority than local context
      reason: 'profile_match'
    });
  }

  return candidates;
}

/**
 * Resolve a descriptor mention to an entity
 *
 * Returns null if:
 * - No matches found
 * - Multiple equally-strong matches (ambiguous)
 */
export function resolveDescriptor(
  context: ResolutionContext,
  descriptor: string,
  entities: Entity[],
  entitySpans: Array<{ entity_id: string; start: number; end: number }>,
  sentences: Sentence[],
  text: string,
  profiles?: Map<string, EntityProfile>
): { entity_id: string; confidence: number; method: string } | null {

  // Match function: does entity match this descriptor?
  const matchFn = (entity: Entity): boolean => {
    const canonical = entity.canonical.toLowerCase();
    const desc = descriptor.toLowerCase();

    // Check canonical name
    if (canonical.includes(desc)) return true;

    // Check aliases
    for (const alias of entity.aliases) {
      if (alias.toLowerCase().includes(desc)) return true;
    }

    return false;
  };

  // Tier 1: Same paragraph (highest priority)
  const paragraphCandidates = findInParagraph(
    context,
    entities,
    entitySpans,
    sentences,
    text,
    matchFn
  );

  if (paragraphCandidates.length === 1) {
    // Unambiguous paragraph match
    return {
      entity_id: paragraphCandidates[0].entity_id,
      confidence: 0.95,
      method: 'paragraph_recency'
    };
  }

  if (paragraphCandidates.length > 1) {
    // Ambiguous! Multiple matches in same paragraph
    // Check if one is significantly more recent
    paragraphCandidates.sort((a, b) => b.score - a.score);
    const best = paragraphCandidates[0];
    const second = paragraphCandidates[1];

    // If best is 2x better than second, use it
    if (best.score > second.score * 2) {
      return {
        entity_id: best.entity_id,
        confidence: 0.85,
        method: 'paragraph_recency_dominant'
      };
    }

    // Otherwise: too ambiguous, don't resolve
    return null;
  }

  // Tier 2: Same document (medium priority)
  const documentCandidates = findInDocument(
    context,
    entities,
    entitySpans,
    sentences,
    text,
    matchFn
  );

  if (documentCandidates.length === 1) {
    // Unambiguous document match
    return {
      entity_id: documentCandidates[0].entity_id,
      confidence: 0.75,
      method: 'document_frequency'
    };
  }

  if (documentCandidates.length > 1) {
    // Multiple matches - pick strongest if clearly dominant
    documentCandidates.sort((a, b) => b.score - a.score);
    const best = documentCandidates[0];
    const second = documentCandidates[1];

    if (best.score > second.score * 1.5) {
      return {
        entity_id: best.entity_id,
        confidence: 0.70,
        method: 'document_frequency_dominant'
      };
    }

    // Too ambiguous
    return null;
  }

  // Tier 3: Global profiles (lowest priority)
  if (profiles && profiles.size > 0) {
    const profileCandidates = findViaProfiles(
      context,
      descriptor,
      entities,
      profiles
    );

    if (profileCandidates.length === 1) {
      return {
        entity_id: profileCandidates[0].entity_id,
        confidence: 0.60,
        method: 'profile_match'
      };
    }

    if (profileCandidates.length > 1) {
      // Multiple profile matches - pick strongest if clearly dominant
      profileCandidates.sort((a, b) => b.score - a.score);
      const best = profileCandidates[0];
      const second = profileCandidates[1];

      if (best.score > second.score * 2) {
        return {
          entity_id: best.entity_id,
          confidence: 0.55,
          method: 'profile_match_dominant'
        };
      }

      // Too ambiguous across profiles
      return null;
    }
  }

  // No matches found
  return null;
}

/**
 * Batch resolve multiple mentions
 */
export function resolveDescriptors(
  mentions: Array<{ text: string; start: number; end: number; sentence_index: number }>,
  entities: Entity[],
  entitySpans: Array<{ entity_id: string; start: number; end: number }>,
  sentences: Sentence[],
  text: string,
  profiles?: Map<string, EntityProfile>
): Map<number, { entity_id: string; confidence: number; method: string }> {

  const resolutions = new Map<number, { entity_id: string; confidence: number; method: string }>();

  for (let i = 0; i < mentions.length; i++) {
    const mention = mentions[i];

    // Extract descriptor (remove "the")
    const descriptor = mention.text.toLowerCase().replace(/^the\s+/, '').trim();
    if (descriptor.length < 3) continue; // Skip short words

    const context: ResolutionContext = {
      mention_text: mention.text,
      mention_start: mention.start,
      mention_end: mention.end,
      sentence_index: mention.sentence_index,
      paragraph_index: getParagraphIndex(sentences, mention.sentence_index, text)
    };

    const resolution = resolveDescriptor(
      context,
      descriptor,
      entities,
      entitySpans,
      sentences,
      text,
      profiles
    );

    if (resolution) {
      resolutions.set(i, resolution);
    }
  }

  return resolutions;
}
