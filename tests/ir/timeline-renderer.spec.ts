/**
 * Tests for Timeline Renderer.
 *
 * Validates:
 * - Deterministic output (snapshot test)
 * - Filtering by entityId and eventTypes
 * - Modality and modalitiesObserved display
 * - Evidence inclusion
 * - Discourse time sorting
 */

import { describe, it, expect } from 'vitest';
import {
  renderTimeline,
  sortEventsByDiscourseTime,
} from '../../app/engine/ir/timeline-renderer';
import type {
  ProjectIR,
  Entity,
  StoryEvent,
  Assertion,
  TimeAnchor,
  EvidenceSpan,
  Confidence,
  Attribution,
  Modality,
  EventType,
} from '../../app/engine/ir/types';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function makeConfidence(composite = 0.85): Confidence {
  return {
    extraction: 0.9,
    resolution: 0.85,
    identity: 0.8,
    semantic: 0.85,
    temporal: 0.8,
    composite,
  };
}

function makeAttribution(): Attribution {
  return {
    source: 'NARRATOR',
    reliability: 'HIGH',
  };
}

function makeEvidence(
  text: string,
  overrides?: Partial<EvidenceSpan>
): EvidenceSpan {
  return {
    docId: 'test-doc',
    charStart: 0,
    charEnd: text.length,
    text,
    paragraphIndex: 0,
    ...overrides,
  };
}

function makeEntity(
  id: string,
  type: string,
  canonical: string,
  aliases: string[] = []
): Entity {
  const now = new Date().toISOString();
  return {
    id,
    type,
    canonical,
    aliases: [canonical, ...aliases],
    confidence: makeConfidence(),
    sources: [{ docId: 'test-doc', charStart: 0, charEnd: 10 }],
    createdAt: now,
    updatedAt: now,
  };
}

function makeEvent(
  id: string,
  type: EventType,
  participants: { role: string; entity: string }[],
  overrides?: {
    time?: TimeAnchor;
    modality?: Modality;
    modalitiesObserved?: Modality[];
    evidence?: EvidenceSpan[];
    location?: string;
  }
): StoryEvent {
  const now = new Date().toISOString();
  return {
    id,
    type,
    participants: participants.map((p) => ({
      role: p.role,
      entity: p.entity,
      isRequired: true,
    })),
    location: overrides?.location,
    time: overrides?.time ?? { type: 'UNKNOWN' },
    evidence: overrides?.evidence ?? [makeEvidence('Test evidence')],
    attribution: makeAttribution(),
    modality: overrides?.modality ?? 'FACT',
    modalitiesObserved: overrides?.modalitiesObserved,
    confidence: makeConfidence(),
    links: [],
    produces: [],
    extractedFrom: 'pattern',
    derivedFrom: ['assertion_1'],
    createdAt: now,
    compiler_pass: 'event-builder',
  };
}

function makeDiscourseTime(
  chapter?: number,
  paragraph?: number,
  sentence?: number,
  startOffset?: number
): TimeAnchor {
  return {
    type: 'DISCOURSE',
    chapter,
    paragraph,
    sentence,
    startOffset,
  };
}

function makeFixtureIR(): ProjectIR {
  const entities: Entity[] = [
    makeEntity('entity_barty', 'PERSON', 'Barty'),
    makeEntity('entity_mildred', 'PERSON', 'Mildred'),
    makeEntity('entity_willow', 'PLACE', 'Willow Bend Road'),
    makeEntity('entity_station', 'PLACE', 'Train Station'),
    makeEntity('entity_home', 'PLACE', 'Home'),
    makeEntity('entity_bob', 'PERSON', 'Bob'),
  ];

  const events: StoryEvent[] = [
    // Event 1: Barty moves to station (Ch1 ¶1)
    makeEvent(
      'event_1',
      'MOVE',
      [
        { role: 'MOVER', entity: 'entity_barty' },
        { role: 'DESTINATION', entity: 'entity_station' },
      ],
      {
        time: makeDiscourseTime(1, 1, 0),
        modality: 'FACT',
        evidence: [makeEvidence('Barty went to the station', { paragraphIndex: 1 })],
      }
    ),

    // Event 2: Mildred meets Barty (Ch1 ¶3)
    makeEvent(
      'event_2',
      'MEET',
      [
        { role: 'PERSON_A', entity: 'entity_mildred' },
        { role: 'PERSON_B', entity: 'entity_barty' },
      ],
      {
        time: makeDiscourseTime(1, 3, 0),
        modality: 'FACT',
        evidence: [makeEvidence('Mildred met Barty at the station', { paragraphIndex: 3 })],
      }
    ),

    // Event 3: Barty moves to Willow Bend (Ch2 ¶5) - CLAIM with multiple modalities
    makeEvent(
      'event_3',
      'MOVE',
      [
        { role: 'MOVER', entity: 'entity_barty' },
        { role: 'DESTINATION', entity: 'entity_willow' },
      ],
      {
        time: makeDiscourseTime(2, 5, 0),
        modality: 'CLAIM',
        modalitiesObserved: ['RUMOR', 'CLAIM'],
        evidence: [
          makeEvidence('They say Barty moved to Willow Bend Road', { paragraphIndex: 5 }),
        ],
      }
    ),

    // Event 4: Mildred tells Bob something (Ch2 ¶7)
    makeEvent(
      'event_4',
      'TELL',
      [
        { role: 'SPEAKER', entity: 'entity_mildred' },
        { role: 'ADDRESSEE', entity: 'entity_bob' },
      ],
      {
        time: makeDiscourseTime(2, 7, 0),
        modality: 'FACT',
        evidence: [makeEvidence('Mildred told Bob the news', { paragraphIndex: 7 })],
      }
    ),

    // Event 5: Bob died (Ch3 ¶10) - RUMOR
    makeEvent(
      'event_5',
      'DEATH',
      [{ role: 'DECEDENT', entity: 'entity_bob' }],
      {
        time: makeDiscourseTime(3, 10, 0),
        modality: 'RUMOR',
        evidence: [makeEvidence('Word came that Bob had died', { paragraphIndex: 10 })],
      }
    ),

    // Event 6: Barty moves home (Ch3 ¶12)
    makeEvent(
      'event_6',
      'MOVE',
      [
        { role: 'MOVER', entity: 'entity_barty' },
        { role: 'DESTINATION', entity: 'entity_home' },
      ],
      {
        time: makeDiscourseTime(3, 12, 0),
        modality: 'FACT',
        evidence: [makeEvidence('Barty returned home', { paragraphIndex: 12 })],
      }
    ),
  ];

  const assertions: Assertion[] = [];

  return {
    version: '1.0',
    docId: 'test-doc',
    entities,
    events,
    assertions,
    relations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      sourceFiles: ['test-doc'],
      extractionMethod: 'test',
    },
  };
}

// =============================================================================
// BASIC RENDERING TESTS
// =============================================================================

describe('Timeline Renderer - Basic', () => {
  it('should render a timeline with all events in discourse order', () => {
    const ir = makeFixtureIR();
    const output = renderTimeline(ir);

    expect(output).toContain('# Timeline');
    expect(output).toContain('Showing 6 of 6 events');

    // Check events appear in correct order
    const lines = output.split('\n');
    const eventLines = lines.filter((l) => l.startsWith('- [Ch'));

    expect(eventLines).toHaveLength(6);

    // First event should be Ch1 ¶1 s0
    expect(eventLines[0]).toContain('[Ch1 ¶1');
    expect(eventLines[0]).toContain('MOVE');
    expect(eventLines[0]).toContain('Barty');

    // Last event should be Ch3 ¶12
    expect(eventLines[5]).toContain('[Ch3 ¶12');
    expect(eventLines[5]).toContain('MOVE');
  });

  it('should render empty timeline gracefully', () => {
    const ir: ProjectIR = {
      version: '1.0',
      docId: 'empty-doc',
      entities: [],
      events: [],
      assertions: [],
      relations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { sourceFiles: [], extractionMethod: 'test' },
    };

    const output = renderTimeline(ir);

    expect(output).toContain('# Timeline');
    expect(output).toContain('No events match the filter criteria');
  });

  it('should produce deterministic output on repeated calls', () => {
    const ir = makeFixtureIR();

    const output1 = renderTimeline(ir);
    const output2 = renderTimeline(ir);
    const output3 = renderTimeline(ir);

    expect(output1).toBe(output2);
    expect(output2).toBe(output3);
  });
});

// =============================================================================
// FILTERING TESTS
// =============================================================================

describe('Timeline Renderer - Filtering', () => {
  it('should filter by entityId', () => {
    const ir = makeFixtureIR();

    const output = renderTimeline(ir, { entityId: 'entity_barty' });

    // Barty participates in events 1, 2, 3, 6
    expect(output).toContain('Showing 4 of 4 events');
    expect(output).toContain('entity=entity_barty');

    // Should include Barty's events
    expect(output).toContain('[Ch1 ¶1');
    expect(output).toContain('[Ch3 ¶12');

    // Should NOT include Mildred-only events
    expect(output).not.toContain('Mildred told Bob');
  });

  it('should filter by eventTypes', () => {
    const ir = makeFixtureIR();

    const output = renderTimeline(ir, { eventTypes: ['MOVE'] });

    // 3 MOVE events
    expect(output).toContain('Showing 3 of 3 events');
    expect(output).toContain('types=[MOVE]');

    // All should be MOVE
    const lines = output.split('\n');
    const eventLines = lines.filter((l) => l.startsWith('- [Ch'));
    for (const line of eventLines) {
      expect(line).toContain('MOVE:');
    }
  });

  it('should filter by multiple eventTypes', () => {
    const ir = makeFixtureIR();

    const output = renderTimeline(ir, { eventTypes: ['MOVE', 'MEET'] });

    // 3 MOVE + 1 MEET = 4
    expect(output).toContain('Showing 4 of 4 events');
    expect(output).toContain('types=[MOVE, MEET]');
  });

  it('should combine entityId and eventTypes filters', () => {
    const ir = makeFixtureIR();

    const output = renderTimeline(ir, {
      entityId: 'entity_barty',
      eventTypes: ['MOVE'],
    });

    // Barty's MOVE events: 1, 3, 6
    expect(output).toContain('Showing 3 of 3 events');
  });

  it('should filter out uncertain events when includeUncertain=false', () => {
    const ir = makeFixtureIR();

    const output = renderTimeline(ir, { includeUncertain: false });

    // 6 total - 1 RUMOR (event_5) = 5
    // Actually event_3 is CLAIM which is not uncertain per our definition
    expect(output).toContain('certain-only');

    // Should NOT include Bob's death (RUMOR)
    expect(output).not.toContain('Bob died');
  });
});

// =============================================================================
// MODALITY TESTS
// =============================================================================

describe('Timeline Renderer - Modality', () => {
  it('should show modality in parentheses', () => {
    const ir = makeFixtureIR();
    const output = renderTimeline(ir);

    // Find event_5 (RUMOR death)
    expect(output).toContain('(RUMOR)');

    // Find event_1 (FACT move)
    expect(output).toContain('(FACT)');
  });

  it('should show modalitiesObserved when present', () => {
    const ir = makeFixtureIR();
    const output = renderTimeline(ir);

    // Event 3 has modalitiesObserved: ['RUMOR', 'CLAIM']
    expect(output).toContain('observed: [CLAIM, RUMOR]');
  });

  it('should not show observed for single modality', () => {
    const ir = makeFixtureIR();
    const output = renderTimeline(ir);

    // Event 1 has only FACT, no modalitiesObserved
    const lines = output.split('\n');
    const event1Line = lines.find((l) => l.includes('[Ch1 ¶1'));
    expect(event1Line).toBeDefined();
    expect(event1Line).toContain('(FACT)');
    expect(event1Line).not.toContain('observed:');
  });
});

// =============================================================================
// EVIDENCE TESTS
// =============================================================================

describe('Timeline Renderer - Evidence', () => {
  it('should not include evidence by default', () => {
    const ir = makeFixtureIR();
    const output = renderTimeline(ir);

    // Evidence lines start with "  >"
    const lines = output.split('\n');
    const evidenceLines = lines.filter((l) => l.trim().startsWith('>'));

    expect(evidenceLines).toHaveLength(0);
  });

  it('should include evidence when includeEvidence=true', () => {
    const ir = makeFixtureIR();
    const output = renderTimeline(ir, { includeEvidence: true });

    // Should have evidence lines
    const lines = output.split('\n');
    const evidenceLines = lines.filter((l) => l.trim().startsWith('>'));

    expect(evidenceLines.length).toBeGreaterThan(0);
    expect(output).toContain('Barty went to the station');
  });

  it('should respect maxEvidencePerEvent', () => {
    // Create event with multiple evidence spans
    const ir = makeFixtureIR();
    ir.events[0].evidence = [
      makeEvidence('First evidence'),
      makeEvidence('Second evidence'),
      makeEvidence('Third evidence'),
    ];

    const output = renderTimeline(ir, {
      includeEvidence: true,
      maxEvidencePerEvent: 2,
    });

    // Should show max 2 per event
    const lines = output.split('\n');
    const firstEventIndex = lines.findIndex((l) => l.includes('[Ch1 ¶1'));

    // Count evidence lines following first event (format: "  > text")
    let evidenceCount = 0;
    for (let i = firstEventIndex + 1; i < lines.length; i++) {
      if (lines[i].startsWith('  >')) {
        evidenceCount++;
      } else if (lines[i].startsWith('- [')) {
        break; // Next event
      }
    }

    expect(evidenceCount).toBe(2);
  });
});

// =============================================================================
// SORTING TESTS
// =============================================================================

describe('Timeline Renderer - Sorting', () => {
  it('should sort by chapter first', () => {
    const events: StoryEvent[] = [
      makeEvent('a', 'MOVE', [{ role: 'MOVER', entity: 'e1' }], {
        time: makeDiscourseTime(3, 1),
      }),
      makeEvent('b', 'MOVE', [{ role: 'MOVER', entity: 'e1' }], {
        time: makeDiscourseTime(1, 5),
      }),
      makeEvent('c', 'MOVE', [{ role: 'MOVER', entity: 'e1' }], {
        time: makeDiscourseTime(2, 3),
      }),
    ];

    const sorted = sortEventsByDiscourseTime(events);

    expect(sorted[0].id).toBe('b'); // Ch1
    expect(sorted[1].id).toBe('c'); // Ch2
    expect(sorted[2].id).toBe('a'); // Ch3
  });

  it('should sort by paragraph within chapter', () => {
    const events: StoryEvent[] = [
      makeEvent('a', 'MOVE', [{ role: 'MOVER', entity: 'e1' }], {
        time: makeDiscourseTime(1, 10),
      }),
      makeEvent('b', 'MOVE', [{ role: 'MOVER', entity: 'e1' }], {
        time: makeDiscourseTime(1, 5),
      }),
      makeEvent('c', 'MOVE', [{ role: 'MOVER', entity: 'e1' }], {
        time: makeDiscourseTime(1, 1),
      }),
    ];

    const sorted = sortEventsByDiscourseTime(events);

    expect(sorted[0].id).toBe('c'); // ¶1
    expect(sorted[1].id).toBe('b'); // ¶5
    expect(sorted[2].id).toBe('a'); // ¶10
  });

  it('should sort by sentence within paragraph', () => {
    const events: StoryEvent[] = [
      makeEvent('a', 'MOVE', [{ role: 'MOVER', entity: 'e1' }], {
        time: makeDiscourseTime(1, 1, 3),
      }),
      makeEvent('b', 'MOVE', [{ role: 'MOVER', entity: 'e1' }], {
        time: makeDiscourseTime(1, 1, 1),
      }),
      makeEvent('c', 'MOVE', [{ role: 'MOVER', entity: 'e1' }], {
        time: makeDiscourseTime(1, 1, 2),
      }),
    ];

    const sorted = sortEventsByDiscourseTime(events);

    expect(sorted[0].id).toBe('b'); // s1
    expect(sorted[1].id).toBe('c'); // s2
    expect(sorted[2].id).toBe('a'); // s3
  });

  it('should sort UNKNOWN times last', () => {
    const events: StoryEvent[] = [
      makeEvent('a', 'MOVE', [{ role: 'MOVER', entity: 'e1' }], {
        time: { type: 'UNKNOWN' },
      }),
      makeEvent('b', 'MOVE', [{ role: 'MOVER', entity: 'e1' }], {
        time: makeDiscourseTime(1, 1),
      }),
    ];

    const sorted = sortEventsByDiscourseTime(events);

    expect(sorted[0].id).toBe('b'); // Known time first
    expect(sorted[1].id).toBe('a'); // Unknown last
  });

  it('should use event ID as tie-breaker for determinism', () => {
    const events: StoryEvent[] = [
      makeEvent('zebra', 'MOVE', [{ role: 'MOVER', entity: 'e1' }], {
        time: makeDiscourseTime(1, 1, 1),
      }),
      makeEvent('alpha', 'MOVE', [{ role: 'MOVER', entity: 'e1' }], {
        time: makeDiscourseTime(1, 1, 1),
      }),
      makeEvent('middle', 'MOVE', [{ role: 'MOVER', entity: 'e1' }], {
        time: makeDiscourseTime(1, 1, 1),
      }),
    ];

    const sorted = sortEventsByDiscourseTime(events);

    // Alphabetical by ID when times are equal
    expect(sorted[0].id).toBe('alpha');
    expect(sorted[1].id).toBe('middle');
    expect(sorted[2].id).toBe('zebra');
  });
});

// =============================================================================
// EVENT SUMMARY TESTS
// =============================================================================

describe('Timeline Renderer - Event Summaries', () => {
  it('should format MOVE events as "mover → destination"', () => {
    const ir = makeFixtureIR();
    const output = renderTimeline(ir, { eventTypes: ['MOVE'] });

    expect(output).toContain('Barty → Train Station');
    expect(output).toContain('Barty → Willow Bend Road');
    expect(output).toContain('Barty → Home');
  });

  it('should format MEET events as "A met B"', () => {
    const ir = makeFixtureIR();
    const output = renderTimeline(ir, { eventTypes: ['MEET'] });

    expect(output).toContain('Mildred met Barty');
  });

  it('should format TELL events as "speaker told addressee"', () => {
    const ir = makeFixtureIR();
    const output = renderTimeline(ir, { eventTypes: ['TELL'] });

    expect(output).toContain('Mildred told Bob');
  });

  it('should format DEATH events appropriately', () => {
    const ir = makeFixtureIR();
    const output = renderTimeline(ir, { eventTypes: ['DEATH'] });

    expect(output).toContain('Bob died');
  });

  it('should format DEATH with killer as "killer killed decedent"', () => {
    const ir = makeFixtureIR();

    // Add a murder event
    ir.events.push(
      makeEvent(
        'event_murder',
        'DEATH',
        [
          { role: 'KILLER', entity: 'entity_barty' },
          { role: 'DECEDENT', entity: 'entity_bob' },
        ],
        {
          time: makeDiscourseTime(4, 1),
          modality: 'FACT',
        }
      )
    );

    const output = renderTimeline(ir, { eventTypes: ['DEATH'] });

    expect(output).toContain('Barty killed Bob');
  });
});

// =============================================================================
// LIMIT AND DEBUG TESTS
// =============================================================================

describe('Timeline Renderer - Limit and Debug', () => {
  it('should respect limit option', () => {
    const ir = makeFixtureIR();

    const output = renderTimeline(ir, { limit: 3 });

    expect(output).toContain('Showing 3 of 6 events');
    expect(output).toContain('3 more events not shown');

    // Count event lines
    const lines = output.split('\n');
    const eventLines = lines.filter((l) => l.startsWith('- [Ch'));
    expect(eventLines).toHaveLength(3);
  });

  it('should include debug section when includeDebug=true', () => {
    const ir = makeFixtureIR();

    const output = renderTimeline(ir, { includeDebug: true });

    expect(output).toContain('## Debug');
    expect(output).toContain('### Event type counts');
    expect(output).toContain('### Modality distribution');
    expect(output).toContain('### Top entities by event participation');

    // Should show counts
    expect(output).toContain('MOVE: 3');
    expect(output).toContain('FACT: 4');
  });

  it('should show events with modality changes in debug', () => {
    const ir = makeFixtureIR();

    const output = renderTimeline(ir, { includeDebug: true });

    // Event 3 has multiple modalities observed
    expect(output).toContain('### Events with modality changes');
    expect(output).toContain('CLAIM → RUMOR');
  });
});

// =============================================================================
// SNAPSHOT TEST
// =============================================================================

describe('Timeline Renderer - Snapshot', () => {
  it('should produce expected snapshot for fixture IR', () => {
    const ir = makeFixtureIR();

    const output = renderTimeline(ir, {
      includeEvidence: true,
      maxEvidencePerEvent: 1,
    });

    // Snapshot of key structural elements (not exact match due to timestamps)
    const lines = output.split('\n');

    // Header
    expect(lines[0]).toBe('# Timeline');
    expect(lines.some((l) => l.includes('Showing 6 of 6 events'))).toBe(true);

    // First event: Ch1 ¶1, MOVE, Barty → Station
    const firstEvent = lines.find((l) => l.includes('[Ch1 ¶1'));
    expect(firstEvent).toBeDefined();
    expect(firstEvent).toContain('MOVE:');
    expect(firstEvent).toContain('Barty → Train Station');
    expect(firstEvent).toContain('(FACT)');

    // Event with observed modalities: Ch2 ¶5
    const observedEvent = lines.find((l) => l.includes('[Ch2 ¶5'));
    expect(observedEvent).toBeDefined();
    expect(observedEvent).toContain('observed: [CLAIM, RUMOR]');

    // Rumor event: Ch3 ¶10
    const rumorEvent = lines.find((l) => l.includes('[Ch3 ¶10'));
    expect(rumorEvent).toBeDefined();
    expect(rumorEvent).toContain('DEATH:');
    expect(rumorEvent).toContain('Bob died');
    expect(rumorEvent).toContain('(RUMOR)');

    // Evidence included
    expect(lines.some((l) => l.includes('> Barty went to the station'))).toBe(
      true
    );
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Timeline Renderer - Edge Cases', () => {
  it('should handle events with no participants gracefully', () => {
    const ir = makeFixtureIR();
    ir.events.push(
      makeEvent('event_empty', 'MOVE', [], {
        time: makeDiscourseTime(5, 1),
        modality: 'FACT',
      })
    );

    const output = renderTimeline(ir);

    expect(output).toContain('(no participants)');
  });

  it('should handle missing entity names', () => {
    const ir = makeFixtureIR();

    // Add event with unknown entity
    ir.events.push(
      makeEvent(
        'event_unknown',
        'MOVE',
        [
          { role: 'MOVER', entity: 'entity_unknown' },
          { role: 'DESTINATION', entity: 'entity_willow' },
        ],
        {
          time: makeDiscourseTime(5, 2),
          modality: 'FACT',
        }
      )
    );

    const output = renderTimeline(ir);

    // Should fall back to entity ID
    expect(output).toContain('entity_unknown → Willow Bend Road');
  });

  it('should handle all event types without crashing', () => {
    const entities: Entity[] = [
      makeEntity('e1', 'PERSON', 'Alice'),
      makeEntity('e2', 'PERSON', 'Bob'),
      makeEntity('e3', 'PLACE', 'Park'),
    ];

    const eventTypes: EventType[] = [
      'MOVE',
      'MEET',
      'TELL',
      'LEARN',
      'PROMISE',
      'ATTACK',
      'DEATH',
    ];

    const events: StoryEvent[] = eventTypes.map((type, i) =>
      makeEvent(
        `event_${type}`,
        type,
        [
          { role: 'AGENT', entity: 'e1' },
          { role: 'PATIENT', entity: 'e2' },
        ],
        {
          time: makeDiscourseTime(1, i + 1),
          modality: 'FACT',
        }
      )
    );

    const ir: ProjectIR = {
      version: '1.0',
      docId: 'test',
      entities,
      events,
      assertions: [],
      relations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { sourceFiles: [], extractionMethod: 'test' },
    };

    // Should not throw
    const output = renderTimeline(ir);

    expect(output).toContain('# Timeline');
    expect(output).toContain(`Showing ${eventTypes.length} of ${eventTypes.length} events`);
  });
});
