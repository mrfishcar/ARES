# Entity Merge Bug - Deep Diagnostic Report

**Date**: 2025-11-27
**Issue**: Harry Potter + Lily Potter merging into single entity
**Status**: Root cause identified, fix in progress

---

## Problem Summary

Test 3.1 fails because:
- **Gold expects**: "Harry Potter", "James", "Lily Potter" as separate entities
- **System extracts**: Only "Lily Potter" (missing "Harry Potter")
- **False positives**: All of Harry's relations attributed to Lily

Example wrong relations:
- `lily potter::lives_in::privet drive` (should be Harry)
- `lily potter::friends_with::ron weasley` (should be Harry)

---

## Root Cause Identified

### The Smoking Gun

From test 3.1 logs:
```
[ORCHESTRATOR] Entity "Harry Potter" has 2 aliases: [Harry, Potter]
[ORCHESTRATOR] Entity "James" has 2 aliases: [James, Potter]  ← WRONG!
[ORCHESTRATOR] Entity "Lily Potter" has 2 aliases: [Lily, Potter]
[ORCHESTRATOR] Entity "Dursleys" has 2 aliases: [Dursleys, Potter]  ← WRONG!
```

**EVERY entity has "Potter" as an alias!** Even entities that should have nothing to do with "Potter" like "James" and "Dursleys".

### The Merge

Then during the merge phase:
```
[MERGE] Creating new cluster 0 for "Harry Potter"
[MERGE] Merging "Lily Potter" into cluster 0 (score: 1.000, method: substring, matched: "Potter" ↔ "Potter")
```

"Lily Potter" merges with "Harry Potter" because they both have "Potter" as an alias, and "Potter" == "Potter" (exact match).

### Why Lily Wins

After merging, the cluster contains:
```
Cluster 0: [Harry Potter, Lily Potter] (confidences: 0.997, 0.980)
```

Lily Potter has higher confidence (0.997 vs 0.980), so it becomes the canonical name for the merged entity.

---

## Code Path Analysis

### 1. EID Assignment (Correct)

```
[EID-REGISTRY] New entity: "Harry Potter" → EID=1  ✓
[EID-REGISTRY] New entity: "James" → EID=2  ✓
[EID-REGISTRY] New entity: "Lily Potter" → EID=3  ✓
```

Entities are correctly created and assigned separate EIDs.

### 2. Alias Population (BUGGY)

In `app/engine/extract/orchestrator.ts` lines 1154-1200:
```typescript
// Populate entity.aliases from coreference links and alias registry
for (const entity of filteredEntities) {
  const aliasSet = new Set<string>();

  // 1. Add existing aliases
  for (const alias of entity.aliases) {
    aliasSet.add(alias);
  }

  // 2. Add aliases from coreference links
  for (const link of corefLinks.links) {
    if (link.entity_id === entity.id) {
      aliasSet.add(link.mention.text.trim());
    }
  }

  // 3. Add aliases from alias registry (all registered surface forms for this EID)
  if (entity.eid) {
    const registeredAliases = aliasRegistry.getAliasesForEntity(entity.eid);
    for (const mapping of registeredAliases) {
      aliasSet.add(mapping.surfaceForm.trim());
    }
  }

  entity.aliases = Array.from(aliasSet);
}
```

**Issue**: The alias registry is returning contaminated data. When `getAliasesForEntity(EID=2)` is called for "James", it's returning aliases that include "Potter".

### 3. The Mystery

**Question**: Why does the alias registry have "Potter" registered for EID=2 (James)?

**Theories**:
1. **Name splitting**: Some code is automatically splitting multi-word names into components and registering each part as an alias
2. **Cross-contamination during resolution**: Entity resolution logic is incorrectly merging alias registrations
3. **Title variation logic**: Title/name variation matching is overly aggressive

### 4. The Search

**Where aliases get registered**:
```typescript
// app/engine/extract/orchestrator.ts line 1119
entity.aid = aliasResolver.registerAlias(entity.canonical, entity.eid);
```

Only registers the CANONICAL name (e.g., "Harry Potter"), not split components.

**Where could name splitting happen?**
- Alias resolver?
- Entity extraction?
- Coreference resolution?

---

## Attempted Fix #1: Surname-Only Merge Blocking

Added logic to `app/engine/merge.ts` (lines 173-198) to block merging when only surnames match:

```typescript
// CRITICAL FIX: Don't merge on surname-only matches
// E.g., "Harry Potter" and "Lily Potter" both match "Potter" but shouldn't merge
const words1 = n1.split(/\s+/).filter(w => w.length > 0);
const words2 = n2.split(/\s+/).filter(w => w.length > 0);
const shorterWordCount = Math.min(words1.length, words2.length);

if (shorterWordCount === 1 && words1.length !== words2.length) {
  const shorter = words1.length === 1 ? n1 : n2;
  const longer = words1.length === 1 ? n2 : n1;
  const longerWords = longer.split(/\s+/);

  if (longerWords.length >= 2 && longer.endsWith(' ' + shorter)) {
    return false;  // Block surname-only matching
  }
}
```

**Result**: No effect. The bug happens earlier - the aliases are already contaminated before merging.

---

## Next Steps

### Priority 1: Find Where Name Splitting Happens

1. **Trace alias registration flow**:
   - Add debug logging to `aliasRegistry.register()` to see what's being registered
   - Add logging to show WHO is calling register for each alias
   - Track call stack for "Potter" registration

2. **Check entity extraction**:
   - Does `app/engine/extract/entities.ts` split names?
   - Are there name parsing utilities that extract first/last names?

3. **Check coreference resolution**:
   - Does `app/engine/coref.ts` create name component aliases?
   - Are pronouns being resolved to split name components?

### Priority 2: Fix Alias Contamination

Once the source is found, prevent cross-entity alias pollution:
- Ensure each entity only gets its OWN name components as aliases
- Don't share surname aliases across different first names
- Add validation to reject alias registrations that don't make sense

### Priority 3: Add Test Coverage

Create unit test for alias isolation:
```typescript
test('entities with same surname should not share surname alias', () => {
  const text = "Harry Potter and Lily Potter were siblings.";
  const result = await extract(text);

  const harry = result.entities.find(e => e.canonical === 'Harry Potter');
  const lily = result.entities.find(e => e.canonical === 'Lily Potter');

  // Harry should NOT have Lily's aliases
  expect(harry.aliases).not.toContain('Lily');
  // Lily should NOT have Harry's aliases
  expect(lily.aliases).not.toContain('Harry');

  // They should NOT merge
  expect(harry.id).not.toBe(lily.id);
});
```

---

## Files Investigated

- `app/engine/merge.ts` - Merge logic (modified, but fix didn't help)
- `app/engine/extract/orchestrator.ts` - Alias population (lines 1154-1200)
- `app/engine/alias-registry.ts` - Alias storage and retrieval
- `app/engine/alias-resolver.ts` - Alias registration interface
- `app/engine/eid-registry.ts` - Entity ID assignment

---

## Debug Commands

```bash
# Run test with full logging
npm test tests/ladder/level-3-complex.spec.ts 2>&1 > /tmp/stage3-full.txt

# Check Potter alias registrations
grep "ALIAS-REGISTRY.*Potter" /tmp/stage3-full.txt

# Check Potter EID assignments
grep "EID-REGISTRY.*Potter" /tmp/stage3-full.txt

# Check merge decisions
grep "MERGE.*Potter" /tmp/stage3-full.txt
```

---

## Impact

**Blocking**: This bug prevents Stage 3 from passing. It's causing:
- Entity recall issues (missing entities)
- Relation precision issues (wrong entity pairings)
- Family relation extraction failures

**Estimated fix time**: 1-2 hours once name splitting source is located

**Workaround**: None - this is a fundamental bug in alias management

---

## Lessons Learned

1. **Alias systems are fragile**: Cross-contamination can happen easily without strict isolation
2. **Debug logging is critical**: Without detailed logging, impossible to trace data flow
3. **Test simple cases first**: Should have unit-tested 2-person same-surname case before complex narratives
4. **Merge logic alone isn't enough**: If aliases are wrong, blocking merges won't help

---

**Next session**: Continue investigation to locate name splitting code and fix alias contamination.
