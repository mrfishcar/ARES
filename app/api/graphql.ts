/**
 * GraphQL API - Phase 5
 * Apollo Server for querying and updating knowledge graph
 */

import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as http from 'http';
import { loadGraph, appendDoc, getProvenance } from '../storage/storage';
import type { KnowledgeGraph } from '../storage/storage';
import { getReviewQueue, approveItem, dismissItem } from '../storage/review-queue';
import { logger, withRequest } from '../infra/logger';
import type { Logger } from 'pino';
import { metricsHandler } from '../infra/metrics';
import { getHeartbeat, incrementIngest, incrementApproved, incrementDismissed } from '../monitor/metrics';
import { buildConnection, type ConnectionArgs } from './pagination';
import type { Entity, Relation } from '../engine/schema';
import type { Conflict } from '../engine/conflicts';
import { entityResolvers } from './resolvers/entities';
import { relationResolvers } from './resolvers/relations';
import { graphOpsResolvers } from './resolvers/graph-ops';
import { graphVizResolvers } from './resolvers/graph-viz';
import { notesResolvers } from './resolvers/notes';
import { seedsResolvers } from './resolvers/seeds';
import { themeResolvers } from './resolvers/theme';
import { progressResolvers } from './resolvers/progress';
import { temporalResolvers } from './resolvers/temporal';
import { digestResolvers } from './resolvers/digest';
import { entityMentionsResolvers } from './resolvers/entityMentions';
import { aliasResolvers } from './resolvers/aliases';
import { bulkReviewResolvers } from './resolvers/bulk-review';
import { searchResolvers } from './resolvers/search';
import { timelineAnalysisResolvers } from './resolvers/timeline-analysis';
import { wikiResolvers } from './resolvers/wiki';
import { errorLogResolvers } from './resolvers/error_log';
import { entityHighlightingResolvers } from './resolvers/entity-highlighting';
import { globalRateLimiter, extractClientId } from './rate-limit';
import { invalidateProjectCache } from './cache-layer';
import { handleUpload, handleMediaServe } from './upload';

// Load schema
const schemaPath = path.join(__dirname, 'schema.graphql');
const typeDefs = fs.readFileSync(schemaPath, 'utf-8');

// Create resolvers with optional storage path
function createResolvers(storagePath?: string) {
  return {
    // Scalar resolvers
    Cursor: {
      serialize: (value: string) => value,
      parseValue: (value: string) => value,
      parseLiteral: (ast: any) => ast.value
    },

    JSON: {
      serialize: (value: any) => value,
      parseValue: (value: any) => value,
      parseLiteral: (ast: any) => ast.value
    },

    Query: {
      entities: (_: any, { type, name }: { type?: string; name?: string }) => {
        const graph = loadGraph(storagePath);
        if (!graph) return [];

        return graph.entities.filter(e => {
          if (type && e.type !== type) return false;
          if (name && !e.canonical.toLowerCase().includes(name.toLowerCase())) return false;
          return true;
        });
      },

      relations: (_: any, { predicate, subjectId, objectId }: {
        predicate?: string;
        subjectId?: string;
        objectId?: string
      }) => {
        const graph = loadGraph(storagePath);
        if (!graph) return [];

        return graph.relations.filter(r => {
          if (predicate && r.pred !== predicate) return false;
          if (subjectId && r.subj !== subjectId) return false;
          if (objectId && r.obj !== objectId) return false;
          return true;
        });
      },

      conflicts: (_: any, { subjectId, type }: { subjectId?: string; type?: string }) => {
        const graph = loadGraph(storagePath);
        if (!graph) return [];

        return graph.conflicts.filter(c => {
          if (type && c.type !== type) return false;
          if (subjectId) {
            const hasSubject = c.relations.some(r => r.subj === subjectId || r.obj === subjectId);
            if (!hasSubject) return false;
          }
          return true;
        });
      },

      graph: () => {
        const graph = loadGraph(storagePath);
        if (!graph) {
          return {
            entities: [],
            relations: [],
            conflicts: [],
            metadata: {
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              docCount: 0,
              docIds: []
            }
          };
        }
        return graph;
      },

      // Paginated queries with Relay-style cursors
      entitiesConnection: (
        _: any,
        args: { type?: string; name?: string } & ConnectionArgs
      ) => {
        const graph = loadGraph(storagePath);
        if (!graph) {
          return {
            edges: [],
            pageInfo: {
              hasNextPage: false,
              hasPreviousPage: false
            },
            totalCount: 0
          };
        }

        // Filter entities
        let filtered = graph.entities.filter((e: Entity) => {
          if (args.type && e.type !== args.type) return false;
          if (args.name && !e.canonical.toLowerCase().includes(args.name.toLowerCase())) return false;
          return true;
        });

        // Deterministic sort: by type, then canonical name
        const sorted = filtered.sort((a: Entity, b: Entity) => {
          if (a.type !== b.type) return a.type.localeCompare(b.type);
          return a.canonical.localeCompare(b.canonical);
        });

        // Build connection using entity ID as cursor key
        const connection = buildConnection(sorted, args, (e: Entity) => e.id);

        return {
          ...connection,
          totalCount: filtered.length
        };
      },

      relationsConnection: (
        _: any,
        args: { predicate?: string; subjectId?: string; objectId?: string } & ConnectionArgs
      ) => {
        const graph = loadGraph(storagePath);
        if (!graph) {
          return {
            edges: [],
            pageInfo: {
              hasNextPage: false,
              hasPreviousPage: false
            },
            totalCount: 0
          };
        }

        // Filter relations
        let filtered = graph.relations.filter((r: Relation) => {
          if (args.predicate && r.pred !== args.predicate) return false;
          if (args.subjectId && r.subj !== args.subjectId) return false;
          if (args.objectId && r.obj !== args.objectId) return false;
          return true;
        });

        // Deterministic sort: by subject ID, predicate, object ID
        const sorted = filtered.sort((a: Relation, b: Relation) => {
          if (a.subj !== b.subj) return a.subj.localeCompare(b.subj);
          if (a.pred !== b.pred) return a.pred.localeCompare(b.pred);
          return a.obj.localeCompare(b.obj);
        });

        // Build connection using relation ID as cursor key
        const connection = buildConnection(sorted, args, (r: Relation) => r.id);

        return {
          ...connection,
          totalCount: filtered.length
        };
      },

      conflictsConnection: (
        _: any,
        args: { subjectId?: string; type?: string } & ConnectionArgs
      ) => {
        const graph = loadGraph(storagePath);
        if (!graph) {
          return {
            edges: [],
            pageInfo: {
              hasNextPage: false,
              hasPreviousPage: false
            },
            totalCount: 0
          };
        }

        // Filter conflicts
        let filtered = graph.conflicts.filter((c: Conflict) => {
          if (args.type && c.type !== args.type) return false;
          if (args.subjectId) {
            const hasSubject = c.relations.some((r: Relation) =>
              r.subj === args.subjectId || r.obj === args.subjectId
            );
            if (!hasSubject) return false;
          }
          return true;
        });

        // Deterministic sort: by type, then description
        const sorted = filtered.sort((a: Conflict, b: Conflict) => {
          if (a.type !== b.type) return a.type.localeCompare(b.type);
          return a.description.localeCompare(b.description);
        });

        // Build connection using description as cursor key (conflicts don't have IDs)
        const connection = buildConnection(
          sorted,
          args,
          (c: Conflict) => `${c.type}::${c.description}`
        );

        return {
          ...connection,
          totalCount: filtered.length
        };
      },

      // Review Queue queries (Sprint R1)
      reviewStats: (_: any, { project }: { project: string }) => {
        const queue = getReviewQueue(project);
        return {
          entities: queue.entities.length,
          relations: queue.relations.length
        };
      },

      pendingEntities: (_: any, { project, limit, after }: {
        project: string;
        limit?: number;
        after?: string;
      }) => {
        const queue = getReviewQueue(project);
        let entities = queue.entities;

        // Simple pagination: find index of 'after' item
        if (after) {
          const afterIndex = entities.findIndex(e => e.id === after);
          if (afterIndex >= 0) {
            entities = entities.slice(afterIndex + 1);
          }
        }

        // Apply limit
        const maxLimit = limit || 50;
        return entities.slice(0, maxLimit);
      },

      pendingRelations: (_: any, { project, limit, after }: {
        project: string;
        limit?: number;
        after?: string;
      }) => {
        const queue = getReviewQueue(project);
        let relations = queue.relations;

        // Simple pagination: find index of 'after' item
        if (after) {
          const afterIndex = relations.findIndex(r => r.id === after);
          if (afterIndex >= 0) {
            relations = relations.slice(afterIndex + 1);
          }
        }

        // Apply limit
        const maxLimit = limit || 50;
        return relations.slice(0, maxLimit);
      },

      reviewHeartbeat: (_: any, { project }: { project: string }) => {
        return {
          project,
          lastUpdatedAt: getHeartbeat()
        };
      },

      searchEntities: (_: any, { text, limit }: { text: string; limit?: number }) => {
        const graph = loadGraph(storagePath);
        if (!graph) return [];

        const searchText = text.toLowerCase();
        const maxLimit = limit || 20;
        const results = [];

        for (const entity of graph.entities) {
          // Check canonical name
          if (entity.canonical.toLowerCase().includes(searchText)) {
            results.push({
              id: entity.id,
              name: entity.canonical,
              type: entity.type,
              snippet: `Type: ${entity.type}`
            });
            continue;
          }

          // Check aliases
          for (const alias of entity.aliases || []) {
            if (alias.toLowerCase().includes(searchText)) {
              results.push({
                id: entity.id,
                name: entity.canonical,
                type: entity.type,
                snippet: `Alias: ${alias}`
              });
              break;
            }
          }

          if (results.length >= maxLimit) break;
        }

        return results.slice(0, maxLimit);
      },

      searchRelations: (_: any, { text, limit }: { text: string; limit?: number }) => {
        const graph = loadGraph(storagePath);
        if (!graph) return [];

        const searchText = text.toLowerCase();
        const maxLimit = limit || 20;
        const results = [];
        const entityById = new Map(graph.entities.map(e => [e.id, e]));

        for (const relation of graph.relations) {
          const subjEntity = entityById.get(relation.subj);
          const objEntity = entityById.get(relation.obj);

          const subjName = subjEntity?.canonical || relation.subj;
          const objName = objEntity?.canonical || relation.obj;

          // Check if search text matches subject, predicate, or object
          if (
            subjName.toLowerCase().includes(searchText) ||
            relation.pred.toLowerCase().includes(searchText) ||
            objName.toLowerCase().includes(searchText)
          ) {
            results.push({
              id: relation.id,
              name: `${subjName} → ${relation.pred} → ${objName}`,
              type: 'RELATION',
              snippet: `Confidence: ${relation.confidence?.toFixed(2) || 'N/A'}`
            });

            if (results.length >= maxLimit) break;
          }
        }

        return results.slice(0, maxLimit);
      },

      // Sprint R4: Entity/Relation list and detail
      ...entityResolvers.Query,
      ...relationResolvers.Query,
      ...graphOpsResolvers.Query,

      // Sprint R6: Graph Visualization
      ...graphVizResolvers.Query,

      // Sprint R7: Notes and Seeds
      ...notesResolvers.Query,
      ...seedsResolvers.Query,

      // Sprint R8: Theming, Gamification & Temporal
      ...themeResolvers.Query,
      ...progressResolvers.Query,
      ...temporalResolvers.Query,

      // Sprint W1: Entity Digest Composer
      ...digestResolvers.Query,

      // Sprint W2: Entity Highlighting & Interactive Writing
      ...entityMentionsResolvers.Query,
      ...entityHighlightingResolvers.Query,

      // Sprint S3 & S8: Alias Brain & Alias Mutations
      ...aliasResolvers.Query,

      // Sprint R6 Phase 3: Bulk Review Operations
      ...bulkReviewResolvers.Query,

      // Sprint R6 Phase 5: Advanced Search
      ...searchResolvers.Query,

      // Timeline Analysis System
      ...timelineAnalysisResolvers.Query,

      // Wiki Generation System
      ...wikiResolvers.Query
    },

    Mutation: {
      ingestDoc: async (_: any, { text, docId }: { text: string; docId: string }, context: any) => {
        try {
          const result = await appendDoc(docId, text, storagePath);

          // Track metrics
          incrementIngest();

          // Invalidate caches (extract project from storagePath if available)
          // For now, we'll invalidate in the review mutations where project is explicit

          return {
            entities: result.entities,
            relations: result.relations,
            conflicts: result.conflicts,
            mergeCount: result.mergeCount,
            message: `Successfully ingested document ${docId}. Merged ${result.mergeCount} entities.`
          };
        } catch (error: any) {
          throw new Error(`Failed to ingest document: ${error.message}`);
        }
      },

      // Review Queue mutations (Sprint R1)
      approveReviewItem: async (_: any, { project, id }: { project: string; id: string }) => {
        try {
          const success = await approveItem(project, id);
          if (success) {
            incrementApproved();
            // Invalidate caches for this project
            invalidateProjectCache(project);
          }
          return success;
        } catch (error: any) {
          throw new Error(`Failed to approve item: ${error.message}`);
        }
      },

      dismissReviewItem: (_: any, { project, id }: { project: string; id: string }) => {
        try {
          const success = dismissItem(project, id);
          if (success) {
            incrementDismissed();
            // Invalidate caches for this project
            invalidateProjectCache(project);
          }
          return success;
        } catch (error: any) {
          throw new Error(`Failed to dismiss item: ${error.message}`);
        }
      },

      // Sprint R4: Graph operations
      ...graphOpsResolvers.Mutation,

      // Sprint R7: Notes and Seeds
      ...notesResolvers.Mutation,
      ...seedsResolvers.Mutation,

      // Sprint R8: Theming, Gamification & Temporal
      ...themeResolvers.Mutation,
      ...progressResolvers.Mutation,

      // Sprint W1: Entity Digest Composer
      ...digestResolvers.Mutation,

      // Sprint W2: Entity Highlighting & Interactive Writing
      ...entityMentionsResolvers.Mutation,

      // Sprint S3 & S8: Alias Brain & Alias Mutations
      ...aliasResolvers.Mutation,

      // Sprint R6 Phase 3: Bulk Review Operations
      ...bulkReviewResolvers.Mutation,

      // Wiki Generation System
      ...wikiResolvers.Mutation,

      // Client error logging
      ...errorLogResolvers.Mutation
    },

    // Field resolvers
    Entity: {
      createdAt: (entity: any) => entity.created_at || new Date().toISOString(),
      localIds: (entity: any, _: any, context: { graph?: KnowledgeGraph }) => {
        const graph = context.graph || loadGraph(storagePath);
        if (!graph) return [];

        const provenance = getProvenance(entity.id, graph);
        return provenance.map(p => `${p.doc_id}_${p.local_canonical}`);
      }
    },

    Relation: {
      predicate: (relation: any) => relation.pred || relation.predicate,

      subject: (relation: any, _: any, context: { graph?: KnowledgeGraph }) => {
        const graph = context.graph || loadGraph(storagePath);
        if (!graph) return null;

        return graph.entities.find(e => e.id === relation.subj);
      },

      object: (relation: any, _: any, context: { graph?: KnowledgeGraph }) => {
        const graph = context.graph || loadGraph(storagePath);
        if (!graph) return null;

        return graph.entities.find(e => e.id === relation.obj);
      }
    },

    Conflict: {
      relations: (conflict: any, _: any, context: { graph?: KnowledgeGraph }) => {
        // Conflicts already have relations embedded
        return conflict.relations;
      }
    }
  };
}

/**
 * Start GraphQL server
 */
export async function startGraphQLServer(port: number = 4000, storagePath?: string) {
  const server = new ApolloServer({
    typeDefs,
    resolvers: createResolvers(storagePath),
    formatError: (formattedError) => {
      logger.error({ msg: 'graphql_error', err: formattedError.message });
      return formattedError;
    }
  });

  // Global error handlers
  process.on('unhandledRejection', (reason: any) => {
    logger.error({ msg: 'unhandledRejection', reason: String(reason) });
  });
  process.on('uncaughtException', (err: any) => {
    logger.error({ msg: 'uncaughtException', err: err?.stack || String(err) });
  });

  // Custom HTTP server wrapper for observability endpoints
  const httpServer = http.createServer(async (req, res) => {
    // Health/readiness/metrics endpoints
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (req.url === '/readyz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ready');
      return;
    }
    if (req.url === '/metrics') {
      // Import metrics from monitor module
      const { getPrometheusMetrics } = await import('../monitor/metrics');
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
      res.end(getPrometheusMetrics());
      return;
    }

    // Wiki file serving endpoint (Sprint R4)
    if (req.url?.startsWith('/wiki-file')) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const project = url.searchParams.get('project');
      const id = url.searchParams.get('id');

      if (!project || !id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing project or id parameter' }));
        return;
      }

      // Validate project and id (no path traversal)
      if (project.includes('..') || project.includes('/') || project.includes('\\')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid project name' }));
        return;
      }

      if (id.includes('..') || id.includes('/') || id.includes('\\')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid entity id' }));
        return;
      }

      // Build and validate path
      const wikiBase = path.join(process.cwd(), 'data', 'projects', project, 'wiki');
      const wikiFile = path.join(wikiBase, `${id}.md`);
      const resolvedPath = path.resolve(wikiFile);
      const resolvedBase = path.resolve(wikiBase);

      // Verify path is within wiki directory (path traversal protection)
      if (!resolvedPath.startsWith(resolvedBase)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Path traversal attempt detected' }));
        return;
      }

      // Check if file exists
      if (!fs.existsSync(resolvedPath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Wiki file not found' }));
        return;
      }

      // Serve file
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end(content);
      return;
    }

    // Download endpoint (Sprint R4)
    if (req.url?.startsWith('/download')) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const filePath = url.searchParams.get('path');

      if (!filePath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing path parameter' }));
        return;
      }

      // Reject absolute paths
      if (path.isAbsolute(filePath)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Absolute paths not allowed' }));
        return;
      }

      // Reject path traversal
      if (filePath.includes('..')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Path traversal not allowed' }));
        return;
      }

      // Whitelist: only out/ directory
      const outBase = path.join(process.cwd(), 'out');
      const fullPath = path.join(outBase, filePath);
      const resolvedPath = path.resolve(fullPath);
      const resolvedBase = path.resolve(outBase);

      // Verify path is within out/ directory
      if (!resolvedPath.startsWith(resolvedBase)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access denied: only out/ directory allowed' }));
        return;
      }

      // Check if file exists
      if (!fs.existsSync(resolvedPath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File not found' }));
        return;
      }

      // Serve file with download header
      const basename = path.basename(resolvedPath);
      const content = fs.readFileSync(resolvedPath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${basename}"`
      });
      res.end(content);
      return;
    }

    // Upload endpoint (Sprint R7)
    if (req.url === '/upload') {
      await handleUpload(req, res);
      return;
    }

    // Media file serving (Sprint R7)
    if (req.url?.startsWith('/media/')) {
      const filepath = req.url.replace('/media/', '');
      handleMediaServe(req, res, filepath);
      return;
    }

    // Register alias endpoint (for drag-and-drop alias merging)
    if (req.url === '/register-alias') {
      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
      }

      if (req.method === 'POST') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const { alias, canonical, type } = JSON.parse(body);

            if (!alias || !canonical) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing alias or canonical name' }));
              return;
            }

            logger.info({ msg: 'register_alias', alias, canonical, type });

            // Register the alias in the alias registry
            const { registerAlias } = await import('../engine/extract/orchestrator.js');
            const result = await registerAlias(alias, canonical, type || 'PERSON');

            logger.info({ msg: 'alias_registered', alias, canonical, eid: result.eid, aid: result.aid });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              alias,
              canonical,
              eid: result.eid,
              aid: result.aid,
            }));

          } catch (error) {
            logger.error({ msg: 'register_alias_error', err: String(error) });
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'Failed to register alias',
              details: error instanceof Error ? error.message : String(error)
            }));
          }
        });
      }

      return;
    }

    // Extract entities endpoint (for Extraction Lab)
    if (req.url === '/extract-entities') {
      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
      }

      // Only allow POST for actual extraction
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
        return;
      }

      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const { text } = JSON.parse(body);

          if (!text || typeof text !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Text is required' }));
            return;
          }

          logger.info({ msg: 'extract_entities_request', length: text.length });

          // Use temp storage for processing
          const timestamp = Date.now();
          const tempPath = path.join(process.cwd(), `temp-extract-${timestamp}.json`);

          // Clear any existing temp storage
          const { clearStorage } = await import('../storage/storage');
          clearStorage(tempPath);

          // Extract entities and relations using the FULL ARES engine
          const startTime = Date.now();
          const appendResult = await appendDoc(`extract-${timestamp}`, text, tempPath);
          const extractTime = Date.now() - startTime;

          logger.info({
            msg: 'extract_entities_complete',
            entities: appendResult.entities.length,
            relations: appendResult.relations.length,
            time: extractTime
          });

          // Cleanup temp storage
          clearStorage(tempPath);

          const rawEntities = appendResult.localEntities?.length ? appendResult.localEntities : appendResult.entities;
          const rawRelations = appendResult.relations;

          // Transform entities to frontend format with spans
          const entitySpans = rawEntities.map(entity => {
            // Find all occurrences of this entity in the text
            const escapedCanonical = entity.canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedCanonical}\\b`, 'gi');
            const matches = [];
            let match;
            while ((match = regex.exec(text)) !== null) {
              matches.push({
                start: match.index,
                end: match.index + match[0].length,
              });
            }

            return {
              id: entity.id,
              text: entity.canonical,
              type: entity.type,
              confidence: entity.centrality || 1.0,
              spans: matches,
              aliases: entity.aliases || [],
            };
          });

          const entityMap = new Map<string, Entity>();
          for (const entity of rawEntities) {
            entityMap.set(entity.id, entity);
          }
          for (const entity of appendResult.entities) {
            if (!entityMap.has(entity.id)) {
              entityMap.set(entity.id, entity);
            }
          }

          // Transform relations to frontend format
          const relations = rawRelations.map(rel => ({
            id: rel.id,
            subj: rel.subj,
            obj: rel.obj,
            pred: rel.pred,
            confidence: rel.confidence,
            subjCanonical: entityMap.get(rel.subj)?.canonical || 'UNKNOWN',
            objCanonical: entityMap.get(rel.obj)?.canonical || 'UNKNOWN',
          }));

          // Send response
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            entities: entitySpans,
            relations,
            stats: {
              extractionTime: extractTime,
              entityCount: rawEntities.length,
              relationCount: rawRelations.length,
              conflictCount: appendResult.conflicts?.length ?? 0,
            },
            fictionEntities: appendResult.fictionEntities.slice(0, 15),
          }));

        } catch (error) {
          logger.error({ msg: 'extract_entities_error', err: String(error) });
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Failed to extract entities',
            details: error instanceof Error ? error.message : String(error)
          }));
        }
      });

      return;
    }

    // Handle GraphQL requests
    if (req.url === '/graphql') {
      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-request-id',
        });
        res.end();
        return;
      }

      if (req.method === 'POST') {
        // Set CORS headers for actual request
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-request-id');

        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const { query, variables, operationName } = JSON.parse(body);

            // Rate limiting check
            const clientId = extractClientId(req.headers as Record<string, string | string[] | undefined>);
            const rateLimitResult = globalRateLimiter.checkLimit(clientId);

            if (!rateLimitResult.allowed) {
              res.writeHead(429, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                errors: [{ message: `Rate limit exceeded. Retry after ${rateLimitResult.retryAfter} seconds.` }]
              }));
              return;
            }

            // Generate request_id
            const request_id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
            const log = withRequest(logger, request_id);

            // Log request
            log.info({ msg: 'graphql_request', request_id, operationName });

            // Load graph for context
            const graph = loadGraph(storagePath);

            // Execute GraphQL operation
            const result = await server.executeOperation(
              { query, variables, operationName },
              { contextValue: { graph, log, request_id } }
            );

            // Send response
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));

          } catch (error) {
            logger.error({ msg: 'graphql_parse_error', err: String(error) });
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              errors: [{ message: 'Invalid GraphQL request' }]
            }));
          }
        });

        return;
      }

      // Method not allowed for GraphQL
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    // For other requests, return 404
    res.writeHead(404);
    res.end('Not Found');
  });

  // Start Apollo Server
  await server.start();

  // Start unified HTTP server on one port
  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => {
      logger.info({
        msg: 'server_ready',
        port,
        graphqlUrl: `http://localhost:${port}/graphql`,
        extractUrl: `http://localhost:${port}/extract-entities`
      });
      resolve();
    });
  });

  return server;
}

/**
 * Create server instance without starting (for testing)
 */
export function createGraphQLServer(storagePath?: string) {
  return new ApolloServer({
    typeDefs,
    resolvers: createResolvers(storagePath)
  });
}

// Start server if this file is run directly
if (require.main === module) {
  // Use Railway's PORT environment variable, fallback to 4000 for local dev
  const port = parseInt(process.env.PORT || '4000', 10);
  startGraphQLServer(port).catch((error) => {
    console.error('Failed to start GraphQL server:', error);
    process.exit(1);
  });
}
