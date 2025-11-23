# 🔥 ARES Editor + Tagging + Graph Architecture Spec

**Date**: 2025-11-22
**Status**: Authoritative - Follow this spec exactly

Claude, this is the intended Obsidian-style behavior for ARES. Do not deviate.

---

## 0) Non-negotiable principle

**rawText is the ONLY source of truth.**

No layer is allowed to mutate or reflow rawText except explicit user actions.

- Pretty View must render from rawText *without changing it*.
- Entity highlighting must be a pure visual overlay.
- All coordination happens through decoration layers, never HTML mutations.

---

## 1) Two Views, One Text

### Raw View

* Displays literal rawText, including any manual tags.
* No markdown pretty rendering.
* Tags are visible exactly as typed.

### Pretty View

* Renders markdown from rawText.
* Hides tag syntax visually using decoration layers.
* Applies highlighting ONLY via entity spans.
* MUST NOT insert, replace, wrap, or rewrite text.

**If Pretty View changes line breaks, inserts spaces, duplicates words, or leaks tags, that is a bug.**

---

## 2) Tags are NOT for formatting

Entity IDs / tags (example: `#CORY_GILFORD:PERSON`) exist ONLY to express **manual user intent**.

They do NOT drive formatting by their syntax.
They are just signals to the extractor + graph pipeline.

**Auto-detected entities must NOT get tags inserted automatically.**

Only the following user actions create tags:
- Change Type (manual override)
- Tag Entity (create alias)
- Create New (new canonical entity)

---

## 3) Extraction Pipeline (Correct)

Input: `rawText`

### Step 1: Parse manual tags from rawText

Examples:
- `#Smaug:CREATURE`
- `#[Mount Doom]:ORG`
- `Cory:ALIAS_OF_CORY_GILFORD:PERSON`
- `Boromir:REJECT_ENTITY`

Manual tags become entities with `source="manual"` and confidence 1.0.

### Step 2: Strip tag syntax for auto-detection

Extractor runs on "renderText" (rawText minus tag wrappers).

### Step 3: Auto-detect remaining entities

NER + patterns produce entities with `source="auto"`.

### Step 4: Apply document-level rejections

Any mention rejected in this doc is excluded from entity output here.

### Step 5: Resolve aliases

Alias references map short mentions → canonical project entities.

### Step 6: Merge

Manual overrides always win over auto.
Return merged entity spans for rendering.

Pretty View uses ONLY these merged spans to highlight.

---

## 4) User Actions → What happens to rawText & graph

### A) Change Type (context-menu option)

Use when an auto entity exists but is the wrong type.

**Behavior:**

* Insert a **manual override tag** into rawText replacing the mention.
* Example:
  * raw: "Mount Doom"
  * user picks ORG
  * rawText becomes: `#[Mount Doom]:ORG`

* Backend updates project graph:
  * canonical entity exists/created
  * typeHistory adds manual override
  * future extractions learn this

### B) Tag Entity (alias linking)

Use when the user wants a short mention mapped to an existing canonical entity.

**Behavior:**

* rawText becomes explicit alias form:
  * `Cory:ALIAS_OF_CORY_GILFORD:PERSON`

* Backend graph updates:
  * Adds alias "Cory" → canonical "CORY_GILFORD:PERSON"
  * Project-wide learning, not doc-local

**Important:** Do NOT silently rewrite "Cory" into full tag unless user chose a manual override. Preserve the user's written surface form.

### C) Create New Entity

Use when the mention should become a brand-new canonical entity.

**Behavior:**

* Replace mention with manual tag:
  * `#Smaug:CREATURE` (or bracketed form if spaces)

* Backend graph:
  * Creates entity
  * Adds aliases if relevant
  * Stores it project-wide

### D) Reject

Use when something should not be treated as an entity in this document.

**Behavior:**

* Adds mention to document.rejectedMentions
* Removes highlight immediately
* Sends rejection event to backend

**Learning rule:**

* If a word is rejected ≥2 times across the project → auto-blacklist it.
* Blacklisted words are not offered as entities going forward.
* If user manually creates an entity for a blacklisted word, that word is auto-removed from blacklist.

---

## 5) Project-Wide Graph Model (Persistence)

All entities, aliases, overrides, and blacklist learning live at **project scope**.

### Each project maintains:

* **canonical entities**
* **aliases**
* **type history**
* **rejection tracking**
* **entity blacklist**

### Documents store:

* rawText
* document-level metadata:
  * rejectedMentions
  * typeOverrides (if stored separately in addition to inline tags)
  * aliasReferences

New projects may optionally import graph entities from another project later.

---

## 6) UI/Rendering Rules

1. **Highlights are decoration layers only**
   * Never replace text
   * Never inject tags automatically
   * Never rewrite DOM nodes in a way that duplicates content

2. **Disabling highlighting must fully disable ALL highlight layers**
   * no leftover decoration fields, plugins, or preview spans

3. **Only one markdown renderer is allowed**
   * Pretty View must not chain multiple preview systems
   * Remove/disable: autoReplace, MDEditor WYSIWYG mutation, MarkdownPreview rewriting, or any extra transform pipeline

4. **No split-brain text model**
   * Do not maintain separate "prettyText" or "mutatedText"
   * Everything starts from rawText, every time

---

## 7) CodeMirror 6 Architecture Pattern

### StateField Pattern (Always Rebuild)

```typescript
function entityHighlighterExtension(
  getEntities: () => EntitySpan[]
) {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, getEntities());
    },
    update(deco, tr) {
      // Always rebuild - read fresh entities from getter
      // This ensures entities prop changes trigger decoration updates
      return buildDecorations(tr.state, getEntities());
    },
    provide: f => EditorView.decorations.from(f)
  });
}
```

### Safe React Integration

```typescript
useEffect(() => {
  entitiesRef.current = entities;
  const view = viewRef.current;
  if (view) {
    // Use requestAnimationFrame to dispatch outside CM update cycle
    requestAnimationFrame(() => {
      view.dispatch({});  // Empty dispatch triggers StateField update
    });
  }
}, [entities]);
```

### Key Rules

* Never dispatch from within plugin update() methods
* Use requestAnimationFrame for dispatches from React effects
* Use Decoration.mark() with CSS display:none instead of Decoration.replace()
* Keep text in document - don't mutate it via decorations

---

## 8) What to fix right now

* ✅ Stop any handler that inserts entity IDs for auto-detected entities automatically.
* ✅ Ensure "Change Type / Create New / Tag Entity" are the *only* ways tags get inserted.
* ✅ Remove conflicting formatting layers so Pretty View renders rawText cleanly.
* ⏳ Implement tag parsing to extract manual tags from rawText
* ⏳ Ensure highlighting reflects manual tags (manual > auto-detected)
* ⏳ Implement rejection tracking and blacklist learning

---

## 9) Acceptance Test Checklist

- [ ] Type "Aragorn ruled Gondor"
- [ ] Verify entities are highlighted
- [ ] Right-click "Gondor" → Change Type → PLACE
- [ ] Verify text now shows `#Gondor:PLACE`
- [ ] Toggle "Show Raw Text" → tags appear/disappear
- [ ] Right-click `#Gondor:PLACE` → Change Type → PERSON
- [ ] Verify it becomes `#Gondor:PERSON` (NOT `##Gondor:PERSON:PERSON`)
- [ ] Toggle raw/pretty multiple times → text never corrupts
- [ ] No blank spaces appear where tags are hidden
- [ ] Markdown rendering (bold, italic, headings) works cleanly
- [ ] Entity highlights stay aligned with text during editing
- [ ] Rejection creates `:REJECT_ENTITY` tag at entity position
- [ ] Context menu disappears when clicking outside
- [ ] Multiple tags in one sentence don't interfere

---

If you follow this, the editor will behave like Obsidian:
clean raw notes, stable pretty render, and user actions becoming durable graph knowledge.

**This is your source of truth. When in doubt, refer back to this spec.**
