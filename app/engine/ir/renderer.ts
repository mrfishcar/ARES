/**
 * IR Debug Renderer
 *
 * A simple renderer for debugging and validating the IR.
 * Renders IR objects to human-readable text/markdown.
 *
 * This is Step 1: "If you can't render it, you can't debug it."
 *
 * Capabilities:
 * - Entity list with aliases
 * - Assertion list with modality/attribution
 * - Event list with participants/time
 * - Evidence span viewer
 * - Filter by chapter/entity
 * - Basic timeline view (discourse order)
 *
 * @module ir/debug-renderer
 */

import type {
  Entity,
  Assertion,
  StoryEvent,
  FactViewRow,
  EvidenceSpan,
  TimeAnchor,
  Modality,
  EntityId,
  DocId,
  ProjectIR,
} from './types';

// =============================================================================
// FORMATTING HELPERS
// =============================================================================

/**
 * Format modality as emoji + text
 */
function formatModality(modality: Modality): string {
  const icons: Record<Modality, string> = {
    'FACT': '✓',
    'BELIEF': '💭',
    'CLAIM': '💬',
    'RUMOR': '🔊',
    'PLAN': '📋',
    'HYPOTHETICAL': '❓',
    'NEGATED': '✗',
    'UNCERTAIN': '⚠️',
  };
  return `${icons[modality] || '?'} ${modality}`;
}

/**
 * Format TimeAnchor for display
 */
function formatTimeAnchor(time: TimeAnchor | undefined): string {
  if (!time) return '(no time)';

  switch (time.type) {
    case 'ABSOLUTE':
      return `${time.date} [${time.precision}]`;
    case 'RELATIVE':
      return `${time.offset} from ${time.anchor}`;
    case 'BOUNDED':
      const parts = [];
      if (time.after) parts.push(`after ${formatTimeAnchor(time.after as TimeAnchor)}`);
      if (time.before) parts.push(`before ${formatTimeAnchor(time.before as TimeAnchor)}`);
      return parts.join(', ') || '(unbounded)';
    case 'UNCERTAIN':
      return `between ${formatTimeAnchor(time.earliest)} and ${formatTimeAnchor(time.latest)}`;
    case 'DISCOURSE':
      const loc = [];
      if (time.chapter !== undefined) loc.push(`ch${time.chapter}`);
      if (time.paragraph !== undefined) loc.push(`¶${time.paragraph}`);
      if (time.sentence !== undefined) loc.push(`s${time.sentence}`);
      return loc.join('.') || '(discourse)';
    case 'UNKNOWN':
      return '(unknown)';
    default:
      return '(?)';
  }
}

/**
 * Format confidence as percentage
 */
function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Truncate text for display
 */
function truncate(text: string, maxLen: number = 60): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

// =============================================================================
// ENTITY RENDERER
// =============================================================================

export interface EntityRenderOptions {
  showAliases?: boolean;
  showConfidence?: boolean;
  showEvidence?: boolean;
  maxAliases?: number;
}

/**
 * Render a single entity
 */
export function renderEntity(
  entity: Entity,
  options: EntityRenderOptions = {}
): string {
  const {
    showAliases = true,
    showConfidence = true,
    showEvidence = false,
    maxAliases = 5,
  } = options;

  const lines: string[] = [];

  // Header
  lines.push(`## ${entity.canonical} [${entity.type}]`);
  lines.push(`ID: ${entity.id}`);

  // Aliases
  if (showAliases && entity.aliases.length > 0) {
    const aliases = entity.aliases.slice(0, maxAliases);
    const more = entity.aliases.length > maxAliases
      ? ` (+${entity.aliases.length - maxAliases} more)`
      : '';
    lines.push(`Aliases: ${aliases.join(', ')}${more}`);
  }

  // Confidence
  if (showConfidence && entity.confidence) {
    lines.push(`Confidence: ${formatConfidence(entity.confidence.composite)}`);
  }

  // Evidence
  if (showEvidence && entity.evidence.length > 0) {
    lines.push('Evidence:');
    for (const ev of entity.evidence.slice(0, 3)) {
      lines.push(`  - "${truncate(ev.text)}" (${ev.docId}:${ev.charStart})`);
    }
  }

  return lines.join('\n');
}

/**
 * Render entity list as markdown table
 */
export function renderEntityTable(
  entities: Entity[],
  options: EntityRenderOptions = {}
): string {
  const lines: string[] = [];

  lines.push('| Entity | Type | Aliases | Confidence |');
  lines.push('|--------|------|---------|------------|');

  for (const entity of entities) {
    const aliases = entity.aliases.slice(0, 3).join(', ');
    const more = entity.aliases.length > 3 ? '...' : '';
    const conf = entity.confidence ? formatConfidence(entity.confidence.composite) : '-';
    lines.push(`| ${entity.canonical} | ${entity.type} | ${aliases}${more} | ${conf} |`);
  }

  return lines.join('\n');
}

// =============================================================================
// ASSERTION RENDERER
// =============================================================================

export interface AssertionRenderOptions {
  entityMap?: Map<string, Entity>;
  showEvidence?: boolean;
  showConfidence?: boolean;
}

/**
 * Render a single assertion
 */
export function renderAssertion(
  assertion: Assertion,
  options: AssertionRenderOptions = {}
): string {
  const { entityMap, showEvidence = true, showConfidence = true } = options;

  const lines: string[] = [];

  // Resolve entity names
  const subjectName = entityMap?.get(assertion.subject || '')?.canonical || assertion.subject || '?';
  const objectName = typeof assertion.object === 'string'
    ? (entityMap?.get(assertion.object)?.canonical || assertion.object)
    : String(assertion.object);

  // Main assertion
  if (assertion.assertionType === 'DIRECT') {
    lines.push(`${formatModality(assertion.modality)} ${subjectName} --[${assertion.predicate}]--> ${objectName}`);
  } else if (assertion.assertionType === 'BELIEF') {
    const holderName = entityMap?.get(assertion.holder || '')?.canonical || assertion.holder || '?';
    lines.push(`${formatModality(assertion.modality)} ${holderName} believes: ${subjectName} --[${assertion.predicate}]--> ${objectName}`);
  } else {
    lines.push(`${formatModality(assertion.modality)} [${assertion.assertionType}]`);
  }

  // Attribution
  if (assertion.attribution.source !== 'NARRATOR') {
    const speaker = entityMap?.get(assertion.attribution.character || '')?.canonical || assertion.attribution.character;
    lines.push(`  Attribution: ${assertion.attribution.source}${speaker ? ` (${speaker})` : ''}`);
  }

  // Confidence
  if (showConfidence && assertion.confidence) {
    lines.push(`  Confidence: ${formatConfidence(assertion.confidence.composite)}`);
  }

  // Evidence
  if (showEvidence && assertion.evidence.length > 0) {
    lines.push(`  Evidence: "${truncate(assertion.evidence[0].text)}"`);
  }

  return lines.join('\n');
}

/**
 * Render assertion list
 */
export function renderAssertionList(
  assertions: Assertion[],
  options: AssertionRenderOptions = {}
): string {
  const lines: string[] = [];
  lines.push('# Assertions\n');

  // Group by modality
  const byModality = new Map<Modality, Assertion[]>();
  for (const a of assertions) {
    const list = byModality.get(a.modality) || [];
    list.push(a);
    byModality.set(a.modality, list);
  }

  for (const [modality, list] of Array.from(byModality.entries())) {
    lines.push(`## ${modality} (${list.length})\n`);
    for (const a of list) {
      lines.push(renderAssertion(a, options));
      lines.push('');
    }
  }

  return lines.join('\n');
}

// =============================================================================
// EVENT RENDERER
// =============================================================================

export interface EventRenderOptions {
  entityMap?: Map<string, Entity>;
  showEvidence?: boolean;
  showParticipants?: boolean;
}

/**
 * Render a single event
 */
export function renderEvent(
  event: StoryEvent,
  options: EventRenderOptions = {}
): string {
  const { entityMap, showEvidence = true, showParticipants = true } = options;

  const lines: string[] = [];

  // Header
  lines.push(`## [${event.type}] ${event.summary || event.id}`);
  lines.push(`Time: ${formatTimeAnchor(event.time)}`);
  lines.push(`Modality: ${formatModality(event.modality)}`);

  // Location
  if (event.location) {
    const locName = entityMap?.get(event.location)?.canonical || event.location;
    lines.push(`Location: ${locName}`);
  }

  // Participants
  if (showParticipants && event.participants.length > 0) {
    lines.push('Participants:');
    for (const p of event.participants) {
      const name = entityMap?.get(p.entity)?.canonical || p.entity;
      lines.push(`  - ${p.role}: ${name}`);
    }
  }

  // Evidence
  if (showEvidence && event.evidence.length > 0) {
    lines.push(`Evidence: "${truncate(event.evidence[0].text)}"`);
  }

  // Confidence
  if (event.confidence) {
    lines.push(`Confidence: ${formatConfidence(event.confidence.composite)}`);
  }

  return lines.join('\n');
}

// =============================================================================
// TIMELINE RENDERER
// =============================================================================

export interface TimelineRenderOptions {
  entityMap?: Map<string, Entity>;
  entityFilter?: EntityId[];
  includeUncertain?: boolean;
}

/**
 * Render events as a simple timeline (discourse order)
 */
export function renderTimeline(
  events: StoryEvent[],
  options: TimelineRenderOptions = {}
): string {
  const { entityMap, entityFilter, includeUncertain = true } = options;

  const lines: string[] = [];
  lines.push('# Timeline\n');

  // Filter events
  let filtered = events;
  if (entityFilter && entityFilter.length > 0) {
    filtered = events.filter(e =>
      e.participants.some(p => entityFilter.includes(p.entity))
    );
  }

  // Sort by discourse position (chapter, paragraph, sentence)
  const sorted = [...filtered].sort((a, b) => {
    const aTime = a.time;
    const bTime = b.time;

    // Discourse time comparison
    if (aTime?.type === 'DISCOURSE' && bTime?.type === 'DISCOURSE') {
      if ((aTime.chapter ?? 0) !== (bTime.chapter ?? 0)) {
        return (aTime.chapter ?? 0) - (bTime.chapter ?? 0);
      }
      if ((aTime.paragraph ?? 0) !== (bTime.paragraph ?? 0)) {
        return (aTime.paragraph ?? 0) - (bTime.paragraph ?? 0);
      }
      return (aTime.sentence ?? 0) - (bTime.sentence ?? 0);
    }

    // Absolute time comparison
    if (aTime?.type === 'ABSOLUTE' && bTime?.type === 'ABSOLUTE') {
      return aTime.date.localeCompare(bTime.date);
    }

    return 0;
  });

  // Render
  for (const event of sorted) {
    const time = formatTimeAnchor(event.time);
    const participants = event.participants
      .map(p => entityMap?.get(p.entity)?.canonical || p.entity)
      .join(', ');

    lines.push(`- ${time}: [${event.type}] ${event.summary || participants}`);
  }

  if (sorted.length === 0) {
    lines.push('(no events)');
  }

  return lines.join('\n');
}

// =============================================================================
// EVIDENCE RENDERER
// =============================================================================

/**
 * Render evidence spans with context
 */
export function renderEvidenceList(
  spans: EvidenceSpan[],
  options: { groupByDoc?: boolean } = {}
): string {
  const { groupByDoc = true } = options;

  const lines: string[] = [];
  lines.push('# Evidence Spans\n');

  if (groupByDoc) {
    // Group by document
    const byDoc = new Map<string, EvidenceSpan[]>();
    for (const span of spans) {
      const list = byDoc.get(span.docId) || [];
      list.push(span);
      byDoc.set(span.docId, list);
    }

    for (const [docId, docSpans] of Array.from(byDoc.entries())) {
      lines.push(`## ${docId}\n`);
      for (const span of docSpans) {
        const loc = span.sentenceIndex !== undefined
          ? `s${span.sentenceIndex}`
          : `${span.charStart}-${span.charEnd}`;
        lines.push(`- [${loc}] "${truncate(span.text, 80)}"`);
      }
      lines.push('');
    }
  } else {
    for (const span of spans) {
      lines.push(`- [${span.docId}:${span.charStart}] "${truncate(span.text, 80)}"`);
    }
  }

  return lines.join('\n');
}

// =============================================================================
// FULL IR RENDERER
// =============================================================================

export interface IRRenderOptions {
  showEntities?: boolean;
  showAssertions?: boolean;
  showEvents?: boolean;
  showEvidence?: boolean;
  showTimeline?: boolean;
  entityFilter?: EntityId[];
  format?: 'markdown' | 'text';
}

/**
 * Render complete IR for debugging.
 * Works with empty events - the microscope must work before events exist.
 */
export function renderIR(
  ir: ProjectIR,
  options: IRRenderOptions = {}
): string {
  const {
    showEntities = true,
    showAssertions = true,
    showEvents = true,
    showEvidence = false,
    showTimeline = true,
    entityFilter,
  } = options;

  const lines: string[] = [];

  // Header
  lines.push(`# IR Debug View`);
  lines.push(`Document: ${ir.docId || ir.projectId}`);
  lines.push(`Created: ${ir.createdAt}`);
  lines.push(`Stats: ${ir.stats.entityCount} entities, ${ir.stats.assertionCount} assertions, ${ir.stats.eventCount} events`);
  lines.push('');

  // Build entity map for lookups
  const entityMap = new Map<string, Entity>();
  for (const entity of ir.entities) {
    entityMap.set(entity.id, entity);
  }

  // Filter entities if requested
  let entities = ir.entities;
  let assertions = ir.assertions;
  let events = ir.events;

  if (entityFilter && entityFilter.length > 0) {
    const filterSet = new Set(entityFilter);
    entities = ir.entities.filter(e => filterSet.has(e.id));
    assertions = ir.assertions.filter(a =>
      (a.subject && filterSet.has(a.subject)) ||
      (typeof a.object === 'string' && filterSet.has(a.object))
    );
    events = ir.events.filter(e =>
      e.participants.some(p => filterSet.has(p.entity))
    );
  }

  // Entities
  if (showEntities) {
    lines.push('---');
    lines.push('# Entities\n');
    lines.push(renderEntityTable(entities));
    lines.push('');
  }

  // Assertions
  if (showAssertions) {
    lines.push('---');
    lines.push(renderAssertionList(assertions, { entityMap }));
    lines.push('');
  }

  // Events
  if (showEvents && events.length > 0) {
    lines.push('---');
    lines.push('# Events\n');
    for (const event of events) {
      lines.push(renderEvent(event, { entityMap }));
      lines.push('');
    }
  }

  // Timeline
  if (showTimeline && events.length > 0) {
    lines.push('---');
    lines.push(renderTimeline(events, { entityMap, entityFilter }));
    lines.push('');
  }

  // Evidence
  if (showEvidence) {
    const allEvidence: EvidenceSpan[] = [
      ...entities.flatMap(e => e.evidence),
      ...assertions.flatMap(a => a.evidence),
      ...events.flatMap(e => e.evidence),
    ];
    lines.push('---');
    lines.push(renderEvidenceList(allEvidence));
  }

  return lines.join('\n');
}

// =============================================================================
// SUMMARY RENDERER
// =============================================================================

/**
 * Render a quick summary of IR contents
 */
export function renderIRSummary(ir: ProjectIR): string {
  const lines: string[] = [];

  lines.push(`IR Summary: ${ir.docId || ir.projectId}`);
  lines.push(`─────────────────────────────`);
  lines.push(`Entities:   ${ir.stats.entityCount}`);
  lines.push(`Assertions: ${ir.stats.assertionCount}`);
  lines.push(`Events:     ${ir.stats.eventCount}`);
  lines.push('');

  // Entity type breakdown
  const byType = new Map<string, number>();
  for (const e of ir.entities) {
    byType.set(e.type, (byType.get(e.type) || 0) + 1);
  }
  lines.push('Entity Types:');
  for (const [type, count] of Array.from(byType.entries())) {
    lines.push(`  ${type}: ${count}`);
  }

  // Modality breakdown
  const byModality = new Map<string, number>();
  for (const a of ir.assertions) {
    byModality.set(a.modality, (byModality.get(a.modality) || 0) + 1);
  }
  if (byModality.size > 0) {
    lines.push('');
    lines.push('Assertion Modalities:');
    for (const [modality, count] of Array.from(byModality.entries())) {
      lines.push(`  ${modality}: ${count}`);
    }
  }

  return lines.join('\n');
}
