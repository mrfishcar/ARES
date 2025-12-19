/**
 * BookNLP Integration Module
 *
 * Provides BookNLP as a baseline entity extraction engine for ARES.
 * BookNLP handles: character clustering, coreference, quote attribution.
 * ARES layers on top: entity type refinement, relations, graph projection.
 */

export * from './types';
export * from './adapter';
export * from './runner';
export * from './graph-projection';
