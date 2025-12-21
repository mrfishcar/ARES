import type { EntitySpan, EntityType, DocumentEntityMetadata } from '../types/entities';

export interface NavigateToRange {
  from: number;
  to: number;
  requestId: number;
}

export interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  minHeight?: string;
  project?: string;
  noteId?: string;
  disableHighlighting?: boolean;
  highlightOpacity?: number; // 0.0 to 1.0 opacity multiplier for all highlights
  enableWYSIWYG?: boolean;
  renderMarkdown?: boolean; // true = hide inline tags, render markdown visually; false = show raw text with tags
  entities?: EntitySpan[];
  projectId?: string;
  documentId?: string;
  documentMetadata?: DocumentEntityMetadata;
  onChangeType?: (entity: EntitySpan, type: EntityType) => Promise<void>;
  onTagEntity?: (entity: EntitySpan, targetEntity: EntitySpan) => Promise<void>;
  onCreateNew?: (entity: EntitySpan, type: EntityType) => void | Promise<void>;
  onReject?: (entity: EntitySpan) => Promise<void>;
  entityHighlightMode?: boolean;
  onFocusChange?: (focused: boolean) => void;
  onSelectionChange?: (hasSelection: boolean) => void;

  /** NEW: Entity mode text selection callback - called when user drags to select text */
  onTextSelected?: (
    start: number,
    end: number,
    selectedText: string,
    entitiesInRange: EntitySpan[]
  ) => void | Promise<void>;

  /** NEW: Entity mode drag-to-resize callback */
  onResizeEntity?: (entity: EntitySpan, newStart: number, newEnd: number) => void | Promise<void>;

  /** NEW: Windowed mode support for large documents */
  baseOffset?: number; // Global offset where this window starts (default 0 = full doc mode)
  onCursorChange?: (globalPos: number) => void; // Called when cursor moves (for window adjustment)
  registerFormatActions?: (actions: FormattingActions | null) => void;

  /** NEW: Navigate to a range (e.g., when clicking an entity in the sidebar) */
  navigateToRange?: NavigateToRange;
  colorForSpan?: (span: EntitySpan) => string | undefined;
}

export interface FormattingActions {
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleMonospace: () => void;
  cycleHeading: () => void;
  toggleQuote: () => void;
  insertDivider: () => void;
}
