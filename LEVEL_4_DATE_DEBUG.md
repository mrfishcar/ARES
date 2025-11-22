# Level 4: DATE Extraction Debug & Fix

**Time**: 20 minutes
**Goal**: Find where DATE "1775" is being lost and fix it

---

## Problem

**Extraction works**: DATE "1775" extracted ✅
**Orchestrator drops it**: Storage receives NO DATE ❌

```
[EXTRACT-ENTITIES] returning 8 entities (1 DATEs): DATE:1775 ✅
[STORAGE] Received 13 entities: NO DATE:1775 ❌
```

---

## Debug Strategy

### Step 1: Add Debug Logging (5 min)

**File**: `/Users/corygilford/ares/app/engine/extract/orchestrator.ts`

**Location 1**: After line 459 (`allEntities.push(...entityMap.values())`)

**Add**:
```typescript
// Debug: Check if DATEs are in allEntities before filtering
if (process.env.L4_DEBUG === '1') {
  const dates = allEntities.filter(e => e.type === 'DATE');
  console.log(`[ORCHESTRATOR-DATES] After entityMap: ${dates.length} DATEs in allEntities (total: ${allEntities.length})`);
  if (dates.length > 0) {
    console.log(`  DATEs: ${dates.map(d => d.canonical).join(', ')}`);
  }
}
```

**Location 2**: After line 497 (`allEntities.push(...filteredEntities)` - quality filter)

**Add**:
```typescript
// Debug: Check if DATEs survived quality filtering
if (process.env.L4_DEBUG === '1') {
  const dates = allEntities.filter(e => e.type === 'DATE');
  console.log(`[ORCHESTRATOR-DATES] After quality filter: ${dates.length} DATEs in allEntities (total: ${allEntities.length})`);
  if (dates.length > 0) {
    console.log(`  DATEs: ${dates.map(d => d.canonical).join(', ')}`);
  }
}
```

**Location 3**: After line 1062 (after narrative density filter)

**Add**:
```typescript
// Debug: Check if DATEs survived narrative density filter
if (process.env.L4_DEBUG === '1') {
  const allDates = allEntities.filter(e => e.type === 'DATE');
  const filteredDates = filteredEntities.filter(e => e.type === 'DATE');
  console.log(`[ORCHESTRATOR-DATES] After narrative filter: ${filteredDates.length}/${allDates.length} DATEs kept`);
  if (allDates.length > 0) {
    console.log(`  All DATEs: ${allDates.map(d => d.canonical).join(', ')}`);
  }
  if (filteredDates.length > 0) {
    console.log(`  Filtered DATEs: ${filteredDates.map(d => d.canonical).join(', ')}`);
  }
}
```

**Location 4**: Right before return statement (line 1353)

**Add**:
```typescript
// Debug: Final entity list sent to storage
if (process.env.L4_DEBUG === '1') {
  const finalDates = filteredEntities.filter(e => e.type === 'DATE');
  console.log(`[ORCHESTRATOR-DATES] FINAL: ${finalDates.length} DATEs being returned to storage`);
  if (finalDates.length > 0) {
    console.log(`  Final DATEs: ${finalDates.map(d => d.canonical).join(', ')}`);
  }
  console.log(`[ORCHESTRATOR-DATES] Total entities: ${filteredEntities.length}`);
  console.log(`  Entity types: ${filteredEntities.map(e => `${e.type}:${e.canonical}`).join(', ')}`);
}
```

---

### Step 2: Test & Analyze (5 min)

```bash
npx tsc
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "dates" 2>&1 | tee /tmp/date-debug.log
```

**Check output**:
```bash
grep "ORCHESTRATOR-DATES" /tmp/date-debug.log
```

**Expected patterns**:

**Pattern A: DATE never reaches orchestrator**
```
[ORCHESTRATOR-DATES] After entityMap: 0 DATEs
[ORCHESTRATOR-DATES] After quality filter: 0 DATEs
[ORCHESTRATOR-DATES] After narrative filter: 0/0 DATEs
[ORCHESTRATOR-DATES] FINAL: 0 DATEs
```
→ Issue in entity registration (registerWindowEntity)

**Pattern B: DATE filtered by quality filter**
```
[ORCHESTRATOR-DATES] After entityMap: 1 DATEs (1775)
[ORCHESTRATOR-DATES] After quality filter: 0 DATEs
[ORCHESTRATOR-DATES] After narrative filter: 0/0 DATEs
[ORCHESTRATOR-DATES] FINAL: 0 DATEs
```
→ Issue in filterLowQualityEntities (but we already exempted years)

**Pattern C: DATE filtered by narrative density**
```
[ORCHESTRATOR-DATES] After entityMap: 1 DATEs (1775)
[ORCHESTRATOR-DATES] After quality filter: 1 DATEs (1775)
[ORCHESTRATOR-DATES] After narrative filter: 0/1 DATEs
[ORCHESTRATOR-DATES] FINAL: 0 DATEs
```
→ Issue in narrative density filter (line 1036-1062)

**Pattern D: DATE reaches return but storage doesn't log it**
```
[ORCHESTRATOR-DATES] After entityMap: 1 DATEs (1775)
[ORCHESTRATOR-DATES] After quality filter: 1 DATEs (1775)
[ORCHESTRATOR-DATES] After narrative filter: 1/1 DATEs (1775)
[ORCHESTRATOR-DATES] FINAL: 1 DATEs (1775)
[STORAGE] Received 13 entities: NO DATE
```
→ Issue in storage.ts entity processing

---

### Step 3: Apply Fix Based on Pattern (10 min)

#### If Pattern A (Not registered):

**Issue**: registerWindowEntity not being called for DATEs

**Fix location**: Around line 206-244 (segment entity processing loop)

**Check**: Is there a type filter excluding DATEs?

**Possible fix**: Ensure DATEs are registered same as other entities

---

#### If Pattern B (Quality filter):

**Issue**: filterLowQualityEntities rejecting DATEs despite exemption

**Fix file**: `app/engine/entity-quality-filter.ts`

**Check line 199-206**:
```typescript
if (entity.type === 'DATE') {
  const isSimpleYear = /^\d{4}$/.test(name);
  if (!isSimpleYear && !isValidDate(name)) {
    return false;
  }
}
```

**Possible fix**: Make sure "1775" passes `isSimpleYear` check

**Add debug**:
```typescript
if (entity.type === 'DATE' && process.env.L4_DEBUG === '1') {
  const isSimpleYear = /^\d{4}$/.test(name);
  console.log(`[QUALITY-FILTER-DATE] "${name}": isSimpleYear=${isSimpleYear}, test=${/^\d{4}$/.test(name)}`);
}
```

---

#### If Pattern C (Narrative filter):

**Issue**: DATEs not meeting criteria (not in relations, low mentions, not pattern-extracted)

**Fix location**: Line 1036-1062

**Current filter**:
```typescript
return inRelation || highMentionCount || patternBased;
```

**Add DATE exemption**:
```typescript
// DATEs are standalone entities - don't filter them out
if (e.type === 'DATE') {
  return true;
}

return inRelation || highMentionCount || patternBased;
```

**Or** (better - make DATEs important):
```typescript
const isImportantType = e.type === 'DATE' || e.type === 'TIME';
return inRelation || highMentionCount || patternBased || isImportantType;
```

---

#### If Pattern D (Storage filtering):

**Fix file**: `app/storage/storage.ts`

**Check function**: `normalizeCanonical()` around line 77-147

**Look for**: DATE-specific filtering

**Possible issue**: DATEs being rejected by:
- Pronoun check
- Verb check
- Lowercase filter
- Type-specific filter

**Add debug**:
```typescript
if (type === 'DATE' && process.env.L4_DEBUG === '1') {
  console.log(`[STORAGE-NORMALIZE] DATE "${canonical}": processing`);
  const result = normalizeCanonical(type, canonical);
  console.log(`[STORAGE-NORMALIZE] DATE "${canonical}" → ${result ? `"${result}"` : 'NULL (filtered)'}`);
}
```

---

## Quick Win Hypothesis

**Most Likely**: Pattern C (narrative density filter)

**Why**:
- DATEs typically have 1-2 mentions
- DATEs rarely appear in relations
- DATEs not pattern-extracted (extracted via year detection)
- Tale of Two Cities has 13 entities (close to threshold)

**Fastest Fix** (2 min):

**File**: `orchestrator.ts` line ~1056

**Add before return statement**:
```typescript
// DATEs and TIMEs are always important - don't filter them
if (e.type === 'DATE' || e.type === 'TIME') {
  return true;
}

// For simple/moderate texts, keep all entities
if (!isDenseNarrative) {
  return true;
}

return inRelation || highMentionCount || patternBased;
```

**Test**:
```bash
npx tsc
npm test -- tests/literature/real-text.spec.ts -t "dates"
```

---

## Success Criteria

```
✅ DATE "1775" appears in final entity list
✅ Test "should extract dates from real literature" passes
✅ Level 4: 7 of 7 tests passing (100%)
```

---

## Validation

```bash
# After fix
npm test -- tests/literature/real-text.spec.ts

# Expected
✅ 7 of 7 tests passing

# Check all levels
npm test -- tests/ladder/

# Expected
✅ Level 1: 20/20
✅ Level 2: 15/15
✅ Level 3: 10/10
✅ Level 4: 7/7
```

---

**Go fix this and conquer Level 4!** 💪
