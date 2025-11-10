/**
 * Timeline/Biography composer for deterministic event sequencing
 */

import type { Entity, Relation, Predicate, Qualifier } from '../engine/schema';

export interface TimelineEvent {
  t: number;                 // sortable time key (year; Infinity for undated)
  label: string;             // short title
  sentence: string;          // full sentence for biography
  key: string;               // deterministic dedupe key
  predicate: Predicate;      // for suppression logic
  objectId: string;          // for suppression logic
}

/**
 * Predicate salience weights for timeline event prioritization
 */
const TIMELINE_WEIGHT: Record<Predicate, number> = {
  married_to: 1.0,
  rules: 0.95,
  leads: 0.9,
  fought_in: 0.85,
  traveled_to: 0.8,
  authored: 0.75,
  lives_in: 0.7,
  parent_of: 0.65,
  child_of: 0.65,
  born_in: 0.6,
  dies_in: 0.6,
  enemy_of: 0.5,
  friends_with: 0.45,
  ally_of: 0.4,
  member_of: 0.35,
  sibling_of: 0.3,
  studies_at: 0.25,
  teaches_at: 0.25,
  wields: 0.2,
  owns: 0.2,
  uses: 0.15,
  mentions: 0.1,
  alias_of: 0.05,
  part_of: 0.05,
  attended: 0.3,
  advised_by: 0.35,
  invested_in: 0.4,
  acquired: 0.6,
  spoke_to: 0.2,
  met: 0.25,
  mentored: 0.7,
  mentored_by: 0.7,
  guards: 0.65,
  seeks: 0.75,
  possesses: 0.55,
  defeated: 0.9,
  killed: 0.95,
  imprisoned_in: 0.8,
  freed_from: 0.85,
  summoned: 0.5,
  located_at: 0.4,
  located_beneath: 0.3,
  hidden_in: 0.6
};

/**
 * Extract year from qualifier value
 * Handles formats: "3019", "3019 TA", "Year 3019", etc.
 */
function extractYear(value: string): number | null {
  const yearMatch = value.match(/(\d{1,5})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    // Allow years 1-9999, negative for BCE if needed
    if (year >= 1 && year <= 9999) return year;
  }
  return null;
}

/**
 * Get earliest year from qualifiers
 */
function getYear(qualifiers?: Qualifier[]): number {
  if (!qualifiers || qualifiers.length === 0) return Infinity;

  const years = qualifiers
    .filter(q => q.type === 'time')
    .map(q => extractYear(q.value))
    .filter((y): y is number => y !== null);

  return years.length > 0 ? Math.min(...years) : Infinity;
}

/**
 * Build timeline events from relations
 */
export function buildTimeline(
  subjectId: string,
  entities: Entity[],
  relations: Relation[]
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const subjectRelations = relations.filter(r => r.subj === subjectId);

  for (const rel of subjectRelations) {
    const objEntity = entities.find(e => e.id === rel.obj);
    if (!objEntity) continue;

    const year = getYear(rel.qualifiers);
    const yearStr = year !== Infinity ? ` (${year})` : '';
    const subjName = entities.find(e => e.id === subjectId)?.canonical || 'Subject';

    let label = '';
    let sentence = '';

    switch (rel.pred) {
      case 'married_to':
        label = `Marriage to ${objEntity.canonical}${yearStr}`;
        sentence = year !== Infinity
          ? `${subjName} married ${objEntity.canonical} in ${year}.`
          : `${subjName} married ${objEntity.canonical}.`;
        break;

      case 'parent_of':
        if (year !== Infinity) {
          label = `Birth of ${objEntity.canonical} (${year})`;
          sentence = `${objEntity.canonical} was born in ${year}.`;
        } else {
          continue; // Skip parent_of without date
        }
        break;

      case 'child_of':
        if (year !== Infinity) {
          label = `Birth (${year})`;
          sentence = `${subjName} was born in ${year}.`;
        } else {
          continue; // Skip child_of without date
        }
        break;

      case 'traveled_to':
        label = `Traveled to ${objEntity.canonical}${yearStr}`;
        sentence = year !== Infinity
          ? `${subjName} traveled to ${objEntity.canonical} in ${year}.`
          : `${subjName} traveled to ${objEntity.canonical}.`;
        break;

      case 'fought_in':
        label = `Fought at ${objEntity.canonical}${yearStr}`;
        sentence = year !== Infinity
          ? `${subjName} fought in ${objEntity.canonical} in ${year}.`
          : `${subjName} fought in ${objEntity.canonical}.`;
        break;

      case 'lives_in':
        label = `Resided in ${objEntity.canonical}${yearStr}`;
        sentence = year !== Infinity
          ? `${subjName} lived in ${objEntity.canonical} in ${year}.`
          : `${subjName} lived in ${objEntity.canonical}.`;
        break;

      case 'rules':
        label = `Begins rule of ${objEntity.canonical}${yearStr}`;
        sentence = year !== Infinity
          ? `${subjName} began ruling ${objEntity.canonical} in ${year}.`
          : `${subjName} ruled ${objEntity.canonical}.`;
        break;

      case 'leads':
        label = `Leads ${objEntity.canonical}${yearStr}`;
        sentence = year !== Infinity
          ? `${subjName} led ${objEntity.canonical} in ${year}.`
          : `${subjName} led ${objEntity.canonical}.`;
        break;

      case 'authored':
        label = `Authored ${objEntity.canonical}${yearStr}`;
        sentence = year !== Infinity
          ? `${subjName} authored ${objEntity.canonical} in ${year}.`
          : `${subjName} authored ${objEntity.canonical}.`;
        break;

      default:
        continue; // Skip other predicates
    }

    // Deterministic dedupe key
    const key = `${rel.pred}::${rel.obj}::${year}`;

    events.push({
      t: year,
      label,
      sentence,
      key,
      predicate: rel.pred,
      objectId: rel.obj
    });
  }

  // Deduplicate by key
  const uniqueEvents = new Map<string, TimelineEvent>();
  for (const event of events) {
    if (!uniqueEvents.has(event.key)) {
      uniqueEvents.set(event.key, event);
    }
  }

  // Sort by time, then by predicate weight for tie-breaking
  const sorted = Array.from(uniqueEvents.values()).sort((a, b) => {
    if (a.t !== b.t) return a.t - b.t;
    const weightA = TIMELINE_WEIGHT[a.predicate] || 0;
    const weightB = TIMELINE_WEIGHT[b.predicate] || 0;
    return weightB - weightA; // Higher weight first
  });

  // Limit to 12 events, prioritizing by weight if needed
  if (sorted.length > 12) {
    const sortedByWeight = [...sorted].sort((a, b) => {
      const weightA = TIMELINE_WEIGHT[a.predicate] || 0;
      const weightB = TIMELINE_WEIGHT[b.predicate] || 0;
      return weightB - weightA;
    });
    return sortedByWeight.slice(0, 12).sort((a, b) => {
      if (a.t !== b.t) return a.t - b.t;
      const weightA = TIMELINE_WEIGHT[a.predicate] || 0;
      const weightB = TIMELINE_WEIGHT[b.predicate] || 0;
      return weightB - weightA;
    });
  }

  return sorted;
}

/**
 * Render biography paragraph from timeline events
 */
export function renderBiography(timeline: TimelineEvent[]): string {
  if (timeline.length === 0) return '';

  const datedEvents = timeline.filter(e => e.t !== Infinity);
  const undatedEvents = timeline.filter(e => e.t === Infinity);

  if (datedEvents.length >= 1) {
    // Use dated events (4-10 sentences)
    const toRender = datedEvents.slice(0, 10);
    return toRender.map(e => e.sentence).join(' ');
  } else if (undatedEvents.length > 0) {
    // Use undated events (up to 5 sentences)
    const toRender = undatedEvents.slice(0, 5);
    return toRender.map(e => e.sentence).join(' ');
  }

  return '';
}
