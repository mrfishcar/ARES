/**
 * TipTap-based Rich Text Editor for iOS Notes
 *
 * Built on ProseMirror via TipTap for:
 * - Reliable undo/redo
 * - Plugin architecture (for future entity highlighting)
 * - Custom marks and nodes
 * - Better mobile support
 *
 * Code Audit Fixes Applied:
 * - #2: Fixed content sync race condition on note switch
 * - #11: Fixed escapeDiv memory pattern with lazy initialization
 * - #13: Added update source tracking to prevent infinite loops
 */

import React, { useEffect, useCallback, forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';

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
  // Links
  setLink: (url: string) => void;
  unsetLink: () => void;
  // Undo/redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

// ============================================================================
// LINK PREVIEW POPUP
// ============================================================================

interface LinkPreviewData {
  url: string;
  domain: string;
  title?: string;
  description?: string;
  image?: string;
}

// Extract domain from URL
function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Simple link preview popup on hover
// Takes an optional container ref to scope event listeners (defaults to document)
interface LinkPreviewPopupProps {
  containerRef?: React.RefObject<HTMLElement>;
}

function LinkPreviewPopup({ containerRef }: LinkPreviewPopupProps) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<'idle' | 'success' | 'error'>('idle');
  const timeoutRef = useRef<number | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);

  // Track container element for re-attaching listeners when ref becomes available
  const [containerElement, setContainerElement] = useState<HTMLElement | Document | null>(null);

  // Update container element when ref changes
  useEffect(() => {
    // Use container from ref, or document as fallback
    const newContainer = containerRef?.current || document;
    if (newContainer !== containerElement) {
      setContainerElement(newContainer);
    }
  }, [containerRef?.current]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Wait for container to be set
    const container = containerElement;
    if (!container) return;

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a.ios-link');

      // Only handle links within our container
      if (link && container.contains(link)) {
        const url = link.getAttribute('href');
        if (!url) return;

        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // Delay showing preview
        timeoutRef.current = window.setTimeout(() => {
          const rect = link.getBoundingClientRect();
          const popupWidth = 280;
          const popupHeight = 150; // Approximate height
          const padding = 16;

          // Calculate position with viewport bounds checking
          let x = rect.left + rect.width / 2;
          let y = rect.bottom + 8;

          // Clamp X to keep popup within viewport
          const minX = popupWidth / 2 + padding;
          const maxX = window.innerWidth - popupWidth / 2 - padding;
          x = Math.max(minX, Math.min(maxX, x));

          // If popup would go below viewport, show it above the link instead
          if (y + popupHeight > window.innerHeight - padding) {
            y = rect.top - popupHeight - 8;
          }

          // If still off-screen at top, just clamp it
          y = Math.max(padding, y);

          setPosition({ x, y });
          setPreview({
            url,
            domain: getDomain(url),
            // In a real app, fetch metadata from a backend
            title: undefined,
            description: undefined,
            image: undefined,
          });
        }, 500);
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('a.ios-link')) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setPreview(null);
        setPosition(null);
      }
    };

    const handleClick = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setPreview(null);
      setPosition(null);
    };

    container.addEventListener('mouseover', handleMouseOver as EventListener);
    container.addEventListener('mouseout', handleMouseOut as EventListener);
    container.addEventListener('click', handleClick as EventListener);

    return () => {
      container.removeEventListener('mouseover', handleMouseOver as EventListener);
      container.removeEventListener('mouseout', handleMouseOut as EventListener);
      container.removeEventListener('click', handleClick as EventListener);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, [containerElement]);

  // Handle copy to clipboard with feedback
  const handleCopyLink = async () => {
    if (!preview) return;

    try {
      await navigator.clipboard.writeText(preview.url);
      setCopyFeedback('success');
    } catch (err) {
      console.error('Failed to copy link:', err);
      setCopyFeedback('error');
    }

    // Reset feedback after 1.5 seconds
    feedbackTimeoutRef.current = window.setTimeout(() => {
      setCopyFeedback('idle');
      setPreview(null);
      setPosition(null);
    }, 1500);
  };

  if (!preview || !position) return null;

  return createPortal(
    <div
      className="link-preview-popup"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <div className="link-preview-popup__content">
        {preview.image && (
          <img
            className="link-preview-popup__image"
            src={preview.image}
            alt=""
          />
        )}
        <div className="link-preview-popup__text">
          <div className="link-preview-popup__domain">{preview.domain}</div>
          {preview.title && (
            <div className="link-preview-popup__title">{preview.title}</div>
          )}
          {preview.description && (
            <div className="link-preview-popup__description">
              {preview.description}
            </div>
          )}
          <div className="link-preview-popup__url">{preview.url}</div>
        </div>
      </div>
      <div className="link-preview-popup__actions">
        <a
          href={preview.url}
          target="_blank"
          rel="noopener noreferrer"
          className="link-preview-popup__action"
        >
          Open Link
        </a>
        <button
          className="link-preview-popup__action"
          onClick={handleCopyLink}
          disabled={copyFeedback !== 'idle'}
        >
          {copyFeedback === 'success' ? '✓ Copied!' :
           copyFeedback === 'error' ? '✗ Failed' :
           'Copy Link'}
        </button>
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// CONTENT CONVERSION
// ============================================================================

/**
 * Convert inline markdown formatting to HTML
 * Handles: **bold**, _italic_, __underline__, ~~strikethrough~~, ==highlight==, `code`, [text](url)
 */
function processInlineMarkdown(text: string): string {
  if (!text) return '';

  let result = escapeHtml(text);

  // Process in order of specificity (longer patterns first)
  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="ios-link" rel="noopener noreferrer" target="_blank">$1</a>');

  // Highlight: ==text==
  result = result.replace(/==([^=]+)==/g, '<mark>$1</mark>');

  // Strikethrough: ~~text~~
  result = result.replace(/~~([^~]+)~~/g, '<s>$1</s>');

  // Underline: __text__ (must be before bold to avoid conflict)
  result = result.replace(/__([^_]+)__/g, '<u>$1</u>');

  // Bold: **text**
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic: _text_ (avoiding escaped underscores and double underscores for underline)
  // Note: Using a pattern that doesn't require lookbehind for Safari compatibility
  result = result.replace(/(?:^|[^\\])_([^_]+)_/g, (match, content) => {
    // Preserve any leading character that's not a backslash
    const leadingChar = match.startsWith('_') ? '' : match[0];
    return `${leadingChar}<em>${content}</em>`;
  });

  // Inline code: `text`
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

  return result;
}

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
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

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
    // Handle code blocks
    if (line.trim() === '```') {
      if (inCodeBlock) {
        // Close code block
        htmlLines.push(`<pre><code>${escapeHtml(codeBlockLines.join('\n'))}</code></pre>`);
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        // Start code block
        closeOpenLists();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Check for horizontal rule
    if (line.trim() === '---' || line.trim() === '***') {
      closeOpenLists();
      htmlLines.push('<hr>');
      continue;
    }

    // Check for blockquote
    if (line.startsWith('> ')) {
      closeOpenLists();
      htmlLines.push(`<blockquote><p>${processInlineMarkdown(line.slice(2))}</p></blockquote>`);
      continue;
    }

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
      htmlLines.push(`<li data-type="taskItem" data-checked="${isChecked ? 'true' : 'false'}"><p>${processInlineMarkdown(itemText)}</p></li>`);
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
      htmlLines.push(`<li><p>${processInlineMarkdown(itemText)}</p></li>`);
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
      htmlLines.push(`<li><p>${processInlineMarkdown(itemText)}</p></li>`);
      continue;
    }

    // Close any open lists for non-list content
    closeOpenLists();

    // Check for headings
    if (line.startsWith('### ')) {
      htmlLines.push(`<h3>${processInlineMarkdown(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      htmlLines.push(`<h2>${processInlineMarkdown(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('# ')) {
      htmlLines.push(`<h1>${processInlineMarkdown(line.slice(2))}</h1>`);
      continue;
    }

    // Regular paragraph
    const processed = processInlineMarkdown(line);
    htmlLines.push(`<p>${processed || '<br>'}</p>`);
  }

  // Close any remaining open code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    htmlLines.push(`<pre><code>${escapeHtml(codeBlockLines.join('\n'))}</code></pre>`);
  }

  // Close any remaining open lists
  closeOpenLists();

  return htmlLines.join('');
}

/**
 * Convert TipTap HTML back to plain text with markdown-like syntax
 * NOTE: This conversion preserves inline formatting using HTML tags
 */
function htmlToText(html: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  const lines: string[] = [];

  // Process inline formatting within text content
  function processInlineFormatting(el: HTMLElement): string {
    let result = '';

    el.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const childEl = node as HTMLElement;
        const tag = childEl.tagName.toLowerCase();
        const innerContent = processInlineFormatting(childEl);

        // Preserve inline formatting with markers we can restore
        switch (tag) {
          case 'strong':
          case 'b':
            result += `**${innerContent}**`;
            break;
          case 'em':
          case 'i':
            result += `_${innerContent}_`;
            break;
          case 'u':
            result += `__${innerContent}__`;
            break;
          case 's':
          case 'strike':
          case 'del':
            result += `~~${innerContent}~~`;
            break;
          case 'mark':
            result += `==${innerContent}==`;
            break;
          case 'a':
            const href = childEl.getAttribute('href') || '';
            result += `[${innerContent}](${href})`;
            break;
          case 'code':
            result += `\`${innerContent}\``;
            break;
          case 'br':
            result += '\n';
            break;
          default:
            result += innerContent;
        }
      }
    });

    return result;
  }

  function processNode(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tagName = el.tagName.toLowerCase();

    switch (tagName) {
      case 'h1':
        lines.push(`# ${processInlineFormatting(el)}`);
        break;
      case 'h2':
        lines.push(`## ${processInlineFormatting(el)}`);
        break;
      case 'h3':
        lines.push(`### ${processInlineFormatting(el)}`);
        break;
      case 'p':
        // Check if inside a list item
        if (el.parentElement?.tagName.toLowerCase() === 'li') {
          return; // Will be handled by li
        }
        lines.push(processInlineFormatting(el));
        break;
      case 'ul':
        if (el.getAttribute('data-type') === 'taskList') {
          // Task list
          el.querySelectorAll('li[data-type="taskItem"]').forEach(li => {
            const isChecked = li.getAttribute('data-checked') === 'true';
            const text = processInlineFormatting(li as HTMLElement);
            lines.push(`- [${isChecked ? 'x' : ' '}] ${text}`);
          });
        } else {
          // Bullet list
          el.querySelectorAll(':scope > li').forEach(li => {
            lines.push(`• ${processInlineFormatting(li as HTMLElement)}`);
          });
        }
        break;
      case 'ol':
        let num = 1;
        el.querySelectorAll(':scope > li').forEach(li => {
          lines.push(`${num++}. ${processInlineFormatting(li as HTMLElement)}`);
        });
        break;
      case 'li':
        // Handled by parent ul/ol
        break;
      case 'blockquote':
        lines.push(`> ${processInlineFormatting(el)}`);
        break;
      case 'pre':
        lines.push('```');
        lines.push(el.textContent || '');
        lines.push('```');
        break;
      case 'hr':
        lines.push('---');
        break;
      default:
        // Process children
        el.childNodes.forEach(processNode);
    }
  }

  temp.childNodes.forEach(processNode);

  return lines.join('\n');
}

// #11: Lazy initialization of escapeDiv to avoid module-level DOM node
let escapeDiv: HTMLDivElement | null = null;

function getEscapeDiv(): HTMLDivElement | null {
  if (!escapeDiv && typeof document !== 'undefined') {
    escapeDiv = document.createElement('div');
  }
  return escapeDiv;
}

function escapeHtml(text: string): string {
  const div = getEscapeDiv();
  if (!div) {
    // SSR fallback
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  div.textContent = text;
  return div.innerHTML;
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
  // #13: Track whether update is from external source to prevent infinite loops
  const isExternalUpdateRef = useRef(false);
  // Track the last content we set to avoid unnecessary updates
  const lastContentRef = useRef(content);
  // Wrapper ref for scoping event listeners
  const wrapperRef = useRef<HTMLDivElement>(null);

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
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: 'ios-link',
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
    ],
    content: textToHtml(content),
    editable,
    onUpdate: ({ editor }) => {
      // #13: Skip callback if this update was triggered by external content change
      if (isExternalUpdateRef.current) return;

      const html = editor.getHTML();
      const text = htmlToText(html);
      lastContentRef.current = text;
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

  // #2: Fixed content sync - always update when content prop changes (e.g., switching notes)
  // This fixes the race condition where focused editor wouldn't update on note switch
  useEffect(() => {
    if (!editor) return;

    // Skip if content matches what we last set
    if (content === lastContentRef.current) return;

    // #13: Mark this as external update to prevent onUpdate callback
    isExternalUpdateRef.current = true;
    lastContentRef.current = content;

    editor.commands.setContent(textToHtml(content));

    // Reset flag after React's next tick
    requestAnimationFrame(() => {
      isExternalUpdateRef.current = false;
    });
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

    // Links
    setLink: (url: string) => editor?.chain().focus().setLink({ href: url }).run(),
    unsetLink: () => editor?.chain().focus().unsetLink().run(),

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
    <div ref={wrapperRef} className={`ios-tiptap-wrapper ${className}`}>
      <EditorContent editor={editor} />
      <LinkPreviewPopup containerRef={wrapperRef} />
    </div>
  );
});

TipTapEditor.displayName = 'TipTapEditor';

export default TipTapEditor;
