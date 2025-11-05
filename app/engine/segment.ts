/**
 * Sentence Segmentation - Robust, Rule-Based
 * Handles quotes, abbreviations, initials, ellipses, bullets, and Unicode
 */

export interface Sentence {
  start: number;  // Character offset in original text
  end: number;    // Character offset in original text
  text: string;   // Sentence text
}

// Common abbreviations that should NOT trigger sentence breaks
const ABBREVIATIONS = new Set([
  'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Sr.', 'Jr.',
  'St.', 'Mt.', 'vs.', 'etc.', 'e.g.', 'i.e.',
  'U.S.', 'U.K.', 'U.N.', 'E.U.',
  'Inc.', 'Ltd.', 'Co.', 'Corp.',
  'Jan.', 'Feb.', 'Mar.', 'Apr.', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Sept.', 'Oct.', 'Nov.', 'Dec.',
  'Mon.', 'Tue.', 'Wed.', 'Thu.', 'Fri.', 'Sat.', 'Sun.',
  'a.m.', 'p.m.', 'A.M.', 'P.M.',
  'vol.', 'pp.', 'ed.', 'al.',
  'Ph.D.', 'M.D.', 'B.A.', 'M.A.', 'D.D.S.'
]);

// Sentence-ending punctuation
const SENTENCE_ENDERS = new Set(['.', '!', '?', '…']);

// Quote marks (both straight and curly)
const QUOTE_MARKS = new Set(['"', "'", '\u201C', '\u201D', '\u2018', '\u2019', '«', '»']);

/**
 * Split text into sentences with character offsets
 * Pure, deterministic, rule-based segmentation
 */
export function splitIntoSentences(text: string): Sentence[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const sentences: Sentence[] = [];
  let currentStart = 0;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    // Check for sentence-ending punctuation
    if (SENTENCE_ENDERS.has(char)) {
      let end = i + 1;

      // Handle ellipsis (... or …)
      if (char === '.' && i + 2 < text.length && text[i + 1] === '.' && text[i + 2] === '.') {
        end = i + 3;
        i = end - 1;
      }

      // Look ahead for closing quotes
      while (end < text.length && QUOTE_MARKS.has(text[end])) {
        end++;
      }

      // Look ahead for closing punctuation (e.g., ." or !")
      if (end < text.length && (text[end] === '"' || text[end] === ')' || text[end] === ']')) {
        end++;
      }

      // Check if this is actually a sentence boundary
      if (isSentenceBoundary(text, i, end)) {
        // Extract sentence
        let sentenceText = text.substring(currentStart, end).trim();

        if (sentenceText.length > 0) {
          // Find actual start/end positions (accounting for trimming)
          const actualStart = text.indexOf(sentenceText, currentStart);
          const actualEnd = actualStart + sentenceText.length;

          sentences.push({
            start: actualStart,
            end: actualEnd,
            text: sentenceText
          });

          currentStart = end;
        }
      }

      i = end;
    } else if (char === '\n' && i + 1 < text.length && text[i + 1] === '\n') {
      // Double newline - treat as paragraph break / sentence boundary
      const sentenceText = text.substring(currentStart, i).trim();

      if (sentenceText.length > 0) {
        const actualStart = text.indexOf(sentenceText, currentStart);
        const actualEnd = actualStart + sentenceText.length;

        sentences.push({
          start: actualStart,
          end: actualEnd,
          text: sentenceText
        });
      }

      // Skip the double newline
      i += 2;
      currentStart = i;
    } else {
      i++;
    }
  }

  // Handle remaining text
  const remaining = text.substring(currentStart).trim();
  if (remaining.length > 0) {
    const actualStart = text.indexOf(remaining, currentStart);
    const actualEnd = actualStart + remaining.length;

    sentences.push({
      start: actualStart,
      end: actualEnd,
      text: remaining
    });
  }

  // Join orphan fragments (< 20 chars) to neighbors
  return joinOrphanFragments(sentences);
}

/**
 * Check if a period/punctuation marks a true sentence boundary
 */
function isSentenceBoundary(text: string, punctPos: number, endPos: number): boolean {
  const char = text[punctPos];

  // Check what follows the punctuation
  let nextPos = endPos;

  // Skip whitespace
  while (nextPos < text.length && /\s/.test(text[nextPos])) {
    nextPos++;
  }

  // ! and ? are almost always sentence boundaries, BUT...
  // Exception: if followed by lowercase (e.g., "Hello!" she said), not a boundary
  if (char === '!' || char === '?') {
    if (nextPos < text.length) {
      const nextChar = text[nextPos];

      // If next character is lowercase, probably dialogue tag continuation
      if (nextChar === nextChar.toLowerCase() && nextChar !== nextChar.toUpperCase()) {
        return false;
      }
    }
    return true;
  }

  // For periods and ellipses, check for abbreviations and initials
  if (char === '.' || char === '…') {
    // Check for abbreviations
    if (isAbbreviation(text, punctPos)) {
      return false;
    }

    // Check for initials (single letter followed by period)
    if (isInitial(text, punctPos)) {
      return false;
    }

    // Check for numbers (e.g., "3.14" or "$4.99")
    if (isDecimalNumber(text, punctPos)) {
      return false;
    }

    // If followed by lowercase letter (and not a quote), likely not a sentence boundary
    if (nextPos < text.length) {
      const nextChar = text[nextPos];

      // Exception: quotes can follow sentence endings
      if (QUOTE_MARKS.has(nextChar)) {
        return true;
      }

      // If next character is lowercase, probably not a sentence boundary
      if (nextChar === nextChar.toLowerCase() && nextChar !== nextChar.toUpperCase()) {
        // Exception: common sentence starters that might be lowercase in informal text
        const nextWord = getNextWord(text, nextPos);
        const lowerStarters = ['the', 'a', 'an', 'and', 'but', 'or', 'so', 'yet'];

        if (!lowerStarters.includes(nextWord.toLowerCase())) {
          return false;
        }
      }
    }

    return true;
  }

  return false;
}

/**
 * Check if a period is part of an abbreviation
 */
function isAbbreviation(text: string, periodPos: number): boolean {
  // Look backward to find the word containing this period
  let start = periodPos;

  while (start > 0 && /[A-Za-z.]/.test(text[start - 1])) {
    start--;
  }

  // Extract the word including the period
  const word = text.substring(start, periodPos + 1);

  return ABBREVIATIONS.has(word);
}

/**
 * Check if a period follows a single capital letter (initial)
 */
function isInitial(text: string, periodPos: number): boolean {
  if (periodPos === 0) return false;

  const prevChar = text[periodPos - 1];

  // Single capital letter before period
  if (prevChar >= 'A' && prevChar <= 'Z') {
    // Check if it's preceded by whitespace or start of string
    if (periodPos === 1) return true;

    const prevPrevChar = text[periodPos - 2];
    if (/\s/.test(prevPrevChar)) return true;

    // Could be part of multi-letter abbreviation, check ABBREVIATIONS
    return false;
  }

  return false;
}

/**
 * Check if a period is part of a decimal number
 */
function isDecimalNumber(text: string, periodPos: number): boolean {
  if (periodPos === 0 || periodPos === text.length - 1) return false;

  const prevChar = text[periodPos - 1];
  const nextChar = text[periodPos + 1];

  return /\d/.test(prevChar) && /\d/.test(nextChar);
}

/**
 * Get the next word after a position
 */
function getNextWord(text: string, startPos: number): string {
  let end = startPos;

  while (end < text.length && /[A-Za-z]/.test(text[end])) {
    end++;
  }

  return text.substring(startPos, end);
}

/**
 * Join orphan fragments (< 10 chars) to neighboring sentences
 */
function joinOrphanFragments(sentences: Sentence[]): Sentence[] {
  if (sentences.length === 0) return sentences;

  const result: Sentence[] = [];
  let i = 0;

  while (i < sentences.length) {
    const current = sentences[i];

    // Check if this is an orphan fragment
    if (current.text.length < 10 && i < sentences.length - 1) {
      // Join to next sentence
      const next = sentences[i + 1];

      result.push({
        start: current.start,
        end: next.end,
        text: current.text + ' ' + next.text
      });

      i += 2; // Skip the next sentence since we merged it
    } else if (current.text.length < 10 && result.length > 0) {
      // Join to previous sentence
      const prev = result[result.length - 1];

      result[result.length - 1] = {
        start: prev.start,
        end: current.end,
        text: prev.text + ' ' + current.text
      };

      i++;
    } else {
      result.push(current);
      i++;
    }
  }

  return result;
}

/**
 * Utility: Check if character is emoji
 */
function isEmoji(char: string): boolean {
  const code = char.charCodeAt(0);

  // Common emoji ranges
  return (
    (code >= 0x1F600 && code <= 0x1F64F) || // Emoticons
    (code >= 0x1F300 && code <= 0x1F5FF) || // Misc Symbols and Pictographs
    (code >= 0x1F680 && code <= 0x1F6FF) || // Transport and Map
    (code >= 0x2600 && code <= 0x26FF) ||   // Misc symbols
    (code >= 0x2700 && code <= 0x27BF) ||   // Dingbats
    (code >= 0xFE00 && code <= 0xFE0F) ||   // Variation Selectors
    (code >= 0x1F900 && code <= 0x1F9FF)    // Supplemental Symbols and Pictographs
  );
}
