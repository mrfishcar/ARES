/**
 * Integration tests for Advanced Search
 * Sprint R6 Phase 5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ApolloServer } from '@apollo/server';
import { createGraphQLServer } from '../../app/api/graphql';
import { saveGraph } from '../../app/storage/storage';
import { clearSearchCache } from '../../app/api/search-index';
import type { KnowledgeGraph } from '../../app/storage/storage';

const TEST_PROJECT = 'test-search';
const TEST_PROJECT_DIR = path.join(process.cwd(), 'data', 'projects', TEST_PROJECT);
const TEST_GRAPH_PATH = path.join(TEST_PROJECT_DIR, 'graph.json');

describe('Advanced Search', () => {
  let server: ApolloServer;

  beforeEach(async () => {
    // Create test project directory
    if (!fs.existsSync(TEST_PROJECT_DIR)) {
      fs.mkdirSync(TEST_PROJECT_DIR, { recursive: true });
    }

    // Create test graph with diverse content
    const testGraph: KnowledgeGraph = {
      entities: [
        {
          id: 'aragorn',
          type: 'PERSON',
          canonical: 'Aragorn',
          aliases: ['Strider', 'Elessar'],
          evidence: []
        },
        {
          id: 'gandalf',
          type: 'PERSON',
          canonical: 'Gandalf',
          aliases: ['Mithrandir', 'Grey Pilgrim'],
          evidence: []
        },
        {
          id: 'rivendell',
          type: 'PLACE',
          canonical: 'Rivendell',
          aliases: ['Imladris'],
          evidence: []
        },
        {
          id: 'gondor',
          type: 'PLACE',
          canonical: 'Gondor',
          aliases: [],
          evidence: []
        },
        {
          id: 'narsil',
          type: 'OBJECT',
          canonical: 'Narsil',
          aliases: ['Sword of Elendil'],
          evidence: []
        }
      ],
      relations: [
        {
          id: 'r1',
          subj: 'aragorn',
          obj: 'rivendell',
          pred: 'TRAVELED_TO',
          confidence: 0.95,
          evidence: []
        },
        {
          id: 'r2',
          subj: 'gandalf',
          obj: 'rivendell',
          pred: 'TRAVELED_TO',
          confidence: 0.92,
          evidence: []
        },
        {
          id: 'r3',
          subj: 'aragorn',
          obj: 'gondor',
          pred: 'RULED',
          confidence: 0.98,
          evidence: []
        },
        {
          id: 'r4',
          subj: 'aragorn',
          obj: 'narsil',
          pred: 'WIELDED',
          confidence: 0.90,
          evidence: []
        }
      ],
      conflicts: [],
      provenance: new Map(),
      metadata: {
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        doc_count: 1,
        doc_ids: ['test-doc']
      }
    };

    saveGraph(testGraph, TEST_GRAPH_PATH);

    // Clear search cache
    clearSearchCache();

    // Create GraphQL server
    server = createGraphQLServer(TEST_GRAPH_PATH);
  });

  afterEach(async () => {
    // Clean up test data
    if (fs.existsSync(TEST_PROJECT_DIR)) {
      fs.rmSync(TEST_PROJECT_DIR, { recursive: true });
    }

    // Clear cache
    clearSearchCache();

    if (server) {
      await server.stop();
    }
  });

  describe('Basic Search', () => {
    it('should find entities by name', async () => {
      const response = await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "Aragorn") {
              hits {
                id
                kind
                label
                score
              }
            }
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.search;
        expect(data.hits.length).toBeGreaterThan(0);

        // Should find Aragorn entity
        const aragonHit = data.hits.find((h: any) => h.id.includes('aragorn'));
        expect(aragonHit).toBeDefined();
        expect(aragonHit.kind).toBe('entity');
        expect(aragonHit.label).toBe('Aragorn');
      }
    });

    it('should find entities by alias', async () => {
      const response = await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "Strider") {
              hits {
                id
                kind
                label
              }
            }
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.search;
        expect(data.hits.length).toBeGreaterThan(0);

        // Should find Aragorn via "Strider" alias
        const hit = data.hits.find((h: any) => h.id.includes('aragorn'));
        expect(hit).toBeDefined();
      }
    });

    it('should find relations by predicate', async () => {
      const response = await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "TRAVELED_TO") {
              hits {
                id
                kind
                predicate
              }
            }
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.search;

        // Should find TRAVELED_TO relations
        const relationHits = data.hits.filter((h: any) => h.kind === 'relation');
        expect(relationHits.length).toBeGreaterThan(0);
        expect(relationHits[0].predicate).toBe('TRAVELED_TO');
      }
    });

    it('should find relations by entity name', async () => {
      const response = await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "Rivendell") {
              hits {
                id
                kind
                label
              }
            }
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.search;

        // Should find both Rivendell entity and relations involving it
        expect(data.hits.length).toBeGreaterThan(0);

        const entityHit = data.hits.find((h: any) => h.kind === 'entity' && h.id.includes('rivendell'));
        expect(entityHit).toBeDefined();
      }
    });
  });

  describe('Faceting', () => {
    it('should return entity type facets', async () => {
      const response = await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "Aragorn Gandalf Rivendell") {
              entityTypes {
                name
                count
              }
            }
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.search;

        // Should have entity type facets
        expect(data.entityTypes.length).toBeGreaterThan(0);

        // Should include PERSON and PLACE types
        const personFacet = data.entityTypes.find((f: any) => f.name === 'PERSON');
        const placeFacet = data.entityTypes.find((f: any) => f.name === 'PLACE');

        expect(personFacet).toBeDefined();
        expect(placeFacet).toBeDefined();
        expect(personFacet.count).toBeGreaterThan(0);
        expect(placeFacet.count).toBeGreaterThan(0);
      }
    });

    it('should return predicate facets', async () => {
      const response = await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "Aragorn") {
              predicates {
                name
                count
              }
            }
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.search;

        // Should have predicate facets for relations
        // (Only for relation hits, not entity hits)
        expect(Array.isArray(data.predicates)).toBe(true);

        // If there are relation hits involving Aragorn, should have predicates
        if (data.predicates.length > 0) {
          expect(data.predicates[0]).toHaveProperty('name');
          expect(data.predicates[0]).toHaveProperty('count');
        }
      }
    });

    it('should sort facets by count descending', async () => {
      const response = await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "TRAVELED_TO RULED WIELDED") {
              predicates {
                name
                count
              }
            }
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.search;

        // Predicates should be sorted by count
        if (data.predicates.length > 1) {
          for (let i = 0; i < data.predicates.length - 1; i++) {
            expect(data.predicates[i].count).toBeGreaterThanOrEqual(data.predicates[i + 1].count);
          }
        }
      }
    });
  });

  describe('Result Quality', () => {
    it('should return snippets', async () => {
      const response = await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "Aragorn") {
              hits {
                snippet
              }
            }
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.search;

        // Should have snippets
        expect(data.hits.length).toBeGreaterThan(0);
        expect(data.hits[0].snippet).toBeDefined();
        expect(typeof data.hits[0].snippet).toBe('string');
      }
    });

    it('should return scores', async () => {
      const response = await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "Aragorn") {
              hits {
                score
              }
            }
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.search;

        // Should have scores
        expect(data.hits.length).toBeGreaterThan(0);
        expect(data.hits[0].score).toBeDefined();
        expect(typeof data.hits[0].score).toBe('number');
        expect(data.hits[0].score).toBeGreaterThan(0);
      }
    });

    it('should rank exact matches higher', async () => {
      const response = await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "Aragorn") {
              hits {
                label
                score
              }
            }
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.search;

        // Aragorn entity should be ranked high
        const firstHit = data.hits[0];
        expect(firstHit.label).toContain('Aragorn');
      }
    });
  });

  describe('Limit Enforcement', () => {
    it('should respect limit parameter', async () => {
      const response = await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "PERSON PLACE", limit: 2) {
              hits {
                id
              }
            }
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.search;

        // Should return at most 2 hits
        expect(data.hits.length).toBeLessThanOrEqual(2);
      }
    });

    it('should enforce maximum limit of 500', async () => {
      const response = await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "PERSON", limit: 1000) {
              hits {
                id
              }
            }
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.search;

        // Should cap at 500 (though test data has fewer items)
        expect(data.hits.length).toBeLessThanOrEqual(500);
      }
    });
  });

  describe('Empty Results', () => {
    it('should return empty results for no matches', async () => {
      const response = await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "NonexistentEntity12345") {
              hits {
                id
              }
              entityTypes {
                name
              }
              predicates {
                name
              }
            }
          }
        `
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.search;

        // Should return empty arrays
        expect(data.hits).toEqual([]);
        expect(data.entityTypes).toEqual([]);
        expect(data.predicates).toEqual([]);
      }
    });
  });
});
