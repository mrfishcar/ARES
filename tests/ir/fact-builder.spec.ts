/**
 * Tests for Fact Builder - derives FactViewRows from events.
 *
 * Test coverage:
 * - located_in facts from MOVE events
 * - alive=false facts from DEATH events
 * - possesses facts from TRANSFER events
 * - Fact deduplication
 * - Query helpers (getCurrentLocation, isAlive, getCurrentPossessions)
 */

import { describe, it, expect } from 'vitest';
import {
  buildFactsFromEvents,
  getCurrentLocation,
  getCurrentPossessions,
  getCurrentHolder,
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
// TRANSFER → possesses TESTS
// =============================================================================

describe('TRANSFER → possesses', () => {
  describe('Receiver gains possession', () => {
    it('should create possesses fact for RECEIVER', () => {
      const event = makeEvent('TRANSFER', [
        { role: 'GIVER', entity: 'entity_harry' },
        { role: 'RECEIVER', entity: 'entity_ron' },
        { role: 'ITEM', entity: 'entity_wand' },
      ]);

      const facts = buildFactsFromEvents([event]);

      const receiverFact = facts.find(
        (f) => f.subject === 'entity_ron' && !f.validUntil
      );
      expect(receiverFact).toBeDefined();
      expect(receiverFact?.predicate).toBe('possesses');
      expect(receiverFact?.object).toBe('entity_wand');
    });

    it('should create possesses fact for TAKER (taking verbs)', () => {
      const event = makeEvent('TRANSFER', [
        { role: 'TAKER', entity: 'entity_thief' },
        { role: 'ITEM', entity: 'entity_gold' },
      ]);

      const facts = buildFactsFromEvents([event]);

      expect(facts).toHaveLength(1);
      expect(facts[0].subject).toBe('entity_thief');
      expect(facts[0].predicate).toBe('possesses');
      expect(facts[0].object).toBe('entity_gold');
    });

    it('should prefer RECEIVER over TAKER if both present', () => {
      const event = makeEvent('TRANSFER', [
        { role: 'TAKER', entity: 'entity_taker' },
        { role: 'RECEIVER', entity: 'entity_receiver' },
        { role: 'ITEM', entity: 'entity_item' },
      ]);

      const facts = buildFactsFromEvents([event]);

      const gainFact = facts.find((f) => !f.validUntil);
      expect(gainFact?.subject).toBe('entity_receiver');
    });

    it('should include derivedFrom pointing to event', () => {
      const event = makeEvent(
        'TRANSFER',
        [
          { role: 'RECEIVER', entity: 'entity_hermione' },
          { role: 'ITEM', entity: 'entity_book' },
        ],
        { id: 'event_transfer_123' }
      );

      const facts = buildFactsFromEvents([event]);

      expect(facts[0].derivedFrom).toContain('event_transfer_123');
    });

    it('should inherit time anchor from event', () => {
      const event = makeEvent(
        'TRANSFER',
        [
          { role: 'RECEIVER', entity: 'entity_neville' },
          { role: 'ITEM', entity: 'entity_remembrall' },
        ],
        { time: makeDiscourseTime(2, 8, 5) }
      );

      const facts = buildFactsFromEvents([event]);

      expect(facts[0].validFrom.type).toBe('DISCOURSE');
      if (facts[0].validFrom.type === 'DISCOURSE') {
        expect(facts[0].validFrom.chapter).toBe(2);
        expect(facts[0].validFrom.paragraph).toBe(8);
      }
    });
  });

  describe('Giver loses possession', () => {
    it('should create validUntil fact for GIVER', () => {
      const event = makeEvent(
        'TRANSFER',
        [
          { role: 'GIVER', entity: 'entity_harry' },
          { role: 'RECEIVER', entity: 'entity_ron' },
          { role: 'ITEM', entity: 'entity_cloak' },
        ],
        { time: makeDiscourseTime(5, 10, 0) }
      );

      const facts = buildFactsFromEvents([event]);

      const giverFact = facts.find((f) => f.subject === 'entity_harry');
      expect(giverFact).toBeDefined();
      expect(giverFact?.predicate).toBe('possesses');
      expect(giverFact?.object).toBe('entity_cloak');
      expect(giverFact?.validUntil).toBeDefined();
      if (giverFact?.validUntil?.type === 'DISCOURSE') {
        expect(giverFact.validUntil.chapter).toBe(5);
        expect(giverFact.validUntil.paragraph).toBe(10);
      }
    });

    it('should set validFrom to UNKNOWN for giver (prior possession inferred)', () => {
      const event = makeEvent('TRANSFER', [
        { role: 'GIVER', entity: 'entity_dumbledore' },
        { role: 'RECEIVER', entity: 'entity_harry' },
        { role: 'ITEM', entity: 'entity_elderWand' },
      ]);

      const facts = buildFactsFromEvents([event]);

      const giverFact = facts.find((f) => f.subject === 'entity_dumbledore');
      expect(giverFact?.validFrom.type).toBe('UNKNOWN');
    });

    it('should have slightly lower confidence for inferred loss', () => {
      const event = makeEvent(
        'TRANSFER',
        [
          { role: 'GIVER', entity: 'entity_ollivander' },
          { role: 'RECEIVER', entity: 'entity_harry' },
          { role: 'ITEM', entity: 'entity_wand' },
        ],
        { confidence: makeConfidence(0.8) }
      );

      const facts = buildFactsFromEvents([event]);

      const receiverFact = facts.find((f) => f.subject === 'entity_harry');
      const giverFact = facts.find((f) => f.subject === 'entity_ollivander');

      expect(receiverFact?.confidence).toBe(0.8);
      expect(giverFact?.confidence).toBeCloseTo(0.72, 5); // 0.8 * 0.9
    });
  });

  describe('Hard constraints', () => {
    it('should not create facts if ITEM is missing', () => {
      const event = makeEvent('TRANSFER', [
        { role: 'GIVER', entity: 'entity_harry' },
        { role: 'RECEIVER', entity: 'entity_ron' },
        // No ITEM
      ]);

      const facts = buildFactsFromEvents([event]);

      expect(facts).toHaveLength(0);
    });

    it('should only create receiver fact if no GIVER', () => {
      const event = makeEvent('TRANSFER', [
        { role: 'RECEIVER', entity: 'entity_harry' },
        { role: 'ITEM', entity: 'entity_letter' },
        // No GIVER
      ]);

      const facts = buildFactsFromEvents([event]);

      expect(facts).toHaveLength(1);
      expect(facts[0].subject).toBe('entity_harry');
      expect(facts[0].validUntil).toBeUndefined();
    });
  });

  describe('Complex transfer chains', () => {
    it('should track possession through multiple transfers', () => {
      const events = [
        makeEvent(
          'TRANSFER',
          [
            { role: 'GIVER', entity: 'entity_harry' },
            { role: 'RECEIVER', entity: 'entity_ron' },
            { role: 'ITEM', entity: 'entity_snitch' },
          ],
          { id: 'transfer_1', time: makeDiscourseTime(1, 0, 0) }
        ),
        makeEvent(
          'TRANSFER',
          [
            { role: 'GIVER', entity: 'entity_ron' },
            { role: 'RECEIVER', entity: 'entity_hermione' },
            { role: 'ITEM', entity: 'entity_snitch' },
          ],
          { id: 'transfer_2', time: makeDiscourseTime(2, 0, 0) }
        ),
      ];

      const facts = buildFactsFromEvents(events);

      // Should have 4 facts: Harry loses, Ron gains, Ron loses, Hermione gains
      expect(facts.length).toBeGreaterThanOrEqual(4);

      // Hermione should currently possess the snitch
      const possessions = getCurrentPossessions(facts, 'entity_hermione');
      expect(possessions).toContain('entity_snitch');

      // Harry and Ron should no longer possess it
      const harryPossessions = getCurrentPossessions(facts, 'entity_harry');
      const ronPossessions = getCurrentPossessions(facts, 'entity_ron');
      expect(harryPossessions).not.toContain('entity_snitch');
      expect(ronPossessions).not.toContain('entity_snitch');
    });
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

  describe('getCurrentPossessions', () => {
    it('should return current possessions', () => {
      const event = makeEvent('TRANSFER', [
        { role: 'RECEIVER', entity: 'entity_harry' },
        { role: 'ITEM', entity: 'entity_wand' },
      ]);

      const facts = buildFactsFromEvents([event]);
      const possessions = getCurrentPossessions(facts, 'entity_harry');

      expect(possessions).toContain('entity_wand');
    });

    it('should return empty for unknown entity', () => {
      const facts = buildFactsFromEvents([]);
      const possessions = getCurrentPossessions(facts, 'entity_unknown');

      expect(possessions).toHaveLength(0);
    });

    it('should exclude items transferred away', () => {
      const events = [
        makeEvent(
          'TRANSFER',
          [
            { role: 'RECEIVER', entity: 'entity_harry' },
            { role: 'ITEM', entity: 'entity_cloak' },
          ],
          { time: makeDiscourseTime(1, 0, 0) }
        ),
        makeEvent(
          'TRANSFER',
          [
            { role: 'GIVER', entity: 'entity_harry' },
            { role: 'RECEIVER', entity: 'entity_dumbledore' },
            { role: 'ITEM', entity: 'entity_cloak' },
          ],
          { time: makeDiscourseTime(2, 0, 0) }
        ),
      ];

      const facts = buildFactsFromEvents(events);
      const harryPossessions = getCurrentPossessions(facts, 'entity_harry');
      const dumbledorePossessions = getCurrentPossessions(facts, 'entity_dumbledore');

      // Harry gave it away
      expect(harryPossessions).not.toContain('entity_cloak');
      // Dumbledore has it now
      expect(dumbledorePossessions).toContain('entity_cloak');
    });

    it('should handle multiple possessions', () => {
      const events = [
        makeEvent('TRANSFER', [
          { role: 'RECEIVER', entity: 'entity_harry' },
          { role: 'ITEM', entity: 'entity_wand' },
        ]),
        makeEvent('TRANSFER', [
          { role: 'RECEIVER', entity: 'entity_harry' },
          { role: 'ITEM', entity: 'entity_cloak' },
        ]),
        makeEvent('TRANSFER', [
          { role: 'RECEIVER', entity: 'entity_harry' },
          { role: 'ITEM', entity: 'entity_map' },
        ]),
      ];

      const facts = buildFactsFromEvents(events);
      const possessions = getCurrentPossessions(facts, 'entity_harry');

      expect(possessions).toHaveLength(3);
      expect(possessions).toContain('entity_wand');
      expect(possessions).toContain('entity_cloak');
      expect(possessions).toContain('entity_map');
    });
  });

  describe('getCurrentHolder (inverse query)', () => {
    it('should return current holder of an item', () => {
      const event = makeEvent('TRANSFER', [
        { role: 'RECEIVER', entity: 'entity_harry' },
        { role: 'ITEM', entity: 'entity_wand' },
      ]);

      const facts = buildFactsFromEvents([event]);
      const result = getCurrentHolder(facts, 'entity_wand');

      expect(result).toEqual({ holder: 'entity_harry' });
    });

    it('should return undefined for unknown item', () => {
      const facts = buildFactsFromEvents([]);
      const result = getCurrentHolder(facts, 'entity_unknown');

      expect(result).toBeUndefined();
    });

    it('should track holder after transfer chain', () => {
      const events = [
        makeEvent(
          'TRANSFER',
          [
            { role: 'GIVER', entity: 'entity_ollivander' },
            { role: 'RECEIVER', entity: 'entity_harry' },
            { role: 'ITEM', entity: 'entity_wand' },
          ],
          { time: makeDiscourseTime(1, 0, 0) }
        ),
        makeEvent(
          'TRANSFER',
          [
            { role: 'GIVER', entity: 'entity_harry' },
            { role: 'RECEIVER', entity: 'entity_ron' },
            { role: 'ITEM', entity: 'entity_wand' },
          ],
          { time: makeDiscourseTime(2, 0, 0) }
        ),
      ];

      const facts = buildFactsFromEvents(events);
      const result = getCurrentHolder(facts, 'entity_wand');

      // Ron should be the current holder
      expect(result).toEqual({ holder: 'entity_ron' });
    });

    it('should return undefined if item was given away and not received', () => {
      const event = makeEvent('TRANSFER', [
        { role: 'GIVER', entity: 'entity_harry' },
        { role: 'ITEM', entity: 'entity_wand' },
        // No receiver - item went somewhere unknown
      ]);

      const facts = buildFactsFromEvents([event]);
      const result = getCurrentHolder(facts, 'entity_wand');

      // No current holder (giver lost it, no one received it)
      expect(result).toBeUndefined();
    });
  });

  describe('Inference flag', () => {
    it('should mark receiver possession as explicit', () => {
      const event = makeEvent('TRANSFER', [
        { role: 'RECEIVER', entity: 'entity_harry' },
        { role: 'ITEM', entity: 'entity_wand' },
      ]);

      const facts = buildFactsFromEvents([event]);

      const receiverFact = facts.find(
        (f) => f.subject === 'entity_harry' && !f.validUntil
      );
      expect(receiverFact?.inference).toBe('explicit');
    });

    it('should mark giver loss as implied_loss', () => {
      const event = makeEvent('TRANSFER', [
        { role: 'GIVER', entity: 'entity_ollivander' },
        { role: 'RECEIVER', entity: 'entity_harry' },
        { role: 'ITEM', entity: 'entity_wand' },
      ]);

      const facts = buildFactsFromEvents([event]);

      const giverFact = facts.find(
        (f) => f.subject === 'entity_ollivander' && f.validUntil
      );
      expect(giverFact?.inference).toBe('implied_loss');
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
