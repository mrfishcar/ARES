# Adaptive Entity Profiling - Implementation Complete

## Overview

We've successfully integrated **adaptive entity profiling** into ARES. The system now learns about entities over time, making extraction smarter with more data.

## What Was Implemented

### 1. Entity Profiler Module (`app/engine/entity-profiler.ts`)

Creates and maintains profiles for every entity:

```typescript
EntityProfile {
  descriptors: ["wizard", "grey", "powerful"]
  titles: ["Gandalf the Grey", "Mithrandir"]
  roles: ["wizard", "member of Istari"]
  attributes: { color: ["grey"], power: ["great", "powerful"] }
  mention_count: 15
  confidence_score: 0.95
}
```

**Key Features:**
- Extracts descriptors from appositive constructions ("X, a powerful wizard")
- Identifies roles from context ("X the wizard")
- Builds structured attributes (color, age, power, etc.)
- Tracks mention frequency for confidence scoring
- Stores context sentences for evidence

### 2. Integration with Orchestrator

**Modified:** `app/engine/extract/orchestrator.ts`

- Accepts existing profiles as input
- Builds/updates profiles during extraction
- Returns updated profiles for persistence
- Profiles grow with each document processed

### 3. Enhanced Coreference Resolution

**Modified:** `app/engine/coref.ts`

- Uses profiles for descriptor-based resolution
- "the wizard" → searches profiles for entities with descriptor "wizard"
- Ranks matches by confidence (mention frequency × profile score)
- Falls back to local paragraph context if profiles don't match

**Example:**
```
Document 1: "Gandalf the Grey, a powerful wizard"
  → Profile: descriptors=[wizard, grey, powerful]

Document 2: "The wizard arrived"
  → Resolves "the wizard" to Gandalf via profile lookup
```

### 4. Cross-Document Persistence

**Modified:** `app/storage/storage.ts`

- Profiles saved to `ares_graph.json` alongside entities/relations
- Loaded automatically when processing new documents
- Profiles accumulate knowledge across documents
- Backward compatible (existing graphs work fine)

**Data Structure:**
```json
{
  "entities": [...],
  "relations": [...],
  "profiles": {
    "entity_123": {
      "canonical": "Gandalf",
      "descriptors": ["wizard", "grey"],
      "mention_count": 5,
      "confidence_score": 0.75,
      ...
    }
  }
}
```

### 5. Schema Updates

**Modified:** `app/engine/schema.ts`

- Added `spoke_to` and `met` predicates for fiction extraction
- Added GUARD entries for type validation
- Added INVERSE mappings for symmetric relations

## How It Works

### Extraction Flow

```
1. Load existing profiles from graph
2. Extract entities from new document
3. Build/update profiles for each entity mention
4. Use profiles to resolve ambiguous references
5. Save updated profiles to graph
```

### Profile Building

```
Text: "Gandalf the Grey, a powerful wizard, traveled to Rivendell"

Extract:
- Appositive: "a powerful wizard" → descriptors=[powerful, wizard]
- Title: "Gandalf the Grey" → titles=[Gandalf the Grey]
- Attributes: color=grey, power=powerful
```

### Profile-Enhanced Resolution

```
Text: "The wizard spoke to Elrond"

Resolution:
1. Extract descriptor: "wizard"
2. Search profiles: findByDescriptor("wizard")
3. Find: Gandalf (confidence: 0.85, mentions: 5)
4. Resolve: "the wizard" → Gandalf
5. Extract relation: spoke_to(Gandalf, Elrond)
```

## Benefits

### 1. Cross-Document Learning
- Knowledge from Document 1 helps process Document 2
- "the wizard" in Doc 2 resolves to "Gandalf" from Doc 1
- No need to repeat full names/descriptions

### 2. Improved Recall
- More relations extracted via pronoun/descriptor resolution
- Ambiguous references resolved correctly
- Better handling of varied writing styles

### 3. Confidence Scoring
- Entities mentioned more = higher confidence
- Reduces false positive resolutions
- Prioritizes well-established entities

### 4. Deterministic & Fast
- Rule-based (no LLM calls for resolution)
- Token-efficient
- Works offline
- Fully transparent

## Testing

### Test Script: `test-adaptive-learning.ts`

Demonstrates progressive learning across 3 documents:

```bash
npx ts-node test-adaptive-learning.ts
```

**Expected Output:**
- Document 1: Creates Gandalf profile
- Document 2: Uses profile to resolve "the wizard"
- Document 3: Further enriches profile with "grey wizard"

### Verification

Check `test-adaptive-graph.json`:
```json
"profiles": {
  "entity_xxx": {
    "canonical": "Gandalf",
    "descriptors": ["wizard", "grey"],
    "titles": ["Gandalf", "Gandalf the Grey"],
    "roles": ["wizard", "member"],
    "attributes": {
      "color": ["grey"],
      "power": ["powerful", "great"]
    },
    "mention_count": 5,
    "confidence_score": 0.75
  }
}
```

## Performance Impact

- **Minimal overhead**: Profile building is fast (regex + word matching)
- **Storage**: ~200-500 bytes per entity profile
- **Lookup**: O(1) for entity ID, O(n) for descriptor search (n = # entities)
- **Token cost**: Zero (no LLM calls)

## Future Enhancements

### Short-Term
1. **Fuzzy matching**: "grey wizard" vs "gray wizard"
2. **Temporal tracking**: Profile changes over time
3. **Confidence decay**: Old mentions count less

### Long-Term
1. **Profile merging**: Combine profiles when aliases detected
2. **Statistical features**: TF-IDF for descriptor importance
3. **Visual profiles**: Generate summaries for UI display

## Architecture Principles

- ✅ **Rule-based**: No black-box ML
- ✅ **Deterministic**: Same input → same output
- ✅ **Transparent**: All decisions traceable
- ✅ **Incremental**: Profiles grow with data
- ✅ **Offline-first**: No cloud dependencies

## Integration Points

### For Developers

**Using profiles in new extractors:**
```typescript
import { findByDescriptor } from './entity-profiler';

// Find entities matching a descriptor
const wizards = findByDescriptor('wizard', profiles, 'PERSON');
// Returns: [{entity_id: '...', confidence: 0.85}, ...]
```

**Accessing profiles in storage:**
```typescript
const graph = loadGraph();
const profile = graph.profiles.get(entity.id);
console.log(profile.descriptors); // ["wizard", "grey"]
```

## Documentation

- **Entity Profiler:** `app/engine/entity-profiler.ts` (full API docs in comments)
- **Test Example:** `test-adaptive-learning.ts` (end-to-end demo)
- **Storage Format:** `KnowledgeGraph` interface in `app/storage/storage.ts`

---

**Implementation Date:** October 29, 2025
**Status:** ✅ Complete & Tested
**Token Efficiency:** Zero LLM overhead
**Backward Compatible:** Yes
