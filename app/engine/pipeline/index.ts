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
// STAGE EXPORTS
// ============================================================================

// Stage 4: Entity Profiling
export { runEntityProfilingStage } from './entity-profiling-stage';

// Stage 6: Deictic Resolution
export { runDeicticResolutionStage } from './deictic-resolution-stage';

// Stage 9: Inverse Generation
export { runInverseGenerationStage } from './inverse-generation-stage';

// Stage 10: Deduplication
export { runDeduplicationStage } from './deduplication-stage';

// Stage 13: HERT Generation
export { runHERTGenerationStage } from './hert-generation-stage';

// ============================================================================
// STAGES TO BE IMPLEMENTED
// ============================================================================
//
// The following stages are defined in the architecture document but not yet
// implemented as separate modules. They currently exist as inline code in
// the monolithic orchestrator (app/engine/extract/orchestrator.ts).
//
// Implementation priority:
// 1. Stage 1 (Parse) - Foundation for all extraction
// 2. Stage 2 (Entity Extraction) - Core entity extraction
// 3. Stage 3 (Entity Filtering) - Quality control
// 4. Stage 5 (Coreference) - Pronoun resolution
// 5. Stage 7 (Relation Extraction) - Core relation extraction
// 6. Stage 8 (Relation Filtering) - Quality control
// 7. Stage 11 (Alias Resolution) - HERT Phase 1-3
// 8. Stage 12 (Knowledge Graph) - Final assembly
//
// TODO: Extract these stages from orchestrator.ts into separate modules:
// - parse-stage.ts (Stage 1)
// - entity-extraction-stage.ts (Stage 2)
// - entity-filtering-stage.ts (Stage 3)
// - coreference-stage.ts (Stage 5)
// - relation-extraction-stage.ts (Stage 7)
// - relation-filtering-stage.ts (Stage 8)
// - alias-resolution-stage.ts (Stage 11)
// - knowledge-graph-stage.ts (Stage 12)
//
// Each should follow the same pattern:
// 1. Import types from './types'
// 2. Define STAGE_NAME constant
// 3. Implement runXxxStage(input): Promise<output>
// 4. Validate input
// 5. Log start with input size
// 6. Execute stage logic
// 7. Log completion with duration and output size
// 8. Wrap errors with stage name
