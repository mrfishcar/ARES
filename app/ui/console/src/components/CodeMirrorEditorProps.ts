import type { EntitySpan, EntityType, DocumentEntityMetadata } from '../types/entities';

export interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  minHeight?: string;
  project?: string;
  noteId?: string;
  disableHighlighting?: boolean;
  enableWYSIWYG?: boolean;
  renderMarkdown?: boolean; // true = hide inline tags, render markdown visually; false = show raw text with tags
  entities?: EntitySpan[];
  projectId?: string;
  documentId?: string;
  documentMetadata?: DocumentEntityMetadata;
  onChangeType?: (entity: EntitySpan, type: EntityType) => Promise<void>;
  onTagEntity?: (entity: EntitySpan, targetEntity: EntitySpan) => Promise<void>;
  onCreateNew?: (entity: EntitySpan, type: EntityType) => Promise<void>;
  onReject?: (entity: EntitySpan) => Promise<void>;
}
