# ARES API Reference

ARES provides a GraphQL API for querying and manipulating knowledge graphs.

## Table of Contents

- [Getting Started](#getting-started)
- [GraphQL Endpoint](#graphql-endpoint)
- [Authentication](#authentication)
- [Queries](#queries)
- [Mutations](#mutations)
- [Types](#types)
- [Pagination](#pagination)
- [Caching](#caching)
- [Rate Limiting](#rate-limiting)
- [Examples](#examples)

## Getting Started

### Starting the API Server

```bash
# Start the GraphQL API (port 4000)
npm run dev

# API will be available at:
# http://localhost:4000/graphql
```

### GraphQL Playground

Open http://localhost:4000/graphql in your browser to access the GraphQL Playground for interactive API exploration.

## GraphQL Endpoint

```
POST http://localhost:4000/graphql
Content-Type: application/json

{
  "query": "...",
  "variables": {...}
}
```

## Authentication

Currently, ARES API runs locally without authentication. Future versions may add:
- API key authentication
- JWT tokens
- User sessions

## Queries

### Entity Queries

#### `entities`

Get all entities with optional filters.

**Arguments:**
- `type: String` - Filter by entity type (PERSON, PLACE, ORG, etc.)
- `name: String` - Filter by name (partial match)

**Example:**
```graphql
query GetPeople {
  entities(type: "PERSON") {
    id
    canonical
    type
    aliases
    centrality
  }
}
```

#### `entitiesConnection`

Get entities with cursor-based pagination (Relay-style).

**Arguments:**
- `type: String` - Filter by entity type
- `name: String` - Filter by name
- `first: Int` - Get first N items
- `after: Cursor` - Cursor for forward pagination
- `last: Int` - Get last N items
- `before: Cursor` - Cursor for backward pagination

**Example:**
```graphql
query GetPeoplePaginated {
  entitiesConnection(type: "PERSON", first: 10) {
    edges {
      cursor
      node {
        id
        canonical
        type
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
    totalCount
  }
}
```

### Relation Queries

#### `relations`

Get all relations with optional filters.

**Arguments:**
- `predicate: String` - Filter by predicate (married_to, parent_of, etc.)
- `subjectId: ID` - Filter by subject entity
- `objectId: ID` - Filter by object entity

**Example:**
```graphql
query GetMarriages {
  relations(predicate: "married_to") {
    id
    subject {
      canonical
    }
    predicate
    object {
      canonical
    }
    confidence
    evidence {
      docId
      span {
        text
      }
    }
  }
}
```

#### `relationsConnection`

Get relations with cursor-based pagination.

**Arguments:**
- `predicate: String` - Filter by predicate
- `subjectId: ID` - Filter by subject
- `objectId: ID` - Filter by object
- `first: Int` / `after: Cursor` - Forward pagination
- `last: Int` / `before: Cursor` - Backward pagination

**Example:**
```graphql
query GetRelationsPaginated {
  relationsConnection(first: 20) {
    edges {
      node {
        subject { canonical }
        predicate
        object { canonical }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Conflict Queries

#### `conflicts`

Get conflicts (contradictory or ambiguous extractions).

**Arguments:**
- `subjectId: ID` - Filter by subject entity
- `type: String` - Filter by conflict type

**Example:**
```graphql
query GetConflicts {
  conflicts {
    type
    severity
    description
    relations {
      predicate
      subject { canonical }
      object { canonical }
    }
  }
}
```

### Graph Queries

#### `graph`

Get the entire knowledge graph.

**Returns:**
- All entities
- All relations
- All conflicts
- Metadata

**Example:**
```graphql
query GetFullGraph {
  graph {
    entities {
      id
      canonical
      type
    }
    relations {
      subject { canonical }
      predicate
      object { canonical }
    }
    metadata {
      entityCount
      relationCount
      documentCount
    }
  }
}
```

### Search Query

#### `search`

Full-text search across entities and relations.

**Arguments:**
- `project: String!` - Project name
- `text: String!` - Search query
- `limit: Int` - Max results (default: 20)

**Example:**
```graphql
query SearchGraph {
  search(project: "lotr", text: "ring", limit: 10) {
    hits {
      id
      kind
      label
      snippet
      score
    }
    entityTypes {
      name
      count
    }
    predicates {
      name
      count
    }
  }
}
```

**Features:**
- Full-text search with Lunr.js
- Field boosting (label x10, type x5)
- Snippet generation (100 chars context)
- Faceted results (entity types, predicates)
- 30s cache TTL

### Graph Traversal

#### `graphNeighborhood`

Get neighborhood of entities around a center node (BFS traversal).

**Arguments:**
- `project: String!` - Project name
- `centerId: String!` - Center entity ID
- `depth: Int!` - Traversal depth (1-2)
- `limit: Int` - Max nodes (default: 50, max: 200)

**Example:**
```graphql
query GetNeighborhood {
  graphNeighborhood(
    project: "lotr",
    centerId: "frodo",
    depth: 2,
    limit: 50
  ) {
    nodes {
      id
      name
      types
    }
    edges {
      id
      subject
      predicate
      object
      symmetric
    }
  }
}
```

#### `graphByPredicate`

Get all relations of specific type(s).

**Arguments:**
- `project: String!` - Project name
- `predicates: [String!]!` - Relation types
- `limit: Int` - Max relations (default: 100, max: 500)

**Example:**
```graphql
query GetFamilyRelations {
  graphByPredicate(
    project: "lotr",
    predicates: ["parent_of", "child_of", "sibling_of"],
    limit: 100
  ) {
    nodes {
      id
      name
      types
    }
    edges {
      subject
      predicate
      object
    }
  }
}
```

## Mutations

### Review Operations

#### `approveEntity`

Approve an entity for inclusion in the graph.

**Arguments:**
- `project: String!` - Project name
- `entityId: ID!` - Entity to approve

**Example:**
```graphql
mutation ApproveEntity {
  approveEntity(project: "lotr", entityId: "ent-123") {
    success
    message
  }
}
```

#### `dismissEntity`

Dismiss an entity as incorrect.

**Arguments:**
- `project: String!` - Project name
- `entityId: ID!` - Entity to dismiss

**Example:**
```graphql
mutation DismissEntity {
  dismissEntity(project: "lotr", entityId: "ent-456") {
    success
    message
  }
}
```

### Bulk Review

#### `approveReviewBulk`

Approve multiple entities/relations in bulk.

**Arguments:**
- `project: String!` - Project name
- `filter: ReviewFilter!` - Selection criteria

**Filter Fields:**
- `type: String` - "entity" or "relation"
- `entityType: String` - Filter by entity type
- `predicate: String` - Filter by relation predicate
- `minConfidence: Float` - Minimum confidence threshold
- `maxConfidence: Float` - Maximum confidence threshold
- `namePattern: String` - Regex pattern for names
- `maxItems: Int` - Limit (default: 100, max: 500)

**Example:**
```graphql
mutation ApproveHighConfidence {
  approveReviewBulk(
    project: "lotr",
    filter: {
      type: "entity",
      minConfidence: 0.8,
      maxItems: 50
    }
  ) {
    processed
    approved
    dismissed
    errors
  }
}
```

#### `dismissReviewBulk`

Dismiss multiple entities/relations in bulk.

**Example:**
```graphql
mutation DismissLowConfidence {
  dismissReviewBulk(
    project: "lotr",
    filter: {
      type: "entity",
      maxConfidence: 0.3,
      maxItems: 100
    }
  ) {
    processed
    approved
    dismissed
  }
}
```

#### `previewBulkAction`

Preview what would be affected by a bulk operation (dry-run).

**Example:**
```graphql
query PreviewBulkDismiss {
  previewBulkAction(
    project: "lotr",
    filter: {
      type: "entity",
      maxConfidence: 0.3
    }
  ) {
    count
    items {
      id
      type
      confidence
      label
    }
  }
}
```

## Types

### Entity

```graphql
type Entity {
  id: ID!                   # Unique identifier
  type: String!             # PERSON, PLACE, ORG, DATE, etc.
  canonical: String!        # Primary name
  aliases: [String!]!       # Alternative names
  centrality: Float         # Graph centrality score
  createdAt: String!        # ISO timestamp
  localIds: [String!]!      # Document-specific IDs
}
```

### Relation

```graphql
type Relation {
  id: ID!                   # Unique identifier
  subject: Entity!          # Subject entity
  predicate: String!        # Relation type
  object: Entity!           # Object entity
  confidence: Float!        # Confidence score (0-1)
  extractor: String         # Extraction method
  qualifiers: [Qualifier!]  # Metadata (time, place, etc.)
  evidence: [Evidence!]!    # Source evidence
}
```

### Evidence

```graphql
type Evidence {
  docId: String!            # Document ID
  span: Span!               # Text span
  sentenceIndex: Int!       # Sentence number
  source: String!           # Extraction source (RULE, NER, etc.)
}
```

### Span

```graphql
type Span {
  start: Int!               # Character offset (start)
  end: Int!                 # Character offset (end)
  text: String!             # Extracted text
}
```

### Qualifier

```graphql
type Qualifier {
  type: String!             # Qualifier type (time, place, etc.)
  value: String!            # Qualifier value
  entityId: String          # Related entity (optional)
  span: [Int!]              # Character offsets
}
```

### Conflict

```graphql
type Conflict {
  type: String!             # Conflict type
  severity: Int!            # Severity (1-10)
  description: String!      # Human-readable description
  relations: [Relation!]!   # Conflicting relations
}
```

## Pagination

ARES uses **Relay-style cursor pagination** for efficient large result sets.

### Forward Pagination

Get first N items:

```graphql
{
  entitiesConnection(first: 10) {
    edges {
      cursor
      node { ... }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

Get next page:

```graphql
{
  entitiesConnection(first: 10, after: "cursor-from-previous-query") {
    # ...
  }
}
```

### Backward Pagination

Get last N items:

```graphql
{
  entitiesConnection(last: 10) {
    edges {
      cursor
      node { ... }
    }
    pageInfo {
      hasPreviousPage
      startCursor
    }
  }
}
```

## Caching

ARES implements **LRU caching** with TTL for performance:

### Cache Configuration

- **Query cache**: 300 keys, 2.5s TTL
- **Graph cache**: 100 keys, 5s TTL
- **Search cache**: 200 keys, 3s TTL

### Cache Invalidation

Caches are automatically invalidated on mutations:
- Entity approve/dismiss → clear entity caches
- Relation approve/dismiss → clear relation caches
- Bulk operations → clear matching pattern caches

### Performance

- **Cache hit rate**: 70-80% typical
- **Latency reduction**: ~60% with caching
- **Memory usage**: <50MB for 10K entities

## Rate Limiting

ARES uses **token bucket** rate limiting:

### Configuration

- **Rate**: 12 requests per second
- **Burst**: Up to 12 simultaneous requests
- **Per-client**: Tracked by IP or X-Forwarded-For header

### Response Headers

```
X-RateLimit-Limit: 12
X-RateLimit-Remaining: 11
X-RateLimit-Reset: 1234567890
```

### Exceeded Response

```json
{
  "errors": [{
    "message": "Rate limit exceeded",
    "extensions": {
      "code": "RATE_LIMIT_EXCEEDED",
      "retryAfter": 833
    }
  }]
}
```

## Examples

### Complete Entity with Relations

```graphql
query GetEntityDetails {
  entities(name: "Gandalf") {
    id
    canonical
    aliases
    type

    # Find all relations where this entity is subject
    relationsAsSubject: relations(subjectId: $id) {
      predicate
      object {
        canonical
        type
      }
      confidence
      evidence {
        span {
          text
        }
      }
    }

    # Find all relations where this entity is object
    relationsAsObject: relations(objectId: $id) {
      predicate
      subject {
        canonical
        type
      }
    }
  }
}
```

### Search and Filter

```graphql
query SearchAndFilter {
  # Full-text search
  search(project: "lotr", text: "ring") {
    hits {
      kind
      label
      snippet
      score
    }
  }

  # Filter by type
  entities(type: "THING", name: "ring") {
    canonical
    aliases
  }

  # Get specific relations
  relations(predicate: "possesses", objectId: "ring-id") {
    subject {
      canonical
    }
  }
}
```

### Batch Operations

```graphql
mutation ReviewBatch {
  # Preview what will be affected
  preview: previewBulkAction(
    project: "lotr",
    filter: { type: "entity", minConfidence: 0.8 }
  ) {
    count
  }

  # Approve high-confidence entities
  approve: approveReviewBulk(
    project: "lotr",
    filter: { type: "entity", minConfidence: 0.8, maxItems: 100 }
  ) {
    processed
    approved
  }

  # Dismiss low-confidence entities
  dismiss: dismissReviewBulk(
    project: "lotr",
    filter: { type: "entity", maxConfidence: 0.3, maxItems: 50 }
  ) {
    processed
    dismissed
  }
}
```

## Metrics

ARES exposes **Prometheus-compatible metrics** on port 4100:

```
http://localhost:4100/metrics
```

### Available Metrics

- `ares_api_queries_total` - Total GraphQL queries
- `ares_api_mutations_total` - Total mutations
- `ares_api_search_total` - Search queries
- `ares_api_graph_neighborhood_total` - Graph traversals
- `ares_api_rate_limited_total` - Rate limit hits
- `ares_review_bulk_approved_total` - Bulk approvals
- `ares_review_bulk_dismissed_total` - Bulk dismissals

## Error Handling

### Error Format

```json
{
  "errors": [{
    "message": "Error description",
    "extensions": {
      "code": "ERROR_CODE",
      "details": {...}
    },
    "path": ["query", "field"]
  }]
}
```

### Common Error Codes

- `RATE_LIMIT_EXCEEDED` - Too many requests
- `INVALID_INPUT` - Invalid query parameters
- `NOT_FOUND` - Entity/relation not found
- `INTERNAL_ERROR` - Server error

## Best Practices

1. **Use pagination** for large result sets
2. **Request only needed fields** to reduce payload
3. **Use caching** by avoiding frequent identical queries
4. **Preview bulk operations** before executing
5. **Monitor rate limits** via response headers
6. **Use graph traversal** instead of fetching all data

## Further Reading

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) - Extending the API
- GraphQL Specification: https://graphql.org/

---

**The ARES GraphQL API provides powerful, flexible access to your knowledge graph.**
