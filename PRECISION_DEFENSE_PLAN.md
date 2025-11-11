# ARES Precision Defense System - Battle Plan

**Goal**: Fix precision degradation (90% → 78% → 61%)

**Strategy**: 3-layer defense system to eliminate false positives

**Status**: Planning phase - ready for implementation

---

## Problem Statement

**Current Situation**:
- Stage 1 (Simple sentences): 90% precision ✅
- Stage 2 (Multi-sentence): 78% precision ⚠️ (-12%)
- Stage 3 (Complex paragraphs): 61% precision ❌ (-29%)

**Root Cause**: False positive explosion
- 140 patterns (37 static + 103 dynamic)
- No pattern quality scoring
- Weak precision guardrails
- No relation deduplication
- All confidence scores = 0.85 (meaningless)

**Mathematical Reality**:
```
Precision = True Positives / (True Positives + False Positives)

More patterns → More matches → More FALSE positives
No filtering → Precision collapses
```

---

## The 3-Layer Defense System

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 1: Entity Quality Pre-Filter                    │
│  ├─ Filter low-quality entities                        │
│  ├─ Validate entity types                              │
│  └─ Require minimum entity confidence                  │
│      → Prevents garbage in                             │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 2: Extraction Guardrails (During)               │
│  ├─ Pattern quality scoring                            │
│  ├─ Token distance limits                              │
│  ├─ Strict type guards                                 │
│  ├─ Context validation                                 │
│  └─ Dynamic confidence scoring                         │
│      → Only creates high-quality relations             │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 3: Post-Extraction Validation                   │
│  ├─ Relation deduplication                             │
│  ├─ Confidence threshold filtering                     │
│  ├─ Semantic validation                                │
│  └─ Evidence quality scoring                           │
│      → Cleans up what gets through                     │
└─────────────────────────────────────────────────────────┘
```

---

## LAYER 1: Entity Quality Pre-Filter

### Problem
Bad entities create cascading false positives:
- "Maybe" extracted as PERSON
- "It" extracted as ORG
- "The situation" extracted as EVENT

### Solution: Filter entities BEFORE extraction

#### Implementation: Entity Quality Filter

**File**: `app/engine/entity-quality-filter.ts`

```typescript
interface EntityQualityConfig {
  minConfidence: number;
  minNameLength: number;
  blockedTokens: Set<string>;
  requireCapitalization: boolean;
}

const DEFAULT_CONFIG: EntityQualityConfig = {
  minConfidence: 0.65,        // Reject entities with confidence < 65%
  minNameLength: 2,            // Reject single-letter entities
  blockedTokens: new Set([
    // Pronouns
    'he', 'she', 'it', 'they', 'we', 'i', 'you',
    // Demonstratives
    'this', 'that', 'these', 'those',
    // Determiners
    'the', 'a', 'an',
    // Vague terms
    'something', 'someone', 'thing', 'person', 'situation'
  ]),
  requireCapitalization: true  // PERSON/ORG/PLACE must start with capital
};

export function filterLowQualityEntities(
  entities: Entity[],
  config: EntityQualityConfig = DEFAULT_CONFIG
): Entity[] {
  return entities.filter(entity => {
    // 1. Confidence check
    if (entity.confidence < config.minConfidence) {
      return false;
    }

    // 2. Name length check
    if (entity.canonical.length < config.minNameLength) {
      return false;
    }

    // 3. Blocked tokens check
    const lowerName = entity.canonical.toLowerCase();
    if (config.blockedTokens.has(lowerName)) {
      return false;
    }

    // 4. Capitalization check for proper nouns
    if (config.requireCapitalization &&
        ['PERSON', 'ORG', 'PLACE', 'HOUSE'].includes(entity.type)) {
      const firstChar = entity.canonical[0];
      if (firstChar !== firstChar.toUpperCase()) {
        return false;
      }
    }

    // 5. Type-specific validation
    if (entity.type === 'DATE') {
      // Dates should contain numbers or temporal keywords
      const hasNumbers = /\d/.test(entity.canonical);
      const hasTemporalKeywords = /\b(year|month|day|century|age|era)\b/i.test(entity.canonical);
      if (!hasNumbers && !hasTemporalKeywords) {
        return false;
      }
    }

    return true;
  });
}
```

**Integration Point**: `app/engine/extract/orchestrator.ts`

Before relation extraction:
```typescript
// After entity extraction
let entities = await extractEntities(text, ...);

// 🛡️ LAYER 1: Filter low-quality entities
entities = filterLowQualityEntities(entities);

// Continue with relation extraction
const relations = await extractRelations(text, entities, ...);
```

**Expected Impact**:
- Reduce garbage entities by 30-50%
- Prevent cascading false positives
- Minimal recall loss (only filtering junk)

---

## LAYER 2: Extraction Guardrails (During)

### Problem
All patterns treated equally, no quality distinction:
- Historical P=90% pattern = same weight as P=40% pattern
- All extractions get confidence 0.85
- No context validation

### Solution: Smart extraction with dynamic scoring

#### 2.1 Pattern Quality Scoring

**File**: `app/engine/pattern-quality-scorer.ts`

```typescript
interface PatternQualityMetrics {
  patternId: string;
  precision: number;        // Historical precision on validation set
  recall: number;           // Historical recall
  falsePositiveRate: number;
  sampleSize: number;       // How many times pattern has been tested
}

// Pattern quality database (learned from validation)
const PATTERN_QUALITY_DB: Map<string, PatternQualityMetrics> = new Map([
  // High-quality patterns
  ['married_to_1', { patternId: 'married_to_1', precision: 0.92, recall: 0.85, falsePositiveRate: 0.08, sampleSize: 100 }],
  ['child_of_appositive', { patternId: 'child_of_appositive', precision: 0.89, recall: 0.75, falsePositiveRate: 0.11, sampleSize: 80 }],

  // Medium-quality patterns
  ['lives_in_basic', { patternId: 'lives_in_basic', precision: 0.75, recall: 0.80, falsePositiveRate: 0.25, sampleSize: 60 }],

  // Low-quality patterns (risky)
  ['ownership_generic', { patternId: 'ownership_generic', precision: 0.45, recall: 0.90, falsePositiveRate: 0.55, sampleSize: 40 }],
]);

export function getPatternQuality(patternId: string): PatternQualityMetrics | null {
  return PATTERN_QUALITY_DB.get(patternId) || null;
}

export function computePatternConfidence(
  patternId: string,
  baseConfidence: number = 0.85
): number {
  const quality = getPatternQuality(patternId);

  if (!quality) {
    // Unknown pattern, use conservative estimate
    return baseConfidence * 0.70;
  }

  // Weight by precision and sample size
  const precisionWeight = quality.precision;
  const sampleWeight = Math.min(quality.sampleSize / 100, 1.0);

  return baseConfidence * precisionWeight * (0.8 + 0.2 * sampleWeight);
}

export function shouldUsePattern(patternId: string, minPrecision: number = 0.60): boolean {
  const quality = getPatternQuality(patternId);

  if (!quality) {
    // Unknown patterns: use conservatively
    return true;
  }

  // Filter out low-precision patterns
  if (quality.precision < minPrecision) {
    return false;
  }

  // Filter out patterns with high false positive rate
  if (quality.falsePositiveRate > 0.50) {
    return false;
  }

  return true;
}
```

**Integration**: Modify pattern matching to use quality scores:

```typescript
for (const pattern of allPatterns) {
  // 🛡️ LAYER 2.1: Check pattern quality
  if (!shouldUsePattern(pattern.id, 0.60)) {
    continue; // Skip low-quality patterns
  }

  pattern.regex.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.regex.exec(text)) !== null) {
    // ... extraction logic ...

    // 🛡️ LAYER 2.1: Dynamic confidence scoring
    const confidence = computePatternConfidence(pattern.id, 0.85);

    const relation: Relation = {
      id: uuid(),
      subj: subjEntity.id,
      pred: pattern.predicate,
      obj: objEntity.id,
      confidence, // Now dynamic!
      // ...
    };
  }
}
```

#### 2.2 Token Distance Guardrails

**Problem**: Extracting relations across entire paragraphs leads to false positives

**Solution**: Limit maximum token distance between subject and object

```typescript
interface DistanceGuardrails {
  maxTokenDistance: number;
  familyOverrides: Map<string, number>;
}

const DEFAULT_DISTANCE_GUARDRAILS: DistanceGuardrails = {
  maxTokenDistance: 50,  // Default: entities must be within 50 tokens
  familyOverrides: new Map([
    ['kinship', 30],      // Family relations: tighter constraint
    ['location', 100],    // Location: can be further apart
    ['temporal', 100],    // Temporal: can be further apart
    ['event', 80],        // Events: medium distance
  ])
};

export function computeTokenDistance(
  text: string,
  subjStart: number,
  objStart: number
): number {
  const slice = text.substring(
    Math.min(subjStart, objStart),
    Math.max(subjStart, objStart)
  );

  // Simple tokenization: split on whitespace and punctuation
  const tokens = slice.split(/\s+/).filter(t => t.length > 0);
  return tokens.length;
}

export function passesDistanceGuardrail(
  tokenDistance: number,
  relationFamily: string,
  config: DistanceGuardrails = DEFAULT_DISTANCE_GUARDRAILS
): boolean {
  const maxDistance = config.familyOverrides.get(relationFamily) ?? config.maxTokenDistance;
  return tokenDistance <= maxDistance;
}
```

**Integration**:
```typescript
// After extracting subject and object entities
const tokenDistance = computeTokenDistance(text, subjAbsoluteStart, objAbsoluteStart);

// 🛡️ LAYER 2.2: Distance check
if (!passesDistanceGuardrail(tokenDistance, pattern.family)) {
  continue; // Skip this extraction
}
```

#### 2.3 Strict Type Guards

**Problem**: Type guards are too permissive

**Solution**: Family-specific strict type validation

```typescript
interface StrictTypeGuard {
  family: string;
  predicate: string;
  requiredSubjTypes: EntityType[];
  requiredObjTypes: EntityType[];
  forbiddenPairs: [EntityType, EntityType][]; // Combinations that make no sense
}

const STRICT_TYPE_GUARDS: StrictTypeGuard[] = [
  {
    family: 'kinship',
    predicate: 'parent_of',
    requiredSubjTypes: ['PERSON'],
    requiredObjTypes: ['PERSON'],
    forbiddenPairs: []
  },
  {
    family: 'location',
    predicate: 'lives_in',
    requiredSubjTypes: ['PERSON', 'ORG'],
    requiredObjTypes: ['PLACE'],
    forbiddenPairs: [
      ['DATE', 'PLACE'],  // Date can't live in a place
      ['ITEM', 'PERSON'],  // Item can't live in a person
    ]
  },
  {
    family: 'ownership',
    predicate: 'owns',
    requiredSubjTypes: ['PERSON', 'ORG'],
    requiredObjTypes: ['ITEM', 'PLACE', 'ORG'],
    forbiddenPairs: [
      ['PERSON', 'PERSON'],  // People don't "own" people (that's kinship or power)
    ]
  },
];

export function passesStrictTypeGuard(
  subjType: EntityType,
  objType: EntityType,
  predicate: string
): boolean {
  const guard = STRICT_TYPE_GUARDS.find(g => g.predicate === predicate);

  if (!guard) {
    return true; // No strict guard defined, allow
  }

  // Check required types
  if (!guard.requiredSubjTypes.includes(subjType)) {
    return false;
  }

  if (!guard.requiredObjTypes.includes(objType)) {
    return false;
  }

  // Check forbidden pairs
  for (const [forbiddenSubj, forbiddenObj] of guard.forbiddenPairs) {
    if (subjType === forbiddenSubj && objType === forbiddenObj) {
      return false;
    }
  }

  return true;
}
```

#### 2.4 Context Validation

**Problem**: Patterns match without considering surrounding context

**Solution**: Check for negations, hedges, conditionals

```typescript
export function validateContext(
  text: string,
  matchStart: number,
  matchEnd: number
): { valid: boolean; reason?: string; confidencePenalty: number } {
  // Look at 100 chars before and after the match
  const contextStart = Math.max(0, matchStart - 100);
  const contextEnd = Math.min(text.length, matchEnd + 100);
  const context = text.substring(contextStart, contextEnd);

  // 1. Check for negations nearby
  const negationPatterns = [
    /\b(not|never|no|neither|nor|wasn't|weren't|isn't|aren't|didn't|doesn't)\b/i,
    /\b(refused|denied|rejected)\b/i,
  ];

  for (const pattern of negationPatterns) {
    if (pattern.test(context)) {
      return {
        valid: false,
        reason: 'Negation detected in context',
        confidencePenalty: 1.0 // Complete rejection
      };
    }
  }

  // 2. Check for hedges (uncertainty markers)
  const hedgePatterns = [
    /\b(maybe|perhaps|possibly|probably|allegedly|reportedly|supposedly)\b/i,
    /\b(might|could|may)\b/i,
  ];

  for (const pattern of hedgePatterns) {
    if (pattern.test(context)) {
      return {
        valid: true,
        reason: 'Hedge detected',
        confidencePenalty: 0.30 // 30% penalty
      };
    }
  }

  // 3. Check for conditionals (hypothetical statements)
  const conditionalPatterns = [
    /\b(if|unless|in case|provided that|assuming)\b/i,
    /\b(would|should)\b/i,
  ];

  for (const pattern of conditionalPatterns) {
    if (pattern.test(context)) {
      return {
        valid: true,
        reason: 'Conditional detected',
        confidencePenalty: 0.20 // 20% penalty
      };
    }
  }

  // 4. Check for quotations (reported speech is less reliable)
  const beforeMatch = text.substring(contextStart, matchStart);
  const afterMatch = text.substring(matchEnd, contextEnd);

  const openQuotes = (beforeMatch.match(/["'"]/g) || []).length;
  const closeQuotes = (afterMatch.match(/["'"]/g) || []).length;

  if (openQuotes % 2 === 1 || closeQuotes % 2 === 1) {
    // Likely inside quotation
    return {
      valid: true,
      reason: 'Inside quotation',
      confidencePenalty: 0.15 // 15% penalty
    };
  }

  return { valid: true, confidencePenalty: 0 };
}
```

**Integration**:
```typescript
// After pattern match
const contextValidation = validateContext(text, matchStart, matchEnd);

// 🛡️ LAYER 2.4: Context validation
if (!contextValidation.valid) {
  continue; // Reject this extraction
}

// Apply confidence penalty
let confidence = computePatternConfidence(pattern.id, 0.85);
confidence *= (1 - contextValidation.confidencePenalty);
```

---

## LAYER 3: Post-Extraction Validation

### Problem
Multiple patterns extract the same relation → inflated false positive count

### Solution: Deduplicate and validate after extraction

#### 3.1 Relation Deduplication

**Problem**: Same relation extracted by multiple patterns

Example:
```
Pattern 1: "Aragorn married Arwen" → married_to(Aragorn, Arwen) [confidence: 0.85]
Pattern 2: "Aragorn and Arwen married" → married_to(Aragorn, Arwen) [confidence: 0.80]
Pattern 3: "Aragorn wed Arwen" → married_to(Aragorn, Arwen) [confidence: 0.82]
```

Current: 3 relations (inflates FP count)
Desired: 1 relation with merged evidence

**Implementation**:

```typescript
interface RelationKey {
  subj: string;
  pred: string;
  obj: string;
}

function makeRelationKey(relation: Relation): string {
  // Canonical key for deduplication
  // For symmetric relations, always order entities alphabetically
  const isSymmetric = SYMMETRIC_PREDICATES.has(relation.pred);

  if (isSymmetric) {
    const [e1, e2] = [relation.subj, relation.obj].sort();
    return `${e1}::${relation.pred}::${e2}`;
  }

  return `${relation.subj}::${relation.pred}::${relation.obj}`;
}

export function deduplicateRelations(relations: Relation[]): Relation[] {
  const seen = new Map<string, Relation>();

  for (const relation of relations) {
    const key = makeRelationKey(relation);
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, relation);
      continue;
    }

    // Merge: keep higher confidence, combine evidence
    if (relation.confidence > existing.confidence) {
      // Replace with higher confidence version
      seen.set(key, {
        ...relation,
        evidence: [...existing.evidence, ...relation.evidence]
      });
    } else {
      // Keep existing, just add evidence
      existing.evidence.push(...relation.evidence);
    }
  }

  return Array.from(seen.values());
}
```

**Expected Impact**: Reduce relation count by 20-40% (especially in complex text where many patterns fire)

#### 3.2 Confidence Threshold Filtering

**Problem**: Low-confidence extractions pollute results

**Solution**: Filter by confidence after deduplication

```typescript
interface ConfidenceThresholdConfig {
  minConfidence: number;
  familyOverrides: Map<string, number>;
  adaptiveThreshold: boolean; // Adjust based on text complexity
}

const DEFAULT_CONFIDENCE_CONFIG: ConfidenceThresholdConfig = {
  minConfidence: 0.70,  // Default: reject confidence < 70%
  familyOverrides: new Map([
    ['kinship', 0.75],      // Higher bar for family relations
    ['ownership', 0.65],    // Lower bar for ownership (less critical)
    ['location', 0.60],     // Lower bar for location (fuzzy)
  ]),
  adaptiveThreshold: true
};

export function filterByConfidence(
  relations: Relation[],
  config: ConfidenceThresholdConfig = DEFAULT_CONFIDENCE_CONFIG
): Relation[] {
  return relations.filter(relation => {
    // Get threshold for this relation family
    const family = getRelationFamily(relation.pred);
    const threshold = config.familyOverrides.get(family) ?? config.minConfidence;

    return relation.confidence >= threshold;
  });
}
```

#### 3.3 Semantic Validation

**Problem**: Some extractions are syntactically valid but semantically nonsensical

**Solution**: Post-hoc semantic checks

```typescript
export function validateSemantics(relation: Relation, entities: Map<string, Entity>): boolean {
  const subjEntity = entities.get(relation.subj);
  const objEntity = entities.get(relation.obj);

  if (!subjEntity || !objEntity) return false;

  // 1. Self-relations are usually invalid
  if (relation.subj === relation.obj) {
    return false;
  }

  // 2. Check for temporal impossibilities
  if (relation.pred === 'parent_of') {
    // Parent can't be younger than child (if we have birth dates)
    // This requires temporal reasoning - placeholder for now
  }

  // 3. Check for entity name similarity (might be duplicate detection failure)
  const similarity = computeNameSimilarity(subjEntity.canonical, objEntity.canonical);
  if (similarity > 0.85) {
    // Very similar names, likely the same entity
    return false;
  }

  // 4. Check for reciprocal relation conflicts
  // Example: If parent_of(A, B), then child_of(B, A) is redundant
  // This requires global relation graph - placeholder

  return true;
}

function computeNameSimilarity(name1: string, name2: string): number {
  // Simple Jaccard similarity on words
  const words1 = new Set(name1.toLowerCase().split(/\s+/));
  const words2 = new Set(name2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}
```

---

## Implementation Plan

### Phase 1: Quick Wins (1-2 hours)
**Goal**: Implement highest-impact guardrails

1. **Entity Quality Filter** (Layer 1)
   - File: `app/engine/entity-quality-filter.ts`
   - Integration: `orchestrator.ts`
   - Expected impact: +5-10% precision

2. **Relation Deduplication** (Layer 3.1)
   - File: `app/engine/relation-deduplicator.ts`
   - Integration: `orchestrator.ts` (after all extraction)
   - Expected impact: +10-15% precision

3. **Confidence Threshold Filtering** (Layer 3.2)
   - Modify orchestrator to filter relations with confidence < 0.70
   - Expected impact: +5-8% precision

**Total Expected**: +20-33% precision improvement

**Target After Phase 1**:
- Stage 2: 78% → 90%+ ✅
- Stage 3: 61% → 75%+ ⚠️

### Phase 2: Medium Effort (2-3 hours)
**Goal**: Add dynamic confidence scoring

4. **Token Distance Guardrails** (Layer 2.2)
   - File: `app/engine/distance-guardrails.ts`
   - Integration: `narrative-relations.ts`
   - Expected impact: +5% precision

5. **Context Validation** (Layer 2.4)
   - File: `app/engine/context-validator.ts`
   - Integration: `narrative-relations.ts`
   - Expected impact: +5-10% precision

**Target After Phase 2**:
- Stage 2: 90%+ ✅
- Stage 3: 75% → 82%+ ✅

### Phase 3: Pattern Quality (3-4 hours)
**Goal**: Learn pattern quality from validation set

6. **Pattern Quality Database** (Layer 2.1)
   - Run ablation study on validation set
   - Measure per-pattern precision/recall
   - Build quality database
   - Expected impact: +5-10% precision

7. **Strict Type Guards** (Layer 2.3)
   - Expand type guard rules
   - Add forbidden pair logic
   - Expected impact: +3-5% precision

**Target After Phase 3**:
- Stage 2: 90%+ ✅
- Stage 3: 82% → 85%+ ✅

---

## Testing Strategy

### Validation Corpus
Create small gold-standard corpus for rapid iteration:
- 10 simple sentences (Stage 1 representative)
- 10 multi-sentence narratives (Stage 2 representative)
- 5 complex paragraphs (Stage 3 representative)

### Ablation Testing
Test each guardrail individually:
```bash
# Baseline (no guardrails)
npm test tests/ladder/level-2-multisentence.spec.ts

# With entity quality filter
ARES_ENTITY_FILTER=on npm test ...

# With deduplication
ARES_DEDUPLICATE=on npm test ...

# With all guardrails
ARES_PRECISION_MODE=strict npm test ...
```

### Measurement
Track these metrics after each phase:
- **Precision** (primary goal)
- **Recall** (watch for drops)
- **F1** (balance)
- **Relation count** (should decrease)
- **Unique relation count** (should stay stable)

---

## Success Criteria

**Phase 1 Success** (Quick Wins):
- ✅ Stage 2 reaches 85%+ precision
- ✅ Stage 3 reaches 70%+ precision
- ✅ Recall doesn't drop more than 5%

**Phase 2 Success** (Medium Effort):
- ✅ Stage 2 reaches 90%+ precision
- ✅ Stage 3 reaches 80%+ precision
- ✅ All stages pass their targets

**Phase 3 Success** (Pattern Quality):
- ✅ Stage 3 reaches 85%+ precision
- ✅ System ready for production
- ✅ Pattern quality database established

---

## Risk Mitigation

### Risk 1: Recall Drop
**Risk**: Aggressive filtering reduces true positives too

**Mitigation**:
- Monitor recall after each phase
- If recall drops >10%, ease guardrails
- Use validation corpus to tune thresholds

### Risk 2: Implementation Time
**Risk**: Takes longer than estimated

**Mitigation**:
- Implement Phase 1 first (highest ROI)
- If time-constrained, stop after Phase 1
- Phase 2 and 3 are bonuses

### Risk 3: Diminishing Returns
**Risk**: Later phases don't improve precision much

**Mitigation**:
- Measure after each phase
- Stop if improvement <3% per phase
- Focus on high-impact guardrails only

---

## Alternative Approaches (If This Fails)

### Plan B: Pattern Whitelist
If precision still low after all guardrails:
- Disable all dynamic patterns
- Only use hand-verified "safe" patterns
- Manually expand safe list over time

### Plan C: LLM Verification
If precision still insufficient:
- Use local LLM (Llama 3 8B) to verify each extraction
- "Does this sentence express parent_of(X, Y)?"
- High precision mode: Only keep LLM-verified
- Trade speed for accuracy

### Plan D: Ensemble Voting
If single-pass extraction too noisy:
- Run extraction with multiple parameter sets
- Only keep relations extracted by 2+ configurations
- Majority voting for high precision

---

## Next Steps

**Immediate**:
1. Create entity quality filter
2. Create relation deduplicator
3. Test on Stage 2
4. Measure improvement

**If Successful**:
5. Continue to Phase 2
6. Add distance and context guardrails
7. Test on Stage 3

**If Stuck**:
- Pivot to Plan B (whitelist)
- Or pivot to Plan C (LLM verification)

---

## Summary

**Current**: 90% → 78% → 61% (precision degradation)

**Problem**: False positive explosion from 140 patterns without quality control

**Solution**: 3-layer defense system
- Layer 1: Entity quality pre-filter
- Layer 2: Extraction guardrails (pattern quality, distance, types, context)
- Layer 3: Post-extraction validation (deduplication, confidence filtering)

**Expected Outcome After Phase 1**: 78% → 90%+ on Stage 2, 61% → 75%+ on Stage 3

**Time Estimate**: 1-2 hours for Phase 1 (quick wins)

**Risk**: Low - worst case we revert, best case we fix precision

**Let's do this** 🚀
