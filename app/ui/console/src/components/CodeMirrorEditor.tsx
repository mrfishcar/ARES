/**
 * ARES Extraction Lab Editor — CLEAN STABLE BUILD
 * Fixes:
 * - Header overlap (top padding inside editor content)
 * - iPad keyboard blur loss
 * - Autocorrect / spellcheck enabled
 * - Single scroll container
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

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
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif',
    fontSize: '15px',
    lineHeight: '1.75',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  },

  // ✅ THIS IS THE FIX — TEXT STARTS BELOW HEADER BUT CAN'T SCROLL UNDER IT
  '.cm-content': {
    padding: '96px 16px 16px 16px', // 80px header + normal padding
    boxSizing: 'border-box',
  },

  '.cm-scroller': {
    overflow: 'auto',
  },

  '.cm-line': {
    position: 'relative',
  },

  '.cm-gutters': {
    backgroundColor: 'var(--bg-secondary)',
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
  const BUFFER = 2000;

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

        const { from, to } = view.viewport;
        const base = getBaseOffset();
        const builder = new RangeSetBuilder<Decoration>();

        for (const ent of entities) {
          const start = Math.max(0, ent.start - base);
          const end = Math.min(view.state.doc.length, ent.end - base);
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

// -------------------- MAIN COMPONENT --------------------

export function CodeMirrorEditor({
  value,
  onChange,
  minHeight = '400px',
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
}: CodeMirrorEditorProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const entitiesRef = useRef<EntitySpan[]>(entities);
  const baseOffsetRef = useRef(baseOffset);

  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    entity: EntitySpan;
  } | null>(null);

  useEffect(() => {
    entitiesRef.current = entities;
    viewRef.current?.dispatch({
      effects: ForceDecorationUpdate.of(undefined),
    });
  }, [entities]);

  useEffect(() => {
    baseOffsetRef.current = baseOffset;
  }, [baseOffset]);

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
          () => disableHighlighting,
          () => highlightOpacity,
          () => baseOffsetRef.current,
        ),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: wrapperRef.current,
    });

    // ✅ REQUIRED FOR iPadOS AUTOCORRECT
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

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const current = view.state.doc.toString();
    if (current === value) return;

    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
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
          overflow: 'auto',
          touchAction: 'manipulation',
          WebkitOverflowScrolling: 'touch',
        }}
      />

      {contextMenu && (
        <EntityContextMenu
          position={contextMenu.position}
          entity={contextMenu.entity}
          onChangeType={onChangeType}
          onCreateNew={onCreateNew}
          onReject={onReject}
          onTagEntity={onTagEntity}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}