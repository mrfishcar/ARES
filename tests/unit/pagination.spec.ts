/**
 * Unit tests for Keyset Cursor Pagination
 * Sprint R4
 */

import { describe, it, expect } from 'vitest';
import {
  encodeCursor,
  decodeCursor,
  validateLimit,
  sliceByCursor,
  MIN_PAGE,
  MAX_PAGE,
  DEFAULT_PAGE
} from '../../app/api/pagination';

describe('Cursor Encoding/Decoding', () => {
  it('should encode and decode cursor', () => {
    const sortKey = 'entity-123';
    const cursor = encodeCursor(sortKey);

    expect(cursor).toBeTruthy();
    expect(typeof cursor).toBe('string');

    const decoded = decodeCursor(cursor);
    expect(decoded.k).toBe(sortKey);
  });

  it('should throw on invalid cursor format', () => {
    expect(() => decodeCursor('invalid-base64!!!')).toThrow('INVALID_CURSOR');
  });

  it('should throw on cursor without key field', () => {
    const badCursor = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64');
    expect(() => decodeCursor(badCursor)).toThrow('INVALID_CURSOR');
  });

  it('should handle special characters in sort key', () => {
    const sortKey = 'entity:123/special-chars_@#$';
    const cursor = encodeCursor(sortKey);
    const decoded = decodeCursor(cursor);

    expect(decoded.k).toBe(sortKey);
  });

  it('should encode different keys to different cursors', () => {
    const cursor1 = encodeCursor('key1');
    const cursor2 = encodeCursor('key2');

    expect(cursor1).not.toBe(cursor2);
  });
});

describe('validateLimit', () => {
  it('should return default when limit is undefined', () => {
    expect(validateLimit(undefined)).toBe(DEFAULT_PAGE);
  });

  it('should return default when limit is null', () => {
    expect(validateLimit(null as any)).toBe(DEFAULT_PAGE);
  });

  it('should accept valid limits', () => {
    expect(validateLimit(10)).toBe(10);
    expect(validateLimit(MIN_PAGE)).toBe(MIN_PAGE);
    expect(validateLimit(MAX_PAGE)).toBe(MAX_PAGE);
  });

  it('should reject limits below minimum', () => {
    expect(() => validateLimit(0)).toThrow('Limit must be between');
    expect(() => validateLimit(-5)).toThrow('Limit must be between');
  });

  it('should reject limits above maximum', () => {
    expect(() => validateLimit(MAX_PAGE + 1)).toThrow('Limit must be between');
    expect(() => validateLimit(1000)).toThrow('Limit must be between');
  });
});

describe('sliceByCursor', () => {
  interface TestItem {
    id: string;
    name: string;
  }

  const items: TestItem[] = [
    { id: 'a', name: 'Alice' },
    { id: 'b', name: 'Bob' },
    { id: 'c', name: 'Charlie' },
    { id: 'd', name: 'Diana' },
    { id: 'e', name: 'Eve' }
  ];

  const getKey = (item: TestItem) => item.id;

  it('should return first page without cursor', () => {
    const result = sliceByCursor(items, getKey, undefined, 2);

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].id).toBe('a');
    expect(result.nodes[1].id).toBe('b');
    expect(result.hasNextPage).toBe(true);
    expect(result.endCursor).toBeTruthy();
  });

  it('should return next page with cursor', () => {
    // First page
    const page1 = sliceByCursor(items, getKey, undefined, 2);

    // Second page using endCursor
    const page2 = sliceByCursor(items, getKey, page1.endCursor!, 2);

    expect(page2.nodes).toHaveLength(2);
    expect(page2.nodes[0].id).toBe('c');
    expect(page2.nodes[1].id).toBe('d');
    expect(page2.hasNextPage).toBe(true);
  });

  it('should return last page correctly', () => {
    const cursor = encodeCursor('c'); // Start after 'c'
    const result = sliceByCursor(items, getKey, cursor, 10);

    expect(result.nodes).toHaveLength(2); // Only 'd' and 'e' left
    expect(result.nodes[0].id).toBe('d');
    expect(result.nodes[1].id).toBe('e');
    expect(result.hasNextPage).toBe(false);
  });

  it('should return empty when cursor is at end', () => {
    const cursor = encodeCursor('e'); // Start after last item
    const result = sliceByCursor(items, getKey, cursor, 10);

    expect(result.nodes).toHaveLength(0);
    expect(result.hasNextPage).toBe(false);
    expect(result.endCursor).toBeNull();
  });

  it('should respect limit', () => {
    const result = sliceByCursor(items, getKey, undefined, 3);

    expect(result.nodes).toHaveLength(3);
    expect(result.hasNextPage).toBe(true);
  });

  it('should handle limit larger than dataset', () => {
    const result = sliceByCursor(items, getKey, undefined, 100);

    expect(result.nodes).toHaveLength(5);
    expect(result.hasNextPage).toBe(false);
  });

  it('should throw on invalid cursor', () => {
    expect(() => sliceByCursor(items, getKey, 'invalid!!!', 10)).toThrow('Cursor error');
  });

  it('should throw on cursor key not found', () => {
    const cursor = encodeCursor('nonexistent');
    expect(() => sliceByCursor(items, getKey, cursor, 10)).toThrow('INVALID_CURSOR: key not found');
  });

  it('should validate limit bounds', () => {
    expect(() => sliceByCursor(items, getKey, undefined, 0)).toThrow('Limit must be between');
    expect(() => sliceByCursor(items, getKey, undefined, MAX_PAGE + 1)).toThrow('Limit must be between');
  });

  it('should use default limit when not provided', () => {
    const result = sliceByCursor(items, getKey);

    expect(result.nodes).toHaveLength(5); // Dataset smaller than default
    expect(result.hasNextPage).toBe(false);
  });

  it('should handle single item dataset', () => {
    const single = [{ id: 'x', name: 'Xavier' }];
    const result = sliceByCursor(single, getKey, undefined, 10);

    expect(result.nodes).toHaveLength(1);
    expect(result.hasNextPage).toBe(false);
    expect(result.endCursor).toBeTruthy();
  });

  it('should handle empty dataset', () => {
    const result = sliceByCursor([], getKey, undefined, 10);

    expect(result.nodes).toHaveLength(0);
    expect(result.hasNextPage).toBe(false);
    expect(result.endCursor).toBeNull();
  });

  it('should paginate consistently through entire dataset', () => {
    const allNodes: TestItem[] = [];
    let cursor: string | null | undefined = undefined;

    // Paginate through entire dataset
    while (true) {
      const result = sliceByCursor(items, getKey, cursor, 2);
      allNodes.push(...result.nodes);

      if (!result.hasNextPage) break;
      cursor = result.endCursor!;
    }

    // Should have collected all items
    expect(allNodes).toHaveLength(items.length);
    expect(allNodes.map(n => n.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
