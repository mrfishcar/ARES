/**
 * Console Storage Tests - Sprint R5
 * Unit tests for sessionStorage persistence
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { saveState, loadState, clearState } from '../../app/ui/console/src/lib/storage';

describe('Console - Storage Utilities', () => {
  beforeEach(() => {
    // Clear storage before each test
    clearState();
  });

  afterEach(() => {
    // Clean up after each test
    clearState();
  });

  it('should save and load state', () => {
    const testData = { project: 'test', filter: 'PERSON' };
    saveState('test-key', testData);

    const loaded = loadState('test-key', null);
    expect(loaded).toEqual(testData);
  });

  it('should return default value when key not found', () => {
    const defaultValue = { project: 'default' };
    const loaded = loadState('nonexistent-key', defaultValue);
    expect(loaded).toEqual(defaultValue);
  });

  it('should handle string values', () => {
    saveState('project', 'test-project');
    const loaded = loadState('project', '');
    expect(loaded).toBe('test-project');
  });

  it('should handle number values', () => {
    saveState('count', 42);
    const loaded = loadState('count', 0);
    expect(loaded).toBe(42);
  });

  it('should handle array values', () => {
    const testArray = ['entity1', 'entity2', 'entity3'];
    saveState('entities', testArray);
    const loaded = loadState('entities', []);
    expect(loaded).toEqual(testArray);
  });

  it('should clear all state', () => {
    saveState('key1', 'value1');
    saveState('key2', 'value2');
    saveState('key3', 'value3');

    clearState();

    expect(loadState('key1', null)).toBeNull();
    expect(loadState('key2', null)).toBeNull();
    expect(loadState('key3', null)).toBeNull();
  });

  it('should handle persistence across function calls', () => {
    saveState('persistent-key', { data: 'persistent' });

    // Simulate reload by creating new load
    const firstLoad = loadState('persistent-key', null);
    const secondLoad = loadState('persistent-key', null);

    expect(firstLoad).toEqual(secondLoad);
  });

  it('should handle JSON serialization errors gracefully', () => {
    // Circular reference would cause JSON.stringify to fail
    const circular: any = { a: 1 };
    circular.self = circular;

    // Should not throw, just log error
    expect(() => saveState('circular', circular)).not.toThrow();
  });
});
