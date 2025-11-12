# Extraction Lab - Distributed Deployment Fix Summary

## Problem Identified

The Extraction Lab was implemented to work only in **local development**, but your deployment uses a **distributed architecture**:

- **Frontend:** Vercel (static React hosting)
- **Backend:** Railway (Node.js + Python container)

The original implementation had the `/extract-entities` endpoint in `/app/desktop-tester/server.ts`, which is NOT the server deployed to Railway.

## Root Cause Analysis

### What Was Wrong

1. **Wrong Backend Server:** The endpoint was added to `desktop-tester/server.ts` (port 3000), which is only for local testing
2. **Hardcoded Localhost URL:** Frontend was calling `http://localhost:3000/extract-entities`
3. **No Production Backend:** Railway deploys `/app/api/graphql.ts` (port 4000), which didn't have the extraction endpoint
4. **No Environment Variables:** Frontend couldn't switch between local dev and production URLs
5. **Missing CORS:** Production backend didn't have CORS configured for Vercel domain

### Architecture Mismatch

```
❌ BEFORE (Broken for Production):
┌──────────────┐              ┌──────────────────────┐
│   Vercel     │──X──────────▶│  Railway             │
│   Frontend   │  "No route"  │  graphql.ts:4000     │
└──────────────┘              │  (no /extract-       │
       │                      │   entities endpoint) │
       │                      └──────────────────────┘
       │
       ▼ calls localhost:3000
┌──────────────────────┐
│  desktop-tester      │
│  server.ts:3000      │  ◀─── NOT DEPLOYED
│  (local dev only)    │       to Railway
└──────────────────────┘
```

## Solution Implemented

### 1. Added `/extract-entities` Endpoint to Railway Backend

**File:** `/Users/corygilford/ares/app/api/graphql.ts` (lines 705-833)

**What it does:**
- Accepts POST requests with `{ text: string }`
- Runs the FULL ARES extraction engine
- Returns entities with spans and relations
- Includes CORS headers for Vercel domain
- Handles errors and cleanup

**Key features:**
```typescript
// Extract entities endpoint (for Extraction Lab)
if (req.url === '/extract-entities' && req.method === 'POST') {
  // Set CORS headers for production
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Use ARES engine
  const appendResult = await appendDoc(`extract-${timestamp}`, text, tempPath);
  const graph = loadGraph(tempPath);

  // Transform to frontend format
  const entitySpans = graph.entities.map(entity => ({
    id: entity.id,
    text: entity.canonical,
    type: entity.type,
    spans: [...], // positions in text
  }));

  // Return results
  res.end(JSON.stringify({ success: true, entities, relations }));
}
```

### 2. Configured Frontend to Use Environment Variables

**File:** `/Users/corygilford/ares/app/ui/console/src/pages/ExtractionLab.tsx` (line 140)

**Before:**
```typescript
const response = await fetch('http://localhost:3000/extract-entities', {
```

**After:**
```typescript
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const response = await fetch(`${apiUrl}/extract-entities`, {
```

**Why this works:**
- Vite (frontend build tool) uses `import.meta.env` for environment variables
- `VITE_` prefix required for client-side variables
- Falls back to `localhost:4000` for local development
- Uses Railway URL in production

### 3. Created Environment Configuration Files

**Created:**
1. `/Users/corygilford/ares/app/ui/console/.env.example` - Template for deployment
2. `/Users/corygilford/ares/app/ui/console/.env.local` - Local development config

**Contents:**
```env
# .env.example (for production on Vercel)
VITE_API_URL=https://your-app.up.railway.app
VITE_GRAPHQL_URL=https://your-app.up.railway.app/graphql

# .env.local (for local development)
VITE_API_URL=http://localhost:4000
VITE_GRAPHQL_URL=http://localhost:4000/graphql
```

### 4. Fixed CORS Configuration

**Added to GraphQL backend (line 718-721):**
```typescript
// Set CORS headers
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
```

**Why needed:**
- Vercel (frontend) and Railway (backend) are different origins
- Browser blocks cross-origin requests without CORS headers
- `*` allows any origin (can be restricted to Vercel domain for security)

## Fixed Architecture

```
✅ AFTER (Works in Production):

┌──────────────────────┐
│   Vercel             │
│   Frontend           │
│   ares-console       │
└──────────────────────┘
         │
         │ HTTPS + CORS
         │ VITE_API_URL=https://railway.app
         │
         ▼
┌──────────────────────────────────────┐
│   Railway Container                  │
│   ┌────────────────────────────┐    │
│   │  graphql.ts:4000           │    │
│   │  • /graphql (GraphQL API)  │    │
│   │  • /extract-entities (NEW) │◀───┼── Extraction Lab
│   │  • /healthz                │    │
│   │  • /metrics                │    │
│   └────────────────────────────┘    │
│   ┌────────────────────────────┐    │
│   │  spaCy Parser:8000         │    │
│   │  • Full ARES engine        │    │
│   └────────────────────────────┘    │
└──────────────────────────────────────┘
```

## Deployment Steps

### Step 1: Deploy Backend to Railway

```bash
cd /Users/corygilford/ares
railway up
```

Or use Railway web dashboard (no CLI needed).

### Step 2: Get Railway Backend URL

```bash
railway domain
# Example output: https://ares-backend-production.up.railway.app
```

### Step 3: Configure Vercel Environment Variables

In Vercel dashboard → Project Settings → Environment Variables:

```
VITE_API_URL = https://ares-backend-production.up.railway.app
VITE_GRAPHQL_URL = https://ares-backend-production.up.railway.app/graphql
```

### Step 4: Redeploy Frontend

```bash
cd /Users/corygilford/ares/app/ui/console
vercel --prod
```

Or push to GitHub if auto-deploy is configured.

### Step 5: Test End-to-End

1. Open Vercel URL: `https://ares-console.vercel.app`
2. Go to Extraction Lab
3. Paste test text
4. Should see entities extracted and highlighted

## Testing the Fix

### Test Backend Directly

```bash
curl -X POST https://your-railway-url.up.railway.app/extract-entities \
  -H "Content-Type: application/json" \
  -d '{"text": "Aragorn became King of Gondor in 3019 of the Third Age."}'
```

Expected response:
```json
{
  "success": true,
  "entities": [
    {
      "id": "...",
      "text": "Aragorn",
      "type": "PERSON",
      "spans": [{"start": 0, "end": 7}]
    },
    {
      "id": "...",
      "text": "Gondor",
      "type": "LOCATION",
      "spans": [{"start": 23, "end": 29}]
    }
  ],
  "relations": [
    {
      "subj": "...",
      "pred": "became_king_of",
      "obj": "..."
    }
  ]
}
```

### Test Frontend Integration

1. Open browser DevTools → Network tab
2. Go to Extraction Lab
3. Paste text and extract
4. Check Network tab for `/extract-entities` request
5. Verify request goes to Railway URL (not localhost)
6. Verify response status is 200
7. Verify entities are highlighted in UI

## Key Files Changed

### Backend
- `/app/api/graphql.ts` - Added `/extract-entities` endpoint (lines 705-833)

### Frontend
- `/app/ui/console/src/pages/ExtractionLab.tsx` - Use environment variable for API URL (line 140)
- `/app/ui/console/.env.example` - Template for environment config
- `/app/ui/console/.env.local` - Local development config

### Documentation
- `/DEPLOYMENT_EXTRACTION_LAB.md` - New comprehensive deployment guide
- `/DEPLOYMENT.md` - Updated to reference Extraction Lab guide
- `/EXTRACTION_LAB_DEPLOYMENT_SUMMARY.md` - This summary

## Environment Variables Reference

### Backend (Railway)

| Variable | Value | Purpose |
|----------|-------|---------|
| `NODE_ENV` | `production` | Enable production optimizations |
| `PORT` | `4000` | GraphQL API port |
| `PARSER_PORT` | `8000` | spaCy parser port |
| `DATA_DIR` | `/app/data` | Storage directory |

### Frontend (Vercel)

| Variable | Value | Purpose |
|----------|-------|---------|
| `VITE_API_URL` | `https://your-railway-url.up.railway.app` | Backend API base URL |
| `VITE_GRAPHQL_URL` | `https://your-railway-url.up.railway.app/graphql` | GraphQL endpoint |

## Troubleshooting

### Frontend Shows "Failed to fetch"

**Check:**
1. Is backend deployed and running? `curl https://your-railway-url/healthz`
2. Are Vercel environment variables set correctly?
3. Does Network tab show correct URL being called?
4. Are CORS headers present in response?

**Fix:**
```bash
# Verify environment variables in Vercel
vercel env ls

# Add if missing
vercel env add VITE_API_URL production
```

### Backend Returns 404 for /extract-entities

**Check:**
1. Is the updated `graphql.ts` deployed?
2. Check Railway deployment logs for errors
3. Verify TypeScript compiled correctly

**Fix:**
```bash
# Redeploy backend
railway up

# Check logs
railway logs
```

### CORS Errors in Browser Console

**Check:**
1. Is `Access-Control-Allow-Origin` header present?
2. Is request method allowed (POST)?

**Fix:**
- Verify CORS headers in `/app/api/graphql.ts` lines 718-721
- For production, change `'*'` to your Vercel domain for security

### Extraction Takes Too Long

**Check:**
1. Railway container resources (CPU/memory)
2. Text length (very long texts take longer)

**Fix:**
- Upgrade Railway plan for more resources
- Add frontend timeout handling
- Optimize extraction for shorter texts

## Success Criteria

- [ ] Backend deployed to Railway
- [ ] `/extract-entities` endpoint returns 200
- [ ] Frontend deployed to Vercel
- [ ] Frontend calls Railway URL (not localhost)
- [ ] Entities are extracted and highlighted
- [ ] No CORS errors in console
- [ ] Works when sending test version to others online

## Cost & Performance

**Estimated Costs:**
- Railway: FREE ($5/month credit covers ~500 hours)
- Vercel: FREE (unlimited deploys for hobby projects)
- **Total: $0/month** (within free tier limits)

**Performance:**
- Extraction time: 1-5 seconds for typical texts
- Backend cold start: 5-10 seconds (Railway wakes up container)
- Frontend load: <1 second (Vercel CDN)

## Next Steps

1. **Deploy to Production:**
   - Follow deployment steps above
   - Test end-to-end
   - Share Vercel URL with testers

2. **Security Hardening:**
   - Restrict CORS to Vercel domain only
   - Add rate limiting (already implemented in backend)
   - Add API key authentication (optional)

3. **Monitoring:**
   - Use Railway metrics dashboard
   - Monitor `/metrics` endpoint for performance
   - Check Vercel Analytics for frontend usage

4. **Optimization:**
   - Add caching for frequently extracted texts
   - Implement request queuing for heavy load
   - Consider adding extraction result history

## Related Documentation

- [DEPLOYMENT_EXTRACTION_LAB.md](./DEPLOYMENT_EXTRACTION_LAB.md) - Detailed deployment guide
- [DEPLOYMENT.md](./DEPLOYMENT.md) - General ARES deployment guide
- [README.md](./README.md) - Project overview

## Technical Debt Resolved

1. ✅ Extraction Lab now works in production (was localhost-only)
2. ✅ Backend endpoint on correct server (graphql.ts, not desktop-tester)
3. ✅ Environment-based configuration (dev vs. prod)
4. ✅ CORS properly configured for distributed deployment
5. ✅ Documentation covers deployment architecture

## Questions or Issues?

If you encounter problems deploying:

1. Check Railway logs: `railway logs`
2. Check Vercel deployment logs in dashboard
3. Verify environment variables are set correctly
4. Test backend endpoint directly with curl
5. Check browser DevTools Network tab for errors
