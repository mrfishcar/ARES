# Coordination List Bug Fix - Status Report

**Date**: 2025-11-27
**Session**: claude/review-claude-md-docs-012NtuxqVuaNfiGmfG9eKVVG
**Status**: ✅ Bug Fixed, Major Progress on Stage 3

---

## Problem Identified

**Critical Bug**: Coordination lists were being merged into single entities
- **Example**: "Gryffindor, Slytherin, Hufflepuff, and Ravenclaw" → single entity "Gryffindor Slytherin Hufflepuff"
- **Impact**: Stage 3 relation F1 dropped from expected ~66% to 45.1%

**Root Cause**: Two places in the code were grouping consecutive capitalized words without checking for punctuation between them:
1. Mock parser's `annotateNamedEntities()` function
2. Entity extraction's `nerSpans()` function

---

## Solution Implemented

### 1. Mock Parser Fix (app/parser/MockParserClient.ts)

**Changes**:
- Added `fullText` parameter to `annotateNamedEntities()` and `buildTokens()`
- Added `hasCommaBetween()` helper function
- Check for commas between consecutive capitalized tokens before grouping

**Code**:
```typescript
// Helper to check if there's a comma between two tokens
const hasCommaBetween = (token1: Token, token2: Token): boolean => {
  const between = fullText.slice(token1.end, token2.start);
  return between.includes(',');
};

// In grouping loop:
if (hasCommaBetween(tokens[j - 1], next)) break;
```

### 2. Entity Extraction Fix (app/engine/extract/entities.ts)

**Changes**:
- Added punctuation gap detection in `nerSpans()` function
- Check if gap between consecutive tokens > 1 character (comma, semicolon, etc.)
- Break grouping when punctuation detected

**Code**:
```typescript
while (j < sent.tokens.length && sent.tokens[j].ent === t.ent) {
  // COORDINATION FIX: Don't group entities across punctuation
  const prevToken = sent.tokens[j - 1];
  const currToken = sent.tokens[j];
  if (currToken.start - prevToken.end > 1) {
    break; // Punctuation between tokens, don't group
  }
  j++;
}
```

---

## Results

### Before Fix

**Stage 3 Metrics**:
- Entity P/R/F1: 80.2% / 72.2% / 76.0% ❌ (below 77% target)
- Relation P/R/F1: 51.6% / 40.1% / 45.1% ❌ (far below 77% target)

**Test 3.10**: Extracted "Gryffindor Slytherin Hufflepuff" as single PERSON entity

### After Fix

**Stage 3 Metrics**:
- Entity P/R/F1: 90.2% / 86.5% / 88.3% ✅ (target met!)
- Relation P/R/F1: 65.3% / 56.4% / 60.5% (improved +15 points, but still below 77%)

**Test 3.10**: Correctly extracts 4 separate entities:
- ORG::Gryffindor
- ORG::Slytherin
- ORG::Hufflepuff
- ORG::Ravenclaw

**Stage 1 & 2**: No regression, both still passing ✅
- Stage 1: Entity F1=93.3%, Relation F1=93.7%
- Stage 2: Entity F1=93.9%, Relation F1=92.5%

---

## Commits

1. `2e760cc` - debug: Add rawSpans debug logging to trace entity sources
2. `796aeaf` - fix: Prevent coordination list merging in NER span extraction

---

## Remaining Work

**Current Status**: Stage 3 relation F1 at 60.5%, need 77% (gap: 16.5 points)

**Next Steps**:
1. Analyze which specific relation patterns are missing
2. Review failing test cases to identify pattern gaps
3. Add/improve patterns for:
   - Marriage/romantic relations (married_to)
   - Membership/affiliation relations (member_of)
   - Enemy/hostility relations (enemy_of)
   - Teaching/mentorship relations (teaches_at)
4. Run tests and verify improvement
5. Ensure no regression in Stage 1-2

**Strategy**: The coordination fix already improved relation F1 by 15 points (45.1% → 60.5%). The remaining 16.5 point gap likely requires adding missing relation patterns identified in STAGE3_RELATION_ANALYSIS.md.

---

## Files Modified

- `app/parser/MockParserClient.ts` - Comma detection in NER tagging
- `app/engine/extract/entities.ts` - Punctuation gap check in nerSpans()

## Branch

All changes pushed to: `claude/review-claude-md-docs-012NtuxqVuaNfiGmfG9eKVVG`
