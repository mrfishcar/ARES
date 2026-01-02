/**
 * Timeline Renderer - Generates chronological event timelines.
 *
 * This renderer produces human-readable markdown showing events
 * in discourse order (chapter/paragraph/sentence/startOffset).
 *
 * Purpose: Validate the whole compiler on actual chapters and spot
 * dedupe, time ordering, and speaker attribution bugs.
 *
 * CONTRACT:
 * - Renderer must NOT infer new information
 * - Renderer may only aggregate and format existing IR data
 * - Sorting is deterministic by discourse position
 * - Evidence is optional (never required for timeline)
 *
 * @module ir/timeline-renderer
 */

import type {
  ProjectIR,
  EntityId,
  EventType,
  StoryEvent,
  TimeAnchor,
  Modality,
  EvidenceSpan,
} from './types';
import { getEntityName, getEventsForEntity } from './entity-renderer';

// =============================================================================
// TYPES
// =============================================================================

export interface TimelineOptions {
  /** Filter by entity participation */
  entityId?: EntityId;
  /** Filter by event types */
  eventTypes?: EventType[];
  /** Include uncertain events (RUMOR, BELIEF, etc.) Default: true */
  includeUncertain?: boolean;
  /** Include evidence snippets. Default: false */
  includeEvidence?: boolean;
  /** Max evidence snippets per event. Default: 1 */
  maxEvidencePerEvent?: number;
  /** Maximum events to show. Default: 200 */
  limit?: number;
  /** Include debug info. Default: false */
  includeDebug?: boolean;
}

const DEFAULT_OPTIONS: Required<TimelineOptions> = {
  entityId: undefined as unknown as EntityId,
  eventTypes: [],
  includeUncertain: true,
  includeEvidence: false,
  maxEvidencePerEvent: 1,
  limit: 200,
  includeDebug: false,
};

// =============================================================================
// MAIN RENDERER
// =============================================================================

/**
 * Render a chronological timeline of events.
 *
 * Events are sorted by discourse position (chapter/paragraph/sentence/offset)
 * for deterministic, stable output.
 *
 * @param ir - The ProjectIR containing all data
 * @param opts - Rendering options
 * @returns Markdown string
 */
export function renderTimelineFromIR(
  ir: ProjectIR,
  opts?: TimelineOptions
): string {
  const options = { ...DEFAULT_OPTIONS, ...opts };

  // Start with all events
  let events = [...ir.events];

  // Filter by entity participation
  if (options.entityId) {
    events = getEventsForEntity(events, options.entityId);
  }

  // Filter by event types
  if (options.eventTypes && options.eventTypes.length > 0) {
    const typeSet = new Set(options.eventTypes);
    events = events.filter((e) => typeSet.has(e.type as EventType));
  }

  // Filter out uncertain events if requested
  if (!options.includeUncertain) {
    const uncertainModalities: Modality[] = [
      'RUMOR',
      'BELIEF',
      'UNCERTAIN',
      'HYPOTHETICAL',
    ];
    events = events.filter((e) => !uncertainModalities.includes(e.modality));
  }

  // Sort by discourse time (deterministic)
  events = sortEventsByDiscourseTime(events);

  // Apply limit
  const totalEvents = events.length;
  events = events.slice(0, options.limit);

  // Build output
  const lines: string[] = [];

  // Header
  lines.push(renderHeader(options, totalEvents, events.length));
  lines.push('');

  if (events.length === 0) {
    lines.push('*(No events match the filter criteria.)*');
    return lines.join('\n');
  }

  // Render each event
  for (const event of events) {
    lines.push(renderEventLine(event, ir, options));

    // Optional evidence
    if (options.includeEvidence && event.evidence.length > 0) {
      const evidenceLimit = Math.min(
        event.evidence.length,
        options.maxEvidencePerEvent
      );
      for (let i = 0; i < evidenceLimit; i++) {
        lines.push(`  > ${formatEvidenceSnippet(event.evidence[i])}`);
      }
    }
  }

  // Truncation notice
  if (totalEvents > options.limit) {
    lines.push('');
    lines.push(`*(${totalEvents - options.limit} more events not shown)*`);
  }

  // Debug section
  if (options.includeDebug) {
    lines.push('');
    lines.push(renderDebugSection(events, ir));
  }

  return lines.join('\n');
}

// =============================================================================
// RENDERING HELPERS
// =============================================================================

/**
 * Render the timeline header.
 */
function renderHeader(
  options: Required<TimelineOptions>,
  total: number,
  shown: number
): string {
  const parts: string[] = ['# Timeline'];

  // Filters applied
  const filters: string[] = [];
  if (options.entityId) {
    filters.push(`entity=${options.entityId}`);
  }
  if (options.eventTypes.length > 0) {
    filters.push(`types=[${options.eventTypes.join(', ')}]`);
  }
  if (!options.includeUncertain) {
    filters.push('certain-only');
  }

  if (filters.length > 0) {
    parts.push(`\n*Filters: ${filters.join(', ')}*`);
  }

  parts.push(`\n*Showing ${shown} of ${total} events*`);

  return parts.join('');
}

/**
 * Render a single event line.
 *
 * Format: - [Ch3 ¶12] MOVE: Barty → Willow Bend Road (CLAIM; observed: CLAIM/RUMOR)
 */
function renderEventLine(
  event: StoryEvent,
  ir: ProjectIR,
  _options: Required<TimelineOptions>
): string {
  const parts: string[] = [];

  // Position marker: [Ch3 ¶12] or [¶12 s5]
  parts.push(`- ${formatDiscoursePosition(event.time)}`);

  // Event type
  parts.push(` ${event.type}:`);

  // Event summary (participants and action)
  parts.push(` ${formatEventSummary(event, ir)}`);

  // Modality badge with observed modalities
  parts.push(` (${formatModalityBadge(event.modality, event.modalitiesObserved)})`);

  return parts.join('');
}

/**
 * Format discourse position as [Ch3 ¶12] or [¶12 s5].
 */
function formatDiscoursePosition(time: TimeAnchor): string {
  if (time.type === 'DISCOURSE') {
    const parts: string[] = [];
    if (time.chapter !== undefined) parts.push(`Ch${time.chapter}`);
    if (time.paragraph !== undefined) parts.push(`¶${time.paragraph}`);
    if (time.sentence !== undefined) parts.push(`s${time.sentence}`);
    return parts.length > 0 ? `[${parts.join(' ')}]` : '[?]';
  }

  if (time.type === 'ABSOLUTE') {
    return `[${time.date}]`;
  }

  if (time.type === 'RELATIVE') {
    return `[${time.offset} from ${time.anchor}]`;
  }

  return '[?]';
}

/**
 * Format event summary: participants → action.
 *
 * Uses role-aware formatting per event type.
 */
function formatEventSummary(event: StoryEvent, ir: ProjectIR): string {
  switch (event.type) {
    case 'MOVE': {
      const mover = event.participants.find((p) => p.role === 'MOVER');
      const dest = event.participants.find((p) => p.role === 'DESTINATION');
      const origin = event.participants.find((p) => p.role === 'ORIGIN');

      if (mover && dest && origin) {
        return `${getEntityName(ir, mover.entity)}: ${getEntityName(ir, origin.entity)} → ${getEntityName(ir, dest.entity)}`;
      }
      if (mover && dest) {
        return `${getEntityName(ir, mover.entity)} → ${getEntityName(ir, dest.entity)}`;
      }
      if (mover) {
        return `${getEntityName(ir, mover.entity)} moved`;
      }
      break;
    }

    case 'DEATH': {
      const decedent = event.participants.find((p) => p.role === 'DECEDENT');
      const killer = event.participants.find((p) => p.role === 'KILLER');

      if (decedent && killer) {
        return `${getEntityName(ir, killer.entity)} killed ${getEntityName(ir, decedent.entity)}`;
      }
      if (decedent) {
        return `${getEntityName(ir, decedent.entity)} died`;
      }
      break;
    }

    case 'TELL': {
      const speaker = event.participants.find((p) => p.role === 'SPEAKER');
      const addressee = event.participants.find((p) => p.role === 'ADDRESSEE');
      const topic = event.participants.find((p) => p.role === 'TOPIC');

      let summary = speaker ? getEntityName(ir, speaker.entity) : 'Someone';
      if (addressee) {
        summary += ` told ${getEntityName(ir, addressee.entity)}`;
      } else {
        summary += ' said';
      }
      if (topic) {
        summary += ` about ${getEntityName(ir, topic.entity)}`;
      }
      return summary;
    }

    case 'LEARN': {
      const learner = event.participants.find((p) => p.role === 'LEARNER');
      const topic = event.participants.find((p) => p.role === 'TOPIC');

      if (learner && topic) {
        return `${getEntityName(ir, learner.entity)} learned about ${getEntityName(ir, topic.entity)}`;
      }
      if (learner) {
        return `${getEntityName(ir, learner.entity)} learned something`;
      }
      break;
    }

    case 'PROMISE': {
      const promiser = event.participants.find((p) => p.role === 'PROMISER');
      const beneficiary = event.participants.find((p) => p.role === 'BENEFICIARY');

      if (promiser && beneficiary) {
        return `${getEntityName(ir, promiser.entity)} promised ${getEntityName(ir, beneficiary.entity)}`;
      }
      if (promiser) {
        return `${getEntityName(ir, promiser.entity)} made a promise`;
      }
      break;
    }

    case 'ATTACK': {
      const attacker = event.participants.find((p) => p.role === 'ATTACKER');
      const target = event.participants.find((p) => p.role === 'TARGET');

      if (attacker && target) {
        return `${getEntityName(ir, attacker.entity)} attacked ${getEntityName(ir, target.entity)}`;
      }
      if (attacker) {
        return `${getEntityName(ir, attacker.entity)} attacked`;
      }
      break;
    }

    case 'MEET': {
      const a = event.participants.find((p) => p.role === 'PERSON_A');
      const b = event.participants.find((p) => p.role === 'PERSON_B');

      if (a && b) {
        return `${getEntityName(ir, a.entity)} met ${getEntityName(ir, b.entity)}`;
      }
      break;
    }
  }

  // Fallback: list all participants
  const names = event.participants
    .map((p) => getEntityName(ir, p.entity))
    .join(', ');
  return names || '(no participants)';
}

/**
 * Format modality badge with observed modalities.
 *
 * Example: CLAIM; observed: [CLAIM, RUMOR]
 */
function formatModalityBadge(
  modality: Modality,
  observed?: Modality[]
): string {
  let badge = modality;

  if (observed && observed.length > 1) {
    // Sort for determinism
    const sorted = [...observed].sort();
    badge += `; observed: [${sorted.join(', ')}]`;
  }

  return badge;
}

/**
 * Format evidence snippet (max 150 chars for timeline).
 */
function formatEvidenceSnippet(ev: EvidenceSpan): string {
  let text = ev.text || `[${ev.docId}:${ev.charStart}-${ev.charEnd}]`;

  // Truncate to 150 chars for timeline (more compact than entity pages)
  if (text.length > 150) {
    text = text.slice(0, 147) + '...';
  }

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

// =============================================================================
// SORTING
// =============================================================================

/**
 * Sort events by discourse time.
 *
 * Order: chapter → paragraph → sentence → startOffset
 * Unknown times sort last.
 * Ties broken by event ID for determinism.
 */
export function sortEventsByDiscourseTime(events: StoryEvent[]): StoryEvent[] {
  return [...events].sort((a, b) => {
    const timeCompare = compareDiscourseTime(a.time, b.time);
    if (timeCompare !== 0) return timeCompare;

    // Tie-breaker: event ID for determinism
    return a.id.localeCompare(b.id);
  });
}

/**
 * Compare two time anchors for sorting.
 *
 * DISCOURSE times sort by chapter → paragraph → sentence → startOffset.
 * UNKNOWN times sort last.
 */
function compareDiscourseTime(a: TimeAnchor, b: TimeAnchor): number {
  // Unknown times sort last
  if (a.type === 'UNKNOWN' && b.type !== 'UNKNOWN') return 1;
  if (b.type === 'UNKNOWN' && a.type !== 'UNKNOWN') return -1;
  if (a.type === 'UNKNOWN' && b.type === 'UNKNOWN') return 0;

  // Discourse times
  if (a.type === 'DISCOURSE' && b.type === 'DISCOURSE') {
    // Chapter
    const chapterDiff = (a.chapter ?? 0) - (b.chapter ?? 0);
    if (chapterDiff !== 0) return chapterDiff;

    // Paragraph
    const paraDiff = (a.paragraph ?? 0) - (b.paragraph ?? 0);
    if (paraDiff !== 0) return paraDiff;

    // Sentence
    const sentDiff = (a.sentence ?? 0) - (b.sentence ?? 0);
    if (sentDiff !== 0) return sentDiff;

    // StartOffset (if available in raw sort keys)
    const offsetDiff = (a.startOffset ?? 0) - (b.startOffset ?? 0);
    if (offsetDiff !== 0) return offsetDiff;

    return 0;
  }

  // ABSOLUTE vs DISCOURSE: ABSOLUTE first
  if (a.type === 'ABSOLUTE' && b.type === 'DISCOURSE') return -1;
  if (b.type === 'ABSOLUTE' && a.type === 'DISCOURSE') return 1;

  // Both ABSOLUTE: compare dates
  if (a.type === 'ABSOLUTE' && b.type === 'ABSOLUTE') {
    return a.date.localeCompare(b.date);
  }

  return 0;
}

// =============================================================================
// DEBUG SECTION
// =============================================================================

/**
 * Render debug information.
 */
function renderDebugSection(events: StoryEvent[], ir: ProjectIR): string {
  const lines: string[] = [];

  lines.push('## Debug');
  lines.push('');

  // Event type counts
  lines.push('### Event type counts');
  lines.push('');

  const typeCounts = new Map<string, number>();
  for (const event of events) {
    typeCounts.set(event.type, (typeCounts.get(event.type) ?? 0) + 1);
  }

  const sortedTypes = Array.from(typeCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  );
  for (const [type, count] of sortedTypes) {
    lines.push(`- ${type}: ${count}`);
  }

  // Modality distribution
  lines.push('');
  lines.push('### Modality distribution');
  lines.push('');

  const modalityCounts = new Map<string, number>();
  for (const event of events) {
    modalityCounts.set(
      event.modality,
      (modalityCounts.get(event.modality) ?? 0) + 1
    );
  }

  const sortedModalities = Array.from(modalityCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  );
  for (const [modality, count] of sortedModalities) {
    lines.push(`- ${modality}: ${count}`);
  }

  // Events with multiple observed modalities
  const multiModalEvents = events.filter(
    (e) => e.modalitiesObserved && e.modalitiesObserved.length > 1
  );
  if (multiModalEvents.length > 0) {
    lines.push('');
    lines.push('### Events with modality changes');
    lines.push('');
    lines.push(`Count: ${multiModalEvents.length}`);
    lines.push('');

    for (const event of multiModalEvents.slice(0, 5)) {
      const observed = event.modalitiesObserved?.sort().join(' → ') || '';
      lines.push(`- ${event.type}: ${observed} (${event.id})`);
    }
    if (multiModalEvents.length > 5) {
      lines.push(`- ... and ${multiModalEvents.length - 5} more`);
    }
  }

  // Top entities by event count
  lines.push('');
  lines.push('### Top entities by event participation');
  lines.push('');

  const entityCounts = new Map<string, number>();
  for (const event of events) {
    for (const p of event.participants) {
      entityCounts.set(p.entity, (entityCounts.get(p.entity) ?? 0) + 1);
    }
  }

  const topEntities = Array.from(entityCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  for (const [entityId, count] of topEntities) {
    const name = getEntityName(ir, entityId);
    lines.push(`- ${name}: ${count} events`);
  }

  return lines.join('\n');
}

// =============================================================================
// EXPORTS
// =============================================================================

export { getEntityName, getEventsForEntity };
