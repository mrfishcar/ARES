/**
 * Override Manager - Phase 2.3
 *
 * Applies user corrections to freshly extracted graphs.
 * Ensures corrections survive reprocessing.
 *
 * Key responsibilities:
 * 1. Apply entity type corrections
 * 2. Apply entity merges/splits
 * 3. Apply relation edits
 * 4. Preserve override flags
 * 5. Handle conflicts between extraction and corrections
 */

import type {
  Entity,
  Relation,
  Correction,
  CorrectionType,
  EntityType
} from './schema';
import type { KnowledgeGraph } from '../storage/storage';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface OverrideApplicationResult {
  /** The corrected graph */
  graph: KnowledgeGraph;
  /** Statistics about applied corrections */
  stats: OverrideStats;
  /** Conflicts that couldn't be resolved */
  conflicts: OverrideConflict[];
}

export interface OverrideStats {
  /** Number of entity type corrections applied */
  entityTypeChanges: number;
  /** Number of entity merges applied */
  entityMerges: number;
  /** Number of entity splits applied */
  entitySplits: number;
  /** Number of entity rejections applied */
  entityRejections: number;
  /** Number of relation additions applied */
  relationAdditions: number;
  /** Number of relation removals applied */
  relationRemovals: number;
  /** Number of alias changes applied */
  aliasChanges: number;
  /** Number of canonical name changes applied */
  canonicalChanges: number;
  /** Total corrections applied */
  totalApplied: number;
  /** Corrections skipped (entity not found, etc.) */
  skipped: number;
}

export interface OverrideConflict {
  /** The correction that caused the conflict */
  correction: Correction;
  /** Description of the conflict */
  description: string;
  /** Suggested resolution */
  suggestion?: string;
}

// ============================================================================
// MATCHING HELPERS
// ============================================================================

/**
 * Find an entity in the graph by ID or by canonical name/aliases
 * Used to match corrections to newly extracted entities
 */
function findEntityByIdOrName(
  graph: KnowledgeGraph,
  entityId?: string,
  canonicalName?: string
): Entity | undefined {
  // First try by ID
  if (entityId) {
    const byId = graph.entities.find(e => e.id === entityId);
    if (byId) return byId;
  }

  // Fall back to matching by canonical name
  if (canonicalName) {
    const normalized = canonicalName.toLowerCase().trim();

    // Exact match on canonical
    const byCanonical = graph.entities.find(
      e => e.canonical.toLowerCase().trim() === normalized
    );
    if (byCanonical) return byCanonical;

    // Match on aliases
    const byAlias = graph.entities.find(
      e => e.aliases?.some(a => a.toLowerCase().trim() === normalized)
    );
    if (byAlias) return byAlias;
  }

  return undefined;
}

/**
 * Find a relation in the graph by ID or by subject/predicate/object
 */
function findRelationByIdOrTriple(
  graph: KnowledgeGraph,
  relationId?: string,
  subj?: string,
  pred?: string,
  obj?: string
): Relation | undefined {
  // First try by ID
  if (relationId) {
    const byId = graph.relations.find(r => r.id === relationId);
    if (byId) return byId;
  }

  // Fall back to matching by triple
  if (subj && pred && obj) {
    return graph.relations.find(
      r => r.subj === subj && r.pred === pred && r.obj === obj
    );
  }

  return undefined;
}

// ============================================================================
// CORRECTION APPLIERS
// ============================================================================

/**
 * Apply entity type correction
 */
function applyEntityTypeCorrection(
  graph: KnowledgeGraph,
  correction: Correction,
  stats: OverrideStats,
  conflicts: OverrideConflict[]
): void {
  const entityId = correction.entityId;
  const newType = correction.after?.entityType as EntityType;
  const oldCanonical = correction.before?.canonical;

  if (!entityId || !newType) {
    stats.skipped++;
    return;
  }

  const entity = findEntityByIdOrName(graph, entityId, oldCanonical);
  if (!entity) {
    // Entity not found in new extraction - could be legitimate (not re-extracted)
    // or a conflict (entity was merged/split)
    stats.skipped++;
    return;
  }

  // Apply the type correction
  entity.type = newType;
  (entity as any).manualOverride = true;
  stats.entityTypeChanges++;
  stats.totalApplied++;
}

/**
 * Apply entity merge correction
 */
function applyEntityMergeCorrection(
  graph: KnowledgeGraph,
  correction: Correction,
  stats: OverrideStats,
  conflicts: OverrideConflict[]
): void {
  const entityIds = correction.entityIds || [];
  const mergedCanonical = correction.after?.canonical;

  if (entityIds.length < 2 || !mergedCanonical) {
    stats.skipped++;
    return;
  }

  // Find entities by their original canonicals
  const originalEntities = correction.before?.entities || [];
  const foundEntities: Entity[] = [];

  for (const origEntity of originalEntities) {
    const found = findEntityByIdOrName(graph, origEntity.id, origEntity.canonical);
    if (found) {
      foundEntities.push(found);
    }
  }

  if (foundEntities.length < 2) {
    // Not enough entities found to merge
    stats.skipped++;
    return;
  }

  // Use first entity as the primary
  const primaryEntity = foundEntities[0];
  const otherEntities = foundEntities.slice(1);

  // Update primary entity
  primaryEntity.canonical = mergedCanonical;
  primaryEntity.aliases = [
    ...new Set([
      ...(primaryEntity.aliases || []),
      ...otherEntities.flatMap(e => e.aliases || []),
      ...otherEntities.map(e => e.canonical)
    ])
  ];
  (primaryEntity as any).manualOverride = true;

  // Update relations to point to primary entity
  const otherIds = new Set(otherEntities.map(e => e.id));
  for (const relation of graph.relations) {
    if (otherIds.has(relation.subj)) {
      relation.subj = primaryEntity.id;
    }
    if (otherIds.has(relation.obj)) {
      relation.obj = primaryEntity.id;
    }
  }

  // Remove other entities
  graph.entities = graph.entities.filter(e => !otherIds.has(e.id));

  stats.entityMerges++;
  stats.totalApplied++;
}

/**
 * Apply entity rejection correction
 */
function applyEntityRejectionCorrection(
  graph: KnowledgeGraph,
  correction: Correction,
  stats: OverrideStats,
  conflicts: OverrideConflict[]
): void {
  const entityId = correction.entityId;
  const oldCanonical = correction.before?.entity?.canonical;

  if (!entityId) {
    stats.skipped++;
    return;
  }

  const entity = findEntityByIdOrName(graph, entityId, oldCanonical);
  if (!entity) {
    // Entity not re-extracted, which is expected for rejected entities
    stats.skipped++;
    return;
  }

  // Mark as rejected
  (entity as any).rejected = true;
  (entity as any).manualOverride = true;
  stats.entityRejections++;
  stats.totalApplied++;
}

/**
 * Apply alias addition correction
 */
function applyAliasAddCorrection(
  graph: KnowledgeGraph,
  correction: Correction,
  stats: OverrideStats,
  conflicts: OverrideConflict[]
): void {
  const entityId = correction.entityId;
  const newAlias = correction.after?.alias;

  if (!entityId || !newAlias) {
    stats.skipped++;
    return;
  }

  const entity = findEntityByIdOrName(graph, entityId);
  if (!entity) {
    stats.skipped++;
    return;
  }

  if (!entity.aliases.includes(newAlias)) {
    entity.aliases.push(newAlias);
    (entity as any).manualOverride = true;
    stats.aliasChanges++;
    stats.totalApplied++;
  }
}

/**
 * Apply alias removal correction
 */
function applyAliasRemoveCorrection(
  graph: KnowledgeGraph,
  correction: Correction,
  stats: OverrideStats,
  conflicts: OverrideConflict[]
): void {
  const entityId = correction.entityId;
  const removedAlias = correction.before?.alias;

  if (!entityId || !removedAlias) {
    stats.skipped++;
    return;
  }

  const entity = findEntityByIdOrName(graph, entityId);
  if (!entity) {
    stats.skipped++;
    return;
  }

  entity.aliases = entity.aliases.filter(a => a !== removedAlias);
  (entity as any).manualOverride = true;
  stats.aliasChanges++;
  stats.totalApplied++;
}

/**
 * Apply canonical name change correction
 */
function applyCanonicalChangeCorrection(
  graph: KnowledgeGraph,
  correction: Correction,
  stats: OverrideStats,
  conflicts: OverrideConflict[]
): void {
  const entityId = correction.entityId;
  const oldCanonical = correction.before?.canonical;
  const newCanonical = correction.after?.canonical;

  if (!entityId || !newCanonical) {
    stats.skipped++;
    return;
  }

  const entity = findEntityByIdOrName(graph, entityId, oldCanonical);
  if (!entity) {
    stats.skipped++;
    return;
  }

  // Move old canonical to aliases
  if (!entity.aliases.includes(entity.canonical)) {
    entity.aliases.push(entity.canonical);
  }

  entity.canonical = newCanonical;
  (entity as any).manualOverride = true;
  stats.canonicalChanges++;
  stats.totalApplied++;
}

/**
 * Apply relation addition correction
 */
function applyRelationAddCorrection(
  graph: KnowledgeGraph,
  correction: Correction,
  stats: OverrideStats,
  conflicts: OverrideConflict[]
): void {
  const relationData = correction.after?.relation;
  if (!relationData) {
    stats.skipped++;
    return;
  }

  const { subj, pred, obj } = relationData;

  // Check if relation already exists
  const existing = graph.relations.find(
    r => r.subj === subj && r.pred === pred && r.obj === obj
  );
  if (existing) {
    // Already exists, no action needed
    return;
  }

  // Check if both entities exist
  const subjEntity = graph.entities.find(e => e.id === subj);
  const objEntity = graph.entities.find(e => e.id === obj);

  if (!subjEntity || !objEntity) {
    stats.skipped++;
    return;
  }

  // Add the relation
  const newRelation: Relation = {
    id: relationData.id || uuid(),
    subj,
    pred,
    obj,
    confidence: 1.0,
    evidence: [],
    subj_surface: subjEntity.canonical,
    obj_surface: objEntity.canonical,
    extractor: 'manual'
  };
  (newRelation as any).manualOverride = true;

  graph.relations.push(newRelation);
  stats.relationAdditions++;
  stats.totalApplied++;
}

/**
 * Apply relation removal correction
 */
function applyRelationRemoveCorrection(
  graph: KnowledgeGraph,
  correction: Correction,
  stats: OverrideStats,
  conflicts: OverrideConflict[]
): void {
  const relationData = correction.before?.relation;
  if (!relationData) {
    stats.skipped++;
    return;
  }

  const { id, subj, pred, obj } = relationData;

  const relation = findRelationByIdOrTriple(graph, id, subj, pred, obj);
  if (!relation) {
    // Relation not re-extracted, expected
    return;
  }

  // Remove the relation
  graph.relations = graph.relations.filter(r => r.id !== relation.id);
  stats.relationRemovals++;
  stats.totalApplied++;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Apply user corrections to a freshly extracted graph
 *
 * This is called after extraction but before storage, ensuring
 * user corrections persist across reprocessing.
 *
 * @param extractedGraph - The freshly extracted graph
 * @param savedCorrections - Corrections from previous processing
 * @returns The corrected graph with statistics
 */
export function applyOverrides(
  extractedGraph: KnowledgeGraph,
  savedCorrections: Correction[]
): OverrideApplicationResult {
  const stats: OverrideStats = {
    entityTypeChanges: 0,
    entityMerges: 0,
    entitySplits: 0,
    entityRejections: 0,
    relationAdditions: 0,
    relationRemovals: 0,
    aliasChanges: 0,
    canonicalChanges: 0,
    totalApplied: 0,
    skipped: 0
  };

  const conflicts: OverrideConflict[] = [];

  // Filter out rolled-back corrections
  const activeCorrections = savedCorrections.filter(c => !c.rolledBack);

  // Sort corrections by timestamp (oldest first) to apply in order
  const sortedCorrections = [...activeCorrections].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Apply each correction
  for (const correction of sortedCorrections) {
    switch (correction.type) {
      case 'entity_type':
        applyEntityTypeCorrection(extractedGraph, correction, stats, conflicts);
        break;

      case 'entity_merge':
        applyEntityMergeCorrection(extractedGraph, correction, stats, conflicts);
        break;

      case 'entity_split':
        // Split is complex - entities may not match after reprocessing
        // For now, we skip splits during reprocessing
        stats.skipped++;
        break;

      case 'entity_reject':
        applyEntityRejectionCorrection(extractedGraph, correction, stats, conflicts);
        break;

      case 'entity_restore':
        // Find the entity and remove rejection flag
        const entityId = correction.entityId;
        if (entityId) {
          const entity = extractedGraph.entities.find(e => e.id === entityId);
          if (entity) {
            (entity as any).rejected = false;
            stats.totalApplied++;
          }
        }
        break;

      case 'alias_add':
        applyAliasAddCorrection(extractedGraph, correction, stats, conflicts);
        break;

      case 'alias_remove':
        applyAliasRemoveCorrection(extractedGraph, correction, stats, conflicts);
        break;

      case 'canonical_change':
        applyCanonicalChangeCorrection(extractedGraph, correction, stats, conflicts);
        break;

      case 'relation_add':
        applyRelationAddCorrection(extractedGraph, correction, stats, conflicts);
        break;

      case 'relation_remove':
        applyRelationRemoveCorrection(extractedGraph, correction, stats, conflicts);
        break;

      case 'relation_edit':
        // Edit is complex - apply if relation still exists
        const relData = correction.before?.relation;
        if (relData) {
          const relation = findRelationByIdOrTriple(
            extractedGraph,
            correction.relationId,
            relData.subj,
            relData.pred,
            relData.obj
          );
          if (relation) {
            const afterData = correction.after?.relation || {};
            if (afterData.subj) relation.subj = afterData.subj;
            if (afterData.pred) relation.pred = afterData.pred;
            if (afterData.obj) relation.obj = afterData.obj;
            (relation as any).manualOverride = true;
            stats.totalApplied++;
          }
        }
        break;

      default:
        stats.skipped++;
    }
  }

  // Preserve correction history in the graph
  if (!extractedGraph.corrections) {
    extractedGraph.corrections = [];
  }

  // Merge with saved corrections (avoid duplicates)
  const existingIds = new Set(extractedGraph.corrections.map(c => c.id));
  for (const correction of savedCorrections) {
    if (!existingIds.has(correction.id)) {
      extractedGraph.corrections.push(correction);
    }
  }

  return {
    graph: extractedGraph,
    stats,
    conflicts
  };
}

/**
 * Apply overrides from a saved graph to a newly extracted graph
 * Convenience function that loads corrections from the saved graph
 */
export function applyOverridesFromSavedGraph(
  extractedGraph: KnowledgeGraph,
  savedGraph: KnowledgeGraph
): OverrideApplicationResult {
  const savedCorrections = savedGraph.corrections || [];
  const savedVersions = savedGraph.versions || [];
  const savedPatterns = savedGraph.learnedPatterns || [];

  const result = applyOverrides(extractedGraph, savedCorrections);

  // Also preserve versions and patterns
  result.graph.versions = savedVersions;
  result.graph.learnedPatterns = savedPatterns;

  return result;
}
