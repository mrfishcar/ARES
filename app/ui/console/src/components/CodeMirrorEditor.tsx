/**
 * ARES Extraction Lab Editor
 *
 * Single CodeMirror 6 editor with:
 * - Markdown editing
 * - Entity highlighting
 * - Right-click context menu on entities
 * - Optional “entity highlight mode” for manual tagging workflows
 *
 * NOTE: This is a simplified, “clean” version intended to get the
 *       console working again. Some of the super-fancy glow / tag-
 *       hiding behavior from experimental builds is intentionally
 *       left out so the file is easy to maintain.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  EditorState,
  RangeSetBuilder,
} from '@codemirror/state';

import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  keymap,
} from '@codemirror/view';

import { defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

import type { EntitySpan, EntityType } from '../types/entities';
import { getEntityTypeColor } from '../types/entities';
import { EntityContextMenu } from './EntityContextMenu';
import type { CodeMirrorEditorProps } from './CodeMirrorEditorProps';

// ---------------------------------------------------------------------------
// Markdown highlight style
// ---------------------------------------------------------------------------

const markdownHighlightStyle = HighlightStyle.define([
  // Headings
  { tag: t.heading1, fontSize: '2.1em', fontWeight: 'bold' },
  { tag: t.heading2, fontSize: '1.8em', fontWeight: 'bold' },
  { tag: t.heading3, fontSize: '1.4em', fontWeight: 'bold' },
  { tag: t.heading4, fontSize: '1.2em', fontWeight: 'bold' },
  { tag: t.heading5, fontSize: '1.1em', fontWeight: 'bold' },
  { tag: t.heading6, fontWeight: 'bold' },

  // Emphasis
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },

  // Misc
  { tag: t.link, textDecoration: 'underline' },
  { tag: t.quote, fontStyle: 'italic', opacity: 0.9 },
  { tag: t.monospace, fontFamily: '"Courier New", monospace' },
]);

// ---------------------------------------------------------------------------
// Editor theme
// ---------------------------------------------------------------------------

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
  },
  '.cm-editor': {
    height: '100%',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif',
    fontSize: '15px',
    lineHeight: '1.75',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  },
  '.cm-content': {
    padding: '16px',
  },
  '.cm-scroller': {
    // Let the editor itself be the scroll container.
    overflow: 'auto',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border-color)',
  },
  '.cm-line': {
    position: 'relative',
  },
  '.cm-entity-highlight': {
    transition: 'background-color 0.12s ease-in-out',
  },
});

// ---------------------------------------------------------------------------
// Entity highlighting
// ---------------------------------------------------------------------------

type EntityGetter = () => EntitySpan[];
type DisabledGetter = () => boolean;
type OpacityGetter = () => number;
type BaseOffsetGetter = () => number;

function entityHighlighterExtension(
  getEntities: EntityGetter,
  isDisabled: DisabledGetter,
  getOpacity: OpacityGetter,
  getBaseOffset: BaseOffsetGetter,
) {
  const VIEWPORT_BUFFER = 2000; // chars

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(readonly view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const entities = getEntities();
        if (!entities || entities.length === 0 || isDisabled()) {
          return Decoration.none;
        }

        const state = view.state;
        const docLength = state.doc.length;
        const baseOffset = getBaseOffset();

        const { from, to } = view.viewport;
        const windowFromLocal = Math.max(0, from - VIEWPORT_BUFFER);
        const windowToLocal = Math.min(docLength, to + VIEWPORT_BUFFER);

        const windowFromGlobal = baseOffset + windowFromLocal;
        const windowToGlobal = baseOffset + windowToLocal;

        const builder = new RangeSetBuilder<Decoration>();

        for (const ent of entities) {
          // Filter to entities intersecting our window in global coordinates
          if (ent.end <= windowFromGlobal || ent.start >= windowToGlobal) {
            continue;
          }

          const localStart = Math.max(
            0,
            Math.min(docLength, ent.start - baseOffset),
          );
          const localEnd = Math.max(
            0,
            Math.min(docLength, ent.end - baseOffset),
          );

          if (localEnd <= localStart) continue;

          const color = getEntityTypeColor(ent.type);
          const opacity = getOpacity();

          const decoration = Decoration.mark({
            class: 'cm-entity-highlight',
            attributes: {
              'data-entity-key': `${ent.start}-${ent.end}-${ent.type}`,
              style: `
                background-color: ${color}20;
                box-shadow: 0 0 0 1px ${color}40;
                border-radius: 3px;
                cursor: pointer;
                padding: 0 1px;
                font-weight: 500;
                opacity: ${opacity};
              `,
            },
          });

          builder.add(localStart, localEnd, decoration);
        }

        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}

// ---------------------------------------------------------------------------
// Context-menu extension
// ---------------------------------------------------------------------------

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
      const pos = view.posAtCoords({
        x: (event as MouseEvent).clientX,
        y: (event as MouseEvent).clientY,
      });

      if (pos == null) return false;

      const globalPos = baseOffsetRef.current + pos;
      const entity = entitiesRef.current.find(
        (e) => e.start <= globalPos && globalPos <= e.end,
      );
      if (!entity) return false;

      event.preventDefault();

      setContextMenu({
        position: {
          x: (event as MouseEvent).clientX,
          y: (event as MouseEvent).clientY,
        },
        entity,
      });

      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CodeMirrorEditor({
  value,
  onChange,
  minHeight = '400px',
  disableHighlighting = false,
  highlightOpacity = 1.0,
  entities = [],
  renderMarkdown = true, // currently affects styling only; raw/pretty split is handled elsewhere
  onChangeType,
  onCreateNew,
  onReject,
  onTagEntity,
  entityHighlightMode = false,
  baseOffset = 0,
  onCursorChange,
}: CodeMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  const entitiesRef = useRef<EntitySpan[]>(entities);
  const baseOffsetRef = useRef<number>(baseOffset);
  const disableHighlightingRef = useRef<boolean>(disableHighlighting);
  const highlightOpacityRef = useRef<number>(highlightOpacity);
  const entityHighlightModeRef = useRef<boolean>(entityHighlightMode);

  const onChangeRef = useRef(onChange);
  const onCursorChangeRef = useRef(onCursorChange);

  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    entity: EntitySpan;
  } | null>(null);

  // Keep refs in sync
  useEffect(() => {
    entitiesRef.current = entities.slice().sort((a, b) => a.start - b.start);
    if (viewRef.current) {
      // Force a re-draw of decorations when entities change
      viewRef.current.dispatch({ effects: EditorView.scrollIntoView(0) });
    }
  }, [entities]);

  useEffect(() => {
    baseOffsetRef.current = baseOffset;
  }, [baseOffset]);

  useEffect(() => {
    disableHighlightingRef.current = disableHighlighting;
  }, [disableHighlighting]);

  useEffect(() => {
    highlightOpacityRef.current = highlightOpacity;
  }, [highlightOpacity]);

  useEffect(() => {
    entityHighlightModeRef.current = entityHighlightMode;
  }, [entityHighlightMode]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
  }, [onCursorChange]);

  // Create the editor once
  useEffect(() => {
    if (!editorRef.current) return;
    if (viewRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        keymap.of([
          ...defaultKeymap,
          {
            key: 'Mod-e',
            run: (view) => {
              // Quick “create entity from selection” shortcut.
              if (!entityHighlightModeRef.current || !onCreateNew) return false;

              const sel = view.state.selection.main;
              if (sel.empty) return false;

              const text = view.state.doc.sliceString(sel.from, sel.to).trim();
              if (!text) return false;

              const typeInput = window.prompt(
                'Enter entity type (e.g. PERSON, PLACE, ITEM):',
              );
              if (!typeInput) return true;

              const type = typeInput.trim().toUpperCase() as EntityType;

              const globalStart = baseOffsetRef.current + sel.from;
              const globalEnd = baseOffsetRef.current + sel.to;

              const span: EntitySpan = {
                start: globalStart,
                end: globalEnd,
                text,
                displayText: text,
                type,
                confidence: 1,
                source: 'manual',
              };

              onCreateNew(span, type);
              return true;
            },
          },
        ]),
        markdown(),
        syntaxHighlighting(markdownHighlightStyle),
        editorTheme,
        entityHighlighterExtension(
          () => entitiesRef.current,
          () => disableHighlightingRef.current,
          () => highlightOpacityRef.current,
          () => baseOffsetRef.current,
        ),
        contextMenuExtension(setContextMenu, entitiesRef, baseOffsetRef),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }

          if (onCursorChangeRef.current) {
            if (update.selectionSet || update.viewportChanged) {
              const head = update.state.selection.main.head;
              const globalPos = baseOffsetRef.current + head;
              onCursorChangeRef.current(globalPos);
            }
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    // Spellcheck on
    view.dom.setAttribute('spellcheck', 'true');

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Keep value in sync when external value changes (e.g. load new doc)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const current = view.state.doc.toString();
    if (current === value) return;

    view.dispatch({
      changes: {
        from: 0,
        to: current.length,
        insert: value,
      },
    });
  }, [value]);

  // -----------------------------------------------------------------------
  // Context-menu actions
  // -----------------------------------------------------------------------

  const applyTagChange = useCallback(
    (entity: EntitySpan, tagType: 'SET_TYPE' | 'REJECT', newType?: EntityType) => {
      // NOTE: For now, we operate directly on the visible text.
      // We *replace* the entity span with a tag like:
      //   #Name:TYPE     or     [Multi Word]:REJECT_ENTITY
      const text = value;
      const localStart = entity.start - baseOffset;
      const localEnd = entity.end - baseOffset;

      if (
        localStart < 0 ||
        localEnd > text.length ||
        localStart >= localEnd
      ) {
        // Out of range – bail; still call callbacks so backend can react.
        return;
      }

      let replacement: string;

      if (tagType === 'REJECT') {
        if (entity.text.includes(' ')) {
          replacement = `[${entity.text}]:REJECT_ENTITY`;
        } else {
          replacement = `${entity.text}:REJECT_ENTITY`;
        }
      } else {
        const t = newType ?? entity.type;
        if (entity.text.includes(' ')) {
          replacement = `#[${entity.text}]:${t}`;
        } else {
          replacement = `#${entity.text}:${t}`;
        }
      }

      const updated =
        text.slice(0, localStart) + replacement + text.slice(localEnd);
      onChangeRef.current(updated);
    },
    [baseOffset, value],
  );

  const handleChangeType = useCallback(
    async (newType: EntityType) => {
      if (!contextMenu) return;
      const entity = contextMenu.entity;

      if (!entityHighlightMode && newType) {
        applyTagChange(entity, 'SET_TYPE', newType);
      }

      if (onChangeType) {
        await onChangeType(entity, newType);
      }

      setContextMenu(null);
    },
    [contextMenu, entityHighlightMode, onChangeType, applyTagChange],
  );

  const handleCreateNew = useCallback(
    async (type: EntityType) => {
      if (!contextMenu) return;
      const entity = contextMenu.entity;

      if (!entityHighlightMode) {
        applyTagChange(entity, 'SET_TYPE', type);
      }

      if (onCreateNew) {
        await onCreateNew(entity, type);
      }

      setContextMenu(null);
    },
    [contextMenu, entityHighlightMode, onCreateNew, applyTagChange],
  );

  const handleReject = useCallback(async () => {
    if (!contextMenu) return;
    const entity = contextMenu.entity;

    if (!entityHighlightMode) {
      applyTagChange(entity, 'REJECT');
    }

    if (onReject) {
      await onReject(entity);
    }

    setContextMenu(null);
  }, [contextMenu, entityHighlightMode, onReject, applyTagChange]);

  const handleTagEntity = useCallback(async () => {
    if (!contextMenu || !onTagEntity) {
      setContextMenu(null);
      return;
    }

    await onTagEntity(contextMenu.entity, contextMenu.entity);
    setContextMenu(null);
  }, [contextMenu, onTagEntity]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: minHeight,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        ref={editorRef}
        className="cm-editor-wrapper"
        style={{
          width: '100%',
          height: '100%',
          border: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-primary)',
        } as React.CSSProperties}
      />

      {contextMenu && (
        <EntityContextMenu
          position={contextMenu.position}
          entity={{
            text: contextMenu.entity.text,
            type: contextMenu.entity.type,
            confidence: contextMenu.entity.confidence,
          }}
          onChangeType={handleChangeType}
          onCreateNew={handleCreateNew}
          onReject={handleReject}
          onTagEntity={handleTagEntity}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}