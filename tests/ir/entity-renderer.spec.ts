/**
 * Tests for Entity Page Renderer.
 *
 * Tests cover:
 * - Title + type + aliases rendering
 * - Alive status with DEATH facts
 * - Current location from MOVE events
 * - Timeline highlights in discourse order
 * - Modality and modalitiesObserved display
 * - Evidence snippets
 * - Deterministic output (snapshot testing)
 */

import { describe, it, expect } from 'vitest';
import {
  renderEntityPage,
  getEntityName,
  getEventsForEntity,
  getAssertionsForEntity,
  formatEvidence,
  summarizeEvent,
  sortByDiscourseTime,
} from '../../app/engine/ir/entity-renderer';
import type {
  ProjectIR,
  Entity,
  StoryEvent,
  Assertion,
  EvidenceSpan,
  Confidence,
  Attribution,
  DiscourseTime,
  Participant,
} from '../../app/engine/ir/types';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function makeConfidence(composite = 0.8): Confidence {
  return {
    extraction: composite,
    identity: composite,
    semantic: composite,
    temporal: composite,
    composite,
  };
}

function makeAttribution(source: 'NARRATOR' | 'CHARACTER' = 'NARRATOR', character?: string): Attribution {
  return {
    source,
    character,
    reliability: 0.9,
    isDialogue: source === 'CHARACTER',
    isThought: false,
  };
}

function makeEvidence(text: string, opts: Partial<EvidenceSpan> = {}): EvidenceSpan {
  return {
    docId: opts.docId ?? 'test-doc',
    charStart: opts.charStart ?? 0,
    charEnd: opts.charEnd ?? text.length,
    paragraphIndex: opts.paragraphIndex ?? 0,
    text,
    ...opts,
  };
}

function makeDiscourseTime(chapter = 0, paragraph = 0, sentence = 0): DiscourseTime {
  return { type: 'DISCOURSE', chapter, paragraph, sentence };
}

function makeEntity(id: string, type: string, canonical: string, aliases: string[] = []): Entity {
  const now = new Date().toISOString();
  return {
    id,
    type: type as any,
    canonical,
    aliases: [canonical, ...aliases],
    createdAt: now,
    updatedAt: now,
    attrs: {},
    evidence: [],
    confidence: makeConfidence(),
  };
}

function makeEvent(
  id: string,
  type: string,
  participants: Participant[],
  opts: Partial<StoryEvent> = {}
): StoryEvent {
  const now = new Date().toISOString();
  return {
    id,
    type: type as any,
    participants,
    time: opts.time ?? makeDiscourseTime(),
    evidence: opts.evidence ?? [makeEvidence('Test evidence')],
    attribution: opts.attribution ?? makeAttribution(),
    modality: opts.modality ?? 'FACT',
    modalitiesObserved: opts.modalitiesObserved,
    confidence: opts.confidence ?? makeConfidence(),
    links: [],
    produces: [],
    extractedFrom: 'pattern',
    derivedFrom: opts.derivedFrom ?? ['assertion_1'],
    createdAt: now,
    compiler_pass: 'test',
    ...opts,
  };
}

function makeAssertion(
  id: string,
  subject: string,
  predicate: string,
  object: string | boolean,
  opts: Partial<Assertion> = {}
): Assertion {
  const now = new Date().toISOString();
  return {
    id,
    assertionType: 'DIRECT',
    subject,
    predicate,
    object,
    evidence: opts.evidence ?? [makeEvidence('Test evidence')],
    attribution: opts.attribution ?? makeAttribution(),
    modality: opts.modality ?? 'FACT',
    confidence: opts.confidence ?? makeConfidence(),
    createdAt: now,
    compiler_pass: 'test',
    ...opts,
  };
}

function makeParticipant(role: string, entity: string): Participant {
  return { role: role as any, entity, isRequired: true };
}

/**
 * Create a fixture IR for testing.
 */
function createFixtureIR(): ProjectIR {
  const entities = [
    makeEntity('entity_harry', 'PERSON', 'Harry Potter', ['Harry', 'The Boy Who Lived']),
    makeEntity('entity_hogwarts', 'PLACE', 'Hogwarts', ['Hogwarts School']),
    makeEntity('entity_voldemort', 'PERSON', 'Lord Voldemort', ['Tom Riddle', 'He-Who-Must-Not-Be-Named']),
    makeEntity('entity_privet', 'PLACE', 'Privet Drive'),
    makeEntity('entity_dumbledore', 'PERSON', 'Albus Dumbledore', ['Dumbledore']),
  ];

  const events: StoryEvent[] = [
    // Harry moves from Privet Drive to Hogwarts
    makeEvent(
      'event_move_1',
      'MOVE',
      [
        makeParticipant('MOVER', 'entity_harry'),
        makeParticipant('DESTINATION', 'entity_privet'),
      ],
      {
        time: makeDiscourseTime(1, 0, 0),
        evidence: [makeEvidence('Harry lived at Privet Drive', { paragraphIndex: 0 })],
      }
    ),
    makeEvent(
      'event_move_2',
      'MOVE',
      [
        makeParticipant('MOVER', 'entity_harry'),
        makeParticipant('DESTINATION', 'entity_hogwarts'),
      ],
      {
        time: makeDiscourseTime(2, 5, 0),
        evidence: [makeEvidence('Harry traveled to Hogwarts by train', { paragraphIndex: 5 })],
      }
    ),
    // Voldemort attacks Harry
    makeEvent(
      'event_attack_1',
      'ATTACK',
      [
        makeParticipant('ATTACKER', 'entity_voldemort'),
        makeParticipant('TARGET', 'entity_harry'),
      ],
      {
        time: makeDiscourseTime(5, 10, 0),
        evidence: [makeEvidence('Voldemort attacked Harry in the graveyard', { paragraphIndex: 10 })],
        modality: 'FACT',
      }
    ),
    // Voldemort dies
    makeEvent(
      'event_death_voldemort',
      'DEATH',
      [makeParticipant('DECEDENT', 'entity_voldemort')],
      {
        time: makeDiscourseTime(7, 20, 0),
        evidence: [makeEvidence('Voldemort was finally defeated and died', { paragraphIndex: 20 })],
        modality: 'FACT',
        modalitiesObserved: ['RUMOR', 'FACT'], // Was rumored, then confirmed
      }
    ),
  ];

  const assertions: Assertion[] = [
    makeAssertion(
      'assertion_1',
      'entity_harry',
      'lives_in',
      'entity_privet',
      { evidence: [makeEvidence('Harry lived with the Dursleys at Privet Drive')] }
    ),
    makeAssertion(
      'assertion_2',
      'entity_harry',
      'student_of',
      'entity_dumbledore',
      { evidence: [makeEvidence('Harry was a student under Dumbledore')] }
    ),
    makeAssertion(
      'assertion_3',
      'entity_voldemort',
      'enemy_of',
      'entity_harry',
      {
        modality: 'FACT',
        evidence: [makeEvidence('Voldemort was Harry\'s greatest enemy')],
      }
    ),
    makeAssertion(
      'assertion_4',
      'entity_harry',
      'defeated',
      'entity_voldemort',
      {
        modality: 'CLAIM',
        attribution: makeAttribution('CHARACTER', 'entity_dumbledore'),
        evidence: [makeEvidence('"Harry will defeat Voldemort," said Dumbledore')],
      }
    ),
  ];

  return {
    version: '1.0',
    projectId: 'test-project',
    docId: 'test-doc',
    createdAt: new Date().toISOString(),
    entities,
    assertions,
    events,
    stats: {
      entityCount: entities.length,
      assertionCount: assertions.length,
      eventCount: events.length,
    },
  };
}

// =============================================================================
// TITLE BLOCK TESTS
// =============================================================================

describe('Title Block', () => {
  it('should render entity name and type', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('# Harry Potter');
    expect(output).toContain('**Type:** PERSON');
  });

  it('should render aliases', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('**Aliases:**');
    expect(output).toContain('Harry');
    expect(output).toContain('The Boy Who Lived');
  });

  it('should handle entity not found', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'nonexistent');

    expect(output).toContain('# Entity Not Found');
    expect(output).toContain('nonexistent');
  });
});

// =============================================================================
// QUICK FACTS TESTS
// =============================================================================

describe('Quick Facts', () => {
  it('should show alive status when no death event', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('**Status:** ✅ Alive');
  });

  it('should show dead status when death event exists', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_voldemort');

    expect(output).toContain('**Status:** ☠️ Dead');
  });

  it('should show current location from most recent MOVE', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('**Current location:** Hogwarts');
  });

  it('should show location history when multiple moves', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('**Known locations:**');
    expect(output).toContain('Privet Drive');
    expect(output).toContain('Hogwarts');
  });
});

// =============================================================================
// CURRENT STATUS TESTS
// =============================================================================

describe('Current Status', () => {
  it('should show location history section', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('### Location history');
    expect(output).toContain('Privet Drive');
    expect(output).toContain('Hogwarts');
  });

  it('should show death section when applicable', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_voldemort');

    expect(output).toContain('### Death');
  });
});

// =============================================================================
// TIMELINE HIGHLIGHTS TESTS
// =============================================================================

describe('Timeline Highlights', () => {
  it('should list events in discourse order', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('## Timeline highlights');
    expect(output).toContain('[MOVE]');
    expect(output).toContain('[ATTACK]');

    // Check order: MOVE events should appear before ATTACK
    const moveIndex = output.indexOf('[MOVE]');
    const attackIndex = output.indexOf('[ATTACK]');
    expect(moveIndex).toBeLessThan(attackIndex);
  });

  it('should show modality badge', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('(FACT)');
  });

  it('should show modalitiesObserved when multiple', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_voldemort');

    // Voldemort's death event has modalitiesObserved: ['RUMOR', 'FACT']
    expect(output).toContain('observed:');
    expect(output).toContain('RUMOR');
  });

  it('should include evidence snippets', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('>'); // Blockquote for evidence
    expect(output).toContain('Harry traveled to Hogwarts');
  });

  it('should auto-summarize events', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry');

    // MOVE should show "Harry Potter → Hogwarts"
    expect(output).toContain('Harry Potter → Hogwarts');
  });
});

// =============================================================================
// KEY CLAIMS TESTS
// =============================================================================

describe('Key Claims', () => {
  it('should list assertions involving entity', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('## Key claims');
    expect(output).toContain('**lives_in**');
    expect(output).toContain('**student_of**');
  });

  it('should show modality for each claim', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('*(FACT');
  });

  it('should show attribution for character claims', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry');

    // The "defeated" claim is attributed to Dumbledore
    expect(output).toContain('attributed to');
    expect(output).toContain('Albus Dumbledore');
  });
});

// =============================================================================
// EVIDENCE SECTION TESTS
// =============================================================================

describe('Evidence Section', () => {
  it('should list deduplicated evidence', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('## Evidence');
  });

  it('should show document location', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('[test-doc');
  });
});

// =============================================================================
// DEBUG SECTION TESTS
// =============================================================================

describe('Debug Section', () => {
  it('should not show debug by default', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).not.toContain('## Debug');
  });

  it('should show debug when enabled', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry', { includeDebug: true });

    expect(output).toContain('## Debug');
    expect(output).toContain('### Entity metadata');
    expect(output).toContain('entity_harry');
  });

  it('should show counts in debug', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry', { includeDebug: true });

    expect(output).toContain('### Counts');
    expect(output).toContain('Facts:');
    expect(output).toContain('Events:');
    expect(output).toContain('Assertions:');
  });
});

// =============================================================================
// HELPER FUNCTION TESTS
// =============================================================================

describe('Helper Functions', () => {
  describe('getEntityName', () => {
    it('should return canonical name', () => {
      const ir = createFixtureIR();
      expect(getEntityName(ir, 'entity_harry')).toBe('Harry Potter');
    });

    it('should return id if entity not found', () => {
      const ir = createFixtureIR();
      expect(getEntityName(ir, 'unknown')).toBe('unknown');
    });
  });

  describe('getEventsForEntity', () => {
    it('should return events where entity participates', () => {
      const ir = createFixtureIR();
      const events = getEventsForEntity(ir.events, 'entity_harry');

      expect(events.length).toBeGreaterThan(0);
      expect(events.every((e) =>
        e.participants.some((p) => p.entity === 'entity_harry')
      )).toBe(true);
    });
  });

  describe('getAssertionsForEntity', () => {
    it('should return assertions involving entity', () => {
      const ir = createFixtureIR();
      const assertions = getAssertionsForEntity(ir.assertions, 'entity_harry');

      expect(assertions.length).toBeGreaterThan(0);
    });
  });

  describe('formatEvidence', () => {
    it('should truncate long evidence', () => {
      const longText = 'a'.repeat(300);
      const ev = makeEvidence(longText);
      const formatted = formatEvidence(ev);

      expect(formatted.length).toBeLessThanOrEqual(200);
      expect(formatted).toContain('...');
    });

    it('should remove newlines', () => {
      const ev = makeEvidence('line1\nline2\r\nline3');
      const formatted = formatEvidence(ev);

      expect(formatted).not.toContain('\n');
      expect(formatted).not.toContain('\r');
    });
  });

  describe('summarizeEvent', () => {
    it('should use event summary if present', () => {
      const ir = createFixtureIR();
      const event = makeEvent(
        'test',
        'MOVE',
        [makeParticipant('MOVER', 'entity_harry')],
        { summary: 'Custom summary' }
      );

      expect(summarizeEvent(event, ir)).toBe('Custom summary');
    });

    it('should auto-generate summary for MOVE', () => {
      const ir = createFixtureIR();
      const event = makeEvent(
        'test',
        'MOVE',
        [
          makeParticipant('MOVER', 'entity_harry'),
          makeParticipant('DESTINATION', 'entity_hogwarts'),
        ]
      );

      expect(summarizeEvent(event, ir)).toBe('Harry Potter → Hogwarts');
    });

    it('should auto-generate summary for DEATH', () => {
      const ir = createFixtureIR();
      const event = makeEvent(
        'test',
        'DEATH',
        [makeParticipant('DECEDENT', 'entity_voldemort')]
      );

      expect(summarizeEvent(event, ir)).toBe('Lord Voldemort died');
    });
  });

  describe('sortByDiscourseTime', () => {
    it('should sort by chapter then paragraph then sentence', () => {
      const items = [
        { time: makeDiscourseTime(2, 0, 0) },
        { time: makeDiscourseTime(1, 5, 0) },
        { time: makeDiscourseTime(1, 0, 0) },
      ];

      const sorted = sortByDiscourseTime(items);

      expect((sorted[0].time as DiscourseTime).chapter).toBe(1);
      expect((sorted[0].time as DiscourseTime).paragraph).toBe(0);
      expect((sorted[1].time as DiscourseTime).paragraph).toBe(5);
      expect((sorted[2].time as DiscourseTime).chapter).toBe(2);
    });
  });
});

// =============================================================================
// SNAPSHOT TEST
// =============================================================================

describe('Deterministic Output', () => {
  it('should produce consistent output for same input', () => {
    const ir = createFixtureIR();

    // Remove timestamps for comparison
    const output1 = renderEntityPage(ir, 'entity_harry')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/g, '[TIMESTAMP]');
    const output2 = renderEntityPage(ir, 'entity_harry')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/g, '[TIMESTAMP]');

    expect(output1).toBe(output2);
  });

  it('should produce expected structure', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry');

    // Check required sections exist in order
    const sectionOrder = [
      '# Harry Potter',
      '## Quick facts',
      '## Current status',
      '## Timeline highlights',
      '## Key claims',
      '## Evidence',
    ];

    let lastIndex = -1;
    for (const section of sectionOrder) {
      const index = output.indexOf(section);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
  it('should handle entity with no events', () => {
    const ir: ProjectIR = {
      version: '1.0',
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [makeEntity('entity_lonely', 'PERSON', 'Lonely Person')],
      assertions: [],
      events: [],
      stats: { entityCount: 1, assertionCount: 0, eventCount: 0 },
    };

    const output = renderEntityPage(ir, 'entity_lonely');

    expect(output).toContain('*(No events involving this entity.)*');
    expect(output).toContain('*(No assertions involving this entity.)*');
    expect(output).toContain('*(No derived facts yet.)*');
  });

  it('should handle entity with no aliases', () => {
    const ir: ProjectIR = {
      version: '1.0',
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [makeEntity('entity_simple', 'ITEM', 'Simple Item', [])],
      assertions: [],
      events: [],
      stats: { entityCount: 1, assertionCount: 0, eventCount: 0 },
    };

    const output = renderEntityPage(ir, 'entity_simple');

    expect(output).not.toContain('**Aliases:**');
  });

  it('should respect maxEvents option', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry', { maxEvents: 1 });

    // Should show "more events not shown" message
    const moveCount = (output.match(/\[MOVE\]/g) || []).length;
    const attackCount = (output.match(/\[ATTACK\]/g) || []).length;

    expect(moveCount + attackCount).toBeLessThanOrEqual(1);
  });

  it('should respect maxAssertions option', () => {
    const ir = createFixtureIR();
    const output = renderEntityPage(ir, 'entity_harry', { maxAssertions: 1 });

    expect(output).toContain('more claims not shown');
  });
});
