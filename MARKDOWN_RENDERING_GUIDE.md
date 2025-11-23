# Live Markdown Rendering in ARES Editor
## How It Works & What Was Enabled

---

## ✅ What Changed Today

Added **live markdown syntax highlighting** to the ARES editor. This enables WYSIWYG-style visual formatting in pretty mode:
- **Bold**: `**text**` → shows as bold
- **Italic**: `*text*` → shows as italic
- **Headings**: `# Heading` → larger font size
- **Code**: `` `code` `` → monospace styling
- **Links**: `[text](url)` → blue underlined
- **Quotes**: `> quote` → italic gray

---

## 🏗️ Architecture

### Three Critical Components

#### 1. **Language Support** (`markdown()`)
```typescript
import { markdown } from '@codemirror/lang-markdown';

extensions: [
  markdown(),  // Parses markdown syntax
  // ...
]
```
**What it does**: Tokenizes the text into markdown elements (headings, emphasis, lists, etc.)

#### 2. **Syntax Highlighting Layer** (`syntaxHighlighting()`)
```typescript
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';

extensions: [
  markdown(),
  syntaxHighlighting(defaultHighlightStyle),  // Applies CSS classes to tokens
  // ...
]
```
**What it does**: Maps token types to CSS classes (e.g., heading tokens get `cm-heading1` class)

**CRITICAL**: Without this, tokens are parsed but NOT visually highlighted. This was the missing piece.

#### 3. **CSS Theme Styling**
```typescript
const editorTheme = EditorView.theme({
  '.cm-heading1': {
    fontSize: '2.2em !important',
    fontWeight: 'bold !important',
    color: '#4a403a'
  },
  '.cm-strong': {
    fontWeight: 'bold !important'
  },
  '.cm-em': {
    fontStyle: 'italic !important'
  },
  // ... more token styles
});
```
**What it does**: Applies visual styling to the token classes

---

## 📋 Supported Markdown Elements

| Markdown | CSS Class | Visual Effect |
|----------|-----------|---------------|
| `# Heading` | `.cm-heading1` | **2.2em bold** |
| `## Heading` | `.cm-heading2` | **1.8em bold** |
| `### Heading` | `.cm-heading3` | **1.4em bold** |
| `#### Heading` | `.cm-heading4` | **1.2em bold** |
| `##### Heading` | `.cm-heading5` | **1.1em bold** |
| `###### Heading` | `.cm-heading6` | **bold** |
| `**bold**` or `__bold__` | `.cm-strong` | **Bold text** |
| `*italic*` or `_italic_` | `.cm-em` | *Italic text* |
| `~~strikethrough~~` | `.cm-strikethrough` | ~~Struck~~ |
| `[link](url)` | `.cm-link` | <u style="color:blue">Blue link</u> |
| `> quote` | `.cm-quote` | *Gray italic* |
| `` `code` `` | `.cm-inline-code` | `monospace` |
| Formatting chars | `.cm-formatting*` | Light gray 50% opacity |

---

## 🔧 How It Works in CodeMirror 6

### The Highlighting Pipeline

```
Raw Markdown Text
      ↓
markdown() extension
      ↓
Token Parser (generates token types)
      ↓
syntaxHighlighting(defaultHighlightStyle)
      ↓
Applies CSS classes to token ranges
      ↓
EditorView.theme() CSS
      ↓
Visual styling applied to editor
```

### Key Files

**CodeMirrorEditor.tsx** (Main implementation)

1. **Lines 32-33**: Imports
```typescript
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
```

2. **Lines 759-761**: Extensions array
```typescript
extensions: [
  markdown(),                                  // Parse markdown
  syntaxHighlighting(defaultHighlightStyle),  // Highlight tokens
  // ... other extensions
]
```

3. **Lines 611-690**: CSS theme with token styling
```typescript
const editorTheme = EditorView.theme({
  '.cm-heading1': { /* styling */ },
  '.cm-strong': { /* styling */ },
  // ... all token styles
});
```

---

## 🎯 Pretty Mode vs Raw Mode

### Pretty Mode (`renderMarkdown=true`)
```typescript
<CodeMirrorEditor
  renderMarkdown={true}
  // ...
/>
```
**Visual Result**:
- Markdown formatting is displayed (bold, italic, larger headings)
- Entity tags are hidden (`#Entity:TYPE` → shows as `Entity`)
- Markdown punctuation is subtle (light gray)
- Clean, readable document view

### Raw Mode (`renderMarkdown=false`)
```typescript
<CodeMirrorEditor
  renderMarkdown={false}
  // ...
/>
```
**Visual Result**:
- All markdown syntax visible
- All entity tags visible
- No special formatting applied
- Technical view for editing

### Toggle Implementation
```typescript
// In ExtractionLab.tsx
const [renderMarkdown, setRenderMarkdown] = useState(true);

<button onClick={() => setRenderMarkdown(!renderMarkdown)}>
  {renderMarkdown ? 'Show Raw' : 'Show Pretty'}
</button>

<CodeMirrorEditor
  renderMarkdown={renderMarkdown}
  // ...
/>
```

---

## 🎨 Customizing Markdown Styling

### To Change Heading Size

```typescript
'.cm-heading1': {
  fontSize: '2.2em !important',  // ← Change this
  fontWeight: 'bold !important',
  color: '#4a403a'
}
```

### To Change Bold Color

```typescript
'.cm-strong': {
  fontWeight: 'bold !important',
  color: '#4a403a'  // ← Change this
}
```

### To Add Link Styling

```typescript
'.cm-link': {
  color: '#3b82f6',           // Blue
  textDecoration: 'underline'  // Underlined
}
```

### To Hide Formatting Punctuation

```typescript
'.cm-formatting': {
  color: '#d1d5db',
  opacity: '0'  // Change from 0.5 to 0 to hide
}
```

---

## 🧪 Testing Live Markdown Rendering

**Step 1: Open the editor**
- Dev server: http://localhost:3003

**Step 2: Type markdown**
```markdown
# My Document Title

This is **bold text** and this is *italic text*.

## Section 2

Here is a [link](https://example.com) and `code snippet`.

> This is a quote
```

**Step 3: Watch formatting appear live**
- Heading should be large and bold
- **Bold** text should be bold
- *Italic* text should be italic
- Links should be blue and underlined
- Quotes should be gray and italic

**Step 4: Test toggle**
- Click "Show Raw Text"
- Verify all markdown syntax becomes visible
- Click "Show Pretty"
- Verify formatting is hidden and markdown renders visually

---

## 📚 Documentation References

### Related Files

1. **ARCHITECTURE_AND_TAGGING_SPEC.md**
   - Rule 6.3: "Only one markdown renderer is allowed"
   - Live WYSIWYG through decoration layers (no DOM mutations)

2. **ARCHITECTURE_CLEAN.md**
   - Single text source: rawMarkdownText
   - Decoration-based rendering
   - Raw/pretty toggle via renderMarkdown prop

3. **CodeMirrorEditor.tsx** (892 lines)
   - Main component with all markdown styling

### External References

- **CodeMirror 6 Documentation**: https://codemirror.net/docs/
  - Syntax highlighting: https://codemirror.net/docs/ref/#language.syntaxHighlighting
  - Markdown support: https://codemirror.net/docs/ref/#lang-markdown
  - Theming: https://codemirror.net/docs/ref/#view.EditorView%5Btheme%5D

- **Markdown Syntax**: https://www.markdownguide.org/

---

## ✅ Checklist: Markdown Rendering

- [x] `markdown()` extension imported and added to extensions
- [x] `syntaxHighlighting(defaultHighlightStyle)` imported and added
- [x] CSS theme includes all markdown token classes
- [x] Heading levels (h1-h6) styled with appropriate sizes
- [x] Bold (`**text**`) styled with fontWeight
- [x] Italic (`*text*`) styled with fontStyle
- [x] Links styled with color and underline
- [x] Quotes styled with color and fontStyle
- [x] Code blocks styled with monospace font
- [x] Formatting punctuation styled as subtle gray
- [x] Pretty/Raw toggle working correctly
- [x] Entity tag hiding still works with markdown rendering
- [x] No conflicts between highlighting layers

---

## 🚀 What's Next

### Potential Enhancements

1. **Custom highlight theme**
   - Replace `defaultHighlightStyle` with custom theme for brand colors
   - See: https://codemirror.net/docs/ref/#language.HighlightStyle

2. **Markdown extensions**
   - Add support for tables via `@codemirror/lang-markdown` plugins
   - Add syntax checking/linting via @codemirror/lint

3. **Live preview pane**
   - Split view with HTML-rendered markdown
   - Sync scroll between editor and preview

4. **Markdown toolbar**
   - Quick buttons to insert markdown syntax
   - Wrap selected text in bold/italic/etc

---

## 🎓 Key Learnings

### CodeMirror Highlighting Pattern

```
Language Support (markdown())
  ↓
Tokenization (parsing)
  ↓
Syntax Highlighting (syntaxHighlighting())
  ↓
CSS Classes Applied (cm-heading1, cm-strong, etc.)
  ↓
EditorView.theme() CSS
  ↓
Visual Rendering
```

**Critical Point**: All three layers are required. Missing any one breaks the chain:
- Without `markdown()`: No tokens generated
- Without `syntaxHighlighting()`: Tokens exist but no CSS classes applied
- Without CSS theme: Classes applied but no visual effect

### Why It Wasn't Working Before

The `markdown()` extension was present, but `syntaxHighlighting()` was missing. This meant:
- Tokens were parsed correctly internally
- But NO CSS classes were applied to the tokens
- So the CSS theme had nothing to style

**Solution**: Add `syntaxHighlighting(defaultHighlightStyle)` to the extensions array.

---

## 📞 Support

If markdown rendering isn't working:

1. **Check imports**: Verify both `markdown` and `syntaxHighlighting` are imported
2. **Check extensions**: Verify both are in the extensions array
3. **Check CSS**: Verify token classes are defined in `editorTheme`
4. **Check mode**: Verify `renderMarkdown=true` is passed to CodeMirrorEditor
5. **Check browser console**: Look for any errors or warnings

---

**Status**: ✅ Live markdown rendering is fully enabled and working!
