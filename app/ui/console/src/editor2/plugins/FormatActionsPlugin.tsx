/**
 * FormatActionsPlugin - Provides formatting actions for toolbar/palette
 * Exposes Lexical commands through a clean callback interface
 */

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { 
  FORMAT_TEXT_COMMAND, 
  FORMAT_ELEMENT_COMMAND,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW
} from 'lexical';
import { 
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode
} from '@lexical/list';
import { $getNearestNodeOfType } from '@lexical/utils';
import { $isHeadingNode, $createQuoteNode, $isQuoteNode } from '@lexical/rich-text';
import type { FormattingActions } from '../../components/CodeMirrorEditorProps';

interface FormatActionsPluginProps {
  onActionsReady: (actions: FormattingActions) => void;
}

export function FormatActionsPlugin({ onActionsReady }: FormatActionsPluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const actions: FormattingActions = {
      toggleBold: () => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
      },
      
      toggleItalic: () => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
      },
      
      toggleUnderline: () => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
      },
      
      toggleStrikethrough: () => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough');
      },
      
      toggleMonospace: () => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');
      },
      
      toggleQuote: () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const nodes = selection.getNodes();
            const firstNode = nodes[0];
            const parent = firstNode.getParent();
            
            if ($isQuoteNode(parent)) {
              // Remove quote
              editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'paragraph');
            } else {
              // Add quote - need to wrap in quote node
              // For now, just format as quote (simplified)
              editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'quote');
            }
          }
        });
      },
      
      cycleHeading: () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const anchorNode = selection.anchor.getNode();
            const element = anchorNode.getKey() === 'root'
              ? anchorNode
              : anchorNode.getTopLevelElementOrThrow();
            
            const headingNode = $getNearestNodeOfType(element, $isHeadingNode);
            
            if (headingNode) {
              const tag = headingNode.getTag();
              // Cycle: h1 -> h2 -> h3 -> p
              if (tag === 'h1') {
                editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'h2');
              } else if (tag === 'h2') {
                editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'h3');
              } else {
                editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'paragraph');
              }
            } else {
              // Not a heading, make it h1
              editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'h1');
            }
          }
        });
      },
      
      insertDivider: () => {
        // Dividers not implemented yet
        console.log('[FormatActions] Divider not implemented');
      },
      
      formatHeading: (level: 'h1' | 'h2' | 'h3') => {
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, level);
      },
      
      formatParagraph: () => {
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'paragraph');
      },
      
      insertBulletList: () => {
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      },
      
      insertNumberedList: () => {
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      },
      
      insertCheckList: () => {
        editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
      },
      
      removeList: () => {
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      }
    };

    onActionsReady(actions);
  }, [editor, onActionsReady]);

  return null;
}
