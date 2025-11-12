# Extraction Lab Quick Start Guide

## Overview
The Extraction Lab now uses the **FULL ARES ENGINE** for entity and relation extraction. Your engine improvements are instantly visible in the UI.

## Quick Start (2 Steps)

### Step 1: Start Backend Server
```bash
cd /Users/corygilford/ares/app/desktop-tester
npm start
```

Expected output:
```
🏺 Ares Wiki Generator - Desktop Tester

✓ Server running on http://localhost:3000
✓ Wiki output folder: /Users/corygilford/Desktop/test_wikis

📱 Open http://localhost:3000 in your browser
```

### Step 2: Start Frontend Console
```bash
cd /Users/corygilford/ares/app/ui/console
npm run dev
```

Expected output:
```
  VITE v5.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### Step 3: Access Extraction Lab
1. Open browser to `http://localhost:5173`
2. Navigate to **Extraction Lab** (in sidebar or navigation)
3. Start typing!

## Try It Out

### Example 1: Simple Relation
```
King David married Bathsheba
```

**Expected Results**:
- **Entities**: King David (PERSON), Bathsheba (PERSON)
- **Relations**: King David → married_to → Bathsheba
- **Confidence**: ~85-95%

### Example 2: Multiple Relations
```
King David married Bathsheba. They had a son named Solomon. Solomon became king after David.
```

**Expected Results**:
- **Entities**: King David, Bathsheba, Solomon (all PERSON)
- **Relations**:
  - David → married_to → Bathsheba
  - David → parent_of → Solomon
  - Bathsheba → parent_of → Solomon
  - Solomon → child_of → David
  - Solomon → became → king (if pattern detected)

### Example 3: Complex Narrative
```
In Jerusalem, King David ruled Israel. He married Bathsheba, who was the wife of Uriah the Hittite. They had a son, Solomon, who later became the wisest king.
```

**Expected Results**:
- **Entities**: Jerusalem (PLACE), King David (PERSON), Israel (PLACE), Bathsheba (PERSON), Uriah the Hittite (PERSON), Solomon (PERSON)
- **Relations**: 10+ relations including married_to, parent_of, rules, lives_in, etc.

## What You'll See

### Header Stats
- ⏱️ **Time**: Processing time in milliseconds
- 🎯 **Confidence**: Average confidence across all entities
- 📊 **Entity Count**: Total unique entities found
- 🔗 **Relation Count**: Total relations extracted

### Left Panel: Editor
- Write or paste text
- Updates automatically after 1 second of inactivity
- Syntax highlighting included

### Right Panel: Results

**Entities Section**:
- Grouped by type (👤 People, 🗺️ Places, etc.)
- Click any entity to view wiki page
- Shows confidence score

**Relations Section** (NEW!):
- Grouped by predicate (married_to, parent_of, etc.)
- Click entity names to view wikis
- Shows confidence scores
- Visual arrows (→) for clarity

## Features Powered by ARES Engine

### Entity Extraction
✅ spaCy NER (PERSON, ORG, PLACE, DATE, etc.)
✅ Pattern matching (learned patterns from bootstrapping)
✅ Entity quality filtering (removes pronouns, low-quality)
✅ Type correction (lexical markers)
✅ Deduplication (merges similar entities)

### Relation Extraction
✅ Dependency parsing patterns
✅ Narrative relation patterns
✅ Coreference resolution (pronouns → entities)
✅ Deictic resolution ("there" → locations)
✅ Inverse relation generation (automatic)
✅ Conflict detection (married vs siblings)
✅ Deduplication (merges duplicate extractions)

### Advanced Features
✅ Entity profiles (adaptive learning)
✅ HERT system (stable identifiers)
✅ Alias resolution (multiple names → same entity)
✅ Sense disambiguation (same name → different people)
✅ Fiction entity detection (fantasy/sci-fi support)

## Copy Report Feature

Click **"📋 Copy Report"** to get a comprehensive JSON report including:

```json
{
  "timestamp": "2025-11-11T...",
  "engineVersion": "ARES Full Engine (orchestrator.ts)",
  "stats": {
    "processingTime": 1234,
    "entityCount": 8,
    "relationCount": 5
  },
  "entities": [...],
  "relations": [...],
  "entitiesByType": { "PERSON": [...], "PLACE": [...] },
  "relationsByPredicate": { "married_to": [...], ... }
}
```

Use this for:
- Debugging extraction issues
- Comparing different text inputs
- Analyzing engine performance
- Sharing results with team

## Performance Tips

### For Best Results
1. **Wait for processing**: Give the engine 1-2 seconds after typing
2. **Use proper capitalization**: "King David" better than "king david"
3. **Clear sentences**: Well-formed sentences improve accuracy
4. **Explicit names**: First occurrence should be full name

### Optimization
- **Short text (<1KB)**: Near-instant (<500ms)
- **Medium text (1-10KB)**: 1-3 seconds
- **Long text (>10KB)**: 3-10 seconds

### Troubleshooting
**Slow performance?**
- Check backend logs for timing breakdown
- Reduce text length for testing
- Ensure no other heavy processes running

**Missing entities?**
- Check capitalization
- Try adding titles ("King David" vs "David")
- Verify entity type expectations

**Missing relations?**
- Ensure both entities are extracted first
- Try explicit phrasing ("X married Y" vs "X and Y wed")
- Check confidence threshold (default 0.70)

## Advanced Usage

### Environment Variables
Configure ARES engine behavior:

```bash
# Minimum confidence for relations (default: 0.70)
export ARES_MIN_CONFIDENCE=0.60

# Precision mode (strict filtering)
export ARES_PRECISION_MODE=strict

# Enable entity quality filter (default: enabled)
export ARES_ENTITY_FILTER=1

# Enable relation deduplication (default: enabled)
export ARES_RELATION_DEDUP=1

# Relation patterns mode (baseline | expanded | hybrid)
export RELATION_PATTERNS_MODE=hybrid
```

Restart backend after changing environment variables.

### Custom Entity Types
Enable LLM-based custom types in `orchestrator.ts`:

```typescript
const llmConfig = {
  enabled: true,
  customEntityTypes: ['SPELL', 'CREATURE', 'ARTIFACT'],
  model: 'llama3.1'
};

const result = await extractFromSegments(docId, text, profiles, llmConfig);
```

### Pattern Libraries
Use learned patterns for zero-cost extraction:

```typescript
import { loadPatternLibrary } from '../bootstrap';

const patternLibrary = loadPatternLibrary('fantasy'); // or 'scripture', 'technical'
const result = await extractFromSegments(docId, text, profiles, llmConfig, patternLibrary);
```

## Comparison: Old vs New

### OLD (entityHighlighter.ts)
❌ Simple pattern matching
❌ No relations
❌ No coreference resolution
❌ No adaptive learning
❌ Engine improvements invisible in UI

### NEW (Full ARES Engine)
✅ Advanced NLP with spaCy
✅ Full relation extraction
✅ Coreference resolution
✅ Adaptive learning profiles
✅ All engine improvements visible immediately
✅ HERT system integration
✅ Pattern library support
✅ Quality filtering
✅ Conflict detection

## Next Steps

### Explore Features
1. Try different text types (narrative, dialogue, technical)
2. Test fiction vs non-fiction
3. Compare confidence scores
4. View generated wikis

### Integration
The same API endpoint (`/extract-entities`) can be used by:
- Other UI components
- Command-line tools
- External applications
- CI/CD pipelines

### Improvement Ideas
See `EXTRACTION_LAB_ARCHITECTURE.md` for:
- Streaming results
- Visual graph display
- Pattern debugging
- Confidence tuning UI

## Support

### Getting Help
- Check backend console for detailed logs
- Use "Copy Report" to share extraction results
- Enable debug mode in browser console
- Review `EXTRACTION_LAB_ARCHITECTURE.md` for deep dive

### Common Questions

**Q: Why is it slower than before?**
A: Full ARES engine does much more (relations, coreference, profiles). The trade-off is accuracy and completeness.

**Q: Can I use the old highlighter?**
A: Not recommended. The old highlighter is deprecated and misses most features.

**Q: How do I improve extraction quality?**
A: Use clear, well-formed sentences with proper capitalization and explicit entity names.

**Q: Where are the results stored?**
A: Extraction Lab uses temporary storage (auto-deleted). For persistent storage, use the main wiki generator.

## Summary

You now have access to the **FULL POWER** of the ARES engine directly in the UI. Every improvement you make to the engine will immediately appear in the Extraction Lab. No more disconnect between frontend and backend!

**Happy Extracting! 🧪**

---

**Last Updated**: 2025-11-11
**For Issues**: Check EXTRACTION_LAB_ARCHITECTURE.md
**ARES Version**: Full Engine Integration
