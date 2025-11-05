/**
 * Integration tests for Search API
 * Sprint R3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ApolloServer } from '@apollo/server';
import { createGraphQLServer } from '../../app/api/graphql';
import { saveGraph, createEmptyGraph } from '../../app/storage/storage';
import type { KnowledgeGraph } from '../../app/storage/storage';
import * as fs from 'fs';
import * as path from 'path';

const TEST_STORAGE_PATH = path.join(process.cwd(), 'tmp', 'test-search-graph.json');

describe('Search API Integration', () => {
  let server: ApolloServer;
  let testGraph: KnowledgeGraph;

  beforeEach(() => {
    // Create test graph with sample data
    testGraph = createEmptyGraph();

    // Add entities
    testGraph.entities.push(
      {
        id: 'e1',
        type: 'PERSON',
        canonical: 'Barty Crouch Jr.',
        aliases: ['Barty', 'Junior'],
        created_at: new Date().toISOString()
      },
      {
        id: 'e2',
        type: 'PERSON',
        canonical: 'Barty Crouch Sr.',
        aliases: ['Senior', 'Bartemius'],
        created_at: new Date().toISOString()
      },
      {
        id: 'e3',
        type: 'ORGANIZATION',
        canonical: 'Ministry of Magic',
        aliases: ['Ministry'],
        created_at: new Date().toISOString()
      },
      {
        id: 'e4',
        type: 'PERSON',
        canonical: 'Harry Potter',
        aliases: ['Harry', 'The Boy Who Lived'],
        created_at: new Date().toISOString()
      }
    );

    // Add relations
    testGraph.relations.push(
      {
        id: 'r1',
        subj: 'e2',
        pred: 'works_at',
        obj: 'e3',
        confidence: 0.95,
        evidence: []
      },
      {
        id: 'r2',
        subj: 'e1',
        pred: 'son_of',
        obj: 'e2',
        confidence: 0.98,
        evidence: []
      },
      {
        id: 'r3',
        subj: 'e1',
        pred: 'impersonates',
        obj: 'e4',
        confidence: 0.85,
        evidence: []
      }
    );

    // Save test graph
    const dir = path.dirname(TEST_STORAGE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    saveGraph(testGraph, TEST_STORAGE_PATH);

    // Create server with test storage
    server = createGraphQLServer(TEST_STORAGE_PATH);
  });

  afterEach(() => {
    // Clean up test data
    if (fs.existsSync(TEST_STORAGE_PATH)) {
      fs.unlinkSync(TEST_STORAGE_PATH);
    }
  });

  describe('searchEntities', () => {
    it('should find entities by canonical name', async () => {
      const response = await server.executeOperation({
        query: `
          query SearchEntities($text: String!) {
            searchEntities(text: $text) {
              id
              name
              type
              snippet
            }
          }
        `,
        variables: { text: 'Barty' }
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const results = response.body.singleResult.data?.searchEntities;
        expect(results).toHaveLength(2);

        // Should find both Barty Crouch Jr. and Sr.
        const names = results.map((r: any) => r.name);
        expect(names).toContain('Barty Crouch Jr.');
        expect(names).toContain('Barty Crouch Sr.');
      }
    });

    it('should find entities by alias', async () => {
      const response = await server.executeOperation({
        query: `
          query SearchEntities($text: String!) {
            searchEntities(text: $text) {
              id
              name
              type
              snippet
            }
          }
        `,
        variables: { text: 'Bartemius' }
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const results = response.body.singleResult.data?.searchEntities;
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Barty Crouch Sr.');
        expect(results[0].snippet).toContain('Alias: Bartemius');
      }
    });

    it('should be case-insensitive', async () => {
      const response = await server.executeOperation({
        query: `
          query SearchEntities($text: String!) {
            searchEntities(text: $text) {
              id
              name
              type
            }
          }
        `,
        variables: { text: 'HARRY' }
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const results = response.body.singleResult.data?.searchEntities;
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Harry Potter');
      }
    });

    it('should respect limit parameter', async () => {
      const response = await server.executeOperation({
        query: `
          query SearchEntities($text: String!, $limit: Int) {
            searchEntities(text: $text, limit: $limit) {
              id
              name
            }
          }
        `,
        variables: { text: 'Barty', limit: 1 }
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const results = response.body.singleResult.data?.searchEntities;
        expect(results).toHaveLength(1);
      }
    });

    it('should return empty array when no matches found', async () => {
      const response = await server.executeOperation({
        query: `
          query SearchEntities($text: String!) {
            searchEntities(text: $text) {
              id
              name
            }
          }
        `,
        variables: { text: 'Voldemort' }
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const results = response.body.singleResult.data?.searchEntities;
        expect(results).toHaveLength(0);
      }
    });

    it('should include type in snippet for canonical matches', async () => {
      const response = await server.executeOperation({
        query: `
          query SearchEntities($text: String!) {
            searchEntities(text: $text) {
              name
              type
              snippet
            }
          }
        `,
        variables: { text: 'Ministry' }
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const results = response.body.singleResult.data?.searchEntities;
        expect(results).toHaveLength(1);
        expect(results[0].snippet).toBe('Type: ORGANIZATION');
      }
    });
  });

  describe('searchRelations', () => {
    it('should find relations by subject name', async () => {
      const response = await server.executeOperation({
        query: `
          query SearchRelations($text: String!) {
            searchRelations(text: $text) {
              id
              name
              type
              snippet
            }
          }
        `,
        variables: { text: 'Barty Crouch Jr' }
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const results = response.body.singleResult.data?.searchRelations;
        expect(results.length).toBeGreaterThan(0);

        // Should find relations where Barty Jr. is subject
        const hasRelation = results.some((r: any) =>
          r.name.includes('Barty Crouch Jr.')
        );
        expect(hasRelation).toBe(true);
      }
    });

    it('should find relations by predicate', async () => {
      const response = await server.executeOperation({
        query: `
          query SearchRelations($text: String!) {
            searchRelations(text: $text) {
              id
              name
              type
            }
          }
        `,
        variables: { text: 'works_at' }
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const results = response.body.singleResult.data?.searchRelations;
        expect(results).toHaveLength(1);
        expect(results[0].name).toContain('works_at');
      }
    });

    it('should find relations by object name', async () => {
      const response = await server.executeOperation({
        query: `
          query SearchRelations($text: String!) {
            searchRelations(text: $text) {
              id
              name
              type
            }
          }
        `,
        variables: { text: 'Ministry' }
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const results = response.body.singleResult.data?.searchRelations;
        expect(results).toHaveLength(1);
        expect(results[0].name).toContain('Ministry of Magic');
      }
    });

    it('should be case-insensitive', async () => {
      const response = await server.executeOperation({
        query: `
          query SearchRelations($text: String!) {
            searchRelations(text: $text) {
              id
              name
            }
          }
        `,
        variables: { text: 'SON_OF' }
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const results = response.body.singleResult.data?.searchRelations;
        expect(results).toHaveLength(1);
        expect(results[0].name).toContain('son_of');
      }
    });

    it('should respect limit parameter', async () => {
      const response = await server.executeOperation({
        query: `
          query SearchRelations($text: String!, $limit: Int) {
            searchRelations(text: $text, limit: $limit) {
              id
              name
            }
          }
        `,
        variables: { text: 'Barty', limit: 1 }
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const results = response.body.singleResult.data?.searchRelations;
        expect(results).toHaveLength(1);
      }
    });

    it('should include confidence in snippet', async () => {
      const response = await server.executeOperation({
        query: `
          query SearchRelations($text: String!) {
            searchRelations(text: $text) {
              name
              snippet
            }
          }
        `,
        variables: { text: 'son_of' }
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const results = response.body.singleResult.data?.searchRelations;
        expect(results).toHaveLength(1);
        expect(results[0].snippet).toContain('Confidence: 0.98');
      }
    });

    it('should return empty array when no matches found', async () => {
      const response = await server.executeOperation({
        query: `
          query SearchRelations($text: String!) {
            searchRelations(text: $text) {
              id
              name
            }
          }
        `,
        variables: { text: 'nonexistent' }
      });

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        const results = response.body.singleResult.data?.searchRelations;
        expect(results).toHaveLength(0);
      }
    });
  });

  describe('Combined search scenarios', () => {
    it('should find both entities and relations for "Barty"', async () => {
      // Search entities
      const entitiesResponse = await server.executeOperation({
        query: `
          query SearchEntities($text: String!) {
            searchEntities(text: $text) {
              id
              name
              type
            }
          }
        `,
        variables: { text: 'Barty' }
      });

      // Search relations
      const relationsResponse = await server.executeOperation({
        query: `
          query SearchRelations($text: String!) {
            searchRelations(text: $text) {
              id
              name
              type
            }
          }
        `,
        variables: { text: 'Barty' }
      });

      // Verify entities found
      expect(entitiesResponse.body.kind).toBe('single');
      if (entitiesResponse.body.kind === 'single') {
        const entities = entitiesResponse.body.singleResult.data?.searchEntities;
        expect(entities.length).toBeGreaterThanOrEqual(2); // Both Barty entities
      }

      // Verify relations found
      expect(relationsResponse.body.kind).toBe('single');
      if (relationsResponse.body.kind === 'single') {
        const relations = relationsResponse.body.singleResult.data?.searchRelations;
        expect(relations.length).toBeGreaterThanOrEqual(2); // Relations involving Barty
      }
    });
  });
});
