import type { SerializedEditorState } from 'lexical';
import type { EntitySpan } from '../types/entities';
import { EntityIndicators } from '../components/EntityIndicators';
import type { RichDocSnapshot } from './types';
import { RichTextEditor } from './RichTextEditor';
import type { NavigateToRange, FormattingActions } from '../components/CodeMirrorEditorProps';
import { EditorShell } from './EditorShell';
import './EditorShell.css';

interface Props {
  richDoc: SerializedEditorState | null;
  plainText: string;
  entities: EntitySpan[];
  onChange: (snapshot: RichDocSnapshot) => void;
  onEntityFocus?: (span: EntitySpan) => void;
  showEntityIndicators?: boolean;
  navigateToRange?: NavigateToRange | null;
  showFormatToolbar?: boolean; // Controlled by T button in LabToolbar
  formatToolbarEnabled?: boolean; // NEW: Whether formatting mode is active
  formatActions?: FormattingActions | null; // NEW: Formatting action callbacks
}

export function RichEditorPane({
  richDoc,
  plainText,
  entities,
  onChange,
  onEntityFocus,
  navigateToRange,
  showEntityIndicators = true,
  showFormatToolbar = false,
  formatToolbarEnabled = false,
  formatActions,
}: Props) {
  const editorHeight = Math.max(400, typeof window !== 'undefined' ? window.innerHeight - 380 : 400);

  return (
    <div className="editor-wrapper">
      <div className="editor-panel">
        <div className="editor-with-indicators-wrapper">
          {showEntityIndicators && (
            <EntityIndicators
              entities={entities}
              text={plainText}
              editorHeight={editorHeight}
            />
          )}
          <div
            className="editor-with-indicators"
            style={{ flex: 1, width: '100%', height: '100%' }}
          >
            <EditorShell
              formatActions={formatActions}
              formatToolbarEnabled={formatToolbarEnabled}
              onModeChange={(mode) => {
                console.log('[RichEditorPane] Mode changed to:', mode);
              }}
            >
              <RichTextEditor
                initialDocJSON={richDoc ?? undefined}
                initialPlainText={plainText}
                entities={entities}
                onChange={onChange}
                onEntityPress={onEntityFocus}
                navigateToRange={navigateToRange}
                showFormatToolbar={false} // Always false - EditorShell handles formatting palette
              />
            </EditorShell>
          </div>
        </div>
      </div>
    </div>
  );
}
