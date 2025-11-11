/**
 * Relation Deduplicator (Layer 3 of Precision Defense System)
 *
 * Merges duplicate relations extracted by multiple patterns.
 *
 * Problem: Same relation extracted multiple times
 * - Pattern 1: "Aragorn married Arwen" → married_to(Aragorn, Arwen) [0.85]
 * - Pattern 2: "Aragorn and Arwen married" → married_to(Aragorn, Arwen) [0.80]
 * - Pattern 3: "Aragorn wed Arwen" → married_to(Aragorn, Arwen) [0.82]
 *
 * Without deduplication: 3 relations (inflates false positive count)
 * With deduplication: 1 relation with merged evidence
 *
 * Expected Impact: 10-15% precision improvement
 */

import type { Relation } from './schema';

/**
 * Symmetric predicates (bidirectional relations)
 * For these, (A, pred, B) is equivalent to (B, pred, A)
 */
const SYMMETRIC_PREDICATES = new Set([
  'married_to',
  'sibling_of',
  'friends_with',
  'enemy_of',
  'cousin_of',
  'colleague_of',
  'allied_with',
  'similar_to',
  'equals',
  'alias_of',
]);

/**
 * Generate canonical key for relation deduplication
 *
 * For symmetric relations, entities are ordered alphabetically
 * For asymmetric relations, preserve subject/object order
 */
function makeRelationKey(relation: Relation): string {
  const isSymmetric = SYMMETRIC_PREDICATES.has(relation.pred);

  if (isSymmetric) {
    // For symmetric relations, order entities alphabetically
    const [e1, e2] = [relation.subj, relation.obj].sort();
    return `${e1}::${relation.pred}::${e2}`;
  }

  // For asymmetric relations, preserve order
  return `${relation.subj}::${relation.pred}::${relation.obj}`;
}

/**
 * Merge evidence from multiple relation instances
 */
function mergeEvidence(relations: Relation[]): Relation['evidence'] {
  const seenSpans = new Set<string>();
  const mergedEvidence: Relation['evidence'] = [];

  for (const relation of relations) {
    for (const evidence of relation.evidence) {
      // Create unique key for this evidence span
      const spanKey = `${evidence.doc_id}:${evidence.span.start}-${evidence.span.end}`;

      if (!seenSpans.has(spanKey)) {
        seenSpans.add(spanKey);
        mergedEvidence.push(evidence);
      }
    }
  }

  return mergedEvidence;
}

/**
 * Choose best confidence from multiple extractions
 */
function chooseBestConfidence(relations: Relation[]): number {
  // Strategy: Use highest confidence (best pattern wins)
  return Math.max(...relations.map(r => r.confidence));
}

/**
 * Choose best extractor designation
 */
function chooseBestExtractor(relations: Relation[]): string {
  // Priority: dependency > regex > other
  const extractors = relations.map(r => r.extractor);

  if (extractors.includes('dependency')) return 'dependency';
  if (extractors.includes('regex')) return 'regex';
  return extractors[0];
}

/**
 * Deduplicate relations by merging duplicates
 *
 * Returns deduplicated list with merged evidence and best confidence
 */
export function deduplicateRelations(relations: Relation[]): Relation[] {
  const groups = new Map<string, Relation[]>();

  // Group relations by canonical key
  for (const relation of relations) {
    const key = makeRelationKey(relation);
    const group = groups.get(key);

    if (group) {
      group.push(relation);
    } else {
      groups.set(key, [relation]);
    }
  }

  // Merge each group
  const deduplicated: Relation[] = [];

  for (const [key, group] of groups) {
    if (group.length === 1) {
      // No duplicates, keep as-is
      deduplicated.push(group[0]);
    } else {
      // Merge duplicates
      const best = group[0]; // Use first as template

      const merged: Relation = {
        ...best,
        confidence: chooseBestConfidence(group),
        evidence: mergeEvidence(group),
        extractor: chooseBestExtractor(group),
      };

      deduplicated.push(merged);
    }
  }

  return deduplicated;
}

/**
 * Get deduplication statistics
 */
export interface DeduplicationStats {
  original: number;
  deduplicated: number;
  removed: number;
  removalRate: number;
  duplicateGroups: number;
  avgGroupSize: number;
  maxGroupSize: number;
}

export function getDeduplicationStats(
  originalRelations: Relation[],
  deduplicatedRelations: Relation[]
): DeduplicationStats {
  const groups = new Map<string, number>();

  // Count group sizes
  for (const relation of originalRelations) {
    const key = makeRelationKey(relation);
    groups.set(key, (groups.get(key) || 0) + 1);
  }

  const duplicateGroups = Array.from(groups.values()).filter(count => count > 1);
  const totalDuplicates = duplicateGroups.reduce((sum, count) => sum + count, 0);

  return {
    original: originalRelations.length,
    deduplicated: deduplicatedRelations.length,
    removed: originalRelations.length - deduplicatedRelations.length,
    removalRate: (originalRelations.length - deduplicatedRelations.length) / originalRelations.length,
    duplicateGroups: duplicateGroups.length,
    avgGroupSize: totalDuplicates / Math.max(duplicateGroups.length, 1),
    maxGroupSize: duplicateGroups.length > 0 ? Math.max(...duplicateGroups) : 0,
  };
}

/**
 * Check if relation deduplication is enabled
 *
 * DEFAULT: ENABLED (proven effective in Phase 1)
 * To disable: ARES_DEDUPLICATE=off
 */
export function isDeduplicationEnabled(): boolean {
  // Explicitly disabled
  if (process.env.ARES_DEDUPLICATE === 'off' || process.env.ARES_DEDUPLICATE === '0') {
    return false;
  }

  // Enabled by default (or explicitly enabled)
  return true;
}
