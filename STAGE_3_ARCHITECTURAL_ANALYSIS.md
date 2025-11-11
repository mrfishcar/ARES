# Stage 3: Multi-Paragraph Extraction - Architectural Analysis

## Current Failure

**Stage 3 Metrics:**
- Entity Precision: 78.7% (target 80%, gap -1.3%)
- Entity Recall: 65.9% (target 75%, gap -9.1%)
- **Relation Precision: 20.0%** (target 80%, **gap -60%**)
- **Relation Recall: 9.7%** (target 75%, **gap -65.3%**)

**Status**: Catastrophic failure - extracting <10% of expected relations

## Root Cause Hypothesis

Stage 3 tests use **multi-paragraph narratives** (3-4 paragraphs). Example:

```
Paragraph 1: "Harry Potter was a wizard. He lived with the Dursleys at 4 Privet Drive."
Paragraph 2: "His parents, James and Lily Potter, had been killed by Voldemort."
Paragraph 3: "Years later, he learned about his heritage."
```

**Expected relations:**
- `harry potter::child_of::james`
- `harry potter::child_of::lily potter`
- `harry potter::lives_in::privet drive`

**Likely issue**: Extraction processes paragraphs separately, losing cross-paragraph context.

## Investigation Checklist (Sonnet Task)

### 1. Confirm Segmentation Issue
**File**: `app/engine/extract/orchestrator.ts`

Check around line 485-530 where segments are processed:
```typescript
const corefRelations: Relation[] = [];
for (const seg of segs) {
  const contextBefore = fullText.slice(Math.max(0, seg.start - 200), seg.start);
  const contextAfter = fullText.slice(seg.end, Math.min(fullText.length, seg.end + 200));
  const window = contextBefore + seg.text + contextAfter;
```

**Questions:**
- Are segments paragraph-sized?
- Does windowing (±200 chars) capture cross-paragraph relations?
- Are entities extracted globally but relations extracted per-segment?

### 2. Check Entity Resolution Across Paragraphs
**Issue**: "Harry" in paragraph 1, "he" in paragraph 2, "Harry Potter" in paragraph 3 - are these linked?

**File**: `app/engine/extract/coreference.ts`

Check if coreference resolution works across paragraph boundaries.

### 3. Test Multi-Paragraph Extraction Directly

Run a single Stage 3 test with debug logging:
```bash
DEBUG_DEP=1 npm test tests/ladder/level-3-complex.spec.ts 2>&1 | grep -A 20 "Test 3.1"
```

Look for:
- How many segments are created?
- Are segments paragraph-sized?
- Are relations found within segments but not across?

### 4. Review Extraction Pipeline Architecture

**Files:**
- `app/engine/extract/orchestrator.ts` - Main pipeline
- `app/engine/extract/relations.ts` - Relation extraction
- `app/engine/narrative-relations.ts` - Pattern matching

**Key questions:**
- Should we extract globally instead of per-segment?
- Should we expand window size for Stage 3?
- Do we need a post-processing step to link cross-paragraph relations?

## Potential Solutions (Ranked by Effort)

### Option A: Expand Window Size (Easy - 30 min)
Change `contextBefore/contextAfter` from ±200 chars to ±500 or ±1000 chars.

**Pros**: Quick fix, may capture more cross-paragraph context
**Cons**: May not solve fundamental segmentation issue

### Option B: Global Extraction Mode (Medium - 2-3 hours)
Add a flag for "multi-paragraph mode" that processes entire text as one segment.

**Pros**: Guaranteed to capture all cross-paragraph relations
**Cons**: May hit performance/memory issues on long documents

### Option C: Two-Pass Extraction (Hard - 4-6 hours)
1. Pass 1: Extract entities globally
2. Pass 2: Extract relations globally using all entities

**Pros**: Clean architecture, handles long documents
**Cons**: Significant refactoring required

### Option D: Segment Stitching (Hard - 4-6 hours)
Keep per-segment extraction but add post-processing to "stitch" relations across segment boundaries.

**Pros**: Maintains performance, handles long docs
**Cons**: Complex logic, may introduce bugs

## Recommended Approach

**Start with Option A (expand window)** - quickest validation.

If that gets us to ~40-50% recall:
- **Do Option B (global mode)** for Stage 3 tests specifically

If that gets us to 75%+ recall:
- **Ship it** and revisit architecture later for production

If Option B still fails:
- **Investigate deeper** - may be pattern/confidence issues, not segmentation

## Success Criteria

After fix:
- Entity Recall: ≥75% (currently 65.9%)
- Relation Precision: ≥80% (currently 20.0%)
- Relation Recall: ≥75% (currently 9.7%)

**Critical**: Relation metrics need ~8x improvement. This is architectural, not incremental.

## Next Steps

1. Sonnet: Run investigation checklist (1-2 hours)
2. Sonnet: Implement Option A, test results (30 min)
3. If needed, Sonnet: Implement Option B (2-3 hours)
4. Haiku: Add coordination patterns (parallel, 2 hours)
5. Test combined improvements

**Timeline**: 4-6 hours total for Sonnet work
