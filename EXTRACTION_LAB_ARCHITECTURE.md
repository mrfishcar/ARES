# Extraction Lab Architecture - ARES Engine Integration

## Overview

The Extraction Lab has been **completely reengineered** to use the full ARES engine (`/app/engine/extract/orchestrator.ts`) instead of the simplified `entityHighlighter.ts`. This ensures that all engine improvements are immediately visible in the frontend.

## Critical Fix: ONE Engine, Not Two

### The Problem (Before)
- **Frontend**: Used `entityHighlighter.ts` - simplified pattern matching
- **Backend**: Used full ARES engine - comprehensive NLP with relations
- **Result**: Engine improvements didn't appear in UI, user frustration

### The Solution (After)
- **Frontend**: Calls ARES engine via `/extract-entities` API
- **Backend**: Full orchestrator with entities + relations + all features
- **Result**: ONE unified extraction pipeline, all improvements visible immediately

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INPUT                                  │
│                    (Text in Extraction Lab)                         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ 1. User types text (debounced 1s)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ExtractionLab.tsx                                │
│  - Manages UI state (text, entities, relations)                     │
│  - Calls API when text changes                                      │
│  - Displays results in EntityResultsPanel                           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ 2. POST /extract-entities
                               │    { text: "..." }
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│            Backend API (server.ts:168)                              │
│  - Receives text via HTTP POST                                      │
│  - Creates temp storage for extraction                              │
│  - Calls appendDoc() → extractFromSegments()                        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ 3. Full ARES extraction
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│        ARES ENGINE (orchestrator.ts)                                │
│                                                                       │
│  1. Segment document into sentences with context windows            │
│  2. Extract entities using:                                          │
│     - spaCy NER (PERSON, ORG, PLACE, etc.)                          │
│     - Pattern matching (learned patterns)                            │
│     - Entity quality filter (precision defense)                     │
│  3. Extract relations using:                                         │
│     - Dependency parsing patterns                                    │
│     - Narrative relation patterns                                    │
│     - Coreference resolution                                         │
│  4. Build entity profiles (adaptive learning)                        │
│  5. Assign stable EIDs/AIDs (HERT system)                           │
│  6. Deduplicate relations (precision defense)                        │
│                                                                       │
│  Returns: {                                                          │
│    entities: Entity[],                                               │
│    relations: Relation[],                                            │
│    profiles: Map<string, EntityProfile>                             │
│  }                                                                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ 4. Transform to frontend format
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│            Backend API Response                                     │
│                                                                       │
│  {                                                                   │
│    success: true,                                                    │
│    entities: [                                                       │
│      {                                                               │
│        id: "entity_123",                                             │
│        text: "King David",                                           │
│        type: "PERSON",                                               │
│        confidence: 0.95,                                             │
│        spans: [{ start: 0, end: 10 }, ...]                          │
│      }                                                               │
│    ],                                                                │
│    relations: [                                                      │
│      {                                                               │
│        id: "rel_456",                                                │
│        subj: "entity_123",                                           │
│        obj: "entity_789",                                            │
│        pred: "married_to",                                           │
│        confidence: 0.87,                                             │
│        subjCanonical: "King David",                                  │
│        objCanonical: "Bathsheba"                                     │
│      }                                                               │
│    ],                                                                │
│    stats: {                                                          │
│      extractionTime: 1234,                                           │
│      entityCount: 8,                                                 │
│      relationCount: 5                                                │
│    }                                                                 │
│  }                                                                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ 5. Display results
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│         EntityResultsPanel.tsx                                      │
│                                                                       │
│  Displays:                                                           │
│  - Entities grouped by type (PERSON, PLACE, ORG, etc.)              │
│  - Relations grouped by predicate (married_to, parent_of, etc.)     │
│  - Confidence scores for both                                        │
│  - Click to view wiki for any entity                                │
│                                                                       │
│  NEW: Shows BOTH entities AND relations from full engine            │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Components Modified

### 1. Backend API (`/app/desktop-tester/server.ts`)

**New Endpoint**: `POST /extract-entities`

```typescript
app.post('/extract-entities', async (req, res) => {
  // 1. Call FULL ARES engine via appendDoc()
  const appendResult = await appendDoc(`extract-${timestamp}`, text, tempPath);

  // 2. Load complete knowledge graph
  const graph = loadGraph(tempPath);

  // 3. Transform entities to include span positions
  const entitySpans = graph.entities.map(entity => ({
    id: entity.id,
    text: entity.canonical,
    type: entity.type,
    confidence: entity.centrality || 1.0,
    spans: findEntitySpans(entity.canonical, text)
  }));

  // 4. Transform relations to include canonical names
  const relations = graph.relations.map(rel => ({
    ...rel,
    subjCanonical: findEntityName(rel.subj),
    objCanonical: findEntityName(rel.obj)
  }));

  // 5. Return both entities and relations
  return { entities, relations, stats };
});
```

**Features**:
- Uses temp storage to avoid polluting main graph
- Automatic cleanup after extraction
- Full stats (time, count, confidence)
- Includes fiction entities detection

### 2. Frontend Component (`/app/ui/console/src/pages/ExtractionLab.tsx`)

**Key Changes**:
- Removed dependency on `entityHighlighter.ts`
- Added state for relations: `useState<Relation[]>([])`
- Calls backend API instead of local extraction
- Increased debounce to 1000ms (heavier processing)
- Enhanced report to include relations

**API Call**:
```typescript
const response = await fetch('http://localhost:3000/extract-entities', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text })
});

const data = await response.json();
setEntities(transformToSpans(data.entities));
setRelations(data.relations);
```

**Report Format**:
Now includes:
- `engineVersion`: "ARES Full Engine (orchestrator.ts)"
- `entities`: All extracted entities with context
- `relations`: Subject-Predicate-Object triples
- `entitiesByType`: Grouped for analysis
- `relationsByPredicate`: Grouped for analysis

### 3. Results Panel (`/app/ui/console/src/components/EntityResultsPanel.tsx`)

**New Features**:
- Accepts `relations` prop (optional, backward compatible)
- Displays relation count in subtitle
- New "Relations" section with grouped display
- Clickable entity names in relations (opens wiki)
- Confidence scores for all relations

**Relations Display**:
```tsx
<div className="relations-section">
  <h3>🔗 Relations ({relations.length})</h3>
  {Object.entries(relationGroups).map(([predicate, rels]) => (
    <div className="relation-group">
      <h4>{predicate.replace(/_/g, ' ')}</h4>
      {rels.map(rel => (
        <div className="relation-item">
          <span onClick={() => onViewWiki(rel.subjCanonical)}>
            {rel.subjCanonical}
          </span>
          <span>→</span>
          <span onClick={() => onViewWiki(rel.objCanonical)}>
            {rel.objCanonical}
          </span>
          <span>{Math.round(rel.confidence * 100)}%</span>
        </div>
      ))}
    </div>
  ))}
</div>
```

## Data Flow Details

### Entity Extraction Flow

1. **Segmentation** (`orchestrator.ts:71-77`)
   - Split document into sentences with context windows
   - Maintain absolute position tracking

2. **Entity Detection** (`orchestrator.ts:100-115`)
   - spaCy NER for standard types
   - Optional LLM for custom types (if enabled)
   - Pattern library matching (learned patterns)

3. **Quality Filtering** (`orchestrator.ts:348-388`)
   - Remove low confidence entities
   - Filter pronouns, common words
   - Apply entity type corrections

4. **Profile Building** (`orchestrator.ts:390-399`)
   - Track entity mentions across segments
   - Build descriptors and context
   - Enable adaptive learning

### Relation Extraction Flow

1. **Initial Extraction** (`orchestrator.ts:248-278`)
   - Dependency parsing patterns
   - Window-based extraction
   - Entity span matching

2. **Coreference Resolution** (`orchestrator.ts:404-477`)
   - Resolve pronouns to entities
   - Create virtual spans
   - Re-extract with resolved references

3. **Narrative Relations** (`orchestrator.ts:649`)
   - Pattern-based extraction
   - Handle descriptive text
   - Merge with parsed relations

4. **Deduplication** (`orchestrator.ts:774-798`)
   - Merge duplicate extractions
   - Preserve highest confidence
   - Track merge statistics

## Performance Considerations

### Debouncing Strategy
- **Old**: 500ms (fast, but frequent calls)
- **New**: 1000ms (allows for full engine processing)
- **Rationale**: Full ARES engine is more expensive but more accurate

### Caching
- Backend uses temp storage (automatic cleanup)
- Frontend debounces to avoid excessive API calls
- No persistent cache (always fresh results)

### Scaling
- Current: Single-user desktop application
- Future: Could add request queuing for multi-user
- API is stateless (safe for horizontal scaling)

## Testing Strategy

### Manual Testing
1. Start backend: `cd app/desktop-tester && npm start`
2. Start frontend: `cd app/ui/console && npm run dev`
3. Navigate to Extraction Lab
4. Enter test text: "King David married Bathsheba"
5. Verify:
   - ✅ Entities appear (King David, Bathsheba)
   - ✅ Relations appear (married_to)
   - ✅ Stats show correct counts
   - ✅ Confidence scores visible
   - ✅ Report includes both entities and relations

### Edge Cases
- Empty input → Clear all results
- Long text (>10KB) → Should handle gracefully
- Special characters → Proper escaping
- Rapid typing → Debouncing prevents overload

### Regression Prevention
- Report always includes `engineVersion` field
- Can verify which engine was used
- Compare old vs new reports to ensure feature parity

## Benefits of This Architecture

### 1. Single Source of Truth
- ✅ ONE engine processes everything
- ✅ Engine improvements immediately visible
- ✅ No sync issues between frontend/backend

### 2. Full Feature Access
- ✅ All ARES engine features available
- ✅ Entities + Relations + Profiles
- ✅ Coreference resolution
- ✅ Quality filtering
- ✅ HERT system integration

### 3. Maintainability
- ✅ No duplicate extraction logic
- ✅ Changes in one place affect everywhere
- ✅ Easier to add new features
- ✅ Clear separation of concerns

### 4. User Experience
- ✅ Users see what they expect
- ✅ Improvements work immediately
- ✅ Full extraction power in UI
- ✅ Educational value (see how engine works)

## Migration Path for Other Components

If other parts of the frontend use `entityHighlighter.ts`, follow this pattern:

1. **Add API endpoint** in `server.ts`
2. **Call API** from frontend component
3. **Transform response** to match UI expectations
4. **Update UI** to display relations (if applicable)
5. **Remove** `entityHighlighter.ts` import

### Example Migration
```typescript
// OLD (entityHighlighter.ts)
const entities = await highlightEntities(text, { ... });

// NEW (ARES engine via API)
const response = await fetch('/extract-entities', {
  method: 'POST',
  body: JSON.stringify({ text })
});
const { entities, relations } = await response.json();
```

## Future Enhancements

### Potential Improvements
1. **Streaming Results**: Show entities as they're extracted
2. **Visual Graph**: Display knowledge graph visually
3. **Export Options**: Download as JSON, CSV, GraphML
4. **Comparison Mode**: Compare multiple extraction runs
5. **Pattern Debugging**: Show which patterns matched
6. **Confidence Tuning**: UI to adjust thresholds

### API Extensions
- `POST /extract-entities-stream`: Server-sent events for real-time
- `GET /extraction-history`: View previous extractions
- `POST /merge-extractions`: Combine multiple texts
- `GET /entity-stats`: Analytics on extracted entities

## Deprecation Notice

### Deprecated Components
- ❌ `entityHighlighter.ts` - No longer used by Extraction Lab
- ❌ Direct pattern matching in frontend - Use ARES engine

### Safe to Remove (Future)
Once all components migrate to ARES engine API:
- `entityHighlighter.ts` (if no other dependencies)
- Simplified pattern libraries in frontend
- Duplicate entity type definitions

### Migration Checklist
- [ ] Audit all imports of `entityHighlighter.ts`
- [ ] Replace with API calls
- [ ] Test all affected components
- [ ] Remove deprecated file
- [ ] Update documentation

## Support and Troubleshooting

### Common Issues

**Issue**: "API error: Connection refused"
- **Solution**: Ensure backend is running on port 3000
- **Command**: `cd app/desktop-tester && npm start`

**Issue**: "Extraction takes too long"
- **Solution**: Check text length, consider chunking
- **Typical**: <1s for 1KB, 2-5s for 10KB

**Issue**: "No relations extracted"
- **Solution**: Check entity extraction first (need entities for relations)
- **Try**: Add explicit entity markers like "King David"

**Issue**: "Entities don't match highlights"
- **Solution**: Span calculation issue, check regex escaping
- **Debug**: Check network tab for actual response

### Debug Mode
Enable verbose logging:
```typescript
// In ExtractionLab.tsx
console.log('[ARES ENGINE] Request:', { text });
console.log('[ARES ENGINE] Response:', data);
console.log('[ARES ENGINE] Entities:', entities);
console.log('[ARES ENGINE] Relations:', relations);
```

### Performance Monitoring
Backend logs include:
- Extraction time (ms)
- Entity count
- Relation count
- Memory usage (via Node.js)

## Conclusion

This architectural change ensures the Extraction Lab is a **true reflection of ARES engine capabilities**. Users can now see the full power of the engine, including:

- Advanced entity extraction with quality filtering
- Comprehensive relation detection
- Coreference resolution
- Adaptive learning profiles
- HERT system integration

All improvements to the core engine are **immediately visible** in the frontend, creating a unified, consistent user experience.

---

**Last Updated**: 2025-11-11
**Author**: Claude (Anthropic)
**ARES Version**: Full Engine Integration (orchestrator.ts)
