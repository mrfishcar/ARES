/**
 * Entity Highlighting Resolvers
 * Real-time entity detection using the backend entityHighlighter engine
 */

import { highlightEntities, type EntitySpan, type HighlightConfig } from '../../editor/entityHighlighter';

interface HighlightConfigInput {
  maxHighlights?: number;
  minConfidence?: number;
  enableNaturalDetection?: boolean;
  project?: string;
  enableAliasPass?: boolean;
  enableLLM?: boolean;
  llmMode?: 'hybrid' | 'llm-only' | 'algorithm-only';
}

export const entityHighlightingResolvers = {
  Query: {
    /**
     * Real-time entity detection for arbitrary text
     * Uses the sophisticated backend entityHighlighter engine
     */
    detectEntities: async (
      _: any,
      { text, config }: { text: string; config?: HighlightConfigInput }
    ): Promise<EntitySpan[]> => {
      // Convert GraphQL input to HighlightConfig
      const highlightConfig: HighlightConfig = {
        maxHighlights: config?.maxHighlights,
        minConfidence: config?.minConfidence,
        enableNaturalDetection: config?.enableNaturalDetection,
        project: config?.project,
        enableAliasPass: config?.enableAliasPass,
        enableLLM: config?.enableLLM,
        llmMode: config?.llmMode,
      };

      // Use the backend entityHighlighter engine
      const spans = await highlightEntities(text, highlightConfig);

      return spans;
    },
  },
};
