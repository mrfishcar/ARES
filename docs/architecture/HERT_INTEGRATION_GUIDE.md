# HERT Integration Guide - Existing ARES Infrastructure

**How HERT fits into your current system with minimal changes**

---

## Current ARES Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ CURRENT ARES STACK                                              │
└─────────────────────────────────────────────────────────────────┘

1. Entity Extraction
   └─> app/engine/extract/orchestrator.ts
       - extractFromSegments()
       - Returns: entities, spans, relations, profiles

2. Entity Schema
   └─> app/engine/schema.ts
       - Entity: { id, type, canonical, aliases, ... }
       - Relation: { subj, obj, predicate, ... }

3. Entity Profiling
   └─> app/engine/entity-profiler.ts
       - buildProfiles()
       - Tracks: descriptors, roles, mention_count, confidence

4. Storage Layer
   └─> app/storage/storage.ts
       - saveGraph() / loadGraph()
       - Stores: entities, relations, profiles

5. Coreference Resolution
   └─> app/engine/coref.ts
       - resolveCoref()
       - Links pronouns to entities

6. Advanced Learning
   └─> Pattern bootstrapping, active learning
```

---

## HERT Integration Points

```
┌─────────────────────────────────────────────────────────────────┐
│ HERT INTEGRATION (3 Layers)                                     │
└─────────────────────────────────────────────────────────────────┘

LAYER 1: Entity Identity (EID)
├─> Add EID to Entity schema
├─> Generate EID from canonical name (or assign sequentially)
└─> Use EID for cross-document identity

LAYER 2: Reference Tracking (HERT)
├─> Generate HERT for each entity occurrence
├─> Store in separate refs table (sparse)
└─> Index by (eid), (did), (eid, did)

LAYER 3: Alias Resolution (AID)
├─> Map surface forms → EID
├─> Normalize and disambiguate
└─> Store alias → EID mappings
```

---

## Integration Strategy: Phased Approach

### Phase 1: Add EID (Minimal Changes) ⭐ START HERE

**Goal:** Add stable entity IDs without breaking existing code.

**Changes:**

1. **Extend Entity Schema** (app/engine/schema.ts)

```typescript
// BEFORE
export interface Entity {
  id: string;                    // UUID (per-document)
  type: EntityType;
  canonical: string;
  aliases: string[];
  // ...
}

// AFTER (backward compatible)
export interface Entity {
  id: string;                    // UUID (per-document) - keep for backward compat
  eid?: number;                  // NEW: Stable cross-document ID
  sp?: number[];                 // NEW: Sense path (optional)
  type: EntityType;
  canonical: string;
  aliases: string[];
  // ...
}
```

2. **Add EID Registry** (new file: app/engine/eid-registry.ts)

```typescript
/**
 * Simple EID registry - maps canonical names to EIDs
 */

import * as fs from 'fs';

interface EIDMapping {
  eid: number;
  canonical: string;
  created_at: string;
}

class EIDRegistry {
  private mappings: Map<string, number>;
  private nextEID: number;
  private filePath: string;

  constructor(filePath: string = './data/eid-registry.json') {
    this.filePath = filePath;
    this.mappings = new Map();
    this.nextEID = 1;
    this.load();
  }

  /**
   * Get or create EID for canonical name
   */
  getOrCreate(canonical: string): number {
    const normalized = canonical.toLowerCase().trim();

    if (this.mappings.has(normalized)) {
      return this.mappings.get(normalized)!;
    }

    const eid = this.nextEID++;
    this.mappings.set(normalized, eid);
    this.save();

    return eid;
  }

  /**
   * Get EID (returns null if not found)
   */
  get(canonical: string): number | null {
    const normalized = canonical.toLowerCase().trim();
    return this.mappings.get(normalized) || null;
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) return;

    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      this.mappings = new Map(Object.entries(data.mappings));
      this.nextEID = data.nextEID || 1;
    } catch (err) {
      console.warn('[EID-REGISTRY] Failed to load:', err);
    }
  }

  private save(): void {
    const data = {
      mappings: Object.fromEntries(this.mappings),
      nextEID: this.nextEID
    };

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }
}

// Singleton instance
export const eidRegistry = new EIDRegistry();
```

3. **Update Orchestrator** (app/engine/extract/orchestrator.ts)

```typescript
import { eidRegistry } from '../eid-registry';

export async function extractFromSegments(
  docId: string,
  fullText: string,
  existingProfiles?: Map<string, EntityProfile>,
  llmConfig: LLMConfig = DEFAULT_LLM_CONFIG,
  patternLibrary?: PatternLibrary,
  assignEIDs: boolean = true  // NEW: Enable EID assignment
): Promise<{...}> {

  // ... existing extraction logic ...

  // NEW: Assign EIDs to entities (after extraction, before return)
  if (assignEIDs) {
    for (const entity of allEntities) {
      entity.eid = eidRegistry.getOrCreate(entity.canonical);
      // sp can be added later via sense disambiguation
    }
  }

  return {
    entities: filteredEntities,
    spans: filteredSpans,
    relations: filteredRelations,
    fictionEntities,
    profiles
  };
}
```

**That's it for Phase 1!** Now every entity gets a stable EID.

**Usage:**
```typescript
const result = await extractFromSegments('doc1', text);

result.entities.forEach(e => {
  console.log(`${e.canonical} → EID=${e.eid}`);
  // "Gandalf" → EID=1
  // "Frodo" → EID=2
  // "Ring" → EID=3
});

// Extract from another document
const result2 = await extractFromSegments('doc2', text2);
// "Gandalf" → EID=1 (same!)
// "Frodo" → EID=2 (same!)
```

---

### Phase 2: Generate HERTs (Reference Tracking)

**Goal:** Create HERT for each entity occurrence, store separately.

**Changes:**

1. **Add HERT Generation** (app/engine/extract/orchestrator.ts)

```typescript
import { createHERT, generateDID, hashContent } from '../hert';

export async function extractFromSegments(
  docId: string,
  fullText: string,
  existingProfiles?: Map<string, EntityProfile>,
  llmConfig: LLMConfig = DEFAULT_LLM_CONFIG,
  patternLibrary?: PatternLibrary,
  assignEIDs: boolean = true,
  generateHERTs: boolean = false  // NEW: Enable HERT generation
): Promise<{
  entities: Entity[];
  spans: Array<{ entity_id: string; start: number; end: number }>;
  relations: Relation[];
  fictionEntities: FictionEntity[];
  profiles: Map<string, EntityProfile>;
  herts?: string[];  // NEW: Compact HERT strings
}> {

  // ... existing extraction logic ...

  // NEW: Generate HERTs for all entity occurrences
  const herts: string[] = [];

  if (generateHERTs && assignEIDs) {
    const contentHash = hashContent(fullText);
    const did = generateDID(docId, contentHash, 1);

    for (const span of allSpans) {
      const entity = allEntities.find(e => e.id === span.entity_id);
      if (!entity || !entity.eid) continue;

      // Find paragraph number (simple heuristic: count newlines)
      const textBefore = fullText.substring(0, span.start);
      const paragraph = (textBefore.match(/\n\n/g) || []).length;

      const hert = createHERT({
        eid: entity.eid,
        sp: entity.sp,  // Will be undefined initially
        documentPath: docId,
        contentHash,
        paragraph,
        tokenStart: span.start,
        tokenLength: span.end - span.start,
        confidence: entity.attrs?.pattern_confidence as number || 1.0
      });

      const encoded = encodeHERT(hert);
      herts.push(encoded);
    }
  }

  return {
    entities: filteredEntities,
    spans: filteredSpans,
    relations: filteredRelations,
    fictionEntities,
    profiles,
    herts: generateHERTs ? herts : undefined
  };
}
```

2. **Add Reference Storage** (new file: app/storage/hert-store.ts)

```typescript
import * as fs from 'fs';
import { decodeHERT } from '../engine/hert';

interface ReferenceIndex {
  byEID: Map<number, string[]>;      // EID → HERTs
  byDID: Map<bigint, string[]>;      // DID → HERTs
  all: string[];                     // All HERTs
}

export class HERTStore {
  private index: ReferenceIndex;
  private filePath: string;

  constructor(filePath: string = './data/herts.json') {
    this.filePath = filePath;
    this.index = { byEID: new Map(), byDID: new Map(), all: [] };
    this.load();
  }

  /**
   * Store HERTs from extraction result
   */
  addHERTs(herts: string[]): void {
    for (const hert of herts) {
      this.index.all.push(hert);

      // Decode to index by EID and DID
      const decoded = decodeHERT(hert);

      // Index by EID
      if (!this.index.byEID.has(decoded.eid)) {
        this.index.byEID.set(decoded.eid, []);
      }
      this.index.byEID.get(decoded.eid)!.push(hert);

      // Index by DID
      if (!this.index.byDID.has(decoded.did)) {
        this.index.byDID.set(decoded.did, []);
      }
      this.index.byDID.get(decoded.did)!.push(hert);
    }

    this.save();
  }

  /**
   * Get all references for an entity
   */
  getByEntity(eid: number): string[] {
    return this.index.byEID.get(eid) || [];
  }

  /**
   * Get all references in a document
   */
  getByDocument(did: bigint): string[] {
    return this.index.byDID.get(did) || [];
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) return;

    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));

      // Rebuild indexes from stored HERTs
      this.index.all = data.all || [];
      this.index.byEID = new Map();
      this.index.byDID = new Map();

      for (const hert of this.index.all) {
        const decoded = decodeHERT(hert);

        if (!this.index.byEID.has(decoded.eid)) {
          this.index.byEID.set(decoded.eid, []);
        }
        this.index.byEID.get(decoded.eid)!.push(hert);

        if (!this.index.byDID.has(decoded.did)) {
          this.index.byDID.set(decoded.did, []);
        }
        this.index.byDID.get(decoded.did)!.push(hert);
      }
    } catch (err) {
      console.warn('[HERT-STORE] Failed to load:', err);
    }
  }

  private save(): void {
    const data = {
      all: this.index.all,
      version: 1,
      count: this.index.all.length,
      lastUpdated: new Date().toISOString()
    };

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }
}

// Singleton
export const hertStore = new HERTStore();
```

**Usage:**
```typescript
import { hertStore } from './app/storage/hert-store';

// Extract with HERTs enabled
const result = await extractFromSegments('doc1', text, undefined, {}, undefined, true, true);

// Store HERTs
if (result.herts) {
  hertStore.addHERTs(result.herts);
}

// Later: Find all occurrences of entity 42
const refs = hertStore.getByEntity(42);
// ["HERTv1:...", "HERTv1:...", ...]

// Decode to get locations
refs.forEach(ref => {
  const hert = decodeHERT(ref);
  console.log(`Found in doc ${hert.did} at para ${hert.lp.paragraph}, token ${hert.lp.tokenStart}`);
});
```

---

### Phase 3: Alias Resolution (Optional but Powerful)

**Goal:** Map multiple surface forms to single EID.

**Implementation:**

1. **Create Alias Registry** (app/engine/alias-registry.ts)

```typescript
import { normalizeForAliasing } from './hert';

interface AliasMapping {
  surface: string;
  normalized: string;
  eid: number;
  sp?: number[];
  confidence: number;
  contexts: string[];
}

export class AliasRegistry {
  private aliases: Map<string, AliasMapping[]>;  // normalized → mappings

  registerAlias(surface: string, eid: number, sp?: number[], confidence: number = 1.0): void {
    const normalized = normalizeForAliasing(surface);

    if (!this.aliases.has(normalized)) {
      this.aliases.set(normalized, []);
    }

    this.aliases.get(normalized)!.push({
      surface,
      normalized,
      eid,
      sp,
      confidence,
      contexts: []
    });
  }

  resolve(surface: string): Array<{ eid: number; sp?: number[]; confidence: number }> {
    const normalized = normalizeForAliasing(surface);
    const mappings = this.aliases.get(normalized) || [];

    return mappings
      .map(m => ({ eid: m.eid, sp: m.sp, confidence: m.confidence }))
      .sort((a, b) => b.confidence - a.confidence);
  }
}
```

2. **Auto-populate from Entity Profiles**

```typescript
import { aliasRegistry } from './alias-registry';
import { eidRegistry } from './eid-registry';

// After building profiles
for (const [profileId, profile] of profiles.entries()) {
  const eid = eidRegistry.getOrCreate(profile.canonical);

  // Register canonical form
  aliasRegistry.registerAlias(profile.canonical, eid, undefined, 1.0);

  // Register descriptors as aliases
  for (const descriptor of profile.descriptors) {
    aliasRegistry.registerAlias(descriptor, eid, undefined, 0.8);
  }

  // Register other aliases
  // (Could extract from entity.aliases if populated)
}
```

**Usage:**
```typescript
// Resolve "YHWH" to entity
const candidates = aliasRegistry.resolve("YHWH");
// [{ eid: 123, confidence: 1.0 }, ...]

// Resolve "the wizard"
const wizardCandidates = aliasRegistry.resolve("the wizard");
// [{ eid: 456, confidence: 0.8 }, ...]
```

---

## Minimal Integration Example (Just Phase 1)

**Goal:** Add EIDs with ZERO breaking changes.

```typescript
// 1. Create EID registry file (one-time)
// app/engine/eid-registry.ts (copy from above)

// 2. Update orchestrator (one line)
import { eidRegistry } from '../eid-registry';

// In extractFromSegments(), before return:
for (const entity of allEntities) {
  entity.eid = eidRegistry.getOrCreate(entity.canonical);
}

// 3. Done! All entities now have stable EIDs
```

**Backward Compatibility:**
- ✅ Existing code continues to work (eid is optional)
- ✅ UUID-based entity.id still present
- ✅ No storage schema changes required
- ✅ Can enable/disable with flag

---

## Storage Schema Updates (Optional)

### Current Storage (app/storage/storage.ts)

```typescript
interface SerializedGraph {
  entities: Entity[];
  relations: Relation[];
  conflicts: Conflict[];
  provenance: Record<string, Provenance>;
  profiles: Record<string, SerializedProfile>;
  metadata: GraphMetadata;
}
```

### Enhanced Storage (with HERTs)

```typescript
interface SerializedGraph {
  entities: Entity[];           // Now includes eid, sp
  relations: Relation[];
  conflicts: Conflict[];
  provenance: Record<string, Provenance>;
  profiles: Record<string, SerializedProfile>;
  metadata: GraphMetadata;

  // NEW: Optional HERT data
  herts?: {
    refs: string[];             // All HERTs (compact)
    eidIndex: Record<number, number[]>;  // EID → ref indices
    didIndex: Record<string, number[]>;  // DID → ref indices
  };
}
```

**Migration:** Existing graphs load without herts field (backward compatible).

---

## Integration Patterns

### Pattern 1: Single-Document Extraction (Current Workflow)

```typescript
// Before (current)
const result = await extractFromSegments('doc1', text);
console.log(result.entities);  // [{ id: "uuid-123", canonical: "Gandalf", ... }]

// After (with EIDs, backward compatible)
const result = await extractFromSegments('doc1', text, undefined, {}, undefined, true);
console.log(result.entities);  // [{ id: "uuid-123", eid: 1, canonical: "Gandalf", ... }]
```

### Pattern 2: Multi-Document Tracking

```typescript
// Extract from multiple documents
const doc1Result = await extractFromSegments('doc1', text1, undefined, {}, undefined, true);
const doc2Result = await extractFromSegments('doc2', text2, undefined, {}, undefined, true);

// Same entity, same EID!
const gandalfDoc1 = doc1Result.entities.find(e => e.canonical === 'Gandalf');
const gandalfDoc2 = doc2Result.entities.find(e => e.canonical === 'Gandalf');

console.log(gandalfDoc1.eid === gandalfDoc2.eid);  // true!

// Find all mentions across documents
const allGandalfRefs = hertStore.getByEntity(gandalfDoc1.eid);
// Returns HERTs from both documents
```

### Pattern 3: Reference Bundles (Export/Import)

```typescript
import { ReferenceBundle } from './app/engine/hert/types';

// Export all refs from a document
const bundle: ReferenceBundle = {
  did: generateDID('doc1', hashContent(text), 1),
  baseLp: { paragraph: 0 },
  entries: [
    { eid: 1, deltaTokenStart: 0, tokenLength: 7, flags: {...} },
    { eid: 2, deltaTokenStart: 10, tokenLength: 5, flags: {...} },
    // ... delta-encoded for compactness
  ]
};

// Share bundle (JSON, file, API)
fs.writeFileSync('doc1-refs.json', JSON.stringify(bundle));

// Import on another system
const imported = JSON.parse(fs.readFileSync('doc1-refs.json'));
// HERTs are portable, no DB needed!
```

---

## Benefits of This Integration

### 1. **Cross-Document Entity Identity**
```typescript
// Before: Different UUIDs per document
doc1: { id: "uuid-abc", canonical: "Faith" }
doc2: { id: "uuid-xyz", canonical: "Faith" }  // Different entity!

// After: Same EID across documents
doc1: { id: "uuid-abc", eid: 4102, canonical: "Faith" }
doc2: { id: "uuid-xyz", eid: 4102, canonical: "Faith" }  // Same entity!
```

### 2. **Sense Disambiguation**
```typescript
// "Faith" appears in different contexts
const personalTrust = { eid: 4102, sp: [1], canonical: "Faith" };
const theologicalVirtue = { eid: 4102, sp: [2], canonical: "Faith" };

// Same root entity, different senses
```

### 3. **Compact References**
```typescript
// Share entity occurrence via URL
const url = `https://myapp.com/entity?ref=HERTv1:4dMPvxLbX1BRfhgNSFt1xit5ZE`;

// Decode anywhere without DB
const hert = decodeHERT(urlParams.ref);
// Knows: entity 4102, sense [2,1,0], location in specific document
```

### 4. **Alias Normalization**
```typescript
// Multiple surfaces → one entity
aliasRegistry.registerAlias("YHWH", 123);
aliasRegistry.registerAlias("Yahweh", 123);
aliasRegistry.registerAlias("LORD", 123);

// All resolve to EID=123
```

---

## Migration Path

### Step 1: Enable EIDs (No Breaking Changes)
- Add eid-registry.ts
- Update orchestrator to assign EIDs
- Test: Existing code works, entities now have eid field

### Step 2: Generate HERTs (Optional)
- Add hert-store.ts
- Enable generateHERTs flag
- Store HERTs separately (doesn't affect existing storage)

### Step 3: Use HERTs (Gradually)
- Query HERTs for cross-document tracking
- Add HERT links to UI/exports
- Build alias resolution on top

---

## Summary

### Integration Checklist

- ✅ **Phase 1 (EIDs):** 3 files, ~150 lines, ZERO breaking changes
- ✅ **Phase 2 (HERTs):** 2 files, ~200 lines, optional feature
- ✅ **Phase 3 (Aliases):** 1 file, ~100 lines, optional enhancement

### Key Points

1. **Backward Compatible:** All optional fields, existing code works unchanged
2. **Incremental:** Can adopt phase-by-phase
3. **Minimal Code:** ~450 lines total for full integration
4. **High Value:** Cross-document tracking, sense disambiguation, compact refs
5. **Local Storage:** Simple JSON files, no database required

### Next Steps

1. **Start with Phase 1:** Add EIDs to entities (15 minutes)
2. **Test:** Extract from multiple docs, verify same EIDs
3. **Optionally add Phase 2:** HERT generation and storage
4. **Build UI features:** Cross-doc navigation, alias resolution, etc.

---

**The beauty of this design:** HERT enhances ARES without disrupting it. You get stable entity identity and powerful cross-document tracking with minimal integration effort!
