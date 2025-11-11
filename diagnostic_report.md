# Entity Filtering Analysis: "Denethor" and "Gimli"

## Summary
Valid entity names "Denethor" and "Gimli" are being filtered during entity extraction, preventing relation extraction for these entities.

## Filtering Chain Analysis

### 1. WHITELIST CHECK (entities.ts, line 217, 222)
**Status: ✓ PASS**
Both names ARE in FANTASY_WHITELIST:
- Line 217: `['Gimli', 'PERSON']`
- Line 222: `['Denethor', 'PERSON']`

The whitelist lookup at lookupWhitelist() should classify these correctly.

### 2. isValidEntity() Filter (entity-filter.ts, line 145-203)
**Status: ✓ PASS**
Tested with both names - they pass all checks:
- ✓ Not empty (line 149)
- ✓ Not in PRONOUNS set (line 156)
- ✓ Not in COMMON_WORDS set (line 161)
- ✓ Not in TYPE_SPECIFIC_BLOCKLIST (line 166)
- ✓ Doesn't match BAD_PATTERNS (lines 172-176)
- ✓ Length >= 2 (line 179-181): "Gimli"=5, "Denethor"=8
- ✓ Contains letters (line 191)
- ✓ Not chapter/section markers (line 197)

**Code:**
```typescript
if (normalized.length < 2) return false;  // Both pass: 5 and 8 chars
if (!/[a-z]/i.test(canonical)) return false;  // Both have letters
```

### 3. filterLowQualityEntities() (entity-quality-filter.ts, line 134-209)
**Status: ✓ PASS**
Tested both names - they're KEPT by the filter:
- ✓ Not in blockedTokens (line 154)
- ✓ Has valid proper noun capitalization (line 160)
- ✓ Has valid characters (line 166)
- ✓ Not too generic (line 178)
- ✓ Not rejected in strict mode (line 183-203)

**Filter Config Default:**
```typescript
minConfidence: 0.65
minNameLength: 2  // Both pass: 5 and 8 chars
requireCapitalization: true  // Both are capitalized
blockedTokens: [pronouns, demonstratives, etc.]  // Neither is blocked
```

### 4. Entity Census Length Check (entity-census.ts, line 215)
**Status: ✓ PASS**
```typescript
if (normalizedName.length < 2) continue;  // Skips single chars
// "gimli" = 5 chars, "denethor" = 8 chars → both pass
```

## CRITICAL ISSUE: SpaCy NER Extraction

### The Real Problem: spaCy May Not Recognize These Names

The issue likely occurs in **entity-census.ts, collectAllMentions()** (line 127):

```typescript
const mentions: EntityMention[] = [];
const parsed = await parseWithService(fullText);  // SpaCy parsing

for (const sentence of parsed.sentences) {
  for (const token of sentence.tokens) {
    if (token.ent_type && token.ent_type !== 'O') {
      // Extract entity if spaCy tagged it
```

**If spaCy's NER doesn't recognize "Denethor" or "Gimli":**
- They won't appear in `parsed.sentences[].tokens[].ent_type`
- They won't be collected in `collectAllMentions()`
- They won't appear in the entity registry at all
- No filtering code will ever execute on them

### Evidence

Looking at the test case 2.11:
```
Text: "Boromir is the son of Denethor. He was a brave warrior."
Expected: ["Boromir", "Denethor"] both extracted
Actual: Only "Boromir" extracted (Denethor missing)
```

The whitelist has both names, but if spaCy doesn't recognize "Denethor" in the context "son of Denethor", it won't be in the NER output.

## The Solution

The issue is NOT in the filtering code - both entity filters PASS these names.

The issue IS that **fallback extraction isn't being used** or **fallback extraction has its own issues**.

### Current Extraction Pipeline (entities.ts, line 1292-1301):

```typescript
const ner = parsed.sentences.flatMap(sent => splitCoordination(sent, nerSpans(sent)));
const dep = parsed.sentences.flatMap(depBasedEntities);
const fb = fallbackNames(text);  // Capitalized word patterns
```

Fallback extraction (fallbackNames()) should catch "Denethor" via pattern:
```typescript
const rx = /\b([A-Z][\w''.-]+(?:\s+[A-Z][\w''.-]+){0,2})\b/g;
// Matches: "Denethor" (single capitalized word)
```

But fallback uses classifyName() which may reject it for context reasons (line 927-1077).

## Recommendations

1. **Debug spaCy NER output** - Check if "Denethor" and "Gimli" appear in spaCy tags
2. **Check fallback extraction** - Verify fallback is extracting these names before filters
3. **Whitelist override** - Ensure whitelist prevents filtering of known entities
4. **Context classification** - Verify fallback's classifyName() accepts these in "son of X" context

## Key Line Numbers for Investigation

| File | Line | Issue |
|------|------|-------|
| entity-census.ts | 127-195 | collectAllMentions() - spaCy NER extraction |
| entities.ts | 1088-1208 | fallbackNames() - capitalized word extraction |
| entities.ts | 927-1077 | classifyName() - context-based classification |
| entities.ts | 884-930 | depBasedEntities() - dependency extraction |
