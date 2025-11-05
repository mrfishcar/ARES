/**
 * Update mention counts for entities in the graph
 */

import * as fs from 'fs';
import * as path from 'path';

const projectPath = '/Users/corygilford/ares/data/projects/default';
const graphPath = path.join(projectPath, 'graph.json');
const notesPath = path.join(projectPath, 'notes');

// Read the graph
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));

// Initialize mention counts
const mentionCounts = new Map<string, number>();

// Read all notes
const noteFiles = fs.readdirSync(notesPath).filter(f => f.endsWith('.json'));

for (const noteFile of noteFiles) {
  const notePath = path.join(notesPath, noteFile);
  const note = JSON.parse(fs.readFileSync(notePath, 'utf-8'));
  const markdown = note.markdown || '';

  // Find all entity tags in format #EntityName:TYPE
  const entityTagRegex = /#([A-Za-z0-9_]+):(PERSON|PLACE|ORG|OBJECT|EVENT|CONCEPT)/g;
  let match;

  while ((match = entityTagRegex.exec(markdown)) !== null) {
    const entityName = match[1];
    mentionCounts.set(entityName, (mentionCounts.get(entityName) || 0) + 1);
  }
}

console.log('Mention counts found:');
mentionCounts.forEach((count, name) => {
  console.log(`  ${name}: ${count}`);
});

// Update entities with mention counts
for (const entity of graph.entities) {
  const canonical = entity.canonical;
  const count = mentionCounts.get(canonical) || 0;
  entity.mention_count = count;
  console.log(`Updated ${canonical} with mention_count: ${count}`);
}

// Save updated graph
fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf-8');
console.log('\nGraph updated successfully!');
console.log(`Total entities: ${graph.entities.length}`);
console.log(`Entities with mentions: ${graph.entities.filter((e: any) => e.mention_count > 0).length}`);
