/**
 * Console Relations Page Tests - Sprint R5
 * Integration tests for relations listing and detail views
 *
 * NOTE: These tests require the GraphQL server to be running on port 4000
 *       Run: make server-graphql (in separate terminal)
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { query } from '../../app/ui/console/src/lib/api';

const LIST_RELATIONS_QUERY = `
  query ListRelations($project: String!, $filter: RelationFilter, $limit: Int, $after: String) {
    listRelations(project: $project, filter: $filter, limit: $limit, after: $after) {
      nodes {
        id
        subject
        predicate
        object
        symmetric
        confidenceAvg
      }
      pageInfo {
        endCursor
        hasNextPage
      }
      totalApprox
    }
  }
`;

const GET_RELATION_QUERY = `
  query GetRelation($project: String!, $id: String!) {
    getRelation(project: $project, id: $id) {
      relation {
        id
        subject
        predicate
        object
        symmetric
        confidenceAvg
      }
      evidence {
        snippet
        docId
        confidence
      }
    }
  }
`;

describe.skip('Console - List Relations', () => {
  it('should list relations without filters', async () => {
    const result = await query<any>(LIST_RELATIONS_QUERY, {
      project: 'test',
      limit: 10,
    });

    expect(result.listRelations).toBeDefined();
    expect(result.listRelations.nodes).toBeInstanceOf(Array);
    expect(result.listRelations.pageInfo).toBeDefined();
    expect(result.listRelations.totalApprox).toBeGreaterThanOrEqual(0);
  });

  it('should filter relations by predicate', async () => {
    const result = await query<any>(LIST_RELATIONS_QUERY, {
      project: 'test',
      filter: { predicate: 'MARRIED_TO' },
      limit: 10,
    });

    expect(result.listRelations.nodes).toBeInstanceOf(Array);
    result.listRelations.nodes.forEach((relation: any) => {
      expect(relation.predicate).toBe('MARRIED_TO');
    });
  });

  it('should filter relations by name (subject or object)', async () => {
    const result = await query<any>(LIST_RELATIONS_QUERY, {
      project: 'test',
      filter: { nameContains: 'test' },
      limit: 10,
    });

    expect(result.listRelations.nodes).toBeInstanceOf(Array);
    result.listRelations.nodes.forEach((relation: any) => {
      const matchesSubject = relation.subject.toLowerCase().includes('test');
      const matchesObject = relation.object.toLowerCase().includes('test');
      expect(matchesSubject || matchesObject).toBe(true);
    });
  });

  it('should support cursor-based pagination', async () => {
    const firstPage = await query<any>(LIST_RELATIONS_QUERY, {
      project: 'test',
      limit: 5,
    });

    if (firstPage.listRelations.pageInfo.hasNextPage) {
      const secondPage = await query<any>(LIST_RELATIONS_QUERY, {
        project: 'test',
        limit: 5,
        after: firstPage.listRelations.pageInfo.endCursor,
      });

      expect(secondPage.listRelations.nodes).toBeInstanceOf(Array);
      // Ensure no overlap
      const firstIds = new Set(firstPage.listRelations.nodes.map((r: any) => r.id));
      secondPage.listRelations.nodes.forEach((relation: any) => {
        expect(firstIds.has(relation.id)).toBe(false);
      });
    }
  });

  it('should include stable SHA1-based IDs', async () => {
    const result = await query<any>(LIST_RELATIONS_QUERY, {
      project: 'test',
      limit: 10,
    });

    result.listRelations.nodes.forEach((relation: any) => {
      expect(relation.id).toBeTruthy();
      expect(typeof relation.id).toBe('string');
      expect(relation.id.length).toBe(40); // SHA1 hex = 40 chars
    });
  });
});

describe.skip('Console - Get Relation Detail', () => {
  it('should get relation detail with evidence', async () => {
    // First get a relation ID
    const listResult = await query<any>(LIST_RELATIONS_QUERY, {
      project: 'test',
      limit: 1,
    });

    if (listResult.listRelations.nodes.length === 0) {
      return; // Skip if no relations
    }

    const relationId = listResult.listRelations.nodes[0].id;

    const detail = await query<any>(GET_RELATION_QUERY, {
      project: 'test',
      id: relationId,
    });

    expect(detail.getRelation).toBeDefined();
    expect(detail.getRelation.relation.id).toBe(relationId);
    expect(detail.getRelation.evidence).toBeInstanceOf(Array);

    detail.getRelation.evidence.forEach((ev: any) => {
      expect(ev.snippet).toBeTruthy();
      expect(ev.docId).toBeTruthy();
      expect(typeof ev.confidence).toBe('number');
    });
  });

  it('should handle non-existent relation', async () => {
    await expect(
      query<any>(GET_RELATION_QUERY, {
        project: 'test',
        id: 'nonexistent-id-12345',
      })
    ).rejects.toThrow();
  });
});
