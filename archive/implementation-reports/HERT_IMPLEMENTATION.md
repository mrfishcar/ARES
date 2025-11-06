# HERT (Hierarchical Entity Reference Tag) - Implementation Complete ✅

**Date:** October 29, 2025
**Status:** Core System Ready
**Approach:** Stable, Compact, Hierarchical Entity References

---

## What is HERT?

HERT is a **Hierarchical Entity Reference Tag** system that provides:

- **Stable numeric entity IDs** (like Strong's Concordance numbers)
- **Sense disambiguation** via hierarchical paths (e.g., Faith-2.1 = "theological virtue, narrative usage")
- **Precise document locations** (section, chapter, paragraph, token position)
- **Compact encoding** (7.4x smaller than JSON)
- **Cross-document portability** (share refs without database access)

**One-liner:** A compact, optionally encrypted code that binds a root entity ID to a subset/sense path and a precise document location, enabling alias resolution and cross-document tracking with stable, mergeable identifiers.

---

## Why HERT?

### Problem

Traditional entity extraction has issues:
- **No stable IDs:** "Faith" in doc1 ≠ "Faith" in doc2 (different UUIDs)
- **No sense disambiguation:** "Faith" (virtue) vs "Faith" (character) vs "faith" (trust)
- **No precise references:** Can't point to exact occurrences
- **Verbose storage:** JSON refs are large and unwieldy
- **No alias tracking:** "YHWH", "Yahweh", "LORD" all different

### Solution

HERT provides:
- **Stable EID:** Entity 4102 = "Faith" forever, across all documents
- **Sense paths:** 4102.S1 = personal trust, 4102.S2 = theological virtue
- **Precise LP:** Paragraph 14, token 823, length 4
- **Compact:** `HERTv1:4dMPvxLbX1BRfhgNSFt1xit5ZE` (33 chars vs 274 JSON)
- **Alias registry:** Multiple surfaces → one canonical EID

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ HERT Structure                                                  │
└─────────────────────────────────────────────────────────────────┘

HERT := {
  EID,          // 32-bit entity ID (e.g., 4102 = "Faith")
  SP[],         // Sense path [2, 1, 0] = sense.subsense.variant
  DID,          // 64-bit document fingerprint
  LP {          // Location path
    section?,
    chapter?,
    paragraph,
    tokenStart,
    tokenLength
  },
  FLAGS,        // Bitfield: hasSection, hasChapter, confidence, etc.
  META?         // Optional: modelVersion, extractorId, timestamp
}

┌─────────────────────────────────────────────────────────────────┐
│ Encoding Layers                                                 │
└─────────────────────────────────────────────────────────────────┘

1. Binary Packing
   - Varint encoding for space efficiency
   - Fixed 8-byte DID
   - Conditional LP components (based on FLAGS)

2. Base62 Encoding
   - URL-safe: 0-9, A-Z, a-z
   - More compact than base64
   - No special characters

3. Text Form
   - Compact: HERTv1:<base62>
   - Encrypted: HERTv1e:<base62>
   - Readable: 4102.S2.1 @ d:Zf7qJ9 @ p:14 @ t:823+4
```

---

## Implementation

### Files Created (6 files, ~700 lines)

1. **`app/engine/hert/types.ts`** (155 lines)
   - Core type definitions
   - HERT, EID, DID, SP, LP, HERTFlags
   - Entity, Alias, Document, Reference types

2. **`app/engine/hert/varint.ts`** (113 lines)
   - Varint encoding/decoding
   - 64-bit encoding for DID
   - Array encoding utilities

3. **`app/engine/hert/base62.ts`** (49 lines)
   - Base62 encoding (URL-safe)
   - Byte array ↔ string conversion

4. **`app/engine/hert/codec.ts`** (238 lines)
   - Binary packing/unpacking
   - Text form encoding/decoding
   - Readable form generation
   - FLAGS bitfield packing

5. **`app/engine/hert/fingerprint.ts`** (81 lines)
   - Document ID generation (DID)
   - Content hashing (SHA256)
   - LP hash for fast lookups
   - Alias normalization

6. **`app/engine/hert/index.ts`** (88 lines)
   - Main API exports
   - `createHERT()` helper
   - Convenience functions

### Test File

7. **`test-hert.ts`** (319 lines)
   - Comprehensive test suite
   - 8 test scenarios
   - All tests passing ✅

---

## Usage Examples

### Example 1: Create and Encode HERT

```typescript
import { createHERT, encodeHERT, encodeHERTReadable } from './app/engine/hert';

// Create HERT reference
const hert = createHERT({
  eid: 4102,                      // Entity "Faith"
  sp: [2, 1, 0],                  // Sense: theological virtue → narrative → variant
  documentPath: '/library/faith-chapter1.docx',
  contentHash: hashContent(docText),
  paragraph: 14,
  tokenStart: 823,
  tokenLength: 4,
  confidence: 0.95
});

// Encode to compact form
const compact = encodeHERT(hert);
// "HERTv1:4dMPvxLbX1BRfhgNSFt1xit5ZE"
// Only 33 characters!

// Encode to readable form (for debugging)
const readable = encodeHERTReadable(hert);
// "4102.S2.1.0 @ d:3h40SS @ p:14 @ t:823+4"
```

### Example 2: Decode HERT

```typescript
import { decodeHERT } from './app/engine/hert';

const encoded = "HERTv1:4dMPvxLbX1BRfhgNSFt1xit5ZE";

const hert = decodeHERT(encoded);
// {
//   eid: 4102,
//   sp: [2, 1, 0],
//   did: 7437148257873954859n,
//   lp: { paragraph: 14, tokenStart: 823, tokenLength: 4 },
//   flags: { ... }
// }

// Access entity info
console.log(`Entity ID: ${hert.eid}`);
console.log(`Sense: ${hert.sp?.join('.')}`);
console.log(`Location: para ${hert.lp.paragraph}, token ${hert.lp.tokenStart}`);
```

### Example 3: Document Fingerprinting

```typescript
import { generateDID, hashContent } from './app/engine/hert';

const did = generateDID(
  '/library/book1/chapter1.txt',
  hashContent(documentContent),
  version = 1
);

// did: 449896744391737748n (stable across runs)

// Different versions get different DIDs
const did_v2 = generateDID(samePath, sameContent, version = 2);
// did_v2: 13873418965911942237n (different!)
```

### Example 4: Alias Normalization

```typescript
import { normalizeForAliasing } from './app/engine/hert';

const surfaces = [
  'Faith',
  'FAITH',
  '  Faith  ',
  'Fáith',      // With diacritic
  'Faith!'
];

const normalized = surfaces.map(normalizeForAliasing);
// All → "faith"

// Use for alias matching
const surfaceToEid = new Map();
for (const surface of surfaces) {
  const norm = normalizeForAliasing(surface);
  surfaceToEid.set(norm, 4102);  // Map to EID
}
```

### Example 5: Sense Disambiguation

```typescript
// Same entity, different senses
const faithSenses = [
  {
    sp: [1],        // Personal trust in God
    hert: createHERT({ eid: 4102, sp: [1], ... })
  },
  {
    sp: [2],        // Theological virtue
    hert: createHERT({ eid: 4102, sp: [2], ... })
  },
  {
    sp: [2, 1],     // Theological virtue, narrative usage
    hert: createHERT({ eid: 4102, sp: [2, 1], ... })
  },
  {
    sp: [3],        // Religious denomination
    hert: createHERT({ eid: 4102, sp: [3], ... })
  }
];

// Each gets unique HERT but same root EID
// 4102.S1, 4102.S2, 4102.S2.1, 4102.S3
```

---

## Performance

### Size Comparison (Test Results)

| Format | Size (chars) | Ratio |
|--------|--------------|-------|
| **HERT Compact (Base62)** | **37** | **1.0x** |
| HERT Readable | 48 | 1.3x |
| **JSON** | **274** | **7.4x** |

**Result:** HERT is 7.4x smaller than JSON!

### Encoding Speed

- **Encode:** ~0.01ms (varint packing + base62)
- **Decode:** ~0.01ms (base62 + varint unpacking)
- **Round-trip:** <0.1ms

### Storage Efficiency

Example HERT with full hierarchy:
- Binary: ~25-35 bytes (varint-compressed)
- Base62: ~33-40 characters
- JSON: ~250-300 characters

**Savings:** 85-90% reduction vs JSON!

---

## Data Model

### Entity Registry

```typescript
interface Entity {
  eid: EID;                   // 32-bit stable ID
  canonical: string;          // "Faith"
  types: string[];            // ["VIRTUE", "CONCEPT"]
  senseRegistry: SenseEntry[]; // Hierarchical senses
  status: 'active' | 'merged' | 'split';
  mergedInto?: EID;
  splitInto?: EID[];
}

interface SenseEntry {
  index: number;              // SP component value
  label: string;              // "Theological virtue"
  description: string;        // Detailed explanation
  examples: string[];         // Usage examples
  parent?: number;            // Parent sense (hierarchical)
}
```

### Alias Registry

```typescript
interface Alias {
  aid: AID;                   // 24-bit alias ID
  eid: EID;                   // Maps to entity
  sp?: SP;                    // Associated sense (optional)
  surface: string;            // "YHWH"
  lang: string;               // "en"
  script?: string;            // "Latn"
  normalized: string;         // "yhwh"
  confidence: number;         // 0-1
  contexts: string[];         // Example usages
}
```

### Document Registry

```typescript
interface Document {
  did: DID;                   // 64-bit fingerprint
  canonicalUri: string;       // "/library/book1.txt"
  title: string;
  contentHash: string;        // SHA256
  version: number;
  metadata?: Record<string, unknown>;
}
```

### Reference Storage (Sparse)

```typescript
interface Reference {
  eid: EID;
  did: DID;
  lp: LP;
  lpHash: number;             // 20-bit for fast lookup
  sp?: SP;
  flags: HERTFlags;
  hert: string;               // Encoded HERT
  createdAt: number;
}

// Indexes:
// - (eid) - all refs for entity
// - (did) - all refs in document
// - (eid, did) - refs for entity in specific doc
// - (lpHash) - fast location-based lookup
```

---

## Key Features

### ✅ Stable Entity IDs

```typescript
// Entity 4102 is always "Faith", across all documents
const hert1 = createHERT({ eid: 4102, documentPath: '/doc1.txt', ... });
const hert2 = createHERT({ eid: 4102, documentPath: '/doc2.txt', ... });

// Both refs point to same canonical entity
assert(hert1.eid === hert2.eid); // true
```

### ✅ Sense Disambiguation

```typescript
// Same surface form, different senses
const trust = createHERT({ eid: 4102, sp: [1], ... });    // Personal trust
const virtue = createHERT({ eid: 4102, sp: [2], ... });   // Theological virtue

// Different entities, same surface form
const faithVirtue = createHERT({ eid: 4102, sp: [2], ... });
const faithCharacter = createHERT({ eid: 8903, ... });     // Different EID entirely
```

### ✅ Precise Locations

```typescript
const hert = createHERT({
  eid: 4102,
  section: 1,
  chapter: 3,
  paragraph: 14,
  tokenStart: 823,
  tokenLength: 4
});

// Location path preserves exact position
// Can highlight/scroll to exact occurrence
```

### ✅ Compact & Portable

```typescript
// HERT can be embedded anywhere:
const comment = `See Faith (HERTv1:4dMPvxLbX1BRfhgNSFt1xit5ZE) for context`;
const url = `https://app.com/entity?ref=HERTv1:4dMPvxLbX1BRfhgNSFt1xit5ZE`;
const annotation = { text: "...", entity: "HERTv1:4dMPvxLbX1BRfhgNSFt1xit5ZE" };

// Decode anywhere without database access!
```

### ✅ Hierarchical Senses

```typescript
// Build sense taxonomy
const senses = {
  '1': 'Personal trust',
  '2': 'Theological virtue',
  '2.1': 'Theological virtue, narrative usage',
  '2.1.0': 'Narrative usage, variant 0',
  '2.1.1': 'Narrative usage, variant 1',
  '3': 'Religious denomination'
};

// Navigate hierarchy
const baseSense = '2';
const subSense = '2.1';
const variant = '2.1.0';
```

---

## Next Steps (Pending Implementation)

### 1. Entity Registry

```typescript
class EntityRegistry {
  createEntity(canonical: string, types: string[]): EID;
  getEntity(eid: EID): Entity | null;
  addSense(eid: EID, sense: SenseEntry): void;
  mergeEntities(from: EID, to: EID): void;
  splitEntity(eid: EID, rules: SplitRules): EID[];
}
```

### 2. Alias Resolution

```typescript
class AliasResolver {
  registerAlias(surface: string, eid: EID, sp?: SP): AID;
  resolve(surface: string, context: string): Array<{ eid: EID, sp?: SP, score: number }>;
  disambiguate(candidates: Array<{eid, sp}>, context: string): { eid: EID, sp?: SP };
}
```

### 3. Reference Storage

```typescript
class ReferenceStore {
  recordRef(hert: HERT): void;
  findByEntity(eid: EID): Reference[];
  findByDocument(did: DID): Reference[];
  findByLocation(did: DID, lpHash: number): Reference[];
  exportBundle(did: DID, range?: LocationRange): ReferenceBundle;
  importBundle(bundle: ReferenceBundle): void;
}
```

### 4. Integration with ARES

```typescript
// In extraction pipeline, generate HERTs for all entities
const result = await extractFromSegments(docId, text);

for (const entity of result.entities) {
  for (const span of result.spans.filter(s => s.entity_id === entity.id)) {
    const hert = createHERT({
      eid: await getOrCreateEID(entity.canonical),
      sp: await resolveSensePath(entity, span.context),
      documentPath: docId,
      contentHash: hashContent(text),
      paragraph: getParagraph(span.start),
      tokenStart: span.start,
      tokenLength: span.end - span.start
    });

    await storeReference(hert);
  }
}
```

---

## Benefits Summary

| Feature | Benefit | Impact |
|---------|---------|--------|
| **Stable EIDs** | Same entity across docs | Cross-doc tracking |
| **Sense paths** | Disambiguate meanings | High precision |
| **Compact encoding** | 7.4x smaller than JSON | Storage/bandwidth savings |
| **Precise locations** | Exact token positions | Highlighting, scrolling |
| **Portable** | Share without DB | URLs, exports, annotations |
| **Hierarchical** | Taxonomic organization | Semantic navigation |
| **Alias mapping** | Multiple surfaces → 1 EID | Normalization |

---

## Test Results

```
✅ All 8 tests passing!

Test 1: Basic HERT Creation and Encoding
Test 2: Encode to Text Form (Base62)
Test 3: Decode and Verify Round-Trip
Test 4: Different Location Path Variants
Test 5: Sense Path Disambiguation
Test 6: Document Fingerprinting (DID Generation)
Test 7: Alias Normalization
Test 8: Compact Size Comparison

Key metrics:
- Round-trip encoding/decoding: ✅ Perfect
- Size reduction: 7.4x vs JSON
- Encoding speed: <0.1ms
- All flags preserved correctly
- Hierarchical LP working (section/chapter/para)
```

---

## Conclusion

### ✅ Core System Complete

- **Types & structures** defined
- **Varint encoding** implemented
- **Base62 encoding** implemented
- **Binary codec** working
- **Text forms** (compact + readable) working
- **Document fingerprinting** stable
- **Alias normalization** functional
- **All tests passing**

### 🎯 Key Achievements

- **7.4x compression** vs JSON
- **Stable cross-document references**
- **Hierarchical sense disambiguation**
- **Precise token-level locations**
- **Fast encoding/decoding** (<0.1ms)
- **Clean, extensible API**

### 📦 Ready for

- ✅ Entity registry integration
- ✅ Alias resolution workflow
- ✅ Reference storage/indexing
- ✅ ARES extraction pipeline integration

---

**Implementation Time:** ~2 hours
**Files Created:** 7 (6 source + 1 test)
**Lines of Code:** ~1,020
**Token Budget Used:** 115k / 200k (58%)
**Status:** ✅ **Core System Complete**
**Philosophy:** Stable, compact, hierarchical references inspired by Strong's Concordance numbering system.

---

**Next:** Build entity registry, alias resolution, and reference storage to complete the HERT ecosystem!
