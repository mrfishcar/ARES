/**
 * Rule-Based Quote Attribution
 *
 * Extracts quotes from text and attributes speakers using deterministic patterns.
 * Works without BookNLP - pure pattern matching + entity resolution.
 *
 * Classic patterns:
 * - "..." , NAME said → speaker = NAME
 * - NAME said, "..." → speaker = NAME
 * - "..." said NAME → speaker = NAME
 * - "..." he/she said → speaker = resolved pronoun
 *
 * @module ir/quote-attribution
 */

import type { QuoteSignal } from './quote-tell-extractor';
import type { EntitySpan } from './predicate-extractor';

// =============================================================================
// TYPES
// =============================================================================

export interface QuoteMatch {
  /** Full match including quotes */
  fullMatch: string;
  /** The quoted text (without quotes) */
  text: string;
  /** Start character offset */
  start: number;
  /** End character offset */
  end: number;
  /** Quote style (double, single, smart) */
  quoteStyle: 'double' | 'single' | 'smart';
}

export interface SpeakerCandidate {
  /** Entity ID if matched */
  entityId: string | null;
  /** Entity name/text */
  name: string;
  /** Character offset start of the speaker mention */
  start: number;
  /** Character offset end */
  end: number;
  /** How the speaker was found */
  method: 'pattern' | 'pronoun' | 'adjacent' | 'turn-taking';
  /** Confidence in attribution (0-1) */
  confidence: number;
}

export interface AttributionResult {
  quote: QuoteMatch;
  speaker: SpeakerCandidate | null;
  /** The pattern that matched (for debugging) */
  patternUsed: string | null;
}

export interface QuoteAttributionStats {
  quotesFound: number;
  attributedBySpeechVerb: number;
  attributedByPronoun: number;
  attributedByTurnTaking: number;
  unattributed: number;
}

// =============================================================================
// SPEECH VERB PATTERNS
// =============================================================================

// Verbs that introduce or follow speech
const SPEECH_VERBS = new Set([
  'said', 'says', 'say',
  'asked', 'asks', 'ask',
  'replied', 'replies', 'reply',
  'answered', 'answers', 'answer',
  'shouted', 'shouts', 'shout',
  'whispered', 'whispers', 'whisper',
  'called', 'calls', 'call',
  'cried', 'cries', 'cry',
  'exclaimed', 'exclaims', 'exclaim',
  'muttered', 'mutters', 'mutter',
  'murmured', 'murmurs', 'murmur',
  'growled', 'growls', 'growl',
  'snapped', 'snaps', 'snap',
  'hissed', 'hisses', 'hiss',
  'declared', 'declares', 'declare',
  'stated', 'states', 'state',
  'announced', 'announces', 'announce',
  'explained', 'explains', 'explain',
  'added', 'adds', 'add',
  'continued', 'continues', 'continue',
  'interrupted', 'interrupts', 'interrupt',
  'demanded', 'demands', 'demand',
  'insisted', 'insists', 'insist',
  'suggested', 'suggests', 'suggest',
  'admitted', 'admits', 'admit',
  'confessed', 'confesses', 'confess',
  'agreed', 'agrees', 'agree',
  'protested', 'protests', 'protest',
  'warned', 'warns', 'warn',
  'promised', 'promises', 'promise',
  'told', 'tells', 'tell',
  'remarked', 'remarks', 'remark',
  'observed', 'observes', 'observe',
  'noted', 'notes', 'note',
  'mentioned', 'mentions', 'mention',
  'inquired', 'inquires', 'inquire',
  'queried', 'queries', 'query',
  'wondered', 'wonders', 'wonder',
  'began', 'begins', 'begin',
  'started', 'starts', 'start',
  'thought', 'thinks', 'think',  // Internal dialogue
]);

// Pronouns that can be speakers
const SPEAKER_PRONOUNS: Record<string, { gender: 'male' | 'female' | 'neutral'; number: 'singular' | 'plural' }> = {
  'he': { gender: 'male', number: 'singular' },
  'she': { gender: 'female', number: 'singular' },
  'they': { gender: 'neutral', number: 'plural' },
  'i': { gender: 'neutral', number: 'singular' },
  'we': { gender: 'neutral', number: 'plural' },
};

// =============================================================================
// QUOTE EXTRACTION
// =============================================================================

/**
 * Find all quotes in text using regex patterns.
 */
export function findQuotes(text: string): QuoteMatch[] {
  const quotes: QuoteMatch[] = [];

  // Pattern for double quotes (handles escaped quotes)
  const doubleQuotePattern = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  // Pattern for smart quotes (Unicode: \u201c = ", \u201d = ")
  const smartQuotePattern = /\u201c([^\u201d]+)\u201d/g;
  // Pattern for single quotes (be careful - also used for apostrophes)
  const singleQuotePattern = /'([^']{10,})'/g;  // Min 10 chars to avoid apostrophes

  // Extract double quotes
  let match;
  while ((match = doubleQuotePattern.exec(text)) !== null) {
    quotes.push({
      fullMatch: match[0],
      text: match[1],
      start: match.index,
      end: match.index + match[0].length,
      quoteStyle: 'double',
    });
  }

  // Extract smart quotes (if not overlapping with double quotes)
  while ((match = smartQuotePattern.exec(text)) !== null) {
    const overlaps = quotes.some(q =>
      (match!.index >= q.start && match!.index < q.end) ||
      (q.start >= match!.index && q.start < match!.index + match![0].length)
    );
    if (!overlaps) {
      quotes.push({
        fullMatch: match[0],
        text: match[1],
        start: match.index,
        end: match.index + match[0].length,
        quoteStyle: 'smart',
      });
    }
  }

  // Sort by position
  return quotes.sort((a, b) => a.start - b.start);
}

// =============================================================================
// SPEAKER ATTRIBUTION PATTERNS
// =============================================================================

/**
 * Try to find a speaker for a quote using speech verb patterns.
 *
 * Looks for patterns like:
 * - "..." , NAME said
 * - NAME said, "..."
 * - "..." said NAME
 */
export function findSpeakerBySpeechVerb(
  quote: QuoteMatch,
  text: string,
  entitySpans: EntitySpan[]
): SpeakerCandidate | null {
  // Window around quote to search for speech verbs
  const windowBefore = 100;  // chars before quote
  const windowAfter = 100;   // chars after quote

  const beforeStart = Math.max(0, quote.start - windowBefore);
  const afterEnd = Math.min(text.length, quote.end + windowAfter);

  const contextBefore = text.slice(beforeStart, quote.start);
  const contextAfter = text.slice(quote.end, afterEnd);

  // Pattern 1: "..." , NAME said / "..." said NAME
  // Look for speech verb after quote
  const afterPattern = /^[\s,]*(\w+)\s+(said|asked|replied|answered|shouted|whispered|cried|exclaimed|muttered|declared|explained|added|continued|demanded|warned|told|remarked|noted|began|thought)\b/i;
  const afterVerbMatch = contextAfter.match(afterPattern);

  if (afterVerbMatch) {
    const potentialSpeaker = afterVerbMatch[1];
    const verb = afterVerbMatch[2].toLowerCase();

    // Check if it's a pronoun
    if (SPEAKER_PRONOUNS[potentialSpeaker.toLowerCase()]) {
      return {
        entityId: null,
        name: potentialSpeaker,
        start: quote.end + afterVerbMatch.index!,
        end: quote.end + afterVerbMatch.index! + potentialSpeaker.length,
        method: 'pronoun',
        confidence: 0.5,  // Lower confidence - needs pronoun resolution
      };
    }

    // Check if it matches an entity
    const matchedEntity = findEntityByName(potentialSpeaker, entitySpans, quote.end, windowAfter);
    if (matchedEntity) {
      return {
        entityId: matchedEntity.entityId,
        name: matchedEntity.name,
        start: matchedEntity.start,
        end: matchedEntity.end,
        method: 'pattern',
        confidence: 0.9,
      };
    }
  }

  // Pattern 2: "..." said NAME (verb before name)
  const afterVerbNamePattern = /^[\s,]*(said|asked|replied|answered|shouted|whispered|cried|exclaimed|muttered|declared|explained|added|continued|demanded|warned|told|remarked|noted|began|thought)\s+(\w+(?:\s+\w+)?)/i;
  const afterVerbNameMatch = contextAfter.match(afterVerbNamePattern);

  if (afterVerbNameMatch) {
    const verb = afterVerbNameMatch[1].toLowerCase();
    const potentialSpeaker = afterVerbNameMatch[2];

    // Skip pronouns here - they come before name pattern
    if (!SPEAKER_PRONOUNS[potentialSpeaker.toLowerCase()]) {
      const matchedEntity = findEntityByName(potentialSpeaker, entitySpans, quote.end, windowAfter);
      if (matchedEntity) {
        return {
          entityId: matchedEntity.entityId,
          name: matchedEntity.name,
          start: matchedEntity.start,
          end: matchedEntity.end,
          method: 'pattern',
          confidence: 0.9,
        };
      }
    }
  }

  // Pattern 3: NAME said, "..."
  // Look for speech verb before quote
  const beforePattern = /(\w+(?:\s+\w+)?)\s+(said|asked|replied|answered|shouted|whispered|cried|exclaimed|muttered|declared|explained|added|continued|demanded|warned|told|remarked|noted|began|thought)[\s,]*$/i;
  const beforeVerbMatch = contextBefore.match(beforePattern);

  if (beforeVerbMatch) {
    const potentialSpeaker = beforeVerbMatch[1];
    const verb = beforeVerbMatch[2].toLowerCase();

    // Check if it's a pronoun
    if (SPEAKER_PRONOUNS[potentialSpeaker.toLowerCase()]) {
      return {
        entityId: null,
        name: potentialSpeaker,
        start: beforeStart + beforeVerbMatch.index!,
        end: beforeStart + beforeVerbMatch.index! + potentialSpeaker.length,
        method: 'pronoun',
        confidence: 0.5,
      };
    }

    // Check if it matches an entity
    const matchedEntity = findEntityByName(potentialSpeaker, entitySpans, beforeStart, windowBefore);
    if (matchedEntity) {
      return {
        entityId: matchedEntity.entityId,
        name: matchedEntity.name,
        start: matchedEntity.start,
        end: matchedEntity.end,
        method: 'pattern',
        confidence: 0.9,
      };
    }
  }

  return null;
}

/**
 * Find an entity by name in the given region.
 */
function findEntityByName(
  name: string,
  entitySpans: EntitySpan[],
  regionStart: number,
  regionSize: number
): EntitySpan | null {
  const regionEnd = regionStart + regionSize;
  const nameLower = name.toLowerCase();

  // First try exact match in region
  for (const span of entitySpans) {
    if (span.start >= regionStart && span.end <= regionEnd) {
      if (span.name.toLowerCase() === nameLower) {
        return span;
      }
    }
  }

  // Try partial match (first or last name)
  for (const span of entitySpans) {
    if (span.start >= regionStart && span.end <= regionEnd) {
      const spanNameLower = span.name.toLowerCase();
      const nameParts = spanNameLower.split(/\s+/);
      if (nameParts.includes(nameLower)) {
        return span;
      }
    }
  }

  // Try finding any entity with this name anywhere (less confident)
  for (const span of entitySpans) {
    const spanNameLower = span.name.toLowerCase();
    const nameParts = spanNameLower.split(/\s+/);
    if (spanNameLower === nameLower || nameParts.includes(nameLower)) {
      return span;
    }
  }

  return null;
}

// =============================================================================
// SALIENCE STACK (COREF-LITE)
// =============================================================================

export interface SalienceEntry {
  entityId: string;
  name: string;
  gender: 'male' | 'female' | 'neutral' | 'unknown';
  number: 'singular' | 'plural' | 'unknown';
  lastMentionPos: number;
  salience: number;  // Higher = more salient
}

export interface SalienceStack {
  entries: SalienceEntry[];

  /** Add or update an entity mention */
  mention(entityId: string, name: string, pos: number, role: 'subject' | 'object' | 'other'): void;

  /** Get the most salient candidate for a pronoun */
  resolvePronnoun(pronoun: string, pos: number): SalienceEntry | null;

  /** Decay salience (call at sentence boundaries) */
  decay(factor?: number): void;
}

/**
 * Create a salience stack for tracking entity mentions.
 */
export function createSalienceStack(): SalienceStack {
  const entries: SalienceEntry[] = [];

  // Role weights for salience
  const ROLE_WEIGHTS = {
    subject: 3.0,
    object: 2.0,
    other: 1.0,
  };

  return {
    entries,

    mention(entityId: string, name: string, pos: number, role: 'subject' | 'object' | 'other'): void {
      const existing = entries.find(e => e.entityId === entityId);
      const weight = ROLE_WEIGHTS[role];

      // Infer gender from name (heuristic)
      const gender = inferGender(name);

      if (existing) {
        existing.lastMentionPos = pos;
        existing.salience += weight;
        if (gender !== 'unknown') {
          existing.gender = gender;
        }
      } else {
        entries.push({
          entityId,
          name,
          gender,
          number: 'singular',  // Default
          lastMentionPos: pos,
          salience: weight,
        });
      }

      // Sort by salience (descending)
      entries.sort((a, b) => b.salience - a.salience);
    },

    resolvePronoun(pronoun: string, pos: number): SalienceEntry | null {
      const pronounLower = pronoun.toLowerCase();
      const pronounInfo = SPEAKER_PRONOUNS[pronounLower];

      if (!pronounInfo) return null;

      // Filter candidates by gender/number match
      const candidates = entries.filter(e => {
        // Gender match
        if (pronounInfo.gender !== 'neutral' && e.gender !== 'unknown') {
          if (pronounInfo.gender !== e.gender) return false;
        }
        // Number match (they can be singular or plural)
        if (pronounInfo.number === 'singular' && e.number === 'plural') {
          return false;
        }
        // Recency check: must be mentioned within ~500 chars
        if (pos - e.lastMentionPos > 500) return false;

        return true;
      });

      // If exactly one candidate, high confidence
      if (candidates.length === 1) {
        return candidates[0];
      }

      // If multiple candidates, return the most salient but lower confidence
      if (candidates.length > 1) {
        // Only return if top candidate is significantly more salient
        if (candidates[0].salience > candidates[1].salience * 1.5) {
          return candidates[0];
        }
        // Too ambiguous - don't guess
        return null;
      }

      return null;
    },

    decay(factor = 0.7): void {
      for (const entry of entries) {
        entry.salience *= factor;
      }
      // Remove entries with very low salience
      const threshold = 0.5;
      const toRemove = entries.filter(e => e.salience < threshold);
      for (const entry of toRemove) {
        const idx = entries.indexOf(entry);
        if (idx >= 0) entries.splice(idx, 1);
      }
    },
  };
}

/**
 * Infer gender from a name (heuristic).
 */
function inferGender(name: string): 'male' | 'female' | 'neutral' | 'unknown' {
  const nameLower = name.toLowerCase();

  // Common male names
  const maleNames = new Set([
    'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph',
    'thomas', 'charles', 'christopher', 'daniel', 'matthew', 'anthony', 'mark',
    'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian',
    'george', 'edward', 'ronald', 'timothy', 'jason', 'jeffrey', 'ryan', 'jacob',
    'marcus', 'henry', 'peter', 'jack', 'harry', 'arthur', 'barty', 'preston',
  ]);

  // Common female names
  const femaleNames = new Set([
    'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan',
    'jessica', 'sarah', 'karen', 'nancy', 'lisa', 'betty', 'margaret', 'sandra',
    'ashley', 'dorothy', 'kimberly', 'emily', 'donna', 'michelle', 'carol',
    'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura',
    'kelly', 'rachel', 'emma', 'olivia', 'lily', 'sophia', 'anna', 'grace',
  ]);

  // Check first name
  const firstName = nameLower.split(/\s+/)[0];

  if (maleNames.has(firstName)) return 'male';
  if (femaleNames.has(firstName)) return 'female';

  // Check for title prefixes
  if (nameLower.startsWith('mr.') || nameLower.startsWith('mr ')) return 'male';
  if (nameLower.startsWith('mrs.') || nameLower.startsWith('mrs ') ||
      nameLower.startsWith('ms.') || nameLower.startsWith('ms ') ||
      nameLower.startsWith('miss ')) return 'female';

  return 'unknown';
}

// =============================================================================
// TURN-TAKING HEURISTIC
// =============================================================================

/**
 * Apply turn-taking heuristic for dialogue sequences.
 *
 * If we have a sequence of quotes and know one speaker with high confidence,
 * we can infer alternating speakers when exactly 2 candidates are active.
 */
export function applyTurnTaking(
  results: AttributionResult[],
  entitySpans: EntitySpan[]
): void {
  // Find sequences of adjacent quotes
  for (let i = 0; i < results.length; i++) {
    const current = results[i];

    // Skip if already attributed with high confidence
    if (current.speaker && current.speaker.confidence >= 0.8) continue;

    // Look at previous and next quotes for context
    const prev = i > 0 ? results[i - 1] : null;
    const next = i < results.length - 1 ? results[i + 1] : null;

    // If previous quote has a speaker, and we're unattributed...
    if (prev?.speaker && !current.speaker) {
      // Check if there are exactly 2 active speakers in this sequence
      const activeSpeakers = findActiveSpeakers(results.slice(Math.max(0, i - 3), i + 1));

      if (activeSpeakers.length === 2) {
        // Alternate from previous speaker
        const otherSpeaker = activeSpeakers.find(s => s.entityId !== prev.speaker?.entityId);
        if (otherSpeaker) {
          current.speaker = {
            ...otherSpeaker,
            method: 'turn-taking',
            confidence: 0.6,  // Lower confidence for inferred
          };
          current.patternUsed = 'turn-taking';
        }
      }
    }
  }
}

/**
 * Find active speakers in a sequence of attribution results.
 */
function findActiveSpeakers(results: AttributionResult[]): SpeakerCandidate[] {
  const speakers = new Map<string, SpeakerCandidate>();

  for (const result of results) {
    if (result.speaker && result.speaker.entityId) {
      speakers.set(result.speaker.entityId, result.speaker);
    }
  }

  return Array.from(speakers.values());
}

// =============================================================================
// MAIN EXTRACTION
// =============================================================================

export interface QuoteAttributionOptions {
  /** Document ID for output */
  docId: string;
  /** Entity spans for resolution */
  entitySpans: EntitySpan[];
  /** Enable turn-taking heuristic */
  enableTurnTaking?: boolean;
  /** Enable pronoun resolution via salience */
  enablePronounResolution?: boolean;
}

/**
 * Extract quotes and attribute speakers using rule-based patterns.
 *
 * @param text - Raw text to process
 * @param options - Extraction options
 * @returns Array of QuoteSignals ready for TELL extraction
 */
export function extractQuotesWithSpeakers(
  text: string,
  options: QuoteAttributionOptions
): { quotes: QuoteSignal[]; stats: QuoteAttributionStats } {
  const {
    docId,
    entitySpans,
    enableTurnTaking = true,
    enablePronounResolution = true,
  } = options;

  // Step 1: Find all quotes
  const quoteMatches = findQuotes(text);

  // Step 2: Build salience stack from entity mentions
  const salience = createSalienceStack();
  for (const span of entitySpans) {
    // All entities start as 'other' role - could enhance with dep parsing
    salience.mention(span.entityId, span.name, span.start, 'other');
  }

  // Step 3: Attribute speakers to each quote
  const results: AttributionResult[] = [];
  const stats: QuoteAttributionStats = {
    quotesFound: quoteMatches.length,
    attributedBySpeechVerb: 0,
    attributedByPronoun: 0,
    attributedByTurnTaking: 0,
    unattributed: 0,
  };

  for (const quote of quoteMatches) {
    // Try speech verb patterns first
    let speaker = findSpeakerBySpeechVerb(quote, text, entitySpans);
    let patternUsed: string | null = null;

    if (speaker) {
      if (speaker.method === 'pronoun' && enablePronounResolution) {
        // Resolve pronoun using salience stack
        const resolved = salience.resolvePronoun(speaker.name, quote.start);
        if (resolved) {
          speaker = {
            entityId: resolved.entityId,
            name: resolved.name,
            start: speaker.start,
            end: speaker.end,
            method: 'pronoun',
            confidence: 0.7,  // Good but not perfect
          };
          patternUsed = `pronoun:${speaker.name}→${resolved.name}`;
          stats.attributedByPronoun++;
        } else {
          // Couldn't resolve pronoun - keep as unattributed
          speaker = null;
        }
      } else if (speaker.method === 'pattern') {
        patternUsed = 'speech-verb';
        stats.attributedBySpeechVerb++;
      }
    }

    results.push({ quote, speaker, patternUsed });

    // Update salience for next quote
    if (speaker?.entityId) {
      salience.mention(speaker.entityId, speaker.name, quote.end, 'subject');
    }
    salience.decay(0.9);  // Slight decay between quotes
  }

  // Step 4: Apply turn-taking heuristic
  if (enableTurnTaking) {
    const beforeTurnTaking = results.filter(r => r.speaker).length;
    applyTurnTaking(results, entitySpans);
    const afterTurnTaking = results.filter(r => r.speaker).length;
    stats.attributedByTurnTaking = afterTurnTaking - beforeTurnTaking;
  }

  // Count unattributed
  stats.unattributed = results.filter(r => !r.speaker).length;

  // Step 5: Convert to QuoteSignal format
  const quotes: QuoteSignal[] = results.map((result, idx) => ({
    id: `quote_${idx}`,
    text: result.quote.text,
    start: result.quote.start,
    end: result.quote.end,
    speakerId: result.speaker?.entityId || null,
    speakerName: result.speaker?.name || null,
    confidence: result.speaker?.confidence || 0,
    sentenceIndex: undefined,  // Could be computed if needed
  }));

  return { quotes, stats };
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  QuoteMatch,
  SpeakerCandidate,
  AttributionResult,
  SalienceEntry,
  SalienceStack,
};
