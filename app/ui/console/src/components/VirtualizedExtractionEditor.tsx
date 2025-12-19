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

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import type { NavigateToRange } from './CodeMirrorEditorProps';
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
  onTextSelected?: (start: number, end: number, selectedText: string, entitiesInRange: EntitySpan[]) => void | Promise<void>;
  onResizeEntity?: (entity: EntitySpan, newStart: number, newEnd: number) => void | Promise<void>;
  enableLongTextOptimization?: boolean;
  navigateToRange?: NavigateToRange;
  colorForSpan?: (span: EntitySpan) => string | undefined;
}

// Configurable window parameters
const VIRTUALIZATION_THRESHOLD = 50000; // Only virtualize docs larger than this
const DEFAULT_WINDOW_SIZE = 50000; // Much larger window to minimize updates
const DEFAULT_SAFE_MARGIN = 10000; // Large margins to reduce update frequency
const WINDOW_SHIFT_STEP = 5000; // Larger shifts for smoother transitions

const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

const DEBUG_EDITOR_FOCUS =
  (typeof window !== 'undefined' && (window as any).ARES_DEBUG_EDITOR_FOCUS) ||
  import.meta.env.VITE_DEBUG_EDITOR_FOCUS === 'true';

const debugLog = (...args: any[]) => {
  if (DEBUG_EDITOR_FOCUS) {
    // eslint-disable-next-line no-console
    console.log('[VirtualizedEditorDebug]', ...args);
  }
};

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
  onTagEntity,
  onTextSelected,
  onResizeEntity,
  enableLongTextOptimization = false,
  navigateToRange,
  colorForSpan,
}: VirtualizedExtractionEditorProps) {
  const chunkingEnabled = useMemo(
    () => enableLongTextOptimization,
    [enableLongTextOptimization]
  );
  const shouldVirtualize = useMemo(
    () => chunkingEnabled && !isIOS && text.length > VIRTUALIZATION_THRESHOLD,
    [chunkingEnabled, text.length]
  );

  // Window state
  const [windowStart, setWindowStart] = useState(0);
  const [windowSize] = useState(DEFAULT_WINDOW_SIZE);
  const prevTextLengthRef = useRef(text.length);
  const pendingWindowStartRef = useRef<number | null>(null);
  const windowUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const isUpdatingWindowRef = useRef(false); // Track programmatic window updates
  const lastWindowStartRef = useRef(windowStart);
  const pendingNavigationRef = useRef<NavigateToRange | null>(null);
  const lastHandledRequestIdRef = useRef<number | null>(null);
  const [localNavigateTarget, setLocalNavigateTarget] = useState<NavigateToRange | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (windowUpdateTimeoutRef.current) {
        clearTimeout(windowUpdateTimeoutRef.current);
      }
    };
  }, []);

  const clampToDoc = useCallback(
    (pos: number) => Math.max(0, Math.min(text.length, pos)),
    [text.length]
  );

  const clampWindowStart = useCallback(
    (pos: number) => {
      const maxStart = Math.max(0, text.length - windowSize);
      return Math.max(0, Math.min(maxStart, pos));
    },
    [text.length, windowSize]
  );

  // Track when window position changes and set update flag
  useEffect(() => {
    if (!shouldVirtualize) return;

    if (windowStart !== lastWindowStartRef.current) {
      debugLog('Window position changed', {
        from: lastWindowStartRef.current,
        to: windowStart
      });

      // Set flag to ignore cursor changes during window update
      isUpdatingWindowRef.current = true;
      lastWindowStartRef.current = windowStart;

      // Clear flag after window has settled (longer delay to account for rendering)
      setTimeout(() => {
        isUpdatingWindowRef.current = false;
        debugLog('Window update settled');
      }, 200);
    }
  }, [windowStart, shouldVirtualize]);

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

  if (!shouldVirtualize && DEBUG_EDITOR_FOCUS) {
    debugLog('Virtualization disabled', {
      chunkingEnabled,
      isIOS,
      textLength: text.length
    });
  }

  // Derived values
  const windowEnd = shouldVirtualize
    ? Math.min(text.length, windowStart + windowSize)
    : text.length;
  const windowText = shouldVirtualize
    ? text.slice(windowStart, windowEnd)
    : text;
  const effectiveBaseOffset = shouldVirtualize ? windowStart : 0;

  // Filter entities to those in the current window (or all if not virtualizing)
  const windowEntities = shouldVirtualize
    ? entities.filter(e => e.end > windowStart && e.start < windowEnd)
    : entities;

  useEffect(() => {
    if (!navigateToRange) return;
    if (navigateToRange.requestId === lastHandledRequestIdRef.current) return;

    const normalizedFrom = clampToDoc(Math.min(navigateToRange.from, navigateToRange.to));
    const normalizedTo = clampToDoc(Math.max(navigateToRange.from, navigateToRange.to));
    const normalizedTarget: NavigateToRange = {
      from: normalizedFrom,
      to: normalizedTo,
      requestId: navigateToRange.requestId,
    };

    pendingNavigationRef.current = normalizedTarget;

    if (shouldVirtualize) {
      const desiredStart = clampWindowStart(normalizedFrom - DEFAULT_SAFE_MARGIN);
      if (desiredStart !== windowStart) {
        setWindowStart(desiredStart);
        return;
      }
    }

    setLocalNavigateTarget({
      ...normalizedTarget,
      from: normalizedTarget.from - effectiveBaseOffset,
      to: normalizedTarget.to - effectiveBaseOffset,
    });
    lastHandledRequestIdRef.current = normalizedTarget.requestId;
    pendingNavigationRef.current = null;
  }, [
    navigateToRange,
    shouldVirtualize,
    clampToDoc,
    clampWindowStart,
    windowStart,
    effectiveBaseOffset,
  ]);

  useEffect(() => {
    if (!shouldVirtualize) return;
    if (!pendingNavigationRef.current) return;

    const pending = pendingNavigationRef.current;
    const inWindow = pending.from >= windowStart && pending.to <= windowEnd;

    if (!inWindow) {
      const desiredStart = clampWindowStart(pending.from - DEFAULT_SAFE_MARGIN);
      if (desiredStart !== windowStart) {
        setWindowStart(desiredStart);
        return;
      }
    }

    setLocalNavigateTarget({
      ...pending,
      from: pending.from - effectiveBaseOffset,
      to: pending.to - effectiveBaseOffset,
    });
    lastHandledRequestIdRef.current = pending.requestId;
    pendingNavigationRef.current = null;
  }, [
    shouldVirtualize,
    windowStart,
    windowEnd,
    effectiveBaseOffset,
    clampWindowStart,
  ]);

  debugLog('Render', {
    textLength: text.length,
    shouldVirtualize,
    windowStart,
    windowEnd,
    windowSize: windowText.length
  });

  // Handle changes from the windowed editor
  const handleWindowChange = useCallback((newWindowText: string) => {
    const oldWindowText = text.slice(windowStart, windowEnd);

    debugLog('handleWindowChange', {
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

    debugLog('Patched result', {
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
      debugLog('handleCursorChange (inert)', { globalPos });
      return;
    }

    // Ignore cursor changes during programmatic window updates to prevent feedback loops
    if (isUpdatingWindowRef.current) {
      debugLog('Ignoring cursor change during window update');
      return;
    }

    debugLog('handleCursorChange', {
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
      debugLog('Position inside safe zone, no adjustment needed');
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

    debugLog('Adjusting window', {
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
      baseOffset={effectiveBaseOffset}
      disableHighlighting={disableHighlighting}
      highlightOpacity={highlightOpacity}
      renderMarkdown={renderMarkdown}
      entities={windowEntities}
      entityHighlightMode={entityHighlightMode}
      onChangeType={onChangeType}
      onCreateNew={onCreateNew}
      onReject={onReject}
      onTagEntity={onTagEntity}
      onTextSelected={onTextSelected}
      onResizeEntity={onResizeEntity}
      onCursorChange={handleCursorChange}
      navigateToRange={localNavigateTarget || undefined}
      colorForSpan={colorForSpan}
    />
  );
}
