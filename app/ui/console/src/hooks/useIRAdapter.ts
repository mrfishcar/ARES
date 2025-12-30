/**
 * useIRAdapter Hook
 * Converts extraction results to ProjectIR format for wiki rendering
 *
 * Task 1.1.1: Create IR Adapter Hook
 * Part of Lab Wiki Integration (TASK_001)
 */

import { useMemo } from 'react';
import { adaptLegacyExtraction } from '../../../../engine/ir/adapter';
import type { ProjectIR } from '../../../../engine/ir/types';

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

/**
 * Hook to convert extraction results to IR format
 *
 * @param extraction - The extraction result from ARES engine
 * @param docId - Document identifier (defaults to 'lab-doc')
 * @returns ProjectIR object or null if extraction is null/invalid
 *
 * @example
 * ```tsx
 * const ExtractionLab = () => {
 *   const [extractionResult, setExtractionResult] = useState(null);
 *   const ir = useIRAdapter(extractionResult, 'my-doc-id');
 *
 *   if (ir) {
 *     // Use ir.entities, ir.events, ir.assertions
 *   }
 * };
 * ```
 */
export function useIRAdapter(
  extraction: ExtractionResult | null,
  docId: string = 'lab-doc'
): ProjectIR | null {
  return useMemo(() => {
    // Return null for invalid/empty extractions
    if (!extraction) {
      return null;
    }

    // Return null if extraction failed
    if (extraction.success === false) {
      return null;
    }

    // Return null if no entities (empty extraction)
    if (!extraction.entities || extraction.entities.length === 0) {
      return null;
    }

    try {
      // Convert extraction result to legacy format expected by adapter
      const legacyFormat = {
        entities: extraction.entities.map(e => ({
          id: e.id,
          canonical: e.canonical || e.text || '',
          type: e.type as any,
          aliases: e.aliases || [],
          confidence: e.confidence,
          attrs: {},
        })),
        relations: extraction.relations || [],
        docId,
      };

      // Adapt to IR using the existing adapter
      return adaptLegacyExtraction(legacyFormat);
    } catch (error) {
      console.error('IR adaptation failed:', error);
      return null;
    }
  }, [extraction, docId]);
}
