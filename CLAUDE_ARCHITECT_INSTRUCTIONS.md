# Entity Extraction Excellence - Instructions for Claude Architect

**Mission**: Push ARES entity extraction quality beyond expectations
**Current Status**: Stage 2 complete (94.3% F1), comprehensive tests at 10.7% pass rate
**Target**: 90%+ pass rate on comprehensive test suite while maintaining Stage 2 performance

---

## Executive Summary

You've made excellent progress on canonical name selection and merge logic. However, the comprehensive test suite reveals significant gaps in baseline extraction quality. This document provides a clear roadmap to achieve world-class entity extraction.

**Your Recent Wins** ✅:
- Canonical name selection (proper names over titles)
- Verb/pronoun filtering
- Alias population from registry
- Confidence tracking

**Critical Gaps to Address** 🎯:
- Missing entity types (ORG, PRODUCT, DATE detection ~30% of expected)
- Incomplete alias extraction (pronouns work, but missing proper name aliases)
- Inconsistent confidence values (some undefined)
- Poor handling of: technical terms, social media handles, special characters, multilingual content

---

## Part 1: Current State Analysis

### Test Results Breakdown

```
Comprehensive Test Suite (28 tests):
✅ Passed: 3 tests (10.7%)
❌ Failed: 25 tests (89.3%)

Stage 2 Tests (multi-sentence tracking):
✅ F1 Score: 94.3%
✅ Precision: 97.8%
✅ Recall: 91.1%
```

### Failure Pattern Analysis

#### Category 1: Missing Entity Types (40% of failures)
```
❌ Missing: Elon Musk (PERSON)
❌ Missing: TechCrunch (ORGANIZATION)
❌ Missing: iPhone 15 Pro (PRODUCT)
❌ Missing: January 15, 2024 (DATE)
❌ Missing: React.js (TECHNOLOGY)
❌ Missing: FBI (ORGANIZATION - acronym)
```

**Root Cause**: SpaCy NER is not detecting these entities. Need to supplement with pattern-based extraction and entity type expansion.

#### Category 2: Incomplete Aliases (35% of failures)
```
❌ Expected: ["Jim", "Dr. Wilson", "James Wilson"]
✅ Actual: ["his"]

❌ Expected: ["Sarah", "Dr. Johnson"]
✅ Actual: []

❌ Expected: ["the Queen", "Her Majesty", "Victoria"]
✅ Actual: ["the Queen"]
```

**Root Cause**:
1. Pattern-based alias extraction only works for explicit patterns ("X called Y")
2. Coreference captures pronouns but not proper name variations
3. Title-based aliases not consistently linked

#### Category 3: Special Characters & Edge Cases (15% of failures)
```
❌ Missing: O'Brien-Smith (PERSON - apostrophe + hyphen)
❌ Missing: University of California, Berkeley (ORG - comma in name)
❌ Missing: @elonmusk (PERSON - social media handle)
❌ Missing: #ClimateChange (CONCEPT - hashtag)
```

**Root Cause**: Pattern matching doesn't handle special characters well.

#### Category 4: Confidence Issues (10% of failures)
```
❌ Error: actual value must be number or bigint, received "undefined"
```

**Root Cause**: Some entities lack confidence values. Need to ensure all entities have valid confidence scores.

---

## Part 2: Objectives & Success Criteria

### Primary Objectives (Must Achieve)

#### Objective 1: Comprehensive Entity Type Coverage
**Target**: Detect 85%+ of expected entities across ALL types

**Success Criteria**:
- ✅ PERSON: 90%+ detection rate
- ✅ ORGANIZATION: 85%+ detection rate (currently ~30%)
- ✅ LOCATION/PLACE: 85%+ detection rate
- ✅ PRODUCT: 80%+ detection rate (currently ~20%)
- ✅ DATE: 85%+ detection rate (currently ~15%)
- ✅ EVENT: 75%+ detection rate
- ✅ TECHNOLOGY: 75%+ detection rate (new type to add)

**Measurement**: Run comprehensive test suite, check per-type precision/recall

#### Objective 2: Rich Alias Extraction
**Target**: Capture 80%+ of expected aliases per entity

**Success Criteria**:
- ✅ Pronouns: 95%+ (already working)
- ✅ Nickname patterns: 85%+ ("X called Y", "X nicknamed Y")
- ✅ Title variations: 80%+ ("Dr. Smith" ↔ "John Smith")
- ✅ Shortened names: 75%+ ("James" ↔ "Jim", "Elizabeth" ↔ "Liz")
- ✅ Descriptive references: 70%+ ("the wizard" → Gandalf)

**Measurement**: Test alias-resolution.ts utilities, check alias coverage per entity

#### Objective 3: Robust Edge Case Handling
**Target**: 80%+ success on edge case tests

**Success Criteria**:
- ✅ Special characters: 85%+ (apostrophes, hyphens, commas)
- ✅ Social media: 80%+ (@handles, #hashtags)
- ✅ Acronyms: 85%+ (FBI, NASA, with expansion linking)
- ✅ Multilingual: 70%+ (names with accents, transliteration)
- ✅ Mixed case: 85%+ (iPhone, MacBook, JavaScript)

**Measurement**: edge-cases.json test file, check pattern-specific metrics

#### Objective 4: Universal Confidence
**Target**: 100% of entities have valid confidence scores

**Success Criteria**:
- ✅ No undefined confidence values
- ✅ Confidence range: 0.5-1.0 (filter < 0.5)
- ✅ Confidence calibration: High confidence = high accuracy
- ✅ Confidence correlation: Score correlates with correctness

**Measurement**: confidence-validation.ts utilities, check distribution and correlation

### Secondary Objectives (Nice to Have)

1. **Performance**: Maintain extraction time < 2s for 1000-word documents
2. **Consistency**: Same input → same output (deterministic)
3. **Explainability**: Track provenance for each entity (which rule/pattern matched)

---

## Part 3: Implementation Strategy

### Phase 1: Expand Entity Type Detection (Priority: CRITICAL)

#### Problem
SpaCy NER only detects PERSON, ORG, GPE (location). Missing: PRODUCT, DATE, TECHNOLOGY, EVENT.

#### Solution Approach

**Option A: Pattern-Based Extraction** (Recommended - Fast, Reliable)
```typescript
// In app/engine/extract/entities.ts

/**
 * Pattern-based entity detection for types SpaCy misses
 */
function extractPatternBasedEntities(text: string): Entity[] {
  const entities: Entity[] = [];

  // PRODUCT patterns
  const productPatterns = [
    /\b(iPhone|iPad|MacBook|Galaxy|Pixel)\s+[\w\s]+\b/g,  // Tech products
    /\b\w+\s+(Pro|Plus|Max|Ultra|Air)\b/g,  // Product variants
    /\bversion\s+[\d.]+/gi,  // Software versions
  ];

  // DATE patterns (expand SpaCy's detection)
  const datePatterns = [
    /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g,  // 01/15/2024
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi,  // January 15, 2024
    /\b\d{4}-\d{2}-\d{2}\b/g,  // 2024-01-15 (ISO format)
  ];

  // TECHNOLOGY patterns
  const techPatterns = [
    /\b[A-Z][a-z]+\.js\b/g,  // React.js, Vue.js, Node.js
    /\b(?:Python|Java|Ruby|Go|Rust|Swift|Kotlin)\b/g,  // Languages
    /\bAPI\b/g,  // Technology terms
  ];

  // ORG patterns (supplement SpaCy)
  const orgPatterns = [
    /\b[A-Z]{2,}\b/g,  // Acronyms (FBI, NASA, CIA)
    /@\w+/g,  // Social media handles (treat as ORG)
    /\b\w+\s+(?:Inc|Corp|LLC|Ltd|GmbH)\b/gi,  // Corporate suffixes
  ];

  // Apply patterns...
  for (const pattern of productPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      entities.push({
        id: `pattern_product_${entities.length}`,
        type: 'PRODUCT',
        canonical: match[0].trim(),
        aliases: [],
        confidence: 0.85,  // Pattern-based = high confidence
        created_at: new Date().toISOString(),
        centrality: 1.0
      });
    }
  }

  // Repeat for other patterns...

  return entities;
}
```

**Integration Point**:
```typescript
// In extractFromSegments()
const spacyEntities = await parseWithSpacy(segment.text);
const patternEntities = extractPatternBasedEntities(segment.text);

// Merge and deduplicate
const allEntities = [...spacyEntities, ...patternEntities];
const deduplicated = deduplicateEntities(allEntities);
```

**Why This Works**:
- ✅ Fast (regex, no ML)
- ✅ Reliable (deterministic)
- ✅ Easy to expand (add more patterns)
- ✅ Complements SpaCy (fills gaps)

**Option B: LLM-Based Extraction** (Use Sparingly - Expensive)
Only use LLM for ambiguous cases where patterns fail. Not recommended for primary extraction.

#### Action Items for You

1. **Add pattern-based extraction function** in `app/engine/extract/entities.ts`
2. **Create pattern library** for each missing entity type:
   - PRODUCT: Tech products, consumer goods, brands
   - DATE: All date formats (US, EU, ISO)
   - TECHNOLOGY: Programming languages, frameworks, APIs
   - EVENT: Named events, conferences, ceremonies
3. **Integrate** with existing SpaCy extraction
4. **Deduplicate** pattern-based and SpaCy entities (handle overlaps)
5. **Test** against comprehensive test suite, measure improvement

**Files to Modify**:
- `app/engine/extract/entities.ts` (add extractPatternBasedEntities)
- `app/engine/extract/orchestrator.ts` (integrate patterns)

**Expected Impact**:
- ORG detection: 30% → 85% ✅
- PRODUCT detection: 20% → 80% ✅
- DATE detection: 15% → 85% ✅

---

### Phase 2: Rich Alias Extraction (Priority: HIGH)

#### Problem
Only explicit patterns ("X called Y") and pronouns are captured. Missing variations like:
- "Dr. Smith" ↔ "John Smith"
- "James" ↔ "Jim"
- "the wizard" → Gandalf (descriptive → proper name)

#### Solution Approach

**Strategy 1: Title Extraction** (Name + Title → Variations)
```typescript
/**
 * Extract title variations and link to base name
 * Example: "Dr. John Smith" → aliases: ["John Smith", "Dr. Smith", "Smith"]
 */
function extractTitleVariations(entity: Entity, text: string): string[] {
  const aliases = new Set<string>();

  const titles = ['Dr', 'Mr', 'Ms', 'Mrs', 'Prof', 'Professor', 'Judge',
                  'Senator', 'President', 'King', 'Queen', 'Lord', 'Lady'];

  const canonical = entity.canonical;

  // If canonical has title, create variations without it
  for (const title of titles) {
    const titlePattern = new RegExp(`^${title}\\.?\\s+(.+)$`, 'i');
    const match = canonical.match(titlePattern);
    if (match) {
      const baseName = match[1];
      aliases.add(baseName);

      // Also add last name only
      const lastNameMatch = baseName.match(/\b(\w+)$/);
      if (lastNameMatch) {
        aliases.add(lastNameMatch[1]);
      }
    }
  }

  // Search text for title variations
  const baseNameNoTitle = canonical.replace(/^(?:Dr|Mr|Ms|Mrs|Prof|Professor)\\.?\\s+/i, '');
  for (const title of titles) {
    const pattern = new RegExp(`\\b${title}\\.?\\s+${baseNameNoTitle}\\b`, 'gi');
    let match;
    while ((match = pattern.exec(text)) !== null) {
      aliases.add(match[0]);
    }
  }

  return Array.from(aliases);
}
```

**Strategy 2: Common Nickname Mapping**
```typescript
/**
 * Map common nicknames to full names
 */
const NICKNAME_MAP: Record<string, string[]> = {
  'James': ['Jim', 'Jimmy', 'Jamie'],
  'William': ['Bill', 'Billy', 'Will', 'Willy', 'Liam'],
  'Robert': ['Bob', 'Bobby', 'Rob', 'Robby'],
  'Elizabeth': ['Liz', 'Lizzy', 'Beth', 'Betty'],
  'Michael': ['Mike', 'Mikey', 'Mick'],
  'Richard': ['Rick', 'Ricky', 'Dick', 'Rich'],
  'Jennifer': ['Jen', 'Jenny', 'Jenn'],
  'Christopher': ['Chris', 'Cris'],
  'Daniel': ['Dan', 'Danny'],
  'Joseph': ['Joe', 'Joey'],
  // ... add more
};

function findNicknameVariations(canonicalName: string): string[] {
  const aliases: string[] = [];

  for (const [fullName, nicknames] of Object.entries(NICKNAME_MAP)) {
    if (canonicalName.includes(fullName)) {
      // If canonical has full name, add nicknames
      for (const nick of nicknames) {
        aliases.push(canonicalName.replace(fullName, nick));
      }
    } else {
      // If canonical has nickname, add full name
      for (const nick of nicknames) {
        if (canonicalName.includes(nick)) {
          aliases.push(canonicalName.replace(nick, fullName));
        }
      }
    }
  }

  return aliases;
}
```

**Strategy 3: Enhanced Coreference Linking**
```typescript
/**
 * Improve coreference to link descriptive references to proper names
 * Example: "the wizard" should resolve to "Gandalf" not stay as separate entity
 */
function enhanceCorefWithDescriptiveLinks(
  entities: Entity[],
  corefLinks: CorefLink[],
  text: string
): void {
  // Build descriptor → proper name mappings
  const descriptorMap = new Map<string, string>();

  for (const link of corefLinks) {
    const mention = link.mention.text.toLowerCase();
    const entity = entities.find(e => e.id === link.entity_id);

    if (entity && /^the\s+\w+/.test(mention)) {
      // This is a descriptive reference ("the wizard", "the king")
      if (!descriptorMap.has(mention)) {
        descriptorMap.set(mention, entity.canonical);
      }
    }
  }

  // Apply mappings: merge descriptor entities into proper name entities
  for (const entity of entities) {
    const canonicalLower = entity.canonical.toLowerCase();
    if (descriptorMap.has(canonicalLower)) {
      // This entity is a descriptor - should be merged
      const properName = descriptorMap.get(canonicalLower)!;
      const properEntity = entities.find(e =>
        e.canonical.toLowerCase() === properName.toLowerCase()
      );

      if (properEntity) {
        // Add descriptor as alias to proper entity
        if (!properEntity.aliases.includes(entity.canonical)) {
          properEntity.aliases.push(entity.canonical);
        }

        // Mark descriptor entity for removal
        entity.shouldRemove = true;
      }
    }
  }

  // Remove descriptor entities that were merged
  entities = entities.filter(e => !e.shouldRemove);
}
```

#### Action Items for You

1. **Implement title variation extraction** in `app/engine/extract/entities.ts`
2. **Create nickname mapping** (can start with top 50 names, expand over time)
3. **Enhance coreference** to link descriptive references to proper names
4. **Add to orchestrator** alias population phase
5. **Test** with alias-resolution.ts utilities

**Files to Modify**:
- `app/engine/extract/entities.ts` (title variations, nickname map)
- `app/engine/coref.ts` (enhance descriptive linking)
- `app/engine/extract/orchestrator.ts` (integrate into alias population)

**Expected Impact**:
- Alias coverage: 40% → 80% ✅
- Title variations: 0% → 80% ✅
- Nickname detection: 0% → 75% ✅

---

### Phase 3: Edge Case Robustness (Priority: MEDIUM)

#### Problem
Special characters, social media, acronyms, multilingual content not handled well.

#### Solution Approach

**Special Characters Handling**:
```typescript
/**
 * Handle names with apostrophes, hyphens, commas
 */
function normalizeSpecialCharacters(text: string): string {
  // Preserve special characters in entity matching
  return text;  // Don't strip - instead enhance regex patterns
}

// Update entity patterns to handle special characters
const namePatternWithSpecialChars = /\b[A-Z][a-z']+(?:-[A-Z][a-z']+)*\b/g;
// Matches: O'Brien, Smith-Jones, O'Brien-Smith
```

**Social Media Handles**:
```typescript
/**
 * Extract social media handles as PERSON entities
 */
function extractSocialMediaHandles(text: string): Entity[] {
  const entities: Entity[] = [];

  // @handle patterns
  const handlePattern = /@(\w+)/g;
  let match;
  while ((match = handlePattern.exec(text)) !== null) {
    entities.push({
      id: `social_${match[1]}`,
      type: 'PERSON',  // or ORG if corporate account
      canonical: match[1],  // Without @
      aliases: [match[0]],  // With @
      confidence: 0.80,
      created_at: new Date().toISOString(),
      centrality: 1.0
    });
  }

  return entities;
}
```

**Acronym Expansion**:
```typescript
/**
 * Link acronyms to their expansions
 */
const ACRONYM_EXPANSIONS: Record<string, string> = {
  'FBI': 'Federal Bureau of Investigation',
  'NASA': 'National Aeronautics and Space Administration',
  'CIA': 'Central Intelligence Agency',
  'FBI': 'Federal Bureau of Investigation',
  'MIT': 'Massachusetts Institute of Technology',
  // ... add more
};

function linkAcronymExpansions(entities: Entity[], text: string): void {
  for (const entity of entities) {
    const canonical = entity.canonical;

    // If entity is acronym, add expansion as alias
    if (ACRONYM_EXPANSIONS[canonical]) {
      const expansion = ACRONYM_EXPANSIONS[canonical];
      if (!entity.aliases.includes(expansion)) {
        entity.aliases.push(expansion);
      }
    }

    // If entity is expansion, add acronym as alias
    for (const [acronym, expansion] of Object.entries(ACRONYM_EXPANSIONS)) {
      if (canonical === expansion && !entity.aliases.includes(acronym)) {
        entity.aliases.push(acronym);
      }
    }
  }
}
```

#### Action Items for You

1. **Update regex patterns** to handle special characters
2. **Add social media extraction** (@handles, #hashtags)
3. **Create acronym expansion map** (top 100 acronyms)
4. **Add multilingual support** (preserve accents, handle transliteration)
5. **Test** with edge-cases.json

**Files to Modify**:
- `app/engine/extract/entities.ts` (special char patterns, social media, acronyms)

**Expected Impact**:
- Special chars: 40% → 85% ✅
- Social media: 20% → 80% ✅
- Acronyms: 30% → 85% ✅

---

### Phase 4: Universal Confidence (Priority: HIGH)

#### Problem
Some entities have undefined confidence values, causing test failures.

#### Solution Approach

**Ensure All Entities Have Confidence**:
```typescript
/**
 * Assign confidence scores to all entities based on detection method
 */
function ensureConfidence(entity: Entity, detectionMethod: string): void {
  if (entity.confidence === undefined || entity.confidence === null) {
    // Assign confidence based on detection method
    const confidenceMap: Record<string, number> = {
      'spacy': 0.90,           // SpaCy NER is reliable
      'pattern_exact': 0.85,    // Exact pattern match
      'pattern_fuzzy': 0.75,    // Fuzzy pattern match
      'coref': 0.80,            // Coreference resolution
      'alias_registry': 0.95,   // User-registered alias
      'title_variation': 0.85,  // Title-based variation
      'nickname': 0.70,         // Nickname mapping (less certain)
      'fallback': 0.60,         // Fallback extraction
    };

    entity.confidence = confidenceMap[detectionMethod] || 0.60;
  }

  // Clamp to valid range
  entity.confidence = Math.max(0.5, Math.min(1.0, entity.confidence));
}
```

**Confidence Calibration**:
```typescript
/**
 * Calibrate confidence scores based on historical accuracy
 */
function calibrateConfidence(
  entity: Entity,
  context: { hasAliases: boolean; mentionCount: number; contextClarity: number }
): void {
  let baseConfidence = entity.confidence || 0.60;

  // Boost confidence for entities with strong signals
  if (context.hasAliases) {
    baseConfidence += 0.05;  // Has aliases = more evidence
  }

  if (context.mentionCount > 2) {
    baseConfidence += 0.05;  // Mentioned multiple times = more important
  }

  if (context.contextClarity > 0.8) {
    baseConfidence += 0.05;  // Clear context = more certain
  }

  // Clamp to valid range
  entity.confidence = Math.max(0.5, Math.min(1.0, baseConfidence));
}
```

#### Action Items for You

1. **Add confidence assignment** to ALL extraction methods
2. **Implement calibration** based on entity signals
3. **Add validation** to ensure no undefined confidence values
4. **Test** with confidence-validation.ts utilities

**Files to Modify**:
- `app/engine/extract/entities.ts` (confidence assignment)
- `app/engine/extract/orchestrator.ts` (confidence validation)

**Expected Impact**:
- Undefined confidence: 15% → 0% ✅
- Confidence calibration: Poor → Good ✅

---

## Part 4: Architecture & Best Practices

### DO's ✅

1. **Use Existing Systems**
   - ✅ Use existing `alias-registry.ts` (don't create new registry)
   - ✅ Use existing `eid-registry.ts` for entity IDs
   - ✅ Use existing `coref.ts` for coreference resolution
   - ✅ Extend `entities.ts` for new extraction methods

2. **Follow Existing Patterns**
   - ✅ Return `Entity[]` from extraction functions
   - ✅ Use `created_at`, `id`, `type`, `canonical`, `aliases` structure
   - ✅ Assign confidence scores (0.5-1.0 range)
   - ✅ Use `normalizeKey()` for string comparison

3. **Maintain Performance**
   - ✅ Pattern-based extraction is FAST (prefer over LLM)
   - ✅ Batch operations when possible
   - ✅ Cache expensive computations
   - ✅ Target: <2s for 1000-word documents

4. **Write Tests**
   - ✅ Add test cases to `tests/entity-extraction/test-cases/`
   - ✅ Use test utilities (test-utils.ts, confidence-validation.ts, etc.)
   - ✅ Run comprehensive test suite before committing
   - ✅ Document test results in commit messages

5. **Track Provenance**
   - ✅ Add `detectionMethod` field to entities (for debugging)
   - ✅ Track which rule/pattern matched
   - ✅ Makes debugging failures much easier

### DON'Ts ❌

1. **Don't Create Redundant Systems**
   - ❌ Don't create new alias registry (use existing)
   - ❌ Don't create new entity ID system (use EID registry)
   - ❌ Don't create parallel extraction pipeline (extend existing)

2. **Don't Break Existing Functionality**
   - ❌ Don't modify core merge logic (it's working well)
   - ❌ Don't change canonical name selection (it's working well)
   - ❌ Don't break Stage 2 tests (maintain 94.3% F1)

3. **Don't Over-Engineer**
   - ❌ Don't use LLM for everything (expensive, slow)
   - ❌ Don't create complex ML models (patterns work well)
   - ❌ Don't optimize prematurely (get it working first)

4. **Don't Ignore Tests**
   - ❌ Don't skip running comprehensive test suite
   - ❌ Don't commit with failing tests (unless documenting known issues)
   - ❌ Don't ignore test failures (they reveal real issues)

---

## Part 5: Testing & Validation Strategy

### Testing Checklist

Before each commit, run:

```bash
# 1. Run comprehensive test suite
npm test tests/entity-extraction/extraction.spec.ts

# 2. Run custom test script
npx tsx test-claude-improvements.ts

# 3. Check specific metrics
npx tsx tests/entity-extraction/comprehensive-test-runner.ts

# 4. Verify no regressions on Stage 2
npm test tests/ladder/level-2*.spec.ts
```

### Success Criteria Per Phase

**Phase 1 Complete When**:
- ✅ ORG detection: ≥85% (test: `tests/entity-extraction/test-cases/003-modern-informal.json`)
- ✅ PRODUCT detection: ≥80% (test: `tests/entity-extraction/test-cases/010-edge-cases.json`)
- ✅ DATE detection: ≥85% (test: `tests/entity-extraction/test-cases/010-edge-cases.json`)
- ✅ Comprehensive test pass rate: ≥50% (14+/28 tests)

**Phase 2 Complete When**:
- ✅ Alias coverage: ≥80% (test: alias-resolution.ts utilities)
- ✅ Title variations: ≥80% (test: `tests/entity-extraction/test-cases/002-historical-context.json`)
- ✅ Comprehensive test pass rate: ≥70% (20+/28 tests)

**Phase 3 Complete When**:
- ✅ Special chars: ≥85% (test: `tests/entity-extraction/test-cases/010-edge-cases.json`)
- ✅ Social media: ≥80% (test: `tests/entity-extraction/test-cases/007-social-media.json`)
- ✅ Edge case pass rate: ≥80% (8+/10 edge case tests)

**Phase 4 Complete When**:
- ✅ Zero undefined confidence values (test: confidence-validation.ts)
- ✅ Confidence correlation ≥0.7 (high confidence = high accuracy)

**Mission Complete When**:
- ✅ Comprehensive test pass rate: ≥90% (25+/28 tests)
- ✅ Stage 2 performance maintained: F1 ≥94%
- ✅ Zero undefined confidence values
- ✅ All entity types: ≥80% detection rate

---

## Part 6: Commit Strategy

### Commit Best Practices

1. **Small, Focused Commits**
   - One feature per commit
   - Example: "feat: add pattern-based PRODUCT entity extraction"
   - NOT: "feat: add all missing entity types and fix aliases"

2. **Include Test Results in Commit Message**
   ```
   feat: add pattern-based PRODUCT entity extraction

   Adds regex patterns to detect technology products missed by SpaCy:
   - iPhone/iPad/MacBook patterns
   - Software version patterns (v1.0, version 2.3)
   - Product variant patterns (Pro, Max, Ultra)

   Test Results:
   - PRODUCT detection: 20% → 75% (+55pp)
   - Comprehensive test pass rate: 10.7% → 32.1% (+21.4pp)
   - Stage 2 F1: 94.3% (maintained)

   Files modified:
   - app/engine/extract/entities.ts (add extractProductEntities)
   - app/engine/extract/orchestrator.ts (integrate pattern extraction)

   🤖 Generated with Claude Code
   Co-Authored-By: Claude <noreply@anthropic.com>
   ```

3. **Run Tests Before Committing**
   ```bash
   # Ensure tests pass
   npm test tests/entity-extraction/extraction.spec.ts

   # If tests fail, document in commit message
   # Example: "Known Issue: 3 tests still failing due to X"
   ```

4. **Document Regressions**
   If you break something, document it:
   ```
   fix: add DATE entity extraction (breaks 2 tests)

   Known Issues:
   - edge-case-003: Now detects too many dates (over-extraction)
   - historical-002: Date format mismatch

   These will be fixed in next commit with date validation.
   ```

---

## Part 7: Expected Timeline & Milestones

### Aggressive Timeline (Recommended)

**Week 1: Foundation**
- Day 1-2: Phase 1 (Entity Type Expansion) - pattern-based extraction
- Day 3-4: Phase 4 (Universal Confidence) - ensure all entities have confidence
- Day 5: Testing & validation, fix critical bugs
- **Target**: 50% test pass rate (14+/28 tests)

**Week 2: Richness**
- Day 1-2: Phase 2 Part 1 (Title Variations)
- Day 3-4: Phase 2 Part 2 (Nickname Mapping & Enhanced Coref)
- Day 5: Testing & validation
- **Target**: 70% test pass rate (20+/28 tests)

**Week 3: Polish**
- Day 1-2: Phase 3 (Edge Cases) - special chars, social media, acronyms
- Day 3-4: Bug fixes, optimization, confidence calibration
- Day 5: Final testing, documentation
- **Target**: 90% test pass rate (25+/28 tests)

### Conservative Timeline

If you need more time, prioritize in this order:
1. Phase 4 (Confidence) - Critical, prevents test crashes
2. Phase 1 (Entity Types) - High impact, missing core functionality
3. Phase 2 (Aliases) - Medium impact, improves quality
4. Phase 3 (Edge Cases) - Lower impact, but important for robustness

---

## Part 8: Communication & Collaboration

### Status Updates

Please provide updates in this format:

```
## Status Update - [Date]

### Progress
- ✅ Completed: [What you finished]
- 🔄 In Progress: [What you're working on]
- ⏳ Blocked: [Any blockers]

### Test Results
- Comprehensive pass rate: X% (was Y%, +Z%)
- Stage 2 F1: X% (was 94.3%, maintained/regressed)
- Key improvements: [What got better]
- Known issues: [What's still broken]

### Next Steps
- [What you'll work on next]

### Questions
- [Any questions or clarifications needed]
```

### When to Ask for Help

Ask if you encounter:
- ❓ Architectural decisions (create new module vs extend existing?)
- ❓ Performance issues (extraction taking >5s)
- ❓ Test failures you can't debug (weird edge cases)
- ❓ Breaking changes needed (need to modify core systems)

---

## Part 9: Quick Wins (Start Here)

### Quickest Wins for Immediate Impact

**Quick Win #1: Universal Confidence** (2 hours)
- Add default confidence values to all extraction methods
- Impact: Fixes 10% of test failures immediately

**Quick Win #2: Acronym Detection** (3 hours)
- Add regex pattern for all-caps words (FBI, NASA, etc.)
- Mark as ORG type
- Impact: Fixes 5-7 failing tests

**Quick Win #3: Date Pattern Extraction** (4 hours)
- Add regex patterns for common date formats
- Impact: Fixes 3-5 failing tests

**Quick Win #4: Social Media Handles** (2 hours)
- Extract @handles as PERSON entities
- Impact: Fixes 2-3 failing tests

**Combined Impact of Quick Wins**:
- Test pass rate: 10.7% → 40%+ in <1 day of work 🚀

---

## Part 10: Resources & References

### Key Files to Reference

**Existing Systems** (DON'T duplicate these):
```
app/engine/alias-registry.ts       - Alias storage & retrieval
app/engine/eid-registry.ts          - Entity ID management
app/engine/coref.ts                 - Coreference resolution
app/engine/merge.ts                 - Entity merging (YOUR EXCELLENT WORK)
```

**Extension Points** (DO modify these):
```
app/engine/extract/entities.ts      - Add new extraction methods here
app/engine/extract/orchestrator.ts  - Coordinate extraction phases
```

**Test Files** (Run these):
```
tests/entity-extraction/extraction.spec.ts          - Main test suite (28 tests)
tests/entity-extraction/comprehensive-test-runner.ts - Detailed test runner
tests/entity-extraction/test-utils.ts               - Metrics calculation
tests/entity-extraction/confidence-validation.ts     - Confidence utilities
tests/entity-extraction/alias-resolution.ts          - Alias utilities
```

**Test Cases** (Add more if needed):
```
tests/entity-extraction/test-cases/*.json
- 001-basic-aliases.json
- 002-historical-context.json
- 003-modern-informal.json
- 010-edge-cases.json
- 011-coreference-chains.json
```

### Documentation

- **Architecture**: `INTEGRATED_TESTING_STRATEGY.md`
- **Entity System**: `ENTITY_EXTRACTION_STATUS.md`
- **Recent Changes**: `CLAUDE_CHANGES_REVIEW.md`
- **Verification**: `VERIFICATION_REPORT.md`
- **No Redundancy**: `REDUNDANCY_CHECK.md`

### Useful Code Patterns

**Pattern 1: Adding New Entity Type**
```typescript
// In entities.ts
export function extractXYZEntities(text: string): Entity[] {
  const entities: Entity[] = [];
  const pattern = /your-regex-here/g;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    entities.push({
      id: `xyz_${entities.length}`,
      type: 'XYZ',
      canonical: match[0],
      aliases: [],
      confidence: 0.85,
      created_at: new Date().toISOString(),
      centrality: 1.0
    });
  }

  return entities;
}
```

**Pattern 2: Merging Pattern-Based with SpaCy**
```typescript
// In orchestrator.ts
const spacyEntities = await parseWithSpacy(text);
const patternEntities = extractPatternBasedEntities(text);

// Combine and deduplicate
const allEntities = [...spacyEntities, ...patternEntities];
const deduplicated = deduplicateOverlappingEntities(allEntities);
```

**Pattern 3: Adding Aliases**
```typescript
// In orchestrator.ts (alias population phase)
for (const entity of entities) {
  const aliasSet = new Set<string>();

  // Add from your new detection method
  const newAliases = extractTitleVariations(entity, text);
  for (const alias of newAliases) {
    aliasSet.add(alias);
  }

  entity.aliases = Array.from(aliasSet);
}
```

---

## Part 11: Final Notes

### Why This Matters

The current 10.7% pass rate on comprehensive tests vs 94.3% F1 on Stage 2 shows a **quality gap**. Stage 2 tests simple scenarios. Real-world text is complex:
- Technical content (PRODUCT, TECHNOLOGY types)
- Social media (handles, hashtags, informal language)
- Edge cases (special characters, multilingual)
- Rich context (aliases, titles, nicknames)

Your mission is to close this gap and make ARES **world-class** at entity extraction across ALL scenarios.

### Success Vision

When you're done, ARES should:
- ✅ Extract 90%+ of entities across ALL types
- ✅ Capture 80%+ of aliases per entity
- ✅ Handle edge cases gracefully (special chars, social media, multilingual)
- ✅ Assign valid confidence scores to 100% of entities
- ✅ Maintain Stage 2 performance (94.3% F1)
- ✅ Process 1000-word documents in <2s

### You've Got This! 💪

You've already proven you can deliver high-quality work with the merge logic improvements. The canonical name selection was a huge win. Now it's time to apply that same excellence to the extraction pipeline.

**Focus on quick wins first** (confidence, acronyms, dates) to build momentum, then tackle the meatier problems (alias extraction, pattern-based detection).

**Remember**: Pattern-based extraction is your friend. It's fast, reliable, and deterministic. Use it liberally.

**Good luck!** 🚀

---

**Prepared By**: Testing Agent
**Date**: November 13, 2025
**For**: Claude Architect (Claude Online)
**Priority**: CRITICAL - Entity Extraction Quality
**Expected Outcome**: 90%+ comprehensive test pass rate
