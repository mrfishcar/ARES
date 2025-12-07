/**
 * VirtualizedExtractionEditor - Hard-mode chunking for large documents
 *
 * Problem: Very large documents (100k+ chars) cause performance issues on iPad/desktop
 * Solution: Keep full document in parent, give CodeMirror only a windowed slice
 *
 * Key features:
 * - Full text + entities maintained at this level
 * - CodeMirror sees only a window (default 8k chars)
 * - Window follows caret with safe margins
 * - Diff-based patching to apply window edits to full doc
 * - Entity highlighting and tag hiding work in window coordinates
 */

import { useState, useCallback } from 'react';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import type { EntitySpan, EntityType } from '../types/entities';

interface VirtualizedExtractionEditorProps {
  text: string;
  onTextChange: (newText: string) => void;
  entities: EntitySpan[];
  disableHighlighting: boolean;
  highlightOpacity: number;
  renderMarkdown: boolean;
  entityHighlightMode: boolean;
  onChangeType?: (entity: EntitySpan, type: EntityType) => Promise<void> | void;
  onCreateNew?: (entity: EntitySpan, type: EntityType) => Promise<void> | void;
  onReject?: (entity: EntitySpan) => Promise<void> | void;
  onTagEntity?: (entity: EntitySpan, targetEntity: EntitySpan) => Promise<void> | void;
}

// Configurable window parameters
const DEFAULT_WINDOW_SIZE = 8000; // chars to show at once
const DEFAULT_SAFE_MARGIN = 2000; // chars before/after caret before moving window

/**
 * Diff-based patch: apply changes from window back to full text
 *
 * Strategy:
 * 1. Find common prefix between old and new window
 * 2. Find common suffix (after prefix)
 * 3. Identify the changed region in the middle
 * 4. Apply that change to the full document at the correct global offset
 */
function applyWindowPatch(
  fullText: string,
  windowStart: number,
  oldWindow: string,
  newWindow: string
): string {
  // Find common prefix
  let prefixLen = 0;
  const maxPrefix = Math.min(oldWindow.length, newWindow.length);
  while (
    prefixLen < maxPrefix &&
    oldWindow.charCodeAt(prefixLen) === newWindow.charCodeAt(prefixLen)
  ) {
    prefixLen++;
  }

  // Find common suffix (after prefix)
  let suffixLen = 0;
  const oldLen = oldWindow.length;
  const newLen = newWindow.length;
  const maxSuffix = Math.min(oldLen, newLen) - prefixLen;
  while (
    suffixLen < maxSuffix &&
    oldWindow.charCodeAt(oldLen - 1 - suffixLen) ===
      newWindow.charCodeAt(newLen - 1 - suffixLen)
  ) {
    suffixLen++;
  }

  // Identify the changed region
  const oldMiddleStart = prefixLen;
  const oldMiddleEnd = oldLen - suffixLen;
  const newMiddleStart = prefixLen;
  const newMiddleEnd = newLen - suffixLen;

  // Map to global document offsets
  const globalDeleteStart = windowStart + oldMiddleStart;
  const globalDeleteEnd = windowStart + oldMiddleEnd;
  const insertText = newWindow.slice(newMiddleStart, newMiddleEnd);

  // Apply patch to full document
  return (
    fullText.slice(0, globalDeleteStart) +
    insertText +
    fullText.slice(globalDeleteEnd)
  );
}

export function VirtualizedExtractionEditor({
  text,
  onTextChange,
  entities,
  disableHighlighting,
  highlightOpacity,
  renderMarkdown,
  entityHighlightMode,
  onChangeType,
  onCreateNew,
  onReject,
  onTagEntity
}: VirtualizedExtractionEditorProps) {
  // Window state
  const [windowStart, setWindowStart] = useState(0);
  const [windowSize] = useState(DEFAULT_WINDOW_SIZE);

  // Derived values
  const windowEnd = Math.min(text.length, windowStart + windowSize);
  const windowText = text.slice(windowStart, windowEnd);

  // Filter entities to those in the current window
  const windowEntities = entities.filter(e =>
    e.end > windowStart && e.start < windowEnd
  );

  // Handle changes from the windowed editor
  const handleWindowChange = useCallback((newWindowText: string) => {
    const oldWindowText = text.slice(windowStart, windowEnd);

    // No change
    if (newWindowText === oldWindowText) return;

    // Apply diff-based patch
    const patched = applyWindowPatch(
      text,
      windowStart,
      oldWindowText,
      newWindowText
    );

    onTextChange(patched);
  }, [text, windowStart, windowEnd, onTextChange]);

  // Handle cursor position changes to adjust window
  const handleCursorChange = useCallback((globalPos: number) => {
    // Only move window if caret is outside the safe zone
    const safeZoneStart = windowStart + DEFAULT_SAFE_MARGIN;
    const safeZoneEnd = windowEnd - DEFAULT_SAFE_MARGIN;

    const caretOutside = globalPos < safeZoneStart || globalPos > safeZoneEnd;

    if (!caretOutside) return;

    // Center the window around the cursor, with some bias toward the start
    const desiredStart = Math.max(0, globalPos - DEFAULT_SAFE_MARGIN);

    if (desiredStart !== windowStart) {
      setWindowStart(desiredStart);
    }
  }, [windowStart, windowEnd]);

  return (
    <CodeMirrorEditor
      value={windowText}
      onChange={handleWindowChange}
      baseOffset={windowStart}
      disableHighlighting={disableHighlighting}
      highlightOpacity={highlightOpacity}
      renderMarkdown={renderMarkdown}
      entities={windowEntities}
      entityHighlightMode={entityHighlightMode}
      onChangeType={onChangeType}
      onCreateNew={onCreateNew}
      onReject={onReject}
      onTagEntity={onTagEntity}
      onCursorChange={handleCursorChange}
    />
  );
}
