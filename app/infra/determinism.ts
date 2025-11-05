/**
 * Deterministic graph hashing for guaranteeing stable output
 */

import * as crypto from 'crypto';
import type { KnowledgeGraph, ProvenanceEntry } from '../storage/storage';

/**
 * Recursively sort object keys alphabetically for deterministic stringification
 */
export function stableStringify(obj: any): string {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }

  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(item => stableStringify(item)).join(',') + ']';
  }

  // Sort object keys alphabetically
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(key => {
    return JSON.stringify(key) + ':' + stableStringify(obj[key]);
  });

  return '{' + pairs.join(',') + '}';
}

/**
 * Canonicalize graph for deterministic comparison
 * Returns a deep-copied, sorted object excluding volatile fields
 */
export function canonicalizeGraph(graph: KnowledgeGraph): any {
  // Create entity lookup
  const entityById = new Map(graph.entities.map(e => [e.id, e]));

  // Sort entities by canonical name (not ID, which depends on merge order)
  const sortedEntities = [...graph.entities]
    .sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.canonical.localeCompare(b.canonical);
    })
    .map(e => ({
      type: e.type,
      canonical: e.canonical,
      aliases: [...e.aliases].sort()
      // Exclude id, created_at, centrality - they're volatile/order-dependent
    }));

  // Sort relations by subject/object canonical names (not IDs)
  const sortedRelations = [...graph.relations]
    .map(r => {
      const subjEntity = entityById.get(r.subj);
      const objEntity = entityById.get(r.obj);
      return {
        subjName: subjEntity?.canonical || r.subj,
        objName: objEntity?.canonical || r.obj,
        pred: r.pred,
        confidence: r.confidence,
        extractor: r.extractor,
        qualifiers: r.qualifiers
      };
    })
    .sort((a, b) => {
      if (a.subjName !== b.subjName) return a.subjName.localeCompare(b.subjName);
      if (a.pred !== b.pred) return a.pred.localeCompare(b.pred);
      return a.objName.localeCompare(b.objName);
    })
    .map(r => ({
      // Use canonical names instead of IDs
      subj: r.subjName,
      pred: r.pred,
      obj: r.objName,
      confidence: r.confidence,
      extractor: r.extractor,
      qualifiers: r.qualifiers ? [...r.qualifiers].sort((a: any, b: any) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.value.localeCompare(b.value);
      }) : []
      // Exclude id, evidence - non-deterministic
    }));

  // Sort conflicts by description (relations have UUIDs)
  const sortedConflicts = [...graph.conflicts]
    .sort((a, b) => a.description.localeCompare(b.description))
    .map(c => ({
      type: c.type,
      severity: c.severity,
      description: c.description
      // Exclude relations - they contain UUIDs
    }));

  // Sort provenance by doc_id, then local_canonical
  const provenanceEntries = Array.from(graph.provenance.entries())
    .map(([localId, entry]) => ({
      doc_id: entry.doc_id,
      local_canonical: entry.local_canonical,
      global_canonical: entityById.get(entry.global_id)?.canonical || entry.global_id
    }))
    .sort((a, b) => {
      if (a.doc_id !== b.doc_id) return a.doc_id.localeCompare(b.doc_id);
      return a.local_canonical.localeCompare(b.local_canonical);
    });

  // Sort metadata doc_ids
  const sortedMetadata = {
    doc_count: graph.metadata.doc_count,
    doc_ids: [...graph.metadata.doc_ids].sort()
    // Exclude created_at, updated_at - they're volatile
  };

  return {
    entities: sortedEntities,
    relations: sortedRelations,
    conflicts: sortedConflicts,
    provenance: provenanceEntries,
    metadata: sortedMetadata
  };
}

/**
 * Hash a knowledge graph deterministically using SHA-256
 */
export function hashGraph(graph: KnowledgeGraph): string {
  const canonical = canonicalizeGraph(graph);
  const serialized = stableStringify(canonical);
  const hash = crypto.createHash('sha256');
  hash.update(serialized);
  return hash.digest('hex');
}
