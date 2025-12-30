/**
 * Story World IR Module
 *
 * This module provides the Intermediate Representation (IR) types and utilities
 * for ARES's story world compilation system.
 *
 * The IR is the core data structure that all compiler passes produce and
 * all renderers consume.
 *
 * Usage:
 * ```typescript
 * import { adaptLegacyExtraction, renderIR } from './ir';
 *
 * const ir = adaptLegacyExtraction({ entities, relations, docId });
 * console.log(renderIR(ir));
 * ```
 *
 * @module ir
 */

// Core types
export * from './types';

// Adapter: existing ARES output → IR
export * from './adapter';

// Renderer: IR → human-readable text (for debugging and display)
export * from './renderer';

// Assertion Builder: three deterministic micro-passes
export * from './assertion-builder';

// Event Builder: derive events from assertions
export * from './event-builder';

// Fact Builder: derive facts from events (materialized views)
export * from './fact-builder';

// Entity Renderer: wiki-style pages for entities
export * from './entity-renderer';

// Timeline Renderer: chronological event timelines
export * from './timeline-renderer';

// Predicate Extractor: verb exhaust capture from dependency trees
export * from './predicate-extractor';

// Quote-TELL Extractor: speech events from quoted dialogue
export * from './quote-tell-extractor';

// Timeline Builder: timeline ordering, interpolation, filtering (Phase B)
export * from './timeline-builder';

// Extraction Diagnostics: validation, calibration, metrics (Phase C)
export * from './extraction-diagnostics';

// Future: IR utilities
// export * from './builders';
// export * from './serialization';
