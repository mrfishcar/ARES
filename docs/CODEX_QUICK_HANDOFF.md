# Quick Handoff - Phase 2: DATE Extraction

## Current Status
- ✅ Meaning layer working (test passes)
- ✅ Phase 1 done: Entity metrics at 0.879 F1 (near 0.87 target)
- ❌ Relations at 0.787 F1 (need 0.87)
- Tests passing: 12/20 (need 18+)

## Your Task: Fix DATE Extraction

**Problem**: Tests 1.13 & 1.14 fail because DATE entities like "3019" aren't extracted.

**Files modified already** (don't touch):
- `app/engine/merge.ts` - canonicalization fix
- `app/engine/extract/orchestrator.ts` - window entity registration
- `app/engine/relation-deduplicator.ts` - iterator fix

---

## Instructions

### 1. Find DATE Filter
```bash
grep -n "DATE" app/engine/extract/entities.ts | head -20
```

### 2. Add Year Preservation
In `app/engine/extract/entities.ts`, find where DATEs are filtered and add:

```typescript
if (entity.type === 'DATE') {
  const text = entity.canonical.trim();
  // Keep 4-digit years
  if (/^\d{4}$/.test(text)) {
    continue; // or return false - skip removal
  }
}
```

### 3. Test
```bash
npx ts-node test-meaning-layer.ts  # Should still pass
npx vitest run tests/ladder/level-1-simple.spec.ts  # Check metrics
```

### 4. Report
```
Phase 2 Results:
- Changed: entities.ts:XXX
- Meaning layer: PASS/FAIL
- Metrics: Entities P/R/F1, Relations P/R/F1
- Tests passing: XX/20 (was 12)
- Tests 1.13, 1.14: PASS/FAIL
```

---

## Expected Impact
- Recall should increase (more entities found)
- Tests 1.13, 1.14 should pass
- Target: 14+/20 tests passing

Start with finding the DATE filter and report what you see!
