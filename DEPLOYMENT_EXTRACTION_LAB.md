# Extraction Lab Deployment Guide

## Architecture Overview

The ARES system uses a **distributed deployment architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  VERCEL (Static Hosting - FREE)                                │
│  • React SPA (Console UI)                                      │
│  • Extraction Lab Frontend                                     │
│  • Build Output: /app/ui/console/dist                          │
│  • Domain: https://ares-console.vercel.app                     │
│                                                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ HTTPS API Calls
                     │ (CORS enabled)
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  RAILWAY (Container Hosting - FREE $5/month credit)            │
│  • Docker Container (Node.js + Python)                         │
│  • GraphQL API Server (Port 4000)                              │
│  • REST Endpoints:                                             │
│    - /extract-entities (POST) - For Extraction Lab             │
│    - /healthz, /readyz, /metrics - Observability              │
│    - /wiki-file, /media, /upload - File operations            │
│  • spaCy Parser Service (Port 8000)                            │
│  • ARES Extraction Engine                                      │
│  • Domain: https://your-app.up.railway.app                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Critical Components

### 1. Backend: GraphQL API Server (Deployed to Railway)

**Location:** `/app/api/graphql.ts`

**What Gets Deployed:**
- Full ARES extraction engine
- Entity and relation extraction pipeline
- spaCy NLP parser integration
- Knowledge graph storage

**Endpoints:**
- `POST /extract-entities` - Real-time entity extraction for Extraction Lab
- `POST /graphql` - GraphQL API for main application features
- `GET /healthz` - Health check
- `GET /metrics` - Prometheus metrics

**Environment Variables (Railway):**
```env
NODE_ENV=production
PORT=4000
PARSER_PORT=8000
DATA_DIR=/app/data
```

### 2. Frontend: React Console (Deployed to Vercel)

**Location:** `/app/ui/console/`

**What Gets Deployed:**
- Vite-built React SPA
- Extraction Lab UI
- Graph visualization
- Entity/relation browser

**Environment Variables (Vercel):**
```env
VITE_API_URL=https://your-app.up.railway.app
VITE_GRAPHQL_URL=https://your-app.up.railway.app/graphql
```

## Deployment Steps

### Step 1: Deploy Backend to Railway

#### Option A: Using Railway CLI (Recommended)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project (from ARES root directory)
cd /Users/corygilford/ares
railway init

# Deploy
railway up

# Get your backend URL
railway domain
# Example output: https://ares-backend-production.up.railway.app
```

#### Option B: Using Railway Web Dashboard

1. Go to [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your ARES repository
4. Railway will auto-detect the Dockerfile
5. Environment variables will be set automatically
6. Wait for deployment (5-10 minutes)
7. Copy your backend URL from the dashboard

### Step 2: Configure Frontend Environment Variables

Create `/app/ui/console/.env.production`:

```env
# Replace with your actual Railway backend URL
VITE_API_URL=https://ares-backend-production.up.railway.app
VITE_GRAPHQL_URL=https://ares-backend-production.up.railway.app/graphql
```

### Step 3: Deploy Frontend to Vercel

#### Option A: Using Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy from console directory
cd /Users/corygilford/ares/app/ui/console

# Build and deploy
vercel --prod

# Vercel will prompt for configuration:
# - Build Command: npm run build
# - Output Directory: dist
# - Install Command: npm install
```

#### Option B: Using Vercel Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project" → "Import Git Repository"
3. Select your ARES repository
4. Configure build settings:
   - **Framework Preset:** Vite
   - **Root Directory:** `app/ui/console`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Add environment variables:
   - `VITE_API_URL` = Your Railway backend URL
   - `VITE_GRAPHQL_URL` = Your Railway backend URL + `/graphql`
6. Click "Deploy"

#### Option C: Using Existing Vercel Config (Automated)

The project already has `/vercel.json` configured:

```json
{
  "version": 2,
  "buildCommand": "cd app/ui/console && npm install && npm run build",
  "outputDirectory": "app/ui/console/dist"
}
```

Just push to GitHub and Vercel will auto-deploy if you've connected the repo.

### Step 4: Verify Deployment

#### Test Backend Extraction Endpoint

```bash
curl -X POST https://your-railway-url.up.railway.app/extract-entities \
  -H "Content-Type: application/json" \
  -d '{"text": "Aragorn became King of Gondor in 3019."}'
```

Expected response:
```json
{
  "success": true,
  "entities": [...],
  "relations": [...],
  "stats": {
    "extractionTime": 1234,
    "entityCount": 3,
    "relationCount": 1
  }
}
```

#### Test Backend Health

```bash
curl https://your-railway-url.up.railway.app/healthz
# Expected: "ok"
```

#### Test Frontend

1. Open your Vercel URL: `https://ares-console.vercel.app`
2. Navigate to "Extraction Lab"
3. Paste test text and click "Extract"
4. Should see entities highlighted in real-time

## Troubleshooting

### Issue: Frontend Shows "Failed to fetch" Error

**Cause:** CORS not configured properly or backend URL incorrect

**Solution:**
1. Check frontend environment variables are set correctly in Vercel dashboard
2. Verify CORS headers in backend `/app/api/graphql.ts` (line 718-721)
3. Make sure backend is running: `curl https://your-railway-url/healthz`

### Issue: Extraction Takes Too Long or Times Out

**Cause:** Railway free tier CPU/memory limits

**Solution:**
1. Upgrade Railway plan to increase resources
2. Add request timeout handling in frontend
3. Optimize extraction for shorter texts first

### Issue: Backend Crashes on Railway

**Cause:** Out of memory or missing dependencies

**Solution:**
1. Check Railway logs: `railway logs`
2. Verify Python dependencies are installed correctly in Docker
3. Ensure spaCy model is downloading successfully
4. Check `DATA_DIR` environment variable is set

### Issue: "Module not found" Errors in Backend

**Cause:** TypeScript not compiled or dependencies not installed

**Solution:**
1. Verify Dockerfile builds correctly: `docker build -t ares .`
2. Check Railway build logs for compilation errors
3. Ensure `package.json` dependencies are up to date

### Issue: Environment Variables Not Working

**Cause:** Vite requires `VITE_` prefix for client-side variables

**Solution:**
- Backend env vars: No prefix needed (`NODE_ENV`, `PORT`)
- Frontend env vars: Must use `VITE_` prefix (`VITE_API_URL`)
- Redeploy after changing environment variables

## Local Development vs Production

### Local Development

**Backend:**
```bash
# Terminal 1: Start spaCy parser
cd /Users/corygilford/ares
npm run parser

# Terminal 2: Start GraphQL API
ts-node app/api/graphql.ts
# Runs on http://localhost:4000
```

**Frontend:**
```bash
cd /Users/corygilford/ares/app/ui/console
npm run dev
# Runs on http://localhost:5173
# Uses .env.local: VITE_API_URL=http://localhost:4000
```

### Production

**Backend:** Automatically started by Railway using Dockerfile CMD
- URL: `https://your-app.up.railway.app`

**Frontend:** Static files served by Vercel CDN
- URL: `https://ares-console.vercel.app`

## Cost Breakdown (as of 2025)

| Service | Free Tier | Cost if Exceeded |
|---------|-----------|------------------|
| Railway | $5/month credit (~500 hours) | $0.000463/GB-hour |
| Vercel  | Unlimited deploys, 100GB bandwidth | Free for hobby projects |
| **Total** | **$0/month** (within limits) | **~$5-10/month** if heavy usage |

## Environment Variable Reference

### Backend (Railway)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Set to `production` |
| `PORT` | No | `4000` | GraphQL API port |
| `PARSER_PORT` | No | `8000` | spaCy parser port |
| `DATA_DIR` | No | `/app/data` | Storage directory |

### Frontend (Vercel)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | Yes | `http://localhost:4000` | Backend API URL |
| `VITE_GRAPHQL_URL` | No | `${VITE_API_URL}/graphql` | GraphQL endpoint |

## Quick Deploy Commands

### Deploy Backend (Railway)
```bash
cd /Users/corygilford/ares
railway up
```

### Deploy Frontend (Vercel)
```bash
cd /Users/corygilford/ares/app/ui/console
vercel --prod
```

### Update Frontend Environment Variables
```bash
vercel env add VITE_API_URL production
# Paste your Railway URL when prompted
```

### View Logs
```bash
# Railway backend logs
railway logs

# Vercel deployment logs
vercel logs
```

## Success Checklist

- [ ] Backend deployed to Railway
- [ ] Backend health check returns "ok"
- [ ] Frontend deployed to Vercel
- [ ] Frontend environment variables set correctly
- [ ] Extraction Lab loads without errors
- [ ] Test extraction works end-to-end
- [ ] CORS headers allow Vercel domain
- [ ] Logs show successful extractions

## Next Steps After Deployment

1. **Custom Domain (Optional):**
   - Railway: Add custom domain in dashboard
   - Vercel: Add custom domain in settings

2. **Monitoring:**
   - Railway: Built-in metrics dashboard
   - Backend: `/metrics` endpoint for Prometheus
   - Frontend: Vercel Analytics (free)

3. **Scaling:**
   - Railway: Increase resources in project settings
   - Add caching layer for frequently extracted texts
   - Implement rate limiting (already in backend)

4. **Security:**
   - Add API key authentication for `/extract-entities`
   - Configure CORS to only allow your Vercel domain
   - Set up Railway secrets for sensitive config

## Additional Resources

- [Railway Documentation](https://docs.railway.app)
- [Vercel Documentation](https://vercel.com/docs)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [ARES Main Deployment Guide](/DEPLOYMENT.md)
