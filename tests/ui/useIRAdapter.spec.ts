/**
 * Tests for useIRAdapter hook
 * Task 1.1.1: Create IR Adapter Hook
 *
 * Note: These tests verify the adapter logic directly.
 * Full React hook behavior is tested in integration tests.
 */

import { describe, it, expect } from 'vitest';
import { adaptLegacyExtraction } from '../../app/engine/ir/adapter';
import type { ExtractionResult } from '../../app/ui/console/src/hooks/useIRAdapter';

describe('useIRAdapter logic', () => {
  it('converts valid extraction to ProjectIR', () => {
    const extraction: ExtractionResult = {
      success: true,
      entities: [
        {
          id: 'entity_1',
          canonical: 'Gandalf',
          type: 'PERSON',
          confidence: 0.95,
          aliases: ['Gandalf the Grey', 'Mithrandir'],
        },
        {
          id: 'entity_2',
          canonical: 'Frodo',
          type: 'PERSON',
          confidence: 0.90,
          aliases: ['Frodo Baggins'],
        },
      ],
      relations: [
        {
          id: 'rel_1',
          subj: 'entity_1',
          obj: 'entity_2',
          pred: 'mentor_of',
          confidence: 0.85,
          subjCanonical: 'Gandalf',
          objCanonical: 'Frodo',
        },
      ],
    };

    // Simulate what the hook does
    const legacyFormat = {
      entities: extraction.entities.map(e => ({
        id: e.id,
        canonical: e.canonical || e.text || '',
        type: e.type as any,
        aliases: e.aliases || [],
        confidence: e.confidence,
        attrs: {},
      })),
      relations: extraction.relations || [],
      docId: 'test-doc',
    };

    const ir = adaptLegacyExtraction(legacyFormat);

    expect(ir).toBeDefined();
    expect(ir.version).toBe('1.0');
    expect(ir.projectId).toBe('test-doc');
    expect(ir.entities).toHaveLength(2);
    expect(ir.assertions).toHaveLength(1);

    // Check entity mapping
    expect(ir.entities[0].id).toBe('entity_1');
    expect(ir.entities[0].canonical).toBe('Gandalf');
    expect(ir.entities[0].type).toBe('PERSON');
    expect(ir.entities[0].aliases).toContain('Gandalf the Grey');

    // Check assertion mapping
    expect(ir.assertions[0].subject).toBe('entity_1');
    expect(ir.assertions[0].object).toBe('entity_2');
    expect(ir.assertions[0].predicate).toBe('mentor_of');
  });

  it('handles entities with minimal data', () => {
    const extraction: ExtractionResult = {
      entities: [
        {
          id: 'entity_1',
          text: 'Simple Entity',
          type: 'PERSON',
        },
      ],
      relations: [],
    };

    const legacyFormat = {
      entities: extraction.entities.map(e => ({
        id: e.id,
        canonical: e.canonical || e.text || '',
        type: e.type as any,
        aliases: e.aliases || [],
        confidence: e.confidence,
        attrs: {},
      })),
      relations: extraction.relations || [],
      docId: 'test-doc',
    };

    const ir = adaptLegacyExtraction(legacyFormat);

    expect(ir).toBeDefined();
    expect(ir.entities[0].canonical).toBe('Simple Entity');
  });

  it('handles extraction with no relations', () => {
    const extraction: ExtractionResult = {
      entities: [
        {
          id: 'entity_1',
          canonical: 'Solo Entity',
          type: 'PERSON',
        },
      ],
      relations: [],
    };

    const legacyFormat = {
      entities: extraction.entities.map(e => ({
        id: e.id,
        canonical: e.canonical || e.text || '',
        type: e.type as any,
        aliases: e.aliases || [],
        confidence: e.confidence,
        attrs: {},
      })),
      relations: [],
      docId: 'test-doc',
    };

    const ir = adaptLegacyExtraction(legacyFormat);

    expect(ir).toBeDefined();
    expect(ir.assertions).toHaveLength(0);
  });

  it('preserves entity metadata through conversion', () => {
    const extraction: ExtractionResult = {
      entities: [
        {
          id: 'entity_1',
          canonical: 'Aragorn',
          type: 'PERSON',
          confidence: 0.92,
          aliases: ['Strider', 'Elessar'],
        },
      ],
      relations: [],
    };

    const legacyFormat = {
      entities: extraction.entities.map(e => ({
        id: e.id,
        canonical: e.canonical || e.text || '',
        type: e.type as any,
        aliases: e.aliases || [],
        confidence: e.confidence,
        attrs: {},
      })),
      relations: [],
      docId: 'lotr',
    };

    const ir = adaptLegacyExtraction(legacyFormat);

    expect(ir.entities[0].canonical).toBe('Aragorn');
    expect(ir.entities[0].aliases).toHaveLength(2);
    expect(ir.entities[0].aliases).toContain('Strider');
    expect(ir.entities[0].aliases).toContain('Elessar');
  });
});
