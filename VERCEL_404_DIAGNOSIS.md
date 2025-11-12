# Vercel 404 Error Diagnosis

## Summary

The 404 errors on the Vercel deployment were caused by **two issues**:
1. **Vercel rewrite rule** catching API routes and returning HTML instead of allowing them through
2. **Backend CORS preflight bug** preventing OPTIONS requests to `/extract-entities` endpoint

Both issues have been fixed in this commit.

## Root Causes

### Architecture
- **Frontend**: Deployed on Vercel (static React app)
- **Backend**: Should be deployed on Railway (GraphQL server + spaCy parser)
- **Connection**: Frontend uses `VITE_GRAPHQL_URL` environment variable to connect to backend

### The Problem

1. The frontend makes API calls to:
   - `/graphql` - GraphQL endpoint
   - `/wiki-file` - Wiki file endpoint
   - `/metrics` - Metrics endpoint

2. Without the `VITE_GRAPHQL_URL` environment variable set, the frontend defaults to relative paths (e.g., `/graphql`)

3. The old vercel.json rewrite rule `/(.*) -> /index.html` was catching ALL routes including API paths

4. This caused API calls to return HTML (index.html) instead of JSON, leading to errors

## Issues Found

### Issue 1: Broken CORS Preflight Handling (Backend Bug)

**Location**: app/api/graphql.ts:708

**The Bug**:
```javascript
// BEFORE (BROKEN):
if (req.url === '/extract-entities' && req.method === 'POST') {
  if (req.method === 'OPTIONS') {
    // This code NEVER runs because outer condition requires POST!
  }
}
```

**Why This Breaks**:
1. When you type in Extraction Lab, browser sends OPTIONS preflight request first (CORS requirement)
2. The outer condition checks `req.method === 'POST'`
3. OPTIONS request fails this check and falls through to 404
4. Browser blocks the actual POST request due to failed preflight

**The Fix**:
```javascript
// AFTER (FIXED):
if (req.url === '/extract-entities') {
  if (req.method === 'OPTIONS') {
    // Handle CORS preflight
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', ... });
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405);
    return;
  }
  // ... handle POST request
}
```

Now OPTIONS requests are properly handled before checking for POST.

### Issue 2: Vercel Rewrite Rule Catching API Routes

## Fixes Applied

### 1. Fixed CORS Preflight Handling (Backend)

**File**: app/api/graphql.ts:708-725

Changed the `/extract-entities` endpoint to:
1. Check for the URL first (without method restriction)
2. Handle OPTIONS (preflight) separately and return immediately
3. Then check if method is POST for actual requests
4. Return 405 for unsupported methods

This allows browsers to complete the CORS preflight handshake successfully.

### 2. Updated vercel.json Rewrite Rule

**Before:**
```json
"rewrites": [
  {
    "source": "/(.*)",
    "destination": "/index.html"
  }
]
```

**After:**
```json
"rewrites": [
  {
    "source": "/:path((?!api).*)*",
    "destination": "/index.html"
  }
]
```

This excludes `/api/*` routes from being rewritten, allowing Vercel serverless functions to work correctly.

### 2. Configuration Required: Set Backend URL

The frontend MUST be configured to use the Railway backend. You need to:

#### Option A: Set Vercel Environment Variable (Recommended)

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add a new variable:
   - **Name**: `VITE_GRAPHQL_URL`
   - **Value**: `https://your-railway-app.up.railway.app/graphql`
   - **Environments**: Production, Preview
3. Redeploy the frontend

#### Option B: Create .env.production File

If you prefer to commit the URL:

```bash
cd app/ui/console
echo "VITE_GRAPHQL_URL=https://your-railway-app.up.railway.app/graphql" > .env.production
git add .env.production
git commit -m "feat: configure production backend URL"
git push
```

## Deploy Backend to Railway

If you haven't deployed the backend yet:

### Quick Deploy

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize and deploy
railway init
railway up

# Get your URL
railway domain
# Copy the URL (e.g., https://ares-production-abc123.up.railway.app)
```

### Set Backend URL in Vercel

Replace `your-railway-app.up.railway.app` with your actual Railway URL:

```bash
# Using Vercel CLI
vercel env add VITE_GRAPHQL_URL production
# When prompted, enter: https://your-railway-app.up.railway.app/graphql

# Or set it in the Vercel dashboard
```

### Redeploy Frontend

```bash
git push
# Vercel will auto-deploy
```

## Verify the Fix

### 1. Check Backend is Running

```bash
curl https://your-railway-app.up.railway.app/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query": "{ __typename }"}'

# Expected response: {"data":{"__typename":"Query"}}
```

### 2. Check Frontend Connection

1. Open your Vercel deployment in a browser
2. Open DevTools (F12) → Console tab
3. Look for API calls in the Network tab
4. They should be going to your Railway URL, not relative paths

### 3. Test the App

Visit these pages and verify they work:
- `/` - Home page
- `/notes` - Notes page
- `/entities` - Entities page
- `/lab` - Extraction Lab (tests entity detection)

## What Was Changed

### Files Modified

1. **vercel.json** - Updated rewrite rule to exclude `/api/*` paths
   - Before: `"source": "/(.*)"` (caught everything)
   - After: `"source": "/:path((?!api).*)*"` (excludes /api/*)

### Files to Review

- **app/ui/console/src/lib/api.ts** - API client that uses `VITE_GRAPHQL_URL`
  - Line 2: `const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL || '/graphql';`
  - This is why setting the env var is critical

- **DEPLOYMENT.md** - Comprehensive deployment guide
  - Section: "White Screen on Vercel Deployment"
  - Contains full troubleshooting steps

## Next Steps

1. **Deploy Backend to Railway** (if not done already)
2. **Set VITE_GRAPHQL_URL in Vercel** (see options above)
3. **Redeploy Frontend** (git push or Vercel dashboard)
4. **Test the deployment** (verify API calls work)

## Additional Resources

- **DEPLOYMENT.md** - Full deployment guide for Railway/Render/Fly.io
- **DEPLOYMENT_EXTRACTION_LAB.md** - Specific guide for Extraction Lab feature
- **VERCEL_FIX_PLAN.md** - Original plan for entity highlighting fixes

## Summary

The 404 errors will be resolved once you:
1. ✅ Deploy backend to Railway
2. ✅ Set `VITE_GRAPHQL_URL` in Vercel environment variables
3. ✅ Redeploy frontend

The vercel.json fix has been applied to prevent API routes from being incorrectly rewritten.
