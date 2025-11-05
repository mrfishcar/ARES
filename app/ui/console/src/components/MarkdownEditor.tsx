/**
 * Markdown Editor Component - Sprint R7
 * Editor with entity tag support and live preview
 */

import { useState } from 'react';
import { EntityChip } from './EntityChip';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
}

/**
 * Parse entity tags from markdown
 */
function parseEntityTags(markdown: string): Array<{
  type: 'existing' | 'new';
  name: string;
  entityType?: string;
  start: number;
  end: number;
}> {
  const tags: Array<{
    type: 'existing' | 'new';
    name: string;
    entityType?: string;
    start: number;
    end: number;
  }> = [];

  // Match [[Entity: name]] or [[NewEntity: name|type=TYPE]]
  const regex = /\[\[(Entity|NewEntity):\s*([^\]|]+)(\|type=([A-Z]+))?\]\]/g;

  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const [fullMatch, tagType, name, , entityType] = match;
    tags.push({
      type: tagType === 'Entity' ? 'existing' : 'new',
      name: name.trim(),
      entityType: entityType?.trim(),
      start: match.index,
      end: match.index + fullMatch.length,
    });
  }

  return tags;
}

/**
 * Render markdown with entity chips
 */
function renderMarkdown(markdown: string): JSX.Element[] {
  const tags = parseEntityTags(markdown);
  const elements: JSX.Element[] = [];
  let lastIndex = 0;

  tags.forEach((tag, idx) => {
    // Add text before tag
    if (tag.start > lastIndex) {
      const text = markdown.slice(lastIndex, tag.start);
      elements.push(
        <span key={`text-${idx}`} style={{ whiteSpace: 'pre-wrap' }}>
          {text}
        </span>
      );
    }

    // Add entity chip
    elements.push(
      <EntityChip
        key={`chip-${idx}`}
        name={tag.name}
        type={tag.type}
        entityType={tag.entityType}
      />
    );

    lastIndex = tag.end;
  });

  // Add remaining text
  if (lastIndex < markdown.length) {
    elements.push(
      <span key="text-final" style={{ whiteSpace: 'pre-wrap' }}>
        {markdown.slice(lastIndex)}
      </span>
    );
  }

  return elements;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minHeight = '300px',
}: MarkdownEditorProps) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div>
      {/* Tab switcher */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid #e5e7eb',
          marginBottom: '12px',
        }}
      >
        <button
          type="button"
          onClick={() => setShowPreview(false)}
          style={{
            padding: '8px 16px',
            background: 'none',
            border: 'none',
            borderBottom: !showPreview ? '2px solid #3b82f6' : '2px solid transparent',
            color: !showPreview ? '#3b82f6' : '#6b7280',
            fontWeight: !showPreview ? '600' : '400',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Write
        </button>
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          style={{
            padding: '8px 16px',
            background: 'none',
            border: 'none',
            borderBottom: showPreview ? '2px solid #3b82f6' : '2px solid transparent',
            color: showPreview ? '#3b82f6' : '#6b7280',
            fontWeight: showPreview ? '600' : '400',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Preview
        </button>
      </div>

      {/* Editor or Preview */}
      {!showPreview ? (
        <>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              placeholder ||
              'Write your note here... Use [[Entity: name]] to reference entities or [[NewEntity: name|type=TYPE]] to create new ones.'
            }
            style={{
              width: '100%',
              minHeight,
              padding: '12px',
              fontSize: '14px',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              outline: 'none',
              fontFamily: 'monospace',
              resize: 'vertical',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#3b82f6';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb';
            }}
          />
          {/* Syntax hints */}
          <div
            style={{
              fontSize: '12px',
              color: '#6b7280',
              marginTop: '8px',
            }}
          >
            <strong>Syntax:</strong> <code>[[Entity: name]]</code> or{' '}
            <code>[[NewEntity: name|type=TYPE]]</code>
          </div>
        </>
      ) : (
        <div
          style={{
            minHeight,
            padding: '12px',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            background: '#f9fafb',
            fontSize: '14px',
            lineHeight: '1.6',
          }}
        >
          {value ? (
            renderMarkdown(value)
          ) : (
            <span style={{ color: '#9ca3af' }}>Nothing to preview</span>
          )}
        </div>
      )}
    </div>
  );
}
