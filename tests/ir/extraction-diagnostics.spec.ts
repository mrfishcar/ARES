/**
 * Extraction Diagnostics Tests
 *
 * Tests for:
 * - C1: Signal precision validation
 * - C2: Confidence calibration
 * - C3: Extraction metrics
 */

import { describe, it, expect } from 'vitest';
import {
  validateIR,
  analyzeConfidence,
  calibrateConfidence,
  computeMetrics,
  formatMetricsReport,
  compareMetrics,
  isHealthy,
  getSummary,
} from '../../app/engine/ir/extraction-diagnostics';
import type {
  ProjectIR,
  Entity,
  StoryEvent,
  Assertion,
  Confidence,
  Attribution,
  TimeAnchor,
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

function makeEntity(id: string, type: string, canonical: string, opts?: {
  confidence?: number;
  aliases?: string[];
  evidence?: { docId: string; charStart: number; charEnd: number; text: string }[];
}): Entity {
  return {
    id,
    type: type as any,
    canonical,
    aliases: opts?.aliases ?? [canonical],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attrs: {},
    evidence: opts?.evidence?.map((e) => ({
      docId: e.docId,
      charStart: e.charStart,
      charEnd: e.charEnd,
      text: e.text,
    })) ?? [{ docId: 'doc1', charStart: 0, charEnd: 10, text: canonical }],
    confidence: makeConfidence(opts?.confidence ?? 0.9),
  };
}

function makeEvent(
  id: string,
  type: string,
  time: TimeAnchor,
  opts?: {
    participants?: { role: string; entity: string; isRequired: boolean }[];
    evidence?: { docId: string; charStart: number; charEnd: number; text: string }[];
    location?: string;
    derivedFrom?: string[];
    links?: { type: string; target: string; confidence: number }[];
    confidence?: number;
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
    })) ?? [{ docId: 'doc1', charStart: 0, charEnd: 50, text: 'event text' }],
    attribution: makeAttribution(),
    modality: 'FACT',
    confidence: makeConfidence(opts?.confidence ?? 0.9),
    links: (opts?.links ?? []).map((l) => ({
      type: l.type as any,
      target: l.target,
      confidence: l.confidence,
    })),
    produces: [],
    extractedFrom: 'pattern',
    derivedFrom: opts?.derivedFrom ?? ['assertion_1'],
    createdAt: new Date().toISOString(),
    compiler_pass: 'test',
    location: opts?.location,
  };
}

function makeAssertion(
  id: string,
  subject: string,
  predicate: string,
  object: string | boolean | number,
  opts?: {
    evidence?: { docId: string; charStart: number; charEnd: number; text: string }[];
    confidence?: number;
    modality?: string;
  }
): Assertion {
  return {
    id,
    assertionType: 'DIRECT',
    subject,
    predicate: predicate as any,
    object,
    evidence: opts?.evidence?.map((e) => ({
      docId: e.docId,
      charStart: e.charStart,
      charEnd: e.charEnd,
      text: e.text,
    })) ?? [{ docId: 'doc1', charStart: 0, charEnd: 30, text: 'assertion text' }],
    attribution: makeAttribution(),
    modality: (opts?.modality ?? 'FACT') as any,
    confidence: makeConfidence(opts?.confidence ?? 0.9),
    createdAt: new Date().toISOString(),
    compiler_pass: 'test',
  };
}

function makeIR(opts?: {
  entities?: Entity[];
  events?: StoryEvent[];
  assertions?: Assertion[];
}): ProjectIR {
  return {
    version: '1.0',
    projectId: 'test_project',
    createdAt: new Date().toISOString(),
    entities: opts?.entities ?? [],
    events: opts?.events ?? [],
    assertions: opts?.assertions ?? [],
    stats: {
      entityCount: opts?.entities?.length ?? 0,
      eventCount: opts?.events?.length ?? 0,
      assertionCount: opts?.assertions?.length ?? 0,
    },
  };
}

// =============================================================================
// C1: SIGNAL PRECISION VALIDATION
// =============================================================================

describe('C1: Signal precision validation', () => {
  describe('validateIR', () => {
    it('should return valid for healthy IR', () => {
      const ir = makeIR({
        entities: [
          makeEntity('entity_alice', 'PERSON', 'Alice'),
          makeEntity('entity_bob', 'PERSON', 'Bob'),
        ],
        events: [
          makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
            participants: [{ role: 'MOVER', entity: 'entity_alice', isRequired: true }],
          }),
        ],
        assertions: [
          makeAssertion('assertion_1', 'entity_alice', 'friend_of', 'entity_bob'),
        ],
      });

      const result = validateIR(ir);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should detect duplicate entity IDs', () => {
      const ir = makeIR({
        entities: [
          makeEntity('entity_alice', 'PERSON', 'Alice'),
          makeEntity('entity_alice', 'PERSON', 'Alice Duplicate'),
        ],
      });

      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('Duplicate entity ID'))).toBe(true);
    });

    it('should detect missing canonical name', () => {
      const entity = makeEntity('entity_alice', 'PERSON', '');
      const ir = makeIR({ entities: [entity] });

      const result = validateIR(ir);

      expect(result.errors.some((e) => e.message.includes('no canonical name'))).toBe(true);
    });

    it('should detect orphan participant references', () => {
      const ir = makeIR({
        entities: [makeEntity('entity_alice', 'PERSON', 'Alice')],
        events: [
          makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
            participants: [
              { role: 'MOVER', entity: 'entity_nonexistent', isRequired: true },
            ],
          }),
        ],
      });

      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('non-existent entity'))).toBe(true);
    });

    it('should detect orphan location reference', () => {
      const ir = makeIR({
        entities: [makeEntity('entity_alice', 'PERSON', 'Alice')],
        events: [
          makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
            participants: [{ role: 'MOVER', entity: 'entity_alice', isRequired: true }],
            location: 'location_nonexistent',
          }),
        ],
      });

      const result = validateIR(ir);

      expect(result.warnings.some((e) => e.message.includes('non-existent location'))).toBe(true);
    });

    it('should detect duplicate event IDs', () => {
      const ir = makeIR({
        entities: [makeEntity('entity_alice', 'PERSON', 'Alice')],
        events: [
          makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }),
          makeEvent('event_1', 'DEATH', { type: 'DISCOURSE', chapter: 2, paragraph: 1 }),
        ],
      });

      const result = validateIR(ir);

      expect(result.errors.some((e) => e.message.includes('Duplicate event ID'))).toBe(true);
    });

    it('should detect duplicate assertion IDs', () => {
      const ir = makeIR({
        entities: [makeEntity('entity_alice', 'PERSON', 'Alice')],
        assertions: [
          makeAssertion('assertion_1', 'entity_alice', 'is_a', 'wizard'),
          makeAssertion('assertion_1', 'entity_alice', 'friend_of', 'entity_bob'),
        ],
      });

      const result = validateIR(ir);

      expect(result.errors.some((e) => e.message.includes('Duplicate assertion ID'))).toBe(true);
    });

    it('should detect invalid temporal links', () => {
      const ir = makeIR({
        entities: [makeEntity('entity_alice', 'PERSON', 'Alice')],
        events: [
          makeEvent('event_1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
            links: [{ type: 'BEFORE', target: 'event_nonexistent', confidence: 0.9 }],
          }),
        ],
      });

      const result = validateIR(ir);

      expect(result.warnings.some((e) => e.message.includes('link to non-existent event'))).toBe(true);
    });

    it('should warn about events after death', () => {
      const ir = makeIR({
        entities: [makeEntity('entity_alice', 'PERSON', 'Alice')],
        events: [
          makeEvent('event_death', 'DEATH', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
            participants: [{ role: 'DECEDENT', entity: 'entity_alice', isRequired: true }],
          }),
          makeEvent('event_after', 'MOVE', { type: 'DISCOURSE', chapter: 2, paragraph: 1 }, {
            participants: [{ role: 'MOVER', entity: 'entity_alice', isRequired: true }],
          }),
        ],
      });

      const result = validateIR(ir);

      expect(result.warnings.some((e) => e.message.includes('after death'))).toBe(true);
    });

    it('should warn about low confidence entities', () => {
      const ir = makeIR({
        entities: [makeEntity('entity_alice', 'PERSON', 'Alice', { confidence: 0.3 })],
      });

      const result = validateIR(ir);

      expect(result.info.some((e) => e.message.includes('low confidence'))).toBe(true);
    });

    it('should warn about entities without evidence', () => {
      const entity = makeEntity('entity_alice', 'PERSON', 'Alice');
      entity.evidence = [];
      const ir = makeIR({ entities: [entity] });

      const result = validateIR(ir);

      expect(result.warnings.some((e) => e.message.includes('no evidence'))).toBe(true);
    });
  });
});

// =============================================================================
// C2: CONFIDENCE CALIBRATION
// =============================================================================

describe('C2: Confidence calibration', () => {
  describe('analyzeConfidence', () => {
    it('should compute confidence statistics', () => {
      const ir = makeIR({
        entities: [
          makeEntity('e1', 'PERSON', 'E1', { confidence: 0.8 }),
          makeEntity('e2', 'PERSON', 'E2', { confidence: 0.9 }),
          makeEntity('e3', 'PERSON', 'E3', { confidence: 0.7 }),
        ],
        events: [
          makeEvent('ev1', 'MOVE', { type: 'UNKNOWN' }, { confidence: 0.85 }),
        ],
        assertions: [
          makeAssertion('a1', 'e1', 'is_a', 'wizard', { confidence: 0.9 }),
        ],
      });

      const report = analyzeConfidence(ir);

      expect(report.entities.count).toBe(3);
      expect(report.entities.mean).toBeCloseTo(0.8, 1);
      expect(report.events.count).toBe(1);
      expect(report.assertions.count).toBe(1);
      expect(report.calibrationScore).toBeGreaterThan(0);
      expect(report.calibrationScore).toBeLessThanOrEqual(1);
    });

    it('should compute median correctly', () => {
      const ir = makeIR({
        entities: [
          makeEntity('e1', 'PERSON', 'E1', { confidence: 0.5 }),
          makeEntity('e2', 'PERSON', 'E2', { confidence: 0.7 }),
          makeEntity('e3', 'PERSON', 'E3', { confidence: 0.9 }),
        ],
      });

      const report = analyzeConfidence(ir);

      expect(report.entities.median).toBeCloseTo(0.7, 1);
    });

    it('should generate recommendations for uniform confidence', () => {
      const ir = makeIR({
        entities: [
          makeEntity('e1', 'PERSON', 'E1', { confidence: 0.9 }),
          makeEntity('e2', 'PERSON', 'E2', { confidence: 0.9 }),
          makeEntity('e3', 'PERSON', 'E3', { confidence: 0.9 }),
        ],
      });

      const report = analyzeConfidence(ir);

      expect(report.recommendations.some((r) => r.includes('uniform'))).toBe(true);
    });

    it('should generate recommendations for low confidence', () => {
      const ir = makeIR({
        entities: [
          makeEntity('e1', 'PERSON', 'E1', { confidence: 0.3 }),
          makeEntity('e2', 'PERSON', 'E2', { confidence: 0.4 }),
          makeEntity('e3', 'PERSON', 'E3', { confidence: 0.2 }),
        ],
      });

      const report = analyzeConfidence(ir);

      expect(report.recommendations.some((r) => r.includes('low'))).toBe(true);
    });

    it('should compute distribution buckets', () => {
      const ir = makeIR({
        entities: [
          makeEntity('e1', 'PERSON', 'E1', { confidence: 0.15 }),
          makeEntity('e2', 'PERSON', 'E2', { confidence: 0.85 }),
          makeEntity('e3', 'PERSON', 'E3', { confidence: 0.95 }),
        ],
      });

      const report = analyzeConfidence(ir);

      // Should have values in buckets 1 (0.1-0.2), 8 (0.8-0.9), and 9 (0.9-1.0)
      expect(report.entities.buckets[1]).toBe(1);
      expect(report.entities.buckets[8]).toBe(1);
      expect(report.entities.buckets[9]).toBe(1);
    });

    it('should handle empty IR', () => {
      const ir = makeIR();

      const report = analyzeConfidence(ir);

      expect(report.entities.count).toBe(0);
      expect(report.events.count).toBe(0);
      expect(report.assertions.count).toBe(0);
    });
  });

  describe('calibrateConfidence', () => {
    it('should boost confidence with more evidence', () => {
      const base = 0.7;

      const result0 = calibrateConfidence(base, 0);
      const result1 = calibrateConfidence(base, 1);
      const result5 = calibrateConfidence(base, 5);

      expect(result1).toBeGreaterThan(result0);
      expect(result5).toBeGreaterThan(result1);
    });

    it('should not exceed 1.0', () => {
      const result = calibrateConfidence(0.99, 100);

      expect(result).toBeLessThanOrEqual(1.0);
    });

    it('should respect custom boost options', () => {
      const result = calibrateConfidence(0.7, 3, {
        minEvidenceBoost: 0.05,
        maxEvidenceBoost: 0.2,
        evidenceScaling: 0.8,
      });

      expect(result).toBeGreaterThan(0.75);
      expect(result).toBeLessThan(0.95);
    });

    it('should return base confidence for zero evidence', () => {
      const result = calibrateConfidence(0.7, 0);

      expect(result).toBeCloseTo(0.7, 2);
    });
  });
});

// =============================================================================
// C3: EXTRACTION METRICS
// =============================================================================

describe('C3: Extraction metrics', () => {
  describe('computeMetrics', () => {
    it('should compute entity metrics', () => {
      const ir = makeIR({
        entities: [
          makeEntity('e1', 'PERSON', 'Alice', { aliases: ['Alice', 'Ali'] }),
          makeEntity('e2', 'PLACE', 'London'),
          makeEntity('e3', 'PERSON', 'Bob'),
        ],
      });

      const metrics = computeMetrics(ir);

      expect(metrics.entities.total).toBe(3);
      expect(metrics.entities.byType['PERSON']).toBe(2);
      expect(metrics.entities.byType['PLACE']).toBe(1);
    });

    it('should compute event metrics', () => {
      const ir = makeIR({
        entities: [
          makeEntity('e1', 'PERSON', 'Alice'),
          makeEntity('e2', 'PERSON', 'Bob'),
        ],
        events: [
          makeEvent('ev1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
            participants: [{ role: 'MOVER', entity: 'e1', isRequired: true }],
          }),
          makeEvent('ev2', 'TELL', { type: 'DISCOURSE', chapter: 1, paragraph: 2 }, {
            participants: [
              { role: 'SPEAKER', entity: 'e1', isRequired: true },
              { role: 'ADDRESSEE', entity: 'e2', isRequired: true },
            ],
          }),
          makeEvent('ev3', 'MOVE', { type: 'DISCOURSE', chapter: 2, paragraph: 1 }, {
            participants: [{ role: 'MOVER', entity: 'e2', isRequired: true }],
            links: [{ type: 'AFTER', target: 'ev1', confidence: 0.8 }],
          }),
        ],
      });

      const metrics = computeMetrics(ir);

      expect(metrics.events.total).toBe(3);
      expect(metrics.events.byType['MOVE']).toBe(2);
      expect(metrics.events.byType['TELL']).toBe(1);
      expect(metrics.events.avgParticipants).toBeGreaterThan(1);
      expect(metrics.events.withLinks).toBe(1);
    });

    it('should compute assertion metrics', () => {
      const ir = makeIR({
        entities: [makeEntity('e1', 'PERSON', 'Alice')],
        assertions: [
          makeAssertion('a1', 'e1', 'is_a', 'wizard', { modality: 'FACT' }),
          makeAssertion('a2', 'e1', 'friend_of', 'e2', { modality: 'BELIEF' }),
          makeAssertion('a3', 'e1', 'is_a', 'hero', { modality: 'FACT' }),
        ],
      });

      const metrics = computeMetrics(ir);

      expect(metrics.assertions.total).toBe(3);
      expect(metrics.assertions.byPredicate['is_a']).toBe(2);
      expect(metrics.assertions.byModality['FACT']).toBe(2);
      expect(metrics.assertions.byModality['BELIEF']).toBe(1);
    });

    it('should compute coverage metrics', () => {
      const ir = makeIR({
        entities: [
          makeEntity('e1', 'PERSON', 'Alice', {
            evidence: [{ docId: 'doc1', charStart: 0, charEnd: 1000, text: 'Alice' }],
          }),
        ],
        events: [
          makeEvent('ev1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }, {
            evidence: [{ docId: 'doc2', charStart: 0, charEnd: 500, text: 'moved' }],
          }),
        ],
      });

      const metrics = computeMetrics(ir);

      expect(metrics.coverage.documentsProcessed).toBe(2);
      expect(metrics.coverage.totalCharacters).toBe(1000);
    });

    it('should handle empty IR', () => {
      const ir = makeIR();

      const metrics = computeMetrics(ir);

      expect(metrics.entities.total).toBe(0);
      expect(metrics.events.total).toBe(0);
      expect(metrics.assertions.total).toBe(0);
    });
  });

  describe('formatMetricsReport', () => {
    it('should format metrics as markdown', () => {
      const ir = makeIR({
        entities: [
          makeEntity('e1', 'PERSON', 'Alice'),
          makeEntity('e2', 'PLACE', 'London'),
        ],
        events: [
          makeEvent('ev1', 'MOVE', { type: 'DISCOURSE', chapter: 1, paragraph: 1 }),
        ],
      });

      const metrics = computeMetrics(ir);
      const report = formatMetricsReport(metrics);

      expect(report).toContain('# Extraction Metrics Report');
      expect(report).toContain('## Entities');
      expect(report).toContain('**Total:** 2');
      expect(report).toContain('## Events');
      expect(report).toContain('## Coverage');
    });

    it('should include type breakdown', () => {
      const ir = makeIR({
        entities: [
          makeEntity('e1', 'PERSON', 'Alice'),
          makeEntity('e2', 'PERSON', 'Bob'),
          makeEntity('e3', 'PLACE', 'London'),
        ],
      });

      const metrics = computeMetrics(ir);
      const report = formatMetricsReport(metrics);

      expect(report).toContain('PERSON: 2');
      expect(report).toContain('PLACE: 1');
    });
  });

  describe('compareMetrics', () => {
    it('should compute deltas between metric sets', () => {
      const before = computeMetrics(makeIR({
        entities: [makeEntity('e1', 'PERSON', 'Alice')],
        events: [makeEvent('ev1', 'MOVE', { type: 'UNKNOWN' })],
      }));

      const after = computeMetrics(makeIR({
        entities: [
          makeEntity('e1', 'PERSON', 'Alice'),
          makeEntity('e2', 'PERSON', 'Bob'),
        ],
        events: [
          makeEvent('ev1', 'MOVE', { type: 'UNKNOWN' }),
          makeEvent('ev2', 'TELL', { type: 'UNKNOWN' }),
        ],
      }));

      const comparison = compareMetrics(before, after);

      expect(comparison.entityDelta).toBe(1);
      expect(comparison.eventDelta).toBe(1);
      expect(comparison.summary).toContain('+1');
    });

    it('should handle negative deltas', () => {
      const before = computeMetrics(makeIR({
        entities: [
          makeEntity('e1', 'PERSON', 'Alice'),
          makeEntity('e2', 'PERSON', 'Bob'),
        ],
      }));

      const after = computeMetrics(makeIR({
        entities: [makeEntity('e1', 'PERSON', 'Alice')],
      }));

      const comparison = compareMetrics(before, after);

      expect(comparison.entityDelta).toBe(-1);
    });

    it('should track confidence deltas', () => {
      const before = computeMetrics(makeIR({
        entities: [makeEntity('e1', 'PERSON', 'Alice', { confidence: 0.7 })],
      }));

      const after = computeMetrics(makeIR({
        entities: [makeEntity('e1', 'PERSON', 'Alice', { confidence: 0.9 })],
      }));

      const comparison = compareMetrics(before, after);

      expect(comparison.confidenceDelta.entities).toBeCloseTo(0.2, 1);
    });
  });
});

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

describe('Utility functions', () => {
  describe('isHealthy', () => {
    it('should return true for healthy IR', () => {
      const ir = makeIR({
        entities: [makeEntity('e1', 'PERSON', 'Alice')],
      });

      expect(isHealthy(ir)).toBe(true);
    });

    it('should return false for IR with errors', () => {
      const ir = makeIR({
        entities: [
          makeEntity('e1', 'PERSON', 'Alice'),
          makeEntity('e1', 'PERSON', 'Duplicate'),
        ],
      });

      expect(isHealthy(ir)).toBe(false);
    });
  });

  describe('getSummary', () => {
    it('should return summary string', () => {
      const ir = makeIR({
        entities: [
          makeEntity('e1', 'PERSON', 'Alice'),
          makeEntity('e2', 'PERSON', 'Bob'),
        ],
        events: [makeEvent('ev1', 'MOVE', { type: 'UNKNOWN' })],
        assertions: [makeAssertion('a1', 'e1', 'is_a', 'wizard')],
      });

      const summary = getSummary(ir);

      expect(summary).toContain('2 entities');
      expect(summary).toContain('1 events');
      expect(summary).toContain('1 assertions');
    });
  });
});
