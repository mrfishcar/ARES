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
import { FocusDebugPlugin } from './plugins/FocusDebugPlugin';

interface RichTextEditorProps {
  initialDocJSON?: SerializedEditorState | null;
  initialPlainText?: string;
  entities: EntitySpan[];
  onChange: (snapshot: RichDocSnapshot) => void;
  onEntityPress?: (span: EntitySpan) => void;
  navigateToRange?: NavigateToRange | null;
  showFormatToolbar?: boolean; // Controlled by T button in LabToolbar
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

// iOS Notes-style Formatting Toolbar - transforms into view when T button is toggled
function TransformingFormatToolbar({ isOpen }: { isOpen: boolean }) {
  const [editor] = useLexicalComposerContext();

  const format = (command: any, payload?: any) => {
    editor.dispatchCommand(command, payload);
  };

  return (
    <div className={`transforming-format-toolbar ${isOpen ? 'transforming-format-toolbar--open' : ''}`}>
      {/* Title row */}
      <div className="format-toolbar-section">
        <span className="format-toolbar-label">Text Style</span>
        <div className="format-toolbar-buttons">
          <button
            type="button"
            className="format-toolbar-btn format-toolbar-btn--text"
            onClick={() => format(FORMAT_ELEMENT_COMMAND, 'h1')}
            title="Title"
          >
            Title
          </button>
          <button
            type="button"
            className="format-toolbar-btn format-toolbar-btn--text"
            onClick={() => format(FORMAT_ELEMENT_COMMAND, 'h2')}
            title="Heading"
          >
            Heading
          </button>
          <button
            type="button"
            className="format-toolbar-btn format-toolbar-btn--text"
            onClick={() => format(FORMAT_ELEMENT_COMMAND, 'h3')}
            title="Subheading"
          >
            Subheading
          </button>
          <button
            type="button"
            className="format-toolbar-btn format-toolbar-btn--text"
            onClick={() => format(FORMAT_ELEMENT_COMMAND, 'p')}
            title="Body"
          >
            Body
          </button>
        </div>
      </div>

      {/* Formatting row */}
      <div className="format-toolbar-section">
        <span className="format-toolbar-label">Format</span>
        <div className="format-toolbar-buttons">
          <button
            type="button"
            className="format-toolbar-btn"
            onClick={() => format(FORMAT_TEXT_COMMAND, 'bold')}
            title="Bold"
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className="format-toolbar-btn"
            onClick={() => format(FORMAT_TEXT_COMMAND, 'italic')}
            title="Italic"
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className="format-toolbar-btn"
            onClick={() => format(FORMAT_TEXT_COMMAND, 'underline')}
            title="Underline"
          >
            <u>U</u>
          </button>
          <button
            type="button"
            className="format-toolbar-btn"
            onClick={() => format(FORMAT_TEXT_COMMAND, 'strikethrough')}
            title="Strikethrough"
          >
            <s>S</s>
          </button>
        </div>
      </div>

      {/* Lists row */}
      <div className="format-toolbar-section">
        <span className="format-toolbar-label">Lists</span>
        <div className="format-toolbar-buttons">
          <button
            type="button"
            className="format-toolbar-btn"
            onClick={() => format(INSERT_UNORDERED_LIST_COMMAND, undefined)}
            title="Bullet List"
          >
            <span style={{ fontSize: '18px' }}>•</span>
          </button>
          <button
            type="button"
            className="format-toolbar-btn"
            onClick={() => format(INSERT_ORDERED_LIST_COMMAND, undefined)}
            title="Numbered List"
          >
            <span style={{ fontSize: '14px', fontWeight: 600 }}>1.</span>
          </button>
          <button
            type="button"
            className="format-toolbar-btn"
            onClick={() => format(INSERT_CHECK_LIST_COMMAND, undefined)}
            title="Checklist"
          >
            <span style={{ fontSize: '16px' }}>☐</span>
          </button>
        </div>
      </div>
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
  showFormatToolbar = false,
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
        {/* Transforming format toolbar - appears when T button is toggled */}
        <TransformingFormatToolbar isOpen={showFormatToolbar} />

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
          <FocusDebugPlugin />
        </div>
      </div>
    </LexicalComposer>
  );
}
