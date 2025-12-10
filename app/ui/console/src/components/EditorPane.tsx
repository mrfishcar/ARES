/**
 * EditorPane - Editor wrapper with entity indicators
 * Clean layout component, no business logic
 */

import { EntityIndicators } from './EntityIndicators';
import { VirtualizedExtractionEditor } from './VirtualizedExtractionEditor';
import type { EntitySpan, EntityType } from '../types/entities';

interface EditorPaneProps {
  text: string;
  entities: EntitySpan[];
  onTextChange: (text: string) => void;

  // Highlighting settings
  disableHighlighting: boolean;
  highlightOpacity: number;
  renderMarkdown: boolean;
  entityHighlightMode: boolean;

  // Entity handlers
  onChangeType: (entity: EntitySpan, newType: EntityType) => void;
  onCreateNew: (entity: EntitySpan, type: EntityType) => void;
  onReject: (entity: EntitySpan) => void;
  onTagEntity: (entity: EntitySpan, targetEntity: EntitySpan) => void;
}

export function EditorPane({
  text,
  entities,
  onTextChange,
  disableHighlighting,
  highlightOpacity,
  renderMarkdown,
  entityHighlightMode,
  onChangeType,
  onCreateNew,
  onReject,
  onTagEntity,
}: EditorPaneProps) {
  const editorHeight = Math.max(400, typeof window !== 'undefined' ? window.innerHeight - 380 : 400);

  return (
    <div className="editor-wrapper">
      <div className="editor-panel">
        <div className="editor-with-indicators-wrapper">
          {/* Entity indicators on left side */}
          <EntityIndicators
            entities={entities}
            text={text}
            editorHeight={editorHeight}
          />

          {/* Editor area */}
          <div className="editor-with-indicators">
            <VirtualizedExtractionEditor
              text={text}
              onTextChange={onTextChange}
              entities={entities}
              disableHighlighting={disableHighlighting}
              highlightOpacity={highlightOpacity}
              renderMarkdown={renderMarkdown}
              entityHighlightMode={entityHighlightMode}
              onChangeType={onChangeType}
              onCreateNew={onCreateNew}
              onReject={onReject}
              onTagEntity={onTagEntity}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
