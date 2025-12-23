import './styles.css';
import { useEffect, useState } from 'react';
import type { SerializedEditorState } from 'lexical';
import { $getRoot, $createParagraphNode, $createTextNode, FORMAT_TEXT_COMMAND, FORMAT_ELEMENT_COMMAND } from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode, INSERT_UNORDERED_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND, INSERT_CHECK_LIST_COMMAND } from '@lexical/list';
import type { EntitySpan } from '../types/entities';
import { snapshotRichDoc } from './flattenRichDoc';
import type { RichDocSnapshot } from './types';
import type { NavigateToRange, FormattingActions } from '../components/CodeMirrorEditorProps';
import { FocusDebugPlugin } from './plugins/FocusDebugPlugin';
import { FormatActionsPlugin, type FormatState } from './plugins/FormatActionsPlugin';

interface RichTextEditorProps {
  initialDocJSON?: SerializedEditorState | null;
  initialPlainText?: string;
  entities: EntitySpan[];
  onChange: (snapshot: RichDocSnapshot) => void;
  onEntityPress?: (span: EntitySpan) => void;
  navigateToRange?: NavigateToRange | null;
  showFormatToolbar?: boolean; // Controlled by T button in LabToolbar
  onFormatActionsReady?: (actions: FormattingActions) => void; // NEW: Callback for format actions
  onFormatStateChange?: (state: FormatState) => void; // NEW: Callback for format state changes
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
  showFormatToolbar = false,
  onFormatActionsReady,
  onFormatStateChange,
}: RichTextEditorProps) {
  console.log('[RichTextEditor] Rendering with:', {
    hasInitialDoc: !!initialDocJSON,
    initialTextLength: initialPlainText.length,
    entitiesCount: entities.length,
    showFormatToolbar,
  });

  // Lexical config with rich text nodes
  const initialConfig = {
    namespace: 'ares-rich-editor',
    theme: {
      paragraph: 'rich-paragraph',
      heading: {
        h1: 'rich-h1',
        h2: 'rich-h2',
        h3: 'rich-h3',
      },
      quote: 'rich-quote',
      text: {
        bold: 'rich-bold',
        italic: 'rich-italic',
        underline: 'rich-underline',
        strikethrough: 'rich-strikethrough',
      },
      list: {
        ul: 'rich-ul',
        ol: 'rich-ol',
        listitem: 'rich-listitem',
        checklist: 'rich-checklist',
      },
    },
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode],
    onError: (error: Error) => {
      console.error('[Lexical] Error:', error);
    },
    editable: true,
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="rich-editor-shell">
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

          {/* Format actions plugin */}
          {onFormatActionsReady && (
            <FormatActionsPlugin 
              onActionsReady={onFormatActionsReady}
              onFormatStateChange={onFormatStateChange}
            />
          )}

          {/* Plugins */}
          <HistoryPlugin />
          <ListPlugin />
          <CheckListPlugin />
          <OnChangeAdapter onChange={onChange} />
          <FocusDebugPlugin />
        </div>
      </div>
    </LexicalComposer>
  );
}
