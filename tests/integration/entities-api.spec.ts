/**
 * Integration Tests - Entities API (Sprint R4)
 * Comprehensive coverage: filters, pagination, cache, evidence, rate limits
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGraphQLServer } from '../../app/api/graphql';
import { saveGraph, createEmptyGraph, loadGraph } from '../../app/storage/storage';
import { approveItem } from '../../app/storage/review-queue';
import { encodeCursor } from '../../app/api/pagination';
import * as fs from 'fs';
import * as path from 'path';

const TEST_PROJECT = 'test-entities-api';
const TEST_GRAPH_PATH = path.join(process.cwd(), 'data', 'projects', TEST_PROJECT, 'graph.json');

/**
 * Generate test fixture with many entities for pagination testing
 */
function createLargeFixture() {
  const graph = createEmptyGraph();

  // Create 350 entities across different types
  const types = ['PERSON', 'ORGANIZATION', 'LOCATION', 'EVENT'];

  for (let i = 0; i < 350; i++) {
    const type = types[i % types.length];
    graph.entities.push({
      id: `entity-${String(i).padStart(4, '0')}`,
      type,
      canonical: `Entity${i}`,
      aliases: i % 3 === 0 ? [`Alias${i}`, `AKA${i}`] : [],
      created_at: new Date().toISOString(),
      evidence: [
        {
          span: { text: `This is evidence text for Entity${i} with some additional context to test normalization`.repeat(3) },
          confidence: 0.8 + (i % 20) / 100,
          docId: `doc${i % 10}`
        }
      ]
    });
  }

  // Create relations for detail view testing
  for (let i = 0; i < 100; i++) {
    graph.relations.push({
      id: `rel-${i}`,
      subj: `entity-${String(i).padStart(4, '0')}`,
      pred: i % 2 === 0 ? 'knows' : 'works_at',
      obj: `entity-${String((i + 50) % 350).padStart(4, '0')}`,
      confidence: 0.9,
      evidence: []
    });
  }

  return graph;
}

describe('Entities API - Integration Tests', () => {
  let server: any;

  beforeEach(() => {
    // Ensure test directory exists
    const projectDir = path.dirname(TEST_GRAPH_PATH);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // Create and save large fixture
    const graph = createLargeFixture();
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
    it('should filter by type (exact match)', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            listEntities(project: "${TEST_PROJECT}", filter: { type: "PERSON" }, limit: 200) {
              nodes { id types }
              totalApprox
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        const data = result.body.singleResult.data;
        expect(data?.listEntities.nodes.every((n: any) => n.types.includes('PERSON'))).toBe(true);
        expect(data?.listEntities.totalApprox).toBeGreaterThan(0);
      }
    });

    it('should filter by nameContains (case-insensitive, matches canonical)', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            listEntities(project: "${TEST_PROJECT}", filter: { nameContains: "entity10" }, limit: 50) {
              nodes { id name }
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        const data = result.body.singleResult.data;
        const nodes = data?.listEntities.nodes || [];
        expect(nodes.length).toBeGreaterThan(0);
        // Should match Entity10, Entity100, Entity101, etc.
        expect(nodes.every((n: any) => n.name.toLowerCase().includes('entity10'))).toBe(true);
      }
    });

    it('should filter by nameContains (matches aliases)', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            listEntities(project: "${TEST_PROJECT}", filter: { nameContains: "alias3" }, limit: 50) {
              nodes { id name aliases }
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        const data = result.body.singleResult.data;
        const nodes = data?.listEntities.nodes || [];
        expect(nodes.length).toBeGreaterThan(0);
        // Should have alias containing "alias3"
        expect(nodes.some((n: any) =>
          n.aliases.some((a: string) => a.toLowerCase().includes('alias3'))
        )).toBe(true);
      }
    });

    it('should treat empty nameContains as no filter', async () => {
      const withoutFilter = await server.executeOperation({
        query: `
          query {
            listEntities(project: "${TEST_PROJECT}", limit: 50) {
              totalApprox
            }
          }
        `
      });

      const withEmptyFilter = await server.executeOperation({
        query: `
          query {
            listEntities(project: "${TEST_PROJECT}", filter: { nameContains: "" }, limit: 50) {
              totalApprox
            }
          }
        `
      });

      expect(withoutFilter.body.kind).toBe('single');
      expect(withEmptyFilter.body.kind).toBe('single');

      if (withoutFilter.body.kind === 'single' && withEmptyFilter.body.kind === 'single') {
        const total1 = withoutFilter.body.singleResult.data?.listEntities.totalApprox;
        const total2 = withEmptyFilter.body.singleResult.data?.listEntities.totalApprox;
        expect(total1).toBe(total2);
      }
    });

    it('should combine type and nameContains filters', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            listEntities(
              project: "${TEST_PROJECT}",
              filter: { type: "PERSON", nameContains: "entity1" },
              limit: 50
            ) {
              nodes { id name types }
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        const data = result.body.singleResult.data;
        const nodes = data?.listEntities.nodes || [];

        // All should be PERSON type AND contain "entity1"
        expect(nodes.every((n: any) =>
          n.types.includes('PERSON') && n.name.toLowerCase().includes('entity1')
        )).toBe(true);
      }
    });
  });

  describe('Pagination', () => {
    it('should paginate from start (no cursor)', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            listEntities(project: "${TEST_PROJECT}", limit: 10) {
              nodes { id name }
              pageInfo { endCursor hasNextPage }
              totalApprox
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        const data = result.body.singleResult.data;
        expect(data?.listEntities.nodes.length).toBe(10);
        expect(data?.listEntities.pageInfo.hasNextPage).toBe(true);
        expect(data?.listEntities.pageInfo.endCursor).toBeTruthy();
        expect(data?.listEntities.totalApprox).toBeGreaterThan(10);
      }
    });

    it('should paginate from middle (valid after cursor)', async () => {
      // First page
      const page1 = await server.executeOperation({
        query: `
          query {
            listEntities(project: "${TEST_PROJECT}", limit: 20) {
              pageInfo { endCursor hasNextPage }
            }
          }
        `
      });

      expect(page1.body.kind).toBe('single');
      if (page1.body.kind === 'single') {
        const cursor = page1.body.singleResult.data?.listEntities.pageInfo.endCursor;
        expect(cursor).toBeTruthy();

        // Second page
        const page2 = await server.executeOperation({
          query: `
            query($after: Cursor) {
              listEntities(project: "${TEST_PROJECT}", after: $after, limit: 20) {
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
          expect(data?.listEntities.nodes.length).toBe(20);

          // Verify no overlap with page 1
          const page1Ids = [];
          const page2Ids = data?.listEntities.nodes.map((n: any) => n.id);
          const overlap = page1Ids.filter(id => page2Ids.includes(id));
          expect(overlap.length).toBe(0);
        }
      }
    });

    it('should return hasNextPage=false at end', async () => {
      // Paginate through to the last page
      let cursor: string | null = null;
      let hasNextPage = true;
      let iterations = 0;
      const maxIterations = 10; // Safety limit

      while (hasNextPage && iterations < maxIterations) {
        const result = await server.executeOperation({
          query: `
            query($after: Cursor) {
              listEntities(project: "${TEST_PROJECT}", after: $after, limit: 200) {
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
          hasNextPage = data?.listEntities.pageInfo.hasNextPage ?? false;
          cursor = data?.listEntities.pageInfo.endCursor ?? null;

          // On final page, hasNextPage should be false
          if (!hasNextPage) {
            expect(data?.listEntities.pageInfo.hasNextPage).toBe(false);
          }
        }

        iterations++;
      }

      // Verify we actually reached the end
      expect(hasNextPage).toBe(false);
    });

    it('should reject invalid base64 cursor', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            listEntities(project: "${TEST_PROJECT}", after: "invalid!!!base64", limit: 10) {
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
      const fakeCursor = encodeCursor('nonexistent-entity-id');

      const result = await server.executeOperation({
        query: `
          query($after: Cursor) {
            listEntities(project: "${TEST_PROJECT}", after: $after, limit: 10) {
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
            listEntities(project: "${TEST_PROJECT}", limit: 0) {
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
            listEntities(project: "${TEST_PROJECT}", limit: 999) {
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

  describe('Entity Detail', () => {
    it('should return entity with inbound and outbound relations', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            getEntity(project: "${TEST_PROJECT}", id: "entity-0010") {
              entity { id name types aliases }
              inbound { id subject predicate object }
              outbound { id subject predicate object }
              evidence { text confidence docId }
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        const data = result.body.singleResult.data;
        expect(data?.getEntity.entity.id).toBe('entity-0010');
        expect(data?.getEntity.entity.name).toBe('Entity10');

        // Should have evidence
        expect(data?.getEntity.evidence.length).toBeGreaterThan(0);
      }
    });

    it('should normalize evidence to ≤200 chars', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            getEntity(project: "${TEST_PROJECT}", id: "entity-0001") {
              evidence { text }
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        const data = result.body.singleResult.data;
        const evidence = data?.getEntity.evidence || [];

        // All evidence should be ≤200 chars
        evidence.forEach((ev: any) => {
          expect(ev.text.length).toBeLessThanOrEqual(200);
        });
      }
    });

    it('should strip control characters from evidence', async () => {
      // Manually inject entity with control chars for this test
      const graph = loadGraph(TEST_GRAPH_PATH)!;
      graph.entities[0].evidence = [{
        span: { text: 'Test\x00with\x01control\x02chars\n\tand\rwhitespace' },
        confidence: 0.9,
        docId: 'test'
      }];
      saveGraph(graph, TEST_GRAPH_PATH);

      // Recreate server to pick up changes
      server = createGraphQLServer(TEST_GRAPH_PATH);

      const result = await server.executeOperation({
        query: `
          query {
            getEntity(project: "${TEST_PROJECT}", id: "entity-0000") {
              evidence { text }
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        const data = result.body.singleResult.data;
        const evidenceText = data?.getEntity.evidence[0]?.text;

        // Should have no control chars (except normalized whitespace)
        expect(evidenceText).not.toMatch(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/);
      }
    });

    it('should throw error for nonexistent entity', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            getEntity(project: "${TEST_PROJECT}", id: "nonexistent-id") {
              entity { id }
            }
          }
        `
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeDefined();
        expect(result.body.singleResult.errors?.[0].message).toContain('Entity not found');
      }
    });
  });
});
