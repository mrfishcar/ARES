/**
 * FormattingPalette - iOS Notes-style floating formatting controls
 * Two-row layout:
 * - Row 1: Style selector dropdown
 * - Row 2: Format controls (bold, italic, etc.)
 */

import { ChevronDown, Bold, Italic, Underline, Strikethrough, List, ListOrdered, IndentDecrease, IndentIncrease, Quote } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { FormattingActions } from '../components/CodeMirrorEditorProps';

interface FormattingPaletteProps {
  isOpen: boolean;
  formatActions?: FormattingActions | null;
  onClose: () => void;
}

const STYLE_OPTIONS = [
  { value: 'p', label: 'Body' },
  { value: 'h1', label: 'Title' },
  { value: 'h2', label: 'Heading' },
  { value: 'h3', label: 'Subheading' },
  { value: 'mono', label: 'Monospace' },
] as const;

export function FormattingPalette({
  isOpen,
  formatActions,
  onClose
}: FormattingPaletteProps) {
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);
  const [currentStyle, setCurrentStyle] = useState<string>('p');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showStyleDropdown) return;

    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowStyleDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showStyleDropdown]);

  const handleStyleChange = (style: string) => {
    setCurrentStyle(style);
    setShowStyleDropdown(false);
    
    // Apply style via formatActions
    if (formatActions) {
      if (style === 'h1') {
        formatActions.formatHeading?.('h1');
      } else if (style === 'h2') {
        formatActions.formatHeading?.('h2');
      } else if (style === 'h3') {
        formatActions.formatHeading?.('h3');
      } else if (style === 'mono') {
        formatActions.toggleMonospace?.();
      } else if (style === 'p') {
        formatActions.formatParagraph?.();
      }
    }
  };

  if (!isOpen) return null;

  const currentStyleLabel = STYLE_OPTIONS.find(opt => opt.value === currentStyle)?.label || 'Body';

  return (
    <div className={`formatting-palette ${isOpen ? 'formatting-palette--open' : ''}`}>
      <div className="formatting-palette__inner">
        {/* Row 1: Style Selector */}
        <div className="formatting-palette__row">
          <div className="formatting-palette__section" ref={dropdownRef}>
            <button
              type="button"
              className="format-style-dropdown"
              onClick={() => setShowStyleDropdown(!showStyleDropdown)}
              aria-label="Text style"
            >
              <span>{currentStyleLabel}</span>
              <ChevronDown size={16} />
            </button>

            {showStyleDropdown && (
              <div className="format-style-menu">
                {STYLE_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    className={`format-style-option ${currentStyle === option.value ? 'format-style-option--active' : ''}`}
                    onClick={() => handleStyleChange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Format Controls */}
        <div className="formatting-palette__row">
          <div className="formatting-palette__section formatting-palette__section--controls">
            <button
              type="button"
              className="format-control"
              onClick={formatActions?.toggleBold}
              disabled={!formatActions?.toggleBold}
              title="Bold"
              aria-label="Bold"
            >
              <Bold size={18} />
            </button>

            <button
              type="button"
              className="format-control"
              onClick={formatActions?.toggleItalic}
              disabled={!formatActions?.toggleItalic}
              title="Italic"
              aria-label="Italic"
            >
              <Italic size={18} />
            </button>

            <button
              type="button"
              className="format-control"
              onClick={formatActions?.toggleUnderline}
              disabled={!formatActions?.toggleUnderline}
              title="Underline"
              aria-label="Underline"
            >
              <Underline size={18} />
            </button>

            <button
              type="button"
              className="format-control"
              onClick={formatActions?.toggleStrikethrough}
              disabled={!formatActions?.toggleStrikethrough}
              title="Strikethrough"
              aria-label="Strikethrough"
            >
              <Strikethrough size={18} />
            </button>

            <div className="format-control-divider" />

            <button
              type="button"
              className="format-control"
              onClick={formatActions?.insertBulletList}
              disabled={!formatActions?.insertBulletList}
              title="Bullet list"
              aria-label="Bullet list"
            >
              <List size={18} />
            </button>

            <button
              type="button"
              className="format-control"
              onClick={formatActions?.insertNumberedList}
              disabled={!formatActions?.insertNumberedList}
              title="Numbered list"
              aria-label="Numbered list"
            >
              <ListOrdered size={18} />
            </button>

            <div className="format-control-divider" />

            <button
              type="button"
              className="format-control"
              onClick={() => {/* TODO: outdent - needs Lexical implementation */}}
              disabled
              title="Decrease indent"
              aria-label="Decrease indent"
            >
              <IndentDecrease size={18} />
            </button>

            <button
              type="button"
              className="format-control"
              onClick={() => {/* TODO: indent - needs Lexical implementation */}}
              disabled
              title="Increase indent"
              aria-label="Increase indent"
            >
              <IndentIncrease size={18} />
            </button>

            <button
              type="button"
              className="format-control"
              onClick={formatActions?.toggleQuote}
              disabled={!formatActions?.toggleQuote}
              title="Quote block"
              aria-label="Quote block"
            >
              <Quote size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
