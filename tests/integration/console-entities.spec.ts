/**
 * Console Entities Page Tests - Sprint R5
 * Integration tests for entities listing and detail views
 *
 * NOTE: These tests require the GraphQL server to be running on port 4000
 *       Run: make server-graphql (in separate terminal)
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { query } from '../../app/ui/console/src/lib/api';

const LIST_ENTITIES_QUERY = `
  query ListEntities($project: String!, $filter: EntityFilter, $limit: Int, $after: String) {
    listEntities(project: $project, filter: $filter, limit: $limit, after: $after) {
      nodes {
        id
        name
        types
        aliases
      }
      pageInfo {
        endCursor
        hasNextPage
      }
      totalApprox
    }
  }
`;

const GET_ENTITY_QUERY = `
  query GetEntity($project: String!, $id: String!) {
    getEntity(project: $project, id: $id) {
      entity {
        id
        name
        types
        aliases
      }
      mentionCount
      inboundRelations {
        predicate
        subject
      }
      outboundRelations {
        predicate
        object
      }
      evidence {
        snippet
        docId
      }
    }
  }
`;

describe.skip('Console - List Entities', () => {
  it('should list entities without filters', async () => {
    const result = await query<any>(LIST_ENTITIES_QUERY, {
      project: 'test',
      limit: 10,
    });

    expect(result.listEntities).toBeDefined();
    expect(result.listEntities.nodes).toBeInstanceOf(Array);
    expect(result.listEntities.pageInfo).toBeDefined();
    expect(result.listEntities.totalApprox).toBeGreaterThanOrEqual(0);
  });

  it('should filter entities by type', async () => {
    const result = await query<any>(LIST_ENTITIES_QUERY, {
      project: 'test',
      filter: { type: 'PERSON' },
      limit: 10,
    });

    expect(result.listEntities.nodes).toBeInstanceOf(Array);
    result.listEntities.nodes.forEach((entity: any) => {
      expect(entity.types).toContain('PERSON');
    });
  });

  it('should filter entities by name (case-insensitive)', async () => {
    const result = await query<any>(LIST_ENTITIES_QUERY, {
      project: 'test',
      filter: { nameContains: 'test' },
      limit: 10,
    });

    expect(result.listEntities.nodes).toBeInstanceOf(Array);
    result.listEntities.nodes.forEach((entity: any) => {
      expect(entity.name.toLowerCase()).toContain('test');
    });
  });

  it('should support cursor-based pagination', async () => {
    const firstPage = await query<any>(LIST_ENTITIES_QUERY, {
      project: 'test',
      limit: 5,
    });

    if (firstPage.listEntities.pageInfo.hasNextPage) {
      const secondPage = await query<any>(LIST_ENTITIES_QUERY, {
        project: 'test',
        limit: 5,
        after: firstPage.listEntities.pageInfo.endCursor,
      });

      expect(secondPage.listEntities.nodes).toBeInstanceOf(Array);
      // Ensure no overlap
      const firstIds = new Set(firstPage.listEntities.nodes.map((e: any) => e.id));
      secondPage.listEntities.nodes.forEach((entity: any) => {
        expect(firstIds.has(entity.id)).toBe(false);
      });
    }
  });
});

describe.skip('Console - Get Entity Detail', () => {
  it('should get entity detail with relations and evidence', async () => {
    // First get an entity ID
    const listResult = await query<any>(LIST_ENTITIES_QUERY, {
      project: 'test',
      limit: 1,
    });

    if (listResult.listEntities.nodes.length === 0) {
      return; // Skip if no entities
    }

    const entityId = listResult.listEntities.nodes[0].id;

    const detail = await query<any>(GET_ENTITY_QUERY, {
      project: 'test',
      id: entityId,
    });

    expect(detail.getEntity).toBeDefined();
    expect(detail.getEntity.entity.id).toBe(entityId);
    expect(detail.getEntity.mentionCount).toBeGreaterThanOrEqual(0);
    expect(detail.getEntity.inboundRelations).toBeInstanceOf(Array);
    expect(detail.getEntity.outboundRelations).toBeInstanceOf(Array);
    expect(detail.getEntity.evidence).toBeInstanceOf(Array);
  });

  it('should handle non-existent entity', async () => {
    await expect(
      query<any>(GET_ENTITY_QUERY, {
        project: 'test',
        id: 'nonexistent-id-12345',
      })
    ).rejects.toThrow();
  });
});
