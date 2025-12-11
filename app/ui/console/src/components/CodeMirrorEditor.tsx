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
  },

  '.cm-scroller': {
    overflow: 'auto',
  },

  '.cm-line': {
    position: 'relative',
  },

  '.cm-gutters': {
    backgroundColor: 'transparent',
    borderRight: '1px solid var(--border-color)',
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
) {
  return EditorView.domEventHandlers({
    contextmenu: (event, view) => {
      const mouseEvent = event as MouseEvent;
      const pos = view.posAtCoords({
        x: mouseEvent.clientX,
        y: mouseEvent.clientY,
      });

      if (pos == null) return false;

      const globalPos = baseOffsetRef.current + pos;
      const entity = entitiesRef.current.find(
        e => e.start <= globalPos && globalPos <= e.end,
      );
      if (!entity) return false;

      event.preventDefault();

      setContextMenu({
        position: { x: mouseEvent.clientX, y: mouseEvent.clientY },
        entity,
      });

      return true;
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
  entityHighlightMode = false, // not used in this trimmed build yet
  baseOffset = 0,
  onCursorChange,
}: CodeMirrorEditorProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = event => {
    // Let iOS focus handling proceed normally while keeping global listeners from hijacking the event.
    event.stopPropagation();
  };

  const entitiesRef = useRef<EntitySpan[]>(entities);
  const baseOffsetRef = useRef(baseOffset);
  const disableHighlightingRef = useRef(disableHighlighting);
  const highlightOpacityRef = useRef(highlightOpacity);
  const onCursorChangeRef = useRef(onCursorChange);

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
        entityHighlighterExtension(
          () => entitiesRef.current,
          () => disableHighlightingRef.current,
          () => highlightOpacityRef.current,
          () => baseOffsetRef.current,
        ),
        contextMenuExtension(setContextMenu, entitiesRef, baseOffsetRef),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }

          if (onCursorChangeRef.current && update.selectionSet) {
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
    view.dom.setAttribute('contenteditable', 'true');
    view.dom.setAttribute('spellcheck', 'true');
    view.dom.setAttribute('autocorrect', 'on');
    view.dom.setAttribute('autocapitalize', 'sentences');

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // external value sync (e.g. loading another document)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;

    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
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
      onPointerDown={handlePointerDown}
    >
      <div
        ref={wrapperRef}
        className="cm-editor-wrapper"
        style={{
          width: '100%',
          height: '100%',
          background: 'var(--bg-primary)',
          overflow: 'auto',
          touchAction: 'manipulation',
          WebkitOverflowScrolling: 'touch',
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