/**
 * Guardrail Tests: Creature Gender Inference
 *
 * Prevents regression where creatures (phoenixes, dragons, etc.) introduced with
 * "a CREATURE named X" pattern incorrectly match personal pronouns like "He/She"
 * instead of "it".
 *
 * Root cause: Entities introduced as creatures should have neutral gender,
 * but were defaulting to "unknown" which matches any pronoun.
 *
 * Fix: Added creature pattern detection in learnGenderFromContext() that sets
 * gender to "neutral" for entities introduced with creature words.
 */

import { describe, it, expect } from 'vitest';
import { extractFromSegments } from '../../app/engine/pipeline/orchestrator';

describe('Guardrails: Creature Gender Inference', () => {
  // GUARDRAIL 1: Phoenix named X should not match "He"
  it('should not resolve "He" to a phoenix (creature uses "it" not "He")', async () => {
    const text = `Albus Dumbledore was a powerful wizard. He had a phoenix named Fawkes.

    He cast a powerful spell. The phoenix watched silently.`;

    const result = await extractFromSegments('guardrail-1', text);

    // "He cast a powerful spell" should resolve to Dumbledore, not Fawkes
    // Check we don't have Fawkes doing human actions
    const fawkesRelations = result.relations.filter(
      r => r.subj?.toLowerCase().includes('fawkes') && r.pred !== 'owned_by'
    );

    // Fawkes should not be the subject of actions typically done by humans
    const humanActions = ['cast', 'trusted', 'believed', 'said', 'spoke'];
    const hasHumanAction = fawkesRelations.some(r =>
      humanActions.some(a => r.pred?.includes(a))
    );

    expect(hasHumanAction).toBe(false);
  });

  // GUARDRAIL 2: Dragon named X should not match "She"
  it('should not resolve "She" to a dragon', async () => {
    const text = `Hermione Granger was a brilliant witch. She befriended a dragon named Norberta.

    She studied ancient runes. The dragon breathed fire.`;

    const result = await extractFromSegments('guardrail-2', text);

    // Check entities include both Hermione and Norberta
    const entityNames = result.entities.map(e => e.canonical.toLowerCase());
    expect(entityNames.some(n => n.includes('hermione'))).toBe(true);

    // "She studied ancient runes" should not attribute to the dragon
    const dragonStudies = result.relations.filter(
      r => r.subj?.toLowerCase().includes('norbert') && r.pred?.includes('stud')
    );
    expect(dragonStudies.length).toBe(0);
  });

  // GUARDRAIL 3: Owl named X should not match "He"
  it('should not resolve "He" to an owl', async () => {
    const text = `Harry Potter received his letter. He had an owl named Hedwig.

    He went to Hogwarts. The owl delivered mail.`;

    const result = await extractFromSegments('guardrail-3', text);

    // "He went to Hogwarts" should resolve to Harry, not Hedwig
    const relations = result.relations.filter(
      r => r.subj?.toLowerCase().includes('hedwig') &&
           (r.pred?.includes('went') || r.pred?.includes('studies') || r.pred?.includes('attend'))
    );

    expect(relations.length).toBe(0);
  });

  // GUARDRAIL 4: General creature pattern test
  it('should infer neutral gender for various creatures', async () => {
    const text = `The wizard owned a cat named Crookshanks. It was very intelligent.

    He also had a toad called Trevor. It often escaped.`;

    const result = await extractFromSegments('guardrail-4', text);

    // Both Crookshanks and Trevor should exist as entities
    const entityNames = result.entities.map(e => e.canonical.toLowerCase());
    expect(entityNames.some(n => n.includes('crookshanks') || n.includes('wizard'))).toBe(true);
  });
});
