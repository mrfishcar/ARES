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

import { useState, useCallback, useEffect, useRef } from 'react';
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
  onChangeType?: (entity: EntitySpan, type: EntityType) => Promise<void>;
  onCreateNew?: (entity: EntitySpan, type: EntityType) => void | Promise<void>;
  onReject?: (entity: EntitySpan) => Promise<void>;
  onTagEntity?: (entity: EntitySpan, targetEntity: EntitySpan) => Promise<void>;
}

// Configurable window parameters
const VIRTUALIZATION_THRESHOLD = 50000; // Only virtualize docs larger than this
const DEFAULT_WINDOW_SIZE = 50000; // Much larger window to minimize updates
const DEFAULT_SAFE_MARGIN = 10000; // Large margins to reduce update frequency
const WINDOW_SHIFT_STEP = 5000; // Larger shifts for smoother transitions

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
  const prevTextLengthRef = useRef(text.length);
  const pendingWindowStartRef = useRef<number | null>(null);
  const windowUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingWindowRef = useRef(false); // Track programmatic window updates
  const lastWindowStartRef = useRef(windowStart);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (windowUpdateTimeoutRef.current) {
        clearTimeout(windowUpdateTimeoutRef.current);
      }
    };
  }, []);

  // Track when window position changes and set update flag
  useEffect(() => {
    if (windowStart !== lastWindowStartRef.current) {
      console.log('[VirtualizedEditor] Window position changed', {
        from: lastWindowStartRef.current,
        to: windowStart
      });

      // Set flag to ignore cursor changes during window update
      isUpdatingWindowRef.current = true;
      lastWindowStartRef.current = windowStart;

      // Clear flag after window has settled (longer delay to account for rendering)
      setTimeout(() => {
        isUpdatingWindowRef.current = false;
        console.log('[VirtualizedEditor] Window update settled');
      }, 200);
    }
  }, [windowStart]);

  // Reset window to beginning when text changes dramatically (paste, load, etc.)
  useEffect(() => {
    const prevLength = prevTextLengthRef.current;
    const currentLength = text.length;

    // Large change detected (paste, load, clear) - reset to beginning
    const lengthChange = Math.abs(currentLength - prevLength);
    const significantChange = lengthChange > 1000 || currentLength === 0;

    if (significantChange) {
      setWindowStart(0);
      // Clear any pending window updates
      if (windowUpdateTimeoutRef.current) {
        clearTimeout(windowUpdateTimeoutRef.current);
        windowUpdateTimeoutRef.current = null;
      }
      pendingWindowStartRef.current = null;
    }

    prevTextLengthRef.current = currentLength;
  }, [text.length]);

  // Skip virtualization for small documents
  const shouldVirtualize = text.length > VIRTUALIZATION_THRESHOLD;

  // Derived values
  const windowEnd = shouldVirtualize
    ? Math.min(text.length, windowStart + windowSize)
    : text.length;
  const windowText = shouldVirtualize
    ? text.slice(windowStart, windowEnd)
    : text;

  // Filter entities to those in the current window (or all if not virtualizing)
  const windowEntities = shouldVirtualize
    ? entities.filter(e => e.end > windowStart && e.start < windowEnd)
    : entities;

  console.log('[VirtualizedEditor] Render', {
    textLength: text.length,
    shouldVirtualize,
    windowStart,
    windowEnd,
    windowSize: windowText.length
  });

  // Handle changes from the windowed editor
  const handleWindowChange = useCallback((newWindowText: string) => {
    const oldWindowText = text.slice(windowStart, windowEnd);

    console.log('[VirtualizedEditor] handleWindowChange', {
      textLength: text.length,
      windowStart,
      windowEnd,
      oldWindowLength: oldWindowText.length,
      newWindowLength: newWindowText.length,
      match: newWindowText === oldWindowText
    });

    // No change
    if (newWindowText === oldWindowText) return;

    // Apply diff-based patch
    const patched = applyWindowPatch(
      text,
      windowStart,
      oldWindowText,
      newWindowText
    );

    console.log('[VirtualizedEditor] Patched result', {
      originalLength: text.length,
      patchedLength: patched.length,
      firstChars: patched.slice(0, 100)
    });

    onTextChange(patched);
  }, [text, windowStart, windowEnd, onTextChange]);

  // Handle cursor position changes to adjust window
  const handleCursorChange = useCallback((globalPos: number) => {
    // Skip if not virtualizing
    if (!shouldVirtualize) {
      return;
    }

    // Ignore cursor changes during programmatic window updates to prevent feedback loops
    if (isUpdatingWindowRef.current) {
      console.log('[VirtualizedEditor] Ignoring cursor change during window update');
      return;
    }

    console.log('[VirtualizedEditor] handleCursorChange', {
      globalPos,
      windowStart,
      windowEnd,
      textLength: text.length
    });

    // Clamp position to document bounds
    const clampedPos = Math.max(0, Math.min(text.length, globalPos));

    // Only move window if position is outside the safe zone
    const safeZoneStart = windowStart + DEFAULT_SAFE_MARGIN;
    const safeZoneEnd = windowEnd - DEFAULT_SAFE_MARGIN;

    const isOutside = clampedPos < safeZoneStart || clampedPos > safeZoneEnd;

    if (!isOutside) {
      console.log('[VirtualizedEditor] Position inside safe zone, no adjustment needed');
      return;
    }

    // Calculate new window position with smooth incremental shifts
    let newWindowStart: number;

    if (clampedPos < safeZoneStart) {
      // Scrolling up - shift window backward
      newWindowStart = Math.max(0, clampedPos - DEFAULT_SAFE_MARGIN);
    } else {
      // Scrolling down - shift window forward incrementally
      const overshoot = clampedPos - safeZoneEnd;
      newWindowStart = Math.min(
        text.length - windowSize,
        windowStart + Math.min(WINDOW_SHIFT_STEP, overshoot)
      );
    }

    // Ensure window doesn't go past document end
    newWindowStart = Math.max(0, Math.min(text.length - windowSize, newWindowStart));

    console.log('[VirtualizedEditor] Adjusting window', {
      from: windowStart,
      to: newWindowStart,
      reason: clampedPos < safeZoneStart ? 'scrolling up' : 'scrolling down'
    });

    // Debounce rapid updates
    if (windowUpdateTimeoutRef.current) {
      clearTimeout(windowUpdateTimeoutRef.current);
    }

    pendingWindowStartRef.current = newWindowStart;

    windowUpdateTimeoutRef.current = setTimeout(() => {
      if (pendingWindowStartRef.current !== null && pendingWindowStartRef.current !== windowStart) {
        setWindowStart(pendingWindowStartRef.current);
        pendingWindowStartRef.current = null;
      }
    }, 50); // Small debounce to batch rapid scroll events
  }, [windowStart, windowEnd, windowSize, text.length, shouldVirtualize]);

  return (
    <CodeMirrorEditor
      value={windowText}
      onChange={handleWindowChange}
      baseOffset={shouldVirtualize ? windowStart : 0}
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
