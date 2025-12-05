/**
 * ARES Pipeline Stages - Modular Extraction Pipeline
 *
 * This module exports the modular, composable extraction pipeline stages.
 * Each stage is a self-contained function with explicit inputs and outputs.
 *
 * Architecture:
 * - Each stage is stateless (no hidden globals)
 * - Each stage has typed inputs/outputs
 * - Stages log at entry/exit with timing
 * - Errors include stage name for debugging
 *
 * Usage:
 * ```typescript
 * import { runDeicticResolutionStage } from './pipeline';
 *
 * const output = await runDeicticResolutionStage({
 *   fullText: "...",
 *   entities: [...],
 *   spans: [...]
 * });
 * ```
 */

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export * from './types';

// ============================================================================
// STAGE EXPORTS - ALL 13 STAGES IMPLEMENTED ✅
// ============================================================================

// Stage 1: Document Parse ✅
export { runDocumentParseStage } from './parse-stage';

// Stage 2: Entity Extraction ✅
export { runEntityExtractionStage } from './entity-extraction-stage';

// Stage 3: Entity Filtering ✅
export { runEntityFilteringStage } from './entity-filtering-stage';

// Stage 4: Entity Profiling ✅
export { runEntityProfilingStage } from './entity-profiling-stage';

// Stage 5: Coreference ✅
export { runCoreferenceStage } from './coreference-stage';

// Stage 6: Deictic Resolution ✅
export { runDeicticResolutionStage } from './deictic-resolution-stage';

// Stage 7: Relation Extraction ✅
export { runRelationExtractionStage } from './relation-extraction-stage';

// Stage 8: Relation Filtering ✅
export { runRelationFilteringStage } from './relation-filtering-stage';

// Stage 9: Inverse Generation ✅
export { runInverseGenerationStage } from './inverse-generation-stage';

// Stage 10: Deduplication ✅
export { runDeduplicationStage } from './deduplication-stage';

// Stage 11: Alias Resolution ✅
export { runAliasResolutionStage } from './alias-resolution-stage';

// Stage 12: Knowledge Graph ✅
export { runKnowledgeGraphStage } from './knowledge-graph-stage';

// Stage 13: HERT Generation ✅
export { runHERTGenerationStage } from './hert-generation-stage';

// ============================================================================
// ORCHESTRATOR - PIPELINE COMPOSITION ✅
// ============================================================================

// Main orchestrator - wires all 13 stages together
export { extractFromSegments } from './orchestrator';
