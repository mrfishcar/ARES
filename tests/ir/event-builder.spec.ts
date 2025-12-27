/**
 * Tests for Event Builder - compiler pass that derives events from assertions.
 *
 * Test coverage:
 * - Event extraction for each type (MOVE, TELL, DEATH, LEARN, PROMISE, ATTACK, MEET)
 * - Modality inheritance
 * - Evidence span preservation
 * - derivedFrom provenance
 * - Deduplication
 * - Timeline ordering
 */

import { describe, it, expect } from 'vitest';
import {
  extractEventCandidates,
  normalizeAndDedupe,
  attachTimeAnchors,
  buildEvents,
  EventCandidate,
  DocOrderInfo,
  MOVE_PREDICATES,
  TELL_PREDICATES,
  DEATH_PREDICATES,
} from '../../app/engine/ir/event-builder';
import type {
  Assertion,
  Entity,
  EntityId,
  StoryEvent,
  Confidence,
  Attribution,
  EvidenceSpan,
  Modality,
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

function makeEvidence(
  text: string,
  opts: Partial<EvidenceSpan> = {}
): EvidenceSpan {
  return {
    docId: opts.docId ?? 'test-doc',
    charStart: opts.charStart ?? 0,
    charEnd: opts.charEnd ?? text.length,
    paragraphIndex: opts.paragraphIndex ?? 0,
    sentenceIndex: opts.sentenceIndex ?? 0,
    text,
    ...opts,
  };
}

function makeAssertion(
  opts: Partial<Assertion> & { subject: EntityId; predicate: string }
): Assertion {
  const now = new Date().toISOString();
  return {
    id: opts.id ?? `assertion_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    assertionType: opts.assertionType ?? 'DIRECT',
    subject: opts.subject,
    predicate: opts.predicate,
    object: opts.object,
    evidence: opts.evidence ?? [makeEvidence('Test evidence')],
    attribution: opts.attribution ?? makeAttribution(),
    modality: opts.modality ?? 'FACT',
    confidence: opts.confidence ?? makeConfidence(),
    createdAt: now,
    compiler_pass: 'test',
  };
}

function makeEntity(id: EntityId, type: string, canonical: string): Entity {
  const now = new Date().toISOString();
  return {
    id,
    type: type as any,
    canonical,
    aliases: [canonical],
    createdAt: now,
    updatedAt: now,
    attrs: {},
    evidence: [],
    confidence: makeConfidence(),
  };
}

function makeEntityMap(entities: Entity[]): Map<EntityId, Entity> {
  const map = new Map<EntityId, Entity>();
  for (const e of entities) {
    map.set(e.id, e);
  }
  return map;
}

// =============================================================================
// PREDICATE SET TESTS
// =============================================================================

describe('Predicate Sets', () => {
  it('should have MOVE predicates defined', () => {
    expect(MOVE_PREDICATES.has('traveled_to')).toBe(true);
    expect(MOVE_PREDICATES.has('went_to')).toBe(true);
    expect(MOVE_PREDICATES.has('arrived_at')).toBe(true);
    expect(MOVE_PREDICATES.has('left')).toBe(true);
  });

  it('should have TELL predicates defined', () => {
    expect(TELL_PREDICATES.has('told')).toBe(true);
    expect(TELL_PREDICATES.has('said')).toBe(true);
    expect(TELL_PREDICATES.has('asked')).toBe(true);
  });

  it('should have DEATH predicates defined', () => {
    expect(DEATH_PREDICATES.has('died')).toBe(true);
    expect(DEATH_PREDICATES.has('killed')).toBe(true);
    expect(DEATH_PREDICATES.has('murdered')).toBe(true);
  });
});

// =============================================================================
// MOVE EVENT TESTS
// =============================================================================

describe('MOVE Event Extraction', () => {
  it('should create MOVE event from traveled_to predicate', () => {
    const entities = [
      makeEntity('entity_harry', 'PERSON', 'Harry Potter'),
      makeEntity('entity_hogwarts', 'PLACE', 'Hogwarts'),
    ];
    const entityMap = makeEntityMap(entities);

    const assertion = makeAssertion({
      id: 'assertion_move_1',
      subject: 'entity_harry',
      predicate: 'traveled_to',
      object: 'entity_hogwarts',
      evidence: [makeEvidence('Harry traveled to Hogwarts')],
    });

    const candidates = extractEventCandidates([assertion], entityMap);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe('MOVE');
    expect(candidates[0].participants).toHaveLength(2);
    expect(candidates[0].participants[0].role).toBe('MOVER');
    expect(candidates[0].participants[0].entity).toBe('entity_harry');
    expect(candidates[0].participants[1].role).toBe('DESTINATION');
    expect(candidates[0].participants[1].entity).toBe('entity_hogwarts');
  });

  it('should include evidence spans in MOVE event', () => {
    const entities = [
      makeEntity('entity_harry', 'PERSON', 'Harry Potter'),
      makeEntity('entity_london', 'PLACE', 'London'),
    ];
    const entityMap = makeEntityMap(entities);

    const evidence = makeEvidence('Harry went to London yesterday', {
      paragraphIndex: 5,
      sentenceIndex: 2,
    });

    const assertion = makeAssertion({
      subject: 'entity_harry',
      predicate: 'went_to',
      object: 'entity_london',
      evidence: [evidence],
    });

    const candidates = extractEventCandidates([assertion], entityMap);

    expect(candidates[0].evidence).toHaveLength(1);
    expect(candidates[0].evidence[0].text).toBe('Harry went to London yesterday');
    expect(candidates[0].evidence[0].paragraphIndex).toBe(5);
  });

  it('should inherit modality from assertion', () => {
    const entities = [
      makeEntity('entity_frodo', 'PERSON', 'Frodo'),
      makeEntity('entity_mordor', 'PLACE', 'Mordor'),
    ];
    const entityMap = makeEntityMap(entities);

    const assertion = makeAssertion({
      subject: 'entity_frodo',
      predicate: 'traveled_to',
      object: 'entity_mordor',
      modality: 'BELIEF',
    });

    const candidates = extractEventCandidates([assertion], entityMap);

    expect(candidates[0].modality).toBe('BELIEF');
  });

  it('should include derivedFrom with assertion ID', () => {
    const entities = [
      makeEntity('entity_gandalf', 'PERSON', 'Gandalf'),
      makeEntity('entity_shire', 'PLACE', 'The Shire'),
    ];
    const entityMap = makeEntityMap(entities);

    const assertion = makeAssertion({
      id: 'assertion_gandalf_move',
      subject: 'entity_gandalf',
      predicate: 'arrived_at',
      object: 'entity_shire',
    });

    const candidates = extractEventCandidates([assertion], entityMap);

    expect(candidates[0].derivedFrom).toContain('assertion_gandalf_move');
  });
});

// =============================================================================
// DEATH EVENT TESTS
// =============================================================================

describe('DEATH Event Extraction', () => {
  it('should create DEATH event from died predicate', () => {
    const entities = [makeEntity('entity_dumbledore', 'PERSON', 'Dumbledore')];
    const entityMap = makeEntityMap(entities);

    const assertion = makeAssertion({
      id: 'assertion_death_1',
      subject: 'entity_dumbledore',
      predicate: 'died',
      evidence: [makeEvidence('Dumbledore died that night')],
    });

    const candidates = extractEventCandidates([assertion], entityMap);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe('DEATH');
    expect(candidates[0].participants).toHaveLength(1);
    expect(candidates[0].participants[0].role).toBe('DECEDENT');
    expect(candidates[0].participants[0].entity).toBe('entity_dumbledore');
  });

  it('should create DEATH event from killed predicate with killer', () => {
    const entities = [
      makeEntity('entity_snape', 'PERSON', 'Snape'),
      makeEntity('entity_dumbledore', 'PERSON', 'Dumbledore'),
    ];
    const entityMap = makeEntityMap(entities);

    const assertion = makeAssertion({
      subject: 'entity_snape',
      predicate: 'killed',
      object: 'entity_dumbledore',
      evidence: [makeEvidence('Snape killed Dumbledore')],
    });

    const candidates = extractEventCandidates([assertion], entityMap);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe('DEATH');

    // Killer should be KILLER, decedent should be DECEDENT
    const killerParticipant = candidates[0].participants.find(
      (p) => p.role === 'KILLER'
    );
    const decedentParticipant = candidates[0].participants.find(
      (p) => p.role === 'DECEDENT'
    );

    expect(killerParticipant?.entity).toBe('entity_snape');
    expect(decedentParticipant?.entity).toBe('entity_dumbledore');
  });

  it('should inherit RUMOR modality for rumored death', () => {
    const entities = [makeEntity('entity_sirius', 'PERSON', 'Sirius Black')];
    const entityMap = makeEntityMap(entities);

    const assertion = makeAssertion({
      subject: 'entity_sirius',
      predicate: 'died',
      modality: 'RUMOR',
      evidence: [makeEvidence('Sirius Black was rumored to have died')],
    });

    const candidates = extractEventCandidates([assertion], entityMap);

    expect(candidates[0].modality).toBe('RUMOR');
  });
});

// =============================================================================
// TELL EVENT TESTS
// =============================================================================

describe('TELL Event Extraction', () => {
  it('should create TELL event from told predicate', () => {
    const entities = [
      makeEntity('entity_hagrid', 'PERSON', 'Hagrid'),
      makeEntity('entity_harry', 'PERSON', 'Harry'),
    ];
    const entityMap = makeEntityMap(entities);

    const assertion = makeAssertion({
      subject: 'entity_hagrid',
      predicate: 'told',
      object: 'entity_harry',
      evidence: [makeEvidence('Hagrid told Harry the truth')],
    });

    const candidates = extractEventCandidates([assertion], entityMap);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe('TELL');

    const speaker = candidates[0].participants.find((p) => p.role === 'SPEAKER');
    const addressee = candidates[0].participants.find(
      (p) => p.role === 'ADDRESSEE'
    );

    expect(speaker?.entity).toBe('entity_hagrid');
    expect(addressee?.entity).toBe('entity_harry');
  });

  it('should use attribution.character as speaker when available', () => {
    const entities = [
      makeEntity('entity_ron', 'PERSON', 'Ron'),
      makeEntity('entity_hermione', 'PERSON', 'Hermione'),
    ];
    const entityMap = makeEntityMap(entities);

    const assertion = makeAssertion({
      subject: 'entity_hermione', // Subject is Hermione
      predicate: 'said',
      object: 'entity_ron',
      attribution: {
        source: 'CHARACTER',
        character: 'entity_ron', // But attribution says Ron is the speaker
        reliability: 0.8,
        isDialogue: true,
        isThought: false,
      },
      evidence: [makeEvidence('"I know," said Ron to Hermione')],
    });

    const candidates = extractEventCandidates([assertion], entityMap);

    // Speaker should be Ron (from attribution), not Hermione (from subject)
    const speaker = candidates[0].participants.find((p) => p.role === 'SPEAKER');
    expect(speaker?.entity).toBe('entity_ron');
  });

  it('should extract quoted content', () => {
    const entities = [makeEntity('entity_gandalf', 'PERSON', 'Gandalf')];
    const entityMap = makeEntityMap(entities);

    const assertion = makeAssertion({
      subject: 'entity_gandalf',
      predicate: 'said',
      evidence: [makeEvidence('Gandalf said "You shall not pass!"')],
    });

    const candidates = extractEventCandidates([assertion], entityMap);

    expect(candidates[0].content).toBe('You shall not pass!');
  });
});

// =============================================================================
// LEARN EVENT TESTS
// =============================================================================

describe('LEARN Event Extraction', () => {
  it('should create LEARN event from discovered predicate', () => {
    const entities = [
      makeEntity('entity_harry', 'PERSON', 'Harry'),
      makeEntity('entity_secret', 'CONCEPT', 'The Secret'),
    ];
    const entityMap = makeEntityMap(entities);

    const assertion = makeAssertion({
      subject: 'entity_harry',
      predicate: 'discovered',
      object: 'entity_secret',
    });

    const candidates = extractEventCandidates([assertion], entityMap);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe('LEARN');

    const learner = candidates[0].participants.find(
      (p) => p.role === 'LEARNER'
    );
    expect(learner?.entity).toBe('entity_harry');
  });
});

// =============================================================================
// PROMISE EVENT TESTS
// =============================================================================

describe('PROMISE Event Extraction', () => {
  it('should create PROMISE event from promised predicate', () => {
    const entities = [
      makeEntity('entity_snape', 'PERSON', 'Snape'),
      makeEntity('entity_dumbledore', 'PERSON', 'Dumbledore'),
    ];
    const entityMap = makeEntityMap(entities);

    const assertion = makeAssertion({
      subject: 'entity_snape',
      predicate: 'promised',
      object: 'entity_dumbledore',
      evidence: [makeEvidence('Snape promised Dumbledore to protect Harry')],
    });

    const candidates = extractEventCandidates([assertion], entityMap);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe('PROMISE');

    const promiser = candidates[0].participants.find((p) => p.role === 'PROMISER');
    const beneficiary = candidates[0].participants.find(
      (p) => p.role === 'BENEFICIARY'
    );

    expect(promiser?.entity).toBe('entity_snape');
    expect(beneficiary?.entity).toBe('entity_dumbledore');
  });
});

// =============================================================================
// ATTACK EVENT TESTS
// =============================================================================

describe('ATTACK Event Extraction', () => {
  it('should create ATTACK event from attacked predicate', () => {
    const entities = [
      makeEntity('entity_voldemort', 'PERSON', 'Voldemort'),
      makeEntity('entity_harry', 'PERSON', 'Harry'),
    ];
    const entityMap = makeEntityMap(entities);

    const assertion = makeAssertion({
      subject: 'entity_voldemort',
      predicate: 'attacked',
      object: 'entity_harry',
    });

    const candidates = extractEventCandidates([assertion], entityMap);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe('ATTACK');

    const attacker = candidates[0].participants.find((p) => p.role === 'ATTACKER');
    const target = candidates[0].participants.find((p) => p.role === 'TARGET');

    expect(attacker?.entity).toBe('entity_voldemort');
    expect(target?.entity).toBe('entity_harry');
  });
});

// =============================================================================
// MEET EVENT TESTS
// =============================================================================

describe('MEET Event Extraction', () => {
  it('should create MEET event from met predicate', () => {
    const entities = [
      makeEntity('entity_harry', 'PERSON', 'Harry'),
      makeEntity('entity_ron', 'PERSON', 'Ron'),
    ];
    const entityMap = makeEntityMap(entities);

    const assertion = makeAssertion({
      subject: 'entity_harry',
      predicate: 'met',
      object: 'entity_ron',
      evidence: [makeEvidence('Harry met Ron on the train')],
    });

    const candidates = extractEventCandidates([assertion], entityMap);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe('MEET');

    const personA = candidates[0].participants.find((p) => p.role === 'PERSON_A');
    const personB = candidates[0].participants.find((p) => p.role === 'PERSON_B');

    expect(personA?.entity).toBe('entity_harry');
    expect(personB?.entity).toBe('entity_ron');
  });
});

// =============================================================================
// DEDUPLICATION TESTS
// =============================================================================

describe('Event Deduplication', () => {
  it('should dedupe events with same type, participants, and paragraph', () => {
    const evidence1 = makeEvidence('Harry traveled to Hogwarts.', {
      paragraphIndex: 3,
    });
    const evidence2 = makeEvidence('Harry went to Hogwarts that day.', {
      paragraphIndex: 3,
    });

    const candidates: EventCandidate[] = [
      {
        type: 'MOVE',
        participants: [
          { role: 'AGENT', entity: 'entity_harry', isRequired: true },
          { role: 'DESTINATION', entity: 'entity_hogwarts', isRequired: true },
        ],
        evidence: [evidence1],
        derivedFrom: ['assertion_1'],
        modality: 'FACT',
        confidence: makeConfidence(),
        attribution: makeAttribution(),
        docId: 'test-doc',
        discoursePosition: { paragraphIndex: 3, charStart: 0 },
      },
      {
        type: 'MOVE',
        participants: [
          { role: 'AGENT', entity: 'entity_harry', isRequired: true },
          { role: 'DESTINATION', entity: 'entity_hogwarts', isRequired: true },
        ],
        evidence: [evidence2],
        derivedFrom: ['assertion_2'],
        modality: 'FACT',
        confidence: makeConfidence(),
        attribution: makeAttribution(),
        docId: 'test-doc',
        discoursePosition: { paragraphIndex: 3, charStart: 50 },
      },
    ];

    const events = normalizeAndDedupe(candidates);

    expect(events).toHaveLength(1);
    expect(events[0].evidence).toHaveLength(2);
    expect(events[0].derivedFrom).toHaveLength(2);
    expect(events[0].derivedFrom).toContain('assertion_1');
    expect(events[0].derivedFrom).toContain('assertion_2');
  });

  it('should NOT dedupe events in different paragraphs', () => {
    const candidates: EventCandidate[] = [
      {
        type: 'MOVE',
        participants: [
          { role: 'AGENT', entity: 'entity_harry', isRequired: true },
          { role: 'DESTINATION', entity: 'entity_hogwarts', isRequired: true },
        ],
        evidence: [makeEvidence('text1', { paragraphIndex: 1 })],
        derivedFrom: ['assertion_1'],
        modality: 'FACT',
        confidence: makeConfidence(),
        attribution: makeAttribution(),
        docId: 'test-doc',
        discoursePosition: { paragraphIndex: 1, charStart: 0 },
      },
      {
        type: 'MOVE',
        participants: [
          { role: 'AGENT', entity: 'entity_harry', isRequired: true },
          { role: 'DESTINATION', entity: 'entity_hogwarts', isRequired: true },
        ],
        evidence: [makeEvidence('text2', { paragraphIndex: 5 })],
        derivedFrom: ['assertion_2'],
        modality: 'FACT',
        confidence: makeConfidence(),
        attribution: makeAttribution(),
        docId: 'test-doc',
        discoursePosition: { paragraphIndex: 5, charStart: 0 },
      },
    ];

    const events = normalizeAndDedupe(candidates);

    expect(events).toHaveLength(2);
  });

  it('should NOT dedupe events with different participants', () => {
    const candidates: EventCandidate[] = [
      {
        type: 'MOVE',
        participants: [
          { role: 'AGENT', entity: 'entity_harry', isRequired: true },
          { role: 'DESTINATION', entity: 'entity_hogwarts', isRequired: true },
        ],
        evidence: [makeEvidence('text1', { paragraphIndex: 1 })],
        derivedFrom: ['assertion_1'],
        modality: 'FACT',
        confidence: makeConfidence(),
        attribution: makeAttribution(),
        docId: 'test-doc',
        discoursePosition: { paragraphIndex: 1, charStart: 0 },
      },
      {
        type: 'MOVE',
        participants: [
          { role: 'AGENT', entity: 'entity_ron', isRequired: true }, // Different person
          { role: 'DESTINATION', entity: 'entity_hogwarts', isRequired: true },
        ],
        evidence: [makeEvidence('text2', { paragraphIndex: 1 })],
        derivedFrom: ['assertion_2'],
        modality: 'FACT',
        confidence: makeConfidence(),
        attribution: makeAttribution(),
        docId: 'test-doc',
        discoursePosition: { paragraphIndex: 1, charStart: 0 },
      },
    ];

    const events = normalizeAndDedupe(candidates);

    expect(events).toHaveLength(2);
  });

  it('should select best modality when deduping', () => {
    const candidates: EventCandidate[] = [
      {
        type: 'DEATH',
        participants: [
          { role: 'PATIENT', entity: 'entity_sirius', isRequired: true },
        ],
        evidence: [makeEvidence('text1', { paragraphIndex: 1 })],
        derivedFrom: ['assertion_1'],
        modality: 'RUMOR', // Less certain
        confidence: makeConfidence(),
        attribution: makeAttribution(),
        docId: 'test-doc',
        discoursePosition: { paragraphIndex: 1, charStart: 0 },
      },
      {
        type: 'DEATH',
        participants: [
          { role: 'PATIENT', entity: 'entity_sirius', isRequired: true },
        ],
        evidence: [makeEvidence('text2', { paragraphIndex: 1 })],
        derivedFrom: ['assertion_2'],
        modality: 'FACT', // More certain
        confidence: makeConfidence(),
        attribution: makeAttribution(),
        docId: 'test-doc',
        discoursePosition: { paragraphIndex: 1, charStart: 0 },
      },
    ];

    const events = normalizeAndDedupe(candidates);

    expect(events).toHaveLength(1);
    expect(events[0].modality).toBe('RUMOR'); // Safest modality selected (max uncertainty)
  });

  it('should track all observed modalities when deduping', () => {
    const candidates: EventCandidate[] = [
      {
        type: 'DEATH',
        participants: [
          { role: 'DECEDENT', entity: 'entity_sirius', isRequired: true },
        ],
        evidence: [makeEvidence('text1', { paragraphIndex: 1 })],
        derivedFrom: ['assertion_1'],
        modality: 'RUMOR',
        confidence: makeConfidence(),
        attribution: makeAttribution(),
        docId: 'test-doc',
        discoursePosition: { paragraphIndex: 1, charStart: 0 },
      },
      {
        type: 'DEATH',
        participants: [
          { role: 'DECEDENT', entity: 'entity_sirius', isRequired: true },
        ],
        evidence: [makeEvidence('text2', { paragraphIndex: 1 })],
        derivedFrom: ['assertion_2'],
        modality: 'FACT',
        confidence: makeConfidence(),
        attribution: makeAttribution(),
        docId: 'test-doc',
        discoursePosition: { paragraphIndex: 1, charStart: 0 },
      },
      {
        type: 'DEATH',
        participants: [
          { role: 'DECEDENT', entity: 'entity_sirius', isRequired: true },
        ],
        evidence: [makeEvidence('text3', { paragraphIndex: 1 })],
        derivedFrom: ['assertion_3'],
        modality: 'BELIEF',
        confidence: makeConfidence(),
        attribution: makeAttribution(),
        docId: 'test-doc',
        discoursePosition: { paragraphIndex: 1, charStart: 0 },
      },
    ];

    const events = normalizeAndDedupe(candidates);

    expect(events).toHaveLength(1);
    // modalitiesObserved should contain all three observed modalities
    expect(events[0].modalitiesObserved).toBeDefined();
    expect(events[0].modalitiesObserved).toContain('RUMOR');
    expect(events[0].modalitiesObserved).toContain('FACT');
    expect(events[0].modalitiesObserved).toContain('BELIEF');
    expect(events[0].modalitiesObserved).toHaveLength(3);
    // Merged modality should still be RUMOR (safest)
    expect(events[0].modality).toBe('RUMOR');
  });
});

// =============================================================================
// TIME ANCHOR TESTS
// =============================================================================

describe('Time Anchor Attachment', () => {
  it('should attach discourse time to events', () => {
    const events: StoryEvent[] = [
      {
        id: 'event_1',
        type: 'MOVE',
        participants: [],
        time: { type: 'UNKNOWN' },
        evidence: [
          makeEvidence('text', { docId: 'chapter1', paragraphIndex: 5 }),
        ],
        attribution: makeAttribution(),
        modality: 'FACT',
        confidence: makeConfidence(),
        links: [],
        produces: [],
        extractedFrom: 'pattern',
        derivedFrom: ['a1'],
        createdAt: new Date().toISOString(),
        compiler_pass: 'test',
      },
    ];

    const docOrder: DocOrderInfo[] = [{ docId: 'chapter1', orderIndex: 0 }];

    const timedEvents = attachTimeAnchors(events, docOrder);

    expect(timedEvents[0].time.type).toBe('DISCOURSE');
    if (timedEvents[0].time.type === 'DISCOURSE') {
      expect(timedEvents[0].time.chapter).toBe(0);
      expect(timedEvents[0].time.paragraph).toBe(5);
    }
  });

  it('should sort events by discourse position', () => {
    const events: StoryEvent[] = [
      {
        id: 'event_later',
        type: 'MOVE',
        participants: [],
        time: { type: 'UNKNOWN' },
        evidence: [
          makeEvidence('later', { docId: 'chapter1', paragraphIndex: 10 }),
        ],
        attribution: makeAttribution(),
        modality: 'FACT',
        confidence: makeConfidence(),
        links: [],
        produces: [],
        extractedFrom: 'pattern',
        derivedFrom: ['a1'],
        createdAt: new Date().toISOString(),
        compiler_pass: 'test',
      },
      {
        id: 'event_earlier',
        type: 'DEATH',
        participants: [],
        time: { type: 'UNKNOWN' },
        evidence: [
          makeEvidence('earlier', { docId: 'chapter1', paragraphIndex: 2 }),
        ],
        attribution: makeAttribution(),
        modality: 'FACT',
        confidence: makeConfidence(),
        links: [],
        produces: [],
        extractedFrom: 'pattern',
        derivedFrom: ['a2'],
        createdAt: new Date().toISOString(),
        compiler_pass: 'test',
      },
    ];

    const docOrder: DocOrderInfo[] = [{ docId: 'chapter1', orderIndex: 0 }];

    const timedEvents = attachTimeAnchors(events, docOrder);

    expect(timedEvents[0].id).toBe('event_earlier');
    expect(timedEvents[1].id).toBe('event_later');
  });

  it('should handle multi-document ordering', () => {
    const events: StoryEvent[] = [
      {
        id: 'event_ch2',
        type: 'MOVE',
        participants: [],
        time: { type: 'UNKNOWN' },
        evidence: [
          makeEvidence('ch2', { docId: 'chapter2', paragraphIndex: 1 }),
        ],
        attribution: makeAttribution(),
        modality: 'FACT',
        confidence: makeConfidence(),
        links: [],
        produces: [],
        extractedFrom: 'pattern',
        derivedFrom: ['a1'],
        createdAt: new Date().toISOString(),
        compiler_pass: 'test',
      },
      {
        id: 'event_ch1',
        type: 'DEATH',
        participants: [],
        time: { type: 'UNKNOWN' },
        evidence: [
          makeEvidence('ch1', { docId: 'chapter1', paragraphIndex: 100 }),
        ],
        attribution: makeAttribution(),
        modality: 'FACT',
        confidence: makeConfidence(),
        links: [],
        produces: [],
        extractedFrom: 'pattern',
        derivedFrom: ['a2'],
        createdAt: new Date().toISOString(),
        compiler_pass: 'test',
      },
    ];

    const docOrder: DocOrderInfo[] = [
      { docId: 'chapter1', orderIndex: 0 },
      { docId: 'chapter2', orderIndex: 1 },
    ];

    const timedEvents = attachTimeAnchors(events, docOrder);

    // chapter1 (orderIndex 0) should come before chapter2 (orderIndex 1)
    expect(timedEvents[0].id).toBe('event_ch1');
    expect(timedEvents[1].id).toBe('event_ch2');
  });
});

// =============================================================================
// FULL PIPELINE TESTS
// =============================================================================

describe('buildEvents Pipeline', () => {
  it('should run full pipeline: extract → dedupe → time anchor', () => {
    const entities = [
      makeEntity('entity_harry', 'PERSON', 'Harry'),
      makeEntity('entity_hogwarts', 'PLACE', 'Hogwarts'),
      makeEntity('entity_voldemort', 'PERSON', 'Voldemort'),
    ];
    const entityMap = makeEntityMap(entities);

    const assertions = [
      makeAssertion({
        id: 'a1',
        subject: 'entity_harry',
        predicate: 'traveled_to',
        object: 'entity_hogwarts',
        evidence: [makeEvidence('Harry traveled to Hogwarts', { paragraphIndex: 1 })],
      }),
      makeAssertion({
        id: 'a2',
        subject: 'entity_voldemort',
        predicate: 'died',
        evidence: [makeEvidence('Voldemort died', { paragraphIndex: 10 })],
      }),
    ];

    const docOrder: DocOrderInfo[] = [{ docId: 'test-doc', orderIndex: 0 }];

    const events = buildEvents(assertions, entityMap, docOrder);

    expect(events).toHaveLength(2);

    // Events should be in discourse order
    expect(events[0].type).toBe('MOVE');
    expect(events[1].type).toBe('DEATH');

    // Each event should have time anchor
    expect(events[0].time.type).toBe('DISCOURSE');
    expect(events[1].time.type).toBe('DISCOURSE');

    // Each event should have derivedFrom
    expect(events[0].derivedFrom).toContain('a1');
    expect(events[1].derivedFrom).toContain('a2');
  });

  it('should skip assertions without matching predicates', () => {
    const entities = [
      makeEntity('entity_harry', 'PERSON', 'Harry'),
      makeEntity('entity_ron', 'PERSON', 'Ron'),
    ];
    const entityMap = makeEntityMap(entities);

    const assertions = [
      makeAssertion({
        subject: 'entity_harry',
        predicate: 'friend_of', // Not an event trigger
        object: 'entity_ron',
      }),
    ];

    const docOrder: DocOrderInfo[] = [{ docId: 'test-doc', orderIndex: 0 }];

    const events = buildEvents(assertions, entityMap, docOrder);

    expect(events).toHaveLength(0);
  });

  it('should generate deterministic event IDs', () => {
    const entities = [
      makeEntity('entity_harry', 'PERSON', 'Harry'),
      makeEntity('entity_hogwarts', 'PLACE', 'Hogwarts'),
    ];
    const entityMap = makeEntityMap(entities);

    const assertions = [
      makeAssertion({
        id: 'a1',
        subject: 'entity_harry',
        predicate: 'traveled_to',
        object: 'entity_hogwarts',
      }),
    ];

    const docOrder: DocOrderInfo[] = [{ docId: 'test-doc', orderIndex: 0 }];

    // Run twice
    const events1 = buildEvents(assertions, entityMap, docOrder);
    const events2 = buildEvents(assertions, entityMap, docOrder);

    // Same ID both times
    expect(events1[0].id).toBe(events2[0].id);
    expect(events1[0].id).toMatch(/^event_move_[a-f0-9]{16}$/);
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
  it('should handle assertions without subject', () => {
    const entityMap = makeEntityMap([]);
    const assertion = makeAssertion({
      subject: undefined as any, // Missing subject
      predicate: 'traveled_to',
    });
    assertion.subject = undefined;

    const candidates = extractEventCandidates([assertion], entityMap);

    expect(candidates).toHaveLength(0);
  });

  it('should handle assertions without predicate', () => {
    const entityMap = makeEntityMap([]);
    const assertion = makeAssertion({
      subject: 'entity_harry',
      predicate: undefined as any,
    });
    assertion.predicate = undefined;

    const candidates = extractEventCandidates([assertion], entityMap);

    expect(candidates).toHaveLength(0);
  });

  it('should handle empty assertions array', () => {
    const entityMap = makeEntityMap([]);
    const docOrder: DocOrderInfo[] = [];

    const events = buildEvents([], entityMap, docOrder);

    expect(events).toHaveLength(0);
  });

  it('should handle MOVE with non-PLACE destination', () => {
    const entities = [
      makeEntity('entity_harry', 'PERSON', 'Harry'),
      makeEntity('entity_ron', 'PERSON', 'Ron'), // PERSON, not PLACE
    ];
    const entityMap = makeEntityMap(entities);

    const assertion = makeAssertion({
      subject: 'entity_harry',
      predicate: 'traveled_to',
      object: 'entity_ron', // Not a place
    });

    const candidates = extractEventCandidates([assertion], entityMap);

    expect(candidates).toHaveLength(1);
    // Should still have MOVER but no DESTINATION
    expect(candidates[0].participants).toHaveLength(1);
    expect(candidates[0].participants[0].role).toBe('MOVER');
  });
});
