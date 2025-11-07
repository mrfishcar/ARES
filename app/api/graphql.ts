/**
 * GraphQL API - Phase 5
 * Apollo Server for querying and updating knowledge graph
 */

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
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

  // Start Apollo Server
  await server.start();

  // Create Express app
  const app = express();

  // Health check endpoints (before body parser to keep them fast)
  app.get('/healthz', (req, res) => {
    res.status(200).send('ok');
  });

  app.get('/readyz', (req, res) => {
    res.status(200).send('ready');
  });

  // Metrics endpoint
  app.get('/metrics', async (req, res) => {
    const { getPrometheusMetrics } = await import('../monitor/metrics');
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(getPrometheusMetrics());
  });

  // Apply middleware
  app.use(cors());
  app.use(bodyParser.json({ limit: '50mb' }));

  // GraphQL endpoint
  app.use(
    '/graphql',
    expressMiddleware(server, {
      context: async ({ req }) => {
        // Rate limiting check
        const clientId = extractClientId(req.headers as Record<string, string | string[] | undefined>);
        const rateLimitResult = globalRateLimiter.checkLimit(clientId);

        if (!rateLimitResult.allowed) {
          throw new Error(`Rate limit exceeded. Retry after ${rateLimitResult.retryAfter} seconds.`);
        }

        // Generate request_id
        const request_id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
        const log = withRequest(logger, request_id);

        // Log request (operation name not available at this stage)
        log.info({ msg: 'graphql_request', request_id });

        // Load graph for each request
        const graph = loadGraph(storagePath);
        return { graph, log, request_id };
      }
    })
  );

  // Wiki file serving endpoint
  app.get('/wiki-file', (req, res) => {
    const project = req.query.project as string;
    const id = req.query.id as string;

    if (!project || !id) {
      return res.status(400).json({ error: 'Missing project or id parameter' });
    }

    // Validate project and id (no path traversal)
    if (project.includes('..') || project.includes('/') || project.includes('\\')) {
      return res.status(400).json({ error: 'Invalid project name' });
    }

    if (id.includes('..') || id.includes('/') || id.includes('\\')) {
      return res.status(400).json({ error: 'Invalid entity id' });
    }

    // Build and validate path
    const wikiBase = path.join(process.cwd(), 'data', 'projects', project, 'wiki');
    const wikiFile = path.join(wikiBase, `${id}.md`);
    const resolvedPath = path.resolve(wikiFile);
    const resolvedBase = path.resolve(wikiBase);

    // Verify path is within wiki directory
    if (!resolvedPath.startsWith(resolvedBase)) {
      return res.status(400).json({ error: 'Path traversal attempt detected' });
    }

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Wiki file not found' });
    }

    // Serve file
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    res.set('Content-Type', 'text/markdown; charset=utf-8');
    res.send(content);
  });

  // Download endpoint
  app.get('/download', (req, res) => {
    const filePath = req.query.path as string;

    if (!filePath) {
      return res.status(400).json({ error: 'Missing path parameter' });
    }

    // Reject absolute paths
    if (path.isAbsolute(filePath)) {
      return res.status(400).json({ error: 'Absolute paths not allowed' });
    }

    // Reject path traversal
    if (filePath.includes('..')) {
      return res.status(400).json({ error: 'Path traversal not allowed' });
    }

    // Whitelist: only out/ directory
    const outBase = path.join(process.cwd(), 'out');
    const fullPath = path.join(outBase, filePath);
    const resolvedPath = path.resolve(fullPath);
    const resolvedBase = path.resolve(outBase);

    // Verify path is within out/ directory
    if (!resolvedPath.startsWith(resolvedBase)) {
      return res.status(400).json({ error: 'Access denied: only out/ directory allowed' });
    }

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Serve file with download header
    const basename = path.basename(resolvedPath);
    const content = fs.readFileSync(resolvedPath);
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${basename}"`);
    res.send(content);
  });

  // Upload endpoint - needs raw http.IncomingMessage
  app.post('/upload', (req, res) => {
    handleUpload(req as any, res as any);
  });

  // Media file serving
  app.get('/media/*', (req, res) => {
    const filepath = req.path.replace('/media/', '');
    handleMediaServe(req as any, res as any, filepath);
  });

  // Start Express server on the main port
  await new Promise<void>((resolve) => {
    app.listen(port, '0.0.0.0', () => {
      logger.info({ msg: 'graphql_server_ready', port, host: '0.0.0.0' });
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
  const port = parseInt(process.env.PORT || '4000', 10);
  startGraphQLServer(port).catch((error) => {
    console.error('Failed to start GraphQL server:', error);
    process.exit(1);
  });
}
