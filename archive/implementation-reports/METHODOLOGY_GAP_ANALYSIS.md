# Entity Extraction Methodology Gap Analysis

## Current ARES Approach vs. Modern Methods (2024-2025)

### What We're Doing ✅

**Rule-Based Extraction:**
- spaCy NER (supervised, static model)
- Manual dependency patterns
- Manual narrative patterns
- Regex-based descriptors
- Recently added: Adaptive entity profiling

**Strengths:**
- ✅ Deterministic, transparent
- ✅ Fast (no LLM calls for entities)
- ✅ Works offline
- ✅ Zero token cost

**Weaknesses:**
- ❌ Manual pattern engineering (slow)
- ❌ Can't add new entity types dynamically
- ❌ Limited by spaCy training data
- ❌ Each pattern requires code changes
- ❌ No user feedback loop

---

## What Modern Systems Do 🔬

### 1. **Few-Shot / Zero-Shot NER with LLMs**

**What it is:**
Instead of training models, use LLM prompts with examples:

```
Prompt: "Extract person names from this text.
Examples:
- 'John Smith visited Paris' → John Smith
- 'Dr. Sarah Chen led the study' → Sarah Chen

Text: 'Gandalf the Grey traveled to Rivendell'
Output: Gandalf"
```

**Key Papers (2024):**
- **llmNER** (June 2024): Python library for zero/few-shot NER
- **Self-Improving NER** (NAACL 2024): Training-free framework
- **GL-NER**: Generation-aware LLM for few-shot NER

**Benefits:**
- ✅ Add new entity types instantly (no code changes)
- ✅ Works on domain-specific entities
- ✅ User can provide examples
- ✅ Handles fiction, fantasy, specialized domains

**Tradeoffs:**
- ❌ Requires LLM calls (token cost)
- ❌ Slower than spaCy
- ❌ Needs internet (unless local LLM)

---

### 2. **Weak Supervision / Bootstrapping**

**What it is:**
Start with small seed examples, automatically generate more:

```
Step 1: User provides 5 examples of "wizard":
- Gandalf, Saruman, Radagast, Dumbledore, McGonagall

Step 2: System finds patterns:
- "X the wizard"
- "wizard X"
- "X, a powerful wizard"

Step 3: Apply patterns to find more wizards:
- Merlin, Prospero, Circe (found automatically)

Step 4: User confirms/rejects → refine patterns
```

**Key Methods (2024):**
- **DIPRE** (Dual Iterative Pattern Relation Extraction)
- **Distant Supervision**: Use existing KGs to generate training data
- **Weak Supervision Frameworks**: Combine multiple noisy signals

**Benefits:**
- ✅ Reduces manual labeling (90% less work)
- ✅ Learns from small seed sets
- ✅ Iterative improvement
- ✅ User-guided but automated

**Tradeoffs:**
- ⚠️ Needs user feedback loop
- ⚠️ May generate noisy patterns

---

### 3. **Self-Improving with LLMs**

**What it is:**
LLM annotates corpus, uses self-consistency to filter quality:

```
Step 1: LLM extracts entities from unlabeled text
Step 2: Run 5x with different prompts
Step 3: Keep only entities that appear in 4/5 runs (high confidence)
Step 4: Use filtered entities to improve future extraction
```

**Key Paper:**
- **Self-Improving Zero-Shot NER** (NAACL 2024)
- Training-free, uses unlabeled data
- Self-consistency filtering for quality

**Benefits:**
- ✅ Improves automatically over time
- ✅ No manual annotation needed
- ✅ Leverages unlabeled corpus

**Tradeoffs:**
- ❌ High token cost (5x runs)
- ❌ Slower

---

### 4. **Active Learning**

**What it is:**
System asks user to label only the most uncertain examples:

```
System: "I found 100 potential entities.
I'm 95% confident on 80 of them.
Can you verify these 20 uncertain ones?"

User: Labels 20 (takes 2 minutes)
System: Uses labels to improve model
```

**Benefits:**
- ✅ Minimal user effort (label 20, not 100)
- ✅ Focuses on edge cases
- ✅ Continuous improvement

---

### 5. **Joint Entity-Relation Extraction**

**What it is:**
Extract entities and relations in one pass (not two):

```
Text: "Gandalf mentored Frodo in Rivendell"

Old way (pipeline):
1. Extract entities: Gandalf, Frodo, Rivendell
2. Extract relations: mentored_by(Frodo, Gandalf)

New way (joint):
1. Extract tuple: (Gandalf, mentored, Frodo, in, Rivendell)
```

**Benefits:**
- ✅ Reduces cascading errors
- ✅ Better context understanding
- ✅ More accurate

**Tradeoffs:**
- ⚠️ More complex model

---

## What We're Missing 🔴

### Critical Gaps

#### 1. **No Few-Shot Learning**
**Problem:** Can't add new entity types without code changes
**Impact:** Slow iteration, user frustration
**Modern solution:** LLM-based few-shot prompting

#### 2. **No Bootstrapping**
**Problem:** Manual pattern engineering is taxing
**Impact:** Developer bottleneck, can't scale
**Modern solution:** DIPRE-style pattern learning

#### 3. **No User Feedback Loop**
**Problem:** System doesn't learn from corrections
**Impact:** Repeats same mistakes
**Modern solution:** Active learning, weak supervision

#### 4. **Limited Entity Types**
**Problem:** spaCy only knows PERSON, ORG, PLACE, etc.
**Impact:** Misses domain-specific entities (SPELL, CREATURE, HOUSE)
**Modern solution:** Zero-shot prompting with entity definitions

#### 5. **No Self-Improvement**
**Problem:** Static extraction quality
**Impact:** Doesn't get better with more data
**Modern solution:** Self-annotating LLMs with consensus filtering

---

## Recommended Evolution Path 🚀

### Phase 1: LLM-Assisted Extraction (High Impact, Medium Effort)

**Add few-shot entity extraction:**
```typescript
// New module: app/engine/llm-extractor.ts
async function extractEntitiesWithLLM(
  text: string,
  entityTypes: Array<{type: string, examples: string[]}>
): Promise<Entity[]> {
  const prompt = buildFewShotPrompt(text, entityTypes);
  const result = await callLLM(prompt);
  return parseEntities(result);
}
```

**Usage:**
```typescript
// User defines new entity type on-the-fly
const entities = await extractEntitiesWithLLM(text, [
  { type: 'SPELL', examples: ['Expelliarmus', 'Patronus', 'Lumos'] },
  { type: 'HOUSE', examples: ['Gryffindor', 'Slytherin'] }
]);
```

**Benefits:**
- ✅ Add entity types instantly
- ✅ No code changes needed
- ✅ User-driven customization

**Tradeoffs:**
- ❌ Token cost per document
- ⚠️ Need LLM API key or local model

---

### Phase 2: Pattern Bootstrapping (High Impact, Medium Effort)

**Add DIPRE-style learning:**
```typescript
// New module: app/engine/bootstrap.ts
function bootstrapPatterns(
  seedEntities: Array<{type: string, examples: string[]}>,
  corpus: string[]
): Pattern[] {
  // 1. Find contexts around seed entities
  const contexts = findContexts(corpus, seedEntities);

  // 2. Generalize to patterns
  const patterns = generalizePatterns(contexts);

  // 3. Apply patterns to find more entities
  const newEntities = applyPatterns(corpus, patterns);

  // 4. Score by confidence
  return rankPatterns(patterns);
}
```

**User workflow:**
```typescript
// 1. User provides 5 wizard names
const seeds = {type: 'WIZARD', examples: ['Gandalf', 'Saruman', ...]};

// 2. System finds patterns
const patterns = bootstrapPatterns(seeds, corpus);
// → ["X the wizard", "wizard X", "X, a powerful wizard"]

// 3. System applies patterns
const newWizards = applyPatterns(corpus, patterns);
// → ['Radagast', 'Merlin', 'Prospero'] (found automatically!)

// 4. User confirms/rejects
confirmEntities(newWizards); // Updates patterns
```

**Benefits:**
- ✅ 10x faster than manual patterns
- ✅ Learns from corpus
- ✅ User-guided

---

### Phase 3: Active Learning Feedback (Medium Impact, Low Effort)

**Add uncertainty-based labeling:**
```typescript
// New module: app/engine/active-learning.ts
function getUncertainEntities(
  entities: Entity[]
): Array<{entity: Entity, confidence: number}> {
  return entities
    .filter(e => e.confidence < 0.7) // Low confidence
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, 20); // Top 20 most uncertain
}
```

**User workflow:**
```
System: "I extracted 100 entities.
        Here are 20 I'm uncertain about.
        Can you verify?"

User: [Confirms 15, rejects 5]

System: "Thanks! I'll use this to improve."
```

**Benefits:**
- ✅ Minimal user effort
- ✅ Focuses on hard cases
- ✅ Continuous improvement

---

### Phase 4: Self-Improving Pipeline (High Impact, High Effort)

**Add self-annotation with consensus:**
```typescript
async function selfImprove(corpus: string[]) {
  // 1. Extract with 5 different prompts
  const runs = await Promise.all([
    extractWithPrompt(corpus, prompt1),
    extractWithPrompt(corpus, prompt2),
    extractWithPrompt(corpus, prompt3),
    extractWithPrompt(corpus, prompt4),
    extractWithPrompt(corpus, prompt5)
  ]);

  // 2. Keep only entities that appear in 4/5 runs
  const consensus = findConsensus(runs, threshold=0.8);

  // 3. Add to training set
  addToTrainingSet(consensus);

  // 4. Use improved training set for future extraction
  return consensus;
}
```

**Benefits:**
- ✅ Fully automated improvement
- ✅ High quality (consensus filtering)
- ✅ Leverages unlabeled data

**Tradeoffs:**
- ❌ Very high token cost (5x runs)

---

## Architecture Redesign Proposal 🏗️

### Current: Static Pipeline
```
Text → spaCy NER → Manual Patterns → Relations → Storage
         ↓
    (fixed model)
```

### Proposed: Adaptive Pipeline
```
Text → Hybrid Extractor → Relations → Storage
         ↓              ↘            ↗
    spaCy (fast)    LLM (flexible)  Bootstrap
         ↓                ↓             ↓
    Static entities  New entity types  Learned patterns
                          ↓
                    User Feedback
                          ↓
                    Pattern Library
                          ↓
                    Self-Improvement
```

### Key Components

**1. Hybrid Extractor** (new)
- spaCy for standard entities (fast)
- LLM for novel entities (flexible)
- Bootstrapping for learned patterns
- Chooses best method per entity type

**2. Pattern Library** (new)
- Stores learned patterns
- Ranks by confidence
- User can review/edit
- Grows over time

**3. Feedback Loop** (new)
- Active learning for uncertain entities
- User corrections update patterns
- Self-consistency for quality

**4. Entity Type Registry** (new)
```typescript
// User-defined entity types
const entityRegistry = {
  SPELL: {
    examples: ['Expelliarmus', 'Patronus'],
    patterns: ['X charm', 'cast X'],
    method: 'llm' // or 'spacy', 'bootstrap'
  },
  HOUSE: {
    examples: ['Gryffindor', 'Slytherin'],
    patterns: ['House of X', 'X house'],
    method: 'bootstrap'
  }
};
```

---

## Token Cost Analysis 💰

### Current System
- **Entity extraction:** 0 tokens (spaCy)
- **Relation extraction:** ~1000 tokens/document (LLM)
- **Total:** ~$0.002/document

### With LLM Entity Extraction
- **Entity extraction:** ~500 tokens/document (LLM few-shot)
- **Relation extraction:** ~1000 tokens/document
- **Total:** ~$0.003/document (1.5x cost)

### With Self-Improvement
- **Initial extraction:** ~2500 tokens (5 runs)
- **After improvement:** ~500 tokens (cached patterns)
- **Amortized:** ~$0.003/document after 10 documents

### Cost Optimization Strategies

1. **Hybrid approach:**
   - spaCy for standard entities (0 tokens)
   - LLM only for new entity types (~200 tokens)
   - Total: ~$0.0025/document

2. **Caching:**
   - Store learned patterns
   - Reuse patterns across documents
   - LLM only for novel cases

3. **Local LLM:**
   - Use Llama 3, Mistral, etc.
   - Zero API cost
   - Slower but offline

---

## Implementation Priorities 🎯

### Must Have (High ROI)
1. **LLM Few-Shot Extraction** - Add entity types instantly
2. **Pattern Bootstrapping** - 10x faster pattern creation
3. **User Feedback Loop** - Learn from corrections

### Nice to Have (Medium ROI)
4. **Active Learning** - Focus labeling effort
5. **Hybrid Extraction** - Best of both worlds
6. **Entity Type Registry** - User-defined types

### Future (Low Priority)
7. **Self-Improvement** - High cost, incremental benefit
8. **Joint Extraction** - Complex, marginal gains

---

## Decision Framework 🤔

### When to use spaCy:
- Standard entity types (PERSON, ORG, PLACE)
- High volume, low token budget
- Speed is critical

### When to use LLM:
- Novel entity types (SPELL, CREATURE, HOUSE)
- Domain-specific entities
- Fiction/fantasy text
- User needs customization

### When to use Bootstrapping:
- Have 5-10 seed examples
- Large corpus to learn from
- Patterns are discoverable
- Want to reduce manual work

### When to use Active Learning:
- Have time for user labeling
- Want continuous improvement
- Edge cases are important

---

## Example: Adding SPELL Entity Type

### Current Way (Slow)
1. Edit `schema.ts` to add SPELL type
2. Add patterns to `entities.ts`
3. Test on corpus
4. Debug pattern failures
5. Repeat 2-4 until working
**Time:** 2-4 hours per entity type

### With Few-Shot LLM (Fast)
1. User provides examples: "Expelliarmus, Patronus, Lumos"
2. System generates prompt
3. LLM extracts SPELL entities
4. Done
**Time:** 2 minutes

### With Bootstrapping (Automated)
1. User provides 5 examples
2. System finds patterns: "X charm", "cast X", "X spell"
3. System applies patterns to corpus
4. User confirms top 20 results
5. Patterns saved to library
**Time:** 10 minutes, then reusable

---

## Conclusion

### What We're Missing
1. ❌ Few-shot learning (can't add types dynamically)
2. ❌ Bootstrapping (manual patterns too slow)
3. ❌ User feedback loop (no learning from corrections)
4. ❌ Hybrid extraction (locked into spaCy)
5. ❌ Self-improvement (static quality)

### What Would Transform ARES
1. **LLM few-shot extraction** → Add entity types in 2 minutes
2. **Pattern bootstrapping** → 10x faster pattern creation
3. **User feedback** → System learns from corrections

### Recommended First Step
**Implement LLM few-shot extraction** (Phase 1)
- Highest impact (unlock any entity type)
- Medium effort (~1 day implementation)
- Reasonable cost (~1.5x token budget)
- Immediate user benefit

---

**Date:** October 29, 2025
**Research:** 2024-2025 NER/RE literature
**Status:** Gap analysis complete, recommendations ready
