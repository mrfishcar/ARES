/**
 * Stage 8: Relation Filtering Stage
 *
 * Responsibility: Filter false positive relations (Precision Defense Layer 2)
 *
 * Filters:
 * 1. Married_to proximity suppression - Don't extract parent_of between spouses
 * 2. Sibling detection - Block parent_of/child_of for entities marked as siblings
 * 3. Appositive filtering - Handle coordinated vs appositive subjects
 * 4. Confidence thresholding - Remove low-confidence extractions
 *
 * Example:
 * "Aragorn married Arwen. They had a son Eldarion."
 * → Block parent_of(Aragorn, Arwen) due to married_to in proximity
 * → Keep parent_of(Aragorn, Eldarion)
 *
 * Expected Impact: +15-20% precision improvement
 */

import type { Relation, Entity } from '../schema';
import type {
  RelationFilteringInput,
  RelationFilteringOutput,
  RelationFilterStats
} from './types';

const STAGE_NAME = 'RelationFilteringStage';

// Sibling appositive pattern (Pattern FM-1 from LINGUISTIC_REFERENCE.md)
const SIBLING_APPOSITIVE_PATTERN = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*,\s*(?:the\s+)?(?:eldest|oldest|younger|youngest|twin|middle)\s+(?:son|daughter|child|brother|sister|sibling)\b/gi;

/**
 * Filter false positive relations
 */
export async function runRelationFilteringStage(
  input: RelationFilteringInput
): Promise<RelationFilteringOutput> {
  const startTime = Date.now();
  console.log(`[${STAGE_NAME}] Starting with ${input.relations.length} relations`);

  try {
    // Validate input
    if (!input.relations || !Array.isArray(input.relations)) {
      throw new Error('Invalid input: relations must be an array');
    }

    if (!input.entities || !Array.isArray(input.entities)) {
      throw new Error('Invalid input: entities must be an array');
    }

    if (!input.fullText || typeof input.fullText !== 'string') {
      throw new Error('Invalid input: fullText must be a non-empty string');
    }

    const stats: RelationFilterStats = {
      original: input.relations.length,
      filtered: 0,
      removed: 0,
      removalRate: 0,
      removedByReason: {
        marriedToSuppression: 0,
        siblingDetection: 0,
        appositiveFiltering: 0,
        confidenceThreshold: 0
      }
    };

    let filteredRelations = input.relations;

    // ========================================================================
    // FILTER 1: MARRIED_TO PROXIMITY SUPPRESSION
    // ========================================================================

    if (input.config.marriedToSuppressionEnabled) {
      // Collect all married_to relations WITH their sentence indices
      const marriedToRelations = new Set<string>();
      const marriedToSentences = new Map<string, Set<number>>();

      for (const rel of input.relations) {
        if (rel.pred === 'married_to') {
          const key1 = `${rel.subj}:${rel.obj}`;
          const key2 = `${rel.obj}:${rel.subj}`;
          marriedToRelations.add(key1);
          marriedToRelations.add(key2);

          if (!marriedToSentences.has(key1)) marriedToSentences.set(key1, new Set());
          if (!marriedToSentences.has(key2)) marriedToSentences.set(key2, new Set());

          rel.evidence.forEach(e => {
            marriedToSentences.get(key1)!.add(e.sentence_index);
            marriedToSentences.get(key2)!.add(e.sentence_index);
          });
        }
      }

      // Helper: Check if married_to exists within proximity window
      const hasMarriedToInProximity = (rel: Relation): boolean => {
        const key = `${rel.subj}:${rel.obj}`;
        if (!marriedToRelations.has(key)) return false;

        const relationSentences = new Set(rel.evidence.map(e => e.sentence_index));
        const marriedSentences = marriedToSentences.get(key);
        if (!marriedSentences) return false;

        for (const sentIdx of relationSentences) {
          for (let offset = -input.config.marriedToProximityWindow; offset <= input.config.marriedToProximityWindow; offset++) {
            if (marriedSentences.has(sentIdx + offset)) {
              return true; // Conflict within proximity
            }
          }
        }
        return false;
      };

      const preMarriedFilter = filteredRelations.length;

      filteredRelations = filteredRelations.filter(rel => {
        if ((rel.pred === 'parent_of' || rel.pred === 'child_of') && hasMarriedToInProximity(rel)) {
          // Also check confidence for extra safety
          const marriedToForPair = input.relations.find(r =>
            r.pred === 'married_to' &&
            ((r.subj === rel.subj && r.obj === rel.obj) || (r.subj === rel.obj && r.obj === rel.subj))
          );

          if (marriedToForPair && marriedToForPair.confidence > 0.75) {
            const subj = input.entities.find(e => e.id === rel.subj);
            const obj = input.entities.find(e => e.id === rel.obj);
            console.log(
              `[${STAGE_NAME}] Suppressing ${rel.pred}: ${subj?.canonical} -> ${obj?.canonical} (married_to in proximity, conf ${marriedToForPair.confidence.toFixed(2)})`
            );
            stats.removedByReason.marriedToSuppression++;
            return false;
          }
        }
        return true;
      });

      console.log(
        `[${STAGE_NAME}] Married_to suppression: ${preMarriedFilter} → ${filteredRelations.length} (-${preMarriedFilter - filteredRelations.length})`
      );
    }

    // ========================================================================
    // FILTER 2: SIBLING DETECTION
    // ========================================================================

    if (input.config.siblingDetectionEnabled) {
      // Detect siblings from full text
      const siblingsWithIndicators = new Set<string>();
      const siblingMatches = input.fullText.matchAll(SIBLING_APPOSITIVE_PATTERN);

      for (const match of siblingMatches) {
        siblingsWithIndicators.add(match[1].toLowerCase());
      }

      console.log(
        `[${STAGE_NAME}] Detected siblings: ${Array.from(siblingsWithIndicators).join(', ') || 'none'}`
      );

      const preSiblingFilter = filteredRelations.length;

      filteredRelations = filteredRelations.filter(rel => {
        // Block parent_of if subject has sibling indicator
        if (rel.pred === 'parent_of') {
          const subj = input.entities.find(e => e.id === rel.subj);
          if (subj && siblingsWithIndicators.has(subj.canonical.toLowerCase())) {
            console.log(
              `[${STAGE_NAME}] Blocking parent_of: ${subj?.canonical} -> ${input.entities.find(e => e.id === rel.obj)?.canonical} (${subj.canonical} has sibling indicator)`
            );
            stats.removedByReason.siblingDetection++;
            return false;
          }
        }

        // Block child_of if object has sibling indicator
        if (rel.pred === 'child_of') {
          const obj = input.entities.find(e => e.id === rel.obj);
          if (obj && siblingsWithIndicators.has(obj.canonical.toLowerCase())) {
            console.log(
              `[${STAGE_NAME}] Blocking child_of: ${input.entities.find(e => e.id === rel.subj)?.canonical} -> ${obj?.canonical} (${obj.canonical} has sibling indicator)`
            );
            stats.removedByReason.siblingDetection++;
            return false;
          }
        }

        return true;
      });

      console.log(
        `[${STAGE_NAME}] Sibling detection: ${preSiblingFilter} → ${filteredRelations.length} (-${preSiblingFilter - filteredRelations.length})`
      );
    }

    // ========================================================================
    // FILTER 3: APPOSITIVE FILTERING
    // ========================================================================

    if (input.config.appositiveFilteringEnabled) {
      // Group relations by (pred, obj) to detect appositives
      const predObjToSubjects = new Map<string, Array<{
        rel: Relation;
        position: number;
        subjectCanonical: string;
      }>>();

      for (const rel of filteredRelations) {
        const predObjKey = `${rel.pred}::${rel.obj}`;

        const subjEntity = input.entities.find(e => e.id === rel.subj);
        const subjSpan = input.spans.find(s => s.entity_id === rel.subj);
        const position = subjSpan ? subjSpan.start : Infinity;
        const subjectCanonical = subjEntity?.canonical.toLowerCase() || '';

        // Skip relations with invalid/empty subjects
        if (!subjectCanonical || !subjEntity) {
          console.log(
            `[${STAGE_NAME}] Skipping relation with empty subject (pred=${rel.pred}, obj=${rel.obj})`
          );
          continue;
        }

        if (!predObjToSubjects.has(predObjKey)) {
          predObjToSubjects.set(predObjKey, []);
        }
        predObjToSubjects.get(predObjKey)!.push({ rel, position, subjectCanonical });
      }

      const appositiveFilteredRelations: Relation[] = [];

      for (const [predObjKey, group] of predObjToSubjects.entries()) {
        if (group.length === 1) {
          // No conflict, keep the relation
          appositiveFilteredRelations.push(group[0].rel);
        } else {
          // Check if subjects are likely coordinated vs appositive
          group.sort((a, b) => a.position - b.position);

          const objEntity = input.entities.find(e => e.id === group[0].rel.obj);
          const objCanonical = objEntity?.canonical || 'UNKNOWN';

          console.log(
            `[${STAGE_NAME}] Checking ${predObjKey} with ${group.length} subjects (obj="${objCanonical}"):`
          );

          for (const item of group) {
            console.log(`  - ${item.subjectCanonical} at position ${item.position}`);
          }

          // Determine if coordination or appositive
          const isCoordination = group.every((item, idx) => {
            if (idx === 0) return true;
            const prevCanonical = group[idx - 1].subjectCanonical;
            const currCanonical = item.subjectCanonical;
            const prevPosition = group[idx - 1].position;
            const currPosition = item.position;

            // Skip exact duplicates
            if (prevCanonical === currCanonical && prevPosition === currPosition) {
              console.log(`[${STAGE_NAME}]   ${currCanonical} at ${currPosition} is duplicate - SKIP`);
              return true;
            }

            // If one is substring of the other, it's likely appositive
            if (prevCanonical !== currCanonical && (prevCanonical.includes(currCanonical) || currCanonical.includes(prevCanonical))) {
              console.log(`[${STAGE_NAME}]   ${currCanonical} substring of ${prevCanonical} - APPOSITIVE`);
              return false;
            }

            // If very close (within 100 chars), likely coordination
            const distance = Math.abs(currPosition - prevPosition);
            console.log(`[${STAGE_NAME}]   Distance between ${prevCanonical} and ${currCanonical}: ${distance}`);
            return distance < 100;
          });

          console.log(`[${STAGE_NAME}]   isCoordination: ${isCoordination}`);

          if (isCoordination) {
            // Keep all coordinated subjects
            console.log(`[${STAGE_NAME}]   Keeping all ${group.length} subjects`);
            for (const item of group) {
              appositiveFilteredRelations.push(item.rel);
            }
          } else {
            // Appositive case - keep only first subject
            console.log(`[${STAGE_NAME}]   Appositive detected - keeping only first subject`);
            appositiveFilteredRelations.push(group[0].rel);
            stats.removedByReason.appositiveFiltering += group.length - 1;
          }
        }
      }

      const preAppositiveFilter = filteredRelations.length;
      filteredRelations = appositiveFilteredRelations;

      console.log(
        `[${STAGE_NAME}] Appositive filtering: ${preAppositiveFilter} → ${filteredRelations.length} (-${preAppositiveFilter - filteredRelations.length})`
      );
    }

    // ========================================================================
    // FILTER 4: CONFIDENCE THRESHOLD
    // ========================================================================

    if (input.config.minConfidence > 0) {
      const preConfidenceFilter = filteredRelations.length;

      filteredRelations = filteredRelations.filter(rel => {
        if (rel.confidence < input.config.minConfidence) {
          stats.removedByReason.confidenceThreshold++;
          return false;
        }
        return true;
      });

      console.log(
        `[${STAGE_NAME}] Confidence threshold (${input.config.minConfidence}): ${preConfidenceFilter} → ${filteredRelations.length} (-${preConfidenceFilter - filteredRelations.length})`
      );
    }

    // Update stats
    stats.filtered = filteredRelations.length;
    stats.removed = stats.original - stats.filtered;
    stats.removalRate = stats.removed / stats.original;

    const duration = Date.now() - startTime;
    console.log(
      `[${STAGE_NAME}] Complete in ${duration}ms: ${stats.original} → ${stats.filtered} relations (-${stats.removed}, ${(stats.removalRate * 100).toFixed(1)}%)`
    );
    console.log(`[${STAGE_NAME}] Removal breakdown:`);
    console.log(`  - Married_to suppression: ${stats.removedByReason.marriedToSuppression}`);
    console.log(`  - Sibling detection: ${stats.removedByReason.siblingDetection}`);
    console.log(`  - Appositive filtering: ${stats.removedByReason.appositiveFiltering}`);
    console.log(`  - Confidence threshold: ${stats.removedByReason.confidenceThreshold}`);

    return {
      relations: filteredRelations,
      filterStats: stats
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${STAGE_NAME}] Failed after ${duration}ms:`, error);
    throw new Error(`[${STAGE_NAME}] ${(error as Error).message}`, {
      cause: error
    });
  }
}
