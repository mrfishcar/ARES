/**
 * FormattingPalette - iOS Notes-style floating formatting controls
 * Single-row layout with inline style chips and formatting buttons.
 * Features active state tracking and keyboard shortcuts.
 */

import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, ListChecks, IndentDecrease, IndentIncrease, Quote } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { FormattingActions } from '../components/CodeMirrorEditorProps';
import type { FormatState } from './plugins/FormatActionsPlugin';

interface FormattingPaletteProps {
  isOpen: boolean;
  formatActions?: FormattingActions | null;
  formatState?: FormatState | null;
  onClose: () => void;
}

const STYLE_OPTIONS = [
  { value: 'h2', label: 'Heading' },
  { value: 'h3', label: 'Subheading' },
  { value: 'p', label: 'Body' },
] as const;

const ICON_STROKE = 2.25;

export function FormattingPalette({
  isOpen,
  formatActions,
  formatState,
  onClose
}: FormattingPaletteProps) {
  const [currentStyle, setCurrentStyle] = useState<string>('p');

  // Update current style from format state
  useEffect(() => {
    if (formatState) {
      if (formatState.blockType === 'h1' || formatState.blockType === 'h2') setCurrentStyle('h2');
      else if (formatState.blockType === 'h3') setCurrentStyle('h3');
      else setCurrentStyle('p');
    }
  }, [formatState]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (!modKey) return;

      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          formatActions?.toggleBold();
          break;
        case 'i':
          e.preventDefault();
          formatActions?.toggleItalic();
          break;
        case 'u':
          e.preventDefault();
          formatActions?.toggleUnderline?.();
          break;
        case 'd':
          if (e.shiftKey) {
            e.preventDefault();
            formatActions?.toggleStrikethrough?.();
          }
          break;
        case 'escape':
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, formatActions]);

  const handleStyleChange = (style: string) => {
    setCurrentStyle(style);

    // Apply style via formatActions
    if (formatActions) {
      if (style === 'h2') {
        formatActions.formatHeading?.('h2');
      } else if (style === 'h3') {
        formatActions.formatHeading?.('h3');
      } else if (style === 'p') {
        formatActions.formatParagraph?.();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`formatting-palette ${isOpen ? 'formatting-palette--open' : ''}`}>
      <div className="formatting-palette__row formatting-palette__row--compact">
        <div className="formatting-palette__section formatting-palette__section--style" role="group" aria-label="Text style">
          <div className="formatting-style-chips" aria-live="polite">
            {STYLE_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                className={`format-style-chip ${currentStyle === option.value ? 'format-style-chip--active' : ''}`}
                onClick={() => handleStyleChange(option.value)}
                aria-pressed={currentStyle === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="formatting-palette__section formatting-palette__section--controls">
          <button
            type="button"
            className={`format-control ${formatState?.isBold ? 'format-control--active' : ''}`}
            onClick={formatActions?.toggleBold}
            disabled={!formatActions?.toggleBold}
            title="Bold (⌘B)"
            aria-label="Bold"
            aria-pressed={formatState?.isBold ?? false}
          >
            <Bold size={18} strokeWidth={ICON_STROKE} />
          </button>

          <button
            type="button"
            className={`format-control ${formatState?.isItalic ? 'format-control--active' : ''}`}
            onClick={formatActions?.toggleItalic}
            disabled={!formatActions?.toggleItalic}
            title="Italic (⌘I)"
            aria-label="Italic"
            aria-pressed={formatState?.isItalic ?? false}
          >
            <Italic size={18} strokeWidth={ICON_STROKE} />
          </button>

          <button
            type="button"
            className={`format-control ${formatState?.isUnderline ? 'format-control--active' : ''}`}
            onClick={formatActions?.toggleUnderline}
            disabled={!formatActions?.toggleUnderline}
            title="Underline (⌘U)"
            aria-label="Underline"
            aria-pressed={formatState?.isUnderline ?? false}
          >
            <Underline size={18} strokeWidth={ICON_STROKE} />
          </button>

          <button
            type="button"
            className={`format-control ${formatState?.isStrikethrough ? 'format-control--active' : ''}`}
            onClick={formatActions?.toggleStrikethrough}
            disabled={!formatActions?.toggleStrikethrough}
            title="Strikethrough (⌘⇧D)"
            aria-label="Strikethrough"
            aria-pressed={formatState?.isStrikethrough ?? false}
          >
            <Strikethrough size={18} strokeWidth={ICON_STROKE} />
          </button>

          <div className="format-control-divider" />

          <button
            type="button"
            className={`format-control ${formatState?.listType === 'bullet' ? 'format-control--active' : ''}`}
            onClick={formatActions?.insertBulletList}
            disabled={!formatActions?.insertBulletList}
            title="Bullet list"
            aria-label="Bullet list"
            aria-pressed={formatState?.listType === 'bullet'}
          >
            <List size={18} strokeWidth={ICON_STROKE} />
          </button>

          <button
            type="button"
            className={`format-control ${formatState?.listType === 'number' ? 'format-control--active' : ''}`}
            onClick={formatActions?.insertNumberedList}
            disabled={!formatActions?.insertNumberedList}
            title="Numbered list"
            aria-label="Numbered list"
            aria-pressed={formatState?.listType === 'number'}
          >
            <ListOrdered size={18} strokeWidth={ICON_STROKE} />
          </button>

          <button
            type="button"
            className={`format-control ${formatState?.listType === 'check' ? 'format-control--active' : ''}`}
            onClick={formatActions?.insertCheckList}
            disabled={!formatActions?.insertCheckList}
            title="Checklist"
            aria-label="Checklist"
            aria-pressed={formatState?.listType === 'check'}
          >
            <ListChecks size={18} strokeWidth={ICON_STROKE} />
          </button>

          <div className="format-control-divider" />

          <button
            type="button"
            className="format-control"
            onClick={formatActions?.outdent}
            disabled={!formatActions?.outdent}
            title="Decrease indent (⇧Tab)"
            aria-label="Decrease indent"
          >
            <IndentDecrease size={18} strokeWidth={ICON_STROKE} />
          </button>

          <button
            type="button"
            className="format-control"
            onClick={formatActions?.indent}
            disabled={!formatActions?.indent}
            title="Increase indent (Tab)"
            aria-label="Increase indent"
          >
            <IndentIncrease size={18} strokeWidth={ICON_STROKE} />
          </button>

          <button
            type="button"
            className={`format-control ${formatState?.isQuote ? 'format-control--active' : ''}`}
            onClick={formatActions?.toggleQuote}
            disabled={!formatActions?.toggleQuote}
            title="Quote block"
            aria-label="Quote block"
            aria-pressed={formatState?.isQuote ?? false}
          >
            <Quote size={18} strokeWidth={ICON_STROKE} />
          </button>
        </div>
      </div>
    </div>
  );
}
