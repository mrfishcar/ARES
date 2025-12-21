## Editor rewrite reconnaissance (Phase 0)

### Current editor stack (CodeMirror)
- **Primary component**: `app/ui/console/src/components/CodeMirrorEditor.tsx` (Markdown-mode CodeMirror 6 editor).
- **Virtualization**: `app/ui/console/src/components/VirtualizedExtractionEditor.tsx` windows the document for long text; wrapped by `EditorPane` in `app/ui/console/src/components/EditorPane.tsx`.
- **Pages using it**: `ExtractionLab` (`app/ui/console/src/pages/ExtractionLab.tsx`) mounts `EditorPane` as the main editing surface.
- **Formatting hooks**: `LabToolbar` registers Markdown-style toggles via `registerFormatActions` from `CodeMirrorEditor`.

### Highlighting / overlays
- **Entity projection**: `app/ui/console/src/editor/entityVisibility.ts` maps stored spans (plain offsets) into visible ranges for CodeMirror.
- **Decorations**: `entityHighlighterExtension` in `CodeMirrorEditor.tsx` builds `Decoration.mark` overlays per span; color resolved via `getEntityTypeColor` with optional `colorForSpan`.
- **Interaction**: `contextMenuExtension`, `dragToCreateExtension`, and `selectionListenerExtension` handle tap/right-click to open entity menus, drag-to-select for creation/resizing, and iPad callout suppression.
- **Navigate + flash**: `navigateToRange` triggers scroll + temporary highlight via `flashEntityEffect`.

### Extraction path (text → spans)
- **Source text**: `ExtractionLab` holds `text` (plain string) as the canonical editable content; passed to CodeMirror. Manual inline tag parsing lives in `parseManualTags` / `mergeManualAndAutoEntities` (same file).
- **Extraction trigger**:
  - Live extraction (debounced) via `extractEntities` in `ExtractionLab.tsx` for documents under `SYNC_EXTRACTION_CHAR_LIMIT`.
  - Long-doc/background path via `/jobs/start` with idle/debounce scheduling handled by `useAutoLongExtraction` (threshold 20k chars).
- **API mapping**: responses mapped to spans with `mapExtractionResponseToSpans` (`app/ui/console/src/types/entities.ts`); spans are stored as `{start,end}` plain offsets tied to the current `text`.
- **Highlight application**: spans are fed directly into CodeMirror decorations; no position map beyond raw offsets.

### Storage model today
- **Documents**: persisted via REST `/documents` API (see `ExtractionLab` `saveDocumentInternal`), with localStorage backup (`ares_documents`).
- **Payload**: `{ title, text, extraction: { entities, relations, stats, entityOverrides } }`; `entityOverrides` keep `rejectedSpans` + `typeOverrides` keyed by span text/offset.
- **Load/apply**: `applyDocumentToState` restores `text`, entities, relations, stats, and overrides; offsets assumed to match raw `text` string.

### Current flow (high level)
```
User edits text (CodeMirror)
    ↓ onChange
ExtractionLab state.text (plain)
    ↓ debounced extractEntities or auto long-doc job
ARES API (/extract-entities or /jobs/start)
    ↓ mapExtractionResponseToSpans (plain offsets)
Entity spans stored in state
    ↓ entityHighlighterExtension
CodeMirror decorations overlay spans; context menu + drag operate on raw offsets
```

### Integration points to preserve
- **Text source for NLP**: single `text` string fed into `/extract-entities` and `/jobs/start`.
- **Span offsets**: highlights and overrides key off `{start,end}` in that text; overrides reapplied by matching span keys (`makeSpanKey`) in `ExtractionLab`.
- **Manual overrides**: `entityOverrides` applied post-extraction (rejected spans, typeOverrides); stored alongside extraction payload in documents.
