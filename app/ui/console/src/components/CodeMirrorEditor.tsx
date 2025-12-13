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
import { EntityContextMenu } from './EntityContextMenu';
import type { CodeMirrorEditorProps } from './CodeMirrorEditorProps';

// -------------------- MARKDOWN STYLES --------------------

const markdownHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontSize: '2.1em', fontWeight: 'bold' },
  { tag: t.heading2, fontSize: '1.8em', fontWeight: 'bold' },
  { tag: t.heading3, fontSize: '1.4em', fontWeight: 'bold' },
  { tag: t.heading4, fontSize: '1.2em', fontWeight: 'bold' },
  { tag: t.heading5, fontSize: '1.1em', fontWeight: 'bold' },
  { tag: t.heading6, fontWeight: 'bold' },
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
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, system-ui, sans-serif',
    fontSize: '1rem',
    lineHeight: '1.75',
    backgroundColor: 'transparent',
    color: 'var(--text-primary)',
  },

  // ✅ MAIN FIX: text starts below the header, but cannot scroll under it
  '.cm-content': {
    paddingTop: 'var(--editor-header-offset, 80px)', // Fixed top padding, no margin adjustment
    paddingRight: 'var(--editor-margin-desktop, 96px)', // Adjustable side margins
    paddingBottom: '40px', // Fixed bottom padding
    paddingLeft: 'var(--editor-margin-desktop, 96px)', // Adjustable side margins
    boxSizing: 'border-box',
    caretColor: 'var(--text-primary)', // ✅ Ensure cursor is visible on iOS
  },

  '.cm-scroller': {
    overflow: 'auto',
    overscrollBehavior: 'contain',
    touchAction: 'pan-y',
    WebkitOverflowScrolling: 'touch',
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

// -------------------- ENTITY HIGHLIGHTER --------------------

const ForceDecorationUpdate = StateEffect.define<void>();

function entityHighlighterExtension(
  getEntities: () => EntitySpan[],
  isDisabled: () => boolean,
  getOpacity: () => number,
  getBaseOffset: () => number,
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
        const doc = view.state.doc;
        const builder = new RangeSetBuilder<Decoration>();

        for (const ent of entities) {
          const start = Math.max(0, ent.start - base);
          const end = Math.min(doc.length, ent.end - base);
          if (end <= start) continue;

          const color = getEntityTypeColor(ent.type);

          builder.add(
            start,
            end,
            Decoration.mark({
              class: 'cm-entity-highlight',
              attributes: {
                style: `
                  background: ${color}20;
                  box-shadow: 0 0 0 1px ${color}40;
                  border-radius: 3px;
                  padding: 0 1px;
                `,
              },
            }),
          );
        }

        return builder.finish();
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
}: CodeMirrorEditorProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  const entitiesRef = useRef<EntitySpan[]>(entities);
  const baseOffsetRef = useRef(baseOffset);
  const disableHighlightingRef = useRef(disableHighlighting);
  const highlightOpacityRef = useRef(highlightOpacity);
  const onCursorChangeRef = useRef(onCursorChange);
  const entityHighlightModeRef = useRef(entityHighlightMode);
  const onTextSelectedRef = useRef(onTextSelected);
  const onResizeEntityRef = useRef(onResizeEntity);

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
    onCursorChangeRef.current = onCursorChange;
  }, [onCursorChange]);

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
        ),
        contextMenuExtension(setContextMenu, entitiesRef, baseOffsetRef, entityHighlightModeRef, onTextSelectedRef),
        dragToCreateExtension(entitiesRef, baseOffsetRef, entityHighlightModeRef, onTextSelectedRef, onResizeEntityRef),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            // Mark that user just edited (to prevent external sync from interfering)
            lastUserEditRef.current = Date.now();
            const nextValue = update.state.doc.toString();
            onChange(nextValue);
          }

          if (update.selectionSet && onCursorChangeRef.current) {
            const head = update.state.selection.main.head;
            const globalPos = baseOffsetRef.current + head;
            onCursorChangeRef.current(globalPos);
          }
        }),
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

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // external value sync (e.g. loading another document)
  // Only run when value changes from external source (not from user typing)
  const lastUserEditRef = useRef<number>(0);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
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

  // -------------------- RENDER --------------------

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight,
        background: 'var(--bg-primary)',
        overflow: 'hidden',
      }}
    >
      <div
        ref={wrapperRef}
        className="cm-editor-wrapper"
        style={{
          width: '100%',
          height: '100%',
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