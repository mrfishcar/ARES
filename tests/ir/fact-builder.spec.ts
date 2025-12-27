/**
 * Tests for Fact Builder - derives FactViewRows from events.
 *
 * Test coverage:
 * - located_in facts from MOVE events
 * - alive=false facts from DEATH events
 * - Fact deduplication
 * - Query helpers
 */

import { describe, it, expect } from 'vitest';
import {
  buildFactsFromEvents,
  getCurrentLocation,
  isAlive,
  getFactsForEntity,
  getFactsByPredicate,
} from '../../app/engine/ir/fact-builder';
import type {
  StoryEvent,
  Confidence,
  Attribution,
  EvidenceSpan,
  DiscourseTime,
} from '../../app/engine/ir/types';

// =============================================================================
// TEST HELPERS
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

function makeAttribution(): Attribution {
  return {
    source: 'NARRATOR',
    reliability: 0.9,
    isDialogue: false,
    isThought: false,
  };
}

function makeEvidence(text: string): EvidenceSpan {
  return {
    docId: 'test-doc',
    charStart: 0,
    charEnd: text.length,
    text,
  };
}

function makeDiscourseTime(
  chapter = 0,
  paragraph = 0,
  sentence = 0
): DiscourseTime {
  return {
    type: 'DISCOURSE',
    chapter,
    paragraph,
    sentence,
  };
}

function makeEvent(
  type: string,
  participants: { role: string; entity: string }[],
  opts: Partial<StoryEvent> = {}
): StoryEvent {
  const now = new Date().toISOString();
  return {
    id: opts.id ?? `event_${type.toLowerCase()}_${Date.now()}`,
    type: type as any,
    participants: participants.map((p) => ({
      role: p.role as any,
      entity: p.entity,
      isRequired: true,
    })),
    time: opts.time ?? makeDiscourseTime(),
    location: opts.location,
    evidence: opts.evidence ?? [makeEvidence('Test evidence')],
    attribution: opts.attribution ?? makeAttribution(),
    modality: opts.modality ?? 'FACT',
    confidence: opts.confidence ?? makeConfidence(),
    links: [],
    produces: [],
    extractedFrom: 'pattern',
    derivedFrom: opts.derivedFrom ?? ['assertion_1'],
    createdAt: now,
    compiler_pass: 'test',
  };
}

// =============================================================================
// MOVE → located_in TESTS
// =============================================================================

describe('MOVE → located_in', () => {
  it('should create located_in fact from MOVE event', () => {
    const event = makeEvent('MOVE', [
      { role: 'MOVER', entity: 'entity_harry' },
      { role: 'DESTINATION', entity: 'entity_hogwarts' },
    ]);

    const facts = buildFactsFromEvents([event]);

    expect(facts).toHaveLength(1);
    expect(facts[0].predicate).toBe('located_in');
    expect(facts[0].subject).toBe('entity_harry');
    expect(facts[0].object).toBe('entity_hogwarts');
  });

  it('should include derivedFrom pointing to event', () => {
    const event = makeEvent(
      'MOVE',
      [
        { role: 'MOVER', entity: 'entity_harry' },
        { role: 'DESTINATION', entity: 'entity_hogwarts' },
      ],
      { id: 'event_move_123' }
    );

    const facts = buildFactsFromEvents([event]);

    expect(facts[0].derivedFrom).toContain('event_move_123');
  });

  it('should inherit time anchor from event', () => {
    const event = makeEvent(
      'MOVE',
      [
        { role: 'MOVER', entity: 'entity_harry' },
        { role: 'DESTINATION', entity: 'entity_diagon' },
      ],
      { time: makeDiscourseTime(1, 5, 2) }
    );

    const facts = buildFactsFromEvents([event]);

    expect(facts[0].validFrom.type).toBe('DISCOURSE');
    if (facts[0].validFrom.type === 'DISCOURSE') {
      expect(facts[0].validFrom.chapter).toBe(1);
      expect(facts[0].validFrom.paragraph).toBe(5);
    }
  });

  it('should inherit confidence from event', () => {
    const event = makeEvent(
      'MOVE',
      [
        { role: 'MOVER', entity: 'entity_harry' },
        { role: 'DESTINATION', entity: 'entity_london' },
      ],
      { confidence: makeConfidence(0.75) }
    );

    const facts = buildFactsFromEvents([event]);

    expect(facts[0].confidence).toBe(0.75);
  });

  it('should not create fact if MOVER is missing', () => {
    const event = makeEvent('MOVE', [
      { role: 'DESTINATION', entity: 'entity_hogwarts' },
    ]);

    const facts = buildFactsFromEvents([event]);

    expect(facts).toHaveLength(0);
  });

  it('should not create fact if DESTINATION is missing', () => {
    const event = makeEvent('MOVE', [
      { role: 'MOVER', entity: 'entity_harry' },
    ]);

    const facts = buildFactsFromEvents([event]);

    expect(facts).toHaveLength(0);
  });

  it('should handle multiple MOVE events for same entity', () => {
    const events = [
      makeEvent(
        'MOVE',
        [
          { role: 'MOVER', entity: 'entity_harry' },
          { role: 'DESTINATION', entity: 'entity_privet' },
        ],
        { id: 'move_1', time: makeDiscourseTime(1, 0, 0) }
      ),
      makeEvent(
        'MOVE',
        [
          { role: 'MOVER', entity: 'entity_harry' },
          { role: 'DESTINATION', entity: 'entity_hogwarts' },
        ],
        { id: 'move_2', time: makeDiscourseTime(2, 0, 0) }
      ),
    ];

    const facts = buildFactsFromEvents(events);

    // Should have 2 separate located_in facts (different destinations)
    expect(facts).toHaveLength(2);
    expect(facts.map((f) => f.object)).toContain('entity_privet');
    expect(facts.map((f) => f.object)).toContain('entity_hogwarts');
  });
});

// =============================================================================
// DEATH → alive=false TESTS
// =============================================================================

describe('DEATH → alive=false', () => {
  it('should create alive=false fact from DEATH event', () => {
    const event = makeEvent('DEATH', [
      { role: 'DECEDENT', entity: 'entity_dumbledore' },
    ]);

    const facts = buildFactsFromEvents([event]);

    expect(facts).toHaveLength(1);
    expect(facts[0].predicate).toBe('alive');
    expect(facts[0].subject).toBe('entity_dumbledore');
    expect(facts[0].object).toBe(false);
  });

  it('should include derivedFrom pointing to event', () => {
    const event = makeEvent(
      'DEATH',
      [{ role: 'DECEDENT', entity: 'entity_voldemort' }],
      { id: 'event_death_456' }
    );

    const facts = buildFactsFromEvents([event]);

    expect(facts[0].derivedFrom).toContain('event_death_456');
  });

  it('should inherit time anchor from event', () => {
    const event = makeEvent(
      'DEATH',
      [{ role: 'DECEDENT', entity: 'entity_sirius' }],
      { time: makeDiscourseTime(5, 10, 3) }
    );

    const facts = buildFactsFromEvents([event]);

    expect(facts[0].validFrom.type).toBe('DISCOURSE');
    if (facts[0].validFrom.type === 'DISCOURSE') {
      expect(facts[0].validFrom.chapter).toBe(5);
      expect(facts[0].validFrom.paragraph).toBe(10);
    }
  });

  it('should not have validUntil (death is permanent)', () => {
    const event = makeEvent('DEATH', [
      { role: 'DECEDENT', entity: 'entity_hedwig' },
    ]);

    const facts = buildFactsFromEvents([event]);

    expect(facts[0].validUntil).toBeUndefined();
  });

  it('should also create died_in fact if location is present', () => {
    const event = makeEvent(
      'DEATH',
      [{ role: 'DECEDENT', entity: 'entity_fred' }],
      { location: 'entity_hogwarts' }
    );

    const facts = buildFactsFromEvents([event]);

    expect(facts).toHaveLength(2);

    const aliveFact = facts.find((f) => f.predicate === 'alive');
    const diedInFact = facts.find((f) => f.predicate === 'died_in');

    expect(aliveFact).toBeDefined();
    expect(aliveFact?.object).toBe(false);

    expect(diedInFact).toBeDefined();
    expect(diedInFact?.object).toBe('entity_hogwarts');
  });
});

// =============================================================================
// DEDUPLICATION TESTS
// =============================================================================

describe('Fact Deduplication', () => {
  it('should dedupe identical facts and merge derivedFrom', () => {
    const events = [
      makeEvent(
        'MOVE',
        [
          { role: 'MOVER', entity: 'entity_harry' },
          { role: 'DESTINATION', entity: 'entity_hogwarts' },
        ],
        { id: 'move_1', time: makeDiscourseTime(1, 0, 0) }
      ),
      makeEvent(
        'MOVE',
        [
          { role: 'MOVER', entity: 'entity_harry' },
          { role: 'DESTINATION', entity: 'entity_hogwarts' },
        ],
        { id: 'move_2', time: makeDiscourseTime(1, 5, 0) }
      ),
    ];

    const facts = buildFactsFromEvents(events);

    // Should be deduped to 1 fact
    expect(facts).toHaveLength(1);

    // derivedFrom should include both event IDs
    expect(facts[0].derivedFrom).toHaveLength(2);
    expect(facts[0].derivedFrom).toContain('move_1');
    expect(facts[0].derivedFrom).toContain('move_2');
  });

  it('should keep highest confidence when deduping', () => {
    const events = [
      makeEvent(
        'DEATH',
        [{ role: 'DECEDENT', entity: 'entity_sirius' }],
        { id: 'death_1', confidence: makeConfidence(0.6) }
      ),
      makeEvent(
        'DEATH',
        [{ role: 'DECEDENT', entity: 'entity_sirius' }],
        { id: 'death_2', confidence: makeConfidence(0.9) }
      ),
    ];

    const facts = buildFactsFromEvents(events);

    expect(facts).toHaveLength(1);
    expect(facts[0].confidence).toBe(0.9);
  });

  it('should keep most recent validFrom when deduping', () => {
    const events = [
      makeEvent(
        'MOVE',
        [
          { role: 'MOVER', entity: 'entity_ron' },
          { role: 'DESTINATION', entity: 'entity_burrow' },
        ],
        { id: 'move_early', time: makeDiscourseTime(1, 0, 0) }
      ),
      makeEvent(
        'MOVE',
        [
          { role: 'MOVER', entity: 'entity_ron' },
          { role: 'DESTINATION', entity: 'entity_burrow' },
        ],
        { id: 'move_late', time: makeDiscourseTime(5, 10, 0) }
      ),
    ];

    const facts = buildFactsFromEvents(events);

    expect(facts).toHaveLength(1);
    if (facts[0].validFrom.type === 'DISCOURSE') {
      expect(facts[0].validFrom.chapter).toBe(5);
      expect(facts[0].validFrom.paragraph).toBe(10);
    }
  });

  it('should generate deterministic fact IDs', () => {
    const events = [
      makeEvent(
        'MOVE',
        [
          { role: 'MOVER', entity: 'entity_harry' },
          { role: 'DESTINATION', entity: 'entity_hogwarts' },
        ],
        { id: 'move_test' }
      ),
    ];

    // Run twice
    const facts1 = buildFactsFromEvents(events);
    const facts2 = buildFactsFromEvents(events);

    // Same ID both times
    expect(facts1[0].id).toBe(facts2[0].id);
    expect(facts1[0].id).toMatch(/^fact_located_in_[a-f0-9]{16}$/);
  });
});

// =============================================================================
// QUERY HELPER TESTS
// =============================================================================

describe('Query Helpers', () => {
  describe('getCurrentLocation', () => {
    it('should return most recent location', () => {
      const events = [
        makeEvent(
          'MOVE',
          [
            { role: 'MOVER', entity: 'entity_harry' },
            { role: 'DESTINATION', entity: 'entity_privet' },
          ],
          { time: makeDiscourseTime(1, 0, 0) }
        ),
        makeEvent(
          'MOVE',
          [
            { role: 'MOVER', entity: 'entity_harry' },
            { role: 'DESTINATION', entity: 'entity_hogwarts' },
          ],
          { time: makeDiscourseTime(2, 0, 0) }
        ),
      ];

      const facts = buildFactsFromEvents(events);
      const location = getCurrentLocation(facts, 'entity_harry');

      expect(location).toBe('entity_hogwarts');
    });

    it('should return undefined if no location facts', () => {
      const facts = buildFactsFromEvents([]);
      const location = getCurrentLocation(facts, 'entity_unknown');

      expect(location).toBeUndefined();
    });
  });

  describe('isAlive', () => {
    it('should return true if no death fact', () => {
      const facts = buildFactsFromEvents([]);
      expect(isAlive(facts, 'entity_harry')).toBe(true);
    });

    it('should return false if death fact exists', () => {
      const event = makeEvent('DEATH', [
        { role: 'DECEDENT', entity: 'entity_voldemort' },
      ]);

      const facts = buildFactsFromEvents([event]);

      expect(isAlive(facts, 'entity_voldemort')).toBe(false);
    });

    it('should return true for unrelated entity', () => {
      const event = makeEvent('DEATH', [
        { role: 'DECEDENT', entity: 'entity_voldemort' },
      ]);

      const facts = buildFactsFromEvents([event]);

      expect(isAlive(facts, 'entity_harry')).toBe(true);
    });
  });

  describe('getFactsForEntity', () => {
    it('should return facts where entity is subject', () => {
      const events = [
        makeEvent('MOVE', [
          { role: 'MOVER', entity: 'entity_harry' },
          { role: 'DESTINATION', entity: 'entity_hogwarts' },
        ]),
        makeEvent('DEATH', [
          { role: 'DECEDENT', entity: 'entity_voldemort' },
        ]),
      ];

      const facts = buildFactsFromEvents(events);
      const harryFacts = getFactsForEntity(facts, 'entity_harry');

      expect(harryFacts).toHaveLength(1);
      expect(harryFacts[0].subject).toBe('entity_harry');
    });

    it('should return facts where entity is object', () => {
      const events = [
        makeEvent('MOVE', [
          { role: 'MOVER', entity: 'entity_harry' },
          { role: 'DESTINATION', entity: 'entity_hogwarts' },
        ]),
      ];

      const facts = buildFactsFromEvents(events);
      const hogwartsFacts = getFactsForEntity(facts, 'entity_hogwarts');

      expect(hogwartsFacts).toHaveLength(1);
      expect(hogwartsFacts[0].object).toBe('entity_hogwarts');
    });
  });

  describe('getFactsByPredicate', () => {
    it('should filter facts by predicate', () => {
      const events = [
        makeEvent('MOVE', [
          { role: 'MOVER', entity: 'entity_harry' },
          { role: 'DESTINATION', entity: 'entity_hogwarts' },
        ]),
        makeEvent('DEATH', [
          { role: 'DECEDENT', entity: 'entity_voldemort' },
        ]),
      ];

      const facts = buildFactsFromEvents(events);
      const aliveFacts = getFactsByPredicate(facts, 'alive');

      expect(aliveFacts).toHaveLength(1);
      expect(aliveFacts[0].predicate).toBe('alive');
    });
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
  it('should handle empty events array', () => {
    const facts = buildFactsFromEvents([]);
    expect(facts).toHaveLength(0);
  });

  it('should skip events without matching type', () => {
    const event = makeEvent('TELL', [
      { role: 'SPEAKER', entity: 'entity_gandalf' },
    ]);

    const facts = buildFactsFromEvents([event]);

    expect(facts).toHaveLength(0);
  });

  it('should handle mixed event types', () => {
    const events = [
      makeEvent('MOVE', [
        { role: 'MOVER', entity: 'entity_harry' },
        { role: 'DESTINATION', entity: 'entity_hogwarts' },
      ]),
      makeEvent('TELL', [
        { role: 'SPEAKER', entity: 'entity_dumbledore' },
      ]),
      makeEvent('DEATH', [
        { role: 'DECEDENT', entity: 'entity_voldemort' },
      ]),
    ];

    const facts = buildFactsFromEvents(events);

    // MOVE → 1 fact, TELL → 0 facts, DEATH → 1 fact
    expect(facts).toHaveLength(2);
  });
});
