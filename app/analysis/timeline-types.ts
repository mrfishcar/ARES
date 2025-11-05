/**
 * Timeline Analysis System
 *
 * Extracts, organizes, and tracks multiple timelines from document data:
 * - Main timelines (primary narrative)
 * - Branch timelines (diverging sequences)
 * - Alternate timelines (parallel universes)
 * - Disconnected timelines (separate story arcs)
 */

import type { EntityType } from '../engine/schema';

/**
 * Temporal precision levels
 */
export type TemporalPrecision =
  | 'year'           // e.g., "3019"
  | 'month'          // e.g., "March 3019"
  | 'day'            // e.g., "March 25, 3019"
  | 'hour'           // e.g., "March 25, 3019 at dawn"
  | 'relative'       // e.g., "three days later"
  | 'unknown';       // No temporal information

/**
 * Temporal anchor - represents a point in time
 */
export interface TemporalAnchor {
  // Raw temporal string from text
  raw: string;

  // Normalized representation (ISO 8601 if possible)
  normalized?: string;

  // Precision level
  precision: TemporalPrecision;

  // Relative to another event
  relativeTo?: {
    eventId: string;
    relation: 'before' | 'after' | 'during' | 'simultaneous';
    offset?: string; // e.g., "3 days", "1 year"
  };

  // Confidence in temporal extraction
  confidence: number;
}

/**
 * Timeline event - a single point or span in a timeline
 */
export interface TimelineEvent {
  // Unique identifier
  id: string;

  // Event entity (if it's a named EVENT entity)
  eventEID?: number;
  eventName?: string;

  // Temporal information
  temporal: TemporalAnchor;

  // Event description/summary
  description: string;

  // Participants (people, organizations)
  participants: Array<{
    eid: number;
    name: string;
    type: EntityType;
    role?: string; // e.g., "leader", "victim", "witness"
  }>;

  // Location
  location?: {
    eid: number;
    name: string;
  };

  // Source references (HERTs)
  sources: Array<{
    document_id: string;
    hert: string; // Compact HERT reference
    paragraph: number;
    confidence: number;
  }>;

  // Relationships to other events
  relations: Array<{
    targetEventId: string;
    type: 'causes' | 'caused_by' | 'follows' | 'precedes' | 'during' | 'simultaneous' | 'branches_from';
    confidence: number;
  }>;

  // Additional metadata
  metadata?: {
    duration?: string;
    outcome?: string;
    significance?: 'major' | 'minor';
  };
}

/**
 * Timeline type classification
 */
export type TimelineType =
  | 'primary'        // Main narrative timeline
  | 'branch'         // Diverges from primary at a specific point
  | 'alternate'      // Parallel universe/scenario (different "what if")
  | 'disconnected'   // Separate storyline with no connections (yet)
  | 'flashback'      // Past events referenced in present
  | 'prophecy';      // Future events predicted/foretold

/**
 * Timeline - a sequence of events
 */
export interface Timeline {
  // Unique identifier
  id: string;

  // Human-readable name
  name: string;

  // Type classification
  type: TimelineType;

  // Events in chronological order
  events: TimelineEvent[];

  // Temporal span
  span?: {
    start: TemporalAnchor;
    end: TemporalAnchor;
  };

  // If this is a branch or alternate timeline
  divergence?: {
    // Where it splits from parent timeline
    parentTimelineId: string;
    divergenceEventId: string;
    divergencePoint: TemporalAnchor;
    reason?: string; // Why it diverged (e.g., "alternate decision", "what if scenario")
  };

  // Primary participants (key characters in this timeline)
  primaryParticipants: Array<{
    eid: number;
    name: string;
    type: EntityType;
  }>;

  // Primary locations (where events take place)
  primaryLocations: Array<{
    eid: number;
    name: string;
  }>;

  // Confidence that these events form a coherent timeline
  coherence: number;

  // Source documents
  sourceDocuments: string[];

  // Metadata
  metadata?: {
    description?: string;
    theme?: string;
    tags?: string[];
  };
}

/**
 * Timeline set - collection of related timelines
 */
export interface TimelineSet {
  // Primary timeline
  primary: Timeline;

  // Branch timelines (diverge from primary)
  branches: Timeline[];

  // Alternate timelines (parallel universes)
  alternates: Timeline[];

  // Disconnected timelines (no connections found yet)
  disconnected: Timeline[];

  // Flashback timelines (past events referenced)
  flashbacks: Timeline[];

  // Prophecy timelines (predicted future events)
  prophecies: Timeline[];

  // Global temporal span (earliest to latest event across all timelines)
  globalSpan?: {
    start: TemporalAnchor;
    end: TemporalAnchor;
  };

  // Cross-timeline connections
  connections: Array<{
    fromTimelineId: string;
    toTimelineId: string;
    fromEventId: string;
    toEventId: string;
    connectionType: 'reference' | 'influence' | 'causation' | 'convergence';
    confidence: number;
  }>;
}

/**
 * Timeline extraction options
 */
export interface TimelineExtractionOptions {
  // Minimum confidence for temporal extraction
  minTemporalConfidence?: number;

  // Minimum number of events to form a timeline
  minEventsPerTimeline?: number;

  // Maximum time gap before splitting into separate timelines
  maxTemporalGap?: string; // e.g., "100 years"

  // Clustering strategy
  clusteringStrategy?: 'temporal' | 'participants' | 'locations' | 'hybrid';

  // Whether to infer implicit temporal relations
  inferTemporalRelations?: boolean;

  // Whether to detect branch points
  detectBranches?: boolean;

  // Whether to merge disconnected timelines if connections found
  autoMergeDisconnected?: boolean;
}

/**
 * Timeline analysis result
 */
export interface TimelineAnalysisResult {
  // Extracted timeline set
  timelineSet: TimelineSet;

  // Statistics
  stats: {
    totalEvents: number;
    totalTimelines: number;
    averageEventsPerTimeline: number;
    temporalCoverage: string; // e.g., "3018-3021"
    mostActiveParticipant: { eid: number; name: string; eventCount: number };
    mostActiveLocation: { eid: number; name: string; eventCount: number };
  };

  // Warnings/issues
  warnings: Array<{
    type: 'temporal_gap' | 'conflicting_dates' | 'orphan_event' | 'low_confidence';
    message: string;
    eventIds: string[];
  }>;

  // Suggestions
  suggestions: Array<{
    type: 'merge_timelines' | 'split_timeline' | 'add_connection' | 'clarify_temporal';
    message: string;
    confidence: number;
  }>;
}

/**
 * Temporal relation types for event ordering
 */
export type TemporalRelationType =
  | 'before'         // Event A happened before Event B
  | 'after'          // Event A happened after Event B
  | 'during'         // Event A occurred during Event B
  | 'simultaneous'   // Events happened at the same time
  | 'overlaps'       // Events partially overlap in time
  | 'contains'       // Event A contains Event B temporally
  | 'unknown';       // Relation cannot be determined

/**
 * Temporal relation between two events
 */
export interface TemporalRelation {
  fromEventId: string;
  toEventId: string;
  relationType: TemporalRelationType;
  confidence: number;
  evidence: string[]; // Source references (HERT compact forms)
}
