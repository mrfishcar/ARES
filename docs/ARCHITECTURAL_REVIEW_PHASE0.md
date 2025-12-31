# ARES Architectural Review - Phase 0: WIRED vs UNWIRED Inventory

**Date**: 2025-12-30
**Branch**: `claude/ares-extraction-pipeline-hi3NT`
**Reviewer**: Claude Opus (Architect Mode)

---

## Summary

| Component | Status | Import Site | Notes |
|-----------|--------|-------------|-------|
| entity-type-validators.ts | ✅ WIRED | entity-quality-filter.ts:21 | Used in main extraction pipeline |
| override-manager.ts | ✅ WIRED | storage.ts:26 | Applied during graph persistence |
| LearningPage.tsx | ✅ WIRED | App.tsx:13, route `/learning` | UI accessible |
| Quote tracking (agent_score) | ✅ WIRED | adapter.ts:331 | Passed to adaptCharacters() |
| **learning-engine.ts** | ✅ WIRED | corrections.ts:22-25 | Called on corrections (**FIXED 2025-12-30**) |
| **pattern-applier.ts** | ✅ WIRED | orchestrator.ts:72 | Applied during extraction (**FIXED 2025-12-30**) |
| **token-analyzer.ts** | ✅ WIRED | adapter.ts:29-34 | Used in adaptBookNLPContract (**FIXED 2025-12-30**) |

---

## Detailed Analysis

### ✅ WIRED Components

#### 1. entity-type-validators.ts
**File**: `app/engine/entity-type-validators.ts`

**Import Site**:
```typescript
// app/engine/entity-quality-filter.ts:21
import {
  isPersonLikeName,
  isPlaceLikeName,
  // ...
} from './entity-type-validators';
```

**Proof of Use**: Called during entity validation in `filterLowQualityEntities()` which is invoked by orchestrator.

---

#### 2. override-manager.ts
**File**: `app/engine/override-manager.ts`

**Import Site**:
```typescript
// app/storage/storage.ts:26
import { applyOverrides } from '../engine/override-manager';
```

**Proof of Use**: Called in `saveKnowledgeGraph()` to apply user corrections before persistence.

---

#### 3. LearningPage.tsx
**File**: `app/ui/console/src/pages/LearningPage.tsx`

**Import Site**:
```typescript
// app/ui/console/src/App.tsx:13
import { LearningPage } from './pages/LearningPage';

// Route definition:
<Route path="/learning" element={<LearningPage project={project} toast={toast} />} />
```

**Proof of Use**: Accessible at http://localhost:5173/learning

---

#### 4. Quote Tracking (agent_score, quote_count, quote_ids)
**Files**: `app/engine/booknlp/types.ts`, `app/engine/booknlp/adapter.ts`

**Import Site**:
```typescript
// app/engine/booknlp/adapter.ts:331
const characterEntities = adaptCharacters(filteredCharacters, contract.quotes);
```

**Proof of Use**: When BookNLP mode is active and quotes exist, they're passed to `adaptCharacters()` which populates `quote_count` and `quote_ids` on entities.

---

### ✅ PREVIOUSLY UNWIRED - NOW WIRED (Fixed 2025-12-30)

#### 1. learning-engine.ts ✅
**File**: `app/engine/learning-engine.ts`

**Exports**:
- `extractPatternFromCorrection(correction: Correction): LearnedPattern | null`
- `mergePatterns(patterns: LearnedPattern[], newPattern: LearnedPattern): LearnedPattern[]`
- `updatePatternStats(patterns: LearnedPattern[], patternId: string, outcome: 'validated' | 'rejected'): LearnedPattern[]`
- `matchPatternsForEntity(entityName: string, entityType: string, patterns: LearnedPattern[]): PatternMatch[]`
- `class LearningEngine`
- `createLearningEngine(patterns?: LearnedPattern[]): LearningEngine`

**Import Sites**:
- `app/api/resolvers/corrections.ts:22-25` ✅ **PRODUCTION**
- `app/engine/pattern-applier.ts:15-16` ✅ **PRODUCTION**
- `tests/phase4-learning-system.spec.ts:25` (TEST)

**Status**: ✅ **WIRED** - `extractPatternFromCorrection()` and `mergePatterns()` now called in correction resolvers.

---

#### 2. pattern-applier.ts ✅
**File**: `app/engine/pattern-applier.ts`

**Exports**:
- `applyPatternsToEntity(entity: Entity, patterns: LearnedPattern[], config?: PatternApplierConfig): PatternApplicationResult`
- `applyPatternsToBatch(entities: Entity[], patterns: LearnedPattern[], config?: PatternApplierConfig): BatchApplicationResult`
- `class PatternApplier`
- `createPatternApplier(patterns: LearnedPattern[], config?: Partial<PatternApplierConfig>): PatternApplier`

**Import Sites**:
- `app/engine/extract/orchestrator.ts:72` ✅ **PRODUCTION**
- `tests/phase4-learning-system.spec.ts:32` (TEST)

**Status**: ✅ **WIRED** - `applyPatternsToBatch()` now called during extraction when `options.learnedPatterns` provided.

---

#### 3. token-analyzer.ts ✅
**File**: `app/engine/booknlp/token-analyzer.ts`

**Exports**:
- `extractParagraphs(tokens: BookNLPToken[]): Paragraph[]`
- `extractSentences(tokens: BookNLPToken[]): SentenceBoundary[]`
- `buildTokenIndex(tokens: BookNLPToken[]): TokenIndex`
- `findByLemma(index: TokenIndex, lemma: string): BookNLPToken[]`
- `findTokensInRange(index: TokenIndex, startChar: number, endChar: number): BookNLPToken[]`
- `analyzePOS(tokens: BookNLPToken[]): POSAnalysis`
- `getPOSQualitySignals(analysis: POSAnalysis): POSQualitySignals`
- `class TokenAnalyzer`
- `createTokenAnalyzer(contract: BookNLPContract): TokenAnalyzer`

**Import Sites**:
- `app/engine/booknlp/adapter.ts:29-34` ✅ **PRODUCTION**
- `app/engine/booknlp/index.ts:14` (RE-EXPORT)
- `tests/phase5-booknlp-integration.spec.ts:30` (TEST)

**Status**: ✅ **WIRED** - `createTokenAnalyzer()` now called in `adaptBookNLPContract()` to extract document structure and POS quality signals.

---

## Action Items

### ✅ COMPLETED (2025-12-30)

1. **Wire learning-engine into corrections flow** ✅
   - Location: `app/api/resolvers/corrections.ts`
   - Import added at line 22-25
   - `learnFromCorrection()` helper added at line 175-208
   - Called in `correctEntityType()`, `mergeEntities()`, `changeCanonicalName()` mutations
   - Patterns are now extracted and stored in `graph.learnedPatterns`

2. **Wire pattern-applier into extraction** ✅
   - Location: `app/engine/extract/orchestrator.ts`
   - Import added at line 70-72
   - `learnedPatterns` parameter added to `extractFromSegments()` options
   - Pattern application logic added at lines 912-932
   - Logs pattern applications with type corrections and confidence adjustments

3. **Wire token-analyzer into BookNLP processing** ✅
   - Location: `app/engine/booknlp/adapter.ts`
   - Import added at lines 27-34
   - `tokenAnalysis` field added to `BookNLPResult` type
   - Token analysis performed in `adaptBookNLPContract()` at lines 375-425
   - Extracts paragraphs, sentences, and POS quality signals

---

## Verification Commands

```bash
# Verify learning-engine imports
grep -r "from.*learning-engine" app/

# Verify pattern-applier imports
grep -r "from.*pattern-applier" app/

# Verify token-analyzer imports
grep -r "from.*token-analyzer" app/
```

---

## Phase 2: BookNLP Optionality ✅ VERIFIED

BookNLP is **already behind a feature flag** and is completely optional:

**Environment Variable**: `ARES_MODE`

| Value | Description |
|-------|-------------|
| (unset) | Legacy extraction (no BookNLP) - DEFAULT |
| `legacy` | Explicit legacy mode |
| `pipeline` | Grammar-first pipeline (no BookNLP) |
| `booknlp` | BookNLP-only extraction |
| `hybrid` | BookNLP + legacy extraction |

**Code Reference**: `app/engine/extract/orchestrator.ts:55-64`

```typescript
export function getExtractionMode(): ExtractionMode {
  const mode = process.env.ARES_MODE?.toLowerCase();

  if (mode === 'booknlp') return 'booknlp';
  if (mode === 'hybrid') return 'hybrid';

  if (isPipelineEnabled()) return 'pipeline';

  return 'legacy';  // DEFAULT - no BookNLP
}
```

---

## Phase 3: Learning Loop Verification ✅ COMPLETE

A deterministic test (`tests/learning-loop-e2e.spec.ts`) proves the complete learning loop:

1. **User Correction** → `createTypeCorrection('Kingdom of Gondor', 'PERSON', 'PLACE')`
2. **Pattern Extraction** → `extractPatternFromCorrection()` → `"kingdom of *" → PLACE`
3. **Pattern Storage** → `mergePatterns()` adds to graph
4. **Pattern Application** → `applyPatternsToBatch()` corrects new entities
5. **Verification** → Entities like `"Kingdom of Rohan"` automatically become PLACE

**Run the test**:
```bash
npm test tests/learning-loop-e2e.spec.ts
```

---

*Generated by architectural review process - 2025-12-30*
