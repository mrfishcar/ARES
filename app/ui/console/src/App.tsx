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

  // iOS viewport height tracking with throttling (PHASE 2A)
  // Production pattern: Only update layout-affecting CSS vars when values change meaningfully
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const docEl = document.documentElement;
    const viewport = window.visualViewport;

    let rafId: number | null = null;
    let lastCommittedVVH = viewport?.height ?? window.innerHeight;
    let lastCommittedSlack = 120;

    const updateViewportHeight = () => {
      // Cancel pending updates
      if (rafId) cancelAnimationFrame(rafId);

      // Batch updates via requestAnimationFrame
      rafId = requestAnimationFrame(() => {
        const vvHeight = viewport?.height ?? window.innerHeight;
        const fullHeight = window.innerHeight;
        const keyboardHeight = fullHeight - vvHeight;

        // Only update --vvh if it changed meaningfully (>= 8px threshold)
        if (Math.abs(vvHeight - lastCommittedVVH) >= 8) {
          docEl.style.setProperty('--vvh', `${vvHeight}px`);
          lastCommittedVVH = vvHeight;
        }

        // Calculate scroll slack: max(120px, keyboardHeight + 80px)
        // This ensures short documents have scroll room when keyboard is open
        const scrollSlack = Math.max(120, keyboardHeight + 80);

        // Only update --scroll-slack if it changed meaningfully (>= 8px threshold)
        if (Math.abs(scrollSlack - lastCommittedSlack) >= 8) {
          docEl.style.setProperty('--scroll-slack', `${scrollSlack}px`);
          lastCommittedSlack = scrollSlack;
        }

        // Keep these for backwards compatibility and debugging (cheap updates)
        docEl.style.setProperty('--app-viewport-height', `${vvHeight}px`);
        docEl.style.setProperty('--visual-viewport-height', `${vvHeight}px`);
        docEl.style.setProperty('--full-viewport-height', `${fullHeight}px`);
        docEl.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
      });
    };

    // Initial update
    updateViewportHeight();

    // Listen for viewport changes
    viewport?.addEventListener('resize', updateViewportHeight);
    viewport?.addEventListener('scroll', updateViewportHeight);
    window.addEventListener('resize', updateViewportHeight);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      viewport?.removeEventListener('resize', updateViewportHeight);
      viewport?.removeEventListener('scroll', updateViewportHeight);
      window.removeEventListener('resize', updateViewportHeight);
    };
  }, []);

  // Passive scroll correction - restore if page scrolls but don't fight with browser
  // This allows native caret tracking while preventing unwanted page-level scrolling
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Initial lock
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // Passive listener - observe but don't prevent default
    // This allows browser's native caret scroll behavior to work
    const correctScroll = () => {
      // Only correct if significantly off (>5px threshold to avoid fighting micro-adjustments)
      if (Math.abs(window.scrollY) > 5 || Math.abs(window.scrollX) > 5) {
        window.scrollTo(0, 0);
      }
    };

    // Use passive listener to avoid blocking native scroll behavior
    window.addEventListener('scroll', correctScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', correctScroll);
    };
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
    <div className="app-root" ref={motionRootRef} data-motion="idle">
      <div className="app-shell">
        <main className="app-main app-scroll-root">
          <Routes>
            <Route path="/" element={<ExtractionLab project={project} toast={toast} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <ToastContainer messages={toast.messages} onClose={toast.closeToast} />
      </div>
      <div id="overlay-root" className="overlay-root" />
    </div>
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
