/**
 * Graph Page Integration Tests - Sprint R6 Phase 2
 * Tests for GraphPage, GraphCanvas, and useGraphData hook
 *
 * NOTE: These tests require the GraphQL server to be running on port 4000
 *       Run: make server-graphql (in separate terminal)
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { query } from '../../app/ui/console/src/lib/api';
import { loadGraph } from '../../app/storage/storage';

const TEST_PROJECT = 'test';
const GRAPH_PATH = `./data/projects/${TEST_PROJECT}/graph.json`;

const GRAPH_NEIGHBORHOOD_QUERY = `
  query GraphNeighborhood($project: String!, $centerId: ID!, $depth: Int!, $limit: Int!) {
    graphNeighborhood(project: $project, centerId: $centerId, depth: $depth, limit: $limit) {
      nodes {
        id
        name
        types
      }
      edges {
        id
        subject
        object
        predicate
        symmetric
      }
    }
  }
`;

const GRAPH_BY_PREDICATE_QUERY = `
  query GraphByPredicate($project: String!, $predicate: String!, $limit: Int!) {
    graphByPredicate(project: $project, predicate: $predicate, limit: $limit) {
      nodes {
        id
        name
        types
      }
      edges {
        id
        subject
        object
        predicate
        symmetric
      }
    }
  }
`;

describe.skip('Graph Page - Neighborhood Query', () => {
  let testEntityId: string;

  beforeAll(() => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.entities.length === 0) {
      throw new Error('Test data not found');
    }
    testEntityId = graph.entities[0].id;
  });

  it('should fetch neighborhood data at depth 1', async () => {
    const result = await query<any>(GRAPH_NEIGHBORHOOD_QUERY, {
      project: TEST_PROJECT,
      centerId: testEntityId,
      depth: 1,
      limit: 50,
    });

    expect(result.graphNeighborhood).toBeDefined();
    expect(result.graphNeighborhood.nodes).toBeInstanceOf(Array);
    expect(result.graphNeighborhood.edges).toBeInstanceOf(Array);
    expect(result.graphNeighborhood.nodes.length).toBeGreaterThan(0);

    // Verify node structure
    result.graphNeighborhood.nodes.forEach((node: any) => {
      expect(node.id).toBeTruthy();
      expect(node.name).toBeTruthy();
      expect(Array.isArray(node.types)).toBe(true);
    });

    // Verify edge structure
    result.graphNeighborhood.edges.forEach((edge: any) => {
      expect(edge.id).toBeTruthy();
      expect(edge.subject).toBeTruthy();
      expect(edge.object).toBeTruthy();
      expect(edge.predicate).toBeTruthy();
    });
  });

  it('should fetch neighborhood data at depth 2', async () => {
    const result = await query<any>(GRAPH_NEIGHBORHOOD_QUERY, {
      project: TEST_PROJECT,
      centerId: testEntityId,
      depth: 2,
      limit: 100,
    });

    expect(result.graphNeighborhood).toBeDefined();
    expect(result.graphNeighborhood.nodes).toBeInstanceOf(Array);

    // Depth 2 should potentially return more or equal nodes than depth 1
    const depth1Result = await query<any>(GRAPH_NEIGHBORHOOD_QUERY, {
      project: TEST_PROJECT,
      centerId: testEntityId,
      depth: 1,
      limit: 100,
    });

    expect(result.graphNeighborhood.nodes.length).toBeGreaterThanOrEqual(
      depth1Result.graphNeighborhood.nodes.length
    );
  });

  it('should respect limit parameter', async () => {
    const result = await query<any>(GRAPH_NEIGHBORHOOD_QUERY, {
      project: TEST_PROJECT,
      centerId: testEntityId,
      depth: 2,
      limit: 5,
    });

    expect(result.graphNeighborhood.nodes.length).toBeLessThanOrEqual(5);
  });

  it('should handle non-existent center entity', async () => {
    await expect(
      query<any>(GRAPH_NEIGHBORHOOD_QUERY, {
        project: TEST_PROJECT,
        centerId: 'nonexistent-entity-12345',
        depth: 1,
        limit: 50,
      })
    ).rejects.toThrow();
  });
});

describe.skip('Graph Page - Predicate Query', () => {
  let testPredicate: string;

  beforeAll(() => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.relations.length === 0) {
      throw new Error('Test data not found');
    }
    testPredicate = graph.relations[0].pred || graph.relations[0].predicate;
  });

  it('should fetch graph data by predicate', async () => {
    const result = await query<any>(GRAPH_BY_PREDICATE_QUERY, {
      project: TEST_PROJECT,
      predicate: testPredicate,
      limit: 100,
    });

    expect(result.graphByPredicate).toBeDefined();
    expect(result.graphByPredicate.nodes).toBeInstanceOf(Array);
    expect(result.graphByPredicate.edges).toBeInstanceOf(Array);

    // All edges should have the specified predicate
    result.graphByPredicate.edges.forEach((edge: any) => {
      expect(edge.predicate).toBe(testPredicate);
    });

    // Verify nodes include both subject and object entities
    if (result.graphByPredicate.edges.length > 0) {
      const edge = result.graphByPredicate.edges[0];
      const nodeIds = result.graphByPredicate.nodes.map((n: any) => n.id);
      expect(nodeIds).toContain(edge.subject);
      expect(nodeIds).toContain(edge.object);
    }
  });

  it('should respect limit parameter', async () => {
    const result = await query<any>(GRAPH_BY_PREDICATE_QUERY, {
      project: TEST_PROJECT,
      predicate: testPredicate,
      limit: 3,
    });

    expect(result.graphByPredicate.edges.length).toBeLessThanOrEqual(3);
  });

  it('should return empty result for non-existent predicate', async () => {
    const result = await query<any>(GRAPH_BY_PREDICATE_QUERY, {
      project: TEST_PROJECT,
      predicate: 'NONEXISTENT_PREDICATE_12345',
      limit: 100,
    });

    expect(result.graphByPredicate.nodes.length).toBe(0);
    expect(result.graphByPredicate.edges.length).toBe(0);
  });
});

describe.skip('Graph Page - Data Validation', () => {
  let testEntityId: string;

  beforeAll(() => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.entities.length === 0) {
      throw new Error('Test data not found');
    }
    testEntityId = graph.entities[0].id;
  });

  it('should include center entity in neighborhood results', async () => {
    const result = await query<any>(GRAPH_NEIGHBORHOOD_QUERY, {
      project: TEST_PROJECT,
      centerId: testEntityId,
      depth: 1,
      limit: 50,
    });

    const nodeIds = result.graphNeighborhood.nodes.map((n: any) => n.id);
    expect(nodeIds).toContain(testEntityId);
  });

  it('should return stable edge IDs (SHA1)', async () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.relations.length === 0) {
      return;
    }

    const testPredicate = graph.relations[0].pred || graph.relations[0].predicate;
    const result = await query<any>(GRAPH_BY_PREDICATE_QUERY, {
      project: TEST_PROJECT,
      predicate: testPredicate,
      limit: 100,
    });

    result.graphByPredicate.edges.forEach((edge: any) => {
      // SHA1 hash is 40 characters hex
      expect(edge.id.length).toBe(40);
      expect(/^[a-f0-9]+$/.test(edge.id)).toBe(true);
    });
  });

  it('should handle projects with large graphs', async () => {
    const result = await query<any>(GRAPH_NEIGHBORHOOD_QUERY, {
      project: TEST_PROJECT,
      centerId: testEntityId,
      depth: 2,
      limit: 200, // Max limit
    });

    expect(result.graphNeighborhood.nodes.length).toBeLessThanOrEqual(200);
  });
});
