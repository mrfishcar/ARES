/**
 * useExtractionSettings - Manages extraction UI settings
 * Handles: highlighting, opacity, margins, entity highlight mode
 */

import { useState, useEffect, useCallback } from 'react';

export function useExtractionSettings() {
  const [showHighlighting, setShowHighlighting] = useState(true);
  const [highlightOpacity, setHighlightOpacity] = useState(1.0);
  const [entityHighlightMode, setEntityHighlightMode] = useState(false);
  const [editorMargin, setEditorMargin] = useState<number>(() => {
    if (typeof window === 'undefined') return 96;
    const saved = localStorage.getItem('ares.editorMargin');
    return saved ? Number(saved) : 96;
  });

  // Persist editor margin to localStorage and CSS variable
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty(
      '--editor-margin-desktop',
      `${editorMargin}px`
    );
    localStorage.setItem('ares.editorMargin', String(editorMargin));
  }, [editorMargin]);

  const toggleHighlighting = useCallback(() => {
    setShowHighlighting(prev => !prev);
  }, []);

  const toggleEntityHighlightMode = useCallback(() => {
    setEntityHighlightMode(prev => !prev);
  }, []);

  return {
    // State
    showHighlighting,
    highlightOpacity,
    entityHighlightMode,
    editorMargin,

    // Actions
    setShowHighlighting,
    setHighlightOpacity,
    toggleHighlighting,
    toggleEntityHighlightMode,
    setEditorMargin,
  };
}
