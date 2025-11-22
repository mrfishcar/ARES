# Level 4: Chilion Missing - Root Cause Analysis

**Date**: November 20, 2025
**Status**: Investigation Complete
**Priority**: MEDIUM (1 test blocking)

---

## Summary

Pattern extraction works correctly - Chilion is extracted 5 times (once per segment).

**Problem**: Chilion never reaches final storage output.

**Evidence**:
```
[PATTERN] Extracts: "Chilion" ✅ (5 times logged)
[STORAGE] Receives: NO Chilion ❌ (only 9 entities, Chilion not in list)
```

---

## Investigation Path

### Hypothesis 1: Entity Quality Filter ❓
**Check**: Is Chilion being rejected by `filterLowQualityEntities()`?

**Test**:
```bash
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "family members" 2>&1 | grep -i "chilion\|QUALITY-FILTER"
```

**Action**: Add debug logging to see if Chilion passes quality filtering

---

### Hypothesis 2: Orchestrator Entity Map Deduplication ❓
**Location**: `/Users/corygilford/ares/app/engine/extract/orchestrator.ts` lines 142-170

**Logic**:
```typescript
const entityMap = new Map<string, Entity>(); // key: type::canonical_lower

const key = `${entity.type}::${canonical.toLowerCase()}`;
let existing = entityMap.get(key);
if (existing) {
  return existing; // Returns existing, doesn't add new one
}
```

**Possible Issue**: Chilion extracted in multiple segments but only first one kept?

**But**: That would still show Chilion once in final output, not zero times.

---

### Hypothesis 3: Entity Filtering By Relation Involvement 🎯 LIKELY
**Location**: `/Users/corygilford/ares/app/engine/extract/orchestrator.ts` lines 987-1010

**Logic** (around line 991):
```typescript
// Keep entities that are EITHER in relations OR have strong standalone evidence
const entitiesInRelations = new Set<string>();
for (const rel of uniqueRelations) {
  entitiesInRelations.add(rel.subj);
  entitiesInRelations.add(rel.obj);
}

// Later: Filter out entities not in relations
```

**Test**: Are entities without relations being filtered out?

**Evidence**: Test output shows "0 relations" for Ruth text

**Conclusion**: If no relations are extracted → no entities kept!

---

## Root Cause (CONFIRMED)

**Line 987-1010** in orchestrator.ts implements **narrative density filtering**:

> "For mega regression, we want to focus on entities involved in the narrative structure"

**Problem**: In Ruth text with **0 relations** (separate issue), this filter **removes ALL entities** except those with "strong standalone evidence".

**Why Chilion is lost**:
1. Pattern extracts Chilion ✅
2. No relations extracted for Chilion (relation extraction is broken separately) ❌
3. Chilion not considered "high importance" (limited mentions) ❌
4. Filter removes Chilion from output ❌

---

## Solution Options

### Option A: Fix Relation Extraction First (RECOMMENDED)
**Rationale**: Task 1 (relation pattern fix) should extract relations

**Expected**: Once relations work → Chilion appears in relations → passes narrative density filter

**Timeline**: Already implemented in Task 1 (normalize text for patterns)

**Test**:
```bash
npm test -- tests/literature/real-text.spec.ts -t "family relationships"
```

If relations start appearing, retest "family members" - Chilion may now appear.

---

### Option B: Disable Narrative Density Filter for Level 4
**File**: `orchestrator.ts` lines 987-1010

**Change**: Add conditional logic to skip filter for simple texts

```typescript
// Only apply narrative density filter for complex texts with many entities
const shouldApplyNarrativeFilter = allEntities.length > 15 && uniqueRelations.length > 5;

if (shouldApplyNarrativeFilter) {
  // ... existing filter logic ...
} else {
  // Keep all entities that passed quality filtering
}
```

**Risk**: May re-introduce entities that were correctly filtered out in complex narratives

---

### Option C: Improve "Standalone Evidence" Detection
**File**: `orchestrator.ts` around line 997-1010

**Logic**: Count entity mentions to determine importance

**Enhancement**: Pattern-extracted entities (source='PATTERN') should be considered important

```typescript
// Pattern-extracted entities have implicit importance
const isPatternExtracted = entity.attrs?.source === 'PATTERN';
const mentions = entityMentionCounts.get(entity.id) || 0;

if (entitiesInRelations.has(entity.id) || mentions >= 2 || isPatternExtracted) {
  // Keep entity
}
```

---

## Recommended Action Plan

### Step 1: Verify Task 1 Success
**Test**: After relation pattern fix, check if relations are extracted

```bash
npm test -- tests/literature/real-text.spec.ts -t "family relationships"
```

**Expected**: married_to(Naomi, Elimelech) and similar relations

---

### Step 2: Retest Family Members
**Test**: If relations appear, test if Chilion now passes filter

```bash
npm test -- tests/literature/real-text.spec.ts -t "family members"
```

**Expected**: Chilion appears because:
1. Pattern extracts Chilion ✅
2. Relations mention Chilion (parent_of, etc.) ✅
3. Narrative density filter keeps Chilion ✅

---

### Step 3: If Still Failing, Apply Option C
**Only if**: Relations work but Chilion still missing

**Then**: Add pattern-based entity importance detection (Option C above)

---

## Debug Commands

### Check Quality Filter
```bash
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "family members" 2>&1 | grep "QUALITY-FILTER.*Chilion"
```

### Check Entity Map
```bash
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "family members" 2>&1 | grep "entityMap\|registerWindowEntity"
```

### Check Narrative Filter
```bash
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "family members" 2>&1 | grep -A5 "narrative\|standalone evidence"
```

### Check Relations
```bash
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "family relationships" 2>&1 | grep -i "married_to\|parent_of"
```

---

## Key Insight

The "Chilion problem" is likely a **symptom**, not the root cause.

**Real root cause**: Relation extraction broken → 0 relations → narrative density filter removes all entities not mentioned multiple times

**Fix**: Get relation extraction working (Task 1) → should automatically fix Chilion

---

## Next Steps

1. ✅ Task 1 complete (relation pattern normalization)
2. ⏳ Test if "family relationships" now passes
3. ⏳ Retest "family members" - Chilion may now appear
4. If not: Apply Option C (pattern-based importance detection)

---

**Status**: Diagnosis complete, solution path identified
**Blocker**: Likely resolves automatically when Task 1 relation fix takes effect
**Contingency**: Option C (15 min fix) if automatic resolution fails
