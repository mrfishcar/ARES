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

    // This shows us the actual extraction
    expect(`${entityCount} entities: ${entities}`).toBe('SHOW_ENTITIES');
    expect(`${relationCount} relations`).toBe('SHOW_RELATIONS');
  });
});
