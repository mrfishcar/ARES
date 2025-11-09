import { describe, it, expect } from 'vitest';
import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';

describe('Test Simple David', () => {
  it('should extract David from simple sentence', async () => {
    const testPath = '/tmp/test-david.json';
    clearStorage(testPath);

    await appendDoc('doc1', 'David, son of Jesse, was born in Bethlehem.', testPath);
    const graph = loadGraph(testPath);

    const entities = graph?.entities.map(e => e.canonical).join(', ') || 'NONE';
    const entityCount = graph?.entities.length || 0;
    const relationCount = graph?.relations.length || 0;

    // Debug output
    console.log(`Extracted: ${entityCount} entities: ${entities}`);
    console.log(`Extracted: ${relationCount} relations`);

    // Validate that we extracted the expected entities
    expect(graph).not.toBeNull();
    expect(entityCount).toBeGreaterThanOrEqual(3); // At least David, Jesse, Bethlehem

    const entityNames = graph!.entities.map(e => e.canonical.toLowerCase());
    expect(entityNames).toContain('david');
    expect(entityNames).toContain('jesse');
    expect(entityNames).toContain('bethlehem');

    // Should extract at least parent_of/child_of relation
    expect(relationCount).toBeGreaterThanOrEqual(2);
  });
});
