/**
 * Coreference Resolution Tests
 * Tests pronoun resolution, title back-links, nominals, coordination, and quotes
 */

import { describe, it, expect } from 'vitest';
import { splitIntoSentences } from '../app/engine/segment';
import { resolveCoref } from '../app/engine/coref';
import type { Entity } from '../app/engine/schema';

describe('Coreference Resolution', () => {
  it('resolves pronouns across sentences using stacks', () => {
    const text = 'Gandalf traveled to Rivendell. He met Elrond there. He was wise.';
    const sentences = splitIntoSentences(text);

    // Mock entities
    const entities: Entity[] = [
      {
        id: 'e1',
        type: 'PERSON',
        canonical: 'Gandalf',
        aliases: [],
        created_at: new Date().toISOString(),
      },
      {
        id: 'e2',
        type: 'PLACE',
        canonical: 'Rivendell',
        aliases: [],
        created_at: new Date().toISOString(),
      },
      {
        id: 'e3',
        type: 'PERSON',
        canonical: 'Elrond',
        aliases: [],
        created_at: new Date().toISOString(),
      },
    ];

    const entitySpans = [
      { entity_id: 'e1', start: 0, end: 7 },   // Gandalf
      { entity_id: 'e2', start: 20, end: 29 }, // Rivendell
      { entity_id: 'e3', start: 39, end: 45 }, // Elrond
    ];

    const result = resolveCoref(sentences, entities, entitySpans, text);

    // Find pronoun links
    const pronounLinks = result.links.filter(link => link.method === 'pronoun_stack');

    // Should have 2 "He" pronouns
    expect(pronounLinks.length).toBeGreaterThanOrEqual(2);

    // First "He" should link to Gandalf (most recent PERSON in stack)
    const firstHe = pronounLinks.find(link => link.mention.text === 'He' && link.mention.start === 31);
    expect(firstHe).toBeDefined();
    expect(firstHe?.entity_id).toBe('e1');

    // Second "He" could link to Elrond (most recent) or Gandalf
    const secondHe = pronounLinks.find(link => link.mention.text === 'He' && link.mention.start > 45);
    expect(secondHe).toBeDefined();
  });

  it('resolves title back-links to nearest matching entity', () => {
    const text = 'Gandalf the Grey is a wizard. The wizard traveled to Mordor.';
    const sentences = splitIntoSentences(text);

    const entities: Entity[] = [
      {
        id: 'e1',
        type: 'PERSON',
        canonical: 'Gandalf the Grey',
        aliases: [],
        created_at: new Date().toISOString(),
      },
      {
        id: 'e2',
        type: 'PLACE',
        canonical: 'Mordor',
        aliases: [],
        created_at: new Date().toISOString(),
      },
    ];

    const entitySpans = [
      { entity_id: 'e1', start: 0, end: 16 }, // Gandalf the Grey
      { entity_id: 'e2', start: 54, end: 60 }, // Mordor
    ];

    const result = resolveCoref(sentences, entities, entitySpans, text);

    // Find "the wizard" title link
    const wizardLink = result.links.find(
      link => link.method === 'title_match' && link.mention.text.toLowerCase().includes('wizard')
    );

    expect(wizardLink).toBeDefined();
    expect(wizardLink?.entity_id).toBe('e1');
    expect(wizardLink?.confidence).toBeGreaterThan(0.8);
  });

  it('resolves nominal NP back-links using descriptor index', () => {
    const text = 'Professor McGonagall teaches at Hogwarts. The professor is strict.';
    const sentences = splitIntoSentences(text);

    const entities: Entity[] = [
      {
        id: 'e1',
        type: 'PERSON',
        canonical: 'Professor McGonagall',
        aliases: [],
        created_at: new Date().toISOString(),
      },
      {
        id: 'e2',
        type: 'ORG',
        canonical: 'Hogwarts',
        aliases: [],
        created_at: new Date().toISOString(),
      },
    ];

    const entitySpans = [
      { entity_id: 'e1', start: 0, end: 20 }, // Professor McGonagall
      { entity_id: 'e2', start: 32, end: 40 }, // Hogwarts
    ];

    const result = resolveCoref(sentences, entities, entitySpans, text);

    // Find "the professor" nominal link
    const profLink = result.links.find(
      link => link.method === 'nominal_match' && link.mention.text.toLowerCase().includes('professor')
    );

    expect(profLink).toBeDefined();
    expect(profLink?.entity_id).toBe('e1');
  });

  it('resolves coordinated subjects (fan-out)', () => {
    const text = 'Mark and Anne Flowers took her in.';
    const sentences = splitIntoSentences(text);

    const entities: Entity[] = [
      {
        id: 'e1',
        type: 'PERSON',
        canonical: 'Mark Flowers',
        aliases: [],
        created_at: new Date().toISOString(),
      },
      {
        id: 'e2',
        type: 'PERSON',
        canonical: 'Anne Flowers',
        aliases: [],
        created_at: new Date().toISOString(),
      },
    ];

    const entitySpans = [
      { entity_id: 'e1', start: 0, end: 4 },   // Mark
      { entity_id: 'e2', start: 9, end: 21 },  // Anne Flowers
    ];

    const result = resolveCoref(sentences, entities, entitySpans, text);

    // Find coordination links
    const coordLinks = result.links.filter(link => link.method === 'coordination');

    // Should have 2 links: one for Mark, one for Anne
    expect(coordLinks.length).toBe(2);
    expect(coordLinks.some(link => link.entity_id === 'e1')).toBe(true);
    expect(coordLinks.some(link => link.entity_id === 'e2')).toBe(true);
  });

  it('resolves quote attribution with said-verbs', () => {
    const text = '"Hello, Harry," said Hermione. Ron replied, "Good morning."';
    const sentences = splitIntoSentences(text);

    const entities: Entity[] = [
      {
        id: 'e1',
        type: 'PERSON',
        canonical: 'Harry',
        aliases: [],
        created_at: new Date().toISOString(),
      },
      {
        id: 'e2',
        type: 'PERSON',
        canonical: 'Hermione',
        aliases: [],
        created_at: new Date().toISOString(),
      },
      {
        id: 'e3',
        type: 'PERSON',
        canonical: 'Ron',
        aliases: [],
        created_at: new Date().toISOString(),
      },
    ];

    const entitySpans = [
      { entity_id: 'e1', start: 8, end: 13 },  // Harry
      { entity_id: 'e2', start: 21, end: 29 }, // Hermione
      { entity_id: 'e3', start: 31, end: 34 }, // Ron
    ];

    const result = resolveCoref(sentences, entities, entitySpans, text);

    // Check quotes
    expect(result.quotes.length).toBeGreaterThanOrEqual(1);

    // First quote should be attributed to Hermione
    const hermioneQuote = result.quotes.find(q => q.text.includes('Hello'));
    expect(hermioneQuote).toBeDefined();
    expect(hermioneQuote?.speaker_entity_id).toBe('e2');

    // Second quote should be attributed to Ron
    const ronQuote = result.quotes.find(q => q.text.includes('Good morning'));
    if (ronQuote) {
      expect(ronQuote.speaker_entity_id).toBe('e3');
    }
  });

  it('handles mixed coreference patterns in narrative text', () => {
    const text = `Aragorn, son of Arathorn, traveled to Minas Tirith. He met the king there. The king welcomed him. "Welcome," said the king.`;

    const sentences = splitIntoSentences(text);

    const entities: Entity[] = [
      {
        id: 'e1',
        type: 'PERSON',
        canonical: 'Aragorn',
        aliases: [],
        created_at: new Date().toISOString(),
      },
      {
        id: 'e2',
        type: 'PERSON',
        canonical: 'Arathorn',
        aliases: [],
        created_at: new Date().toISOString(),
      },
      {
        id: 'e3',
        type: 'PLACE',
        canonical: 'Minas Tirith',
        aliases: [],
        created_at: new Date().toISOString(),
      },
      {
        id: 'e4',
        type: 'PERSON',
        canonical: 'The King of Gondor',
        aliases: [],
        created_at: new Date().toISOString(),
      },
    ];

    const entitySpans = [
      { entity_id: 'e1', start: 0, end: 7 },    // Aragorn
      { entity_id: 'e2', start: 16, end: 24 },  // Arathorn
      { entity_id: 'e3', start: 39, end: 51 },  // Minas Tirith
      { entity_id: 'e4', start: 60, end: 68 },  // the king (first mention)
      { entity_id: 'e4', start: 116, end: 124 }, // the king (in quote attribution)
    ];

    const result = resolveCoref(sentences, entities, entitySpans, text);

    // Should have pronoun links
    const pronounLinks = result.links.filter(link => link.method === 'pronoun_stack');
    expect(pronounLinks.length).toBeGreaterThan(0);

    // Should have title links
    const titleLinks = result.links.filter(link => link.method === 'title_match');
    expect(titleLinks.length).toBeGreaterThan(0);

    // Should have quote attribution
    expect(result.quotes.length).toBeGreaterThanOrEqual(1);

    // Verify "He" links to a male PERSON (Aragorn or Arathorn - both are reasonable)
    const heLink = pronounLinks.find(link => link.mention.text === 'He');
    expect(heLink).toBeDefined();
    expect(['e1', 'e2']).toContain(heLink?.entity_id);

    // Verify "the king" subsequent mentions link to king entity
    const kingLinks = titleLinks.filter(link => link.mention.text.toLowerCase().includes('king'));
    expect(kingLinks.length).toBeGreaterThan(0);
  });

  it('handles paragraph boundaries correctly', () => {
    const text = `Gandalf was a wizard. He traveled far.

Frodo was a hobbit. He stayed home.`;

    const sentences = splitIntoSentences(text);

    const entities: Entity[] = [
      {
        id: 'e1',
        type: 'PERSON',
        canonical: 'Gandalf',
        aliases: [],
        created_at: new Date().toISOString(),
      },
      {
        id: 'e2',
        type: 'PERSON',
        canonical: 'Frodo',
        aliases: [],
        created_at: new Date().toISOString(),
      },
    ];

    const entitySpans = [
      { entity_id: 'e1', start: 0, end: 7 },   // Gandalf (paragraph 1)
      { entity_id: 'e2', start: 42, end: 47 }, // Frodo (paragraph 2)
    ];

    const result = resolveCoref(sentences, entities, entitySpans, text);

    // Pronouns in different paragraphs should link to entities in their respective paragraphs
    const pronounLinks = result.links.filter(link => link.method === 'pronoun_stack');

    // First "He" should link to Gandalf
    const firstHe = pronounLinks.find(link => link.mention.start < 40);
    expect(firstHe).toBeDefined();
    expect(firstHe?.entity_id).toBe('e1');

    // Second "He" should link to Frodo (in second paragraph)
    const secondHe = pronounLinks.find(link => link.mention.start > 50);
    expect(secondHe).toBeDefined();
    expect(secondHe?.entity_id).toBe('e2');
  });

  it('handles gender-aware pronoun resolution', () => {
    const text = 'Hermione is a student. She studies hard. Harry is her friend. He helps her.';
    const sentences = splitIntoSentences(text);

    const entities: Entity[] = [
      {
        id: 'e1',
        type: 'PERSON',
        canonical: 'Hermione',
        aliases: [],
        created_at: new Date().toISOString(),
      },
      {
        id: 'e2',
        type: 'PERSON',
        canonical: 'Harry',
        aliases: [],
        created_at: new Date().toISOString(),
      },
    ];

    const entitySpans = [
      { entity_id: 'e1', start: 0, end: 8 },   // Hermione
      { entity_id: 'e2', start: 42, end: 47 }, // Harry
    ];

    const result = resolveCoref(sentences, entities, entitySpans, text);

    const pronounLinks = result.links.filter(link => link.method === 'pronoun_stack');

    // "She" should link to Hermione (female)
    const sheLink = pronounLinks.find(link => link.mention.text === 'She');
    expect(sheLink).toBeDefined();
    expect(sheLink?.entity_id).toBe('e1');

    // "He" should link to Harry (male)
    const heLink = pronounLinks.find(link => link.mention.text === 'He');
    expect(heLink).toBeDefined();
    expect(heLink?.entity_id).toBe('e2');

    // "her" pronouns should link to Hermione
    const herLinks = pronounLinks.filter(link => link.mention.text === 'her');
    expect(herLinks.length).toBeGreaterThan(0);
    herLinks.forEach(link => {
      expect(link.entity_id).toBe('e1');
    });
  });
});
