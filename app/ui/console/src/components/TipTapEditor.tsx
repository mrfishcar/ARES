/**
 * TipTap-based Rich Text Editor for iOS Notes
 *
 * Built on ProseMirror via TipTap for:
 * - Reliable undo/redo
 * - Plugin architecture (for future entity highlighting)
 * - Custom marks and nodes
 * - Better mobile support
 */

import React, { useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';

// ============================================================================
// TYPES
// ============================================================================

export interface TipTapEditorProps {
  content: string;
  onContentChange: (content: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
}

export interface TipTapEditorRef {
  focus: () => void;
  blur: () => void;
  getEditor: () => Editor | null;
  // Formatting commands
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrike: () => void;
  toggleHighlight: () => void;
  toggleTaskList: () => void;
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
  setHeading: (level: 1 | 2 | 3) => void;
  setParagraph: () => void;
  // Undo/redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

// ============================================================================
// CONTENT CONVERSION
// ============================================================================

/**
 * Convert plain text (with markdown-like syntax) to HTML for TipTap
 */
function textToHtml(text: string): string {
  if (!text) return '<p></p>';

  const lines = text.split('\n');
  const htmlLines: string[] = [];
  let inTaskList = false;
  let inBulletList = false;
  let inOrderedList = false;

  const closeOpenLists = () => {
    if (inTaskList) {
      htmlLines.push('</ul>');
      inTaskList = false;
    }
    if (inBulletList) {
      htmlLines.push('</ul>');
      inBulletList = false;
    }
    if (inOrderedList) {
      htmlLines.push('</ol>');
      inOrderedList = false;
    }
  };

  for (const line of lines) {
    // Check for task list items
    if (line.match(/^- \[[ x]\] /)) {
      // Close other list types if open
      if (inBulletList) { htmlLines.push('</ul>'); inBulletList = false; }
      if (inOrderedList) { htmlLines.push('</ol>'); inOrderedList = false; }

      if (!inTaskList) {
        htmlLines.push('<ul data-type="taskList">');
        inTaskList = true;
      }
      const isChecked = line.match(/^- \[x\] /i);
      const itemText = line.replace(/^- \[[ x]\] /, '');
      htmlLines.push(`<li data-type="taskItem" data-checked="${isChecked ? 'true' : 'false'}"><p>${escapeHtml(itemText)}</p></li>`);
      continue;
    }

    // Check for bullet list (but not task list markers)
    if ((line.startsWith('• ') || line.startsWith('- ')) && !line.match(/^- \[[ x]\] /)) {
      // Close other list types if open
      if (inTaskList) { htmlLines.push('</ul>'); inTaskList = false; }
      if (inOrderedList) { htmlLines.push('</ol>'); inOrderedList = false; }

      if (!inBulletList) {
        htmlLines.push('<ul>');
        inBulletList = true;
      }
      const itemText = line.slice(2);
      htmlLines.push(`<li><p>${escapeHtml(itemText)}</p></li>`);
      continue;
    }

    // Check for numbered list
    if (line.match(/^\d+\. /)) {
      // Close other list types if open
      if (inTaskList) { htmlLines.push('</ul>'); inTaskList = false; }
      if (inBulletList) { htmlLines.push('</ul>'); inBulletList = false; }

      if (!inOrderedList) {
        htmlLines.push('<ol>');
        inOrderedList = true;
      }
      const itemText = line.replace(/^\d+\. /, '');
      htmlLines.push(`<li><p>${escapeHtml(itemText)}</p></li>`);
      continue;
    }

    // Close any open lists for non-list content
    closeOpenLists();

    // Check for headings
    if (line.startsWith('### ')) {
      htmlLines.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      htmlLines.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('# ')) {
      htmlLines.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
      continue;
    }

    // Regular paragraph
    htmlLines.push(`<p>${escapeHtml(line) || '<br>'}</p>`);
  }

  // Close any remaining open lists
  closeOpenLists();

  return htmlLines.join('');
}

/**
 * Convert TipTap HTML back to plain text with markdown-like syntax
 */
function htmlToText(html: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  const lines: string[] = [];

  function processNode(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tagName = el.tagName.toLowerCase();

    switch (tagName) {
      case 'h1':
        lines.push(`# ${el.textContent || ''}`);
        break;
      case 'h2':
        lines.push(`## ${el.textContent || ''}`);
        break;
      case 'h3':
        lines.push(`### ${el.textContent || ''}`);
        break;
      case 'p':
        // Check if inside a list item
        if (el.parentElement?.tagName.toLowerCase() === 'li') {
          return; // Will be handled by li
        }
        lines.push(el.textContent || '');
        break;
      case 'ul':
        if (el.getAttribute('data-type') === 'taskList') {
          // Task list
          el.querySelectorAll('li[data-type="taskItem"]').forEach(li => {
            const isChecked = li.getAttribute('data-checked') === 'true';
            const text = li.textContent || '';
            lines.push(`- [${isChecked ? 'x' : ' '}] ${text}`);
          });
        } else {
          // Bullet list
          el.querySelectorAll(':scope > li').forEach(li => {
            lines.push(`• ${li.textContent || ''}`);
          });
        }
        break;
      case 'ol':
        let num = 1;
        el.querySelectorAll(':scope > li').forEach(li => {
          lines.push(`${num++}. ${li.textContent || ''}`);
        });
        break;
      case 'li':
        // Handled by parent ul/ol
        break;
      default:
        // Process children
        el.childNodes.forEach(processNode);
    }
  }

  temp.childNodes.forEach(processNode);

  return lines.join('\n');
}

// Reusable element for HTML escaping (created once)
const escapeDiv = typeof document !== 'undefined' ? document.createElement('div') : null;

function escapeHtml(text: string): string {
  if (!escapeDiv) {
    // SSR fallback
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  escapeDiv.textContent = text;
  return escapeDiv.innerHTML;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const TipTapEditor = forwardRef<TipTapEditorRef, TipTapEditorProps>(({
  content,
  onContentChange,
  onBlur,
  onFocus,
  placeholder = 'Start typing...',
  className = '',
  editable = true,
}, ref) => {

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable default heading to use custom styling
        heading: {
          levels: [1, 2, 3],
        },
        // Configure task lists separately
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      TaskList.configure({
        HTMLAttributes: {
          class: 'ios-task-list',
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: 'ios-task-item',
        },
      }),
      Underline,
      Highlight.configure({
        multicolor: true,
      }),
    ],
    content: textToHtml(content),
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = htmlToText(html);
      onContentChange(text);
    },
    onBlur: () => {
      onBlur?.();
    },
    onFocus: () => {
      onFocus?.();
    },
    editorProps: {
      attributes: {
        class: 'ios-tiptap-editor',
      },
    },
  });

  // Update content when prop changes (e.g., switching notes)
  useEffect(() => {
    if (editor && !editor.isFocused) {
      const currentText = htmlToText(editor.getHTML());
      if (currentText !== content) {
        editor.commands.setContent(textToHtml(content));
      }
    }
  }, [content, editor]);

  // Expose editor methods via ref
  useImperativeHandle(ref, () => ({
    focus: () => editor?.commands.focus(),
    blur: () => editor?.commands.blur(),
    getEditor: () => editor,

    // Formatting
    toggleBold: () => editor?.chain().focus().toggleBold().run(),
    toggleItalic: () => editor?.chain().focus().toggleItalic().run(),
    toggleUnderline: () => editor?.chain().focus().toggleUnderline().run(),
    toggleStrike: () => editor?.chain().focus().toggleStrike().run(),
    toggleHighlight: () => editor?.chain().focus().toggleHighlight().run(),
    toggleTaskList: () => editor?.chain().focus().toggleTaskList().run(),
    toggleBulletList: () => editor?.chain().focus().toggleBulletList().run(),
    toggleOrderedList: () => editor?.chain().focus().toggleOrderedList().run(),
    setHeading: (level: 1 | 2 | 3) => editor?.chain().focus().toggleHeading({ level }).run(),
    setParagraph: () => editor?.chain().focus().setParagraph().run(),

    // Undo/redo
    undo: () => editor?.chain().focus().undo().run(),
    redo: () => editor?.chain().focus().redo().run(),
    canUndo: () => editor?.can().undo() ?? false,
    canRedo: () => editor?.can().redo() ?? false,
  }), [editor]);

  if (!editor) {
    return null;
  }

  return (
    <EditorContent
      editor={editor}
      className={`ios-tiptap-wrapper ${className}`}
    />
  );
});

TipTapEditor.displayName = 'TipTapEditor';

export default TipTapEditor;
