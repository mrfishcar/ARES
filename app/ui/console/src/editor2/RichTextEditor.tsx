import './styles.css';
import { useEffect, useMemo, useState, useRef } from 'react';
import type { SerializedEditorState } from 'lexical';
import { FORMAT_ELEMENT_COMMAND, FORMAT_TEXT_COMMAND, INSERT_HORIZONTAL_RULE_COMMAND } from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode, INSERT_UNORDERED_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND, INSERT_CHECK_LIST_COMMAND } from '@lexical/list';
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { EntitySpan } from '../types/entities';
import { EntityHighlightPlugin } from './plugins/EntityHighlightPlugin';
import { snapshotRichDoc, mapPlainOffsetToRich } from './flattenRichDoc';
import type { RichDocSnapshot, UIMode } from './types';
import { EntityHighlightNode } from './nodes/EntityHighlightNode';
import { importPlainText } from './importers';
import type { NavigateToRange } from '../components/CodeMirrorEditorProps';

interface ToolbarProps {
  uiMode: UIMode;
  onToggleMode: () => void;
  onCloseFormat: () => void;
}

function FormattingToolbar({ uiMode, onToggleMode, onCloseFormat }: ToolbarProps) {
  const [editor] = useLexicalComposerContext();

  const run = (command: any, payload?: any) => {
    editor.dispatchCommand(command, payload);
  };

  const toggleHeading = () => {
    run(FORMAT_ELEMENT_COMMAND, 'h1');
  };

  const toggleList = (type: 'bullet' | 'number' | 'check') => {
    if (type === 'bullet') run(INSERT_UNORDERED_LIST_COMMAND);
    else if (type === 'number') run(INSERT_ORDERED_LIST_COMMAND);
    else run(INSERT_CHECK_LIST_COMMAND);
  };

  return (
    <div className={`rich-toolbar ${uiMode === 'format' ? 'rich-toolbar--open' : ''}`}>
      <button type="button" className="pill" onClick={onToggleMode} aria-label="Toggle format toolbar">
        {uiMode === 'write' ? 'Format' : 'Write'}
      </button>
      {uiMode === 'format' && (
        <div className="rich-toolbar__controls" role="toolbar">
          <div className="rich-toolbar__row">
            <button type="button" onClick={() => run(FORMAT_TEXT_COMMAND, 'bold')}>B</button>
            <button type="button" onClick={() => run(FORMAT_TEXT_COMMAND, 'italic')}>I</button>
            <button type="button" onClick={() => run(FORMAT_TEXT_COMMAND, 'underline')}>U</button>
            <button type="button" onClick={() => run(FORMAT_TEXT_COMMAND, 'strikethrough')}>S</button>
            <button type="button" onClick={() => run(INSERT_HORIZONTAL_RULE_COMMAND)}>―</button>
          </div>
          <div className="rich-toolbar__row">
            <button type="button" onClick={toggleHeading}>Title</button>
            <button type="button" onClick={() => toggleList('bullet')}>• List</button>
            <button type="button" onClick={() => toggleList('number')}>1. List</button>
            <button type="button" onClick={() => toggleList('check')}>☐</button>
            <button type="button" onClick={() => run(FORMAT_ELEMENT_COMMAND, 'blockquote')}>“Quote”</button>
            <button type="button" onClick={onCloseFormat}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

interface RichTextEditorProps {
  initialDocJSON?: SerializedEditorState | null;
  initialPlainText?: string;
  entities: EntitySpan[];
  onChange: (snapshot: RichDocSnapshot) => void;
  onEntityPress?: (span: EntitySpan) => void;
  navigateToRange?: NavigateToRange | null;
}

const lexicalTheme = {
  text: {
    bold: 'rich-bold',
    italic: 'rich-italic',
    underline: 'rich-underline',
    strikethrough: 'rich-strike',
  },
  paragraph: 'rich-paragraph',
  quote: 'rich-quote',
  heading: {
    h1: 'rich-h1',
    h2: 'rich-h2',
    h3: 'rich-h3',
    h4: 'rich-h4',
  },
  list: {
    listitem: 'rich-list-item',
  },
};

export function RichTextEditor({
  initialDocJSON,
  initialPlainText,
  entities,
  onChange,
  onEntityPress,
  navigateToRange,
}: RichTextEditorProps) {
  const [uiMode, setMode] = useState<UIMode>('write');
  const initialState = useMemo<SerializedEditorState>(() => {
    if (initialDocJSON) return initialDocJSON;
    return importPlainText(initialPlainText || '');
  }, [initialDocJSON, initialPlainText]);

  const [lastSnapshot, setLastSnapshot] = useState<RichDocSnapshot>(() => ({
    ...snapshotRichDoc(initialState),
    docJSON: initialState,
  }));

  const initialConfig = useMemo(
    () => ({
      namespace: 'ares-rich-editor',
      editorState: null,
      nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, HorizontalRuleNode, EntityHighlightNode],
      onError: (error: Error) => {
        console.error('Lexical error', error);
      },
      theme: lexicalTheme,
    }),
    [initialState],
  );

  function InitialStateLoader() {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
      const parsed = editor.parseEditorState(initialState as any);
      editor.setEditorState(parsed);
    }, [editor]);
    return null;
  }

  useEffect(() => {
    onChange(lastSnapshot);
  }, []);

  function NavigateToRangePlugin({ target, posMap }: { target?: NavigateToRange | null; posMap: ReturnType<typeof snapshotRichDoc>['posMap'] }) {
    const [editor] = useLexicalComposerContext();
    const lastHandled = useRef<number | null>(null);

    useEffect(() => {
      if (!target) return;
      if (lastHandled.current === target.requestId) return;
      const anchor = mapPlainOffsetToRich(posMap, target.from);
      if (!anchor) return;
      lastHandled.current = target.requestId;
      editor.getEditorState().read(() => {
        const el = editor.getElementByKey(anchor.key);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('rich-flash');
          window.setTimeout(() => el.classList.remove('rich-flash'), 800);
        }
      });
    }, [target, posMap, editor]);

    return null;
  }

  return (
    <LexicalComposer initialConfig={initialConfig as any}>
      <div className="rich-editor-shell">
        <FormattingToolbar
          uiMode={uiMode}
          onToggleMode={() => setMode(uiMode === 'write' ? 'format' : 'write')}
          onCloseFormat={() => setMode('write')}
        />
        <div className="rich-editor-surface" aria-label="Document editor">
          <RichTextPlugin
            contentEditable={<ContentEditable className="rich-content" />}
            placeholder={<div className="rich-placeholder">Write or paste text…</div>}
          />
          <InitialStateLoader />
          <HistoryPlugin />
          <ListPlugin />
          <CheckListPlugin />
          <HorizontalRulePlugin />
          <AutoFocusPlugin />
          <NavigateToRangePlugin target={navigateToRange} posMap={lastSnapshot.posMap} />
          <OnChangePlugin
            onChange={(editorState) => {
              editorState.read(() => {
                const json = editorState.toJSON();
                const flattened = snapshotRichDoc(json);
                const snapshot: RichDocSnapshot = {
                  ...flattened,
                  docJSON: json,
                };
                setLastSnapshot(snapshot);
                onChange(snapshot);
              });
            }}
          />
          <EntityHighlightPlugin spans={entities} posMap={lastSnapshot.posMap} onHighlightClick={onEntityPress} />
        </div>
      </div>
    </LexicalComposer>
  );
}
