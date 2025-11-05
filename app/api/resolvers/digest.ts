/**
 * Digest Resolvers - Sprint W1
 * Entity digest composition with citations
 */

import { composeEntityDigest, EntityDigest, DigestOptions } from '../../generate/digest';
import { incrementCounter } from '../../monitor/metrics';
import { logger } from '../../infra/logger';

/**
 * Validate project name (no path traversal)
 */
function validateProject(project: string): void {
  if (project.includes('..') || project.includes('/') || project.includes('\\')) {
    throw new Error('Invalid project name');
  }
}

export const digestResolvers = {
  Query: {
    /**
     * Get compiled digest for an entity
     */
    entityDigest: (
      _: any,
      args: { project: string; entityId: string }
    ): EntityDigest => {
      validateProject(args.project);

      try {
        const digest = composeEntityDigest(args.project, args.entityId);

        // incrementCounter('api_entity_digest_total'); // TODO: Add metric to metrics.ts

        logger.info({
          event: 'entity_digest_queried',
          project: args.project,
          entityId: args.entityId,
          sections: digest.sections.length,
        });

        return digest;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to compose digest';
        logger.error({
          event: 'entity_digest_error',
          project: args.project,
          entityId: args.entityId,
          error: message,
        });
        throw new Error(message);
      }
    },
  },

  Mutation: {
    /**
     * Regenerate entity digest with optional configuration
     */
    regenerateEntityDigest: (
      _: any,
      args: { project: string; entityId: string; options?: Record<string, any> }
    ): EntityDigest => {
      validateProject(args.project);

      try {
        // Map GraphQL options to DigestOptions
        const options: DigestOptions = {};

        if (args.options) {
          if (args.options.brevity === 'concise' || args.options.brevity === 'detailed') {
            options.brevity = args.options.brevity;
          }

          if (args.options.tone === 'formal' || args.options.tone === 'casual') {
            options.tone = args.options.tone;
          }

          if (typeof args.options.includeSummary === 'boolean') {
            options.includeSummary = args.options.includeSummary;
          }

          if (typeof args.options.includeTimeline === 'boolean') {
            options.includeTimeline = args.options.includeTimeline;
          }

          if (typeof args.options.includeRelationships === 'boolean') {
            options.includeRelationships = args.options.includeRelationships;
          }

          if (typeof args.options.includeQuotes === 'boolean') {
            options.includeQuotes = args.options.includeQuotes;
          }
        }

        const digest = composeEntityDigest(args.project, args.entityId, options);

        // incrementCounter('api_regenerate_digest_total'); // TODO: Add metric to metrics.ts

        logger.info({
          event: 'entity_digest_regenerated',
          project: args.project,
          entityId: args.entityId,
          options: args.options,
          sections: digest.sections.length,
        });

        return digest;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to regenerate digest';
        logger.error({
          event: 'regenerate_digest_error',
          project: args.project,
          entityId: args.entityId,
          error: message,
        });
        throw new Error(message);
      }
    },
  },
};
