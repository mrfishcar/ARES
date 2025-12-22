/**
 * FloatingFormatToolbar - iOS Notes style formatting toolbar
 * 
 * Behavior:
 * - Appears automatically when text is selected
 * - Positions itself near the selection (above or below)
 * - Slides in with iOS spring animation
 * - Auto-hides when selection is cleared
 * - Keyboard-aware on iOS
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { 
  $getSelection, 
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
} from 'lexical';
import { 
  $patchStyleText,
  $getSelectionStyleValueForProperty,
} from '@lexical/selection';
import { $getNearestNodeOfType, mergeRegister } from '@lexical/utils';
import { $isHeadingNode, $createHeadingNode, HeadingTagType } from '@lexical/rich-text';
import { INSERT_UNORDERED_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND } from '@lexical/list';

interface Position {
  top: number;
  left: number;
  flip: boolean; // true = show above selection, false = show below
}

export function FloatingFormatToolbar() {
  const [editor] = useLexicalComposerContext();
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
  });
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Calculate toolbar position based on selection
  const updateToolbarPosition = useCallback(() => {
    const selection = window.getSelection();
    
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setIsVisible(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Don't show if selection is collapsed or invalid
    if (rect.width === 0 && rect.height === 0) {
      setIsVisible(false);
      return;
    }

    // Calculate toolbar dimensions (approximate)
    const toolbarWidth = 320;
    const toolbarHeight = 50;
    const gap = 8;

    // Calculate horizontal position (centered on selection)
    let left = rect.left + (rect.width / 2) - (toolbarWidth / 2);
    
    // Keep toolbar within viewport horizontally
    const viewportWidth = window.innerWidth;
    if (left < 10) left = 10;
    if (left + toolbarWidth > viewportWidth - 10) {
      left = viewportWidth - toolbarWidth - 10;
    }

    // Calculate vertical position
    // Try to show below selection, but flip above if not enough space
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const flip = spaceBelow < toolbarHeight + gap + 20 && spaceAbove > spaceBelow;

    const top = flip
      ? rect.top - toolbarHeight - gap + window.scrollY
      : rect.bottom + gap + window.scrollY;

    setPosition({ top, left, flip });
    setIsVisible(true);
  }, []);

  // Update active format states
  const updateFormatStates = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        setActiveFormats({
          bold: false,
          italic: false,
          underline: false,
          strikethrough: false,
        });
        return;
      }

      setActiveFormats({
        bold: selection.hasFormat('bold'),
        italic: selection.hasFormat('italic'),
        underline: selection.hasFormat('underline'),
        strikethrough: selection.hasFormat('strikethrough'),
      });
    });
  }, [editor]);

  // Listen to selection changes
  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateToolbarPosition();
          updateFormatStates();
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerUpdateListener(() => {
        updateFormatStates();
      })
    );
  }, [editor, updateToolbarPosition, updateFormatStates]);

  // Update position on scroll/resize
  useEffect(() => {
    if (!isVisible) return;

    const handleUpdate = () => {
      updateToolbarPosition();
    };

    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [isVisible, updateToolbarPosition]);

  // Format command handlers
  const toggleFormat = (format: 'bold' | 'italic' | 'underline' | 'strikethrough') => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const toggleHeading = (level: 1 | 2 | 3) => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      const nodes = selection.getNodes();
      nodes.forEach((node) => {
        const parent = node.getParent();
        if (parent) {
          const existingHeading = $getNearestNodeOfType(node, $isHeadingNode);
          if (existingHeading && existingHeading.getTag() === `h${level}`) {
            // Already this heading level, convert to paragraph
            existingHeading.replace($createHeadingNode('p' as HeadingTagType));
          } else {
            // Convert to heading
            const heading = $createHeadingNode(`h${level}` as HeadingTagType);
            if (existingHeading) {
              existingHeading.replace(heading);
            } else {
              parent.replace(heading);
            }
          }
        }
      });
    });
  };

  const insertList = (type: 'bullet' | 'number') => {
    if (type === 'bullet') {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    }
  };

  if (!isVisible || !position) return null;

  const toolbar = (
    <div
      ref={toolbarRef}
      className={`floating-format-toolbar ${isVisible ? 'floating-format-toolbar--visible' : ''}`}
      style={{
        position: 'absolute',
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 1000,
      }}
    >
      {/* iOS-style format buttons */}
      <div className="floating-format-buttons">
        {/* Text styles */}
        <button
          type="button"
          className={`floating-format-btn ${activeFormats.bold ? 'floating-format-btn--active' : ''}`}
          onClick={() => toggleFormat('bold')}
          title="Bold"
        >
          <strong style={{ fontWeight: 700 }}>B</strong>
        </button>
        
        <button
          type="button"
          className={`floating-format-btn ${activeFormats.italic ? 'floating-format-btn--active' : ''}`}
          onClick={() => toggleFormat('italic')}
          title="Italic"
        >
          <em style={{ fontStyle: 'italic' }}>I</em>
        </button>
        
        <button
          type="button"
          className={`floating-format-btn ${activeFormats.underline ? 'floating-format-btn--active' : ''}`}
          onClick={() => toggleFormat('underline')}
          title="Underline"
        >
          <span style={{ textDecoration: 'underline' }}>U</span>
        </button>

        <div className="floating-format-divider" />

        {/* Headings */}
        <button
          type="button"
          className="floating-format-btn floating-format-btn--text"
          onClick={() => toggleHeading(1)}
          title="Heading 1"
        >
          Title
        </button>
        
        <button
          type="button"
          className="floating-format-btn floating-format-btn--text"
          onClick={() => toggleHeading(2)}
          title="Heading 2"
        >
          Heading
        </button>
        
        <button
          type="button"
          className="floating-format-btn floating-format-btn--text"
          onClick={() => toggleHeading(3)}
          title="Subheading"
        >
          Subhead
        </button>

        <div className="floating-format-divider" />

        {/* Lists */}
        <button
          type="button"
          className="floating-format-btn"
          onClick={() => insertList('bullet')}
          title="Bullet list"
        >
          <span style={{ fontSize: '18px', lineHeight: 1 }}>•</span>
        </button>
        
        <button
          type="button"
          className="floating-format-btn"
          onClick={() => insertList('number')}
          title="Numbered list"
        >
          <span style={{ fontSize: '14px', fontWeight: 600 }}>1.</span>
        </button>
      </div>

      {/* iOS-style pointer/arrow */}
      <div className={`floating-format-arrow ${position.flip ? 'floating-format-arrow--bottom' : 'floating-format-arrow--top'}`} />
    </div>
  );

  // Render via portal to escape any transform contexts
  return createPortal(toolbar, document.body);
}
