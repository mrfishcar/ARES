/**
 * Wiki Generation Resolvers
 * GraphQL resolvers for wiki page generation and retrieval
 */

import * as fs from 'fs';
import * as path from 'path';
import { getHERTQuery } from '../hert-query';
import { WikiGenerator, renderWikiPageToMarkdown } from '../../generate/wiki-generator';
import { WikiIndexGenerator } from '../../generate/wiki-index';

// Default wiki output directory
const WIKI_DIR = './wiki-output';

/**
 * Slugify entity name for file paths
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Ensure wiki directory exists
 */
function ensureWikiDir(project: string): string {
  const projectDir = path.join(WIKI_DIR, project);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  return projectDir;
}

/**
 * Get wiki file list from directory
 */
function getWikiFileList(project: string): any[] {
  const projectDir = path.join(WIKI_DIR, project);

  if (!fs.existsSync(projectDir)) {
    return [];
  }

  const files: any[] = [];
  const markdownFiles = fs.readdirSync(projectDir).filter(f => f.endsWith('.md'));

  for (const file of markdownFiles) {
    const filePath = path.join(projectDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Extract title from first h1
    const titleMatch = content.match(/^# (.+)$/m);
    const title = titleMatch ? titleMatch[1] : file.replace('.md', '');

    files.push({
      id: file.replace('.md', ''),
      path: file,
      title,
      entityId: null, // Could parse from metadata if needed
      type: null,
    });
  }

  return files;
}

export const wikiResolvers = {
  Query: {
    /**
     * Get wiki file list for a project
     */
    listWikiFiles: (_: any, args: { project: string }) => {
      return getWikiFileList(args.project);
    },

    /**
     * Get wiki file content
     */
    getWikiFile: (_: any, args: { project: string; fileId: string }) => {

      const projectDir = path.join(WIKI_DIR, args.project);
      const filePath = path.join(projectDir, `${args.fileId}.md`);

      if (!fs.existsSync(filePath)) {
        throw new Error(`Wiki file not found: ${args.fileId}`);
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      // Extract title
      const titleMatch = content.match(/^# (.+)$/m);
      const title = titleMatch ? titleMatch[1] : args.fileId;

      return {
        id: args.fileId,
        path: `${args.fileId}.md`,
        content,
        metadata: {
          entityId: null,
          entityName: title,
          type: null,
          generatedAt: new Date().toISOString(),
          stats: {
            mentionCount: 0,
            relationCount: 0,
            aliasCount: 0,
          },
        },
      };
    },
  },

  Mutation: {
    /**
     * Generate wiki pages for all entities
     */
    generateWiki: (_: any, args: { project: string }) => {
      const queryAPI = getHERTQuery();
      const generator = new WikiGenerator(queryAPI);
      const indexGenerator = new WikiIndexGenerator(queryAPI);

      // Ensure output directory exists
      const outputDir = ensureWikiDir(args.project);

      const files: any[] = [];
      const errors: string[] = [];

      try {
        // Get all entities from all types
        const entityTypes = ['PERSON', 'PLACE', 'ORG', 'EVENT', 'DATE', 'ITEM', 'WORK'] as const;
        const allEntities: any[] = [];
        for (const type of entityTypes) {
          const entities = queryAPI.findEntitiesByType(type);
          allEntities.push(...entities);
        }

        // Generate page for each entity
        for (const entity of allEntities) {
          try {
            const page = generator.generatePage(entity.eid);
            if (!page) continue;

            const markdown = renderWikiPageToMarkdown(page);
            const slug = slugify(entity.canonical);
            const filePath = path.join(outputDir, `${slug}.md`);

            fs.writeFileSync(filePath, markdown, 'utf-8');

            files.push({
              id: slug,
              path: `${slug}.md`,
              title: page.title,
              entityId: entity.eid,
              type: entity.type,
            });
          } catch (err: any) {
            errors.push(`Error generating page for ${entity.canonical}: ${err.message}`);
          }
        }

        // Generate index pages
        for (const type of entityTypes) {
          try {
            const indexPage = indexGenerator.generateCategoryIndex(type);
            const slug = slugify(indexPage.title);
            const filePath = path.join(outputDir, `${slug}.md`);

            fs.writeFileSync(filePath, indexPage.content, 'utf-8');

            files.push({
              id: slug,
              path: `${slug}.md`,
              title: indexPage.title,
              entityId: null,
              type: type,
            });
          } catch (err: any) {
            errors.push(`Error generating index for ${type}: ${err.message}`);
          }
        }

        // Generate main index
        try {
          const mainIndex = indexGenerator.generateMainIndex();
          const filePath = path.join(outputDir, 'index.md');

          fs.writeFileSync(filePath, mainIndex.content, 'utf-8');

          files.push({
            id: 'index',
            path: 'index.md',
            title: mainIndex.title,
            entityId: null,
            type: null,
          });
        } catch (err: any) {
          errors.push(`Error generating main index: ${err.message}`);
        }

        return {
          filesGenerated: files.length,
          files,
          errors,
        };
      } catch (err: any) {
        throw new Error(`Wiki generation failed: ${err.message}`);
      }
    },

    /**
     * Regenerate a specific wiki page
     */
    regenerateWikiPage: (_: any, args: { project: string; entityId: number }) => {
      const queryAPI = getHERTQuery();
      const generator = new WikiGenerator(queryAPI);

      // Find entity
      const entity = queryAPI.findEntityByEID(args.entityId);
      if (!entity) {
        throw new Error(`Entity not found: ${args.entityId}`);
      }

      // Generate page
      const page = generator.generatePage(args.entityId);
      if (!page) {
        throw new Error(`Failed to generate page for entity: ${args.entityId}`);
      }

      // Ensure output directory exists
      const outputDir = ensureWikiDir(args.project);

      // Write to file
      const markdown = renderWikiPageToMarkdown(page);
      const slug = slugify(entity.canonical);
      const filePath = path.join(outputDir, `${slug}.md`);

      fs.writeFileSync(filePath, markdown, 'utf-8');

      return {
        id: slug,
        path: `${slug}.md`,
        title: page.title,
        entityId: entity.eid,
        type: entity.type,
      };
    },
  },
};
