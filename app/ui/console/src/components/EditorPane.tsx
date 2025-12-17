/**
 * EditorPane - Editor wrapper with entity indicators
 * Clean layout component, no business logic
 */

import { EntityIndicators } from './EntityIndicators';
import { VirtualizedExtractionEditor } from './VirtualizedExtractionEditor';
import type { NavigateToRange } from './CodeMirrorEditorProps';
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
  showEntityIndicators?: boolean;

  // Entity handlers
  onChangeType: (entity: EntitySpan, newType: EntityType) => Promise<void>;
  onCreateNew: (entity: EntitySpan, type: EntityType) => Promise<void>;
  onReject: (entity: EntitySpan) => Promise<void>;
  onTagEntity: (entity: EntitySpan, targetEntity: EntitySpan) => Promise<void>;
  onTextSelected?: (start: number, end: number, selectedText: string, entitiesInRange: EntitySpan[]) => void | Promise<void>;
  onResizeEntity?: (entity: EntitySpan, newStart: number, newEnd: number) => void | Promise<void>;
  enableLongTextOptimization?: boolean;
  navigateToRange?: NavigateToRange;
}

export function EditorPane({
  text,
  entities,
  onTextChange,
  disableHighlighting,
  highlightOpacity,
  renderMarkdown,
  entityHighlightMode,
  showEntityIndicators = true,
  onChangeType,
  onCreateNew,
  onReject,
  onTagEntity,
  onTextSelected,
  onResizeEntity,
  enableLongTextOptimization,
  navigateToRange,
}: EditorPaneProps) {
  const editorHeight = Math.max(400, typeof window !== 'undefined' ? window.innerHeight - 380 : 400);

  return (
    <div className="editor-wrapper">
      <div className="editor-panel">
        <div className="editor-with-indicators-wrapper">
          {/* Entity indicators on left side - optional, can be toggled in settings */}
          {showEntityIndicators && (
            <EntityIndicators
              entities={entities}
              text={text}
              editorHeight={editorHeight}
            />
          )}

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
              onTextSelected={onTextSelected}
              onResizeEntity={onResizeEntity}
              enableLongTextOptimization={enableLongTextOptimization}
              navigateToRange={navigateToRange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
