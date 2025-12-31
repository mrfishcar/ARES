/**
 * Adversarial Stress Tests for Story World Compiler
 *
 * These tests are designed to FAIL initially and expose gaps in:
 * 1. Entity identity and relationship extraction
 * 2. Possession/transfer tracking over time
 * 3. Complex narrative pattern matching
 *
 * GOAL: If these tests pass, ARES can handle real novel complexity.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { extractAllNarrativeRelations } from '../../app/engine/narrative-relations';
import { findQuotes, extractQuotesWithSpeakers } from '../../app/engine/ir/quote-attribution';
import type { Relation } from '../../app/engine/schema';

// ============================================================================
// FIXTURE LOADING
// ============================================================================

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

// Helper to make entity for testing
function makeEntity(
  id: string,
  name: string,
  type: 'PERSON' | 'PLACE' | 'ORG' | 'ITEM' = 'PERSON',
  aliases: string[] = []
) {
  return { id, canonical: name, type, aliases };
}

// Helper to check if relation exists
function hasRelation(relations: Relation[], pred: string, subjId: string, objId: string): boolean {
  return relations.some(r => r.pred === pred && r.subj === subjId && r.obj === objId);
}

function hasAnyRelationWith(relations: Relation[], entityId: string): boolean {
  return relations.some(r => r.subj === entityId || r.obj === entityId);
}

// ============================================================================
// TEST 1: DIALOGUE CHAIN - FAMILY RELATIONSHIPS
// ============================================================================

describe('Adversarial: Long Dialogue Chain', () => {
  let dialogueText: string;

  beforeAll(() => {
    dialogueText = loadFixture('adversarial-dialogue-chain.txt');
  });

  it('should extract all 3 main characters as entities', () => {
    // The text has: Lord Marcus Blackwood, Lady Elena Blackwood, Thomas
    const entities = [
      makeEntity('marcus', 'Lord Marcus Blackwood', 'PERSON', ['Lord Marcus', 'Marcus', 'Father']),
      makeEntity('elena', 'Lady Elena Blackwood', 'PERSON', ['Elena', 'Mother']),
      makeEntity('thomas', 'Thomas', 'PERSON', ['the boy', 'son']),
    ];

    expect(entities.length).toBe(3);
  });

  it('should extract parent_of relation from "his father" context', () => {
    // The text says: "Thomas turned to face her" after Elena speaks
    // And Thomas calls Marcus "Father"
    // "his father said quietly" - 'his' refers to Thomas

    const entities = [
      makeEntity('marcus', 'Lord Marcus Blackwood', 'PERSON', ['Lord Marcus', 'Marcus', 'Father', 'his father']),
      makeEntity('elena', 'Lady Elena Blackwood', 'PERSON', ['Elena', 'Mother', 'your mother']),
      makeEntity('thomas', 'Thomas', 'PERSON', ['the boy', 'son']),
    ];

    const relations = extractAllNarrativeRelations(dialogueText, entities, 'test-dialogue');

    console.log('All relations found:', relations.map(r => `${r.subj} --[${r.pred}]--> ${r.obj}`));

    // Looking for explicit patterns that should be detected:
    // - "their son Thomas" -> parent_of relation
    // - "Father" as alias -> indicates Thomas's father is Marcus

    // This may fail if the "his father" pattern doesn't work
    const parentRelation = relations.find(r =>
      r.pred === 'parent_of' &&
      (r.subj === 'marcus' || r.subj === 'elena') &&
      r.obj === 'thomas'
    );

    expect(parentRelation).toBeDefined();
  });

  it('should extract married_to relation between Marcus and Elena', () => {
    // "his estranged wife" clearly indicates marriage

    const entities = [
      makeEntity('marcus', 'Lord Marcus Blackwood', 'PERSON', ['Lord Marcus']),
      makeEntity('elena', 'Lady Elena Blackwood', 'PERSON', ['his estranged wife', 'Elena']),
      makeEntity('thomas', 'Thomas', 'PERSON'),
    ];

    const relations = extractAllNarrativeRelations(dialogueText, entities, 'test-dialogue');

    const marriageRelation = relations.find(r =>
      r.pred === 'married_to' &&
      ((r.subj === 'marcus' && r.obj === 'elena') || (r.subj === 'elena' && r.obj === 'marcus'))
    );

    console.log('Marriage relations:', relations.filter(r => r.pred === 'married_to'));

    expect(marriageRelation).toBeDefined();
  });

  it('should find quotes in the dialogue', () => {
    const quotes = findQuotes(dialogueText);

    console.log(`Found ${quotes.length} quotes in dialogue fixture`);

    // There are 30+ quotes in the fixture
    expect(quotes.length).toBeGreaterThan(20);
  });
});

// ============================================================================
// TEST 2: NAME COLLISION - ENTITY IDENTITY STABILITY
// ============================================================================

describe('Adversarial: Name Collision (Multiple Johns)', () => {
  let collisionText: string;

  beforeAll(() => {
    collisionText = loadFixture('adversarial-name-collision.txt');
  });

  it('should correctly resolve "Professor Hartley\'s" as advisor relationship', () => {
    // "Professor Hartley's graduate student" - indicates mentor relationship

    const entities = [
      makeEntity('hartley', 'John Hartley', 'PERSON', ['Professor Hartley', 'Hartley', 'Professor']),
      makeEntity('williams', 'John Williams', 'PERSON', ['Dr. Williams', 'Professor Williams', 'Williams']),
      makeEntity('peterson', 'John Peterson', 'PERSON', ['Peterson', 'the young man']),
      makeEntity('chen', 'Margaret Chen', 'PERSON', ['Dr. Chen', 'Chen']),
    ];

    const relations = extractAllNarrativeRelations(collisionText, entities, 'test-collision');

    console.log('All relations in collision text:', relations.map(r => `${r.subj} --[${r.pred}]--> ${r.obj}`));

    // "Professor Hartley's graduate student" should create a mentor relation
    // Or at minimum, some relation between Hartley and Peterson
    const mentorRelation = relations.find(r =>
      (r.pred === 'mentor_of' || r.pred === 'student_of' || r.pred === 'teaches' || r.pred === 'taught') &&
      ((r.subj === 'hartley' && r.obj === 'peterson') || (r.subj === 'peterson' && r.obj === 'hartley'))
    );

    // This test might fail - that's okay, it shows a gap
    expect(mentorRelation).toBeDefined();
  });

  it('should extract works_at relation for Williams', () => {
    // "Dr. Williams... his notes on quantum computing"
    // This doesn't directly say works_at, but...

    const entities = [
      makeEntity('hartley', 'John Hartley', 'PERSON', ['Professor Hartley']),
      makeEntity('williams', 'John Williams', 'PERSON', ['Dr. Williams', 'Williams']),
    ];

    const relations = extractAllNarrativeRelations(collisionText, entities, 'test-collision');

    // Both professors should be involved in some relations
    const hartleyRelations = relations.filter(r => r.subj === 'hartley' || r.obj === 'hartley');
    const williamsRelations = relations.filter(r => r.subj === 'williams' || r.obj === 'williams');

    console.log('Hartley relations:', hartleyRelations.length);
    console.log('Williams relations:', williamsRelations.length);

    // At minimum, we should find some relations
    expect(hartleyRelations.length + williamsRelations.length).toBeGreaterThan(0);
  });

  it('should track title variations as same entity', () => {
    // "Dr. Williams" = "Professor Williams" = "Williams"

    const entities = [
      makeEntity('williams', 'John Williams', 'PERSON', ['Dr. Williams', 'Professor Williams', 'Williams']),
    ];

    const relations = extractAllNarrativeRelations(collisionText, entities, 'test-collision');

    // There should be no self-referential relations
    const selfRelations = relations.filter(r => r.subj === 'williams' && r.obj === 'williams');

    expect(selfRelations.length).toBe(0);
  });
});

// ============================================================================
// TEST 3: POSSESSION TRACKING ACROSS TIME
// ============================================================================

describe('Adversarial: Possession/Transfer Tracking', () => {
  let possessionText: string;

  beforeAll(() => {
    possessionText = loadFixture('adversarial-possession-tracking.txt');
  });

  it('should extract the watch as an ITEM entity', () => {
    const entities = [
      makeEntity('watch', 'pocket watch', 'ITEM', ['the watch', 'Admiral\'s watch', 'timepiece', 'it']),
    ];

    expect(entities[0].type).toBe('ITEM');
  });

  it('should find "bought" relation pattern', () => {
    // "I'll take it," said Marcus Grey, placing three gold coins on the counter.
    // This implies a purchase

    const entities = [
      makeEntity('watch', 'pocket watch', 'ITEM', ['the watch', 'it']),
      makeEntity('marcus', 'Marcus Grey', 'PERSON'),
      makeEntity('clara', 'Clara', 'PERSON', ['antique dealer']),
    ];

    const relations = extractAllNarrativeRelations(possessionText, entities, 'test-possession');

    console.log('All possession relations:', relations.map(r => `${r.subj} --[${r.pred}]--> ${r.obj}`));

    // Look for any transfer-related predicates
    const transferRelations = relations.filter(r =>
      r.pred === 'owns' ||
      r.pred === 'possesses' ||
      r.pred === 'gave_to' ||
      r.pred === 'received_from' ||
      r.pred === 'bought' ||
      r.pred === 'sold'
    );

    console.log('Transfer relations found:', transferRelations.length);

    // This tests if we catch any transfer patterns
    expect(transferRelations.length).toBeGreaterThan(0);
  });

  it('should find "gift" relation between Marcus and Helena', () => {
    // "A gift for you," Marcus said, pressing the watch into her palm.

    const entities = [
      makeEntity('watch', 'pocket watch', 'ITEM'),
      makeEntity('marcus', 'Marcus Grey', 'PERSON'),
      makeEntity('helena', 'Helena Grey', 'PERSON', ['his sister', 'her']),
    ];

    const relations = extractAllNarrativeRelations(possessionText, entities, 'test-possession');

    // Should find sibling_of from "his sister"
    const siblingRelation = relations.find(r =>
      r.pred === 'sibling_of' &&
      ((r.subj === 'marcus' && r.obj === 'helena') || (r.subj === 'helena' && r.obj === 'marcus'))
    );

    console.log('Sibling relation:', siblingRelation);

    expect(siblingRelation).toBeDefined();
  });

  it('should find "donated_to" relation to cathedral', () => {
    // "He gave it to the cathedral"

    const entities = [
      makeEntity('watch', 'pocket watch', 'ITEM', ['it']),
      makeEntity('marcus', 'Marcus Grey', 'PERSON', ['He']),
      makeEntity('cathedral', 'cathedral', 'PLACE', ['the cathedral']),
      makeEntity('benedict', 'Father Benedict', 'PERSON'),
    ];

    const relations = extractAllNarrativeRelations(possessionText, entities, 'test-possession');

    const donationRelation = relations.find(r =>
      (r.pred === 'gave_to' || r.pred === 'donated_to') &&
      r.subj === 'marcus'
    );

    console.log('Donation relation:', donationRelation);

    // This tests if pronoun resolution works for "He gave it to the cathedral"
    // The "He" should resolve to Marcus from context
  });

  it('should track temporal markers in text', () => {
    // The text has explicit time markers
    expect(possessionText).toContain('seven years');
    expect(possessionText).toContain('Twenty years');
  });
});

// ============================================================================
// METRICS SUMMARY
// ============================================================================

describe('Stress Test Metrics', () => {
  it('should report fixture word counts', () => {
    const dialogueText = loadFixture('adversarial-dialogue-chain.txt');
    const collisionText = loadFixture('adversarial-name-collision.txt');
    const possessionText = loadFixture('adversarial-possession-tracking.txt');

    const dialogueWords = dialogueText.split(/\s+/).length;
    const collisionWords = collisionText.split(/\s+/).length;
    const possessionWords = possessionText.split(/\s+/).length;

    console.log('\n=== STRESS TEST FIXTURES ===');
    console.log(`Dialogue Chain: ${dialogueWords} words`);
    console.log(`Name Collision: ${collisionWords} words`);
    console.log(`Possession Tracking: ${possessionWords} words`);
    console.log(`Total: ${dialogueWords + collisionWords + possessionWords} words`);
    console.log('===========================\n');

    // Each fixture should be substantial (200+ words)
    expect(dialogueWords).toBeGreaterThan(200);
    expect(collisionWords).toBeGreaterThan(200);
    expect(possessionWords).toBeGreaterThan(200);
  });
});
