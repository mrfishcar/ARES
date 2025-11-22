# ARES Architectural Handoff - Entity Types & Skills Integration
**Date**: November 21, 2025
**Status**: Schema updated, patterns pending
**Handoff to**: Haiku Agent (with Claude Code oversight)

---

## Executive Summary

ARES has been extended with **15 new entity types** from two research documents:
- **Fiction/world-building types**: RACE, CREATURE, ARTIFACT, TECHNOLOGY, MAGIC, LANGUAGE, CURRENCY, MATERIAL, DRUG, DEITY
- **Ability/skill types**: ABILITY, SKILL, POWER, TECHNIQUE, SPELL

**What's complete:**
- ✅ Schema updated (`app/engine/schema.ts`)
- ✅ Type guards added (GUARD object)
- ✅ Wiki index names added (`wiki-index.ts`)
- ✅ TypeScript validates cleanly
- ✅ All existing tests still pass (40/40)

**What's pending:**
- 🔧 Extraction patterns (recognize these types in text)
- 🔧 Entity highlighter updates (UI patterns)
- 🔧 Test cases for new types
- 🔧 Domain lexicon integration

---

## Architecture Context

### ARES Overall Structure

**Levels Complete**: 1-5B (100% = 40+ tests passing)
**Next Level**: 6 (temporal/causal reasoning, ready to implement)

```
Level 1-4: Single-document extraction (entities + relations)
    ↓
Level 5A: Cross-document entity linking (identity management)
    ↓
Level 5B: Performance optimization (indexing + caching)
    ↓
Level 6: Temporal & causal reasoning (NOT YET IMPLEMENTED)
    ↓
Level 7: Semantic enrichment (planned future)
```

### Extraction Pipeline (Current)

```
Raw Text
  ↓
[spaCy Parser] → Tokenization, POS, dependency parsing
  ↓
[Entity Extraction] → NER + pattern matching + manual hints
  ↓
[Coreference Resolution] → Link pronouns to entities
  ↓
[Relation Extraction] → Find connections between entities
  ↓
[Quality Filtering] → Remove low-confidence extractions
  ↓
[Deduplication] → Remove duplicate relations
  ↓
Knowledge Graph (entities + relations + evidence)
```

### Key Files & Responsibilities

| File | Role | Status |
|------|------|--------|
| `app/engine/schema.ts` | Entity types & predicates definitions | ✅ Updated |
| `app/engine/extract/entities.ts` | NER + pattern-based extraction | 🔧 Needs patterns |
| `app/engine/extract/entity-quality-filter.ts` | Precision defense | ✅ Works with all types |
| `app/editor/entityHighlighter.ts` | Browser UI pattern detection | 🔧 Needs UI patterns |
| `app/generate/wiki-index.ts` | Type display names | ✅ Updated |
| `tests/ladder/level-*-*.spec.ts` | Test ladders (1-5B) | ✅ All passing |
| `docs/research/entity-extraction-sota.pdf` | Research document (new types) | 📖 Reference |
| `docs/research/skills-detection-guide.pdf` | Research document (ability patterns) | 📖 Reference |

---

## What Was Changed

### 1. Schema Updated (`app/engine/schema.ts`)

**Added to EntityType:**
```typescript
export type EntityType =
  // ... existing 14 types
  | 'RACE'        // Sentient species (Elves, Dwarves)
  | 'CREATURE'    // Specific creatures (Minotaur, Smaug)
  | 'ARTIFACT'    // Magical/significant items
  | 'TECHNOLOGY'  // Fictional tech/devices
  | 'MAGIC'       // Spells, magical effects
  | 'LANGUAGE'    // Fictional languages
  | 'CURRENCY'    // Fictional money systems
  | 'MATERIAL'    // Special substances (Mithril, etc)
  | 'DRUG'        // Potions, elixirs, substances
  | 'DEITY'       // Gods, spiritual entities
  | 'ABILITY'     // General abilities/powers
  | 'SKILL'       // Learned skills
  | 'POWER'       // Innate/supernatural powers
  | 'TECHNIQUE'   // Combat/magical techniques
  | 'SPELL';      // Spells and incantations
```

**Added to Predicate:**
```typescript
| 'possesses_ability'  // X possesses ability Y
| 'learned'            // X learned ability Y
| 'mastered'           // X mastered skill Y
| 'trained_in'         // X trained in technique Y
| 'grants'             // Ability X grants effect Y
| 'requires'           // Ability X requires condition Y
| 'countered_by'       // Ability X countered by Y
| 'enhances'           // Ability X enhances Y
| 'cast_by';           // Spell X cast by person Y
```

**Added type guards** in GUARD object with proper EntityType combinations.

### 2. Wiki Index Updated (`app/generate/wiki-index.ts`)

Added display names for all 27 types (was 14):
```typescript
'RACE': 'Races',
'CREATURE': 'Creatures',
'ARTIFACT': 'Artifacts',
...
'ABILITY': 'Abilities',
'SPELL': 'Spells',
// etc.
```

### 3. All Changes Validated

✅ TypeScript compiles with 0 errors
✅ All 40+ existing tests still pass
✅ Schema is backwards-compatible (additive only)

---

## What Still Needs to Be Done

### Phase 1: Extraction Patterns (High Priority)

**Goal**: Make the extraction engine recognize the new entity types from text

**Tasks**:

1. **Update `app/engine/extract/entities.ts`**
   - Add pattern matching for each new type
   - Use existing pattern framework (regex + context rules)
   - Reference patterns from research documents

2. **Create pattern file** (NEW)
   - File: `patterns/fantasy-entities.json`
   - Format: Each pattern with type, regex, confidence
   - Include: Race names, creatures, artifacts, tech, magic, etc.

3. **Update domain lexicon**
   - File: `app/engine/domain-lexicon.ts` (if exists)
   - Add known entities/patterns for fantasy/fiction contexts
   - Priority: ARTIFACT, RACE, CREATURE, DEITY

4. **Update entity highlighter** (Browser UI)
   - File: `app/editor/entityHighlighter.ts`
   - Add detection patterns for Extraction Lab
   - Enable real-time highlighting for new types
   - Color coding for visual distinction

### Phase 2: Testing (Medium Priority)

**Goal**: Ensure new types are extracted correctly

**Tasks**:

1. **Create test file**: `tests/ladder/level-5c-new-entities.spec.ts`
   - Test each new entity type with 2-3 examples
   - Verify extraction confidence scores
   - Test in fictional context (Harry Potter, LOTR, etc.)
   - Test ability/skill detection from descriptions

2. **Update existing tests** (if needed)
   - Verify cross-document linking works with new types
   - Verify performance optimization works with new types
   - Run full test suite to ensure no regressions

3. **Golden truth corpus** (Optional)
   - Add fiction text examples with expected extractions
   - Validate against real narrative text

### Phase 3: Documentation (Low Priority)

**Goal**: Document how new types integrate with system

**Tasks**:

1. **Update ENTITY_EXTRACTION_STATUS.md**
   - Add new types to "Entity Types Supported" section
   - Document patterns and detection strategies
   - Update detection priority list

2. **Add research document summaries**
   - Brief summary of patterns from entity-extraction-sota.pdf
   - Brief summary of ability detection from skills-detection-guide.pdf
   - Link to how they're implemented

---

## Research Documents Available

### Document 1: Entity Extraction System Design
**File**: `docs/research/entity-extraction-sota.pdf` (was `Entity extraction system design.pdf`)
**Content**: 16 entity types with patterns and examples
**Key entities for extraction**:
- RACE (with plural/suffix patterns)
- CREATURE (with "the" prefix + proper names)
- ARTIFACT (weapons, armor, jewelry, books, vehicles)
- TECHNOLOGY (devices, ships, AI)
- LANGUAGE (with -ish, -ian, -ese endings)
- CURRENCY (numeric + unit patterns)
- MATERIAL (element names)
- DRUG (potion/substance patterns)
- DEITY (god/goddess patterns)

### Document 2: Linguistic Patterns for Abilities
**File**: `docs/research/skills-detection-guide.pdf` (was `Comprehensive Guide to Linguistic Patterns Signaling "Special Abilities".pdf`)
**Content**: Ability taxonomy with 100+ patterns
**Key ability categories**:
- Innate abilities (natural, birth-given, racial gifts)
- Learned skills (training, practice, study)
- Supernatural powers (mystical, divine, demonic)
- Magical techniques (spells, rituals, incantations)
- Combat techniques (martial arts, weapon moves)
- Mental powers (telepathy, clairvoyance, mind control)
- Enhanced capabilities (strength, speed, durability)
- Transformations (shapeshifting, partial morphing)
- Elemental powers (fire, water, earth, air, etc.)
- Abstract powers (reality warping, time manipulation)

**Key linguistic patterns**:
- Verb phrases: "ability to X", "power to Y", "learned to Z"
- Infinitive constructions: "trained in X", "mastered technique Y"
- Nominalization: "Fireball" (spell), "Telepathy" (power)
- Context: Abilities mentioned in training arcs, character descriptions, combat scenes

---

## Implementation Strategy

### Approach: Pattern-Driven Extraction

The ARES system already supports **pattern-based extraction** as a core mechanism. We should:

1. **Leverage existing pattern framework**
   - Don't reinvent, extend current patterns
   - Use regex + context matching (already proven)
   - Add confidence scoring (already in place)

2. **Start with high-confidence patterns**
   - ARTIFACT: possessive patterns ("Excalibur", "Ring of Power")
   - SPELL: noun forms + magical context (incantations, verbs)
   - RACE: capitalized plurals + suffix patterns
   - ABILITY/SKILL: verb infinitives + training context

3. **Gradual expansion**
   - Get core patterns working first
   - Test with fictional text (Harry Potter, LOTR, etc.)
   - Refine based on false positives/negatives

### Don't Do (Antipatterns)

❌ Don't use LLM extraction for these types (too slow, unreliable)
❌ Don't hardcode entity lists (maintainability nightmare)
❌ Don't change existing extraction pipeline (risks breaking levels 1-5B)
❌ Don't break backward compatibility (new types only, no type removal)

### Do Do (Best Practices)

✅ Use regex patterns with context rules
✅ Implement confidence scoring (0.0-1.0)
✅ Add to existing filter pipeline gracefully
✅ Write unit tests for each pattern
✅ Document patterns in code comments
✅ Test against real narrative fiction

---

## Testing Strategy

### Test Organization

**New test file**: `tests/ladder/level-5c-new-entities.spec.ts`

**Structure** (example):
```typescript
describe('New Entity Type Extraction (Level 5C)', () => {
  describe('RACE entities', () => {
    it('extracts singular race names', () => { ... });
    it('extracts plural race names', () => { ... });
    it('extracts hybrid/compound races', () => { ... });
  });

  describe('ARTIFACT entities', () => {
    it('extracts possessive artifacts', () => { ... });
    it('extracts titled artifacts', () => { ... });
  });

  describe('ABILITY/SKILL entities', () => {
    it('extracts abilities with "can" verb', () => { ... });
    it('extracts learned skills with "trained in"', () => { ... });
    it('extracts combat techniques', () => { ... });
  });

  // ... more tests
});
```

**Test counts**: 2-3 tests per type minimum
**Expected pass rate**: 100% (same as existing tests)
**Performance target**: <500ms per test (existing standard)

### Running Tests

```bash
# Run new tests only
npm test -- tests/ladder/level-5c-new-entities.spec.ts

# Run full suite (should see 40+ → 50+ tests)
npm test

# Run with watch mode
npm test:watch
```

---

## Files You'll Need to Modify

### Core Implementation

1. **`app/engine/extract/entities.ts`**
   - Add pattern matching for new entity types
   - Follow existing pattern: regex + context + confidence
   - Integrate with quality filter pipeline

2. **`patterns/fantasy-entities.json`** (CREATE NEW)
   - Pattern library for RACE, CREATURE, ARTIFACT, etc.
   - Format: `{ "type": "RACE", "pattern": "regex...", "confidence": 0.8 }`

3. **`app/editor/entityHighlighter.ts`**
   - Add patterns for browser UI detection
   - Enable visual highlighting for new types
   - Maintain existing pattern priority order

### Testing

4. **`tests/ladder/level-5c-new-entities.spec.ts`** (CREATE NEW)
   - Test cases for all new types
   - Use fictional text examples
   - Verify confidence scores

### Documentation

5. **`ENTITY_EXTRACTION_STATUS.md`**
   - Update "Entity Types Supported" section
   - Document new patterns and strategies
   - Update detection priority list

---

## Success Criteria

### Phase 1 Complete When:
- [ ] All 15 new entity types can be extracted from text
- [ ] Patterns have confidence scores ≥0.7
- [ ] Entity highlighter shows visual highlighting
- [ ] No breaking changes to existing functionality
- [ ] TypeScript compiles cleanly

### Phase 2 Complete When:
- [ ] Level-5c test file created with 30+ test cases
- [ ] All new type tests passing (100%)
- [ ] Existing tests still passing (40/40)
- [ ] No performance regression (tests < 500ms each)
- [ ] Cross-document linking works with new types

### Phase 3 Complete When:
- [ ] ENTITY_EXTRACTION_STATUS.md updated
- [ ] Research document summaries documented
- [ ] Code comments explain pattern logic
- [ ] Ready for Level 6 implementation

---

## Key Architecture Decisions

### Decision 1: Entity Types as Distinct Types
**Why**: Enables type-safe predicate guards and category-aware processing
**Trade-off**: More types to maintain (27 vs 14)
**Rationale**: Fiction needs explicit categories (SPELL vs ABILITY) for semantic clarity

### Decision 2: Ability Predicates Separate from Possession
**Why**: `possesses_ability(person, spell)` is clearer than `uses(person, spell)`
**Trade-off**: More predicate types (9 new vs consolidation)
**Rationale**: Skills have different semantics (learned, mastered, trained_in) than objects

### Decision 3: Pattern-Based First, Not LLM
**Why**: Patterns are deterministic, fast, and maintainable
**Trade-off**: Less flexible, requires manual curation
**Rationale**: Matches existing ARES architecture (patterns proved reliable through Level 5B)

### Decision 4: Backward Compatible (Additive Only)
**Why**: All 40+ existing tests must continue passing
**Trade-off**: Can't refactor existing types
**Rationale**: Levels 1-5B stability is more important than cleanup

---

## Common Pitfalls to Avoid

1. **Pattern explosion**: Start with 5-10 high-confidence patterns per type, not 50
2. **False positives**: Spirits/ghosts will trigger CREATURE for "phantom" — use context
3. **Confidence creep**: Keep scores honest (0.7-0.9 range), don't inflate
4. **Test brittleness**: Use fixture text, not hand-rolled examples
5. **Regex complexity**: Keep patterns readable, add comments explaining logic

---

## Integration with Level 6 (Temporal/Causal)

These new entity types will be crucial for Level 6:

- **ABILITY types**: Timeline training arcs ("learned X in 2020", "mastered Y by 2021")
- **SPELL/TECHNIQUE**: Causal chains ("Fireball led to victory")
- **SKILL progression**: Multi-hop inference ("trained in swordsmanship" → "master swordsman")
- **ARTIFACT/MAGIC**: Causal effects ("Ring grants immortality" → "immortal because of Ring")

So proper foundation now means Level 6 is faster later.

---

## Summary for Haiku Agent

**You are tasked with:**
1. Adding extraction patterns for 15 new entity types
2. Updating entity highlighter for browser UI
3. Writing comprehensive tests
4. Documenting the integration

**You have:**
- Clear schema definitions (done)
- Two research documents with pattern guidance
- Existing pattern framework to extend
- 40+ existing tests to validate against

**Success looks like:**
- All 15 types extractable from fiction text
- 100% test pass rate (50+ tests total)
- Zero breaking changes
- Clean TypeScript

**Constraints:**
- Don't change existing extraction pipeline
- Don't break levels 1-5B
- Use patterns, not LLM
- Keep it maintainable

**When done:**
- System is ready for Level 6 (temporal/causal)
- Fiction extraction is significantly improved
- Ability/skill tracking is supported
- Architecture remains clean and extensible

---

## Questions for Oversight (Claude Code)

**If Haiku encounters:**
- Pattern that conflicts with existing extraction → Escalate
- Test that needs architectural change → Escalate
- Performance regression > 10% → Escalate
- Type guard conflict → Escalate

**Otherwise**: Proceed with implementation, follow existing patterns, maintain test coverage.

---

**Status**: Ready to handoff to Haiku agent
**Last Updated**: November 21, 2025
**Oversight**: Claude Code (Haiku 4.5)
