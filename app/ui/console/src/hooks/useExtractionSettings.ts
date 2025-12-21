/**
 * useExtractionSettings - Manages extraction UI settings
 * Handles: highlighting, opacity, margins, entity highlight mode
 */

import { useState, useEffect, useCallback } from 'react';

export function useExtractionSettings() {
  const [showHighlighting, setShowHighlighting] = useState(true);
  const [highlightOpacity, setHighlightOpacity] = useState(1.0);
  const [entityHighlightMode, setEntityHighlightMode] = useState(false);
  const envDefaultRich =
    typeof import.meta !== 'undefined'
      ? import.meta.env.VITE_USE_RICH_EDITOR !== 'false'
      : true;
  const [useRichEditor, setUseRichEditor] = useState<boolean>(() => {
    if (typeof window === 'undefined') return envDefaultRich;
    const saved = localStorage.getItem('ares.useRichEditor');
    if (saved != null) return saved === 'true';
    return envDefaultRich;
  });
  const [showEntityIndicators, setShowEntityIndicators] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('ares.showEntityIndicators');
    return saved ? saved === 'true' : true;
  });
  const [enableLongTextOptimization, setEnableLongTextOptimization] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('ares.enableLongTextOptimization');
    return saved ? saved === 'true' : false;
  });
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('ares.useRichEditor', String(useRichEditor));
  }, [useRichEditor]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(
      'ares.showEntityIndicators',
      String(showEntityIndicators)
    );
  }, [showEntityIndicators]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(
      'ares.enableLongTextOptimization',
      String(enableLongTextOptimization)
    );
  }, [enableLongTextOptimization]);

  const toggleHighlighting = useCallback(() => {
    setShowHighlighting(prev => !prev);
  }, []);

  const toggleEntityHighlightMode = useCallback(() => {
    setEntityHighlightMode(prev => !prev);
  }, []);

  const toggleEntityIndicators = useCallback(() => {
    setShowEntityIndicators(prev => !prev);
  }, []);

  const toggleLongTextOptimization = useCallback(() => {
    setEnableLongTextOptimization(prev => !prev);
  }, []);

  const toggleRichEditor = useCallback(() => {
    setUseRichEditor(prev => !prev);
  }, []);

  return {
    // State
    showHighlighting,
    highlightOpacity,
    entityHighlightMode,
    useRichEditor,
    showEntityIndicators,
    enableLongTextOptimization,
    editorMargin,

    // Actions
    setShowHighlighting,
    setHighlightOpacity,
    toggleHighlighting,
    toggleEntityHighlightMode,
    toggleEntityIndicators,
    setEnableLongTextOptimization,
    toggleLongTextOptimization,
    setEditorMargin,
    toggleRichEditor,
    setUseRichEditor,
  };
}
