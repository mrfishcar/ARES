# ARES Deployment Guide

## Quick Fix: White Screen Issue

If you're seeing a white screen on Vercel, it's because the frontend can't connect to the backend. Here's what to do:

1. **Set your Railway backend URL in Vercel**:
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add: `VITE_GRAPHQL_URL` = `https://your-railway-url.up.railway.app/graphql`
   - Redeploy

2. **Update your Railway branch** (if needed):
   - Go to Railway Dashboard → Your Project → Settings
   - Update the branch to match your current deployment branch
   - Redeploy backend

3. **Verify backend is running**:
   ```bash
   curl https://your-railway-url.up.railway.app/graphql \
     -H 'Content-Type: application/json' \
     -d '{"query": "{ __typename }"}'
   ```

See [Troubleshooting](#white-screen-on-vercel-deployment) section for detailed debugging.

---

## Architecture Overview

```
┌─────────────────┐         ┌──────────────────────────────┐
│                 │         │                              │
│  Vercel (FREE)  │────────▶│  Railway/Render (FREE tier) │
│                 │  HTTPS  │                              │
│  Static UI      │         │  Docker Container:           │
│  (Console)      │         │   • GraphQL API (port 4000)  │
│                 │         │   • spaCy Parser (port 8000) │
└─────────────────┘         └──────────────────────────────┘
```

### CRITICAL: Backend-First Architecture

**Entity Detection Engine Location: Backend Only**

All sophisticated entity detection logic lives in `app/editor/entityHighlighter.ts` on the backend. This is the **single source of truth** for:
- Pattern-based NLP detection
- Dialogue patterns, honorifics, multi-word names
- Alias packs, appositives, event seeds
- LLM-based detection (spaCy NER)
- Confidence scoring and overlap removal

**Frontend Role: API Consumer**

The frontend (`app/ui/console/src/types/entities.ts`) should ONLY:
- Call the GraphQL `detectEntities` query
- Display results with highlighting UI
- Provide fallback tag-only detection if API fails

**DO NOT duplicate pattern logic in the frontend!** This creates:
- Maintenance burden (duplicate code to maintain)
- Inconsistent results between frontend/backend
- Loss of backend improvements (aliases, LLM, etc.)

**Extraction Lab Purpose:**

The Extraction Lab (`/lab` route) is specifically designed to test and validate the backend entity detection engine. Changes to pattern matching, safeguards, and detection logic should be tested here to verify they work across all of ARES.

## Option 1: Railway (Recommended - Easiest)

### Step 1: Install Railway CLI
```bash
npm install -g @railway/cli
```

### Step 2: Login
```bash
railway login
```

### Step 3: Initialize Project
```bash
railway init
# When prompted, create a new project
```

### Step 4: Deploy
```bash
railway up
```

### Step 5: Get Your URL
```bash
railway domain
# Returns: https://your-app.up.railway.app
```

### Step 6: Configure UI to Use Backend

**IMPORTANT**: The frontend needs to know your backend URL. Create this file:

```bash
cd app/ui/console
cp .env.production.example .env.production
```

Edit `app/ui/console/.env.production`:
```env
VITE_GRAPHQL_URL=https://your-app.up.railway.app/graphql
```

Replace `your-app.up.railway.app` with your actual Railway URL from step 5.

### Step 7: Configure Vercel Environment Variable

In your Vercel dashboard:
1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add a new variable:
   - **Name**: `VITE_GRAPHQL_URL`
   - **Value**: `https://your-app.up.railway.app/graphql`
   - **Environments**: Production, Preview

Or use the Vercel CLI:
```bash
vercel env add VITE_GRAPHQL_URL production
# When prompted, enter: https://your-app.up.railway.app/graphql
```

### Step 8: Redeploy UI to Vercel
```bash
git add app/ui/console/.env.production
git commit -m "feat: configure backend URL for production"
git push
# Vercel will auto-deploy on git push
```

**Done! Your app is live.**

## Option 2: Render

### Step 1: Create Account
Go to https://render.com and sign up (free)

### Step 2: New Web Service
1. Click "New +" → "Web Service"
2. Connect your GitHub repo
3. Select "ARES" repository
4. Settings:
   - Name: `ares-backend`
   - Environment: `Docker`
   - Instance Type: `Free`
   - Build Command: (auto-detected from Dockerfile)

### Step 3: Deploy
Click "Create Web Service" - deployment starts automatically

### Step 4: Get Your URL
Once deployed, you'll see: `https://ares-backend.onrender.com`

### Step 5: Configure UI
Same as Railway step 6 above, using your Render URL

## Option 3: Fly.io

### Step 1: Install Fly CLI
```bash
curl -L https://fly.io/install.sh | sh
```

### Step 2: Login
```bash
fly auth login
```

### Step 3: Launch
```bash
fly launch
# Answer prompts:
# - App name: ares-backend
# - Region: Choose closest to you
# - PostgreSQL: No (we use SQLite)
# - Redis: No
```

### Step 4: Deploy
```bash
fly deploy
```

### Step 5: Get URL
```bash
fly status
# Shows: https://ares-backend.fly.dev
```

## Environment Variables

All platforms support environment variables. Add these to your backend deployment:

```env
NODE_ENV=production
PORT=4000
PARSER_PORT=8000
DATA_DIR=/app/data
```

## Cost Comparison

| Platform | Free Tier | Paid (if needed) |
|----------|-----------|------------------|
| Railway  | $5/month credit (500 hrs) | $5-20/month |
| Render   | 750 hrs/month | $7/month |
| Fly.io   | 3 VMs always free | $2/month per VM |
| Vercel (UI only) | Unlimited | Free for hobby |

**Recommendation:** Start with Railway free tier. Upgrade if you exceed limits.

## Testing Deployment

After backend is deployed:

```bash
# Test parser health
curl https://your-backend-url.com:8000/health

# Test GraphQL API
curl https://your-backend-url.com:4000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query": "{ __typename }"}'
```

## Troubleshooting

### White Screen on Vercel Deployment

**Symptom**: Visiting your Vercel URL shows only a white screen with no content.

**Cause**: The frontend is trying to connect to `/graphql` (relative path), but there's no backend running on Vercel.

**Solution**:
1. Make sure you've deployed your backend to Railway/Render/Fly.io
2. Configure the `VITE_GRAPHQL_URL` environment variable in Vercel dashboard:
   ```
   VITE_GRAPHQL_URL=https://your-backend-url.up.railway.app/graphql
   ```
3. Redeploy from Vercel dashboard or push a new commit

**How to verify**:
```bash
# Check if backend is accessible
curl https://your-backend-url.up.railway.app/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query": "{ __typename }"}'

# Should return: {"data":{"__typename":"Query"}}
```

**Browser debugging**:
- Open DevTools (F12)
- Check Console tab for errors
- Check Network tab - look for failed `/graphql` requests
- If you see `Failed to fetch`, the environment variable is not configured

### "Build failed: Out of memory"
- Increase instance size (not needed on free tier usually)
- Dockerfile is optimized for small instances

### "Parser not responding"
- Check logs: `railway logs` or Render dashboard
- Parser starts on port 8000 inside container
- Make sure spaCy model downloads correctly

### "CORS errors from UI"
- Add your Vercel URL to CORS whitelist in backend CORS configuration
- Check Railway/Render logs for CORS-related errors

### "TypeScript compilation errors: Cannot use JSX" or other type errors

**Symptom**: Railway/Render build fails with TypeScript errors (JSX errors, missing properties, type mismatches).

**Cause**: The backend TypeScript compiler was trying to compile frontend React apps, tests, and had strict type checking enabled.

**Solution**:
1. The `tsconfig.json` now excludes frontend UI directories and tests:
   ```json
   "include": ["app/**/*"],
   "exclude": ["node_modules", "dist", ".venv", "app/ui/**", "app/desktop-tester/**"]
   ```

2. The Dockerfile uses `tsc --noEmitOnError false` to transpile code even if there are type errors:
   ```dockerfile
   RUN npx tsc --noEmitOnError false
   ```

Frontend apps are built separately by Vite/Vercel. Tests validate type correctness locally via `npm test`.

## iPad-Friendly Workflow

You can deploy from iPad using:

1. **Railway Web Dashboard**
   - Go to railway.app
   - Connect GitHub repo
   - Deploy from browser (no CLI needed!)

2. **Render Web Dashboard**
   - Go to render.com
   - Same as Railway, fully browser-based

3. **GitHub Actions** (Set it and forget it)
   - Auto-deploy on every git push to main
   - No terminal needed at all

## Summary

**For your iPad workflow:**
1. Deploy backend to Railway (use web dashboard, no terminal)
2. Keep UI on Vercel (already working)
3. Total cost: $0 (both free tiers)
4. Total time: 10 minutes

The spaCy parser runs great on Railway/Render/Fly.io - these platforms are designed for Docker containers with Python/ML dependencies.

## Extraction Lab Deployment

For detailed instructions on deploying the Extraction Lab feature (real-time entity extraction UI), see:

**[DEPLOYMENT_EXTRACTION_LAB.md](./DEPLOYMENT_EXTRACTION_LAB.md)**

This guide covers:
- Frontend-backend communication setup
- Environment variable configuration for Vercel and Railway
- CORS configuration for distributed deployment
- Troubleshooting extraction endpoint issues
