/**
 * Entity Digest Composer - Sprint W1
 * Composes readable entity digests from seeds and notes with full citation tracking
 */

import * as fs from 'fs';
import * as path from 'path';
import type { KnowledgeGraph } from '../storage/storage';
import type { Entity, Relation } from '../engine/schema';
import { loadGraph } from '../storage/storage';
import { logger } from '../infra/logger';

export interface CitationRef {
  seedId: string;
  docId: string;
  quote: string;
}

export interface DigestSection {
  title: string;
  markdown: string;
  citations: CitationRef[];
}

export interface DigestStats {
  seedCount: number;
  noteCount: number;
  relationCount: number;
  temporalEventCount: number;
}

export interface EntityDigest {
  entityId: string;
  entityName: string;
  sections: DigestSection[];
  generatedAt: string;
  stats: DigestStats;
}

export interface DigestOptions {
  brevity?: 'concise' | 'detailed';
  tone?: 'formal' | 'casual';
  includeSummary?: boolean;
  includeTimeline?: boolean;
  includeRelationships?: boolean;
  includeQuotes?: boolean;
}

interface Seed {
  id: string;
  entityId: string;
  docId: string;
  span: {
    start: number;
    end: number;
    text: string;
  };
  quote: string;
  addedBy: string;
  addedAt: string;
  removed: boolean;
}

interface Note {
  id: string;
  project: string;
  title?: string;
  markdown: string;
  attachments: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Load seeds for an entity
 */
function loadSeeds(project: string, entityId: string): Seed[] {
  try {
    const seedsPath = path.join(process.cwd(), 'data', 'projects', project, 'seeds', `${entityId}.json`);
    if (!fs.existsSync(seedsPath)) {
      return [];
    }

    const content = fs.readFileSync(seedsPath, 'utf-8');
    const seeds: Seed[] = JSON.parse(content);

    // Filter out removed seeds
    return seeds.filter(s => !s.removed);
  } catch (error) {
    logger.error({ event: 'load_seeds_error', entityId, error });
    return [];
  }
}

/**
 * Load all notes for a project
 */
function loadNotes(project: string): Note[] {
  try {
    const notesDir = path.join(process.cwd(), 'data', 'projects', project, 'notes');
    if (!fs.existsSync(notesDir)) {
      return [];
    }

    const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.json'));
    const notes: Note[] = [];

    for (const file of files) {
      const filePath = path.join(notesDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const note: Note = JSON.parse(content);
      notes.push(note);
    }

    return notes;
  } catch (error) {
    logger.error({ event: 'load_notes_error', project, error });
    return [];
  }
}

/**
 * Find notes that mention an entity
 */
function findNotesAboutEntity(notes: Note[], entityName: string): Note[] {
  const mentioningNotes: Note[] = [];

  for (const note of notes) {
    // Check for entity tags [[Entity: name]]
    const entityTagRegex = new RegExp(`\\[\\[Entity:\\s*${escapeRegex(entityName)}\\s*\\]\\]`, 'i');

    // Check for simple mentions of the entity name
    const simpleMention = new RegExp(`\\b${escapeRegex(entityName)}\\b`, 'i');

    if (entityTagRegex.test(note.markdown) || simpleMention.test(note.markdown)) {
      mentioningNotes.push(note);
    }
  }

  return mentioningNotes;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compose entity digest from seeds and notes
 */
export function composeEntityDigest(
  project: string,
  entityId: string,
  options: DigestOptions = {}
): EntityDigest {
  const startTime = Date.now();

  // Set defaults
  const {
    includeSummary = true,
    includeTimeline = true,
    includeRelationships = true,
    includeQuotes = true,
    brevity = 'detailed',
    tone = 'formal',
  } = options;

  // Load graph
  const graphPath = path.join(process.cwd(), 'data', 'projects', project, 'graph.json');
  const graph = loadGraph(graphPath);

  if (!graph) {
    throw new Error(`Graph not found for project ${project}`);
  }

  // Find entity
  const entity = graph.entities.find(e => e.id === entityId);
  if (!entity) {
    throw new Error(`Entity ${entityId} not found`);
  }

  // Load seeds and notes
  const seeds = loadSeeds(project, entityId);
  const allNotes = loadNotes(project);
  const relevantNotes = findNotesAboutEntity(allNotes, entity.canonical);

  // Find relations
  const relations = graph.relations.filter(
    r => r.subj === entityId || r.obj === entityId
  );

  // Find temporal events (if available)
  const temporalEvents: any[] = []; // TODO: Load from temporal store when available

  // Compose sections
  const sections: DigestSection[] = [];

  if (includeSummary) {
    const summarySection = composeSummarySection(entity, seeds, relevantNotes, brevity);
    if (summarySection) {
      sections.push(summarySection);
    }
  }

  if (includeRelationships && relations.length > 0) {
    const relationsSection = composeRelationshipsSection(entity, relations, graph, seeds);
    if (relationsSection) {
      sections.push(relationsSection);
    }
  }

  if (includeQuotes && seeds.length > 0) {
    const quotesSection = composeQuotesSection(seeds, brevity);
    if (quotesSection) {
      sections.push(quotesSection);
    }
  }

  if (includeTimeline && temporalEvents.length > 0) {
    const timelineSection = composeTimelineSection(temporalEvents, seeds);
    if (timelineSection) {
      sections.push(timelineSection);
    }
  }

  const digest: EntityDigest = {
    entityId,
    entityName: entity.canonical,
    sections,
    generatedAt: new Date().toISOString(),
    stats: {
      seedCount: seeds.length,
      noteCount: relevantNotes.length,
      relationCount: relations.length,
      temporalEventCount: temporalEvents.length,
    },
  };

  const duration = Date.now() - startTime;
  logger.info({
    event: 'digest_composed',
    project,
    entityId,
    entityName: entity.canonical,
    sections: sections.length,
    ms: duration,
  });

  return digest;
}

/**
 * Compose Summary section from seeds and notes
 */
function composeSummarySection(
  entity: Entity,
  seeds: Seed[],
  notes: Note[],
  brevity: 'concise' | 'detailed'
): DigestSection | null {
  const citations: CitationRef[] = [];
  const lines: string[] = [];

  // Basic entity info
  lines.push(`${entity.canonical} is ${getArticle(entity.type)} ${entity.type}.`);

  // Add aliases if available
  if (entity.aliases.length > 0) {
    const aliasText = brevity === 'concise'
      ? `Also known as: ${entity.aliases.slice(0, 3).join(', ')}.`
      : `Also known as: ${entity.aliases.join(', ')}.`;
    lines.push(aliasText);
  }

  // Extract key quotes from seeds
  const maxSeeds = brevity === 'concise' ? 2 : 4;
  for (let i = 0; i < Math.min(maxSeeds, seeds.length); i++) {
    const seed = seeds[i];

    // Add citation
    citations.push({
      seedId: seed.id,
      docId: seed.docId,
      quote: seed.quote,
    });

    // Add quote snippet
    const snippet = seed.quote.length > 150
      ? seed.quote.slice(0, 147) + '...'
      : seed.quote;

    lines.push(`"${snippet}"`);
  }

  // Extract insights from notes
  if (notes.length > 0 && brevity === 'detailed') {
    const noteInsights = extractNoteInsights(notes, entity.canonical);
    if (noteInsights.length > 0) {
      lines.push('');
      lines.push('**Additional notes:**');
      noteInsights.forEach(insight => lines.push(`- ${insight}`));
    }
  }

  return {
    title: 'Summary',
    markdown: lines.join('\n\n'),
    citations,
  };
}

/**
 * Compose Relationships section from relations
 */
function composeRelationshipsSection(
  entity: Entity,
  relations: Relation[],
  graph: KnowledgeGraph,
  seeds: Seed[]
): DigestSection | null {
  const citations: CitationRef[] = [];
  const lines: string[] = [];

  // Build entity lookup
  const entityById = new Map(graph.entities.map(e => [e.id, e]));

  // Group relations by predicate
  const byPredicate = new Map<string, Relation[]>();
  for (const rel of relations) {
    if (!byPredicate.has(rel.pred)) {
      byPredicate.set(rel.pred, []);
    }
    byPredicate.get(rel.pred)!.push(rel);
  }

  // Compose relationship descriptions
  for (const [pred, rels] of Array.from(byPredicate.entries()).sort()) {
    const relLines: string[] = [];

    for (const rel of rels.slice(0, 5)) {
      const isSubject = rel.subj === entity.id;
      const otherId = isSubject ? rel.obj : rel.subj;
      const otherEntity = entityById.get(otherId);

      if (!otherEntity) continue;

      const description = isSubject
        ? `${entity.canonical} ${pred.toLowerCase()} ${otherEntity.canonical}`
        : `${otherEntity.canonical} ${pred.toLowerCase()} ${entity.canonical}`;

      relLines.push(`- ${description}`);

      // Add citation from relation evidence if available
      if (rel.evidence && rel.evidence.length > 0) {
        const evidence = rel.evidence[0];
        citations.push({
          seedId: rel.id, // Use relation ID as seed ID
          docId: evidence.doc_id,
          quote: evidence.span.text,
        });
      }
    }

    if (relLines.length > 0) {
      lines.push(`**${pred}:**`);
      lines.push(...relLines);
      lines.push('');
    }
  }

  if (lines.length === 0) {
    return null;
  }

  return {
    title: 'Relationships',
    markdown: lines.join('\n'),
    citations,
  };
}

/**
 * Compose Quotes section from seeds
 */
function composeQuotesSection(
  seeds: Seed[],
  brevity: 'concise' | 'detailed'
): DigestSection | null {
  if (seeds.length === 0) {
    return null;
  }

  const citations: CitationRef[] = [];
  const lines: string[] = [];

  const maxQuotes = brevity === 'concise' ? 3 : seeds.length;

  for (let i = 0; i < Math.min(maxQuotes, seeds.length); i++) {
    const seed = seeds[i];

    citations.push({
      seedId: seed.id,
      docId: seed.docId,
      quote: seed.quote,
    });

    lines.push(`> ${seed.quote}`);
    lines.push(`— *${seed.docId}*`);
    lines.push('');
  }

  return {
    title: 'Notable Quotes',
    markdown: lines.join('\n'),
    citations,
  };
}

/**
 * Compose Timeline section from temporal events
 */
function composeTimelineSection(
  events: any[],
  seeds: Seed[]
): DigestSection | null {
  // TODO: Implement when temporal events are available
  return null;
}

/**
 * Extract insights from notes mentioning the entity
 */
function extractNoteInsights(notes: Note[], entityName: string): string[] {
  const insights: string[] = [];

  for (const note of notes.slice(0, 3)) {
    // Extract sentences containing the entity name
    const sentences = note.markdown.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (sentence.toLowerCase().includes(entityName.toLowerCase()) && sentence.trim().length > 20) {
        insights.push(sentence.trim());
        if (insights.length >= 3) break;
      }
    }
    if (insights.length >= 3) break;
  }

  return insights;
}

/**
 * Get grammatical article for a type
 */
function getArticle(type: string): string {
  const vowels = ['A', 'E', 'I', 'O', 'U'];
  return vowels.includes(type[0]) ? 'an' : 'a';
}
