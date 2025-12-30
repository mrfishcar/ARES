/**
 * Timeline Builder Tests
 *
 * Tests for:
 * - B1: Nested TELL events (embedded narratives)
 * - B2: Discourse time interpolation
 * - B3: Explicit before/after links
 * - B4: Chapter boundary markers
 * - B5: Timeline filtering API
 */

import { describe, it, expect } from 'vitest';
import {
  extractEmbeddedNarratives,
  interpolateDiscourseTime,
  deriveTemporalLinks,
  addTemporalLinksToEvents,
  detectChapterBoundaries,
  getEventsForChapter,
  queryTimeline,
  getEntityTimeline,
  getEventsByType,
  getEventsInRange,
  sortByDiscourseTime,
  compareDiscourseTime,
  getParticipatingEntities,
  getEventTypes,
} from '../../app/engine/ir/timeline-builder';
import type {
  StoryEvent,
  TimeAnchor,
  Confidence,
  Attribution,
} from '../../app/engine/ir/types';

// =============================================================================
// TEST HELPERS
// =============================================================================

function makeConfidence(composite: number = 0.9): Confidence {
  return {
    extraction: composite,
    identity: composite,
    semantic: composite,
    temporal: composite,
    composite,
  };
}

function makeAttribution(): Attribution {
  return {
    source: 'NARRATOR',
    reliability: 0.9,
    isDialogue: false,
    isThought: false,
  };
}

function makeEvent(
  id: string,
  type: string,
  time: TimeAnchor,
  opts?: {
    participants?: { role: string; entity: string; isRequired: boolean }[];
    evidence?: { docId: string; charStart: number; charEnd: number; text: string; paragraphIndex?: number }[];
    location?: string;
    derivedFrom?: string[];
    produces?: string[];
    links?: { type: string; target: string; confidence: number }[];
  }
): StoryEvent {
  return {
    id,
    type,
    time,
    participants: opts?.participants ?? [],
    evidence: opts?.evidence?.map((e) => ({
      docId: e.docId,
      charStart: e.charStart,
      charEnd: e.charEnd,
      text: e.text,
      paragraphIndex: e.paragraphIndex,
    })) ?? [],
    attribution: makeAttribution(),
    modality: 'FACT',
    confidence: makeConfidence(),
    links: (opts?.links ?? []).map((l) => ({
      type: l.type as 'BEFORE' | 'AFTER' | 'SIMULTANEOUS',
      target: l.target,
      confidence: l.confidence,
    })),
    produces: opts?.produces ?? [],
    extractedFrom: 'pattern',
    derivedFrom: opts?.derivedFrom ?? [],
    createdAt: new Date().toISOString(),
    compiler_pass: 'test',
    location: opts?.location,
  };
}

// =============================================================================
// B1: NESTED TELL EVENTS (EMBEDDED NARRATIVES)
// =============================================================================

describe('B1: Nested TELL events', () => {
  it('should extract embedded narrative from TELL event', () => {
    const tellEvent = makeEvent('tell_1', 'TELL', { type: 'DISCOURSE', chapter: 1, paragraph: 5 }, {
      participants: [
        { role: 'SPEAKER', entity: 'entity_gandalf', isRequired: true },
        { role: 'ADDRESSEE', entity: 'entity_frodo', isRequired: true },
        { role: 'TOPIC', entity: 'entity_ring', isRequired: false },
      ],
      evidence: [{ docId: 'doc1', charStart: 100, charEnd: 500, text: 'Gandalf told Frodo about the ring...' }],
      produces: ['assertion_ring_history'],
    });

    const embeddedEvent = makeEvent('event_ring_forged', 'CREATE', { type: 'DISCOURSE', chapter: 0, paragraph: 0 }, {
      participants: [
        { role: 'AGENT', entity: 'entity_sauron', isRequired: true },
        { role: 'PATIENT', entity: 'entity_ring', isRequired: true },
      ],
      evidence: [{ docId: 'doc1', charStart: 150, charEnd: 250, text: 'The ring was forged in Mount Doom' }],
      derivedFrom: ['assertion_ring_history'],
    });

    const events = [tellEvent, embeddedEvent];
    const narratives = extractEmbeddedNarratives(events);

    expect(narratives.length).toBe(1);
    expect(narratives[0].tellEventId).toBe('tell_1');
    expect(narratives[0].narrator).toBe('entity_gandalf');
    expect(narratives[0].addressee).toBe('entity_frodo');
    expect(narratives[0].embeddedEventIds).toContain('event_ring_forged');
  });

  it('should classify flashback narratives', () => {
    const tellEvent = makeEvent('tell_1', 'TELL', { type: 'DISCOURSE', chapter: 5, paragraph: 10 }, {
      participants: [
        { role: 'SPEAKER', entity: 'entity_narrator', isRequired: true },
      ],
      evidence: [{ docId: 'doc1', charStart: 1000, charEnd: 2000, text: 'The old man remembered...' }],
      produces: ['assertion_memory'],
    });

    const flashbackEvent = makeEvent('event_past', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
      participants: [
        { role: 'MOVER', entity: 'entity_narrator', isRequired: true },
      ],
      evidence: [{ docId: 'doc1', charStart: 1100, charEnd: 1200, text: 'Long ago, he traveled...' }],
      derivedFrom: ['assertion_memory'],
    });

    const events = [tellEvent, flashbackEvent];
    const narratives = extractEmbeddedNarratives(events);

    expect(narratives.length).toBe(1);
    expect(narratives[0].temporalRelation).toBe('flashback');
  });

  it('should classify foreshadow narratives', () => {
    const tellEvent = makeEvent('tell_1', 'TELL', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
      participants: [
        { role: 'SPEAKER', entity: 'entity_prophet', isRequired: true },
      ],
      evidence: [{ docId: 'doc1', charStart: 100, charEnd: 500, text: 'The prophet spoke...' }],
      produces: ['assertion_prophecy'],
    });

    const futureEvent = makeEvent('event_future', 'DEATH', { type: 'DISCOURSE', chapter: 10, paragraph: 5 }, {
      participants: [
        { role: 'DECEDENT', entity: 'entity_king', isRequired: true },
      ],
      evidence: [{ docId: 'doc1', charStart: 150, charEnd: 250, text: 'The king shall fall...' }],
      derivedFrom: ['assertion_prophecy'],
    });

    const events = [tellEvent, futureEvent];
    const narratives = extractEmbeddedNarratives(events);

    expect(narratives.length).toBe(1);
    expect(narratives[0].temporalRelation).toBe('foreshadow');
  });

  it('should return empty array for events without TELL', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }),
      makeEvent('event_2', 'DEATH', { type: 'DISCOURSE', chapter: 2, paragraph: 1 }),
    ];

    const narratives = extractEmbeddedNarratives(events);
    expect(narratives.length).toBe(0);
  });

  it('should handle TELL event with only topic (no embedded events)', () => {
    const tellEvent = makeEvent('tell_1', 'TELL', { type: 'DISCOURSE', chapter: 1, paragraph: 5 }, {
      participants: [
        { role: 'SPEAKER', entity: 'entity_alice', isRequired: true },
        { role: 'TOPIC', entity: 'entity_bob', isRequired: false },
      ],
    });

    const narratives = extractEmbeddedNarratives([tellEvent]);

    expect(narratives.length).toBe(1);
    expect(narratives[0].embeddedEventIds).toEqual([]);
  });
});

// =============================================================================
// B2: DISCOURSE TIME INTERPOLATION
// =============================================================================

describe('B2: Discourse time interpolation', () => {
  it('should interpolate UNKNOWN time from previous event', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 5 }, {
        evidence: [{ docId: 'doc1', charStart: 100, charEnd: 200, text: 'First' }],
      }),
      makeEvent('event_2', 'MOVE', { type: 'UNKNOWN' }, {
        evidence: [{ docId: 'doc1', charStart: 300, charEnd: 400, text: 'Second' }],
      }),
    ];

    const interpolated = interpolateDiscourseTime(events);

    expect(interpolated[1].time.type).toBe('DISCOURSE');
    expect((interpolated[1].time as any).paragraph).toBeGreaterThan(5);
  });

  it('should interpolate UNKNOWN time from next event', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'UNKNOWN' }, {
        evidence: [{ docId: 'doc1', charStart: 100, charEnd: 200, text: 'First' }],
      }),
      makeEvent('event_2', 'MOVE', { type: 'DISCOURSE', chapter: 2, paragraph: 10 }, {
        evidence: [{ docId: 'doc1', charStart: 300, charEnd: 400, text: 'Second' }],
      }),
    ];

    const interpolated = interpolateDiscourseTime(events);

    expect(interpolated[0].time.type).toBe('DISCOURSE');
    expect((interpolated[0].time as any).paragraph).toBeLessThan(10);
  });

  it('should interpolate between two discourse times', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 2 }, {
        evidence: [{ docId: 'doc1', charStart: 100, charEnd: 200, text: 'First' }],
      }),
      makeEvent('event_2', 'MOVE', { type: 'UNKNOWN' }, {
        evidence: [{ docId: 'doc1', charStart: 250, charEnd: 350, text: 'Middle' }],
      }),
      makeEvent('event_3', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 10 }, {
        evidence: [{ docId: 'doc1', charStart: 400, charEnd: 500, text: 'Last' }],
      }),
    ];

    const interpolated = interpolateDiscourseTime(events);

    expect(interpolated[1].time.type).toBe('DISCOURSE');
    const midPara = (interpolated[1].time as any).paragraph;
    expect(midPara).toBeGreaterThanOrEqual(2);
    expect(midPara).toBeLessThanOrEqual(10);
  });

  it('should use evidence paragraph when available', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'UNKNOWN' }, {
        evidence: [{ docId: 'doc1', charStart: 100, charEnd: 200, text: 'Has para', paragraphIndex: 7 }],
      }),
    ];

    const interpolated = interpolateDiscourseTime(events);

    expect(interpolated[0].time.type).toBe('DISCOURSE');
    expect((interpolated[0].time as any).paragraph).toBe(7);
  });

  it('should propagate chapter from neighbors', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 3, paragraph: 1 }, {
        evidence: [{ docId: 'doc1', charStart: 100, charEnd: 200, text: 'First' }],
      }),
      makeEvent('event_2', 'MOVE', { type: 'UNKNOWN' }, {
        evidence: [{ docId: 'doc1', charStart: 250, charEnd: 350, text: 'Middle' }],
      }),
    ];

    const interpolated = interpolateDiscourseTime(events, { propagateChapter: true });

    expect((interpolated[1].time as any).chapter).toBe(3);
  });

  it('should not modify events with existing discourse time', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 5, sentence: 2 }, {
        evidence: [{ docId: 'doc1', charStart: 100, charEnd: 200, text: 'First' }],
      }),
    ];

    const interpolated = interpolateDiscourseTime(events);

    expect(interpolated[0].time).toEqual(events[0].time);
  });

  it('should handle multiple documents separately', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
        evidence: [{ docId: 'doc1', charStart: 100, charEnd: 200, text: 'Doc1 event' }],
      }),
      makeEvent('event_2', 'MOVE', { type: 'UNKNOWN' }, {
        evidence: [{ docId: 'doc2', charStart: 100, charEnd: 200, text: 'Doc2 event' }],
      }),
    ];

    const interpolated = interpolateDiscourseTime(events);

    // Event 2 should remain UNKNOWN since no neighbors in doc2
    expect(interpolated.find((e) => e.id === 'event_2')?.time.type).toBe('UNKNOWN');
  });
});

// =============================================================================
// B3: EXPLICIT BEFORE/AFTER LINKS
// =============================================================================

describe('B3: Explicit before/after links', () => {
  it('should derive BEFORE link between consecutive events', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }),
      makeEvent('event_2', 'DEATH', { type: 'DISCOURSE', chapter: 1, paragraph: 5 }),
    ];

    const links = deriveTemporalLinks(events);

    expect(links.some((l) => l.type === 'BEFORE' && l.target === 'event_2')).toBe(true);
    expect(links.some((l) => l.type === 'AFTER' && l.target === 'event_1')).toBe(true);
  });

  it('should derive SIMULTANEOUS link for same time', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 5 }),
      makeEvent('event_2', 'DEATH', { type: 'DISCOURSE', chapter: 1, paragraph: 5 }),
    ];

    const links = deriveTemporalLinks(events, { deriveSIMULTANEOUS: true });

    expect(links.some((l) => l.type === 'SIMULTANEOUS')).toBe(true);
  });

  it('should respect minConfidence option', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }),
      makeEvent('event_2', 'DEATH', { type: 'DISCOURSE', chapter: 1, paragraph: 5 }),
    ];

    // Set very high threshold
    const links = deriveTemporalLinks(events, { minConfidence: 0.99 });

    // Should have fewer links due to threshold
    expect(links.length).toBeLessThanOrEqual(2);
  });

  it('should add temporal links to events', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }),
      makeEvent('event_2', 'DEATH', { type: 'DISCOURSE', chapter: 1, paragraph: 5 }),
      makeEvent('event_3', 'TELL', { type: 'DISCOURSE', chapter: 2, paragraph: 1 }),
    ];

    const enhanced = addTemporalLinksToEvents(events);

    // Event 1 should have BEFORE link to event 2
    const event1 = enhanced.find((e) => e.id === 'event_1')!;
    expect(event1.links.some((l) => l.type === 'BEFORE' && l.target === 'event_2')).toBe(true);

    // Event 2 should have AFTER link to event 1 and BEFORE to event 3
    const event2 = enhanced.find((e) => e.id === 'event_2')!;
    expect(event2.links.some((l) => l.type === 'AFTER' && l.target === 'event_1')).toBe(true);
  });

  it('should not duplicate existing links', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
        links: [{ type: 'BEFORE', target: 'event_2', confidence: 0.8 }],
      }),
      makeEvent('event_2', 'DEATH', { type: 'DISCOURSE', chapter: 1, paragraph: 5 }),
    ];

    const enhanced = addTemporalLinksToEvents(events);

    const event1 = enhanced.find((e) => e.id === 'event_1')!;
    const beforeLinks = event1.links.filter((l) => l.type === 'BEFORE' && l.target === 'event_2');
    expect(beforeLinks.length).toBe(1); // Should not duplicate
  });

  it('should skip SIMULTANEOUS when disabled', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 5 }),
      makeEvent('event_2', 'DEATH', { type: 'DISCOURSE', chapter: 1, paragraph: 5 }),
    ];

    const links = deriveTemporalLinks(events, { deriveSIMULTANEOUS: false });

    expect(links.some((l) => l.type === 'SIMULTANEOUS')).toBe(false);
  });

  it('should handle UNKNOWN times with lower confidence', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }),
      makeEvent('event_2', 'DEATH', { type: 'UNKNOWN' }),
    ];

    const links = deriveTemporalLinks(events);

    // Links involving UNKNOWN should have reduced confidence
    const linksWithUnknown = links.filter(
      (l) => l.target === 'event_2' || l.target === 'event_1'
    );
    for (const link of linksWithUnknown) {
      expect(link.confidence).toBeLessThan(0.9);
    }
  });
});

// =============================================================================
// B4: CHAPTER BOUNDARY MARKERS
// =============================================================================

describe('B4: Chapter boundary markers', () => {
  it('should detect chapter boundaries', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
        evidence: [{ docId: 'doc1', charStart: 100, charEnd: 200, text: 'Ch1' }],
      }),
      makeEvent('event_2', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 10 }, {
        evidence: [{ docId: 'doc1', charStart: 500, charEnd: 600, text: 'Ch1 end' }],
      }),
      makeEvent('event_3', 'DEATH', { type: 'DISCOURSE', chapter: 2, paragraph: 1 }, {
        evidence: [{ docId: 'doc1', charStart: 1000, charEnd: 1100, text: 'Ch2 start' }],
      }),
    ];

    const boundaries = detectChapterBoundaries(events);

    expect(boundaries.length).toBe(2);
    expect(boundaries[0].chapter).toBe(1);
    expect(boundaries[1].chapter).toBe(2);
  });

  it('should track first event in each chapter', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 5 }, {
        evidence: [{ docId: 'doc1', charStart: 200, charEnd: 300, text: 'Later' }],
      }),
      makeEvent('event_2', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
        evidence: [{ docId: 'doc1', charStart: 100, charEnd: 200, text: 'First' }],
      }),
    ];

    const boundaries = detectChapterBoundaries(events);

    expect(boundaries.length).toBe(1);
    expect(boundaries[0].firstEventId).toBe('event_2'); // Sorted by paragraph
  });

  it('should track event count per chapter', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
        evidence: [{ docId: 'doc1', charStart: 100, charEnd: 200, text: 'E1' }],
      }),
      makeEvent('event_2', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 2 }, {
        evidence: [{ docId: 'doc1', charStart: 200, charEnd: 300, text: 'E2' }],
      }),
      makeEvent('event_3', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 3 }, {
        evidence: [{ docId: 'doc1', charStart: 300, charEnd: 400, text: 'E3' }],
      }),
      makeEvent('event_4', 'DEATH', { type: 'DISCOURSE', chapter: 2, paragraph: 1 }, {
        evidence: [{ docId: 'doc1', charStart: 1000, charEnd: 1100, text: 'E4' }],
      }),
    ];

    const boundaries = detectChapterBoundaries(events);

    expect(boundaries[0].eventCount).toBe(3);
    expect(boundaries[1].eventCount).toBe(1);
  });

  it('should handle multiple documents', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
        evidence: [{ docId: 'doc1', charStart: 100, charEnd: 200, text: 'Doc1' }],
      }),
      makeEvent('event_2', 'DEATH', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
        evidence: [{ docId: 'doc2', charStart: 100, charEnd: 200, text: 'Doc2' }],
      }),
    ];

    const boundaries = detectChapterBoundaries(events);

    expect(boundaries.length).toBe(2);
    expect(boundaries.some((b) => b.docId === 'doc1')).toBe(true);
    expect(boundaries.some((b) => b.docId === 'doc2')).toBe(true);
  });

  it('should get events for specific chapter', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
        evidence: [{ docId: 'doc1', charStart: 100, charEnd: 200, text: 'Ch1' }],
      }),
      makeEvent('event_2', 'DEATH', { type: 'DISCOURSE', chapter: 2, paragraph: 1 }, {
        evidence: [{ docId: 'doc1', charStart: 500, charEnd: 600, text: 'Ch2' }],
      }),
      makeEvent('event_3', 'TELL', { type: 'DISCOURSE', chapter: 1, paragraph: 5 }, {
        evidence: [{ docId: 'doc1', charStart: 300, charEnd: 400, text: 'Ch1 again' }],
      }),
    ];

    const chapter1Events = getEventsForChapter(events, 'doc1', 1);

    expect(chapter1Events.length).toBe(2);
    expect(chapter1Events.every((e) => (e.time as any).chapter === 1)).toBe(true);
  });

  it('should return empty for non-existent chapter', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
        evidence: [{ docId: 'doc1', charStart: 100, charEnd: 200, text: 'Ch1' }],
      }),
    ];

    const chapter99Events = getEventsForChapter(events, 'doc1', 99);
    expect(chapter99Events.length).toBe(0);
  });

  it('should track last event of previous chapter', () => {
    const events = [
      makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
        evidence: [{ docId: 'doc1', charStart: 100, charEnd: 200, text: 'Ch1' }],
      }),
      makeEvent('event_2', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 99 }, {
        evidence: [{ docId: 'doc1', charStart: 400, charEnd: 500, text: 'Ch1 last' }],
      }),
      makeEvent('event_3', 'DEATH', { type: 'DISCOURSE', chapter: 2, paragraph: 1 }, {
        evidence: [{ docId: 'doc1', charStart: 600, charEnd: 700, text: 'Ch2' }],
      }),
    ];

    const boundaries = detectChapterBoundaries(events);

    // Chapter 2 boundary should reference last event of chapter 1
    const ch2Boundary = boundaries.find((b) => b.chapter === 2);
    expect(ch2Boundary?.lastEventIdPrevious).toBe('event_2');
  });
});

// =============================================================================
// B5: TIMELINE FILTERING API
// =============================================================================

describe('B5: Timeline filtering API', () => {
  const testEvents: StoryEvent[] = [
    makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
      participants: [{ role: 'MOVER', entity: 'entity_alice', isRequired: true }],
      evidence: [{ docId: 'doc1', charStart: 100, charEnd: 200, text: 'Alice moved' }],
    }),
    makeEvent('event_2', 'DEATH', { type: 'DISCOURSE', chapter: 1, paragraph: 5 }, {
      participants: [{ role: 'DECEDENT', entity: 'entity_bob', isRequired: true }],
      evidence: [{ docId: 'doc1', charStart: 300, charEnd: 400, text: 'Bob died' }],
    }),
    makeEvent('event_3', 'TELL', { type: 'DISCOURSE', chapter: 2, paragraph: 1 }, {
      participants: [
        { role: 'SPEAKER', entity: 'entity_alice', isRequired: true },
        { role: 'ADDRESSEE', entity: 'entity_charlie', isRequired: true },
      ],
      evidence: [{ docId: 'doc2', charStart: 100, charEnd: 200, text: 'Alice spoke' }],
    }),
    makeEvent('event_4', 'MOVE', { type: 'DISCOURSE', chapter: 3, paragraph: 1 }, {
      participants: [{ role: 'MOVER', entity: 'entity_charlie', isRequired: true }],
      evidence: [{ docId: 'doc1', charStart: 500, charEnd: 600, text: 'Charlie moved' }],
    }),
  ];

  describe('queryTimeline', () => {
    it('should return all events without filter', () => {
      const result = queryTimeline(testEvents);

      expect(result.totalCount).toBe(4);
      expect(result.events.length).toBe(4);
    });

    it('should filter by entity', () => {
      const result = queryTimeline(testEvents, { entityId: 'entity_alice' });

      expect(result.totalCount).toBe(2);
      expect(result.events.every((e) =>
        e.participants.some((p) => p.entity === 'entity_alice')
      )).toBe(true);
    });

    it('should filter by multiple entities', () => {
      const result = queryTimeline(testEvents, {
        entityId: ['entity_alice', 'entity_bob'],
      });

      expect(result.totalCount).toBe(3);
    });

    it('should filter by event type', () => {
      const result = queryTimeline(testEvents, { eventType: 'MOVE' });

      expect(result.totalCount).toBe(2);
      expect(result.events.every((e) => e.type === 'MOVE')).toBe(true);
    });

    it('should filter by multiple event types', () => {
      const result = queryTimeline(testEvents, {
        eventType: ['MOVE', 'DEATH'],
      });

      expect(result.totalCount).toBe(3);
    });

    it('should filter by document', () => {
      const result = queryTimeline(testEvents, { docId: 'doc2' });

      expect(result.totalCount).toBe(1);
      expect(result.events[0].id).toBe('event_3');
    });

    it('should filter by time range (chapter)', () => {
      const result = queryTimeline(testEvents, {
        timeRange: { minChapter: 2, maxChapter: 2 },
      });

      expect(result.totalCount).toBe(1);
      expect(result.events[0].id).toBe('event_3');
    });

    it('should filter by time range (paragraph)', () => {
      const result = queryTimeline(testEvents, {
        timeRange: { minChapter: 1, maxChapter: 1, minParagraph: 3 },
      });

      expect(result.totalCount).toBe(1);
      expect(result.events[0].id).toBe('event_2');
    });

    it('should apply limit', () => {
      const result = queryTimeline(testEvents, { limit: 2 });

      expect(result.events.length).toBe(2);
      expect(result.totalCount).toBe(4);
    });

    it('should apply offset', () => {
      const result = queryTimeline(testEvents, { offset: 2 });

      expect(result.events.length).toBe(2);
      expect(result.totalCount).toBe(4);
    });

    it('should apply limit and offset together', () => {
      const result = queryTimeline(testEvents, { limit: 1, offset: 1 });

      expect(result.events.length).toBe(1);
      expect(result.totalCount).toBe(4);
    });

    it('should sort by discourse time', () => {
      const result = queryTimeline(testEvents);

      // Should be sorted by chapter, then paragraph
      expect(result.events[0].id).toBe('event_1');
      expect(result.events[1].id).toBe('event_2');
      expect(result.events[2].id).toBe('event_3');
      expect(result.events[3].id).toBe('event_4');
    });

    it('should include chapter boundaries in result', () => {
      const result = queryTimeline(testEvents);

      expect(result.chapterBoundaries.length).toBeGreaterThan(0);
    });

    it('should combine multiple filters', () => {
      const result = queryTimeline(testEvents, {
        entityId: 'entity_alice',
        eventType: 'MOVE',
      });

      expect(result.totalCount).toBe(1);
      expect(result.events[0].id).toBe('event_1');
    });
  });

  describe('getEntityTimeline', () => {
    it('should return events for entity', () => {
      const events = getEntityTimeline(testEvents, 'entity_alice');

      expect(events.length).toBe(2);
    });

    it('should return empty for non-participating entity', () => {
      const events = getEntityTimeline(testEvents, 'entity_nonexistent');

      expect(events.length).toBe(0);
    });
  });

  describe('getEventsByType', () => {
    it('should return events of type', () => {
      const events = getEventsByType(testEvents, 'MOVE');

      expect(events.length).toBe(2);
      expect(events.every((e) => e.type === 'MOVE')).toBe(true);
    });

    it('should support multiple types', () => {
      const events = getEventsByType(testEvents, ['MOVE', 'TELL']);

      expect(events.length).toBe(3);
    });
  });

  describe('getEventsInRange', () => {
    it('should return events in chapter range', () => {
      const events = getEventsInRange(testEvents, 1, 2);

      expect(events.length).toBe(3);
    });

    it('should return empty for out-of-range', () => {
      const events = getEventsInRange(testEvents, 99, 100);

      expect(events.length).toBe(0);
    });
  });

  describe('minConfidence filter', () => {
    it('should filter by confidence', () => {
      const lowConfEvent = makeEvent('low_conf', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 });
      lowConfEvent.confidence.composite = 0.3;

      const events = [...testEvents, lowConfEvent];
      const result = queryTimeline(events, { minConfidence: 0.5 });

      expect(result.events.find((e) => e.id === 'low_conf')).toBeUndefined();
    });
  });
});

// =============================================================================
// HELPER FUNCTION TESTS
// =============================================================================

describe('Helper functions', () => {
  describe('sortByDiscourseTime', () => {
    it('should sort events by discourse time', () => {
      const events = [
        makeEvent('e3', 'MOVE', { type: 'DISCOURSE', chapter: 2, paragraph: 1 }),
        makeEvent('e1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }),
        makeEvent('e2', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 5 }),
      ];

      const sorted = sortByDiscourseTime(events);

      expect(sorted[0].id).toBe('e1');
      expect(sorted[1].id).toBe('e2');
      expect(sorted[2].id).toBe('e3');
    });

    it('should sort UNKNOWN times last', () => {
      const events = [
        makeEvent('e2', 'MOVE', { type: 'UNKNOWN' }),
        makeEvent('e1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }),
      ];

      const sorted = sortByDiscourseTime(events);

      expect(sorted[0].id).toBe('e1');
      expect(sorted[1].id).toBe('e2');
    });
  });

  describe('compareDiscourseTime', () => {
    it('should compare chapters first', () => {
      const t1: TimeAnchor = { type: 'DISCOURSE', chapter: 1, paragraph: 99 };
      const t2: TimeAnchor = { type: 'DISCOURSE', chapter: 2, paragraph: 1 };

      expect(compareDiscourseTime(t1, t2)).toBeLessThan(0);
    });

    it('should compare paragraphs when chapters equal', () => {
      const t1: TimeAnchor = { type: 'DISCOURSE', chapter: 1, paragraph: 5 };
      const t2: TimeAnchor = { type: 'DISCOURSE', chapter: 1, paragraph: 10 };

      expect(compareDiscourseTime(t1, t2)).toBeLessThan(0);
    });

    it('should compare sentences when chapters and paragraphs equal', () => {
      const t1: TimeAnchor = { type: 'DISCOURSE', chapter: 1, paragraph: 5, sentence: 1 };
      const t2: TimeAnchor = { type: 'DISCOURSE', chapter: 1, paragraph: 5, sentence: 5 };

      expect(compareDiscourseTime(t1, t2)).toBeLessThan(0);
    });

    it('should treat UNKNOWN as greater (sorts last)', () => {
      const t1: TimeAnchor = { type: 'DISCOURSE', chapter: 99, paragraph: 99 };
      const t2: TimeAnchor = { type: 'UNKNOWN' };

      expect(compareDiscourseTime(t1, t2)).toBeLessThan(0);
    });

    it('should return 0 for equal times', () => {
      const t1: TimeAnchor = { type: 'DISCOURSE', chapter: 1, paragraph: 5 };
      const t2: TimeAnchor = { type: 'DISCOURSE', chapter: 1, paragraph: 5 };

      expect(compareDiscourseTime(t1, t2)).toBe(0);
    });
  });

  describe('getParticipatingEntities', () => {
    it('should return unique entity IDs', () => {
      const events = [
        makeEvent('e1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
          participants: [{ role: 'MOVER', entity: 'entity_a', isRequired: true }],
        }),
        makeEvent('e2', 'TELL', { type: 'DISCOURSE', chapter: 1, paragraph: 2 }, {
          participants: [
            { role: 'SPEAKER', entity: 'entity_a', isRequired: true },
            { role: 'ADDRESSEE', entity: 'entity_b', isRequired: true },
          ],
        }),
      ];

      const entities = getParticipatingEntities(events);

      expect(entities).toContain('entity_a');
      expect(entities).toContain('entity_b');
      expect(entities.length).toBe(2);
    });

    it('should include location entities', () => {
      const events = [
        makeEvent('e1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
          location: 'location_castle',
        }),
      ];

      const entities = getParticipatingEntities(events);

      expect(entities).toContain('location_castle');
    });
  });

  describe('getEventTypes', () => {
    it('should return unique event types', () => {
      const events = [
        makeEvent('e1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }),
        makeEvent('e2', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 2 }),
        makeEvent('e3', 'DEATH', { type: 'DISCOURSE', chapter: 1, paragraph: 3 }),
        makeEvent('e4', 'TELL', { type: 'DISCOURSE', chapter: 1, paragraph: 4 }),
      ];

      const types = getEventTypes(events);

      expect(types).toContain('MOVE');
      expect(types).toContain('DEATH');
      expect(types).toContain('TELL');
      expect(types.length).toBe(3);
    });
  });
});
