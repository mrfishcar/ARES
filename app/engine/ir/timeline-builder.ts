/**
 * Timeline Builder - Timeline ordering, interpolation, and filtering.
 *
 * This module provides:
 * - B1: Nested TELL event support (embedded narratives)
 * - B2: Discourse time interpolation
 * - B3: Explicit before/after links derivation
 * - B4: Chapter boundary markers
 * - B5: Timeline filtering API
 *
 * CONTRACT:
 * - Deterministic: Same input always produces same output
 * - No inference beyond explicit rules
 * - Evidence-backed: All derived links include derivation reason
 *
 * @module ir/timeline-builder
 */

import type {
  StoryEvent,
  EventId,
  EntityId,
  EventLink,
  TimeAnchor,
  DiscourseTime,
  EvidenceSpan,
  ProjectIR,
} from './types';

// =============================================================================
// B1: NESTED TELL EVENTS (EMBEDDED NARRATIVES)
// =============================================================================

/**
 * Represents an embedded narrative - events told within a TELL event.
 *
 * When a character tells a story (TELL event), the events they describe
 * are "embedded" - they happened in story-time but are reported at a
 * different discourse-time.
 */
export interface EmbeddedNarrative {
  /** The TELL event that frames this narrative */
  tellEventId: EventId;

  /** The narrator (SPEAKER participant in TELL event) */
  narrator: EntityId;

  /** The addressee (ADDRESSEE participant in TELL event) */
  addressee?: EntityId;

  /** Events contained within this narrative */
  embeddedEventIds: EventId[];

  /** When the telling occurred (discourse time) */
  tellingTime: TimeAnchor;

  /** Whether the embedded events are flashback (past) or foreshadow (future) */
  temporalRelation: 'flashback' | 'foreshadow' | 'contemporaneous' | 'unknown';
}

/**
 * Extract embedded narratives from TELL events.
 *
 * Looks for events that are "contained" within TELL events based on:
 * 1. Events with derivedFrom pointing to assertions from TELL event
 * 2. Events with discourse time within TELL event's evidence span
 *
 * @param events - All events in the IR
 * @returns Array of embedded narrative structures
 */
export function extractEmbeddedNarratives(events: StoryEvent[]): EmbeddedNarrative[] {
  const narratives: EmbeddedNarrative[] = [];
  const tellEvents = events.filter((e) => e.type === 'TELL');

  for (const tell of tellEvents) {
    // Find speaker and addressee
    const speaker = tell.participants.find((p) => p.role === 'SPEAKER');
    const addressee = tell.participants.find((p) => p.role === 'ADDRESSEE');
    const topic = tell.participants.find((p) => p.role === 'TOPIC');

    if (!speaker) continue;

    // Find events that reference this TELL event's assertions in their derivedFrom
    const embeddedEventIds: EventId[] = [];

    for (const event of events) {
      if (event.id === tell.id) continue;

      // Check if this event was derived from the TELL event's produced assertions
      const isDerivedFromTell = tell.produces.some((assertionId) =>
        event.derivedFrom.includes(assertionId)
      );

      // Check if event happens within the TELL's evidence span (discourse embedding)
      const isDiscourseEmbedded = isWithinEvidenceSpan(event, tell.evidence);

      if (isDerivedFromTell || isDiscourseEmbedded) {
        embeddedEventIds.push(event.id);
      }
    }

    // Determine temporal relation based on embedded events' times vs tell time
    let temporalRelation: EmbeddedNarrative['temporalRelation'] = 'unknown';
    if (embeddedEventIds.length > 0) {
      const embeddedEvents = events.filter((e) => embeddedEventIds.includes(e.id));
      temporalRelation = classifyTemporalRelation(embeddedEvents, tell.time);
    }

    if (embeddedEventIds.length > 0 || topic) {
      narratives.push({
        tellEventId: tell.id,
        narrator: speaker.entity,
        addressee: addressee?.entity,
        embeddedEventIds,
        tellingTime: tell.time,
        temporalRelation,
      });
    }
  }

  return narratives;
}

/**
 * Check if an event falls within the evidence span of another.
 */
function isWithinEvidenceSpan(event: StoryEvent, parentEvidence: EvidenceSpan[]): boolean {
  if (!parentEvidence.length || !event.evidence.length) return false;

  const parentSpan = parentEvidence[0];
  const eventSpan = event.evidence[0];

  // Same document and within character range
  return (
    parentSpan.docId === eventSpan.docId &&
    eventSpan.charStart >= parentSpan.charStart &&
    eventSpan.charEnd <= parentSpan.charEnd
  );
}

/**
 * Classify temporal relation of embedded events to the telling.
 */
function classifyTemporalRelation(
  embeddedEvents: StoryEvent[],
  tellingTime: TimeAnchor
): EmbeddedNarrative['temporalRelation'] {
  if (embeddedEvents.length === 0) return 'unknown';

  // Use the first embedded event's time as representative
  const embeddedTime = embeddedEvents[0].time;

  // Compare discourse times
  const cmp = compareDiscourseTime(embeddedTime, tellingTime);

  if (cmp < 0) return 'flashback';
  if (cmp > 0) return 'foreshadow';
  return 'contemporaneous';
}

// =============================================================================
// B2: DISCOURSE TIME INTERPOLATION
// =============================================================================

/**
 * Options for discourse time interpolation.
 */
export interface InterpolationOptions {
  /** Minimum gap in paragraph units to interpolate (default 0 - interpolate all) */
  minGap?: number;
  /** Whether to propagate chapter from nearby events */
  propagateChapter?: boolean;
}

const DEFAULT_INTERPOLATION_OPTIONS: Required<InterpolationOptions> = {
  minGap: 0,
  propagateChapter: true,
};

/**
 * Interpolate discourse times for events with UNKNOWN time.
 *
 * Strategy:
 * 1. Sort events by evidence position (charStart within same doc)
 * 2. For UNKNOWN times, interpolate based on surrounding events
 * 3. Fill in chapter/paragraph from nearest neighbors
 *
 * This is non-destructive - returns new event array with interpolated times.
 *
 * @param events - Events to interpolate
 * @param opts - Interpolation options
 * @returns Events with interpolated discourse times
 */
export function interpolateDiscourseTime(
  events: StoryEvent[],
  opts?: InterpolationOptions
): StoryEvent[] {
  const options = { ...DEFAULT_INTERPOLATION_OPTIONS, ...opts };

  // Group events by document
  const byDoc = groupEventsByDocument(events);
  const result: StoryEvent[] = [];

  for (const [docId, docEvents] of byDoc.entries()) {
    // Sort by evidence charStart
    const sorted = [...docEvents].sort((a, b) => {
      const aStart = a.evidence[0]?.charStart ?? 0;
      const bStart = b.evidence[0]?.charStart ?? 0;
      return aStart - bStart;
    });

    // Interpolate UNKNOWN times
    for (let i = 0; i < sorted.length; i++) {
      const event = sorted[i];

      if (event.time.type === 'UNKNOWN') {
        // Find nearest events with discourse time
        const prevWithTime = findPreviousWithDiscourseTime(sorted, i);
        const nextWithTime = findNextWithDiscourseTime(sorted, i);

        const interpolatedTime = interpolateBetween(
          prevWithTime?.time,
          nextWithTime?.time,
          event.evidence[0],
          options
        );

        // Create new event with interpolated time
        result.push({
          ...event,
          time: interpolatedTime,
        });
      } else {
        result.push(event);
      }
    }
  }

  // Add events without evidence (shouldn't normally happen)
  const eventsWithEvidence = new Set(result.map((e) => e.id));
  for (const event of events) {
    if (!eventsWithEvidence.has(event.id)) {
      result.push(event);
    }
  }

  return result;
}

/**
 * Group events by their first evidence document.
 */
function groupEventsByDocument(events: StoryEvent[]): Map<string, StoryEvent[]> {
  const byDoc = new Map<string, StoryEvent[]>();

  for (const event of events) {
    if (event.evidence.length === 0) continue;
    const docId = event.evidence[0].docId;

    if (!byDoc.has(docId)) {
      byDoc.set(docId, []);
    }
    byDoc.get(docId)!.push(event);
  }

  return byDoc;
}

/**
 * Find previous event with discourse time.
 */
function findPreviousWithDiscourseTime(
  events: StoryEvent[],
  currentIndex: number
): StoryEvent | undefined {
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (events[i].time.type === 'DISCOURSE') {
      return events[i];
    }
  }
  return undefined;
}

/**
 * Find next event with discourse time.
 */
function findNextWithDiscourseTime(
  events: StoryEvent[],
  currentIndex: number
): StoryEvent | undefined {
  for (let i = currentIndex + 1; i < events.length; i++) {
    if (events[i].time.type === 'DISCOURSE') {
      return events[i];
    }
  }
  return undefined;
}

/**
 * Interpolate discourse time between two anchors.
 */
function interpolateBetween(
  prev: TimeAnchor | undefined,
  next: TimeAnchor | undefined,
  evidence: EvidenceSpan | undefined,
  options: Required<InterpolationOptions>
): TimeAnchor {
  // If evidence has paragraph info, use it directly
  if (evidence?.paragraphIndex !== undefined) {
    return {
      type: 'DISCOURSE',
      chapter: evidence.chapterIndex,
      paragraph: evidence.paragraphIndex,
      sentence: evidence.sentenceIndex,
    };
  }

  // Try to interpolate from neighbors
  const prevDisc = prev?.type === 'DISCOURSE' ? prev : undefined;
  const nextDisc = next?.type === 'DISCOURSE' ? next : undefined;

  if (prevDisc && nextDisc) {
    // Average the paragraph positions
    const avgPara = Math.round(
      ((prevDisc.paragraph ?? 0) + (nextDisc.paragraph ?? 0)) / 2
    );
    const chapter = options.propagateChapter
      ? (prevDisc.chapter ?? nextDisc.chapter)
      : undefined;

    return {
      type: 'DISCOURSE',
      chapter,
      paragraph: avgPara,
    };
  }

  if (prevDisc) {
    // Use previous with incremented paragraph
    return {
      type: 'DISCOURSE',
      chapter: options.propagateChapter ? prevDisc.chapter : undefined,
      paragraph: (prevDisc.paragraph ?? 0) + 1,
    };
  }

  if (nextDisc) {
    // Use next with decremented paragraph
    return {
      type: 'DISCOURSE',
      chapter: options.propagateChapter ? nextDisc.chapter : undefined,
      paragraph: Math.max(0, (nextDisc.paragraph ?? 1) - 1),
    };
  }

  // Default to UNKNOWN if no neighbors
  return { type: 'UNKNOWN' };
}

// =============================================================================
// B3: EXPLICIT BEFORE/AFTER LINKS
// =============================================================================

/**
 * Options for deriving temporal links.
 */
export interface TemporalLinkOptions {
  /** Minimum confidence for derived links (default 0.6) */
  minConfidence?: number;
  /** Maximum events to link (for performance, default 1000) */
  maxEvents?: number;
  /** Whether to derive SIMULTANEOUS links (default true) */
  deriveSIMULTANEOUS?: boolean;
}

const DEFAULT_TEMPORAL_LINK_OPTIONS: Required<TemporalLinkOptions> = {
  minConfidence: 0.6,
  maxEvents: 1000,
  deriveSIMULTANEOUS: true,
};

/**
 * Derive BEFORE/AFTER/SIMULTANEOUS links between events.
 *
 * Links are derived from:
 * 1. Discourse time ordering (chapter > paragraph > sentence)
 * 2. Evidence position ordering (charStart within same doc)
 * 3. Explicit temporal expressions in evidence (TODO: future enhancement)
 *
 * @param events - Events to derive links for
 * @param opts - Options for derivation
 * @returns Array of EventLinks
 */
export function deriveTemporalLinks(
  events: StoryEvent[],
  opts?: TemporalLinkOptions
): EventLink[] {
  const options = { ...DEFAULT_TEMPORAL_LINK_OPTIONS, ...opts };
  const links: EventLink[] = [];

  // Limit events for performance
  const limitedEvents = events.slice(0, options.maxEvents);

  // Sort by discourse time
  const sorted = sortByDiscourseTime(limitedEvents);

  // Derive links between consecutive events
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    const cmp = compareDiscourseTime(current.time, next.time);
    const confidence = calculateLinkConfidence(current, next);

    if (confidence < options.minConfidence) continue;

    if (cmp < 0) {
      // current is BEFORE next
      links.push({
        type: 'BEFORE',
        target: next.id,
        confidence,
      });

      // Also add inverse: next is AFTER current
      links.push({
        type: 'AFTER',
        target: current.id,
        confidence,
      });
    } else if (cmp === 0 && options.deriveSIMULTANEOUS) {
      // SIMULTANEOUS - both at same discourse time
      links.push({
        type: 'SIMULTANEOUS',
        target: next.id,
        confidence: confidence * 0.8, // Lower confidence for simultaneous
      });
    }
  }

  return links;
}

/**
 * Add derived temporal links to events.
 *
 * Non-destructive - returns new events with links added.
 *
 * @param events - Events to enhance
 * @param opts - Options
 * @returns Events with temporal links added
 */
export function addTemporalLinksToEvents(
  events: StoryEvent[],
  opts?: TemporalLinkOptions
): StoryEvent[] {
  const options = { ...DEFAULT_TEMPORAL_LINK_OPTIONS, ...opts };

  // Sort by discourse time
  const sorted = sortByDiscourseTime(events);

  // Build link map: eventId -> links to add
  const linkMap = new Map<EventId, EventLink[]>();

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    const cmp = compareDiscourseTime(current.time, next.time);
    const confidence = calculateLinkConfidence(current, next);

    if (confidence < options.minConfidence) continue;

    // Initialize link arrays
    if (!linkMap.has(current.id)) linkMap.set(current.id, []);
    if (!linkMap.has(next.id)) linkMap.set(next.id, []);

    if (cmp < 0) {
      // current BEFORE next
      linkMap.get(current.id)!.push({
        type: 'BEFORE',
        target: next.id,
        confidence,
      });

      linkMap.get(next.id)!.push({
        type: 'AFTER',
        target: current.id,
        confidence,
      });
    } else if (cmp === 0 && options.deriveSIMULTANEOUS) {
      linkMap.get(current.id)!.push({
        type: 'SIMULTANEOUS',
        target: next.id,
        confidence: confidence * 0.8,
      });

      linkMap.get(next.id)!.push({
        type: 'SIMULTANEOUS',
        target: current.id,
        confidence: confidence * 0.8,
      });
    }
  }

  // Return events with links added
  return events.map((event) => {
    const newLinks = linkMap.get(event.id) ?? [];
    if (newLinks.length === 0) return event;

    // Merge with existing links, avoiding duplicates
    const existingTargets = new Set(event.links.map((l) => `${l.type}:${l.target}`));
    const uniqueNewLinks = newLinks.filter(
      (l) => !existingTargets.has(`${l.type}:${l.target}`)
    );

    return {
      ...event,
      links: [...event.links, ...uniqueNewLinks],
    };
  });
}

/**
 * Calculate confidence for a derived temporal link.
 */
function calculateLinkConfidence(a: StoryEvent, b: StoryEvent): number {
  // Base confidence from event confidences
  let confidence = Math.min(a.confidence.composite, b.confidence.composite);

  // Boost if both have strong discourse time
  if (a.time.type === 'DISCOURSE' && b.time.type === 'DISCOURSE') {
    confidence *= 1.1;
  }

  // Reduce if either is UNKNOWN
  if (a.time.type === 'UNKNOWN' || b.time.type === 'UNKNOWN') {
    confidence *= 0.5;
  }

  // Boost if in same document
  if (a.evidence[0]?.docId === b.evidence[0]?.docId) {
    confidence *= 1.05;
  }

  return Math.min(1.0, confidence);
}

// =============================================================================
// B4: CHAPTER BOUNDARY MARKERS
// =============================================================================

/**
 * Represents a chapter boundary in the timeline.
 */
export interface ChapterBoundary {
  /** Chapter number (0-based) */
  chapter: number;

  /** Document ID */
  docId: string;

  /** First event ID in this chapter */
  firstEventId?: EventId;

  /** Last event ID in previous chapter */
  lastEventIdPrevious?: EventId;

  /** Character offset of chapter start (from evidence) */
  charStart?: number;

  /** Number of events in this chapter */
  eventCount: number;
}

/**
 * Detect chapter boundaries from events.
 *
 * Groups events by chapter and identifies boundary points.
 *
 * @param events - Events to analyze
 * @returns Array of chapter boundaries
 */
export function detectChapterBoundaries(events: StoryEvent[]): ChapterBoundary[] {
  const boundaries: ChapterBoundary[] = [];

  // Group events by doc and chapter
  const byDocChapter = new Map<string, Map<number, StoryEvent[]>>();

  for (const event of events) {
    if (event.time.type !== 'DISCOURSE' || event.time.chapter === undefined) {
      continue;
    }

    const docId = event.evidence[0]?.docId ?? 'unknown';
    const chapter = event.time.chapter;

    if (!byDocChapter.has(docId)) {
      byDocChapter.set(docId, new Map());
    }
    const docChapters = byDocChapter.get(docId)!;

    if (!docChapters.has(chapter)) {
      docChapters.set(chapter, []);
    }
    docChapters.get(chapter)!.push(event);
  }

  // Build boundaries
  for (const [docId, chapters] of byDocChapter.entries()) {
    // Sort chapters by number
    const sortedChapters = Array.from(chapters.keys()).sort((a, b) => a - b);

    let prevLastEvent: StoryEvent | undefined;

    for (const chapter of sortedChapters) {
      const chapterEvents = chapters.get(chapter)!;

      // Sort events within chapter by paragraph
      chapterEvents.sort((a, b) =>
        compareDiscourseTime(a.time, b.time)
      );

      const firstEvent = chapterEvents[0];
      const charStart = firstEvent?.evidence[0]?.charStart;

      boundaries.push({
        chapter,
        docId,
        firstEventId: firstEvent?.id,
        lastEventIdPrevious: prevLastEvent?.id,
        charStart,
        eventCount: chapterEvents.length,
      });

      // Update prev for next iteration
      prevLastEvent = chapterEvents[chapterEvents.length - 1];
    }
  }

  // Sort boundaries by doc then chapter
  boundaries.sort((a, b) => {
    const docCmp = a.docId.localeCompare(b.docId);
    if (docCmp !== 0) return docCmp;
    return a.chapter - b.chapter;
  });

  return boundaries;
}

/**
 * Get events for a specific chapter.
 *
 * @param events - All events
 * @param docId - Document ID
 * @param chapter - Chapter number
 * @returns Events in the specified chapter
 */
export function getEventsForChapter(
  events: StoryEvent[],
  docId: string,
  chapter: number
): StoryEvent[] {
  return events.filter((event) => {
    if (event.time.type !== 'DISCOURSE') return false;
    if (event.time.chapter !== chapter) return false;
    if (event.evidence[0]?.docId !== docId) return false;
    return true;
  }).sort((a, b) => compareDiscourseTime(a.time, b.time));
}

// =============================================================================
// B5: TIMELINE FILTERING API
// =============================================================================

/**
 * Filter options for timeline queries.
 */
export interface TimelineFilter {
  /** Filter by entity participation */
  entityId?: EntityId | EntityId[];

  /** Filter by event type */
  eventType?: string | string[];

  /** Filter by time range */
  timeRange?: {
    /** Minimum chapter (inclusive) */
    minChapter?: number;
    /** Maximum chapter (inclusive) */
    maxChapter?: number;
    /** Minimum paragraph (inclusive) */
    minParagraph?: number;
    /** Maximum paragraph (inclusive) */
    maxParagraph?: number;
  };

  /** Filter by document */
  docId?: string | string[];

  /** Filter by modality */
  modality?: string | string[];

  /** Minimum confidence threshold */
  minConfidence?: number;

  /** Maximum events to return */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

/**
 * Timeline query result.
 */
export interface TimelineResult {
  /** Filtered events */
  events: StoryEvent[];

  /** Total count before limit/offset */
  totalCount: number;

  /** Applied filters */
  appliedFilters: TimelineFilter;

  /** Chapter boundaries in result */
  chapterBoundaries: ChapterBoundary[];
}

/**
 * Query events with filtering and sorting.
 *
 * This is the main API for timeline access.
 *
 * @param events - All events
 * @param filter - Filter criteria
 * @returns Filtered and sorted events
 */
export function queryTimeline(
  events: StoryEvent[],
  filter?: TimelineFilter
): TimelineResult {
  let filtered = [...events];
  const appliedFilters = filter ?? {};

  // Apply entity filter
  if (filter?.entityId) {
    const entityIds = Array.isArray(filter.entityId)
      ? filter.entityId
      : [filter.entityId];

    filtered = filtered.filter((event) =>
      event.participants.some((p) => entityIds.includes(p.entity))
    );
  }

  // Apply event type filter
  if (filter?.eventType) {
    const types = Array.isArray(filter.eventType)
      ? filter.eventType
      : [filter.eventType];

    filtered = filtered.filter((event) => types.includes(event.type));
  }

  // Apply document filter
  if (filter?.docId) {
    const docIds = Array.isArray(filter.docId)
      ? filter.docId
      : [filter.docId];

    filtered = filtered.filter((event) =>
      event.evidence.some((ev) => docIds.includes(ev.docId))
    );
  }

  // Apply modality filter
  if (filter?.modality) {
    const modalities = Array.isArray(filter.modality)
      ? filter.modality
      : [filter.modality];

    filtered = filtered.filter((event) =>
      modalities.includes(event.modality)
    );
  }

  // Apply time range filter
  if (filter?.timeRange) {
    const { minChapter, maxChapter, minParagraph, maxParagraph } = filter.timeRange;

    filtered = filtered.filter((event) => {
      if (event.time.type !== 'DISCOURSE') {
        // Include UNKNOWN times if no specific time filter
        return minChapter === undefined && maxChapter === undefined;
      }

      const chapter = event.time.chapter ?? 0;
      const paragraph = event.time.paragraph ?? 0;

      if (minChapter !== undefined && chapter < minChapter) return false;
      if (maxChapter !== undefined && chapter > maxChapter) return false;
      if (minParagraph !== undefined && paragraph < minParagraph) return false;
      if (maxParagraph !== undefined && paragraph > maxParagraph) return false;

      return true;
    });
  }

  // Apply confidence filter
  if (filter?.minConfidence !== undefined) {
    filtered = filtered.filter(
      (event) => event.confidence.composite >= filter.minConfidence!
    );
  }

  // Sort by discourse time
  filtered = sortByDiscourseTime(filtered);

  // Get total count before pagination
  const totalCount = filtered.length;

  // Apply pagination
  if (filter?.offset) {
    filtered = filtered.slice(filter.offset);
  }
  if (filter?.limit) {
    filtered = filtered.slice(0, filter.limit);
  }

  // Detect chapter boundaries in result
  const chapterBoundaries = detectChapterBoundaries(filtered);

  return {
    events: filtered,
    totalCount,
    appliedFilters,
    chapterBoundaries,
  };
}

/**
 * Get events for a specific entity across all chapters.
 *
 * @param events - All events
 * @param entityId - Entity to filter by
 * @returns Sorted events for entity
 */
export function getEntityTimeline(
  events: StoryEvent[],
  entityId: EntityId
): StoryEvent[] {
  const result = queryTimeline(events, { entityId });
  return result.events;
}

/**
 * Get events by type.
 *
 * @param events - All events
 * @param eventType - Event type to filter by
 * @returns Sorted events of type
 */
export function getEventsByType(
  events: StoryEvent[],
  eventType: string | string[]
): StoryEvent[] {
  const result = queryTimeline(events, { eventType });
  return result.events;
}

/**
 * Get events in a time range.
 *
 * @param events - All events
 * @param minChapter - Minimum chapter (inclusive)
 * @param maxChapter - Maximum chapter (inclusive)
 * @returns Events in range
 */
export function getEventsInRange(
  events: StoryEvent[],
  minChapter: number,
  maxChapter: number
): StoryEvent[] {
  const result = queryTimeline(events, {
    timeRange: { minChapter, maxChapter },
  });
  return result.events;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Sort events by discourse time.
 */
export function sortByDiscourseTime(events: StoryEvent[]): StoryEvent[] {
  return [...events].sort((a, b) => compareDiscourseTime(a.time, b.time));
}

/**
 * Compare two time anchors for sorting.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareDiscourseTime(a: TimeAnchor, b: TimeAnchor): number {
  // Unknown times sort last
  if (a.type === 'UNKNOWN' && b.type !== 'UNKNOWN') return 1;
  if (b.type === 'UNKNOWN' && a.type !== 'UNKNOWN') return -1;
  if (a.type === 'UNKNOWN' && b.type === 'UNKNOWN') return 0;

  // Discourse times
  if (a.type === 'DISCOURSE' && b.type === 'DISCOURSE') {
    const chapterDiff = (a.chapter ?? 0) - (b.chapter ?? 0);
    if (chapterDiff !== 0) return chapterDiff;

    const paraDiff = (a.paragraph ?? 0) - (b.paragraph ?? 0);
    if (paraDiff !== 0) return paraDiff;

    return (a.sentence ?? 0) - (b.sentence ?? 0);
  }

  // For other types, treat as equal
  return 0;
}

/**
 * Get unique entity IDs participating in events.
 */
export function getParticipatingEntities(events: StoryEvent[]): EntityId[] {
  const entitySet = new Set<EntityId>();

  for (const event of events) {
    for (const participant of event.participants) {
      entitySet.add(participant.entity);
    }
    if (event.location) {
      entitySet.add(event.location);
    }
  }

  return Array.from(entitySet).sort();
}

/**
 * Get unique event types in events.
 */
export function getEventTypes(events: StoryEvent[]): string[] {
  const typeSet = new Set<string>();

  for (const event of events) {
    typeSet.add(event.type);
  }

  return Array.from(typeSet).sort();
}
