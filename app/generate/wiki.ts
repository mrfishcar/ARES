/**
 * Wiki Page Generator for ARES
 * Generates Markdown pages from KnowledgeGraph
 */

import * as fs from 'fs';
import * as path from 'path';
import type { KnowledgeGraph } from '../storage/storage';
import type { Entity, EntityType, Relation } from '../engine/schema';
import { recordWikiRebuild } from '../monitor/metrics';
import { logger } from '../infra/logger';
import { generateMarkdownPage } from './markdown';
import { HERTQuery } from '../api/hert-query';
import { buildEntityFactProfile } from './entity-fact-profile';
import { buildOrgSummary, buildPersonSummary, buildPlaceSummary } from './wiki-templates';
import { getParagraphText } from './evidence';

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

  // Generate page for each entity
  for (const entity of graph.entities) {
    const conflicts: any[] = (graph as any).conflicts ?? [];
    const content = generateMarkdownPage(
      entity.id,
      graph.entities,
      graph.relations,
      conflicts
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

export function buildEntityWikiFromGraph(
  entityId: string,
  graph: KnowledgeGraph
): string {
  const conflicts: any[] = (graph as any).conflicts ?? [];
  return generateMarkdownPage(
    entityId,
    graph.entities,
    graph.relations,
    conflicts
  );
}

function renderTemplateSummary(profileType: EntityType | string, profile: ReturnType<typeof buildEntityFactProfile>): string {
  const normalized = profileType.toString().toUpperCase();
  if (normalized === 'PERSON') {
    return buildPersonSummary(profile);
  }
  if (normalized === 'PLACE') {
    return buildPlaceSummary(profile);
  }
  if (normalized === 'ORG' || normalized === 'ORGANIZATION') {
    return buildOrgSummary(profile);
  }
  return `${profile.core.canonical} — summary templates not implemented.`;
}

export function renderEntityMarkdown(
  entityId: string,
  graph: KnowledgeGraph
): string {
  const entity = graph.entities.find((e) => e.id === entityId);
  if (!entity) {
    return '# Entity not found\n';
  }

  const queryAPI = new HERTQuery();
  queryAPI.loadRelations(graph.relations, graph.entities);

  const fallbackResult = queryAPI
    .findEntityByName(entity.canonical, { fuzzy: true, type: entity.type as EntityType })
    .sort((a, b) => a.canonical.localeCompare(b.canonical))[0];

  const eid = entity.eid ?? fallbackResult?.eid;

  if (eid === undefined) {
    return [
      `# ${entity.canonical}`,
      '',
      '| Field | Value |',
      '|-------|-------|',
      `| Type | ${entity.type} |`,
      `| Aliases | ${(entity.aliases || []).join(', ') || '—'} |`,
      ''
    ].join('\\n');
  }

  const profile = buildEntityFactProfile(eid, queryAPI);
  const lines: string[] = [];

  lines.push(`# ${profile.core.canonical}`);
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| Type | ${profile.core.type} |`);
  lines.push(`| Aliases | ${(profile.core.aliases.length ? profile.core.aliases.join(', ') : '—')} |`);
  lines.push(`| Mentions | ${profile.stats.mentionCount} |`);
  lines.push(`| Documents | ${profile.stats.documentCount} |`);
  lines.push(`| Relationships | ${profile.stats.relationshipCount} |`);
  lines.push('');

  const summary = renderTemplateSummary(profile.core.type, profile);
  if (summary) {
    lines.push(summary);
    lines.push('');
  }

  lines.push('## Key Mentions');
  lines.push('');
  if (profile.keyMentions.length === 0) {
    lines.push('_No key mentions available._');
  } else {
    for (const mention of profile.keyMentions) {
      const paragraph = getParagraphText(mention.document_id, mention.location.paragraph);
      const label = `Document ${mention.document_id}, paragraph ${mention.location.paragraph}`;
      if (paragraph) {
        lines.push(`- ${label}: ${paragraph}`);
      } else {
        lines.push(`- ${label}`);
      }
    }
  }
  lines.push('');

  lines.push('## Relations');
  lines.push('');
  const relationPredicates = Object.keys(profile.relations).sort();
  if (relationPredicates.length === 0) {
    lines.push('_No relations available._');
  } else {
    for (const predicate of relationPredicates) {
      lines.push(`### ${predicate}`);
      const rels = profile.relations[predicate];
      for (const rel of rels) {
        const confidence = rel.confidence !== undefined ? rel.confidence.toFixed(2) : 'N/A';
        lines.push(
          `- ${rel.subj_canonical} —${rel.pred}→ ${rel.obj_canonical} (confidence: ${confidence}, evidence: ${rel.evidence_count})`
        );
      }
      lines.push('');
    }
  }

  lines.push('## Co-occurrences');
  lines.push('');
  if (profile.cooccurrences.length === 0) {
    lines.push('_No co-occurrences available._');
  } else {
    for (const co of profile.cooccurrences) {
      lines.push(
        `- ${co.entity2_canonical} (together ${co.cooccurrence_count} times across ${co.documents.length} documents)`
      );
    }
  }
  lines.push('');

  return lines.join('\\n');
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
