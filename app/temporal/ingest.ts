/**
 * Temporal Ingest - Sprint R8
 * Extract and normalize temporal information from text
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  TemporalEvent,
  TemporalEdge,
  TemporalGraph,
  TimeExpression,
  TimePrecision,
} from './schema';

/**
 * S5: Temporal prepositions to trim from date expressions
 */
const TEMPORAL_PREPOSITIONS = new Set([
  'on', 'in', 'at', 'from', 'by', 'during', 'near', 'around', 'circa',
]);

/**
 * S5: Enhanced fictional calendar systems
 */
interface FictionalCalendar {
  code: string;
  fullName: string;
  variants: string[];
}

const FICTIONAL_CALENDARS: FictionalCalendar[] = [
  { code: 'TA', fullName: 'Third Age', variants: ['T.A.', 'TA', 'T.A', 'Third Age'] },
  { code: 'SA', fullName: 'Second Age', variants: ['S.A.', 'SA', 'S.A', 'Second Age'] },
  { code: 'FA', fullName: 'First Age', variants: ['F.A.', 'FA', 'F.A', 'First Age'] },
  { code: 'FO', fullName: 'Fourth Age', variants: ['Fo.A.', 'FoA', 'Fourth Age'] },
];

/**
 * Regex patterns for time expressions
 */
const TIME_PATTERNS = [
  // ISO dates: 2024-03-21, 2024-03, 2024
  { pattern: /\b(\d{4})-(\d{2})-(\d{2})\b/g, precision: 'day' as TimePrecision },
  { pattern: /\b(\d{4})-(\d{2})\b/g, precision: 'month' as TimePrecision },
  { pattern: /\b(\d{4})\b/g, precision: 'year' as TimePrecision },

  // Month Day, Year: March 21, 1999 (with optional preposition)
  {
    pattern: /(?:(?:on|in|at|during|by)\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi,
    precision: 'day' as TimePrecision,
  },

  // Month Year: March 1999 (with optional preposition)
  {
    pattern: /(?:(?:on|in|at|during|by)\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi,
    precision: 'month' as TimePrecision,
  },

  // Fictional calendars: "3019 T.A.", "in 3019 TA", "3019 Third Age"
  { pattern: /(?:(?:on|in|at|during|by)\s+)?(\d{1,4})\s+(T\.?A\.?|S\.?A\.?|F\.?A\.?|Fo\.?A\.?|Third\s+Age|Second\s+Age|First\s+Age|Fourth\s+Age)\b/gi, precision: 'year' as TimePrecision },

  // Year with preposition: "in 1999", "during 1999"
  { pattern: /(?:on|in|at|during|by)\s+(\d{4})\b/gi, precision: 'approximate' as TimePrecision },
];

/**
 * S5: Trim temporal prepositions from time expression
 */
function trimTemporalPrepositions(text: string): { trimmed: string; offset: number } {
  const words = text.trim().split(/\s+/);
  let offset = 0;

  // Remove leading prepositions
  while (words.length > 0 && TEMPORAL_PREPOSITIONS.has(words[0].toLowerCase())) {
    const removed = words.shift()!;
    offset += removed.length + 1; // +1 for space
  }

  return {
    trimmed: words.join(' '),
    offset,
  };
}

/**
 * Extract time expressions from text
 */
export function extractTimeExpressions(text: string): TimeExpression[] {
  const expressions: TimeExpression[] = [];

  for (const { pattern, precision } of TIME_PATTERNS) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // S5: Trim prepositions from the matched text
      const { trimmed, offset } = trimTemporalPrepositions(match[0]);

      const normalized = normalizeTimeExpression(trimmed, precision);
      expressions.push({
        text: trimmed, // Store trimmed version
        normalized,
        precision,
        confidence: normalized ? 0.9 : 0.6,
        position: match.index + offset, // Adjust position to account for trimmed prefix
      });
    }
  }

  return expressions;
}

/**
 * Normalize time expression to ISO format
 */
function normalizeTimeExpression(text: string, precision: TimePrecision): string | null {
  try {
    // ISO dates
    if (precision === 'day') {
      const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    }

    if (precision === 'month') {
      const match = text.match(/(\d{4})-(\d{2})/);
      if (match) return `${match[1]}-${match[2]}-01`;
    }

    if (precision === 'year') {
      const match = text.match(/(\d{4})/);
      if (match) return `${match[1]}-01-01`;
    }

    // Month Day, Year
    const monthDayYear = text.match(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i
    );
    if (monthDayYear) {
      const monthNames: { [key: string]: string } = {
        january: '01',
        february: '02',
        march: '03',
        april: '04',
        may: '05',
        june: '06',
        july: '07',
        august: '08',
        september: '09',
        october: '10',
        november: '11',
        december: '12',
      };
      const month = monthNames[monthDayYear[1].toLowerCase()];
      const day = monthDayYear[2].padStart(2, '0');
      const year = monthDayYear[3];
      return `${year}-${month}-${day}`;
    }

    // Month Year
    const monthYear = text.match(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
    );
    if (monthYear) {
      const monthNames: { [key: string]: string } = {
        january: '01',
        february: '02',
        march: '03',
        april: '04',
        may: '05',
        june: '06',
        july: '07',
        august: '08',
        september: '09',
        october: '10',
        november: '11',
        december: '12',
      };
      const month = monthNames[monthYear[1].toLowerCase()];
      const year = monthYear[2];
      return `${year}-${month}-01`;
    }

    // S5: Enhanced fictional calendar normalization
    const fictionalMatch = text.match(/(\d{1,4})\s+(T\.?A\.?|S\.?A\.?|F\.?A\.?|Fo\.?A\.?|Third\s+Age|Second\s+Age|First\s+Age|Fourth\s+Age)/i);
    if (fictionalMatch) {
      const year = fictionalMatch[1];
      const calendarText = fictionalMatch[2];

      // Normalize calendar code
      let calendarCode = calendarText.toUpperCase().replace(/\./g, '').replace(/\s+AGE/i, '');

      // Map full names to codes
      if (calendarText.toLowerCase().includes('third')) calendarCode = 'TA';
      else if (calendarText.toLowerCase().includes('second')) calendarCode = 'SA';
      else if (calendarText.toLowerCase().includes('first')) calendarCode = 'FA';
      else if (calendarText.toLowerCase().includes('fourth')) calendarCode = 'FO';

      // Return with precision: year-CALENDAR format
      // e.g., "3019-TA", "1000-SA"
      return `${year}-${calendarCode}`;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Get temporal graph path for a project
 */
function getTemporalGraphPath(project: string): string {
  const projectDir = path.join(process.cwd(), 'data', 'projects', project);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  return path.join(projectDir, 'temporal.json');
}

/**
 * Load temporal graph for a project
 */
export function loadTemporalGraph(project: string): TemporalGraph {
  const temporalPath = getTemporalGraphPath(project);

  if (!fs.existsSync(temporalPath)) {
    const graph: TemporalGraph = {
      events: [],
      edges: [],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        eventCount: 0,
        edgeCount: 0,
      },
    };
    fs.writeFileSync(temporalPath, JSON.stringify(graph, null, 2));
    return graph;
  }

  const content = fs.readFileSync(temporalPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Save temporal graph for a project
 */
export function saveTemporalGraph(project: string, graph: TemporalGraph): void {
  const temporalPath = getTemporalGraphPath(project);
  graph.metadata.updatedAt = new Date().toISOString();
  graph.metadata.eventCount = graph.events.length;
  graph.metadata.edgeCount = graph.edges.length;
  fs.writeFileSync(temporalPath, JSON.stringify(graph, null, 2));
}

/**
 * Add temporal event from entity or note
 */
export function addTemporalEvent(
  project: string,
  entityId: string,
  eventType: string,
  text: string,
  extractedFrom: string
): TemporalEvent[] {
  const graph = loadTemporalGraph(project);
  const timeExpressions = extractTimeExpressions(text);
  const newEvents: TemporalEvent[] = [];

  for (const expr of timeExpressions) {
    if (!expr.normalized) continue;

    const event: TemporalEvent = {
      id: uuidv4(),
      entityId,
      eventType,
      isoStart: expr.normalized,
      isoEnd: undefined,
      precision: expr.precision,
      confidence: expr.confidence,
      extractedFrom,
    };

    graph.events.push(event);
    newEvents.push(event);
  }

  // Generate temporal edges (precedes relationships)
  generateTemporalEdges(graph);

  saveTemporalGraph(project, graph);
  return newEvents;
}

/**
 * Generate temporal edges based on chronological ordering
 */
function generateTemporalEdges(graph: TemporalGraph): void {
  // Clear existing edges
  graph.edges = [];

  // Sort events by start time
  const sortedEvents = [...graph.events].filter(e => e.isoStart).sort((a, b) => {
    return (a.isoStart || '').localeCompare(b.isoStart || '');
  });

  // Create precedes edges for consecutive events
  for (let i = 0; i < sortedEvents.length - 1; i++) {
    const from = sortedEvents[i];
    const to = sortedEvents[i + 1];

    // Only create edge if both events have valid timestamps
    if (from.isoStart && to.isoStart && from.isoStart < to.isoStart) {
      const edge: TemporalEdge = {
        id: uuidv4(),
        fromEventId: from.id,
        toEventId: to.id,
        relationType: 'precedes',
        confidence: Math.min(from.confidence, to.confidence),
      };

      graph.edges.push(edge);
    }
  }
}

/**
 * Get temporal events for a project
 */
export function getTemporalEvents(project: string, limit: number = 100): TemporalEvent[] {
  const graph = loadTemporalGraph(project);
  return graph.events.slice(0, limit);
}

/**
 * Get temporal edges for a project
 */
export function getTemporalEdges(project: string, limit: number = 100): TemporalEdge[] {
  const graph = loadTemporalGraph(project);
  return graph.edges.slice(0, limit);
}
