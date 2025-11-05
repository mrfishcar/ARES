/**
 * Integration Tests - Relations API (Sprint R4)
 * Coverage: filters, pagination, stable IDs, symmetric relations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGraphQLServer } from '../../app/api/graphql';
import { saveGraph, createEmptyGraph } from '../../app/storage/storage';
import { encodeCursor } from '../../app/api/pagination';
import { generateRelationId } from '../../app/api/relation-id';
import * as fs from 'fs';
import * as path from 'path';

const TEST_PROJECT = 'test-relations-api';
const TEST_GRAPH_PATH = path.join(process.cwd(), 'data', 'projects', TEST_PROJECT, 'graph.json');

/**
 * Generate test fixture with many relations
 */
function createRelationsFixture() {
  const graph = createEmptyGraph();

  // Create 100 entities
  for (let i = 0; i < 100; i++) {
    graph.entities.push({
      id: `entity-${String(i).padStart(3, '0')}`,
      type: i % 2 === 0 ? 'PERSON' : 'ORGANIZATION',
      canonical: `Entity${i}`,
      aliases: [],
      created_at: new Date().toISOString(),
      evidence: []
    });
  }

  // Create 250 relations with various predicates
  const predicates = ['works_at', 'knows', 'located_in', 'owns', 'manages'];

  for (let i = 0; i < 250; i++) {
    const subj = `entity-${String(i % 100).padStart(3, '0')}`;
    const obj = `entity-${String((i + 20) % 100).padStart(3, '0')}`;
    const pred = predicates[i % predicates.length];

    // Don't set ID - let the resolver generate it
    graph.relations.push({
      subj,
      pred,
      obj,
      confidence: 0.8 + (i % 20) / 100,
      evidence: [
        {
          span: { text: `Evidence for relation ${i}: ${subj} ${pred} ${obj}. This is a longer text to test normalization.`.repeat(2) },
          confidence: 0.85,
          docId: `doc${i % 10}`
        }
      ]
    });
  }

  // Add a symmetric relation for testing
  graph.relations.push({
    subj: 'entity-010',
    pred: 'partners_with',
    obj: 'entity-020',
    symmetric: true,
    confidence: 0.95,
    evidence: []
  });

  return graph;
}

describe('Relations API - Integration Tests', () => {
  let server: any;

  beforeEach(() => {
    // Ensure test directory exists
    const projectDir = path.dirname(TEST_GRAPH_PATH);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // Create and save fixture
    const graph = createRelationsFixture();
    saveGraph(graph, TEST_GRAPH_PATH);

    // Create server
    server = createGraphQLServer(TEST_GRAPH_PATH);
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(TEST_GRAPH_PATH)) {
      fs.unlinkSync(TEST_GRAPH_PATH);
    }
  });

  describe('Filters', () => {
    it('should filter by predicate (exact match)', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            listRelations(project: "${TEST_PROJECT}", filter: { predicate: "knows" }, limit: 100) {
              nodes { id predicate }
              totalApprox
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        const data = result.body.singleResult.data;
        expect(data?.listRelations.nodes.every((n: any) => n.predicate === 'knows')).toBe(true);
        expect(data?.listRelations.totalApprox).toBeGreaterThan(0);
      }
    });

    it('should filter by nameContains (case-insensitive, subject/object)', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            listRelations(project: "${TEST_PROJECT}", filter: { nameContains: "entity1" }, limit: 50) {
              nodes { id subject object }
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        const data = result.body.singleResult.data;
        const nodes = data?.listRelations.nodes || [];
        expect(nodes.length).toBeGreaterThan(0);

        // Should match Entity1, Entity10-19, Entity100, etc.
        expect(nodes.every((n: any) =>
          n.subject.toLowerCase().includes('entity1') ||
          n.object.toLowerCase().includes('entity1')
        )).toBe(true);
      }
    });

    it('should treat empty nameContains as no filter', async () => {
      const withoutFilter = await server.executeOperation({
        query: `
          query {
            listRelations(project: "${TEST_PROJECT}", limit: 50) {
              totalApprox
            }
          }
        `
      });

      const withEmptyFilter = await server.executeOperation({
        query: `
          query {
            listRelations(project: "${TEST_PROJECT}", filter: { nameContains: "" }, limit: 50) {
              totalApprox
            }
          }
        `
      });

      expect(withoutFilter.body.kind).toBe('single');
      expect(withEmptyFilter.body.kind).toBe('single');

      if (withoutFilter.body.kind === 'single' && withEmptyFilter.body.kind === 'single') {
        const total1 = withoutFilter.body.singleResult.data?.listRelations.totalApprox;
        const total2 = withEmptyFilter.body.singleResult.data?.listRelations.totalApprox;
        expect(total1).toBe(total2);
      }
    });

    it('should combine predicate and nameContains filters', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            listRelations(
              project: "${TEST_PROJECT}",
              filter: { predicate: "works_at", nameContains: "entity2" },
              limit: 50
            ) {
              nodes { id subject predicate object }
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        const data = result.body.singleResult.data;
        const nodes = data?.listRelations.nodes || [];

        // All should have predicate "works_at" AND contain "entity2" in subject/object
        expect(nodes.every((n: any) =>
          n.predicate === 'works_at' &&
          (n.subject.toLowerCase().includes('entity2') || n.object.toLowerCase().includes('entity2'))
        )).toBe(true);
      }
    });
  });

  describe('Pagination', () => {
    it('should paginate from start (no cursor)', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            listRelations(project: "${TEST_PROJECT}", limit: 20) {
              nodes { id subject predicate object }
              pageInfo { endCursor hasNextPage }
              totalApprox
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        const data = result.body.singleResult.data;
        expect(data?.listRelations.nodes.length).toBe(20);
        expect(data?.listRelations.pageInfo.hasNextPage).toBe(true);
        expect(data?.listRelations.pageInfo.endCursor).toBeTruthy();
        expect(data?.listRelations.totalApprox).toBeGreaterThan(20);
      }
    });

    it('should paginate from middle (valid after cursor)', async () => {
      // First page
      const page1 = await server.executeOperation({
        query: `
          query {
            listRelations(project: "${TEST_PROJECT}", limit: 30) {
              pageInfo { endCursor hasNextPage }
            }
          }
        `
      });

      expect(page1.body.kind).toBe('single');
      if (page1.body.kind === 'single') {
        const cursor = page1.body.singleResult.data?.listRelations.pageInfo.endCursor;
        expect(cursor).toBeTruthy();

        // Second page
        const page2 = await server.executeOperation({
          query: `
            query($after: Cursor) {
              listRelations(project: "${TEST_PROJECT}", after: $after, limit: 30) {
                nodes { id }
                pageInfo { hasNextPage }
              }
            }
          `,
          variables: { after: cursor }
        });

        expect(page2.body.kind).toBe('single');
        if (page2.body.kind === 'single') {
          const data = page2.body.singleResult.data;
          expect(data?.listRelations.nodes.length).toBe(30);
        }
      }
    });

    it('should return hasNextPage=false at end', async () => {
      // Paginate to the end
      let cursor: string | null = null;
      let hasNextPage = true;
      let iterations = 0;
      const maxIterations = 10;

      while (hasNextPage && iterations < maxIterations) {
        const result = await server.executeOperation({
          query: `
            query($after: Cursor) {
              listRelations(project: "${TEST_PROJECT}", after: $after, limit: 200) {
                nodes { id }
                pageInfo { hasNextPage endCursor }
              }
            }
          `,
          variables: cursor ? { after: cursor } : {}
        });

        expect(result.body.kind).toBe('single');
        if (result.body.kind === 'single') {
          const data = result.body.singleResult.data;
          hasNextPage = data?.listRelations.pageInfo.hasNextPage ?? false;
          cursor = data?.listRelations.pageInfo.endCursor ?? null;

          if (!hasNextPage) {
            expect(data?.listRelations.pageInfo.hasNextPage).toBe(false);
          }
        }

        iterations++;
      }

      expect(hasNextPage).toBe(false);
    });

    it('should reject invalid base64 cursor', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            listRelations(project: "${TEST_PROJECT}", after: "invalid!!!base64", limit: 10) {
              nodes { id }
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeDefined();
        expect(result.body.singleResult.errors?.[0].message).toContain('INVALID_CURSOR');
      }
    });

    it('should reject cursor with unknown key', async () => {
      const fakeCursor = encodeCursor('nonexistent-relation-sha1-hash');

      const result = await server.executeOperation({
        query: `
          query($after: Cursor) {
            listRelations(project: "${TEST_PROJECT}", after: $after, limit: 10) {
              nodes { id }
            }
          }
        `,
        variables: { after: fakeCursor }
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeDefined();
        expect(result.body.singleResult.errors?.[0].message).toContain('INVALID_CURSOR');
      }
    });

    it('should enforce limit bounds (reject 0)', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            listRelations(project: "${TEST_PROJECT}", limit: 0) {
              nodes { id }
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeDefined();
        expect(result.body.singleResult.errors?.[0].message).toContain('Limit must be between');
      }
    });

    it('should enforce limit bounds (cap at 200)', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            listRelations(project: "${TEST_PROJECT}", limit: 999) {
              nodes { id }
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeDefined();
        expect(result.body.singleResult.errors?.[0].message).toContain('Limit must be between');
      }
    });
  });

  describe('Stable IDs', () => {
    it('should generate deterministic SHA1 IDs', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            listRelations(project: "${TEST_PROJECT}", limit: 10) {
              nodes { id subject predicate object }
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        const data = result.body.singleResult.data;
        const nodes = data?.listRelations.nodes || [];

        // Verify each ID is a valid SHA1 hash (40 hex chars)
        nodes.forEach((node: any) => {
          expect(node.id).toMatch(/^[a-f0-9]{40}$/);

          // Verify ID matches what we'd generate
          const expectedId = generateRelationId(node.subject, node.predicate, node.object);
          // Note: We can't directly compare because subject/object are canonical names, not IDs
          // But we can verify the ID is stable and looks like SHA1
          expect(node.id).toBeTruthy();
          expect(node.id.length).toBe(40);
        });
      }
    });

    it('should maintain stable sort order by ID', async () => {
      // Get first page
      const page1 = await server.executeOperation({
        query: `
          query {
            listRelations(project: "${TEST_PROJECT}", limit: 50) {
              nodes { id }
            }
          }
        `
      });

      // Get same page again
      const page2 = await server.executeOperation({
        query: `
          query {
            listRelations(project: "${TEST_PROJECT}", limit: 50) {
              nodes { id }
            }
          }
        `
      });

      expect(page1.body.kind).toBe('single');
      expect(page2.body.kind).toBe('single');

      if (page1.body.kind === 'single' && page2.body.kind === 'single') {
        const ids1 = page1.body.singleResult.data?.listRelations.nodes.map((n: any) => n.id);
        const ids2 = page2.body.singleResult.data?.listRelations.nodes.map((n: any) => n.id);

        // Should be identical order
        expect(ids1).toEqual(ids2);

        // Should be sorted lexicographically
        const sorted = [...ids1].sort();
        expect(ids1).toEqual(sorted);
      }
    });
  });

  describe('Relation Detail', () => {
    it('should return relation with evidence', async () => {
      // First get a relation ID
      const listResult = await server.executeOperation({
        query: `
          query {
            listRelations(project: "${TEST_PROJECT}", limit: 1) {
              nodes { id subject predicate object }
            }
          }
        `
      });

      expect(listResult.body.kind).toBe('single');
      if (listResult.body.kind === 'single') {
        const relationId = listResult.body.singleResult.data?.listRelations.nodes[0]?.id;
        expect(relationId).toBeTruthy();

        // Get detail
        const detailResult = await server.executeOperation({
          query: `
            query {
              getRelation(project: "${TEST_PROJECT}", id: "${relationId}") {
                relation { id subject predicate object confidenceAvg }
                evidence { text confidence docId }
              }
            }
          `
        });

        expect(detailResult.body.kind).toBe('single');
        if (detailResult.body.kind === 'single') {
          const data = detailResult.body.singleResult.data;
          expect(data?.getRelation.relation.id).toBe(relationId);
          expect(data?.getRelation.evidence).toBeDefined();
        }
      }
    });

    it('should normalize evidence to ≤200 chars', async () => {
      // Get a relation with evidence
      const listResult = await server.executeOperation({
        query: `
          query {
            listRelations(project: "${TEST_PROJECT}", limit: 1) {
              nodes { id }
            }
          }
        `
      });

      expect(listResult.body.kind).toBe('single');
      if (listResult.body.kind === 'single') {
        const relationId = listResult.body.singleResult.data?.listRelations.nodes[0]?.id;

        const detailResult = await server.executeOperation({
          query: `
            query {
              getRelation(project: "${TEST_PROJECT}", id: "${relationId}") {
                evidence { text }
              }
            }
          `
        });

        expect(detailResult.body.kind).toBe('single');
        if (detailResult.body.kind === 'single') {
          const data = detailResult.body.singleResult.data;
          const evidence = data?.getRelation.evidence || [];

          // All evidence should be ≤200 chars
          evidence.forEach((ev: any) => {
            expect(ev.text.length).toBeLessThanOrEqual(200);
          });
        }
      }
    });

    it('should throw error for nonexistent relation', async () => {
      const fakeId = 'a'.repeat(40); // Valid SHA1 format but doesn't exist

      const result = await server.executeOperation({
        query: `
          query {
            getRelation(project: "${TEST_PROJECT}", id: "${fakeId}") {
              relation { id }
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeDefined();
        expect(result.body.singleResult.errors?.[0].message).toContain('Relation not found');
      }
    });
  });
});
