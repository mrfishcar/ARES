/**
 * EditorShell - Centralized editor mode management
 * Owns:
 * - Mode state (normal vs formatting)
 * - Toolbar visibility coordination
 * - Formatting palette lifecycle
 * - Editor sizing and mount
 */

import { useEffect, ReactNode } from 'react';
import { FormattingPalette } from './FormattingPalette';
import type { FormattingActions } from '../components/CodeMirrorEditorProps';

export interface EditorMode {
  mode: 'normal' | 'formatting';
}

interface EditorShellProps {
  children: ReactNode;
  formatActions?: FormattingActions | null;
  formatToolbarEnabled?: boolean; // Controlled from parent
  onModeChange?: (mode: 'normal' | 'formatting') => void;
}

export function EditorShell({
  children,
  formatActions,
  formatToolbarEnabled = false,
  onModeChange
}: EditorShellProps) {
  // Notify parent of mode changes
  useEffect(() => {
    onModeChange?.(formatToolbarEnabled ? 'formatting' : 'normal');
  }, [formatToolbarEnabled, onModeChange]);

  return (
    <div className="editor-shell">
      {/* Formatting palette - floats above editor */}
      <FormattingPalette
        isOpen={formatToolbarEnabled}
        formatActions={formatActions}
        onClose={() => {
          // Parent controls the state, so this is just a signal
          onModeChange?.('normal');
        }}
      />

      {/* Editor content */}
      <div className="editor-shell__content">
        {children}
      </div>
    </div>
  );
}
