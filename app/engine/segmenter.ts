/**
 * Deterministic text segmentation for robust extraction on long-form content
 * Provides paragraph and sentence splitting with absolute character offsets
 */

export interface Seg {
  doc_id: string;
  paraIndex: number;
  sentIndex: number;
  start: number;
  end: number;
  text: string;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Normalize whitespace while preserving structure
 * - Collapse runs of spaces/tabs to single space
 * - Keep single newlines
 * - Trim trailing spaces per line
 */
export function normalizeWhitespace(s: string): string {
  // Split into lines
  const lines = s.split('\n');

  // Process each line: collapse internal whitespace, trim trailing
  const normalized = lines.map(line => {
    // Collapse runs of spaces/tabs to single space
    const collapsed = line.replace(/[ \t]+/g, ' ');
    // Trim trailing spaces
    return collapsed.trimEnd();
  });

  return normalized.join('\n');
}

/**
 * Split text into paragraphs on 2+ newlines or blank lines
 * Returns paragraphs with absolute character offsets from original string
 */
export function splitParagraphs(text: string): { text: string; start: number; end: number; index: number }[] {
  const paragraphs: { text: string; start: number; end: number; index: number }[] = [];

  // Split on 2+ newlines (blank lines)
  const parts = text.split(/\n\n+/);

  let currentOffset = 0;
  let paraIndex = 0;

  for (const part of parts) {
    // Find where this part starts in the original text
    const partStart = text.indexOf(part, currentOffset);

    if (partStart === -1) {
      // Skip if we can't find it (shouldn't happen)
      continue;
    }

    const trimmedPart = part.trim();
    if (trimmedPart.length === 0) {
      // Skip empty paragraphs
      currentOffset = partStart + part.length;
      continue;
    }

    // Find the actual start/end of trimmed content
    const trimmedStart = partStart + part.indexOf(trimmedPart);
    const trimmedEnd = trimmedStart + trimmedPart.length;

    paragraphs.push({
      text: trimmedPart,
      start: trimmedStart,
      end: trimmedEnd,
      index: paraIndex
    });

    paraIndex++;
    currentOffset = partStart + part.length;
  }

  return paragraphs;
}

/**
 * Split paragraph into sentences with deterministic rules
 * - Break on [.?!] followed by whitespace/newline and capital letter OR end of paragraph
 * - Break at line-end if line looks like bullet ("- ", "• ", "* ", "1. ")
 * - Hard-wrap at 400 chars if no natural break found
 * Returns sentences with absolute offsets relative to original text
 */
export function splitSentences(paraText: string, paraStart: number): { text: string; start: number; end: number }[] {
  const sentences: { text: string; start: number; end: number }[] = [];

  let currentStart = 0;
  let i = 0;

  while (i < paraText.length) {
    // Check for sentence-ending punctuation followed by space/newline + capital
    if (/[.?!]/.test(paraText[i])) {
      const nextChar = paraText[i + 1];
      const charAfterNext = paraText[i + 2];

      // End of paragraph
      if (nextChar === undefined) {
        const sentText = paraText.slice(currentStart, i + 1).trim();
        if (sentText.length > 0) {
          const trimmedStart = currentStart + paraText.slice(currentStart, i + 1).indexOf(sentText);
          sentences.push({
            text: sentText,
            start: paraStart + trimmedStart,
            end: paraStart + trimmedStart + sentText.length
          });
        }
        currentStart = i + 1; // Mark as processed
        break;
      }

      // Punctuation followed by whitespace and capital letter
      if (/\s/.test(nextChar) && charAfterNext && /[A-Z]/.test(charAfterNext)) {
        const sentText = paraText.slice(currentStart, i + 1).trim();
        if (sentText.length > 0) {
          const trimmedStart = currentStart + paraText.slice(currentStart, i + 1).indexOf(sentText);
          sentences.push({
            text: sentText,
            start: paraStart + trimmedStart,
            end: paraStart + trimmedStart + sentText.length
          });
        }
        currentStart = i + 1;
        // Skip whitespace
        while (currentStart < paraText.length && /\s/.test(paraText[currentStart])) {
          currentStart++;
        }
        i = currentStart;
        continue;
      }
    }

    // Check for bullet-style line breaks
    if (paraText[i] === '\n') {
      const nextFew = paraText.slice(i + 1, i + 5);
      if (/^(- |• |\* |\d+\. )/.test(nextFew)) {
        const sentText = paraText.slice(currentStart, i).trim();
        if (sentText.length > 0) {
          const trimmedStart = currentStart + paraText.slice(currentStart, i).indexOf(sentText);
          sentences.push({
            text: sentText,
            start: paraStart + trimmedStart,
            end: paraStart + trimmedStart + sentText.length
          });
        }
        currentStart = i + 1;
        // Skip the newline
        while (currentStart < paraText.length && paraText[currentStart] === '\n') {
          currentStart++;
        }
        i = currentStart;
        continue;
      }
    }

    // Hard wrap at 400 chars if no natural break
    if (i - currentStart >= 400) {
      // Find nearest space before position 400
      let wrapPos = i;
      for (let j = i; j > currentStart; j--) {
        if (/\s/.test(paraText[j])) {
          wrapPos = j;
          break;
        }
      }

      const sentText = paraText.slice(currentStart, wrapPos).trim();
      if (sentText.length > 0) {
        const trimmedStart = currentStart + paraText.slice(currentStart, wrapPos).indexOf(sentText);
        sentences.push({
          text: sentText,
          start: paraStart + trimmedStart,
          end: paraStart + trimmedStart + sentText.length
        });
      }

      currentStart = wrapPos;
      // Skip whitespace
      while (currentStart < paraText.length && /\s/.test(paraText[currentStart])) {
        currentStart++;
      }
      i = currentStart;
      continue;
    }

    i++;
  }

  // Capture any remaining text
  if (currentStart < paraText.length) {
    const sentText = paraText.slice(currentStart).trim();
    if (sentText.length > 0) {
      const trimmedStart = currentStart + paraText.slice(currentStart).indexOf(sentText);
      sentences.push({
        text: sentText,
        start: paraStart + trimmedStart,
        end: paraStart + trimmedStart + sentText.length
      });
    }
  }

  return sentences;
}

/**
 * Segment document into sentences with metadata
 * Returns array of segments with paragraph/sentence indices and absolute offsets
 */
export function segmentDocument(doc_id: string, raw: string): Seg[] {
  const normalized = normalizeWhitespace(raw);
  const paragraphs = splitParagraphs(normalized);
  const allSentences: Array<{ paraIndex: number; sentIndex: number; start: number; end: number; text: string }> = [];

  for (const para of paragraphs) {
    const sentences = splitSentences(para.text, para.start);

    for (let sentIndex = 0; sentIndex < sentences.length; sentIndex++) {
      const sent = sentences[sentIndex];
      allSentences.push({
        paraIndex: para.index,
        sentIndex,
        start: sent.start,
        end: sent.end,
        text: sent.text
      });
    }
  }

  // Accumulate sentences into ~450-600 word chunks
  const MIN_WORDS = 450;
  const MAX_WORDS = 600;
  const segments: Seg[] = [];

  let currentStart: number | null = null;
  let currentEnd: number | null = null;
  let currentWordCount = 0;
  let chunkIndex = 0;

  for (const sentence of allSentences) {
    const sentenceWords = countWords(sentence.text);

    if (currentStart === null) {
      currentStart = sentence.start;
      currentEnd = sentence.end;
      currentWordCount = sentenceWords;
      continue;
    }

    const wouldExceedMax = currentWordCount + sentenceWords > MAX_WORDS;

    if (wouldExceedMax && currentWordCount >= MIN_WORDS) {
      const chunkText = normalized.slice(currentStart, currentEnd!);
      segments.push({
        doc_id,
        paraIndex: chunkIndex,
        sentIndex: 0,
        start: currentStart,
        end: currentEnd!,
        text: chunkText
      });

      chunkIndex++;
      currentStart = sentence.start;
      currentEnd = sentence.end;
      currentWordCount = sentenceWords;
    } else {
      currentEnd = sentence.end;
      currentWordCount += sentenceWords;
    }
  }

  if (currentStart !== null && currentEnd !== null) {
    const chunkText = normalized.slice(currentStart, currentEnd);
    segments.push({
      doc_id,
      paraIndex: chunkIndex,
      sentIndex: 0,
      start: currentStart,
      end: currentEnd,
      text: chunkText
    });
  }

  return segments;
}
