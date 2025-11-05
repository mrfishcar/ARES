/**
 * Alias Brain - Sprint S3
 * Project-level alias dictionary for entity recognition
 *
 * Provides:
 * - Alias index (build, lookup, persist)
 * - Client alias pass (Pass 0 - check text against alias dict before highlighting)
 * - Live sync with version tracking
 * - Longest-match priority
 */

import * as fs from 'fs';
import * as path from 'path';
import type { EntityType } from './entityHighlighter';

export interface AliasEntry {
  entityId: string;
  entityName: string;
  alias: string;
  type: EntityType;
  confidence: number;
  confirmedAt: string;
}

export interface AliasIndex {
  version: number;
  aliases: AliasEntry[];
  updatedAt: string;
}

export interface AliasMatch {
  start: number;
  end: number;
  text: string;
  entityId: string;
  entityName: string;
  type: EntityType;
  confidence: number;
  source: 'alias';
}

/**
 * Get alias index path for a project
 */
function getAliasIndexPath(project: string): string {
  const projectDir = path.join(process.cwd(), 'data', 'projects', project);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  return path.join(projectDir, 'aliases.json');
}

/**
 * Load alias index for a project
 */
export function loadAliasIndex(project: string): AliasIndex {
  const aliasPath = getAliasIndexPath(project);

  if (!fs.existsSync(aliasPath)) {
    const index: AliasIndex = {
      version: 0,
      aliases: [],
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(aliasPath, JSON.stringify(index, null, 2));
    return index;
  }

  const content = fs.readFileSync(aliasPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Save alias index for a project
 */
export function saveAliasIndex(project: string, index: AliasIndex): void {
  const aliasPath = getAliasIndexPath(project);
  index.updatedAt = new Date().toISOString();
  fs.writeFileSync(aliasPath, JSON.stringify(index, null, 2));
}

/**
 * Bump alias version (call when alias confirmed/rejected)
 */
export function bumpAliasVersion(project: string): number {
  const index = loadAliasIndex(project);
  index.version += 1;
  saveAliasIndex(project, index);
  return index.version;
}

/**
 * Add alias to index
 */
export function addAlias(
  project: string,
  entityId: string,
  entityName: string,
  alias: string,
  type: EntityType,
  confidence: number = 1.0
): void {
  const index = loadAliasIndex(project);

  // Check if alias already exists
  const existing = index.aliases.find(
    (a) => a.entityId === entityId && a.alias.toLowerCase() === alias.toLowerCase()
  );

  if (existing) {
    // Update existing alias
    existing.type = type;
    existing.confidence = confidence;
    existing.confirmedAt = new Date().toISOString();
  } else {
    // Add new alias
    const entry: AliasEntry = {
      entityId,
      entityName,
      alias,
      type,
      confidence,
      confirmedAt: new Date().toISOString(),
    };
    index.aliases.push(entry);
  }

  // Bump version
  index.version += 1;

  saveAliasIndex(project, index);
}

/**
 * Remove alias from index
 */
export function removeAlias(project: string, entityId: string, alias: string): void {
  const index = loadAliasIndex(project);

  // Remove alias
  index.aliases = index.aliases.filter(
    (a) => !(a.entityId === entityId && a.alias.toLowerCase() === alias.toLowerCase())
  );

  // Bump version
  index.version += 1;

  saveAliasIndex(project, index);
}

/**
 * Build alias index from knowledge graph (call on project load)
 */
export function buildAliasIndex(project: string): void {
  const graphPath = path.join(process.cwd(), 'data', 'projects', project, 'graph.json');

  if (!fs.existsSync(graphPath)) {
    return;
  }

  const graphData = fs.readFileSync(graphPath, 'utf-8');
  const graph = JSON.parse(graphData);

  const index: AliasIndex = {
    version: 0,
    aliases: [],
    updatedAt: new Date().toISOString(),
  };

  // Extract aliases from entities
  for (const entity of graph.entities || []) {
    const entityId = entity.id;
    const entityName = entity.canonical || entity.name;
    const type = Array.isArray(entity.type) ? entity.type[0] : entity.type;
    const aliases = entity.aliases || [];

    // Add canonical name as alias with highest priority
    if (entityName) {
      index.aliases.push({
        entityId,
        entityName,
        alias: entityName,
        type,
        confidence: 1.0, // Canonical name gets full confidence
        confirmedAt: new Date().toISOString(), // Update timestamp for fresh confidence
      });
    }

    // Add all aliases
    for (const alias of aliases) {
      index.aliases.push({
        entityId,
        entityName,
        alias,
        type,
        confidence: 1.0,
        confirmedAt: entity.createdAt || new Date().toISOString(),
      });
    }
  }

  saveAliasIndex(project, index);
}

/**
 * Pass 0: Alias lookup pass
 * Check text against alias dictionary before pattern-based highlighting
 * Returns matches sorted by longest-match priority
 */
export function aliasPass(text: string, project: string): AliasMatch[] {
  const index = loadAliasIndex(project);
  const matches: AliasMatch[] = [];

  // Sort aliases by length (longest first) for longest-match priority
  const sortedAliases = [...index.aliases].sort((a, b) => b.alias.length - a.alias.length);

  for (const entry of sortedAliases) {
    const aliasPattern = new RegExp(`\\b${escapeRegex(entry.alias)}\\b`, 'gi');
    let match;

    while ((match = aliasPattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // Check if this match overlaps with existing matches
      const overlaps = matches.some((m) => {
        return (start >= m.start && start < m.end) || (end > m.start && end <= m.end);
      });

      if (!overlaps) {
        matches.push({
          start,
          end,
          text: match[0],
          entityId: entry.entityId,
          entityName: entry.entityName,
          type: entry.type,
          confidence: entry.confidence,
          source: 'alias',
        });
      }
    }
  }

  // Sort matches by position
  return matches.sort((a, b) => a.start - b.start);
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get alias version for a project (for client cache invalidation)
 */
export function getAliasVersion(project: string): number {
  const index = loadAliasIndex(project);
  return index.version;
}

/**
 * Get all aliases for an entity
 */
export function getEntityAliases(project: string, entityId: string): string[] {
  const index = loadAliasIndex(project);
  return index.aliases
    .filter((a) => a.entityId === entityId)
    .map((a) => a.alias);
}
