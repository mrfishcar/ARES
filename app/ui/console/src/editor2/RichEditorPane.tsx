import type { SerializedEditorState } from 'lexical';
import type { EntitySpan } from '../types/entities';
import { EntityIndicators } from '../components/EntityIndicators';
import type { RichDocSnapshot } from './types';
import { RichTextEditor } from './RichTextEditor';
import type { NavigateToRange } from '../components/CodeMirrorEditorProps';

interface Props {
  richDoc: SerializedEditorState | null;
  plainText: string;
  entities: EntitySpan[];
  onChange: (snapshot: RichDocSnapshot) => void;
  onEntityFocus?: (span: EntitySpan) => void;
  showEntityIndicators?: boolean;
  navigateToRange?: NavigateToRange | null;
}

export function RichEditorPane({
  richDoc,
  plainText,
  entities,
  onChange,
  onEntityFocus,
  navigateToRange,
  showEntityIndicators = true,
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
          <div className="editor-with-indicators">
            <RichTextEditor
              initialDocJSON={richDoc ?? undefined}
              initialPlainText={plainText}
              entities={entities}
              onChange={onChange}
              onEntityPress={onEntityFocus}
              navigateToRange={navigateToRange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
