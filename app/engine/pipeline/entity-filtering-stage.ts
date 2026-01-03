/**
 * Stage 3: Entity Filtering Stage
 *
 * Responsibility: Filter low-quality entity candidates (Precision Defense Layer 1)
 *
 * Filters:
 * - Low confidence entities
 * - Too-short entities (< min length)
 * - Blocked tokens (pronouns, common words)
 * - Missing capitalization
 * - Invalid characters
 * - Invalid dates
 * - Generic/ambiguous entities
 *
 * Expected Impact: +5-10% precision improvement
 */

import {
  filterLowQualityEntities,
  isEntityFilterEnabled,
  getFilterConfig,
  getFilterStats,
  type EntityQualityConfig
} from '../entity-quality-filter';
import type { Entity } from '../schema';
import type {
  EntityFilteringInput,
  EntityFilteringOutput,
  FilterStats,
  EntityFilterConfig,
  Span
} from './types';

const STAGE_NAME = 'EntityFilteringStage';

/**
 * Evidence-based filtering: Filter single-mention entities that are very likely junk
 *
 * RESURRECTION LOGIC: Words can be identified as potential junk, but "resurrected"
 * if there's evidence they're being used as proper names:
 * - Appears capitalized mid-sentence
 * - Multiple mentions in the document
 * - Used as noun of direct address (vocative)
 *
 * This is more robust than static stopword lists because context determines whether
 * a word like "Honey" or "Steamy" is a common noun or a proper name/nickname.
 */
function filterByEvidence(
  entities: Entity[],
  spans: Span[],
  fullText?: string
): { filtered: Entity[]; removed: number } {
  // Only apply evidence filtering in documents with many entities
  // (short test cases shouldn't be filtered this way)
  if (entities.length < 10) {
    return { filtered: entities, removed: 0 };
  }

  // Count mentions per entity
  const mentionCounts = new Map<string, number>();
  for (const span of spans) {
    const count = mentionCounts.get(span.entity_id) || 0;
    mentionCounts.set(span.entity_id, count + 1);
  }

  // VERY SPECIFIC junk patterns - only filter clear false positives
  const CLEAR_JUNK_PATTERNS = [
    /^[A-Z][a-z]+(ing)$/, // Capitalized gerunds like "Learning", "Growing"
    /^[A-Z][a-z]+(ed)$/, // Capitalized participles like "Caged", "Perched"
    /^(The|A|An)\s+[a-z]/i, // Articles followed by lowercase
  ];

  // Potential junk words - but can be RESURRECTED if evidence exists
  // These are words that are often common nouns but CAN be names/nicknames
  const POTENTIAL_JUNK_WORDS = new Set([
    'learning', 'growing', 'caged', 'perched', 'littering', 'driving', 'sitting', 'becoming',
    'famous', 'animals', 'legend', 'blood', 'bullet', 'layers',
    'gluttony', 'land', 'please', 'hello', 'help', 'shh', 'listen', 'ugh', 'nonsense',
    // Exclamatory words that may be incorrectly extracted
    'god', 'lord', 'jesus', 'christ', 'heavens', 'gosh',
    // Chapter title fragments
    'song', 'chapter', 'part', 'book', 'section', 'prologue', 'epilogue'
  ]);

  /**
   * Check if a word has resurrection signals - evidence it's a proper name
   */
  function hasResurrectionSignals(word: string, entityId: string): boolean {
    // SIGNAL 1: Multiple mentions
    const mentions = mentionCounts.get(entityId) || 0;
    if (mentions >= 2) {
      console.log(`[RESURRECTION] "${word}" has ${mentions} mentions - resurrecting`);
      return true;
    }

    // SIGNAL 2: Used as noun of direct address (vocative)
    // Pattern: "Word," at start of speech or ", Word" or ", Word."
    if (fullText) {
      const wordCap = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      // Check for vocative patterns: "Honey," or ", Honey" or ", Honey."
      const vocativePatterns = [
        new RegExp(`"${wordCap},`, 'i'),           // "Honey,
        new RegExp(`, ${wordCap}[,.]?["']`, 'i'),  // , Honey." or , Honey,"
        new RegExp(`, ${wordCap}[!?]`, 'i'),       // , Honey! or , Honey?
      ];

      for (const pattern of vocativePatterns) {
        if (pattern.test(fullText)) {
          console.log(`[RESURRECTION] "${word}" appears in vocative/direct address - resurrecting`);
          return true;
        }
      }
    }

    return false;
  }

  const filtered: Entity[] = [];
  let removed = 0;

  for (const entity of entities) {
    const mentionCount = mentionCounts.get(entity.id) || 0;
    const canonical = entity.canonical;
    const canonicalLower = canonical.toLowerCase();

    // Keep entities with 2+ mentions - they're referenced multiple times
    if (mentionCount >= 2) {
      filtered.push(entity);
      continue;
    }

    // Only filter PERSON entities - places and orgs are rarely junk
    if (entity.type !== 'PERSON') {
      filtered.push(entity);
      continue;
    }

    // Check if it's a potential junk word - but check for resurrection first
    if (POTENTIAL_JUNK_WORDS.has(canonicalLower)) {
      if (hasResurrectionSignals(canonicalLower, entity.id)) {
        console.log(`[EVIDENCE-FILTER] Keeping resurrected name: "${canonical}"`);
        filtered.push(entity);
        continue;
      }
      console.log(`[EVIDENCE-FILTER] Removing potential junk word: "${canonical}"`);
      removed++;
      continue;
    }

    // Check if matches clear junk pattern
    if (CLEAR_JUNK_PATTERNS.some(p => p.test(canonical))) {
      console.log(`[EVIDENCE-FILTER] Removing pattern-matched junk: "${canonical}"`);
      removed++;
      continue;
    }

    // Keep by default - proper names like "Gandalf" are valid
    filtered.push(entity);
  }

  return { filtered, removed };
}

/**
 * Filter dialogue contractions that look like sentence fragments, not names.
 *
 * Words like "I'll", "You're", "Don't", "Can't" are contractions from dialogue
 * that may be incorrectly extracted as entities if they appear at the start
 * of quoted speech.
 *
 * Examples that should be FILTERED:
 * - "I'll" (contraction of "I will")
 * - "You're" (contraction of "You are")
 * - "Don't" (contraction of "Do not")
 * - "That's" (contraction of "That is")
 *
 * Note: Some contractions CAN be names (e.g., "O'Brien") so we filter
 * specific patterns rather than all apostrophe words.
 */
function filterDialogueContractions(
  entities: Entity[]
): { filtered: Entity[]; removed: number; removedNames: string[] } {
  // Dialogue contractions that are NEVER names
  // These are common sentence-start contractions from dialogue
  const CONTRACTION_PATTERNS = [
    /^(I|You|We|They|He|She|It|That|What|There|Here)'(ll|re|ve|d|m|s)$/i,
    /^(Don|Won|Can|Couldn|Wouldn|Shouldn|Didn|Isn|Aren|Wasn|Weren|Hasn|Haven|Hadn)'t$/i,
    /^(Let)'s$/i,
  ];

  const filtered: Entity[] = [];
  let removed = 0;
  const removedNames: string[] = [];

  for (const entity of entities) {
    const canonical = entity.canonical;

    // Only check PERSON entities
    if (entity.type !== 'PERSON') {
      filtered.push(entity);
      continue;
    }

    // Check if it matches a contraction pattern
    if (CONTRACTION_PATTERNS.some(p => p.test(canonical))) {
      console.log(`[CONTRACTION-FILTER] Removing dialogue contraction: "${canonical}"`);
      removed++;
      removedNames.push(canonical);
      continue;
    }

    filtered.push(entity);
  }

  return { filtered, removed, removedNames };
}

/**
 * Check if a word appears capitalized in the middle of a sentence (not at sentence start).
 * This indicates the word is being used as a proper name.
 *
 * Mid-sentence positions are detected by checking if the capitalized word is NOT preceded by:
 * - Start of text
 * - Sentence-ending punctuation (. ! ?) followed by whitespace
 * - Newline or paragraph break
 *
 * Examples:
 * - "Honey, please come here." → "Honey" at sentence start (not mid-sentence)
 * - "Please come here, Honey." → "Honey" mid-sentence (IS a name)
 * - "I love honey." → "honey" lowercase (common word)
 */
function hasMidSentenceCapitalization(word: string, fullText: string): boolean {
  // Build regex to find the capitalized word
  // Looking for the word NOT at sentence start
  // Mid-sentence = preceded by comma, colon, or other words (not sentence-ending punctuation)
  const capitalizedWord = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

  // Pattern: word boundary + capitalized word + word boundary
  // We'll find all occurrences and check their context
  const wordPattern = new RegExp(`\\b${escapeRegex(capitalizedWord)}\\b`, 'g');

  let match;
  while ((match = wordPattern.exec(fullText)) !== null) {
    const position = match.index;

    // Check context before this occurrence
    if (position === 0) {
      // At very start of document - sentence start, skip
      continue;
    }

    // Look at the preceding characters (up to 5 chars back for context)
    const precedingText = fullText.slice(Math.max(0, position - 5), position);

    // Check if this is a sentence start position:
    // - After sentence-ending punctuation (. ! ?) + optional space
    // - After newline
    // - After opening quote at sentence start
    const sentenceStartPattern = /[.!?]["']?\s*$/;
    const afterNewlinePattern = /[\n\r]\s*$/;
    const afterOpenQuoteAtStart = /^["']\s*$/;

    const isSentenceStart =
      sentenceStartPattern.test(precedingText) ||
      afterNewlinePattern.test(precedingText) ||
      (position <= 3 && afterOpenQuoteAtStart.test(precedingText));

    if (!isSentenceStart) {
      // Found mid-sentence capitalization! This is a name.
      console.log(`[LOWERCASE-ECHO] Found mid-sentence capitalization of "${capitalizedWord}" → keeping as name`);
      return true;
    }
  }

  return false;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Lowercase Echo Filter: Remove single-word PERSON entities that appear lowercase in the document
 *
 * RATIONALE: Proper names are ALWAYS capitalized in English text. If a word appears
 * in lowercase anywhere in the document, it's almost certainly a common word that
 * got capitalized at sentence start, not a name.
 *
 * EXCEPTION: If the word also appears CAPITALIZED in the middle of a sentence (not at
 * sentence start), then it IS being used as a name and should be kept.
 *
 * Examples:
 * - "Throughout" at sentence start → filtered (appears as "throughout" elsewhere)
 * - "Honey" at sentence start → KEPT if "Honey" also appears mid-sentence as a name
 * - "Frederick" IS a name because "frederick" never appears lowercase
 *
 * This approach is more robust than stopword lists because:
 * 1. Self-adapting: Works for any word, not just ones we've listed
 * 2. Domain-agnostic: Works for technical docs, fiction, any genre
 * 3. Linguistically principled: Based on fundamental English capitalization rules
 */
function filterByLowercaseEcho(
  entities: Entity[],
  fullText: string,
  spans: Span[]
): { filtered: Entity[]; removed: number; removedNames: string[] } {
  if (!fullText || fullText.length === 0) {
    return { filtered: entities, removed: 0, removedNames: [] };
  }

  // Build lowercase word set from document (for fast lookup)
  // Match whole words only using word boundary regex
  const lowercaseWordsInDoc = new Set<string>();
  const wordRegex = /\b[a-z]{2,}\b/g;
  let match;
  while ((match = wordRegex.exec(fullText)) !== null) {
    lowercaseWordsInDoc.add(match[0]);
  }

  // Count mentions per entity for multi-mention check
  const mentionCounts = new Map<string, number>();
  for (const span of spans) {
    const count = mentionCounts.get(span.entity_id) || 0;
    mentionCounts.set(span.entity_id, count + 1);
  }

  const filtered: Entity[] = [];
  let removed = 0;
  const removedNames: string[] = [];

  for (const entity of entities) {
    const canonical = entity.canonical;
    const words = canonical.split(/\s+/);

    // Only apply to single-word PERSON entities (multi-word names are less likely to be junk)
    // and only if entity has few mentions (well-established entities should be kept)
    if (
      entity.type === 'PERSON' &&
      words.length === 1 &&
      (mentionCounts.get(entity.id) || 0) <= 1
    ) {
      const lowercaseVersion = canonical.toLowerCase();

      // Check if this word appears lowercase in the document
      if (lowercaseWordsInDoc.has(lowercaseVersion)) {
        // EXCEPTION: If the word appears CAPITALIZED mid-sentence, it's a name
        if (hasMidSentenceCapitalization(lowercaseVersion, fullText)) {
          console.log(`[LOWERCASE-ECHO] Keeping "${canonical}" (appears capitalized mid-sentence)`);
          filtered.push(entity);
          continue;
        }

        console.log(`[LOWERCASE-ECHO] Removing "${canonical}" (appears lowercase in document, never mid-sentence capitalized)`);
        removed++;
        removedNames.push(canonical);
        continue;
      }
    }

    filtered.push(entity);
  }

  return { filtered, removed, removedNames };
}

/**
 * Convert EntityFilterConfig (pipeline type) to EntityQualityConfig (filter type)
 */
function toQualityConfig(config: EntityFilterConfig): EntityQualityConfig {
  return {
    minConfidence: config.minConfidence,
    minNameLength: config.minLength,
    blockedTokens: new Set(config.blockedTokens),
    requireCapitalization: config.requireCapitalization,
    strictMode: config.strictMode,
  };
}

/**
 * Filter low-quality entity candidates
 */
export async function runEntityFilteringStage(
  input: EntityFilteringInput
): Promise<EntityFilteringOutput> {
  const startTime = Date.now();
  console.log(`[${STAGE_NAME}] Starting with ${input.entities.length} entities`);

  try {
    // Validate input
    if (!input.entities || !Array.isArray(input.entities)) {
      throw new Error('Invalid input: entities must be an array');
    }

    if (!input.spans || !Array.isArray(input.spans)) {
      throw new Error('Invalid input: spans must be an array');
    }

    if (!input.entityMap || !(input.entityMap instanceof Map)) {
      throw new Error('Invalid input: entityMap must be a Map');
    }

    const preFilterCount = input.entities.length;
    let filteredEntities = input.entities;
    let stats: FilterStats;

    // Check if filtering is enabled (either via config or global flag)
    if (input.config.enabled || isEntityFilterEnabled()) {
      // DEBUG: Log entities before filtering
      if (process.env.DEBUG_ENTITY_FILTER === '1') {
        console.log(`[${STAGE_NAME}] DEBUG: Entities BEFORE filter:`);
        for (const e of input.entities.slice(0, 50)) {
          const firstChar = e.canonical?.[0] || '?';
          const isUpper = firstChar === firstChar.toUpperCase() && /[A-Z]/.test(firstChar);
          console.log(`  ${e.type}: "${e.canonical}" firstChar="${firstChar}" isUpper=${isUpper}`);
        }
        if (input.entities.length > 50) {
          console.log(`  ... and ${input.entities.length - 50} more`);
        }
      }

      // Convert pipeline config to quality filter config
      const config: EntityQualityConfig = input.config.enabled
        ? toQualityConfig(input.config)
        : getFilterConfig();

      // Apply quality filter
      filteredEntities = filterLowQualityEntities(input.entities, config);
      stats = getFilterStats(input.entities, filteredEntities, config);

      console.log(`[${STAGE_NAME}] 🛡️ Layer 1: Entity Quality Filter`);
      console.log(`  Original entities: ${stats.original}`);
      console.log(`  Filtered entities: ${stats.filtered}`);
      console.log(`  Removed: ${stats.removed} (${(stats.removalRate * 100).toFixed(1)}%)`);
      console.log(`  Removal reasons:`);
      console.log(`    - Low confidence: ${stats.removedByReason.lowConfidence}`);
      console.log(`    - Too short: ${stats.removedByReason.tooShort}`);
      console.log(`    - Blocked token: ${stats.removedByReason.blockedToken}`);
      console.log(`    - No capitalization: ${stats.removedByReason.noCapitalization}`);
      console.log(`    - Invalid characters: ${stats.removedByReason.invalidCharacters}`);
      console.log(`    - Invalid date: ${stats.removedByReason.invalidDate}`);
      console.log(`    - Too generic: ${stats.removedByReason.tooGeneric}`);
      console.log(`    - Strict mode: ${stats.removedByReason.strictMode}`);
    } else {
      console.log(`[${STAGE_NAME}] Filtering disabled, keeping all entities`);
      stats = {
        original: input.entities.length,
        filtered: input.entities.length,
        removed: 0,
        removalRate: 0,
        removedByReason: {
          lowConfidence: 0,
          tooShort: 0,
          blockedToken: 0,
          noCapitalization: 0,
          invalidCharacters: 0,
          invalidDate: 0,
          tooGeneric: 0,
          strictMode: 0
        }
      };
    }

    // ========================================================================
    // EVIDENCE-BASED FILTERING: Remove single-mention junk entities
    // ========================================================================
    const evidenceResult = filterByEvidence(filteredEntities, input.spans, input.fullText);
    if (evidenceResult.removed > 0) {
      console.log(`[${STAGE_NAME}] 🛡️ Evidence filter removed ${evidenceResult.removed} single-mention junk entities`);
      filteredEntities = evidenceResult.filtered;
      stats.removed += evidenceResult.removed;
      stats.filtered = filteredEntities.length;
      stats.removalRate = stats.removed / stats.original;
    }

    // ========================================================================
    // LOWERCASE ECHO FILTERING: Remove words that appear lowercase elsewhere
    // This is a principled approach that doesn't require stopword maintenance
    // ========================================================================
    if (input.fullText) {
      const echoResult = filterByLowercaseEcho(filteredEntities, input.fullText, input.spans);
      if (echoResult.removed > 0) {
        console.log(`[${STAGE_NAME}] 🛡️ Lowercase echo filter removed ${echoResult.removed} common words: ${echoResult.removedNames.join(', ')}`);
        filteredEntities = echoResult.filtered;
        stats.removed += echoResult.removed;
        stats.filtered = filteredEntities.length;
        stats.removalRate = stats.removed / stats.original;
      }
    }

    // ========================================================================
    // DIALOGUE CONTRACTION FILTERING: Remove contractions from dialogue
    // (e.g., "I'll", "You're", "Don't") which are not proper names
    // ========================================================================
    const contractionResult = filterDialogueContractions(filteredEntities);
    if (contractionResult.removed > 0) {
      console.log(`[${STAGE_NAME}] 🛡️ Contraction filter removed ${contractionResult.removed} dialogue fragments: ${contractionResult.removedNames.join(', ')}`);
      filteredEntities = contractionResult.filtered;
      stats.removed += contractionResult.removed;
      stats.filtered = filteredEntities.length;
      stats.removalRate = stats.removed / stats.original;
    }

    // Update entityMap to only include filtered entities
    const filteredIds = new Set(filteredEntities.map(e => e.id));
    const updatedEntityMap = new Map<string, import('../schema').Entity>();

    for (const [key, entity] of Array.from(input.entityMap.entries())) {
      if (filteredIds.has(entity.id)) {
        updatedEntityMap.set(key, entity);
      }
    }

    // Update spans to only include spans for filtered entities
    const validSpans = input.spans.filter(s => filteredIds.has(s.entity_id));

    const duration = Date.now() - startTime;
    console.log(
      `[${STAGE_NAME}] Complete in ${duration}ms: ${preFilterCount} → ${filteredEntities.length} entities, ${input.spans.length} → ${validSpans.length} spans`
    );

    return {
      entities: filteredEntities,
      spans: validSpans,
      entityMap: updatedEntityMap,
      filterStats: stats
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${STAGE_NAME}] Failed after ${duration}ms:`, error);
    const err = new Error(`[${STAGE_NAME}] ${(error as Error).message}`);
          (err as any).cause = error;
    throw err;
  }
}
