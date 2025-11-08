# Vercel Entity Highlighting Diagnosis

## Root Cause

The Vercel deployment's entity highlighting is not working because it's using a **completely separate system** from the backend extraction pipeline we just fixed.

### Architecture:

```
Backend (Local)                  Frontend (Vercel)
===============                  =================
spaCy Parser Service    ←--X--→  Entity Highlighter
(port 8000, localhost)           (client-side browser code)
     ↓                                    ↓
extractFromSegments()            highlightEntities()
     ↓                                    ↓
Relations extracted              Algorithm-based patterns
✓ WORKING                        ⚠️ NOT USING SPACY
```

### Why Highlighting Doesn't Work on Vercel:

1. **app/ui/console** (Vercel deployment) uses `app/editor/entityHighlighter.ts`
2. **entityHighlighter.ts** tries to connect to `http://127.0.0.1:8000` (parser service)
3. **Browser can't reach localhost** from deployed Vercel site
4. **Falls back to MockParserClient** → returns empty/fake data
5. **LLM mode disabled by default** (`enableLLM: false`)
6. **Uses pure algorithm patterns** which may have bugs or limitations

### What We Fixed (Not Affecting Vercel):

- ✅ Started spaCy parser service on localhost:8000
- ✅ Fixed relation extraction patterns
- ✅ Fixed entity title detection
- ✅ Improved entity filtering

**None of these improvements reach the Vercel deployment!**

## Solution Options

### Option 1: Deploy Parser Service (Best Long-term)

Deploy the spaCy parser service to a public endpoint:
- Use Railway, Render, or Heroku
- Update `PARSER_URL` environment variable
- Enable `enableLLM: true` in entityHighlighter

**Pros**: Full spaCy NER accuracy on Vercel
**Cons**: Requires infrastructure deployment

### Option 2: Improve Client-Side Patterns (Quick Fix)

The entityHighlighter already has extensive patterns (`ENTITY_PATTERNS`).
Debug and fix any issues with the algorithm-based detection.

**Pros**: No backend needed, works immediately
**Cons**: Lower accuracy than spaCy

### Option 3: Hybrid - Use Backend for Extraction Lab

For the Extraction Lab page, add an API endpoint that calls the backend extraction:
- Frontend sends text to API route
- API calls local extraction pipeline (with spaCy)
- Returns entities to frontend

**Pros**: Best of both worlds
**Cons**: Requires API endpoint on Vercel

## Recommended Immediate Action

1. **Test current algorithm patterns** - They should be working but may have bugs
2. **Enable debug logging** in entityHighlighter to see what's failing
3. **Create test page** to verify patterns are matching

## Files Involved

- `app/editor/entityHighlighter.ts` - Client-side highlighter (Vercel)
- `app/parser/createClient.ts` - Parser client factory
- `app/ui/console/src/pages/ExtractionLab.tsx` - Uses highlighter
- `scripts/parser_service.py` - spaCy service (localhost only)

## Next Steps

1. Test if algorithm patterns are working at all
2. If not, debug pattern matching logic
3. Consider deploying parser service for production use
