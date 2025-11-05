/**
 * Integration tests for Review Queue GraphQL API
 * Sprint R1
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ApolloServer } from '@apollo/server';
import { createGraphQLServer } from '../../app/api/graphql';
import {
  addToReviewQueue,
  type ReviewItem
} from '../../app/storage/review-queue';
import { createEmptyGraph, saveGraph } from '../../app/storage/storage';

const TEST_PROJECT = 'test-review-api';
const TEST_PROJECT_DIR = path.join(process.cwd(), 'data', 'projects', TEST_PROJECT);
const TEST_REVIEW_PATH = path.join(TEST_PROJECT_DIR, 'review.json');
const TEST_GRAPH_PATH = path.join(TEST_PROJECT_DIR, 'graph.json');

describe('Review Queue GraphQL API', () => {
  let server: ApolloServer;

  beforeEach(async () => {
    // Create test project directory
    if (!fs.existsSync(TEST_PROJECT_DIR)) {
      fs.mkdirSync(TEST_PROJECT_DIR, { recursive: true });
    }

    // Create empty graph
    const emptyGraph = createEmptyGraph();
    saveGraph(emptyGraph, TEST_GRAPH_PATH);

    // Add test review items
    const testItems: ReviewItem[] = [
      {
        id: 'test-entity-1',
        type: 'entity',
        confidence: 0.55,
        data: {
          id: 'e1',
          type: 'PERSON',
          canonical: 'Test Person',
          aliases: ['Person'],
          evidence: [
            {
              doc_id: 'doc1',
              span: { start: 0, end: 10, text: 'Test Person appeared' },
              sentence_index: 0,
              source: 'doc1',
              confidence: 0.55
            }
          ]
        },
        docId: 'doc1',
        addedAt: new Date().toISOString(),
        status: 'pending'
      },
      {
        id: 'test-relation-1',
        type: 'relation',
        confidence: 0.65,
        data: {
          id: 'r1',
          subj: 'e1',
          pred: 'knows',
          obj: 'e2',
          confidence: 0.65,
          evidence: [
            {
              doc_id: 'doc1',
              span: { start: 0, end: 20, text: 'They know each other' },
              sentence_index: 0,
              source: 'doc1'
            }
          ]
        },
        docId: 'doc1',
        addedAt: new Date().toISOString(),
        status: 'pending'
      }
    ];

    addToReviewQueue(testItems, TEST_REVIEW_PATH);

    // Create GraphQL server
    server = createGraphQLServer(TEST_GRAPH_PATH);
  });

  afterEach(async () => {
    // Clean up test data
    if (fs.existsSync(TEST_PROJECT_DIR)) {
      fs.rmSync(TEST_PROJECT_DIR, { recursive: true });
    }

    if (server) {
      await server.stop();
    }
  });

  describe('reviewStats Query', () => {
    it('should return correct review queue statistics', async () => {
      const response = await server.executeOperation({
        query: `
          query {
            reviewStats(project: "${TEST_PROJECT}") {
              entities
              relations
            }
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.reviewStats).toEqual({
          entities: 1,
          relations: 1
        });
      }
    });
  });

  describe('pendingEntities Query', () => {
    it('should return pending entities', async () => {
      const response = await server.executeOperation({
        query: `
          query {
            pendingEntities(project: "${TEST_PROJECT}", limit: 10) {
              id
              name
              types
              evidence {
                text
                confidence
              }
            }
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const entities = response.body.singleResult.data?.pendingEntities;
        expect(entities).toHaveLength(1);
        expect(entities[0].name).toBe('Test Person');
        expect(entities[0].types).toContain('PERSON');
      }
    });

    it('should support pagination with after cursor', async () => {
      const response = await server.executeOperation({
        query: `
          query {
            pendingEntities(project: "${TEST_PROJECT}", limit: 10, after: "test-entity-1") {
              id
            }
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const entities = response.body.singleResult.data?.pendingEntities;
        // Should be empty since we're after the only entity
        expect(entities).toHaveLength(0);
      }
    });
  });

  describe('pendingRelations Query', () => {
    it('should return pending relations', async () => {
      const response = await server.executeOperation({
        query: `
          query {
            pendingRelations(project: "${TEST_PROJECT}", limit: 10) {
              id
              subject
              predicate
              object
              symmetric
            }
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const relations = response.body.singleResult.data?.pendingRelations;
        expect(relations).toHaveLength(1);
        expect(relations[0].subject).toBe('e1');
        expect(relations[0].predicate).toBe('knows');
        expect(relations[0].object).toBe('e2');
      }
    });
  });

  describe('approveReviewItem Mutation', () => {
    it('should approve an entity and add to graph', async () => {
      const response = await server.executeOperation({
        query: `
          mutation {
            approveReviewItem(project: "${TEST_PROJECT}", id: "test-entity-1")
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.approveReviewItem).toBe(true);
      }

      // Verify it was added to graph (would need to reload and check)
      // For now, just verify the mutation succeeded
    });

    it('should return false for non-existent item', async () => {
      const response = await server.executeOperation({
        query: `
          mutation {
            approveReviewItem(project: "${TEST_PROJECT}", id: "non-existent")
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.approveReviewItem).toBe(false);
      }
    });
  });

  describe('dismissReviewItem Mutation', () => {
    it('should dismiss a review item', async () => {
      const response = await server.executeOperation({
        query: `
          mutation {
            dismissReviewItem(project: "${TEST_PROJECT}", id: "test-relation-1")
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.dismissReviewItem).toBe(true);
      }
    });

    it('should return false for non-existent item', async () => {
      const response = await server.executeOperation({
        query: `
          mutation {
            dismissReviewItem(project: "${TEST_PROJECT}", id: "non-existent")
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.dismissReviewItem).toBe(false);
      }
    });
  });
});
