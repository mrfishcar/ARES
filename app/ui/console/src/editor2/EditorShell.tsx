/**
 * EditorShell - Centralized editor mode management
 * Owns:
 * - Mode state (normal vs formatting)
 * - Toolbar visibility coordination
 * - Formatting palette lifecycle
 * - Editor sizing and mount
 */

import { useEffect, ReactNode } from 'react';
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
  // Notify parent of mode changes
  useEffect(() => {
    onModeChange?.(formatToolbarEnabled ? 'formatting' : 'normal');
  }, [formatToolbarEnabled, onModeChange]);

  return (
    <div className="editor-shell">
      {/* Editor content - formatting UI is provided by the LabToolbar palette */}
      <div className="editor-shell__content">
        {children}
      </div>
    </div>
  );
}
