/**
 * Console E2E Smoke Tests - Sprint R5
 * End-to-end smoke tests for all console pages
 *
 * NOTE: These tests require the GraphQL server to be running on port 4000
 *       Run: make server-graphql (in separate terminal)
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { query } from '../../app/ui/console/src/lib/api';

describe.skip('Console E2E - Smoke Tests', () => {
  it('should connect to GraphQL endpoint', async () => {
    const result = await query<any>('{ __typename }', {});
    expect(result.__typename).toBe('Query');
  });

  it('should load entities page data', async () => {
    const LIST_ENTITIES = `
      query {
        listEntities(project: "test", limit: 5) {
          nodes { id name }
          pageInfo { hasNextPage }
          totalApprox
        }
      }
    `;

    const result = await query<any>(LIST_ENTITIES, {});
    expect(result.listEntities).toBeDefined();
    expect(result.listEntities.nodes).toBeInstanceOf(Array);
  });

  it('should load relations page data', async () => {
    const LIST_RELATIONS = `
      query {
        listRelations(project: "test", limit: 5) {
          nodes { id subject predicate object }
          pageInfo { hasNextPage }
          totalApprox
        }
      }
    `;

    const result = await query<any>(LIST_RELATIONS, {});
    expect(result.listRelations).toBeDefined();
    expect(result.listRelations.nodes).toBeInstanceOf(Array);
  });

  it('should load snapshots page data', async () => {
    const LIST_SNAPSHOTS = `
      query {
        listSnapshots(project: "test") {
          id
          timestamp
        }
      }
    `;

    const result = await query<any>(LIST_SNAPSHOTS, {});
    expect(result.listSnapshots).toBeInstanceOf(Array);
  });

  it('should handle complete entity workflow', async () => {
    // 1. List entities
    const listResult = await query<any>(
      `query { listEntities(project: "test", limit: 1) { nodes { id } } }`,
      {}
    );

    if (listResult.listEntities.nodes.length > 0) {
      const entityId = listResult.listEntities.nodes[0].id;

      // 2. Get entity detail
      const detailResult = await query<any>(
        `query GetEntity($id: String!) {
          getEntity(project: "test", id: $id) {
            entity { id name }
            mentionCount
          }
        }`,
        { id: entityId }
      );

      expect(detailResult.getEntity).toBeDefined();
      expect(detailResult.getEntity.entity.id).toBe(entityId);
    }
  });

  it('should handle complete relation workflow', async () => {
    // 1. List relations
    const listResult = await query<any>(
      `query { listRelations(project: "test", limit: 1) { nodes { id } } }`,
      {}
    );

    if (listResult.listRelations.nodes.length > 0) {
      const relationId = listResult.listRelations.nodes[0].id;

      // 2. Get relation detail
      const detailResult = await query<any>(
        `query GetRelation($id: String!) {
          getRelation(project: "test", id: $id) {
            relation { id subject predicate object }
            evidence { snippet }
          }
        }`,
        { id: relationId }
      );

      expect(detailResult.getRelation).toBeDefined();
      expect(detailResult.getRelation.relation.id).toBe(relationId);
    }
  });
});
