# ARES Phase 5 - Implementation Plan

## Overview

Phase 5 transforms ARES into a **complete knowledge graph platform** with:
1. **Persistent Storage** - JSON + SQLite backends
2. **GraphQL API** - Query and mutation interface
3. **UI Demo** - Visual graph explorer with conflict highlighting

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  UI Layer (Demo)                │
│              React + D3 Force Graph             │
│           (tests/demo-phase5-ui.tsx)            │
└─────────────────────────────────────────────────┘
                        ▲
                        │ GraphQL
                        ▼
┌─────────────────────────────────────────────────┐
│                  API Layer                      │
│          GraphQL Server (Apollo/Express)        │
│              (app/api/graphql.ts)               │
│                                                 │
│  Queries:  entities, relations, conflicts       │
│  Mutations: ingestDoc                           │
└─────────────────────────────────────────────────┘
                        ▲
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│               Storage Layer                     │
│          (app/storage/storage.ts)               │
│                                                 │
│  Backends: JSON file | SQLite (switchable)      │
│  Functions: saveGraph, loadGraph, appendDoc     │
└─────────────────────────────────────────────────┘
                        ▲
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│              Core Engine (Phases 2-4)           │
│  Extract → Merge → Query → Export → Conflicts  │
└─────────────────────────────────────────────────┘
```

---

## 1. Persistent Storage

### Design Goals
- **Deterministic:** Same input → same global IDs
- **Provenance:** Track which local entities merged into globals
- **Switchable:** JSON (dev) or SQLite (prod)
- **Incremental:** Support `appendDoc` without full rebuild

### File: `app/storage/storage.ts`

```typescript
export interface StorageBackend {
  save(graph: KnowledgeGraph): Promise<void>;
  load(): Promise<KnowledgeGraph | null>;
  append(doc: DocumentData): Promise<void>;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
  conflicts: Conflict[];
  provenance: ProvenanceMap;  // local_id -> global_id
  metadata: {
    created_at: string;
    updated_at: string;
    doc_count: number;
  };
}

export interface ProvenanceMap {
  [local_id: string]: {
    global_id: string;
    doc_id: string;
    merged_at: string;
  };
}
```

**JSON Backend:**
- File: `ares_graph.json`
- Simple read/write
- Good for dev/testing

**SQLite Backend:**
- Tables: `entities`, `relations`, `conflicts`, `provenance`
- Indexed by ID, type, predicate
- Good for production

**Key Functions:**

1. `saveGraph(graph: KnowledgeGraph, backend: 'json' | 'sqlite')`
   - Serialize entities, relations, conflicts
   - Store provenance map
   - Update metadata

2. `loadGraph(backend: 'json' | 'sqlite'): KnowledgeGraph`
   - Deserialize from storage
   - Rebuild in-memory graph

3. `appendDoc(doc_id: string, text: string, backend: 'json' | 'sqlite')`
   - Extract entities/relations from new doc
   - Merge with existing globals
   - Update provenance
   - Detect new conflicts

### Deterministic Merging

To ensure stable global IDs:
1. Sort entities by (type, canonical) before clustering
2. Use deterministic ID generation: `global_{type}_{index}`
3. Store merge order in provenance

---

## 2. GraphQL API

### Design Goals
- **Flexible Queries:** Filter by type, name, predicate, etc.
- **Mutations:** Ingest new documents
- **Conflict-Aware:** Expose conflicts in queries

### File: `app/api/schema.graphql`

```graphql
type Entity {
  id: ID!
  type: String!
  canonical: String!
  aliases: [String!]!
  centrality: Float
  createdAt: String!
  localIds: [String!]!  # Provenance
}

type Relation {
  id: ID!
  subject: Entity!
  predicate: String!
  object: Entity!
  confidence: Float!
  extractor: String
  qualifiers: [Qualifier!]
  evidence: [Evidence!]!
}

type Qualifier {
  type: String!
  value: String!
  entityId: String
  span: [Int!]
}

type Evidence {
  docId: String!
  span: Span!
  sentenceIndex: Int!
}

type Span {
  start: Int!
  end: Int!
  text: String!
}

type Conflict {
  type: String!
  severity: Int!
  description: String!
  relations: [Relation!]!
}

type Query {
  entities(type: String, name: String): [Entity!]!
  relations(predicate: String, subjectId: ID, objectId: ID): [Relation!]!
  conflicts(subjectId: ID, type: String): [Conflict!]!
  graph: KnowledgeGraph!
}

type KnowledgeGraph {
  entities: [Entity!]!
  relations: [Relation!]!
  conflicts: [Conflict!]!
  metadata: Metadata!
}

type Metadata {
  createdAt: String!
  updatedAt: String!
  docCount: Int!
}

type Mutation {
  ingestDoc(text: String!, docId: String!): IngestResult!
}

type IngestResult {
  entities: [Entity!]!
  relations: [Relation!]!
  conflicts: [Conflict!]!
  mergeCount: Int!
}
```

### File: `app/api/graphql.ts`

```typescript
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { loadGraph, appendDoc } from '../storage/storage';

const resolvers = {
  Query: {
    entities: (_, { type, name }) => {
      const graph = loadGraph('json');
      return graph.entities.filter(e => {
        if (type && e.type !== type) return false;
        if (name && !e.canonical.includes(name)) return false;
        return true;
      });
    },

    relations: (_, { predicate, subjectId, objectId }) => {
      const graph = loadGraph('json');
      return graph.relations.filter(r => {
        if (predicate && r.pred !== predicate) return false;
        if (subjectId && r.subj !== subjectId) return false;
        if (objectId && r.obj !== objectId) return false;
        return true;
      });
    },

    conflicts: (_, { subjectId, type }) => {
      const graph = loadGraph('json');
      return graph.conflicts.filter(c => {
        if (type && c.type !== type) return false;
        if (subjectId && !c.relations.some(r => r.subj === subjectId)) return false;
        return true;
      });
    },

    graph: () => loadGraph('json')
  },

  Mutation: {
    ingestDoc: async (_, { text, docId }) => {
      const result = await appendDoc(docId, text, 'json');
      return result;
    }
  }
};

export async function startGraphQLServer(port = 4000) {
  const server = new ApolloServer({ typeDefs, resolvers });
  const { url } = await startStandaloneServer(server, { port });
  console.log(`🚀 GraphQL server ready at ${url}`);
  return server;
}
```

---

## 3. UI Demo

### Design Goals
- **Visual:** Force-directed graph layout
- **Interactive:** Hover for details, click for relations
- **Conflict Highlighting:** Red nodes/edges for conflicts
- **Export:** Download as DOT/PNG

### File: `tests/demo-phase5-ui.tsx`

```tsx
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { toDOT } from '../app/engine/export';

interface GraphData {
  nodes: { id: string; type: string; name: string; conflict?: boolean }[];
  links: { source: string; target: string; predicate: string; confidence: number }[];
}

export function KnowledgeGraphUI() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);

  useEffect(() => {
    // Load sample graph
    fetch('/api/graphql', {
      method: 'POST',
      body: JSON.stringify({ query: '{ graph { entities { id type canonical } relations { subject { id } predicate object { id } confidence } conflicts { relations { subject { id } } } } }' })
    })
      .then(res => res.json())
      .then(data => {
        // Transform to D3 format
        const nodes = data.entities.map(e => ({
          id: e.id,
          type: e.type,
          name: e.canonical,
          conflict: data.conflicts.some(c => c.relations.some(r => r.subject.id === e.id))
        }));

        const links = data.relations.map(r => ({
          source: r.subject.id,
          target: r.object.id,
          predicate: r.predicate,
          confidence: r.confidence
        }));

        setGraph({ nodes, links });
      });
  }, []);

  useEffect(() => {
    if (!graph || !svgRef.current) return;

    const width = 800;
    const height = 600;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    svg.selectAll('*').remove();

    // Force simulation
    const simulation = d3.forceSimulation(graph.nodes)
      .force('link', d3.forceLink(graph.links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));

    // Draw links
    const link = svg.append('g')
      .selectAll('line')
      .data(graph.links)
      .enter().append('line')
      .attr('stroke', '#999')
      .attr('stroke-width', 2);

    // Draw nodes
    const node = svg.append('g')
      .selectAll('circle')
      .data(graph.nodes)
      .enter().append('circle')
      .attr('r', 10)
      .attr('fill', d => d.conflict ? 'red' : getColorForType(d.type))
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Labels
    const label = svg.append('g')
      .selectAll('text')
      .data(graph.nodes)
      .enter().append('text')
      .text(d => d.name)
      .attr('font-size', 10)
      .attr('dx', 12)
      .attr('dy', 4);

    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);

      label
        .attr('x', d => d.x)
        .attr('y', d => d.y);
    });

    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  }, [graph]);

  const exportDOT = () => {
    if (!graph) return;
    const dot = toDOT(graph.relations, graph.nodes);
    const blob = new Blob([dot], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'graph.dot';
    a.click();
  };

  return (
    <div>
      <h1>ARES Knowledge Graph</h1>
      <button onClick={exportDOT}>Export as DOT</button>
      <svg ref={svgRef}></svg>
    </div>
  );
}

function getColorForType(type: string): string {
  const colors = {
    'PERSON': '#4A90E2',
    'PLACE': '#7ED321',
    'ORG': '#F5A623',
    'DATE': '#D0021B',
    'WORK': '#BD10E0',
    'ITEM': '#9013FE'
  };
  return colors[type] || '#999';
}
```

---

## 4. Testing Strategy

### Storage Tests (`tests/storage.spec.ts`)

1. **save_and_load**: Save graph → load → verify identity
2. **append_doc**: Load → append new doc → verify merge
3. **provenance_tracking**: Verify local_id → global_id mapping
4. **deterministic_merge**: Save twice → same global IDs
5. **conflict_persistence**: Save conflicts → load → verify

### API Tests (`tests/api.spec.ts`)

1. **query_entities**: Filter by type and name
2. **query_relations**: Filter by predicate
3. **query_conflicts**: Filter by subject
4. **mutation_ingest**: Ingest new doc → verify entities
5. **mutation_merge**: Ingest similar entities → verify merge

---

## 5. Implementation Order

1. ✅ Create PHASE5_PLAN.md
2. Implement `app/storage/storage.ts` (JSON backend)
3. Write `tests/storage.spec.ts` (5 tests)
4. Implement `app/api/schema.graphql`
5. Implement `app/api/graphql.ts` (Apollo Server)
6. Write `tests/api.spec.ts` (5 tests)
7. Create `tests/demo-phase5-ui.tsx` (React + D3)
8. Run all tests (36/36)
9. Create `PHASE5_COMPLETE_REPORT.md`

---

## Key Design Decisions

### 1. Deterministic Global IDs

Problem: Different merge orders → different global IDs

Solution:
- Sort entities by (type, canonical) before clustering
- Use deterministic ID: `global_{type}_{index}`
- Store merge order in provenance

### 2. Provenance Tracking

Store mapping: `local_id → { global_id, doc_id, merged_at }`

Benefits:
- Trace which documents contributed to each global entity
- Support "undo" operations (future)
- Audit merge decisions

### 3. Incremental Updates

When appending a document:
1. Extract local entities/relations
2. Merge with existing globals (preserving IDs)
3. Update provenance map
4. Re-run conflict detection
5. Save updated graph

### 4. Backend Switching

```typescript
const BACKEND: 'json' | 'sqlite' = process.env.ARES_BACKEND || 'json';
```

Benefits:
- JSON for dev/testing (human-readable)
- SQLite for prod (indexed, concurrent)

---

## Success Criteria

- ✅ 36/36 tests passing
- ✅ GraphQL server starts on port 4000
- ✅ JSON storage persists graph correctly
- ✅ UI demo renders without errors
- ✅ Conflicts highlighted in red
- ✅ Export to DOT works
- ✅ Deterministic merge (stable global IDs)

---

## Future Enhancements (Phase 6+)

1. **Authentication:** JWT-based API auth
2. **Real-time Updates:** WebSocket subscriptions
3. **Advanced UI:** Entity timeline, conflict resolution UI
4. **Multi-user:** Collaborative graph editing
5. **Versioning:** Git-like version control for graphs
6. **Performance:** Caching, pagination, indexes
