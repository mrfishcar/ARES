import { test, expect } from 'vitest';
import { generateMarkdownPage } from '../dist/app/generate/markdown';
import type { KnowledgeGraph } from '../app/storage/storage';
import type { Entity, Relation } from '../app/engine/schema';

test('generateMarkdownPage includes header and relation details', () => {
  const maraId = 'entity-mara';
  const theoId = 'entity-theo';
  const entities: Entity[] = [
    {
      id: maraId,
      type: 'PERSON',
      canonical: 'Mara Ellsworth',
      aliases: ['Mara'],
      created_at: new Date().toISOString(),
    },
    {
      id: theoId,
      type: 'PERSON',
      canonical: 'Theo Ellsworth',
      aliases: ['Theo'],
      created_at: new Date().toISOString(),
    },
  ];

  const relations: Relation[] = [
    {
      id: 'rel1',
      subj: maraId,
      pred: 'sibling_of',
      obj: theoId,
      evidence: [],
      confidence: 0.95,
    },
    {
      id: 'rel2',
      subj: theoId,
      pred: 'sibling_of',
      obj: maraId,
      evidence: [],
      confidence: 0.75,
    },
  ];

  const graph: KnowledgeGraph = {
    entities,
    relations,
    conflicts: [],
    provenance: new Map(),
    profiles: new Map(),
    metadata: {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      doc_count: 1,
      doc_ids: ['doc-1'],
    },
  };

  const markdown = generateMarkdownPage(maraId, graph.entities, graph.relations, []);
  expect(markdown).toContain('# Mara Ellsworth');
  expect(markdown).toContain('Theo Ellsworth');
  expect(markdown).toContain('sibling of Theo Ellsworth');
});
