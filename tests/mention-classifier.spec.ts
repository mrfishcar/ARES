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
});
