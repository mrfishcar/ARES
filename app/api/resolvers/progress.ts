/**
 * Progress Resolvers - Sprint R8
 * GraphQL resolvers for gamification and progress tracking
 */

import { getProgress, recordEntityAction } from '../../storage/progress';
import { incrementCounter } from '../../monitor/metrics';

export const progressResolvers = {
  Query: {
    /**
     * Get progress for a project
     */
    getProgress: (_: any, { project }: { project: string }) => {
      incrementCounter('api_get_progress_total');
      return getProgress(project);
    },
  },

  Mutation: {
    /**
     * Record an entity action and update progress
     */
    recordEntityAction: (
      _: any,
      args: { project: string; actionType: string }
    ) => {
      const actionType = args.actionType as 'entity_created' | 'relation_created' | 'entity_approved';

      if (!['entity_created', 'relation_created', 'entity_approved'].includes(actionType)) {
        throw new Error(`Invalid action type: ${actionType}`);
      }

      const progress = recordEntityAction(args.project, actionType);
      incrementCounter('progress_action_recorded_total');
      // incrementCounter(`progress_level_${progress.level}_total`); // TODO: Add dynamic metrics

      return progress;
    },
  },
};
