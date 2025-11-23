# ARES Extraction Lab - Clean Architecture (Obsidian-Style)

## Core Principle

**Raw Markdown Text is the ONLY source of truth. Everything else is rendering.**

---

## Data Flow (Single Model)

```
ExtractionLab.tsx
  │
  └─→ state: rawMarkdownText (this is THE text)
      │
      └─→ CodeMirrorEditor
          │
          ├─→ markdown() extension
          │   └─→ Renders syntax highlighting (decorations)
          │
          ├─→ entityHighlighterExtension
          │   └─→ Reads entities from parent
          │   └─→ Creates entity highlight decorations
          │
          ├─→ manualTagExtension
          │   └─→ Detects inline tags (#Entity:TYPE)
          │   └─→ Creates "hide in pretty mode" decorations
          │
          └─→ onChange → Updates rawMarkdownText in parent
              (text → parent → parent re-renders → entities re-extract)
```

---

## What This Means

### ✅ DO

- Edit text in ONE place (CodeMirrorEditor)
- Store text in ONE state (rawMarkdownText in ExtractionLab)
- Apply visual effects via CodeMirror decorations (never mutate HTML)
- Handler actions insert tags into the raw text directly
- Raw/Pretty toggle changes decoration visibility, NOT the text

### ❌ DON'T

- Create separate "rendered text" or "preview text" models
- Mutate HTML elements or React state for visualization
- Re-parse the same text multiple times
- Keep two editors in sync (there's only ONE)
- Use string replacement as a workaround for missing architecture
- Inject spans manually when decorations exist for this

---

## Component Architecture

### ExtractionLab.tsx

```typescript
const [rawMarkdownText, setRawMarkdownText] = useState('');
const [entities, setEntities] = useState<EntitySpan[]>([]);
const [renderMarkdown, setRenderMarkdown] = useState(true);

// When text changes, extract entities
useEffect(() => {
  extractEntities(rawMarkdownText); // calls API, updates entities
}, [rawMarkdownText]);

return (
  <CodeMirrorEditor
    value={rawMarkdownText}                    // THE text
    onChange={setRawMarkdownText}              // Updates THE text
    entities={entities}                        // For highlighting
    renderMarkdown={renderMarkdown}            // For decoration visibility
    onChangeType={handleChangeType}            // Modifies THE text
    onCreateNew={handleCreateNew}              // Modifies THE text
    onReject={handleReject}                    // Modifies THE text
    onTagEntity={handleTagEntity}              // Modifies THE text
  />
);
```

Key point: **All handler actions modify `rawMarkdownText` directly** by inserting tags into it.

### CodeMirrorEditor.tsx

Only responsible for:
1. Displaying text
2. Managing decorations (rendering layers)
3. Handling user input
4. Calling onChange callback

```typescript
export function CodeMirrorEditor({
  value,                      // rawMarkdownText
  onChange,                   // setRawMarkdownText
  entities,                   // For entity highlighting
  renderMarkdown,             // For toggle
  onChangeType,
  onCreateNew,
  onReject,
  onTagEntity
}) {
  // The ONLY editable content is the raw text in CodeMirror

  // Extensions (decoration layers):
  const extensions = [
    keymap.of(defaultKeymap),
    markdown(),                                          // Syntax highlighting
    entityHighlighterExtension(entities),               // Entity highlights
    manualTagExtension(renderMarkdown),                 // Hide tags in pretty mode
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());          // Updates parent rawMarkdownText
      }
    })
  ];

  // Create editor
  const view = new EditorView({ state, parent });
}
```

---

## Extension Implementations

### entityHighlighterExtension(entities)

```typescript
// Adds colored highlights for detected entities
// Never mutates text
// Just creates decorations at entity positions

function entityHighlighterExtension(entities: EntitySpan[]) {
  return [
    StateField.define({
      create() { return Decoration.none; },
      update(deco, tr) {
        // Check if we have an update
        for (let e of tr.effects) {
          if (e.is(setEntityDecorations)) return e.value;
        }
        return deco.map(tr.changes);
      },
      provide: f => EditorView.decorations.from(f)
    }),

    ViewPlugin.fromClass({
      update(update) {
        if (update.docChanged || entities changed) {
          const builder = new RangeSetBuilder();

          // Add decoration for each entity
          for (const entity of entities) {
            builder.add(entity.start, entity.end, Decoration.mark({
              class: 'cm-entity-highlight',
              // Style inline
              attributes: {
                style: `background: ${color}30; cursor: pointer;`
              }
            }));
          }

          view.dispatch({ effects: setEntityDecorations.of(builder.finish()) });
        }
      }
    })
  ];
}
```

### manualTagExtension(renderMarkdown)

```typescript
// Hides inline tags (#Entity:TYPE) in pretty mode
// Shows them in raw mode
// Never mutates text, just changes decoration visibility

function manualTagExtension(renderMarkdown: boolean) {
  const tagRegex = /#\[([^\]]+)\]:(\w+)|#(\w+):(\w+)/g;

  return [
    StateField.define({
      create() { return Decoration.none; },
      update(deco, tr) {
        for (let e of tr.effects) {
          if (e.is(setTagDecorations)) return e.value;
        }
        return deco.map(tr.changes);
      },
      provide: f => EditorView.decorations.from(f)
    }),

    ViewPlugin.fromClass({
      update(update) {
        if (update.docChanged || renderMarkdown changed) {
          if (!renderMarkdown) {
            // Raw mode: no decorations, show full text
            view.dispatch({ effects: setTagDecorations.of(Decoration.none) });
          } else {
            // Pretty mode: hide tag text with replace decorations
            const builder = new RangeSetBuilder();
            const text = view.state.doc.toString();
            let match;

            while ((match = tagRegex.exec(text)) !== null) {
              builder.add(
                match.index,
                match.index + match[0].length,
                Decoration.replace({
                  widget: new InvisibleWidget()  // Zero-width, hidden
                })
              );
            }

            view.dispatch({ effects: setTagDecorations.of(builder.finish()) });
          }
        }
      }
    })
  ];
}
```

### markdown() extension

Already provided by @codemirror/lang-markdown.
Just includes it in the extensions array.
No modifications needed.

---

## Handler Actions

All handlers modify `rawMarkdownText` directly:

```typescript
const handleChangeType = async (entity: EntitySpan, newType: EntityType) => {
  // Build the tag
  const tag = entity.text.includes(' ')
    ? `#[${entity.text}]:${newType}`
    : `#${entity.text}:${newType}`;

  // Replace the entity text with the tag
  const newText = rawMarkdownText.slice(0, entity.start)
                + tag
                + rawMarkdownText.slice(entity.end);

  // Update the ONE text source
  setRawMarkdownText(newText);
};

const handleCreateNew = async (entity: EntitySpan, type: EntityType) => {
  // Same pattern: modify text, update state
  const tag = entity.text.includes(' ')
    ? `#[${entity.text}]:${type}`
    : `#${entity.text}:${type}`;

  const newText = rawMarkdownText.slice(0, entity.start)
                + tag
                + rawMarkdownText.slice(entity.end);

  setRawMarkdownText(newText);
};

const handleReject = async (entity: EntitySpan) => {
  // Replace with rejection tag
  const rejectTag = `${entity.text}:REJECT_ENTITY`;
  const newText = rawMarkdownText.slice(0, entity.start)
                + rejectTag
                + rawMarkdownText.slice(entity.end);

  setRawMarkdownText(newText);
};
```

---

## Raw/Pretty Toggle

The toggle is **purely visual** — it doesn't change the text at all.

```typescript
const [renderMarkdown, setRenderMarkdown] = useState(true);

// When toggle changes:
// - renderMarkdown=true: manualTagExtension hides tags via decorations
// - renderMarkdown=false: manualTagExtension removes decorations (shows raw)

// THE TEXT NEVER CHANGES. Only the visual decorations change.
```

---

## Why This Works

1. **Single source of truth**: `rawMarkdownText` is THE text
2. **No competing models**: No separate "rendered" or "preview" text
3. **No mutations**: CodeMirror handles all rendering via decorations
4. **Clean separation**: Business logic (handlers) vs UI logic (decorations)
5. **Obsidian-style**: Exactly how Obsidian works internally

---

## What This Prevents

✅ No duplicate paragraphs
✅ No text corruption
✅ No cursor jumping
✅ No entity misalignment
✅ No tag leakage into rendered output
✅ No need for two editors or complex sync logic
✅ No re-parsing of rendered HTML

---

## Implementation Order

1. Simplify ExtractionLab to have ONE text state: `rawMarkdownText`
2. Rewrite CodeMirrorEditor to ONLY manage that text + decorations
3. Implement entityHighlighterExtension (pure decorations)
4. Implement manualTagExtension (pure decorations)
5. Wire up handlers to modify `rawMarkdownText`
6. Add raw/pretty toggle that changes decoration visibility
7. Test: Should feel clean, responsive, like Obsidian

---

## Before vs After

### Before (Broken)
```
rawText model
  ↓
renderedText model
  ↓
prettifiedText model
  ↓
HTML with injected spans
  ↓
DOM mutations
  ↓
❌ Everything drifts out of sync
```

### After (Clean)
```
rawMarkdownText (single state)
  ↓
CodeMirror editor (displays it)
  ↓
Decoration layers (syntax, entities, tags)
  ↓
✅ Everything stays in sync automatically
```

---

This is the spec. Build to this, and the tool will feel like Obsidian.
