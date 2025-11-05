/**
 * Markdown Highlighter - Sprint R10
 * Real-time entity highlighting in markdown editor
 */

import { useEffect, useState, useRef } from 'react';
import type { Highlight } from '../hooks/useHighlights';

interface MarkdownHighlighterProps {
  text: string;
  highlights: Highlight[];
  onHighlightClick?: (highlight: Highlight) => void;
  onContextMenu?: (highlight: Highlight, event: React.MouseEvent) => void;
  readOnly?: boolean;
}

const ENTITY_COLORS: Record<string, string> = {
  PERSON: '#3b82f6',
  PLACE: '#10b981',
  ORG: '#f59e0b',
  EVENT: '#8b5cf6',
  CONCEPT: '#ec4899',
  THING: '#6b7280',
};

export function MarkdownHighlighter({
  text,
  highlights,
  onHighlightClick,
  onContextMenu,
  readOnly = true,
}: MarkdownHighlighterProps) {
  const [renderedText, setRenderedText] = useState<JSX.Element[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Sort highlights by start position, then by confidence (higher first)
    const sortedHighlights = [...highlights].sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return b.confidence - a.confidence; // Higher confidence first
    });

    // Remove overlapping highlights (keep highest confidence)
    const nonOverlapping: typeof sortedHighlights = [];
    for (const highlight of sortedHighlights) {
      const overlaps = nonOverlapping.some(
        (existing) =>
          highlight.start < existing.end && highlight.end > existing.start
      );
      if (!overlaps) {
        nonOverlapping.push(highlight);
      }
    }

    // Re-sort by start position after filtering
    const filteredHighlights = nonOverlapping.sort((a, b) => a.start - b.start);

    const elements: JSX.Element[] = [];
    let lastIndex = 0;

    filteredHighlights.forEach((highlight, idx) => {
      // Add text before highlight
      if (highlight.start > lastIndex) {
        elements.push(
          <span key={`text-${idx}`}>{text.slice(lastIndex, highlight.start)}</span>
        );
      }

      // Add highlighted text
      const color = ENTITY_COLORS[highlight.entityType] || '#6b7280';
      const isConfirmed = highlight.status === 'confirmed';
      const isRejected = highlight.status === 'rejected';

      // Get the actual text from the document (more reliable than highlight.text)
      const highlightText = text.slice(highlight.start, highlight.end);

      elements.push(
        <span
          key={`highlight-${highlight.id}`}
          onClick={() => onHighlightClick?.(highlight)}
          onContextMenu={(e) => {
            e.preventDefault();
            onContextMenu?.(highlight, e);
          }}
          style={{
            backgroundColor: isRejected
              ? 'transparent'
              : `${color}${isConfirmed ? '40' : '20'}`,
            borderBottom: `2px solid ${color}`,
            cursor: 'pointer',
            textDecoration: isRejected ? 'line-through' : 'none',
            opacity: isRejected ? 0.4 : 1,
            position: 'relative',
            padding: '2px 0',
          }}
          title={`${highlight.entityType} (${(highlight.confidence * 100).toFixed(0)}% confidence) - ${highlight.status}`}
        >
          {highlightText}
        </span>
      );

      lastIndex = highlight.end;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      elements.push(<span key="text-end">{text.slice(lastIndex)}</span>);
    }

    setRenderedText(elements);
  }, [text, highlights, onHighlightClick, onContextMenu]);

  if (!readOnly) {
    // For editable mode, we'd need a more sophisticated approach
    // For now, just show plain text
    return (
      <div
        ref={containerRef}
        style={{
          fontFamily: 'monospace',
          fontSize: '14px',
          lineHeight: '1.6',
          padding: '12px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        fontFamily: 'monospace',
        fontSize: '14px',
        lineHeight: '1.6',
        padding: '12px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {renderedText}
    </div>
  );
}

/**
 * Simple pattern-based entity detector for real-time highlighting
 * This is a lightweight version - in production would use the backend parser
 */
export function detectPotentialEntities(text: string): Array<{
  text: string;
  start: number;
  end: number;
  type: string;
  confidence: number;
}> {
  const entities: Array<{
    text: string;
    start: number;
    end: number;
    type: string;
    confidence: number;
  }> = [];

  // Pattern 1: Capitalized names (likely PERSON)
  const namePattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;
  let match;
  while ((match = namePattern.exec(text)) !== null) {
    entities.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      type: 'PERSON',
      confidence: 0.7,
    });
  }

  // Pattern 2: Wiki-style links [[Entity: Name]]
  const wikiPattern = /\[\[([A-Z]+):\s*([^\]]+)\]\]/g;
  while ((match = wikiPattern.exec(text)) !== null) {
    entities.push({
      text: match[2],
      start: match.index,
      end: match.index + match[0].length,
      type: match[1],
      confidence: 0.95,
    });
  }

  // Pattern 3: Dates and events
  const datePattern = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/g;
  while ((match = datePattern.exec(text)) !== null) {
    entities.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      type: 'EVENT',
      confidence: 0.6,
    });
  }

  // Pattern 4: Locations with "in", "at", "from"
  const locationPattern = /(?:in|at|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g;
  while ((match = locationPattern.exec(text)) !== null) {
    // match[1] is the captured location name
    // Calculate correct start position by finding where the captured group starts
    const locationStart = match.index + match[0].indexOf(match[1]);
    entities.push({
      text: match[1],
      start: locationStart,
      end: locationStart + match[1].length,
      type: 'PLACE',
      confidence: 0.65,
    });
  }

  // Remove overlapping entities (keep highest confidence)
  const nonOverlapping: typeof entities = [];
  const sorted = entities.sort((a, b) => b.confidence - a.confidence);

  for (const entity of sorted) {
    const overlaps = nonOverlapping.some(
      (existing) =>
        (entity.start >= existing.start && entity.start < existing.end) ||
        (entity.end > existing.start && entity.end <= existing.end)
    );

    if (!overlaps) {
      nonOverlapping.push(entity);
    }
  }

  return nonOverlapping.sort((a, b) => a.start - b.start);
}
