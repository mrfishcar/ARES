/**
 * Timeline Analysis Resolvers
 * GraphQL resolvers for timeline extraction and analysis
 */

import { getHERTQuery } from '../hert-query';
import { TimelineAnalyzer } from '../../analysis/timeline-analyzer';
import type { TimelineExtractionOptions } from '../../analysis/timeline-types';

export const timelineAnalysisResolvers = {
  Query: {
    /**
     * Analyze timelines from project data
     */
    analyzeTimeline: (
      _: any,
      args: { project: string; options?: TimelineExtractionOptions }
    ) => {

      // Get query API for the project
      const queryAPI = getHERTQuery();

      // Create analyzer
      const analyzer = new TimelineAnalyzer(queryAPI);

      // Run analysis with options
      const options: TimelineExtractionOptions = {
        minTemporalConfidence: args.options?.minTemporalConfidence ?? 0.5,
        minEventsPerTimeline: args.options?.minEventsPerTimeline ?? 2,
        maxTemporalGap: args.options?.maxTemporalGap,
        clusteringStrategy: (args.options?.clusteringStrategy as any) ?? 'hybrid',
        inferTemporalRelations: args.options?.inferTemporalRelations ?? true,
        detectBranches: args.options?.detectBranches ?? true,
        autoMergeDisconnected: args.options?.autoMergeDisconnected ?? false,
      };

      const result = analyzer.analyze(options);

      // Convert to GraphQL format
      return result;
    },

    /**
     * Get timeline visualization data
     */
    getTimelineData: (
      _: any,
      args: {
        project: string;
        startDate?: string;
        endDate?: string;
        minConfidence?: number;
      }
    ) => {

      // Get query API
      const queryAPI = getHERTQuery();

      // Create analyzer
      const analyzer = new TimelineAnalyzer(queryAPI);

      // Run analysis
      const options: TimelineExtractionOptions = {
        minTemporalConfidence: args.minConfidence ?? 0.5,
        minEventsPerTimeline: 1,
        clusteringStrategy: 'hybrid',
        inferTemporalRelations: true,
        detectBranches: true,
        autoMergeDisconnected: false,
      };

      const result = analyzer.analyze(options);

      // Filter events by date range if provided
      if (args.startDate || args.endDate) {
        const filterTimeline = (timeline: any) => {
          const filteredEvents = timeline.events.filter((event: any) => {
            const eventDate = event.temporal.normalized || event.temporal.raw;

            if (args.startDate && eventDate < args.startDate) return false;
            if (args.endDate && eventDate > args.endDate) return false;

            return true;
          });

          return {
            ...timeline,
            events: filteredEvents,
          };
        };

        result.timelineSet.primary = filterTimeline(result.timelineSet.primary);
        result.timelineSet.branches = result.timelineSet.branches.map(filterTimeline);
        result.timelineSet.alternates = result.timelineSet.alternates.map(filterTimeline);
        result.timelineSet.disconnected = result.timelineSet.disconnected.map(filterTimeline);
      }

      return result.timelineSet;
    },
  },
};
