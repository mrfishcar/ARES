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
  // FIX: Enhanced scroll-slack calculation to prevent text prompt sticking on iOS keyboard events
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
        const keyboardHeight = Math.max(0, fullHeight - vvHeight);

        // Only update --vvh if it changed meaningfully (>= 8px threshold)
        if (Math.abs(vvHeight - lastCommittedVVH) >= 8) {
          docEl.style.setProperty('--vvh', `${vvHeight}px`);
          lastCommittedVVH = vvHeight;
        }

        // FIX: Enhanced scroll slack calculation
        // - When keyboard is closed (keyboardHeight < 10px): use minimum 120px
        // - When keyboard is open: use max(180px, keyboardHeight + 100px)
        // - Added 20px extra buffer to ensure text prompt never sticks to bottom
        const isKeyboardOpen = keyboardHeight > 10;
        const scrollSlack = isKeyboardOpen 
          ? Math.max(180, keyboardHeight + 100)  // Keyboard open: ensure ample scroll room
          : 120;  // Keyboard closed: use default minimum

        // Update --scroll-slack if it changed meaningfully (>= 8px threshold)
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

    // Listen for viewport changes - added 'scroll' for iOS keyboard show/hide edge cases
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

  // NUCLEAR: Prevent ALL page scrolling
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Lock scroll position at 0,0
    const preventScroll = (e: Event) => {
      window.scrollTo(0, 0);
      e.preventDefault();
    };

    // Prevent scroll events
    const preventScrollEvent = () => {
      window.scrollTo(0, 0);
    };

    // Prevent touch scrolling on document
    const preventTouchMove = (e: TouchEvent) => {
      // Allow scrolling within editor, block everywhere else
      const target = e.target as HTMLElement;
      const isEditorScroll = target.closest('.editor-panel') || target.closest('.rich-editor-surface');

      console.log('[TouchPrevention] touchmove', {
        target: target.className,
        isEditorScroll,
        willPrevent: !isEditorScroll
      });

      if (!isEditorScroll) {
        e.preventDefault();
        console.log('[TouchPrevention] ❌ Prevented touch scroll (outside editor)');
      } else {
        console.log('[TouchPrevention] ✅ Allowing editor scroll');
      }
    };

    // Lock scroll position
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // Prevent all scroll attempts
    window.addEventListener('scroll', preventScrollEvent, { passive: false });
    window.addEventListener('touchmove', preventTouchMove, { passive: false });
    document.addEventListener('scroll', preventScrollEvent, { passive: false });
    document.addEventListener('touchmove', preventTouchMove, { passive: false });

    // Re-lock every 100ms as backup
    const lockInterval = setInterval(() => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
    }, 100);

    return () => {
      window.removeEventListener('scroll', preventScrollEvent);
      window.removeEventListener('touchmove', preventTouchMove);
      document.removeEventListener('scroll', preventScrollEvent);
      document.removeEventListener('touchmove', preventTouchMove);
      clearInterval(lockInterval);
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
