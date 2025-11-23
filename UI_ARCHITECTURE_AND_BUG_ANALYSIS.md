# ARES Extraction Lab - UI Architecture & Bug Analysis

**Comprehensive technical guide to the Extraction Lab UI, data flow, and identified bugs.**

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Flow](#data-flow)
3. [Component Breakdown](#component-breakdown)
4. [Critical Systems](#critical-systems)
5. [Identified Bugs & Issues](#identified-bugs--issues)
6. [Testing Recommendations](#testing-recommendations)

---

## Architecture Overview

### High-Level Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    ExtractionLab (Page)                         │
│  - State: text, entities, relations                             │
│  - Manages text → extraction → entities → highlighting flow    │
└────────────────────┬────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌─────────────────────┐  ┌──────────────────────┐
│ CodeMirrorEditor    │  │ EntityResultsPanel   │
│ - Renders text      │  │ - Shows extracted    │
│ - Handles editing   │  │   entities & relations
│ - Highlights entities
│ - Context menu      │
└─────────────────────┘  └──────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│  CodeMirror Extensions:                     │
│  1. entityHighlighterExtension              │
│  2. manualTagHidingExtension                │
│  3. contextMenuHandler                      │
│  4. editorTheme (markdown live preview)     │
└─────────────────────────────────────────────┘
```

### Data Flow Diagram

```
USER TYPES TEXT
    ▼
ExtractionLab.setText() updates state
    ▼
useEffect triggers extractEntities(text)
    ▼
stripIncompleteTagsForExtraction(text)
  │ Removes incomplete tags like "#Cory:" at EOF
    ▼
API Call: POST /extract-entities
  │ Backend returns: entities[], relations[]
    ▼
parseManualTags(originalText)
  │ Parses: #Entity:TYPE, #[Multi Word]:TYPE, Entity:ALIAS_OF_, Entity:REJECT_ENTITY
    ▼
deduplicateEntities(autoDetected)
  │ Merges overlapping/nested entities
    ▼
mergeManualAndAutoEntities()
  │ Combines auto-detected with manual, respects rejections
    ▼
setEntities(mergedEntities) + setRelations()
    ▼
CodeMirrorEditor receives entities prop
    ▼
useEffect updates entitiesRef.current
    ▼
CodeMirror dispatch empty update to rebuild decorations
    ▼
entityHighlighterExtension runs buildEntityDecorations()
  │ Creates visual highlights from entities
    ▼
manualTagHidingExtension runs buildTagHidingDecorations()
  │ Hides tag syntax (#, :TYPE) in pretty mode
  │ Shows EntityNameWidget with colored text
    ▼
USER SEES: Highlighted text with hidden tags + pretty formatting
```

---

## Data Flow

### 1. Text Input Flow

**File**: `ExtractionLab.tsx:327-445`

```typescript
// Line 328: State
const [text, setText] = useState('');

// Line 442-444: useEffect triggers extraction on text change
useEffect(() => {
  extractEntities(text);
}, [text, extractEntities]);

// Line 338-440: extractEntities function (debounced 1000ms)
const extractEntities = useCallback(
  debounce(async (text: string) => {
    // 1. Strip incomplete tags
    const textForExtraction = stripIncompleteTagsForExtraction(text);

    // 2. Call API
    const response = await fetch(`${apiUrl}/extract-entities`, {
      method: 'POST',
      body: JSON.stringify({ text: textForExtraction })
    });

    // 3. Transform response to EntitySpan[]
    const extractedEntities = data.entities.flatMap(entity =>
      entity.spans.map(span => ({ ...span, type: entity.type }))
    );

    // 4. Parse manual tags from ORIGINAL text (with tags)
    const { entities: manualTags, rejections } = parseManualTags(text);

    // 5. Merge auto + manual
    const mergedEntities = mergeManualAndAutoEntities(
      extractedEntities,
      manualTags,
      rejections,
      text
    );

    // 6. Update state
    setEntities(mergedEntities);
    setRelations(data.relations || []);
  }, 1000)
);
```

**Key Points**:
- Debounce prevents excessive API calls
- Text for extraction is STRIPPED of incomplete tags
- Manual tags parsed from ORIGINAL text (with tags)
- Positions from API are from stripped text, but manual tag positions are from original text
- ⚠️ **POTENTIAL BUG**: Position mismatch if text has manual tags!

---

### 2. Manual Tag Parsing

**File**: `ExtractionLab.tsx:51-139`

Supports these tag formats:
```
#Entity:TYPE              → #Gondor:PLACE
#[Multi Word]:TYPE        → #[King Aragorn]:PERSON
Entity:ALIAS_OF_Canonical:TYPE  → Frodo:ALIAS_OF_Hobbit:PERSON
Entity:REJECT_ENTITY      → Harry:REJECT_ENTITY
```

**Regex Pattern** (Line 57):
```typescript
const tagRegex =
  /#\[([^\]]+)\]:(\w+)|           // #[Multi Word]:TYPE
  #(\w+):(\w+)|                   // #Entity:TYPE
  (\w+):ALIAS_OF_([^:]+):(\w+)|   // Entity:ALIAS_OF_Canonical:TYPE
  (\w+)(?:[.,!?;-]*):REJECT_ENTITY/g;  // Entity:REJECT_ENTITY
```

**Processing** (Lines 64-136):
- Detects tag location in raw text
- Normalizes underscores to spaces for unbracketed forms
- Keeps bracketed forms exactly as typed
- Creates EntitySpan for each tag format
- Tracks rejections separately

---

### 3. Incomplete Tag Stripping

**File**: `ExtractionLab.tsx:181-202`

```typescript
function stripIncompleteTagsForExtraction(rawText: string): string {
  const lastHashIndex = rawText.lastIndexOf('#');
  if (lastHashIndex === -1) return rawText;

  const lastPart = rawText.slice(lastHashIndex);

  // If last # sequence doesn't end with space, it's being typed
  if (!lastPart.endsWith(' ')) {
    return rawText.slice(0, lastHashIndex);  // Strip it
  }

  return rawText;  // Keep everything
}
```

**Examples**:
- `"text #Mount"` → Stripped to `"text "` (being typed)
- `"text #Mount:PLACE "` → Kept as-is (has space, committed)
- `"text #Mount:PLACE and #Dragon"` → Stripped to `"text #Mount:PLACE and "` (last tag incomplete)

---

### 4. Entity Merging & Deduplication

**File**: `ExtractionLab.tsx:215-320`

Two-step process:

**Step 1: Deduplicate auto-detected entities** (260-320)
- Groups by type
- Sorts by length (longest first)
- Merges shorter names into longer ones
- Example: "David" merged into "King David"

**Step 2: Merge manual + auto** (215-254)
- Filters auto-detected to remove overlaps with:
  - Manual tags
  - Incomplete tags being typed
  - Rejected words
- Combines: manual tags + filtered auto-detected
- Sorts by position

---

### 5. CodeMirror Highlighting

**File**: `CodeMirrorEditor.tsx:42-90`

```typescript
function entityHighlighterExtension(getEntities) {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildEntityDecorations(state, getEntities());
    },
    update(deco, tr) {
      // Always rebuild - getEntities() gives fresh entities
      return buildEntityDecorations(tr.state, getEntities());
    },
    provide: f => EditorView.decorations.from(f)
  });
}

function buildEntityDecorations(state, entities) {
  const builder = new RangeSetBuilder<Decoration>();
  const text = state.doc.toString();

  for (const entity of entities) {
    if (entity.start >= 0 && entity.end <= text.length && entity.start < entity.end) {
      const color = getEntityTypeColor(entity.type);
      builder.add(entity.start, entity.end, Decoration.mark({
        class: 'cm-entity-highlight',
        style: `
          background: linear-gradient(90deg,
            ${color}00 0%, ${color}20 10%, ${color}30 30%,
            ${color}30 70%, ${color}20 90%, ${color}00 100%);
          box-shadow: inset 0 2px 4px ${color}26, inset 0 -2px 4px ${color}26;
          cursor: pointer;
        `
      }));
    }
  }

  return builder.finish();
}
```

**Key Points**:
- Extension rebuilds decorations on EVERY update
- Uses ref (entitiesRef) to access latest entities
- Validates: `entity.start >= 0 && entity.end <= text.length && entity.start < entity.end`
- Applies Kindle-style feathered gradient highlight

---

### 6. Manual Tag Hiding (Pretty Mode)

**File**: `CodeMirrorEditor.tsx:218-352`

In "pretty mode" (renderMarkdown=true):
- Hides tag syntax (#, :TYPE)
- Replaces entire tag with EntityNameWidget
- Widget displays just the entity name in color

**Critical Logic** (Lines 258-294):
```typescript
// CRITICAL: Identify incomplete tag being typed (protected zone)
// From # to SPACE = protected. Only hide tags that have been "committed" with a space.

let incompleteTagStart = -1;
let incompleteTagEnd = -1;

const tagRegex = /#\[([^\]]+)\]:(\w+)|#(\w+):(\w+)|...|(\w+)(?:[.,!?;-]*):REJECT_ENTITY/g;

// Find LAST complete tag match
let lastTagMatch = null;
let tempMatch;
while ((tempMatch = tagRegex.exec(text)) !== null) {
  lastTagMatch = tempMatch;
}

// Check if last tag is COMMITTED
if (lastTagMatch) {
  const matchEnd = lastTagMatch.index + lastTagMatch[0].length;
  // Tag is COMMITTED only if there's an explicit terminating character after
  // Terminating chars: space, period, comma, etc.
  // DO NOT treat EOF as terminator (user might still be typing)
  const isCommitted = matchEnd < text.length && /\W/.test(text[matchEnd]);

  if (!isCommitted) {
    // Still being typed - protect from hiding
    incompleteTagStart = lastTagMatch.index;
    incompleteTagEnd = text.length;
  }
}
```

**Widget Creation** (Lines 340-348):
```typescript
if (!entityToUse) continue;  // Skip if no entity found

const color = getEntityTypeColor(entityToUse.type);
builder.add(
  matchStart,
  matchEnd,
  Decoration.replace({
    widget: new EntityNameWidget(entityToUse.text, color, entityToUse)
  })
);
```

---

### 7. Context Menu Handler

**File**: `CodeMirrorEditor.tsx:358-403`

```typescript
function contextMenuHandler(setContextMenu, entitiesRef) {
  return EditorView.domEventHandlers({
    contextmenu: (event, view) => {
      const target = event.target as HTMLElement;

      // Walk up DOM tree to find element with data-entity attribute
      const elementWithData = target.closest('[data-entity]') as HTMLElement | null;

      if (!elementWithData) {
        console.log('[ContextMenu] No data-entity found');
        return false;
      }

      const entityData = elementWithData.getAttribute('data-entity');
      if (entityData) {
        event.preventDefault();
        const entity = JSON.parse(entityData) as EntitySpan;

        setContextMenu({
          position: { x: event.clientX, y: event.clientY },
          entity
        });
        return true;
      }

      return false;
    }
  });
}
```

**Key Points**:
- Uses DOM.closest() to find parent with data-entity
- Parses JSON from data-entity attribute
- Shows context menu with 4 actions

---

## Component Breakdown

### ExtractionLab.tsx (Main Page Component)

**Responsibilities**:
1. Manage text state
2. Call extraction API
3. Parse manual tags
4. Merge auto + manual entities
5. Handle user actions (Change Type, Reject, Create New)
6. Display results

**Key Functions**:
- `stripIncompleteTagsForExtraction()` - Removes incomplete tags
- `parseManualTags()` - Parses tag syntax
- `mergeManualAndAutoEntities()` - Combines auto + manual
- `deduplicateEntities()` - Removes overlaps
- `extractEntities()` - Debounced API call (1000ms)

**State**:
```typescript
const [text, setText] = useState('');                    // Raw text with tags
const [entities, setEntities] = useState<EntitySpan[]>([]);  // Merged entities
const [relations, setRelations] = useState<Relation[]>([]);  // Extracted relations
const [processing, setProcessing] = useState(false);     // Loading state
const [stats, setStats] = useState({...});               // Time, confidence, counts
```

---

### CodeMirrorEditor.tsx (Text Editor Component)

**Responsibilities**:
1. Render CodeMirror editor
2. Manage markdown live preview
3. Apply entity highlighting
4. Hide/show tag syntax (pretty mode)
5. Handle context menu
6. Dispatch text changes

**Key Extensions**:
1. **entityHighlighterExtension** - Visual highlights
2. **manualTagHidingExtension** - Hide tag syntax
3. **contextMenuHandler** - Right-click menu
4. **editorTheme** - Markdown live preview styling

**Refs**:
```typescript
const entitiesRef = useRef<EntitySpan[]>(entities);
const renderMarkdownRef = useRef<boolean>(renderMarkdown);
```
These keep decorations in sync with latest data without re-creating extensions.

---

### Key Infrastructure Files

**entities.ts** (Types and validation)
- Defines EntityType (27 types)
- EntitySpan interface
- getEntityTypeColor() function
- isValidEntityType() guard

**entityHighlighter.ts** (Backend entity detection)
- NOT used directly in frontend
- Provides patterns and logic for backend
- Referenced for documentation

---

## Critical Systems

### System 1: Position Tracking

**THE PROBLEM**:
Text has two forms:
1. **With tags** (what user sees, what CodeMirror renders)
2. **Without tags** (stripped, sent to API)

Auto-detected entities come from stripped text, but highlighting needs to work on the original text with tags!

**Example**:
```
Original:   "Aragorn:PERSON married Arwen"
Stripped:   "Aragorn married Arwen"

API returns: Entity "Aragorn" at position 0-7 (in stripped text)
But in original text with tags, "Aragorn" is still at 0-7!
```

**How ARES Handles It**:
- API returns positions relative to STRIPPED text
- Manual tags are found in ORIGINAL text
- When merging, they need to align

⚠️ **BUG RISK**: If API positions don't match original text positions, highlighting will be wrong!

---

### System 2: Incomplete Tag Protection

**THE PROBLEM**: User typing `"text #Mount:P"` (incomplete)

**Solution Implemented**:
1. **stripIncompleteTagsForExtraction()** - Removes from API call
2. **findIncompleteTagRegions()** - Identifies regions being typed
3. **mergeManualAndAutoEntities()** - Excludes incomplete regions
4. **buildTagHidingDecorations()** - Protects incomplete tags from hiding

The logic checks:
- Is this tag followed by whitespace (committed)?
- If NO → it's being typed (protect it)
- If YES → it's committed (can hide)

⚠️ **BUG RISK**: EOF (end of file) is NOT treated as a terminator, so `"text #Mount"` at EOF is treated as incomplete. But is this always desired?

---

### System 3: Entity Deduplication

**THE PROBLEM**:
```
Auto-detected: "Aragorn" (0-7), "Aragorn" (23-30), "King" (10-14), "King Aragorn" (10-21)
Should merge to: "Aragorn" (0-7), "Aragorn" (23-30), "King Aragorn" (10-21)
```

**Algorithm**:
1. Group by type
2. Sort by length (longest first)
3. For each entity, check if any other contains it
4. Mark as "merged" if contained

```typescript
// If longer contains this one, skip
if (otherLower.includes(longerLower)) {
  merged.add(i);
  kept = false;
  break;
}
```

⚠️ **BUG RISK**: String containment (`includes()`) is too simple for overlapping entities that don't nest properly!

---

### System 4: Manual Tag to Auto Entity Merging

**THE PROBLEM**:
- Manual tags at position X in original text
- Auto entities at position X in stripped text
- Might not match if tag syntax affects positions!

**Example**:
```
Original:   "#Aragorn:PERSON married"  (position 0-21)
Stripped:   "married"                    (position 0-7)

Manual tag "Aragorn" → position 1-8 in original
Auto "married" → position 0-7 in stripped

These overlap in the merging logic!
```

**Current Logic**:
```typescript
// Check if auto entity position is covered by manual tag
if (!(entity.end <= manual.start || entity.start >= manual.end)) {
  return false;  // Overlaps with manual tag, exclude it
}
```

⚠️ **BUG RISK**: This comparison works if positions are from the SAME text (both original or both stripped), but fails if mixed!

---

### System 5: Widget Rendering & Entity Data

**THE PROBLEM**:
Entity data must be available to context menu when user right-clicks.

**Solution**:
1. EntityHighlighterExtension adds `data-entity` attribute to marks
2. EntityNameWidget also adds `data-entity` to widget DOM
3. contextMenuHandler walks up DOM tree to find `[data-entity]`
4. Parses JSON to reconstruct entity object

**Code** (EntityNameWidget.tsx:114-130):
```typescript
toDOM() {
  const span = document.createElement('span');
  span.textContent = this.displayName;

  if (this.entityData) {
    span.setAttribute('data-entity', JSON.stringify(this.entityData));
  }

  // Kindle-style highlight
  span.style.background = `...`;
  span.style.boxShadow = `...`;

  return span;
}
```

⚠️ **BUG RISK**: If CodeMirror's DOM structure changes (wraps widget in additional elements), closest() might not find the data-entity attribute!

---

## Identified Bugs & Issues

### BUG #1: Position Misalignment Between Stripped and Original Text

**Severity**: 🔴 **CRITICAL**

**Location**: `ExtractionLab.tsx:337-420`

**Problem**:
The extraction flow mixes positions from two different text versions:
1. Auto-detected entities come from API which processes STRIPPED text (no tags)
2. Manual tags are parsed from ORIGINAL text (with tags)
3. When merging, we compare positions as if they're from the same text!

**Example Scenario**:
```
User writes: "Aragorn married Arwen"
Manually tags: "#Aragorn:PERSON married #Arwen:PLACE"

Original text:         "#Aragorn:PERSON married #Arwen:PLACE"
                        0        19         26         40

Stripped for API:      "Aragorn married Arwen"
                       0        8          17

API returns:
- "married" at position 8-15 (in stripped text)

Manual tags:
- "Aragorn" at position 1-8 (in original text)
- "Arwen" at position 27-32 (in original text)

When comparing positions:
- Entity "married" (8-15) vs Manual "Aragorn" (1-8) → overlap detected! WRONG!
- Entity "married" (8-15) vs Manual "Arwen" (27-32) → no overlap. Correct by accident!
```

**Root Cause**:
- stripIncompleteTagsForExtraction() removes tag syntax before sending to API
- But parseManualTags() works on original text with tags
- Positions from API are relative to stripped text
- Positions from manual tags are relative to original text
- These don't align!

**Expected Behavior**:
- Entity "married" should be highlighted correctly in the ORIGINAL text
- But the position (8-15 from stripped) would highlight the wrong characters

**How to Reproduce**:
1. Paste: "Aragorn married Arwen"
2. Manually tag: `#Aragorn:PERSON married #Arwen:PLACE`
3. Observe: Are the auto-detected "married" and manual tags highlighting correctly?
4. Expected: Yes, they should be in correct positions
5. Likely: Might see highlighting at wrong positions

**Code Path**:
```
stripIncompleteTagsForExtraction(text)
  → sends stripped text to API
→ API returns positions in stripped text
→ parseManualTags(text)  // ORIGINAL text!
  → positions in original text
→ mergeManualAndAutoEntities()
  → COMPARES POSITIONS FROM TWO DIFFERENT TEXTS!
```

**Proposed Fix**:
Option A: Adjust API response positions to account for tag syntax
Option B: Re-map positions to original text before merging
Option C: Parse manual tags AFTER stripping (not ideal, loses manual tag intent)

---

### BUG #2: Incomplete Tag Stripping May Be Too Aggressive

**Severity**: 🟡 **MEDIUM**

**Location**: `ExtractionLab.tsx:181-202`

**Problem**:
The function assumes "if last # sequence doesn't end with space, strip it". But this fails for:
1. End of file with complete tag: `"text #Gondor:PLACE"` (no space after)
2. Complete tag followed by punctuation: `"text #Gondor:PLACE."` (period, not space)

**Code**:
```typescript
function stripIncompleteTagsForExtraction(rawText: string): string {
  const lastHashIndex = rawText.lastIndexOf('#');
  if (lastHashIndex === -1) return rawText;

  const lastPart = rawText.slice(lastHashIndex);

  // If last # sequence doesn't end with space, it's being typed
  if (!lastPart.endsWith(' ')) {
    return rawText.slice(0, lastHashIndex);  // Strip it
  }

  return rawText;
}
```

**Example Failures**:
- `"text #Gondor:PLACE"` (EOF) → Stripped to `"text "` ✗ (Should keep tag)
- `"text #Gondor:PLACE."` (period) → Stripped to `"text ."` ✗ (Should keep tag)
- `"text #Gondor:PLACE!"` (exclamation) → Stripped to `"text !"` ✗ (Should keep tag)

**Expected Behavior**:
Only strip if the tag is genuinely incomplete:
- `"text #Gond"` → Strip (no colon yet)
- `"text #Gondor:"` → Strip (no type yet)
- `"text #Gondor:PL"` → Strip (incomplete type)
- `"text #Gondor:PLACE"` → Keep (complete, even at EOF)

**Proper Solution**:
Check if the tag MATCHES the regex pattern for complete tags:
```typescript
function stripIncompleteTagsForExtraction(rawText: string): string {
  const lastHashIndex = rawText.lastIndexOf('#');
  if (lastHashIndex === -1) return rawText;

  const lastPart = rawText.slice(lastHashIndex);

  // Check if last # sequence matches complete tag pattern
  const completeTagRegex = /^#\[([^\]]+)\]:(\w+)|^#(\w+):(\w+)/;

  if (completeTagRegex.test(lastPart)) {
    return rawText;  // Complete tag, keep it
  }

  return rawText.slice(0, lastHashIndex);  // Incomplete, strip it
}
```

---

### BUG #3: Deduplication Uses String Containment Instead of Positional Overlap

**Severity**: 🟡 **MEDIUM**

**Location**: `ExtractionLab.tsx:260-320`

**Problem**:
The deduplication algorithm uses `String.includes()` to detect overlaps:
```typescript
if (otherLower.includes(longerLower)) {
  merged.add(i);
  kept = false;
  break;
}
```

This is wrong because:
1. String containment ≠ positional overlap
2. Entities with same text but different positions aren't merged

**Example Failures**:
```
Entities:
- "King" at position 10-14
- "Aragorn" at position 15-22
- "King Aragorn" at position 10-22

After sorting by length: ["King Aragorn", "Aragorn", "King"]

Processing "Aragorn" (15-22):
- Is "Aragorn" in "King Aragorn"? YES → Merged (correct by accident)

Processing "King" (10-14):
- Is "King" in "King Aragorn"? YES → Merged (correct by accident)

BUT what if:
- "Aragorn" at position 100-107
- "King Aragorn" at position 10-22

Processing "Aragorn" (100-107):
- Is "Aragorn" in "King Aragorn"? YES → Merged (WRONG! Different positions!)
```

**Real-World Issue**:
If "Aragorn" appears multiple times with different types:
- "Aragorn" as PERSON at position 0-7
- "Aragorn" as PLACE at position 50-57 (unlikely but possible with type conflicts)
- "King Aragorn" as PERSON at position 0-12

The algorithm would wrongly merge the PLACE entity into the PERSON entity because they have the same text!

**Proper Solution**:
Check positional overlap, not string containment:
```typescript
function deduplicateEntities(entities: EntitySpan[]): EntitySpan[] {
  if (entities.length === 0) return entities;

  // Sort by position, then by length
  const sorted = [...entities].sort((a, b) =>
    a.start - b.start || (b.end - b.start) - (a.end - a.start)
  );

  const deduplicated: EntitySpan[] = [];
  const merged = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (merged.has(i)) continue;

    const current = sorted[i];
    let kept = true;

    // Check if current is contained in any longer entity already added
    for (const added of deduplicated) {
      // Positional overlap: current is inside added
      if (current.start >= added.start && current.end <= added.end) {
        kept = false;
        break;
      }
    }

    if (kept) {
      // Check which later entities should be merged into this
      for (let j = i + 1; j < sorted.length; j++) {
        if (merged.has(j)) continue;

        const later = sorted[j];
        // If later is inside current (positionally), mark as merged
        if (later.start >= current.start && later.end <= current.end) {
          merged.add(j);
        }
      }

      deduplicated.push(current);
    }
  }

  return deduplicated;
}
```

---

### BUG #4: Context Menu Might Not Find Entity if DOM Changes

**Severity**: 🟡 **MEDIUM**

**Location**: `CodeMirrorEditor.tsx:358-403`

**Problem**:
The context menu handler uses `closest('[data-entity]')` to find the entity element:
```typescript
const elementWithData = target.closest('[data-entity]') as HTMLElement | null;
```

This assumes:
1. The clicked element or a direct parent has `data-entity` attribute
2. CodeMirror's DOM structure remains stable

If CodeMirror or the EntityNameWidget add intermediate elements (divs, spans), the DOM traversal might fail.

**Example**:
```
Clicked element:
<span>                           ← target (user clicked here)
  <span data-entity="...">       ← We need to find this
    <span>Aragorn</span>         ← actual text
  </span>
</span>
```

Works fine. But if CodeMirror wraps it:
```
<div class="cm-widget">          ← target might be here
  <span data-entity="...">       ← or here
    <span>Aragorn</span>         ← or here
  </span>
</div>
```

The `closest()` call should still work, but if code changes to use `querySelector()` or assumes a specific depth, it might break.

**Current Safety**:
```typescript
if (!elementWithData) {
  console.log('[ContextMenu] No data-entity found');
  return false;  // Gracefully fails
}
```

So it won't crash, but the right-click menu won't work.

**Improved Solution**:
```typescript
// Walk up further, or use a different selector
const elementWithData = target.closest('[data-entity]')
  || target.closest('.cm-entity-highlight')?.[...all parents]...
```

Or store entity reference in a Map:
```typescript
const entityMap = new Map<HTMLElement, EntitySpan>();

// When creating decoration:
const element = ... ;
entityMap.set(element, entity);

// When right-clicking:
const entity = entityMap.get(target);
```

---

### BUG #5: Widget Data Lost if Entity Updates During Render

**Severity**: 🟡 **MEDIUM**

**Location**: `CodeMirrorEditor.tsx:99-193` (EntityNameWidget)

**Problem**:
The EntityNameWidget stores entity data at construction time. If entities update while decorations are rebuilding, the widget might have stale data.

**Example**:
```
1. User types "Aragorn" → Entity created with id=1
2. EntityNameWidget created with entityData={id:1, text:"Aragorn"}
3. User changes type with context menu
4. New entity created with id=2
5. Decorations rebuild
6. BUT old widget still has id=1 in its data-entity attribute!
```

**The Issue**:
```typescript
class EntityNameWidget extends WidgetType {
  constructor(
    private displayName: string,
    private highlightColor: string,
    private entityData?: EntitySpan  // ← Captured at construction time
  ) { }

  toDOM() {
    span.setAttribute('data-entity', JSON.stringify(this.entityData));
  }
}
```

If entityData changes between widget creation and rendering, the DOM will have outdated data.

**Current Mitigation**:
The `eq()` method checks if entity changed:
```typescript
eq(other: WidgetType) {
  // ... compare properties including entity data
  return (
    otherEntity.type === this.entityData.type &&
    otherEntity.start === this.entityData.start &&
    otherEntity.end === this.entityData.end &&
    otherEntity.text === this.entityData.text
  );
}
```

If entity changed, widget is reconstructed. But if the reconstruction is delayed or async, old data might be displayed temporarily.

---

### BUG #6: Rejection Filtering Uses Word Match, Not Position Match

**Severity**: 🟡 **MEDIUM**

**Location**: `ExtractionLab.tsx:220-248`

**Problem**:
Rejections filter auto-detected entities by word:
```typescript
if (rejections.has(entity.text.toLowerCase())) {
  return false;  // Excluded - this word is rejected
}
```

This is too broad! Rejecting "Harry" rejects ALL mentions of "Harry", but you might want to:
- Reject "Harry" in one paragraph
- Keep "Harry" in another paragraph
- Reject only the dialogue occurrence of "Harry", not the narrative one

**Example**:
```
Text: "Harry walked in. 'Harry!' cried Ron. Harry was surprised."

User rejects first "Harry" by right-clicking on first mention.

Current behavior:
ALL three "Harry" instances are marked as rejected.

Desired behavior:
Only the first "Harry" is rejected. Other mentions remain highlighted.
```

**Code Path**:
```typescript
const { entities: manualTags, rejections } = parseManualTags(text);
// rejections = Set { "harry" }

const nonOverlapping = autoDetected.filter((entity) => {
  if (rejections.has(entity.text.toLowerCase())) {
    return false;  // ALL instances of this word are filtered out
  }
  return true;
});
```

**Better Solution**:
Track rejections by (text, position) or (text, hash), not just text:
```typescript
// In parseManualTags:
rejections.add(match[8].toLowerCase());  // Current: just word

// Better:
rejections.add(`${match[8].toLowerCase()}@${matchStart}`);  // Word + position
```

Then in filter:
```typescript
const rejectionKey = `${entity.text.toLowerCase()}@${entity.start}`;
if (rejections.has(rejectionKey)) return false;
```

---

### BUG #7: Manual Tag Parsing Doesn't Validate Entity Types Against 27-Type Schema

**Severity**: 🟠 **LOW-MEDIUM**

**Location**: `ExtractionLab.tsx:64-136`

**Problem**:
When parsing manual tags, the code checks `isValidEntityType()` but this validation isn't consistently applied:

```typescript
if (isValidEntityType(type as EntityType)) {
  manualEntities.push({...});
}
```

But what if user types `#Aragorn:INVALID_TYPE`? The tag is silently ignored, and the user doesn't know why their tag didn't work.

**Better Solution**:
```typescript
if (!isValidEntityType(type as EntityType)) {
  console.warn(`Invalid entity type: ${type}. Valid types: ${[...validTypes].join(', ')}`);
  // Show user feedback or keep the entity as MISC
}
```

---

### BUG #8: No Feedback for Incomplete Tags During Typing

**Severity**: 🟠 **LOW-MEDIUM**

**Location**: Both files

**Problem**:
User types `#Gondor:PLA` and gets no visual feedback that the tag is incomplete. The tag is stripped from extraction, so entities from that partial tag don't appear.

**Example**:
```
User typing: "Gondor is #Gondor:PLA"
              (incomplete type)

Result: "Gondor is " sent to API (tag stripped)
         API doesn't see the second Gondor
         User sees entity highlighted only once
         User is confused why second mention isn't highlighted
```

**Better Solution**:
1. Show visual indicator for incomplete tags (e.g., red border)
2. Show tooltip: "Tag incomplete: needs entity type (e.g., :PLACE)"
3. Show list of valid types when user types `:`

---

### BUG #9: No Undo/Redo Support for Tag Changes

**Severity**: 🟠 **LOW**

**Location**: `ExtractionLab.tsx:449-555`

**Problem**:
When user clicks "Change Type" in context menu, the text is updated directly without going through CodeMirror's undo history. This means:
1. User right-clicks, changes type
2. User hits Ctrl+Z
3. Expected: Type change undone
4. Actual: Text change undone, but extraction state might not sync

**Better Solution**:
Use CodeMirror's transaction API to ensure undo/redo works:
```typescript
viewRef.current?.dispatch({
  changes: {
    from: entity.start,
    to: entity.end,
    insert: newTag
  }
});
```

---

### BUG #10: API Error Handling Is Incomplete

**Severity**: 🠠 **LOW**

**Location**: `ExtractionLab.tsx:430-437`

**Problem**:
```typescript
} catch (error) {
  console.error('Extraction failed:', error);
  toast.error(`Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  setEntities([]);
  setRelations([]);
}
```

This clears entities on any error, which means:
1. Network glitch causes error
2. All previously extracted entities disappear
3. Text looks unhighlighted
4. User thinks data was lost

**Better Solution**:
Keep previous entities while error is transient:
```typescript
} catch (error) {
  console.error('Extraction failed:', error);
  // Keep previous entities for now
  // Show temporary error indicator instead of clearing
  // Retry on next user input
}
```

---

## Testing Recommendations

### Test Case 1: Manual Tag + Auto-Detected Entity Positioning

**File**: Create `/tests/ui/position-alignment.test.ts`

```typescript
test('manual tags and auto-detected entities align', async () => {
  const text = "#Aragorn:PERSON married #Arwen:PLACE";

  // Extract with the component
  const lab = render(<ExtractionLab />);

  // Type text
  await userEvent.type(editor, text);

  // Wait for extraction
  await waitFor(() => {
    expect(screen.getByText('Processing...')).not.toBeInTheDocument();
  });

  // Check highlights are positioned correctly
  const highlights = document.querySelectorAll('.cm-entity-highlight');

  // "Aragorn" should be highlighted at position where it actually appears
  const aragornSpan = Array.from(highlights).find(el =>
    el.textContent?.includes('Aragorn')
  );
  expect(aragornSpan).toBeTruthy();

  // "married" should also be highlighted
  const marriedSpan = Array.from(highlights).find(el =>
    el.textContent?.includes('married')
  );
  expect(marriedSpan).toBeTruthy();
});
```

### Test Case 2: Incomplete Tag Stripping

```typescript
test('incomplete tags are stripped before extraction', async () => {
  const mockFetch = jest.spyOn(global, 'fetch');

  const text = "Gondor is #Gondor:PLA";  // Incomplete

  // Type incomplete tag
  await userEvent.type(editor, text);
  await waitFor(() => {
    // Wait for debounce
  }, { timeout: 1500 });

  // Check what was sent to API
  const callArgs = mockFetch.mock.calls[0];
  const body = JSON.parse(callArgs[1].body);

  expect(body.text).toBe("Gondor is ");  // Tag stripped
  expect(body.text).not.toContain("#");
});
```

### Test Case 3: Rejection Filtering

```typescript
test('reject action removes entity from display', async () => {
  const text = "Harry walked. Harry ran. Harry jumped.";

  await userEvent.type(editor, text);
  await waitFor(() => {
    const highlights = document.querySelectorAll('.cm-entity-highlight');
    expect(highlights.length).toBeGreaterThan(0);
  });

  // Right-click first Harry and reject
  const firstHarry = document.querySelectorAll('[data-entity*="Harry"]')[0];
  await userEvent.pointer({ target: firstHarry, keys: '[MouseRight]' });

  // Click "Reject"
  await userEvent.click(screen.getByText('Reject'));

  // All Harrys should be filtered
  await waitFor(() => {
    const highlights = document.querySelectorAll('[data-entity*="Harry"]');
    expect(highlights.length).toBe(0);
  });
});
```

### Test Case 4: Context Menu DOM Traversal

```typescript
test('context menu finds entity in nested DOM', async () => {
  const text = "#Aragorn:PERSON";

  await userEvent.type(editor, text);
  await waitFor(() => {
    document.querySelector('[data-entity]');
  });

  // Right-click on highlighted entity
  const highlight = document.querySelector('.cm-entity-highlight') ||
                    document.querySelector('[data-entity]');

  if (highlight) {
    // Simulate clicking nested child
    const child = highlight.querySelector('span');
    if (child) {
      await userEvent.pointer({ target: child, keys: '[MouseRight]' });
    } else {
      await userEvent.pointer({ target: highlight, keys: '[MouseRight]' });
    }

    // Context menu should appear
    await waitFor(() => {
      expect(screen.getByText('Change Type')).toBeInTheDocument();
    });
  }
});
```

### Test Case 5: Pretty Mode Tag Hiding

```typescript
test('tags are hidden in pretty mode and shown in raw mode', async () => {
  const text = "#Aragorn:PERSON married #Arwen:PLACE";

  await userEvent.type(editor, text);

  // Pretty mode (default)
  expect(screen.getByDisplayValue(text)).toBeInTheDocument();  // Raw text in state
  const editorContent = document.querySelector('.cm-content').textContent;
  expect(editorContent).not.toContain("#Aragorn:PERSON");  // Tag syntax hidden
  expect(editorContent).toContain("Aragorn");              // But name visible

  // Toggle to raw mode
  await userEvent.click(screen.getByLabelText('Show Raw Text'));

  const editorContent2 = document.querySelector('.cm-content').textContent;
  expect(editorContent2).toContain("#Aragorn:PERSON");  // Now tag syntax visible
});
```

---

## Summary

The ARES Extraction Lab has a sophisticated architecture for handling manual tags, auto-detected entities, and real-time highlighting. However, there are several potential bugs related to:

1. **Position misalignment** between stripped and original text
2. **Incomplete tag stripping** logic issues
3. **Deduplication** using string matching instead of position matching
4. **DOM traversal** fragility in context menu
5. **Rejection filtering** being too broad (word-level instead of position-level)

The most critical bug is #1 (position misalignment), which could cause highlighting to appear at wrong positions in the text. This should be investigated and fixed first.

All other bugs are moderate to low severity but should be addressed for robustness.

---

**Last Updated**: 2025-11-23
**Author**: Claude Code - UI Architecture Analysis
