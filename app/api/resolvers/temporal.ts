/**
 * Temporal Resolvers - Sprint R8
 * GraphQL resolvers for temporal graph queries
 */

import { getTemporalEvents, getTemporalEdges } from '../../temporal/ingest';
import { incrementCounter } from '../../monitor/metrics';

export const temporalResolvers = {
  Query: {
    /**
     * List temporal events for a project
     */
    listTemporalEvents: (
      _: any,
      args: { project: string; limit?: number; after?: string }
    ) => {
      incrementCounter('api_list_temporal_events_total');

      const limit = Math.min(args.limit || 100, 500);
      const events = getTemporalEvents(args.project, limit);

      // Simple pagination: filter by after cursor
      if (args.after) {
        const afterIndex = events.findIndex(e => e.id === args.after);
        if (afterIndex >= 0) {
          return events.slice(afterIndex + 1, afterIndex + 1 + limit);
        }
      }

      return events.slice(0, limit);
    },

    /**
     * List temporal edges for a project
     */
    listTemporalEdges: (
      _: any,
      args: { project: string; limit?: number }
    ) => {
      incrementCounter('api_list_temporal_edges_total');

      const limit = Math.min(args.limit || 100, 500);
      return getTemporalEdges(args.project, limit);
    },
  },
};
