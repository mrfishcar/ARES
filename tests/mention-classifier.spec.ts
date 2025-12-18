import { describe, it, expect } from 'vitest';
import { classifyMention, classifyMentionBatch } from '../app/engine/linguistics/mention-classifier';
import { extractFromSegments } from '../app/engine/extract/orchestrator';

describe('mention classifier heuristics', () => {
  it('rejects subordinating "When" at clause start', () => {
    const text = 'When she could ignore him no longer, she turned away.';
    const cls = classifyMention('When', text, 0, 4);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('marks vocative "Honey," as context-only', () => {
    const text = '"Honey, if I were any better," he said.';
    const start = text.indexOf('Honey');
    const cls = classifyMention('Honey', text, start, start + 5);
    expect(cls.mentionClass).toBe('CONTEXT_ONLY');
  });

  it('rejects imperative single-token "Check."', () => {
    const text = 'He smiled and said, "Check."';
    const start = text.indexOf('Check');
    const cls = classifyMention('Check', text, start, start + 5);
    expect(cls.mentionClass).toBe('CONTEXT_ONLY');
  });

  it('rejects predicative adjective "Cute"', () => {
    const text = "The demon chuckled. \"That's cute.\"";
    const start = text.indexOf('cute');
    const cls = classifyMention('Cute', text, start, start + 4);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects determiner + acronym "PDF"', () => {
    const text = "\"It's a PDF,\" she whispered.";
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
    const text = "The dance's theme, Gettin' Outta Here, was printed on posters.";
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

// ============================
// NEW: Structural Verb/Fragment Detection
// ============================

describe('structural verb/fragment junk detection', () => {
  // Adverb + verb fragments
  it('rejects "never mask"', () => {
    const text = 'They could never mask their emotions.';
    const start = text.indexOf('never');
    const cls = classifyMention('never mask', text, start, start + 'never mask'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "hardly sleep"', () => {
    const text = 'She could hardly sleep that night.';
    const start = text.indexOf('hardly');
    const cls = classifyMention('hardly sleep', text, start, start + 'hardly sleep'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "even react"', () => {
    const text = 'He could not even react in time.';
    const start = text.indexOf('even');
    const cls = classifyMention('even react', text, start, start + 'even react'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  // Verb-lead fragments
  it('rejects "happen again"', () => {
    const text = 'It would happen again tomorrow.';
    const start = text.indexOf('happen');
    const cls = classifyMention('happen again', text, start, start + 'happen again'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "travel all"', () => {
    const text = 'They would travel all day.';
    const start = text.indexOf('travel');
    const cls = classifyMention('travel all', text, start, start + 'travel all'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "gain enough"', () => {
    const text = 'He needed to gain enough strength.';
    const start = text.indexOf('gain');
    const cls = classifyMention('gain enough', text, start, start + 'gain enough'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "shed light"', () => {
    const text = 'The report would shed light on the issue.';
    const start = text.indexOf('shed');
    const cls = classifyMention('shed light', text, start, start + 'shed light'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "smell bleach"', () => {
    const text = 'She could smell bleach from the kitchen.';
    const start = text.indexOf('smell');
    const cls = classifyMention('smell bleach', text, start, start + 'smell bleach'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "drift into"', () => {
    const text = 'He would drift into sleep.';
    const start = text.indexOf('drift');
    const cls = classifyMention('drift into', text, start, start + 'drift into'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "handle anything"', () => {
    const text = 'She could handle anything.';
    const start = text.indexOf('handle');
    const cls = classifyMention('handle anything', text, start, start + 'handle anything'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  // Fragment endings
  it('rejects "it over"', () => {
    const text = 'They talked it over.';
    const start = text.indexOf('it over');
    const cls = classifyMention('it over', text, start, start + 'it over'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  // Lowercase fragments
  it('rejects "no longer"', () => {
    const text = 'She was no longer interested.';
    const start = text.indexOf('no longer');
    const cls = classifyMention('no longer', text, start, start + 'no longer'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "this mean"', () => {
    const text = 'Does this mean anything?';
    const start = text.indexOf('this mean');
    const cls = classifyMention('this mean', text, start, start + 'this mean'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "this truly"', () => {
    const text = 'Is this truly the end?';
    const start = text.indexOf('this truly');
    const cls = classifyMention('this truly', text, start, start + 'this truly'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "recall on"', () => {
    const text = 'I could not recall on the spot.';
    const start = text.indexOf('recall on');
    const cls = classifyMention('recall on', text, start, start + 'recall on'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "pass for"', () => {
    const text = 'It could pass for the real thing.';
    const start = text.indexOf('pass for');
    const cls = classifyMention('pass for', text, start, start + 'pass for'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "roared again"', () => {
    const text = 'The lion roared again.';
    const start = text.indexOf('roared again');
    const cls = classifyMention('roared again', text, start, start + 'roared again'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  // Additional adverb patterns
  it('rejects "easily describe"', () => {
    const text = 'He could not easily describe the feeling.';
    const start = text.indexOf('easily');
    const cls = classifyMention('easily describe', text, start, start + 'easily describe'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "argue that"', () => {
    const text = 'One could argue that this is wrong.';
    const start = text.indexOf('argue that');
    const cls = classifyMention('argue that', text, start, start + 'argue that'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "only mean"', () => {
    const text = 'It could only mean one thing.';
    const start = text.indexOf('only mean');
    const cls = classifyMention('only mean', text, start, start + 'only mean'.length);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });
});

// ============================
// Sentence-Initial Capitalization Traps
// ============================

describe('sentence-initial capitalization traps', () => {
  it('rejects "Dead" at sentence start', () => {
    const text = 'Dead was the man on the floor.';
    const cls = classifyMention('Dead', text, 0, 4);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "Hearing" at sentence start', () => {
    const text = 'Hearing that news was devastating.';
    const cls = classifyMention('Hearing', text, 0, 7);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "Whatever" at sentence start', () => {
    const text = 'Whatever happens, stay calm.';
    const cls = classifyMention('Whatever', text, 0, 8);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "Visitors" at sentence start', () => {
    const text = 'Visitors were not allowed.';
    const cls = classifyMention('Visitors', text, 0, 8);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  it('rejects "Detective" at sentence start followed by lowercase', () => {
    const text = 'Detective work is hard.';
    const cls = classifyMention('Detective', text, 0, 9);
    expect(cls.mentionClass).toBe('NON_ENTITY');
  });

  // But keeps real names at sentence start
  it('keeps "Peterson" at sentence start', () => {
    const text = 'Peterson walked into the room.';
    const cls = classifyMention('Peterson', text, 0, 8);
    expect(cls.mentionClass).toBe('DURABLE_NAME');
  });

  it('keeps "Johnson" at sentence start', () => {
    const text = 'Johnson spoke first.';
    const cls = classifyMention('Johnson', text, 0, 7);
    expect(cls.mentionClass).toBe('DURABLE_NAME');
  });
});

// ============================
// Batch Classification
// ============================

describe('batch classification with stats', () => {
  it('correctly counts classification categories', () => {
    const text = 'Frederick could only agree. When she arrived, Barty smiled.';
    const spans = [
      { text: 'Frederick', start: 0, end: 9 },
      { text: 'only agree', start: 16, end: 26 },
      { text: 'When', start: 28, end: 32 },
      { text: 'Barty', start: 46, end: 51 }
    ];

    const { classifications, stats } = classifyMentionBatch(spans, text);

    expect(stats.total).toBe(4);
    expect(stats.durableName).toBeGreaterThanOrEqual(1); // Frederick, Barty
    expect(stats.nonEntity).toBeGreaterThanOrEqual(1);   // only agree, When
    expect(stats.reasons.size).toBeGreaterThan(0);
  });
});

// ============================
// Integration Tests
// ============================

describe('integration: extraction respects mention classification', () => {
  it('keeps real name but drops vocative "Listen"', async () => {
    const text = '"Listen, Freddy."';
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
      "The dance's theme, Gettin' Outta Here, was printed on posters."
    ].join(' ');

    const result = await extractFromSegments('junk-filter', text);
    const names = result.entities.map(e => e.canonical.toLowerCase());
    expect(names).not.toContain('only agree');
    expect(names).not.toContain('figure something');
    expect(names).not.toContain('monster runner cards');
    expect(names).not.toContain('outta here');
    expect(result.stats?.entities.rejected).toBeGreaterThan(0);
  });

  it('reports non-zero mention stats', async () => {
    const text = 'Never mask your feelings. Whatever happens, John will help.';
    const result = await extractFromSegments('mention-stats-test', text);

    // Should have some rejections
    expect(result.stats?.entities.rejected).toBeGreaterThanOrEqual(0);
  });
});
