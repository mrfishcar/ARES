# ARES Wiki - Quick Start Guide

**Notebook → Wiki pipeline with confidence gating and review queue**

Built on ARES's production-ready extraction engine (79% recall, 86% precision, 119/119 tests passing).

## Features

✅ **Leverages existing ARES extraction** - All the sophisticated patterns we just built!
✅ **Confidence gating** - Auto-accept high-confidence (≥70%), review medium (40-70%), reject low (<40%)
✅ **Review queue** - Human-in-the-loop for borderline cases
✅ **Wiki generation** - Beautiful Markdown pages with provenance, evidence, and stats
✅ **Project-based** - Organize knowledge by project/world

## Installation

```bash
# Already installed if you've run `make install`
npm install
```

## Quick Demo (60 seconds)

```bash
# 1. Start parser service (Terminal 1)
make parser

# 2. Ingest a sample note (Terminal 2)
npx ts-node cli/ares-wiki.ts ingest samples/barty-note.txt Barty

# 3. Generate wiki
npx ts-node cli/ares-wiki.ts rebuild Barty

# 4. View the wiki
open wiki/Barty/INDEX.md
# Or: ls wiki/Barty/
```

You should see:
- `wiki/Barty/INDEX.md` - Entity index grouped by type
- `wiki/Barty/barty-beauregard.md` - Entity page with relations and evidence
- `wiki/Barty/mildred-plume.md` - Another entity page
- `wiki/Barty/STATS.md` - Graph statistics

## CLI Commands

### Ingest Documents

```bash
# Ingest a note (uses ARES extraction + confidence gating)
npx ts-node cli/ares-wiki.ts ingest <file.txt> [project]

# Example: Ingest Tolkien notes into "LOTR" project
npx ts-node cli/ares-wiki.ts ingest notes/fellowship.txt LOTR
```

**What happens:**
1. Runs ARES extraction (entity + relation extraction)
2. Auto-accepts high-confidence items (≥70%)
3. Queues medium-confidence items for review (40-69%)
4. Silently rejects low-confidence items (<40%)
5. Saves to `data/projects/<project>/graph.json`

### Generate Wiki

```bash
# Generate Markdown wiki from knowledge graph
npx ts-node cli/ares-wiki.ts rebuild [project]

# Example
npx ts-node cli/ares-wiki.ts rebuild LOTR
```

**Output:**
- `wiki/<project>/INDEX.md` - Entity index by type
- `wiki/<project>/<entity>.md` - One page per entity with:
  - Relations (with confidence scores)
  - Evidence snippets
  - Provenance (which documents mentioned this entity)
- `wiki/<project>/STATS.md` - Graph statistics

### Review Queue

```bash
# Show pending reviews
npx ts-node cli/ares-wiki.ts review [project]

# Approve an item (adds to main graph)
npx ts-node cli/ares-wiki.ts approve <project> <item-id>

# Reject an item with optional reason
npx ts-node cli/ares-wiki.ts reject <project> <item-id> "Not relevant"

# Clean approved/rejected items from queue
npx ts-node cli/ares-wiki.ts clean [project]
```

**Example workflow:**
```bash
# 1. View pending reviews
npx ts-node cli/ares-wiki.ts review Barty

# Output:
# 🟡 Review Queue for project: Barty
#    3 items pending
#
# 🔗 Relations (3):
#    [abc12345] Barty --[knows]--> Someone
#       confidence: 0.55
#       evidence: "They might have known each other..."

# 2. Approve if correct
npx ts-node cli/ares-wiki.ts approve Barty abc12345

# 3. Or reject if incorrect
npx ts-node cli/ares-wiki.ts reject Barty abc12345 "Too vague"

# 4. Rebuild wiki with approved items
npx ts-node cli/ares-wiki.ts rebuild Barty
```

## Confidence Thresholds

Default gates (configurable in `app/storage/review-queue.ts`):

- **ACCEPT: 0.70** - Auto-accept if confidence ≥ 70%
- **REVIEW: 0.40** - Queue for review if confidence ≥ 40%
- **Reject: < 0.40** - Silently reject low confidence

## Project Structure

```
data/projects/
  └── <project>/
      ├── graph.json         # Main knowledge graph
      └── review.json        # Review queue

wiki/
  └── <project>/
      ├── INDEX.md           # Entity index
      ├── STATS.md           # Statistics
      └── <entity>.md        # One page per entity
```

## Advanced Usage

### Batch Ingest

```bash
# Ingest multiple documents
for file in notes/*.txt; do
  npx ts-node cli/ares-wiki.ts ingest "$file" MyProject
done

# Rebuild once after all ingests
npx ts-node cli/ares-wiki.ts rebuild MyProject
```

### Custom Confidence Thresholds

Edit `config/pipeline.json`:

```json
{
  "confidence": {
    "ACCEPT": 0.80,
    "REVIEW": 0.50
  },
  "watch": {
    "intervalMs": 3000,
    "rebuildDebounceMs": 5000,
    "incomingDir": "./incoming"
  }
}
```

### Watch Mode for Automatic Ingestion

```bash
# Watch a directory for new documents and auto-ingest
npx ts-node cli/ares-wiki.ts watch <project> [--dir ./incoming]

# Example: Watch ./incoming for new documents
npx ts-node cli/ares-wiki.ts watch LOTR --dir ./incoming

# Processed files are moved to ./incoming/processed/
# Wiki is automatically rebuilt after processing files (debounced)
```

**What happens:**
1. Watches the specified directory for new `.txt` and `.md` files
2. Automatically ingests each new file using ARES extraction
3. Applies confidence gating and queues items for review
4. Moves processed files to `./incoming/processed/`
5. Auto-rebuilds wiki after processing (with debounce to batch updates)

### Export for Visualization

```bash
# Export to GraphML (for Gephi, yEd, Cytoscape)
npx ts-node cli/ares-wiki.ts export <project> --format graphml --out out/<project>.graphml

# Export to Cypher (for Neo4j)
npx ts-node cli/ares-wiki.ts export <project> --format cypher --out out/<project>.cypher

# Examples
npx ts-node cli/ares-wiki.ts export LOTR --format graphml --out out/lotr.graphml
npx ts-node cli/ares-wiki.ts export LOTR --format cypher --out out/lotr.cypher
```

**GraphML Format:**
- Compatible with Gephi, yEd, Cytoscape
- Includes node attributes: name, type, aliases, centrality
- Includes edge attributes: predicate, confidence, symmetric flag

**Cypher Format:**
- Ready to import into Neo4j
- Uses MERGE to avoid duplicates
- Handles symmetric relations (creates both directions)
- Includes CREATE INDEX statements for performance

### Review Queue GraphQL API

Start the GraphQL server:

```bash
# Terminal 1: Start parser service
make parser

# Terminal 2: Start GraphQL server
npx ts-node -e "require('./app/api/graphql').startGraphQLServer(4000)"
```

Access GraphQL Playground at `http://localhost:4000`

**Example Queries:**

```graphql
# Get review queue stats
query {
  reviewStats(project: "LOTR") {
    entities
    relations
  }
}

# Get pending entities
query {
  pendingEntities(project: "LOTR", limit: 10) {
    id
    name
    types
    evidence {
      text
      confidence
    }
  }
}

# Get pending relations
query {
  pendingRelations(project: "LOTR", limit: 10) {
    id
    subject
    predicate
    object
    symmetric
    evidence {
      text
    }
  }
}
```

**Example Mutations:**

```graphql
# Approve a review item
mutation {
  approveReviewItem(project: "LOTR", id: "abc123")
}

# Dismiss a review item
mutation {
  dismissReviewItem(project: "LOTR", id: "def456")
}
```

### Search API

The GraphQL API now includes full-text search across entities and relations:

**Search Entities:**
```graphql
query {
  searchEntities(text: "Frodo", limit: 10) {
    id
    name
    type
    snippet  # Shows where the match was found (name or alias)
  }
}
```

**Search Relations:**
```graphql
query {
  searchRelations(text: "friend", limit: 10) {
    id
    name  # Full relation triple
    type
    snippet  # Shows confidence score
  }
}
```

Search is case-insensitive and matches across:
- Entity canonical names and aliases
- Relation subjects, predicates, and objects

### Sprint R4 GraphQL API (List/Detail Views)

The GraphQL API now includes comprehensive list and detail endpoints with cursor-based pagination:

**List Entities (with filters and pagination):**
```graphql
query {
  listEntities(
    project: "LOTR",
    filter: { type: "PERSON", nameContains: "Frodo" },
    limit: 50,
    after: "cursor-here"  # Optional: for pagination
  ) {
    nodes {
      id
      name
      types
      aliases
    }
    pageInfo {
      endCursor
      hasNextPage
    }
    totalApprox
  }
}
```

**Get Entity Detail:**
```graphql
query {
  getEntity(project: "LOTR", id: "entity-123") {
    entity {
      id
      name
      types
      aliases
    }
    inbound {
      id
      subject
      predicate
      object
      confidenceAvg
    }
    outbound {
      id
      subject
      predicate
      object
      confidenceAvg
    }
    evidence {
      text         # Normalized to ≤200 chars
      confidence
      docId
    }
  }
}
```

**List Relations (with filters and pagination):**
```graphql
query {
  listRelations(
    project: "LOTR",
    filter: { predicate: "knows", nameContains: "Frodo" },
    limit: 50,
    after: "cursor-here"  # Optional
  ) {
    nodes {
      id           # Stable SHA1 hash
      subject
      predicate
      object
      symmetric
      confidenceAvg
    }
    pageInfo {
      endCursor
      hasNextPage
    }
    totalApprox
  }
}
```

**Get Relation Detail:**
```graphql
query {
  getRelation(project: "LOTR", id: "relation-sha1-hash") {
    relation {
      id
      subject
      predicate
      object
      symmetric
      confidenceAvg
    }
    evidence {
      text
      confidence
      docId
    }
  }
}
```

### Sprint R6 Graph Visualization API

The GraphQL API now includes interactive graph visualization queries for exploring entity neighborhoods and relationship networks:

**Get Neighborhood Graph (BFS traversal):**
```graphql
query {
  graphNeighborhood(
    project: "LOTR",
    centerId: "aragorn",
    depth: 1,        # 1 or 2 hops
    limit: 50        # Max 200 nodes
  ) {
    nodes {
      id
      name
      types
    }
    edges {
      id              # Stable SHA1 hash
      subject
      object
      predicate
      symmetric
    }
  }
}
```

**Get Graph by Predicate:**
```graphql
query {
  graphByPredicate(
    project: "LOTR",
    predicate: "MARRIED_TO",
    limit: 100       # Max 500 edges
  ) {
    nodes {
      id
      name
      types
    }
    edges {
      id
      subject
      object
      predicate
      symmetric
    }
  }
}
```

**Graph Explorer UI:**

The console UI (Sprint R6) includes an interactive D3 force-directed graph visualization:

```bash
# Terminal 1: Start GraphQL server
make ui-console

# Terminal 2: Start Console UI
make ui-console-dev
```

Navigate to `http://localhost:3001/graph` or press `g+g`

**Features:**
- **Force-directed layout** - Automatic node positioning with physics simulation
- **Two modes:**
  - **Neighborhood**: Explore entity connections (BFS depth 1-2)
  - **By Predicate**: Filter relations by type (e.g., MARRIED_TO, LOCATED_IN)
- **Interactive:**
  - Click nodes → View entity details
  - Click edges → View relation evidence
  - Drag nodes to rearrange
  - Zoom/pan with mouse or keyboard (+/-)
- **Keyboard shortcuts:**
  - `f` - Focus search box
  - `Esc` - Close detail drawer
  - `+/-` - Zoom in/out
  - `r` - Refresh graph

**Use Cases:**
- Visualize entity relationships and networks
- Discover connected entities within 1-2 hops
- Analyze relationship patterns by predicate type
- Explore knowledge graph structure interactively

**Performance:**
- Supports up to 2000 nodes / 5000 edges
- Efficient BFS algorithm (O(V + E))
- Configurable limits and depth constraints

**Create & Restore Snapshots:**
```graphql
# Create snapshot
mutation {
  createSnapshot(project: "LOTR") {
    id
    createdAt
    bytes
  }
}

# List snapshots
query {
  listSnapshots(project: "LOTR") {
    id
    createdAt
    bytes
  }
}

# Restore snapshot
mutation {
  restoreSnapshot(project: "LOTR", id: "snapshot-id")
}
```

**Export Graph:**
```graphql
# Export to GraphML
mutation {
  exportGraph(project: "LOTR", format: "graphml") {
    format
    path  # Path in out/ directory
  }
}

# Export to Cypher
mutation {
  exportGraph(project: "LOTR", format: "cypher") {
    format
    path
  }
}
```

### File Serving Endpoints

**Serve Wiki Files (HTTP):**
```bash
# Get wiki markdown for an entity
curl "http://localhost:4100/wiki-file?project=LOTR&id=entity-123"

# Returns:
# Content-Type: text/markdown; charset=utf-8
# <markdown content>
```

**Download Exports (HTTP):**
```bash
# Download an export file from out/ directory
curl "http://localhost:4100/download?path=lotr-export.graphml" -O

# Returns:
# Content-Type: application/octet-stream
# Content-Disposition: attachment; filename="lotr-export.graphml"
```

### Security Notes

**Path Traversal Protection:**
- Wiki files: Only serves from `data/projects/{project}/wiki/` directory
- Downloads: Only serves from `out/` directory
- All paths are validated against path traversal attacks (`.`, `/`, `\`)
- Attempts to access files outside whitelisted directories return 400 errors

**Input Validation:**
- Project names cannot contain `.`, `/`, or `\`
- Entity IDs cannot contain path separators
- Cursor values are validated as base64-encoded JSON
- Pagination limits are enforced (1 ≤ limit ≤ 200)

**API Limits:**
- Maximum page size: 200 items
- Default page size: 50 items
- Invalid cursors return structured error messages

### Metrics & Observability

ARES exposes Prometheus-compatible metrics at `http://localhost:4100/metrics`:

**Available Metrics:**
- `ares_ingest_count_total` - Total documents ingested
- `ares_review_approved_total` - Total review items approved
- `ares_review_dismissed_total` - Total review items dismissed
- `ares_wiki_rebuild_count_total` - Total wiki rebuilds
- `ares_wiki_rebuild_last_ms` - Duration of last wiki rebuild (ms)
- `ares_heartbeat_last_updated_seconds` - Last update timestamp (for change detection)
- `ares_api_list_entities_total` - Total listEntities API calls (Sprint R4)
- `ares_api_list_relations_total` - Total listRelations API calls (Sprint R4)
- `ares_api_get_entity_total` - Total getEntity API calls (Sprint R4)
- `ares_api_get_relation_total` - Total getRelation API calls (Sprint R4)
- `ares_api_graph_neighborhood_total` - Total graphNeighborhood API calls (Sprint R6)
- `ares_api_graph_by_predicate_total` - Total graphByPredicate API calls (Sprint R6)

**Access Metrics:**
```bash
curl http://localhost:4100/metrics
```

**Health Checks:**
- `http://localhost:4000/healthz` - API health check
- `http://localhost:4000/readyz` - Readiness probe

### Snapshots (Rollback Support)

Create versioned backups of your knowledge graph:

**GraphQL API:**
```graphql
# Create snapshot
mutation {
  createSnapshot(project: "LOTR") {
    id
    path
    bytes
    createdAt
  }
}

# List snapshots
query {
  listSnapshots(project: "LOTR") {
    id
    bytes
    createdAt
  }
}

# Restore snapshot
mutation {
  restoreSnapshot(project: "LOTR", id: "2025-10-16T14-30-00-000Z_abc123") {
    success
  }
}
```

**Storage:**
Snapshots are stored as compressed `.graph.json.gz` files in:
```
data/projects/<project>/snapshots/
  └── <timestamp>_<uuid>.graph.json.gz
```

**Use Cases:**
- Before bulk imports
- Before experimental merges
- Regular backups for disaster recovery

### Review Dashboard (Web UI)

A React-based web interface for managing the review queue:

**Start the Review Dashboard:**
```bash
# Terminal 1: Start API server
npx ts-node app/api/graphql.js

# Terminal 2: Start Review Dashboard
cd app/ui/review-dashboard
npm run dev
```

Access at `http://localhost:5173`

**Features:**
- Real-time polling for queue updates (2s interval)
- Project selector (URL param or dropdown)
- Keyboard shortcuts:
  - `↑/↓` - Navigate items
  - `Enter` - Approve selected item
  - `Delete` - Dismiss selected item
- Auto-scroll on approve/dismiss
- Evidence inspection modal
- Loading indicators during polling

**URL Parameters:**
```
http://localhost:5173?project=LOTR
```

### Docker Deployment

Run the entire ARES stack with Docker:

**Quick Start:**
```bash
# 1. Copy environment template
cp .env.example .env

# 2. Build and start all services
docker-compose up --build -d

# 3. Check service health
docker-compose ps

# 4. View logs
docker-compose logs -f
```

**Services:**
- `parser` - Python NLP parser (port 8000)
- `api` - GraphQL API + metrics (ports 4000, 4100)
- `ui` - Review Dashboard (port 3000)
- `watch` - File system watcher for auto-ingestion

**Ingest Documents:**
```bash
# Copy documents to incoming volume
docker cp my-document.txt ares-watch:/app/incoming/

# Or mount a host directory (edit docker-compose.yml)
```

**Access Services:**
- GraphQL Playground: `http://localhost:4000`
- Review Dashboard: `http://localhost:3000`
- Metrics: `http://localhost:4100/metrics`

**Data Persistence:**
All data is stored in Docker volumes:
- `ares-data` - Knowledge graphs and review queues
- `ares-incoming` - Watched directory for new documents
- `ares-wiki` - Generated wiki pages

**Makefile Targets:**
```bash
make docker-build   # Build Docker image
make docker-run     # Run with docker-compose
make docker-stop    # Stop all containers
make docker-clean   # Remove containers and volumes
```

## What's Next?

1. ~~**Web UI**~~ ✅ Completed (Review Dashboard)
2. **Incremental updates** - Update wiki pages when graph changes
3. ~~**Search**~~ ✅ Completed (GraphQL search API)
4. ~~**Analytics**~~ ✅ Completed (Prometheus metrics)

## Integration with Existing ARES

This system **extends** ARES's existing functionality:

- ✅ Uses `appendDoc()` from `app/storage/storage.ts`
- ✅ Uses `extractFromSegments()` from extraction engine
- ✅ Preserves all provenance tracking
- ✅ Keeps all 119 tests passing
- ✅ Works with existing entity merging and conflict detection

**No existing functionality is replaced or broken.**

## Troubleshooting

### Parser not running
```bash
# Start parser service
make parser

# Or manually
. .venv/bin/activate && cd scripts && uvicorn parser_service:app --port 8000
```

### Graph not found
```bash
# Make sure you've ingested at least one document first
npx ts-node cli/ares-wiki.ts ingest samples/barty-note.txt MyProject
```

### No entities extracted
Check that your text contains proper nouns (capitalized names). ARES uses spaCy's NER which requires proper capitalization.

## License

Same as ARES (MIT or whatever you decide).

## Questions?

See [STATUS.md](STATUS.md) for detailed ARES metrics and architecture.
