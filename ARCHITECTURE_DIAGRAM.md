# ARES Extraction Lab - Deployment Architecture

## Production Architecture (Vercel + Railway)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER'S BROWSER                              │
│                    https://ares-console.vercel.app                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ User opens Extraction Lab
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    VERCEL (Static Hosting - FREE)                   │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │  React SPA - ARES Console                                       │ │
│ │  ┌────────────────────────────────────────────────────────────┐ │ │
│ │  │ ExtractionLab.tsx                                          │ │ │
│ │  │ • Text input editor                                        │ │ │
│ │  │ • Entity highlighting UI                                   │ │ │
│ │  │ • Relation visualization                                   │ │ │
│ │  │                                                            │ │ │
│ │  │ const apiUrl = import.meta.env.VITE_API_URL               │ │ │
│ │  │ // = https://ares-production.up.railway.app               │ │ │
│ │  └────────────────────────────────────────────────────────────┘ │ │
│ │                                                                   │ │
│ │  Built from: /app/ui/console/                                    │ │
│ │  Output: dist/ (static HTML/JS/CSS)                              │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  Environment Variables (Vercel Dashboard):                           │
│  • VITE_API_URL = https://ares-production.up.railway.app            │
└────────────────────────────┬──────────────────────────────────────────┘
                             │
                             │ POST /extract-entities
                             │ { text: "..." }
                             │ + CORS headers
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│              RAILWAY (Container Hosting - FREE $5 credit)           │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │  Docker Container (Node.js 20 + Python 3.11)                   │ │
│ │                                                                  │ │
│ │  ┌───────────────────────────────────────────────────────────┐ │ │
│ │  │ GraphQL API Server (Port 4000)                            │ │ │
│ │  │ File: app/api/graphql.ts                                  │ │ │
│ │  │                                                            │ │ │
│ │  │ HTTP Server Routes:                                       │ │ │
│ │  │ ┌──────────────────────────────────────────────────────┐ │ │ │
│ │  │ │ POST /extract-entities                               │ │ │ │
│ │  │ │ • Parse JSON body: { text }                          │ │ │ │
│ │  │ │ • Create temp storage                                │ │ │ │
│ │  │ │ • Call appendDoc(text) ───────────────┐             │ │ │ │
│ │  │ │ • Load graph                           │             │ │ │ │
│ │  │ │ • Find entity spans in text            │             │ │ │ │
│ │  │ │ • Return { entities, relations }       │             │ │ │ │
│ │  │ │ • CORS: Access-Control-Allow-Origin: * │             │ │ │ │
│ │  │ └──────────────────────────────────────────────────────┘ │ │ │
│ │  │                                            │               │ │ │
│ │  │ POST /graphql (Apollo Server)             │               │ │ │
│ │  │ GET  /healthz                             │               │ │ │
│ │  │ GET  /metrics                             │               │ │ │
│ │  └───────────────────────────────────────────┼───────────────┘ │ │
│ │                                               │                 │ │
│ │  ┌────────────────────────────────────────────▼──────────────┐ │ │
│ │  │ ARES Extraction Engine                                    │ │ │
│ │  │ • Entity extraction (appendDoc)                           │ │ │
│ │  │ • Relation extraction                                     │ │ │
│ │  │ • Conflict detection                                      │ │ │
│ │  │ • Knowledge graph building                                │ │ │
│ │  └───────────────────────────────────────────┬───────────────┘ │ │
│ │                                               │                 │ │
│ │  ┌────────────────────────────────────────────▼──────────────┐ │ │
│ │  │ spaCy Parser Service (Port 8000)                          │ │ │
│ │  │ File: scripts/parser_service.py                           │ │ │
│ │  │ • NLP parsing (tokenization, POS, NER)                    │ │ │
│ │  │ • Dependency parsing                                      │ │ │
│ │  │ • spaCy model: en_core_web_sm                             │ │ │
│ │  └───────────────────────────────────────────────────────────┘ │ │
│ │                                                                  │ │
│ │  Storage: SQLite (/app/data/*.json)                             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  Environment Variables (Railway Dashboard):                          │
│  • NODE_ENV = production                                             │
│  • PORT = 4000                                                       │
│  • PARSER_PORT = 8000                                                │
└───────────────────────────────────────────────────────────────────────┘
```

## Request Flow (User Extracts Entities)

```
1. User types text in Extraction Lab
   │
   ▼
2. Frontend debounces for 1000ms
   │
   ▼
3. Frontend sends POST request:
   URL: https://ares-production.up.railway.app/extract-entities
   Body: { text: "Aragorn became King of Gondor in 3019." }
   Headers: { Content-Type: application/json }
   │
   ▼
4. Railway receives request at graphql.ts HTTP server
   │
   ▼
5. Server adds CORS headers (allow Vercel origin)
   │
   ▼
6. Server parses JSON body, extracts text
   │
   ▼
7. Server creates temp storage: temp-extract-1234567890.json
   │
   ▼
8. Server calls appendDoc(text) → ARES engine runs:
   ├─ Calls spaCy parser (port 8000)
   ├─ Extracts entities (Aragorn, Gondor, etc.)
   ├─ Extracts relations (Aragorn became_king_of Gondor)
   ├─ Detects conflicts (if any)
   └─ Builds knowledge graph
   │
   ▼
9. Server loads graph from temp storage
   │
   ▼
10. Server transforms graph to frontend format:
    • Find entity spans in original text
    • Map entities to { id, text, type, spans, confidence }
    • Map relations to { subj, pred, obj, confidence }
   │
   ▼
11. Server sends JSON response:
    {
      success: true,
      entities: [
        { id: "...", text: "Aragorn", type: "PERSON", spans: [{start: 0, end: 7}] },
        { id: "...", text: "Gondor", type: "LOCATION", spans: [{start: 23, end: 29}] }
      ],
      relations: [
        { subj: "...", pred: "became_king_of", obj: "..." }
      ],
      stats: { extractionTime: 1234, entityCount: 2, relationCount: 1 }
    }
   │
   ▼
12. Server cleans up temp storage
   │
   ▼
13. Frontend receives response
   │
   ▼
14. Frontend highlights entities in text:
    • "Aragorn" → blue highlight (PERSON)
    • "Gondor" → green highlight (LOCATION)
   │
   ▼
15. Frontend displays relations in sidebar:
    • Aragorn → became_king_of → Gondor
```

## Local Development Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     USER'S BROWSER                                  │
│                  http://localhost:5173                              │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Vite Dev Server (Port 5173)                            │
│  React app with HMR                                                 │
│  Uses .env.local: VITE_API_URL=http://localhost:4000               │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ POST http://localhost:4000/extract-entities
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│           ts-node app/api/graphql.ts (Port 4000)                    │
│  Same GraphQL server as production                                  │
│  No Docker, runs directly with ts-node                              │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│      Python Parser (Port 8000)                                      │
│  Started with: npm run parser                                       │
│  uvicorn scripts/parser_service.py                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Differences: Local vs Production

| Aspect | Local Development | Production |
|--------|-------------------|------------|
| Frontend | Vite dev server (port 5173) | Vercel CDN (static files) |
| Backend | ts-node (no Docker) | Railway Docker container |
| API URL | http://localhost:4000 | https://ares-production.up.railway.app |
| Parser | Manual start (npm run parser) | Auto-started in Docker |
| CORS | Not needed (same origin) | Required (cross-origin) |
| Storage | Local /data directory | Container /app/data |
| Env vars | .env.local | Vercel/Railway dashboards |

## Files Involved

### Backend (Railway)
```
/app/api/graphql.ts
  ├─ Line 705-833: /extract-entities endpoint
  ├─ Line 545-741: startGraphQLServer() function
  └─ Line 564-708: Custom HTTP server with routes

/app/storage/storage.ts
  ├─ appendDoc(): Main extraction function
  ├─ loadGraph(): Load knowledge graph
  └─ clearStorage(): Cleanup temp files

/app/engine/orchestrator.ts
  └─ Entity/relation extraction pipeline

/scripts/parser_service.py
  └─ spaCy NLP parsing service

/Dockerfile
  └─ Container build instructions
```

### Frontend (Vercel)
```
/app/ui/console/src/pages/ExtractionLab.tsx
  ├─ Line 140: API URL configuration
  ├─ Line 126-200: extractEntities() function
  └─ UI rendering and entity highlighting

/app/ui/console/.env.example
  └─ Environment variable template

/app/ui/console/.env.local
  └─ Local development config

/vercel.json
  └─ Vercel build configuration
```

## Deployment Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT (Cory's MacBook)                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │  Edit code:                                                     │ │
│ │  • /app/api/graphql.ts                                          │ │
│ │  • /app/ui/console/src/pages/ExtractionLab.tsx                  │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                             │                                        │
│                             ▼                                        │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │  git commit -m "Add extraction endpoint"                        │ │
│ │  git push origin main                                           │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────────┘
                             │
       ┌─────────────────────┴─────────────────────┐
       │                                           │
       ▼                                           ▼
┌──────────────────────┐                ┌──────────────────────┐
│  RAILWAY             │                │  VERCEL              │
│  Backend Deployment  │                │  Frontend Deployment │
├──────────────────────┤                ├──────────────────────┤
│ • Pull latest code   │                │ • Pull latest code   │
│ • Build Docker image │                │ • npm install        │
│ • Run container      │                │ • npm run build      │
│ • Expose port 4000   │                │ • Deploy to CDN      │
└──────────────────────┘                └──────────────────────┘
       │                                           │
       ▼                                           ▼
   Backend URL                                Frontend URL
   railway.app                              vercel.app
```

## Security Considerations

### CORS Configuration

Current: `Access-Control-Allow-Origin: *` (allows all origins)

For production security, update to:
```typescript
// In /app/api/graphql.ts line 719
res.setHeader('Access-Control-Allow-Origin', 'https://ares-console.vercel.app');
```

### Rate Limiting

Already implemented in backend (globalRateLimiter)
- Tracks requests per client IP
- Prevents abuse of extraction endpoint

### Environment Variables

Never commit to git:
- `.env.local` (local dev secrets)
- `.env.production` (production secrets)

Store in platform dashboards:
- Railway: Environment tab
- Vercel: Project Settings → Environment Variables

## Monitoring & Observability

### Health Checks
```
GET /healthz → "ok"
GET /readyz → "ready"
```

### Metrics
```
GET /metrics → Prometheus format
- Extraction time histogram
- Entity count gauge
- Error rate counter
```

### Logs
```bash
# Railway logs
railway logs --tail

# Vercel logs
vercel logs
```

## Cost & Scale

### Free Tier Limits

**Railway:**
- $5 credit/month (~500 hours)
- 1GB RAM per container
- 1 vCPU per container

**Vercel:**
- Unlimited deployments
- 100GB bandwidth/month
- Unlimited requests

### When to Upgrade

Upgrade if:
- Railway usage exceeds $5/month
- Extraction takes >10 seconds (need more CPU/RAM)
- Multiple users extracting simultaneously

### Scaling Strategy

1. **Horizontal:** Add more Railway containers
2. **Vertical:** Increase container resources
3. **Caching:** Cache extraction results by text hash
4. **Queue:** Add job queue for heavy extractions
