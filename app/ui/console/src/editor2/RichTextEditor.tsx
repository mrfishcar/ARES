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
  showFormatToolbar?: boolean; // Controlled by external T button
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

// Formatting Toolbar - iOS Notes style (controlled from outside)
function FormattingToolbar({ isOpen }: { isOpen: boolean }) {
  const [editor] = useLexicalComposerContext();
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
    } else {
      // Delay removing animation class to allow exit animation
      const timer = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const format = (command: any, payload?: any) => {
    editor.dispatchCommand(command, payload);
  };

  if (!isOpen && !isAnimating) return null;

  return (
    <div className={`rich-formatting-toolbar ${isOpen ? 'rich-formatting-toolbar--open' : 'rich-formatting-toolbar--closing'}`}>
      {/* Text formatting row */}
      <div className="rich-formatting-row" style={{ '--delay': '0.05s' } as React.CSSProperties}>
        <button
          type="button"
          className="rich-format-btn"
          onClick={() => format(FORMAT_TEXT_COMMAND, 'bold')}
          title="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="rich-format-btn"
          onClick={() => format(FORMAT_TEXT_COMMAND, 'italic')}
          title="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className="rich-format-btn"
          onClick={() => format(FORMAT_TEXT_COMMAND, 'underline')}
          title="Underline"
        >
          <u>U</u>
        </button>
        <button
          type="button"
          className="rich-format-btn"
          onClick={() => format(FORMAT_TEXT_COMMAND, 'strikethrough')}
          title="Strikethrough"
        >
          <s>S</s>
        </button>
      </div>

      {/* Block formatting row */}
      <div className="rich-formatting-row" style={{ '--delay': '0.1s' } as React.CSSProperties}>
        <button
          type="button"
          className="rich-format-btn"
          onClick={() => format(FORMAT_ELEMENT_COMMAND, 'h1')}
          title="Heading 1"
        >
          H1
        </button>
        <button
          type="button"
          className="rich-format-btn"
          onClick={() => format(FORMAT_ELEMENT_COMMAND, 'h2')}
          title="Heading 2"
        >
          H2
        </button>
        <button
          type="button"
          className="rich-format-btn"
          onClick={() => format(FORMAT_ELEMENT_COMMAND, 'h3')}
          title="Heading 3"
        >
          H3
        </button>
        <button
          type="button"
          className="rich-format-btn"
          onClick={() => format(FORMAT_ELEMENT_COMMAND, 'quote')}
          title="Quote"
        >
          "
        </button>
      </div>

      {/* List formatting row */}
      <div className="rich-formatting-row" style={{ '--delay': '0.15s' } as React.CSSProperties}>
        <button
          type="button"
          className="rich-format-btn"
          onClick={() => format(INSERT_UNORDERED_LIST_COMMAND, undefined)}
          title="Bullet list"
        >
          •
        </button>
        <button
          type="button"
          className="rich-format-btn"
          onClick={() => format(INSERT_ORDERED_LIST_COMMAND, undefined)}
          title="Numbered list"
        >
          1.
        </button>
        <button
          type="button"
          className="rich-format-btn"
          onClick={() => format(INSERT_CHECK_LIST_COMMAND, undefined)}
          title="Checklist"
        >
          ☐
        </button>
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
        {/* Formatting toolbar - controlled by external T button */}
        <FormattingToolbar isOpen={showFormatToolbar} />

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
