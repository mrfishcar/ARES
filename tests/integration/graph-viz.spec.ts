/**
 * Graph Visualization Integration Tests - Sprint R6
 * Tests for graphNeighborhood and graphByPredicate resolvers
 */

import { describe, it, expect } from 'vitest';
import { loadGraph } from '../../app/storage/storage';
import { graphVizResolvers } from '../../app/api/resolvers/graph-viz';

// Use existing test project
const TEST_PROJECT = 'test';
const GRAPH_PATH = `./data/projects/${TEST_PROJECT}/graph.json`;

describe('Graph Visualization - graphNeighborhood', () => {

  it('should return neighborhood at depth 1', () => {
    // Get any entity from the test graph
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.entities.length === 0) {
      return; // Skip if no test data
    }

    const testEntity = graph.entities[0];

    const result = graphVizResolvers.Query.graphNeighborhood(null, {
      project: TEST_PROJECT,
      centerId: testEntity.id,
      depth: 1,
      limit: 200
    });

    expect(result.nodes).toBeDefined();
    expect(result.edges).toBeDefined();
    expect(result.nodes.length).toBeGreaterThan(0);

    // Should include center entity
    const nodeIds = result.nodes.map(n => n.id);
    expect(nodeIds).toContain(testEntity.id);
  });

  it('should return neighborhood at depth 2', () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.entities.length === 0) {
      return;
    }

    const testEntity = graph.entities[0];

    const result = graphVizResolvers.Query.graphNeighborhood(null, {
      project: TEST_PROJECT,
      centerId: testEntity.id,
      depth: 2,
      limit: 200
    });

    expect(result.nodes.length).toBeGreaterThan(0);

    // Depth 2 should potentially include more or equal nodes than depth 1
    const depth1 = graphVizResolvers.Query.graphNeighborhood(null, {
      project: TEST_PROJECT,
      centerId: testEntity.id,
      depth: 1,
      limit: 200
    });

    expect(result.nodes.length).toBeGreaterThanOrEqual(depth1.nodes.length);
  });

  it('should respect limit parameter', () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.entities.length === 0) {
      return;
    }

    const testEntity = graph.entities[0];

    const result = graphVizResolvers.Query.graphNeighborhood(null, {
      project: TEST_PROJECT,
      centerId: testEntity.id,
      depth: 2,
      limit: 3
    });

    expect(result.nodes.length).toBeLessThanOrEqual(3);
  });

  it('should reject invalid depth', () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.entities.length === 0) {
      return;
    }

    const testEntity = graph.entities[0];

    expect(() => {
      graphVizResolvers.Query.graphNeighborhood(null, {
        project: TEST_PROJECT,
        centerId: testEntity.id,
        depth: 0, // Invalid
        limit: 200
      });
    }).toThrow('Depth must be 1 or 2');

    expect(() => {
      graphVizResolvers.Query.graphNeighborhood(null, {
        project: TEST_PROJECT,
        centerId: testEntity.id,
        depth: 3, // Invalid
        limit: 200
      });
    }).toThrow('Depth must be 1 or 2');
  });

  it('should reject invalid limit', () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.entities.length === 0) {
      return;
    }

    const testEntity = graph.entities[0];

    expect(() => {
      graphVizResolvers.Query.graphNeighborhood(null, {
        project: TEST_PROJECT,
        centerId: testEntity.id,
        depth: 1,
        limit: 0 // Too low
      });
    }).toThrow('Limit must be between 1 and 200');

    expect(() => {
      graphVizResolvers.Query.graphNeighborhood(null, {
        project: TEST_PROJECT,
        centerId: testEntity.id,
        depth: 1,
        limit: 300 // Too high
      });
    }).toThrow('Limit must be between 1 and 200');
  });

  it('should handle non-existent center entity', () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph) {
      return; // Skip if no test data
    }

    expect(() => {
      graphVizResolvers.Query.graphNeighborhood(null, {
        project: TEST_PROJECT,
        centerId: 'nonexistent-entity-12345',
        depth: 1,
        limit: 200
      });
    }).toThrow('Entity not found');
  });

  it('should include edge metadata', () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.entities.length === 0) {
      return;
    }

    const testEntity = graph.entities[0];

    const result = graphVizResolvers.Query.graphNeighborhood(null, {
      project: TEST_PROJECT,
      centerId: testEntity.id,
      depth: 1,
      limit: 200
    });

    if (result.edges.length > 0) {
      const edge = result.edges[0];
      expect(edge.id).toBeTruthy();
      expect(edge.subject).toBeTruthy();
      expect(edge.object).toBeTruthy();
      expect(edge.predicate).toBeTruthy();
      expect(typeof edge.symmetric).toBe('boolean');
    }
  });

  it('should include node metadata', () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.entities.length === 0) {
      return;
    }

    const testEntity = graph.entities[0];

    const result = graphVizResolvers.Query.graphNeighborhood(null, {
      project: TEST_PROJECT,
      centerId: testEntity.id,
      depth: 1,
      limit: 200
    });

    const node = result.nodes.find(n => n.id === testEntity.id);
    expect(node).toBeDefined();
    expect(node!.name).toBeTruthy();
    expect(Array.isArray(node!.types)).toBe(true);
  });
});

describe('Graph Visualization - graphByPredicate', () => {
  it('should filter by predicate', () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.relations.length === 0) {
      return;
    }

    // Get first predicate from test data
    const testPredicate = graph.relations[0].pred || graph.relations[0].predicate;

    const result = graphVizResolvers.Query.graphByPredicate(null, {
      project: TEST_PROJECT,
      predicate: testPredicate,
      limit: 500
    });

    expect(result.nodes).toBeDefined();
    expect(result.edges).toBeDefined();

    // All edges should have the specified predicate
    result.edges.forEach(edge => {
      expect(edge.predicate).toBe(testPredicate);
    });
  });

  it('should respect limit parameter', () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.relations.length === 0) {
      return;
    }

    const testPredicate = graph.relations[0].pred || graph.relations[0].predicate;

    const result = graphVizResolvers.Query.graphByPredicate(null, {
      project: TEST_PROJECT,
      predicate: testPredicate,
      limit: 2
    });

    expect(result.edges.length).toBeLessThanOrEqual(2);
  });

  it('should reject invalid limit', () => {
    expect(() => {
      graphVizResolvers.Query.graphByPredicate(null, {
        project: TEST_PROJECT,
        predicate: 'ANY_PREDICATE',
        limit: 0
      });
    }).toThrow('Limit must be between 1 and 500');

    expect(() => {
      graphVizResolvers.Query.graphByPredicate(null, {
        project: TEST_PROJECT,
        predicate: 'ANY_PREDICATE',
        limit: 600
      });
    }).toThrow('Limit must be between 1 and 500');
  });

  it('should return empty result for non-existent predicate', () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph) {
      return; // Skip if no test data
    }

    const result = graphVizResolvers.Query.graphByPredicate(null, {
      project: TEST_PROJECT,
      predicate: 'NONEXISTENT_PREDICATE',
      limit: 500
    });

    expect(result.nodes.length).toBe(0);
    expect(result.edges.length).toBe(0);
  });

  it('should include both subject and object nodes', () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.relations.length === 0) {
      return;
    }

    const testPredicate = graph.relations[0].pred || graph.relations[0].predicate;

    const result = graphVizResolvers.Query.graphByPredicate(null, {
      project: TEST_PROJECT,
      predicate: testPredicate,
      limit: 500
    });

    if (result.edges.length > 0) {
      const edge = result.edges[0];
      const subjNode = result.nodes.find(n => n.id === edge.subject);
      const objNode = result.nodes.find(n => n.id === edge.object);

      expect(subjNode).toBeDefined();
      expect(objNode).toBeDefined();
    }
  });

  it('should use stable SHA1 edge IDs', () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.relations.length === 0) {
      return;
    }

    const testPredicate = graph.relations[0].pred || graph.relations[0].predicate;

    const result = graphVizResolvers.Query.graphByPredicate(null, {
      project: TEST_PROJECT,
      predicate: testPredicate,
      limit: 500
    });

    result.edges.forEach(edge => {
      // SHA1 hash is 40 characters hex
      expect(edge.id.length).toBe(40);
      expect(/^[a-f0-9]+$/.test(edge.id)).toBe(true);
    });
  });
});

describe('Graph Visualization - Metrics', () => {
  it('should increment metrics counters', async () => {
    const graph = loadGraph(GRAPH_PATH);
    if (!graph || graph.entities.length === 0 || graph.relations.length === 0) {
      return;
    }

    const { getRawMetrics, resetMetrics } = await import('../../app/monitor/metrics');

    resetMetrics();
    const before = getRawMetrics();

    const testEntity = graph.entities[0];
    const testPredicate = graph.relations[0].pred || graph.relations[0].predicate;

    // Call graphNeighborhood
    graphVizResolvers.Query.graphNeighborhood(null, {
      project: TEST_PROJECT,
      centerId: testEntity.id,
      depth: 1,
      limit: 200
    });

    const afterNeighborhood = getRawMetrics();
    expect(afterNeighborhood.api_graph_neighborhood_total).toBe(before.api_graph_neighborhood_total + 1);

    // Call graphByPredicate
    graphVizResolvers.Query.graphByPredicate(null, {
      project: TEST_PROJECT,
      predicate: testPredicate,
      limit: 500
    });

    const afterPredicate = getRawMetrics();
    expect(afterPredicate.api_graph_by_predicate_total).toBe(afterNeighborhood.api_graph_by_predicate_total + 1);
  });
});
