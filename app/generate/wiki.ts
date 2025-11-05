/**
 * Wiki Page Generator for ARES
 * Generates Markdown pages from KnowledgeGraph
 */

import * as fs from 'fs';
import * as path from 'path';
import type { KnowledgeGraph } from '../storage/storage';
import type { Entity, Relation } from '../engine/schema';
import { recordWikiRebuild } from '../monitor/metrics';
import { logger } from '../infra/logger';

export interface WikiOptions {
  outputDir: string;
  includeProvenance?: boolean;
  includeConfidence?: boolean;
  includeEvidence?: boolean;
  project?: string;
}

/**
 * Generate wiki pages for all entities in the graph
 */
export function generateWiki(
  graph: KnowledgeGraph,
  options: WikiOptions
): void {
  const startTime = Date.now();
  const { outputDir, includeProvenance = true, includeConfidence = true, includeEvidence = true, project } = options;

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Build entity name lookup
  const entityById = new Map<string, Entity>();
  for (const entity of graph.entities) {
    entityById.set(entity.id, entity);
  }

  // Index relations by entity
  const relationsByEntity = new Map<string, Relation[]>();
  for (const relation of graph.relations) {
    if (!relationsByEntity.has(relation.subj)) {
      relationsByEntity.set(relation.subj, []);
    }
    if (!relationsByEntity.has(relation.obj)) {
      relationsByEntity.set(relation.obj, []);
    }
    relationsByEntity.get(relation.subj)!.push(relation);
    if (relation.subj !== relation.obj) {
      relationsByEntity.get(relation.obj)!.push(relation);
    }
  }

  // Generate page for each entity
  for (const entity of graph.entities) {
    const content = generateEntityPage(
      entity,
      relationsByEntity.get(entity.id) || [],
      entityById,
      graph,
      { includeProvenance, includeConfidence, includeEvidence }
    );

    const filename = sanitizeFilename(entity.canonical) + '.md';
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, content, 'utf-8');
  }

  // Generate index page
  const indexContent = generateIndexPage(graph.entities);
  fs.writeFileSync(path.join(outputDir, 'INDEX.md'), indexContent, 'utf-8');

  // Generate stats page
  const statsContent = generateStatsPage(graph);
  fs.writeFileSync(path.join(outputDir, 'STATS.md'), statsContent, 'utf-8');

  // Record metrics and timing
  const duration = Date.now() - startTime;
  recordWikiRebuild(duration);

  logger.info({
    event: 'wiki_rebuild_complete',
    project: project || 'unknown',
    ms: duration,
    entities: graph.entities.length,
    relations: graph.relations.length,
    timestamp: new Date().toISOString()
  });
}

/**
 * Generate page for a single entity
 */
function generateEntityPage(
  entity: Entity,
  relations: Relation[],
  entityById: Map<string, Entity>,
  graph: KnowledgeGraph,
  options: { includeProvenance: boolean; includeConfidence: boolean; includeEvidence: boolean }
): string {
  const sections: string[] = [];

  // Title
  sections.push(`# ${entity.canonical}\n`);

  // Metadata
  sections.push(`**Type:** ${entity.type}`);
  if (entity.aliases.length > 0) {
    sections.push(`**Aliases:** ${entity.aliases.join(', ')}`);
  }
  if (entity.centrality) {
    sections.push(`**Centrality:** ${entity.centrality.toFixed(2)}`);
  }
  sections.push('');

  // Relations
  sections.push('## Relations\n');
  if (relations.length === 0) {
    sections.push('_No relations found._\n');
  } else {
    // Group by predicate
    const byPredicate = new Map<string, Relation[]>();
    for (const rel of relations) {
      if (!byPredicate.has(rel.pred)) {
        byPredicate.set(rel.pred, []);
      }
      byPredicate.get(rel.pred)!.push(rel);
    }

    for (const [pred, rels] of Array.from(byPredicate.entries()).sort()) {
      sections.push(`### ${pred}\n`);
      for (const rel of rels) {
        const isSubject = rel.subj === entity.id;
        const otherId = isSubject ? rel.obj : rel.subj;
        const otherEntity = entityById.get(otherId);
        const otherName = otherEntity ? otherEntity.canonical : otherId;
        const filename = otherEntity ? sanitizeFilename(otherEntity.canonical) + '.md' : '#';

        const direction = isSubject ? '→' : '←';
        let line = `- ${direction} [${otherName}](${filename})`;

        if (options.includeConfidence && rel.confidence) {
          line += ` _(confidence: ${rel.confidence.toFixed(2)})_`;
        }

        sections.push(line);

        // Evidence
        if (options.includeEvidence && rel.evidence && rel.evidence.length > 0) {
          const evidence = rel.evidence[0];
          const snippet = evidence.span.text.replace(/\n/g, ' ').slice(0, 100);
          sections.push(`  > ${snippet}${snippet.length === 100 ? '...' : ''}`);
        }
      }
      sections.push('');
    }
  }

  // Provenance
  if (options.includeProvenance) {
    sections.push('## Provenance\n');
    const provenance: Array<{ doc: string; localName: string; mergedAt: string }> = [];
    for (const [localId, entry] of graph.provenance.entries()) {
      if (entry.global_id === entity.id) {
        provenance.push({
          doc: entry.doc_id,
          localName: entry.local_canonical,
          mergedAt: entry.merged_at
        });
      }
    }

    if (provenance.length === 0) {
      sections.push('_No provenance data available._\n');
    } else {
      sections.push('| Document | Local Name | Merged At |');
      sections.push('|----------|------------|-----------|');
      for (const p of provenance) {
        const date = new Date(p.mergedAt).toLocaleString();
        sections.push(`| ${p.doc} | ${p.localName} | ${date} |`);
      }
      sections.push('');
    }
  }

  return sections.join('\n');
}

/**
 * Generate index page listing all entities
 */
function generateIndexPage(entities: Entity[]): string {
  const sections: string[] = [];

  sections.push('# Entity Index\n');
  sections.push(`Total entities: ${entities.length}\n`);

  // Group by type
  const byType = new Map<string, Entity[]>();
  for (const entity of entities) {
    if (!byType.has(entity.type)) {
      byType.set(entity.type, []);
    }
    byType.get(entity.type)!.push(entity);
  }

  for (const [type, ents] of Array.from(byType.entries()).sort()) {
    sections.push(`## ${type} (${ents.length})\n`);
    const sorted = ents.sort((a, b) => a.canonical.localeCompare(b.canonical));
    for (const entity of sorted) {
      const filename = sanitizeFilename(entity.canonical) + '.md';
      sections.push(`- [${entity.canonical}](${filename})`);
    }
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Generate statistics page
 */
function generateStatsPage(graph: KnowledgeGraph): string {
  const sections: string[] = [];

  sections.push('# Knowledge Graph Statistics\n');

  // Basic counts
  sections.push('## Overview\n');
  sections.push(`- **Entities:** ${graph.entities.length}`);
  sections.push(`- **Relations:** ${graph.relations.length}`);
  sections.push(`- **Documents:** ${graph.metadata.doc_count}`);
  sections.push(`- **Conflicts:** ${graph.conflicts.length}`);
  sections.push(`- **Created:** ${new Date(graph.metadata.created_at).toLocaleString()}`);
  sections.push(`- **Updated:** ${new Date(graph.metadata.updated_at).toLocaleString()}`);
  sections.push('');

  // Entity type breakdown
  sections.push('## Entities by Type\n');
  const typeCount = new Map<string, number>();
  for (const entity of graph.entities) {
    typeCount.set(entity.type, (typeCount.get(entity.type) || 0) + 1);
  }
  sections.push('| Type | Count |');
  sections.push('|------|-------|');
  for (const [type, count] of Array.from(typeCount.entries()).sort()) {
    sections.push(`| ${type} | ${count} |`);
  }
  sections.push('');

  // Relation type breakdown
  sections.push('## Relations by Predicate\n');
  const predCount = new Map<string, number>();
  for (const rel of graph.relations) {
    predCount.set(rel.pred, (predCount.get(rel.pred) || 0) + 1);
  }
  sections.push('| Predicate | Count |');
  sections.push('|-----------|-------|');
  for (const [pred, count] of Array.from(predCount.entries()).sort()) {
    sections.push(`| ${pred} | ${count} |`);
  }
  sections.push('');

  // Top entities by relation count
  sections.push('## Most Connected Entities\n');
  const relCountByEntity = new Map<string, number>();
  for (const rel of graph.relations) {
    relCountByEntity.set(rel.subj, (relCountByEntity.get(rel.subj) || 0) + 1);
    relCountByEntity.set(rel.obj, (relCountByEntity.get(rel.obj) || 0) + 1);
  }
  const entityById = new Map(graph.entities.map(e => [e.id, e]));
  const topEntities = Array.from(relCountByEntity.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  sections.push('| Entity | Relations |');
  sections.push('|--------|-----------|');
  for (const [id, count] of topEntities) {
    const entity = entityById.get(id);
    const name = entity ? entity.canonical : id;
    const filename = entity ? sanitizeFilename(entity.canonical) + '.md' : '#';
    sections.push(`| [${name}](${filename}) | ${count} |`);
  }
  sections.push('');

  return sections.join('\n');
}

/**
 * Sanitize filename for wiki pages
 */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
