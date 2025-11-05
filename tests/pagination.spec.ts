/**
 * Pagination Tests - Relay-style cursor pagination
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildConnection,
  encodeCursor,
  decodeCursor,
  MAX_PAGE,
  DEFAULT_PAGE
} from '../app/api/pagination';
import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import { createGraphQLServer } from '../app/api/graphql';
import * as path from 'path';

describe('Pagination Helpers', () => {
  describe('encodeCursor / decodeCursor', () => {
    it('encodes and decodes strings correctly', () => {
      const key = 'entity-123';
      const cursor = encodeCursor(key);
      expect(cursor).not.toBe(key);
      expect(decodeCursor(cursor).k).toBe(key);
    });

    it('handles special characters', () => {
      const key = 'entity::123::type';
      const cursor = encodeCursor(key);
      expect(decodeCursor(cursor).k).toBe(key);
    });

    it('produces base64 output', () => {
      const key = 'test';
      const cursor = encodeCursor(key);
      expect(/^[A-Za-z0-9+/=]+$/.test(cursor)).toBe(true);
    });
  });

  describe('buildConnection', () => {
    it('returns all items when no pagination args', () => {
      const items = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
        { id: '3', name: 'Charlie' }
      ];

      const conn = buildConnection(items, {}, item => item.id);

      expect(conn.edges.length).toBe(3);
      expect(conn.edges[0].node.name).toBe('Alice');
      expect(conn.pageInfo.hasNextPage).toBe(false);
      expect(conn.pageInfo.hasPreviousPage).toBe(false);
    });

    it('respects first argument', () => {
      const items = Array.from({ length: 50 }, (_, i) => ({
        id: `${i}`,
        name: `Item ${i}`
      }));

      const conn = buildConnection(items, { first: 10 }, item => item.id);

      expect(conn.edges.length).toBe(10);
      expect(conn.edges[0].node.name).toBe('Item 0');
      expect(conn.edges[9].node.name).toBe('Item 9');
      expect(conn.pageInfo.hasNextPage).toBe(true);
      expect(conn.pageInfo.hasPreviousPage).toBe(false);
    });

    it('respects last argument for backward pagination', () => {
      const items = Array.from({ length: 50 }, (_, i) => ({
        id: `${i}`,
        name: `Item ${i}`
      }));

      const conn = buildConnection(items, { last: 10 }, item => item.id);

      expect(conn.edges.length).toBe(10);
      expect(conn.edges[0].node.name).toBe('Item 40');
      expect(conn.edges[9].node.name).toBe('Item 49');
      expect(conn.pageInfo.hasNextPage).toBe(false);
      expect(conn.pageInfo.hasPreviousPage).toBe(true);
    });

    it('uses after cursor for forward pagination', () => {
      const items = Array.from({ length: 30 }, (_, i) => ({
        id: `${i}`,
        name: `Item ${i}`
      }));

      // First page
      const page1 = buildConnection(items, { first: 10 }, item => item.id);
      expect(page1.edges.length).toBe(10);
      expect(page1.pageInfo.endCursor).toBeDefined();

      // Second page using cursor
      const page2 = buildConnection(
        items,
        { first: 10, after: page1.pageInfo.endCursor! },
        item => item.id
      );

      expect(page2.edges.length).toBe(10);
      expect(page2.edges[0].node.name).toBe('Item 10');
      expect(page2.edges[9].node.name).toBe('Item 19');
      expect(page2.pageInfo.hasPreviousPage).toBe(true);
    });

    it('uses before cursor for backward pagination', () => {
      const items = Array.from({ length: 30 }, (_, i) => ({
        id: `${i}`,
        name: `Item ${i}`
      }));

      // Get an item in the middle
      const middleCursor = encodeCursor('20');

      const conn = buildConnection(
        items,
        { last: 10, before: middleCursor },
        item => item.id
      );

      expect(conn.edges.length).toBe(10);
      expect(conn.edges[0].node.name).toBe('Item 10');
      expect(conn.edges[9].node.name).toBe('Item 19');
    });

    it('enforces MAX_PAGE limit', () => {
      const items = Array.from({ length: 300 }, (_, i) => ({
        id: `${i}`,
        name: `Item ${i}`
      }));

      const conn = buildConnection(items, { first: 250 }, item => item.id);

      expect(conn.edges.length).toBe(MAX_PAGE);
      expect(conn.edges.length).toBe(200);
    });

    it('uses DEFAULT_PAGE when no limit specified', () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        id: `${i}`,
        name: `Item ${i}`
      }));

      const conn = buildConnection(items, {}, item => item.id);

      expect(conn.edges.length).toBe(DEFAULT_PAGE);
      expect(conn.edges.length).toBe(50);
    });

    it('throws error when both first and last are provided', () => {
      const items = [{ id: '1', name: 'Test' }];

      expect(() => {
        buildConnection(items, { first: 10, last: 10 }, item => item.id);
      }).toThrow('Cannot use both "first" and "last"');
    });

    it('provides correct startCursor and endCursor', () => {
      const items = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
        { id: '3', name: 'Charlie' }
      ];

      const conn = buildConnection(items, { first: 2 }, item => item.id);

      expect(conn.pageInfo.startCursor).toBe(encodeCursor('1'));
      expect(conn.pageInfo.endCursor).toBe(encodeCursor('2'));
    });

    it('handles empty results', () => {
      const items: any[] = [];

      const conn = buildConnection(items, { first: 10 }, item => item.id);

      expect(conn.edges.length).toBe(0);
      expect(conn.pageInfo.hasNextPage).toBe(false);
      expect(conn.pageInfo.hasPreviousPage).toBe(false);
      expect(conn.pageInfo.startCursor).toBeUndefined();
      expect(conn.pageInfo.endCursor).toBeUndefined();
    });

    it('maintains deterministic order', () => {
      const items = [
        { id: '3', name: 'Charlie' },
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' }
      ];

      // Items MUST be pre-sorted
      const sorted = items.sort((a, b) => a.id.localeCompare(b.id));

      const conn = buildConnection(sorted, {}, item => item.id);

      expect(conn.edges[0].node.name).toBe('Alice');
      expect(conn.edges[1].node.name).toBe('Bob');
      expect(conn.edges[2].node.name).toBe('Charlie');
    });
  });
});

describe('GraphQL Pagination Integration', () => {
  const testPath = path.join(process.cwd(), 'test-pagination.json');

  beforeEach(() => {
    clearStorage(testPath);
  });

  afterEach(() => {
    clearStorage(testPath);
  });

  it('entitiesConnection returns paginated entities', async () => {
    // Ingest multiple documents to create entities
    await appendDoc('doc1', 'Alice traveled to Wonderland.', testPath);
    await appendDoc('doc2', 'Bob met Charlie in Narnia.', testPath);
    await appendDoc('doc3', 'David went to Hogwarts.', testPath);

    const server = createGraphQLServer(testPath);

    const result = await server.executeOperation({
      query: `
        query {
          entitiesConnection(first: 2) {
            edges {
              cursor
              node {
                id
                canonical
                type
              }
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
            totalCount
          }
        }
      `
    });

    expect(result.body.kind).toBe('single');
    if (result.body.kind === 'single') {
      expect(result.body.singleResult.errors).toBeUndefined();
      const data = result.body.singleResult.data;
      expect(data?.entitiesConnection.edges.length).toBe(2);
      expect(data?.entitiesConnection.totalCount).toBeGreaterThan(0);
      expect(data?.entitiesConnection.pageInfo.startCursor).toBeDefined();
      expect(data?.entitiesConnection.pageInfo.endCursor).toBeDefined();
    }
  });

  it('relationsConnection returns paginated relations', async () => {
    await appendDoc('doc1', 'Aragorn married Arwen in 3019.', testPath);
    await appendDoc('doc2', 'Frodo traveled to Mordor.', testPath);

    const server = createGraphQLServer(testPath);

    const result = await server.executeOperation({
      query: `
        query {
          relationsConnection(first: 5) {
            edges {
              cursor
              node {
                id
                predicate
              }
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
            }
            totalCount
          }
        }
      `
    });

    expect(result.body.kind).toBe('single');
    if (result.body.kind === 'single') {
      expect(result.body.singleResult.errors).toBeUndefined();
      const data = result.body.singleResult.data;
      expect(data?.relationsConnection.edges.length).toBeGreaterThan(0);
      expect(data?.relationsConnection.totalCount).toBeGreaterThan(0);
    }
  });

  it('supports cursor-based pagination across pages', async () => {
    // Create many entities
    for (let i = 0; i < 10; i++) {
      await appendDoc(`doc${i}`, `Person${i} visited Place${i}.`, testPath);
    }

    const server = createGraphQLServer(testPath);

    // First page - use small page size to ensure pagination
    const page1 = await server.executeOperation({
      query: `
        query {
          entitiesConnection(first: 2) {
            edges {
              cursor
              node {
                canonical
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
            totalCount
          }
        }
      `
    });

    expect(page1.body.kind).toBe('single');
    if (page1.body.kind === 'single') {
      const data1 = page1.body.singleResult.data;

      // Only test pagination if we have more than 2 entities
      if (data1?.entitiesConnection.totalCount > 2) {
        expect(data1?.entitiesConnection.pageInfo.hasNextPage).toBe(true);

        const cursor = data1?.entitiesConnection.pageInfo.endCursor;
        expect(cursor).toBeDefined();

        // Second page
        const page2 = await server.executeOperation({
          query: `
            query($after: Cursor) {
              entitiesConnection(first: 5, after: $after) {
                edges {
                  node {
                    canonical
                  }
                }
                pageInfo {
                  hasPreviousPage
                }
              }
            }
          `,
          variables: { after: cursor }
        });

        expect(page2.body.kind).toBe('single');
        if (page2.body.kind === 'single') {
          const data2 = page2.body.singleResult.data;
          expect(data2?.entitiesConnection.pageInfo.hasPreviousPage).toBe(true);

          // Verify no overlap
          const names1 = data1?.entitiesConnection.edges.map((e: any) => e.node.canonical);
          const names2 = data2?.entitiesConnection.edges.map((e: any) => e.node.canonical);
          const overlap = names1?.filter((n: string) => names2?.includes(n));
          expect(overlap?.length).toBe(0);
        }
      }
    }
  });

  it('legacy queries still work without pagination', async () => {
    await appendDoc('doc1', 'Gandalf traveled to Rivendell.', testPath);

    const server = createGraphQLServer(testPath);

    const result = await server.executeOperation({
      query: `
        query {
          entities {
            id
            canonical
          }
        }
      `
    });

    expect(result.body.kind).toBe('single');
    if (result.body.kind === 'single') {
      expect(result.body.singleResult.errors).toBeUndefined();
      const data = result.body.singleResult.data;
      expect(data?.entities.length).toBeGreaterThan(0);
    }
  });
});
