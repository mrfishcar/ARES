/**
 * Deterministic Graph Hash Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hashGraph, canonicalizeGraph } from '../app/infra/determinism';
import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import * as path from 'path';

describe('Deterministic Graph Hash', () => {
  const testPath1 = path.join(process.cwd(), 'test-determinism-1.json');
  const testPath2 = path.join(process.cwd(), 'test-determinism-2.json');
  const testPath3 = path.join(process.cwd(), 'test-determinism-3.json');

  beforeEach(() => {
    clearStorage(testPath1);
    clearStorage(testPath2);
    clearStorage(testPath3);
  });

  afterEach(() => {
    clearStorage(testPath1);
    clearStorage(testPath2);
    clearStorage(testPath3);
  });

  it('same input twice produces same hash', async () => {
    // First run
    await appendDoc('doc1', 'Gandalf traveled to Rivendell.', testPath1);
    await appendDoc('doc2', 'Gandalf the Grey met Aragorn.', testPath1);

    const graph1 = loadGraph(testPath1);
    expect(graph1).not.toBeNull();
    const h1 = hashGraph(graph1!);

    // Second run - same docs, same order
    await appendDoc('doc1', 'Gandalf traveled to Rivendell.', testPath2);
    await appendDoc('doc2', 'Gandalf the Grey met Aragorn.', testPath2);

    const graph2 = loadGraph(testPath2);
    expect(graph2).not.toBeNull();
    const h2 = hashGraph(graph2!);

    expect(h1).toBe(h2);
  });

  it('canonicalization is idempotent', async () => {
    await appendDoc('doc1', 'Gandalf traveled to Rivendell.', testPath1);
    await appendDoc('doc2', 'Gandalf the Grey met Aragorn.', testPath1);

    const graph = loadGraph(testPath1);
    expect(graph).not.toBeNull();

    // Canonicalize twice
    const c1 = canonicalizeGraph(graph!);
    const c2 = canonicalizeGraph(graph!);

    // Should be identical
    expect(JSON.stringify(c1)).toBe(JSON.stringify(c2));
  });

  it('save/load round-trip preserves hash', async () => {
    // Create graph
    await appendDoc('doc1', 'Gandalf traveled to Rivendell.', testPath1);
    await appendDoc('doc2', 'Gandalf the Grey met Aragorn.', testPath1);

    const graph1 = loadGraph(testPath1);
    expect(graph1).not.toBeNull();
    const h1 = hashGraph(graph1!);

    // Load from saved file
    const loaded = loadGraph(testPath1);
    expect(loaded).not.toBeNull();
    const h2 = hashGraph(loaded!);

    expect(h2).toBe(h1);
  });

  it('canonicalizeGraph sorts entities by type then canonical name', () => {
    const graph: any = {
      entities: [
        { id: 'z', type: 'PERSON', canonical: 'Z', aliases: [], centrality: 1.0, created_at: '2025-01-01' },
        { id: 'a', type: 'PERSON', canonical: 'A', aliases: [], centrality: 1.0, created_at: '2025-01-02' }
      ],
      relations: [],
      conflicts: [],
      provenance: new Map(),
      metadata: { doc_count: 0, doc_ids: [] }
    };

    const canonical = canonicalizeGraph(graph);
    expect(canonical.entities[0].canonical).toBe('A');
    expect(canonical.entities[1].canonical).toBe('Z');
    // Verify volatile fields excluded
    expect(canonical.entities[0].id).toBeUndefined();
    expect(canonical.entities[0].created_at).toBeUndefined();
    expect(canonical.entities[0].centrality).toBeUndefined();
  });

  it('canonicalizeGraph sorts relations by canonical names', () => {
    const graph: any = {
      entities: [
        { id: 'id_a', type: 'PERSON', canonical: 'Alice', aliases: [] },
        { id: 'id_b', type: 'PERSON', canonical: 'Bob', aliases: [] },
        { id: 'id_c', type: 'PLACE', canonical: 'Cairo', aliases: [] }
      ],
      relations: [
        { id: 'r3', subj: 'id_b', pred: 'married_to', obj: 'id_c', confidence: 0.9, extractor: 'dep', evidence: [] },
        { id: 'r1', subj: 'id_a', pred: 'traveled_to', obj: 'id_b', confidence: 0.9, extractor: 'dep', evidence: [] },
        { id: 'r2', subj: 'id_a', pred: 'met', obj: 'id_c', confidence: 0.9, extractor: 'dep', evidence: [] }
      ],
      conflicts: [],
      provenance: new Map(),
      metadata: { doc_count: 0, doc_ids: [] }
    };

    const canonical = canonicalizeGraph(graph);
    // Uses canonical names, sorted
    expect(canonical.relations[0].subj).toBe('Alice');
    expect(canonical.relations[0].pred).toBe('met');
    expect(canonical.relations[0].obj).toBe('Cairo');
    expect(canonical.relations[1].subj).toBe('Alice');
    expect(canonical.relations[1].pred).toBe('traveled_to');
    expect(canonical.relations[1].obj).toBe('Bob');
  });

  it('canonicalizeGraph excludes volatile timestamp fields', () => {
    const graph: any = {
      entities: [
        { id: 'e1', type: 'PERSON', canonical: 'Test', aliases: [], centrality: 1.0, created_at: '2025-01-01T10:00:00Z' }
      ],
      relations: [],
      conflicts: [],
      provenance: new Map([
        ['local1', { global_id: 'e1', doc_id: 'doc1', merged_at: '2025-01-01T10:00:00Z', local_canonical: 'Test' }]
      ]),
      metadata: {
        doc_count: 1,
        doc_ids: ['doc1'],
        created_at: '2025-01-01T10:00:00Z',
        updated_at: '2025-01-01T10:05:00Z'
      }
    };

    const canonical = canonicalizeGraph(graph);

    // Volatile fields should be excluded
    expect(canonical.entities[0].id).toBeUndefined();
    expect(canonical.entities[0].created_at).toBeUndefined();
    expect(canonical.entities[0].centrality).toBeUndefined();
    expect(canonical.metadata.created_at).toBeUndefined();
    expect(canonical.metadata.updated_at).toBeUndefined();

    // Non-volatile fields should be present
    expect(canonical.entities[0].canonical).toBe('Test');
    expect(canonical.provenance[0].global_canonical).toBe('Test');
    expect(canonical.metadata.doc_count).toBe(1);
  });
});
