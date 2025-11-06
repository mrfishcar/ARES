# Relation Extraction Strategy - Scaling Beyond Simple Patterns

## Problem Statement

Natural language is infinitely variable. Example:
- "John married Mary" ✓ (simple pattern)
- "Mary became John's wife" ✓ (simple pattern)
- "She, upon finding him deliriously handsome, made him a husband" ❌ (complex)
- "The marriage united the two houses" ❌ (event nominalization)

Simple word patterns don't scale to linguistic creativity.

## Efficiency Hierarchy

### Level 1: Dependency Path Patterns (RECOMMENDED NEXT)

**Complexity:** Medium
**Coverage:** 60-70%
**Speed:** Fast (milliseconds)

**How it works:**
- Extract shortest dependency path between entity pairs
- Match against known path patterns
- Robust to inserted clauses and modifiers

**Example:**
```
"She, upon finding him deliriously handsome, made him a husband"

Dependency path: she --[nsubj]--> made <--[dobj]-- him <--[attr]-- husband
Compressed: nsubj-made-dobj-husband

Match: MARRIAGE_PATHS = ["nsubj-made-dobj-husband"]
→ married_to relation
```

**Implementation:**
```typescript
// 1. Build dependency path extractor
function getShortestPath(
  entity1: Token,
  entity2: Token,
  tokens: Token[]
): string {
  // BFS through dependency tree
  // Return path signature
}

// 2. Define path patterns per relation
const RELATION_PATHS = {
  married_to: [
    "nsubj-married-dobj",
    "nsubj-wed-dobj",
    "nsubj-marry-dobj",
    "nsubj-make-dobj-husband",
    "nsubj-make-dobj-wife",
    "nsubj-take-dobj-husband",
    "nsubj-become-poss-husband",  // "became his husband"
  ],
  founded: [
    "nsubj-founded-dobj",
    "nsubjpass-founded-agent",  // passive
    "nsubj-establish-dobj",
    "nsubj-create-dobj",
    "nsubj-start-dobj",
    "poss-brainchild-prep_of",  // "X's brainchild"
  ],
  // ... etc
};

// 3. Match paths
function matchPath(path: string): Relation | null {
  for (const [rel, paths] of Object.entries(RELATION_PATHS)) {
    if (paths.some(p => pathMatches(path, p))) {
      return rel;
    }
  }
  return null;
}
```

**Pros:**
- 10x more robust than surface patterns
- Still fast (no ML, no API calls)
- Handles inserted clauses automatically
- Explainable (can show path)

**Cons:**
- Requires dependency path library
- Need to collect path patterns
- Doesn't handle truly abstract expressions

**Estimated effort:** 2-3 days

---

### Level 2: Semantic Frame Detection

**Complexity:** High
**Coverage:** 75-85%
**Speed:** Medium (10-50ms per sentence)

**How it works:**
- Identify semantic frames (marriage, founding, investment)
- Map frame roles to entities
- More abstract than syntax

**Libraries:**
- FrameNet (research)
- PropBank (practical)
- AllenNLP Semantic Role Labeler

**Example:**
```
"She made him a husband"

Frame: Forming_relationships
- Participant_1: she
- Participant_2: him
- Relationship: marriage (from "husband")

→ married_to(she, him)
```

**Implementation:**
```typescript
import { SemanticRoleLabeler } from 'allennlp';

async function detectFrame(sentence: string) {
  const srl = await labeler.predict(sentence);
  // srl.frames = [
  //   {
  //     verb: "made",
  //     args: {
  //       ARG0: "she",
  //       ARG1: "him",
  //       ARG2: "a husband"
  //     }
  //   }
  // ]

  // Map frame to relation
  if (srl.args.ARG2?.includes('husband') ||
      srl.args.ARG2?.includes('wife')) {
    return {
      type: 'married_to',
      entities: [srl.args.ARG0, srl.args.ARG1]
    };
  }
}
```

**Pros:**
- Handles more abstraction
- Pre-trained models available
- Better generalization

**Cons:**
- Requires Python integration (AllenNLP)
- Slower than patterns
- Still misses very creative expressions

**Estimated effort:** 1-2 weeks

---

### Level 3: LLM-Based Extraction (Fallback)

**Complexity:** Low (to implement)
**Coverage:** 95%+
**Speed:** Slow (200-500ms per sentence)
**Cost:** API calls

**How it works:**
- Send complex sentences to Claude/GPT
- Get structured relation output
- Cache results

**When to use:**
- After pattern and frame methods fail
- ~10-20% of sentences
- Complex literary/creative text

**Implementation:**
```typescript
// Cache for expensive LLM calls
const llmCache = new Map<string, Relation[]>();

async function extractWithLLM(
  sentence: string,
  entities: Entity[]
): Promise<Relation[]> {

  const cacheKey = `${sentence}|${entities.map(e => e.id).join(',')}`;
  if (llmCache.has(cacheKey)) {
    return llmCache.get(cacheKey)!;
  }

  const prompt = `
Extract relationships from this sentence:
"${sentence}"

Entities:
${entities.map(e => `- ${e.canonical} (${e.type})`).join('\n')}

Output JSON format:
[
  {"subject": "entity1", "predicate": "married_to", "object": "entity2"},
  ...
]

Only extract if relationship is clearly stated.
`;

  const response = await callClaudeAPI(prompt);
  const relations = parseJSON(response);

  llmCache.set(cacheKey, relations);
  return relations;
}
```

**Pros:**
- Handles any phrasing
- No pattern engineering needed
- Understands context and implication

**Cons:**
- Slow (200-500ms)
- Costs money ($0.01-0.10 per 1000 sentences)
- Requires internet
- Non-deterministic

**Estimated effort:** 2-3 days

---

### Level 4: Distant Supervision (Long-term)

**Complexity:** Very High
**Coverage:** 80-90%
**Speed:** Fast (after training)

**How it works:**
1. Start with known facts: (Jessica, founded, DataFlow)
2. Find sentences mentioning both entities
3. Extract patterns automatically
4. Train classifier on patterns

**Example:**
```
Known: (Jessica Martinez, founded, DataFlow Technologies)

Sentences found:
- "Jessica Martinez founded DataFlow Technologies"
  → Pattern: "X founded Y"

- "DataFlow Technologies was Jessica Martinez's brainchild"
  → Pattern: "Y was X's brainchild"

- "The startup, helmed by Jessica Martinez"
  → Pattern: "Y, helmed by X"

Train classifier to recognize these patterns.
```

**Pros:**
- Discovers patterns automatically
- Learns from your specific domain
- Can continuously improve

**Cons:**
- Requires knowledge base
- Needs training data
- Complex to implement

**Estimated effort:** 1-2 months

---

## Recommended Hybrid Approach

**Tier 1: Fast Patterns (60-70% coverage, <1ms)**
- Current dependency-based patterns
- Enhanced with dependency paths

**Tier 2: Semantic Frames (15-20% coverage, ~10ms)**
- For common complex constructions
- Pre-trained SRL models

**Tier 3: LLM Fallback (10-15% coverage, ~300ms)**
- For creative/unusual expressions
- Cached aggressively

```typescript
async function extractRelations(
  sentence: string,
  entities: Entity[],
  tokens: Token[]
): Promise<Relation[]> {

  const relations: Relation[] = [];

  for (const [e1, e2] of entityPairs(entities)) {

    // Tier 1: Try dependency path patterns
    const path = getShortestPath(e1, e2, tokens);
    const pathMatch = matchPathPattern(path);
    if (pathMatch) {
      relations.push(pathMatch);
      continue; // Fast path succeeded
    }

    // Tier 2: Try semantic frame detection
    if (ENABLE_SRL) {
      const frame = await detectSemanticFrame(sentence, e1, e2);
      if (frame && frame.confidence > 0.7) {
        relations.push(frameToRelation(frame));
        continue;
      }
    }

    // Tier 3: Fall back to LLM
    if (ENABLE_LLM_FALLBACK) {
      const llmRelation = await extractWithLLM(sentence, [e1, e2]);
      if (llmRelation) {
        relations.push(llmRelation);
      }
    }
  }

  return relations;
}
```

## Performance Characteristics

| Method | Coverage | Speed | Cost | Maintenance |
|--------|----------|-------|------|-------------|
| Simple patterns | 10-20% | 0.1ms | Free | High (manual) |
| Dependency paths | 60-70% | 1ms | Free | Medium |
| Semantic frames | 75-85% | 10ms | Free | Low |
| LLM fallback | 95%+ | 300ms | $$ | Very low |
| Distant supervision | 80-90% | 1ms | Free | Medium (training) |

## Immediate Action Plan

### Phase 1: Dependency Path Patterns (Next 3 days)

1. Implement `getShortestPath(entity1, entity2, tokens)` function
2. Collect 20-30 common dependency paths per relation type
3. Add path matcher to relation extraction pipeline
4. Test on 3376-word narrative

**Expected improvement:** 89 → 110+ relations

### Phase 2: LLM Fallback (Next 2 days)

1. Add Claude API integration for complex sentences
2. Implement aggressive caching
3. Use only for entity pairs with no pattern match
4. Measure cost/performance trade-off

**Expected improvement:** 110 → 130+ relations

### Phase 3: Semantic Frames (Future - 1-2 weeks)

1. Integrate AllenNLP or similar SRL
2. Map semantic frames to relation types
3. Use as middle tier between patterns and LLM

**Expected improvement:** More robust, fewer LLM calls

## Measuring Success

**Metrics to track:**
- Coverage: % of human-identified relations extracted
- Precision: % of extracted relations that are correct
- Speed: Average ms per sentence
- Cost: API costs per 1000 sentences

**Target:**
- Coverage: 70% (dependency paths) → 85% (+ LLM)
- Precision: >90%
- Speed: <10ms avg (with LLM cache)
- Cost: <$0.50 per 1000 sentences

## Conclusion

The most efficient path:
1. **Now:** Enhance with dependency path patterns (60-70% coverage, fast)
2. **Soon:** Add LLM fallback for complex cases (95%+ coverage, cached)
3. **Later:** Semantic frames or distant supervision (reduce LLM dependency)

This gives you high coverage quickly while maintaining speed and explainability.
