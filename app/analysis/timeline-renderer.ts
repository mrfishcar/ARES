/**
 * Timeline Renderer
 *
 * Visualizes timelines in various formats
 */

import type {
  Timeline,
  TimelineSet,
  TimelineEvent,
  TimelineAnalysisResult
} from './timeline-types';

/**
 * Render timeline set to markdown
 */
export function renderTimelineSetToMarkdown(result: TimelineAnalysisResult): string {
  let output = '';

  output += '# Timeline Analysis\n\n';

  // Statistics
  output += '## Overview\n\n';
  output += `- **Total Events:** ${result.stats.totalEvents}\n`;
  output += `- **Total Timelines:** ${result.stats.totalTimelines}\n`;
  output += `- **Average Events per Timeline:** ${result.stats.averageEventsPerTimeline.toFixed(1)}\n`;
  if (result.stats.mostActiveParticipant.name !== 'none') {
    output += `- **Most Active Participant:** ${result.stats.mostActiveParticipant.name} (${result.stats.mostActiveParticipant.eventCount} events)\n`;
  }
  if (result.stats.mostActiveLocation.name !== 'none') {
    output += `- **Most Active Location:** ${result.stats.mostActiveLocation.name} (${result.stats.mostActiveLocation.eventCount} events)\n`;
  }
  output += '\n';

  // Primary Timeline
  if (result.timelineSet.primary.events.length > 0) {
    output += '## Primary Timeline\n\n';
    output += renderTimeline(result.timelineSet.primary);
    output += '\n';
  }

  // Branch Timelines
  if (result.timelineSet.branches.length > 0) {
    output += '## Branch Timelines\n\n';
    for (const branch of result.timelineSet.branches) {
      output += `### ${branch.name}\n\n`;
      output += renderTimeline(branch);
      output += '\n';
    }
  }

  // Alternate Timelines
  if (result.timelineSet.alternates.length > 0) {
    output += '## Alternate Timelines\n\n';
    for (const alt of result.timelineSet.alternates) {
      output += `### ${alt.name}\n\n`;
      output += renderTimeline(alt);
      output += '\n';
    }
  }

  // Disconnected Timelines
  if (result.timelineSet.disconnected.length > 0) {
    output += '## Disconnected Timelines\n\n';
    output += `*These timelines have no detected connections to the primary timeline.*\n\n`;
    for (const disc of result.timelineSet.disconnected) {
      output += `### ${disc.name}\n\n`;
      output += renderTimeline(disc);
      output += '\n';
    }
  }

  // Warnings
  if (result.warnings.length > 0) {
    output += '## Warnings\n\n';
    for (const warning of result.warnings) {
      output += `- **${warning.type}:** ${warning.message}\n`;
    }
    output += '\n';
  }

  // Suggestions
  if (result.suggestions.length > 0) {
    output += '## Suggestions\n\n';
    for (const suggestion of result.suggestions) {
      output += `- **${suggestion.type}** (confidence: ${(suggestion.confidence * 100).toFixed(0)}%): ${suggestion.message}\n`;
    }
    output += '\n';
  }

  return output;
}

/**
 * Render single timeline
 */
function renderTimeline(timeline: Timeline): string {
  let output = '';

  // Metadata
  output += `**Type:** ${timeline.type}  \n`;
  output += `**Coherence:** ${(timeline.coherence * 100).toFixed(0)}%  \n`;
  output += `**Events:** ${timeline.events.length}  \n`;

  if (timeline.span) {
    output += `**Temporal Span:** ${timeline.span.start.raw} → ${timeline.span.end.raw}  \n`;
  }

  if (timeline.primaryParticipants.length > 0) {
    output += `**Key Participants:** ${timeline.primaryParticipants.map(p => p.name).join(', ')}  \n`;
  }

  if (timeline.primaryLocations.length > 0) {
    output += `**Key Locations:** ${timeline.primaryLocations.map(l => l.name).join(', ')}  \n`;
  }

  output += '\n';

  // Divergence info for branches
  if (timeline.divergence) {
    output += `*Diverges from timeline ${timeline.divergence.parentTimelineId} at ${timeline.divergence.divergencePoint.raw}*\n\n`;
  }

  // Events
  if (timeline.events.length > 0) {
    output += '### Events\n\n';

    for (let i = 0; i < timeline.events.length; i++) {
      const event = timeline.events[i];
      output += renderEvent(event, i + 1);
      output += '\n';
    }
  }

  return output;
}

/**
 * Render single event
 */
function renderEvent(event: TimelineEvent, index: number): string {
  let output = '';

  // Event header
  const temporal = event.temporal.precision !== 'unknown'
    ? `**[${event.temporal.raw}]**`
    : '**[Time Unknown]**';

  output += `${index}. ${temporal} `;

  if (event.eventName) {
    output += `**${event.eventName}**\n`;
  } else {
    output += `${event.description}\n`;
  }

  // Participants
  if (event.participants.length > 0) {
    const participantNames = event.participants.map(p => {
      return p.role ? `${p.name} (${p.role})` : p.name;
    }).join(', ');
    output += `   - *Participants:* ${participantNames}\n`;
  }

  // Location
  if (event.location) {
    output += `   - *Location:* ${event.location.name}\n`;
  }

  // Sources
  if (event.sources.length > 0) {
    output += `   - *Sources:* ${event.sources.length} reference(s)\n`;
  }

  // Relations
  if (event.relations.length > 0) {
    const relationStr = event.relations.map(r => r.type).join(', ');
    output += `   - *Relations:* ${relationStr}\n`;
  }

  return output;
}

/**
 * Render timeline as ASCII visualization
 */
export function renderTimelineASCII(timeline: Timeline): string {
  let output = '';

  output += `\n┌─ ${timeline.name} ─┐\n`;
  output += '│\n';

  for (const event of timeline.events) {
    const temporal = event.temporal.precision !== 'unknown'
      ? event.temporal.raw.padEnd(15)
      : 'Unknown'.padEnd(15);

    const desc = (event.eventName || event.description).substring(0, 50);

    output += `├─ ${temporal} │ ${desc}\n`;

    if (event.participants.length > 0) {
      const participants = event.participants.slice(0, 3).map(p => p.name).join(', ');
      output += `│  ${' '.repeat(15)} └─ ${participants}\n`;
    }
  }

  output += '└──────────────────────────────────────────────────────────────\n';

  return output;
}

/**
 * Render timeline comparison (multiple timelines side by side)
 */
export function renderTimelineComparison(timelines: Timeline[]): string {
  if (timelines.length === 0) return '';

  let output = '';

  output += '# Timeline Comparison\n\n';

  // Find max events for normalization
  const maxEvents = Math.max(...timelines.map(t => t.events.length));

  // Header
  output += '| Time | ';
  for (const timeline of timelines) {
    output += `${timeline.name.substring(0, 20).padEnd(20)} | `;
  }
  output += '\n';

  output += '|------|';
  for (let i = 0; i < timelines.length; i++) {
    output += '----------------------|';
  }
  output += '\n';

  // Events (row by row)
  for (let i = 0; i < maxEvents; i++) {
    // Get temporal marker from first timeline with event at this index
    let temporal = '';
    for (const timeline of timelines) {
      if (i < timeline.events.length && timeline.events[i].temporal.precision !== 'unknown') {
        temporal = timeline.events[i].temporal.raw;
        break;
      }
    }

    output += `| ${temporal.substring(0, 4).padEnd(4)} | `;

    // Each timeline's event at this index
    for (const timeline of timelines) {
      if (i < timeline.events.length) {
        const event = timeline.events[i];
        const desc = (event.eventName || event.description).substring(0, 18);
        output += `${desc.padEnd(20)} | `;
      } else {
        output += `${''.padEnd(20)} | `;
      }
    }

    output += '\n';
  }

  return output;
}

/**
 * Render timeline set as JSON
 */
export function renderTimelineSetToJSON(result: TimelineAnalysisResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Render timeline as Mermaid diagram
 */
export function renderTimelineAsMermaid(timeline: Timeline): string {
  let output = '```mermaid\n';
  output += 'graph TD\n';

  const eventNodes = new Map<string, string>();

  // Create nodes
  for (let i = 0; i < timeline.events.length; i++) {
    const event = timeline.events[i];
    const nodeId = `E${i}`;
    const label = (event.eventName || event.description).substring(0, 30);
    const temporal = event.temporal.precision !== 'unknown' ? `[${event.temporal.raw}]` : '';

    eventNodes.set(event.id, nodeId);
    output += `    ${nodeId}["${temporal} ${label}"]\n`;
  }

  // Create edges (sequential flow)
  for (let i = 0; i < timeline.events.length - 1; i++) {
    output += `    E${i} --> E${i + 1}\n`;
  }

  // Add relations
  for (const event of timeline.events) {
    const fromNode = eventNodes.get(event.id);
    if (!fromNode) continue;

    for (const rel of event.relations) {
      const toNode = eventNodes.get(rel.targetEventId);
      if (!toNode || toNode === fromNode) continue;

      const relLabel = rel.type.replace(/_/g, ' ');
      output += `    ${fromNode} -.${relLabel}..-> ${toNode}\n`;
    }
  }

  output += '```\n';

  return output;
}
