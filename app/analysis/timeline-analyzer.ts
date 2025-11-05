/**
 * Timeline Analyzer
 *
 * Extracts and organizes events into timelines from HERT data
 */

import type { HERTQuery, EntitySearchResult, RelationshipResult } from '../api/hert-query';
import type {
  Timeline,
  TimelineEvent,
  TimelineSet,
  TimelineType,
  TemporalAnchor,
  TemporalPrecision,
  TemporalRelation,
  TimelineExtractionOptions,
  TimelineAnalysisResult
} from './timeline-types';
import type { Relation } from '../engine/schema';
import { v4 as uuidv4 } from 'uuid';

/**
 * Timeline Analyzer
 */
export class TimelineAnalyzer {
  constructor(private queryAPI: HERTQuery) {}

  /**
   * Analyze and extract timelines from loaded data
   */
  analyze(options?: TimelineExtractionOptions): TimelineAnalysisResult {
    const opts: Required<TimelineExtractionOptions> = {
      minTemporalConfidence: options?.minTemporalConfidence ?? 0.5,
      minEventsPerTimeline: options?.minEventsPerTimeline ?? 2,
      maxTemporalGap: options?.maxTemporalGap ?? '1000 years',
      clusteringStrategy: options?.clusteringStrategy ?? 'hybrid',
      inferTemporalRelations: options?.inferTemporalRelations ?? true,
      detectBranches: options?.detectBranches ?? true,
      autoMergeDisconnected: options?.autoMergeDisconnected ?? true
    };

    // Step 1: Extract all events
    const events = this.extractEvents(opts);

    // Step 2: Build temporal relations
    const temporalRelations = this.buildTemporalRelations(events, opts);

    // Step 3: Cluster events into timelines
    const timelines = this.clusterEventsIntoTimelines(events, temporalRelations, opts);

    // Step 4: Classify timeline types
    const timelineSet = this.classifyTimelines(timelines, opts);

    // Step 5: Detect cross-timeline connections
    this.detectCrossTimelineConnections(timelineSet, events);

    // Step 6: Generate statistics
    const stats = this.generateStatistics(timelineSet);

    // Step 7: Generate warnings and suggestions
    const warnings = this.generateWarnings(timelineSet, events);
    const suggestions = this.generateSuggestions(timelineSet, events, opts);

    return {
      timelineSet,
      stats,
      warnings,
      suggestions
    };
  }

  /**
   * Extract timeline events from entities and relationships
   */
  private extractEvents(options: Required<TimelineExtractionOptions>): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    // Get all EVENT entities
    const eventEntities = this.queryAPI.findEntitiesByType('EVENT');

    for (const eventEntity of eventEntities) {
      const event = this.buildEventFromEntity(eventEntity);
      if (event) {
        events.push(event);
      }
    }

    // Extract events from temporal relationships
    const temporalRelations = this.queryAPI.findRelationshipsByPredicate('fought_in')
      .concat(this.queryAPI.findRelationshipsByPredicate('attended'))
      .concat(this.queryAPI.findRelationshipsByPredicate('traveled_to'))
      .concat(this.queryAPI.findRelationshipsByPredicate('born_in'))
      .concat(this.queryAPI.findRelationshipsByPredicate('dies_in'));

    for (const rel of temporalRelations) {
      const event = this.buildEventFromRelationship(rel);
      if (event) {
        // Check if we already have this event (avoid duplicates)
        if (!events.find(e => this.eventsAreSimilar(e, event))) {
          events.push(event);
        }
      }
    }

    return events;
  }

  /**
   * Build timeline event from EVENT entity
   */
  private buildEventFromEntity(entity: EntitySearchResult): TimelineEvent | null {
    // Get relationships to find participants, locations, dates
    const relationships = this.queryAPI.findRelationships(entity.eid);

    const participants = relationships
      .filter(r => r.subj_eid !== entity.eid)
      .map(r => ({
        eid: r.subj_eid,
        name: r.subj_canonical,
        type: 'PERSON' as const,
        role: this.inferRoleFromPredicate(r.pred)
      }));

    const location = relationships
      .filter(r => r.pred === 'fought_in' || r.pred === 'attended')
      .map(r => ({ eid: r.obj_eid, name: r.obj_canonical }))[0];

    // Try to extract temporal information
    const temporal = this.extractTemporalAnchor(entity, relationships);

    // Get source HERTs
    const mentions = this.queryAPI.findMentions(entity.eid);
    const sources = mentions.map(m => ({
      document_id: m.document_id,
      hert: m.hert_compact,
      paragraph: m.location.paragraph,
      confidence: 1.0
    }));

    return {
      id: uuidv4(),
      eventEID: entity.eid,
      eventName: entity.canonical,
      temporal,
      description: `Event: ${entity.canonical}`,
      participants,
      location,
      sources,
      relations: [],
      metadata: {
        significance: mentions.length > 5 ? 'major' : 'minor'
      }
    };
  }

  /**
   * Build timeline event from relationship
   */
  private buildEventFromRelationship(rel: RelationshipResult): TimelineEvent | null {
    // Extract temporal information from qualifiers
    // Note: RelationshipResult doesn't have qualifiers field yet
    const temporal = this.extractTemporalFromQualifiers();

    const description = `${rel.subj_canonical} ${rel.pred.replace(/_/g, ' ')} ${rel.obj_canonical}`;

    const participants = [
      {
        eid: rel.subj_eid,
        name: rel.subj_canonical,
        type: 'PERSON' as const
      }
    ];

    const location = rel.pred === 'fought_in' || rel.pred === 'traveled_to'
      ? { eid: rel.obj_eid, name: rel.obj_canonical }
      : undefined;

    return {
      id: uuidv4(),
      temporal,
      description,
      participants,
      location,
      sources: [], // Note: RelationshipResult doesn't have evidence field yet
      relations: []
    };
  }

  /**
   * Extract temporal anchor from entity and relationships
   */
  private extractTemporalAnchor(
    entity: EntitySearchResult,
    relationships: RelationshipResult[]
  ): TemporalAnchor {
    // Look for DATE entities in relationships
    const dateRels = relationships.filter(r => r.obj_canonical.match(/\d{4}|\d{1,2}\/\d{1,2}\/\d{4}/));

    if (dateRels.length > 0) {
      const dateStr = dateRels[0].obj_canonical;
      return {
        raw: dateStr,
        normalized: this.normalizeDate(dateStr),
        precision: this.inferPrecision(dateStr),
        confidence: 0.8
      };
    }

    // Check entity name for temporal indicators
    const temporalMatch = entity.canonical.match(/\d{4}|in \d+|during/i);
    if (temporalMatch) {
      return {
        raw: temporalMatch[0],
        precision: 'year',
        confidence: 0.6
      };
    }

    return {
      raw: 'unknown',
      precision: 'unknown',
      confidence: 0.0
    };
  }

  /**
   * Extract temporal information from relationship qualifiers
   */
  private extractTemporalFromQualifiers(qualifiers?: Array<{ type: string; value: string }>): TemporalAnchor {
    // Note: RelationshipResult doesn't have qualifiers field yet
    // For now, return unknown temporal anchor
    return { raw: 'unknown', precision: 'unknown', confidence: 0.0 };
  }

  /**
   * Build temporal relations between events
   */
  private buildTemporalRelations(
    events: TimelineEvent[],
    options: Required<TimelineExtractionOptions>
  ): TemporalRelation[] {
    const relations: TemporalRelation[] = [];

    // Sort events by temporal anchor
    const sortedEvents = events.filter(e => e.temporal.precision !== 'unknown')
      .sort((a, b) => this.compareTemporalAnchors(a.temporal, b.temporal));

    // Build sequential relations
    for (let i = 0; i < sortedEvents.length - 1; i++) {
      const currentEvent = sortedEvents[i];
      const nextEvent = sortedEvents[i + 1];

      relations.push({
        fromEventId: currentEvent.id,
        toEventId: nextEvent.id,
        relationType: 'before',
        confidence: Math.min(currentEvent.temporal.confidence, nextEvent.temporal.confidence),
        evidence: []
      });
    }

    // Infer additional relations if enabled
    if (options.inferTemporalRelations) {
      this.inferImplicitRelations(events, relations);
    }

    return relations;
  }

  /**
   * Cluster events into timelines
   */
  private clusterEventsIntoTimelines(
    events: TimelineEvent[],
    temporalRelations: TemporalRelation[],
    options: Required<TimelineExtractionOptions>
  ): Timeline[] {
    const timelines: Timeline[] = [];
    const assignedEvents = new Set<string>();

    // Strategy: Start with temporal chains, then cluster by participants/locations
    const chains = this.buildTemporalChains(events, temporalRelations);

    for (const chain of chains) {
      if (chain.length < options.minEventsPerTimeline) continue;

      const timeline = this.createTimelineFromChain(chain);
      timelines.push(timeline);
      chain.forEach(e => assignedEvents.add(e.id));
    }

    // Handle unassigned events
    const unassignedEvents = events.filter(e => !assignedEvents.has(e.id));
    if (unassignedEvents.length > 0) {
      // Cluster by participants
      const participantClusters = this.clusterByParticipants(unassignedEvents);
      for (const cluster of participantClusters) {
        if (cluster.length >= options.minEventsPerTimeline) {
          const timeline = this.createTimelineFromChain(cluster);
          timelines.push(timeline);
        }
      }
    }

    return timelines;
  }

  /**
   * Build temporal chains (sequences of events connected by temporal relations)
   */
  private buildTemporalChains(
    events: TimelineEvent[],
    temporalRelations: TemporalRelation[]
  ): TimelineEvent[][] {
    const chains: TimelineEvent[][] = [];
    const visited = new Set<string>();

    // Build adjacency map
    const graph = new Map<string, string[]>();
    for (const rel of temporalRelations) {
      if (!graph.has(rel.fromEventId)) {
        graph.set(rel.fromEventId, []);
      }
      graph.get(rel.fromEventId)!.push(rel.toEventId);
    }

    // Find all root events (no incoming edges)
    const roots = events.filter(e =>
      !temporalRelations.some(r => r.toEventId === e.id)
    );

    // DFS from each root
    for (const root of roots) {
      if (visited.has(root.id)) continue;
      const chain: TimelineEvent[] = [];
      this.dfsTemporalChain(root, events, graph, visited, chain);
      if (chain.length > 0) {
        chains.push(chain);
      }
    }

    return chains;
  }

  /**
   * DFS helper for building temporal chains
   */
  private dfsTemporalChain(
    event: TimelineEvent,
    allEvents: TimelineEvent[],
    graph: Map<string, string[]>,
    visited: Set<string>,
    chain: TimelineEvent[]
  ): void {
    visited.add(event.id);
    chain.push(event);

    const neighbors = graph.get(event.id) || [];
    for (const neighborId of neighbors) {
      if (!visited.has(neighborId)) {
        const neighbor = allEvents.find(e => e.id === neighborId);
        if (neighbor) {
          this.dfsTemporalChain(neighbor, allEvents, graph, visited, chain);
        }
      }
    }
  }

  /**
   * Create timeline from event chain
   */
  private createTimelineFromChain(events: TimelineEvent[]): Timeline {
    // Sort events by temporal anchor
    const sortedEvents = [...events].sort((a, b) =>
      this.compareTemporalAnchors(a.temporal, b.temporal)
    );

    // Extract participants and locations
    const participantMap = new Map<number, { name: string; type: any }>();
    const locationMap = new Map<number, string>();

    for (const event of sortedEvents) {
      for (const p of event.participants) {
        if (!participantMap.has(p.eid)) {
          participantMap.set(p.eid, { name: p.name, type: p.type });
        }
      }
      if (event.location) {
        if (!locationMap.has(event.location.eid)) {
          locationMap.set(event.location.eid, event.location.name);
        }
      }
    }

    const primaryParticipants = Array.from(participantMap.entries()).map(([eid, data]) => ({
      eid,
      name: data.name,
      type: data.type
    }));

    const primaryLocations = Array.from(locationMap.entries()).map(([eid, name]) => ({
      eid,
      name
    }));

    // Get source documents
    const sourceDocuments = [...new Set(
      sortedEvents.flatMap(e => e.sources.map(s => s.document_id))
    )];

    // Calculate temporal span
    const span = sortedEvents.length > 0 && sortedEvents[0].temporal.precision !== 'unknown'
      ? {
          start: sortedEvents[0].temporal,
          end: sortedEvents[sortedEvents.length - 1].temporal
        }
      : undefined;

    // Generate name
    const name = this.generateTimelineName(sortedEvents, primaryParticipants);

    return {
      id: uuidv4(),
      name,
      type: 'primary',
      events: sortedEvents,
      span,
      primaryParticipants,
      primaryLocations,
      coherence: this.calculateCoherence(sortedEvents),
      sourceDocuments
    };
  }

  /**
   * Cluster events by shared participants
   */
  private clusterByParticipants(events: TimelineEvent[]): TimelineEvent[][] {
    const clusters: TimelineEvent[][] = [];
    const assigned = new Set<string>();

    for (const event of events) {
      if (assigned.has(event.id)) continue;

      const cluster: TimelineEvent[] = [event];
      assigned.add(event.id);

      // Find events with shared participants
      for (const other of events) {
        if (assigned.has(other.id)) continue;

        const sharedParticipants = event.participants.filter(p1 =>
          other.participants.some(p2 => p2.eid === p1.eid)
        );

        if (sharedParticipants.length > 0) {
          cluster.push(other);
          assigned.add(other.id);
        }
      }

      if (cluster.length > 0) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * Classify timelines into types
   */
  private classifyTimelines(
    timelines: Timeline[],
    options: Required<TimelineExtractionOptions>
  ): TimelineSet {
    if (timelines.length === 0) {
      return {
        primary: this.createEmptyTimeline(),
        branches: [],
        alternates: [],
        disconnected: [],
        flashbacks: [],
        prophecies: [],
        connections: []
      };
    }

    // Sort by coherence and event count
    const sortedTimelines = [...timelines].sort((a, b) => {
      const scoreA = a.coherence * a.events.length;
      const scoreB = b.coherence * b.events.length;
      return scoreB - scoreA;
    });

    const primary = sortedTimelines[0];
    primary.type = 'primary';

    const branches: Timeline[] = [];
    const alternates: Timeline[] = [];
    const disconnected: Timeline[] = [];

    // Classify remaining timelines
    for (let i = 1; i < sortedTimelines.length; i++) {
      const timeline = sortedTimelines[i];

      // Check if it shares participants with primary
      const sharedParticipants = timeline.primaryParticipants.filter(p =>
        primary.primaryParticipants.some(pp => pp.eid === p.eid)
      );

      if (sharedParticipants.length > 0) {
        // Could be a branch if it has different outcomes
        timeline.type = 'branch';
        branches.push(timeline);
      } else {
        // Disconnected timeline
        timeline.type = 'disconnected';
        disconnected.push(timeline);
      }
    }

    return {
      primary,
      branches,
      alternates,
      disconnected,
      flashbacks: [],
      prophecies: [],
      connections: []
    };
  }

  /**
   * Detect connections between timelines
   */
  private detectCrossTimelineConnections(timelineSet: TimelineSet, allEvents: TimelineEvent[]): void {
    // Implementation for detecting cross-timeline connections
    // This would analyze shared participants, locations, or explicit references
    // between timelines to build connection relationships
  }

  /**
   * Generate timeline statistics
   */
  private generateStatistics(timelineSet: TimelineSet) {
    const allTimelines = [
      timelineSet.primary,
      ...timelineSet.branches,
      ...timelineSet.alternates,
      ...timelineSet.disconnected
    ];

    const totalEvents = allTimelines.reduce((sum, t) => sum + t.events.length, 0);

    // Count participant appearances
    const participantCounts = new Map<number, { name: string; count: number }>();
    const locationCounts = new Map<number, { name: string; count: number }>();

    for (const timeline of allTimelines) {
      for (const event of timeline.events) {
        for (const p of event.participants) {
          const current = participantCounts.get(p.eid) || { name: p.name, count: 0 };
          participantCounts.set(p.eid, { name: current.name, count: current.count + 1 });
        }
        if (event.location) {
          const current = locationCounts.get(event.location.eid) || { name: event.location.name, count: 0 };
          locationCounts.set(event.location.eid, { name: current.name, count: current.count + 1 });
        }
      }
    }

    const mostActiveParticipant = Array.from(participantCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)[0];

    const mostActiveLocation = Array.from(locationCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)[0];

    return {
      totalEvents,
      totalTimelines: allTimelines.length,
      averageEventsPerTimeline: totalEvents / allTimelines.length,
      temporalCoverage: 'various',
      mostActiveParticipant: mostActiveParticipant
        ? { eid: mostActiveParticipant[0], name: mostActiveParticipant[1].name, eventCount: mostActiveParticipant[1].count }
        : { eid: 0, name: 'none', eventCount: 0 },
      mostActiveLocation: mostActiveLocation
        ? { eid: mostActiveLocation[0], name: mostActiveLocation[1].name, eventCount: mostActiveLocation[1].count }
        : { eid: 0, name: 'none', eventCount: 0 }
    };
  }

  /**
   * Generate warnings about timeline issues
   */
  private generateWarnings(timelineSet: TimelineSet, events: TimelineEvent[]) {
    const warnings: Array<{ type: any; message: string; eventIds: string[] }> = [];

    // Check for temporal gaps
    // Check for conflicting dates
    // Check for orphan events
    // Check for low confidence events

    return warnings;
  }

  /**
   * Generate suggestions for improvement
   */
  private generateSuggestions(
    timelineSet: TimelineSet,
    events: TimelineEvent[],
    options: Required<TimelineExtractionOptions>
  ) {
    const suggestions: Array<{ type: any; message: string; confidence: number }> = [];

    // Suggest merging similar timelines
    // Suggest splitting complex timelines
    // Suggest adding connections

    return suggestions;
  }

  // Helper methods

  private eventsAreSimilar(e1: TimelineEvent, e2: TimelineEvent): boolean {
    // Check if events refer to the same occurrence
    return e1.eventEID === e2.eventEID || e1.description === e2.description;
  }

  private inferRoleFromPredicate(predicate: string): string {
    const roleMap: Record<string, string> = {
      fought_in: 'combatant',
      attended: 'attendee',
      leads: 'leader',
      rules: 'ruler'
    };
    return roleMap[predicate] || 'participant';
  }

  private normalizeDate(dateStr: string): string | undefined {
    // Simple normalization - could be enhanced
    const yearMatch = dateStr.match(/\d{4}/);
    return yearMatch ? `${yearMatch[0]}-01-01` : undefined;
  }

  private inferPrecision(dateStr: string): TemporalPrecision {
    if (dateStr.match(/\d{4}-\d{2}-\d{2}/)) return 'day';
    if (dateStr.match(/\w+ \d{4}/)) return 'month';
    if (dateStr.match(/\d{4}/)) return 'year';
    if (dateStr.match(/later|before|after/i)) return 'relative';
    return 'unknown';
  }

  private compareTemporalAnchors(a: TemporalAnchor, b: TemporalAnchor): number {
    // Simple comparison - could be enhanced
    if (a.normalized && b.normalized) {
      return a.normalized.localeCompare(b.normalized);
    }
    return 0;
  }

  private inferImplicitRelations(events: TimelineEvent[], relations: TemporalRelation[]): void {
    // Could infer relations based on shared participants, locations, causal language, etc.
  }

  private calculateCoherence(events: TimelineEvent[]): number {
    // Calculate how well events form a coherent narrative
    // Based on temporal continuity, participant overlap, location consistency
    if (events.length === 0) return 0;

    let score = 0;
    const factors = [];

    // Temporal continuity
    const withTemporal = events.filter(e => e.temporal.precision !== 'unknown').length;
    factors.push(withTemporal / events.length);

    // Participant overlap
    let overlapCount = 0;
    for (let i = 0; i < events.length - 1; i++) {
      const shared = events[i].participants.filter(p1 =>
        events[i + 1].participants.some(p2 => p2.eid === p1.eid)
      );
      if (shared.length > 0) overlapCount++;
    }
    factors.push(events.length > 1 ? overlapCount / (events.length - 1) : 0);

    return factors.reduce((sum, f) => sum + f, 0) / factors.length;
  }

  private generateTimelineName(events: TimelineEvent[], participants: Array<{ name: string }>): string {
    if (participants.length > 0) {
      return `Timeline: ${participants[0].name}`;
    }
    if (events.length > 0 && events[0].eventName) {
      return `Timeline: ${events[0].eventName}`;
    }
    return `Timeline (${events.length} events)`;
  }

  private createEmptyTimeline(): Timeline {
    return {
      id: uuidv4(),
      name: 'Empty Timeline',
      type: 'primary',
      events: [],
      primaryParticipants: [],
      primaryLocations: [],
      coherence: 0,
      sourceDocuments: []
    };
  }
}
