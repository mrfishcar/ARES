# Quick Deploy Guide - Extraction Lab

## TL;DR - Get Extraction Lab Running in Production

### 1. Deploy Backend (5 minutes)

```bash
# From ARES root directory
cd /Users/corygilford/ares

# Deploy to Railway (one command)
railway up

# Get your backend URL
railway domain
# Copy this URL, e.g., https://ares-production.up.railway.app
```

### 2. Configure Frontend (2 minutes)

In **Vercel Dashboard** → Your Project → Settings → Environment Variables:

Add:
```
VITE_API_URL = https://ares-production.up.railway.app
```

(Replace with your actual Railway URL from step 1)

### 3. Deploy Frontend (2 minutes)

**Option A: Auto-deploy (if GitHub connected)**
```bash
git add .
git commit -m "Configure production API URL"
git push origin main
```
Vercel auto-deploys on push.

**Option B: Manual deploy**
```bash
cd /Users/corygilford/ares/app/ui/console
vercel --prod
```

### 4. Test (1 minute)

1. Open your Vercel URL: `https://ares-console.vercel.app`
2. Click "Extraction Lab" in sidebar
3. Paste test text: `"Aragorn became King of Gondor in 3019."`
4. Click "Extract"
5. Should see entities highlighted

## That's It!

Total time: 10 minutes
Total cost: $0 (free tiers)

## Troubleshooting

**Frontend shows "Failed to fetch"?**
- Check Vercel environment variable is set
- Verify Railway backend is running: `curl https://your-url.up.railway.app/healthz`

**Backend not responding?**
- Check Railway logs: `railway logs`
- Restart: `railway up`

**Still stuck?**
See [DEPLOYMENT_EXTRACTION_LAB.md](./DEPLOYMENT_EXTRACTION_LAB.md) for detailed guide.

## Local Development

Want to test locally first?

```bash
# Terminal 1: Start backend
cd /Users/corygilford/ares
npm run parser          # Start spaCy parser
ts-node app/api/graphql.ts  # Start GraphQL API (port 4000)

# Terminal 2: Start frontend
cd app/ui/console
npm run dev             # Vite dev server (port 5173)
```

Open http://localhost:5173 and test Extraction Lab.

## Verification Commands

```bash
# Check backend health
curl https://your-railway-url.up.railway.app/healthz
# Should return: "ok"

# Test extraction endpoint
curl -X POST https://your-railway-url.up.railway.app/extract-entities \
  -H "Content-Type: application/json" \
  -d '{"text": "Aragorn became King of Gondor."}'
# Should return JSON with entities

# Check Vercel environment variables
vercel env ls
```

## Common URLs

- **Railway Dashboard:** https://railway.app/dashboard
- **Vercel Dashboard:** https://vercel.com/dashboard
- **Local Frontend:** http://localhost:5173
- **Local Backend:** http://localhost:4000

## Need Help?

1. Read [EXTRACTION_LAB_DEPLOYMENT_SUMMARY.md](./EXTRACTION_LAB_DEPLOYMENT_SUMMARY.md)
2. Check [DEPLOYMENT_EXTRACTION_LAB.md](./DEPLOYMENT_EXTRACTION_LAB.md)
3. Review Railway logs: `railway logs`
4. Check Vercel deployment logs in dashboard
