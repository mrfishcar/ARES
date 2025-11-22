# ARES Local Wiki Generation Setup

**Status**: ✅ **FULLY CONFIGURED FOR LOCAL OPERATION**
**Date**: November 19, 2025
**No Railway Dependencies**

---

## 🎯 What's Been Done

The ARES wiki generation system is **100% configured to run locally**. All knowledge graph-based wiki generation happens on your machine - no external dependencies.

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (React + Vite) - Port 3001                         │
│ - Extraction Lab interface                                   │
│ - WikiModal component                                        │
└───────────────────┬─────────────────────────────────────────┘
                    │ fetchEntityWiki()
                    │ POST /wiki-entity
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ Vite Development Server - Port 3001                         │
│ Proxy configuration:                                         │
│   /wiki-entity → http://localhost:4000                      │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend GraphQL Server - Port 4000                          │
│ - File: app/api/graphql.ts:593-648                          │
│ - Endpoint: GET /wiki-entity?entityName=xxx                 │
│ - Calls: buildEntityWikiFromGraph()                         │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ Wiki Generation - Fully Local                               │
│ - Module: app/generate/wiki.ts                              │
│ - Function: buildEntityWikiFromGraph(entityId, graph)       │
│ - Renderer: generateMarkdownPage()                          │
│ - Module: app/generate/markdown.ts                          │
└───────────────────┬─────────────────────────────────────────┘
                    │ Returns: Markdown (text/markdown)
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ Frontend HTML Rendering                                     │
│ - markdownToHTML() converter                                │
│ - Displays in WikiModal                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Key Files & Configurations

### Backend Configuration

**GraphQL Server**: `app/api/graphql.ts:593-648`
```typescript
if (req.url?.startsWith('/wiki-entity')) {
  // Load knowledge graph
  const graph = loadGraph(storagePath);

  // Find entity by ID or name (with fuzzy matching)
  let targetEntity = entityId
    ? graph.entities.find(e => e.id === entityId)
    : undefined;

  if (!targetEntity && entityName) {
    const normalized = entityName.trim().toLowerCase();
    // First try exact match, then fuzzy match
    ...
  }

  // Generate wiki from graph
  const content = buildEntityWikiFromGraph(targetEntity.id, graph);
  res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
  res.end(content);
}
```

**Wiki Generation**: `app/generate/wiki.ts:80-91`
```typescript
export function buildEntityWikiFromGraph(
  entityId: string,
  graph: KnowledgeGraph
): string {
  const conflicts: any[] = (graph as any).conflicts ?? [];
  return generateMarkdownPage(
    entityId,
    graph.entities,
    graph.relations,
    conflicts
  );
}
```

### Frontend Configuration

**Environment Variables**: `app/ui/console/.env.local`
```env
VITE_API_URL=http://localhost:4000
VITE_GRAPHQL_URL=http://localhost:4000/graphql
```

**Vite Proxy**: `app/ui/console/vite.config.ts:13-19`
```typescript
server: {
  port: 3001,
  proxy: {
    '/graphql': 'http://localhost:4000',
    '/wiki-file': 'http://localhost:4000',
    '/wiki-entity': 'http://localhost:4000',
    '/download': 'http://localhost:4000',
    '/metrics': 'http://localhost:4100'
  }
}
```

**API Client**: `app/ui/console/src/lib/api.ts:1-4`
```typescript
// Use environment variable, fallback to localhost for local development
const GRAPHQL_URL =
  import.meta.env.VITE_GRAPHQL_URL ||
  "http://localhost:4000/graphql";  // ✅ No Railway
```

**Wiki Modal Component**: `app/ui/console/src/components/WikiModal.tsx:20-36`
```typescript
useEffect(() => {
  async function generateWiki() {
    try {
      setLoading(true);
      setError(null);

      const generatedWiki = await fetchEntityWiki(project, entityName);

      setWiki(generatedWiki);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate wiki');
    } finally {
      setLoading(false);
    }
  }

  generateWiki();
}, [entityName, project]);
```

---

## 🚀 How to Use

### 1. Start All Services

```bash
./launch-ares.sh
```

This starts:
- Python parser service (port 8000)
- Node.js backend GraphQL server (port 4000)
- React frontend with Vite (port 3001)

### 2. Extract Text & Generate Wiki

1. Open http://localhost:3001
2. Go to **Extraction Lab**
3. Enter text with entities:
   ```
   Harry Potter studied magic at Hogwarts.
   Ron Weasley was his best friend.
   ```
4. Click on an entity name (e.g., "Harry")
5. Wiki modal opens with **auto-generated markdown**
6. Content comes from knowledge graph (completely local)

### 3. Direct API Usage

Test the wiki endpoint directly:

```bash
# Extract entities first (persists to graph)
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { ingestDoc(text: \"Harry went to Hogwarts.\", docId: \"test1\") { entities { canonical } } }"
  }'

# Generate wiki
curl "http://localhost:4000/wiki-entity?entityName=Harry"

# Response (markdown)
# # Harry
#
# ## Infobox
# | Field | Value |
# |-------|-------|
# | **Name** | Harry |
# ...
```

---

## ✅ Verification Checklist

- [x] **No Railway URLs** in codebase
  - `app/ui/console/src/lib/api.ts:4` points to `localhost:4000`
  - No `https://ares-production-72ea.up.railway.app` references

- [x] **Backend wiki endpoint working**
  - GET `/wiki-entity?entityName=xxx`
  - Returns markdown
  - Calls `buildEntityWikiFromGraph()`

- [x] **Frontend proxy configured**
  - Vite forwards `/wiki-entity` to backend
  - Environment variables set correctly

- [x] **Wiki generation functional**
  - Markdown rendering works
  - Uses knowledge graph data
  - Generates infobox, relations, aliases

- [x] **Storage local**
  - Graph persists in `./data/`
  - No external dependencies
  - All processing on your machine

---

## 🔍 Testing the Complete Flow

```bash
# 1. Start services
./launch-ares.sh &

# 2. Ingest test data
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { ingestDoc(text: \"Frodo lived in the Shire. Gandalf was a wizard.\", docId: \"lotr-1\") { entities { canonical type } } }"
  }'

# 3. Generate wiki
curl "http://localhost:4000/wiki-entity?entityName=Frodo" \
  -H "Content-Type: application/json" \
  | jq -r . | head -20

# 4. Stop services
pkill -f "uvicorn parser_service"
pkill -f "node.*graphql"
pkill -f "vite"
```

---

## 📊 Wiki Generation Pipeline

### Data Sources

The wiki pulls from the knowledge graph:

1. **Entity Information**
   - `canonical`: Main entity name
   - `type`: PERSON, ORG, PLACE, etc.
   - `aliases`: All known names for entity

2. **Relations**
   - Incoming: entities that point to this one
   - Outgoing: entities this one points to
   - Predicate: relationship type (e.g., "married_to", "travels_to")

3. **Evidence**
   - Document where extracted
   - Sentence index
   - Text spans

4. **Conflicts**
   - Alternative facts in graph
   - Severity levels

### Markdown Structure

Generated wiki includes:

```markdown
# Entity Name

## Infobox
| Field | Value |
| Name | ... |
| Type | PERSON |
| Aliases | ... |

## Overview
[Description from graph data]

## Relations
### Incoming Relations
- [Entity A] --[predicate]--> [This Entity]

### Outgoing Relations
- [This Entity] --[predicate]--> [Entity B]

## Evidence
- Source: document_id
- Mentions: ...
```

---

## 🛠️ Troubleshooting

### Wiki modal shows "Entity not found"

**Cause**: Entity name doesn't match graph exactly

**Solution**:
1. Check entity names from extraction output
2. Use fuzzy matching (backend tries substring match)
3. Verify graph has data: `curl http://localhost:4000/graphql -d '{"query":"{ entities { canonical } }"}'`

### Blank wiki page

**Cause**: Entity exists but has no relations/evidence

**Solution**: Entity will still generate basic infobox - this is correct behavior

### Vite proxy not working

**Cause**: Backend not running on 4000

**Solution**:
```bash
# Check backend
curl http://localhost:4000/health

# Restart backend
pkill -f "node.*graphql"
node dist/app/api/graphql.js
```

### Markdown not rendering in modal

**Cause**: Browser security or markdown parser issue

**Solution**: Check browser console for errors. Consider upgrading markdown library (currently using simple regex parser).

---

## 📝 Configuration Checklist for Future Sessions

When restarting work:

```bash
# 1. Ensure environment is set
cat app/ui/console/.env.local
# Should show:
# VITE_API_URL=http://localhost:4000
# VITE_GRAPHQL_URL=http://localhost:4000/graphql

# 2. Verify proxy config
grep -A 5 "proxy:" app/ui/console/vite.config.ts
# Should show /wiki-entity → localhost:4000

# 3. Check API fallback
grep "localhost:4000/graphql" app/ui/console/src/lib/api.ts
# Should find it on line 4

# 4. Compile TypeScript
npx tsc --skipLibCheck

# 5. Start services
./launch-ares.sh
```

---

## 🎉 Summary

**ARES wiki generation is fully local:**

✅ No external dependencies
✅ No Railway calls
✅ Graph-based generation
✅ Markdown rendering
✅ Frontend integration complete
✅ End-to-end working

Everything you need to generate wikis from your knowledge graph is running on localhost.

---

**Last Updated**: November 19, 2025
**Next**: Codex can continue with Phase 2 tasks using this local wiki system

