/**
 * ARES Extraction Lab Editor — CLEAN STABLE BUILD
 *
 * Fixes:
 * - Header overlap (top padding inside editor content)
 * - iPad keyboard blur loss
 * - Autocorrect / spellcheck enabled
 * - Single scroll container
 * - Keeps entity context-menu behavior wired correctly
 */

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';

import {
  EditorState,
  RangeSetBuilder,
  StateEffect,
  Compartment,
  StateField,
} from '@codemirror/state';

import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  keymap,
  placeholder,
} from '@codemirror/view';

import { defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

import type { EntitySpan, EntityType } from '../types/entities';
import { getEntityTypeColor } from '../types/entities';
import { projectEntitiesToVisibleRanges } from '../editor/entityVisibility';
import { EntityContextMenu } from './EntityContextMenu';
import type { CodeMirrorEditorProps, FormattingActions } from './CodeMirrorEditorProps';
import { measureDecorationBuild } from '../utils/perf';

// -------------------- MARKDOWN STYLES --------------------

const markdownHighlightStyle = HighlightStyle.define([
  {
    tag: t.heading1,
    fontSize: 'clamp(1.85rem, 1.2rem + 2vw, 2.35rem)',
    fontWeight: '700',
    lineHeight: '1.2',
  },
  {
    tag: t.heading2,
    fontSize: 'clamp(1.55rem, 1.1rem + 1.4vw, 2rem)',
    fontWeight: '700',
    lineHeight: '1.25',
  },
  {
    tag: t.heading3,
    fontSize: 'clamp(1.3rem, 1.05rem + 0.8vw, 1.6rem)',
    fontWeight: '700',
  },
  { tag: t.heading4, fontSize: 'clamp(1.15rem, 1rem + 0.4vw, 1.35rem)', fontWeight: '700' },
  { tag: t.heading5, fontSize: 'clamp(1.05rem, 0.98rem + 0.25vw, 1.2rem)', fontWeight: '700' },
  { tag: t.heading6, fontWeight: '700' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.link, textDecoration: 'underline' },
  { tag: t.quote, fontStyle: 'italic', opacity: 0.9 },
  { tag: t.monospace, fontFamily: '"Courier New", monospace' },
]);

// -------------------- THEME --------------------

const editorTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-editor': {
    height: '100%',
    fontFamily:
      'system-ui, -apple-system, "SF Pro Text", "SF Pro Display", BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    fontSize: 'clamp(1rem, 0.98rem + 0.22vw, 1.125rem)',
    lineHeight: '1.6',
    backgroundColor: 'transparent',
    color: 'var(--text-primary)',
  },

  // ✅ MAIN FIX: text starts below the header
  '.cm-content': {
    paddingTop: 'var(--editor-header-offset, 80px)', // Top padding for content below toolbar
    paddingRight: 'var(--editor-margin-desktop, 96px)', // Adjustable side margins
    paddingBottom: '0', // No bottom padding - scroll to end
    paddingLeft: 'var(--editor-margin-desktop, 96px)', // Adjustable side margins
    boxSizing: 'border-box',
    caretColor: 'var(--text-primary)', // ✅ Ensure cursor is visible on iOS
    textAlign: 'left',
  },

  '.cm-scroller': {
    overflow: 'auto',
    overscrollBehavior: 'contain',
    touchAction: 'pan-y',
    WebkitOverflowScrolling: 'touch',
    scrollBehavior: 'auto',  // Changed from 'smooth' to avoid iOS jumpiness
  },

  '.cm-line': {
    position: 'relative',
  },

  '.cm-gutters': {
    backgroundColor: 'transparent',
    borderRight: '1px solid var(--border-color)',
  },

  // ✅ iOS cursor visibility fix
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--text-primary)',
    borderLeftWidth: '2px',
  },

  '.cm-entity-highlight': {
    transition: 'background-color 0.12s ease',
  },
});

const FLASH_DURATION_MS = 1000;

const toAlphaHex = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');

// -------------------- ENTITY HIGHLIGHTER --------------------

export const ForceDecorationUpdate = StateEffect.define<void>();

const flashEntityEffect = StateEffect.define<{ from: number; to: number }>();
const clearFlashEffect = StateEffect.define<void>();

const flashEntityField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    let next = value.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(flashEntityEffect)) {
        const { from, to } = effect.value;
        next = Decoration.set([
          Decoration.mark({
            class: 'cm-entity-flash',
          }).range(from, to),
        ]);
      } else if (effect.is(clearFlashEffect)) {
        next = Decoration.none;
      }
    }

    return next;
  },
  provide: f => EditorView.decorations.from(f),
});

function entityHighlighterExtension(
  getEntities: () => EntitySpan[],
  isDisabled: () => boolean,
  getOpacity: () => number,
  getBaseOffset: () => number,
  getColorForSpan?: () => ((span: EntitySpan) => string | undefined) | undefined,
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }

      update(update: ViewUpdate) {
        const force = update.transactions.some(tr =>
          tr.effects.some(e => e.is(ForceDecorationUpdate)),
        );

        if (update.docChanged || update.viewportChanged || force) {
          this.decorations = this.build(update.view);
        }
      }

      build(view: EditorView) {
        if (isDisabled()) return Decoration.none;
        const entities = getEntities();
        if (!entities.length) return Decoration.none;

        const base = getBaseOffset();
        const opacity = Math.max(0, Math.min(1, getOpacity()));
        const backgroundAlpha = toAlphaHex(32 * opacity);
        const borderAlpha = toAlphaHex(64 * opacity);
        const doc = view.state.doc;
        const colorForSpan = getColorForSpan ? getColorForSpan() : undefined;
        const { spans, scannedBytes } = projectEntitiesToVisibleRanges(
          entities,
          base,
          doc.length,
          view.visibleRanges,
        );

        if (!spans.length) return Decoration.none;

        const buildDecorations = () => {
          const builder = new RangeSetBuilder<Decoration>();

          for (const span of spans) {
            const color = (colorForSpan ? colorForSpan(span) : undefined) || getEntityTypeColor(span.type);
            const title = span.canonicalName || span.displayText || span.text;

            builder.add(
              span.from,
              span.to,
              Decoration.mark({
                class: 'cm-entity-highlight',
                attributes: {
                  style: `
                    background: ${color}${backgroundAlpha};
                    box-shadow: 0 0 0 1px ${color}${borderAlpha};
                    border-radius: 3px;
                    padding: 0 1px;
                  `,
                  ...(title ? { title } : {}),
                },
              }),
            );
          }

          return builder.finish();
        };

        return measureDecorationBuild('entity-highlighter', scannedBytes, buildDecorations);
      }
    },
    { decorations: v => v.decorations },
  );
}

// -------------------- CONTEXT MENU EXTENSION --------------------

function contextMenuExtension(
  setContextMenu: (ctx: {
    position: { x: number; y: number };
    entity: EntitySpan;
  } | null) => void,
  entitiesRef: React.MutableRefObject<EntitySpan[]>,
  baseOffsetRef: React.MutableRefObject<number>,
  entityHighlightModeRef: React.MutableRefObject<boolean>,
  onTextSelectedRef: React.MutableRefObject<((start: number, end: number, text: string, entities: EntitySpan[]) => void | Promise<void>) | undefined>,
) {
  // Helper to find entity at position and show context menu
  const tryShowContextMenu = (event: MouseEvent, view: EditorView): boolean => {
    const pos = view.posAtCoords({
      x: event.clientX,
      y: event.clientY,
    });

    if (pos == null) return false;

    const globalPos = baseOffsetRef.current + pos;
    const entity = entitiesRef.current.find(
      e => e.start <= globalPos && globalPos <= e.end,
    );
    if (!entity) return false;

    event.preventDefault();
    event.stopPropagation();

    setContextMenu({
      position: { x: event.clientX, y: event.clientY },
      entity,
    });

    return true;
  };

  return EditorView.domEventHandlers({
    // Right-click context menu
    contextmenu: (event, view) => {
      // ALWAYS prevent default browser context menu in Entity Highlight Mode
      if (entityHighlightModeRef.current) {
        event.preventDefault();
        event.stopPropagation();

        // Check for text selection first
        if (onTextSelectedRef.current) {
          const selection = view.state.selection.main;

          // If there's a text selection (not just a cursor)
          if (!selection.empty) {
            const start = selection.from;
            const end = selection.to;
            const globalStart = baseOffsetRef.current + start;
            const globalEnd = baseOffsetRef.current + end;
            const selectedText = view.state.doc.sliceString(start, end);

            // Find entities in selected range
            const entitiesInRange = entitiesRef.current.filter(entity => {
              return !(entity.end <= globalStart || entity.start >= globalEnd);
            });

            // Call onTextSelected to show floating menu (same as drag behavior)
            if (selectedText.trim()) {
              onTextSelectedRef.current(globalStart, globalEnd, selectedText.trim(), entitiesInRange);
            }

            return true;
          }
        }

        // Fall back to entity context menu if no selection
        return tryShowContextMenu(event as MouseEvent, view);
      }

      // Not in Entity Highlight Mode - allow default browser behavior
      return false;
    },
    // Click/tap handler for highlight mode - shows context menu on entity tap
    click: (event, view) => {
      // Only intercept clicks when in highlight mode AND on an entity
      if (!entityHighlightModeRef.current) return false;

      // First check if there's an entity at this position
      const pos = view.posAtCoords({
        x: (event as MouseEvent).clientX,
        y: (event as MouseEvent).clientY,
      });

      if (pos == null) return false;

      const globalPos = baseOffsetRef.current + pos;
      const entity = entitiesRef.current.find(
        e => e.start <= globalPos && globalPos <= e.end,
      );

      // Only handle the click if there's an entity
      // Otherwise, let CodeMirror handle it normally for text selection/caret placement
      if (!entity) return false;

      return tryShowContextMenu(event as MouseEvent, view);
    },
  });
}

// -------------------- DRAG-TO-CREATE EXTENSION --------------------

/**
 * Handles drag-to-select text and drag-to-resize in Entity Highlight Mode
 */
function dragToCreateExtension(
  entitiesRef: React.MutableRefObject<EntitySpan[]>,
  baseOffsetRef: React.MutableRefObject<number>,
  entityHighlightModeRef: React.MutableRefObject<boolean>,
  onTextSelectedRef: React.MutableRefObject<((start: number, end: number, text: string, entities: EntitySpan[]) => void | Promise<void>) | undefined>,
  onResizeEntityRef: React.MutableRefObject<((entity: EntitySpan, newStart: number, newEnd: number) => void | Promise<void>) | undefined>,
) {
  let dragState: {
    startPos: number;
    startX: number;
    startY: number;
    isDragging: boolean;
    resizingEntity: EntitySpan | null;
    resizeEdge: 'start' | 'end' | null;
  } | null = null;

  const RESIZE_HANDLE_PIXELS = 8; // Pixels from entity edge to trigger resize

  // Helper: Find entity at position
  const findEntityAtPos = (globalPos: number): EntitySpan | undefined => {
    return entitiesRef.current.find(
      e => e.start <= globalPos && globalPos <= e.end
    );
  };

  // Helper: Check if near entity edge (for resize detection)
  const checkNearEdge = (view: EditorView, entity: EntitySpan, clientX: number): 'start' | 'end' | null => {
    const startCoords = view.coordsAtPos(entity.start - baseOffsetRef.current);
    const endCoords = view.coordsAtPos(entity.end - baseOffsetRef.current);

    if (!startCoords || !endCoords) return null;

    // Check if near start edge
    if (Math.abs(clientX - startCoords.left) <= RESIZE_HANDLE_PIXELS) {
      return 'start';
    }

    // Check if near end edge
    if (Math.abs(clientX - endCoords.right) <= RESIZE_HANDLE_PIXELS) {
      return 'end';
    }

    return null;
  };

  return EditorView.domEventHandlers({
    mousedown: (event, view) => {
      // Only handle in entity highlight mode
      if (!entityHighlightModeRef.current) return false;

      const pos = view.posAtCoords({
        x: (event as MouseEvent).clientX,
        y: (event as MouseEvent).clientY,
      });

      if (pos == null) return false;

      const globalPos = baseOffsetRef.current + pos;
      const entity = findEntityAtPos(globalPos);

      // Check if we're resizing an existing entity
      if (entity) {
        const edge = checkNearEdge(view, entity, (event as MouseEvent).clientX);
        if (edge) {
          // Start resizing
          dragState = {
            startPos: pos,
            startX: (event as MouseEvent).clientX,
            startY: (event as MouseEvent).clientY,
            isDragging: false,
            resizingEntity: entity,
            resizeEdge: edge,
          };
          event.preventDefault();
          return true;
        }
      }

      // Start potential drag-to-create
      dragState = {
        startPos: pos,
        startX: (event as MouseEvent).clientX,
        startY: (event as MouseEvent).clientY,
        isDragging: false,
        resizingEntity: null,
        resizeEdge: null,
      };

      return false; // Let click handler work for context menu
    },

    mousemove: (event, view) => {
      if (!dragState || !entityHighlightModeRef.current) return false;

      const threshold = 5; // Pixels before we consider it a drag
      const dx = Math.abs((event as MouseEvent).clientX - dragState.startX);
      const dy = Math.abs((event as MouseEvent).clientY - dragState.startY);

      if (!dragState.isDragging && (dx > threshold || dy > threshold)) {
        dragState.isDragging = true;
      }

      if (dragState.isDragging) {
        // Suppress text selection during drag
        event.preventDefault();
        return true;
      }

      return false;
    },

    mouseup: (event, view) => {
      if (!dragState || !entityHighlightModeRef.current) {
        dragState = null;
        return false;
      }

      const wasDragging = dragState.isDragging;
      const resizingEntity = dragState.resizingEntity;
      const resizeEdge = dragState.resizeEdge;

      if (wasDragging) {
        const endPos = view.posAtCoords({
          x: (event as MouseEvent).clientX,
          y: (event as MouseEvent).clientY,
        });

        if (endPos != null) {
          const start = Math.min(dragState.startPos, endPos);
          const end = Math.max(dragState.startPos, endPos);

          if (resizingEntity && resizeEdge && onResizeEntityRef.current) {
            // Handle entity resize
            const globalStart = baseOffsetRef.current + start;
            const globalEnd = baseOffsetRef.current + end;

            const newStart = resizeEdge === 'start' ? globalStart : resizingEntity.start;
            const newEnd = resizeEdge === 'end' ? globalEnd : resizingEntity.end;

            onResizeEntityRef.current(resizingEntity, newStart, newEnd);
          } else if (!resizingEntity && onTextSelectedRef.current && end > start) {
            // Handle drag-to-select text (could be new text or existing entities)
            const globalStart = baseOffsetRef.current + start;
            const globalEnd = baseOffsetRef.current + end;
            const selectedText = view.state.doc.sliceString(start, end);

            // Find entities that overlap with the selected range
            const entitiesInRange = entitiesRef.current.filter(entity => {
              return !(entity.end <= globalStart || entity.start >= globalEnd);
            });

            if (selectedText.trim()) {
              onTextSelectedRef.current(globalStart, globalEnd, selectedText.trim(), entitiesInRange);
            }
          }
        }

        dragState = null;
        event.preventDefault();
        return true;
      }

      dragState = null;
      return false;
    },
  });
}

// -------------------- KEYBOARD BLOCKER EXTENSION --------------------

/**
 * Blocks keyboard input in Entity Highlight Mode while allowing text selection
 * This allows iOS/iPad users to select text natively without enabling typing
 */
function keyboardBlockerExtension(
  entityHighlightModeRef: React.MutableRefObject<boolean>,
) {
  return keymap.of([
    {
      any: (view) => {
        // Block all keyboard input when in Entity Highlight Mode
        if (entityHighlightModeRef.current) {
          return true; // Event handled, prevent default
        }
        return false; // Allow normal typing
      },
    },
  ]);
}

// -------------------- SELECTION LISTENER EXTENSION --------------------

/**
 * Detects text selection changes and auto-triggers entity menu on iPad/touch devices
 */
function selectionListenerExtension(
  entityHighlightModeRef: React.MutableRefObject<boolean>,
  onTextSelectedRef: React.MutableRefObject<((start: number, end: number, text: string, entities: EntitySpan[]) => void | Promise<void>) | undefined>,
  entitiesRef: React.MutableRefObject<EntitySpan[]>,
  baseOffsetRef: React.MutableRefObject<number>,
) {
  return EditorView.updateListener.of((update: ViewUpdate) => {
    // Only handle in Entity Highlight Mode
    if (!entityHighlightModeRef.current || !onTextSelectedRef.current) return;

    // Check if selection changed
    if (update.selectionSet) {
      const selection = update.state.selection.main;

      // If there's a text selection (not just cursor)
      if (!selection.empty) {
        const start = selection.from;
        const end = selection.to;
        const globalStart = baseOffsetRef.current + start;
        const globalEnd = baseOffsetRef.current + end;
        const selectedText = update.state.doc.sliceString(start, end);

        // Find entities in selected range
        const entitiesInRange = entitiesRef.current.filter(entity => {
          return !(entity.end <= globalStart || entity.start >= globalEnd);
        });

        // Call onTextSelected to show floating menu
        if (selectedText.trim()) {
          onTextSelectedRef.current(globalStart, globalEnd, selectedText.trim(), entitiesInRange);
        }
      }
    }
  });
}

// -------------------- iOS CALLOUT BLOCKER EXTENSION --------------------

/**
 * Prevents iOS native callout menu (Cut/Copy/Paste/Look Up) from appearing
 * when text is selected in Entity Highlight Mode.
 *
 * CSS approaches (-webkit-touch-callout: none) don't work reliably on iOS Safari,
 * so we use JavaScript event prevention with additional DOM manipulation.
 */
function iosCalloutBlockerExtension(
  entityHighlightModeRef: React.MutableRefObject<boolean>,
  viewRef: React.MutableRefObject<EditorView | null>,
) {
  // Track if we're in a selection gesture
  let isSelectingText = false;

  return EditorView.domEventHandlers({
    // Track selection start
    touchstart: (event, view) => {
      if (!entityHighlightModeRef.current) return false;
      isSelectingText = false;
      return false;
    },

    // Track selection drag
    touchmove: (event, view) => {
      if (!entityHighlightModeRef.current) return false;

      const selection = view.state.selection.main;
      if (!selection.empty) {
        isSelectingText = true;
      }

      return false;
    },

    // Prevent callout menu after selection
    touchend: (event, view) => {
      if (!entityHighlightModeRef.current) return false;

      const selection = view.state.selection.main;

      // If there's a text selection, prevent the iOS callout menu
      // This must be done synchronously during the event
      if (!selection.empty || isSelectingText) {
        event.preventDefault();
        event.stopPropagation();
        isSelectingText = false;
        return true; // Event handled
      }

      isSelectingText = false;
      return false;
    },
  });
}

// -------------------- iOS CURSOR TRACKING EXTENSION --------------------

/**
 * SOPHISTICATED iOS CURSOR TRACKING
 *
 * Philosophy:
 * - Embrace iOS page scroll when keyboard opens
 * - Use visualViewport API to know ACTUAL visible area
 * - Keep caret consistently positioned above keyboard
 * - Debounced + rAF to prevent layout thrash
 * - Single scroll owner (no competing systems)
 *
 * Fixes:
 * - "Works for 2 lines, jumps on 3rd" inconsistency
 * - Multiple scroll systems fighting
 * - CSS smooth scroll vs JS scroll conflicts
 */

// Debug flag - can be enabled via browser console:
// window.enableCaretDebug = true
declare global {
  interface Window {
    enableCaretDebug?: boolean;
  }
}

const isDebugEnabled = () => window.enableCaretDebug === true;

function iosCursorTrackingExtension(getScrollContainer: () => HTMLElement | null) {
  // Stable caret margin above keyboard/toolbar overlap (px)
  const CARET_MARGIN = 140;

  let rafHandle: number | null = null;
  let debounceTimer: number | null = null;

  const performCaretTracking = (view: EditorView) => {
    const selection = view.state.selection.main;
    const cursorPos = selection.head;
    const caretCoords = view.coordsAtPos(cursorPos);
    const container = getScrollContainer() ?? view.scrollDOM?.parentElement;

    if (!caretCoords || !container) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const kbInset = parseFloat(getComputedStyle(container).getPropertyValue('--kbInset')) || 0;
    const visibleHeight = container.clientHeight - kbInset;
    const caretBottomInContainer = caretCoords.bottom - containerRect.top + container.scrollTop;
    const targetCaretBottom = container.scrollTop + visibleHeight - CARET_MARGIN;

    if (isDebugEnabled()) {
      console.log('[CaretTrack]', {
        caretBottomInContainer,
        targetCaretBottom,
        kbInset,
        containerScrollTop: container.scrollTop,
        containerHeight: container.clientHeight,
      });
    }

    if (caretBottomInContainer > targetCaretBottom) {
      const scrollDelta = caretBottomInContainer - targetCaretBottom;
      container.scrollTo({
        top: container.scrollTop + scrollDelta,
        behavior: 'auto',
      });
    }
  };

  return EditorView.updateListener.of((update: ViewUpdate) => {
    if (!update.selectionSet && !update.docChanged) return;

    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    debounceTimer = window.setTimeout(() => {
      rafHandle = requestAnimationFrame(() => {
        // Allow layout to settle before measuring
        requestAnimationFrame(() => {
          performCaretTracking(update.view);
          rafHandle = null;
        });
      });
      debounceTimer = null;
    }, 50);
  });
}

// -------------------- FOCUS & SELECTION NOTIFIER --------------------

function focusAndSelectionNotifierExtension(
  onFocusChangeRef: React.MutableRefObject<((focused: boolean) => void) | undefined>,
  onSelectionChangeRef: React.MutableRefObject<((hasSelection: boolean) => void) | undefined>,
) {
  return [
    EditorView.domEventHandlers({
      focus: () => {
        onFocusChangeRef.current?.(true);
        return false;
      },
      blur: () => {
        onFocusChangeRef.current?.(false);
        return false;
      },
    }),
    EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.selectionSet && onSelectionChangeRef.current) {
        const selection = update.state.selection.main;
        onSelectionChangeRef.current(!selection.empty);
      }
    }),
  ];
}

// -------------------- MAIN COMPONENT --------------------

export function CodeMirrorEditor({
  value,
  onChange,
  minHeight = '400px', // kept for type compatibility, not directly used here
  disableHighlighting = false,
  highlightOpacity = 1,
  entities = [],
  onChangeType,
  onCreateNew,
  onReject,
  onTagEntity,
  entityHighlightMode = false,
  baseOffset = 0,
  onCursorChange,
  onTextSelected,
  onResizeEntity,
  navigateToRange,
  colorForSpan,
  onFocusChange,
  onSelectionChange,
  registerFormatActions,
  scrollContainer,
}: CodeMirrorEditorProps) {
  // Legacy prop is kept for API compatibility, but we avoid enforcing fixed heights
  // to honor the iOS layout rules that forbid resizing ancestors.
  void minHeight;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  const entitiesRef = useRef<EntitySpan[]>(entities);
  const baseOffsetRef = useRef(baseOffset);
  const disableHighlightingRef = useRef(disableHighlighting);
  const highlightOpacityRef = useRef(highlightOpacity);
  const colorForSpanRef = useRef<CodeMirrorEditorProps['colorForSpan']>(colorForSpan);
  const onCursorChangeRef = useRef(onCursorChange);
  const onFocusChangeRef = useRef<CodeMirrorEditorProps['onFocusChange']>();
  const onSelectionChangeRef = useRef<CodeMirrorEditorProps['onSelectionChange']>();
  const entityHighlightModeRef = useRef(entityHighlightMode);
  const onTextSelectedRef = useRef(onTextSelected);
  const onResizeEntityRef = useRef(onResizeEntity);
  const flashTimeoutRef = useRef<number | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    entity: EntitySpan;
  } | null>(null);

  // keep refs in sync
  useEffect(() => {
    entitiesRef.current = entities;
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: ForceDecorationUpdate.of(undefined),
      });
    }
  }, [entities]);

  useEffect(() => {
    baseOffsetRef.current = baseOffset;
  }, [baseOffset]);

  useEffect(() => {
    disableHighlightingRef.current = disableHighlighting;
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: ForceDecorationUpdate.of(undefined),
      });
    }
  }, [disableHighlighting]);

  useEffect(() => {
    highlightOpacityRef.current = highlightOpacity;
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: ForceDecorationUpdate.of(undefined),
      });
    }
  }, [highlightOpacity]);

  useEffect(() => {
    colorForSpanRef.current = colorForSpan;
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: ForceDecorationUpdate.of(undefined),
      });
    }
  }, [colorForSpan]);

  useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
  }, [onCursorChange]);

  useEffect(() => {
    onFocusChangeRef.current = onFocusChange;
  }, [onFocusChange]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    scrollContainerRef.current = scrollContainer ??
      (wrapperRef.current ? (wrapperRef.current.closest('.editor-panel') as HTMLElement | null) : null);
  }, [scrollContainer]);

  useEffect(() => {
    entityHighlightModeRef.current = entityHighlightMode;
  }, [entityHighlightMode]);

  useEffect(() => {
    onTextSelectedRef.current = onTextSelected;
  }, [onTextSelected]);

  useEffect(() => {
    onResizeEntityRef.current = onResizeEntity;
  }, [onResizeEntity]);

  // create editor once
  useEffect(() => {
    if (!wrapperRef.current || viewRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        keymap.of(defaultKeymap),
        markdown(),
        syntaxHighlighting(markdownHighlightStyle),
        placeholder('Write or paste text...'),
        editorTheme,
        EditorView.lineWrapping,
        iosCursorTrackingExtension(() => scrollContainerRef.current),
        // Block keyboard input in Entity Highlight Mode (allows text selection on iOS)
        keyboardBlockerExtension(entityHighlightModeRef),
        // Prevent iOS callout menu (Cut/Copy/Paste) from appearing during text selection
        iosCalloutBlockerExtension(entityHighlightModeRef, viewRef),
        // Auto-show menu when text is selected (iPad-friendly)
        selectionListenerExtension(entityHighlightModeRef, onTextSelectedRef, entitiesRef, baseOffsetRef),
        entityHighlighterExtension(
          () => entitiesRef.current,
          () => disableHighlightingRef.current,
          () => highlightOpacityRef.current,
          () => baseOffsetRef.current,
          () => colorForSpanRef.current,
        ),
        flashEntityField,
        contextMenuExtension(setContextMenu, entitiesRef, baseOffsetRef, entityHighlightModeRef, onTextSelectedRef),
        dragToCreateExtension(entitiesRef, baseOffsetRef, entityHighlightModeRef, onTextSelectedRef, onResizeEntityRef),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            // Mark that user just edited (to prevent external sync from interfering)
            lastUserEditRef.current = Date.now();
            const nextValue = update.state.sliceDoc();
            onChange(nextValue);
          }

          if (update.selectionSet) {
            if (onCursorChangeRef.current) {
              const head = update.state.selection.main.head;
              const globalPos = baseOffsetRef.current + head;
              onCursorChangeRef.current(globalPos);
            }
            if (onSelectionChangeRef.current) {
              const selection = update.state.selection.main;
              onSelectionChangeRef.current(!selection.empty);
            }
          }
        }),
        ...focusAndSelectionNotifierExtension(onFocusChangeRef, onSelectionChangeRef),
      ],
    });

    const view = new EditorView({
      state,
      parent: wrapperRef.current,
    });

    // ✅ iPadOS autocorrect & spellcheck
    // NOTE: Don't manually set contenteditable - CodeMirror handles this
    // Setting it manually causes iOS keyboard focus issues (cursor jumping, invisible typing)
    view.dom.setAttribute('spellcheck', 'true');
    view.dom.setAttribute('autocorrect', 'on');
    view.dom.setAttribute('autocapitalize', 'sentences');

    // Force focus on the editor's contenteditable element on iOS
    // This ensures keyboard appears and stays connected to the editor
    const contentEditableElement = view.contentDOM;
    if (contentEditableElement) {
      contentEditableElement.setAttribute('spellcheck', 'true');
      contentEditableElement.setAttribute('autocorrect', 'on');
      contentEditableElement.setAttribute('autocapitalize', 'sentences');
    }

    viewRef.current = view;

    if (registerFormatActions) {
      const toggleInlineWrapper = (wrapper: string) => {
        const v = viewRef.current;
        if (!v) return;
        const { state } = v;
        const selection = state.selection.main;
        const from = selection.from;
        const to = selection.to;
        const selectedText = state.doc.sliceString(from, to);
        const prefix = from - wrapper.length >= 0 ? state.doc.sliceString(from - wrapper.length, from) : '';
        const suffix = state.doc.sliceString(to, to + wrapper.length);
        const hasWrapped = prefix === wrapper && suffix === wrapper;

        if (hasWrapped) {
          const newFrom = from - wrapper.length;
          const newTo = to + wrapper.length;
          v.dispatch({
            changes: { from: newFrom, to: newTo, insert: selectedText },
            selection: { anchor: newFrom, head: newFrom + selectedText.length },
            userEvent: 'input',
          });
        } else {
          const insertText = `${wrapper}${selectedText}${wrapper}`;
          const cursorPos = from + insertText.length;
          v.dispatch({
            changes: { from, to, insert: insertText },
            selection: { anchor: cursorPos, head: cursorPos },
            userEvent: 'input',
          });
        }
      };

      const cycleHeading = () => {
        const v = viewRef.current;
        if (!v) return;
        const { state } = v;
        const selection = state.selection.main;
        const line = state.doc.lineAt(selection.head);
        const text = line.text.trimStart();
        const leadingSpaces = line.text.length - text.length;
        const currentPrefix = text.startsWith('#') ? text.match(/^#+/)?.[0] ?? '' : '';
        const nextPrefix =
          currentPrefix === '' ? '#' :
          currentPrefix === '#' ? '##' :
          currentPrefix === '##' ? '###' : '';
        const body = text.replace(/^#+\s*/, '');
        const newText = nextPrefix
          ? `${' '.repeat(leadingSpaces)}${nextPrefix} ${body}`
          : `${' '.repeat(leadingSpaces)}${body}`;
        v.dispatch({
          changes: { from: line.from, to: line.to, insert: newText },
          selection: { anchor: line.from, head: line.from },
          userEvent: 'input',
        });
      };

      const toggleQuote = () => {
        const v = viewRef.current;
        if (!v) return;
        const { state } = v;
        const selection = state.selection.main;
        const fromLine = state.doc.lineAt(selection.from);
        const toLine = state.doc.lineAt(selection.to);
        const lines = [];
        for (let i = fromLine.number; i <= toLine.number; i++) {
          lines.push(state.doc.line(i));
        }
        const allQuoted = lines.every(l => l.text.trimStart().startsWith('> '));
        const newText = lines
          .map(line => {
            const trimmed = line.text.trimStart();
            const leadingSpaces = line.text.length - trimmed.length;
            if (allQuoted) {
              return line.text.replace(/^\s*>\s?/, '');
            }
            return `${' '.repeat(leadingSpaces)}> ${trimmed}`;
          })
          .join('\n');
        v.dispatch({
          changes: { from: fromLine.from, to: toLine.to, insert: newText },
          selection: { anchor: fromLine.from, head: fromLine.from },
          userEvent: 'input',
        });
      };

      const insertDivider = () => {
        const v = viewRef.current;
        if (!v) return;
        const { state } = v;
        const selection = state.selection.main;
        const line = state.doc.lineAt(selection.head);
        const insertText = `${line.text ? '\n' : ''}---\n`;
        const insertPos = line.to;
        v.dispatch({
          changes: { from: insertPos, to: insertPos, insert: insertText },
          selection: { anchor: insertPos + insertText.length, head: insertPos + insertText.length },
          userEvent: 'input',
        });
      };

      const actions: FormattingActions = {
        toggleBold: () => toggleInlineWrapper('**'),
        toggleItalic: () => toggleInlineWrapper('*'),
        toggleMonospace: () => toggleInlineWrapper('`'),
        cycleHeading,
        toggleQuote,
        insertDivider,
      };

      registerFormatActions(actions);
    }

    return () => {
      view.destroy();
      viewRef.current = null;
      registerFormatActions?.(null);
    };
  }, []);

  // external value sync (e.g. loading another document)
  // Only run when value changes from external source (not from user typing)
  const lastUserEditRef = useRef<number>(0);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.sliceDoc();
    if (current === value) return;

    // Don't sync if this was triggered by recent user input (within 100ms)
    const timeSinceLastEdit = Date.now() - lastUserEditRef.current;
    if (timeSinceLastEdit < 100) {
      return;
    }

    const anchor = view.state.selection.main.anchor;
    const head = view.state.selection.main.head;
    const nextAnchor = Math.min(value.length, anchor);
    const nextHead = Math.min(value.length, head);

    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: nextAnchor, head: nextHead },
      // userEvent helps CodeMirror distinguish programmatic sync from user input
      userEvent: 'input.complete',
    });
  }, [value]);

  // -------------------- CONTEXT MENU HANDLERS --------------------

  const handleMenuChangeType = useCallback(
    (type: EntityType) => {
      if (!contextMenu || !onChangeType) {
        setContextMenu(null);
        return;
      }
      const entity = contextMenu.entity;
      void onChangeType(entity, type);
      setContextMenu(null);
    },
    [contextMenu, onChangeType],
  );

  const handleMenuCreateNew = useCallback(
    (type: EntityType) => {
      if (!contextMenu || !onCreateNew) {
        setContextMenu(null);
        return;
      }
      const entity = contextMenu.entity;
      void onCreateNew(entity, type);
      setContextMenu(null);
    },
    [contextMenu, onCreateNew],
  );

  const handleMenuReject = useCallback(() => {
    if (!contextMenu || !onReject) {
      setContextMenu(null);
      return;
    }
    const entity = contextMenu.entity;
    void onReject(entity);
    setContextMenu(null);
  }, [contextMenu, onReject]);

  const handleMenuTagEntity = useCallback(() => {
    if (!contextMenu || !onTagEntity) {
      setContextMenu(null);
      return;
    }
    const entity = contextMenu.entity;
    void onTagEntity(entity, entity);
    setContextMenu(null);
  }, [contextMenu, onTagEntity]);

  // -------------------- NAVIGATION HANDLER --------------------

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !navigateToRange) return;

    const clamped = (pos: number) =>
      Math.max(0, Math.min(view.state.doc.length, pos));

    const from = clamped(navigateToRange.from);
    const to = clamped(Math.max(navigateToRange.to, navigateToRange.from));

    if (flashTimeoutRef.current) {
      window.clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
    }

    view.dispatch({
      scrollIntoView: true,
      effects: [
        EditorView.scrollIntoView(from, { y: 'center' }),
        flashEntityEffect.of({ from, to }),
      ],
      userEvent: 'scroll',
    });

    flashTimeoutRef.current = window.setTimeout(() => {
      if (viewRef.current) {
        viewRef.current.dispatch({ effects: clearFlashEffect.of(undefined) });
      }
    }, FLASH_DURATION_MS);

    view.focus();

    return () => {
      if (flashTimeoutRef.current) {
        window.clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = null;
      }
    };
  }, [navigateToRange]);

  // -------------------- RENDER --------------------

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        background: 'var(--bg-primary)',
        overflow: 'hidden',
      }}
    >
      <div
        ref={wrapperRef}
        className="cm-editor-wrapper"
        style={{
          width: '100%',
          background: 'var(--bg-primary)',
          overflow: 'hidden',
        }}
      />

      {contextMenu && (
        <EntityContextMenu
          position={contextMenu.position}
          entity={contextMenu.entity}
          onChangeType={handleMenuChangeType}
          onCreateNew={handleMenuCreateNew}
          onReject={handleMenuReject}
          onTagEntity={handleMenuTagEntity}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
