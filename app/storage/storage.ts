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

  const connectors = new Set(['the', 'of', 'and', 'jr', 'sr', 'ii', 'iii', 'iv']);
  const lowercaseAllowed = new Set(['the', 'of', 'and']);
  const scoreName = (value: string) => {
    const parts = value.toLowerCase().split(/\s+/).filter(Boolean);
    const informative = parts.filter(p => !connectors.has(p)).length;
    return { informative, total: parts.length, length: value.length };
  };

  const normalizeCanonical = (type: string, canonical: string): string | null => {
    let value = canonical;
    if (type === 'ORG' && /\bHouse$/i.test(value)) {
      value = value.replace(/\s+House$/i, '');
    }
    const tokens = value.split(/\s+/).filter(Boolean);
    if (type === 'PERSON' || type === 'ORG' || type === 'HOUSE' || type === 'PLACE') {
      if (tokens.some(token => /^[a-z]/.test(token) && !lowercaseAllowed.has(token.toLowerCase()))) {
        return null;
      }
    }
    return value;
  };

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
          (newScore.total === existingScore.total && newScore.length < existingScore.length)
        ))
      ) {
        localMap.set(key, entity);
      }
    }
  }

  const localEntities = Array.from(localMap.values());

  // Merge new entities with existing globals
  // To preserve determinism, we need to merge in a stable order
  const allLocalEntities = [
    ...extractLocalEntitiesFromGraph(graph),
    ...localEntities
  ];

  const { globals, idMap } = mergeEntitiesAcrossDocs(allLocalEntities);

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
    fictionEntities
  };
}

/**
 * Extract local entities from existing graph provenance
 * Used for deterministic re-merging
 */
function extractLocalEntitiesFromGraph(graph: KnowledgeGraph): Entity[] {
  const localEntities: Entity[] = [];
  const connectors = new Set(['the', 'of', 'and', 'jr', 'sr', 'ii', 'iii', 'iv']);
  const lowercaseAllowed = new Set(['the', 'of', 'and']);
  const scoreName = (value: string) => {
    const parts = value.toLowerCase().split(/\s+/).filter(Boolean);
    const informative = parts.filter(p => !connectors.has(p)).length;
    return { informative, total: parts.length, length: value.length };
  };
  const normalize = (canonical: string, type: string) => {
    if (type === 'ORG' && /\bHouse$/i.test(canonical)) {
      canonical = canonical.replace(/\s+House$/i, '');
    }
    if (type === 'PERSON' || type === 'ORG' || type === 'HOUSE' || type === 'PLACE') {
      const tokens = canonical.split(/\s+/).filter(Boolean);
      if (tokens.some(token => /^[a-z]/.test(token) && !lowercaseAllowed.has(token.toLowerCase()))) {
        return null;
      }
    }
    return canonical;
  };
  const byKey = new Map<string, Entity>();

  for (const [localId, entry] of graph.provenance.entries()) {
    const globalEntity = graph.entities.find(e => e.id === entry.global_id);
    if (globalEntity) {
      const canonical = normalize(entry.local_canonical, globalEntity.type);
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
  for (const entity of byKey.values()) {
    localEntities.push(entity);
  }
  return localEntities;
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
 */
export function clearStorage(filePath: string = DEFAULT_STORAGE_PATH): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
