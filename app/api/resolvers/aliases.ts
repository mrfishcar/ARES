/**
 * Alias Resolvers - Sprint S3 & S8
 * GraphQL resolvers for alias brain operations
 */

import {
  loadAliasIndex,
  addAlias,
  removeAlias,
  buildAliasIndex,
  getAliasVersion,
  getEntityAliases,
  bumpAliasVersion,
} from '../../editor/aliasBrain';
import { incrementCounter, bumpHeartbeat } from '../../monitor/metrics';
import { logger } from '../../infra/logger';

/**
 * Validate project name (no path traversal)
 */
function validateProject(project: string): void {
  if (project.includes('..') || project.includes('/') || project.includes('\\')) {
    throw new Error('Invalid project name');
  }
}

export const aliasResolvers = {
  Query: {
    /**
     * S3: Get alias version for cache invalidation
     */
    getAliasVersion: (_: any, args: { project: string }): number => {
      validateProject(args.project);
      const version = getAliasVersion(args.project);
      incrementCounter('api_get_alias_version_total');
      return version;
    },

    /**
     * S3: Get all aliases for a project
     */
    getAliasIndex: (_: any, args: { project: string }): any => {
      validateProject(args.project);
      const index = loadAliasIndex(args.project);
      incrementCounter('api_get_alias_index_total');
      return index;
    },

    /**
     * S3: Get aliases for a specific entity
     */
    getEntityAliases: (_: any, args: { project: string; entityId: string }): string[] => {
      validateProject(args.project);
      const aliases = getEntityAliases(args.project, args.entityId);
      incrementCounter('api_get_entity_aliases_total');
      return aliases;
    },
  },

  Mutation: {
    /**
     * S8: Confirm an alias (add to dictionary)
     */
    aliasConfirm: (
      _: any,
      args: {
        project: string;
        entityId: string;
        entityName: string;
        alias: string;
        type: string;
      }
    ): any => {
      validateProject(args.project);

      // Add alias to index
      addAlias(args.project, args.entityId, args.entityName, args.alias, args.type as any);

      // Get the added alias entry
      const index = loadAliasIndex(args.project);
      const entry = index.aliases.find(
        (a) => a.entityId === args.entityId && a.alias.toLowerCase() === args.alias.toLowerCase()
      );

      if (!entry) {
        throw new Error('Failed to confirm alias');
      }

      // Bump heartbeat
      bumpHeartbeat();

      // Track metrics
      incrementCounter('alias_confirmed_total');

      logger.info({
        event: 'alias_confirmed',
        project: args.project,
        entityId: args.entityId,
        alias: args.alias,
        type: args.type,
      });

      return entry;
    },

    /**
     * S8: Reject an alias (remove from dictionary)
     */
    aliasReject: (_: any, args: { project: string; entityId: string; alias: string }): boolean => {
      validateProject(args.project);

      // Remove alias from index
      removeAlias(args.project, args.entityId, args.alias);

      // Bump heartbeat
      bumpHeartbeat();

      // Track metrics
      incrementCounter('alias_rejected_total');

      logger.info({
        event: 'alias_rejected',
        project: args.project,
        entityId: args.entityId,
        alias: args.alias,
      });

      return true;
    },

    /**
     * S8: Reclassify an alias (change entity type)
     */
    aliasReclassify: (
      _: any,
      args: { project: string; entityId: string; alias: string; newType: string }
    ): any => {
      validateProject(args.project);

      // Load index
      const index = loadAliasIndex(args.project);

      // Find and update alias
      const entry = index.aliases.find(
        (a) => a.entityId === args.entityId && a.alias.toLowerCase() === args.alias.toLowerCase()
      );

      if (!entry) {
        throw new Error('Alias not found');
      }

      // Update type
      entry.type = args.newType as any;
      entry.confirmedAt = new Date().toISOString();

      // Save and bump version
      index.version += 1;
      const aliasPath = require('path').join(
        process.cwd(),
        'data',
        'projects',
        args.project,
        'aliases.json'
      );
      require('fs').writeFileSync(aliasPath, JSON.stringify(index, null, 2));

      // Bump heartbeat
      bumpHeartbeat();

      // Track metrics
      incrementCounter('alias_reclassified_total');

      logger.info({
        event: 'alias_reclassified',
        project: args.project,
        entityId: args.entityId,
        alias: args.alias,
        newType: args.newType,
      });

      return entry;
    },

    /**
     * S3: Rebuild alias index from knowledge graph
     */
    rebuildAliasIndex: (_: any, args: { project: string }): any => {
      validateProject(args.project);

      // Rebuild index
      buildAliasIndex(args.project);

      // Load and return new index
      const index = loadAliasIndex(args.project);

      // Bump heartbeat
      bumpHeartbeat();

      // Track metrics
      incrementCounter('alias_index_rebuilt_total');

      logger.info({
        event: 'alias_index_rebuilt',
        project: args.project,
        aliasCount: index.aliases.length,
        version: index.version,
      });

      return index;
    },
  },
};
