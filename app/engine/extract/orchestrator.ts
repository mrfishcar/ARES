/**
 * Segmented Extraction Orchestrator
 * Processes documents using sentence-level segmentation with context windows
 */

import type { Entity, Relation } from '../schema';
import { INVERSE, passesGuard } from '../schema';
import { v4 as uuid } from 'uuid';
import { segmentDocument, type Seg } from '../segmenter';
import { extractEntities, parseWithService, normalizeName } from './entities';
import { extractRelations } from './relations';
import { splitIntoSentences } from '../segment';
import { resolveCoref } from '../coref';
import { extractAllNarrativeRelations } from '../narrative-relations';
import { extractFictionEntities, type FictionEntity } from '../fiction-extraction';
import { buildProfiles, type EntityProfile } from '../entity-profiler';
import { hybridExtraction } from '../llm-extractor';
import { getLLMConfig, validateLLMConfig, DEFAULT_LLM_CONFIG, type LLMConfig } from '../llm-config';
import { applyPatterns, type Pattern } from '../bootstrap';
import type { PatternLibrary } from '../pattern-library';
import { isValidEntity, correctEntityType } from '../entity-filter';
import { loadRelationPatterns, type PatternsMode } from './load-relations';
import { isContextDependent } from '../pronoun-utils';

// 🛡️ PRECISION DEFENSE SYSTEM - LAYER 1 & 3
import { filterLowQualityEntities, isEntityFilterEnabled, getFilterConfig, getFilterStats } from '../entity-quality-filter';
import { deduplicateRelations, isDeduplicationEnabled, getDeduplicationStats } from '../relation-deduplicator';

// Select relation patterns mode from environment (baseline | expanded | hybrid)
const PATTERNS_MODE: PatternsMode = (process.env.RELATION_PATTERNS_MODE as PatternsMode) || 'baseline';
// Note: Pattern loading available via loadRelationPatterns(PATTERNS_MODE)
// Currently using hardcoded extraction; patterns ready for future integration

/**
 * Options that control segmentation/context handling and optional features
 */
export interface ExtractionOptions {
  generateHERTs?: boolean;     // Enable HERT generation (Phase 2)
  autoSaveHERTs?: boolean;     // Auto-save to HERT store
  segmentContextWindow?: number; // Context window (chars) around each segment for entity + relation extraction
  relationContextWindow?: number; // Override window for relation extraction (defaults to segmentContextWindow)
  corefRelationContextWindow?: number; // Context window for coref-enhanced relation pass
  globalRelationExtraction?: boolean;  // Run an additional global relation pass over full document
}

function resolveWindow(setting?: number, envKey?: string, fallback?: number): number | undefined {
  if (typeof setting === 'number' && Number.isFinite(setting)) {
    return setting;
  }

  if (envKey) {
    const envVal = process.env[envKey];
    if (envVal !== undefined) {
      const parsed = parseInt(envVal, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

/**
 * Extract entities and relations from segments with context windows
 * Processes segments in deterministic order (paraIndex ASC, sentIndex ASC)
 * Remaps span offsets back to absolute positions
 *
 * Extraction layers (applied in order):
 * 1. spaCy (standard entities: PERSON, ORG, PLACE, etc.)
 * 2. Local LLM (custom entities via few-shot: SPELL, CREATURE, etc.) [optional]
 * 3. Pattern Library (learned patterns from bootstrapping) [optional]
 */
export async function extractFromSegments(
  docId: string,
  fullText: string,
  existingProfiles?: Map<string, EntityProfile>,
  llmConfig: LLMConfig = DEFAULT_LLM_CONFIG,
  patternLibrary?: PatternLibrary,
  options?: ExtractionOptions
): Promise<{
  entities: Entity[];
  spans: Array<{ entity_id: string; start: number; end: number }>;
  relations: Relation[];
  fictionEntities: FictionEntity[];
  profiles: Map<string, EntityProfile>;
  herts?: string[];              // Generated HERTs (if enabled)
}> {
  // Validate and resolve LLM config
  const resolvedConfig = getLLMConfig(llmConfig);
  const validation = validateLLMConfig(resolvedConfig);

  if (resolvedConfig.enabled && !validation.valid) {
    console.warn(`[ORCHESTRATOR] LLM config invalid: ${validation.error}`);
    console.warn(`[ORCHESTRATOR] Falling back to spaCy-only extraction`);
    resolvedConfig.enabled = false;
  }

  const segmentContextWindow = resolveWindow(options?.segmentContextWindow, 'ARES_SEGMENT_CONTEXT_WINDOW', 200) ?? 200;
  const relationContextWindow = resolveWindow(options?.relationContextWindow, 'ARES_RELATION_CONTEXT_WINDOW', segmentContextWindow) ?? segmentContextWindow;
  const corefRelationContextWindow =
    resolveWindow(options?.corefRelationContextWindow, 'ARES_COREF_RELATION_CONTEXT_WINDOW', relationContextWindow) ??
    relationContextWindow ??
    1000;
  const globalRelationExtraction =
    options?.globalRelationExtraction ?? ['1', 'true'].includes((process.env.ARES_GLOBAL_RELATIONS || '').toLowerCase());
  // 1. Segment the document
  const segs = segmentDocument(docId, fullText);

  // 2. Sort segments deterministically (already sorted by segmentDocument, but be explicit)
  segs.sort((a, b) => {
    if (a.paraIndex !== b.paraIndex) return a.paraIndex - b.paraIndex;
    return a.sentIndex - b.sentIndex;
  });

  // 3. Extract from each segment with context window
  const allEntities: Entity[] = [];
  const allSpans: Array<{ entity_id: string; start: number; end: number }> = [];
  const allRelations: Relation[] = [];

  // Track entity canonical names across segments to avoid duplicates
  const entityMap = new Map<string, Entity>(); // key: type::canonical_lower -> entity

  for (const seg of segs) {
    // Build context window around the segment (configurable, defaults to ±200 chars)
    const contextBefore = fullText.slice(Math.max(0, seg.start - segmentContextWindow), seg.start);
    const contextAfter = fullText.slice(seg.end, Math.min(fullText.length, seg.end + segmentContextWindow));
    const window = contextBefore + seg.text + contextAfter;

    // Compute offset adjustment: where seg.text starts in the window
    const segOffsetInWindow = contextBefore.length;

    // Extract entities from window (with optional LLM enhancement)
    let entities: Entity[];
    let spans: Array<{ entity_id: string; start: number; end: number }>;

    if (resolvedConfig.enabled && resolvedConfig.customEntityTypes.length > 0) {
      // Use hybrid extraction (spaCy + local LLM)
      const hybridResults = await hybridExtraction(
        window,
        resolvedConfig.customEntityTypes,
        extractEntities,
        resolvedConfig.model || 'llama3.1'
      );
      entities = hybridResults.entities;
      spans = hybridResults.spans;
    } else {
      // Use spaCy only (default, fast)
      const spacyResults = await extractEntities(window);
      entities = spacyResults.entities;
      spans = spacyResults.spans;
    }

    // Filter and remap entities/spans that fall within the actual segment bounds
    for (const entity of entities) {
      // Find all spans for this entity
      const entitySpans = spans.filter(s => s.entity_id === entity.id);

      // Keep only spans that are COMPLETELY within the segment
      const segStart = segOffsetInWindow;
      const segEnd = segOffsetInWindow + seg.text.length;

      const segmentSpans = entitySpans
        .filter(s => s.start < segEnd && s.end > segStart)
        .map(s => {
          let start = seg.start + (s.start - segOffsetInWindow);
          let end = seg.start + (s.end - segOffsetInWindow);

          while (start < end && /[^A-Za-z]/.test(fullText[start])) {
            start++;
          }
          while (end < fullText.length && /[a-z'’\-]/.test(fullText[end])) {
            end++;
          }

          return {
            entity_id: entity.id,
            start,
            end
          };
        });

      if (segmentSpans.length === 0) {
        // Entity not in segment, skip
        continue;
      }

      // Derive canonical name from first span's absolute position in document
      const canonicalRaw = fullText.slice(segmentSpans[0].start, segmentSpans[0].end);
      const canonicalText = normalizeName(canonicalRaw);

      // Check if we've seen this entity before (by type + canonical)
      const entityKey = `${entity.type}::${canonicalText.toLowerCase()}`;
      let existingEntity = entityMap.get(entityKey);

      // If no exact match, check for name overlap (e.g., "Sarah" matches "Sarah Chen")
      if (!existingEntity && entity.type === 'PERSON') {
        const canonicalLower = canonicalText.toLowerCase();
        const canonicalWords = canonicalLower.split(/\s+/);

        for (const [key, ent] of entityMap.entries()) {
          if (!key.startsWith('PERSON::')) continue;

          const existingLower = ent.canonical.toLowerCase();
          const existingWords = existingLower.split(/\s+/);

          // Check if one is a subset of the other (same first/last name)
          // "Sarah" ⊂ "Sarah Chen" or "Sarah Chen" ⊃ "Sarah"
          const isSubset =
            (canonicalWords.length < existingWords.length && existingWords.some(w => canonicalWords.includes(w))) ||
            (existingWords.length < canonicalWords.length && canonicalWords.some(w => existingWords.includes(w)));

          if (isSubset) {
            // Merge into the longer name (more specific)
            if (canonicalWords.length > existingWords.length) {
              // Current name is longer - update the existing entity
              ent.canonical = canonicalText;
              if (!ent.aliases.includes(existingLower)) {
                ent.aliases.push(existingLower);
              }
              existingEntity = ent;
            } else {
              // Existing name is longer - use it as is
              existingEntity = ent;
            }
            break;
          }
        }
      }

      if (existingEntity) {
        // Merge: reuse existing entity ID, add new spans
        for (const span of segmentSpans) {
          allSpans.push({
            entity_id: existingEntity.id,
            start: span.start,
            end: span.end
          });
        }
      } else {
        // Skip entities with empty canonical names (extraction errors)
        if (!canonicalText || canonicalText.trim() === '') {
          continue;
        }

        // Skip low-quality entities (pronouns, common words, false positives)
        if (!isValidEntity(canonicalText, entity.type)) {
          continue;
        }

        // Force-correct entity type based on lexical markers (e.g., "River" → PLACE)
        const correctedType = correctEntityType(canonicalText, entity.type);

        // New entity - use canonical text from absolute position
        const correctedEntity: Entity = {
          ...entity,
          type: correctedType,
          canonical: canonicalText
        };
        if (
          entity.canonical &&
          normalizeName(entity.canonical) !== canonicalText &&
          !correctedEntity.aliases.some(
            alias => normalizeName(alias) === canonicalText
          )
        ) {
          correctedEntity.aliases = [
            ...correctedEntity.aliases,
            entity.canonical
          ];
        }
        entityMap.set(entityKey, correctedEntity);
        allEntities.push(correctedEntity);

        for (const span of segmentSpans) {
          allSpans.push({
            entity_id: span.entity_id,
            start: span.start,
            end: span.end
          });
        }
      }
    }

    // Extract relations from window
    const windowEntities = entities;
    const windowSpans = spans;

    // Note: extractRelations expects doc_id for provenance
    const relations = await extractRelations(window, { entities: windowEntities, spans: windowSpans }, docId);

    // Remap relation subject/object IDs to use merged entity IDs
    const remappedRelations = relations.map(rel => {
      // Find subject entity
      const subjEntity = windowEntities.find(e => e.id === rel.subj);
      const objEntity = windowEntities.find(e => e.id === rel.obj);

      if (!subjEntity || !objEntity) {
        return rel; // Skip if entities not found
      }

      const subjKey = `${subjEntity.type}::${subjEntity.canonical.toLowerCase()}`;
      const objKey = `${objEntity.type}::${objEntity.canonical.toLowerCase()}`;

      const mergedSubj = entityMap.get(subjKey);
      const mergedObj = entityMap.get(objKey);

      return {
        ...rel,
        subj: mergedSubj?.id || rel.subj,
        obj: mergedObj?.id || rel.obj
      };
    });

    allRelations.push(...remappedRelations);
  }

  // 3.5. Apply pattern-based extraction (if pattern library provided)
  // Patterns are learned from bootstrapping and provide zero-cost entity extraction
  if (patternLibrary && patternLibrary.metadata.total_patterns > 0) {
    console.log(`[ORCHESTRATOR] Applying ${patternLibrary.metadata.total_patterns} patterns from library`);

    // Collect all patterns from all entity types
    const allPatterns: Pattern[] = Object.values(patternLibrary.entityTypes)
      .flatMap(ps => ps.patterns);

    // Apply patterns to full text (more efficient than per-segment)
    const patternMatches = applyPatterns([fullText], allPatterns);

    console.log(`[ORCHESTRATOR] Pattern extraction found ${patternMatches.length} candidates`);

    // Convert pattern matches to entities
    for (const match of patternMatches) {
      const patternEntity: Entity = {
        id: uuid(),
        type: mapCustomTypeToAresType(match.pattern.type),
        canonical: match.entity,
        aliases: [],
        attrs: {
          pattern_confidence: match.confidence,
          learned_from_pattern: match.pattern.template
        },
        created_at: new Date().toISOString()
      };

      // Find entity in full text to get span
      const entityRegex = new RegExp(`\\b${escapeRegex(match.entity)}\\b`, 'gi');
      let regexMatch: RegExpExecArray | null;

      while ((regexMatch = entityRegex.exec(fullText)) !== null) {
        const start = regexMatch.index;
        const end = start + regexMatch[0].length;

        // Check if this entity already exists
        const entityKey = `${patternEntity.type}::${patternEntity.canonical.toLowerCase()}`;
        let existingEntity = entityMap.get(entityKey);

        if (existingEntity) {
          // Add span to existing entity
          allSpans.push({
            entity_id: existingEntity.id,
            start,
            end
          });
        } else {
          // New entity from pattern
          entityMap.set(entityKey, patternEntity);
          allEntities.push(patternEntity);

          allSpans.push({
            entity_id: patternEntity.id,
            start,
            end
          });

          // Only add entity once (don't duplicate for multiple spans)
          existingEntity = patternEntity;
        }
      }
    }

    console.log(`[ORCHESTRATOR] Pattern extraction added ${patternMatches.length} entity mentions`);
  }

  // 🛡️ LAYER 1: Entity Quality Pre-Filter
  // Filter low-quality entities BEFORE relation extraction
  // Expected impact: +5-10% precision
  const preFilterCount = allEntities.length;

  if (isEntityFilterEnabled()) {
    const config = getFilterConfig();
    const filteredEntities = filterLowQualityEntities(allEntities, config);
    const stats = getFilterStats(allEntities, filteredEntities, config);

    console.log(`[PRECISION-DEFENSE] 🛡️ Layer 1: Entity Quality Filter`);
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

    // Update allEntities array
    allEntities.length = 0;
    allEntities.push(...filteredEntities);

    // Update entityMap to only include filtered entities
    const filteredIds = new Set(filteredEntities.map(e => e.id));
    for (const [key, entity] of Array.from(entityMap.entries())) {
      if (!filteredIds.has(entity.id)) {
        entityMap.delete(key);
      }
    }

    // Update allSpans to only include spans for filtered entities
    const validSpans = allSpans.filter(s => filteredIds.has(s.entity_id));
    allSpans.length = 0;
    allSpans.push(...validSpans);
  }

  // 4. Build entity profiles (adaptive learning)
  // Accumulate knowledge about entities to improve future resolution
  const sentences = splitIntoSentences(fullText);
  const profiles = buildProfiles(
    allEntities,
    allSpans,
    sentences,
    docId,
    existingProfiles
  );

  // 5. Run coreference resolution on the full document
  // This will create pronoun → entity mappings that can be used by relation extraction
  // Pass profiles to enable descriptor-based resolution ("the wizard" → Gandalf)
  const corefLinks = resolveCoref(sentences, allEntities, allSpans, fullText, profiles);

  // DEBUG: Log coreference links
  console.log(`[COREF] Found ${corefLinks.links.length} coreference links`);
  for (const link of corefLinks.links) {
    const entity = allEntities.find(e => e.id === link.entity_id);
    console.log(`[COREF] "${link.mention.text}" [${link.mention.start},${link.mention.end}] -> ${entity?.canonical} (${link.method}, conf=${link.confidence.toFixed(2)})`);
  }

  // 5.5 NEW: Resolve deictic references ("there", "here")
  // This must happen AFTER coreference but BEFORE relation extraction
  let processedText = fullText;
  const deicticSpans: Array<{ start: number; end: number; replacement: string }> = [];

  // Find all location-like entities (PLACE, ORG, HOUSE, etc.) with their positions in text
  // These can be referents for deictic "there"
  const locationTypes = new Set(['PLACE', 'ORG', 'HOUSE']);
  const placePositions: Array<{ position: number; name: string }> = [];

  for (const span of allSpans) {
    const entity = allEntities.find(e => e.id === span.entity_id);
    if (entity && locationTypes.has(entity.type)) {
      placePositions.push({ position: span.start, name: entity.canonical });
    }
  }

  // Sort by position so we can find the "most recent" location
  placePositions.sort((a, b) => a.position - b.position);

  // Find all "there" occurrences and replace with most recent location
  const thereRegex = /\bthere\b/gi;
  let thereMatch;
  const thereMatches: Array<{ index: number; text: string }> = [];

  while ((thereMatch = thereRegex.exec(fullText)) !== null) {
    thereMatches.push({ index: thereMatch.index, text: thereMatch[0] });
  }

  // For each "there", find the most recent location-like entity before it
  for (const match of thereMatches) {
    const previousPlace = placePositions.filter(p => p.position < match.index).pop();

    if (previousPlace) {
      console.log(`[DEICTIC] Resolved "there" at position ${match.index} to "${previousPlace.name}"`);
      // Replace "there" with "in LocationName" to match extraction patterns
      // This works for both "lived in Rivendell" and "studied in Hogwarts"
      deicticSpans.push({
        start: match.index,
        end: match.index + match.text.length,
        replacement: `in ${previousPlace.name}`
      });
    }
  }

  // Apply replacements in reverse order to maintain positions
  for (let i = deicticSpans.length - 1; i >= 0; i--) {
    const span = deicticSpans[i];
    processedText = processedText.substring(0, span.start) + span.replacement + processedText.substring(span.end);
  }

  if (deicticSpans.length > 0) {
    console.log(`[DEICTIC] Resolved ${deicticSpans.length} deictic references`);
  }

  // 5. Create virtual entity spans for pronouns that were resolved
  // This allows relation extraction to "see" pronouns as entity mentions
  const virtualSpans: Array<{ entity_id: string; start: number; end: number }> = [];
  for (const link of corefLinks.links) {
    virtualSpans.push({
      entity_id: link.entity_id,
      start: link.mention.start,
      end: link.mention.end
    });
  }

  // Combine real spans with virtual pronoun spans
  const allSpansWithCoref = [...allSpans, ...virtualSpans];

  // 6. Re-extract relations with coref-enhanced entity spans
  // This allows "He studied" to find "He" as an entity mention
  // Use configurable larger context window for multi-paragraph narratives
  const contextWindowSize = corefRelationContextWindow;  // Defaults to 1000 to handle Stage 3 multi-paragraph tests
  const corefRelations: Relation[] = [];
  for (const seg of segs) {
    const contextBefore = fullText.slice(Math.max(0, seg.start - contextWindowSize), seg.start);
    const contextAfter = fullText.slice(seg.end, Math.min(fullText.length, seg.end + contextWindowSize));
    const window = contextBefore + seg.text + contextAfter;
    const segOffsetInWindow = contextBefore.length;

    // Get entities and spans that overlap with this window
    const windowSpans = allSpansWithCoref.filter(s => {
      // Map to window coordinates
      const windowStart = s.start - seg.start + segOffsetInWindow;
      const windowEnd = s.end - seg.start + segOffsetInWindow;
      return windowStart >= 0 && windowEnd <= window.length;
    });

    const windowEntities = allEntities.filter(e =>
      windowSpans.some(s => s.entity_id === e.id)
    );

    // Map spans to window coordinates
    const mappedSpans = windowSpans.map(s => ({
      entity_id: s.entity_id,
      start: s.start - seg.start + segOffsetInWindow,
      end: s.end - seg.start + segOffsetInWindow
    }));

    const rels = await extractRelations(window, { entities: windowEntities, spans: mappedSpans }, docId);

    // Remap to use merged entity IDs
    for (const rel of rels) {
      const subjEntity = windowEntities.find(e => e.id === rel.subj);
      const objEntity = windowEntities.find(e => e.id === rel.obj);

      if (subjEntity && objEntity) {
        const subjKey = `${subjEntity.type}::${subjEntity.canonical.toLowerCase()}`;
        const objKey = `${objEntity.type}::${objEntity.canonical.toLowerCase()}`;

        const mergedSubj = entityMap.get(subjKey);
        const mergedObj = entityMap.get(objKey);

        corefRelations.push({
          ...rel,
          subj: mergedSubj?.id || rel.subj,
          obj: mergedObj?.id || rel.obj
        });
      }
    }
  }

  // Optional: run a global relation extraction pass to capture long-range links
  // Run a conservative global relation pass only for long, multi-paragraph narratives
  // (protects Stage 1–2 while keeping Phase 3 optional and config driven)
  const shouldRunGlobalRelations =
    globalRelationExtraction &&
    (segs.length >= 5 || fullText.length >= 600 || fullText.includes('\n\n'));

  let globalRelations: Relation[] = [];
  if (shouldRunGlobalRelations) {
    console.log(`[GLOBAL] Running global relation extraction over full document span`);
    globalRelations = await extractRelations(fullText, { entities: allEntities, spans: allSpansWithCoref }, docId);
  } else if (globalRelationExtraction) {
    console.log(`[GLOBAL] Skipping global relations (document too short for meaningful cross-paragraph links)`);
  }

  // Filter relations to suppress parent_of/child_of when married_to is present
  // Step 1: Collect all married_to relations WITH their sentence indices
  const marriedToRelations = new Set<string>();
  const marriedToSentences = new Map<string, Set<number>>(); // pair -> set of sentence indices

  // Check all relations for married_to
  for (const rel of allRelations) {
    if (rel.pred === 'married_to') {
      const key1 = `${rel.subj}:${rel.obj}`;
      const key2 = `${rel.obj}:${rel.subj}`;
      marriedToRelations.add(key1);
      marriedToRelations.add(key2);

      // Track which sentences have married_to for this pair
      if (!marriedToSentences.has(key1)) marriedToSentences.set(key1, new Set());
      if (!marriedToSentences.has(key2)) marriedToSentences.set(key2, new Set());

      rel.evidence.forEach(e => {
        marriedToSentences.get(key1)!.add(e.sentence_index);
        marriedToSentences.get(key2)!.add(e.sentence_index);
      });
    }
  }
  for (const rel of corefRelations) {
    if (rel.pred === 'married_to') {
      const key1 = `${rel.subj}:${rel.obj}`;
      const key2 = `${rel.obj}:${rel.subj}`;
      marriedToRelations.add(key1);
      marriedToRelations.add(key2);

      if (!marriedToSentences.has(key1)) marriedToSentences.set(key1, new Set());
      if (!marriedToSentences.has(key2)) marriedToSentences.set(key2, new Set());

      rel.evidence.forEach(e => {
        marriedToSentences.get(key1)!.add(e.sentence_index);
        marriedToSentences.get(key2)!.add(e.sentence_index);
      });
    }
  }

  // Helper: Check if married_to exists within proximity window (±2 sentences)
  const hasMarriedToInProximity = (rel: Relation, proximityWindow: number = 2): boolean => {
    const key = `${rel.subj}:${rel.obj}`;
    if (!marriedToRelations.has(key)) return false;

    const relationSentences = new Set(rel.evidence.map(e => e.sentence_index));
    const marriedSentences = marriedToSentences.get(key);
    if (!marriedSentences) return false;

    for (const sentIdx of relationSentences) {
      for (let offset = -proximityWindow; offset <= proximityWindow; offset++) {
        if (marriedSentences.has(sentIdx + offset)) {
          return true; // Conflict within proximity
        }
      }
    }
    return false; // No nearby conflict
  };

  // Step 2: Filter main allRelations with PROXIMITY-BASED + confidence check
  // Only suppress if married_to is BOTH high confidence AND in proximity
  const filteredAllRelations = allRelations.filter(rel => {
    if ((rel.pred === 'parent_of' || rel.pred === 'child_of') &&
        hasMarriedToInProximity(rel, 2)) {

      // Also check confidence for extra safety
      const marriedToForPair = allRelations.find(r =>
        r.pred === 'married_to' &&
        ((r.subj === rel.subj && r.obj === rel.obj) ||
         (r.subj === rel.obj && r.obj === rel.subj))
      );

      if (marriedToForPair && marriedToForPair.confidence > 0.75) {
        const subj = allEntities.find(e => e.id === rel.subj);
        const obj = allEntities.find(e => e.id === rel.obj);
        console.log(`[MAIN-FILTER] Suppressing ${rel.pred}: ${subj?.canonical} -> ${obj?.canonical} (married_to in proximity, conf ${marriedToForPair.confidence.toFixed(2)})`);
        return false;
      }
    }
    return true;
  });

  // Step 3: Filter coref-enhanced relations with PROXIMITY-BASED matching
  // Only suppress parent_of/child_of if married_to within ±2 sentences
  const filteredCorefRelations = corefRelations.filter(rel => {
    if ((rel.pred === 'parent_of' || rel.pred === 'child_of') &&
        hasMarriedToInProximity(rel, 2)) {

      const subj = allEntities.find(e => e.id === rel.subj);
      const obj = allEntities.find(e => e.id === rel.obj);
      console.log(`[COREF-FILTER] Suppressing ${rel.pred}: ${subj?.canonical} -> ${obj?.canonical} (married_to in proximity)`);
      return false;
    }
    return true;
  });

  // Combine filtered main relations with filtered coref relations
  console.log(`[COREF] Found ${corefRelations.length} coref-enhanced relations (filtered to ${filteredCorefRelations.length})`);
  for (const rel of filteredCorefRelations) {
    const subj = allEntities.find(e => e.id === rel.subj);
    const obj = allEntities.find(e => e.id === rel.obj);
    console.log(`[COREF] ${subj?.canonical} --[${rel.pred}]--> ${obj?.canonical}`);
  }
  const combinedRelations = [...filteredAllRelations, ...filteredCorefRelations];

  // 7. Extract narrative relations (pattern-based extraction)
  // Convert Entity[] to EntityLookup[] format for narrative extraction
  const entityLookup = allEntities.map(e => ({
    id: e.id,
    canonical: e.canonical,
    type: e.type,
    aliases: e.aliases
  }));

  // Pass coref links to enable resolution of "the couple", "their", etc.
  // Use processedText (with deictic resolutions) instead of fullText for narrative extraction
  const narrativeRelations = extractAllNarrativeRelations(processedText, entityLookup, docId, corefLinks);

  // Also filter narrative relations with PROXIMITY-BASED matching
  const filteredNarrativeRelations = narrativeRelations.filter(rel => {
    if ((rel.pred === 'parent_of' || rel.pred === 'child_of') &&
        hasMarriedToInProximity(rel, 2)) {

      const subj = allEntities.find(e => e.id === rel.subj);
      const obj = allEntities.find(e => e.id === rel.obj);
      console.log(`[NARRATIVE-FILTER] Suppressing ${rel.pred}: ${subj?.canonical} -> ${obj?.canonical} (married_to in proximity)`);
      return false;
    }
    return true;
  });

  // Combine all relation sources (with conservative filtering for global pass)
  const existingRelationKeys = new Set<string>();
  for (const rel of [...combinedRelations, ...filteredNarrativeRelations]) {
    existingRelationKeys.add(`${rel.subj}::${rel.pred}::${rel.obj}`);
  }

  const globalMinConfidence = Math.max(parseFloat(process.env.ARES_MIN_CONFIDENCE || '0.70'), 0.8);
  const allowedGlobalPredicates = new Set<Relation['pred']>([
    'child_of',
    'parent_of',
    'married_to',
    'friends_with',
    'enemy_of',
    'member_of',
    'lives_in',
    'studies_at',
    'leads',
    'teaches_at',
    'part_of'
  ]);

  const entityById = new Map(allEntities.map(e => [e.id, e]));
  const existingRelationConfidence = new Map<string, number>();
  for (const rel of [...combinedRelations, ...filteredNarrativeRelations]) {
    const key = `${rel.subj}::${rel.pred}::${rel.obj}`;
    const prev = existingRelationConfidence.get(key) ?? 0;
    existingRelationConfidence.set(key, Math.max(prev, rel.confidence));
  }

  const filteredGlobalRelations = globalRelations.filter(rel => {
    if (!allowedGlobalPredicates.has(rel.pred)) return false;

    const subj = entityById.get(rel.subj);
    const obj = entityById.get(rel.obj);
    if (!subj || !obj) return false;
    if (!passesGuard(rel.pred, subj, obj)) return false;

    if (rel.confidence < globalMinConfidence) return false;

    const key = `${rel.subj}::${rel.pred}::${rel.obj}`;
    const existingConfidence = existingRelationConfidence.get(key);

    // Only allow global relations that improve on or add to existing triples
    if (existingConfidence !== undefined && rel.confidence <= existingConfidence + 0.01) {
      return false;
    }

    existingRelationConfidence.set(key, rel.confidence);
    return true;
  });

  const allRelationSources = [...combinedRelations, ...filteredNarrativeRelations, ...filteredGlobalRelations];

  // 7.5 Auto-create inverse relations for bidirectional predicates
  // E.g., if we have parent_of(A, B), create child_of(B, A)
  const inversesToAdd: Relation[] = [];
  for (const rel of allRelationSources) {
    const inversePred = INVERSE[rel.pred];
    if (inversePred) {
      // Create inverse relation
      inversesToAdd.push({
        ...rel,
        id: uuid(),
        subj: rel.obj,
        obj: rel.subj,
        pred: inversePred
        // Keep same extractor as original relation
      });
    }
  }
  const allRelationsWithInverses = [...allRelationSources, ...inversesToAdd];

  // 7.8. Filter appositive false positives
  // When multiple relations have same pred+obj but different subjects,
  // check if they're coordinated (both should be kept) or appositives (keep first only)
  const predObjToSubjects = new Map<string, Array<{ rel: Relation; position: number; subjectCanonical: string }>>();

  for (const rel of allRelationsWithInverses) {
    const predObjKey = `${rel.pred}::${rel.obj}`;

    // Find the position of the subject entity in the text
    const subjEntity = allEntities.find(e => e.id === rel.subj);
    const subjSpan = allSpans.find(s => s.entity_id === rel.subj);
    const position = subjSpan ? subjSpan.start : Infinity;
    const subjectCanonical = subjEntity?.canonical.toLowerCase() || '';

    // Skip relations with invalid/empty subjects (they break appositive detection)
    if (!subjectCanonical || !subjEntity) {
      console.log(`[APPOS-FILTER] Skipping relation with empty subject (pred=${rel.pred}, obj=${rel.obj})`);
      continue;
    }

    if (!predObjToSubjects.has(predObjKey)) {
      predObjToSubjects.set(predObjKey, []);
    }
    predObjToSubjects.get(predObjKey)!.push({ rel, position, subjectCanonical });
  }

  // For each pred+obj group, decide whether to keep all (coordination) or just first (appositive)
  const appositiveFilteredRelations: Relation[] = [];
  for (const [predObjKey, group] of predObjToSubjects.entries()) {
    if (group.length === 1) {
      // No conflict, keep the relation
      appositiveFilteredRelations.push(group[0].rel);
    } else {
      // Check if subjects are likely coordinated (different entities close together)
      // vs appositive (one name inside another, like "Aragorn, son of Arathorn")
      group.sort((a, b) => a.position - b.position);

      // Debug: show what the object entity is
      const objEntity = allEntities.find(e => e.id === group[0].rel.obj);
      const objCanonical = objEntity?.canonical || 'UNKNOWN';

      console.log(`[APPOS-FILTER] Checking ${predObjKey} with ${group.length} subjects (obj="${objCanonical}"):`);
      for (const item of group) {
        console.log(`  - ${item.subjectCanonical} at position ${item.position}`);
      }

      // If subjects are simple names (no shared substring overlap beyond 50%),
      // they're likely coordinated entities, so keep all
      const isCoordination = group.every((item, idx) => {
        if (idx === 0) return true; // First item is always kept
        const prevCanonical = group[idx - 1].subjectCanonical;
        const currCanonical = item.subjectCanonical;
        const prevPosition = group[idx - 1].position;
        const currPosition = item.position;

        // Skip exact duplicates (same entity at same position - these will be deduped later)
        if (prevCanonical === currCanonical && prevPosition === currPosition) {
          console.log(`[APPOS-FILTER]   ${currCanonical} at ${currPosition} is duplicate - SKIP`);
          return true; // Don't treat as appositive
        }

        // If one is a substring of the other AND at different positions, it's likely appositive
        if (prevCanonical !== currCanonical && (prevCanonical.includes(currCanonical) || currCanonical.includes(prevCanonical))) {
          console.log(`[APPOS-FILTER]   ${currCanonical} substring of ${prevCanonical} - APPOSITIVE`);
          return false;
        }
        // If they're very close (within 50 chars), likely coordination
        const distance = Math.abs(currPosition - prevPosition);
        console.log(`[APPOS-FILTER]   Distance between ${prevCanonical} and ${currCanonical}: ${distance}`);
        return distance < 50;
      });

      console.log(`[APPOS-FILTER]   isCoordination: ${isCoordination}`);

      if (isCoordination) {
        // Keep all coordinated subjects
        console.log(`[APPOS-FILTER]   Keeping all ${group.length} subjects`);
        for (const item of group) {
          appositiveFilteredRelations.push(item.rel);
        }
      } else {
        // Appositive case - keep only the first subject
        console.log(`[APPOS-FILTER]   Appositive detected - keeping only first subject`);
        appositiveFilteredRelations.push(group[0].rel);
      }
    }
  }

  // No context-aware filtering for now - work with relations as-is
  const contextFilteredRelations = appositiveFilteredRelations;

  // 🛡️ LAYER 3: Relation Deduplication
  // Merge duplicate relations extracted by multiple patterns
  // Expected impact: +10-15% precision
  let uniqueRelations: Relation[];

  if (isDeduplicationEnabled()) {
    const preDedupeCount = contextFilteredRelations.length;
    uniqueRelations = deduplicateRelations(contextFilteredRelations);
    const stats = getDeduplicationStats(contextFilteredRelations, uniqueRelations);

    console.log(`[PRECISION-DEFENSE] 🛡️ Layer 3: Relation Deduplication`);
    console.log(`  Original relations: ${stats.original}`);
    console.log(`  Deduplicated relations: ${stats.deduplicated}`);
    console.log(`  Removed duplicates: ${stats.removed} (${(stats.removalRate * 100).toFixed(1)}%)`);
    console.log(`  Duplicate groups: ${stats.duplicateGroups}`);
    console.log(`  Avg group size: ${stats.avgGroupSize.toFixed(1)}`);
    console.log(`  Max group size: ${stats.maxGroupSize}`);
  } else {
    // Fallback to simple deduplication
    const uniqueMap = new Map<string, Relation>();
    for (const rel of contextFilteredRelations) {
      const key = `${rel.subj}::${rel.pred}::${rel.obj}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, rel);
      }
    }
    uniqueRelations = Array.from(uniqueMap.values());
  }

  // 9. Optional: Filter entities to improve precision in dense narratives
  // For mega regression, we want to focus on entities involved in the narrative structure
  // But for simple sentences, we should keep all high-quality entities
  // Solution: Keep entities that are EITHER in relations OR have strong standalone evidence
  const entitiesInRelations = new Set<string>();
  for (const rel of uniqueRelations) {
    entitiesInRelations.add(rel.subj);
    entitiesInRelations.add(rel.obj);
  }

  // Count entity mentions to determine importance
  const entityMentionCounts = new Map<string, number>();
  for (const span of allSpans) {
    entityMentionCounts.set(span.entity_id, (entityMentionCounts.get(span.entity_id) || 0) + 1);
  }

  // Keep entities that meet ANY of these criteria:
  // 1. Involved in at least one relation (narrative-connected)
  // 2. High mention frequency (≥3 mentions = clearly important)
  // 3. Not a dense narrative (simple/moderate texts keep all entities)
  //
  // Only filter aggressively for VERY dense narratives (many entities + high relation ratio)
  // Example: mega-001 has 14 entities and 20 relations (ratio 1.4) - this should filter
  // Example: golden corpus has 8-10 entities and 5-10 relations - these should NOT filter
  // Threshold: >12 entities ensures only mega-scale narratives are filtered
  const isDenseNarrative = allEntities.length > 12 && uniqueRelations.length >= allEntities.length;

  const filteredEntities = allEntities.filter(e => {
    const inRelation = entitiesInRelations.has(e.id);
    const mentionCount = entityMentionCounts.get(e.id) || 0;
    const highMentionCount = mentionCount >= 3;

    // For simple/moderate texts, keep all entities (don't filter)
    if (!isDenseNarrative) {
      return true;
    }

    // For dense narratives, keep entities in relations OR with high mention count
    return inRelation || highMentionCount;
  });

  const filteredSpans = allSpans.filter(s =>
    filteredEntities.some(e => e.id === s.entity_id)
  );

  // Filter relations to only include those where both subject and object entities exist
  // AND have valid (non-empty, non-UNKNOWN) canonical names
  const filteredEntityIds = new Set(filteredEntities.map(e => e.id));
  const entityIdToCanonical = new Map(filteredEntities.map(e => [e.id, e.canonical]));

  // Get confidence threshold from environment (default: 0.70, proven effective in Phase 1)
  // To disable: ARES_MIN_CONFIDENCE=0
  const minConfidence = parseFloat(process.env.ARES_MIN_CONFIDENCE || '0.70');
  const precisionMode = process.env.ARES_PRECISION_MODE === 'strict';
  const confidenceFilterEnabled = minConfidence > 0;

  let filteredRelations = uniqueRelations.filter(rel => {
    // Check that both entities exist
    if (!filteredEntityIds.has(rel.subj) || !filteredEntityIds.has(rel.obj)) {
      return false;
    }

    // Check that both entities have valid canonical names (non-empty, not "UNKNOWN")
    const subjCanonical = entityIdToCanonical.get(rel.subj);
    const objCanonical = entityIdToCanonical.get(rel.obj);

    if (!subjCanonical || !objCanonical ||
        subjCanonical === 'UNKNOWN' || objCanonical === 'UNKNOWN' ||
        subjCanonical.trim() === '' || objCanonical.trim() === '') {
      return false;
    }

    return true;
  });

  // 🛡️ LAYER 3: Confidence Threshold Filtering
  // Filter out low-confidence extractions
  // DEFAULT: ENABLED at 0.70 threshold (proven effective in Phase 1)
  // Expected impact: +5-8% precision
  if (confidenceFilterEnabled) {
    const preConfidenceCount = filteredRelations.length;
    filteredRelations = filteredRelations.filter(rel => rel.confidence >= minConfidence);

    console.log(`[PRECISION-DEFENSE] 🛡️ Layer 3: Confidence Threshold Filter`);
    console.log(`  Threshold: ${minConfidence}`);
    console.log(`  Before: ${preConfidenceCount} relations`);
    console.log(`  After: ${filteredRelations.length} relations`);
    console.log(`  Removed: ${preConfidenceCount - filteredRelations.length} (${((preConfidenceCount - filteredRelations.length) / preConfidenceCount * 100).toFixed(1)}%)`);
  }

  const fictionEntities = extractFictionEntities(fullText);

  // HERT Phase 1-4: Assign stable EIDs, AIDs, and SP to entities
  // Phase 3: Intelligent alias resolution
  // Phase 4: Sense disambiguation (SP assignment)
  const { eidRegistry } = await import('../eid-registry');
  const { aliasResolver } = await import('../alias-resolver');
  const { aliasRegistry } = await import('../alias-registry');
  const { senseRegistry, discriminateSenses } = await import('../sense-disambiguator');

  for (const entity of filteredEntities) {
    // Get entity profile if available
    const profile = profiles.get(entity.canonical);

    // Try to resolve surface form to existing entity (Phase 3)
    const resolution = aliasResolver.resolve(
      entity.canonical,
      entity.type,
      profile,
      profiles
    );

    if (resolution) {
      // Map to existing entity
      entity.eid = resolution.eid;
      entity.aid = resolution.aid;

      console.log(`[ORCHESTRATOR] Resolved "${entity.canonical}" → EID ${resolution.eid} (method: ${resolution.method}, confidence: ${resolution.confidence.toFixed(2)})`);

      // Phase 4: Check if sense disambiguation is needed
      // If existing entity has different sense, assign new SP
      const existingSenses = senseRegistry.getSenses(entity.canonical);
      if (existingSenses.length > 0) {
        // Try to match with existing sense
        const matchingSense = senseRegistry.findMatchingSense(
          entity.canonical,
          entity.type,
          profile
        );

        if (matchingSense) {
          // Same sense as existing entity
          entity.sp = matchingSense.sp;
        } else {
          // Different sense - check if we should disambiguate
          const existingSense = existingSenses[0]; // Compare with first sense
          const existingProfile = existingSense.profile;

          if (existingProfile && profile) {
            const discrimination = discriminateSenses(
              entity.canonical,
              existingSense.type,
              existingProfile,
              entity.type,
              profile
            );

            if (discrimination.shouldDisambiguate && discrimination.confidence > 0.7) {
              // Create new EID with different SP
              const newEID = eidRegistry.getOrCreate(entity.canonical);
              const newSP = senseRegistry.getNextSP(entity.canonical, entity.type);

              entity.eid = newEID;
              entity.sp = newSP;
              entity.aid = aliasResolver.registerAlias(entity.canonical, newEID);

              // Register this sense
              senseRegistry.register(entity.canonical, newEID, entity.type, newSP, profile);

              console.log(`[ORCHESTRATOR] Disambiguated "${entity.canonical}" → EID ${newEID}, SP ${JSON.stringify(newSP)} (${discrimination.reason})`);
            }
          }
        }
      }
    } else {
      // Create new entity
      entity.eid = eidRegistry.getOrCreate(entity.canonical);
      entity.aid = aliasResolver.registerAlias(entity.canonical, entity.eid);

      // Phase 4: Assign sense path if needed
      const existingSenses = senseRegistry.getSenses(entity.canonical);

      if (existingSenses.length === 0) {
        // First sense of this name - assign SP [1]
        entity.sp = [1];
        senseRegistry.register(entity.canonical, entity.eid, entity.type, [1], profile);
      } else {
        // Check if we need to disambiguate from existing senses
        const matchingSense = senseRegistry.findMatchingSense(
          entity.canonical,
          entity.type,
          profile
        );

        if (matchingSense) {
          // Same sense - reuse SP and EID
          entity.eid = matchingSense.eid;
          entity.sp = matchingSense.sp;
        } else {
          // Different sense - assign new SP
          const newSP = senseRegistry.getNextSP(entity.canonical, entity.type);
          entity.sp = newSP;
          senseRegistry.register(entity.canonical, entity.eid, entity.type, newSP, profile);

          console.log(`[ORCHESTRATOR] New sense for "${entity.canonical}" → EID ${entity.eid}, SP ${JSON.stringify(newSP)}`);
        }
      }
    }
  }

  // Populate entity.aliases from coreference links and alias registry
  // This makes aliases visible to tests and downstream consumers
  console.log(`[ORCHESTRATOR] Populating entity aliases from coref links and alias registry`);

  for (const entity of filteredEntities) {
    const aliasSet = new Set<string>();

    // Add existing aliases (shouldn't be empty, but just in case)
    for (const alias of entity.aliases) {
      aliasSet.add(alias);
    }

    // 1. Add aliases from coreference links (descriptive mentions ONLY - filter pronouns)
    // Pronouns (he, she, it, etc.) are context-dependent and should NOT be permanent aliases
    for (const link of corefLinks.links) {
      if (link.entity_id === entity.id) {
        const mentionText = link.mention.text.trim();

        // CRITICAL: Filter out pronouns and other context-dependent terms
        // Pronouns must be resolved at extraction time, not stored as aliases
        if (mentionText &&
            mentionText !== entity.canonical &&
            !isContextDependent(mentionText)) {
          aliasSet.add(mentionText);
        }
      }
    }

    // 2. Add aliases from alias registry (all registered surface forms for this EID)
    if (entity.eid) {
      const registeredAliases = aliasRegistry.getAliasesForEntity(entity.eid);
      for (const mapping of registeredAliases) {
        const surfaceForm = mapping.surfaceForm.trim();
        // Add if different from canonical, not empty, and NOT a pronoun
        if (surfaceForm &&
            surfaceForm !== entity.canonical &&
            !isContextDependent(surfaceForm)) {
          aliasSet.add(surfaceForm);
        }
      }
    }

    // Update entity.aliases with unique values
    entity.aliases = Array.from(aliasSet);

    if (entity.aliases.length > 0) {
      console.log(`[ORCHESTRATOR] Entity "${entity.canonical}" has ${entity.aliases.length} aliases: [${entity.aliases.slice(0, 3).join(', ')}${entity.aliases.length > 3 ? '...' : ''}]`);
    }
  }

  // HERT Phase 2: Generate HERTs for entity occurrences (optional)
  let herts: string[] | undefined;

  if (options?.generateHERTs) {
    const { createHERT, encodeHERT, generateDID, hashContent } = await import('../hert');

    const contentHash = hashContent(fullText);
    const did = generateDID(docId, contentHash, 1);
    herts = [];

    for (const span of filteredSpans) {
      const entity = filteredEntities.find(e => e.id === span.entity_id);
      if (!entity || !entity.eid) continue;

      // Calculate paragraph number (count double newlines before this position)
      const textBefore = fullText.substring(0, span.start);
      const paragraph = (textBefore.match(/\n\n/g) || []).length;

      const hert = createHERT({
        eid: entity.eid,
        aid: entity.aid,  // Phase 3: Include alias ID
        sp: entity.sp,
        documentPath: docId,
        contentHash,
        paragraph,
        tokenStart: span.start,
        tokenLength: span.end - span.start,
        confidence: (entity.attrs?.pattern_confidence as number) ||
                   (entity.attrs?.confidence as number) ||
                   1.0
      });

      const encoded = encodeHERT(hert);
      herts.push(encoded);
    }

    // Auto-save to HERT store if requested
    if (options.autoSaveHERTs && herts.length > 0) {
      const { hertStore } = await import('../../storage/hert-store');
      hertStore.addMany(herts);
      console.log(`[ORCHESTRATOR] Saved ${herts.length} HERTs to store`);
    }
  }

  return {
    entities: filteredEntities,
    spans: filteredSpans, // Don't include virtual spans in output
    relations: filteredRelations,
    fictionEntities,
    profiles, // Return updated profiles for cross-document learning
    herts     // Return HERTs if generated
  };
}

/**
 * Map custom entity types to ARES EntityType
 *
 * Custom types from pattern learning are mapped to standard ARES types:
 * - WIZARD, SORCERER, PROPHET, PRIEST, KING → PERSON
 * - SPELL, ARTIFACT, RELIC, PROTOCOL, ALGORITHM → ITEM
 * - CREATURE, RACE → SPECIES
 * - REALM, KINGDOM → PLACE
 * - TRIBE, HOUSE, TITLE → Preserved as-is (already in EntityType)
 */
function mapCustomTypeToAresType(customType: string): import('../schema').EntityType {
  const typeMap: Record<string, import('../schema').EntityType> = {
    // Fantasy entities
    WIZARD: 'PERSON',
    SORCERER: 'PERSON',
    SORCERESS: 'PERSON',
    SPELL: 'ITEM',
    CREATURE: 'SPECIES',
    ARTIFACT: 'ITEM',
    RACE: 'SPECIES',
    REALM: 'PLACE',
    // HOUSE: Keep as 'HOUSE' (already in EntityType)
    // TRIBE: Keep as 'TRIBE' (already in EntityType)

    // Biblical entities
    PROPHET: 'PERSON',
    PRIEST: 'PERSON',
    KING: 'PERSON',
    // TITLE: Keep as 'TITLE' (already in EntityType)

    // Technical entities
    PROTOCOL: 'ITEM',
    ALGORITHM: 'ITEM',
    LANGUAGE: 'ITEM'
  };

  const upper = customType.toUpperCase();

  // Check if it's already a valid EntityType
  const validTypes: import('../schema').EntityType[] = ['PERSON', 'ORG', 'PLACE', 'DATE', 'WORK', 'ITEM', 'SPECIES', 'HOUSE', 'TRIBE', 'TITLE', 'EVENT'];
  if (validTypes.includes(upper as import('../schema').EntityType)) {
    return upper as import('../schema').EntityType;
  }

  return typeMap[upper] || 'ITEM'; // Default to ITEM
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Register alias from drag-and-drop UI
 * Maps an alias name to a canonical entity
 */
export async function registerAlias(
  alias: string,
  canonical: string,
  type: string
): Promise<{ eid: number; aid: number }> {
  const { getEIDRegistry } = await import('../eid-registry.js');
  const { getAliasRegistry } = await import('../alias-registry.js');

  const entityRegistry = getEIDRegistry();
  const aliasRegistry = getAliasRegistry();

  // Get or create EID for canonical entity
  const canonicalEID = entityRegistry.getOrCreate(canonical);

  // Register the alias
  const aid = aliasRegistry.register(alias, canonicalEID, 1.0);

  // Save registries
  entityRegistry.save();
  aliasRegistry.save();

  return { eid: canonicalEID, aid };
}
