/**
 * Entity Mentions Resolvers - Sprint W2
 * Track and manage entity mentions detected in notes
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { incrementCounter, bumpHeartbeat } from '../../monitor/metrics';
import { recordEntityAction } from '../../storage/progress';
import { logger } from '../../infra/logger';

interface EntityMention {
  id: string;
  noteId: string;
  projectId: string;
  text: string;
  type: string;
  confidence: number;
  status: 'pending' | 'confirmed' | 'rejected';
  start: number;
  end: number;
  createdAt: string;
  confirmedAt?: string;
}

interface EntityMentionStats {
  detected: number;
  confirmed: number;
  rejected: number;
  pending: number;
}

/**
 * Get mentions file path for a project
 */
function getMentionsFilePath(project: string): string {
  const mentionsDir = path.join(process.cwd(), 'data', 'projects', project, 'mentions');
  if (!fs.existsSync(mentionsDir)) {
    fs.mkdirSync(mentionsDir, { recursive: true });
  }
  return path.join(mentionsDir, 'mentions.json');
}

/**
 * Load all mentions for a project
 */
function loadMentions(project: string): EntityMention[] {
  try {
    const filePath = getMentionsFilePath(project);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    logger.error({ event: 'load_mentions_error', project, error });
    return [];
  }
}

/**
 * Save mentions for a project
 */
function saveMentions(project: string, mentions: EntityMention[]): void {
  try {
    const filePath = getMentionsFilePath(project);
    fs.writeFileSync(filePath, JSON.stringify(mentions, null, 2));
  } catch (error) {
    logger.error({ event: 'save_mentions_error', project, error });
    throw new Error('Failed to save mentions');
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

export const entityMentionsResolvers = {
  Query: {
    /**
     * Get entity mentions for a note
     */
    getEntityMentions: (_: any, args: { noteId: string }): EntityMention[] => {
      // Find project containing this note
      const projectsDir = path.join(process.cwd(), 'data', 'projects');
      if (!fs.existsSync(projectsDir)) {
        return [];
      }

      const projects = fs.readdirSync(projectsDir);
      for (const project of projects) {
        const mentions = loadMentions(project);
        const noteMentions = mentions.filter(m => m.noteId === args.noteId);
        if (noteMentions.length > 0) {
          incrementCounter('api_get_entity_mentions_total');
          return noteMentions;
        }
      }

      return [];
    },

    /**
     * Get entity mention statistics for a project
     */
    getEntityMentionStats: (_: any, args: { project: string }): EntityMentionStats => {
      validateProject(args.project);

      const mentions = loadMentions(args.project);

      const stats: EntityMentionStats = {
        detected: mentions.length,
        confirmed: mentions.filter(m => m.status === 'confirmed').length,
        rejected: mentions.filter(m => m.status === 'rejected').length,
        pending: mentions.filter(m => m.status === 'pending').length,
      };

      incrementCounter('api_get_mention_stats_total');

      return stats;
    },
  },

  Mutation: {
    /**
     * Confirm an entity mention
     */
    confirmEntityMention: (
      _: any,
      args: { project: string; noteId: string; entityName: string; type: string }
    ): EntityMention => {
      validateProject(args.project);

      const mentions = loadMentions(args.project);

      // Find or create mention
      let mention = mentions.find(
        m => m.noteId === args.noteId && m.text === args.entityName && m.status === 'pending'
      );

      if (!mention) {
        // Create new mention if not found
        mention = {
          id: uuidv4(),
          noteId: args.noteId,
          projectId: args.project,
          text: args.entityName,
          type: args.type,
          confidence: 1.0, // User confirmed, so confidence is 100%
          status: 'confirmed',
          start: 0, // Would need to be passed from frontend
          end: 0,
          createdAt: new Date().toISOString(),
          confirmedAt: new Date().toISOString(),
        };
        mentions.push(mention);
      } else {
        // Update existing mention
        mention.status = 'confirmed';
        mention.type = args.type;
        mention.confirmedAt = new Date().toISOString();
      }

      saveMentions(args.project, mentions);

      // Update progress (gamification)
      try {
        recordEntityAction(args.project, 'entity_created');
      } catch (error) {
        logger.warn({ event: 'progress_update_failed', project: args.project, error });
      }

      // Bump heartbeat to notify UI
      bumpHeartbeat();

      // Track metrics
      incrementCounter('entity_mentions_confirmed_total');

      logger.info({
        event: 'entity_mention_confirmed',
        project: args.project,
        noteId: args.noteId,
        entityName: args.entityName,
        type: args.type,
      });

      return mention;
    },

    /**
     * Update entity mention type
     */
    updateEntityMentionType: (
      _: any,
      args: { id: string; newType: string }
    ): EntityMention => {
      // Find mention across all projects
      const projectsDir = path.join(process.cwd(), 'data', 'projects');
      if (!fs.existsSync(projectsDir)) {
        throw new Error('Mention not found');
      }

      const projects = fs.readdirSync(projectsDir);
      for (const project of projects) {
        const mentions = loadMentions(project);
        const mention = mentions.find(m => m.id === args.id);

        if (mention) {
          mention.type = args.newType;
          saveMentions(project, mentions);

          // Bump heartbeat
          bumpHeartbeat();

          // Track metrics
          incrementCounter('entity_mentions_updated_total');

          logger.info({
            event: 'entity_mention_type_updated',
            project,
            mentionId: args.id,
            newType: args.newType,
          });

          return mention;
        }
      }

      throw new Error('Mention not found');
    },

    /**
     * Reject an entity mention
     */
    rejectEntityMention: (_: any, args: { id: string }): boolean => {
      // Find mention across all projects
      const projectsDir = path.join(process.cwd(), 'data', 'projects');
      if (!fs.existsSync(projectsDir)) {
        return false;
      }

      const projects = fs.readdirSync(projectsDir);
      for (const project of projects) {
        const mentions = loadMentions(project);
        const mention = mentions.find(m => m.id === args.id);

        if (mention) {
          mention.status = 'rejected';
          saveMentions(project, mentions);

          // Bump heartbeat
          bumpHeartbeat();

          // Track metrics
          incrementCounter('entity_mentions_rejected_total');

          logger.info({
            event: 'entity_mention_rejected',
            project,
            mentionId: args.id,
          });

          return true;
        }
      }

      return false;
    },

    /**
     * S4: Update entity type in the knowledge graph
     */
    updateEntityType: (
      _: any,
      args: { project: string; entityId: string; newType: string }
    ): any => {
      validateProject(args.project);

      // Load graph
      const graphPath = `./data/projects/${args.project}/graph.json`;
      const fs = require('fs');

      if (!fs.existsSync(graphPath)) {
        throw new Error(`Graph not found for project: ${args.project}`);
      }

      const graphData = fs.readFileSync(graphPath, 'utf-8');
      const graph = JSON.parse(graphData);

      // Find and update entity
      const entity = graph.entities.find((e: any) => e.id === args.entityId);

      if (!entity) {
        throw new Error(`Entity not found: ${args.entityId}`);
      }

      // Update type (handle both string and array formats)
      if (Array.isArray(entity.type)) {
        entity.type = [args.newType];
      } else {
        entity.type = args.newType;
      }

      // Save updated graph
      fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2));

      // Bump heartbeat
      bumpHeartbeat();

      // Track metrics
      incrementCounter('entity_type_updated_total');

      logger.info({
        event: 'entity_type_updated',
        project: args.project,
        entityId: args.entityId,
        newType: args.newType,
      });

      // Return EntityLite
      return {
        id: entity.id,
        name: entity.canonical,
        types: Array.isArray(entity.type) ? entity.type : [entity.type],
        aliases: entity.aliases || [],
      };
    },
  },
};
