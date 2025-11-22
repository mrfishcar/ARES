# Strategic Timing: Entity Types & Skills Detection

**Date**: November 21, 2025
**Context**: Level 5B complete, Level 6 ready to implement

---

## Current State

**Entity Types** (15 types in schema.ts):
- PERSON, ORG, PLACE, DATE, TIME, WORK, ITEM, MISC, OBJECT, SPECIES, HOUSE, TRIBE, TITLE, EVENT

**Architecture Maturity**:
- ✅ Level 1-4: Single document extraction (52 tests)
- ✅ Level 5A: Cross-document resolution (10 tests)
- ✅ Level 5B: Performance optimization (10 tests)
- 📋 Level 6: Temporal reasoning, causal chains, inference (12 tests planned)

---

## Task 1: More Entity Types

### What It Involves

**Files Affected**:
- `/app/engine/schema.ts` - Add types to EntityType union
- `/app/engine/extract/entities.ts` - Add extraction patterns
- `/app/engine/entity-quality-filter.ts` - Add type-specific validation
- `/app/engine/extract/context-classifier.ts` - Add context classification
- `/app/engine/global-graph.ts` - Type indexing already supports new types
- `/tests/**/*.spec.ts` - Add validation tests

**Example New Types**:
- SKILL (programming language, soft skill)
- TECHNOLOGY (software, hardware, framework)
- LOCATION (more specific than PLACE)
- PRODUCT (commercial product)
- CONCEPT (abstract idea)
- MONEY (currency, amounts)
- PERCENTAGE (numeric ratio)
- MEASUREMENT (distance, weight, etc.)

---

## Task 2: Skills Detection System

### What It Involves

**Components**:
1. **Pattern Matching**: Regex for skill keywords
2. **Semantic Detection**: Context-aware skill recognition
3. **Skill Taxonomy**: Hierarchical skill categorization
4. **Extraction Logic**: Integration with entity pipeline
5. **Validation**: Quality filters for skills

**Example**:
```
Text: "Harry learned Python in 2020 and mastered machine learning by 2021."

Entities:
- PERSON: Harry
- SKILL: Python (confidence: 0.95, category: "programming")
- SKILL: machine learning (confidence: 0.90, category: "AI")
- DATE: 2020
- DATE: 2021

Relations:
- Harry learned Python (temporal: 2020)
- Harry mastered machine_learning (temporal: 2021)

Temporal:
- Python BEFORE machine_learning (2020 < 2021)
```

---

## Timing Options

### Option A: Entity Types NOW, Skills as Part of Level 6 (RECOMMENDED)

**Sequence**:
1. **Phase 5.5: Add Entity Types** (2-3 hours)
   - Add new types to schema.ts
   - Add extraction patterns to entities.ts
   - Add quality filters
   - Write tests for new types
   - Validate no regressions

2. **Level 6: Temporal Reasoning + Skills Integration** (10-12 hours)
   - Implement temporal/causal/inference modules
   - Integrate skills detection WITH temporal awareness
   - Skills can use: "learned X in YEAR", "acquired Y at PLACE"
   - Tests validate skills + temporal reasoning together

**Why This Works**:
- ✅ Clean foundation before Level 6
- ✅ Level 6 benefits from complete type system
- ✅ Skills leverage temporal reasoning (when skill acquired)
- ✅ Single test suite validates everything
- ✅ No retrofitting needed

**Timeline**: 2-3h (types) + 10-12h (Level 6 with skills) = 12-15 hours total

**Risk**: Low - adding types is straightforward, skills integrate naturally with temporal reasoning

---

### Option B: Both NOW, Before Level 6

**Sequence**:
1. **Phase 5.5A: Add Entity Types** (2-3 hours)
2. **Phase 5.5B: Skills Detection** (3-4 hours)
3. **Level 6: Temporal Reasoning** (10-12 hours)

**Why This Works**:
- ✅ Complete type system before Level 6
- ✅ Skills system independent of Level 6
- ✅ Can test skills extraction in isolation

**Why This Is Suboptimal**:
- ❌ Skills tested WITHOUT temporal context (miss use cases)
- ❌ May need to refactor skills when adding temporal reasoning
- ❌ More upfront work before seeing full benefits
- ❌ Level 6 delayed by 5-7 hours

**Timeline**: 2-3h (types) + 3-4h (skills) + 10-12h (Level 6) = 15-19 hours total

**Risk**: Medium - might need to refactor skills detection when temporal reasoning added

---

### Option C: Entity Types NOW, Skills as Level 7

**Sequence**:
1. **Phase 5.5: Add Entity Types** (2-3 hours)
2. **Level 6: Temporal/Causal/Inference** (10-12 hours)
3. **Level 7: Skills Detection** (3-4 hours)

**Why This Works**:
- ✅ Types ready for Level 6
- ✅ Skills get ALL features (cross-doc, temporal, causal, inference)
- ✅ Skills can use: "learned from PERSON", "used in PROJECT", "acquired at ORG"
- ✅ Clean progression

**Why This Might Be Frustrating**:
- ❌ Skills come late (if needed sooner)
- ❌ User waits for Level 6 completion

**Timeline**: 2-3h (types) + 10-12h (Level 6) + 3-4h (Level 7 skills) = 15-19 hours total

**Risk**: Low - but delayed gratification for skills

---

### Option D: Everything AFTER Level 6

**Sequence**:
1. **Level 6: Temporal/Causal/Inference** (10-12 hours)
2. **Phase 6.5: Add Entity Types** (2-3 hours)
3. **Level 7: Skills Detection** (3-4 hours)

**Why This Works**:
- ✅ Complete Level 6 first (clean focus)
- ✅ Types + Skills benefit from all Level 6 features

**Why This Is Risky**:
- ❌ Level 6 might add its own types (EVENT already exists)
- ❌ Retrofitting types after Level 6 = more work
- ❌ May need to update Level 6 tests for new types

**Timeline**: 10-12h (Level 6) + 2-3h (types) + 3-4h (skills) = 15-19 hours total

**Risk**: High - retrofitting is always harder than building on solid foundation

---

## Strategic Recommendation: Option A

### Why Option A is Best

**Architectural Reasons**:
1. **Foundation First**: Entity types are foundational - add them before building more complex features
2. **Skills + Temporal Synergy**: Skills naturally have temporal aspects ("learned in 2020")
3. **Single Integration**: Skills integrated once, correctly, with temporal awareness
4. **No Retrofitting**: Avoid going back to fix Level 6 code later

**User Experience**:
- Types available immediately (2-3 hours)
- Skills come with temporal reasoning (powerful combo)
- Clean progression: Types → Temporal+Skills → Done

**Example Power Combo**:
```
Text: "In 2019, Alice learned React at Google. By 2020, she mastered TypeScript."

With Option A:
✅ PERSON: Alice
✅ SKILL: React (acquired: 2019, location: Google)
✅ SKILL: TypeScript (acquired: 2020)
✅ ORG: Google
✅ Temporal: React BEFORE TypeScript
✅ Causal: React (foundation) LED_TO TypeScript (mastery)
✅ Multi-hop: Alice worked_at Google INFERS Google uses React

With Option B (skills without temporal):
⚠️ SKILL: React (no temporal context)
⚠️ SKILL: TypeScript (no temporal context)
❌ Can't build skill timeline
❌ Can't infer skill dependencies
```

**Level 6 Test Example with Skills**:
```typescript
test('6-13: Skill acquisition timeline', async () => {
  const text = `Harry learned Python in 2019. He mastered data science in 2020.
                By 2021, he was teaching machine learning.`;

  const graph = await processText(text);

  const skills = graph.getEntitiesByType('SKILL');
  expect(skills).toHaveLength(3);

  const timeline = graph.getTimeline('Harry');
  expect(timeline[0].skill).toBe('Python');
  expect(timeline[1].skill).toBe('data science');
  expect(timeline[2].skill).toBe('machine learning');

  // Infer skill dependencies
  const pythonToML = graph.inferRelationPath('Python', 'machine learning');
  expect(pythonToML).toBeDefined(); // Python → data science → ML
});
```

---

## Implementation Plan for Option A

### Phase 1: Add Entity Types (2-3 hours)

**Step 1**: Update schema.ts
```typescript
export type EntityType =
  | 'PERSON'
  | 'ORG'
  | 'PLACE'
  | 'DATE'
  | 'TIME'
  | 'WORK'
  | 'ITEM'
  | 'MISC'
  | 'OBJECT'
  | 'SPECIES'
  | 'HOUSE'
  | 'TRIBE'
  | 'TITLE'
  | 'EVENT'
  // NEW TYPES (from your document)
  | 'SKILL'
  | 'TECHNOLOGY'
  | 'PRODUCT'
  | 'CONCEPT'
  | 'MONEY'
  | 'PERCENTAGE'
  | 'MEASUREMENT'
  | 'LOCATION';
```

**Step 2**: Add extraction patterns (entities.ts)
- Wait for your prepared document
- Integrate patterns you've researched

**Step 3**: Add quality filters (entity-quality-filter.ts)
- Type-specific validation rules from your document

**Step 4**: Write tests
```bash
npm test -- tests/unit/entity-types.spec.ts
```

**Step 5**: Validate no regressions
```bash
npm test -- tests/ladder/
```

### Phase 2: Level 6 with Skills Integration (10-12 hours)

Follow Level 6 prompt, but add:
- Test 6-13: Skill acquisition timeline
- Test 6-14: Skill dependency inference
- Skills detection uses temporal reasoning
- Skills detection uses causal reasoning

---

## When Your Documents Are Ready

**For Entity Types Document**:
- Share ASAP (before Level 6)
- I'll integrate into Phase 5.5 (2-3 hours)
- We validate with tests

**For Skills Detection Document**:
- Share when ready (ideally within next 24-48 hours)
- I'll integrate into Level 6 implementation
- Skills get temporal + causal + inference features

---

## Alternative: If Skills Document Not Ready

If skills document takes longer to prepare:

**Plan B**:
1. Add entity types NOW (2-3 hours)
2. Implement Level 6 WITHOUT skills (10-12 hours)
3. Add skills as Level 7 when document ready (3-4 hours)

This is **Option C** - still good, just skills come later.

---

## Summary

| Option | Entity Types | Skills | Timeline | Risk | Recommendation |
|--------|-------------|--------|----------|------|----------------|
| **A** | Phase 5.5 (NOW) | Level 6 (integrated) | 12-15h | Low | ⭐ **BEST** |
| B | Phase 5.5 (NOW) | Phase 5.5 (NOW) | 15-19h | Medium | ⚠️ May need refactoring |
| C | Phase 5.5 (NOW) | Level 7 (later) | 15-19h | Low | ✅ Good if skills doc delayed |
| D | After Level 6 | Level 7 (later) | 15-19h | High | ❌ Retrofitting risk |

---

## Next Steps

**Immediate**:
1. ✅ Confirm Option A is the approach
2. ✅ Share entity types document when ready
3. ✅ I'll implement Phase 5.5 (2-3 hours)

**Within 24-48 hours**:
1. ✅ Share skills detection document
2. ✅ I'll integrate into Level 6 implementation

**If skills document delayed**:
1. ✅ Proceed with Option C (types now, skills as Level 7)

---

## Questions for You

1. **When will entity types document be ready?** (Hours? Days?)
2. **When will skills detection document be ready?** (Same timeline or later?)
3. **Any entity types you need IMMEDIATELY?** (I can add common ones now)
4. **Is Option A acceptable?** (Types now, skills integrated with Level 6)

---

**Ready to proceed as soon as you share the documents!** 🚀
