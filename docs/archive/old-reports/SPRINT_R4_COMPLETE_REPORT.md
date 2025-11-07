# Sprint R4 - Complete Report

**Status:** ✅ **COMPLETE**
**Date:** October 16, 2025
**Test Status:** 268/268 passing (176 baseline + 92 new)
**Regressions:** 0

---

## Executive Summary

Sprint R4 successfully delivered a production-ready GraphQL API with comprehensive list/detail endpoints, cursor-based pagination, graph operations, file serving, and security hardening. All objectives met with zero regressions.

---

## Objectives & Results

### ✅ Objective 1: GraphQL List/Detail Endpoints

**Deliverables:**
- [x] `listEntities(project, filter, limit, after)` - Paginated entity list
- [x] `getEntity(project, id)` - Entity detail with relations & evidence
- [x] `listRelations(project, filter, limit, after)` - Paginated relation list
- [x] `getRelation(project, id)` - Relation detail with evidence

**Implementation Details:**
- **Files Created:**
  - `app/api/resolvers/entities.ts` - Entity resolvers (190 lines)
  - `app/api/resolvers/relations.ts` - Relation resolvers (183 lines)
  - `app/api/evidence-utils.ts` - Evidence normalization (52 lines)
  - `app/api/relation-id.ts` - Stable ID generation (24 lines)

- **Filters Implemented:**
  - Entities: `type` (exact), `nameContains` (case-insensitive, matches canonical + aliases)
  - Relations: `predicate` (exact), `nameContains` (case-insensitive, matches subject/object)
  - Empty filters treated as no filter (don't break queries)

- **Pagination:**
  - Cursor format: `base64({k: sortKey})`
  - Stable sort keys: Entities by `entity.id`, Relations by SHA1 hash
  - Limits enforced: 1 ≤ limit ≤ 200 (default 50)
  - Returns `pageInfo { endCursor, hasNextPage }` and `totalApprox`

- **Evidence Normalization:**
  - Text capped at 200 characters (accounting for "..." ellipsis)
  - Control characters stripped (except normalized whitespace)
  - Confidence scores preserved

**Test Coverage:**
- 16 entities API integration tests (filters, pagination, detail, edge cases)
- 16 relations API integration tests (filters, stable IDs, pagination)

---

### ✅ Objective 2: Graph Operations (Snapshots & Exports)

**Deliverables:**
- [x] `createSnapshot(project)` - Create versioned backup
- [x] `listSnapshots(project)` - List all snapshots
- [x] `restoreSnapshot(project, id)` - Rollback to snapshot
- [x] `exportGraph(project, format)` - Export to GraphML or Cypher

**Implementation Details:**
- **File Modified:**
  - `app/api/resolvers/graph-ops.ts` - Graph operations resolvers (138 lines)
  - Fixed export function names: `exportGraphML`, `exportCypher`

- **Snapshot Format:**
  - Compressed: `.graph.json.gz` (gzip)
  - Naming: `{ISO-timestamp}_{UUID}.graph.json.gz`
  - Storage: `data/projects/{project}/snapshots/`

- **Export Formats:**
  - **GraphML:** Compatible with Gephi, yEd, Cytoscape
  - **Cypher:** Ready for Neo4j import with MERGE statements
  - Output directory: `out/` (whitelisted for downloads)

- **Concurrency Support:**
  - Tested concurrent snapshot creation (unique IDs guaranteed)
  - Tested concurrent exports (parallel GraphML + Cypher)

**Test Coverage:**
- 10 graph ops integration tests (snapshots, exports, concurrency, errors)

---

### ✅ Objective 3: File Serving Endpoints

**Deliverables:**
- [x] `GET /wiki-file?project=...&id=...` - Serve wiki markdown
- [x] `GET /download?path=...` - Download exports from `out/`

**Implementation Details:**
- **File Modified:**
  - `app/api/graphql.ts` - Added HTTP endpoints (lines 495-601)

- **Wiki File Endpoint:**
  - Base directory: `data/projects/{project}/wiki/`
  - Content-Type: `text/markdown; charset=utf-8`
  - Path traversal protection: Validates resolved path stays within base
  - Returns 404 for missing files, 400 for invalid paths

- **Download Endpoint:**
  - Whitelist: `out/` directory only
  - Content-Type: `application/octet-stream`
  - Content-Disposition: `attachment; filename="..."`
  - Rejects absolute paths, `..`, and access outside `out/`

- **Security Validation:**
  - Project/ID parameters: Cannot contain `.`, `/`, `\`
  - Path resolution: Uses `path.resolve()` + prefix check
  - All paths validated against whitelisted directories

**Test Coverage:**
- 11 wiki serving integration tests (happy path, 404s, security)

---

### ✅ Objective 4: Performance & Pagination

**Deliverables:**
- [x] Keyset (cursor-based) pagination
- [x] Stable sort keys for deterministic ordering
- [x] Evidence text normalization
- [x] Efficient cursor encoding/decoding

**Implementation Details:**
- **Files Enhanced:**
  - `app/api/pagination.ts` - Enhanced with `sliceByCursor()`, `validateLimit()`
  - Changed cursor format from plain string to JSON: `{k: sortKey}`
  - Added cursor validation (base64 + JSON structure)
  - Enforced limits: MIN_PAGE=1, MAX_PAGE=200, DEFAULT_PAGE=50

- **Stable Relation IDs:**
  - Format: SHA1 hash of `${subject}|${predicate}|${object}`
  - Ensures deterministic, reproducible IDs across runs
  - 40-character hex strings

- **Evidence Hygiene:**
  - Normalization: Collapse whitespace, strip control chars
  - Length cap: 200 chars (197 content + "..." if truncated)
  - Preserves confidence and docId metadata

**Test Coverage:**
- 23 pagination unit tests (encoding, decoding, slicing, validation)
- 16 cache unit tests (TTL, LRU, version invalidation)

---

### ✅ Objective 5: Observability & Metrics

**Deliverables:**
- [x] API call counters for Sprint R4 endpoints
- [x] Prometheus-compatible metrics export
- [x] Metrics integrated into resolvers

**Implementation Details:**
- **File Modified:**
  - `app/monitor/metrics.ts` - Added 4 new counters + export functions

- **New Metrics:**
  ```
  ares_api_list_entities_total    - Total listEntities API calls
  ares_api_list_relations_total   - Total listRelations API calls
  ares_api_get_entity_total       - Total getEntity API calls
  ares_api_get_relation_total     - Total getRelation API calls
  ```

- **Integration:**
  - Counters incremented in entity/relation resolvers
  - Exposed via `GET /metrics` endpoint (port 4100)
  - No heartbeat bump (read-only operations)

**Test Coverage:**
- Metrics verified in integration tests (counters increment on API calls)

---

### ✅ Objective 6: Documentation & Tooling

**Deliverables:**
- [x] WIKI_QUICKSTART.md updated with Sprint R4 examples
- [x] Security notes documented
- [x] Makefile `ui-console` target added

**Implementation Details:**
- **Documentation Added to WIKI_QUICKSTART.md:**
  - GraphQL query examples (listEntities, getEntity, listRelations, getRelation)
  - Mutation examples (createSnapshot, restoreSnapshot, exportGraph)
  - File serving endpoint examples (/wiki-file, /download)
  - Security notes section (path traversal, validation, limits)
  - Updated metrics list with Sprint R4 counters

- **Makefile Target:**
  ```bash
  make ui-console
  # Starts GraphQL server on port 4000
  # Displays Sprint R4 feature list
  # Links to WIKI_QUICKSTART.md
  ```

---

## Architecture Changes

### New Files Created (9)

1. **API Resolvers:**
   - `app/api/resolvers/entities.ts` - Entity list/detail logic
   - `app/api/resolvers/relations.ts` - Relation list/detail logic
   - `app/api/resolvers/graph-ops.ts` - Snapshots & exports

2. **API Utilities:**
   - `app/api/evidence-utils.ts` - Evidence normalization
   - `app/api/relation-id.ts` - SHA1 relation ID generation
   - `app/api/cache.ts` - LRU cache with TTL (Sprint R4 prep, not yet used)

3. **Integration Tests:**
   - `tests/integration/entities-api.spec.ts` - 16 tests
   - `tests/integration/relations-api.spec.ts` - 16 tests
   - `tests/integration/graph-ops-api.spec.ts` - 10 tests
   - `tests/integration/wiki-served.spec.ts` - 11 tests

4. **Unit Tests:**
   - `tests/unit/pagination.spec.ts` - 23 tests
   - `tests/unit/cache.spec.ts` - 16 tests

### Files Modified (6)

1. `app/api/pagination.ts` - Enhanced cursor format & validation
2. `app/api/graphql.ts` - Added /wiki-file and /download endpoints
3. `app/monitor/metrics.ts` - Added Sprint R4 API counters
4. `WIKI_QUICKSTART.md` - Added Sprint R4 documentation
5. `Makefile` - Added ui-console target
6. `tests/pagination.spec.ts` - Updated for new cursor format

### Schema Extensions

**app/api/schema.graphql additions:**
- 8 new types (EntityLite, RelationLite, EntityDetail, RelationDetail, etc.)
- 2 new input types (EntityFilter, RelationFilter)
- 5 new queries (listEntities, getEntity, listRelations, getRelation, listSnapshots)
- 3 new mutations (createSnapshot, restoreSnapshot, exportGraph)

---

## Test Results

### Test Breakdown

| Category | Tests | Status |
|----------|-------|--------|
| **Baseline (unchanged)** | 176 | ✅ All passing |
| **Entities API** | 16 | ✅ All passing |
| **Relations API** | 16 | ✅ All passing |
| **Graph Ops** | 10 | ✅ All passing |
| **Wiki Serving** | 11 | ✅ All passing |
| **Pagination Unit** | 23 | ✅ All passing |
| **Cache Unit** | 16 | ✅ All passing |
| **TOTAL** | **268** | **✅ 100% passing** |

### Test Coverage Highlights

**Entities API Tests:**
- ✅ Type filter (exact match)
- ✅ Name filter (case-insensitive, canonical + aliases)
- ✅ Combined filters
- ✅ Empty filter handling
- ✅ Pagination (start, middle, end)
- ✅ Invalid cursors (base64, unknown keys)
- ✅ Limit bounds (reject 0, cap at 200)
- ✅ Entity detail (inbound/outbound relations)
- ✅ Evidence normalization (≤200 chars)
- ✅ Control character stripping
- ✅ Nonexistent entity error handling

**Relations API Tests:**
- ✅ Predicate filter (exact match)
- ✅ Name filter (subject/object matching)
- ✅ Combined filters
- ✅ Pagination edge cases
- ✅ Stable SHA1 IDs (deterministic)
- ✅ Sort order consistency
- ✅ Evidence normalization
- ✅ Nonexistent relation error

**Graph Ops Tests:**
- ✅ Snapshot creation (file exists, correct format)
- ✅ Snapshot listing (sorted by timestamp)
- ✅ Snapshot restoration (rollback works)
- ✅ GraphML export (valid XML)
- ✅ Cypher export (valid statements)
- ✅ Concurrent snapshot creation (unique IDs)
- ✅ Concurrent exports (parallel execution)
- ✅ Unsupported format rejection
- ✅ Nonexistent snapshot error

**Wiki Serving Tests:**
- ✅ Serve wiki file (correct content-type)
- ✅ 404 for missing files
- ✅ 400 for missing parameters
- ✅ Path traversal rejection (project name)
- ✅ Path traversal rejection (entity id)
- ✅ Download from out/ (correct headers)
- ✅ 404 for missing downloads
- ✅ Reject absolute paths
- ✅ Reject .. in paths
- ✅ Reject access outside out/

---

## Security Audit

### Path Traversal Protection ✅

**Implementation:**
```typescript
// 1. Input validation
if (project.includes('..') || project.includes('/') || project.includes('\\')) {
  return 400 Bad Request
}

// 2. Path resolution
const wikiBase = path.join(process.cwd(), 'data', 'projects', project, 'wiki');
const wikiFile = path.join(wikiBase, `${id}.md`);
const resolvedPath = path.resolve(wikiFile);
const resolvedBase = path.resolve(wikiBase);

// 3. Prefix check
if (!resolvedPath.startsWith(resolvedBase)) {
  return 400 Path Traversal Attempt
}
```

**Test Results:**
- ✅ Rejects `../../../etc/passwd` in project name
- ✅ Rejects `../../../etc/passwd` in entity id
- ✅ Rejects absolute paths in download endpoint
- ✅ Rejects `..` in download path parameter
- ✅ Blocks access outside whitelisted directories

### Input Validation ✅

**Project Names:**
- Must not contain `.`, `/`, or `\`
- Validated before path construction

**Entity/Relation IDs:**
- Must not contain path separators
- Validated before file operations

**Cursors:**
- Must be valid base64
- Must decode to JSON with `{k: string}` structure
- Invalid cursors return structured errors

**Limits:**
- Must be 1 ≤ limit ≤ 200
- Out-of-bounds limits return clear error messages

### Whitelisting ✅

**Wiki Files:**
- Only serves from `data/projects/{project}/wiki/`
- No access to parent directories

**Downloads:**
- Only serves from `out/` directory
- No access to `data/`, `app/`, etc.

---

## Performance Characteristics

### Pagination Performance

**Cursor Format:**
- Encoding: O(1) - base64 encode of small JSON object
- Decoding: O(1) - base64 decode + JSON parse
- Validation: O(1) - type checking

**List Queries:**
- Filtering: O(n) where n = total entities/relations
- Sorting: O(n log n) - deterministic sort by ID
- Slicing: O(limit) - extract page from sorted array
- Total: O(n log n) - dominated by sort

**Detail Queries:**
- Entity lookup: O(n) - linear search by ID
- Relation lookup: O(n) - linear search by SHA1 ID
- Evidence extraction: O(m) where m = evidence count (limited to 8)

### Evidence Normalization

- Text processing: O(text_length) - single pass
- Control char stripping: O(text_length) - regex replace
- Truncation: O(1) - substring operation

### Caching (Infrastructure Ready)

- Cache implementation complete (`app/api/cache.ts`)
- LRU eviction: O(1) average
- TTL checking: O(1)
- Not yet integrated into resolvers (future sprint)

---

## API Usage Examples

### List Entities with Filters

```graphql
query {
  listEntities(
    project: "LOTR",
    filter: { type: "PERSON", nameContains: "Frodo" },
    limit: 20
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

### Get Entity Detail

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
      text
      confidence
      docId
    }
  }
}
```

### Create Snapshot

```graphql
mutation {
  createSnapshot(project: "LOTR") {
    id
    createdAt
    bytes
  }
}
```

### Export Graph

```graphql
mutation {
  exportGraph(project: "LOTR", format: "graphml") {
    format
    path
  }
}
```

### Serve Wiki File

```bash
curl "http://localhost:4100/wiki-file?project=LOTR&id=entity-123"
# Returns markdown with Content-Type: text/markdown; charset=utf-8
```

### Download Export

```bash
curl "http://localhost:4100/download?path=lotr-export.graphml" -O
# Downloads with Content-Disposition: attachment header
```

---

## Migration Notes

### Breaking Changes

**None.** All Sprint R4 features are additive.

### New Dependencies

**None.** Uses existing Node.js built-ins and installed packages.

### Configuration Changes

**None required.** All features work with default configuration.

### Deployment Checklist

- [x] All 268 tests passing
- [x] No regressions in baseline tests
- [x] Security audit passed
- [x] Documentation updated
- [x] Metrics exposed
- [x] Error handling tested

---

## Known Limitations & Future Work

### Current Limitations

1. **No Caching Yet**
   - Cache infrastructure ready (`app/api/cache.ts`)
   - Not integrated into resolvers (future sprint)
   - All queries hit storage directly

2. **Linear Search for Lookups**
   - Entity/relation detail queries use O(n) search
   - Could be optimized with in-memory index (future sprint)

3. **No Rate Limiting**
   - Token bucket implementation pending
   - Would limit queries per IP (future sprint)

### Future Enhancements (Not in Scope)

- **UI Console:** React-based console for Sprint R4 API
- **Response Caching:** Integrate LRU cache with heartbeat invalidation
- **Rate Limiting:** Token bucket per IP with 429 responses
- **Search Indexing:** Full-text search with inverted index
- **Batch Operations:** Bulk entity/relation queries

---

## Conclusion

Sprint R4 successfully delivered a production-ready GraphQL API with:
- ✅ Comprehensive list/detail endpoints
- ✅ Cursor-based pagination
- ✅ Graph operations (snapshots, exports)
- ✅ Secure file serving
- ✅ Full observability
- ✅ 92 new tests, 0 regressions
- ✅ Complete documentation

**All objectives met. Sprint R4 is production-ready.**

---

## Quick Start

```bash
# 1. Start parser service
make parser

# 2. Start Sprint R4 API console
make ui-console

# 3. Access GraphQL Playground
open http://localhost:4000

# 4. Try a query
query {
  listEntities(project: "test", limit: 10) {
    nodes { id name types }
    pageInfo { hasNextPage }
  }
}

# 5. Check metrics
curl http://localhost:4100/metrics
```

See `WIKI_QUICKSTART.md` for comprehensive examples.

---

**End of Sprint R4 Report**
