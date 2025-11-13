/**
 * WYSIWYG Markdown Editor (Obsidian-style)
 * Seamless markdown rendering with entity highlighting
 */

import MDEditor from '@uiw/react-md-editor';
import type { EntitySpan } from '../types/entities';

interface WYSIWYGEditorProps {
  value: string;
  onChange: (value: string) => void;
  entities: EntitySpan[];
  minHeight?: string;
}

export function WYSIWYGEditor({ value, onChange, entities, minHeight = '400px' }: WYSIWYGEditorProps) {
  return (
    <div data-color-mode="light" style={{ width: '100%', height: '100%' }}>
      <MDEditor
        value={value}
        onChange={(val) => onChange(val || '')}
        height={minHeight}
        preview="edit"
        hideToolbar={false}
        visibleDragbar={false}
        textareaProps={{
          placeholder: 'Type markdown here... # for headings, **bold**, *italic*, etc. Auto-completes as you type!',
        }}
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          width: '100%',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      />
    </div>
  );
}
