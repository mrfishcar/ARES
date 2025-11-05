/**
 * Export Functions - Phase 3
 * Export knowledge graph to various formats
 */

import type { Relation, Entity } from './schema';

/**
 * Export to CSV format
 */
export function toCSV(relations: Relation[], entities: Entity[]): string {
  const entityMap = new Map(entities.map(e => [e.id, e]));

  const header = 'subject,predicate,object,confidence,extractor,doc_id,ev_start,ev_end,time,place\n';

  const rows = relations.map(rel => {
    const subj = entityMap.get(rel.subj)?.canonical || rel.subj;
    const obj = entityMap.get(rel.obj)?.canonical || rel.obj;
    const ev = rel.evidence[0];
    const timeQual = rel.qualifiers?.find(q => q.type === 'time')?.value || '';
    const placeQual = rel.qualifiers?.find(q => q.type === 'place')?.value || '';

    return [
      `"${subj}"`,
      `"${rel.pred}"`,
      `"${obj}"`,
      rel.confidence.toFixed(3),
      rel.extractor || 'unknown',
      `"${ev.doc_id}"`,
      ev.span.start,
      ev.span.end,
      `"${timeQual}"`,
      `"${placeQual}"`
    ].join(',');
  }).join('\n');

  return header + rows;
}

/**
 * Export to JSON-LD (schema.org compatible)
 */
export function toJSONLD(relations: Relation[], entities: Entity[]): object {
  return {
    "@context": {
      "@vocab": "http://schema.org/",
      "ares": "http://ares.example.org/vocab/",
      "confidence": "ares:confidence",
      "extractor": "ares:extractor",
      "qualifiers": "ares:qualifiers"
    },
    "@graph": [
      // Entities
      ...entities.map(e => ({
        "@id": `ares:entity/${e.id}`,
        "@type": e.type,
        "name": e.canonical,
        "alternateName": e.aliases.length > 0 ? e.aliases : undefined,
        "confidence": e.centrality
      })),

      // Relations
      ...relations.map(r => ({
        "@id": `ares:relation/${r.id}`,
        "@type": "Role",
        "agent": { "@id": `ares:entity/${r.subj}` },
        "object": { "@id": `ares:entity/${r.obj}` },
        "roleName": r.pred,
        "confidence": r.confidence,
        "extractor": r.extractor,
        "evidence": r.evidence.map(ev => ({
          "text": ev.span.text,
          "source": ev.doc_id,
          "startOffset": ev.span.start,
          "endOffset": ev.span.end
        })),
        "qualifiers": r.qualifiers ? r.qualifiers.map(q => ({
          "type": q.type,
          "value": q.value,
          "entityId": q.entity_id,
          "span": q.span
        })) : undefined
      }))
    ]
  };
}

/**
 * Export to Graphviz DOT format for visualization
 */
export function toDOT(relations: Relation[], entities: Entity[]): string {
  const entityMap = new Map(entities.map(e => [e.id, e]));

  let dot = 'digraph ARES {\n';
  dot += '  rankdir=LR;\n';
  dot += '  node [shape=box, style=rounded];\n\n';

  // Nodes (entities)
  const usedEntities = new Set<string>();
  for (const rel of relations) {
    usedEntities.add(rel.subj);
    usedEntities.add(rel.obj);
  }

  for (const id of usedEntities) {
    const entity = entityMap.get(id);
    if (!entity) continue;

    const label = entity.canonical;
    const color = getColorForType(entity.type);

    dot += `  "${id}" [label="${label}", fillcolor="${color}", style="filled,rounded"];\n`;
  }

  dot += '\n';

  // Edges (relations)
  for (const rel of relations) {
    const label = `${rel.pred}\\n${rel.confidence.toFixed(2)}`;
    const color = rel.extractor === 'dep' ? 'blue' : 'gray';

    dot += `  "${rel.subj}" -> "${rel.obj}" [label="${label}", color="${color}"];\n`;
  }

  dot += '}\n';

  return dot;
}

/**
 * Helper: Get color for entity type
 */
function getColorForType(type: string): string {
  const colors: Record<string, string> = {
    'PERSON': 'lightblue',
    'PLACE': 'lightgreen',
    'ORG': 'lightyellow',
    'DATE': 'lightcoral',
    'WORK': 'lightpink',
    'ITEM': 'lightgray'
  };

  return colors[type] || 'white';
}

/**
 * Export to simple JSON format (for debugging)
 */
export function toJSON(relations: Relation[], entities: Entity[]): object {
  const entityMap = new Map(entities.map(e => [e.id, e]));

  return {
    entities: entities.map(e => ({
      id: e.id,
      type: e.type,
      name: e.canonical,
      aliases: e.aliases
    })),
    relations: relations.map(r => ({
      id: r.id,
      subject: {
        id: r.subj,
        name: entityMap.get(r.subj)?.canonical
      },
      predicate: r.pred,
      object: {
        id: r.obj,
        name: entityMap.get(r.obj)?.canonical
      },
      confidence: r.confidence,
      extractor: r.extractor,
      qualifiers: r.qualifiers,
      evidence: r.evidence
    }))
  };
}
