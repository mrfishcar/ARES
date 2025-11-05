/**
 * Temporal Graph Schema - Sprint R8
 * Types and utilities for temporal event tracking
 */

/**
 * Time precision levels
 */
export type TimePrecision =
  | 'year'       // e.g., "1999"
  | 'month'      // e.g., "1999-03"
  | 'day'        // e.g., "1999-03-21"
  | 'hour'       // e.g., "1999-03-21T14:00"
  | 'minute'     // e.g., "1999-03-21T14:30"
  | 'second'     // e.g., "1999-03-21T14:30:45"
  | 'approximate'; // Fuzzy/estimated

/**
 * Temporal event representing a point or span in time
 */
export interface TemporalEvent {
  id: string;
  entityId: string;
  eventType: string;
  isoStart?: string;
  isoEnd?: string;
  precision: TimePrecision;
  confidence: number;
  extractedFrom: string;
}

/**
 * Temporal edge representing chronological relationship
 */
export interface TemporalEdge {
  id: string;
  fromEventId: string;
  toEventId: string;
  relationType: 'precedes' | 'concurrent' | 'contains' | 'overlaps';
  confidence: number;
}

/**
 * Temporal graph containing events and edges
 */
export interface TemporalGraph {
  events: TemporalEvent[];
  edges: TemporalEdge[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    eventCount: number;
    edgeCount: number;
  };
}

/**
 * Time expression extracted from text
 */
export interface TimeExpression {
  text: string;
  normalized: string | null;
  precision: TimePrecision;
  confidence: number;
  position: number;
}
