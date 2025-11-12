/**
 * Minimal ARES Console Shell
 * Focused on Notes + Entities workflows
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { useToast, ToastContainer } from './components/Toast';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotesPage } from './pages/NotesPage';
import { EntitiesPage } from './pages/EntitiesPage';
import { RelationsPage } from './pages/RelationsPage';
import { GraphPage } from './pages/GraphPage';
import { UnifiedHomePage } from './pages/UnifiedHomePage';
import { ExtractionLab } from './pages/ExtractionLab';
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
        borderBottom: '1px solid #e5e7eb',
        background: '#ffffff',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontSize: '18px', fontWeight: 600, color: '#111827' }}>ARES Workspace</span>
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
                  background: isActive ? '#1d4ed8' : '#f3f4f6',
                  color: isActive ? '#ffffff' : '#4b5563',
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
        <label style={{ fontSize: '13px', color: '#6b7280' }}>Project</label>
        <input
          type="text"
          value={project}
          onChange={e => onProjectChange(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '14px',
            width: '140px',
          }}
        />
      </div>
    </header>
  );
}

function AppShell() {
  const [project] = useState<string>(() => loadState('project', 'default'));
  const toast = useToast();
  const location = useLocation();

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

  return (
    <>
      <main style={{ minHeight: '100vh', background: '#ffffff' }}>
        <Routes>
          <Route path="/" element={<ExtractionLab project={project} toast={toast} />} />
          <Route path="/lab" element={<UnifiedHomePage project={project} toast={toast} />} />
          <Route path="/notes" element={<NotesPage project={project} toast={toast} />} />
          <Route path="/entities" element={<EntitiesPage project={project} toast={toast} />} />
          <Route path="/relations" element={<RelationsPage project={project} toast={toast} />} />
          <Route path="/graph" element={<GraphPage project={project} toast={toast} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <ToastContainer messages={toast.messages} onClose={toast.closeToast} />
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
