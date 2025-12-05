/**
 * ARES Pipeline Orchestrator - Modular Composition Layer
 *
 * This orchestrator wires together all 13 pipeline stages into a cohesive
 * extraction pipeline. It provides the same API as the original monolithic
 * orchestrator while leveraging the modular stage architecture.
 *
 * Architecture:
 * - Stateless stages composed in sequence
 * - Typed data flow between stages
 * - Observable logging at stage boundaries
 * - Error propagation with stage context
 *
 * Usage:
 * ```typescript
 * import { extractFromSegments } from './pipeline/orchestrator';
 *
 * const result = await extractFromSegments(
 *   'doc-123',
 *   'Aragorn married Arwen. They ruled Gondor together.',
 *   undefined,
 *   DEFAULT_LLM_CONFIG,
 *   undefined,
 *   { generateHERTs: true }
 * );
 * ```
 */

import type { Entity, Relation } from '../schema';
import type { LLMConfig } from '../llm-config';
import { DEFAULT_LLM_CONFIG } from '../llm-config';
import type { EntityProfile } from '../entity-profiler';
import type { FictionEntity } from '../fiction-extraction';
import type { PatternLibrary } from '../pattern-library';
import { DEFAULT_CONFIG as ENTITY_FILTER_DEFAULTS } from '../entity-quality-filter';
import type {
  EngineConfig,
  PipelineOutput,
  EntityFilterConfig,
  DeduplicationConfig,
  RelationFilterConfig,
  HERTOptions
} from './types';

// Import all 13 stages
import { runDocumentParseStage } from './parse-stage';
import { runEntityExtractionStage } from './entity-extraction-stage';
import { runEntityFilteringStage } from './entity-filtering-stage';
import { runEntityProfilingStage } from './entity-profiling-stage';
import { runCoreferenceStage } from './coreference-stage';
import { runDeicticResolutionStage } from './deictic-resolution-stage';
import { runRelationExtractionStage } from './relation-extraction-stage';
import { runRelationFilteringStage } from './relation-filtering-stage';
import { runInverseGenerationStage } from './inverse-generation-stage';
import { runDeduplicationStage } from './deduplication-stage';
import { runAliasResolutionStage } from './alias-resolution-stage';
import { runKnowledgeGraphStage } from './knowledge-graph-stage';
import { runHERTGenerationStage } from './hert-generation-stage';

const ORCHESTRATOR_NAME = 'PipelineOrchestrator';

/**
 * Build engine configuration from inputs
 */
function buildEngineConfig(
  llmConfig?: LLMConfig,
  options?: {
    generateHERTs?: boolean;
    autoSaveHERTs?: boolean;
  }
): EngineConfig {
  // Entity filter config (Precision Defense Layer 1)
  const entityFilterConfig: EntityFilterConfig = {
    enabled: process.env.ENTITY_FILTER_ENABLED === 'true',
    minConfidence: parseFloat(process.env.ENTITY_MIN_CONFIDENCE || '0.7'),
    minLength: parseInt(process.env.ENTITY_MIN_LENGTH || '1', 10),
    blockedTokens: ENTITY_FILTER_DEFAULTS.blockedTokens,
    requireCapitalization: ENTITY_FILTER_DEFAULTS.requireCapitalization,
    allowInvalidCharacters: ENTITY_FILTER_DEFAULTS.allowInvalidCharacters,
    strictMode: ENTITY_FILTER_DEFAULTS.strictMode
  };

  // Deduplication config (Precision Defense Layer 3)
  const deduplicationConfig: DeduplicationConfig = {
    enabled: process.env.DEDUPLICATION_ENABLED !== 'false', // Enabled by default
    mergeEvidence: true,
    keepHighestConfidence: true
  };

  // Relation filter config (Precision Defense Layer 2)
  const relationFilterConfig: RelationFilterConfig = {
    marriedToSuppressionEnabled: true,
    marriedToProximityWindow: 2, // ±2 sentences
    siblingDetectionEnabled: true,
    appositiveFilteringEnabled: true,
    coordinationDetectionEnabled: true,
    minConfidence: parseFloat(process.env.ARES_MIN_CONFIDENCE || '0.70')
  };

  // HERT options
  const hertOptions: HERTOptions = {
    generateHERTs: options?.generateHERTs || false,
    autoSaveHERTs: options?.autoSaveHERTs || false
  };

  return {
    llmConfig,
    entityFilterConfig,
    deduplicationConfig,
    relationFilterConfig,
    hertOptions
  };
}

/**
 * Extract entities and relations from text using modular pipeline
 *
 * This is the main entry point that composes all 13 stages into a cohesive
 * extraction pipeline. It maintains the same API as the original orchestrator
 * for backward compatibility.
 *
 * @param docId - Document identifier
 * @param fullText - Full text to extract from
 * @param existingProfiles - Existing entity profiles for cross-document learning
 * @param llmConfig - LLM configuration (optional)
 * @param patternLibrary - Pattern library for learned patterns (optional)
 * @param options - Pipeline options (HERT generation, etc.)
 * @returns Extracted entities, relations, and metadata
 */
export async function extractFromSegments(
  docId: string,
  fullText: string,
  existingProfiles?: Map<string, EntityProfile>,
  llmConfig: LLMConfig = DEFAULT_LLM_CONFIG,
  patternLibrary?: PatternLibrary,
  options?: {
    generateHERTs?: boolean;
    autoSaveHERTs?: boolean;
  }
): Promise<{
  entities: Entity[];
  spans: Array<{ entity_id: string; start: number; end: number }>;
  relations: Relation[];
  fictionEntities: FictionEntity[];
  profiles: Map<string, EntityProfile>;
  herts?: string[];
}> {
  const pipelineStartTime = Date.now();
  const wordCount = Math.round(fullText.split(/\s+/).length);

  console.log('='.repeat(80));
  console.log(`[${ORCHESTRATOR_NAME}] Starting extraction pipeline`);
  console.log(`  Document: ${docId}`);
  console.log(`  Text: ${fullText.length} chars, ~${wordCount} words`);
  console.log('='.repeat(80));

  try {
    // Build configuration
    const config = buildEngineConfig(llmConfig, options);

    // ========================================================================
    // STAGE 1: DOCUMENT PARSE
    // ========================================================================

    const parseOutput = await runDocumentParseStage({
      docId,
      fullText,
      config
    });

    // ========================================================================
    // STAGE 2: ENTITY EXTRACTION
    // ========================================================================

    const entityOutput = await runEntityExtractionStage({
      ...parseOutput,
      llmConfig,
      patternLibrary
    });

    // ========================================================================
    // STAGE 3: ENTITY FILTERING
    // ========================================================================

    const filterOutput = await runEntityFilteringStage({
      entities: entityOutput.entities,
      spans: entityOutput.spans,
      entityMap: entityOutput.entityMap,
      config: config.entityFilterConfig
    });

    // ========================================================================
    // STAGE 4: ENTITY PROFILING
    // ========================================================================

    const profilingOutput = await runEntityProfilingStage({
      entities: filterOutput.entities,
      spans: filterOutput.spans,
      sentences: parseOutput.sentences,
      docId,
      existingProfiles
    });

    // ========================================================================
    // STAGE 5: COREFERENCE
    // ========================================================================

    const corefOutput = await runCoreferenceStage({
      sentences: parseOutput.sentences,
      entities: filterOutput.entities,
      spans: filterOutput.spans,
      fullText,
      profiles: profilingOutput.profiles
    });

    // ========================================================================
    // STAGE 6: DEICTIC RESOLUTION
    // ========================================================================

    const deicticOutput = await runDeicticResolutionStage({
      fullText,
      entities: filterOutput.entities,
      spans: filterOutput.spans
    });

    // ========================================================================
    // STAGE 7: RELATION EXTRACTION
    // ========================================================================

    // Combine real spans with virtual coref spans
    const allSpans = [...filterOutput.spans, ...corefOutput.virtualSpans];

    const relationOutput = await runRelationExtractionStage({
      segments: parseOutput.segments,
      entities: filterOutput.entities,
      spans: allSpans,
      processedText: deicticOutput.processedText,
      docId,
      corefLinks: corefOutput.corefLinks,
      entityLookup: filterOutput.entities.map(e => ({
        id: e.id,
        canonical: e.canonical,
        type: e.type,
        aliases: e.aliases
      })),
      entityMap: filterOutput.entityMap
    });

    // ========================================================================
    // STAGE 8: RELATION FILTERING
    // ========================================================================

    const filteredRelations = await runRelationFilteringStage({
      relations: relationOutput.relations,
      entities: filterOutput.entities,
      spans: filterOutput.spans,
      fullText,
      sentences: parseOutput.sentences,
      config: config.relationFilterConfig
    });

    // ========================================================================
    // STAGE 9: INVERSE GENERATION
    // ========================================================================

    const inverseOutput = await runInverseGenerationStage({
      relations: filteredRelations.relations
    });

    // ========================================================================
    // STAGE 10: DEDUPLICATION
    // ========================================================================

    const dedupedOutput = await runDeduplicationStage({
      relations: inverseOutput.relations,
      config: config.deduplicationConfig
    });

    // ========================================================================
    // STAGE 11: ALIAS RESOLUTION
    // ========================================================================

    const aliasOutput = await runAliasResolutionStage({
      entities: filterOutput.entities,
      profiles: profilingOutput.profiles,
      corefLinks: corefOutput.corefLinks
    });

    // ========================================================================
    // STAGE 12: KNOWLEDGE GRAPH
    // ========================================================================

    const kgOutput = await runKnowledgeGraphStage({
      entities: aliasOutput.entities,
      spans: filterOutput.spans,
      relations: dedupedOutput.relations,
      profiles: profilingOutput.profiles,
      fullText
    });

    // ========================================================================
    // STAGE 13: HERT GENERATION (Optional)
    // ========================================================================

    let herts: string[] | undefined;

    if (options?.generateHERTs) {
      const hertOutput = await runHERTGenerationStage({
        entities: kgOutput.entities,
        spans: kgOutput.spans,
        fullText,
        docId,
        options: config.hertOptions
      });
      herts = hertOutput.herts;
    }

    // ========================================================================
    // PIPELINE COMPLETE
    // ========================================================================

    const pipelineDuration = Date.now() - pipelineStartTime;
    const wordsPerSecond = Math.round((wordCount / (pipelineDuration / 1000)) || 0);

    console.log('='.repeat(80));
    console.log(`[${ORCHESTRATOR_NAME}] ✅ Pipeline complete in ${(pipelineDuration / 1000).toFixed(2)}s`);
    console.log(`  Performance: ${wordsPerSecond} words/sec`);
    console.log(`  Entities: ${kgOutput.entities.length}`);
    console.log(`  Relations: ${kgOutput.relations.length}`);
    console.log(`  Fiction entities: ${kgOutput.fictionEntities.length}`);
    console.log(`  Profiles: ${profilingOutput.profiles.size}`);
    if (herts) {
      console.log(`  HERTs: ${herts.length}`);
    }
    console.log('='.repeat(80));

    return {
      entities: kgOutput.entities,
      spans: kgOutput.spans,
      relations: kgOutput.relations,
      fictionEntities: kgOutput.fictionEntities,
      profiles: profilingOutput.profiles,
      herts
    };
  } catch (error) {
    const pipelineDuration = Date.now() - pipelineStartTime;

    console.error('='.repeat(80));
    console.error(`[${ORCHESTRATOR_NAME}] ❌ Pipeline failed after ${(pipelineDuration / 1000).toFixed(2)}s`);
    console.error(`  Error: ${(error as Error).message}`);
    console.error('='.repeat(80));

    throw error;
  }
}
