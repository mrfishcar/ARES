# Vercel Deployment Guide for ARES

This guide explains how to deploy the ARES Console UI to Vercel for online testing.

## What Gets Deployed

- **Frontend**: The ARES Console UI (`app/ui/console`)
- **Extraction Lab**: Phase 0 testing interface at `/lab` route
- **Entity Detection**: Runs client-side (no backend needed for Phase 0)

## Setup Instructions

### 1. Sign Up for Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **"Sign Up"**
3. Choose **"Continue with GitHub"** (easiest option)
4. Authorize Vercel to access your GitHub account

### 2. Import Your Repository

1. Once logged in, click **"Add New..."** → **"Project"**
2. Find your **ARES repository** in the list
3. Click **"Import"**

### 3. Configure Project Settings

Vercel should auto-detect the settings from `vercel.json`, but verify:

- **Framework Preset**: Vite (or Other if not available)
- **Build Command**: `cd app/ui/console && npm install && npm run build`
- **Output Directory**: `app/ui/console/dist`
- **Install Command**: `cd app/ui/console && npm install`

### 4. Deploy

1. Click **"Deploy"**
2. Wait 1-2 minutes for build to complete
3. You'll get a live URL like: `https://ares-abc123.vercel.app`

## Automatic Deployments

Once set up, Vercel will automatically:

- **Deploy main branch** → Production URL
- **Deploy feature branches** → Preview URLs (e.g., `ares-branch-xyz.vercel.app`)
- Every git push triggers a new deployment

## Testing Workflow

```
1. Claude pushes changes to branch
   ↓
2. Vercel auto-builds and deploys
   ↓
3. You get preview URL notification
   ↓
4. Test in browser (no local setup needed!)
   ↓
5. Give feedback to Claude
```

## Accessing the Extraction Lab

Once deployed, visit:
```
https://your-deployment-url.vercel.app/lab
```

## Environment Variables (Optional)

If you need backend API access later:
1. Go to Project Settings → Environment Variables
2. Add:
   - `VITE_API_URL` → Your backend URL
   - `VITE_GRAPHQL_URL` → Your GraphQL endpoint

## Troubleshooting

### Build Fails
- Check the build logs in Vercel dashboard
- Verify `package.json` and `package-lock.json` are committed
- Ensure TypeScript compiles successfully

### Blank Page
- Check browser console for errors
- Verify routing is working (rewrites in vercel.json)
- Try accessing `/lab` directly

### Need Backend
- Phase 0 (Extraction Lab) works without backend
- For full features, you'll need to deploy backend separately (Render, Railway, etc.)

## Next Steps

After testing Phase 0:
- **Phase 1**: Deploy backend services (GraphQL API, parser)
- **Phase 2**: Connect frontend to production backend
- **Phase 3**: Custom domain (optional)

## Questions?

- [Vercel Documentation](https://vercel.com/docs)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)
