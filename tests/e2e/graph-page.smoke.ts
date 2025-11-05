/**
 * Graph Page E2E Smoke Tests - Sprint R6 Phase 2
 * End-to-end smoke tests for graph visualization page
 *
 * NOTE: These tests require the GraphQL server to be running on port 4000
 *       Run: make server-graphql (in separate terminal)
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { query } from '../../app/ui/console/src/lib/api';
import { loadGraph } from '../../app/storage/storage';

const TEST_PROJECT = 'test';
const GRAPH_PATH = `./data/projects/${TEST_PROJECT}/graph.json`;

describe.skip('Graph Page E2E - Smoke Tests', () => {
  it('should load graph neighborhood data', async () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.entities.length === 0) {
      return; // Skip if no test data
    }

    const testEntityId = graph.entities[0].id;

    const GRAPH_NEIGHBORHOOD = `
      query {
        graphNeighborhood(
          project: "${TEST_PROJECT}"
          centerId: "${testEntityId}"
          depth: 1
          limit: 20
        ) {
          nodes { id name types }
          edges { id subject predicate object }
        }
      }
    `;

    const result = await query<any>(GRAPH_NEIGHBORHOOD, {});
    expect(result.graphNeighborhood).toBeDefined();
    expect(result.graphNeighborhood.nodes).toBeInstanceOf(Array);
    expect(result.graphNeighborhood.edges).toBeInstanceOf(Array);
  });

  it('should load graph predicate data', async () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.relations.length === 0) {
      return; // Skip if no test data
    }

    const testPredicate = graph.relations[0].pred || graph.relations[0].predicate;

    const GRAPH_BY_PREDICATE = `
      query {
        graphByPredicate(
          project: "${TEST_PROJECT}"
          predicate: "${testPredicate}"
          limit: 20
        ) {
          nodes { id name types }
          edges { id subject predicate object }
        }
      }
    `;

    const result = await query<any>(GRAPH_BY_PREDICATE, {});
    expect(result.graphByPredicate).toBeDefined();
    expect(result.graphByPredicate.nodes).toBeInstanceOf(Array);
    expect(result.graphByPredicate.edges).toBeInstanceOf(Array);
  });

  it('should handle complete graph exploration workflow', async () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.entities.length === 0) {
      return; // Skip if no test data
    }

    const testEntityId = graph.entities[0].id;

    // 1. Get neighborhood graph
    const neighborhoodResult = await query<any>(
      `query GetNeighborhood($centerId: ID!) {
        graphNeighborhood(
          project: "${TEST_PROJECT}"
          centerId: $centerId
          depth: 1
          limit: 20
        ) {
          nodes { id name }
          edges { id subject object }
        }
      }`,
      { centerId: testEntityId }
    );

    expect(neighborhoodResult.graphNeighborhood).toBeDefined();
    expect(neighborhoodResult.graphNeighborhood.nodes.length).toBeGreaterThan(0);

    // 2. If there are connected nodes, get their details
    if (neighborhoodResult.graphNeighborhood.nodes.length > 1) {
      const connectedNodeId = neighborhoodResult.graphNeighborhood.nodes.find(
        (n: any) => n.id !== testEntityId
      )?.id;

      if (connectedNodeId) {
        const detailResult = await query<any>(
          `query GetEntity($id: ID!) {
            getEntity(project: "${TEST_PROJECT}", id: $id) {
              entity { id name types }
              inbound { predicate }
              outbound { predicate }
            }
          }`,
          { id: connectedNodeId }
        );

        expect(detailResult.getEntity).toBeDefined();
        expect(detailResult.getEntity.entity.id).toBe(connectedNodeId);
      }
    }
  });

  it('should handle graph filtering by predicate workflow', async () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.relations.length === 0) {
      return; // Skip if no test data
    }

    const testPredicate = graph.relations[0].pred || graph.relations[0].predicate;

    // 1. Get graph filtered by predicate
    const predicateResult = await query<any>(
      `query GetByPredicate($predicate: String!) {
        graphByPredicate(
          project: "${TEST_PROJECT}"
          predicate: $predicate
          limit: 20
        ) {
          nodes { id }
          edges { id subject object predicate }
        }
      }`,
      { predicate: testPredicate }
    );

    expect(predicateResult.graphByPredicate).toBeDefined();

    // 2. Verify all edges have the correct predicate
    predicateResult.graphByPredicate.edges.forEach((edge: any) => {
      expect(edge.predicate).toBe(testPredicate);
    });

    // 3. If there are edges, get relation details
    if (predicateResult.graphByPredicate.edges.length > 0) {
      const edgeId = predicateResult.graphByPredicate.edges[0].id;

      const relationDetailResult = await query<any>(
        `query GetRelation($id: ID!) {
          getRelation(project: "${TEST_PROJECT}", id: $id) {
            relation { id subject predicate object }
            evidence { text }
          }
        }`,
        { id: edgeId }
      );

      expect(relationDetailResult.getRelation).toBeDefined();
      expect(relationDetailResult.getRelation.relation.predicate).toBe(testPredicate);
    }
  });

  it('should handle depth parameter correctly', async () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.entities.length === 0) {
      return; // Skip if no test data
    }

    const testEntityId = graph.entities[0].id;

    // Get depth 1
    const depth1Result = await query<any>(
      `query {
        graphNeighborhood(
          project: "${TEST_PROJECT}"
          centerId: "${testEntityId}"
          depth: 1
          limit: 100
        ) {
          nodes { id }
        }
      }`,
      {}
    );

    // Get depth 2
    const depth2Result = await query<any>(
      `query {
        graphNeighborhood(
          project: "${TEST_PROJECT}"
          centerId: "${testEntityId}"
          depth: 2
          limit: 100
        ) {
          nodes { id }
        }
      }`,
      {}
    );

    // Depth 2 should return >= nodes than depth 1
    expect(depth2Result.graphNeighborhood.nodes.length).toBeGreaterThanOrEqual(
      depth1Result.graphNeighborhood.nodes.length
    );
  });

  it('should handle limit parameter correctly', async () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.entities.length === 0) {
      return; // Skip if no test data
    }

    const testEntityId = graph.entities[0].id;

    const result = await query<any>(
      `query {
        graphNeighborhood(
          project: "${TEST_PROJECT}"
          centerId: "${testEntityId}"
          depth: 2
          limit: 5
        ) {
          nodes { id }
        }
      }`,
      {}
    );

    expect(result.graphNeighborhood.nodes.length).toBeLessThanOrEqual(5);
  });

  it('should handle empty predicate results gracefully', async () => {
    const result = await query<any>(
      `query {
        graphByPredicate(
          project: "${TEST_PROJECT}"
          predicate: "NONEXISTENT_PREDICATE_XYZ"
          limit: 100
        ) {
          nodes { id }
          edges { id }
        }
      }`,
      {}
    );

    expect(result.graphByPredicate.nodes).toEqual([]);
    expect(result.graphByPredicate.edges).toEqual([]);
  });
});
