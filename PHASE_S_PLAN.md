# ARES Phase S - Stability & Ops Plan

## Overview

Phase S (Stability) transforms ARES into a **production-grade system** with:
1. **SQLite Storage** - ACID transactions, migrations, WAL mode
2. **API Contract Stability** - Pagination, validation, versioning
3. **Observability** - Structured logging, metrics, tracing
4. **Security** - Auth, rate limiting, audit logs
5. **CI/CD** - Determinism tests, benchmarks, coverage

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│            Client Applications                  │
│  (Authenticated, rate-limited requests)         │
└──────────────────┬──────────────────────────────┘
                   │ API Key + Rate Limit
                   ▼
┌─────────────────────────────────────────────────┐
│         API Layer (GraphQL + Auth)              │
│  - Input validation (Zod)                       │
│  - Pagination (Relay connections)               │
│  - Request ID tracking                          │
│  - OpenTelemetry spans                          │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│        Observability Layer                      │
│  - Structured logs (pino)                       │
│  - Metrics (/metrics endpoint)                  │
│  - Tracing (OpenTelemetry)                      │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│      Storage Layer (SQLite + Migrations)        │
│  - WAL mode, foreign keys, indexes              │
│  - Idempotent ingest (content hash)             │
│  - Audit log (append-only)                      │
│  - Transactional writes                         │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│        Knowledge Graph Engine                   │
│  Extract → Merge → Query → Export → Validate   │
└─────────────────────────────────────────────────┘
```

---

## 1. Storage & Migrations

### SQLite Schema

```sql
-- Migration 0001_init.sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  canonical TEXT NOT NULL,
  aliases TEXT, -- JSON array
  centrality REAL,
  created_at TEXT NOT NULL,
  INDEX idx_entities_type (type),
  INDEX idx_entities_canonical (canonical)
);

CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY,
  subj TEXT NOT NULL,
  pred TEXT NOT NULL,
  obj TEXT NOT NULL,
  confidence REAL NOT NULL,
  extractor TEXT,
  qualifiers TEXT, -- JSON array
  evidence TEXT NOT NULL, -- JSON array
  created_at TEXT NOT NULL,
  FOREIGN KEY (subj) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (obj) REFERENCES entities(id) ON DELETE CASCADE,
  INDEX idx_relations_subj (subj),
  INDEX idx_relations_obj (obj),
  INDEX idx_relations_pred (pred)
);

CREATE TABLE IF NOT EXISTS conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  severity INTEGER NOT NULL,
  description TEXT NOT NULL,
  relations TEXT NOT NULL, -- JSON array of relation IDs
  detected_at TEXT NOT NULL,
  INDEX idx_conflicts_type (type)
);

CREATE TABLE IF NOT EXISTS provenance (
  local_id TEXT PRIMARY KEY,
  global_id TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  merged_at TEXT NOT NULL,
  local_canonical TEXT NOT NULL,
  FOREIGN KEY (global_id) REFERENCES entities(id) ON DELETE CASCADE,
  INDEX idx_provenance_global (global_id),
  INDEX idx_provenance_doc (doc_id)
);

CREATE TABLE IF NOT EXISTS documents (
  doc_id TEXT PRIMARY KEY,
  content_hash TEXT UNIQUE NOT NULL,
  text TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  entity_count INTEGER DEFAULT 0,
  relation_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Initial metadata
INSERT OR IGNORE INTO metadata (key, value) VALUES
  ('created_at', datetime('now')),
  ('schema_version', '1');
```

```sql
-- Migration 0002_add_audit.sql
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  request_id TEXT,
  action TEXT NOT NULL,
  user_id TEXT,
  ip_address TEXT,
  details TEXT, -- JSON
  INDEX idx_audit_timestamp (timestamp),
  INDEX idx_audit_action (action),
  INDEX idx_audit_request_id (request_id)
);
```

### Migration System

```typescript
// app/storage/migrate.ts
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

interface Migration {
  version: number;
  name: string;
  up: string;
  down?: string;
}

export class MigrationRunner {
  constructor(private db: Database.Database) {}

  async migrate(target?: number): Promise<void> {
    const migrations = this.loadMigrations();
    const current = this.getCurrentVersion();

    if (target === undefined) {
      target = migrations.length;
    }

    if (target > current) {
      // Migrate up
      for (let i = current; i < target; i++) {
        await this.runMigration(migrations[i], 'up');
      }
    } else if (target < current) {
      // Migrate down
      for (let i = current - 1; i >= target; i--) {
        await this.runMigration(migrations[i], 'down');
      }
    }
  }

  private loadMigrations(): Migration[] {
    const migrationDir = path.join(__dirname, '../../migrations');
    const files = fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql'));

    return files.map(file => {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) throw new Error(`Invalid migration file: ${file}`);

      const version = parseInt(match[1]);
      const name = match[2];
      const content = fs.readFileSync(path.join(migrationDir, file), 'utf-8');

      const [up, down] = content.split('-- DOWN');

      return {
        version,
        name,
        up: up.replace(/^-- UP\n/, '').trim(),
        down: down?.trim()
      };
    }).sort((a, b) => a.version - b.version);
  }

  private getCurrentVersion(): number {
    try {
      const row = this.db.prepare(
        "SELECT value FROM metadata WHERE key = 'schema_version'"
      ).get() as { value: string } | undefined;

      return row ? parseInt(row.value) : 0;
    } catch {
      return 0;
    }
  }

  private async runMigration(migration: Migration, direction: 'up' | 'down'): Promise<void> {
    const sql = direction === 'up' ? migration.up : migration.down;
    if (!sql) throw new Error(`No ${direction} migration for ${migration.name}`);

    this.db.transaction(() => {
      this.db.exec(sql);

      if (direction === 'up') {
        this.db.prepare(
          "UPDATE metadata SET value = ? WHERE key = 'schema_version'"
        ).run(migration.version.toString());
      } else {
        this.db.prepare(
          "UPDATE metadata SET value = ? WHERE key = 'schema_version'"
        ).run((migration.version - 1).toString());
      }
    })();
  }
}
```

### Idempotent Ingest

```typescript
// app/storage/sqlite.ts
import crypto from 'crypto';

export class SQLiteStorage {
  async ingestDoc(docId: string, text: string): Promise<IngestResult> {
    const contentHash = crypto.createHash('sha256').update(text).digest('hex');

    // Check if already ingested
    const existing = this.db.prepare(
      'SELECT doc_id FROM documents WHERE content_hash = ?'
    ).get(contentHash);

    if (existing) {
      return {
        alreadyIngested: true,
        docId: existing.doc_id,
        entities: [],
        relations: [],
        conflicts: []
      };
    }

    // Transactional ingest
    return this.db.transaction(() => {
      // 1. Extract entities and relations
      const { entities, relations } = await this.extract(text);

      // 2. Merge with existing
      const { globals, idMap } = this.merge(entities);

      // 3. Save to database
      this.saveEntities(globals);
      this.saveRelations(relations, idMap);

      // 4. Detect conflicts
      const conflicts = this.detectConflicts();
      this.saveConflicts(conflicts);

      // 5. Record document
      this.db.prepare(`
        INSERT INTO documents (doc_id, content_hash, text, ingested_at, entity_count, relation_count)
        VALUES (?, ?, ?, datetime('now'), ?, ?)
      `).run(docId, contentHash, text, globals.length, relations.length);

      return { entities: globals, relations, conflicts, mergeCount };
    })();
  }
}
```

---

## 2. API Contract Stability

### Pagination (Relay Connections)

```graphql
type EntityConnection {
  edges: [EntityEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type EntityEdge {
  node: Entity!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

type Query {
  entities(
    first: Int
    after: String
    type: String
    name: String
  ): EntityConnection!

  relations(
    first: Int
    after: String
    predicate: String
  ): RelationConnection!
}
```

### Input Validation (Zod)

```typescript
import { z } from 'zod';

const IngestDocInput = z.object({
  text: z.string()
    .min(1, 'Text cannot be empty')
    .max(100000, 'Text exceeds maximum length of 100KB'),
  docId: z.string()
    .regex(/^[a-zA-Z0-9_-]+$/, 'Doc ID must be alphanumeric with hyphens/underscores')
    .max(255)
});

const resolvers = {
  Mutation: {
    ingestDoc: async (_: any, args: any) => {
      // Validate input
      const input = IngestDocInput.parse(args);

      // ... proceed with ingestion
    }
  }
};
```

### Schema Versioning

```graphql
type Entity {
  id: ID!
  canonical: String!

  # Deprecated: use `canonical` instead
  name: String @deprecated(reason: "Use `canonical` field")
}
```

---

## 3. Observability

### Structured Logging (pino)

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'ares',
    version: process.env.npm_package_version
  }
});

// Usage
logger.info({ requestId, docId }, 'Ingesting document');
logger.error({ requestId, error }, 'Ingest failed');
```

### Metrics Endpoint

```typescript
// app/api/metrics.ts
export class MetricsCollector {
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  increment(metric: string, value = 1) {
    this.counters.set(metric, (this.counters.get(metric) || 0) + value);
  }

  record(metric: string, value: number) {
    if (!this.histograms.has(metric)) {
      this.histograms.set(metric, []);
    }
    this.histograms.get(metric)!.push(value);
  }

  toPrometheus(): string {
    let output = '';

    // Counters
    for (const [name, value] of this.counters) {
      output += `# TYPE ${name} counter\n`;
      output += `${name} ${value}\n`;
    }

    // Histograms (as summaries)
    for (const [name, values] of this.histograms) {
      const sorted = values.sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];

      output += `# TYPE ${name} summary\n`;
      output += `${name}{quantile="0.5"} ${p50}\n`;
      output += `${name}{quantile="0.95"} ${p95}\n`;
      output += `${name}{quantile="0.99"} ${p99}\n`;
    }

    return output;
  }
}

// Expose /metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metrics.toPrometheus());
});
```

### OpenTelemetry

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('ares', '1.0.0');

async function ingestDoc(text: string, docId: string) {
  return tracer.startActiveSpan('ingest_document', async (span) => {
    try {
      span.setAttribute('doc_id', docId);
      span.setAttribute('text_length', text.length);

      const result = await performIngest(text, docId);

      span.setAttribute('entities_extracted', result.entities.length);
      span.setAttribute('relations_extracted', result.relations.length);
      span.setStatus({ code: SpanStatusCode.OK });

      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

---

## 4. Security

### API Key Authentication

```typescript
// app/api/auth.ts
export function authMiddleware(req: Request, res: Response, next: Function) {
  const apiKey = req.headers['x-api-key'];
  const validKeys = (process.env.API_KEYS || '').split(',');

  if (!validKeys.includes(apiKey)) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  req.user = { apiKey };
  next();
}
```

### Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || 'unknown'
});

app.use('/graphql', limiter);
```

### Input Sanitization

```typescript
function sanitizeText(text: string): string {
  // Remove control characters
  text = text.replace(/[\x00-\x1F\x7F]/g, '');

  // Limit length
  if (text.length > 100000) {
    throw new Error('Text exceeds maximum length');
  }

  return text.trim();
}
```

### Audit Log

```typescript
function logAudit(action: string, details: any, req: Request) {
  db.prepare(`
    INSERT INTO audit_log (timestamp, request_id, action, user_id, ip_address, details)
    VALUES (datetime('now'), ?, ?, ?, ?, ?)
  `).run(
    req.headers['x-request-id'],
    action,
    req.user?.apiKey,
    req.ip,
    JSON.stringify(details)
  );
}
```

---

## 5. CI/CD & Determinism

### GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test -- --coverage

      - name: Check coverage
        run: |
          COVERAGE=$(npm test -- --coverage --json | jq '.coverageMap.total.lines.pct')
          if (( $(echo "$COVERAGE < 85" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 85%"
            exit 1
          fi

      - name: Determinism test
        run: npm run test:determinism
```

### Determinism Test

```typescript
// tests/determinism.spec.ts
import crypto from 'crypto';

describe('Determinism', () => {
  it('produces identical graph hash for same input', async () => {
    const corpus = [
      'Gandalf traveled to Rivendell.',
      'Aragorn married Arwen in 3019.',
      'Frodo lived in the Shire.'
    ];

    // First run
    clearStorage();
    for (const text of corpus) {
      await appendDoc(`doc${corpus.indexOf(text)}`, text);
    }
    const graph1 = loadGraph();
    const hash1 = hashGraph(graph1);

    // Second run
    clearStorage();
    for (const text of corpus) {
      await appendDoc(`doc${corpus.indexOf(text)}`, text);
    }
    const graph2 = loadGraph();
    const hash2 = hashGraph(graph2);

    expect(hash1).toBe(hash2);
  });
});

function hashGraph(graph: KnowledgeGraph): string {
  // Sort entities and relations for consistent hashing
  const sorted = {
    entities: graph.entities.sort((a, b) => a.id.localeCompare(b.id)),
    relations: graph.relations.sort((a, b) => a.id.localeCompare(b.id))
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(sorted))
    .digest('hex');
}
```

### Backup Script

```bash
#!/bin/bash
# scripts/backup.sh

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_FILE="ares_graph.db"
BACKUP_DIR="backups"

mkdir -p "$BACKUP_DIR"

# SQLite backup
sqlite3 "$DB_FILE" ".backup '$BACKUP_DIR/ares_$TIMESTAMP.db'"

# Verify backup
ORIGINAL_HASH=$(sqlite3 "$DB_FILE" "SELECT value FROM metadata WHERE key='graph_hash'")
BACKUP_HASH=$(sqlite3 "$BACKUP_DIR/ares_$TIMESTAMP.db" "SELECT value FROM metadata WHERE key='graph_hash'")

if [ "$ORIGINAL_HASH" = "$BACKUP_HASH" ]; then
  echo "✅ Backup verified: $BACKUP_DIR/ares_$TIMESTAMP.db"
else
  echo "❌ Backup verification failed"
  exit 1
fi
```

### Benchmarks

```typescript
// scripts/bench.ts
async function benchmark() {
  const iterations = 100;
  const results = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await ingestDoc(`test${i}`, generateRandomText(500));
    const duration = performance.now() - start;
    results.push(duration);
  }

  const avg = results.reduce((a, b) => a + b) / results.length;
  const p95 = results.sort((a, b) => a - b)[Math.floor(results.length * 0.95)];

  console.log(`Avg: ${avg.toFixed(2)}ms, P95: ${p95.toFixed(2)}ms`);

  // Assert thresholds
  if (avg > 200) {
    throw new Error(`Average latency ${avg}ms exceeds threshold 200ms`);
  }
  if (p95 > 500) {
    throw new Error(`P95 latency ${p95}ms exceeds threshold 500ms`);
  }
}
```

---

## Success Criteria

✅ **Existing tests:** 36/36 still passing
✅ **New tests:** ≥10 stability tests passing
✅ **Determinism:** Same corpus → identical graph hash
✅ **Metrics:** `/metrics` exposes counters
✅ **Logs:** Include request_id
✅ **Auth:** API key required
✅ **Rate limiting:** Max 100 req/15min per IP
✅ **Migrations:** Up/down migrations work
✅ **Idempotency:** Re-ingesting same doc is no-op
✅ **Backup:** Produces restorable SQLite file

---

## Implementation Order

1. ✅ Create PHASE_S_PLAN.md
2. Set up SQLite with migrations
3. Implement idempotent ingest
4. Add pagination to GraphQL
5. Add input validation (Zod)
6. Implement structured logging (pino)
7. Add metrics endpoint
8. Implement API key auth
9. Add rate limiting
10. Create audit log
11. Add determinism tests
12. Create backup scripts
13. Set up GitHub Actions
14. Run all tests (≥46 passing)
15. Create PHASE_S_COMPLETE_REPORT.md
