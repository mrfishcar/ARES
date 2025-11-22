# Level 4: Fix Chilion Removal by Narrative Density Filter

**Date**: November 20, 2025
**Time**: 15 minutes
**Status**: Ready to implement
**Goal**: Make pattern-extracted entities bypass narrative density filter

---

## Problem

**Pattern extraction works**: Chilion extracted 5 times
**But**: Orchestrator narrative density filter removes Chilion before storage

**Evidence**:
```
[PATTERN] Extracts: "Chilion" ✅ (5 times)
[STORAGE] Receives: NO Chilion ❌
```

**Root Cause**: Orchestrator lines 987-1010 filter out entities not involved in relations AND with low mention counts. Chilion has 0 relations (separate issue) and limited mentions, so gets filtered.

---

## Solution

**Approach**: Pattern-extracted entities should be considered "important" and bypass the narrative density filter.

**Rationale**: If we explicitly extracted an entity via pattern matching, we want to keep it regardless of relation involvement.

---

## Implementation

### File
`/Users/corygilford/ares/app/engine/extract/orchestrator.ts`

### Step 1: Find the Narrative Density Filter Section

**Search for** (around line 987):
```typescript
// 9. Optional: Filter entities to improve precision in dense narratives
```

or search for:
```typescript
const entitiesInRelations = new Set<string>();
```

### Step 2: Add Helper Function

**Location**: Right before the entity filtering loop (around line 987-995)

**Add**:
```typescript
  // Helper: Check if entity was extracted via pattern matching
  const isPatternExtracted = (entity: Entity): boolean => {
    const source = entity.attrs?.source;
    return source === 'PATTERN' || source === 'pattern-conjunctive';
  };
```

### Step 3: Find the Entity Filtering Logic

**Search for** (around line 1005-1020):
```typescript
// Keep entities that are EITHER in relations OR have strong standalone evidence
```

You should find code like:
```typescript
const mentions = entityMentionCounts.get(entity.id) || 0;
const keepEntity = entitiesInRelations.has(entity.id) || mentions >= 2;
```

or similar filtering logic that determines which entities to keep.

### Step 4: Modify the Keep Condition

**Replace**:
```typescript
const keepEntity = entitiesInRelations.has(entity.id) || mentions >= 2;
```

**With**:
```typescript
const keepEntity =
  entitiesInRelations.has(entity.id) ||
  mentions >= 2 ||
  isPatternExtracted(entity);
```

**OR** if the code uses an `if` statement:

**Replace**:
```typescript
if (entitiesInRelations.has(entity.id) || mentions >= 2) {
  // keep entity
}
```

**With**:
```typescript
if (entitiesInRelations.has(entity.id) || mentions >= 2 || isPatternExtracted(entity)) {
  // keep entity
}
```

### Step 5: Add Debug Logging (Optional)

**Add** (inside the keep logic):
```typescript
if (isPatternExtracted(entity) && !entitiesInRelations.has(entity.id)) {
  if (process.env.L4_DEBUG === '1') {
    console.log(`[NARRATIVE-FILTER] Keeping pattern-extracted entity: ${entity.canonical} (not in relations but explicitly extracted)`);
  }
}
```

---

## Complete Code Example

**Location**: Around lines 987-1020 in orchestrator.ts

**Before**:
```typescript
// 9. Optional: Filter entities to improve precision in dense narratives
const entitiesInRelations = new Set<string>();
for (const rel of uniqueRelations) {
  entitiesInRelations.add(rel.subj);
  entitiesInRelations.add(rel.obj);
}

// Count entity mentions to determine importance
const entityMentionCounts = new Map<string, number>();
for (const span of allSpans) {
  const count = entityMentionCounts.get(span.entity_id) || 0;
  entityMentionCounts.set(span.entity_id, count + 1);
}

// Filter entities
const filteredEntities = allEntities.filter(entity => {
  const mentions = entityMentionCounts.get(entity.id) || 0;
  return entitiesInRelations.has(entity.id) || mentions >= 2;
});
```

**After**:
```typescript
// 9. Optional: Filter entities to improve precision in dense narratives
const entitiesInRelations = new Set<string>();
for (const rel of uniqueRelations) {
  entitiesInRelations.add(rel.subj);
  entitiesInRelations.add(rel.obj);
}

// Count entity mentions to determine importance
const entityMentionCounts = new Map<string, number>();
for (const span of allSpans) {
  const count = entityMentionCounts.get(span.entity_id) || 0;
  entityMentionCounts.set(span.entity_id, count + 1);
}

// Helper: Check if entity was extracted via pattern matching
const isPatternExtracted = (entity: Entity): boolean => {
  const source = entity.attrs?.source;
  return source === 'PATTERN' || source === 'pattern-conjunctive';
};

// Filter entities
const filteredEntities = allEntities.filter(entity => {
  const mentions = entityMentionCounts.get(entity.id) || 0;
  const inRelations = entitiesInRelations.has(entity.id);
  const patternBased = isPatternExtracted(entity);

  // Keep entities that are: in relations, have 2+ mentions, OR pattern-extracted
  const keepEntity = inRelations || mentions >= 2 || patternBased;

  if (process.env.L4_DEBUG === '1' && patternBased && !inRelations && mentions < 2) {
    console.log(`[NARRATIVE-FILTER] Keeping pattern-extracted entity: ${entity.canonical}`);
  }

  return keepEntity;
});
```

---

## Testing

### Step 1: Compile
```bash
cd /Users/corygilford/ares
npx tsc
```

### Step 2: Test Family Members
```bash
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "family members" 2>&1 | tee /tmp/chilion-fix.log
```

**Expected Output**:
```
[PATTERN] Conjunctive name: "Mahlon and Chilion" → "Chilion"
[NARRATIVE-FILTER] Keeping pattern-extracted entity: Chilion
...
✓ should extract family members from Ruth
```

### Step 3: Check Entity List
```bash
grep "PEOPLE FROM RUTH" /tmp/chilion-fix.log -A5
```

**Expected**:
```
=== PEOPLE FROM RUTH ===
Elimelech, Mahlon, Chilion, Naomi, Orpah, Ruth
```

### Step 4: Run Full Level 4
```bash
npm test -- tests/literature/real-text.spec.ts
```

**Expected**: 6 of 7 tests passing

### Step 5: Check for Regressions
```bash
npm test -- tests/ladder/
```

**Expected**: All Level 1-3 tests still passing

---

## Validation Checklist

- [ ] TypeScript compiles without errors
- [ ] Chilion appears in entity extraction output
- [ ] Debug log shows "Keeping pattern-extracted entity: Chilion"
- [ ] Test "family members from Ruth" passes
- [ ] Test "family relationships" still passes (from Task 1)
- [ ] Level 1-3 tests have no regressions
- [ ] Full Level 4: 6 of 7 tests passing

---

## Expected Results

### Before Fix
```
Level 4: 5 of 7 tests passing (71%)

✅ Extract family relationships (fixed by Task 1)
❌ Extract family members from Ruth (missing Chilion)
```

### After Fix
```
Level 4: 6 of 7 tests passing (86%)

✅ Extract family relationships
✅ Extract family members from Ruth ⭐ FIXED
```

**Remaining Failure**: DATE extraction (separate pipeline issue)

---

## Debug Commands

### Check if Chilion is being filtered
```bash
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "family members" 2>&1 | grep -i "chilion\|narrative"
```

### Check pattern extraction
```bash
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "family members" 2>&1 | grep "PATTERN"
```

### Check final entity list
```bash
npm test -- tests/literature/real-text.spec.ts -t "family members" 2>&1 | grep "PEOPLE FROM RUTH" -A10
```

---

## Troubleshooting

### Issue: TypeScript Error "Property 'attrs' does not exist"

**Cause**: Entity type definition missing attrs

**Fix**: The attrs property should exist on Entity type (defined in schema.ts line 187). If error persists, add type assertion:
```typescript
const source = (entity.attrs as any)?.source;
```

### Issue: Still No Chilion in Output

**Debug**:
1. Check if pattern extraction is working:
   ```bash
   grep "PATTERN.*Chilion" /tmp/chilion-fix.log
   ```
   Should show 5 extractions.

2. Check if helper function is being called:
   ```bash
   grep "NARRATIVE-FILTER.*Chilion" /tmp/chilion-fix.log
   ```
   Should show "Keeping pattern-extracted entity: Chilion"

3. Check entity source attribute:
   Add temporary debug log:
   ```typescript
   console.log(`[DEBUG] Entity ${entity.canonical} source: ${entity.attrs?.source}`);
   ```

### Issue: Regressions in Level 1-3

**Cause**: Pattern entities incorrectly kept in dense narratives

**Fix**: Add conditional logic:
```typescript
// Only apply pattern importance for simple texts
const isSimpleText = allEntities.length < 15 && uniqueRelations.length < 10;
const patternBased = isSimpleText && isPatternExtracted(entity);
```

---

## Why This Fix Works

**Problem**: Narrative density filter was too aggressive for simple texts

**Solution**: Pattern-extracted entities indicate explicit user/system interest

**Logic**:
- spaCy extraction = "I found this entity"
- Pattern extraction = "We WANT this entity"
- Pattern entities should survive filters

**Precedent**: This is similar to how entities in relations are kept - they're explicitly interesting.

---

## Alternative Approach (If Needed)

If pattern-based importance doesn't work, you can disable the narrative filter for simple texts:

```typescript
// Only apply narrative density filter for complex texts
const shouldFilter = allEntities.length > 20 && uniqueRelations.length > 10;

const finalEntities = shouldFilter
  ? filteredEntities  // Apply filter for complex texts
  : allEntities;       // Keep all for simple texts
```

---

## Time Estimate

- **Code changes**: 5 minutes
- **Compile & test**: 5 minutes
- **Debug if needed**: 5 minutes
- **Total**: 15 minutes

---

## Success Criteria

```
✅ Chilion appears in "PEOPLE FROM RUTH" output
✅ Test "family members from Ruth" passes
✅ Level 4: 6 of 7 tests passing (86%)
✅ Level 1-3: No regressions
```

---

**Ready to implement. This is the final fix for Level 4 entity extraction.**
