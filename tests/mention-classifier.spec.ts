import { describe, it, expect } from 'vitest';
import { classifyMention } from '../app/engine/linguistics/mention-classifier';
import { extractFromSegments } from '../app/engine/extract/orchestrator';

describe('mention classifier heuristics', () => {
  it('rejects subordinating "When" at clause start', () => {
    const text = 'When she could ignore him no longer, she turned away.';
    const cls = classifyMention('When', text, 0, 4);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('marks vocative "Honey," as context-only', () => {
    const text = '“Honey, if I were any better,” he said.';
    const start = text.indexOf('Honey');
    const cls = classifyMention('Honey', text, start, start + 5);
    expect(cls.mentionClass).toBe('CONTEXT_ONLY');
  });

  it('rejects imperative single-token "Check."', () => {
    const text = 'He smiled and said, “Check.”';
    const start = text.indexOf('Check');
    const cls = classifyMention('Check', text, start, start + 5);
    expect(cls.mentionClass).toBe('CONTEXT_ONLY');
  });

  it('rejects predicative adjective "Cute"', () => {
    const text = 'The demon chuckled. “That’s cute.”';
    const start = text.indexOf('cute');
    const cls = classifyMention('Cute', text, start, start + 4);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects determiner + acronym "PDF"', () => {
    const text = '“It’s a PDF,” she whispered.';
    const start = text.indexOf('PDF');
    const cls = classifyMention('PDF', text, start, start + 3);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects adjectival demonym in "Jersey accent"', () => {
    const text = 'Barty detected a Jersey accent.';
    const start = text.indexOf('Jersey');
    const cls = classifyMention('Jersey', text, start, start + 6);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects verb-object fragment "only agree"', () => {
    const text = 'Frederick could only agree.';
    const start = text.indexOf('only');
    const cls = classifyMention('only agree', text, start, start + 'only agree'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects item fragment "figure something"', () => {
    const text = 'He hoped he could figure something out.';
    const start = text.indexOf('figure');
    const cls = classifyMention('figure something', text, start, start + 'figure something'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects capital + lower tail in "Monster Runner cards"', () => {
    const text = 'He loved collecting Monster Runner cards.';
    const start = text.indexOf('Monster');
    const cls = classifyMention('Monster Runner cards', text, start, start + 'Monster Runner cards'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('treats slogan/theme "Outta Here" as context-only', () => {
    const text = 'The dance’s theme, Gettin’ Outta Here, was printed on posters.';
    const start = text.indexOf('Outta');
    const cls = classifyMention('Outta Here', text, start, start + 'Outta Here'.length);
    expect(cls.mentionClass).not.toBe('DURABLE_NAME');
  });

  it('rejects interjection "Yeah"', () => {
    const text = 'Yeah, that makes sense.';
    const start = text.indexOf('Yeah');
    const cls = classifyMention('Yeah', text, start, start + 4);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects repeated-letter cry "Aggggghhhh"', () => {
    const text = 'Aggggghhhh! He shouted in fear.';
    const start = text.indexOf('Aggggghhhh');
    const cls = classifyMention('Aggggghhhh', text, start, start + 'Aggggghhhh'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects chapter heading style', () => {
    const text = 'CHAPTER SEVEN The Geezerly Ghosts';
    const start = 0;
    const cls = classifyMention('CHAPTER SEVEN', text, start, start + 'CHAPTER SEVEN'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects determiner + lowercase phrase', () => {
    const text = 'The professional family arrived together.';
    const start = text.indexOf('The');
    const cls = classifyMention('The professional family', text, start, start + 'The professional family'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects death token', () => {
    const text = 'Dead, dead, dead, she whispered.';
    const start = text.indexOf('Dead');
    const cls = classifyMention('Dead', text, start, start + 4);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects EMT as profession acronym', () => {
    const text = 'An EMT arrived with the ambulance.';
    const start = text.indexOf('EMT');
    const cls = classifyMention('EMT', text, start, start + 3);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects advert fragment', () => {
    const text = 'Ad written by the marketing team was catchy.';
    const start = text.indexOf('Ad');
    const cls = classifyMention('Ad written', text, start, start + 'Ad written'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });
});

describe('integration: extraction respects mention classification', () => {
  it('keeps real name but drops vocative "Listen"', async () => {
    const text = '“Listen, Freddy.”';
    const result = await extractFromSegments('listen-test', text);

    const hasListen = result.entities.some(e => e.canonical === 'Listen');
    const hasFreddy = result.entities.some(e => e.canonical === 'Freddy');

    expect(hasListen).toBe(false);
    expect(hasFreddy).toBe(true);
    expect(result.stats?.entities.rejected).toBeGreaterThan(0);
  });

  it('drops junk fragments while keeping real names', async () => {
    const text = [
      'Frederick could only agree.',
      'He tried to figure something out.',
      'He collected Monster Runner cards.',
      'The dance’s theme, Gettin’ Outta Here, was printed on posters.'
    ].join(' ');

    const result = await extractFromSegments('junk-filter', text);
    const names = result.entities.map(e => e.canonical.toLowerCase());
    expect(names).not.toContain('only agree');
    expect(names).not.toContain('figure something');
    expect(names).not.toContain('monster runner cards');
    expect(names).not.toContain('outta here');
    expect(result.stats?.entities.rejected).toBeGreaterThan(0);
  });
});
