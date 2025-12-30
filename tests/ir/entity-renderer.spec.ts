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
  renderItemPage,
  renderPlacePage,
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

    // Title now includes badge for high-confidence entities
    expect(output).toContain('# Harry Potter');
    expect(output).toContain('PERSON');
    // Badge should appear (👤 for PERSON)
    expect(output).toContain('👤');
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

    // Current location is now cross-linked
    expect(output).toContain('**Current location:**');
    expect(output).toContain('[Hogwarts](entity_hogwarts)');
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
// STATE PROPERTIES TESTS
// =============================================================================

describe('State Properties', () => {
  it('should render state assertions with "current" label', () => {
    const ir = createFixtureIR();

    // Add state assertions for Harry
    ir.assertions.push({
      id: 'state_1',
      assertionType: 'DIRECT',
      subject: 'entity_harry',
      predicate: 'state_of',
      object: 'happy',
      evidence: [makeEvidence('Harry was happy', { charStart: 100 })],
      attribution: makeAttribution(),
      modality: 'FACT',
      confidence: makeConfidence(),
      createdAt: new Date().toISOString(),
      compiler_pass: 'state_extractor:copula_adj',
    });

    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('## States & properties');
    expect(output).toContain('### States');
    expect(output).toContain('is happy');
    expect(output).toContain('*(current)*');
  });

  it('should render is_a assertions under Identity & Roles', () => {
    const ir = createFixtureIR();

    ir.assertions.push({
      id: 'is_a_1',
      assertionType: 'DIRECT',
      subject: 'entity_harry',
      predicate: 'is_a',
      object: 'a wizard',
      evidence: [makeEvidence('Harry was a wizard')],
      attribution: makeAttribution(),
      modality: 'FACT',
      confidence: makeConfidence(),
      createdAt: new Date().toISOString(),
      compiler_pass: 'state_extractor:copula_noun',
    });

    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('### Identity & Roles');
    expect(output).toContain('is a wizard');
  });

  it('should render has assertions under Possessions', () => {
    const ir = createFixtureIR();

    ir.assertions.push({
      id: 'has_1',
      assertionType: 'DIRECT',
      subject: 'entity_harry',
      predicate: 'has',
      object: 'an owl',
      evidence: [makeEvidence('Harry had an owl')],
      attribution: makeAttribution(),
      modality: 'FACT',
      confidence: makeConfidence(),
      createdAt: new Date().toISOString(),
      compiler_pass: 'state_extractor:possession',
    });

    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('### Possessions');
    expect(output).toContain('has an owl');
  });

  it('should show negated assertions with ❌ icon', () => {
    const ir = createFixtureIR();

    ir.assertions.push({
      id: 'state_neg',
      assertionType: 'DIRECT',
      subject: 'entity_harry',
      predicate: 'state_of',
      object: 'afraid',
      evidence: [makeEvidence('Harry was not afraid')],
      attribution: makeAttribution(),
      modality: 'NEGATED',
      confidence: makeConfidence(),
      createdAt: new Date().toISOString(),
      compiler_pass: 'state_extractor:copula_adj',
    });

    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('❌');
    expect(output).toContain('is afraid');
  });

  it('should show earlier states when multiple of same type', () => {
    const ir = createFixtureIR();

    // Add two state assertions at different positions
    ir.assertions.push(
      {
        id: 'state_early',
        assertionType: 'DIRECT',
        subject: 'entity_harry',
        predicate: 'state_of',
        object: 'sad',
        evidence: [makeEvidence('Harry was sad', { charStart: 10 })],
        attribution: makeAttribution(),
        modality: 'FACT',
        confidence: makeConfidence(),
        createdAt: new Date().toISOString(),
        compiler_pass: 'state_extractor:copula_adj',
      },
      {
        id: 'state_later',
        assertionType: 'DIRECT',
        subject: 'entity_harry',
        predicate: 'state_of',
        object: 'happy',
        evidence: [makeEvidence('Harry was happy', { charStart: 200 })],
        attribution: makeAttribution(),
        modality: 'FACT',
        confidence: makeConfidence(),
        createdAt: new Date().toISOString(),
        compiler_pass: 'state_extractor:copula_adj',
      }
    );

    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('*(current)*');
    expect(output).toContain('*(earlier)*');
  });

  it('should not show section if no state assertions', () => {
    const ir = createFixtureIR();
    // Remove any existing assertions
    ir.assertions = ir.assertions.filter(a =>
      !['state_of', 'is_a', 'has', 'can', 'trait', 'location_at'].includes(a.predicate || '')
    );

    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).not.toContain('## States & properties');
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

// =============================================================================
// ITEM PAGE RENDERER TESTS
// =============================================================================

describe('renderItemPage', () => {
  function makeTransferEvent(
    id: string,
    giver: string | null,
    receiver: string,
    item: string,
    time: DiscourseTime,
    evidenceText: string
  ): StoryEvent {
    const participants: Participant[] = [
      { role: 'RECEIVER', entity: receiver, isRequired: true },
      { role: 'ITEM', entity: item, isRequired: true },
    ];

    if (giver) {
      participants.unshift({ role: 'GIVER', entity: giver, isRequired: true });
    }

    return {
      id,
      type: 'TRANSFER',
      participants,
      time,
      evidence: [makeEvidence(evidenceText)],
      attribution: makeAttribution(),
      modality: 'FACT',
      confidence: makeConfidence(),
      links: [],
      produces: [],
      extractedFrom: 'pattern',
      derivedFrom: [],
      createdAt: new Date().toISOString(),
      compiler_pass: 'test',
    };
  }

  function createItemIR(): ProjectIR {
    return {
      version: '1.0',
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [
        makeEntity('entity_harry', 'PERSON', 'Harry Potter'),
        makeEntity('entity_ron', 'PERSON', 'Ron Weasley'),
        makeEntity('entity_ollivander', 'PERSON', 'Ollivander'),
        makeEntity('entity_wand', 'ITEM', 'Elder Wand'),
      ],
      assertions: [],
      events: [
        makeTransferEvent(
          'transfer_1',
          'entity_ollivander',
          'entity_harry',
          'entity_wand',
          { type: 'DISCOURSE', chapter: 1, paragraph: 5, sentence: 0 },
          'Ollivander handed the wand to Harry.'
        ),
        makeTransferEvent(
          'transfer_2',
          'entity_harry',
          'entity_ron',
          'entity_wand',
          { type: 'DISCOURSE', chapter: 3, paragraph: 10, sentence: 0 },
          'Harry gave the wand to Ron.'
        ),
      ],
      stats: { entityCount: 4, assertionCount: 0, eventCount: 2 },
    };
  }

  describe('Title Block', () => {
    it('should render item name as title', () => {
      const ir = createItemIR();
      const output = renderItemPage(ir, 'entity_wand');

      // Title now includes badge for high-confidence entities
      expect(output).toContain('# Elder Wand');
      expect(output).toContain('ITEM');
      // Badge should appear (🎭 for ITEM)
      expect(output).toContain('🎭');
    });
  });

  describe('Current Holder', () => {
    it('should show current holder from transfer events', () => {
      const ir = createItemIR();
      const output = renderItemPage(ir, 'entity_wand');

      expect(output).toContain('## Current holder');
      // Current holder is now cross-linked
      expect(output).toContain('[Ron Weasley](entity_ron)');
    });

    it('should show "Unknown" when no ownership information', () => {
      const ir: ProjectIR = {
        version: '1.0',
        projectId: 'test',
        createdAt: new Date().toISOString(),
        entities: [makeEntity('entity_ring', 'ITEM', 'Ring')],
        assertions: [],
        events: [],
        stats: { entityCount: 1, assertionCount: 0, eventCount: 0 },
      };

      const output = renderItemPage(ir, 'entity_ring');

      expect(output).toContain('**Unknown**');
      expect(output).toContain('No ownership information available');
    });

    it('should include acquisition time', () => {
      const ir = createItemIR();
      const output = renderItemPage(ir, 'entity_wand');

      expect(output).toContain('Since Ch.3 ¶10');
    });
  });

  describe('Ownership History', () => {
    it('should show ownership timeline', () => {
      const ir = createItemIR();
      const output = renderItemPage(ir, 'entity_wand');

      expect(output).toContain('## Ownership history');
      // Owners are now cross-linked
      expect(output).toContain('[Ron Weasley](entity_ron)');
      expect(output).toContain('[Harry Potter](entity_harry)');
    });

    it('should mark current owner', () => {
      const ir = createItemIR();
      const output = renderItemPage(ir, 'entity_wand');

      expect(output).toContain('*(current)*');
    });

    it('should mark inferred losses', () => {
      const ir = createItemIR();
      const output = renderItemPage(ir, 'entity_wand');

      // Ollivander's loss is inferred
      expect(output).toContain('*(inferred)*');
    });

    it('should include evidence quotes', () => {
      const ir = createItemIR();
      const output = renderItemPage(ir, 'entity_wand');

      expect(output).toContain('Harry gave the wand to Ron');
    });
  });

  describe('Transfer Events', () => {
    it('should list transfer events', () => {
      const ir = createItemIR();
      const output = renderItemPage(ir, 'entity_wand');

      expect(output).toContain('## Transfer events');
    });

    it('should show event summaries with time', () => {
      const ir = createItemIR();
      const output = renderItemPage(ir, 'entity_wand');

      // Should have transfer summaries
      expect(output).toContain('gave Elder Wand to');
    });

    it('should show "No transfer events" when none exist', () => {
      const ir: ProjectIR = {
        version: '1.0',
        projectId: 'test',
        createdAt: new Date().toISOString(),
        entities: [makeEntity('entity_book', 'ITEM', 'Book')],
        assertions: [],
        events: [],
        stats: { entityCount: 1, assertionCount: 0, eventCount: 0 },
      };

      const output = renderItemPage(ir, 'entity_book');

      expect(output).toContain('*(No transfer events recorded.)*');
    });
  });

  describe('Edge Cases', () => {
    it('should return "not found" for missing item', () => {
      const ir = createItemIR();
      const output = renderItemPage(ir, 'entity_nonexistent');

      expect(output).toContain('# Item Not Found');
      expect(output).toContain('entity_nonexistent');
    });

    it('should handle item with only receiving (no giver)', () => {
      const ir: ProjectIR = {
        version: '1.0',
        projectId: 'test',
        createdAt: new Date().toISOString(),
        entities: [
          makeEntity('entity_frodo', 'PERSON', 'Frodo'),
          makeEntity('entity_ring', 'ITEM', 'One Ring'),
        ],
        assertions: [],
        events: [
          makeTransferEvent(
            'transfer_found',
            null, // No giver - Frodo found it
            'entity_frodo',
            'entity_ring',
            { type: 'DISCOURSE', chapter: 1, paragraph: 1, sentence: 0 },
            'Frodo found the Ring.'
          ),
        ],
        stats: { entityCount: 2, assertionCount: 0, eventCount: 1 },
      };

      const output = renderItemPage(ir, 'entity_ring');

      // Owner is now cross-linked
      expect(output).toContain('[Frodo](entity_frodo)');
      expect(output).toContain('*(current)*');
      // Should NOT contain "inferred" since there's no giver to infer loss from
      expect(output).not.toContain('*(inferred)*');
    });
  });

  describe('Section Ordering', () => {
    it('should render sections in correct order', () => {
      const ir = createItemIR();
      const output = renderItemPage(ir, 'entity_wand');

      const sections = [
        '# Elder Wand',
        '## Current holder',
        '## Ownership history',
        '## Transfer events',
      ];

      let lastIndex = -1;
      for (const section of sections) {
        const index = output.indexOf(section);
        expect(index).toBeGreaterThan(lastIndex);
        lastIndex = index;
      }
    });
  });
});

// =============================================================================
// RELATIONSHIPS SECTION TESTS (A1)
// =============================================================================

describe('Relationships Section', () => {
  function createRelationIR(): ProjectIR {
    return {
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [
        makeEntity('entity_harry', 'PERSON', 'Harry Potter'),
        makeEntity('entity_voldemort', 'PERSON', 'Voldemort'),
        makeEntity('entity_ron', 'PERSON', 'Ron Weasley'),
        makeEntity('entity_ginny', 'PERSON', 'Ginny Weasley'),
        makeEntity('entity_james', 'PERSON', 'James Potter'),
        makeEntity('entity_gryffindor', 'ORG', 'Gryffindor'),
      ],
      assertions: [
        // enemy_of (symmetric)
        {
          id: 'assertion_enemy',
          assertionType: 'DIRECT' as const,
          subject: 'entity_harry',
          predicate: 'enemy_of',
          object: 'entity_voldemort',
          evidence: [],
          attribution: { source: 'NARRATOR', reliability: 0.9, isDialogue: false, isThought: false },
          modality: 'FACT' as const,
          confidence: { extraction: 0.9, identity: 0.9, semantic: 0.9, temporal: 0.9, composite: 0.9 },
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
        // sibling_of (symmetric)
        {
          id: 'assertion_sibling',
          assertionType: 'DIRECT' as const,
          subject: 'entity_ron',
          predicate: 'sibling_of',
          object: 'entity_ginny',
          evidence: [],
          attribution: { source: 'NARRATOR', reliability: 0.9, isDialogue: false, isThought: false },
          modality: 'FACT' as const,
          confidence: { extraction: 0.9, identity: 0.9, semantic: 0.9, temporal: 0.9, composite: 0.9 },
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
        // parent_of (directional)
        {
          id: 'assertion_parent',
          assertionType: 'DIRECT' as const,
          subject: 'entity_james',
          predicate: 'parent_of',
          object: 'entity_harry',
          evidence: [],
          attribution: { source: 'NARRATOR', reliability: 0.9, isDialogue: false, isThought: false },
          modality: 'FACT' as const,
          confidence: { extraction: 0.9, identity: 0.9, semantic: 0.9, temporal: 0.9, composite: 0.9 },
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
        // member_of (directional)
        {
          id: 'assertion_member',
          assertionType: 'DIRECT' as const,
          subject: 'entity_harry',
          predicate: 'member_of',
          object: 'entity_gryffindor',
          evidence: [],
          attribution: { source: 'NARRATOR', reliability: 0.9, isDialogue: false, isThought: false },
          modality: 'FACT' as const,
          confidence: { extraction: 0.9, identity: 0.9, semantic: 0.9, temporal: 0.9, composite: 0.9 },
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
      ],
      events: [],
      stats: { entityCount: 6, assertionCount: 4, eventCount: 0 },
    };
  }

  it('should render Relationships section for entity with relations', () => {
    const ir = createRelationIR();
    const output = renderEntityPage(ir, 'entity_harry');

    expect(output).toContain('## Relationships');
  });

  it('should show symmetric relation (enemy_of) for both entities', () => {
    const ir = createRelationIR();

    const harryPage = renderEntityPage(ir, 'entity_harry');
    expect(harryPage).toContain('Enemies');
    expect(harryPage).toContain('Voldemort');

    const voldyPage = renderEntityPage(ir, 'entity_voldemort');
    expect(voldyPage).toContain('Enemies');
    expect(voldyPage).toContain('Harry Potter');
  });

  it('should show sibling_of relation for both siblings', () => {
    const ir = createRelationIR();

    const ronPage = renderEntityPage(ir, 'entity_ron');
    expect(ronPage).toContain('Siblings');
    expect(ronPage).toContain('Ginny Weasley');

    const ginnyPage = renderEntityPage(ir, 'entity_ginny');
    expect(ginnyPage).toContain('Siblings');
    expect(ginnyPage).toContain('Ron Weasley');
  });

  it('should show parent_of relation correctly', () => {
    const ir = createRelationIR();

    const jamesPage = renderEntityPage(ir, 'entity_james');
    expect(jamesPage).toContain('Children');
    expect(jamesPage).toContain('Harry Potter');
  });

  it('should show child_of relation for child entity (via parent_of as subject)', () => {
    const ir = createRelationIR();

    const harryPage = renderEntityPage(ir, 'entity_harry');
    // Harry appears as object in parent_of, should show James as related
    expect(harryPage).toContain('James Potter');
  });

  it('should show member_of relation', () => {
    const ir = createRelationIR();

    const harryPage = renderEntityPage(ir, 'entity_harry');
    expect(harryPage).toContain('Member of');
    expect(harryPage).toContain('Gryffindor');
  });

  it('should not render Relationships section when no relations exist', () => {
    const ir: ProjectIR = {
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [makeEntity('entity_lonely', 'PERSON', 'Lonely Person')],
      assertions: [],
      events: [],
      stats: { entityCount: 1, assertionCount: 0, eventCount: 0 },
    };

    const output = renderEntityPage(ir, 'entity_lonely');
    expect(output).not.toContain('## Relationships');
  });

  it('should filter out low confidence relations', () => {
    const ir: ProjectIR = {
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [
        makeEntity('entity_a', 'PERSON', 'Person A'),
        makeEntity('entity_b', 'PERSON', 'Person B'),
      ],
      assertions: [
        {
          id: 'assertion_low',
          assertionType: 'DIRECT' as const,
          subject: 'entity_a',
          predicate: 'enemy_of',
          object: 'entity_b',
          evidence: [],
          attribution: { source: 'NARRATOR', reliability: 0.9, isDialogue: false, isThought: false },
          modality: 'FACT' as const,
          confidence: { extraction: 0.5, identity: 0.5, semantic: 0.5, temporal: 0.5, composite: 0.5 }, // Below 0.7
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
      ],
      events: [],
      stats: { entityCount: 2, assertionCount: 1, eventCount: 0 },
    };

    const output = renderEntityPage(ir, 'entity_a');
    expect(output).not.toContain('## Relationships');
  });

  it('should group multiple relations of same type', () => {
    const ir: ProjectIR = {
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [
        makeEntity('entity_parent', 'PERSON', 'Parent'),
        makeEntity('entity_child1', 'PERSON', 'Child One'),
        makeEntity('entity_child2', 'PERSON', 'Child Two'),
      ],
      assertions: [
        {
          id: 'assertion_1',
          assertionType: 'DIRECT' as const,
          subject: 'entity_parent',
          predicate: 'parent_of',
          object: 'entity_child1',
          evidence: [],
          attribution: { source: 'NARRATOR', reliability: 0.9, isDialogue: false, isThought: false },
          modality: 'FACT' as const,
          confidence: { extraction: 0.9, identity: 0.9, semantic: 0.9, temporal: 0.9, composite: 0.9 },
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
        {
          id: 'assertion_2',
          assertionType: 'DIRECT' as const,
          subject: 'entity_parent',
          predicate: 'parent_of',
          object: 'entity_child2',
          evidence: [],
          attribution: { source: 'NARRATOR', reliability: 0.9, isDialogue: false, isThought: false },
          modality: 'FACT' as const,
          confidence: { extraction: 0.9, identity: 0.9, semantic: 0.9, temporal: 0.9, composite: 0.9 },
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
      ],
      events: [],
      stats: { entityCount: 3, assertionCount: 2, eventCount: 0 },
    };

    const output = renderEntityPage(ir, 'entity_parent');
    expect(output).toContain('Children');
    expect(output).toContain('Child One');
    expect(output).toContain('Child Two');
  });
});

// =============================================================================
// CROSS-LINK TESTS (A2)
// =============================================================================

describe('Cross-Links', () => {
  it('should render entity links in relationships section', () => {
    const ir: ProjectIR = {
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [
        makeEntity('entity_a', 'PERSON', 'Alice'),
        makeEntity('entity_b', 'PERSON', 'Bob'),
      ],
      assertions: [
        {
          id: 'assertion_friend',
          assertionType: 'DIRECT' as const,
          subject: 'entity_a',
          predicate: 'friends_with',
          object: 'entity_b',
          evidence: [],
          attribution: { source: 'NARRATOR', reliability: 0.9, isDialogue: false, isThought: false },
          modality: 'FACT' as const,
          confidence: { extraction: 0.9, identity: 0.9, semantic: 0.9, temporal: 0.9, composite: 0.9 },
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
      ],
      events: [],
      stats: { entityCount: 2, assertionCount: 1, eventCount: 0 },
    };

    const output = renderEntityPage(ir, 'entity_a');
    // Should render Bob as a cross-link
    expect(output).toContain('[Bob](entity_b)');
  });

  it('should render entity links in possessions section', () => {
    const ir: ProjectIR = {
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [
        makeEntity('entity_frodo', 'PERSON', 'Frodo'),
        makeEntity('entity_ring', 'ITEM', 'One Ring'),
      ],
      assertions: [],
      events: [
        {
          id: 'transfer_1',
          type: 'TRANSFER',
          participants: [
            { role: 'RECEIVER', entity: 'entity_frodo', isRequired: true },
            { role: 'ITEM', entity: 'entity_ring', isRequired: true },
          ],
          time: { type: 'DISCOURSE', chapter: 1, paragraph: 1, sentence: 0 },
          evidence: [makeEvidence('Frodo received the Ring.')],
          attribution: { source: 'NARRATOR', reliability: 0.9, isDialogue: false, isThought: false },
          modality: 'FACT',
          confidence: makeConfidence(),
          links: [],
          produces: [],
          extractedFrom: 'pattern',
          derivedFrom: [],
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
      ],
      stats: { entityCount: 2, assertionCount: 0, eventCount: 1 },
    };

    const output = renderEntityPage(ir, 'entity_frodo');
    // Should render Ring as a cross-link in possessions
    expect(output).toContain('[One Ring](entity_ring)');
  });

  it('should render entity links in quick facts location', () => {
    const ir: ProjectIR = {
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [
        makeEntity('entity_gandalf', 'PERSON', 'Gandalf'),
        makeEntity('entity_moria', 'PLACE', 'Moria'),
      ],
      assertions: [],
      events: [
        {
          id: 'move_1',
          type: 'MOVE',
          participants: [
            { role: 'MOVER', entity: 'entity_gandalf', isRequired: true },
            { role: 'DESTINATION', entity: 'entity_moria', isRequired: true },
          ],
          time: { type: 'DISCOURSE', chapter: 1, paragraph: 1, sentence: 0 },
          evidence: [makeEvidence('Gandalf entered Moria.')],
          attribution: { source: 'NARRATOR', reliability: 0.9, isDialogue: false, isThought: false },
          modality: 'FACT',
          confidence: makeConfidence(),
          links: [],
          produces: [],
          extractedFrom: 'pattern',
          derivedFrom: [],
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
      ],
      stats: { entityCount: 2, assertionCount: 0, eventCount: 1 },
    };

    const output = renderEntityPage(ir, 'entity_gandalf');
    // Should render Moria as a cross-link in current location
    expect(output).toContain('[Moria](entity_moria)');
  });

  it('should render entity links in item page current holder', () => {
    const ir: ProjectIR = {
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [
        makeEntity('entity_sam', 'PERSON', 'Sam'),
        makeEntity('entity_rope', 'ITEM', 'Elven Rope'),
      ],
      assertions: [],
      events: [
        {
          id: 'transfer_rope',
          type: 'TRANSFER',
          participants: [
            { role: 'RECEIVER', entity: 'entity_sam', isRequired: true },
            { role: 'ITEM', entity: 'entity_rope', isRequired: true },
          ],
          time: { type: 'DISCOURSE', chapter: 2, paragraph: 5, sentence: 0 },
          evidence: [makeEvidence('Sam received the Elven Rope.')],
          attribution: { source: 'NARRATOR', reliability: 0.9, isDialogue: false, isThought: false },
          modality: 'FACT',
          confidence: makeConfidence(),
          links: [],
          produces: [],
          extractedFrom: 'pattern',
          derivedFrom: [],
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
      ],
      stats: { entityCount: 2, assertionCount: 0, eventCount: 1 },
    };

    const output = renderItemPage(ir, 'entity_rope');
    // Should render Sam as a cross-link
    expect(output).toContain('[Sam](entity_sam)');
  });

  it('should render entity links in ownership history', () => {
    const ir: ProjectIR = {
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [
        makeEntity('entity_bilbo', 'PERSON', 'Bilbo'),
        makeEntity('entity_frodo', 'PERSON', 'Frodo'),
        makeEntity('entity_sting', 'ITEM', 'Sting'),
      ],
      assertions: [],
      events: [
        {
          id: 'transfer_1',
          type: 'TRANSFER',
          participants: [
            { role: 'RECEIVER', entity: 'entity_bilbo', isRequired: true },
            { role: 'ITEM', entity: 'entity_sting', isRequired: true },
          ],
          time: { type: 'DISCOURSE', chapter: 1, paragraph: 1, sentence: 0 },
          evidence: [makeEvidence('Bilbo found Sting.')],
          attribution: { source: 'NARRATOR', reliability: 0.9, isDialogue: false, isThought: false },
          modality: 'FACT',
          confidence: makeConfidence(),
          links: [],
          produces: [],
          extractedFrom: 'pattern',
          derivedFrom: [],
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
        {
          id: 'transfer_2',
          type: 'TRANSFER',
          participants: [
            { role: 'GIVER', entity: 'entity_bilbo', isRequired: true },
            { role: 'RECEIVER', entity: 'entity_frodo', isRequired: true },
            { role: 'ITEM', entity: 'entity_sting', isRequired: true },
          ],
          time: { type: 'DISCOURSE', chapter: 5, paragraph: 10, sentence: 0 },
          evidence: [makeEvidence('Bilbo gave Sting to Frodo.')],
          attribution: { source: 'NARRATOR', reliability: 0.9, isDialogue: false, isThought: false },
          modality: 'FACT',
          confidence: makeConfidence(),
          links: [],
          produces: [],
          extractedFrom: 'pattern',
          derivedFrom: [],
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
      ],
      stats: { entityCount: 3, assertionCount: 0, eventCount: 2 },
    };

    const output = renderItemPage(ir, 'entity_sting');
    // Both owners should be cross-linked
    expect(output).toContain('[Bilbo](entity_bilbo)');
    expect(output).toContain('[Frodo](entity_frodo)');
  });
});

// =============================================================================
// ENTITY TYPE BADGE TESTS (A3)
// =============================================================================

import { getTypeBadge } from '../../app/engine/ir/entity-renderer';

describe('Entity Type Badges', () => {
  describe('getTypeBadge', () => {
    it('should return 👤 for PERSON with high confidence', () => {
      expect(getTypeBadge('PERSON', 0.9)).toBe('👤');
    });

    it('should return 🏛️ for ORG with high confidence', () => {
      expect(getTypeBadge('ORG', 0.8)).toBe('🏛️');
    });

    it('should return 📍 for PLACE with high confidence', () => {
      expect(getTypeBadge('PLACE', 0.75)).toBe('📍');
    });

    it('should return 🎭 for ITEM with high confidence', () => {
      expect(getTypeBadge('ITEM', 0.85)).toBe('🎭');
    });

    it('should return empty string for low confidence', () => {
      expect(getTypeBadge('PERSON', 0.5)).toBe('');
      expect(getTypeBadge('ORG', 0.69)).toBe('');
    });

    it('should return empty string for unknown type', () => {
      expect(getTypeBadge('UNKNOWN_TYPE', 0.9)).toBe('');
    });

    it('should handle boundary confidence of 0.7', () => {
      expect(getTypeBadge('PERSON', 0.7)).toBe('👤');
      expect(getTypeBadge('PERSON', 0.699)).toBe('');
    });
  });

  describe('Title Block with Badges', () => {
    it('should show badge in title for high-confidence entity', () => {
      const ir: ProjectIR = {
        projectId: 'test',
        createdAt: new Date().toISOString(),
        entities: [makeEntity('entity_gandalf', 'PERSON', 'Gandalf')],
        assertions: [],
        events: [],
        stats: { entityCount: 1, assertionCount: 0, eventCount: 0 },
      };

      const output = renderEntityPage(ir, 'entity_gandalf');
      expect(output).toContain('# Gandalf 👤');
      expect(output).toContain('**Type:** 👤 PERSON');
    });

    it('should not show badge in title for low-confidence entity', () => {
      const now = new Date().toISOString();
      const lowConfEntity: Entity = {
        id: 'entity_uncertain',
        type: 'PERSON' as any,
        canonical: 'Uncertain Person',
        aliases: ['Uncertain Person'],
        createdAt: now,
        updatedAt: now,
        attrs: {},
        evidence: [],
        confidence: {
          extraction: 0.5,
          identity: 0.5,
          semantic: 0.5,
          temporal: 0.5,
          composite: 0.5,
        },
      };

      const ir: ProjectIR = {
        projectId: 'test',
        createdAt: now,
        entities: [lowConfEntity],
        assertions: [],
        events: [],
        stats: { entityCount: 1, assertionCount: 0, eventCount: 0 },
      };

      const output = renderEntityPage(ir, 'entity_uncertain');
      // Should NOT have badge since confidence is below 0.7
      expect(output).toContain('# Uncertain Person');
      expect(output).not.toContain('# Uncertain Person 👤');
      expect(output).toContain('**Type:** PERSON');
      expect(output).not.toContain('**Type:** 👤');
    });
  });
});

// =============================================================================
// MENTIONED IN SECTION TESTS (A4)
// =============================================================================

describe('Mentioned In Section', () => {
  it('should show mentions grouped by event type', () => {
    const ir: ProjectIR = {
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [
        makeEntity('entity_aragorn', 'PERSON', 'Aragorn'),
        makeEntity('entity_gondor', 'PLACE', 'Gondor'),
      ],
      assertions: [],
      events: [
        {
          id: 'event_1',
          type: 'MOVE',
          participants: [
            { role: 'MOVER', entity: 'entity_aragorn', isRequired: true },
            { role: 'DESTINATION', entity: 'entity_gondor', isRequired: true },
          ],
          time: { type: 'DISCOURSE', chapter: 1, paragraph: 5, sentence: 0 },
          evidence: [makeEvidence('Aragorn traveled to Gondor.')],
          attribution: makeAttribution(),
          modality: 'FACT',
          confidence: makeConfidence(),
          links: [],
          produces: [],
          extractedFrom: 'pattern',
          derivedFrom: [],
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
        {
          id: 'event_2',
          type: 'MEET',
          participants: [
            { role: 'PERSON_A', entity: 'entity_aragorn', isRequired: true },
            { role: 'PERSON_B', entity: 'entity_gondor', isRequired: true },
          ],
          time: { type: 'DISCOURSE', chapter: 2, paragraph: 10, sentence: 0 },
          evidence: [makeEvidence('Aragorn met with the council in Gondor.')],
          attribution: makeAttribution(),
          modality: 'FACT',
          confidence: makeConfidence(),
          links: [],
          produces: [],
          extractedFrom: 'pattern',
          derivedFrom: [],
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
      ],
      stats: { entityCount: 2, assertionCount: 0, eventCount: 2 },
    };

    const output = renderEntityPage(ir, 'entity_aragorn');

    expect(output).toContain('## Mentioned in');
    expect(output).toContain('### MOVE');
    expect(output).toContain('### MEET');
    expect(output).toContain('Aragorn traveled to Gondor');
  });

  it('should truncate long evidence to 80 chars in Mentioned In section', () => {
    const longEvidence = 'A'.repeat(100) + 'END';

    const ir: ProjectIR = {
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [makeEntity('entity_test', 'PERSON', 'Test')],
      assertions: [],
      events: [
        {
          id: 'event_1',
          type: 'ATTACK',
          participants: [
            { role: 'ATTACKER', entity: 'entity_test', isRequired: true },
          ],
          time: { type: 'DISCOURSE', chapter: 1, paragraph: 1, sentence: 0 },
          evidence: [makeEvidence(longEvidence)],
          attribution: makeAttribution(),
          modality: 'FACT',
          confidence: makeConfidence(),
          links: [],
          produces: [],
          extractedFrom: 'pattern',
          derivedFrom: [],
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
      ],
      stats: { entityCount: 1, assertionCount: 0, eventCount: 1 },
    };

    const output = renderEntityPage(ir, 'entity_test');

    // Extract just the Mentioned In section
    const mentionedInStart = output.indexOf('## Mentioned in');
    const mentionedInEnd = output.indexOf('## Evidence');
    const mentionedInSection = output.slice(mentionedInStart, mentionedInEnd);

    // Should contain truncated evidence in Mentioned In section
    expect(mentionedInSection).toContain('...');
    // Mentioned In should NOT contain "END" (truncated)
    expect(mentionedInSection).not.toContain('END');
  });

  it('should include assertion predicates in grouping', () => {
    const ir: ProjectIR = {
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [
        makeEntity('entity_frodo', 'PERSON', 'Frodo'),
        makeEntity('entity_sam', 'PERSON', 'Sam'),
      ],
      assertions: [
        {
          id: 'assertion_1',
          assertionType: 'DIRECT' as const,
          subject: 'entity_frodo',
          predicate: 'friends_with',
          object: 'entity_sam',
          evidence: [makeEvidence('Frodo was friends with Sam.')],
          attribution: { source: 'NARRATOR', reliability: 0.9, isDialogue: false, isThought: false },
          modality: 'FACT' as const,
          confidence: { extraction: 0.9, identity: 0.9, semantic: 0.9, temporal: 0.9, composite: 0.9 },
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
      ],
      events: [],
      stats: { entityCount: 2, assertionCount: 1, eventCount: 0 },
    };

    const output = renderEntityPage(ir, 'entity_frodo');

    expect(output).toContain('## Mentioned in');
    // Assertion predicate becomes heading
    expect(output).toContain('friends with');
  });

  it('should not show section when no mentions', () => {
    const ir: ProjectIR = {
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [makeEntity('entity_lonely', 'PERSON', 'Lonely Person')],
      assertions: [],
      events: [],
      stats: { entityCount: 1, assertionCount: 0, eventCount: 0 },
    };

    const output = renderEntityPage(ir, 'entity_lonely');

    expect(output).not.toContain('## Mentioned in');
  });

  it('should show paragraph reference when available', () => {
    const ir: ProjectIR = {
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [makeEntity('entity_bilbo', 'PERSON', 'Bilbo')],
      assertions: [],
      events: [
        {
          id: 'event_1',
          type: 'TELL',
          participants: [
            { role: 'SPEAKER', entity: 'entity_bilbo', isRequired: true },
          ],
          time: { type: 'DISCOURSE', chapter: 1, paragraph: 42, sentence: 0 },
          evidence: [makeEvidence('Bilbo spoke of his adventure.', { paragraphIndex: 42 })],
          attribution: makeAttribution(),
          modality: 'FACT',
          confidence: makeConfidence(),
          links: [],
          produces: [],
          extractedFrom: 'pattern',
          derivedFrom: [],
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
      ],
      stats: { entityCount: 1, assertionCount: 0, eventCount: 1 },
    };

    const output = renderEntityPage(ir, 'entity_bilbo');

    expect(output).toContain('[¶42]');
  });
});

// =============================================================================
// PLACE PAGE RENDERER TESTS (A5)
// =============================================================================

describe('renderPlacePage', () => {
  function createPlaceIR(): ProjectIR {
    return {
      projectId: 'test',
      createdAt: new Date().toISOString(),
      entities: [
        makeEntity('entity_hogwarts', 'PLACE', 'Hogwarts'),
        makeEntity('entity_harry', 'PERSON', 'Harry Potter'),
        makeEntity('entity_ron', 'PERSON', 'Ron Weasley'),
        makeEntity('entity_hermione', 'PERSON', 'Hermione Granger'),
        makeEntity('entity_wand', 'ITEM', 'Elder Wand'),
      ],
      assertions: [
        // Harry lives in Hogwarts
        {
          id: 'lives_1',
          assertionType: 'DIRECT' as const,
          subject: 'entity_harry',
          predicate: 'lives_in',
          object: 'entity_hogwarts',
          evidence: [makeEvidence('Harry lived at Hogwarts during school.')],
          attribution: { source: 'NARRATOR', reliability: 0.9, isDialogue: false, isThought: false },
          modality: 'FACT' as const,
          confidence: { extraction: 0.9, identity: 0.9, semantic: 0.9, temporal: 0.9, composite: 0.9 },
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
        // Ron lives in Hogwarts
        {
          id: 'lives_2',
          assertionType: 'DIRECT' as const,
          subject: 'entity_ron',
          predicate: 'lives_in',
          object: 'entity_hogwarts',
          evidence: [makeEvidence('Ron stayed at Hogwarts.')],
          attribution: { source: 'NARRATOR', reliability: 0.9, isDialogue: false, isThought: false },
          modality: 'FACT' as const,
          confidence: { extraction: 0.9, identity: 0.9, semantic: 0.9, temporal: 0.9, composite: 0.9 },
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
      ],
      events: [
        // Hermione moves to Hogwarts (visitor)
        {
          id: 'move_1',
          type: 'MOVE',
          participants: [
            { role: 'MOVER', entity: 'entity_hermione', isRequired: true },
            { role: 'DESTINATION', entity: 'entity_hogwarts', isRequired: true },
          ],
          time: { type: 'DISCOURSE', chapter: 1, paragraph: 10, sentence: 0 },
          evidence: [makeEvidence('Hermione arrived at Hogwarts.')],
          attribution: makeAttribution(),
          modality: 'FACT',
          confidence: makeConfidence(),
          links: [],
          produces: [],
          extractedFrom: 'pattern',
          derivedFrom: [],
          createdAt: new Date().toISOString(),
          compiler_pass: 'test',
        },
      ],
      stats: { entityCount: 5, assertionCount: 2, eventCount: 1 },
    };
  }

  describe('Title Block', () => {
    it('should render place name as title with badge', () => {
      const ir = createPlaceIR();
      const output = renderPlacePage(ir, 'entity_hogwarts');

      expect(output).toContain('# Hogwarts');
      expect(output).toContain('PLACE');
      expect(output).toContain('📍');  // PLACE badge
    });

    it('should return "not found" for missing place', () => {
      const ir = createPlaceIR();
      const output = renderPlacePage(ir, 'entity_nonexistent');

      expect(output).toContain('# Place Not Found');
      expect(output).toContain('entity_nonexistent');
    });
  });

  describe('Residents Section', () => {
    it('should list residents with lives_in assertions', () => {
      const ir = createPlaceIR();
      const output = renderPlacePage(ir, 'entity_hogwarts');

      expect(output).toContain('## Residents');
      // Residents should be cross-linked
      expect(output).toContain('[Harry Potter](entity_harry)');
      expect(output).toContain('[Ron Weasley](entity_ron)');
    });

    it('should show evidence snippet for residents', () => {
      const ir = createPlaceIR();
      const output = renderPlacePage(ir, 'entity_hogwarts');

      expect(output).toContain('Harry lived at Hogwarts');
    });

    it('should not show section when no residents', () => {
      const ir: ProjectIR = {
        projectId: 'test',
        createdAt: new Date().toISOString(),
        entities: [makeEntity('entity_empty', 'PLACE', 'Empty Place')],
        assertions: [],
        events: [],
        stats: { entityCount: 1, assertionCount: 0, eventCount: 0 },
      };

      const output = renderPlacePage(ir, 'entity_empty');

      expect(output).not.toContain('## Residents');
    });
  });

  describe('Visitors Section', () => {
    it('should list visitors from MOVE events', () => {
      const ir = createPlaceIR();
      const output = renderPlacePage(ir, 'entity_hogwarts');

      expect(output).toContain('## Visitors');
      // Visitor should be cross-linked
      expect(output).toContain('[Hermione Granger](entity_hermione)');
    });

    it('should show visit time', () => {
      const ir = createPlaceIR();
      const output = renderPlacePage(ir, 'entity_hogwarts');

      expect(output).toContain('Ch.1 ¶10');
    });

    it('should not show section when no visitors', () => {
      const ir: ProjectIR = {
        projectId: 'test',
        createdAt: new Date().toISOString(),
        entities: [makeEntity('entity_nowhere', 'PLACE', 'Nowhere')],
        assertions: [],
        events: [],
        stats: { entityCount: 1, assertionCount: 0, eventCount: 0 },
      };

      const output = renderPlacePage(ir, 'entity_nowhere');

      expect(output).not.toContain('## Visitors');
    });
  });

  describe('Section Ordering', () => {
    it('should render sections in correct order', () => {
      const ir = createPlaceIR();
      const output = renderPlacePage(ir, 'entity_hogwarts');

      const sections = [
        '# Hogwarts',
        '## Residents',
        '## Visitors',
      ];

      let lastIndex = -1;
      for (const section of sections) {
        const index = output.indexOf(section);
        expect(index).toBeGreaterThan(lastIndex);
        lastIndex = index;
      }
    });
  });

  describe('Debug Section', () => {
    it('should show debug info when enabled', () => {
      const ir = createPlaceIR();
      const output = renderPlacePage(ir, 'entity_hogwarts', { includeDebug: true });

      expect(output).toContain('## Debug');
      expect(output).toContain('### Place metadata');
      expect(output).toContain('Residents: 2');
      expect(output).toContain('Move events to here: 1');
    });
  });
});
