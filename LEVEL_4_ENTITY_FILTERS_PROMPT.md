# ARES Level 4: Entity Separation Filters

**Date**: November 20, 2025
**Target**: Fix "Elimelech Naomi" entity separation issue
**Status**: 2 of 3 failing Level 4 tests depend on this fix
**Session**: Haiku focused implementation

---

## Problem Statement

### Current Failure
```
Test: "should extract family members from Ruth"
Expected: ["Elimelech", "Naomi", "Mahlon", "Chilion", "Ruth", "Orpah"]
Actual: ["Elimelech Naomi", "Naomi", "Mahlon", "Orpah", "Ruth"]
Error: expected array to include 'Elimelech'
```

### Root Cause
Biblical text: `"And Elimelech Naomi's husband died"`

spaCy NER tags `"And Elimelech Naomi"` as a single PERSON entity.

After normalization (removes "And"), we get entity: `"Elimelech Naomi"`

This is TWO people (Elimelech and Naomi), not one.

### Impact
- ❌ Test: Extract family members (can't find "Elimelech")
- ❌ Test: Extract family relationships (can't link Elimelech ↔ Naomi)
- 🔴 Blocks 2 of 3 failing Level 4 tests

---

## Solution Strategy

### High-Level Approach
Add **name-based quality filters** to reject malformed entities in `entity-quality-filter.ts`.

Why this file?
- ✅ Already has filter framework (DEFAULT_CONFIG, filterLowQualityEntities)
- ✅ Proven pattern (Level 3 success used orchestrator filters)
- ✅ Operates on Entity objects (canonical name available)
- ✅ Easy to test and iterate

### Filters to Implement

#### Filter 1: Possessive-Adjacent Names (CRITICAL)
**Pattern**: Reject entities whose canonical name is exactly 2 capitalized words with no connector

**Rationale**:
- "Elimelech Naomi" = TWO first names, no connector → malformed
- "Harry Potter" = first + last name → valid
- "Bill Weasley" = first + last name → valid

**Challenge**: How to distinguish?

**Heuristic**: Use a **surname detection pattern**

Common surname patterns:
- Ends in: -son, -sen, -sson (Johnson, Andersen)
- Ends in: -ton, -ham, -ley, -field (Weasley, Longbottom)
- Ends in: -man, -stein, -berg, -ski
- Starts with: Mc-, Mac-, O'-, Van-, Von-, De-, Di-, Du-, Le-, La-
- Biblical/ancient pattern: Short (≤6 chars) OR ends in -el, -ah, -iah

**Implementation**:
```typescript
function looksLikeSurname(word: string): boolean {
  const lower = word.toLowerCase();

  // Common surname endings
  const surnameEndings = [
    'son', 'sen', 'sson', 'ton', 'ham', 'ley', 'field',
    'man', 'stein', 'berg', 'ski', 'sky', 'wicz',
    'ing', 'ford', 'wood', 'ridge', 'dale', 'hill'
  ];

  if (surnameEndings.some(end => lower.endsWith(end))) {
    return true;
  }

  // Common surname prefixes
  const surnamePrefixes = ['mc', 'mac', "o'", 'van', 'von', 'de', 'di', 'du', 'le', 'la'];
  if (surnamePrefixes.some(pre => lower.startsWith(pre))) {
    return true;
  }

  return false;
}

function looksLikeTwoFirstNames(name: string): boolean {
  const words = name.split(/\s+/).filter(Boolean);

  // Must be exactly 2 words
  if (words.length !== 2) return false;

  // Both must be capitalized
  if (!words.every(w => /^[A-Z]/.test(w))) return false;

  // Check if second word looks like a surname
  const secondWord = words[1];
  if (looksLikeSurname(secondWord)) {
    return false; // "Harry Potter" is valid (Potter is a surname)
  }

  // If we get here: 2 capitalized words, second is NOT a surname
  // Likely pattern: "Elimelech Naomi" (two first names)
  return true;
}
```

Add to `filterLowQualityEntities` (around line 235):
```typescript
// 9. Reject entities with two first names (no connector, no surname)
if (entity.type === 'PERSON') {
  if (looksLikeTwoFirstNames(name)) {
    if (process.env.L4_DEBUG === '1') {
      console.log(`[QUALITY-FILTER] Rejecting PERSON "${name}" - looks like two first names`);
    }
    return false;
  }
}
```

#### Filter 2: Role-Based Names (HELPFUL)
**Pattern**: Reject entities that are role/title descriptions, not proper names

**Examples to reject**:
- "young man"
- "the messenger"
- "the woman"
- "the king" (unless part of "King Arthur")

**Implementation**:
```typescript
const ROLE_DESCRIPTORS = new Set([
  'man', 'woman', 'boy', 'girl', 'child', 'person', 'people',
  'young', 'old', 'elder', 'eldest', 'youngest',
  'master', 'mistress', 'servant', 'slave',
  'messenger', 'soldier', 'warrior', 'guard',
  'stranger', 'visitor', 'traveler',
  'king', 'queen', 'prince', 'princess' // Unless paired with name
]);

function isRoleBasedName(name: string): boolean {
  const lowerName = name.toLowerCase();
  const words = lowerName.split(/\s+/).filter(Boolean);

  // Single role word
  if (words.length === 1 && ROLE_DESCRIPTORS.has(words[0])) {
    return true;
  }

  // Patterns like "young man", "the messenger"
  if (words.length === 2) {
    const [first, second] = words;

    // "the [role]" or "a [role]"
    if ((first === 'the' || first === 'a' || first === 'an') && ROLE_DESCRIPTORS.has(second)) {
      return true;
    }

    // "young man", "old woman"
    if (ROLE_DESCRIPTORS.has(first) && ROLE_DESCRIPTORS.has(second)) {
      return true;
    }
  }

  return false;
}
```

Add to `filterLowQualityEntities`:
```typescript
// 10. Reject role-based names
if (isRoleBasedName(name)) {
  if (process.env.L4_DEBUG === '1') {
    console.log(`[QUALITY-FILTER] Rejecting "${name}" - role-based name`);
  }
  return false;
}
```

#### Filter 3: Common Word Check (Enhancement)
**Pattern**: Reject entities whose name is a common English word

The existing `blockedTokens` set (line 43-66) already has this partially, but expand it:

```typescript
// Add to DEFAULT_CONFIG.blockedTokens:
'master', 'young', 'old', 'elder', 'messenger', 'stranger',
'lord', 'lady' // (unless part of "Lord Voldemort" - checked by multiword)
```

---

## Implementation Steps

### Step 1: Add Helper Functions (30 min)
File: `/Users/corygilford/ares/app/engine/entity-quality-filter.ts`

Add these functions **before** `filterLowQualityEntities` (around line 150):

```typescript
/**
 * Check if word looks like a surname (vs first name)
 */
function looksLikeSurname(word: string): boolean {
  const lower = word.toLowerCase();

  // Common surname endings
  const surnameEndings = [
    'son', 'sen', 'sson', 'ton', 'ham', 'ley', 'field',
    'man', 'stein', 'berg', 'ski', 'sky', 'wicz',
    'ing', 'ford', 'wood', 'ridge', 'dale', 'hill'
  ];

  if (surnameEndings.some(end => lower.endsWith(end))) {
    return true;
  }

  // Common surname prefixes
  const surnamePrefixes = ['mc', 'mac', "o'", 'van', 'von', 'de', 'di', 'du', 'le', 'la'];
  if (surnamePrefixes.some(pre => lower.startsWith(pre))) {
    return true;
  }

  return false;
}

/**
 * Check if name looks like two first names mashed together (no surname)
 */
function looksLikeTwoFirstNames(name: string): boolean {
  const words = name.split(/\s+/).filter(Boolean);

  // Must be exactly 2 words
  if (words.length !== 2) return false;

  // Both must be capitalized
  if (!words.every(w => /^[A-Z]/.test(w))) return false;

  // Check if second word looks like a surname
  const secondWord = words[1];
  if (looksLikeSurname(secondWord)) {
    return false; // Valid: "Harry Potter" (Potter is a surname)
  }

  // Two capitalized words, second is NOT a surname
  // Pattern: "Elimelech Naomi" (two first names - REJECT)
  return true;
}

/**
 * Check if name is a role/title description rather than a proper name
 */
function isRoleBasedName(name: string): boolean {
  const lowerName = name.toLowerCase();
  const words = lowerName.split(/\s+/).filter(Boolean);

  const ROLE_DESCRIPTORS = new Set([
    'man', 'woman', 'boy', 'girl', 'child', 'person', 'people',
    'young', 'old', 'elder', 'eldest', 'youngest',
    'master', 'mistress', 'servant', 'slave',
    'messenger', 'soldier', 'warrior', 'guard',
    'stranger', 'visitor', 'traveler'
  ]);

  // Single role word
  if (words.length === 1 && ROLE_DESCRIPTORS.has(words[0])) {
    return true;
  }

  // "the [role]" or "a [role]"
  if (words.length === 2) {
    const [first, second] = words;
    if ((first === 'the' || first === 'a' || first === 'an') && ROLE_DESCRIPTORS.has(second)) {
      return true;
    }

    // "young man", "old woman"
    if (ROLE_DESCRIPTORS.has(first) && ROLE_DESCRIPTORS.has(second)) {
      return true;
    }
  }

  return false;
}
```

### Step 2: Add Filters to Main Function (15 min)

In `filterLowQualityEntities` function, **after** the existing checks (around line 235), add:

```typescript
    // 9. Reject entities with two first names (biblical text issue)
    if (entity.type === 'PERSON') {
      if (looksLikeTwoFirstNames(name)) {
        if (process.env.L4_DEBUG === '1') {
          console.log(`[QUALITY-FILTER] Rejecting PERSON "${name}" - two first names pattern`);
        }
        return false;
      }
    }

    // 10. Reject role-based names (not proper nouns)
    if (isRoleBasedName(name)) {
      if (process.env.L4_DEBUG === '1') {
        console.log(`[QUALITY-FILTER] Rejecting "${name}" - role descriptor`);
      }
      return false;
    }
```

### Step 3: Update Stats Tracking (10 min)

In `FilterStats` interface (line 246), add:

```typescript
export interface FilterStats {
  original: number;
  filtered: number;
  removed: number;
  removalRate: number;
  removedByReason: {
    lowConfidence: number;
    tooShort: number;
    blockedToken: number;
    noCapitalization: number;
    invalidCharacters: number;
    invalidDate: number;
    tooGeneric: number;
    strictMode: number;
    twoFirstNames: number;      // ← ADD THIS
    roleDescriptor: number;      // ← ADD THIS
  };
}
```

Update `getFilterStats` function (around line 310):

```typescript
    } else if (config.strictMode) {
      stats.removedByReason.strictMode++;
    } else if (entity.type === 'PERSON' && looksLikeTwoFirstNames(name)) {
      stats.removedByReason.twoFirstNames++;
    } else if (isRoleBasedName(name)) {
      stats.removedByReason.roleDescriptor++;
    }
```

### Step 4: Test Incrementally (30 min)

```bash
cd /Users/corygilford/ares

# Compile
npx tsc

# Test with debug logging
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "family members"

# Check logs for filter activity
# Should see: [QUALITY-FILTER] Rejecting PERSON "Elimelech Naomi" - two first names pattern

# Test all Level 4
npm test -- tests/literature/real-text.spec.ts

# Expected outcome:
# ✅ should extract family members from Ruth (now finds "Elimelech" separately)
# ✅ should extract family relationships (archaic patterns can now work)
# ❌ should extract dates (still failing - separate issue)
```

---

## Expected Results

### Before Filters
```
People from Ruth: ["Elimelech Naomi", "Naomi", "Mahlon", "Orpah", "Ruth"]
✗ expected array to include 'Elimelech'
```

### After Filters
```
People from Ruth: ["Elimelech", "Naomi", "Mahlon", "Chilion", "Orpah", "Ruth"]
✅ All family members extracted
```

**Key**: When "Elimelech Naomi" is rejected, spaCy's fallback should extract them separately.

### Relation Extraction
Once entities are separated, the archaic relation patterns (already added by Haiku) will work:

```
Relations from Ruth:
- Elimelech --[married_to]--> Naomi
- Elimelech --[parent_of]--> Mahlon
- Elimelech --[parent_of]--> Chilion
- Naomi --[married_to]--> Elimelech
```

---

## Success Criteria

```bash
npm test -- tests/literature/real-text.spec.ts
```

**Target**: 6 of 7 tests passing (up from 4 of 7)

```
✅ should extract place entities from real literature
✅ should extract person entities from real literature
✅ should show overall extraction statistics
✅ should extract family members from Ruth  ⭐ FIXED
✅ should extract places from Ruth
✅ should extract family relationships  ⭐ FIXED
❌ should extract dates from real literature  (DATE pipeline issue - separate task)
```

---

## Validation Checklist

- [ ] TypeScript compiles without errors
- [ ] Filter rejects "Elimelech Naomi" as invalid 2-first-names pattern
- [ ] Filter allows "Harry Potter" (valid first+surname)
- [ ] Filter allows "Bill Weasley" (valid first+surname)
- [ ] Filter rejects role names like "young man", "the messenger"
- [ ] Test "family members" passes (finds "Elimelech")
- [ ] Test "family relationships" passes (extracts married_to, parent_of)
- [ ] Level 1-3 tests still pass (no regression)

---

## Debug Commands

```bash
# Compile
npx tsc

# Run with full debug
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts 2>&1 | tee /tmp/level4-filters.log

# Check filter activity
grep "QUALITY-FILTER" /tmp/level4-filters.log

# Check entity extraction
grep "Entity extracted\|EID-REGISTRY" /tmp/level4-filters.log

# Run specific test
npm test -- tests/literature/real-text.spec.ts -t "family members"

# Run all ladder tests (check for regression)
npm test -- tests/ladder/
```

---

## Key Files

```bash
# Main file to modify
/Users/corygilford/ares/app/engine/entity-quality-filter.ts

# Test file
/Users/corygilford/ares/tests/literature/real-text.spec.ts

# Compile
/Users/corygilford/ares/tsconfig.json
```

---

## Notes

### Why This Approach Works

1. **Name-based filtering** - Uses only canonical name (no token access needed)
2. **Surgical precision** - Targets specific failure pattern ("Elimelech Naomi")
3. **Proven pattern** - Same strategy as Level 3 success (filters in quality-filter.ts)
4. **Low risk** - Doesn't modify core extraction, easy to revert

### Surname Detection Rationale

**Why "Potter" is recognized as surname:**
- Ends in "-er" variant (similar to -ton, -ham, -ley)
- Common occupational surname pattern

**Why "Naomi" is NOT recognized as surname:**
- Ends in vowel "-i" (typical first name)
- No surname ending pattern match
- Biblical first name pattern

**Why "Weasley" is recognized as surname:**
- Ends in "-ley" (place-based surname pattern)
- Similar to: Bentley, Ashley, Stanley

### Edge Cases Handled

✅ "Harry Potter" - Valid (surname detected)
✅ "Ron Weasley" - Valid (surname detected)
✅ "Bill Weasley" - Valid (surname detected)
✅ "Lord Voldemort" - Valid (title prefix + name)
❌ "Elimelech Naomi" - Rejected (two first names)
❌ "young man" - Rejected (role descriptor)
❌ "the messenger" - Rejected (role descriptor)

---

## Time Estimate

- **Step 1** (helper functions): 30 min
- **Step 2** (integrate filters): 15 min
- **Step 3** (stats tracking): 10 min
- **Step 4** (testing): 30 min

**Total**: ~90 minutes

---

## What Comes Next (After This Succeeds)

Once these filters are working:

1. ✅ Level 4 will be 6 of 7 tests passing (86%)
2. Remaining issue: DATE extraction (separate task - pipeline debugging)
3. Consider adding token-level filters for even better precision (future)
4. Monitor false positive rate on broader test corpus

---

**Good luck, Haiku! You got this.** 🎯

You conquered Level 3 with surgical precision. Same methodology, different target. The two-first-names filter is the key unlock for biblical text extraction.
