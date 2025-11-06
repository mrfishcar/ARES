# HERT Specification

**HERT** (Hierarchical Entity Reference Tag) is a compact, URL-safe encoding for entity references with precise document locations.

## Version

**Current Version:** HERTv1

## Overview

HERT solves the problem of stable, portable entity references across documents. A HERT encodes:

- **EID** - Stable 32-bit entity identifier
- **AID** - Alias/surface form identifier (optional)
- **SP** - Sense path for disambiguation (optional)
- **DID** - Document fingerprint
- **LP** - Location pointer (paragraph + tokens)
- **Flags** - Metadata flags (aliased, verified, encrypted, etc.)

### Example

```
HERTv1:1J8trXOyn4HRaWXrdh9TUE

Decodes to:
{
  eid: 43,
  aid: 230,
  sp: [1, 2],
  did: 0x42a1b3c4d5e6f7a8,
  lp: {
    paragraph: 0,
    tokenStart: 0,
    tokenLength: 14
  },
  flags: {
    aliasPresent: true,
    verified: false,
    encrypted: false
  }
}
```

## Design Goals

1. **Compact** - 20-30 characters (vs 200+ for JSON)
2. **URL-safe** - Can be embedded in URLs, QR codes
3. **Stable** - Entity ID doesn't change when name changes
4. **Precise** - Exact paragraph and token location
5. **Portable** - Self-contained, no database needed
6. **Efficient** - Binary encoding with varint compression

## Components

### EID (Entity ID)

- **Size**: 32-bit unsigned integer (0 to 4,294,967,295)
- **Purpose**: Stable, cross-document entity identifier
- **Encoding**: Varint (1-5 bytes)
- **Assignment**: Sequential or hash-based

**Properties:**
- Unique per entity across all documents
- Never reused (even if entity deleted)
- Persistent across renames/merges

**Example:**
```
"Gandalf" → EID 1
"Frodo" → EID 2
"Ring" → EID 3
```

### AID (Alias ID)

- **Size**: 24-bit unsigned integer (0 to 16,777,215)
- **Purpose**: Track which surface form was used
- **Encoding**: Varint (1-3 bytes)
- **Optional**: Only present if `aliasPresent` flag set

**Properties:**
- Maps surface forms to entities
- Multiple AIDs can map to same EID
- Enables surface form tracking

**Example:**
```
"Gandalf" → AID 21 → EID 1
"Gandalf the Grey" → AID 15 → EID 1
"Gandalf the White" → AID 25 → EID 1
"Mithrandir" → AID 27 → EID 1
```

### SP (Sense Path)

- **Size**: Array of 8-bit unsigned integers
- **Purpose**: Disambiguate homonyms (same name, different entities)
- **Encoding**: Count (varint) + values (varints)
- **Optional**: Empty array if no disambiguation needed

**Properties:**
- Hierarchical path for nested senses
- Enables fine-grained disambiguation
- Rare in practice (most entities unambiguous)

**Example:**
```
"Apple" (company) → EID 100, SP [1]
"Apple" (fruit) → EID 100, SP [2]
"Apple" (record label) → EID 100, SP [3]

"Faith" (personal trust) → EID 4102, SP [1]
"Faith" (theological virtue) → EID 4102, SP [2]
"Faith" (person's name) → EID 4103, SP []  // Different EID
```

### DID (Document ID)

- **Size**: 64-bit unsigned integer
- **Purpose**: Identify source document
- **Encoding**: 8 bytes (fixed)
- **Generation**: From document path + content hash + version

**Format:**
```
Bits:
[40: path fingerprint][16: content hash][8: version]

Example:
Path: "/projects/lotr/fellowship.txt"
Content: sha256(text) → 0x3a4b...
Version: 1

DID = fingerprint40(path) << 24 | hash16(content) << 8 | version
```

**Properties:**
- Same document = same DID (if unchanged)
- Content changes → new DID
- Enables content-addressed lookup

### LP (Location Pointer)

- **Size**: 3-4 varints
- **Purpose**: Precise location within document
- **Encoding**: Paragraph + token offsets (varints)

**Components:**
```typescript
interface LocationPointer {
  paragraph: number;     // 0-indexed paragraph number
  tokenStart: number;    // Token offset in paragraph
  tokenLength: number;   // Length in tokens
  confidence?: number;   // 0-255 (optional)
}
```

**Example:**
```
Text: "Aragorn, son of Arathorn, married Arwen."

"Aragorn" mention:
  paragraph: 0
  tokenStart: 0
  tokenLength: 1

"Arathorn" mention:
  paragraph: 0
  tokenStart: 3
  tokenLength: 1
```

### Flags

- **Size**: 1 byte (8 bits)
- **Purpose**: Metadata about the reference
- **Encoding**: Bitfield

**Flag Bits:**
```
Bit 0: aliasPresent   - AID field present
Bit 1: verified       - Entity verified by human
Bit 2: encrypted      - Contains encrypted data
Bit 3: hasConfidence  - Confidence score present
Bit 4-7: Reserved     - Future use
```

**Example:**
```typescript
flags = 0b00001001  // aliasPresent + hasConfidence
```

## Binary Format

### Layout

```
┌─────────────────────────────────────────────────────┐
│ HERTv1 Binary Format                                │
└─────────────────────────────────────────────────────┘

1. EID (varint, 1-5 bytes)
2. SP_COUNT (varint, 1 byte usually)
3. SP_VALUES (varint each, 0-N bytes)
4. DID (8 bytes, fixed)
5. FLAGS (1 byte)
6. [AID] (varint, 1-3 bytes) - if aliasPresent flag
7. [KEY_ROTATION] (varint) - if encrypted flag
8. LP_PARAGRAPH (varint, 1-3 bytes)
9. LP_TOKEN_START (varint, 1-3 bytes)
10. LP_TOKEN_LENGTH (varint, 1-2 bytes)
11. [LP_CONFIDENCE] (1 byte) - if hasConfidence flag
12. [META] (optional, variable)

Total: ~20-30 bytes typical
```

### Encoding

Uses **Base62** for URL-safe encoding:
- Character set: `0-9A-Za-z`
- No special characters
- Safe in URLs, filenames, QR codes

**Process:**
1. Pack fields into binary buffer
2. Encode buffer as Base62 string
3. Prepend version prefix: `HERTv1:`

**Decoding:**
1. Strip version prefix
2. Base62 decode to binary buffer
3. Unpack fields using varint decoding

### Compression

HERT uses **varint** (variable-length integer) encoding:

- Small numbers: 1 byte
- Medium numbers: 2-3 bytes
- Large numbers: 4-5 bytes

**Examples:**
```
0-127: 1 byte       (0x00-0x7F)
128-16383: 2 bytes  (0x80 0x80 - 0xFF 0x7F)
16384+: 3+ bytes
```

This makes typical HERTs very compact (20-25 chars).

## API

### Creation

```typescript
import { createHERT, encodeHERT } from './app/engine/hert';

const hert = createHERT({
  eid: 42,
  aid: 123,
  sp: [1, 2],
  documentPath: '/projects/lotr/fellowship.txt',
  contentHash: hashContent(text),
  paragraph: 5,
  tokenStart: 10,
  tokenLength: 2,
  confidence: 0.95
});

const encoded = encodeHERT(hert);
// "HERTv1:1J8trXOyn4HRaWXrdh9TUE"
```

### Decoding

```typescript
import { decodeHERT } from './app/engine/hert';

const hert = decodeHERT('HERTv1:1J8trXOyn4HRaWXrdh9TUE');

console.log(hert.eid);  // 42
console.log(hert.aid);  // 123
console.log(hert.sp);   // [1, 2]
console.log(hert.lp.paragraph);  // 5
console.log(hert.lp.tokenStart); // 10
```

### Validation

```typescript
import { validateHERT } from './app/engine/hert';

const isValid = validateHERT('HERTv1:1J8trXOyn4HRaWXrdh9TUE');
// true or false
```

## Use Cases

### 1. Cross-Document References

```typescript
// Extract from multiple documents
const doc1 = await extractFromSegments('doc1', text1);
const doc2 = await extractFromSegments('doc2', text2);

// Same entity gets same EID
const gandalfDoc1 = doc1.entities.find(e => e.canonical === 'Gandalf');
const gandalfDoc2 = doc2.entities.find(e => e.canonical === 'Gandalf');

gandalfDoc1.eid === gandalfDoc2.eid  // true!

// Find all mentions across documents
const allGandalfRefs = hertStore.getByEntity(gandalfDoc1.eid);
// Returns HERTs from both documents
```

### 2. URL Sharing

```typescript
// Share specific entity mention via URL
const url = `https://myapp.com/view?ref=${encodeHERT(hert)}`;

// On receiver side
const hert = decodeHERT(urlParams.ref);
// Jump directly to entity mention in document
```

### 3. Citation & Provenance

```typescript
// Every relation includes HERT references
const relation = {
  subj: entity1.id,
  pred: 'married_to',
  obj: entity2.id,
  evidence: [{
    doc_id: 'fellowship',
    span: { start: 1234, end: 1280, text: '...' },
    hert: 'HERTv1:...'  // Precise reference
  }]
};

// Decode HERT to verify evidence
const evidence = decodeHERT(relation.evidence[0].hert);
// Jump to exact location in source document
```

### 4. Alias Tracking

```typescript
// Track how entities are mentioned
const gandalfMentions = hertStore.getByEntity(1);

gandalfMentions.forEach(hertString => {
  const hert = decodeHERT(hertString);
  const alias = aliasRegistry.getByAID(hert.aid);
  console.log(`Mentioned as "${alias.surface}" at para ${hert.lp.paragraph}`);
});

// Output:
// Mentioned as "Gandalf" at para 0
// Mentioned as "Gandalf the Grey" at para 3
// Mentioned as "Mithrandir" at para 7
```

## Storage

### HERT Store

```typescript
// Store HERTs from extraction
hertStore.addHERTs(result.herts);

// Query by entity
const refs = hertStore.getByEntity(eid);

// Query by document
const refs = hertStore.getByDocument(did);

// Persistent JSON storage
{
  "all": ["HERTv1:...", "HERTv1:...", ...],
  "version": 1,
  "count": 1234,
  "lastUpdated": "2025-01-29T12:00:00Z"
}
```

### Reference Bundles

For efficient bulk storage/transfer:

```typescript
interface ReferenceBundle {
  did: bigint;                // Document ID
  baseLp: LocationPointer;    // Base location
  entries: RefEntry[];        // Delta-encoded entries
}

interface RefEntry {
  eid: number;
  aid?: number;
  sp?: number[];
  deltaTokenStart: number;    // Delta from previous
  tokenLength: number;
  flags: number;
}
```

**Benefits:**
- Delta encoding reduces size
- Bulk import/export
- Efficient network transfer

## Performance

### Size Comparison

```
JSON entity reference: ~200 bytes
{
  "entityId": "550e8400-e29b-41d4-a716-446655440000",
  "documentId": "doc-123",
  "location": {
    "paragraph": 5,
    "start": 123,
    "end": 145
  }
}

HERT reference: ~25 bytes
HERTv1:1J8trXOyn4HRaWXrdh9TUE

Compression: 8x smaller
```

### Speed

- **Encoding**: <1μs per HERT
- **Decoding**: <1μs per HERT
- **Lookup**: O(1) with proper indexing

### Scalability

- **EID space**: 4.3 billion entities
- **AID space**: 16.7 million aliases per entity
- **DID space**: 18 quintillion documents
- **LP space**: Unlimited paragraphs/tokens

## Version History

### HERTv1 (Current)

- Initial specification
- EID + DID + LP (core)
- AID (alias tracking)
- SP (sense disambiguation)
- Binary varint encoding
- Base62 URL-safe encoding

### Future (HERTv2)

Planned enhancements:
- Cryptographic signatures
- Timestamp encoding
- Relationship encoding (encode edges, not just nodes)
- Bloom filter for existence checks

## References

- Implementation: `app/engine/hert/`
- Integration: `app/engine/extract/orchestrator.ts`
- Storage: `app/storage/hert-store.ts`
- Tests: `tests/unit/hert.spec.ts`

---

**HERT enables stable, portable, precise entity references across your entire knowledge base.**
