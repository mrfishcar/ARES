/**
 * Exposition Generation Tests
 * Snapshot tests for deterministic wiki page generation
 */

import { describe, it, expect } from 'vitest';
import { compose } from '../app/generate/exposition';
import { toMarkdownPage } from '../app/generate/markdown';
import type { Entity, Relation, Conflict } from '../app/engine/schema';

describe('Exposition Generation', () => {
  it('generates deterministic wiki page for Aragorn', () => {
    const entities: Entity[] = [
      {
        id: 'e1',
        type: 'PERSON',
        canonical: 'Aragorn',
        aliases: ['Strider', 'Elessar'],
        created_at: new Date('2025-01-01').toISOString(),
      },
      {
        id: 'e2',
        type: 'PERSON',
        canonical: 'Arwen',
        aliases: [],
        created_at: new Date('2025-01-01').toISOString(),
      },
      {
        id: 'e3',
        type: 'PLACE',
        canonical: 'Minas Tirith',
        aliases: [],
        created_at: new Date('2025-01-01').toISOString(),
      },
      {
        id: 'e4',
        type: 'PLACE',
        canonical: 'Gondor',
        aliases: [],
        created_at: new Date('2025-01-01').toISOString(),
      },
      {
        id: 'e5',
        type: 'WORK',
        canonical: 'Anduril',
        aliases: [],
        created_at: new Date('2025-01-01').toISOString(),
      },
    ];

    const relations: Relation[] = [
      {
        id: 'r1',
        subj: 'e1',
        pred: 'married_to',
        obj: 'e2',
        evidence: [],
        confidence: 0.95,
        extractor: 'dep',
        qualifiers: [{ type: 'time', value: '3019' }],
      },
      {
        id: 'r2',
        subj: 'e1',
        pred: 'traveled_to',
        obj: 'e3',
        evidence: [],
        confidence: 0.9,
        extractor: 'dep',
        qualifiers: [{ type: 'time', value: '3019' }],
      },
      {
        id: 'r3',
        subj: 'e1',
        pred: 'lives_in',
        obj: 'e4',
        evidence: [],
        confidence: 0.85,
        extractor: 'dep',
      },
      {
        id: 'r4',
        subj: 'e1',
        pred: 'wields',
        obj: 'e5',
        evidence: [],
        confidence: 0.92,
        extractor: 'dep',
      },
    ];

    const conflicts: Conflict[] = [];

    const page = compose('e1', entities, relations, conflicts);
    const markdown = toMarkdownPage(page);

    // Verify key components are present
    expect(markdown).toContain('# Aragorn');
    expect(markdown).toContain('Strider');
    expect(markdown).toContain('Arwen');
    expect(markdown).toContain('Minas Tirith');
    expect(markdown).toContain('married');
    expect(markdown).toContain('traveled');

    // Verify deterministic output (no empty sections)
    expect(markdown).not.toContain('## Biography\n\n## ');
    expect(markdown).not.toContain('## Relationships\n\n## ');

    // Snapshot test for full output
    expect(markdown).toMatchSnapshot();
  });

  it('generates deterministic wiki page for Gandalf', () => {
    const entities: Entity[] = [
      {
        id: 'e1',
        type: 'PERSON',
        canonical: 'Gandalf',
        aliases: ['Gandalf the Grey', 'Mithrandir'],
        created_at: new Date('2025-01-01').toISOString(),
      },
      {
        id: 'e2',
        type: 'PLACE',
        canonical: 'Rivendell',
        aliases: [],
        created_at: new Date('2025-01-01').toISOString(),
      },
      {
        id: 'e3',
        type: 'PLACE',
        canonical: 'Minas Tirith',
        aliases: [],
        created_at: new Date('2025-01-01').toISOString(),
      },
      {
        id: 'e4',
        type: 'WORK',
        canonical: 'Magic',
        aliases: [],
        created_at: new Date('2025-01-01').toISOString(),
      },
    ];

    const relations: Relation[] = [
      {
        id: 'r1',
        subj: 'e1',
        pred: 'traveled_to',
        obj: 'e2',
        evidence: [],
        confidence: 0.88,
        extractor: 'dep',
        qualifiers: [{ type: 'time', value: '3018' }],
      },
      {
        id: 'r2',
        subj: 'e1',
        pred: 'traveled_to',
        obj: 'e3',
        evidence: [],
        confidence: 0.91,
        extractor: 'dep',
        qualifiers: [{ type: 'time', value: '3019' }],
      },
      {
        id: 'r3',
        subj: 'e1',
        pred: 'authored',
        obj: 'e4',
        evidence: [],
        confidence: 0.95,
        extractor: 'dep',
      },
    ];

    const conflicts: Conflict[] = [];

    const page = compose('e1', entities, relations, conflicts);
    const markdown = toMarkdownPage(page);

    // Verify key components
    expect(markdown).toContain('# Gandalf');
    expect(markdown).toContain('Mithrandir');
    expect(markdown).toContain('Rivendell');
    expect(markdown).toContain('traveled');
    expect(markdown).toContain('3018');
    expect(markdown).toContain('3019');

    // Verify timeline ordering (3018 should come before 3019)
    const pos3018 = markdown.indexOf('3018');
    const pos3019 = markdown.indexOf('3019');
    expect(pos3018).toBeLessThan(pos3019);

    // Snapshot test
    expect(markdown).toMatchSnapshot();
  });

  it('generates wiki page with disputed claims', () => {
    const entities: Entity[] = [
      {
        id: 'e1',
        type: 'PERSON',
        canonical: 'Frodo Baggins',
        aliases: [],
        created_at: new Date('2025-01-01').toISOString(),
      },
      {
        id: 'e2',
        type: 'PLACE',
        canonical: 'Shire',
        aliases: [],
        created_at: new Date('2025-01-01').toISOString(),
      },
    ];

    const relations: Relation[] = [
      {
        id: 'r1',
        subj: 'e1',
        pred: 'lives_in',
        obj: 'e2',
        evidence: [],
        confidence: 0.9,
        extractor: 'dep',
      },
    ];

    const conflicts: Conflict[] = [
      {
        type: 'single_valued',
        severity: 2,
        description: 'Conflicting information exists regarding age: 33 vs 50.',
        relations: [relations[0]], // Use first relation as example
      },
    ];

    const page = compose('e1', entities, relations, conflicts);
    const markdown = toMarkdownPage(page);

    // Verify disputed section
    expect(markdown).toContain('## Disputed Claims');
    expect(markdown).toContain('Conflicting information');
    expect(markdown).toContain('age');

    // Snapshot test
    expect(markdown).toMatchSnapshot();
  });

  it('handles low-confidence claims with grouped relationships', () => {
    const entities: Entity[] = [
      {
        id: 'e1',
        type: 'PERSON',
        canonical: 'Harry Potter',
        aliases: [],
        created_at: new Date('2025-01-01').toISOString(),
      },
      {
        id: 'e2',
        type: 'PERSON',
        canonical: 'Ginny Weasley',
        aliases: [],
        created_at: new Date('2025-01-01').toISOString(),
      },
    ];

    const relations: Relation[] = [
      {
        id: 'r1',
        subj: 'e1',
        pred: 'married_to',
        obj: 'e2',
        evidence: [],
        confidence: 0.65, // Low confidence
        extractor: 'regex',
      },
    ];

    const conflicts: Conflict[] = [];

    const page = compose('e1', entities, relations, conflicts);
    const markdown = toMarkdownPage(page);

    // Verify marriage is shown in grouped format (hedging not shown in grouped bullets)
    expect(markdown).toContain('**Spouse(s):**');
    expect(markdown).toContain('Ginny Weasley');

    expect(markdown).toMatchSnapshot();
  });

  it('does not include empty sections', () => {
    const entities: Entity[] = [
      {
        id: 'e1',
        type: 'PERSON',
        canonical: 'Simple Person',
        aliases: [],
        created_at: new Date('2025-01-01').toISOString(),
      },
    ];

    const relations: Relation[] = []; // No relations
    const conflicts: Conflict[] = [];

    const page = compose('e1', entities, relations, conflicts);
    const markdown = toMarkdownPage(page);

    // Verify no empty sections
    expect(markdown).not.toContain('## Biography\n\n## ');
    expect(markdown).not.toContain('## Relationships\n\n## ');
    expect(markdown).not.toContain('## Abilities\n\n## ');
    expect(markdown).not.toContain('## Items\n\n## ');
    expect(markdown).not.toContain('## Affiliations\n\n## ');
    expect(markdown).not.toContain('## Disputed Claims\n\n##');

    // But should still have name and infobox
    expect(markdown).toContain('# Simple Person');
    expect(markdown).toContain('## Infobox');
  });
});
