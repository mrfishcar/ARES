/**
 * Seeds Resolvers - Sprint R7
 * Citation seeds for entities with wiki rebuild functionality
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { incrementCounter, bumpHeartbeat } from '../../monitor/metrics';
import { loadGraph } from '../../storage/storage';

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

interface SeedInput {
  entityId: string;
  docId: string;
  quote: string;
  start: number;
  end: number;
}

/**
 * Get seeds file path for an entity
 */
function getSeedsFilePath(entityId: string): string {
  // Find which project this entity belongs to
  const projectsDir = path.join(process.cwd(), 'data', 'projects');
  if (!fs.existsSync(projectsDir)) {
    throw new Error('Projects directory not found');
  }

  const projects = fs.readdirSync(projectsDir);
  for (const project of projects) {
    const graphPath = path.join(projectsDir, project, 'graph.json');
    if (fs.existsSync(graphPath)) {
      const graph = loadGraph(graphPath);
      if (graph && graph.entities.some(e => e.id === entityId)) {
        const seedsDir = path.join(projectsDir, project, 'seeds');
        if (!fs.existsSync(seedsDir)) {
          fs.mkdirSync(seedsDir, { recursive: true });
        }
        return path.join(seedsDir, `${entityId}.json`);
      }
    }
  }

  throw new Error(`Entity ${entityId} not found in any project`);
}

/**
 * Get project for entity
 */
function getProjectForEntity(entityId: string): string {
  const projectsDir = path.join(process.cwd(), 'data', 'projects');
  if (!fs.existsSync(projectsDir)) {
    throw new Error('Projects directory not found');
  }

  const projects = fs.readdirSync(projectsDir);
  for (const project of projects) {
    const graphPath = path.join(projectsDir, project, 'graph.json');
    if (fs.existsSync(graphPath)) {
      const graph = loadGraph(graphPath);
      if (graph && graph.entities.some(e => e.id === entityId)) {
        return project;
      }
    }
  }

  throw new Error(`Entity ${entityId} not found in any project`);
}

/**
 * Load seeds for an entity
 */
function loadSeeds(entityId: string): Seed[] {
  try {
    const filePath = getSeedsFilePath(entityId);
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const seeds: Seed[] = JSON.parse(content);

    // Filter out removed seeds
    return seeds.filter(s => !s.removed);
  } catch (error) {
    // Entity not found or no seeds
    return [];
  }
}

/**
 * Save seeds for an entity
 */
function saveSeeds(entityId: string, seeds: Seed[]): void {
  const filePath = getSeedsFilePath(entityId);
  fs.writeFileSync(filePath, JSON.stringify(seeds, null, 2));
}

/**
 * Rebuild entity wiki page from seeds and graph data
 */
function rebuildEntityWiki(entityId: string): boolean {
  try {
    const project = getProjectForEntity(entityId);
    const graphPath = path.join(process.cwd(), 'data', 'projects', project, 'graph.json');
    const graph = loadGraph(graphPath);

    if (!graph) {
      throw new Error('Graph not found');
    }

    const entity = graph.entities.find(e => e.id === entityId);
    if (!entity) {
      throw new Error('Entity not found');
    }

    // Load seeds for this entity
    const seeds = loadSeeds(entityId);

    // Generate simple wiki page
    const wikiDir = path.join(process.cwd(), 'data', 'projects', project, 'wiki');
    if (!fs.existsSync(wikiDir)) {
      fs.mkdirSync(wikiDir, { recursive: true });
    }

    // Build markdown content
    const sections: string[] = [];
    sections.push(`# ${entity.canonical}\n`);
    sections.push(`**Type:** ${entity.type}`);
    if (entity.aliases.length > 0) {
      sections.push(`**Aliases:** ${entity.aliases.join(', ')}`);
    }
    sections.push('');

    // Add seeds as evidence section
    if (seeds.length > 0) {
      sections.push('## Evidence\n');
      for (const seed of seeds) {
        sections.push(`### Document: ${seed.docId}\n`);
        sections.push(`> ${seed.quote}\n`);
        sections.push(`_Added by ${seed.addedBy} on ${new Date(seed.addedAt).toLocaleDateString()}_\n`);
      }
    }

    const wikiPath = path.join(wikiDir, `${entity.id}.md`);
    fs.writeFileSync(wikiPath, sections.join('\n'));

    // Bump heartbeat to notify UI of changes
    bumpHeartbeat();

    incrementCounter('entity_rebuilt_total');

    return true;
  } catch (error) {
    console.error(`Failed to rebuild entity ${entityId}:`, error);
    return false;
  }
}

export const seedsResolvers = {
  Query: {
    /**
     * List seeds for an entity
     */
    listSeeds: (_: any, args: { entityId: string }): Seed[] => {
      const seeds = loadSeeds(args.entityId);
      incrementCounter('api_list_seeds_total');
      return seeds;
    },
  },

  Mutation: {
    /**
     * Add a seed citation to an entity
     */
    addSeed: (_: any, args: { input: SeedInput }): Seed => {
      const entityId = args.input.entityId;
      const seeds = loadSeeds(entityId);

      const newSeed: Seed = {
        id: uuidv4(),
        entityId,
        docId: args.input.docId,
        span: {
          start: args.input.start,
          end: args.input.end,
          text: args.input.quote,
        },
        quote: args.input.quote,
        addedBy: 'user',
        addedAt: new Date().toISOString(),
        removed: false,
      };

      seeds.push(newSeed);
      saveSeeds(entityId, seeds);

      // Bump heartbeat to notify UI
      bumpHeartbeat();

      incrementCounter('seeds_added_total');

      return newSeed;
    },

    /**
     * Remove a seed citation (soft delete)
     */
    removeSeed: (_: any, args: { id: string }): boolean => {
      // Find seed across all entities
      const projectsDir = path.join(process.cwd(), 'data', 'projects');
      if (!fs.existsSync(projectsDir)) {
        return false;
      }

      const projects = fs.readdirSync(projectsDir);
      for (const project of projects) {
        const seedsDir = path.join(projectsDir, project, 'seeds');
        if (!fs.existsSync(seedsDir)) {
          continue;
        }

        const seedFiles = fs.readdirSync(seedsDir).filter(f => f.endsWith('.json'));
        for (const file of seedFiles) {
          const entityId = file.replace('.json', '');
          const seeds = loadSeeds(entityId);

          const seedIndex = seeds.findIndex(s => s.id === args.id);
          if (seedIndex >= 0) {
            // Mark as removed (soft delete)
            seeds[seedIndex].removed = true;
            saveSeeds(entityId, seeds);

            // Bump heartbeat
            bumpHeartbeat();

            incrementCounter('seeds_removed_total');

            return true;
          }
        }
      }

      return false;
    },

    /**
     * Rebuild entity wiki page from seeds
     */
    rebuildEntity: (_: any, args: { entityId: string }): boolean => {
      const result = rebuildEntityWiki(args.entityId);

      if (result) {
        // Bump heartbeat to notify UI of wiki update
        bumpHeartbeat();
      }

      return result;
    },
  },
};
