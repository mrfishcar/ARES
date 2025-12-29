/**
 * Entity Page Renderer - Generates wiki-style pages for entities.
 *
 * This renderer produces human-readable markdown for a single entity,
 * showing its facts, events, assertions, and evidence.
 *
 * CONTRACT:
 * - Renderer must NOT infer new information
 * - Renderer may only aggregate and format existing IR data
 * - Sorting must be deterministic (no JS object iteration order)
 * - Evidence snippets are display-only, not semantic
 *
 * @module ir/entity-renderer
 */

import type {
  ProjectIR,
  Entity,
  EntityId,
  StoryEvent,
  Assertion,
  EvidenceSpan,
  FactViewRow,
  TimeAnchor,
  DiscourseTime,
  Modality,
} from './types';
import { buildFactsFromEvents, getCurrentLocation, isAlive } from './fact-builder';

// =============================================================================
// TYPES
// =============================================================================

export interface EntityPageOptions {
  /** Maximum events to show (default 25) */
  maxEvents?: number;
  /** Maximum assertions to show (default 25) */
  maxAssertions?: number;
  /** Maximum evidence snippets per item (default 2) */
  maxEvidencePerItem?: number;
  /** Include debug section (default false) */
  includeDebug?: boolean;
}

const DEFAULT_OPTIONS: Required<EntityPageOptions> = {
  maxEvents: 25,
  maxAssertions: 25,
  maxEvidencePerItem: 2,
  includeDebug: false,
};

// =============================================================================
// STATE PREDICATE CONSTANTS
// =============================================================================

/** State/property predicates from state-assertion-extractor */
const STATE_PREDICATES = new Set([
  'state_of',     // X was ADJ (emotional/physical state)
  'is_a',         // X was a NOUN (identity/role)
  'has',          // X had NOUN (possession)
  'can',          // X could VERB (capability)
  'trait',        // X was always ADJ (permanent trait)
  'location_at',  // X was in PLACE (static location)
]);

/** Human-readable labels for state predicates */
const STATE_PREDICATE_LABELS: Record<string, string> = {
  'state_of': 'States',
  'is_a': 'Identity & Roles',
  'has': 'Possessions',
  'can': 'Capabilities',
  'trait': 'Traits',
  'location_at': 'Locations',
};

/** Display order for state predicates */
const STATE_PREDICATE_ORDER = ['trait', 'is_a', 'state_of', 'has', 'can', 'location_at'];

// =============================================================================
// MAIN RENDERER
// =============================================================================

/**
 * Render a wiki-style page for an entity.
 *
 * @param ir - The ProjectIR containing all data
 * @param entityId - The entity to render
 * @param opts - Rendering options
 * @returns Markdown string
 */
export function renderEntityPage(
  ir: ProjectIR,
  entityId: EntityId,
  opts?: EntityPageOptions
): string {
  const options = { ...DEFAULT_OPTIONS, ...opts };

  // Find the entity
  const entity = ir.entities.find((e) => e.id === entityId);
  if (!entity) {
    return `# Entity Not Found\n\nNo entity with ID \`${entityId}\` exists in this IR.`;
  }

  // Compute facts from events (materialized view)
  const facts = buildFactsFromEvents(ir.events);

  // Get related data
  const entityEvents = getEventsForEntity(ir.events, entityId);
  const entityAssertions = getAssertionsForEntity(ir.assertions, entityId);
  const entityFacts = getFactsForEntity(facts, entityId);

  // Build sections
  const sections: string[] = [];

  sections.push(renderTitleBlock(entity));
  sections.push(renderQuickFacts(entity, entityFacts, entityId, ir));
  sections.push(renderStateProperties(entityAssertions, entityId, ir, options));
  sections.push(renderCurrentStatus(entityFacts, entityId, ir));
  sections.push(renderTimelineHighlights(entityEvents, ir, options));
  sections.push(renderKeyClaims(entityAssertions, ir, options));
  sections.push(renderEvidenceSection(entityEvents, entityAssertions, options));

  if (options.includeDebug) {
    sections.push(renderDebugSection(entity, entityFacts, entityEvents, entityAssertions));
  }

  return sections.filter((s) => s.length > 0).join('\n\n');
}

// =============================================================================
// SECTION RENDERERS
// =============================================================================

/**
 * 3.1 Title Block
 */
function renderTitleBlock(entity: Entity): string {
  const lines: string[] = [];

  // Title
  const displayName = entity.canonical || entity.id;
  lines.push(`# ${displayName}`);
  lines.push('');

  // Type
  lines.push(`**Type:** ${entity.type}`);

  // Aliases (if any beyond canonical)
  const aliases = entity.aliases.filter((a) => a !== entity.canonical);
  if (aliases.length > 0) {
    lines.push(`**Aliases:** ${aliases.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * 3.2 Quick Facts
 */
function renderQuickFacts(
  entity: Entity,
  facts: FactViewRow[],
  entityId: EntityId,
  ir: ProjectIR
): string {
  const lines: string[] = [];
  lines.push('## Quick facts');
  lines.push('');

  if (facts.length === 0) {
    lines.push('*(No derived facts yet.)*');
    return lines.join('\n');
  }

  // Alive status
  const alive = isAlive(facts, entityId);
  if (alive) {
    lines.push('- **Status:** ✅ Alive');
  } else {
    lines.push('- **Status:** ☠️ Dead');
    // Find death evidence
    const deathFact = facts.find(
      (f) => f.subject === entityId && f.predicate === 'alive' && f.object === false
    );
    if (deathFact && deathFact.derivedFrom.length > 0) {
      const deathEvent = ir.events.find((e) => e.id === deathFact.derivedFrom[0]);
      if (deathEvent && deathEvent.evidence.length > 0) {
        lines.push(`  - *${formatEvidence(deathEvent.evidence[0])}*`);
      }
    }
  }

  // Current location
  const currentLoc = getCurrentLocation(facts, entityId);
  if (currentLoc) {
    const placeName = getEntityName(ir, currentLoc);
    lines.push(`- **Current location:** ${placeName}`);
  }

  // Known locations (distinct, chronological)
  const locationFacts = facts
    .filter(
      (f) =>
        f.subject === entityId &&
        f.predicate === 'located_in' &&
        typeof f.object === 'string'
    )
    .sort((a, b) => compareDiscourseTime(a.validFrom, b.validFrom));

  const distinctLocations = new Set<string>();
  const locationHistory: { place: string; time: TimeAnchor }[] = [];

  for (const f of locationFacts) {
    const placeId = f.object as string;
    if (!distinctLocations.has(placeId)) {
      distinctLocations.add(placeId);
      locationHistory.push({ place: placeId, time: f.validFrom });
    }
  }

  if (locationHistory.length > 1) {
    lines.push('- **Known locations:**');
    for (const loc of locationHistory) {
      const placeName = getEntityName(ir, loc.place);
      const timeStr = formatTimeAnchor(loc.time);
      lines.push(`  - ${placeName} (${timeStr})`);
    }
  }

  return lines.join('\n');
}

/**
 * 3.2b States & Properties (from state-assertion-extractor)
 *
 * Shows state_of, is_a, has, can, trait, location_at assertions.
 * Groups by predicate type with most recent as "Current" and older as "Earlier".
 */
function renderStateProperties(
  assertions: Assertion[],
  entityId: EntityId,
  ir: ProjectIR,
  options: Required<EntityPageOptions>
): string {
  // Filter to only state predicates where this entity is the subject
  const stateAssertions = assertions.filter(
    a => a.subject === entityId && a.predicate && STATE_PREDICATES.has(a.predicate)
  );

  if (stateAssertions.length === 0) {
    return '';  // Don't show section if no state assertions
  }

  const lines: string[] = [];
  lines.push('## States & properties');
  lines.push('');

  // Group by predicate type
  const byPredicate = new Map<string, Assertion[]>();
  for (const a of stateAssertions) {
    const pred = a.predicate!;
    if (!byPredicate.has(pred)) {
      byPredicate.set(pred, []);
    }
    byPredicate.get(pred)!.push(a);
  }

  // Render in predicate order
  for (const predicate of STATE_PREDICATE_ORDER) {
    const group = byPredicate.get(predicate);
    if (!group || group.length === 0) continue;

    const label = STATE_PREDICATE_LABELS[predicate] || predicate;
    lines.push(`### ${label}`);
    lines.push('');

    // Sort by evidence position (most recent first for "current")
    const sorted = [...group].sort((a, b) => {
      return -compareEvidenceOrder(a.evidence, b.evidence);  // Negative for descending
    });

    // Most recent is "current", others are "earlier"
    const current = sorted[0];
    const earlier = sorted.slice(1);

    // Format current
    const currentStr = formatStateAssertion(current, ir);
    const modalityIcon = current.modality === 'NEGATED' ? '❌ ' : '';
    lines.push(`- ${modalityIcon}**${currentStr}** *(current)*`);

    // Add evidence for current
    if (current.evidence.length > 0) {
      const evidenceSnippet = formatEvidence(current.evidence[0]);
      lines.push(`  > "${evidenceSnippet}"`);
    }

    // Format earlier (if any)
    if (earlier.length > 0) {
      const maxEarlier = 3;  // Limit history display
      for (let i = 0; i < Math.min(earlier.length, maxEarlier); i++) {
        const a = earlier[i];
        const str = formatStateAssertion(a, ir);
        const mIcon = a.modality === 'NEGATED' ? '❌ ' : '';
        lines.push(`- ${mIcon}${str} *(earlier)*`);
      }
      if (earlier.length > maxEarlier) {
        lines.push(`  *(${earlier.length - maxEarlier} more not shown)*`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format a state assertion as human-readable text.
 */
function formatStateAssertion(assertion: Assertion, ir: ProjectIR): string {
  const predicate = assertion.predicate;
  const object = assertion.object;

  // Get object display name
  let objectStr: string;
  if (typeof object === 'string') {
    // Try to resolve as entity ID
    const entity = ir.entities.find(e => e.id === object);
    objectStr = entity ? entity.canonical : object;
  } else if (typeof object === 'boolean') {
    objectStr = object ? 'true' : 'false';
  } else if (typeof object === 'number') {
    objectStr = String(object);
  } else {
    objectStr = String(object);
  }

  // Format based on predicate type
  switch (predicate) {
    case 'state_of':
      return `is ${objectStr}`;
    case 'is_a':
      return `is ${objectStr}`;
    case 'has':
      return `has ${objectStr}`;
    case 'can':
      return `can ${objectStr}`;
    case 'trait':
      return `is always ${objectStr}`;
    case 'location_at':
      return `is ${objectStr}`;
    default:
      return `${predicate} ${objectStr}`;
  }
}

/**
 * 3.3 Current Status (fact timeline slice)
 */
function renderCurrentStatus(
  facts: FactViewRow[],
  entityId: EntityId,
  ir: ProjectIR
): string {
  const lines: string[] = [];
  lines.push('## Current status');
  lines.push('');

  // Location history
  const locationFacts = facts
    .filter(
      (f) =>
        f.subject === entityId &&
        f.predicate === 'located_in' &&
        typeof f.object === 'string'
    )
    .sort((a, b) => compareDiscourseTime(a.validFrom, b.validFrom));

  if (locationFacts.length > 0) {
    lines.push('### Location history');
    lines.push('');

    for (const fact of locationFacts) {
      const placeName = getEntityName(ir, fact.object as string);
      const timeStr = formatTimeAnchor(fact.validFrom);

      // Get evidence from derivedFrom
      let evidenceSnippet = '';
      if (fact.derivedFrom.length > 0) {
        const sourceEvent = ir.events.find((e) => e.id === fact.derivedFrom[0]);
        if (sourceEvent && sourceEvent.evidence.length > 0) {
          evidenceSnippet = ` — *"${formatEvidence(sourceEvent.evidence[0])}"*`;
        }
      }

      lines.push(`- ${timeStr}: **${placeName}**${evidenceSnippet}`);
    }
  } else {
    lines.push('*(No location history.)*');
  }

  // Death status
  const deathFact = facts.find(
    (f) => f.subject === entityId && f.predicate === 'alive' && f.object === false
  );

  if (deathFact) {
    lines.push('');
    lines.push('### Death');
    lines.push('');

    const timeStr = formatTimeAnchor(deathFact.validFrom);
    lines.push(`- Died at ${timeStr}`);

    // Find death event for more context
    if (deathFact.derivedFrom.length > 0) {
      const deathEvent = ir.events.find((e) => e.id === deathFact.derivedFrom[0]);
      if (deathEvent) {
        // Check for killer
        const killer = deathEvent.participants.find((p) => p.role === 'KILLER');
        if (killer) {
          const killerName = getEntityName(ir, killer.entity);
          lines.push(`- Killed by: **${killerName}**`);
        }

        // Evidence
        if (deathEvent.evidence.length > 0) {
          lines.push(`- *"${formatEvidence(deathEvent.evidence[0])}"*`);
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * 3.4 Timeline Highlights (Events-only)
 */
function renderTimelineHighlights(
  events: StoryEvent[],
  ir: ProjectIR,
  options: Required<EntityPageOptions>
): string {
  const lines: string[] = [];
  lines.push('## Timeline highlights');
  lines.push('');

  if (events.length === 0) {
    lines.push('*(No events involving this entity.)*');
    return lines.join('\n');
  }

  // Sort by discourse time
  const sortedEvents = [...events].sort((a, b) =>
    compareDiscourseTime(a.time, b.time)
  );

  // Limit to maxEvents
  const displayEvents = sortedEvents.slice(0, options.maxEvents);

  for (const event of displayEvents) {
    // Format: - **[EventType]** summary (modality)
    const summary = summarizeEvent(event, ir);
    const modalityBadge = formatModalityBadge(event.modality, event.modalitiesObserved);

    lines.push(`- **[${event.type}]** ${summary} (${modalityBadge})`);

    // Evidence snippets
    const evidenceLimit = Math.min(event.evidence.length, options.maxEvidencePerItem);
    for (let i = 0; i < evidenceLimit; i++) {
      lines.push(`  > ${formatEvidence(event.evidence[i])}`);
    }
  }

  if (sortedEvents.length > options.maxEvents) {
    lines.push('');
    lines.push(`*(${sortedEvents.length - options.maxEvents} more events not shown)*`);
  }

  return lines.join('\n');
}

/**
 * 3.5 Key Claims (Assertions-only)
 */
function renderKeyClaims(
  assertions: Assertion[],
  ir: ProjectIR,
  options: Required<EntityPageOptions>
): string {
  const lines: string[] = [];
  lines.push('## Key claims');
  lines.push('');

  if (assertions.length === 0) {
    lines.push('*(No assertions involving this entity.)*');
    return lines.join('\n');
  }

  // Sort by: FACT > CLAIM > BELIEF > RUMOR > NEGATED, then by confidence, then discourse
  const sortedAssertions = [...assertions].sort((a, b) => {
    // Modality priority (higher = shown first)
    const modalityPriority: Record<Modality, number> = {
      FACT: 6,
      CLAIM: 5,
      BELIEF: 4,
      RUMOR: 3,
      PLAN: 2,
      NEGATED: 1,
      HYPOTHETICAL: 0,
      UNCERTAIN: 0,
    };
    const modalityDiff =
      (modalityPriority[b.modality] ?? 0) - (modalityPriority[a.modality] ?? 0);
    if (modalityDiff !== 0) return modalityDiff;

    // Confidence (higher first)
    const confDiff = b.confidence.composite - a.confidence.composite;
    if (Math.abs(confDiff) > 0.01) return confDiff;

    // Discourse order
    return compareEvidenceOrder(a.evidence, b.evidence);
  });

  // Limit to maxAssertions
  const displayAssertions = sortedAssertions.slice(0, options.maxAssertions);

  for (const assertion of displayAssertions) {
    if (!assertion.subject || !assertion.predicate) continue;

    const subjectName = getEntityName(ir, assertion.subject);
    const objectDisplay =
      typeof assertion.object === 'string'
        ? getEntityName(ir, assertion.object)
        : String(assertion.object ?? '?');

    // Format: - SubjectName **predicate** ObjectName (modality, attribution)
    let line = `- ${subjectName} **${assertion.predicate}** ${objectDisplay}`;

    // Modality and attribution
    const parts: string[] = [assertion.modality];
    if (assertion.attribution.source === 'CHARACTER' && assertion.attribution.character) {
      const speakerName = getEntityName(ir, assertion.attribution.character);
      parts.push(`attributed to ${speakerName}`);
    }
    line += ` *(${parts.join(', ')})*`;

    lines.push(line);

    // One evidence snippet
    if (assertion.evidence.length > 0 && options.maxEvidencePerItem > 0) {
      lines.push(`  > ${formatEvidence(assertion.evidence[0])}`);
    }
  }

  if (sortedAssertions.length > options.maxAssertions) {
    lines.push('');
    lines.push(`*(${sortedAssertions.length - options.maxAssertions} more claims not shown)*`);
  }

  return lines.join('\n');
}

/**
 * 3.6 Evidence Section (aggregated)
 */
function renderEvidenceSection(
  events: StoryEvent[],
  assertions: Assertion[],
  options: Required<EntityPageOptions>
): string {
  const lines: string[] = [];
  lines.push('## Evidence');
  lines.push('');

  // Collect all evidence spans
  const evidenceMap = new Map<string, EvidenceSpan>();

  for (const event of events) {
    for (const ev of event.evidence) {
      const key = `${ev.docId}:${ev.charStart}:${ev.charEnd}`;
      if (!evidenceMap.has(key)) {
        evidenceMap.set(key, ev);
      }
    }
  }

  for (const assertion of assertions) {
    for (const ev of assertion.evidence) {
      const key = `${ev.docId}:${ev.charStart}:${ev.charEnd}`;
      if (!evidenceMap.has(key)) {
        evidenceMap.set(key, ev);
      }
    }
  }

  const allEvidence = Array.from(evidenceMap.values());

  if (allEvidence.length === 0) {
    lines.push('*(No evidence available.)*');
    return lines.join('\n');
  }

  // Sort by document and position
  allEvidence.sort((a, b) => {
    const docCompare = a.docId.localeCompare(b.docId);
    if (docCompare !== 0) return docCompare;
    return a.charStart - b.charStart;
  });

  // Show top N evidence spans
  const maxEvidence = options.maxEvents + options.maxAssertions; // reasonable limit
  const displayEvidence = allEvidence.slice(0, maxEvidence);

  for (const ev of displayEvidence) {
    const locationStr = ev.paragraphIndex !== undefined
      ? `[${ev.docId}, para ${ev.paragraphIndex}]`
      : `[${ev.docId}]`;
    lines.push(`- ${locationStr}: "${formatEvidence(ev)}"`);
  }

  if (allEvidence.length > maxEvidence) {
    lines.push('');
    lines.push(`*(${allEvidence.length - maxEvidence} more evidence spans not shown)*`);
  }

  return lines.join('\n');
}

/**
 * 3.7 Debug Section (optional)
 */
function renderDebugSection(
  entity: Entity,
  facts: FactViewRow[],
  events: StoryEvent[],
  assertions: Assertion[]
): string {
  const lines: string[] = [];
  lines.push('## Debug');
  lines.push('');

  // Entity metadata
  lines.push('### Entity metadata');
  lines.push('');
  lines.push(`- **ID:** \`${entity.id}\``);
  lines.push(`- **Created:** ${entity.createdAt}`);
  lines.push(`- **Updated:** ${entity.updatedAt}`);
  lines.push(`- **Confidence:** ${(entity.confidence.composite * 100).toFixed(1)}%`);

  if (entity.userConfirmed) lines.push('- **User confirmed:** ✅');
  if (entity.userRejected) lines.push('- **User rejected:** ❌');
  if (entity.userLocked) lines.push('- **User locked:** 🔒');

  // Counts
  lines.push('');
  lines.push('### Counts');
  lines.push('');
  lines.push(`- Facts: ${facts.length}`);
  lines.push(`- Events: ${events.length}`);
  lines.push(`- Assertions: ${assertions.length}`);

  // Top derivedFrom IDs
  lines.push('');
  lines.push('### Top derivedFrom references');
  lines.push('');

  const derivedFromIds = new Set<string>();
  for (const event of events.slice(0, 5)) {
    for (const id of event.derivedFrom) {
      derivedFromIds.add(id);
    }
  }
  for (const fact of facts.slice(0, 5)) {
    for (const id of fact.derivedFrom) {
      derivedFromIds.add(id);
    }
  }

  const topIds = Array.from(derivedFromIds).slice(0, 10);
  if (topIds.length > 0) {
    for (const id of topIds) {
      lines.push(`- \`${id}\``);
    }
  } else {
    lines.push('*(None)*');
  }

  // Event metadata
  if (events.length > 0) {
    lines.push('');
    lines.push('### Event metadata (first 3)');
    lines.push('');

    for (const event of events.slice(0, 3)) {
      lines.push(`- \`${event.id}\``);
      lines.push(`  - extractedFrom: ${event.extractedFrom}`);
      lines.push(`  - compiler_pass: ${event.compiler_pass}`);
      lines.push(`  - createdAt: ${event.createdAt}`);
    }
  }

  return lines.join('\n');
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get display name for an entity.
 */
export function getEntityName(ir: ProjectIR, entityId: EntityId): string {
  const entity = ir.entities.find((e) => e.id === entityId);
  return entity?.canonical ?? entityId;
}

/**
 * Get all events where entity participates.
 */
export function getEventsForEntity(
  events: StoryEvent[],
  entityId: EntityId
): StoryEvent[] {
  return events.filter((e) =>
    e.participants.some((p) => p.entity === entityId)
  );
}

/**
 * Get all assertions involving entity as subject or object.
 */
export function getAssertionsForEntity(
  assertions: Assertion[],
  entityId: EntityId
): Assertion[] {
  return assertions.filter(
    (a) => a.subject === entityId || a.object === entityId
  );
}

/**
 * Get all facts involving entity.
 */
function getFactsForEntity(facts: FactViewRow[], entityId: EntityId): FactViewRow[] {
  return facts.filter((f) => f.subject === entityId || f.object === entityId);
}

/**
 * Compare two time anchors for sorting.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
function compareDiscourseTime(a: TimeAnchor, b: TimeAnchor): number {
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
 * Compare evidence order for deterministic sorting.
 */
function compareEvidenceOrder(a: EvidenceSpan[], b: EvidenceSpan[]): number {
  const aFirst = a[0];
  const bFirst = b[0];

  if (!aFirst && !bFirst) return 0;
  if (!aFirst) return 1;
  if (!bFirst) return -1;

  const docCompare = aFirst.docId.localeCompare(bFirst.docId);
  if (docCompare !== 0) return docCompare;

  return aFirst.charStart - bFirst.charStart;
}

/**
 * Format a time anchor for display.
 */
function formatTimeAnchor(time: TimeAnchor): string {
  if (time.type === 'DISCOURSE') {
    const parts: string[] = [];
    if (time.chapter !== undefined) parts.push(`Ch.${time.chapter}`);
    if (time.paragraph !== undefined) parts.push(`¶${time.paragraph}`);
    if (time.sentence !== undefined) parts.push(`s${time.sentence}`);
    return parts.length > 0 ? parts.join(' ') : 'discourse';
  }

  if (time.type === 'ABSOLUTE') {
    return time.date;
  }

  if (time.type === 'RELATIVE') {
    return `${time.offset} from ${time.anchor}`;
  }

  return 'unknown';
}

/**
 * Format evidence span for display.
 * Max 200 chars, escape markdown.
 */
export function formatEvidence(ev: EvidenceSpan): string {
  let text = ev.text || `[${ev.docId}:${ev.charStart}-${ev.charEnd}]`;

  // Truncate to 200 chars
  if (text.length > 200) {
    text = text.slice(0, 197) + '...';
  }

  // Minimal markdown escaping (avoid breaking blockquotes)
  text = text.replace(/\n/g, ' ').replace(/\r/g, '');

  return text;
}

/**
 * Format modality badge with modalitiesObserved.
 */
function formatModalityBadge(
  modality: Modality,
  observed?: Modality[]
): string {
  let badge = modality;

  if (observed && observed.length > 1) {
    // Show that multiple modalities were observed
    const others = observed.filter((m) => m !== modality).sort();
    if (others.length > 0) {
      badge += `, observed: [${observed.sort().join(', ')}]`;
    }
  }

  return badge;
}

/**
 * Generate auto-summary for an event.
 * Uses only event fields (no inference).
 */
export function summarizeEvent(event: StoryEvent, ir: ProjectIR): string {
  // If explicit summary exists, use it
  if (event.summary) {
    return event.summary;
  }

  // Auto-generate from type and participants
  const participants = event.participants
    .map((p) => `${getEntityName(ir, p.entity)}`)
    .join(', ');

  const location = event.location
    ? ` at ${getEntityName(ir, event.location)}`
    : '';

  // Event-type-specific formatting
  switch (event.type) {
    case 'MOVE': {
      const mover = event.participants.find((p) => p.role === 'MOVER');
      const dest = event.participants.find((p) => p.role === 'DESTINATION');
      if (mover && dest) {
        return `${getEntityName(ir, mover.entity)} → ${getEntityName(ir, dest.entity)}`;
      }
      break;
    }
    case 'DEATH': {
      const decedent = event.participants.find((p) => p.role === 'DECEDENT');
      const killer = event.participants.find((p) => p.role === 'KILLER');
      if (decedent && killer) {
        return `${getEntityName(ir, decedent.entity)} killed by ${getEntityName(ir, killer.entity)}`;
      }
      if (decedent) {
        return `${getEntityName(ir, decedent.entity)} died`;
      }
      break;
    }
    case 'TELL': {
      const speaker = event.participants.find((p) => p.role === 'SPEAKER');
      const addressee = event.participants.find((p) => p.role === 'ADDRESSEE');
      if (speaker && addressee) {
        return `${getEntityName(ir, speaker.entity)} → ${getEntityName(ir, addressee.entity)}`;
      }
      if (speaker) {
        return `${getEntityName(ir, speaker.entity)} spoke`;
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
    case 'ATTACK': {
      const attacker = event.participants.find((p) => p.role === 'ATTACKER');
      const target = event.participants.find((p) => p.role === 'TARGET');
      if (attacker && target) {
        return `${getEntityName(ir, attacker.entity)} attacked ${getEntityName(ir, target.entity)}`;
      }
      break;
    }
    case 'LEARN': {
      const learner = event.participants.find((p) => p.role === 'LEARNER');
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
  }

  // Fallback: type + participants
  return `${participants}${location}`;
}

/**
 * Sort items by discourse time with stable fallback.
 */
export function sortByDiscourseTime<T extends { time?: TimeAnchor; evidence?: EvidenceSpan[] }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    // Try time anchors first
    if (a.time && b.time) {
      const timeCompare = compareDiscourseTime(a.time, b.time);
      if (timeCompare !== 0) return timeCompare;
    }

    // Fall back to evidence order
    if (a.evidence && b.evidence) {
      return compareEvidenceOrder(a.evidence, b.evidence);
    }

    return 0;
  });
}
