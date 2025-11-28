/**
 * Mention Tracking System (Phase E1)
 *
 * Alphanumeric coding system: M001, M002... for mentions, E001, E002... for entities
 * Enables coreference resolution, alias discovery, and relation extraction improvements
 */

import { v4 as uuid } from "uuid";
import type { Entity, EntityType } from "./schema";

/**
 * A mention is a single reference to an entity in text
 * e.g., "Aria Thorne", "She", "The explorer", "Aria"
 */
export interface Mention {
  id: string;              // M001, M002, M003...
  entityId: string;        // E001 (which entity this mention refers to)
  span: [number, number];  // Character offsets [start, end]
  surface: string;         // Raw text as it appears
  sentenceIdx: number;     // Which sentence (0-indexed)
  type: MentionType;
  confidence: number;      // 0-1 score for this mention
}

export type MentionType =
  | 'canonical'    // Full name: "Aria Thorne"
  | 'short_form'   // Short name: "Aria"
  | 'pronoun'      // Pronoun: "She", "He", "They"
  | 'descriptor'   // Role/description: "The explorer", "The strategist"
  | 'possessive';  // Possessive: "Aria's", "Their"

/**
 * EntityCluster groups all mentions of a single real-world entity
 */
export interface EntityCluster {
  id: string;              // E001, E002, E003...
  type: EntityType;
  canonical: string;       // Best/most complete name
  mentions: Mention[];     // All references to this entity
  aliases: string[];       // Known alternative names
  confidence: number;      // Overall confidence this is a real entity (0-1)

  // Metadata
  firstMention: number;    // Sentence index of first appearance
  mentionCount: number;    // Total mentions (length of mentions array)
  sources: ExtractorSource[];  // How was this entity discovered
}

export type AliasStrength = 'strong' | 'ambiguous';

export interface AliasCandidate {
  eid: string;
  strength: AliasStrength;
}

export type ExtractorSource = 'NER' | 'DEP' | 'WHITELIST' | 'FALLBACK' | 'PATTERN';

/**
 * Generate mention ID (M001, M002, ...)
 */
let mentionCounter = 0;
export function generateMentionId(): string {
  return `M${String(++mentionCounter).padStart(3, '0')}`;
}

/**
 * Generate entity ID (E001, E002, ...)
 */
let entityCounter = 0;
export function generateEntityId(): string {
  return `E${String(++entityCounter).padStart(3, '0')}`;
}

/**
 * Reset counters (for testing)
 */
export function resetIdCounters(): void {
  mentionCounter = 0;
  entityCounter = 0;
}

/**
 * Create a new mention
 */
export function createMention(
  entityId: string,
  span: [number, number],
  surface: string,
  sentenceIdx: number,
  type: MentionType,
  confidence: number
): Mention {
  return {
    id: generateMentionId(),
    entityId,
    span,
    surface,
    sentenceIdx,
    type,
    confidence
  };
}

/**
 * Create a new entity cluster
 */
export function createEntityCluster(
  type: EntityType,
  canonical: string,
  firstMention: Mention,
  sources: ExtractorSource[],
  confidence: number
): EntityCluster {
  return {
    id: generateEntityId(),
    type,
    canonical,
    mentions: [firstMention],
    aliases: [],
    confidence,
    firstMention: firstMention.sentenceIdx,
    mentionCount: 1,
    sources
  };
}

/**
 * Add a mention to an entity cluster
 */
export function addMentionToCluster(
  cluster: EntityCluster,
  mention: Mention
): void {
  cluster.mentions.push(mention);
  cluster.mentionCount = cluster.mentions.length;

  // Update canonical if this mention is more informative
  const currentWords = cluster.canonical.split(/\s+/).length;
  const newWords = mention.surface.split(/\s+/).length;

  if (mention.type === 'canonical' && newWords > currentWords) {
    cluster.aliases.push(cluster.canonical);
    cluster.canonical = mention.surface;
  } else if (mention.type === 'canonical' || mention.type === 'short_form') {
    if (!cluster.aliases.includes(mention.surface) && mention.surface !== cluster.canonical) {
      cluster.aliases.push(mention.surface);
    }
  }
}

/**
 * Find cluster by entity ID
 */
export function findClusterById(
  clusters: EntityCluster[],
  entityId: string
): EntityCluster | undefined {
  return clusters.find(c => c.id === entityId);
}

export function resolveAliasWithContext(
  alias: string,
  candidates: AliasCandidate[],
  currentMentionIndex: number,
  lastMentionIndexByEid: Map<string, number>
): string | null {
  if (!candidates.length) return null;

  const strong = candidates.filter(c => c.strength === 'strong');
  const pool = strong.length > 0 ? strong : candidates;

  let bestEid: string | null = null;
  let bestDistance = Infinity;

  for (const candidate of pool) {
    const lastMention = lastMentionIndexByEid.get(candidate.eid);
    if (lastMention === undefined) continue;
    const distance = currentMentionIndex - lastMention;
    if (distance >= 0 && distance < bestDistance) {
      bestDistance = distance;
      bestEid = candidate.eid;
    }
  }

  return bestEid;
}

/**
 * Find clusters that might match a surface form
 */
export function findCandidateClusters(
  clusters: EntityCluster[],
  surface: string,
  sentenceIdx: number,
  windowSize: number = 3
): EntityCluster[] {
  const surfaceLower = surface.toLowerCase().trim();

  return clusters.filter(cluster => {
    // Must be in recent context (within windowSize sentences)
    const recentMentions = cluster.mentions.filter(
      m => m.sentenceIdx >= sentenceIdx - windowSize && m.sentenceIdx < sentenceIdx
    );
    if (recentMentions.length === 0) return false;

    // Check if surface matches canonical or aliases
    const canonicalLower = cluster.canonical.toLowerCase();
    if (canonicalLower === surfaceLower || canonicalLower.includes(surfaceLower)) {
      return true;
    }

    for (const alias of cluster.aliases) {
      const aliasLower = alias.toLowerCase();
      if (aliasLower === surfaceLower || aliasLower.includes(surfaceLower)) {
        return true;
      }
    }

    return false;
  });
}

/**
 * Merge two entity clusters (when we discover they're the same entity)
 */
export function mergeClusters(
  primary: EntityCluster,
  secondary: EntityCluster
): EntityCluster {
  // Combine mentions
  primary.mentions.push(...secondary.mentions);
  primary.mentionCount = primary.mentions.length;

  // Combine aliases
  const allAliases = new Set([
    ...primary.aliases,
    ...secondary.aliases,
    secondary.canonical
  ]);
  allAliases.delete(primary.canonical);
  primary.aliases = Array.from(allAliases);

  // Combine sources
  const allSources = new Set([...primary.sources, ...secondary.sources]);
  primary.sources = Array.from(allSources);

  // Update confidence (average weighted by mention count)
  primary.confidence = (
    (primary.confidence * primary.mentions.length + secondary.confidence * secondary.mentions.length) /
    (primary.mentions.length + secondary.mentions.length)
  );

  // Update first mention
  primary.firstMention = Math.min(primary.firstMention, secondary.firstMention);

  // Update all mention entity IDs to point to primary
  for (const mention of secondary.mentions) {
    mention.entityId = primary.id;
  }

  return primary;
}

/**
 * Convert EntityCluster to legacy Entity format (for backward compatibility)
 */
export function clusterToEntity(cluster: EntityCluster): Entity {
  return {
    id: cluster.id,
    type: cluster.type,
    canonical: cluster.canonical,
    aliases: cluster.aliases,
    created_at: new Date().toISOString()
  };
}

/**
 * Convert legacy Entity to EntityCluster
 */
export function entityToCluster(entity: Entity, mentions: Mention[], sources: ExtractorSource[]): EntityCluster {
  return {
    id: entity.id,
    type: entity.type,
    canonical: entity.canonical,
    mentions,
    aliases: entity.aliases,
    confidence: 0.8, // Default confidence for legacy entities
    firstMention: mentions.length > 0 ? mentions[0].sentenceIdx : 0,
    mentionCount: mentions.length,
    sources
  };
}
