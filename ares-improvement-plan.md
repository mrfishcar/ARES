# ARES Improvement Plan: Balancing Precision & Recall

## Current Situation
- ✅ **Precision**: 86.7% (exceeded 85% target)
- ❌ **Recall**: 71.1% (missing 80% target by -8.9%)
- ❌ **F1**: ~78% (target: 82%)

**Problem**: Document-level filtering is too aggressive

## Solution Strategy: Smarter Context-Aware Filtering

### Phase 1: Fix the Filtering Logic (Immediate - 2 hours)

**Goal**: Restore sentence-level filtering but improve its accuracy

#### Option A: Sentence-Level with Proximity Window (Recommended)
```typescript
// Suppress parent_of/child_of if married_to within ±2 sentences
const PROXIMITY_WINDOW = 2;

function hasMarriedToInProximity(rel, marriedToSentences, proximityWindow = 2) {
  const relationSentences = new Set(rel.evidence.map(e => e.sentence_index));
  
  for (const sentIdx of relationSentences) {
    // Check window around this sentence
    for (let offset = -proximityWindow; offset <= proximityWindow; offset++) {
      const checkIdx = sentIdx + offset;
      if (marriedToSentences?.has(checkIdx)) {
        return true;
      }
    }
  }
  return false;
}
```

**Impact**: 
- Fixes false positives in same/nearby sentences (Test 2.4)
- Preserves valid relations in distant contexts
- Expected: Precision ~85-86%, Recall ~78-79%

#### Option B: Entity-Pair Context Analysis
```typescript
// Only suppress if BOTH entities appear together in married_to context
function shouldSuppressRelation(rel, marriedToRelations, allRelations) {
  const key = `${rel.subj}:${rel.obj}`;
  
  if (!marriedToRelations.has(key)) {
    return false;  // No married_to for this pair
  }
  
  // Check if the pair appears in married_to in a different role
  // E.g., parent_of(Arathorn, Aragorn) is OK even if married_to(Aragorn, Arwen)
  //       because Arathorn != Arwen
  const marriedRel = allRelations.find(r => 
    r.pred === 'married_to' &&
    ((r.subj === rel.subj && r.obj === rel.obj) ||
     (r.subj === rel.obj && r.obj === rel.subj))
  );
  
  if (!marriedRel) {
    return false;  // married_to exists but for different pair
  }
  
  // Only suppress if confidence is high AND contexts overlap
  return marriedRel.confidence > 0.75 && contextsOverlap(rel, marriedRel);
}
```

**Impact**:
- More surgical filtering - only suppress when truly conflicting
- Expected: Precision ~84-85%, Recall ~79-80%

### Phase 2: Add Pattern Confidence Scoring (Next - 3 hours)

**Goal**: Weight patterns by historical performance

```typescript
interface PatternStats {
  pattern_id: string;
  precision: number;      // Historical precision
  recall: number;         // Historical recall
  false_positive_rate: number;
  reliability_score: number;  // Composite score
}

function adjustConfidence(relation, patternStats) {
  const stats = patternStats.get(relation.pattern_id);
  if (!stats) return relation.confidence;
  
  // Adjust confidence based on pattern reliability
  return relation.confidence * stats.reliability_score;
}
```

**Implementation**:
1. Track pattern performance on test ladder
2. Calculate precision/recall per pattern
3. Downweight unreliable patterns
4. Apply during extraction

**Expected Impact**: +2-3% precision, minimal recall loss

### Phase 3: Expand Pattern Coverage (Next - 4 hours)

**Current**: 26% pattern coverage (480/1827)
**Target**: 40% coverage

**Strategy**:
1. Integrate 10 high-quality LOCATION patterns
2. Integrate 10 high-quality PART_WHOLE patterns
3. Integrate 8 high-quality EMPLOYMENT patterns
4. Add is_son_of, is_daughter_of explicit patterns

**Expected Impact**: +5-8% recall

### Phase 4: Improve Entity Type Classification (Future - 4 hours)

**Current Issue**: Places classified as PERSON (seen in Stage 3)

**Solutions**:
1. Gazetteer for common place names
2. Lexical features (ends with "City", "Mountains", etc.)
3. Context clues ("traveled to X" → X is PLACE)

**Expected Impact**: +3-5% Stage 3 entity precision

## Recommended Development Path

### Week 1: Fix Recall Gap
**Priority**: Get Stage 2 fully passing

**Tasks**:
1. ✅ Implement proximity-window filtering (Option A)
2. ✅ Test on Stage 2 ladder
3. ✅ Verify: Precision ≥85%, Recall ≥80%
4. ✅ Commit and merge

**Success Criteria**:
- Stage 2: Both precision AND recall passing
- F1 ≥ 82%

### Week 2: Pattern Quality & Coverage
**Priority**: Improve overall extraction quality

**Tasks**:
1. Implement pattern confidence scoring
2. Integrate 25-30 high-quality patterns
3. Run full test ladder
4. Measure improvement

**Success Criteria**:
- Pattern coverage ≥40%
- Stage 2 F1 ≥85%
- Stage 3 progress toward 80% entity precision

### Week 3: Entity Classification
**Priority**: Fix Stage 3 bottleneck

**Tasks**:
1. Add place name gazetteer
2. Implement context-based type correction
3. Test on Stage 3 ladder
4. Fix remaining type misclassifications

**Success Criteria**:
- Stage 3: Entity precision ≥80%
- All 3 stages passing

## Metrics to Track

### Primary (Test Ladder)
- **Stage 1**: Precision, Recall, F1 (should stay ≥90%)
- **Stage 2**: Precision, Recall, F1 (target: all ≥85/80/82)
- **Stage 3**: Entity P/R/F1 (target: ≥80/75/77)

### Secondary (Diagnostics)
- Pattern coverage %
- False positive rate by pattern
- Entity type classification accuracy
- Relation extraction density (relations per 100 words)

### Automated Checks
```bash
# Run before every commit
make test           # Full suite must pass
npm test tests/ladder/level-2-multisentence.spec.ts  # Stage 2
npm test tests/ladder/level-3-complex.spec.ts        # Stage 3

# Check metrics
npx tsx scripts/pattern-expansion/inventory-patterns.ts  # Coverage
npx tsx scripts/pattern-expansion/evaluate-coverage.ts   # Performance
```

## Quick Win: Fix Recall This Session?

If you want, I can implement Option A (proximity-window filtering) right now:

**Time**: ~30 minutes
**Expected Result**: Recall 78-79%, Precision ~85%
**Risk**: Low (easy to revert if it doesn't work)

Would you like me to:
1. Implement the fix now
2. Create a detailed implementation ticket for next session
3. Create a PR with the plan for team review
