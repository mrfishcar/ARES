/**
 * ARES Console Shell
 * Extraction Lab - Mobile-optimized text editor for entity/relation extraction
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useToast, ToastContainer } from './components/Toast';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExtractionLab } from './pages/ExtractionLab';
import { EditorTest } from './pages/EditorTest';
import { UltraMinimalTest } from './pages/UltraMinimalTest';
import { WorkingCommitTest } from './pages/WorkingCommitTest';
import { ExactWorkingReplica } from './pages/ExactWorkingReplica';
import { loadState, saveState } from './lib/storage';
import { initializeClientErrorLogger } from './lib/errorLogger';


// Global focus/selection debug instrumentation
const DEBUG_EDITOR_FOCUS =
  (typeof window !== 'undefined' && (window as any).ARES_DEBUG_EDITOR_FOCUS) ||
  import.meta.env.VITE_DEBUG_EDITOR_FOCUS === 'true';

function AppShell() {
  const [project] = useState<string>(() => loadState('project', 'default'));
  const toast = useToast();
  const motionRootRef = useRef<HTMLDivElement>(null);
  const motionTimerRef = useRef<number | null>(null);

  // Global focus/selection debugging - helps track caret interruption issues on iPad
  useEffect(() => {
    if (!DEBUG_EDITOR_FOCUS) return;

    const log = (...args: any[]) => {
      // eslint-disable-next-line no-console
      console.log('[GlobalFocusDebug]', ...args);
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      log('pointerdown', {
        tag: target?.tagName,
        className: target?.className?.toString?.().slice(0, 80),
        id: target?.id,
      });
    };

    const onSelectionChange = () => {
      const active = document.activeElement as HTMLElement | null;
      const sel = window.getSelection();
      log('selectionchange', {
        activeTag: active?.tagName,
        activeClass: active?.className?.toString?.().slice(0, 80),
        selectionLength: sel?.toString().length ?? 0,
      });
    };

    const onFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      log('focus', {
        tag: target?.tagName,
        className: target?.className?.toString?.().slice(0, 80),
      });
    };

    const onBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      log('blur', {
        tag: target?.tagName,
        className: target?.className?.toString?.().slice(0, 80),
      });
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('focus', onFocus, true);
    document.addEventListener('blur', onBlur, true);

    log('Global focus debugging enabled');

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('focus', onFocus, true);
      document.removeEventListener('blur', onBlur, true);
    };
  }, []);

  // iOS Notes pattern: Let 100dvh handle keyboard, NO JavaScript tracking
  // visualViewport.height changes when keyboard opens, but 100dvh stays constant
  // This lets content extend behind keyboard instead of shrinking
  // Safari's native scrollIntoView handles caret positioning perfectly
  useEffect(() => {
    // NO-OP: Removed viewport tracking
    // Keeping effect for documentation purposes
  }, []);

  useEffect(() => {
    saveState('project', project);
  }, [project]);

  useEffect(() => {
    const cleanup = initializeClientErrorLogger(project);
    return () => {
      if (cleanup) cleanup();
    };
  }, [project]);

  useEffect(() => {
    const root = motionRootRef.current ?? document.documentElement;
    if (!root) return;
    root.setAttribute('data-motion', 'idle');

    const activateMotion = () => {
      root.setAttribute('data-motion', 'active');
      if (motionTimerRef.current) {
        clearTimeout(motionTimerRef.current);
      }
      motionTimerRef.current = window.setTimeout(() => {
        root.setAttribute('data-motion', 'idle');
      }, 150);
    };

    const listeners: Array<[keyof WindowEventMap, EventListenerOrEventListenerObject]> = [
      ['scroll', activateMotion],
      ['wheel', activateMotion],
      ['pointermove', activateMotion],
      ['touchmove', activateMotion],
      ['keydown', activateMotion],
    ];

    listeners.forEach(([event, handler]) => window.addEventListener(event, handler, { passive: true }));

    return () => {
      listeners.forEach(([event, handler]) => window.removeEventListener(event, handler));
      if (motionTimerRef.current) {
        clearTimeout(motionTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      <Routes>
        {/* ExtractionLab - Main application with Lexical editor */}
        <Route path="/" element={<ExtractionLab project={project} toast={toast} />} />
        <Route path="/replica" element={<ExactWorkingReplica />} />
        <Route path="/test" element={<WorkingCommitTest />} />
        <Route path="/minimal" element={<UltraMinimalTest />} />
        <Route path="/editor" element={<EditorTest />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer messages={toast.messages} onClose={toast.closeToast} />
      <div id="overlay-root" className="overlay-root" />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
