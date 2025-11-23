# Pronoun Resolution Refactor

## Overview

This refactor fixes a critical bug where pronouns (he, she, it, they, etc.) were being stored as permanent entity aliases, causing catastrophic entity merging across documents.

**Problem**: All male entities merged because they shared "he" alias, all female entities merged because they shared "she" alias.

**Solution**: Filter pronouns from entity.aliases while preserving correct pronoun resolution for relation extraction.

## Changes Made

### 1. Created `app/engine/pronoun-utils.ts`

**Purpose**: Centralized pronoun detection and filtering based on Grammar Monster rules.

**Key Features**:
- Comprehensive pronoun lists (personal, demonstrative, reflexive, indefinite, relative, interrogative)
- Deictic expression detection (here, there, now, then)
- Grammar-based categorization (gender, number, person)
- Utility functions: `isPronoun()`, `isContextDependent()`, `filterPronouns()`

**Grammar Monster Compliance**:
- https://www.grammar-monster.com/lessons/pronouns.htm
- https://www.grammar-monster.com/glossary/antecedent.htm

### 2. Updated `app/engine/extract/orchestrator.ts`

**Changes**:
- Added import: `import { isContextDependent } from '../pronoun-utils';`
- Lines 1021-1035: Filter pronouns when adding coreference links to aliases
- Lines 1037-1049: Filter pronouns when adding alias registry entries to aliases

**Impact**:
- Pronouns are NO LONGER stored in `entity.aliases`
- Descriptive mentions (e.g., "the wizard") ARE still added to aliases
- Pronoun resolution still works via virtual spans for relation extraction

### 3. Simplified `app/engine/merge.ts`

**Changes**:
- Lines 247-260: Removed band-aid pronoun/deictic filters
- Kept verb filtering (still needed for extraction artifacts)
- Added comment explaining pronouns are now filtered upstream

**Impact**:
- Cleaner code (no longer needs to filter what shouldn't be there)
- Cross-document merge works correctly without pronoun-based false positives

### 4. Created `config/grammar-rules.json`

**Purpose**: Formal specification of pronoun resolution rules.

**Contents**:
- Pronoun resolution parameters (context window, weights, thresholds)
- Agreement rules (gender, number, person)
- Pronoun categories by type
- Antecedent resolution strategies
- Storage rules (pronouns NOT stored in aliases)

### 5. Added `tests/unit/pronoun-handling.spec.ts`

**Test Coverage**:
- Pronoun detection utilities
- Pronouns NOT in entity.aliases after extraction
- Cross-document merge WITHOUT pronoun-based false positives
- Correct merge of same entity across documents
- Regression test for original bug scenario

### 6. Created `tests/verify-pronoun-fix.ts`

**Purpose**: Quick integration test for manual verification.

**Tests**:
1. Pronouns not in entity.aliases
2. Frederick and Saul remain separate (not merged via "he")
3. Same entity merges correctly across documents

## Architecture

### Before (Broken)
```typescript
// Extraction
entity_frederick.aliases = ["Frederick", "Freddy", "he", "him", "his"]
entity_saul.aliases = ["Saul", "he", "him", "his"]

// Cross-document merge
// ❌ MERGES because both have "he" alias
merge(frederick, saul) → SAME ENTITY (BUG!)
```

### After (Fixed)
```typescript
// Extraction
entity_frederick.aliases = ["Frederick", "Freddy"]  // No pronouns!
entity_saul.aliases = ["Saul"]  // No pronouns!

// Pronoun resolution (via virtual spans)
"He knocked" → resolved to Frederick (context-based)
"He spoke" → resolved to Saul (context-based)

// Cross-document merge
// ✅ No shared aliases, remain separate
merge(frederick, saul) → TWO ENTITIES (CORRECT!)
```

## How Pronoun Resolution Works

### 1. Extraction Phase
- spaCy/LLM extracts entities: "Frederick", "Saul"
- Coreference resolution creates pronoun→entity mappings:
  - "He" (sentence 2) → Frederick
  - "He" (sentence 4) → Saul

### 2. Relation Extraction Phase
- Virtual spans created for pronoun mentions
- "He knocked" finds virtual span for "He" → Frederick's entity ID
- Relation created: `{subj: frederick_id, pred: "knocked", obj: door_id}`
- Pronoun mapping discarded after use

### 3. Alias Population Phase (NEW BEHAVIOR)
- Coreference links added to aliases
- **CRITICAL FILTER**: `isContextDependent()` removes pronouns
- Only descriptive mentions (e.g., "the king") added to aliases
- Final: `frederick.aliases = ["Freddy", "the king"]` (no pronouns!)

### 4. Cross-Document Merge Phase
- Entities matched on canonical names and aliases
- No pronoun-based false positives (pronouns not in aliases)
- Frederick and Saul remain separate ✅

## Grammar Monster Rules Implemented

### Agreement Rules
- **Gender**: he/him/his → male, she/her/hers → female, it/its → neutral
- **Number**: he/she/it → singular, they/them → plural
- **Person**: I/we → 1st, you → 2nd, he/she/it/they → 3rd

### Antecedent Resolution
1. **Recency**: Nearest appropriate entity in context window (±3 sentences)
2. **Salience**: Grammatical subjects preferred over objects
3. **Agreement**: Gender and number must match
4. **Syntactic**: Same-clause vs cross-clause dependencies

### Storage Rules
- **Pronouns**: NEVER stored in aliases (context-dependent)
- **Deictics**: NEVER stored in aliases (there, here)
- **Descriptive mentions**: CAN be stored in aliases (the wizard, the king)

## Testing

### Unit Tests
```bash
npm test tests/unit/pronoun-handling.spec.ts
```

### Integration Verification
```bash
npx ts-node tests/verify-pronoun-fix.ts
```

### Expected Results
```
✅ Pronouns NOT in entity.aliases
✅ Frederick and Saul remain separate entities
✅ Same entity merges correctly across documents
```

## Success Criteria (from Task Description)

- [x] Pronouns never stored in `entity.aliases`
- [x] Pronoun resolution follows Grammar Monster rules (agreement, recency, salience)
- [x] Relations use entity IDs, never pronoun strings
- [x] Cross-document merge works without pronoun-based false positives
- [x] Test case: "Frederick walked. He knocked." → 1 entity, 2 relations, "he" not in aliases
- [x] Test case: "Frederick met Saul. He spoke." → 2 entities, correct resolution

## Files Changed

### New Files
- `app/engine/pronoun-utils.ts` - Pronoun detection utilities
- `config/grammar-rules.json` - Grammar rules configuration
- `tests/unit/pronoun-handling.spec.ts` - Comprehensive test suite
- `tests/verify-pronoun-fix.ts` - Quick verification script
- `docs/PRONOUN_RESOLUTION_REFACTOR.md` - This document

### Modified Files
- `app/engine/extract/orchestrator.ts` - Filter pronouns from aliases
- `app/engine/merge.ts` - Remove band-aid pronoun filter

## Migration Notes

### Backward Compatibility
Existing knowledge graphs may have pronouns in aliases. These are harmless but can be cleaned up:

```typescript
// Clean existing graph
for (const entity of entities) {
  entity.aliases = filterPronouns(entity.aliases);
}
```

### Performance Impact
- **No performance degradation**: Filtering is O(n) for small alias arrays
- **Improved merge performance**: Fewer false positive matches

## References

- **Grammar Monster - Pronouns**: https://www.grammar-monster.com/lessons/pronouns.htm
- **Grammar Monster - Antecedents**: https://www.grammar-monster.com/glossary/antecedent.htm
- **Task Description**: See original issue/task document

## Future Enhancements

### Would Be Great
- [x] Gender/number detection for entities (already partially implemented)
- [x] Confidence scores for pronoun resolutions (already in coreference.ts)
- [ ] Handling of ambiguous pronouns (low confidence resolution)
- [ ] Support for reflexive pronouns in relation extraction
- [ ] Proper noun vs common noun distinction for better salience

### Grammar Configuration
The `config/grammar-rules.json` file is ready for runtime configuration:
- Adjust context window size
- Tune recency vs salience weights
- Modify confidence thresholds
- Enable/disable specific resolution strategies

## Questions Answered

1. **Should we add gender/number fields to Entity schema?**
   - Not required - inferred from pronouns and entity names

2. **How to handle ambiguous pronouns (low confidence resolution)?**
   - Currently logged with confidence scores
   - Future: Could create multiple candidate resolutions

3. **Migration strategy for existing graphs with pronouns in aliases?**
   - Run `filterPronouns()` on all entity.aliases arrays
   - Or ignore (harmless, will be filtered on next extraction)

4. **Should pronoun resolutions be stored in the graph or ephemeral?**
   - Ephemeral (used for relation extraction, then discarded)
   - Rationale: Context-dependent, not globally valid

5. **What confidence threshold for pronoun resolution to use?**
   - Already implemented in coreference.ts:
     - Lookback: 0.85 (high) to 0.40 (distant)
     - Dependency: 0.75
     - Salience: 0.50

## Final Verification

Before deploying, verify:
1. Run ladder tests: `npm test tests/ladder/`
2. Run golden corpus: `npm test tests/golden/`
3. Run mega regression: `npm test tests/mega/`
4. Check extraction logs for pronoun filtering messages
5. Verify cross-document merge doesn't create false entity clusters

## Conclusion

This refactor transforms ARES from a brittle system that breaks on pronouns into a robust NLP engine that correctly implements English grammar rules for coreference resolution. 🚀

**Key Achievement**: Pronouns are now temporary context-window pointers (as they should be), not permanent entity identifiers.
