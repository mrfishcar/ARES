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
  const end = extractLatencyMs.startTimer();
  let newEntities: Entity[];
  let spans: any;
  let newRelations: Relation[];
  let fictionEntities: FictionEntity[] = [];
  let updatedProfiles: Map<string, EntityProfile>;
  try {
    ({ entities: newEntities, spans, relations: newRelations, fictionEntities, profiles: updatedProfiles } = await extractFromSegments(docId, text, graph.profiles));
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

  // DEBUG: Log entities after local dedup
  console.log(`[STORAGE] After local dedup: ${localEntities.length} entities:`, localEntities.map(e => `${e.type}::${e.canonical}`).join(', '));

  // Merge new entities with existing globals
  // To preserve determinism, we need to merge in a stable order
  const allLocalEntities = [
    ...extractLocalEntitiesFromGraph(graph),
    ...localEntities
  ];

  const mergeResult = mergeEntitiesAcrossDocs(allLocalEntities);
  const { globals, idMap, stats } = mergeResult;

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
