/**
 * Entity & Item Page Renderer - Generates wiki-style pages.
 *
 * This renderer produces human-readable markdown for entities and items,
 * showing their facts, events, assertions, and evidence.
 *
 * Renderers:
 * - renderEntityPage(entityId) - Wiki page for PERSON/ORG/PLACE entities
 * - renderItemPage(itemId) - Wiki page for ITEM entities with ownership
 *
 * CONTRACT:
 * - Renderer must NOT infer new information
 * - Renderer may only aggregate and format existing IR data
 * - Sorting must be deterministic (no JS object iteration order)
 * - Evidence snippets are display-only, not semantic
 * - Contested/unknown states must be explicitly labeled
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
import { buildFactsFromEvents, getCurrentLocation, getCurrentPossessions, getCurrentHolder, isAlive } from './fact-builder';

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
// RELATION PREDICATE CONSTANTS
// =============================================================================

/**
 * Symmetric relation predicates (A→B implies B→A)
 */
const SYMMETRIC_RELATION_PREDICATES = new Set([
  'enemy_of',
  'sibling_of',
  'married_to',
  'ally_of',
  'friends_with',
  'cousin_of',
]);

/**
 * Directional relation predicates (A→B does not imply B→A)
 */
const DIRECTIONAL_RELATION_PREDICATES = new Set([
  'parent_of',
  'child_of',
  'member_of',
  'works_for',
  'lives_in',
  'born_in',
  'studied_at',
  'teaches_at',
  'mentored',
  'mentored_by',
  'leads',
  'rules',
  'ruled_by',
  'guards',
  'owns',
  'wields',
  'ancestor_of',
  'descendant_of',
]);

/**
 * All relation predicates that should appear in Relationships section
 */
const ALL_RELATION_PREDICATES = new Set([
  ...SYMMETRIC_RELATION_PREDICATES,
  ...DIRECTIONAL_RELATION_PREDICATES,
]);

/**
 * Human-readable labels for relation predicates
 */
const RELATION_LABELS: Record<string, string> = {
  'enemy_of': 'Enemies',
  'sibling_of': 'Siblings',
  'married_to': 'Married to',
  'ally_of': 'Allies',
  'friends_with': 'Friends',
  'cousin_of': 'Cousins',
  'parent_of': 'Children',
  'child_of': 'Parents',
  'member_of': 'Member of',
  'works_for': 'Works for',
  'lives_in': 'Lives in',
  'born_in': 'Born in',
  'studied_at': 'Studied at',
  'teaches_at': 'Teaches at',
  'mentored': 'Mentored',
  'mentored_by': 'Mentored by',
  'leads': 'Leads',
  'rules': 'Rules',
  'ruled_by': 'Ruled by',
  'guards': 'Guards',
  'owns': 'Owns',
  'wields': 'Wields',
  'ancestor_of': 'Ancestors',
  'descendant_of': 'Descendants',
};

/**
 * Display order for relation predicates (grouped by type)
 */
const RELATION_DISPLAY_ORDER = [
  // Family
  'parent_of', 'child_of', 'sibling_of', 'married_to', 'cousin_of', 'ancestor_of', 'descendant_of',
  // Social
  'friends_with', 'ally_of', 'enemy_of', 'mentored', 'mentored_by',
  // Organizational
  'member_of', 'works_for', 'leads', 'rules', 'ruled_by',
  // Location
  'lives_in', 'born_in', 'studied_at', 'teaches_at',
  // Possession/custody
  'owns', 'wields', 'guards',
];

// =============================================================================
// ENTITY TYPE BADGE CONSTANTS (A3)
// =============================================================================

/**
 * Icon mapping for entity types.
 * Used in title blocks and cross-links when confidence ≥ 0.7.
 */
const ENTITY_TYPE_ICONS: Record<string, string> = {
  'PERSON': '👤',
  'ORG': '🏛️',
  'ORGANIZATION': '🏛️',
  'PLACE': '📍',
  'LOCATION': '📍',
  'ITEM': '🎭',
  'EVENT': '📅',
  'WORK': '📖',
  'CONCEPT': '💡',
  'GROUP': '👥',
  'ANIMAL': '🐾',
  'VEHICLE': '🚗',
  'WEAPON': '⚔️',
  'DOCUMENT': '📄',
  'MONEY': '💰',
  'DATE': '📆',
  'TIME': '⏰',
};

/**
 * Minimum confidence required to show entity type badge.
 */
const BADGE_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Get the icon badge for an entity type, if confidence is high enough.
 *
 * @param type - The entity type string
 * @param confidence - The entity's composite confidence score
 * @returns Icon string or empty string if below threshold
 */
export function getTypeBadge(type: string, confidence: number): string {
  if (confidence < BADGE_CONFIDENCE_THRESHOLD) {
    return '';
  }
  return ENTITY_TYPE_ICONS[type] ?? '';
}

// =============================================================================
// CROSS-LINK HELPERS
// =============================================================================

/**
 * Generate a markdown link to an entity page.
 *
 * @param entityId - The entity ID (used for link target)
 * @param name - The display name
 * @param ir - Optional ProjectIR to look up canonical name
 * @returns Markdown link like [Name](entity_id)
 */
export function linkEntity(
  entityId: EntityId,
  name?: string,
  ir?: ProjectIR
): string {
  // If no name provided, try to get it from IR
  let displayName = name;
  if (!displayName && ir) {
    const entity = ir.entities.find((e) => e.id === entityId);
    displayName = entity?.canonical || entityId;
  } else if (!displayName) {
    displayName = entityId;
  }

  return `[${displayName}](${entityId})`;
}

/**
 * Get entity name with optional cross-link.
 *
 * @param ir - The ProjectIR
 * @param entityId - The entity ID
 * @param withLink - Whether to include markdown link (default false for backward compatibility)
 * @returns Entity name, optionally as markdown link
 */
function getEntityNameLinked(
  ir: ProjectIR,
  entityId: EntityId,
  withLink: boolean = false
): string {
  const entity = ir.entities.find((e) => e.id === entityId);
  const name = entity?.canonical || entityId;

  if (withLink) {
    return linkEntity(entityId, name);
  }
  return name;
}

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

  // Compute facts from events AND assertions (materialized view)
  const facts = buildFactsFromEvents(ir.events, ir.assertions);

  // Get related data
  const entityEvents = getEventsForEntity(ir.events, entityId);
  const entityAssertions = getAssertionsForEntity(ir.assertions, entityId);
  const entityFacts = getFactsForEntity(facts, entityId);

  // Build sections
  const sections: string[] = [];

  sections.push(renderTitleBlock(entity));
  sections.push(renderQuickFacts(entity, entityFacts, entityId, ir));
  sections.push(renderRelationships(entityFacts, entityId, ir));
  sections.push(renderStateProperties(entityAssertions, entityId, ir, options));
  sections.push(renderPossessions(entityFacts, entityId, ir));
  sections.push(renderCurrentStatus(entityFacts, entityId, ir));
  sections.push(renderTimelineHighlights(entityEvents, ir, options));
  sections.push(renderKeyClaims(entityAssertions, ir, options));
  sections.push(renderMentionedIn(ir, entityId, options));
  sections.push(renderEvidenceSection(entityEvents, entityAssertions, options));

  if (options.includeDebug) {
    sections.push(renderDebugSection(entity, entityFacts, entityEvents, entityAssertions));
  }

  return sections.filter((s) => s.length > 0).join('\n\n');
}

// =============================================================================
// ITEM PAGE RENDERER
// =============================================================================

export interface ItemPageOptions {
  /** Maximum transfer events to show (default 25) */
  maxTransfers?: number;
  /** Maximum evidence snippets per item (default 2) */
  maxEvidencePerItem?: number;
  /** Include debug section (default false) */
  includeDebug?: boolean;
}

const DEFAULT_ITEM_OPTIONS: Required<ItemPageOptions> = {
  maxTransfers: 25,
  maxEvidencePerItem: 2,
  includeDebug: false,
};

/**
 * Render a wiki-style page for an item (ITEM entity type).
 *
 * Shows:
 * - Current holder (or contested/unknown)
 * - Ownership timeline (possession facts)
 * - Transfer events involving the item
 * - Evidence snippets
 *
 * @param ir - The ProjectIR containing all data
 * @param itemId - The item entity to render
 * @param opts - Rendering options
 * @returns Markdown string
 */
export function renderItemPage(
  ir: ProjectIR,
  itemId: EntityId,
  opts?: ItemPageOptions
): string {
  const options = { ...DEFAULT_ITEM_OPTIONS, ...opts };

  // Find the entity
  const entity = ir.entities.find((e) => e.id === itemId);
  if (!entity) {
    return `# Item Not Found\n\nNo item with ID \`${itemId}\` exists in this IR.`;
  }

  // Compute facts from events AND assertions
  const facts = buildFactsFromEvents(ir.events, ir.assertions);

  // Get transfer events involving this item
  const transferEvents = ir.events.filter(
    (e) =>
      e.type === 'TRANSFER' &&
      e.participants.some((p) => p.role === 'ITEM' && p.entity === itemId)
  );

  // Build sections
  const sections: string[] = [];

  sections.push(renderItemTitleBlock(entity));
  sections.push(renderItemCurrentHolder(facts, itemId, ir));
  sections.push(renderOwnershipTimeline(facts, itemId, ir));
  sections.push(renderTransferHistory(transferEvents, itemId, ir, options));

  if (options.includeDebug) {
    sections.push(renderItemDebugSection(entity, facts, transferEvents, itemId));
  }

  return sections.filter((s) => s.length > 0).join('\n\n');
}

/**
 * Item Title Block
 */
function renderItemTitleBlock(entity: Entity): string {
  const lines: string[] = [];

  // Title with badge
  const displayName = entity.canonical || entity.id;
  const badge = getTypeBadge(entity.type, entity.confidence.composite);
  const titleBadge = badge ? ` ${badge}` : '';
  lines.push(`# ${displayName}${titleBadge}`);
  lines.push('');

  // Type with badge
  const typeBadge = badge ? `${badge} ` : '';
  lines.push(`**Type:** ${typeBadge}${entity.type}`);

  const aliases = entity.aliases.filter((a) => a !== entity.canonical);
  if (aliases.length > 0) {
    lines.push(`**Aliases:** ${aliases.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Current Holder section
 */
function renderItemCurrentHolder(
  facts: FactViewRow[],
  itemId: EntityId,
  ir: ProjectIR
): string {
  const lines: string[] = [];
  lines.push('## Current holder');
  lines.push('');

  const holderResult = getCurrentHolder(facts, itemId);

  if (!holderResult) {
    lines.push('**Unknown** — No ownership information available.');
    return lines.join('\n');
  }

  if (holderResult.holder === 'contested') {
    lines.push('**⚠️ Contested** — Multiple entities claim possession:');
    lines.push('');
    for (const holderId of holderResult.holders) {
      const holderName = getEntityNameLinked(ir, holderId, true);
      lines.push(`- ${holderName}`);
    }
    lines.push('');
    lines.push('*This may indicate conflicting evidence or a data inconsistency.*');
  } else {
    const holderName = getEntityNameLinked(ir, holderResult.holder, true);
    lines.push(`**Current:** ${holderName}`);

    // Find the most recent gain fact for evidence
    const gainFact = facts
      .filter(
        (f) =>
          f.object === itemId &&
          f.predicate === 'possesses' &&
          f.subject === holderResult.holder &&
          !f.validUntil
      )
      .sort((a, b) => compareDiscourseTime(b.validFrom, a.validFrom))[0];

    if (gainFact) {
      const timeStr = formatTimeAnchor(gainFact.validFrom);
      lines.push(`- Since ${timeStr}`);

      // Get evidence
      if (gainFact.derivedFrom.length > 0) {
        const sourceEvent = ir.events.find((e) => e.id === gainFact.derivedFrom[0]);
        if (sourceEvent && sourceEvent.evidence.length > 0) {
          lines.push(`- *"${formatEvidence(sourceEvent.evidence[0])}"*`);
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * Ownership Timeline section
 *
 * Shows chronological list of who possessed the item and when.
 */
function renderOwnershipTimeline(
  facts: FactViewRow[],
  itemId: EntityId,
  ir: ProjectIR
): string {
  const lines: string[] = [];
  lines.push('## Ownership history');
  lines.push('');

  // Get all possession facts for this item
  const possessionFacts = facts.filter(
    (f) =>
      f.object === itemId &&
      f.predicate === 'possesses' &&
      typeof f.subject === 'string'
  );

  if (possessionFacts.length === 0) {
    lines.push('*(No ownership history.)*');
    return lines.join('\n');
  }

  // Build ownership entries: each gain/loss pair or current possession
  interface OwnershipEntry {
    holder: EntityId;
    from: TimeAnchor;
    until?: TimeAnchor;
    inference?: 'explicit' | 'implied_loss';
    derivedFrom: string[];
  }

  const entries: OwnershipEntry[] = [];

  // Group facts by holder
  const byHolder = new Map<EntityId, FactViewRow[]>();
  for (const fact of possessionFacts) {
    const holderId = fact.subject;
    if (!byHolder.has(holderId)) {
      byHolder.set(holderId, []);
    }
    byHolder.get(holderId)!.push(fact);
  }

  // For each holder, determine their ownership period
  for (const [holderId, holderFacts] of byHolder.entries()) {
    const gainFact = holderFacts.find((f) => !f.validUntil);
    const lossFact = holderFacts.find((f) => f.validUntil);

    if (gainFact) {
      entries.push({
        holder: holderId,
        from: gainFact.validFrom,
        until: lossFact?.validUntil,
        inference: gainFact.inference,
        derivedFrom: gainFact.derivedFrom,
      });
    } else if (lossFact) {
      // Only loss fact (inferred prior possession)
      entries.push({
        holder: holderId,
        from: lossFact.validFrom, // UNKNOWN
        until: lossFact.validUntil,
        inference: lossFact.inference,
        derivedFrom: lossFact.derivedFrom,
      });
    }
  }

  // Sort by "from" time (most recent first for display), with UNKNOWN last
  entries.sort((a, b) => {
    const aVal = getOwnershipSortValue(a);
    const bVal = getOwnershipSortValue(b);
    return bVal - aVal; // Descending (most recent first)
  });

  // Render entries
  for (const entry of entries) {
    const holderName = getEntityNameLinked(ir, entry.holder, true);
    const fromStr = formatTimeAnchor(entry.from);

    let line = `- ${holderName}`;

    if (entry.until) {
      const untilStr = formatTimeAnchor(entry.until);
      line += ` — ${fromStr} → ${untilStr}`;
    } else {
      line += ` — since ${fromStr}`;
      line += ' *(current)*';
    }

    if (entry.inference === 'implied_loss') {
      line += ' *(inferred)*';
    }

    lines.push(line);

    // Add evidence
    if (entry.derivedFrom.length > 0) {
      const sourceEvent = ir.events.find((e) => e.id === entry.derivedFrom[0]);
      if (sourceEvent && sourceEvent.evidence.length > 0) {
        lines.push(`  > *"${formatEvidence(sourceEvent.evidence[0])}"*`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Get sort value for ownership entry (for chronological ordering).
 */
function getOwnershipSortValue(entry: { from: TimeAnchor; until?: TimeAnchor }): number {
  // Use "until" if present (end of ownership), otherwise "from" (start)
  const time = entry.until ?? entry.from;

  if (time.type === 'DISCOURSE') {
    return (
      (time.chapter ?? 0) * 100000 +
      (time.paragraph ?? 0) * 1000 +
      (time.sentence ?? 0)
    );
  }
  // UNKNOWN sorts earliest
  return -1;
}

/**
 * Transfer History section
 *
 * Shows transfer events involving this item.
 */
function renderTransferHistory(
  events: StoryEvent[],
  itemId: EntityId,
  ir: ProjectIR,
  options: Required<ItemPageOptions>
): string {
  const lines: string[] = [];
  lines.push('## Transfer events');
  lines.push('');

  if (events.length === 0) {
    lines.push('*(No transfer events recorded.)*');
    return lines.join('\n');
  }

  // Sort by discourse time
  const sortedEvents = [...events].sort((a, b) =>
    compareDiscourseTime(a.time, b.time)
  );

  // Limit to maxTransfers
  const displayEvents = sortedEvents.slice(0, options.maxTransfers);

  for (const event of displayEvents) {
    const summary = summarizeEvent(event, ir);
    const timeStr = formatTimeAnchor(event.time);
    const modalityBadge = event.modality !== 'FACT' ? ` (${event.modality})` : '';

    lines.push(`- ${timeStr}: ${summary}${modalityBadge}`);

    // Evidence snippets
    const evidenceLimit = Math.min(event.evidence.length, options.maxEvidencePerItem);
    for (let i = 0; i < evidenceLimit; i++) {
      lines.push(`  > *"${formatEvidence(event.evidence[i])}"*`);
    }
  }

  if (sortedEvents.length > options.maxTransfers) {
    lines.push('');
    lines.push(`*(${sortedEvents.length - options.maxTransfers} more events not shown)*`);
  }

  return lines.join('\n');
}

/**
 * Item Debug Section
 */
function renderItemDebugSection(
  entity: Entity,
  facts: FactViewRow[],
  events: StoryEvent[],
  itemId: EntityId
): string {
  const lines: string[] = [];
  lines.push('## Debug');
  lines.push('');

  lines.push('### Item metadata');
  lines.push('');
  lines.push(`- **ID:** \`${entity.id}\``);
  lines.push(`- **Type:** ${entity.type}`);
  lines.push(`- **Confidence:** ${(entity.confidence.composite * 100).toFixed(1)}%`);

  // Possession facts
  const possessionFacts = facts.filter(
    (f) => f.object === itemId && f.predicate === 'possesses'
  );

  lines.push('');
  lines.push('### Possession facts');
  lines.push('');
  lines.push(`- Total: ${possessionFacts.length}`);
  lines.push(`- Current (no validUntil): ${possessionFacts.filter((f) => !f.validUntil).length}`);
  lines.push(`- Ended (has validUntil): ${possessionFacts.filter((f) => f.validUntil).length}`);

  lines.push('');
  lines.push('### Transfer events');
  lines.push('');
  lines.push(`- Total: ${events.length}`);

  return lines.join('\n');
}

// =============================================================================
// PLACE PAGE RENDERER (A5)
// =============================================================================

export interface PlacePageOptions {
  /** Maximum residents to show (default 25) */
  maxResidents?: number;
  /** Maximum visitors to show (default 25) */
  maxVisitors?: number;
  /** Maximum located items to show (default 25) */
  maxItems?: number;
  /** Include debug section (default false) */
  includeDebug?: boolean;
}

const DEFAULT_PLACE_OPTIONS: Required<PlacePageOptions> = {
  maxResidents: 25,
  maxVisitors: 25,
  maxItems: 25,
  includeDebug: false,
};

/**
 * Render a wiki-style page for a place (PLACE/LOCATION entity type).
 *
 * Shows:
 * - Residents (entities with lives_in assertions to this place)
 * - Visitors (entities that moved to this place)
 * - Located items (items at this location)
 *
 * @param ir - The ProjectIR containing all data
 * @param placeId - The place entity to render
 * @param opts - Rendering options
 * @returns Markdown string
 */
export function renderPlacePage(
  ir: ProjectIR,
  placeId: EntityId,
  opts?: PlacePageOptions
): string {
  const options = { ...DEFAULT_PLACE_OPTIONS, ...opts };

  // Find the entity
  const entity = ir.entities.find((e) => e.id === placeId);
  if (!entity) {
    return `# Place Not Found\n\nNo place with ID \`${placeId}\` exists in this IR.`;
  }

  // Compute facts from events AND assertions
  const facts = buildFactsFromEvents(ir.events, ir.assertions);

  // Build sections
  const sections: string[] = [];

  sections.push(renderPlaceTitleBlock(entity));
  sections.push(renderPlaceResidents(ir, placeId, options));
  sections.push(renderPlaceVisitors(ir, placeId, options));
  sections.push(renderPlaceLocatedItems(facts, placeId, ir, options));

  if (options.includeDebug) {
    sections.push(renderPlaceDebugSection(entity, ir, placeId));
  }

  return sections.filter((s) => s.length > 0).join('\n\n');
}

/**
 * Place Title Block
 */
function renderPlaceTitleBlock(entity: Entity): string {
  const lines: string[] = [];

  // Title with badge
  const displayName = entity.canonical || entity.id;
  const badge = getTypeBadge(entity.type, entity.confidence.composite);
  const titleBadge = badge ? ` ${badge}` : '';
  lines.push(`# ${displayName}${titleBadge}`);
  lines.push('');

  // Type with badge
  const typeBadge = badge ? `${badge} ` : '';
  lines.push(`**Type:** ${typeBadge}${entity.type}`);

  const aliases = entity.aliases.filter((a) => a !== entity.canonical);
  if (aliases.length > 0) {
    lines.push(`**Aliases:** ${aliases.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Residents section - entities with lives_in assertions pointing to this place.
 */
function renderPlaceResidents(
  ir: ProjectIR,
  placeId: EntityId,
  options: Required<PlacePageOptions>
): string {
  // Find lives_in assertions where this place is the object
  const residentsAssertions = ir.assertions.filter(
    (a) =>
      a.predicate === 'lives_in' &&
      a.object === placeId &&
      typeof a.subject === 'string'
  );

  if (residentsAssertions.length === 0) {
    return '';  // Don't show section if no residents
  }

  const lines: string[] = [];
  lines.push('## Residents');
  lines.push('');

  // Get unique residents sorted alphabetically
  const residentIds = new Set<string>();
  for (const a of residentsAssertions) {
    residentIds.add(a.subject as string);
  }

  const sortedResidents = Array.from(residentIds).sort((a, b) =>
    getEntityName(ir, a).localeCompare(getEntityName(ir, b))
  );

  // Limit display
  const displayResidents = sortedResidents.slice(0, options.maxResidents);

  for (const residentId of displayResidents) {
    const residentLink = getEntityNameLinked(ir, residentId, true);

    // Find assertion for evidence
    const assertion = residentsAssertions.find((a) => a.subject === residentId);
    let evidenceSnippet = '';
    if (assertion && assertion.evidence.length > 0) {
      const text = assertion.evidence[0].text ?? '';
      if (text.length > 60) {
        evidenceSnippet = ` — *"${text.slice(0, 57)}..."*`;
      } else if (text.length > 0) {
        evidenceSnippet = ` — *"${text}"*`;
      }
    }

    lines.push(`- ${residentLink}${evidenceSnippet}`);
  }

  if (sortedResidents.length > options.maxResidents) {
    lines.push('');
    lines.push(`*(${sortedResidents.length - options.maxResidents} more residents not shown)*`);
  }

  return lines.join('\n');
}

/**
 * Visitors section - entities that moved to this place (MOVE events with destination).
 */
function renderPlaceVisitors(
  ir: ProjectIR,
  placeId: EntityId,
  options: Required<PlacePageOptions>
): string {
  // Find MOVE events where this place is the destination
  const moveEvents = ir.events.filter(
    (e) =>
      e.type === 'MOVE' &&
      e.participants.some((p) => p.role === 'DESTINATION' && p.entity === placeId)
  );

  if (moveEvents.length === 0) {
    return '';  // Don't show section if no visitors
  }

  const lines: string[] = [];
  lines.push('## Visitors');
  lines.push('');

  // Get unique visitors with their most recent visit time
  interface VisitorInfo {
    entityId: string;
    time: TimeAnchor;
    evidence?: EvidenceSpan;
  }

  const visitorMap = new Map<string, VisitorInfo>();

  for (const event of moveEvents) {
    const mover = event.participants.find((p) => p.role === 'MOVER');
    if (mover) {
      const existing = visitorMap.get(mover.entity);
      // Keep the most recent visit
      if (!existing || compareVisitTime(event.time, existing.time) > 0) {
        visitorMap.set(mover.entity, {
          entityId: mover.entity,
          time: event.time,
          evidence: event.evidence[0],
        });
      }
    }
  }

  // Sort visitors by name
  const sortedVisitors = Array.from(visitorMap.values()).sort((a, b) =>
    getEntityName(ir, a.entityId).localeCompare(getEntityName(ir, b.entityId))
  );

  // Limit display
  const displayVisitors = sortedVisitors.slice(0, options.maxVisitors);

  for (const visitor of displayVisitors) {
    const visitorLink = getEntityNameLinked(ir, visitor.entityId, true);
    const timeStr = formatTimeAnchorShort(visitor.time);

    lines.push(`- ${visitorLink} (${timeStr})`);
  }

  if (sortedVisitors.length > options.maxVisitors) {
    lines.push('');
    lines.push(`*(${sortedVisitors.length - options.maxVisitors} more visitors not shown)*`);
  }

  return lines.join('\n');
}

/**
 * Compare visit times for sorting (returns positive if a is more recent).
 */
function compareVisitTime(a: TimeAnchor, b: TimeAnchor): number {
  if (a.type === 'UNKNOWN' && b.type !== 'UNKNOWN') return -1;
  if (b.type === 'UNKNOWN' && a.type !== 'UNKNOWN') return 1;
  if (a.type === 'UNKNOWN' && b.type === 'UNKNOWN') return 0;

  if (a.type === 'DISCOURSE' && b.type === 'DISCOURSE') {
    const chapterDiff = (a.chapter ?? 0) - (b.chapter ?? 0);
    if (chapterDiff !== 0) return chapterDiff;

    const paraDiff = (a.paragraph ?? 0) - (b.paragraph ?? 0);
    if (paraDiff !== 0) return paraDiff;

    return (a.sentence ?? 0) - (b.sentence ?? 0);
  }

  return 0;
}

/**
 * Format time anchor for short display.
 */
function formatTimeAnchorShort(time: TimeAnchor): string {
  if (time.type === 'DISCOURSE') {
    const parts: string[] = [];
    if (time.chapter !== undefined) parts.push(`Ch.${time.chapter}`);
    if (time.paragraph !== undefined) parts.push(`¶${time.paragraph}`);
    return parts.length > 0 ? parts.join(' ') : 'unknown';
  }
  if (time.type === 'ABSOLUTE') {
    return time.date;
  }
  return 'unknown';
}

/**
 * Located Items section - items that are at this location (via located_in facts).
 */
function renderPlaceLocatedItems(
  facts: FactViewRow[],
  placeId: EntityId,
  ir: ProjectIR,
  options: Required<PlacePageOptions>
): string {
  // Find located_in facts where this place is the object
  const locatedFacts = facts.filter(
    (f) =>
      f.predicate === 'located_in' &&
      f.object === placeId &&
      typeof f.subject === 'string' &&
      !f.validUntil  // Only current locations
  );

  if (locatedFacts.length === 0) {
    return '';  // Don't show section if no located items
  }

  const lines: string[] = [];
  lines.push('## Located items');
  lines.push('');

  // Get unique items sorted alphabetically
  const itemIds = new Set<string>();
  for (const f of locatedFacts) {
    // Check if the subject is an ITEM
    const entity = ir.entities.find((e) => e.id === f.subject);
    if (entity && (entity.type === 'ITEM' || entity.type === 'WEAPON' || entity.type === 'DOCUMENT')) {
      itemIds.add(f.subject);
    }
  }

  const sortedItems = Array.from(itemIds).sort((a, b) =>
    getEntityName(ir, a).localeCompare(getEntityName(ir, b))
  );

  // Limit display
  const displayItems = sortedItems.slice(0, options.maxItems);

  for (const itemId of displayItems) {
    const itemLink = getEntityNameLinked(ir, itemId, true);
    lines.push(`- ${itemLink}`);
  }

  if (sortedItems.length > options.maxItems) {
    lines.push('');
    lines.push(`*(${sortedItems.length - options.maxItems} more items not shown)*`);
  }

  return lines.join('\n');
}

/**
 * Place Debug Section
 */
function renderPlaceDebugSection(
  entity: Entity,
  ir: ProjectIR,
  placeId: EntityId
): string {
  const lines: string[] = [];
  lines.push('## Debug');
  lines.push('');

  lines.push('### Place metadata');
  lines.push('');
  lines.push(`- **ID:** \`${entity.id}\``);
  lines.push(`- **Type:** ${entity.type}`);
  lines.push(`- **Confidence:** ${(entity.confidence.composite * 100).toFixed(1)}%`);

  // Count residents
  const residentsCount = ir.assertions.filter(
    (a) => a.predicate === 'lives_in' && a.object === placeId
  ).length;

  // Count visitors
  const visitorsCount = ir.events.filter(
    (e) =>
      e.type === 'MOVE' &&
      e.participants.some((p) => p.role === 'DESTINATION' && p.entity === placeId)
  ).length;

  lines.push('');
  lines.push('### Counts');
  lines.push('');
  lines.push(`- Residents: ${residentsCount}`);
  lines.push(`- Move events to here: ${visitorsCount}`);

  return lines.join('\n');
}

// =============================================================================
// SECTION RENDERERS
// =============================================================================

/**
 * 3.1 Title Block
 */
function renderTitleBlock(entity: Entity): string {
  const lines: string[] = [];

  // Title with badge
  const displayName = entity.canonical || entity.id;
  const badge = getTypeBadge(entity.type, entity.confidence.composite);
  const titleBadge = badge ? ` ${badge}` : '';
  lines.push(`# ${displayName}${titleBadge}`);
  lines.push('');

  // Type with badge
  const typeBadge = badge ? `${badge} ` : '';
  lines.push(`**Type:** ${typeBadge}${entity.type}`);

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
    const placeName = getEntityNameLinked(ir, currentLoc, true);
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
      const placeName = getEntityNameLinked(ir, loc.place, true);
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
 * 3.2c Possessions (from TRANSFER events → possesses facts)
 *
 * Shows current possessions first, then recently lost items.
 * Deterministic ordering: current first, then by validFrom desc, then by item name.
 */
function renderPossessions(
  facts: FactViewRow[],
  entityId: EntityId,
  ir: ProjectIR
): string {
  // Get all possession facts where this entity is the subject
  const possessionFacts = facts.filter(
    (f) =>
      f.subject === entityId &&
      f.predicate === 'possesses' &&
      typeof f.object === 'string'
  );

  if (possessionFacts.length === 0) {
    return '';  // Don't show section if no possession facts
  }

  const lines: string[] = [];
  lines.push('## Possessions');
  lines.push('');

  // Separate current and ended possessions
  const currentItems = getCurrentPossessions(facts, entityId);
  const currentFacts = possessionFacts.filter(
    (f) => !f.validUntil && currentItems.includes(f.object as string)
  );
  const endedFacts = possessionFacts.filter(
    (f) => f.validUntil !== undefined
  );

  // Sort current by validFrom desc (most recent first), then by item name
  const sortedCurrent = [...currentFacts].sort((a, b) => {
    const timeDiff = compareDiscourseTime(b.validFrom, a.validFrom);  // Desc
    if (timeDiff !== 0) return timeDiff;
    return getEntityName(ir, a.object as string).localeCompare(
      getEntityName(ir, b.object as string)
    );
  });

  // Sort ended by validUntil desc (most recently lost first)
  const sortedEnded = [...endedFacts].sort((a, b) => {
    const aTime = a.validUntil ?? { type: 'UNKNOWN' as const };
    const bTime = b.validUntil ?? { type: 'UNKNOWN' as const };
    const timeDiff = compareDiscourseTime(bTime, aTime);  // Desc
    if (timeDiff !== 0) return timeDiff;
    return getEntityName(ir, a.object as string).localeCompare(
      getEntityName(ir, b.object as string)
    );
  });

  // Render current possessions
  if (sortedCurrent.length > 0) {
    for (const fact of sortedCurrent) {
      const itemName = getEntityNameLinked(ir, fact.object as string, true);
      const timeStr = formatTimeAnchor(fact.validFrom);

      // Get evidence from derivedFrom
      let evidenceSnippet = '';
      if (fact.derivedFrom.length > 0) {
        const sourceEvent = ir.events.find((e) => e.id === fact.derivedFrom[0]);
        if (sourceEvent && sourceEvent.evidence.length > 0) {
          evidenceSnippet = ` — *"${formatEvidence(sourceEvent.evidence[0])}"*`;
        }
      }

      lines.push(`- **${itemName}** — since ${timeStr}${evidenceSnippet}`);
    }
  }

  // Render recently lost items (if any)
  if (sortedEnded.length > 0) {
    lines.push('');
    lines.push('**No longer has:**');
    lines.push('');

    const maxEnded = 5;  // Limit ended items shown
    for (let i = 0; i < Math.min(sortedEnded.length, maxEnded); i++) {
      const fact = sortedEnded[i];
      const itemName = getEntityNameLinked(ir, fact.object as string, true);
      const untilStr = fact.validUntil
        ? formatTimeAnchor(fact.validUntil)
        : 'unknown';

      // Check if this was inferred
      const inferredTag = (fact as any).inference === 'implied_loss' ? ' *(inferred)*' : '';

      lines.push(`- ${itemName} — until ${untilStr}${inferredTag}`);
    }

    if (sortedEnded.length > maxEnded) {
      lines.push(`  *(${sortedEnded.length - maxEnded} more not shown)*`);
    }
  }

  return lines.join('\n');
}

/**
 * 3.25 Relationships section (from relation facts)
 * Shows all relation facts where this entity is subject or object.
 */
function renderRelationships(
  facts: FactViewRow[],
  entityId: EntityId,
  ir: ProjectIR
): string {
  // Get all relation facts involving this entity
  const relationFacts = facts.filter(
    (f) =>
      ALL_RELATION_PREDICATES.has(f.predicate) &&
      (f.subject === entityId || f.object === entityId)
  );

  if (relationFacts.length === 0) {
    return '';  // Don't show section if no relation facts
  }

  const lines: string[] = [];
  lines.push('## Relationships');
  lines.push('');

  // Group facts by predicate
  const byPredicate = new Map<string, FactViewRow[]>();
  for (const fact of relationFacts) {
    const pred = fact.predicate;
    if (!byPredicate.has(pred)) {
      byPredicate.set(pred, []);
    }
    byPredicate.get(pred)!.push(fact);
  }

  // Sort predicates by display order
  const sortedPredicates = RELATION_DISPLAY_ORDER.filter((p) => byPredicate.has(p));
  // Add any predicates not in the display order (sorted alphabetically)
  const remainingPredicates = Array.from(byPredicate.keys())
    .filter((p) => !RELATION_DISPLAY_ORDER.includes(p))
    .sort();
  sortedPredicates.push(...remainingPredicates);

  // Render each predicate group
  for (const pred of sortedPredicates) {
    const predFacts = byPredicate.get(pred)!;
    const label = RELATION_LABELS[pred] || formatPredicateLabel(pred);

    // Get unique related entities (either subject or object, whichever is not this entity)
    const relatedEntities = new Set<string>();
    for (const fact of predFacts) {
      const related = fact.subject === entityId
        ? (typeof fact.object === 'string' ? fact.object : null)
        : fact.subject;
      if (related) {
        relatedEntities.add(related);
      }
    }

    // Skip if no valid related entities
    if (relatedEntities.size === 0) continue;

    // Sort related entities alphabetically by name
    const sortedRelated = Array.from(relatedEntities).sort((a, b) =>
      getEntityName(ir, a).localeCompare(getEntityName(ir, b))
    );

    // Render as a single line if only one related entity
    if (sortedRelated.length === 1) {
      const linkedName = getEntityNameLinked(ir, sortedRelated[0], true);
      lines.push(`- **${label}:** ${linkedName}`);
    } else {
      // Render as a list for multiple entities
      lines.push(`- **${label}:**`);
      for (const relatedId of sortedRelated) {
        const linkedName = getEntityNameLinked(ir, relatedId, true);
        lines.push(`  - ${linkedName}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format a predicate as a human-readable label.
 */
function formatPredicateLabel(predicate: string): string {
  return predicate
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
      const placeName = getEntityNameLinked(ir, fact.object as string, true);
      const timeStr = formatTimeAnchor(fact.validFrom);

      // Get evidence from derivedFrom
      let evidenceSnippet = '';
      if (fact.derivedFrom.length > 0) {
        const sourceEvent = ir.events.find((e) => e.id === fact.derivedFrom[0]);
        if (sourceEvent && sourceEvent.evidence.length > 0) {
          evidenceSnippet = ` — *"${formatEvidence(sourceEvent.evidence[0])}"*`;
        }
      }

      lines.push(`- ${timeStr}: ${placeName}${evidenceSnippet}`);
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
          const killerName = getEntityNameLinked(ir, killer.entity, true);
          lines.push(`- Killed by: ${killerName}`);
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
 * 3.5b Mentioned In Section (A4)
 *
 * Shows where this entity is referenced across ALL events and assertions
 * in the project, grouped by event type.
 *
 * This differs from Timeline Highlights which only shows events where
 * the entity is a direct participant. "Mentioned In" captures indirect
 * references, dialogue mentions, and broader context.
 *
 * @param ir - The ProjectIR
 * @param entityId - The entity to check
 * @param options - Rendering options
 * @returns Markdown string or empty if no mentions
 */
function renderMentionedIn(
  ir: ProjectIR,
  entityId: EntityId,
  options: Required<EntityPageOptions>
): string {
  const MAX_EVIDENCE_CHARS = 80;

  // Find all events mentioning this entity (via evidence text or participants)
  const mentioningEvents = ir.events.filter((event) => {
    // Check if entity appears in participants
    const inParticipants = event.participants.some((p) => p.entity === entityId);

    // Check if entity name appears in evidence text
    const entity = ir.entities.find((e) => e.id === entityId);
    const entityNames = entity ? [entity.canonical, ...entity.aliases] : [entityId];

    const inEvidence = event.evidence.some((ev) => {
      if (!ev.text) return false;
      return entityNames.some((name) =>
        ev.text.toLowerCase().includes(name.toLowerCase())
      );
    });

    return inParticipants || inEvidence;
  });

  // Find all assertions mentioning this entity
  const mentioningAssertions = ir.assertions.filter((assertion) => {
    // Check if entity is subject or object
    if (assertion.subject === entityId || assertion.object === entityId) {
      return true;
    }

    // Check if entity name appears in evidence text
    const entity = ir.entities.find((e) => e.id === entityId);
    const entityNames = entity ? [entity.canonical, ...entity.aliases] : [entityId];

    return assertion.evidence.some((ev) => {
      if (!ev.text) return false;
      return entityNames.some((name) =>
        ev.text.toLowerCase().includes(name.toLowerCase())
      );
    });
  });

  // Combine and deduplicate by evidence location
  interface Mention {
    type: 'event' | 'assertion';
    eventType?: string;
    predicate?: string;
    evidence: EvidenceSpan;
    time?: TimeAnchor;
  }

  const mentions: Mention[] = [];
  const seenEvidence = new Set<string>();

  for (const event of mentioningEvents) {
    for (const ev of event.evidence) {
      const key = `${ev.docId}:${ev.charStart}:${ev.charEnd}`;
      if (!seenEvidence.has(key)) {
        seenEvidence.add(key);
        mentions.push({
          type: 'event',
          eventType: event.type,
          evidence: ev,
          time: event.time,
        });
      }
    }
  }

  for (const assertion of mentioningAssertions) {
    for (const ev of assertion.evidence) {
      const key = `${ev.docId}:${ev.charStart}:${ev.charEnd}`;
      if (!seenEvidence.has(key)) {
        seenEvidence.add(key);
        mentions.push({
          type: 'assertion',
          predicate: assertion.predicate,
          evidence: ev,
        });
      }
    }
  }

  if (mentions.length === 0) {
    return '';  // Don't show section if no mentions
  }

  const lines: string[] = [];
  lines.push('## Mentioned in');
  lines.push('');

  // Group by event type
  const byType = new Map<string, Mention[]>();
  for (const mention of mentions) {
    const typeKey = mention.type === 'event'
      ? mention.eventType ?? 'UNKNOWN'
      : `assertion:${mention.predicate ?? 'claim'}`;

    if (!byType.has(typeKey)) {
      byType.set(typeKey, []);
    }
    byType.get(typeKey)!.push(mention);
  }

  // Sort types alphabetically for determinism
  const sortedTypes = Array.from(byType.keys()).sort();

  // Limit total mentions shown
  const maxMentions = options.maxEvents;
  let shownCount = 0;

  for (const typeKey of sortedTypes) {
    if (shownCount >= maxMentions) break;

    const typeMentions = byType.get(typeKey)!;

    // Sort by evidence position
    typeMentions.sort((a, b) => {
      const aStart = a.evidence.charStart ?? 0;
      const bStart = b.evidence.charStart ?? 0;
      return aStart - bStart;
    });

    // Format type label
    const typeLabel = typeKey.startsWith('assertion:')
      ? typeKey.replace('assertion:', '').replace(/_/g, ' ')
      : typeKey;

    lines.push(`### ${typeLabel}`);
    lines.push('');

    for (const mention of typeMentions) {
      if (shownCount >= maxMentions) break;

      // Truncate evidence to 80 chars
      let snippet = mention.evidence.text ?? '';
      if (snippet.length > MAX_EVIDENCE_CHARS) {
        snippet = snippet.slice(0, MAX_EVIDENCE_CHARS - 3) + '...';
      }
      snippet = snippet.replace(/\n/g, ' ').replace(/\r/g, '');

      const docRef = mention.evidence.paragraphIndex !== undefined
        ? `[¶${mention.evidence.paragraphIndex}]`
        : '';

      lines.push(`- ${docRef} *"${snippet}"*`);
      shownCount++;
    }

    lines.push('');
  }

  if (mentions.length > maxMentions) {
    lines.push(`*(${mentions.length - maxMentions} more mentions not shown)*`);
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
    case 'TRANSFER': {
      const giver = event.participants.find((p) => p.role === 'GIVER');
      const receiver = event.participants.find((p) => p.role === 'RECEIVER');
      const taker = event.participants.find((p) => p.role === 'TAKER');
      const item = event.participants.find((p) => p.role === 'ITEM');
      const itemName = item ? getEntityName(ir, item.entity) : 'something';

      if (giver && receiver) {
        return `${getEntityName(ir, giver.entity)} gave ${itemName} to ${getEntityName(ir, receiver.entity)}`;
      }
      if (taker && item) {
        return `${getEntityName(ir, taker.entity)} took ${itemName}`;
      }
      if (receiver && item) {
        return `${getEntityName(ir, receiver.entity)} received ${itemName}`;
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
