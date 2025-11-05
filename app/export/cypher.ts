/**
 * Cypher Exporter for ARES
 * Exports KnowledgeGraph to Cypher format for Neo4j
 */

import * as fs from 'fs';
import type { KnowledgeGraph } from '../storage/storage';

/**
 * Export knowledge graph to Cypher format
 */
export function exportCypher(graph: KnowledgeGraph, outputPath: string): void {
  if (!graph || !graph.entities || !graph.relations) {
    throw new Error('Invalid graph: missing entities or relations');
  }

  const lines: string[] = [];

  // Header comments
  lines.push('// ARES Knowledge Graph Export to Cypher');
  lines.push('// Generated: ' + new Date().toISOString());
  lines.push('// Entities: ' + graph.entities.length);
  lines.push('// Relations: ' + graph.relations.length);
  lines.push('');

  // Create entities
  lines.push('// Create entities');
  for (const entity of graph.entities) {
    const props: string[] = [];

    // ID
    props.push(`id: "${escapeCypher(entity.id)}"`);

    // Name
    props.push(`name: "${escapeCypher(entity.canonical)}"`);

    // Type
    props.push(`type: "${escapeCypher(entity.type)}"`);

    // Aliases
    if (entity.aliases && entity.aliases.length > 0) {
      const aliasesStr = entity.aliases.map(a => `"${escapeCypher(a)}"`).join(', ');
      props.push(`aliases: [${aliasesStr}]`);
    }

    // Centrality
    if (entity.centrality !== undefined) {
      props.push(`centrality: ${entity.centrality}`);
    }

    // Use MERGE to avoid duplicates
    lines.push(`MERGE (n:Entity {${props.join(', ')}})`);
  }

  lines.push('');

  // Create relations
  lines.push('// Create relations');
  const entityIds = new Set(graph.entities.map(e => e.id));
  const symmetricPredicates = new Set(['friends_with', 'married_to', 'sibling_of', 'ally_of', 'enemy_of']);
  const processedSymmetric = new Set<string>();

  for (const relation of graph.relations) {
    // Only export if both entities exist
    if (!entityIds.has(relation.subj) || !entityIds.has(relation.obj)) {
      continue;
    }

    // For symmetric relations, emit both directions but avoid duplicates
    const isSymmetric = symmetricPredicates.has(relation.pred);

    if (isSymmetric) {
      // Create a normalized key to check if we've already processed this pair
      const key1 = `${relation.subj}::${relation.pred}::${relation.obj}`;
      const key2 = `${relation.obj}::${relation.pred}::${relation.subj}`;

      if (processedSymmetric.has(key1) || processedSymmetric.has(key2)) {
        continue; // Skip if we've already created this symmetric pair
      }

      processedSymmetric.add(key1);
      processedSymmetric.add(key2);
    }

    // Build relationship properties
    const relProps: string[] = [];

    if (relation.confidence !== undefined) {
      relProps.push(`confidence: ${relation.confidence}`);
    }

    if (relation.extractor) {
      relProps.push(`extractor: "${escapeCypher(relation.extractor)}"`);
    }

    const propsStr = relProps.length > 0 ? ` {${relProps.join(', ')}}` : '';

    // Normalize predicate to valid Cypher relationship type (uppercase, underscores)
    const relType = relation.pred.toUpperCase();

    // Create relationship
    lines.push(
      `MATCH (a:Entity {id: "${escapeCypher(relation.subj)}"}), (b:Entity {id: "${escapeCypher(relation.obj)}"})`
    );
    lines.push(`MERGE (a)-[:${relType}${propsStr}]->(b)`);

    // For symmetric relations, also create the inverse
    if (isSymmetric) {
      lines.push(`MERGE (b)-[:${relType}${propsStr}]->(a)`);
    }

    lines.push('');
  }

  // Add indexes for performance
  lines.push('');
  lines.push('// Create indexes');
  lines.push('CREATE INDEX entity_id_index IF NOT EXISTS FOR (n:Entity) ON (n.id);');
  lines.push('CREATE INDEX entity_name_index IF NOT EXISTS FOR (n:Entity) ON (n.name);');

  // Write to file
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
}

/**
 * Escape Cypher special characters
 */
function escapeCypher(text: string | undefined): string {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')  // Backslash
    .replace(/"/g, '\\"')     // Double quote
    .replace(/\n/g, '\\n')    // Newline
    .replace(/\r/g, '\\r')    // Carriage return
    .replace(/\t/g, '\\t');   // Tab
}
