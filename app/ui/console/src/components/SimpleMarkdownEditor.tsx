/**
 * Simple Markdown Editor - No real-time entity highlighting
 * Optimized for performance in Extraction Lab
 */

import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';

interface SimpleMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
}

/**
 * Simple CodeMirror editor without entity highlighting
 * Perfect for performance-critical scenarios like the Extraction Lab
 */
export function SimpleMarkdownEditor({
  value,
  onChange,
  placeholder = 'Start typing...',
  minHeight = '400px',
}: SimpleMarkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Initialize editor
  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;

    const startState = EditorState.create({
      doc: value,
      extensions: [
        keymap.of(defaultKeymap),
        markdown(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': {
            minHeight,
            fontSize: '15px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          },
          '.cm-content': {
            padding: '16px',
            caretColor: '#E8A87C',
          },
          '.cm-line': {
            padding: '0 2px',
            lineHeight: '1.6',
          },
          '&.cm-focused': {
            outline: 'none',
          },
          '.cm-scroller': {
            fontFamily: 'inherit',
          },
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Update editor when value changes externally
  useEffect(() => {
    if (!viewRef.current) return;
    const currentValue = viewRef.current.state.doc.toString();
    if (currentValue !== value) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
    }
  }, [value]);

  return (
    <div
      ref={editorRef}
      style={{
        border: '2px solid #E8A87C',
        borderRadius: '12px',
        overflow: 'hidden',
        background: '#FFFBF5',
      }}
    />
  );
}
