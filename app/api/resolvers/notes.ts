/**
 * Notes Resolvers - Sprint R7
 * Markdown notes with entity tagging [[Entity: name]] and [[NewEntity: name|type=TYPE]]
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { incrementCounter } from '../../monitor/metrics';
import { loadGraph, saveGraph, createEmptyGraph, appendDoc } from '../../storage/storage';
import type { EntityType } from '../../engine/schema';

interface Note {
  id: string;
  project: string;
  title?: string;
  markdown: string;
  attachments: string[];
  createdAt: string;
  updatedAt: string;
}

interface NoteInput {
  title?: string;
  markdown: string;
  attachments?: string[];
}

interface NoteConnection {
  nodes: Note[];
  pageInfo: {
    endCursor: string | null;
    hasNextPage: boolean;
  };
  totalApprox: number;
}

/**
 * Get notes directory for a project
 */
function getNotesDir(project: string): string {
  const notesDir = path.join(process.cwd(), 'data', 'projects', project, 'notes');
  if (!fs.existsSync(notesDir)) {
    fs.mkdirSync(notesDir, { recursive: true });
  }
  return notesDir;
}

/**
 * Get note file path
 */
function getNoteFilePath(project: string, id: string): string {
  return path.join(getNotesDir(project), `${id}.json`);
}

/**
 * Load note from disk
 */
function loadNote(project: string, id: string): Note | null {
  const filePath = getNoteFilePath(project, id);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Failed to load note ${id}:`, error);
    return null;
  }
}

/**
 * Save note to disk
 */
function saveNote(note: Note): void {
  const filePath = getNoteFilePath(note.project, note.id);
  fs.writeFileSync(filePath, JSON.stringify(note, null, 2));
}

/**
 * Delete note from disk
 */
function deleteNote(project: string, id: string): boolean {
  const filePath = getNoteFilePath(project, id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

/**
 * List all notes for a project
 */
function listAllNotes(project: string): Note[] {
  const notesDir = getNotesDir(project);
  const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.json'));

  const notes: Note[] = [];
  for (const file of files) {
    const id = file.replace('.json', '');
    const note = loadNote(project, id);
    if (note) {
      notes.push(note);
    }
  }

  // Sort by updatedAt descending (newest first)
  return notes.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Parse entity tags from markdown
 * Formats:
 * - [[Entity: Aragorn]] - reference existing entity
 * - [[NewEntity: Éowyn|type=PERSON]] - create new entity candidate
 * - #Aragorn:PERSON - hashtag format (new entities)
 * - #Shire:PLACE - hashtag format (new entities)
 */
interface EntityTag {
  type: 'existing' | 'new';
  name: string;
  entityType?: string;
  position: number;
}

function parseEntityTags(markdown: string): EntityTag[] {
  const tags: EntityTag[] = [];

  // Match [[Entity: name]] or [[NewEntity: name|type=TYPE]]
  const bracketRegex = /\[\[(Entity|NewEntity):\s*([^\]|]+)(\|type=([A-Z]+))?\]\]/g;

  let match;
  while ((match = bracketRegex.exec(markdown)) !== null) {
    const [, tagType, name, , entityType] = match;
    tags.push({
      type: tagType === 'Entity' ? 'existing' : 'new',
      name: name.trim(),
      entityType: entityType?.trim(),
      position: match.index,
    });
  }

  // Also match hashtag format: #Name:TYPE
  const hashtagRegex = /#([A-Za-z][A-Za-z0-9\s]+):([A-Z]+)/g;

  while ((match = hashtagRegex.exec(markdown)) !== null) {
    const [, name, entityType] = match;
    tags.push({
      type: 'new',
      name: name.trim(),
      entityType: entityType.trim(),
      position: match.index,
    });
  }

  return tags;
}

/**
 * Count how many times each entity is mentioned in the markdown
 */
function countEntityMentions(markdown: string, entityName: string, entityType: string): number {
  // Count both hashtag and bracket formats
  const hashtagPattern = new RegExp(`#${entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:${entityType}`, 'gi');
  const bracketPattern = new RegExp(`\\[\\[(?:New)?Entity:\\s*${entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\|type=${entityType})?\\]\\]`, 'gi');

  const hashtagMatches = (markdown.match(hashtagPattern) || []).length;
  const bracketMatches = (markdown.match(bracketPattern) || []).length;

  return hashtagMatches + bracketMatches;
}

/**
 * Process entity tags and create entities in the knowledge graph
 */
function processEntityTags(project: string, markdown: string, docId: string): void {
  const tags = parseEntityTags(markdown);

  if (tags.length === 0) {
    return; // No tags to process
  }

  // Get path to graph.json
  const graphPath = path.join(process.cwd(), 'data', 'projects', project, 'graph.json');

  // Load or create graph
  let graph = loadGraph(graphPath);
  if (!graph) {
    console.log(`[Notes] Creating new graph for project: ${project}`);
    graph = createEmptyGraph();
  }

  // Track if we made any changes
  let hasChanges = false;

  // Process each tag (deduplicate first)
  const uniqueTags = Array.from(
    new Map(tags.map(t => [`${t.name}-${t.entityType}`, t])).values()
  );

  for (const tag of uniqueTags) {
    if (tag.type === 'new') {
      const requestedType = (tag.entityType || 'CONCEPT').toUpperCase();
      const allowedTypes: EntityType[] = ['PERSON','ORG','PLACE','DATE','WORK','ITEM','SPECIES','HOUSE','TRIBE','TITLE','EVENT'];
      const entityType: EntityType = allowedTypes.includes(requestedType as EntityType)
        ? (requestedType as EntityType)
        : 'WORK';
      const entityName = tag.name;

      // Check if entity already exists (case-insensitive match on canonical name)
      const existingEntity = graph.entities.find(e =>
        e.canonical.toLowerCase() === entityName.toLowerCase() &&
        e.type === entityType
      );

      // Count mentions in this markdown
      const mentionCount = countEntityMentions(markdown, entityName, entityType);

      if (existingEntity) {
        // Update mention count for existing entity
        const currentCount = (existingEntity as any).mention_count || 0;
        (existingEntity as any).mention_count = currentCount + mentionCount;
        hasChanges = true;
        console.log(`[Notes] Updated entity: ${entityName} (${entityType}) - mentions: ${(existingEntity as any).mention_count}`);
      } else {
        // Generate unique ID
        const entityId = `${project}_${entityType.toLowerCase()}_${graph.entities.length}`;

        // Create new entity with mention count
        const newEntity = {
          id: entityId,
          type: entityType,
          canonical: entityName,
          aliases: [],
          created_at: new Date().toISOString(),
          centrality: 0,
          mention_count: mentionCount
        };

        graph.entities.push(newEntity);
        hasChanges = true;

        console.log(`[Notes] Created entity: ${entityName} (${entityType}) with ID: ${entityId} - mentions: ${mentionCount}`);
        incrementCounter('review_queued_total');
      }
    }
  }

  // Save graph if we made changes
  if (hasChanges) {
    graph.metadata.updated_at = new Date().toISOString();
    saveGraph(graph, graphPath);
    console.log(`[Notes] Saved graph with ${graph.entities.length} entities`);
  }
}

/**
 * Validate project name (no path traversal)
 */
function validateProject(project: string): void {
  if (project.includes('..') || project.includes('/') || project.includes('\\')) {
    throw new Error('Invalid project name');
  }
}

export const notesResolvers = {
  Query: {
    /**
     * List notes with pagination
     */
    listNotes: (
      _: any,
      args: { project: string; after?: string; limit?: number }
    ): NoteConnection => {
      validateProject(args.project);

      const limit = Math.min(args.limit || 50, 200);
      const allNotes = listAllNotes(args.project);

      let startIndex = 0;
      if (args.after) {
        // Find note after cursor
        const afterIndex = allNotes.findIndex(n => n.id === args.after);
        startIndex = afterIndex >= 0 ? afterIndex + 1 : 0;
      }

      const notes = allNotes.slice(startIndex, startIndex + limit);
      const hasMore = startIndex + limit < allNotes.length;

      incrementCounter('api_list_notes_total');

      return {
        nodes: notes,
        pageInfo: {
          endCursor: notes.length > 0 ? notes[notes.length - 1].id : null,
          hasNextPage: hasMore,
        },
        totalApprox: allNotes.length,
      };
    },

    /**
     * Get a single note by ID
     */
    getNote: (_: any, args: { id: string }): Note | null => {
      // Find note across all projects
      const projectsDir = path.join(process.cwd(), 'data', 'projects');
      if (!fs.existsSync(projectsDir)) {
        return null;
      }

      const projects = fs.readdirSync(projectsDir);
      for (const project of projects) {
        const note = loadNote(project, args.id);
        if (note) {
          incrementCounter('api_get_note_total');
          return note;
        }
      }

      return null;
    },
  },

  Mutation: {
    /**
     * Create a new note (parses entity tags)
     */
    createNote: async (
      _: any,
      args: { project: string; input: NoteInput }
    ): Promise<Note> => {
      validateProject(args.project);

      const now = new Date().toISOString();
      const id = uuidv4();

      const note: Note = {
        id,
        project: args.project,
        title: args.input.title,
        markdown: args.input.markdown,
        attachments: args.input.attachments || [],
        createdAt: now,
        updatedAt: now,
      };

      saveNote(note);

      // Process entity tags and enqueue candidates
      processEntityTags(args.project, args.input.markdown, id);

      // Run full extraction pipeline so entities/relations appear without manual tags
      const docText = note.title?.trim()
        ? `# ${note.title}\n\n${note.markdown}`
        : note.markdown;

      if (docText.trim().length > 0) {
        const projectDir = path.join(process.cwd(), 'data', 'projects', args.project);
        const graphPath = path.join(projectDir, 'graph.json');

        try {
          // Ensure project directory exists for graph persistence
          fs.mkdirSync(projectDir, { recursive: true });

          await appendDoc(`note:${id}`, docText, graphPath);
        } catch (error) {
          console.error(`[Notes] Failed to extract note ${id}:`, error);
        }
      }

      incrementCounter('notes_created_total');

      return note;
    },

    /**
     * Update an existing note (parses entity tags)
     */
    updateNote: (
      _: any,
      args: { id: string; input: NoteInput }
    ): Note => {
      // Find the note across all projects
      const projectsDir = path.join(process.cwd(), 'data', 'projects');
      if (!fs.existsSync(projectsDir)) {
        throw new Error('Note not found');
      }

      const projects = fs.readdirSync(projectsDir);
      let existingNote: Note | null = null;

      for (const project of projects) {
        const note = loadNote(project, args.id);
        if (note) {
          existingNote = note;
          break;
        }
      }

      if (!existingNote) {
        throw new Error('Note not found');
      }

      const updatedNote: Note = {
        ...existingNote,
        title: args.input.title !== undefined ? args.input.title : existingNote.title,
        markdown: args.input.markdown,
        attachments: args.input.attachments || existingNote.attachments,
        updatedAt: new Date().toISOString(),
      };

      saveNote(updatedNote);

      // Process entity tags (idempotent - only adds new tags)
      processEntityTags(existingNote.project, args.input.markdown, args.id);

      incrementCounter('notes_updated_total');

      return updatedNote;
    },

    /**
     * Delete a note
     */
    deleteNote: (_: any, args: { id: string }): boolean => {
      const projectsDir = path.join(process.cwd(), 'data', 'projects');
      if (!fs.existsSync(projectsDir)) {
        return false;
      }

      const projects = fs.readdirSync(projectsDir);
      for (const project of projects) {
        if (deleteNote(project, args.id)) {
          incrementCounter('notes_deleted_total');
          return true;
        }
      }

      return false;
    },
  },
};
