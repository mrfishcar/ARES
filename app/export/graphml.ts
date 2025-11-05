/**
 * GraphML Exporter for ARES
 * Exports KnowledgeGraph to GraphML format for Gephi, yEd, etc.
 */

import * as fs from 'fs';
import type { KnowledgeGraph } from '../storage/storage';

/**
 * Export knowledge graph to GraphML format
 */
export function exportGraphML(graph: KnowledgeGraph, outputPath: string): void {
  if (!graph || !graph.entities || !graph.relations) {
    throw new Error('Invalid graph: missing entities or relations');
  }

  const lines: string[] = [];

  // XML header
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<graphml xmlns="http://graphml.graphdrawing.org/xmlns"');
  lines.push('         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
  lines.push('         xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns');
  lines.push('         http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">');

  // Define node attributes
  lines.push('  <key id="d0" for="node" attr.name="name" attr.type="string"/>');
  lines.push('  <key id="d1" for="node" attr.name="type" attr.type="string"/>');
  lines.push('  <key id="d2" for="node" attr.name="aliases" attr.type="string"/>');
  lines.push('  <key id="d3" for="node" attr.name="centrality" attr.type="double"/>');

  // Define edge attributes
  lines.push('  <key id="e0" for="edge" attr.name="predicate" attr.type="string"/>');
  lines.push('  <key id="e1" for="edge" attr.name="confidence" attr.type="double"/>');
  lines.push('  <key id="e2" for="edge" attr.name="symmetric" attr.type="boolean"/>');

  // Graph element (directed)
  lines.push('  <graph id="G" edgedefault="directed">');

  // Add nodes (entities)
  for (const entity of graph.entities) {
    lines.push(`    <node id="${escapeXml(entity.id)}">` );
    lines.push(`      <data key="d0">${escapeXml(entity.canonical)}</data>`);
    lines.push(`      <data key="d1">${escapeXml(entity.type)}</data>`);

    if (entity.aliases && entity.aliases.length > 0) {
      lines.push(`      <data key="d2">${escapeXml(entity.aliases.join(', '))}</data>`);
    }

    if (entity.centrality !== undefined) {
      lines.push(`      <data key="d3">${entity.centrality}</data>`);
    }

    lines.push('    </node>');
  }

  // Add edges (relations)
  const entityIds = new Set(graph.entities.map(e => e.id));
  const symmetricPredicates = new Set(['friends_with', 'married_to', 'sibling_of', 'ally_of', 'enemy_of']);

  for (const relation of graph.relations) {
    // Only export if both entities exist
    if (!entityIds.has(relation.subj) || !entityIds.has(relation.obj)) {
      continue;
    }

    const edgeId = `e${relation.id}`;
    lines.push(`    <edge id="${escapeXml(edgeId)}" source="${escapeXml(relation.subj)}" target="${escapeXml(relation.obj)}">` );
    lines.push(`      <data key="e0">${escapeXml(relation.pred)}</data>`);

    if (relation.confidence !== undefined) {
      lines.push(`      <data key="e1">${relation.confidence}</data>`);
    }

    if (symmetricPredicates.has(relation.pred)) {
      lines.push('      <data key="e2">true</data>');
    }

    lines.push('    </edge>');
  }

  // Close tags
  lines.push('  </graph>');
  lines.push('</graphml>');

  // Write to file
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string | undefined): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
