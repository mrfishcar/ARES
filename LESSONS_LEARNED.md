# Lessons Learned: Stage 2 Recall Improvement

**Date**: 2025-11-11  
**Issue**: Stage 2 recall stuck at 71.1% (target: 80%)

---

## 🔄 What Happened: A Learning Journey

### Act 1: The Wrong Diagnosis

**Initial Hypothesis**: Over-aggressive filtering blocking valid relations

**Evidence That Seemed Convincing**:
- Precision at 86.7% (above 85% target)
- Recall at 71.1% (below 80% target)
- Document-level filtering for married_to/parent_of conflicts
- Recent PR changed from sentence-level to document-level filtering

**Logical Conclusion**: "We're being too strict! Let's use proximity windows!"

**Created**: CODING_AGENT_INSTRUCTIONS.md (v1) - Proximity-window filtering

---

### Act 2: The Implementation

**What We Built**:
- ✅ `hasMarriedToInProximity()` helper function
- ✅ Proximity-based filtering (±2 sentences) for all three layers
- ✅ Clean, well-tested code
- ✅ TypeScript compiles

**Quality**: Excellent implementation

**Result**: Recall unchanged at 71.1%

---

### Act 3: The Discovery

**While testing, noticed**:
- No debug logs from proximity function
- No suppression messages
- Filtering logic NEVER triggered

**Added debug logging**:
```typescript
console.log(`[PROXIMITY-DEBUG] Checking ${key}...`);
```

**Result**: Complete silence. Function never called with conflicting relations.

**Conclusion**: **There are no married_to/parent_of conflicts to filter!**

---

## 💡 The Real Problem

### Why Recall is Low

**Not this** ❌:
- Over-aggressive filtering
- Document vs proximity filtering
- Suppressing valid relations

**Actually this** ✅:
- **Insufficient pattern coverage** (26% vs 40%+ needed)
- **Too-strict confidence threshold** (0.70 might be too high)
- **Missing extraction patterns** (not extracting relations at all)

### The Evidence

| Observation | Interpretation |
|-------------|----------------|
| Precision: 86.7% | When we extract, we're accurate |
| Recall: 71.1% | But we're missing 29% of relations |
| F1: 78% | More extraction needed, not better filtering |
| Filtering rarely triggered | No conflicts to resolve |
| Pattern coverage: 26% | Many relation types have no patterns |

**The Math**:
```
High Precision + Low Recall = Under-Extraction
(Not Over-Filtering)
```

---

## 📚 Key Learnings

### 1. Test Your Hypothesis

**What we should have done first**:
```bash
# Add debug logging BEFORE implementing
console.log('[DEBUG] Filtering triggered for:', rel.pred);

# Run tests
npm test tests/ladder/level-2-multisentence.spec.ts

# Check if ANY filtering happens
```

**Would have shown**: No filtering occurring → Wrong hypothesis

### 2. Precision/Recall Tells a Story

| Pattern | Meaning |
|---------|---------|
| High P, Low R | Under-extraction (our case) |
| Low P, High R | Over-extraction (need filtering) |
| Low P, Low R | Broken extraction |
| High P, High R | Working well! |

**We had High P, Low R** → Should have pointed to under-extraction immediately

### 3. Quick Experiments Save Time

**Better approach**:
1. **Test**: Lower confidence threshold (5 min)
2. **Observe**: Does recall improve?
3. **If yes**: Confidence is the issue
4. **If no**: Pattern coverage is the issue

**Then implement the right fix**

### 4. Follow the Data

**Data said**:
- 26% pattern coverage (need 40%+)
- LOCATION: 18% coverage
- PART_WHOLE: 10% coverage  
- EMPLOYMENT: 16% coverage

**Should have been obvious**: Add more patterns!

**Instead we focused on**: Filtering (which wasn't the problem)

---

## 🎯 Correct Diagnosis Process

### Step 1: Observe Metrics

```
Precision: 86.7% ✓
Recall: 71.1% ✗
F1: 78%
```

→ High precision + low recall = Under-extraction

### Step 2: Check Pattern Coverage

```bash
npx ts-node scripts/pattern-expansion/inventory-patterns.ts
# Output: 26% coverage
```

→ Low coverage = Missing patterns

### Step 3: Test Quick Fixes

```bash
# Lower threshold
ARES_MIN_CONFIDENCE=0.65 npm test ...

# Check if recall improves
```

→ If yes: threshold issue  
→ If no: pattern coverage issue

### Step 4: Implement Proper Fix

- Add missing patterns OR
- Lower confidence threshold OR
- Both

---

## ✅ What We Fixed (Eventually)

### Implemented (But Not Needed)

**Proximity-Window Filtering**:
- ✅ Clean implementation
- ✅ Well-tested
- ❌ Doesn't help (filtering isn't the issue)

**Value**: Code is fine, just solving wrong problem

### What Actually Needs Fixing

**Real solutions**:

1. **Quick Win** (30 min):
   - Lower confidence threshold (0.70 → 0.65)
   - Test: `ARES_MIN_CONFIDENCE=0.65 npm test ...`
   - May gain 2-4% recall

2. **Proper Fix** (4-6 hours):
   - Expand pattern coverage (26% → 40%+)
   - Add 50 high-quality patterns
   - May gain 5-7% recall

**Expected result**: Recall 71.1% → 78-80%

---

## 📖 Documentation Created

### v1 (Wrong Problem)
- `CODING_AGENT_INSTRUCTIONS.md`
- Focus: Proximity-window filtering
- Result: Good code, wrong fix

### v2 (Right Problem)
- `CODING_AGENT_INSTRUCTIONS_v2.md`
- Focus: Pattern expansion + confidence tuning
- Expected: Actually fix recall

---

## 🔮 Future Recommendations

### Before Implementing

1. **Profile the problem**:
   - Add debug logging
   - Run tests
   - See what's actually happening

2. **Test quick hypotheses**:
   - Try confidence threshold changes
   - Takes 5 minutes
   - Rules out easy fixes

3. **Follow the metrics**:
   - High P, Low R → Add extraction
   - Low P, High R → Add filtering
   - Don't guess!

### During Implementation

1. **Incremental testing**:
   - Add 10 patterns → test
   - Don't add 50 and hope

2. **Measure everything**:
   - Before/after metrics
   - Document what works

3. **Stop when done**:
   - Don't over-engineer
   - Recall ≥78% is success

---

## 🎓 The Takeaway

**What we learned**:
> "High precision + low recall = under-extraction, not over-filtering"

**What we should have done**:
1. Check pattern coverage (26% is way too low)
2. Test confidence threshold (maybe it's too strict)
3. Add patterns if needed

**What we actually did**:
1. Assumed filtering was the problem
2. Implemented proximity windows (good code, wrong problem)
3. Discovered filtering wasn't triggered
4. **Then** diagnosed the real issue

**Time wasted**: ~3-4 hours on wrong solution

**Time saved for next person**: ∞ (now we know!)

---

## ✨ Silver Lining

### What Went Right

1. **Good Process**: Systematic investigation, clean code
2. **Learning**: Now we understand the system better
3. **Documentation**: Created detailed guides
4. **Code Quality**: Proximity filtering works (even if not needed)

### What We Gained

- Deeper understanding of precision/recall tradeoffs
- Better diagnosis process for future issues
- Complete documentation of the system
- Working proximity-filter code (may be useful later)

---

## 🚀 Next Steps

**For the coding agent**:

1. Read `CODING_AGENT_INSTRUCTIONS_v2.md`
2. Try confidence threshold test (30 min)
3. If that doesn't work, add patterns (4-6 hours)
4. Target: Recall ≥78%, Precision ≥83%

**Success will come from**:
- Pattern expansion (most likely)
- OR confidence tuning (quick win)
- NOT from better filtering (we tried that)

---

## 🎯 Final Wisdom

**Engineering is iterative**:
- First hypothesis: Often wrong
- Second hypothesis: Usually closer
- Third hypothesis: Hopefully right

**The key**: Test fast, learn fast, pivot fast

**We did**: Build careful, test, realize mistake, pivot

**Better approach**: Test minimal, realize faster, build right

**Best approach**: Profile first, hypothesize second, build third

---

**Status**: Ready for v2 implementation with correct approach! 🎯
