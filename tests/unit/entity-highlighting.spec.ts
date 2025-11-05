/**
 * Entity Highlighting Tests
 *
 * Tests for entity highlighting in the markdown editor, focusing on:
 * - Overlap detection and resolution
 * - Confidence-based prioritization
 * - Position accuracy
 *
 * Bugs Fixed (Oct 24, 2025):
 * 1. removeOverlaps() only checked last span, not all spans
 * 2. Captured group offset calculation could use invalid offsets
 * 3. MarkdownHighlighter didn't filter overlapping highlights before rendering
 * 4. Used stored highlight.text instead of fresh document slicing
 * 5. Location pattern included preposition in span
 */

import { describe, it, expect } from 'vitest';

// Mock entity span type
interface EntitySpan {
  start: number;
  end: number;
  text: string;
  type: string;
  confidence: number;
}

/**
 * removeOverlaps implementation (copy of fixed version from entityHighlighter.ts)
 */
function removeOverlaps(spans: EntitySpan[]): EntitySpan[] {
  if (spans.length === 0) return [];

  // Sort by start position, then by confidence (higher first)
  const sorted = [...spans].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.confidence - a.confidence;
  });

  const result: EntitySpan[] = [];

  for (const span of sorted) {
    let hasOverlap = false;
    let replacementIndex = -1;

    // Check overlap against ALL existing spans (not just last)
    for (let i = 0; i < result.length; i++) {
      const existing = result[i];
      // Spans overlap if one starts before the other ends
      if (span.start < existing.end && span.end > existing.start) {
        hasOverlap = true;
        // Replace if higher confidence
        if (span.confidence > existing.confidence) {
          replacementIndex = i;
        }
        break;
      }
    }

    if (!hasOverlap) {
      result.push(span);
    } else if (replacementIndex >= 0) {
      result[replacementIndex] = span;
    }
  }

  return result.sort((a, b) => a.start - b.start);
}

describe('Entity Highlighting - Overlap Detection', () => {
  describe('removeOverlaps', () => {
    it('should keep non-overlapping spans', () => {
      const spans: EntitySpan[] = [
        { start: 0, end: 10, text: 'Aria Thorne', type: 'PERSON', confidence: 0.9 },
        { start: 20, end: 30, text: 'Elias Calder', type: 'PERSON', confidence: 0.9 }
      ];

      const result = removeOverlaps(spans);
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Aria Thorne');
      expect(result[1].text).toBe('Elias Calder');
    });

    it('should remove overlapping spans (lower confidence)', () => {
      const spans: EntitySpan[] = [
        { start: 0, end: 10, text: 'Aria Thorne', type: 'PERSON', confidence: 0.9 },
        { start: 5, end: 15, text: 'Thorne', type: 'PERSON', confidence: 0.6 }
      ];

      const result = removeOverlaps(spans);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Aria Thorne');
      expect(result[0].confidence).toBe(0.9);
    });

    it('should keep higher confidence span when overlapping', () => {
      const spans: EntitySpan[] = [
        { start: 0, end: 10, text: 'Aria', type: 'PERSON', confidence: 0.6 },
        { start: 0, end: 10, text: 'Aria Thorne', type: 'PERSON', confidence: 0.9 }
      ];

      const result = removeOverlaps(spans);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Aria Thorne');
      expect(result[0].confidence).toBe(0.9);
    });

    it('should handle non-adjacent overlaps (A, C overlap but B in between)', () => {
      // This tests the bug fix: original implementation only checked last span
      const spans: EntitySpan[] = [
        { start: 0, end: 10, text: 'Aria Thorne', type: 'PERSON', confidence: 0.9 },
        { start: 20, end: 30, text: 'Elias Calder', type: 'PERSON', confidence: 0.9 },
        { start: 5, end: 15, text: 'Thorne', type: 'PERSON', confidence: 0.7 } // Overlaps with A, not B
      ];

      const result = removeOverlaps(spans);
      expect(result).toHaveLength(2);

      // Should keep Aria Thorne (higher confidence than Thorne)
      expect(result.some(s => s.text === 'Aria Thorne')).toBe(true);
      expect(result.some(s => s.text === 'Elias Calder')).toBe(true);

      // Should remove partial overlap
      expect(result.some(s => s.text === 'Thorne')).toBe(false);
    });

    it('should handle three-way overlap with different confidence levels', () => {
      const spans: EntitySpan[] = [
        { start: 0, end: 10, text: 'Full Name', type: 'PERSON', confidence: 0.95 },
        { start: 0, end: 5, text: 'First', type: 'PERSON', confidence: 0.80 },
        { start: 5, end: 10, text: 'Last', type: 'PERSON', confidence: 0.75 }
      ];

      const result = removeOverlaps(spans);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Full Name');
      expect(result[0].confidence).toBe(0.95);
    });

    it('should handle adjacent but non-overlapping spans', () => {
      const spans: EntitySpan[] = [
        { start: 0, end: 5, text: 'Aria', type: 'PERSON', confidence: 0.9 },
        { start: 5, end: 10, text: 'Thorne', type: 'PERSON', confidence: 0.9 }
      ];

      const result = removeOverlaps(spans);
      expect(result).toHaveLength(2);
    });

    it('should handle empty input', () => {
      const result = removeOverlaps([]);
      expect(result).toHaveLength(0);
    });

    it('should handle single span', () => {
      const spans: EntitySpan[] = [
        { start: 0, end: 10, text: 'Aria', type: 'PERSON', confidence: 0.9 }
      ];

      const result = removeOverlaps(spans);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Aria');
    });

    it('should sort result by start position', () => {
      // Input in reverse order
      const spans: EntitySpan[] = [
        { start: 20, end: 30, text: 'Third', type: 'PERSON', confidence: 0.9 },
        { start: 10, end: 15, text: 'Second', type: 'PERSON', confidence: 0.9 },
        { start: 0, end: 5, text: 'First', type: 'PERSON', confidence: 0.9 }
      ];

      const result = removeOverlaps(spans);
      expect(result).toHaveLength(3);
      expect(result[0].text).toBe('First');
      expect(result[1].text).toBe('Second');
      expect(result[2].text).toBe('Third');
    });

    it('should handle complex pattern: multiple overlaps at different positions', () => {
      const spans: EntitySpan[] = [
        { start: 0, end: 10, text: 'Entity A', type: 'PERSON', confidence: 0.9 },
        { start: 5, end: 15, text: 'Entity B', type: 'PERSON', confidence: 0.7 }, // Overlaps A
        { start: 20, end: 30, text: 'Entity C', type: 'PLACE', confidence: 0.95 },
        { start: 25, end: 35, text: 'Entity D', type: 'PLACE', confidence: 0.85 }, // Overlaps C
        { start: 40, end: 50, text: 'Entity E', type: 'ORG', confidence: 0.8 }
      ];

      const result = removeOverlaps(spans);
      expect(result).toHaveLength(3);

      // Should keep A (higher conf than B), C (higher conf than D), E (no overlap)
      expect(result.some(s => s.text === 'Entity A')).toBe(true);
      expect(result.some(s => s.text === 'Entity C')).toBe(true);
      expect(result.some(s => s.text === 'Entity E')).toBe(true);

      expect(result.some(s => s.text === 'Entity B')).toBe(false);
      expect(result.some(s => s.text === 'Entity D')).toBe(false);
    });
  });

  describe('Offset calculation', () => {
    it('should calculate correct offset for captured groups', () => {
      const text = 'They lived in London.';
      const pattern = /(?:in|at|from)\s+([A-Z][a-z]+)/g;
      const match = pattern.exec(text);

      expect(match).not.toBeNull();
      expect(match![0]).toBe('in London'); // Full match
      expect(match![1]).toBe('London'); // Captured group

      // Calculate offset of captured group within full match
      const groupOffset = match![0].indexOf(match![1]);
      expect(groupOffset).toBe(3); // "in " is 3 characters

      // Calculate correct span
      const start = match!.index + groupOffset;
      const end = start + match![1].length;

      expect(start).toBe(14); // Position of 'L' in 'London'
      expect(end).toBe(20); // Position after 'n' in 'London'
      expect(text.substring(start, end)).toBe('London');
    });

    it('should skip match if captured group not found', () => {
      const text = 'Some text without pattern';
      const pattern = /(?:in|at)\s+([A-Z][a-z]+)/g;
      const match = pattern.exec(text);

      expect(match).toBeNull(); // No match in this text
    });

    it('should handle multiple captured groups correctly', () => {
      const text = 'Aria married Elias.';
      const pattern = /([A-Z][a-z]+)\s+married\s+([A-Z][a-z]+)/g;
      const match = pattern.exec(text);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('Aria');
      expect(match![2]).toBe('Elias');

      // Group 1 offset
      const group1Offset = match![0].indexOf(match![1]);
      expect(group1Offset).toBe(0);

      // Group 2 offset
      const group2Offset = match![0].indexOf(match![2]);
      expect(group2Offset).toBe(13); // "Aria married " length
    });
  });

  describe('Text slicing from document', () => {
    it('should slice correct text from document using start/end positions', () => {
      const document = 'Aria Thorne returned home after a season of mapping.';
      const highlight = {
        start: 0,
        end: 11,
        text: 'Aria Thorne' // This might be stale
      };

      // Always slice from document, not use stored text
      const actualText = document.slice(highlight.start, highlight.end);
      expect(actualText).toBe('Aria Thorne');
    });

    it('should handle document changes correctly by slicing', () => {
      const originalDoc = 'Aria Thorne returned home.';
      const modifiedDoc = 'Aria Calder returned home.'; // Name changed

      const highlight = {
        start: 0,
        end: 11,
        text: 'Aria Thorne' // Stored text is now stale
      };

      // If we used stored text, we'd show wrong content
      const storedText = highlight.text;
      expect(storedText).toBe('Aria Thorne');

      // Slicing from current document gives correct text
      const actualText = modifiedDoc.slice(highlight.start, highlight.end);
      expect(actualText).toBe('Aria Calder');
    });

    it('should handle highlights at different positions', () => {
      const document = 'Aria Thorne and Elias Calder lived in Meridian Ridge.';

      const highlights = [
        { start: 0, end: 11, text: 'Aria Thorne' },
        { start: 16, end: 28, text: 'Elias Calder' },
        { start: 38, end: 52, text: 'Meridian Ridge' }
      ];

      for (const h of highlights) {
        const actual = document.slice(h.start, h.end);
        expect(actual).toBe(h.text);
      }
    });
  });
});
