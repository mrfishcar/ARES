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

// Formatting Toolbar - lives inside LexicalComposer context
function FormattingToolbar({ isOpen, onToggle, onClose }: { isOpen: boolean; onToggle: () => void; onClose: () => void }) {
  const [editor] = useLexicalComposerContext();

  const format = (command: any, payload?: any) => {
    editor.dispatchCommand(command, payload);
  };

  return (
    <div className={`rich-toolbar ${isOpen ? 'rich-toolbar--open' : ''}`}>
      {/* Toggle button */}
      <button
        type="button"
        className="pill"
        onClick={onToggle}
        aria-label={isOpen ? 'Close formatting' : 'Open formatting'}
      >
        {isOpen ? 'Write' : 'Format'}
      </button>

      {/* Formatting controls - only visible when open */}
      {isOpen && (
        <div className="rich-toolbar__controls">
          {/* Text formatting */}
          <div className="rich-toolbar__row">
            <button
              type="button"
              onClick={() => format(FORMAT_TEXT_COMMAND, 'bold')}
              title="Bold"
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              onClick={() => format(FORMAT_TEXT_COMMAND, 'italic')}
              title="Italic"
            >
              <em>I</em>
            </button>
            <button
              type="button"
              onClick={() => format(FORMAT_TEXT_COMMAND, 'underline')}
              title="Underline"
            >
              <u>U</u>
            </button>
            <button
              type="button"
              onClick={() => format(FORMAT_TEXT_COMMAND, 'strikethrough')}
              title="Strikethrough"
            >
              <s>S</s>
            </button>
          </div>

          {/* Block formatting */}
          <div className="rich-toolbar__row">
            <button
              type="button"
              onClick={() => format(FORMAT_ELEMENT_COMMAND, 'h1')}
              title="Heading 1"
            >
              H1
            </button>
            <button
              type="button"
              onClick={() => format(FORMAT_ELEMENT_COMMAND, 'h2')}
              title="Heading 2"
            >
              H2
            </button>
            <button
              type="button"
              onClick={() => format(FORMAT_ELEMENT_COMMAND, 'h3')}
              title="Heading 3"
            >
              H3
            </button>
            <button
              type="button"
              onClick={() => format(INSERT_UNORDERED_LIST_COMMAND, undefined)}
              title="Bullet list"
            >
              • List
            </button>
            <button
              type="button"
              onClick={() => format(INSERT_ORDERED_LIST_COMMAND, undefined)}
              title="Numbered list"
            >
              1. List
            </button>
            <button
              type="button"
              onClick={() => format(INSERT_CHECK_LIST_COMMAND, undefined)}
              title="Checklist"
            >
              ☐ List
            </button>
            <button
              type="button"
              onClick={() => format(FORMAT_ELEMENT_COMMAND, 'quote')}
              title="Quote"
            >
              " Quote
            </button>
          </div>

          {/* Close button */}
          <div className="rich-toolbar__row">
            <button
              type="button"
              onClick={onClose}
              className="rich-toolbar__done"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
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
  const [formatToolbarOpen, setFormatToolbarOpen] = useState(false);

  console.log('[RichTextEditor] Rendering with:', {
    hasInitialDoc: !!initialDocJSON,
    initialTextLength: initialPlainText.length,
    entitiesCount: entities.length,
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
        {/* Formatting toolbar - inside Lexical context */}
        <FormattingToolbar
          isOpen={formatToolbarOpen}
          onToggle={() => setFormatToolbarOpen(!formatToolbarOpen)}
          onClose={() => setFormatToolbarOpen(false)}
        />

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

          {/* Plugins */}
          <HistoryPlugin />
          <ListPlugin />
          <CheckListPlugin />
          <OnChangeAdapter onChange={onChange} />
        </div>
      </div>
    </LexicalComposer>
  );
}
