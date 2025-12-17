# ARES Architecture

This document describes the extraction pipeline, entity lifecycle, and key design decisions.

## Design Principles

1. **Deterministic**: No randomness. Same input → same output.
2. **Local-first**: No cloud dependencies for core extraction.
3. **Provenance-tracked**: Every extracted fact has source evidence.
4. **Rule-based**: Transparent patterns over black-box ML.

## Extraction Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTRACTION PIPELINE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [1] DOCUMENT PARSE STAGE                                                    │
│      └── segmentDocument() → chunks (400-600 words)                          │
│      └── splitIntoSentences() → sentence boundaries                          │
│                                                                              │
│  [2] PARSER STAGE                                                            │
│      └── spaCy HttpParserClient (production)                                 │
│      └── MockParserClient (test fallback)                                    │
│      └── Output: tokens[], NER labels, POS tags, dependency parse            │
│                                                                              │
│  [3] ENTITY EXTRACTION STAGE                                                 │
│      └── extractEntities() - 3-stage process:                                │
│          ├── Stage 1: NER spans from parser                                  │
│          ├── Stage 2: Dependency-based extraction                            │
│          └── Stage 3: Capitalization patterns (fallback)                     │
│      └── Entity Quality Filter (precision defense)                           │
│      └── Output: Entity[] with spans                                         │
│                                                                              │
│  [4] ENTITY PROFILING STAGE                                                  │
│      └── buildProfiles() → mention counts, descriptors                       │
│      └── Used for salience scoring in coreference                            │
│                                                                              │
│  [5] COREFERENCE STAGE                                                       │
│      └── resolveCoref() → pronoun resolution                                 │
│      └── Recency-weighted, gender/number matching                            │
│      └── Guards against org/place pronoun resolution                         │
│                                                                              │
│  [6] RELATION EXTRACTION STAGE                                               │
│      └── extractRelations() → dependency patterns                            │
│      └── extractAllNarrativeRelations() → narrative patterns                 │
│      └── Output: Relation[] with evidence                                    │
│                                                                              │
│  [7] RELATION FILTERING STAGE                                                │
│      └── Sibling detection (prevents false parent_of)                        │
│      └── Appositive filtering                                                │
│      └── Confidence threshold (0.65)                                         │
│                                                                              │
│  [8] INVERSE GENERATION STAGE                                                │
│      └── parent_of ↔ child_of                                                │
│      └── sibling_of ↔ sibling_of (symmetric)                                 │
│      └── married_to ↔ married_to (symmetric)                                 │
│                                                                              │
│  [9] DEDUPLICATION STAGE                                                     │
│      └── Remove duplicate relations                                          │
│      └── Merge identical subject-predicate-object                            │
│                                                                              │
│  [10] ALIAS RESOLUTION STAGE                                                 │
│       └── Merge entity variants                                              │
│       └── Cross-document identity matching                                   │
│                                                                              │
│  [OUTPUT] ExtractionGraph                                                    │
│           ├── entities: Entity[]                                             │
│           ├── relations: Relation[]                                          │
│           └── spans: EntitySpan[]                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Entity Lifecycle

```
Raw Text
    │
    ▼
[NER Label + Token Span]           ← Parser output (PERSON/ORG/GPE/DATE)
    │
    ▼
[EntityCluster]                    ← Grouped mentions with confidence
    │                                 {canonical, aliases, spans, mentions}
    ▼
[Entity Quality Filter]            ← Remove low-quality extractions
    │                                 - Common nouns (friend, hell, well)
    │                                 - Fragments (Mont, Linola)
    │                                 - Low confidence (<0.5)
    ▼
[Entity Profiling]                 ← Build profiles for coreference
    │                                 - Mention counts
    │                                 - Descriptors
    │                                 - Gender markers
    ▼
[Coreference Resolution]           ← Link pronouns to antecedents
    │                                 - Recency bias
    │                                 - Gender/number agreement
    │                                 - Type guards (no he→school)
    ▼
[Alias Resolution]                 ← Merge name variants
    │                                 - "John Smith" ↔ "Smith" ↔ "John"
    │                                 - Title variants: "Dr. Smith"
    ▼
[Cross-Doc Merge]                  ← Unify across documents
    │                                 - Exact canonical match
    │                                 - Alias overlap
    │                                 - Type compatibility
    ▼
[Final Entity]                     ← Output with HERT ID
    {
      id: uuid,
      type: PERSON,
      canonical: "John Smith",
      aliases: ["Smith", "Dr. Smith"],
      confidence: 0.95,
      created_at: timestamp
    }
```

## Key Modules

### Parser Layer (`app/parser/`)

| File | Purpose |
|------|---------|
| `ParserClient.ts` | Interface definition |
| `HttpParserClient.ts` | Production spaCy client (port 8000) |
| `MockParserClient.ts` | Test fallback with basic NER |
| `EmbeddedParserClient.ts` | In-process parser (experimental) |
| `createClient.ts` | Factory with auto-detection |

**Parser Selection Logic**:
```
PARSER_BACKEND=mock  → MockParserClient
PARSER_BACKEND=http  → HttpParserClient (fallback to mock)
PARSER_BACKEND=auto  → Try HTTP → Embedded → Mock
```

### Entity Extraction (`app/engine/extract/entities.ts`)

**3-Stage Extraction**:
1. **NER Spans**: Group consecutive tokens with same NER label
2. **Dependency-Based**: Subject/object extraction from parse tree
3. **Capitalization Fallback**: 1-3 capitalized tokens heuristic

**Type Classification**:
```typescript
// Classification priority
if (hasOrgKeyword(phrase))    → ORG
if (hasPlaceKeyword(phrase))  → PLACE/GPE
if (isCapitalized && 1-3 tokens) → PERSON (default)
```

**Quality Filters**:
- Common noun blocklist (friend, enemy, hell, hall, well, etc.)
- Fragment detection (single tokens that only appear in longer phrases)
- Sentence-initial suppression (capitalized due to position, not proper noun)
- Confidence threshold (0.5 minimum)

### Relation Extraction (`app/engine/extract/relations.ts`)

**Dependency Patterns**:
```typescript
// Pattern structure
{
  subj: 'nsubj',      // Subject dependency
  obj: 'dobj|pobj',   // Object dependency
  pred: 'married_to', // Relation predicate
  tokens: ['married', 'wed']  // Trigger verbs
}
```

**Narrative Patterns** (`app/engine/narrative-relations.ts`):
- Possessive family: "John's son" → parent_of
- Explicit statements: "A married B" → married_to
- Location patterns: "A lived in B" → lives_in

### Coreference (`app/engine/coref.ts`)

**Resolution Strategy**:
1. Find pronouns (he, she, they, etc.)
2. Search backwards for matching antecedent
3. Score candidates by:
   - Recency (closer = higher)
   - Gender agreement
   - Number agreement
   - Syntactic position

**Type Guards**:
- Personal pronouns (he/she) never resolve to ORG/PLACE
- Check entity name for org indicators (school, university, etc.)
- Check entity name for place indicators (city, valley, etc.)

### Merge Logic (`app/engine/merge.ts`)

**Cross-Document Merging**:
```typescript
// Merge criteria (confidence threshold: 0.93)
if (canonicalMatch)        → confidence 0.95
if (aliasOverlap)          → confidence based on overlap
if (substringMatch)        → confidence 0.85
if (jaccardSimilarity > 0.7) → weighted confidence
```

**Type Compatibility**:
- PERSON ≠ ORG (never merge)
- PLACE ≈ GPE (can merge)
- Same type always compatible

## HERT System (`app/engine/hert/`)

Hierarchical Entity Reference Tags provide stable, compact entity identifiers.

**Format**: `HERTv1:{base64_encoded_data}`

**Encoded Data**:
- Entity ID (stable across renames)
- Alias ID (surface form)
- Document fingerprint
- Paragraph index
- Token range

**Benefits**:
- Stable: ID doesn't change when entity name changes
- Compact: 20-30 chars vs 200+ for JSON
- Precise: Exact location in source
- Portable: Share via URL

## Known Limitations

### MockParserClient

When spaCy parser isn't available, MockParserClient provides basic NER:
- Capitalized words → PERSON (default)
- ORG keywords → ORG
- Place keywords → GPE
- No dependency parse accuracy
- No coreference support

**Impact**: Tests using MockParserClient have lower extraction quality.

### Entity Type Defaults

Classification defaults to PERSON for unknown capitalized phrases. This causes false positives like:
- "Hell" (from "Hell Hall") → PERSON ❌
- "Mont" (from "Mont Linola Junior High") → PERSON ❌

**Mitigation**: Common noun blocklist, fragment detection, quality filters.

### School Name Fragmentation

Multi-word organization names can fragment:
- "Mont Linola Junior High" → ORG ✓
- "Mont" → PERSON ❌
- "Linola" → PERSON ❌

**Mitigation**: Attached-only fragment detection, org keyword priority.

## Performance Characteristics

- **Processing Speed**: ~190 words/second (with spaCy)
- **Chunking**: 400-600 word segments for long documents
- **Memory**: O(n) where n = document length
- **Deterministic**: Same input always produces same output

## Extension Points

### Adding Relation Patterns

```typescript
// In extract/relations.ts
{
  subj: 'nsubj',
  obj: 'pobj',
  pred: 'founded',
  tokens: ['founded', 'established', 'created']
}
```

### Adding Entity Type Guards

```typescript
// In linguistics/entity-heuristics.ts
const COMMON_NOUN_BLOCKLIST = new Set([
  'friend', 'enemy', 'hell', 'hall', 'well', // ...
]);
```

### Custom Parser Client

```typescript
// Implement ParserClient interface
class CustomParserClient implements ParserClient {
  async parse(input: ParseInput): Promise<ParseOutput> {
    // Your implementation
  }
}
```
