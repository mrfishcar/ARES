/**
 * EditorShell - Centralized editor mode management
 * Owns:
 * - Mode state (normal vs formatting)
 * - Toolbar visibility coordination
 * - Formatting palette lifecycle
 * - Editor sizing and mount
 */

import { useEffect, useRef, ReactNode } from 'react';
import { FormattingPalette } from './FormattingPalette';
import type { FormattingActions } from '../components/CodeMirrorEditorProps';
import type { FormatState } from './plugins/FormatActionsPlugin';

export interface EditorMode {
  mode: 'normal' | 'formatting';
}

interface EditorShellProps {
  children: ReactNode;
  formatActions?: FormattingActions | null;
  formatState?: FormatState | null;
  formatToolbarEnabled?: boolean; // Controlled from parent
  onModeChange?: (mode: 'normal' | 'formatting') => void;
  onRequestExit?: () => void; // Request to exit formatting mode
}

export function EditorShell({
  children,
  formatActions,
  formatState,
  formatToolbarEnabled = false,
  onModeChange,
  onRequestExit
}: EditorShellProps) {
  const paletteRef = useRef<HTMLDivElement>(null);

  // Notify parent of mode changes
  useEffect(() => {
    onModeChange?.(formatToolbarEnabled ? 'formatting' : 'normal');
  }, [formatToolbarEnabled, onModeChange]);

  // Click outside to exit formatting mode
  useEffect(() => {
    if (!formatToolbarEnabled) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Stay open if click is inside palette
      if (paletteRef.current && paletteRef.current.contains(target)) {
        return;
      }
      
      // Stay open if clicking dropdown menu (which may be portaled outside)
      if (target.closest('.format-style-menu') || target.closest('.format-style-dropdown')) {
        return;
      }
      
      // Any other click closes formatting mode
      onRequestExit?.();
    };

    // Add delay to avoid immediate closure on mode activation
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [formatToolbarEnabled, onRequestExit]);

  return (
    <div className="editor-shell">
      {/* Formatting palette - DISABLED: LabToolbar now handles formatting mode
       * The toolbar morph animation shows formatting controls in the morphed toolbar
       */}

      {/* Editor content */}
      <div className="editor-shell__content">
        {children}
      </div>
    </div>
  );
}
