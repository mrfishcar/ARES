/**
 * Persistent Storage - Phase 5
 * JSON-based storage for knowledge graphs with provenance tracking
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Entity, Relation } from '../engine/schema';
import type { Conflict } from '../engine/conflicts';
import { extractEntities } from '../engine/extract/entities';
import { extractRelations } from '../engine/extract/relations';
import { extractFromSegments } from '../engine/extract/orchestrator';
import { mergeEntitiesAcrossDocs } from '../engine/merge';
import { detectConflicts } from '../engine/conflicts';
import { ingestTotal, extractLatencyMs } from '../infra/metrics';
import type { FictionEntity } from '../engine/fiction-extraction';
import { serializeProfiles, deserializeProfiles, type EntityProfile } from '../engine/entity-profiler';
import type { PatternLibrary } from '../engine/pattern-library';
import { createPatternLibrary, addPatterns } from '../engine/pattern-library';
import type { Pattern } from '../engine/bootstrap';
import { DEFAULT_LLM_CONFIG } from '../engine/llm-config';

export interface ProvenanceEntry {
  global_id: string;
  doc_id: string;
  merged_at: string;
  local_canonical: string;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
  conflicts: Conflict[];
  provenance: Map<string, ProvenanceEntry>;  // local_id -> entry
  profiles: Map<string, EntityProfile>;      // entity_id -> profile (adaptive learning)
  metadata: {
    created_at: string;
    updated_at: string;
    doc_count: number;
    doc_ids: string[];
  };
}

export interface SerializedGraph {
  entities: Entity[];
  relations: Relation[];
  conflicts: Conflict[];
  provenance: Record<string, ProvenanceEntry>;
  profiles?: any;  // Serialized profiles (optional for backward compatibility)
  metadata: {
    created_at: string;
    updated_at: string;
    doc_count: number;
    doc_ids: string[];
  };
}

const DEFAULT_STORAGE_PATH = path.join(process.cwd(), 'ares_graph.json');

const CONNECTOR_TOKENS = new Set(['the', 'of', 'and', 'jr', 'sr', 'ii', 'iii', 'iv']);
const LOWERCASE_ALLOWED = new Set(['the', 'of', 'and']);
const LOWERCASE_TITLE_TOKENS = new Set([
  'professor', 'headmaster', 'headmistress', 'head', 'director', 'dean', 'captain', 'commander',
  'chief', 'sir', 'lady', 'lord', 'madam', 'madame', 'dr', 'doctor', 'mr', 'mrs', 'ms', 'miss',
  'father', 'mother', 'mom', 'dad', 'aunt', 'uncle', 'king', 'queen', 'prince', 'princess',
  'duke', 'duchess', 'baron', 'baroness', 'mentor', 'teacher', 'mistress', 'master', 'coach',
  'family'
]);
const SALVAGE_ENTITY_TYPES = new Set(['PERSON', 'ORG', 'HOUSE', 'PLACE']);

const pronouns = new Set(['he', 'she', 'it', 'they', 'him', 'her', 'his', 'hers', 'its', 'their', 'theirs', 'them']);
const deictics = new Set(['there', 'here']);
const commonVerbs = new Set(['ruled', 'teaches', 'lived', 'studied', 'went', 'became', 'was', 'were', 'is', 'are', 'has', 'have', 'had', 'said', 'says', 'asked', 'replied']);

const scoreName = (value: string) => {
  const parts = value.toLowerCase().split(/\s+/).filter(Boolean);
  const informative = parts.filter(p => !CONNECTOR_TOKENS.has(p)).length;
  return { informative, total: parts.length, length: value.length };
};

function normalizeCanonical(type: string, canonical: string): string | null {
  if (!canonical) return null;
  let value = canonical.trim();
  const debugEnabled = process.env.L3_DEBUG === '1';
  const logFilter = (reason: string) => {
    if (debugEnabled) {
      console.log(`[STORAGE] Filtering ${type}::${canonical} - ${reason}`);
    }
  };

  const lowerValue = value.toLowerCase();
  if (pronouns.has(lowerValue) || deictics.has(lowerValue)) {
    logFilter('pronoun/deictic');
    return null;
  }

  const words = lowerValue.split(/\s+/);
  if (words.some(w => commonVerbs.has(w))) {
    logFilter('contains verb');
    return null;
  }

  if (type === 'ORG' && /\bHouse$/i.test(value)) {
    value = value.replace(/\s+House$/i, '');
  }

  if (!SALVAGE_ENTITY_TYPES.has(type)) {
    return value;
  }

  const toTitleCase = (token: string) => {
    if (!token.length) return token;
    return token[0].toUpperCase() + token.slice(1);
  };

  let tokens = value.split(/\s+/).filter(Boolean);
  const hasUppercase = tokens.some(token => /^[A-Z]/.test(token));

  if (!hasUppercase) {
    const informativeTokens = tokens.filter(token => {
      const lower = token.toLowerCase();
      return !LOWERCASE_ALLOWED.has(lower) && !LOWERCASE_TITLE_TOKENS.has(lower);
    });

    if (informativeTokens.length) {
      const promotedTokens = tokens.map(toTitleCase);
      const promotedValue = promotedTokens.join(' ');
      if (debugEnabled) {
        console.log(`[STORAGE] Promoted lowercase canonical "${value}" -> "${promotedValue}"`);
      }
      value = promotedValue;
      tokens = promotedTokens;
    } else {
      logFilter('all lowercase tokens');
      return null;
    }
  }

  const blockingToken = tokens.find(token => {
    if (!/^[a-z]/.test(token)) return false;
    const lower = token.toLowerCase();
    if (LOWERCASE_ALLOWED.has(lower) || LOWERCASE_TITLE_TOKENS.has(lower)) return false;
    return true;
  });

  if (blockingToken) {
    logFilter(`lowercase token "${blockingToken}"`);
    return null;
  }

  return value;
}

/**
 * Save knowledge graph to JSON file
 */
export function saveGraph(
  graph: KnowledgeGraph,
  filePath: string = DEFAULT_STORAGE_PATH
): void {
  // Convert Map to object for JSON serialization
  const serialized: SerializedGraph = {
    entities: graph.entities,
    relations: graph.relations,
    conflicts: graph.conflicts,
    provenance: Object.fromEntries(graph.provenance),
    profiles: graph.profiles ? serializeProfiles(graph.profiles) : {},  // Serialize profiles (handle undefined)
    metadata: graph.metadata
  };

  fs.writeFileSync(filePath, JSON.stringify(serialized, null, 2), 'utf-8');
}

/**
 * Load knowledge graph from JSON file
 */
export function loadGraph(
  filePath: string = DEFAULT_STORAGE_PATH
): KnowledgeGraph | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const data = fs.readFileSync(filePath, 'utf-8');
  const serialized: SerializedGraph = JSON.parse(data);

  // Convert object back to Map
  return {
    entities: serialized.entities,
    relations: serialized.relations,
    conflicts: serialized.conflicts,
    provenance: new Map(Object.entries(serialized.provenance)),
    profiles: serialized.profiles ? deserializeProfiles(serialized.profiles) : new Map(),  // Deserialize profiles (backward compatible)
    metadata: serialized.metadata
  };
}

/**
 * Create new empty graph
 */
export function createEmptyGraph(): KnowledgeGraph {
  return {
    entities: [],
    relations: [],
    conflicts: [],
    provenance: new Map(),
    profiles: new Map(),  // Empty profiles for adaptive learning
    metadata: {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      doc_count: 0,
      doc_ids: []
    }
  };
}

/**
 * Append a new document to the knowledge graph
 * This performs incremental merge while preserving existing global IDs
 */
export async function appendDoc(
  docId: string,
  text: string,
  filePath: string = DEFAULT_STORAGE_PATH
): Promise<{
  entities: Entity[];
  relations: Relation[];
  conflicts: Conflict[];
  mergeCount: number;
  fictionEntities: FictionEntity[];
  localEntities: Entity[];
}> {
  // Load existing graph or create new
  let graph = loadGraph(filePath);
  if (!graph) {
    graph = createEmptyGraph();
  }

  // Check if doc already exists
  if (graph.metadata.doc_ids.includes(docId)) {
    throw new Error(`Document ${docId} already exists in graph`);
  }

  // Extract entities and relations from new document with timing
  // Use segmented extraction with context windows for robust processing
  // Pass existing profiles for adaptive learning
  // Also pass pattern library to enable 15 new entity type extraction
  const end = extractLatencyMs.startTimer();
  let newEntities: Entity[];
  let spans: any;
  let newRelations: Relation[];
  let fictionEntities: FictionEntity[] = [];
  let updatedProfiles: Map<string, EntityProfile>;
  try {
    // Load or create pattern library for new entity types
    const patternLibrary = await loadFantasyEntityPatterns();

    ({ entities: newEntities, spans, relations: newRelations, fictionEntities, profiles: updatedProfiles } = await extractFromSegments(docId, text, graph.profiles, DEFAULT_LLM_CONFIG, patternLibrary));
  } finally {
    end();
  }

  // Store updated profiles back to graph
  graph.profiles = updatedProfiles;

  // Create unique local IDs for new entities
  const localEntitiesRaw = newEntities.map((e, idx) => ({
    ...e,
    id: `${docId}_entity_${idx}`
  }));

  // DEBUG: Log entities before filtering
  console.log(`[STORAGE] Received ${newEntities.length} entities from orchestrator:`, newEntities.map(e => `${e.type}::${e.canonical}`).join(', '));

  const normalizeLocal = (entity: Entity): Entity | null => {
    const normalized = normalizeCanonical(entity.type, entity.canonical);
    if (!normalized) return null;
    entity.canonical = normalized;
    return entity;
  };

  const localMap = new Map<string, Entity>();
  for (const raw of localEntitiesRaw) {
    const normalized = normalizeLocal({ ...raw });
    if (!normalized) continue;
    const entity = normalized;
    const key = `${entity.type}::${entity.canonical.toLowerCase()}`;
    const existing = localMap.get(key);
    if (!existing) {
      localMap.set(key, entity);
    } else {
      const existingScore = scoreName(existing.canonical);
      const newScore = scoreName(entity.canonical);
      if (
        newScore.informative > existingScore.informative ||
        (newScore.informative === existingScore.informative && (
          newScore.total > existingScore.total ||
          (newScore.total === existingScore.total && newScore.length > existingScore.length)
        ))
      ) {
        localMap.set(key, entity);
      }
    }
  }

  const localEntities = Array.from(localMap.values());

  // DEBUG: Log entities after local dedup with confidence
  console.log(`[STORAGE] After local dedup: ${localEntities.length} entities:`);
  localEntities.forEach(e => console.log(`  - ${e.type}::${e.canonical} (confidence: ${e.confidence?.toFixed(3) || 'N/A'})`));

  // Merge new entities with existing globals
  // To preserve determinism, we need to merge in a stable order
  const allLocalEntities = [
    ...extractLocalEntitiesFromGraph(graph),
    ...localEntities
  ];

  const mergeResult = mergeEntitiesAcrossDocs(allLocalEntities);
  const { globals, idMap, stats } = mergeResult;

  // DEBUG: Log what happened during merge
  console.log(`[STORAGE] Merge result: ${allLocalEntities.length} entities → ${globals.length} globals`);
  console.log(`[STORAGE] Globals after merge:`);
  globals.forEach(g => console.log(`  - ${g.type}::${g.canonical} (confidence: ${g.confidence?.toFixed(3) || 'N/A'})`));

  // Log merge statistics for debugging
  if (process.env.DEBUG_MERGE === '1') {
    console.log('[merge] stats:', stats);
    console.log(`[merge] merged ${stats.total_entities} entities into ${stats.merged_clusters} clusters`);
    console.log(`[merge] avg confidence: ${stats.avg_confidence.toFixed(3)}`);
    if (stats.low_confidence_count > 0) {
      console.log(`[merge] warning: ${stats.low_confidence_count} low-confidence merges (< 0.7)`);
    }
  }

  // Update provenance for existing local entities with new global IDs
  for (const [localId, info] of graph.provenance.entries()) {
    const newGlobal = idMap.get(localId);
    if (newGlobal) {
      graph.provenance.set(localId, {
        ...info,
        global_id: newGlobal
      });
    }
  }

  // Update provenance for new entities
  const mergedAt = new Date().toISOString();
  for (const localEntity of localEntities) {
    const globalId = idMap.get(localEntity.id);
    if (globalId) {
      graph.provenance.set(localEntity.id, {
        global_id: globalId,
        doc_id: docId,
        merged_at: mergedAt,
        local_canonical: localEntity.canonical
      });
    }
  }

  // Rewire new relations to global IDs
  const resolveGlobalId = (entityId: string): string => {
    const direct = idMap.get(entityId);
    if (direct) return direct;

    const idx = newEntities.findIndex(e => e.id === entityId);
    if (idx !== -1) {
      const localId = `${docId}_entity_${idx}`;
      return idMap.get(localId) || localId;
    }

    return entityId;
  };

  const globalRelations = newRelations.map(rel => ({
    ...rel,
    subj: resolveGlobalId(rel.subj),
    obj: resolveGlobalId(rel.obj)
  }));

  // Combine with existing relations
  const allRelations = [...graph.relations, ...globalRelations];

  const hasResolvedEntities = (rel: Relation) =>
    globals.some(e => e.id === rel.subj) &&
    globals.some(e => e.id === rel.obj);

  const filteredRelations = allRelations.filter(hasResolvedEntities);

  // Detect conflicts
  const conflicts = detectConflicts(filteredRelations);

  // Count how many entities were merged (not new)
  const mergeCount = localEntities.length - (globals.length - graph.entities.length);

  // DEBUG: Log globals before storing
  console.log(`[STORAGE] Final globals for ${docId}: ${globals.length} entities:`, globals.slice(0, 5).map(e => `${e.type}::${e.canonical}`).join(', '));

  // Update graph
  graph.entities = globals;
  graph.relations = filteredRelations;
  graph.conflicts = conflicts;
  graph.metadata.updated_at = new Date().toISOString();
  graph.metadata.doc_count += 1;
  graph.metadata.doc_ids.push(docId);

  // Save updated graph
  saveGraph(graph, filePath);

  // Increment ingest counter
  ingestTotal.inc();

  return {
    entities: globals,
    relations: filteredRelations,
    conflicts,
    mergeCount,
    fictionEntities,
    localEntities
  };
}

/**
 * Extract local entities from existing graph provenance
 * Used for deterministic re-merging
 */
function extractLocalEntitiesFromGraph(graph: KnowledgeGraph): Entity[] {
  const byKey = new Map<string, Entity>();

  for (const [localId, entry] of graph.provenance.entries()) {
    const globalEntity = graph.entities.find(e => e.id === entry.global_id);
    if (globalEntity) {
      const canonical = normalizeCanonical(globalEntity.type, entry.local_canonical);
      if (!canonical) continue;
      const key = `${globalEntity.type}::${canonical.toLowerCase()}`;
      const candidate: Entity = {
        id: localId,
        type: globalEntity.type,
        canonical,
        aliases: [],
        created_at: entry.merged_at,
        centrality: 1.0
      };
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, candidate);
      } else {
        const existingScore = scoreName(existing.canonical);
        const newScore = scoreName(candidate.canonical);
        if (
          newScore.informative > existingScore.informative ||
          (newScore.informative === existingScore.informative && (
            newScore.total > existingScore.total ||
            (newScore.total === existingScore.total && newScore.length < existingScore.length)
          ))
        ) {
          byKey.set(key, candidate);
        }
      }
    }
  }
  return Array.from(byKey.values());
}

/**
 * Get provenance for a global entity ID
 */
export function getProvenance(
  globalId: string,
  graph: KnowledgeGraph
): ProvenanceEntry[] {
  const entries: ProvenanceEntry[] = [];

  for (const [localId, entry] of graph.provenance.entries()) {
    if (entry.global_id === globalId) {
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * Clear storage (for testing)
 * Also clears all registries to ensure test isolation
 */
export async function clearStorage(filePath: string = DEFAULT_STORAGE_PATH): Promise<void> {
  // Clear main storage file
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Clear registries to prevent cross-test contamination
  const registryFiles = [
    './data/eid-registry.json',
    './data/alias-registry.json',
    './data/sense-registry.json'
  ];

  for (const registryFile of registryFiles) {
    if (fs.existsSync(registryFile)) {
      fs.unlinkSync(registryFile);
    }
  }

  // Clear in-memory registry state
  try {
    const { eidRegistry } = await import('../engine/eid-registry');
    const { aliasRegistry } = await import('../engine/alias-registry');
    const { senseRegistry } = await import('../engine/sense-disambiguator');

    eidRegistry.clear();
    aliasRegistry.clear();
    senseRegistry.clear();
  } catch (error) {
    // Registries not loaded yet, which is fine
  }
}

/**
 * Load or create pattern library for 15 new fantasy entity types
 *
 * Initializes patterns for:
 * - RACE: Elves, Dwarves, Orcs, Humans
 * - CREATURE: Dragons, Phoenix, Basilisk
 * - ARTIFACT: One Ring, Excalibur, Wand
 * - SPELL: Fireball, Patronus, Shield Charm
 * - And 11 more types (TECHNOLOGY, MAGIC, LANGUAGE, CURRENCY, MATERIAL, DRUG, DEITY, ABILITY, SKILL, POWER, TECHNIQUE)
 */
async function loadFantasyEntityPatterns(): Promise<PatternLibrary> {
  const library = createPatternLibrary(
    'Fantasy Entities (Level 5C)',
    'Patterns for extracting fantasy-specific entity types',
    'fiction'
  );

  // Define patterns for each new entity type
  // These patterns are designed to match the seed data from our narrative

  const patterns: Record<string, Pattern[]> = {
    'RACE': [
      { type: 'RACE', template: '[RACE] are/were...', regex: /\b(Elves?|Dwarves?|Orcs?|Humans?|Drow|Halflings?)\s+(?:are|were|live|lived|possess|ruled)/gi, confidence: 0.78, examples: ['Elves', 'Dwarves', 'Orcs'], extractionCount: 0 },
      { type: 'RACE', template: '[RACE] adjective + noun', regex: /\b(Elven|Dwarven|Orcish|Human)\s+(?:warrior|king|culture|society|civilization)/gi, confidence: 0.80, examples: ['Elven warrior', 'Dwarven king'], extractionCount: 0 },
      { type: 'RACE', template: '[RACE] -kind suffix', regex: /\b(Elf|Dwarf|Orc|Elf|Drow)kind\b/gi, confidence: 0.85, examples: ['Elfkind', 'Humankind'], extractionCount: 0 },
    ],
    'CREATURE': [
      { type: 'CREATURE', template: 'dragon/creature [Name]', regex: /\b(?:dragon|creature|beast|beast)\s+(?:named\s+)?([A-Z][a-z]+)/gi, confidence: 0.80, examples: ['dragon Smaug', 'creature Basilisk'], extractionCount: 0 },
      { type: 'CREATURE', template: '[Name]\'s hoard/lair', regex: /([A-Z][a-z]+)\'s\s+(?:hoard|lair|nest|den)/gi, confidence: 0.82, examples: ['Smaug\'s hoard'], extractionCount: 0 },
      { type: 'CREATURE', template: 'famous creatures list', regex: /\b(Smaug|Phoenix|Basilisk|Dragon|Fawkes|Centaur)\b/gi, confidence: 0.88, examples: ['Smaug', 'Phoenix', 'Basilisk'], extractionCount: 0 },
    ],
    'ARTIFACT': [
      { type: 'ARTIFACT', template: 'the [ARTIFACT]', regex: /\bthe\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:Ring|Sword|Wand|Crown|Amulet|Stone|Gem)/gi, confidence: 0.82, examples: ['the One Ring', 'the Philosopher\'s Stone'], extractionCount: 0 },
      { type: 'ARTIFACT', template: '[Person]\'s [ARTIFACT]', regex: /([A-Z][a-z]+)\'s\s+(?:ring|wand|sword|staff|artifact|object)/gi, confidence: 0.81, examples: ['Harry\'s wand', 'Frodo\'s ring'], extractionCount: 0 },
      { type: 'ARTIFACT', template: 'famous artifacts', regex: /\b(Excalibur|One Ring|Philosopher\'s Stone|Holy Grail|Trident|Mjolnir)\b/gi, confidence: 0.87, examples: ['Excalibur', 'One Ring'], extractionCount: 0 },
    ],
    'SPELL': [
      { type: 'SPELL', template: 'cast [SPELL]', regex: /\b(?:cast|casts|casting)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi, confidence: 0.83, examples: ['cast Fireball', 'casts Expelliarmus'], extractionCount: 0 },
      { type: 'SPELL', template: '[SPELL] spell/charm', regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:spell|charm|curse|hex|enchantment|incantation)\b/gi, confidence: 0.85, examples: ['Healing spell', 'Protection charm'], extractionCount: 0 },
      { type: 'SPELL', template: 'famous spells', regex: /\b(Fireball|Expelliarmus|Patronus|Shield Charm|Healing Charm|Levitation|Accio|Confundus|Stupefy|Lightning Bolt)\b/gi, confidence: 0.88, examples: ['Fireball', 'Patronus', 'Expelliarmus'], extractionCount: 0 },
    ],
    'ABILITY': [
      { type: 'ABILITY', template: 'ability to [VERB]', regex: /\bability\s+to\s+([a-z]+(?:\s+[a-z]+)?)\b/gi, confidence: 0.80, examples: ['ability to speak', 'ability to fly'], extractionCount: 0 },
      { type: 'ABILITY', template: 'can/could [VERB]', regex: /\b(?:can|could|may)\s+([a-z]+(?:\s+[a-z]+)?)\b/gi, confidence: 0.75, examples: ['can speak', 'could fly'], extractionCount: 0 },
      { type: 'ABILITY', template: 'power of [ABILITY]', regex: /\bpower\s+of\s+([a-z]+(?:\s+[a-z]+)?)\b/gi, confidence: 0.78, examples: ['power of telepathy', 'power of flight'], extractionCount: 0 },
    ],
    'TECHNOLOGY': [
      { type: 'TECHNOLOGY', template: 'technology [TYPE]', regex: /\b(?:technology|advanced technology|device|machine|engine)\s+(?:called\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi, confidence: 0.72, examples: ['advanced technology', 'powered ship'], extractionCount: 0 },
    ],
    'MAGIC': [
      { type: 'MAGIC', template: '[TYPE] magic', regex: /\b([A-Z][a-z]+)\s+magic\b/gi, confidence: 0.75, examples: ['Dark magic', 'Elemental magic'], extractionCount: 0 },
    ],
    'LANGUAGE': [
      { type: 'LANGUAGE', template: '[Language] language', regex: /\b([A-Z][a-z]+)\s+(?:language|tongue|speech)\b/gi, confidence: 0.78, examples: ['Elvish language', 'Dwarven tongue'], extractionCount: 0 },
    ],
    'CURRENCY': [
      { type: 'CURRENCY', template: '[Currency] coins/gold', regex: /\b([A-Z][a-z]+)\s+(?:coin|coins|gold|credits?)\b/gi, confidence: 0.75, examples: ['Galleon coins', 'Mithril gold'], extractionCount: 0 },
    ],
    'MATERIAL': [
      { type: 'MATERIAL', template: 'made of [MATERIAL]', regex: /\bmade\s+of\s+([A-Z][a-z]+)\b/gi, confidence: 0.80, examples: ['made of Mithril', 'made of Adamantite'], extractionCount: 0 },
      { type: 'MATERIAL', template: '[MATERIAL] ore/metal', regex: /\b([A-Z][a-z]+)\s+(?:ore|metal|material|alloy)\b/gi, confidence: 0.77, examples: ['Mithril ore', 'Adamantite metal'], extractionCount: 0 },
    ],
    'DRUG': [
      { type: 'DRUG', template: '[Drug] potion', regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:potion|elixir|concoction|brew)\b/gi, confidence: 0.80, examples: ['Felix Felicis potion', 'Love potion'], extractionCount: 0 },
    ],
    'DEITY': [
      { type: 'DEITY', template: '[Deity] the god/goddess', regex: /\b([A-Z][a-z]+)\s+(?:the\s+)?(?:god|goddess|deity|divine)\b/gi, confidence: 0.82, examples: ['Zeus the god', 'Hecate goddess'], extractionCount: 0 },
    ],
    'SKILL': [
      { type: 'SKILL', template: 'skill in [SKILL]', regex: /\bskill(?:ed)?\s+(?:in|at|with)\s+([a-z]+(?:\s+[a-z]+)?)\b/gi, confidence: 0.81, examples: ['skill in swordsmanship', 'skilled in archery'], extractionCount: 0 },
    ],
    'POWER': [
      { type: 'POWER', template: 'power of [POWER]', regex: /\bpower\s+of\s+([a-z]+(?:\s+[a-z]+)?)\b/gi, confidence: 0.78, examples: ['power of telepathy', 'power of immortality'], extractionCount: 0 },
    ],
    'TECHNIQUE': [
      { type: 'TECHNIQUE', template: '[Person] used [TECHNIQUE]', regex: /\b([A-Z][a-z]+)\s+(?:used|performed|executed)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi, confidence: 0.79, examples: ['Aragorn used Fireball', 'Legolas performed Arrow Storm'], extractionCount: 0 },
    ],
  };

  // Add patterns to library
  for (const [entityType, typePatterns] of Object.entries(patterns)) {
    addPatterns(library, entityType, typePatterns, []);
  }

  console.log(`[STORAGE] Loaded fantasy entity pattern library with ${library.metadata.total_patterns} patterns across ${library.metadata.total_types} types`);
  return library;
}
