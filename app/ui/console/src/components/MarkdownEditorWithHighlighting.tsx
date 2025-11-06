/**
 * Markdown Editor with Live Entity Highlighting - Sprint W2
 * Real-time entity detection with interactive highlights
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { EntityChip } from './EntityChip';
import { EntityContextMenu } from './EntityContextMenu';
import {
  highlightEntities,
  clearHighlightCache,
  getEntityTypeColor,
  type EntitySpan,
  type EntityType,
} from '../../../../editor/entityHighlighter';
import { useEntityMentions } from '../hooks/useEntityMentions';

interface MarkdownEditorWithHighlightingProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  project: string;
  noteId: string;
  enableHighlighting?: boolean;
}

/**
 * Parse entity tags from markdown (legacy support)
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
 * Render markdown with entity chips (legacy preview mode)
 */
function renderMarkdown(markdown: string): JSX.Element[] {
  const tags = parseEntityTags(markdown);
  const elements: JSX.Element[] = [];
  let lastIndex = 0;

  tags.forEach((tag, idx) => {
    if (tag.start > lastIndex) {
      const text = markdown.slice(lastIndex, tag.start);
      elements.push(
        <span key={`text-${idx}`} style={{ whiteSpace: 'pre-wrap' }}>
          {text}
        </span>
      );
    }

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

  if (lastIndex < markdown.length) {
    elements.push(
      <span key="text-final" style={{ whiteSpace: 'pre-wrap' }}>
        {markdown.slice(lastIndex)}
      </span>
    );
  }

  return elements;
}

export function MarkdownEditorWithHighlighting({
  value,
  onChange,
  placeholder,
  minHeight = '300px',
  project,
  noteId,
  enableHighlighting = true,
}: MarkdownEditorWithHighlightingProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [highlights, setHighlights] = useState<EntitySpan[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    entity: EntitySpan;
    isNewEntity?: boolean;
  } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const overlayContentRef = useRef<HTMLDivElement>(null);
  const parseTimeoutRef = useRef<number | null>(null);

  const { confirmMention } = useEntityMentions(project, noteId);

  const getSpanDisplayName = useCallback((span: EntitySpan) => span.displayText || span.text, []);

  const getSpanCanonicalName = useCallback((span: EntitySpan) => {
    const canonical = span.canonicalName?.trim();
    return canonical && canonical.length > 0 ? canonical : getSpanDisplayName(span);
  }, [getSpanDisplayName]);

  const getSpanTooltipLabel = useCallback(
    (span: EntitySpan) => {
      const display = getSpanDisplayName(span);
      const canonical = span.canonicalName?.trim();
      if (canonical && canonical.length > 0 && canonical.toLowerCase() !== display.toLowerCase()) {
        return `${display} → ${canonical}`;
      }
      return display;
    },
    [getSpanDisplayName]
  );

  // Sync scroll position between textarea and overlay
  const handleScroll = useCallback(() => {
    if (textareaRef.current && overlayContentRef.current) {
      const scrollTop = textareaRef.current.scrollTop;
      const scrollLeft = textareaRef.current.scrollLeft;
      console.log('[Scroll] textarea scroll:', scrollTop, scrollLeft);
      overlayContentRef.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
    }
  }, []);

  // Parse entities with debounce for performance
  useEffect(() => {
    if (!enableHighlighting || showPreview) return;

    // Clear previous timeout
    if (parseTimeoutRef.current) {
      clearTimeout(parseTimeoutRef.current);
    }

    // Debounce parsing by 15ms for real-time feel
    parseTimeoutRef.current = window.setTimeout(async () => {
      const spans = await highlightEntities(value, {
        maxHighlights: 1000,
        minConfidence: 0.6,
        enableNaturalDetection: true,
      });
      console.log('[MarkdownEditor] Detected entities:', spans);
      setHighlights(spans);
    }, 15);

    return () => {
      if (parseTimeoutRef.current) {
        clearTimeout(parseTimeoutRef.current);
      }
    };
  }, [value, enableHighlighting, showPreview]);

  // Clear cache when component unmounts
  useEffect(() => {
    return () => {
      clearHighlightCache();
    };
  }, []);

  // Handle right-click on highlighted text
  const handleContextMenu = useCallback((e: React.MouseEvent, span: EntitySpan) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      entity: span,
    });
  }, []);

  // Handle right-click on textarea for text selection
  const handleTextareaContextMenu = useCallback((e: React.MouseEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd).trim();

    if (selectedText) {
      e.preventDefault();
      e.stopPropagation();

      // Create a temporary entity span for the selected text
      setContextMenu({
        position: { x: e.clientX, y: e.clientY },
        entity: {
          text: selectedText,
          type: 'CONCEPT', // Default type
          confidence: 1.0,
          source: 'tag',
          start: textarea.selectionStart,
          end: textarea.selectionEnd,
        },
        isNewEntity: true,
      });
    }
  }, []);

  // Confirm entity mention or create new entity
  const handleConfirm = useCallback(
    async (type: EntityType) => {
      if (!contextMenu) return;

      try {
        // Insert or update entity tag
        if ('start' in contextMenu.entity && 'end' in contextMenu.entity) {
          const entity = contextMenu.entity as EntitySpan;
          const before = value.substring(0, entity.start);
          const after = value.substring(entity.end);

          // Get clean name and preserve hashtag format if exists
          const isHashtag = entity.text.startsWith('#');
          let entityTag: string;
          const cleanName = getSpanDisplayName(entity);

          if (isHashtag) {
            // Preserve hashtag format - just update the type
            const bracketMatch = entity.text.match(/^#\[([^\]]+)\]/);
            const underscoreMatch = entity.text.match(/^#([A-Za-z0-9_]+)/);

            if (bracketMatch) {
              // Was #[Name], keep bracket format
              entityTag = `#[${bracketMatch[1]}]:${type}`;
            } else if (underscoreMatch) {
              // Was #Name or #Name_Name, keep underscore format
              entityTag = `#${underscoreMatch[1]}:${type}`;
            } else {
              // Fallback
              entityTag = cleanName.includes(' ') ? `#[${cleanName}]:${type}` : `#${cleanName.replace(/\s+/g, '_')}:${type}`;
            }
          } else {
            // New entity - create hashtag format
            if (cleanName.includes(' ')) {
              entityTag = `#[${cleanName}]:${type}`;
            } else {
              entityTag = `#${cleanName.replace(/\s+/g, '_')}:${type}`;
            }
          }
          
          onChange(before + entityTag + after);
        }

        // Confirm the mention in backend
        const span = contextMenu.entity as EntitySpan;
        const confirmName = getSpanCanonicalName(span);
        await confirmMention(confirmName, type);
        setContextMenu(null);

        // Return focus to textarea
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 0);
      } catch (error) {
        console.error('[MarkdownEditor] Confirm failed:', error);
      }
    },
    [contextMenu, confirmMention, value, onChange, getSpanCanonicalName, getSpanDisplayName]
  );

  // Reject entity mention
  const handleReject = useCallback(() => {
    if (!contextMenu) return;

    // If this is a tag, remove it from the markdown
    if ('start' in contextMenu.entity && 'end' in contextMenu.entity) {
      const entity = contextMenu.entity as EntitySpan;
      const before = value.substring(0, entity.start);
      const after = value.substring(entity.end);

      // Replace tag with the original text
      onChange(before + entity.text + after);
    }

    // Remove highlight from display
    setHighlights(prev => prev.filter(h => h !== contextMenu.entity));
    setContextMenu(null);

    // Return focus to textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [contextMenu, value, onChange]);

  // Render highlighted text overlay
  const renderHighlightedText = () => {
    const elements: JSX.Element[] = [];
    let lastIndex = 0;

    // Sort highlights by start position
    const sorted = [...highlights].sort((a, b) => a.start - b.start);

    sorted.forEach((span, idx) => {
      // Add unhighlighted text before this span
      if (span.start > lastIndex) {
        const text = value.slice(lastIndex, span.start);
        elements.push(
          <span key={`text-${idx}`} style={{ color: '#111827', whiteSpace: 'pre-wrap', pointerEvents: 'none' }}>
            {text}
          </span>
        );
      }

      // Add highlighted span - all entities use the same subtle style
      const color = getEntityTypeColor(span.type);
      const displayText = getSpanDisplayName(span);
      const tooltipText = getSpanTooltipLabel(span);
      const isTag = span.source === 'tag';

      // For complete tags/hashtags, render full text with syntax parts styled differently
      if (isTag && displayText && span.text !== displayText) {
        const isHashtag = span.text.startsWith('#');

        if (isHashtag) {
          // Parse hashtag to style each part
          const bracketMatch = span.text.match(/^(#\[)([^\]]+)(\])(:([A-Z]+))?/);
          const underscoreMatch = span.text.match(/^(#)([A-Za-z0-9_]+)(:([A-Z]+))?/);

          if (bracketMatch) {
            // #[Name]:TYPE format - hide syntax, show only name
            const [, openHash, name, closeBracket, colonType] = bracketMatch;
            elements.push(
              <span key={`highlight-${idx}`} style={{ whiteSpace: 'pre-wrap' }}>
                <span style={{ color: 'transparent', fontSize: '0.1px', width: 0, display: 'inline', userSelect: 'none' }}>{openHash}</span>
                <span
                  onContextMenu={(e) => handleContextMenu(e, span)}
                  style={{
                    backgroundColor: `${color}30`,
                    borderBottom: `2px solid ${color}`,
                    borderRadius: '2px',
                  cursor: 'pointer',
                  color: '#111827',
                  pointerEvents: 'auto',
                  fontWeight: '500',
                }}
                title={`${tooltipText} - ${span.type} - Right-click to change or reject`}
              >
                {name}
              </span>
                <span style={{ color: 'transparent', fontSize: '0.1px', width: 0, display: 'inline', userSelect: 'none' }}>{closeBracket}</span>
                {colonType && <span style={{ color: 'transparent', fontSize: '0.1px', width: 0, display: 'inline', userSelect: 'none' }}>{colonType}</span>}
              </span>
            );
          } else if (underscoreMatch) {
            // #Name:TYPE format - hide syntax, show only name
            const [, hash, nameWithUnderscores, colonType] = underscoreMatch;
            elements.push(
              <span key={`highlight-${idx}`} style={{ whiteSpace: 'pre-wrap' }}>
                <span style={{ color: 'transparent', fontSize: '0.1px', width: 0, display: 'inline', userSelect: 'none' }}>{hash}</span>
                <span
                  onContextMenu={(e) => handleContextMenu(e, span)}
                  style={{
                    backgroundColor: `${color}30`,
                    borderBottom: `2px solid ${color}`,
                    borderRadius: '2px',
                  cursor: 'pointer',
                  color: '#111827',
                  pointerEvents: 'auto',
                  fontWeight: '500',
                }}
                title={`${tooltipText} - ${span.type} - Right-click to change or reject`}
              >
                {nameWithUnderscores}
              </span>
                {colonType && <span style={{ color: 'transparent', fontSize: '0.1px', width: 0, display: 'inline', userSelect: 'none' }}>{colonType}</span>}
              </span>
            );
          }
        } else {
          // Old [[Entity: Name|type=TYPE]] format - hide syntax
          const parts = span.text.split(displayText);
          if (parts.length === 2) {
            elements.push(
              <span key={`highlight-${idx}`} style={{ whiteSpace: 'pre-wrap' }}>
                <span style={{ color: 'transparent', fontSize: '0.1px', width: 0, display: 'inline', userSelect: 'none' }}>{parts[0]}</span>
                <span
                  onContextMenu={(e) => handleContextMenu(e, span)}
                  style={{
                    backgroundColor: `${color}30`,
                    borderBottom: `2px solid ${color}`,
                    borderRadius: '2px',
                  cursor: 'pointer',
                  color: '#111827',
                  pointerEvents: 'auto',
                  fontWeight: '500',
                }}
                  title={`${tooltipText} - ${span.type} - Right-click to change or reject`}
                >
                  {displayText}
                </span>
                <span style={{ color: 'transparent', fontSize: '0.1px', width: 0, display: 'inline', userSelect: 'none' }}>{parts[1]}</span>
              </span>
            );
          }
        }
      } else {
        // Natural entity - show full text with highlighting
        elements.push(
          <span
            key={`highlight-${idx}`}
            onContextMenu={(e) => handleContextMenu(e, span)}
            style={{
              backgroundColor: `${color}20`,
              borderBottom: `2px solid ${color}`,
              borderRadius: '2px',
              cursor: 'pointer',
              color: '#111827',
              whiteSpace: 'pre-wrap',
              position: 'relative',
              pointerEvents: 'auto',
              transition: 'all 0.15s ease',
              boxShadow: `0 1px 3px ${color}10`,
            }}
            title={`${tooltipText} - ${span.type} (${Math.round(span.confidence * 100)}% confidence) - Right-click to change or reject`}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `${color}40`;
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = `0 4px 8px ${color}40`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = `${color}20`;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = `0 1px 3px ${color}10`;
            }}
          >
            {span.text}
          </span>
        );
      }

      lastIndex = span.end;
    });

    // Add remaining text
    if (lastIndex < value.length) {
      elements.push(
        <span key="text-final" style={{ color: '#111827', whiteSpace: 'pre-wrap', pointerEvents: 'none' }}>
          {value.slice(lastIndex)}
        </span>
      );
    }

    return elements;
  };

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
          Write {enableHighlighting && highlights.length > 0 && `(${highlights.length} entities)`}
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
          <div style={{ position: 'relative' }}>
            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onScroll={handleScroll}
              onContextMenu={handleTextareaContextMenu}
              placeholder={
                placeholder ||
                'Write your note here... Entity names will be highlighted automatically as you type.'
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
                position: 'relative',
                zIndex: 1,
                background: 'transparent',
                color: enableHighlighting ? 'transparent' : '#111827',
                lineHeight: '1.5',
                overflow: 'auto',
                caretColor: '#111827', // Keep cursor visible
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#3b82f6';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            />

            {/* Highlight overlay */}
            {enableHighlighting && (
              <div
                ref={overlayRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  overflow: 'hidden',
                  zIndex: 2,
                  border: '1px solid transparent',
                  borderRadius: '6px',
                  pointerEvents: 'none', // Pass through all events to textarea
                }}
              >
                <div
                  ref={overlayContentRef}
                  style={{
                    padding: '12px',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    lineHeight: '1.5',
                    wordWrap: 'break-word',
                    whiteSpace: 'pre-wrap',
                    willChange: 'transform',
                    pointerEvents: 'none',
                  }}
                >
                  {renderHighlightedText()}
                </div>
              </div>
            )}
          </div>

          {/* Syntax hints */}
          <div
            style={{
              fontSize: '12px',
              color: '#6b7280',
              marginTop: '8px',
            }}
          >
            {enableHighlighting ? (
              <>
                <strong>💡 Tip:</strong> Entity names are highlighted automatically. Right-click to
                confirm or change type.
              </>
            ) : (
              <>
                <strong>Syntax:</strong> <code>[[Entity: name]]</code> or{' '}
                <code>[[NewEntity: name|type=TYPE]]</code>
              </>
            )}
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

      {/* Context menu */}
      {contextMenu && (
        <EntityContextMenu
          position={contextMenu.position}
         entity={{
            text: getSpanTooltipLabel(contextMenu.entity as EntitySpan),
            type: contextMenu.entity.type,
            confidence: contextMenu.entity.confidence,
          }}
          onConfirm={handleConfirm}
          onReject={handleReject}
          onClose={() => setContextMenu(null)}
          isNewEntity={contextMenu.isNewEntity}
        />
      )}
    </div>
  );
}
