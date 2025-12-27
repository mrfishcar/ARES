/**
 * Correction Resolvers - Phase 2
 * User override system for entities and relations
 * Corrections are first-class citizens that survive reprocessing
 */

import { v4 as uuid } from 'uuid';
import { loadGraph, saveGraph } from '../../storage/storage';
import type { KnowledgeGraph } from '../../storage/storage';
import type {
  Entity,
  Relation,
  Correction,
  CorrectionType,
  VersionSnapshot,
  LearnedPattern,
  EntityType
} from '../../engine/schema';

// ============================================================================
// HELPER TYPES
// ============================================================================

interface CorrectionResult {
  success: boolean;
  correction?: Correction;
  entity?: EntityLite;
  entities?: EntityLite[];
  relation?: RelationLite;
  versionSnapshot?: VersionSnapshot;
  error?: string;
}

interface RollbackResult {
  success: boolean;
  restoredSnapshot?: VersionSnapshot;
  error?: string;
}

interface EntityLite {
  id: string;
  name: string;
  types: string[];
  aliases: string[];
  mentionCount?: number;
  source?: string;
}

interface RelationLite {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  symmetric?: boolean;
  confidenceAvg?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getGraphPath(project: string): string {
  return `./data/projects/${project}/graph.json`;
}

function toEntityLite(entity: Entity): EntityLite {
  return {
    id: entity.id,
    name: entity.canonical,
    types: [entity.type],
    aliases: entity.aliases || [],
    mentionCount: (entity as any).mention_count || 0,
    source: (entity as any).source || 'ares'
  };
}

function toRelationLite(relation: Relation, entityById: Map<string, Entity>): RelationLite {
  const subjEntity = entityById.get(relation.subj);
  const objEntity = entityById.get(relation.obj);
  return {
    id: relation.id,
    subject: subjEntity?.canonical || relation.subj,
    predicate: relation.pred,
    object: objEntity?.canonical || relation.obj,
    symmetric: (relation as any).symmetric || false,
    confidenceAvg: relation.confidence
  };
}

function createVersionSnapshot(
  graph: KnowledgeGraph,
  correctionId: string,
  description?: string
): VersionSnapshot {
  return {
    id: uuid(),
    createdAt: new Date().toISOString(),
    correctionId,
    entityCount: graph.entities.length,
    relationCount: graph.relations.length,
    description
  };
}

function createCorrection(
  type: CorrectionType,
  before: any,
  after: any,
  options: {
    entityId?: string;
    entityIds?: string[];
    relationId?: string;
    reason?: string;
    author?: string;
  }
): Correction {
  return {
    id: uuid(),
    type,
    timestamp: new Date().toISOString(),
    author: options.author,
    entityId: options.entityId,
    entityIds: options.entityIds,
    relationId: options.relationId,
    before,
    after,
    reason: options.reason,
    learned: {
      patternExtracted: false,
      appliedToCount: 0
    },
    rolledBack: false
  };
}

function addCorrectionToGraph(graph: KnowledgeGraph, correction: Correction): VersionSnapshot {
  // Initialize arrays if not present
  if (!graph.corrections) graph.corrections = [];
  if (!graph.versions) graph.versions = [];

  // Add correction
  graph.corrections.push(correction);

  // Create and add version snapshot
  const snapshot = createVersionSnapshot(
    graph,
    correction.id,
    `${correction.type}: ${correction.reason || 'No reason provided'}`
  );
  graph.versions.push(snapshot);

  // Update metadata
  if (!graph.metadata) {
    graph.metadata = {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      doc_count: 0,
      doc_ids: []
    };
  }
  graph.metadata.correction_count = graph.corrections.length;
  graph.metadata.last_correction_at = correction.timestamp;
  graph.metadata.updated_at = new Date().toISOString();

  return snapshot;
}

// ============================================================================
// QUERY RESOLVERS
// ============================================================================

const queryResolvers = {
  /**
   * List corrections for a project
   */
  listCorrections: (
    _: any,
    args: { project: string; entityId?: string; limit?: number; after?: string }
  ): Correction[] => {
    const graph = loadGraph(getGraphPath(args.project));
    if (!graph || !graph.corrections) return [];

    let corrections = graph.corrections.filter(c => !c.rolledBack);

    // Filter by entityId if provided
    if (args.entityId) {
      corrections = corrections.filter(c =>
        c.entityId === args.entityId ||
        (c.entityIds && c.entityIds.includes(args.entityId!))
      );
    }

    // Apply cursor pagination
    if (args.after) {
      const afterIndex = corrections.findIndex(c => c.id === args.after);
      if (afterIndex >= 0) {
        corrections = corrections.slice(afterIndex + 1);
      }
    }

    // Sort by timestamp descending
    corrections.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return corrections.slice(0, args.limit || 50);
  },

  /**
   * List version snapshots for a project
   */
  listVersions: (
    _: any,
    args: { project: string; limit?: number }
  ): VersionSnapshot[] => {
    const graph = loadGraph(getGraphPath(args.project));
    if (!graph || !graph.versions) return [];

    return graph.versions
      .sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, args.limit || 20);
  },

  /**
   * List learned patterns for a project
   */
  listLearnedPatterns: (
    _: any,
    args: { project: string; active?: boolean }
  ): LearnedPattern[] => {
    const graph = loadGraph(getGraphPath(args.project));
    if (!graph || !graph.learnedPatterns) return [];

    let patterns = graph.learnedPatterns;
    if (args.active !== undefined) {
      patterns = patterns.filter(p => p.active === args.active);
    }

    return patterns;
  },

  /**
   * Get correction history for a specific entity
   */
  entityCorrectionHistory: (
    _: any,
    args: { project: string; entityId: string }
  ): { corrections: Correction[]; totalCount: number } => {
    const graph = loadGraph(getGraphPath(args.project));
    if (!graph || !graph.corrections) {
      return { corrections: [], totalCount: 0 };
    }

    const corrections = graph.corrections.filter(c =>
      c.entityId === args.entityId ||
      (c.entityIds && c.entityIds.includes(args.entityId))
    );

    return {
      corrections,
      totalCount: corrections.length
    };
  }
};

// ============================================================================
// MUTATION RESOLVERS
// ============================================================================

const mutationResolvers = {
  /**
   * Correct an entity's type
   */
  correctEntityType: (
    _: any,
    args: { project: string; entityId: string; newType: EntityType; reason?: string }
  ): CorrectionResult => {
    const graphPath = getGraphPath(args.project);
    const graph = loadGraph(graphPath);

    if (!graph) {
      return { success: false, error: 'Graph not found' };
    }

    const entity = graph.entities.find(e => e.id === args.entityId);
    if (!entity) {
      return { success: false, error: 'Entity not found' };
    }

    const oldType = entity.type;
    const correction = createCorrection(
      'entity_type',
      { entityType: oldType },
      { entityType: args.newType },
      { entityId: args.entityId, reason: args.reason }
    );

    // Apply the correction
    entity.type = args.newType;
    (entity as any).manualOverride = true;

    const snapshot = addCorrectionToGraph(graph, correction);
    saveGraph(graph, graphPath);

    return {
      success: true,
      correction,
      entity: toEntityLite(entity),
      versionSnapshot: snapshot
    };
  },

  /**
   * Merge multiple entities into one
   */
  mergeEntities: (
    _: any,
    args: { project: string; entityIds: string[]; canonicalName: string; reason?: string }
  ): CorrectionResult => {
    const graphPath = getGraphPath(args.project);
    const graph = loadGraph(graphPath);

    if (!graph) {
      return { success: false, error: 'Graph not found' };
    }

    if (args.entityIds.length < 2) {
      return { success: false, error: 'Need at least 2 entities to merge' };
    }

    const entities = args.entityIds
      .map(id => graph.entities.find(e => e.id === id))
      .filter((e): e is Entity => e !== undefined);

    if (entities.length !== args.entityIds.length) {
      return { success: false, error: 'Some entities not found' };
    }

    // Create merged entity from first entity
    const primaryEntity = entities[0];
    const mergedEntity: Entity = {
      ...primaryEntity,
      canonical: args.canonicalName,
      aliases: [
        ...new Set([
          ...entities.flatMap(e => e.aliases || []),
          ...entities.map(e => e.canonical).filter(c => c !== args.canonicalName)
        ])
      ]
    };
    (mergedEntity as any).manualOverride = true;

    const correction = createCorrection(
      'entity_merge',
      {
        entities: entities.map(e => ({ id: e.id, canonical: e.canonical, type: e.type }))
      },
      {
        mergedEntityId: primaryEntity.id,
        canonical: args.canonicalName
      },
      { entityIds: args.entityIds, reason: args.reason }
    );

    // Update relations to point to merged entity
    for (const relation of graph.relations) {
      for (const entityId of args.entityIds.slice(1)) {
        if (relation.subj === entityId) {
          relation.subj = primaryEntity.id;
        }
        if (relation.obj === entityId) {
          relation.obj = primaryEntity.id;
        }
      }
    }

    // Remove merged entities (keep primary)
    graph.entities = graph.entities.filter(e =>
      e.id === primaryEntity.id || !args.entityIds.includes(e.id)
    );

    // Update primary entity
    const primaryIndex = graph.entities.findIndex(e => e.id === primaryEntity.id);
    if (primaryIndex >= 0) {
      graph.entities[primaryIndex] = mergedEntity;
    }

    const snapshot = addCorrectionToGraph(graph, correction);
    saveGraph(graph, graphPath);

    return {
      success: true,
      correction,
      entity: toEntityLite(mergedEntity),
      versionSnapshot: snapshot
    };
  },

  /**
   * Split an entity into multiple entities
   */
  splitEntity: (
    _: any,
    args: {
      project: string;
      entityId: string;
      splits: Array<{ name: string; type: EntityType; aliases?: string[]; mentionIds?: string[] }>;
      reason?: string;
    }
  ): CorrectionResult => {
    const graphPath = getGraphPath(args.project);
    const graph = loadGraph(graphPath);

    if (!graph) {
      return { success: false, error: 'Graph not found' };
    }

    const entity = graph.entities.find(e => e.id === args.entityId);
    if (!entity) {
      return { success: false, error: 'Entity not found' };
    }

    const newEntities: Entity[] = args.splits.map(split => ({
      id: uuid(),
      type: split.type,
      canonical: split.name,
      aliases: split.aliases || [],
      created_at: new Date().toISOString(),
      confidence: entity.confidence,
      tier: entity.tier
    }));

    const correction = createCorrection(
      'entity_split',
      { entity: { id: entity.id, canonical: entity.canonical, type: entity.type } },
      {
        newEntities: newEntities.map(e => ({ id: e.id, canonical: e.canonical, type: e.type }))
      },
      { entityId: args.entityId, reason: args.reason }
    );

    // Remove original entity
    graph.entities = graph.entities.filter(e => e.id !== args.entityId);

    // Add new entities
    graph.entities.push(...newEntities);

    // Note: relation reassignment would need mentionIds to properly assign
    // For now, relations pointing to split entity are left orphaned

    const snapshot = addCorrectionToGraph(graph, correction);
    saveGraph(graph, graphPath);

    return {
      success: true,
      correction,
      entities: newEntities.map(toEntityLite),
      versionSnapshot: snapshot
    };
  },

  /**
   * Reject an entity (mark as false positive)
   */
  rejectEntity: (
    _: any,
    args: { project: string; entityId: string; reason?: string }
  ): CorrectionResult => {
    const graphPath = getGraphPath(args.project);
    const graph = loadGraph(graphPath);

    if (!graph) {
      return { success: false, error: 'Graph not found' };
    }

    const entity = graph.entities.find(e => e.id === args.entityId);
    if (!entity) {
      return { success: false, error: 'Entity not found' };
    }

    const correction = createCorrection(
      'entity_reject',
      { entity: { id: entity.id, canonical: entity.canonical, type: entity.type } },
      { rejected: true },
      { entityId: args.entityId, reason: args.reason }
    );

    // Mark as rejected (don't delete, for potential restore)
    (entity as any).rejected = true;
    (entity as any).manualOverride = true;

    const snapshot = addCorrectionToGraph(graph, correction);
    saveGraph(graph, graphPath);

    return {
      success: true,
      correction,
      entity: toEntityLite(entity),
      versionSnapshot: snapshot
    };
  },

  /**
   * Restore a previously rejected entity
   */
  restoreEntity: (
    _: any,
    args: { project: string; entityId: string; reason?: string }
  ): CorrectionResult => {
    const graphPath = getGraphPath(args.project);
    const graph = loadGraph(graphPath);

    if (!graph) {
      return { success: false, error: 'Graph not found' };
    }

    const entity = graph.entities.find(e => e.id === args.entityId);
    if (!entity) {
      return { success: false, error: 'Entity not found' };
    }

    if (!(entity as any).rejected) {
      return { success: false, error: 'Entity is not rejected' };
    }

    const correction = createCorrection(
      'entity_restore',
      { rejected: true },
      { rejected: false },
      { entityId: args.entityId, reason: args.reason }
    );

    (entity as any).rejected = false;

    const snapshot = addCorrectionToGraph(graph, correction);
    saveGraph(graph, graphPath);

    return {
      success: true,
      correction,
      entity: toEntityLite(entity),
      versionSnapshot: snapshot
    };
  },

  /**
   * Add a relation between entities
   */
  addRelation: (
    _: any,
    args: { project: string; subjectId: string; predicate: string; objectId: string; reason?: string }
  ): CorrectionResult => {
    const graphPath = getGraphPath(args.project);
    const graph = loadGraph(graphPath);

    if (!graph) {
      return { success: false, error: 'Graph not found' };
    }

    const subjectEntity = graph.entities.find(e => e.id === args.subjectId);
    const objectEntity = graph.entities.find(e => e.id === args.objectId);

    if (!subjectEntity || !objectEntity) {
      return { success: false, error: 'Subject or object entity not found' };
    }

    const newRelation: Relation = {
      id: uuid(),
      subj: args.subjectId,
      pred: args.predicate,
      obj: args.objectId,
      confidence: 1.0, // Manual additions are high confidence
      evidence: [],
      subj_surface: subjectEntity.canonical,
      obj_surface: objectEntity.canonical,
      extractor: 'manual'
    };
    (newRelation as any).manualOverride = true;

    const correction = createCorrection(
      'relation_add',
      {},
      {
        relation: {
          id: newRelation.id,
          subj: args.subjectId,
          pred: args.predicate,
          obj: args.objectId
        }
      },
      { relationId: newRelation.id, reason: args.reason }
    );

    graph.relations.push(newRelation);

    const entityById = new Map(graph.entities.map(e => [e.id, e]));
    const snapshot = addCorrectionToGraph(graph, correction);
    saveGraph(graph, graphPath);

    return {
      success: true,
      correction,
      relation: toRelationLite(newRelation, entityById),
      versionSnapshot: snapshot
    };
  },

  /**
   * Remove a relation
   */
  removeRelation: (
    _: any,
    args: { project: string; relationId: string; reason?: string }
  ): CorrectionResult => {
    const graphPath = getGraphPath(args.project);
    const graph = loadGraph(graphPath);

    if (!graph) {
      return { success: false, error: 'Graph not found' };
    }

    const relation = graph.relations.find(r => r.id === args.relationId);
    if (!relation) {
      return { success: false, error: 'Relation not found' };
    }

    const correction = createCorrection(
      'relation_remove',
      {
        relation: {
          id: relation.id,
          subj: relation.subj,
          pred: relation.pred,
          obj: relation.obj
        }
      },
      { removed: true },
      { relationId: args.relationId, reason: args.reason }
    );

    // Remove the relation
    graph.relations = graph.relations.filter(r => r.id !== args.relationId);

    const snapshot = addCorrectionToGraph(graph, correction);
    saveGraph(graph, graphPath);

    return {
      success: true,
      correction,
      versionSnapshot: snapshot
    };
  },

  /**
   * Edit an existing relation
   */
  editRelation: (
    _: any,
    args: {
      project: string;
      relationId: string;
      subjectId?: string;
      predicate?: string;
      objectId?: string;
      reason?: string;
    }
  ): CorrectionResult => {
    const graphPath = getGraphPath(args.project);
    const graph = loadGraph(graphPath);

    if (!graph) {
      return { success: false, error: 'Graph not found' };
    }

    const relation = graph.relations.find(r => r.id === args.relationId);
    if (!relation) {
      return { success: false, error: 'Relation not found' };
    }

    const before = {
      subj: relation.subj,
      pred: relation.pred,
      obj: relation.obj
    };

    // Apply updates
    if (args.subjectId) relation.subj = args.subjectId;
    if (args.predicate) relation.pred = args.predicate;
    if (args.objectId) relation.obj = args.objectId;
    (relation as any).manualOverride = true;

    const after = {
      subj: relation.subj,
      pred: relation.pred,
      obj: relation.obj
    };

    const correction = createCorrection(
      'relation_edit',
      { relation: before },
      { relation: after },
      { relationId: args.relationId, reason: args.reason }
    );

    const entityById = new Map(graph.entities.map(e => [e.id, e]));
    const snapshot = addCorrectionToGraph(graph, correction);
    saveGraph(graph, graphPath);

    return {
      success: true,
      correction,
      relation: toRelationLite(relation, entityById),
      versionSnapshot: snapshot
    };
  },

  /**
   * Add an alias to an entity
   */
  addEntityAlias: (
    _: any,
    args: { project: string; entityId: string; alias: string; reason?: string }
  ): CorrectionResult => {
    const graphPath = getGraphPath(args.project);
    const graph = loadGraph(graphPath);

    if (!graph) {
      return { success: false, error: 'Graph not found' };
    }

    const entity = graph.entities.find(e => e.id === args.entityId);
    if (!entity) {
      return { success: false, error: 'Entity not found' };
    }

    if (entity.aliases.includes(args.alias)) {
      return { success: false, error: 'Alias already exists' };
    }

    const correction = createCorrection(
      'alias_add',
      { aliases: [...entity.aliases] },
      { alias: args.alias },
      { entityId: args.entityId, reason: args.reason }
    );

    entity.aliases.push(args.alias);
    (entity as any).manualOverride = true;

    const snapshot = addCorrectionToGraph(graph, correction);
    saveGraph(graph, graphPath);

    return {
      success: true,
      correction,
      entity: toEntityLite(entity),
      versionSnapshot: snapshot
    };
  },

  /**
   * Remove an alias from an entity
   */
  removeEntityAlias: (
    _: any,
    args: { project: string; entityId: string; alias: string; reason?: string }
  ): CorrectionResult => {
    const graphPath = getGraphPath(args.project);
    const graph = loadGraph(graphPath);

    if (!graph) {
      return { success: false, error: 'Graph not found' };
    }

    const entity = graph.entities.find(e => e.id === args.entityId);
    if (!entity) {
      return { success: false, error: 'Entity not found' };
    }

    if (!entity.aliases.includes(args.alias)) {
      return { success: false, error: 'Alias not found' };
    }

    const correction = createCorrection(
      'alias_remove',
      { alias: args.alias },
      { aliases: entity.aliases.filter(a => a !== args.alias) },
      { entityId: args.entityId, reason: args.reason }
    );

    entity.aliases = entity.aliases.filter(a => a !== args.alias);
    (entity as any).manualOverride = true;

    const snapshot = addCorrectionToGraph(graph, correction);
    saveGraph(graph, graphPath);

    return {
      success: true,
      correction,
      entity: toEntityLite(entity),
      versionSnapshot: snapshot
    };
  },

  /**
   * Change an entity's canonical name
   */
  changeCanonicalName: (
    _: any,
    args: { project: string; entityId: string; newName: string; reason?: string }
  ): CorrectionResult => {
    const graphPath = getGraphPath(args.project);
    const graph = loadGraph(graphPath);

    if (!graph) {
      return { success: false, error: 'Graph not found' };
    }

    const entity = graph.entities.find(e => e.id === args.entityId);
    if (!entity) {
      return { success: false, error: 'Entity not found' };
    }

    const oldName = entity.canonical;

    const correction = createCorrection(
      'canonical_change',
      { canonical: oldName },
      { canonical: args.newName },
      { entityId: args.entityId, reason: args.reason }
    );

    // Move old canonical to aliases if not already there
    if (!entity.aliases.includes(oldName)) {
      entity.aliases.push(oldName);
    }

    entity.canonical = args.newName;
    (entity as any).manualOverride = true;

    const snapshot = addCorrectionToGraph(graph, correction);
    saveGraph(graph, graphPath);

    return {
      success: true,
      correction,
      entity: toEntityLite(entity),
      versionSnapshot: snapshot
    };
  },

  /**
   * Rollback a correction
   */
  rollbackCorrection: (
    _: any,
    args: { project: string; correctionId: string; reason?: string }
  ): RollbackResult => {
    const graphPath = getGraphPath(args.project);
    const graph = loadGraph(graphPath);

    if (!graph) {
      return { success: false, error: 'Graph not found' };
    }

    if (!graph.corrections) {
      return { success: false, error: 'No corrections found' };
    }

    const correction = graph.corrections.find(c => c.id === args.correctionId);
    if (!correction) {
      return { success: false, error: 'Correction not found' };
    }

    if (correction.rolledBack) {
      return { success: false, error: 'Correction already rolled back' };
    }

    // Mark as rolled back
    correction.rolledBack = true;

    // Find the version snapshot for this correction
    const snapshot = graph.versions?.find(v => v.correctionId === args.correctionId);

    // Note: Full state rollback would require storing full snapshots
    // For now, we just mark the correction as rolled back
    // A more complete implementation would restore the before state

    saveGraph(graph, graphPath);

    return {
      success: true,
      restoredSnapshot: snapshot
    };
  },

  /**
   * Toggle a learned pattern's active status
   */
  toggleLearnedPattern: (
    _: any,
    args: { project: string; patternId: string; active: boolean }
  ): LearnedPattern | null => {
    const graphPath = getGraphPath(args.project);
    const graph = loadGraph(graphPath);

    if (!graph || !graph.learnedPatterns) {
      throw new Error('Graph or patterns not found');
    }

    const pattern = graph.learnedPatterns.find(p => p.id === args.patternId);
    if (!pattern) {
      throw new Error('Pattern not found');
    }

    pattern.active = args.active;
    saveGraph(graph, graphPath);

    return pattern;
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

export const correctionResolvers = {
  Query: queryResolvers,
  Mutation: mutationResolvers
};
