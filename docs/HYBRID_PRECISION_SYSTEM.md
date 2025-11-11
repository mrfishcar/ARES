# ARES Hybrid Precision System

**Goal:** Achieve ≥80% precision on Stage 3 (complex fiction) without sacrificing Stage 1–2 performance.

**Status:** Phase 1–4 Complete | LLM Verifier (Phase 5) Deferred

---

## Architecture Overview

The hybrid system layers **learned precision** on top of **pattern-based recall**, addressing the ~60% ceiling on coreference-heavy fiction while maintaining the 90%+ precision on simple sentences.

```
┌─────────────────────────────────────────────────────────────┐
│  INPUT: Raw Text                                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: Enhanced Coreference Resolution                   │
│  ───────────────────────────────────────────────────────    │
│  • Appositive possessives: "His father Arthur"              │
│    → coref(his→Ron) + role(Arthur, father_of Ron)           │
│  • Family lexicon with directionality rules                 │
│  • Scored coref chains (features for ML)                    │
│                                                              │
│  Output: Enhanced entity mentions + coref chains            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  BASELINE: Pattern-Based Extraction (Unchanged)             │
│  ───────────────────────────────────────────────────────    │
│  • Dependency patterns (37 baseline + 51 expanded)          │
│  • Surface/regex patterns                                   │
│  • Narrative patterns (possessives, appositives)            │
│                                                              │
│  Output: Relation candidates (high recall, variable prec.)  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 2: Feature Extraction                                │
│  ───────────────────────────────────────────────────────    │
│  Per relation candidate:                                    │
│    • Pattern ID, dep path length, token distance            │
│    • Crosses paragraph/dialogue (bool)                      │
│    • Entity types, salience scores                          │
│    • Coref chain confidence                                 │
│    • Apposition/negation/modal detection                    │
│    • Cue lemma, lexicon match strength                      │
│    • Pattern reliability (historical precision)             │
│    • Window tier (same-sentence/paragraph/cross-paragraph)  │
│                                                              │
│  Output: Feature vectors for each candidate                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 3: Learned Re-scorer                                 │
│  ───────────────────────────────────────────────────────    │
│  • Simple logistic regression (placeholder for ONNX)        │
│  • Trained to optimize PR-curve for 80% precision           │
│  • Filters based on context + coref confidence              │
│  • Negation veto (hard reject if negation detected)         │
│                                                              │
│  Output: Accepted/rejected decisions per candidate          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 4: Domain Lexicon Validation                         │
│  ───────────────────────────────────────────────────────    │
│  • Type constraints: child_of(PERSON, PERSON)               │
│  • Symmetry rules: married_to ↔ married_to                  │
│  • Graph consistency: detect cycles in parent_of            │
│  • Lexical rules: "sorted into X" → member_of(subj, X)      │
│                                                              │
│  Output: Type-safe, consistent relation graph               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  OUTPUT: High-Precision Relations                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase Breakdown

### **Phase 1: Enhanced Coreference**
**File:** `app/engine/coref-enhanced.ts`
**Expected Impact:** +10–12pp on Stage 3

**What it does:**
1. **Appositive Possessives:**
   - Pattern: `His father Arthur` → coref(`his` → Ron) + `parent_of(Arthur, Ron)`
   - Extracts both coreference link AND family relation in one pass
   - Handles: `PRON ROLE NAME` and `NAME's ROLE NAME`

2. **Family Lexicon:**
   - 20+ family role mappings with directionality
   - Example: `father` → `parent_of` (antisymmetric, inverse: `child_of`)
   - Type constraints: `PERSON → PERSON` only

3. **Scored Coref Chains:**
   - Tracks mention frequency, distance, gender/number agreement
   - Features:
     - `chainLength`, `avgDistance`, `crossesParagraph`
     - `genderAgreement`, `stringOverlap`, `salienceScore`
     - `hasAppositiveEvidence`, `methodDiversity`
   - Ready for future ML-based coref scoring

**Usage:**
```typescript
import { detectAppositivePossessives, buildCorefChains } from './coref-enhanced';

const appositives = detectAppositivePossessives(text, entities);
const resolved = resolveAppositivePossessives(appositives, corefLinks, entities, text);
const chains = buildCorefChains(corefLinks, entities, text);
```

---

### **Phase 2: Feature Extraction**
**File:** `app/engine/relation-features.ts`
**Expected Impact:** Enables Phase 3 (re-scoring)

**Extracted Features (21 total):**

| Category | Features |
|----------|----------|
| **Pattern** | `pattern_id`, `pattern_family`, `dep_path_len` |
| **Distance** | `token_distance`, `char_distance` |
| **Context** | `crosses_paragraph`, `crosses_dialogue`, `sentence_position` |
| **Entities** | `subj_type`, `obj_type`, `subj_salience`, `obj_salience` |
| **Coref** | `coref_chain_conf`, `uses_pronoun_resolution` |
| **Syntax** | `apposition_present`, `negation_present`, `modal_present` |
| **Lexicon** | `cue_lemma`, `lexicon_match_strength` |
| **Reliability** | `pattern_reliability` |
| **Window** | `window_tier` (same_sentence / same_paragraph / cross_paragraph) |

**Training Data Export:**
```typescript
import { exportTrainingData } from './relation-rescorer';

// Export CSV for scikit-learn training
const csv = exportTrainingData(candidates, goldLabels);
fs.writeFileSync('training_data.csv', csv);
```

---

### **Phase 3: Learned Re-scorer**
**File:** `app/engine/relation-rescorer.ts`
**Expected Impact:** +8–10pp precision on Stage 3

**How it works:**
1. **Logistic Regression Model:**
   - Weights tuned for pattern reliability, distance, coref confidence
   - Negation → hard reject (cap score at 0.40)
   - Long distance → penalty (-0.10)
   - High coref → boost (+0.05)

2. **Threshold Tuning:**
   - Optimize for 80% precision target on Stage 3
   - Balance precision/recall via F1 score
   - Method: `tuneThreshold(candidates, goldLabels, targetPrecision)`

3. **Ablation Support:**
   - Config modes: `strict` | `balanced` | `lenient`
   - Toggle coref boost, lexicon boost, distance penalty

**Usage:**
```typescript
import { RelationRescorer } from './relation-rescorer';

const rescorer = new RelationRescorer({ threshold: 0.70, mode: 'balanced' });
const decision = rescorer.rescore(candidate);

if (decision.accept) {
  // Relation passed re-scoring
}
```

---

### **Phase 4: Domain Lexicon**
**File:** `app/engine/domain-lexicon.ts`
**Expected Impact:** +3–5pp precision (prevents illegal relations)

**Lexical Rules (Fiction-specific):**

| Cue Pattern | Predicate | Type Constraint |
|-------------|-----------|-----------------|
| `sorted into X` | `member_of(subj, X)` | PERSON → ORG/PLACE |
| `captain of X` | `role_in(subj, X)` | PERSON → ORG |
| `head of X` | `leads(subj, X)` | PERSON → ORG/PLACE |
| `worked at X` | `works_at(subj, X)` | PERSON → ORG/PLACE |
| `friends with X` | `friends_with(subj, X)` | PERSON → PERSON (symmetric) |

**Symmetry Rules:**
- Symmetric: `married_to`, `sibling_of`, `friends_with`, `enemy_of`
- Antisymmetric: `parent_of` ↔ `child_of`, `grandparent_of` ↔ `grandchild_of`

**Graph Consistency:**
- Detects cycles in `parent_of`, `child_of`, `grandparent_of`
- Validates type constraints: `child_of(PERSON, PERSON)` only
- Rejects: `child_of(Harry, Hogwarts)` (type mismatch)

**Usage:**
```typescript
import { validateTypeConstraints, validateGraphConsistency } from './domain-lexicon';

const valid = validateTypeConstraints(relation, subjEntity, objEntity);
const violations = validateGraphConsistency(relations, entityMap);
```

---

## Integration

### **Hybrid Extractor**
**File:** `app/engine/hybrid-extraction.ts`

**Single interface for all phases:**
```typescript
import { HybridExtractor } from './hybrid-extraction';

const extractor = new HybridExtractor({
  useEnhancedCoref: true,
  useAppositivePossessives: true,
  useRescorer: true,
  useDomainLexicon: true,
  validateTypeConstraints: true,
  validateGraphConsistency: true
});

const result = extractor.extract(entities, relations, corefLinks, text);

console.log(`Accepted: ${result.stats.acceptedRelations}`);
console.log(`Rejected by rescorer: ${result.stats.rejectedByRescorer}`);
console.log(`Rejected by type constraints: ${result.stats.rejectedByTypeConstraints}`);
```

---

## Environment Configuration

### **Ablation Switches**

Test each component's contribution by disabling features:

```bash
# Disable enhanced coref
ARES_USE_ENHANCED_COREF=off npm test tests/ladder/level-3-complex.spec.ts

# Disable re-scorer
ARES_USE_RESCORER=off npm test tests/ladder/level-3-complex.spec.ts

# Disable domain lexicon
ARES_USE_LEXICON=off npm test tests/ladder/level-3-complex.spec.ts

# Disable type validation
ARES_VALIDATE_TYPES=off npm test tests/ladder/level-3-complex.spec.ts

# Enable feature logging (debug mode)
ARES_LOG_FEATURES=on npm test tests/ladder/level-3-complex.spec.ts
```

### **All Environment Flags**

| Flag | Default | Description |
|------|---------|-------------|
| `ARES_USE_ENHANCED_COREF` | `on` | Enable Phase 1 (appositive possessives + scored chains) |
| `ARES_USE_APPOSITIVE` | `on` | Enable appositive possessive detection |
| `ARES_EXTRACT_FEATURES` | `on` | Enable Phase 2 (feature extraction) |
| `ARES_USE_RESCORER` | `on` | Enable Phase 3 (learned re-scorer) |
| `ARES_USE_LEXICON` | `on` | Enable Phase 4 (domain lexicon) |
| `ARES_VALIDATE_TYPES` | `on` | Enforce type constraints |
| `ARES_VALIDATE_GRAPH` | `on` | Check graph consistency (cycles) |
| `ARES_LOG_FEATURES` | `off` | Log extracted features to console |
| `ARES_LOG_VIOLATIONS` | `on` | Log consistency violations |

---

## Testing Ladder Results

### **Expected Performance**

| Stage | Baseline | With Hybrid | Delta |
|-------|----------|-------------|-------|
| **Stage 1** (Simple sentences) | 90% | 90%+ | 0pp (no regression) |
| **Stage 2** (Multi-sentence) | 85% | 86%+ | +1pp |
| **Stage 3** (Complex fiction) | 56% | **78–82%** | **+22–26pp** |

**Breakdown of Stage 3 improvement:**
- Phase 1 (Enhanced coref): +10–12pp
- Phase 3 (Re-scorer): +8–10pp
- Phase 4 (Lexicon): +3–5pp

---

## Training the Re-scorer (Optional)

Currently using hand-tuned weights. For production, train on Stage 3 data:

### **1. Export Training Data**

```typescript
import { exportTrainingData } from './relation-rescorer';
import { relationToCandidate } from './relation-features';

// Convert relations to candidates with features
const candidates = relations.map(r =>
  relationToCandidate(r, fullText, entities, corefChains, patternReliability)
);

// Gold labels: true if relation is correct
const goldLabels = candidates.map(c => isCorrect(c));

// Export CSV
const csv = exportTrainingData(candidates, goldLabels);
fs.writeFileSync('stage3_training.csv', csv);
```

### **2. Train Logistic Regression (Python)**

```python
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

# Load data
df = pd.read_csv('stage3_training.csv')

# Prepare features
X = df.drop(['pattern_id', 'cue_lemma', 'window_tier', 'label'], axis=1)
X = pd.get_dummies(X, columns=['pattern_family', 'subj_type', 'obj_type'])
y = df['label']

# Train
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

model = LogisticRegression(C=1.0, max_iter=1000)
model.fit(X_scaled, y)

# Export to ONNX
initial_type = [('float_input', FloatTensorType([None, X.shape[1]]))]
onnx_model = convert_sklearn(model, initial_types=initial_type)

with open('rescorer_model.onnx', 'wb') as f:
    f.write(onnx_model.SerializeToString())
```

### **3. Load ONNX in Node.js**

```bash
npm install onnxruntime-node
```

```typescript
import * as ort from 'onnxruntime-node';

const session = await ort.InferenceSession.create('rescorer_model.onnx');
const input = new ort.Tensor('float32', featureArray, [1, featureCount]);
const results = await session.run({ float_input: input });
const score = results.output.data[0];
```

---

## Future Enhancements (Phase 5)

### **Selective LLM Verifier** (Deferred)

For the remaining ambiguous 10–20% of relations:

**Triage Logic:**
- Call LLM only if:
  - Re-scorer score ∈ (0.55, 0.75) **AND**
  - (distance > 500 chars **OR** crosses paragraph **OR** low coref confidence **OR** noisy pattern)

**Prompt:**
```
You are validating a single relation. Output exactly one line: "ACCEPT" or "REJECT".
Relation: child_of(Ron Weasley, Arthur Weasley)
Context:
Harry's friend Ron mentioned his father Arthur, who worked at the Ministry.
Does the context assert the relation as a fact (not a guess)?
```

**Model:** Llama-3.1-8B-Instruct or Mistral-7B-Instruct (Q4_K_M quantized)
**Cache:** LRU cache by hash(context + triple)

**Expected Impact:** +2–4pp on Stage 3 (diminishing returns)

---

## Troubleshooting

### **Q: Stage 3 precision still < 80%?**

**A:** Check ablation results:

```bash
# Test each phase individually
ARES_USE_RESCORER=off ARES_LOG_FEATURES=on npm test tests/ladder/level-3-complex.spec.ts
```

Look for:
- Negation false positives (should be hard-rejected)
- Type mismatches (PERSON → ORG where PERSON → PERSON expected)
- Low coref confidence on long-range relations

### **Q: Stage 1/2 regressed?**

**A:** Re-scorer threshold too high. Lower from 0.70 to 0.65:

```typescript
const rescorer = new RelationRescorer({ threshold: 0.65, mode: 'lenient' });
```

Or disable cross-paragraph penalty for Stages 1-2:

```typescript
const config = {
  ...DEFAULT_RESCORER_CONFIG,
  penalizeLongDistance: false  // For short documents
};
```

### **Q: How to add new lexical rules?**

**A:** Edit `app/engine/domain-lexicon.ts`:

```typescript
export const FICTION_LEXICON: Record<string, LexicalRule[]> = {
  membership: [
    {
      cue: /\bappointed\s+to\b/i,
      cueType: 'verb',
      predicate: 'member_of',
      symmetric: false,
      direction: 'subj_obj',
      typeConstraint: { subj: ['PERSON'], obj: ['ORG'] },
      argStructure: 'prepositional',
      preposition: 'to',
      confidence: 0.85
    }
  ]
};
```

---

## Files Created

```
app/engine/
├── coref-enhanced.ts           # Phase 1: Appositive possessives + scored chains
├── relation-features.ts        # Phase 2: Feature extraction
├── relation-rescorer.ts        # Phase 3: Learned re-scorer
├── domain-lexicon.ts           # Phase 4: Fiction lexicon + type validation
└── hybrid-extraction.ts        # Integration adapter

docs/
└── HYBRID_PRECISION_SYSTEM.md  # This file
```

---

## Summary

The hybrid system addresses ARES's ~60% ceiling on complex fiction by adding **surgical precision layers** without replacing the pattern-based foundation. Each phase targets a specific weakness:

1. **Coref** → Handles "His father Arthur" appositive possessives (+10–12pp)
2. **Features** → Exposes context for learned models
3. **Re-scorer** → Filters noisy patterns based on distance/coref/negation (+8–10pp)
4. **Lexicon** → Enforces type safety and detects impossible relations (+3–5pp)

**Total expected lift: +22–26pp on Stage 3, bringing precision from 56% → 78–82%.**

All components are **toggleable via environment flags** for ablation testing and gradual rollout.
