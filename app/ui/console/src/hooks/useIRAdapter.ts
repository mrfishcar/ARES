/**
 * useIRAdapter Hook
 * Converts extraction results to ProjectIR format for wiki rendering
 *
 * Task 1.1.1: Create IR Adapter Hook
 * Part of Lab Wiki Integration (TASK_001)
 *
 * NOTE: @engine imports have been removed due to bundling issues.
 * The IR adapter requires Node.js crypto which doesn't bundle properly.
 * This is a stub that returns null until the bundling issue is resolved.
 */

import { useMemo } from 'react';

/**
 * Extraction result from the ARES engine
 * Matches the ExtractionResponse interface from ExtractionLab
 */
export interface ExtractionResult {
  success?: boolean;
  entities: Array<{
    id: string;
    text?: string;
    canonical?: string;
    type: string;
    confidence?: number;
    spans?: Array<{
      start: number;
      end: number;
      text?: string;
      source?: string;
      mentionId?: string;
      mentionType?: string;
    }>;
    aliases?: string[];
    source?: string;
  }>;
  spans?: Array<{
    entityId: string;
    start: number;
    end: number;
    text?: string;
    source?: string;
    mentionId?: string;
    mentionType?: string;
  }>;
  relations: Array<{
    id: string;
    subj: string;
    obj: string;
    pred: string;
    confidence: number;
    subjCanonical: string;
    objCanonical: string;
  }>;
  stats?: {
    time: number;
    confidence: number;
    count: number;
    relationCount: number;
  };
  error?: string;
}

// Stub ProjectIR type (matches @engine/ir/types)
export interface ProjectIR {
  version: string;
  projectId: string;
  docId: string;
  createdAt: string;
  entities: Array<{
    id: string;
    type: string;
    canonical: string;
    aliases: string[];
    evidence?: Array<{ docId: string; charStart: number; charEnd: number; text?: string }>;
  }>;
  assertions: Array<{
    id: string;
    subject: string;
    predicate: string;
    object: string;
  }>;
  events: Array<{
    id: string;
    type: string;
    participants: Array<{ role: string; entity: string }>;
    time: { type: string; paragraph?: number };
  }>;
  stats: {
    entityCount: number;
    assertionCount: number;
    eventCount: number;
  };
}

/**
 * Hook to convert extraction results to IR format
 *
 * NOTE: Currently returns null due to @engine bundling issues.
 * The IR adapter requires Node.js crypto which doesn't work in browser bundles.
 *
 * @param extraction - The extraction result from ARES engine
 * @param docId - Document identifier (defaults to 'lab-doc')
 * @returns ProjectIR object or null if extraction is null/invalid
 */
export function useIRAdapter(
  extraction: ExtractionResult | null,
  _docId: string = 'lab-doc'
): ProjectIR | null {
  return useMemo(() => {
    // TODO: Re-enable when @engine bundling is fixed
    // The adaptLegacyExtraction function requires Node.js crypto
    // which causes "k.replace is not a function" error in browser

    if (!extraction || !extraction.entities?.length) {
      return null;
    }

    // Return a minimal IR structure from raw extraction
    // This is a workaround until proper IR adaptation works
    const now = new Date().toISOString();
    return {
      version: '1.0',
      projectId: _docId,
      docId: _docId,
      createdAt: now,
      entities: extraction.entities.map(e => ({
        id: e.id,
        type: e.type,
        canonical: e.canonical || e.text || '',
        aliases: e.aliases || [],
        evidence: [],
      })),
      assertions: (extraction.relations || []).map(r => ({
        id: r.id,
        subject: r.subj,
        predicate: r.pred,
        object: r.obj,
      })),
      events: [],
      stats: {
        entityCount: extraction.entities.length,
        assertionCount: extraction.relations?.length || 0,
        eventCount: 0,
      },
    };
  }, [extraction, _docId]);
}
