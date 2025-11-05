/**
 * Bulk Review Operations - Sprint R6 Phase 3
 * Efficiently process multiple review items with safety caps
 */

import {
  loadReviewQueue,
  saveReviewQueue,
  approveItem,
  dismissItem,
  type ReviewItem
} from '../../storage/review-queue';
import { incrementCounter } from '../../monitor/metrics';
import * as path from 'path';

interface ReviewBulkFilter {
  type?: string;
  minConfidence?: number;
  nameContains?: string;
  maxItems?: number;
}

interface BulkActionResult {
  processed: number;
  approved: number;
  dismissed: number;
}

/**
 * Safety caps for bulk operations
 */
const DEFAULT_MAX_ITEMS = 100;
const HARD_CAP_MAX_ITEMS = 500;

/**
 * Apply filter to review items
 */
function filterReviewItems(
  items: ReviewItem[],
  filter: ReviewBulkFilter
): ReviewItem[] {
  let filtered = items.filter(item => item.status === 'pending');

  // Type filter (entity or relation)
  if (filter.type) {
    filtered = filtered.filter(item => item.type === filter.type);
  }

  // Confidence filter (minimum threshold)
  const minConfidence = filter.minConfidence;
  if (minConfidence !== undefined) {
    filtered = filtered.filter(item => item.confidence >= minConfidence);
  }

  // Name/text filter (case-insensitive substring match)
  if (filter.nameContains) {
    const searchTerm = filter.nameContains.toLowerCase();
    filtered = filtered.filter(item => {
      if (item.type === 'entity') {
        const entity = item.data as any;
        const matchesCanonical = entity.canonical?.toLowerCase().includes(searchTerm);
        const matchesAlias = (entity.aliases || []).some((alias: string) =>
          alias.toLowerCase().includes(searchTerm)
        );
        return matchesCanonical || matchesAlias;
      } else if (item.type === 'relation') {
        const relation = item.data as any;
        // Match on subject, predicate, or object
        return (
          relation.subj?.toLowerCase().includes(searchTerm) ||
          relation.pred?.toLowerCase().includes(searchTerm) ||
          relation.obj?.toLowerCase().includes(searchTerm)
        );
      }
      return false;
    });
  }

  // Apply maxItems cap (default 100, hard cap 500)
  const maxItems = Math.min(
    filter.maxItems || DEFAULT_MAX_ITEMS,
    HARD_CAP_MAX_ITEMS
  );

  return filtered.slice(0, maxItems);
}

export const bulkReviewResolvers = {
  Query: {
    /**
     * Preview bulk operation (dry-run)
     * Returns count of items that would be affected
     */
    previewBulkAction: (
      _: any,
      args: { project: string; filter: ReviewBulkFilter }
    ): { count: number; items: Array<{ id: string; type: string; confidence: number }> } => {
      const { project, filter } = args;
      const reviewPath = path.join(
        process.cwd(),
        'data',
        'projects',
        project,
        'review.json'
      );

      const queue = loadReviewQueue(reviewPath);
      const filtered = filterReviewItems(queue.items, filter);

      // Return first 10 items for preview with simplified data
      const previewItems = filtered.slice(0, 10).map(item => ({
        id: item.id,
        type: item.type,
        confidence: item.confidence
      }));

      return {
        count: filtered.length,
        items: previewItems
      };
    }
  },

  Mutation: {
    /**
     * Approve multiple review items matching filter
     * Returns result with counts
     */
    approveReviewBulk: async (
      _: any,
      args: { project: string; filter: ReviewBulkFilter }
    ): Promise<BulkActionResult> => {
      const { project, filter } = args;
      const reviewPath = path.join(
        process.cwd(),
        'data',
        'projects',
        project,
        'review.json'
      );

      // Load queue and apply filter
      const queue = loadReviewQueue(reviewPath);
      const itemsToApprove = filterReviewItems(queue.items, filter);

      let approved = 0;
      let failed = 0;

      // Process each item
      for (const item of itemsToApprove) {
        try {
          const success = await approveItem(project, item.id);
          if (success) {
            approved++;
            incrementCounter('review_approved_total');
          } else {
            failed++;
          }
        } catch (error) {
          console.error(`Failed to approve item ${item.id}:`, error);
          failed++;
        }
      }

      // Track bulk metrics
      incrementCounter('review_bulk_approved_total');

      return {
        processed: itemsToApprove.length,
        approved,
        dismissed: 0
      };
    },

    /**
     * Dismiss multiple review items matching filter
     * Returns result with counts
     */
    dismissReviewBulk: async (
      _: any,
      args: { project: string; filter: ReviewBulkFilter }
    ): Promise<BulkActionResult> => {
      const { project, filter } = args;
      const reviewPath = path.join(
        process.cwd(),
        'data',
        'projects',
        project,
        'review.json'
      );

      // Load queue and apply filter
      const queue = loadReviewQueue(reviewPath);
      const itemsToDismiss = filterReviewItems(queue.items, filter);

      let dismissed = 0;
      let failed = 0;

      // Process each item
      for (const item of itemsToDismiss) {
        try {
          const success = dismissItem(project, item.id);
          if (success) {
            dismissed++;
            incrementCounter('review_dismissed_total');
          } else {
            failed++;
          }
        } catch (error) {
          console.error(`Failed to dismiss item ${item.id}:`, error);
          failed++;
        }
      }

      // Track bulk metrics
      incrementCounter('review_bulk_dismissed_total');

      return {
        processed: itemsToDismiss.length,
        approved: 0,
        dismissed
      };
    }
  }
};
