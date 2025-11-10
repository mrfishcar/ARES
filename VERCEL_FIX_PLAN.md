# Vercel Entity Highlighting - Fix Plan

## Current Status

✅ **Backend extraction working** (localhost)
- spaCy parser service running on port 8000
- Relation extraction functional (9 relations from test)
- Entity title detection working

❌ **Vercel highlighting not working**
- Uses client-side entityHighlighter.ts
- Can't reach localhost parser service
- Falls back to algorithm-only patterns

## Immediate Fix Options

### Option A: Deploy Parser Service (Recommended)

**Deploy `scripts/parser_service.py` to public endpoint:**

1. **Railway** (Easiest):
   ```bash
   # Install Railway CLI
   npm i -g @railway/cli

   # Login and init
   railway login
   railway init

   # Create railway.json:
   {
     "build": {
       "builder": "NIXPACKS"
     },
     "deploy": {
       "startCommand": "python3 -m uvicorn scripts.parser_service:app --host 0.0.0.0 --port $PORT",
       "healthcheckPath": "/health"
     }
   }

   # Deploy
   railway up
   ```

2. **Get deployment URL** (e.g., `https://parser-service.railway.app`)

3. **Update Vercel environment variable**:
   ```
   PARSER_URL=https://parser-service.railway.app
   ```

4. **Enable LLM mode in frontend**:
   ```typescript
   // app/editor/entityHighlighter.ts line 37
   enableLLM: true,  // Changed from false
   ```

**Pros**: Full spaCy accuracy on Vercel
**Cons**: Requires deployment (~10 min setup)

### Option B: API Route (Hybrid Approach)

Create Vercel API route that calls deployed extraction service:

1. **Deploy parser service** (same as Option A)
2. **Use `/api/extract` endpoint** (already created stub)
3. **Update ExtractionLab** to call API instead of direct highlighter

**Pros**: Clean separation, can add auth/rate limiting
**Cons**: Extra API call overhead

### Option C: Improve Client Patterns (Temporary)

Fix bugs in algorithm-based patterns:

1. Debug why patterns aren't matching
2. Add better title detection patterns
3. Improve confidence scoring

**Pros**: Works immediately, no deployment
**Cons**: Lower accuracy than spaCy

## Recommended Path Forward

1. **Deploy parser service to Railway** (10 minutes)
   - Simplest public deployment
   - Free tier available
   - Automatic HTTPS

2. **Update Vercel env vars**:
   ```
   PARSER_URL=https://your-app.railway.app
   ```

3. **Enable LLM mode**:
   ```typescript
   // entityHighlighter.ts
   enableLLM: true
   ```

4. **Redeploy Vercel** - will pick up new parser URL

## Implementation Steps

### Step 1: Deploy to Railway

```bash
cd /home/user/ARES
echo 'web: python3 -m uvicorn scripts.parser_service:app --host 0.0.0.0 --port $PORT' > Procfile
railway login
railway init
railway up
```

### Step 2: Get Railway URL

```bash
railway status
# Copy the URL (e.g., parser-service-production.up.railway.app)
```

### Step 3: Update Vercel

```bash
# In Vercel dashboard:
# Settings → Environment Variables → Add
PARSER_URL=https://your-railway-url.railway.app
```

### Step 4: Enable LLM Mode

```typescript
// app/editor/entityHighlighter.ts:37
const DEFAULT_CONFIG = {
  maxHighlights: 1000,
  minConfidence: 0.55,
  enableNaturalDetection: true,
  project: undefined as string | undefined,
  enableAliasPass: true,
  enableLLM: true,  // ← CHANGE THIS
  llmMode: 'hybrid' as 'hybrid' | 'llm-only' | 'algorithm-only',
};
```

### Step 5: Commit & Deploy

```bash
git add app/editor/entityHighlighter.ts
git commit -m "Enable LLM mode for Vercel entity highlighting"
git push

# Vercel auto-deploys on push
```

## Testing

After deployment:

1. Open Vercel app
2. Go to Extraction Lab page
3. Enter test text:
   ```
   Prince Zachary founded the Silver Order.
   Princess Isabella married Prince Zachary.
   General Thompson defeated the Dark Legion.
   ```
4. Verify entities are highlighted correctly

## Estimated Time

- **Option A (Railway)**: 15 minutes
- **Option B (API Route)**: 30 minutes
- **Option C (Fix Patterns)**: 2-3 hours (debugging)

## Files to Modify

- `app/editor/entityHighlighter.ts` - Enable LLM mode
- `Procfile` - Railway deployment config (create new)
- `railway.json` - Railway build config (create new)
- Vercel env vars - Add PARSER_URL

## Next Steps

1. Choose deployment option (recommend Railway)
2. Deploy parser service
3. Update Vercel config
4. Test highlighting

Once Vercel highlighting is fixed, continue with:
- Install en_core_web_lg for better accuracy
- Run comprehensive tests on all 4 chapters
- Reach 85%+ entity F1, 80%+ relation F1 goals
