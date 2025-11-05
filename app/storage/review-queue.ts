/**
 * Review Queue for Low-Confidence Extractions
 * Extends ARES storage with confidence gating
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Entity, Relation } from '../engine/schema';

export interface ReviewItem {
  id: string;
  type: 'entity' | 'relation';
  confidence: number;
  data: Entity | Relation;
  docId: string;
  addedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  notes?: string;
}

export interface ReviewQueue {
  items: ReviewItem[];
  metadata: {
    created_at: string;
    updated_at: string;
  };
}

export interface ConfidenceGates {
  ACCEPT: number;   // Auto-accept if confidence >= this (default: 0.70)
  REVIEW: number;   // Queue for review if confidence >= this (default: 0.40)
  // Below REVIEW threshold: silently reject
}

export const DEFAULT_GATES: ConfidenceGates = {
  ACCEPT: 0.70,
  REVIEW: 0.40
};

/**
 * Load review queue from file
 */
export function loadReviewQueue(filePath: string): ReviewQueue {
  if (!fs.existsSync(filePath)) {
    return {
      items: [],
      metadata: {
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    };
  }

  const data = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(data);
}

/**
 * Save review queue to file
 */
export function saveReviewQueue(queue: ReviewQueue, filePath: string): void {
  queue.metadata.updated_at = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(queue, null, 2), 'utf-8');
}

/**
 * Add items to review queue
 */
export function addToReviewQueue(
  items: ReviewItem[],
  filePath: string
): void {
  const queue = loadReviewQueue(filePath);
  queue.items.push(...items);
  saveReviewQueue(queue, filePath);
}

/**
 * Get pending review items
 */
export function getPendingReviews(filePath: string): ReviewItem[] {
  const queue = loadReviewQueue(filePath);
  return queue.items.filter(item => item.status === 'pending');
}

/**
 * Approve a review item
 */
export function approveReviewItem(itemId: string, filePath: string): ReviewItem | null {
  const queue = loadReviewQueue(filePath);
  const item = queue.items.find(i => i.id === itemId);
  if (!item) return null;

  item.status = 'approved';
  saveReviewQueue(queue, filePath);
  return item;
}

/**
 * Reject a review item
 */
export function rejectReviewItem(
  itemId: string,
  filePath: string,
  notes?: string
): ReviewItem | null {
  const queue = loadReviewQueue(filePath);
  const item = queue.items.find(i => i.id === itemId);
  if (!item) return null;

  item.status = 'rejected';
  if (notes) item.notes = notes;
  saveReviewQueue(queue, filePath);
  return item;
}

/**
 * Get approved items ready to merge into main graph
 */
export function getApprovedItems(filePath: string): ReviewItem[] {
  const queue = loadReviewQueue(filePath);
  return queue.items.filter(item => item.status === 'approved');
}

/**
 * Clear approved/rejected items from queue
 */
export function cleanReviewQueue(filePath: string): void {
  const queue = loadReviewQueue(filePath);
  queue.items = queue.items.filter(item => item.status === 'pending');
  saveReviewQueue(queue, filePath);
}

/**
 * Get structured review queue for GraphQL API
 */
export interface PendingEntity {
  id: string;
  name: string;
  aliases: string[];
  types: string[];
  evidence: Array<{ text: string; confidence: number }>;
  project: string;
  createdAt: string;
}

export interface PendingRelation {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  symmetric: boolean;
  evidence: Array<{ text: string; confidence: number }>;
  project: string;
  createdAt: string;
}

export function getReviewQueue(project: string): {
  entities: PendingEntity[];
  relations: PendingRelation[];
} {
  const filePath = path.join(process.cwd(), 'data', 'projects', project, 'review.json');
  const queue = loadReviewQueue(filePath);
  const pending = queue.items.filter(item => item.status === 'pending');

  const entities: PendingEntity[] = [];
  const relations: PendingRelation[] = [];

  for (const item of pending) {
    if (item.type === 'entity') {
      const entity = item.data as Entity;
      entities.push({
        id: item.id,
        name: entity.canonical,
        aliases: entity.aliases || [],
        types: [entity.type],
        evidence: [{
          text: entity.canonical,
          confidence: item.confidence
        }],
        project,
        createdAt: item.addedAt
      });
    } else if (item.type === 'relation') {
      const relation = item.data as Relation;
      relations.push({
        id: item.id,
        subject: relation.subj,
        predicate: relation.pred,
        object: relation.obj,
        symmetric: ['friends_with', 'married_to', 'sibling_of', 'ally_of', 'enemy_of'].includes(relation.pred),
        evidence: relation.evidence?.map((e: any) => ({
          text: e.span.text,
          confidence: 0 // Relations don't have per-evidence confidence in current schema
        })) || [],
        project,
        createdAt: item.addedAt
      });
    }
  }

  return { entities, relations };
}

/**
 * Approve a review item and merge into graph
 * Handles symmetric relations correctly
 */
export async function approveItem(project: string, itemId: string): Promise<boolean> {
  const projectDir = path.join(process.cwd(), 'data', 'projects', project);
  const reviewPath = path.join(projectDir, 'review.json');
  const graphPath = path.join(projectDir, 'graph.json');

  const { loadGraph, saveGraph } = await import('./storage');

  const queue = loadReviewQueue(reviewPath);
  const item = queue.items.find(i => i.id === itemId && i.status === 'pending');

  if (!item) return false;

  const graph = loadGraph(graphPath);
  if (!graph) return false;

  if (item.type === 'entity') {
    const entity = item.data as Entity;
    graph.entities.push(entity);
  } else if (item.type === 'relation') {
    const relation = item.data as Relation;

    // Check if this relation already exists
    const exists = graph.relations.some(r =>
      r.subj === relation.subj && r.pred === relation.pred && r.obj === relation.obj
    );

    if (!exists) {
      graph.relations.push(relation);

      // For symmetric relations, ensure inverse exists
      const symmetricPredicates = ['friends_with', 'married_to', 'sibling_of', 'ally_of', 'enemy_of'];
      if (symmetricPredicates.includes(relation.pred)) {
        const inverseExists = graph.relations.some(r =>
          r.subj === relation.obj && r.pred === relation.pred && r.obj === relation.subj
        );

        if (!inverseExists) {
          graph.relations.push({
            ...relation,
            id: require('uuid').v4(),
            subj: relation.obj,
            obj: relation.subj
          });
        }
      }
    }
  }

  // Mark as approved and save
  item.status = 'approved';
  saveGraph(graph, graphPath);
  saveReviewQueue(queue, reviewPath);

  return true;
}

/**
 * Dismiss a review item (remove from queue without adding to graph)
 */
export function dismissItem(project: string, itemId: string): boolean {
  const reviewPath = path.join(process.cwd(), 'data', 'projects', project, 'review.json');

  const queue = loadReviewQueue(reviewPath);
  const item = queue.items.find(i => i.id === itemId && i.status === 'pending');

  if (!item) return false;

  item.status = 'rejected';
  saveReviewQueue(queue, reviewPath);

  return true;
}
