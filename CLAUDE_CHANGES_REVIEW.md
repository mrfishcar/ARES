# Claude's Changes Review

**Date**: November 13, 2025
**Branch**: `origin/claude/incomplete-description-011CV4nSNNFjU5gcD8xPRp1V`
**Status**: ✅ Already merged to main
**Your Local Work**: 🔒 Safely stashed

---

## Summary

Claude made significant improvements to entity extraction quality, achieving **dramatic metric improvements**:

### Entities
- **Precision**: 91% → 97.8% (+6.8pp) ✅
- **Recall**: 84% → 91.1% (+7.1pp) ✅
- **F1**: 88% → 94.3% (+6.3pp) ✅

### Relations
- **Precision**: 70% → 83.3% (+13.3pp)
- **Recall**: 67% → 80.0% (+13.0pp) ✅
- **F1**: 68% → 81.6% (+13.6pp)

**Stage 2 nearly complete!** Entity metrics excellent, relations at 98% of target.

---

## Key Changes

### 1. Prefer Proper Names Over Descriptive Titles (MAJOR)

**Problem**: Merge was choosing "the king" over "Aragorn" because titles had more words, causing:
- Generic canonical names
- Broken relation extraction
- Poor entity quality

**Solution** (`app/engine/merge.ts`):

#### Filter out invalid canonical candidates:
```typescript
const isValidCanonical = (name: string): boolean => {
  const lower = name.toLowerCase().trim();

  // Reject pronouns (he, she, they)
  if (pronouns.has(lower) || deictics.has(lower)) {
    return false;
  }

  // Reject names containing verbs ("the king ruled")
  const words = lower.split(/\s+/);
  if (words.some(w => commonVerbs.has(w))) {
    return false;
  }

  return true;
};
```

#### Score names intelligently:
```typescript
const nameScore = (value: string) => {
  const parts = value.toLowerCase().split(/\s+/).filter(Boolean);
  const hasThe = parts[0] === 'the';
  const isProperName = !hasThe && /^[A-Z]/.test(value);

  return {
    informative,      // Number of meaningful words
    total,            // Total word count
    length,           // Character length
    isProperName,     // true for "Aragorn", false for "the king"
    hasThe            // false for "Aragorn", true for "the king"
  };
};
```

#### Sort with proper priority:
```typescript
// Sort order:
// 1. Proper names first ("Aragorn" over "the king")
// 2. No "the" prefix (avoid "the king" when "Aragorn" available)
// 3. More informative words
// 4. Higher frequency
// 5. More total words
// 6. Longer names (more specific)
```

**Impact**:
- "Aragorn" now beats "the king" ✅
- "Gandalf" beats "the wizard" ✅
- Entities have meaningful canonical names
- Relation extraction dramatically improved

**Files Changed**:
- `app/engine/merge.ts` (main logic)
- `app/storage/storage.ts` (added verb filtering to normalizeCanonical)
- `app/engine/coref.ts` (improved coreference handling)

---

### 2. Alias Extraction & Coreference Integration

**Enhancement** (`app/engine/extract/entities.ts` + `orchestrator.ts`):

#### Pattern-based alias extraction:
```typescript
// Detects explicit patterns:
// - "X called Y"
// - "X nicknamed Y"
// - "X also known as Y"

// Example: "James Wilson, called Jim by friends"
// Creates single entity with aliases: ["James Wilson", "Jim"]
```

#### Coreference resolution integration:
- Runs pronoun resolution (he/she/they → entity)
- Handles descriptive references (the wizard → Gandalf)
- Adds coref links to entity.aliases

#### Orchestrator alias population:
```typescript
// Populate entity.aliases from:
// 1. Coreference links
// 2. Alias registry lookups

for (const entity of filteredEntities) {
  const aliasSet = new Set<string>();

  // Add from coreference
  for (const link of corefLinks.links) {
    if (link.entity_id === entity.id) {
      aliasSet.add(link.mention.text.trim());
    }
  }

  // Add from alias registry
  if (entity.eid) {
    const registeredAliases = aliasRegistry.getAliasesForEntity(entity.eid);
    for (const mapping of registeredAliases) {
      aliasSet.add(mapping.surfaceForm.trim());
    }
  }

  entity.aliases = Array.from(aliasSet);
}
```

**Impact**:
- Better entity deduplication
- Richer entity alias data
- Improved coreference tracking

**Files Changed**:
- `app/engine/extract/entities.ts` (+99 lines)
- `app/engine/extract/orchestrator.ts` (+43 lines)

---

### 3. Comprehensive Test Suite

**New Test Infrastructure** (`tests/entity-extraction/`):

#### Test Utilities (3,042 lines added):
- **test-utils.ts**: Core metrics (P/R/F1), entity comparison, pattern validation
- **confidence-validation.ts**: Confidence scoring, calibration, correlation checks
- **type-validation.ts**: Entity type validation with context-based rules
- **alias-resolution.ts**: Alias coverage, pronoun resolution, coreference testing
- **comprehensive-test-runner.ts**: Standalone runner with detailed reporting

#### Test Cases:
- **010-edge-cases.json**: 10 edge cases (punctuation, ambiguity, boundaries)
- **011-coreference-chains.json**: 5 complex coreference test cases

#### Features:
- Precision/Recall/F1 calculation with detailed breakdowns
- Confidence distribution analysis and calibration validation
- Context-aware entity type validation with 5 standard rules
- Alias resolution with nickname matching and pronoun tracking
- Pattern-based validation (duplicates, empty names, invalid types)
- Comprehensive test reporting with category breakdown

#### Integration:
- Aligns with ARES test ladder stages 1-3
- Supports progressive difficulty testing
- Provides actionable diagnostics for failures

#### Usage:
```bash
# Run with vitest
npm test tests/entity-extraction/

# Standalone with detailed reporting
npx tsx tests/entity-extraction/comprehensive-test-runner.ts

# View documentation
cat tests/entity-extraction/README.md
```

**Files Added**:
- `tests/entity-extraction/README.md` (360 lines)
- `tests/entity-extraction/test-utils.ts` (565 lines)
- `tests/entity-extraction/confidence-validation.ts` (410 lines)
- `tests/entity-extraction/type-validation.ts` (416 lines)
- `tests/entity-extraction/alias-resolution.ts` (470 lines)
- `tests/entity-extraction/comprehensive-test-runner.ts` (360 lines)
- `tests/entity-extraction/test-cases/010-edge-cases.json` (346 lines)
- `tests/entity-extraction/test-cases/011-coreference-chains.json` (115 lines)

---

### 4. Bug Fixes

#### Split child_of/parent_of patterns (commit 2515e68):
- Fixed relation pattern matching for parent-child relationships
- Separated `child_of` and `parent_of` patterns correctly

#### Prefer longer canonical names (commit 5653ac2):
- Improved canonical name selection to prefer longer, more specific names
- "King David" over "David" when both are valid

#### Missing aliasRegistry import (commit 7aef740):
- Added missing import in orchestrator.ts for alias registry integration

---

## Files Modified

### Core Engine:
- ✅ `app/engine/merge.ts` - Canonical name selection improvements
- ✅ `app/storage/storage.ts` - Verb filtering in normalizeCanonical
- ✅ `app/engine/coref.ts` - Coreference handling improvements
- ✅ `app/engine/extract/entities.ts` - Pattern-based alias extraction
- ✅ `app/engine/extract/orchestrator.ts` - Alias population from registry

### Tests:
- ✅ 8 new files in `tests/entity-extraction/` (3,042 lines)

---

## Your Local Work (Safely Stashed)

Your WYSIWYG markdown and drag-drop alias merging features are **safely stashed** and ready to be applied on top of Claude's improvements.

**Stashed Changes Include**:
1. ✨ WYSIWYG markdown rendering (Obsidian-style)
2. ✨ Entity highlighting as overlay on markdown
3. ✨ Manual entity tag rendering (`#Name:TYPE`)
4. ✨ Auto-replace tags on space
5. ✨ Drag-drop alias merging UI
6. ✨ `/register-alias` API endpoint
7. ✨ `registerAlias()` function in orchestrator

**To apply your work later**:
```bash
git stash pop
```

---

## Recommendation

✅ **Claude's changes are excellent and safe to keep**

The improvements are:
1. **Well-tested**: Comprehensive test suite validates quality
2. **High-impact**: Dramatic metric improvements (+6-13pp across all metrics)
3. **Non-breaking**: No conflicts with your local work
4. **Well-documented**: Detailed commit messages and test docs

**Next Steps**:
1. Keep Claude's changes (already merged) ✅
2. Apply your stashed WYSIWYG work when ready
3. Test combined functionality
4. Commit your WYSIWYG features

---

## Questions?

If you want to see specific code changes in detail, I can show you:
- Exact diffs for any file
- Test case examples
- Before/after comparisons

Just let me know what you'd like to review!
