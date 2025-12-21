import './styles.css';
import { useEffect, useMemo, useState, useRef } from 'react';
import type { SerializedEditorState } from 'lexical';
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import type { EntitySpan } from '../types/entities';
import { snapshotRichDoc, mapPlainOffsetToRich } from './flattenRichDoc';
import type { RichDocSnapshot } from './types';
import type { NavigateToRange } from '../components/CodeMirrorEditorProps';

interface RichTextEditorProps {
  initialDocJSON?: SerializedEditorState | null;
  initialPlainText?: string;
  entities: EntitySpan[];
  onChange: (snapshot: RichDocSnapshot) => void;
  onEntityPress?: (span: EntitySpan) => void;
  navigateToRange?: NavigateToRange | null;
}

// Simple plugin to load initial content
function InitialContentPlugin({ content }: { content: string }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!content) return;

    editor.update(() => {
      const root = $getRoot();
      root.clear();

      const paragraph = $createParagraphNode();
      const textNode = $createTextNode(content);
      paragraph.append(textNode);
      root.append(paragraph);
    });
  }, []); // Only run once on mount

  return null;
}

// Plugin to sync changes back to parent
function OnChangeAdapter({ onChange }: { onChange: (snapshot: RichDocSnapshot) => void }) {
  const [editor] = useLexicalComposerContext();

  return (
    <OnChangePlugin
      onChange={(editorState) => {
        editorState.read(() => {
          const json = editorState.toJSON();
          const flattened = snapshotRichDoc(json);
          const snapshot: RichDocSnapshot = {
            ...flattened,
            docJSON: json,
          };
          onChange(snapshot);
        });
      }}
    />
  );
}

export function RichTextEditor({
  initialDocJSON,
  initialPlainText = '',
  entities,
  onChange,
  onEntityPress,
  navigateToRange,
}: RichTextEditorProps) {
  console.log('[RichTextEditor] Rendering with:', {
    hasInitialDoc: !!initialDocJSON,
    initialTextLength: initialPlainText.length,
    entitiesCount: entities.length,
  });

  // Minimal Lexical config - bare bones for testing
  const initialConfig = {
    namespace: 'ares-rich-editor',
    theme: {
      paragraph: 'rich-paragraph',
    },
    onError: (error: Error) => {
      console.error('[Lexical] Error:', error);
    },
    editable: true,
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="rich-editor-shell">
        {/* Simple toolbar placeholder */}
        <div className="rich-toolbar">
          <div className="pill">Rich Text Editor</div>
        </div>

        {/* Main editor surface */}
        <div className="rich-editor-surface">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="rich-content"
                aria-label="Text editor"
                spellCheck={true}
              />
            }
            placeholder={
              <div className="rich-placeholder">
                Start typing...
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />

          {/* Load initial content if provided */}
          {initialPlainText && <InitialContentPlugin content={initialPlainText} />}

          {/* Basic plugins */}
          <HistoryPlugin />
          <OnChangeAdapter onChange={onChange} />
        </div>
      </div>
    </LexicalComposer>
  );
}
