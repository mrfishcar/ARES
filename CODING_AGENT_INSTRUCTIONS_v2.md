# ARES Coding Agent Instructions v2 - THE REAL PROBLEM
**Date**: 2025-11-11  
**Task**: Fix Stage 2 Recall Gap - Pattern Expansion (NOT Filtering)  
**Priority**: HIGH - Recall at 71.1%, target 80%  
**Estimated Time**: 4-6 hours (or 30 min for quick win)

---

## ⚠️ CRITICAL: Previous Instructions Were Wrong

**v1 Instructions (IGNORE)**: Proximity-window filtering  
**Result**: Implemented but **no improvement** - filtering wasn't the problem

**v2 Instructions (THIS ONE)**: Pattern expansion + confidence tuning  
**Why**: Recall is low because we're **not extracting enough relations**, not because we're over-filtering

---

## 📥 Getting Started

### 1. Pull Latest Code

```bash
git checkout main
git pull origin main

# Verify you have proximity filtering already implemented
grep -n "hasMarriedToInProximity" app/engine/extract/orchestrator.ts
# Should show the function exists (added in previous session)

# Install dependencies
npm install
```

### 2. Start Parser (REQUIRED)

```bash
# Terminal 1: Start spaCy parser
make parser

# Wait for: "SpaCy parser running on port 8000"
```

---

## 📊 Current Status - THE REAL PROBLEM

### What's Actually Happening

| Metric | Current | Target | Gap | Diagnosis |
|--------|---------|--------|-----|-----------|
| Stage 2 Precision | 86.7% | 85% | +1.7% | ✅ GOOD - We're accurate |
| Stage 2 Recall | 71.1% | 80% | -8.9% | ❌ BAD - We're missing relations |
| Stage 2 F1 | ~78% | 82% | -4% | ❌ Needs improvement |

### Why Filtering Didn't Help

**Previous hypothesis**: Over-aggressive filtering blocking valid relations  
**Reality**: Filtering is RARELY triggered (no married_to/parent_of conflicts)

**Proof**:
- Proximity filtering implemented ✅
- Recall unchanged at 71.1% ❌
- No suppression happening (checked logs)

**Conclusion**: We're not extracting relations in the first place!

---

## 🎯 The Real Problem: Under-Extraction

### Root Causes

1. **Pattern Coverage: 26%** (480/1827 patterns integrated)
   - Need: 40%+ coverage
   - Impact: Missing 5-7% recall

2. **Confidence Threshold: 0.70 (too strict)**
   - Need: Test 0.60-0.65
   - Impact: Could gain 2-4% recall

3. **Missing Pattern Families**:
   - LOCATION: 18% coverage (need 40%)
   - PART_WHOLE: 10% coverage (need 40%)
   - EMPLOYMENT: 16% coverage (need 40%)
   - CREATION: 25% coverage (need 40%)

---

## 🚀 Solution Path: Two Options

### **Option A: Quick Win (30 minutes) - TEST THIS FIRST**

Lower the confidence threshold to see if we're being too strict.

**Current default**: `ARES_MIN_CONFIDENCE=0.70` (70% confidence required)

#### Test Lower Thresholds

```bash
# Test 1: 65% confidence
ARES_MIN_CONFIDENCE=0.65 npm test tests/ladder/level-2-multisentence.spec.ts

# Check results - look for:
# - avgRelationR (recall) - should improve
# - avgRelationP (precision) - should stay >83%

# Test 2: 60% confidence (more aggressive)
ARES_MIN_CONFIDENCE=0.60 npm test tests/ladder/level-2-multisentence.spec.ts

# Test 3: 55% confidence (very aggressive - expect precision drop)
ARES_MIN_CONFIDENCE=0.55 npm test tests/ladder/level-2-multisentence.spec.ts
```

#### Success Criteria

Find the sweet spot where:
- ✅ Recall ≥78% (closer to 80% target)
- ✅ Precision ≥83% (acceptable drop from 86.7%)
- ✅ F1 ≥81% (improved from 78%)

#### If This Works

Update the default in `orchestrator.ts`:

```typescript
// Find this line (~line 740):
const minConfidence = parseFloat(process.env.ARES_MIN_CONFIDENCE || '0.70');

// Change to your optimal value:
const minConfidence = parseFloat(process.env.ARES_MIN_CONFIDENCE || '0.65');
```

**Then commit and you're done!** 🎉

---

### **Option B: Proper Fix (4-6 hours) - If Option A Doesn't Work**

Expand pattern coverage from 26% to 40%+

#### Why This Will Work

Looking at `reports/rung1_pattern_coverage_summary.md`:

| Family | Current | Missing | Target |
|--------|---------|---------|--------|
| LOCATION | 6/34 (18%) | 28 patterns | 40% (14 patterns) |
| PART_WHOLE | 3/31 (10%) | 28 patterns | 40% (12 patterns) |
| EMPLOYMENT | 5/31 (16%) | 26 patterns | 40% (12 patterns) |
| CREATION | 9/36 (25%) | 27 patterns | 40% (14 patterns) |

**If we add ~50 patterns from these families → expect +5-7% recall**

#### Implementation Steps

##### Step 1: Understand Pattern Structure (15 min)

**Files to examine**:
- `patterns/new_dependency_patterns.json` - 2315 generated patterns
- `patterns/new_surface_patterns.json` - 1754 generated patterns
- `app/engine/extract/relations.ts` - Where dependency patterns go
- `app/engine/narrative-relations.ts` - Where surface patterns go

**Pattern format** (dependency):
```json
{
  "predicate": "works_at",
  "dep_path": "nsubj>works<prep_at>pobj",
  "subj_constraint": "PERSON",
  "obj_constraint": "ORG",
  "confidence": 0.85
}
```

**Pattern format** (surface):
```json
{
  "regex": "\\b([A-Z][a-z]+)\\s+works\\s+at\\s+([A-Z][a-z]+)\\b",
  "predicate": "works_at",
  "typeGuard": {
    "subj": ["PERSON"],
    "obj": ["ORG"]
  }
}
```

##### Step 2: Select High-Quality Patterns (30 min)

Run the inventory script to see what's available:

```bash
npx ts-node scripts/pattern-expansion/inventory-patterns.ts

# Output: reports/rung1_pattern_coverage_summary.md
# Shows which patterns are missing
```

**Selection criteria**:
- Patterns with confidence ≥0.75
- Families with <30% coverage (high impact)
- Common predicates (works_at, lives_in, part_of, created_by)

**Target: Add 50 patterns total**:
- 14 LOCATION patterns
- 12 PART_WHOLE patterns
- 12 EMPLOYMENT patterns
- 12 CREATION patterns

##### Step 3: Integrate Patterns (2-3 hours)

**For dependency patterns** (`app/engine/extract/relations.ts`):

Find the `RELATION_PATTERNS` array and add:

```typescript
// LOCATION patterns
{
  predicate: 'located_in',
  dep_path: 'nsubjpass>located<prep_in>pobj',
  subj_constraint: 'PLACE',
  obj_constraint: 'PLACE',
  confidence: 0.80
},
{
  predicate: 'lives_in',
  dep_path: 'nsubj>lives<prep_in>pobj',
  subj_constraint: 'PERSON',
  obj_constraint: 'PLACE',
  confidence: 0.85
},
// Add 12 more...

// EMPLOYMENT patterns
{
  predicate: 'works_for',
  dep_path: 'nsubj>works<prep_for>pobj',
  subj_constraint: 'PERSON',
  obj_constraint: 'ORG',
  confidence: 0.85
},
// Add 11 more...

// PART_WHOLE patterns
{
  predicate: 'part_of',
  dep_path: 'nsubj>part<prep_of>pobj',
  subj_constraint: null,
  obj_constraint: null,
  confidence: 0.75
},
// Add 11 more...
```

**For surface patterns** (`app/engine/narrative-relations.ts`):

Find the `narrativePatterns` array and add:

```typescript
// CREATION patterns
{
  regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:wrote|authored|created)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
  predicate: 'created',
  typeGuard: { subj: ['PERSON'], obj: ['WORK'] }
},
// Add 11 more...
```

##### Step 4: Test Incrementally (1 hour)

**After adding each batch of 10-15 patterns**:

```bash
# Run Stage 2 tests
npm test tests/ladder/level-2-multisentence.spec.ts

# Check metrics
# - Did recall improve?
# - Did precision stay >83%?
# - Any new false positives?

# Run pattern coverage check
npx ts-node scripts/pattern-expansion/inventory-patterns.ts

# Did coverage increase?
```

**Target progression**:
- After 15 patterns: Recall ~73-74%, Coverage ~29%
- After 30 patterns: Recall ~75-76%, Coverage ~32%
- After 50 patterns: Recall ~78-79%, Coverage ~36-40%

##### Step 5: Validate (30 min)

```bash
# Run full test suite
make test

# Check no regressions
npm test tests/ladder/level-1-simple.spec.ts  # Should still pass
npm test tests/ladder/level-3-complex.spec.ts  # Should improve slightly

# Final Stage 2 test
npm test tests/ladder/level-2-multisentence.spec.ts

# Success criteria:
# - avgRelationP ≥83% (acceptable drop from 86.7%)
# - avgRelationR ≥78% (improvement from 71.1%)
# - relationF1 ≥80% (improvement from 78%)
```

---

## 📚 Required Reading (10 minutes)

Before coding, read these to understand the pattern system:

1. **Pattern Generation System**:
   - `scripts/pattern-expansion/README.md` - How patterns were generated
   - `reports/rung1_pattern_coverage_summary.md` - Current coverage status

2. **Pattern Integration**:
   - Look at existing patterns in `app/engine/extract/relations.ts`
   - Look at existing patterns in `app/engine/narrative-relations.ts`
   - Understand the format before adding new ones

---

## 🧪 Testing Strategy

### Phase 1: Quick Confidence Test (30 min)

```bash
# Test different thresholds
for threshold in 0.65 0.60 0.55; do
  echo "Testing threshold: $threshold"
  ARES_MIN_CONFIDENCE=$threshold npm test tests/ladder/level-2-multisentence.spec.ts 2>&1 | grep "avgRelation"
  echo "---"
done
```

Look for the sweet spot where recall improves without precision tanking.

### Phase 2: Pattern Addition (If needed)

**Incremental approach**:
1. Add 15 patterns → test → measure
2. Add 15 more → test → measure
3. Add 20 more → test → measure

**Don't add all 50 at once!** Test incrementally to catch issues early.

---

## ✅ Success Criteria

### Minimum (Quick Win)
- ✅ Recall ≥75% (+3.9% from 71.1%)
- ✅ Precision ≥83% (drop ≤3.7%)
- ✅ F1 ≥79% (+1%)

### Target (Proper Fix)
- ✅ Recall ≥78% (+6.9%)
- ✅ Precision ≥84% (drop ≤2.7%)
- ✅ F1 ≥81% (+3%)
- ✅ Pattern coverage ≥35%

### Excellent (Stretch Goal)
- ✅ Recall ≥80% (meets target!)
- ✅ Precision ≥85% (stays above target)
- ✅ F1 ≥82% (meets target!)
- ✅ Pattern coverage ≥40%
- ✅ **Stage 2 test passes** 🎉

---

## 🐛 Troubleshooting

### Issue: Confidence threshold change doesn't help

**Try**:
- Lower more aggressively (0.55, 0.50)
- If precision drops too much, pattern expansion is needed

### Issue: New patterns cause TypeScript errors

**Common issues**:
- Typo in predicate name (must match schema)
- Invalid regex syntax in surface patterns
- Missing typeGuard constraints

**Fix**:
```bash
# Check compilation
npx tsc --noEmit

# Common fixes:
# - Check predicate exists in schema.ts
# - Escape special regex characters
# - Add proper type constraints
```

### Issue: Patterns not matching anything

**Debug**:
```bash
# Add logging to see what's being checked
console.log('[PATTERN-DEBUG] Testing pattern:', pattern.predicate);
console.log('[PATTERN-DEBUG] Against text:', text.substring(0, 100));
```

**Common causes**:
- Regex too specific (entity names, spacing)
- Dependency path doesn't match spaCy output
- Type constraints too restrictive

---

## 📤 Commit Guidelines

### After Quick Win (Confidence Threshold)

```bash
git add app/engine/extract/orchestrator.ts
git commit -m "fix: lower confidence threshold to improve Stage 2 recall

Changed default ARES_MIN_CONFIDENCE from 0.70 to [NEW_VALUE].

Testing showed this threshold balances precision and recall:
- Stage 2 Recall: 71.1% → [NEW]% (+[DELTA]%)
- Stage 2 Precision: 86.7% → [NEW]% ([CHANGE])
- Stage 2 F1: 78% → [NEW]% (+[DELTA]%)

Rationale: Analysis showed under-extraction, not over-filtering.
Lowering threshold allows more valid relations through."

git push origin [your-branch]
```

### After Pattern Expansion

```bash
git add app/engine/extract/relations.ts app/engine/narrative-relations.ts
git commit -m "feat: expand pattern coverage for Stage 2 recall improvement

Added [N] new extraction patterns across high-impact families:
- LOCATION: +[N] patterns (coverage [OLD]% → [NEW]%)
- EMPLOYMENT: +[N] patterns (coverage [OLD]% → [NEW]%)
- PART_WHOLE: +[N] patterns (coverage [OLD]% → [NEW]%)
- CREATION: +[N] patterns (coverage [OLD]% → [NEW]%)

Results:
- Stage 2 Recall: 71.1% → [NEW]% (+[DELTA]%)
- Stage 2 Precision: 86.7% → [NEW]% ([CHANGE])
- Stage 2 F1: 78% → [NEW]% (+[DELTA]%)
- Overall pattern coverage: 26% → [NEW]%

Addresses root cause: insufficient extraction, not over-filtering."

git push origin [your-branch]
```

---

## 🎯 Decision Tree

```
START: Stage 2 Recall = 71.1%
│
├─ Try Option A: Lower Confidence Threshold (30 min)
│  │
│  ├─ Test 0.65 → Recall improves to 75-78%? ✅
│  │  └─ DONE! Commit and push
│  │
│  └─ Recall doesn't improve or precision tanks? ❌
│     └─ Proceed to Option B
│
└─ Option B: Pattern Expansion (4-6 hours)
   │
   ├─ Add 15 LOCATION patterns → Test
   ├─ Add 12 EMPLOYMENT patterns → Test
   ├─ Add 12 PART_WHOLE patterns → Test
   └─ Add 12 CREATION patterns → Test
      │
      └─ Recall ≥78%? ✅
         └─ DONE! Commit and push
```

---

## 📁 Key Files Reference

### Testing
- `tests/ladder/level-2-multisentence.spec.ts` - Main test file
- `scripts/pattern-expansion/inventory-patterns.ts` - Coverage checker

### Pattern Files
- `patterns/new_dependency_patterns.json` - 2315 generated dependency patterns
- `patterns/new_surface_patterns.json` - 1754 generated surface patterns

### Implementation Files
- `app/engine/extract/orchestrator.ts` - Confidence threshold setting (line ~740)
- `app/engine/extract/relations.ts` - Dependency pattern array
- `app/engine/narrative-relations.ts` - Surface pattern array

### Documentation
- `reports/rung1_pattern_coverage_summary.md` - Coverage analysis
- `ARES_PROGRESS_SUMMARY.md` - Project status
- `ares-improvement-plan.md` - Technical details

---

## 💡 Pro Tips

### Start with the Quick Win
**Always test confidence threshold first!** If it works, you save 4-5 hours.

### Incremental Testing
Don't add 50 patterns and hope. Add 10-15, test, measure, repeat.

### Watch F1 Score
Recall and precision can trade off. F1 tells you if you're actually improving.

### Document What Works
Note which patterns helped most. This guides future expansion.

### Don't Overthink It
The patterns are already generated. Your job is to integrate and test them.

---

## 🚀 TL;DR - Quick Start

```bash
# 1. Try the quick win first
ARES_MIN_CONFIDENCE=0.65 npm test tests/ladder/level-2-multisentence.spec.ts

# 2. Check if recall improved to ≥75%
# Look for: avgRelationR

# 3. If yes → update orchestrator.ts default and commit
# If no → start adding patterns incrementally

# 4. Test after every 10-15 patterns
npm test tests/ladder/level-2-multisentence.spec.ts

# 5. Stop when recall ≥78% and precision ≥83%
```

**Expected total time**:
- Quick win works: 30 min ✅
- Pattern expansion needed: 4-6 hours 📚

**This time we're fixing the RIGHT problem!** 🎯
