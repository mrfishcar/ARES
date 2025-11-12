# Vercel 404 Error Diagnosis

## Summary

The 404 errors on the Vercel deployment are caused by the frontend trying to call backend API endpoints (`/graphql`, `/wiki-file`, `/metrics`) that don't exist on Vercel. Vercel only hosts the static frontend - the backend needs to be deployed separately on Railway.

## Root Cause

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

## Fixes Applied

### 1. Updated vercel.json Rewrite Rule

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
