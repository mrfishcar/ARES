/**
 * Mention Buffer - Accumulation Layer
 *
 * Collects durable mention candidates before clustering and entity minting.
 * NO entity IDs are assigned at this stage.
 */

import type { MentionCandidate } from './mention-candidate';
import type { GateResult, ContextOnlyReason } from './meaning-gate';
import { createStatsCollector, StatsCollector } from './extraction-stats';

// ============================================================================
// TYPES
// ============================================================================

export interface DurableMention {
  candidate: MentionCandidate;
  gateResult: GateResult;
  documentPosition: number;  // Absolute position for recency
}

export interface ContextOnlyMention {
  candidate: MentionCandidate;
  reason: ContextOnlyReason;
}

// ============================================================================
// MENTION BUFFER
// ============================================================================

export class MentionBuffer {
  /** Durable mentions keyed by normalized surface */
  private mentions: Map<string, DurableMention[]> = new Map();

  /** Context-only mentions (for coref, not entity minting) */
  private contextOnly: ContextOnlyMention[] = [];

  /** Stats collector */
  private stats: StatsCollector;

  constructor(stats?: StatsCollector) {
    this.stats = stats || createStatsCollector();
  }

  /**
   * Add a durable mention to the buffer
   */
  add(mention: DurableMention): void {
    const key = this.normalizeKey(mention.candidate.normalized);
    const existing = this.mentions.get(key) || [];
    existing.push(mention);
    this.mentions.set(key, existing);
    this.stats.recordMentionAccumulated();
  }

  /**
   * Add a context-only mention (for coref but not entity minting)
   */
  addContextOnly(mention: ContextOnlyMention): void {
    this.contextOnly.push(mention);
  }

  /**
   * Get all durable mentions for a normalized surface
   */
  getMentions(normalized: string): DurableMention[] {
    const key = this.normalizeKey(normalized);
    return this.mentions.get(key) || [];
  }

  /**
   * Get all mention groups
   */
  getAllMentionGroups(): Map<string, DurableMention[]> {
    return new Map(this.mentions);
  }

  /**
   * Get context-only mentions
   */
  getContextOnlyMentions(): ContextOnlyMention[] {
    return [...this.contextOnly];
  }

  /**
   * Get total mention count
   */
  getTotalMentionCount(): number {
    let count = 0;
    for (const mentions of this.mentions.values()) {
      count += mentions.length;
    }
    return count;
  }

  /**
   * Get unique surface count
   */
  getUniqueSurfaceCount(): number {
    return this.mentions.size;
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.mentions.clear();
    this.contextOnly = [];
  }

  /**
   * Normalize a key for matching
   * - Lowercase
   * - Collapse whitespace
   * - Remove punctuation
   */
  private normalizeKey(surface: string): string {
    return surface
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.,;:!?'"()-]/g, '');
  }

  /**
   * Export buffer state for debugging
   */
  toDebugObject(): object {
    const groups: Record<string, string[]> = {};
    for (const [key, mentions] of this.mentions) {
      groups[key] = mentions.map(m => m.candidate.surface);
    }
    return {
      durableGroups: groups,
      contextOnlyCount: this.contextOnly.length,
      totalMentions: this.getTotalMentionCount(),
      uniqueSurfaces: this.getUniqueSurfaceCount(),
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createMentionBuffer(stats?: StatsCollector): MentionBuffer {
  return new MentionBuffer(stats);
}
