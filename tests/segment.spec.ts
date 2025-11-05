/**
 * Sentence Segmentation Tests
 * Comprehensive coverage of edge cases
 */

import { describe, it, expect } from 'vitest';
import { splitIntoSentences } from '../app/engine/segment';

describe('Sentence Segmentation', () => {
  it('handles basic sentences with periods', () => {
    const text = 'This is the first sentence. This is the second sentence.';
    const sentences = splitIntoSentences(text);

    expect(sentences).toHaveLength(2);
    expect(sentences[0].text).toBe('This is the first sentence.');
    expect(sentences[1].text).toBe('This is the second sentence.');
    expect(sentences[0].start).toBe(0);
    expect(sentences[0].end).toBe(27);
  });

  it('handles abbreviations without splitting', () => {
    const text = 'Dr. Smith visited Mr. Jones at the U.S. embassy on Jan. 15th.';
    const sentences = splitIntoSentences(text);

    expect(sentences).toHaveLength(1);
    expect(sentences[0].text).toBe(text);
  });

  it('handles initials correctly', () => {
    const text = 'J. R. R. Tolkien wrote The Lord of the Rings. It was published in 1954.';
    const sentences = splitIntoSentences(text);

    expect(sentences).toHaveLength(2);
    expect(sentences[0].text).toBe('J. R. R. Tolkien wrote The Lord of the Rings.');
    expect(sentences[1].text).toBe('It was published in 1954.');
  });

  it('handles quoted speech at end of sentence', () => {
    const text = 'He said, "This is a test." Then he left.';
    const sentences = splitIntoSentences(text);

    expect(sentences).toHaveLength(2);
    expect(sentences[0].text).toBe('He said, "This is a test."');
    expect(sentences[1].text).toBe('Then he left.');
  });

  it('handles quoted speech at beginning', () => {
    const text = '"Hello, world!" she exclaimed. Everyone heard her.';
    const sentences = splitIntoSentences(text);

    expect(sentences).toHaveLength(2);
    expect(sentences[0].text).toBe('"Hello, world!" she exclaimed.');
    expect(sentences[1].text).toBe('Everyone heard her.');
  });

  it('handles ellipses correctly', () => {
    const text = 'He was thinking... wondering what to do. Finally, he decided.';
    const sentences = splitIntoSentences(text);

    expect(sentences).toHaveLength(2);
    expect(sentences[0].text).toBe('He was thinking... wondering what to do.');
    expect(sentences[1].text).toBe('Finally, he decided.');
  });

  it('handles Unicode ellipsis character', () => {
    const text = 'Wait… what happened? I do not know.';
    const sentences = splitIntoSentences(text);

    expect(sentences).toHaveLength(2);
    expect(sentences[0].text).toBe('Wait… what happened?');
    expect(sentences[1].text).toBe('I do not know.');
  });

  it('handles exclamation and question marks', () => {
    const text = 'What is this? This is amazing! I can\'t believe it.';
    const sentences = splitIntoSentences(text);

    expect(sentences).toHaveLength(3);
    expect(sentences[0].text).toBe('What is this?');
    expect(sentences[1].text).toBe('This is amazing!');
    expect(sentences[2].text).toBe('I can\'t believe it.');
  });

  it('handles double newlines as paragraph breaks', () => {
    const text = 'First paragraph here.\n\nSecond paragraph here.';
    const sentences = splitIntoSentences(text);

    expect(sentences).toHaveLength(2);
    expect(sentences[0].text).toBe('First paragraph here.');
    expect(sentences[1].text).toBe('Second paragraph here.');
  });

  it('handles bullet points and lists', () => {
    const text = '• First item\n• Second item\n• Third item';
    const sentences = splitIntoSentences(text);

    // Each bullet should be a separate sentence (joined by newlines)
    expect(sentences.length).toBeGreaterThan(0);
    expect(sentences[0].text).toContain('First item');
  });

  it('joins orphan fragments to neighbors', () => {
    const text = 'This is a complete sentence. Short. This is another complete sentence.';
    const sentences = splitIntoSentences(text);

    // "Short." (6 chars) should be joined to neighbor
    expect(sentences.length).toBeLessThan(3);

    // Find the sentence containing "Short"
    const hasShort = sentences.some(s => s.text.includes('Short'));
    expect(hasShort).toBe(true);
  });

  it('handles emoji and Unicode characters', () => {
    const text = 'I love this! 😊 It makes me happy. What about you?';
    const sentences = splitIntoSentences(text);

    expect(sentences).toHaveLength(3);
    expect(sentences[0].text).toContain('I love this!');
    expect(sentences[1].text).toContain('It makes me happy.');
    expect(sentences[2].text).toBe('What about you?');
  });

  it('is deterministic and idempotent', () => {
    const text = 'Dr. Smith said, "Hello!" Then he left. J. R. R. Tolkien wrote books.';

    const result1 = splitIntoSentences(text);
    const result2 = splitIntoSentences(text);
    const result3 = splitIntoSentences(text);

    expect(result1).toEqual(result2);
    expect(result2).toEqual(result3);

    // Check that character offsets are correct
    for (const sentence of result1) {
      const extracted = text.substring(sentence.start, sentence.end);
      expect(extracted).toBe(sentence.text);
    }
  });

  it('handles empty and whitespace-only text', () => {
    expect(splitIntoSentences('')).toEqual([]);
    expect(splitIntoSentences('   ')).toEqual([]);
    expect(splitIntoSentences('\n\n\n')).toEqual([]);
  });

  it('handles text without sentence-ending punctuation', () => {
    const text = 'This is a fragment without ending punctuation';
    const sentences = splitIntoSentences(text);

    expect(sentences).toHaveLength(1);
    expect(sentences[0].text).toBe(text);
  });

  it('handles curly quotes correctly', () => {
    const text = 'He said, "This is quoted." She replied, "I agree."';
    const sentences = splitIntoSentences(text);

    expect(sentences).toHaveLength(2);
    expect(sentences[0].text).toContain('quoted');
    expect(sentences[1].text).toContain('agree');
  });

  it('handles decimal numbers without splitting', () => {
    const text = 'The price is $3.50. The temperature is 98.6 degrees.';
    const sentences = splitIntoSentences(text);

    expect(sentences).toHaveLength(2);
    expect(sentences[0].text).toBe('The price is $3.50.');
    expect(sentences[1].text).toBe('The temperature is 98.6 degrees.');
  });

  it('preserves character offsets accurately', () => {
    const text = '  First sentence.  Second sentence.  ';
    const sentences = splitIntoSentences(text);

    // Each sentence should have correct start/end positions in original text
    for (const sentence of sentences) {
      const extracted = text.substring(sentence.start, sentence.end);
      expect(extracted).toBe(sentence.text);
    }
  });
});
