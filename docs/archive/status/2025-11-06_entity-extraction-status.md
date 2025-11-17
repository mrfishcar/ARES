---
archived: true
archived_date: 2025-11-13
replaced_by: /docs/STATUS.md
reason: Consolidated into STATUS.md - historical extraction lab implementation details
original_date: 2025-11-10
---

# ARES Entity Extraction System - Current Status

**Last Updated**: 2025-11-06
**Branch**: `claude/test-entity-highlighting-011CUqUiydbXkB8vKzGsJrf3`
**Status**: ✅ Extraction Lab functional, 🔧 Refinement in progress

---

## 📋 Table of Contents

1. [What We Built](#what-we-built)
2. [Current Implementation](#current-implementation)
3. [Entity Detection Patterns](#entity-detection-patterns)
4. [Filters and Cleaners](#filters-and-cleaners)
5. [Testing Results](#testing-results)
6. [Known Issues](#known-issues)
7. [Macro-Level Vision](#macro-level-vision-book-scale-analysis)
8. [Next Steps](#next-steps)

---

## What We Built

### Extraction Lab (Browser-Based Testing Interface)

**Location**: `/app/ui/console/src/pages/ExtractionLab.tsx`

A split-pane testing interface that allows writers to:
- Paste narrative text into a CodeMirror editor
- See real-time entity highlighting (1-second debounce)
- View extracted entities by type with confidence scores
- Export detailed JSON reports via "Copy Report" button
- Test entity detection without running local parser

**Key Features**:
- ✅ Real-time entity highlighting with color coding
- ✅ Client-side deduplication (merges "David" into "King David")
- ✅ Performance optimized (1s debounce prevents UI blocking)
- ✅ Scrolling fixed for long documents
- ✅ JSON export for analysis

**Deployed**: Auto-deploys to Vercel on branch push

---

## Current Implementation

### Architecture

```
User Input (CodeMirror)
    ↓
Entity Highlighter (entityHighlighter.ts)
    ↓
Pattern Detection (Regex + Filters)
    ↓
Deduplication (ExtractionLab.tsx)
    ↓
Display + Export
```

### Entity Types Supported

- **PERSON**: Characters, authors, people
- **PLACE**: Locations, streets, geographical features
- **ORG**: Organizations, groups, collectives
- **EVENT**: Battles, wars, historical events
- **OBJECT**: Artifacts, books, magical items
- **CONCEPT**: Abstract ideas, theories

### Detection Strategy

**Multi-layered approach** (priority order):
1. Explicit tags: `[[Entity: Name]]`, `#Name:TYPE`
2. Dialogue attribution: `"...", said Harry`
3. Honorifics/titles: `Uncle Vernon`, `Professor McGonagall`
4. Possessive objects: `Philosopher's Stone` → OBJECT
5. Multi-word names: `Harry Potter`, `Hermione Granger`
6. Contextual patterns: prepositions, verbs, appositives
7. Single-name recurring: `Harry thought`, `Dudley moved`

---

## Entity Detection Patterns

### PERSON Patterns

**File**: `/app/editor/entityHighlighter.ts` lines 134-167

#### 1. Dialogue Attribution (Highest Priority)
```javascript
// "...", said Harry  OR  Harry said, "..."
"[^"]+",?\s+(Name)\s+(?:said|asked|replied|thought|felt|...)"
"Name\s+(?:said|asked|...)\s*(?:,|\s+that)"
```
**Catches**: "Nearly," said Harry → extracts "Harry"

#### 2. Honorifics and Titles
```javascript
"(?:Mr\.|Mrs\.|Aunt|Uncle|King|Queen|...)\s+(Name)"
```
**Catches**: Uncle Vernon, Aunt Petunia, Professor McGonagall

#### 3. Author Names with Initials
```javascript
"[A-Z]{1,3}\s+(Name)"
```
**Catches**: JK Rowling, CS Lewis, RR Tolkien

#### 4. Multi-word Names with Connectors
```javascript
"Name\s+(?:the|of|von|van|de)\s+Name"
```
**Catches**: Uriah the Hittite, Leonardo da Vinci

#### 5. Two-word Capitalized Names
```javascript
"(?<=[.!?]|[a-z])\s+(Name\s+Name)(?!\s+Street|Drive|...)"
```
**Catches**: Harry Potter, Hermione Granger (mid-sentence)

#### 6. Action Verbs Preceding Names
```javascript
"(?:married|met|kissed|bought|watched|...)\s+(Name)"
```
**Catches**: "bought Dudley", "kissed Hermione"

#### 7. Recurring Single Names
```javascript
"(?:and|but|when|while|as)\s+(Name)(?=\s+was|had|moved|thought)"
"[,;]\s+(Name)(?=\s+was|had|moved|...)"
```
**Catches**: "and Harry thought", ", Dudley moved"

### PLACE Patterns

**Lines 169-178**

- Street names: `Privet Drive`, `Baker Street`
- Prepositions: `in London`, `at Hogwarts`
- Geographic features: `Gondor Kingdom`, `Misty Mountains`

### OBJECT Patterns

**Lines 191-194**

Possessive object names:
```javascript
"Name's\s+(?:Stone|Ring|Sword|Crown|Wand|Staff|Book|Glass|Mirror|Cup|Goblet)"
```
**Catches**: Philosopher's Stone, Elder Wand, Slytherin's Locket

### EVENT Patterns

**Lines 186-188**

```javascript
"(?:Battle|War|Quest|Siege|Council)\s+of\s+(Name)"
```
**Catches**: Battle of Hogwarts, War of the Ring

---

## Filters and Cleaners

### False Positive Filters

**Lines 447-528**

#### 1. Pronouns
**Set**: `PRONOUNS` (he, she, it, they, him, her, etc.)
**Effect**: Filters out all pronouns from entity detection

#### 2. Time Words
**Set**: `TIME_WORDS` (Monday-Sunday, January-December)
**Effect**: ✅ Filters "Saturday", "March", etc.

#### 3. Abbreviations
**Set**: `ABBREVIATIONS` (Ch, Vol, Pg, Dr, Mr, Mrs, etc.)
**Effect**: ✅ Filters "Ch" from "Ch. 2"

#### 4. Common Adjectives
**Set**: `COMMON_ADJECTIVES` (Scotch, French, English, etc.)
**Effect**: ✅ Filters "Scotch tape", "French fries"

#### 5. Context Words
**Set**: `CONTEXT_WORDS` (yet, his, her, the, well, just, etc.)
**Effect**: "Yet Harry" → "Harry", "His Aunt" → "Aunt"

### Text Cleaners

**Lines 427-439**

- **Newline removal**: `\n` → space
- **Whitespace normalization**: Multiple spaces → single space
- **Context word stripping**: Leading "Yet", "His", "The" removed
- **Short word filter**: 1-2 letter words filtered (except known names)

### Special Filters

**Lines 512-528**

1. **Chapter Titles**: Filters "The Vanishing Glass" at document start
2. **Possessive-only**: Filters "Dudley's" when standalone possessive
3. **Object Reclassification**: Skips PERSON if matches OBJECT pattern

---

## Testing Results

### Test Corpus: Harry Potter Chapter 2

**Text Length**: ~2,300 characters
**Processing Time**: 9-12ms
**Entity Count**: 8-12 entities

### ✅ Working Correctly

- "Saturday" → filtered (time word)
- "Ch" → filtered (abbreviation)
- "Harry", "Dudley", "Piers" → detected
- "Uncle Vernon", "Aunt Petunia" → detected with titles
- "Dursleys" → classified as ORG

### ❌ Current Issues

1. **"Vanishing Glass"** - Still detected as PERSON (chapter title at start)
   - Filter checks for `"The\n"` but needs better start-of-text detection
   - **Status**: Fix deployed, awaiting retest

2. **"Uncle\nVernon"** - Text field contains literal newline
   - displayText is clean, but text field shows `"Uncle\nVernon"`
   - **Status**: Fix deployed (normalizes fullMatch in hashtag detection)

3. **Recurring characters under-detected**
   - Only 1 "Harry" detected, should be 8-10 mentions
   - Patterns too restrictive or not matching
   - **Status**: Simplified patterns deployed, awaiting retest

4. **Missing many character mentions**
   - "Harry thought", "Harry moved", "Harry felt" not caught
   - Need more aggressive single-name detection
   - **Status**: New verb-based patterns added

---

## Known Limitations

### 1. Pattern-Based Detection (Not Linguistic)

**Current**: Regex pattern matching (surface-level)
**Missing**: Syntactic parsing, dependency trees, grammatical structure

**Example**:
- We detect: "said Harry" → name pattern
- We don't use: Harry is grammatical subject (nsubj) → entity

### 2. No Cross-Sentence Entity Tracking

**Current**: Each sentence analyzed independently
**Missing**: Anaphora resolution ("Harry walked. He sat." → He = Harry)

**Example**:
- "Harry entered. He sat." → Only "Harry" detected, not "He"
- No coreference resolution

### 3. No Discourse-Level Analysis

**Current**: Local context windows (30 chars before/after)
**Missing**: Paragraph/chapter-level salience tracking

**Example**:
- Can't determine: "Who is the protagonist of this chapter?"
- No entity frequency/importance weighting

### 4. No Semantic Understanding

**Current**: Keyword matching, no meaning
**Missing**: Understanding roles, relationships, narrative structure

**Example**:
- Detects "Philosopher's Stone" as object
- Doesn't understand: it's a central plot device, owned by Dumbledore, sought by Voldemort

---

## Macro-Level Vision: Book-Scale Analysis

### The Problem

Current system works at **micro-level** (sentence/paragraph).
For a full book, we need **macro-level** discourse analysis.

### Human Reading Process

1. **Sentence Diagramming** → Subject-Verb-Object structure
2. **Paragraph Analysis** → Who is the focus? Who acts?
3. **Literary Criticism** → Discourse tracking, salience, narrative arcs

### What We Have (spaCy Parser)

**Location**: `getParserClient()` in entityHighlighter.ts (line 505)

**Capabilities**:
- Dependency parsing (subject, object, modifiers)
- POS tagging (proper nouns, verbs, etc.)
- Named Entity Recognition (statistical)
- Token-level analysis

**Currently**: Partially used for LLM detection mode
**Should be**: Core of our detection system

### Proposed Architecture: Book-Scale System

```
LEVEL 1: TOKEN ANALYSIS (Micro)
├─ Dependency parsing → grammatical subjects
├─ POS tagging → proper nouns
└─ Pattern matching → honorifics, dialogue

LEVEL 2: SENTENCE ANALYSIS
├─ Extract subjects + agents
├─ Resolve pronouns → coreference
└─ Track entity mentions per sentence

LEVEL 3: PARAGRAPH ANALYSIS
├─ Count entity frequency
├─ Identify paragraph protagonist
├─ Track entity salience
└─ Detect topic shifts

LEVEL 4: CHAPTER ANALYSIS (Macro)
├─ Build entity graph
├─ Track character arcs
├─ Detect relationships
└─ Identify main vs. supporting characters

LEVEL 5: BOOK ANALYSIS (Ultra-Macro)
├─ Global entity registry
├─ Alias resolution (Strider = Aragorn)
├─ Relationship network
└─ Narrative structure
```

### Entity Tagging Logic System

**User insight**: "If this equals that, and this equals that, then this must also equal that"

**Transitive Entity Resolution**:

```javascript
// Example from Harry Potter:
Tag 1: "Harry" mentions in Ch 1
Tag 2: "Harry Potter" in Ch 1
Tag 3: "Harry" mentions in Ch 2

Logic:
IF "Harry" in Ch1 refers to "Harry Potter" (explicit match)
AND "Harry" in Ch2 has same context pattern (lives at Dursleys, has scar)
THEN Ch2 "Harry" = Ch1 "Harry Potter" = same entity

// Build transitive closure:
aliases = {
  canonical: "Harry Potter",
  variants: ["Harry", "the boy who lived", "he", "him"]
}
```

### Implementation Strategy

#### Phase 1: Linguistic Foundation (Micro → Meso)

**Use spaCy dependency parsing**:
```javascript
function extractEntitiesWithSyntax(parsedDoc) {
  const entities = [];

  for (const sentence of parsedDoc.sentences) {
    // Find grammatical subjects (nsubj, nsubjpass)
    const subjects = sentence.tokens.filter(t =>
      (t.dep === 'nsubj' || t.dep === 'nsubjpass') &&
      t.pos === 'PROPN' // Proper noun
    );

    // High confidence: grammatical subjects are entities
    entities.push(...subjects.map(s => ({
      text: s.text,
      type: inferType(s, sentence),
      confidence: 0.95,
      source: 'syntax'
    })));
  }

  return entities;
}
```

#### Phase 2: Paragraph Discourse (Meso)

**Track entity salience**:
```javascript
function analyzeParagraph(text, entities) {
  // Count mentions
  const counts = countEntityMentions(entities);

  // Find subjects of sentences
  const subjects = extractGrammaticalSubjects(text);

  // First sentence = topic
  const topic = getFirstSentenceSubject(text);

  // Calculate salience score
  const salience = entities.map(e => ({
    entity: e,
    score: (
      counts[e.text] * 2 +           // Frequency
      (subjects.includes(e) ? 3 : 0) + // Agent role
      (topic === e ? 5 : 0)            // Topic position
    )
  }));

  // Protagonist = highest salience
  return salience.sort((a, b) => b.score - a.score)[0];
}
```

#### Phase 3: Cross-Reference Resolution (Macro)

**Entity registry with transitive closure**:
```javascript
class EntityRegistry {
  constructor() {
    this.entities = new Map(); // canonical -> entity data
    this.aliases = new Map();  // variant -> canonical
  }

  // Add entity with context
  add(name, context) {
    const canonical = this.findCanonical(name, context);

    if (canonical) {
      // Link variant to canonical
      this.aliases.set(name, canonical);
      this.entities.get(canonical).variants.add(name);
    } else {
      // New canonical entity
      this.entities.set(name, {
        canonical: name,
        variants: new Set([name]),
        contexts: [context],
        chapters: new Set([context.chapter])
      });
    }
  }

  // Find canonical form using transitive logic
  findCanonical(variant, context) {
    // Direct match
    if (this.aliases.has(variant)) {
      return this.aliases.get(variant);
    }

    // Substring match with context similarity
    for (const [canonical, data] of this.entities) {
      if (canonical.includes(variant) || variant.includes(canonical)) {
        // Check context similarity
        if (this.contextMatches(context, data.contexts)) {
          return canonical;
        }
      }
    }

    return null;
  }

  // Transitive: If A=B and B=C, then A=C
  merge(entity1, entity2) {
    const variants1 = this.entities.get(entity1).variants;
    const variants2 = this.entities.get(entity2).variants;

    // Merge all variants
    const merged = new Set([...variants1, ...variants2]);

    // Update all aliases to point to canonical
    for (const variant of merged) {
      this.aliases.set(variant, entity1);
    }

    this.entities.get(entity1).variants = merged;
    this.entities.delete(entity2);
  }
}
```

#### Phase 4: Book-Level Network (Ultra-Macro)

**Relationship graph**:
```javascript
class BookEntityNetwork {
  constructor() {
    this.registry = new EntityRegistry();
    this.relationships = new Map(); // entity -> [relations]
  }

  // Analyze entire book
  analyzeBook(chapters) {
    for (const chapter of chapters) {
      // Level 1: Extract entities
      const entities = this.extractChapterEntities(chapter);

      // Level 2: Register with context
      for (const entity of entities) {
        this.registry.add(entity.text, {
          chapter: chapter.number,
          position: entity.start,
          context: entity.context
        });
      }

      // Level 3: Find relationships
      const relations = this.extractRelationships(chapter, entities);
      this.relationships.set(chapter.number, relations);
    }

    // Level 4: Build global graph
    return this.buildGlobalGraph();
  }

  buildGlobalGraph() {
    const graph = {
      entities: Array.from(this.registry.entities.values()),
      relationships: this.mergeRelationships(),
      narrative: this.trackNarrativeArcs()
    };

    return graph;
  }
}
```

---

## Next Steps

### Immediate (Current Session)

1. ✅ Fix "Vanishing Glass" chapter title detection
2. ✅ Fix newline cleaning in hashtag detection
3. ✅ Improve recurring character detection patterns
4. ⏳ **RETEST** with Harry Potter text
5. ⏳ Run strategic test case (comprehensive entity coverage)

### Short-Term (Next Session)

1. **Implement syntactic parsing**:
   - Use spaCy dependency trees
   - Extract grammatical subjects (nsubj)
   - Filter by POS tags (PROPN = proper nouns)

2. **Add paragraph-level analysis**:
   - Entity frequency counting
   - Salience scoring
   - Protagonist detection per paragraph

3. **Improve entity deduplication**:
   - Context-aware merging
   - Similarity scoring
   - Variant detection ("Harry" vs "Harry Potter")

### Medium-Term (Future Sessions)

1. **Build entity registry**:
   - Canonical form tracking
   - Alias resolution
   - Transitive closure logic

2. **Cross-reference resolution**:
   - Pronoun → entity mapping
   - "He" → "Harry" resolution
   - Coreference chains

3. **Relationship extraction**:
   - Subject-verb-object triples
   - Entity interactions
   - Relationship graph

### Long-Term (Full Implementation)

1. **Book-scale system**:
   - Chapter-by-chapter processing
   - Global entity network
   - Narrative arc tracking

2. **Writer's knowledge graph**:
   - Visual entity relationships
   - Character importance ranking
   - Plot thread tracking

3. **Integration with ARES pipeline**:
   - Automatic relation extraction
   - Knowledge base population
   - Writer assistant features

---

## File Locations

### Core Files

- **Entity Highlighter**: `/app/editor/entityHighlighter.ts` (1000+ lines)
- **Extraction Lab**: `/app/ui/console/src/pages/ExtractionLab.tsx`
- **CodeMirror Editor**: `/app/ui/console/src/components/CodeMirrorEditor.tsx`
- **Styles**: `/app/ui/console/src/index.css`

### Parser Integration

- **Parser Client**: `/app/parser/index.ts`
- **Parse Types**: `/app/parser/parse-types.ts`

### Configuration

- **Vercel Config**: `/vercel.json`
- **TypeScript Config**: `/app/ui/console/tsconfig.json`

---

## Testing Strategy

### Current Approach

1. Paste test text into Extraction Lab
2. Wait 1 second for highlighting
3. Click "Copy Report" button
4. Analyze JSON output for accuracy

### Strategic Test Case

**File**: See conversation for comprehensive test covering:
- Author initials (JK Rowling, CS Lewis)
- Dialogue attribution
- Honorifics and titles
- Possessive objects
- Street names
- Recurring characters
- False positives to filter

### Metrics to Track

- **Precision**: % of detected entities that are correct
- **Recall**: % of actual entities detected
- **F1 Score**: Harmonic mean of precision and recall
- **Processing Time**: Should remain < 20ms for 2000 chars

---

## Key Insights from Development

### 1. Dialogue is Critical

Dialogue attribution is a goldmine for entity extraction:
- `"text", said Harry` → highly reliable pattern
- Don't filter quoted words blindly - analyze the full pattern

### 2. Context Words Matter

"Yet Harry Potter" vs "Harry Potter":
- Leading context words (yet, his, her, the) should be stripped
- But context is crucial for disambiguation

### 3. Pattern Priority is Everything

Order matters:
1. Explicit tags (100% confidence)
2. Dialogue (95% confidence)
3. Titles (90% confidence)
4. Multi-word (85% confidence)
5. Contextual (75% confidence)

### 4. False Positives Are Common

Without proper filtering, you get:
- Days of week as people
- Abbreviations as places
- Common adjectives as entities

### 5. Recurring Characters Need Special Handling

"Harry" appears 50+ times in a chapter:
- Can't rely on full name every time
- Need verb-based patterns
- Context + frequency = high confidence

### 6. Surface Patterns Have Limits

Regex can only go so far:
- Can't understand syntax
- Can't track discourse
- Can't resolve references
- **Need proper NLP** for book-scale analysis

---

## Questions for Next Session

1. Should we switch from regex patterns to spaCy dependency parsing?
2. How do we balance speed vs. accuracy at book scale?
3. What's the right granularity for entity tracking? (sentence/paragraph/chapter)
4. How do we handle entity disambiguation? ("John Smith" vs "John Doe")
5. Should we build a training corpus for entity detection?

---

## Deployment Status

**Branch**: `claude/test-entity-highlighting-011CUqUiydbXkB8vKzGsJrf3`
**Vercel**: Auto-deploys on push
**Build Status**: ✅ Passing (820KB bundle)
**Last Deploy**: After commit `690b294` (newline + recurring character fixes)

**Preview URL**: Check Vercel dashboard after push

---

## Command Reference

```bash
# Build locally
cd app/ui/console && npm run build

# Run dev server
npm run dev

# Type check
npx tsc --noEmit

# Deploy
git push origin claude/test-entity-highlighting-011CUqUiydbXkB8vKzGsJrf3
```

---

**End of Status Document**

*This document will be updated as the system evolves.*
