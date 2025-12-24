/**
 * Minimal ARES Console Shell
 * Focused on Notes + Entities workflows
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useToast, ToastContainer } from './components/Toast';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotesPage } from './pages/NotesPage';
import { EntitiesPage } from './pages/EntitiesPage';
import { RelationsPage } from './pages/RelationsPage';
import { GraphPage } from './pages/GraphPage';
import { UnifiedHomePage } from './pages/UnifiedHomePage';
import { ExtractionLab } from './pages/ExtractionLab';
import { BookNLPPage } from './pages/BookNLPPage';
import { loadState, saveState } from './lib/storage';
import { initializeClientErrorLogger } from './lib/errorLogger';

type NavItem = {
  path: string;
  label: string;
};

function _Navigation({
  items,
  activePath,
  onNavigate,
  project,
  onProjectChange,
}: {
  items: NavItem[];
  activePath: string;
  onNavigate: (path: string) => void;
  project: string;
  onProjectChange: (value: string) => void;
}) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 28px',
        borderBottom: '1px solid var(--border-soft)',
        background: 'var(--bg-secondary)',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
          ARES Workspace
        </span>
        <nav style={{ display: 'flex', gap: '8px' }}>
          {items.map(item => {
            const isActive = activePath === item.path;
            return (
              <button
                key={item.path}
                onClick={() => onNavigate(item.path)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  border: 'none',
                  background: isActive ? '#1d4ed8' : 'var(--bg-tertiary)',
                  color: isActive ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Project</label>
        <input
          type="text"
          value={project}
          onChange={e => onProjectChange(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border-soft)',
            fontSize: '14px',
            width: '140px',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
          }}
        />
      </div>
    </header>
  );
}

// Global focus/selection debug instrumentation
const DEBUG_EDITOR_FOCUS =
  (typeof window !== 'undefined' && (window as any).ARES_DEBUG_EDITOR_FOCUS) ||
  import.meta.env.VITE_DEBUG_EDITOR_FOCUS === 'true';

function AppShell() {
  const [project] = useState<string>(() => loadState('project', 'default'));
  const toast = useToast();
  const location = useLocation();
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

  // iOS viewport height tracking + visual viewport adjustment
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const docEl = document.documentElement;
    const viewport = window.visualViewport;

    const updateViewportHeight = () => {
      const height = viewport?.height ?? window.innerHeight;
      const fullHeight = window.innerHeight;

      // Set both actual viewport height and visual viewport height
      docEl.style.setProperty('--app-viewport-height', `${height}px`);
      docEl.style.setProperty('--visual-viewport-height', `${height}px`);
      docEl.style.setProperty('--full-viewport-height', `${fullHeight}px`);

      // Calculate keyboard height for debugging
      const keyboardHeight = fullHeight - height;
      docEl.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
    };

    updateViewportHeight();
    viewport?.addEventListener('resize', updateViewportHeight);
    viewport?.addEventListener('scroll', updateViewportHeight);
    window.addEventListener('resize', updateViewportHeight);

    return () => {
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
      if (!isEditorScroll) {
        e.preventDefault();
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

  const navItems = useMemo<NavItem[]>(
    () => [
      { path: '/notes', label: 'Notes' },
      { path: '/entities', label: 'Entities' },
    ],
    []
  );

  useEffect(() => {
    saveState('project', project);
  }, [project]);

  useEffect(() => {
    const cleanup = initializeClientErrorLogger(project);
    return () => {
      if (cleanup) cleanup();
    };
  }, [project]);

  const _activePath = navItems.some(item => item.path === location.pathname)
    ? location.pathname
    : '/notes';

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
            <Route path="/lab" element={<UnifiedHomePage project={project} toast={toast} />} />
            <Route path="/notes" element={<NotesPage project={project} toast={toast} />} />
            <Route path="/entities" element={<EntitiesPage project={project} toast={toast} />} />
            <Route path="/relations" element={<RelationsPage project={project} toast={toast} />} />
            <Route path="/graph" element={<GraphPage project={project} toast={toast} />} />
            <Route path="/booknlp" element={<BookNLPPage />} />
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
