/**
 * FormatActionsPlugin - Provides formatting actions for toolbar/palette
 * Exposes Lexical commands through a clean callback interface
 * Includes active state tracking and indent commands
 */

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useState, useCallback } from 'react';
import { 
  FORMAT_TEXT_COMMAND, 
  FORMAT_ELEMENT_COMMAND,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND
} from 'lexical';
import { 
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode
} from '@lexical/list';
import { $getNearestNodeOfType, $setBlocksType } from '@lexical/selection';
import { 
  $isHeadingNode, 
  $createQuoteNode, 
  $isQuoteNode, 
  $createHeadingNode 
} from '@lexical/rich-text';
import { $createParagraphNode } from 'lexical';
import type { FormattingActions } from '../../components/CodeMirrorEditorProps';

export interface FormatState {
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrikethrough: boolean;
  isCode: boolean;
  isQuote: boolean;
  blockType: 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'quote' | 'code';
}

interface FormatActionsPluginProps {
  onActionsReady: (actions: FormattingActions) => void;
  onFormatStateChange?: (state: FormatState) => void;
}

export function FormatActionsPlugin({ onActionsReady, onFormatStateChange }: FormatActionsPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [formatState, setFormatState] = useState<FormatState>({
    isBold: false,
    isItalic: false,
    isUnderline: false,
    isStrikethrough: false,
    isCode: false,
    isQuote: false,
    blockType: 'paragraph'
  });

  // Update format state on selection change
  const updateFormatState = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      const newState: FormatState = {
        isBold: selection.hasFormat('bold'),
        isItalic: selection.hasFormat('italic'),
        isUnderline: selection.hasFormat('underline'),
        isStrikethrough: selection.hasFormat('strikethrough'),
        isCode: selection.hasFormat('code'),
        isQuote: false,
        blockType: 'paragraph'
      };

      // Determine block type
      const anchorNode = selection.anchor.getNode();
      const element = anchorNode.getKey() === 'root'
        ? anchorNode
        : anchorNode.getTopLevelElementOrThrow();

      if ($isHeadingNode(element)) {
        newState.blockType = element.getTag();
      } else if ($isQuoteNode(element)) {
        newState.isQuote = true;
        newState.blockType = 'quote';
      }

      setFormatState(newState);
      onFormatStateChange?.(newState);
    });
  }, [editor, onFormatStateChange]);

  useEffect(() => {
    // Listen for selection changes
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateFormatState();
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, updateFormatState]);

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
              // Remove quote - convert back to paragraph
              $setBlocksType(selection, () => $createParagraphNode());
            } else {
              // Add quote
              $setBlocksType(selection, () => $createQuoteNode());
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
            
            if ($isHeadingNode(element)) {
              const tag = element.getTag();
              // Cycle: h1 -> h2 -> h3 -> p
              if (tag === 'h1') {
                $setBlocksType(selection, () => $createHeadingNode('h2'));
              } else if (tag === 'h2') {
                $setBlocksType(selection, () => $createHeadingNode('h3'));
              } else {
                $setBlocksType(selection, () => $createParagraphNode());
              }
            } else {
              // Not a heading, make it h1
              $setBlocksType(selection, () => $createHeadingNode('h1'));
            }
          }
        });
      },
      
      insertDivider: () => {
        // Dividers not implemented yet
        console.log('[FormatActions] Divider not implemented');
      },
      
      formatHeading: (level: 'h1' | 'h2' | 'h3') => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createHeadingNode(level));
          }
        });
      },
      
      formatParagraph: () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createParagraphNode());
          }
        });
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
      },

      // NEW: Indent commands
      indent: () => {
        editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
      },

      outdent: () => {
        editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
      }
    };

    onActionsReady(actions);
  }, [editor, onActionsReady]);

  return null;
}
