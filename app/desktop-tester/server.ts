/**
 * Desktop Tester Backend Server
 * Simple Express server for wiki generation
 */

import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { appendDoc, loadGraph, clearStorage } from '../storage/storage';
import { compose } from '../generate/exposition';
import { toMarkdownPage } from '../generate/markdown';

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// Ensure test_wikis directory exists on Desktop
const desktopPath = path.join(os.homedir(), 'Desktop');
const wikisOutputPath = path.join(desktopPath, 'test_wikis');

function ensureOutputDir() {
  if (!fs.existsSync(wikisOutputPath)) {
    fs.mkdirSync(wikisOutputPath, { recursive: true });
  }
}

// Generate wikis endpoint
app.post('/generate-wikis', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    console.log(`\n📝 Received request to generate wikis (${text.length} chars)`);

    // Use temp storage for processing
    const timestamp = Date.now();
    const tempPath = path.join(process.cwd(), `temp-desktop-${timestamp}.json`);

    // Clear any existing temp storage
    clearStorage(tempPath);

    // Ingest the text
    console.log('🔄 Ingesting text...');
    const startTime = Date.now();
    const appendResult = await appendDoc(`doc-${timestamp}`, text, tempPath);
    const ingestTime = Date.now() - startTime;
    console.log(`✓ Ingestion complete in ${ingestTime}ms`);

    // Load graph
    const graph = loadGraph(tempPath);
    if (!graph) {
      clearStorage(tempPath);
      return res.status(500).json({ error: 'Failed to load knowledge graph' });
    }

    console.log(`📊 Graph: ${graph.entities.length} entities, ${graph.relations.length} relations`);

    // Generate wikis for all entities
    ensureOutputDir();

    // Create timestamped folder for this batch
    const batchFolder = path.join(wikisOutputPath, `batch_${timestamp}`);
    fs.mkdirSync(batchFolder, { recursive: true });

    let wikisCreated = 0;

    for (const entity of graph.entities) {
      try {
        // Generate page
        const page = compose(entity.id, graph.entities, graph.relations, graph.conflicts);
        const markdown = toMarkdownPage(page);

        // Create safe filename
        const safeFilename = entity.canonical
          .replace(/[^a-z0-9]+/gi, '_')
          .replace(/^_+|_+$/g, '')
          .toLowerCase();

        const filepath = path.join(batchFolder, `${safeFilename}.md`);
        fs.writeFileSync(filepath, markdown, 'utf-8');

        wikisCreated++;
      } catch (error) {
        console.error(`Failed to generate wiki for ${entity.canonical}:`, error);
      }
    }

    // Create index file
    const indexContent = `# Knowledge Graph Wiki Pages

Generated: ${new Date().toLocaleString()}

## Statistics
- **Entities:** ${graph.entities.length}
- **Relations:** ${graph.relations.length}
- **Wiki Pages:** ${wikisCreated}

## Entities by Type

${generateEntityTypeBreakdown(graph.entities)}

## All Pages

${graph.entities
  .sort((a, b) => a.canonical.localeCompare(b.canonical))
  .map(e => {
    const safeFilename = e.canonical
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    return `- [${e.canonical}](${safeFilename}.md) (${e.type})`;
  })
  .join('\n')}
`;

    const indexPath = path.join(batchFolder, 'index.md');
    fs.writeFileSync(indexPath, indexContent, 'utf-8');

    console.log(`✅ Generated ${wikisCreated} wikis in ${batchFolder}`);

    // Cleanup temp storage
    clearStorage(tempPath);

    // Send response
    res.json({
      success: true,
      entities: graph.entities.length,
      relations: graph.relations.length,
      wikisCreated,
      outputPath: batchFolder,
      timestamp,
      fictionEntities: appendResult.fictionEntities.slice(0, 15)
    });

  } catch (error) {
    console.error('Error generating wikis:', error);
    res.status(500).json({
      error: 'Failed to generate wikis',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Helper function to generate entity type breakdown
function generateEntityTypeBreakdown(entities: any[]): string {
  const typeCounts = new Map<string, number>();
  for (const entity of entities) {
    const count = typeCounts.get(entity.type) || 0;
    typeCounts.set(entity.type, count + 1);
  }

  const sorted = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1]);

  return sorted.map(([type, count]) => `- **${type}:** ${count}`).join('\n');
}

// Extract entities and relations endpoint (for Extraction Lab)
app.post('/extract-entities', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    console.log(`\n🔬 Extraction Lab request (${text.length} chars)`);

    // Use temp storage for processing
    const timestamp = Date.now();
    const tempPath = path.join(process.cwd(), `temp-extract-${timestamp}.json`);

    // Clear any existing temp storage
    clearStorage(tempPath);

    // Extract entities and relations using the FULL ARES engine
    console.log('🔄 Running ARES extraction engine...');
    const startTime = Date.now();
    const appendResult = await appendDoc(`extract-${timestamp}`, text, tempPath);
    const extractTime = Date.now() - startTime;
    console.log(`✓ Extraction complete in ${extractTime}ms`);

    // Load the graph to get the full results
    const graph = loadGraph(tempPath);
    if (!graph) {
      clearStorage(tempPath);
      return res.status(500).json({ error: 'Failed to load extraction results' });
    }

    console.log(`📊 Extracted: ${graph.entities.length} entities, ${graph.relations.length} relations`);

    // Cleanup temp storage
    clearStorage(tempPath);

    // Transform entities to frontend format with spans
    // Note: We need to find entity spans in the original text
    const entitySpans = graph.entities.map(entity => {
      // Find all occurrences of this entity in the text
      const escapedCanonical = entity.canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedCanonical}\\b`, 'gi');
      const matches = [];
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
        });
      }

      return {
        id: entity.id,
        text: entity.canonical,
        type: entity.type,
        confidence: entity.centrality || 1.0,
        spans: matches,
        aliases: entity.aliases || [],
      };
    });

    // Transform relations to frontend format
    const relations = graph.relations.map(rel => ({
      id: rel.id,
      subj: rel.subj,
      obj: rel.obj,
      pred: rel.pred,
      confidence: rel.confidence,
      // Include entity canonical names for display
      subjCanonical: graph.entities.find(e => e.id === rel.subj)?.canonical || 'UNKNOWN',
      objCanonical: graph.entities.find(e => e.id === rel.obj)?.canonical || 'UNKNOWN',
    }));

    // Send response
    res.json({
      success: true,
      entities: entitySpans,
      relations,
      stats: {
        extractionTime: extractTime,
        entityCount: graph.entities.length,
        relationCount: graph.relations.length,
        conflictCount: graph.conflicts.length,
      },
      fictionEntities: appendResult.fictionEntities.slice(0, 15),
    });

  } catch (error) {
    console.error('Error extracting entities:', error);
    res.status(500).json({
      error: 'Failed to extract entities',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', wikisPath: wikisOutputPath });
});

// Start server
app.listen(PORT, () => {
  console.log('\n🏺 Ares Wiki Generator - Desktop Tester\n');
  console.log(`✓ Server running on http://localhost:${PORT}`);
  console.log(`✓ Wiki output folder: ${wikisOutputPath}`);
  console.log(`\n📱 Open http://localhost:${PORT} in your browser\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});
