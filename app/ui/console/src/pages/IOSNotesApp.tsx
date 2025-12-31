/**
 * iOS Notes App Clone
 * A pixel-perfect recreation of the native iOS Notes app
 * Mobile-first design with iPad split-view support
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './IOSNotesApp.css';

// ============================================================================
// TYPES
// ============================================================================

interface Note {
  id: string;
  folderId: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  isPinned: boolean;
}

interface Folder {
  id: string;
  name: string;
  icon: string;
  isSystem: boolean;
  parentId: string | null;
}

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEYS = {
  NOTES: 'ios-notes-app-notes',
  FOLDERS: 'ios-notes-app-folders',
};

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
}

// ============================================================================
// DEFAULT DATA
// ============================================================================

const DEFAULT_FOLDERS: Folder[] = [
  { id: 'all', name: 'All iCloud', icon: '☁️', isSystem: true, parentId: null },
  { id: 'notes', name: 'Notes', icon: '📁', isSystem: true, parentId: 'all' },
  { id: 'recently-deleted', name: 'Recently Deleted', icon: '🗑️', isSystem: true, parentId: null },
];

const DEFAULT_NOTES: Note[] = [
  {
    id: 'welcome-note',
    folderId: 'notes',
    title: 'Welcome to Notes',
    content: 'Welcome to Notes\n\nThis is your first note. Tap to edit and start writing!\n\nFeatures:\n• Create and organize notes\n• Use folders to stay organized\n• Search across all your notes\n• Pin important notes to the top',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
    isPinned: true,
  },
  {
    id: 'sample-note-2',
    folderId: 'notes',
    title: 'Shopping List',
    content: 'Shopping List\n\n☐ Milk\n☐ Bread\n☐ Eggs\n☐ Coffee\n☐ Fruits',
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 3600000,
    isPinned: false,
  },
  {
    id: 'sample-note-3',
    folderId: 'notes',
    title: 'Meeting Notes',
    content: 'Meeting Notes\n\nProject kickoff meeting\n\nAttendees:\n- Sarah\n- Mike\n- Jennifer\n\nAction items:\n1. Review requirements\n2. Set up development environment\n3. Schedule follow-up',
    createdAt: Date.now() - 259200000,
    updatedAt: Date.now() - 172800000,
    isPinned: false,
  },
  {
    id: 'sample-note-4',
    folderId: 'notes',
    title: 'Ideas',
    content: 'Ideas\n\nBrainstorming session notes:\n\n1. New app features\n2. UI improvements\n3. Performance optimizations',
    createdAt: Date.now() - 604800000, // 7 days ago
    updatedAt: Date.now() - 604800000,
    isPinned: false,
  },
  {
    id: 'sample-note-5',
    folderId: 'notes',
    title: 'Travel Plans',
    content: 'Travel Plans\n\nDestinations to consider:\n• Japan\n• Iceland\n• New Zealand',
    createdAt: Date.now() - 2592000000, // 30 days ago
    updatedAt: Date.now() - 2592000000,
    isPinned: false,
  },
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function formatDate(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
  }
}

function formatFullDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getTimeGroup(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  // Reset to start of day for comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const noteDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysDiff = Math.floor((today.getTime() - noteDay.getTime()) / 86400000);

  if (daysDiff === 0) return 'Today';
  if (daysDiff === 1) return 'Yesterday';
  if (daysDiff < 7) return 'Previous 7 Days';
  if (daysDiff < 30) return 'Previous 30 Days';

  // Return month and year for older notes
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function extractPreview(content: string): string {
  const lines = content.split('\n').filter(line => line.trim());
  const preview = lines.slice(1, 3).join(' ').trim();
  return preview || 'No additional text';
}

function extractTitle(content: string): string {
  const firstLine = content.split('\n')[0]?.trim();
  return firstLine || 'New Note';
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Hook for responsive breakpoint - SSR-safe with correct initial value
function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState(() => {
    // Check on initial render to avoid flash of incorrect layout
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return false;
  });

  useEffect(() => {
    const checkWidth = () => setIsTablet(window.innerWidth >= 768);
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  return isTablet;
}

// Hook for detecting large iPad (3-column layout)
function useIsLargeTablet(): boolean {
  const [isLargeTablet, setIsLargeTablet] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return false;
  });

  useEffect(() => {
    const checkWidth = () => setIsLargeTablet(window.innerWidth >= 1024);
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  return isLargeTablet;
}

// Hook for debounced value - prevents excessive saves
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Toast notification context and hook
interface ToastContextType {
  showToast: (message: string) => void;
}

const ToastContext = React.createContext<ToastContextType>({ showToast: () => {} });

function useToast() {
  return React.useContext(ToastContext);
}

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div className="ios-toast" role="alert" aria-live="polite">
          {toast}
        </div>
      )}
    </ToastContext.Provider>
  );
}

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  back: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M15 18l-6-6 6-6"/>
    </svg>
  ),
  chevronRight: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M9 18l6-6-6-6"/>
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
    </svg>
  ),
  moreCircle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="8" cy="12" r="1" fill="currentColor"/>
      <circle cx="12" cy="12" r="1" fill="currentColor"/>
      <circle cx="16" cy="12" r="1" fill="currentColor"/>
    </svg>
  ),
  compose: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  ),
  share: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 4l4 4-1 1-1-1-3 3v3l-1 1-3-3-4 4-1-1 4-4-3-3 1-1h3l3-3-1-1z"/>
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  sidebar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M9 3v18"/>
    </svg>
  ),
  textFormat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7V4h16v3M9 20h6M12 4v16"/>
    </svg>
  ),
  checklist: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
    </svg>
  ),
  table: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
    </svg>
  ),
  attachment: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
    </svg>
  ),
  markup: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 19l7-7 3 3-7 7-3-3z"/>
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
      <path d="M2 2l7.586 7.586"/>
      <circle cx="11" cy="11" r="2"/>
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z"/>
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  ),
  scan: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/>
      <rect x="7" y="7" width="10" height="10" rx="1"/>
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  ),
  find: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
      <path d="M11 8v6M8 11h6"/>
    </svg>
  ),
  move: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z"/>
      <path d="M12 11v6M9 14l3-3 3 3"/>
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18M3 15h18"/>
    </svg>
  ),
  print: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9V2h12v7"/>
      <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </svg>
  ),
};

// ============================================================================
// COMPONENTS
// ============================================================================

// Back Button
function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button className="ios-back-button" onClick={onClick}>
      {Icons.back}
      <span>{label}</span>
    </button>
  );
}

// Search Bar with proper touch targets
function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = useCallback(() => {
    onChange('');
    // Refocus input after clearing
    inputRef.current?.focus();
  }, [onChange]);

  return (
    <div className="ios-search-bar">
      <div className="ios-search-bar__container">
        {Icons.search}
        <input
          ref={inputRef}
          type="search"
          className="ios-search-bar__input"
          placeholder="Search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-label="Search notes"
        />
        {value && (
          <button
            className="ios-search-bar__clear"
            onClick={handleClear}
            type="button"
            aria-label="Clear search"
          >
            <span className="ios-search-bar__clear-icon">✕</span>
          </button>
        )}
      </div>
    </div>
  );
}

// Folder Row
function FolderRow({
  folder,
  noteCount,
  onClick,
}: {
  folder: Folder;
  noteCount: number;
  onClick: () => void;
}) {
  return (
    <button className="ios-folder-row" onClick={onClick}>
      <span className="ios-folder-row__icon">{folder.icon}</span>
      <span className="ios-folder-row__name">{folder.name}</span>
      <span className="ios-folder-row__count">{noteCount}</span>
      {Icons.chevronRight}
    </button>
  );
}

// Note Row with time-based grouping support and improved swipe
function NoteRow({
  note,
  folderName,
  isSelected,
  onClick,
  onDelete,
}: {
  note: Note;
  folderName?: string;
  isSelected?: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startXRef = useRef(0);
  const rowRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    const diff = e.touches[0].clientX - startXRef.current;
    if (diff < 0) {
      setSwipeX(Math.max(diff, -100));
    } else if (swipeX < 0) {
      // Allow swiping back
      setSwipeX(Math.min(0, swipeX + (e.touches[0].clientX - startXRef.current)));
    }
  };

  const handleTouchEnd = () => {
    setIsSwiping(false);
    if (swipeX < -60) {
      setSwipeX(-100);
    } else {
      setSwipeX(0);
    }
  };

  // Close swipe when clicking elsewhere
  useEffect(() => {
    if (swipeX !== 0) {
      const handleClickOutside = (e: MouseEvent) => {
        if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
          setSwipeX(0);
        }
      };
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [swipeX]);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  const handleRowClick = () => {
    if (swipeX !== 0) {
      setSwipeX(0);
    } else {
      onClick();
    }
  };

  // Keyboard navigation support
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onDelete();
    }
  }, [onClick, onDelete]);

  return (
    <div className="ios-note-row-wrapper" ref={rowRef}>
      <div
        className="ios-note-row-actions"
        style={{ opacity: Math.min(1, Math.abs(swipeX) / 80) }}
      >
        <button className="ios-note-row-actions__delete" onClick={handleDelete} aria-label="Delete note">
          {Icons.trash}
        </button>
      </div>
      <div
        className={`ios-note-row ${isSelected ? 'ios-note-row--selected' : ''} ${isSwiping ? 'ios-note-row--swiping' : ''}`}
        onClick={handleRowClick}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ transform: `translateX(${swipeX}px)` }}
        role="button"
        tabIndex={0}
        aria-label={`Open note: ${note.title || 'New Note'}`}
        aria-selected={isSelected}
      >
        {note.isPinned && (
          <div className="ios-note-row__pin" aria-label="Pinned">{Icons.pin}</div>
        )}
        <div className="ios-note-row__content">
          {/* Title on its own line */}
          <div className="ios-note-row__title">{note.title || 'New Note'}</div>
          {/* Date and preview on second line */}
          <div className="ios-note-row__subtitle">
            <span className="ios-note-row__date">{formatDate(note.updatedAt)}</span>
            <span className="ios-note-row__preview">{extractPreview(note.content)}</span>
          </div>
          {/* Folder on third line if present */}
          {folderName && (
            <div className="ios-note-row__folder">
              <span className="ios-note-row__folder-icon">📁</span>
              {folderName}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Group notes by time period
function groupNotesByTime(notes: Note[]): Map<string, Note[]> {
  const groups = new Map<string, Note[]>();

  // Sort notes by updatedAt descending
  const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);

  for (const note of sorted) {
    const group = getTimeGroup(note.updatedAt);
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push(note);
  }

  return groups;
}

// Folders Sidebar (for 3-column layout on large iPads)
function FoldersSidebar({
  folders,
  notes,
  currentFolderId,
  onSelectFolder,
  onCreateFolder,
  onToggleSidebar,
}: {
  folders: Folder[];
  notes: Note[];
  currentFolderId: string;
  onSelectFolder: (folderId: string) => void;
  onCreateFolder: () => void;
  onToggleSidebar?: () => void;
}) {
  const [searchValue, setSearchValue] = useState('');

  const icloudFolders = folders.filter(f => f.parentId === 'all' || f.id === 'all');
  const systemFolders = folders.filter(f => f.id === 'recently-deleted');

  const getNotesCount = (folderId: string): number => {
    if (folderId === 'all') {
      return notes.filter(n => n.folderId !== 'recently-deleted').length;
    }
    return notes.filter(n => n.folderId === folderId).length;
  };

  return (
    <div className="ios-folders-sidebar">
      <header className="ios-folders-sidebar__header">
        <div className="ios-folders-sidebar__header-top">
          {onToggleSidebar && (
            <button className="ios-icon-button" onClick={onToggleSidebar} aria-label="Hide folders">
              {Icons.sidebar}
            </button>
          )}
          <div className="ios-folders-sidebar__title">Folders</div>
          <button className="ios-icon-button" onClick={onCreateFolder} aria-label="New folder">
            {Icons.plus}
          </button>
        </div>
        <SearchBar value={searchValue} onChange={setSearchValue} />
      </header>

      <div className="ios-folders-sidebar__content">
        <section className="ios-folder-section ios-folder-section--compact">
          <div className="ios-folder-section__header">iCloud</div>
          <div className="ios-folder-section__list ios-folder-section__list--flush">
            {icloudFolders.map(folder => (
              <button
                key={folder.id}
                className={`ios-folder-row ios-folder-row--compact ${folder.id === currentFolderId ? 'ios-folder-row--selected' : ''}`}
                onClick={() => onSelectFolder(folder.id)}
              >
                <span className="ios-folder-row__icon">{folder.icon}</span>
                <span className="ios-folder-row__name">{folder.name}</span>
                <span className="ios-folder-row__count">{getNotesCount(folder.id)}</span>
              </button>
            ))}
          </div>
        </section>

        {systemFolders.length > 0 && (
          <section className="ios-folder-section ios-folder-section--compact">
            <div className="ios-folder-section__list ios-folder-section__list--flush">
              {systemFolders.map(folder => (
                <button
                  key={folder.id}
                  className={`ios-folder-row ios-folder-row--compact ${folder.id === currentFolderId ? 'ios-folder-row--selected' : ''}`}
                  onClick={() => onSelectFolder(folder.id)}
                >
                  <span className="ios-folder-row__icon">{folder.icon}</span>
                  <span className="ios-folder-row__name">{folder.name}</span>
                  <span className="ios-folder-row__count">{getNotesCount(folder.id)}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// Notes List Sidebar (for split view on iPad)
function NotesListSidebar({
  folder,
  notes,
  selectedNoteId,
  searchValue,
  onSearchChange,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onToggleSidebar,
  showSidebarToggle,
  showFolderInNotes = true,
}: {
  folder: Folder;
  notes: Note[];
  selectedNoteId: string | null;
  searchValue: string;
  onSearchChange: (v: string) => void;
  onSelectNote: (noteId: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (noteId: string) => void;
  onToggleSidebar?: () => void;
  showSidebarToggle?: boolean;
  showFolderInNotes?: boolean;
}) {
  const { showToast } = useToast();
  const filteredNotes = useMemo(() => {
    if (!searchValue) return notes;
    const query = searchValue.toLowerCase();
    return notes.filter(n =>
      n.title.toLowerCase().includes(query) ||
      n.content.toLowerCase().includes(query)
    );
  }, [notes, searchValue]);

  // Separate pinned notes
  const pinnedNotes = filteredNotes.filter(n => n.isPinned);
  const unpinnedNotes = filteredNotes.filter(n => !n.isPinned);

  // Group unpinned notes by time
  const groupedNotes = groupNotesByTime(unpinnedNotes);

  return (
    <div className="ios-notes-sidebar">
      <header className="ios-notes-sidebar__header">
        <div className="ios-notes-sidebar__header-top">
          {showSidebarToggle && (
            <button className="ios-icon-button" onClick={onToggleSidebar}>
              {Icons.sidebar}
            </button>
          )}
          <div className="ios-notes-sidebar__title-group">
            <div className="ios-notes-sidebar__title">{folder.name}</div>
            <div className="ios-notes-sidebar__count">{notes.length} Notes</div>
          </div>
          <button
            className="ios-icon-button ios-icon-button--circle"
            onClick={() => showToast('Folder options - Coming soon')}
            aria-label="Folder options"
          >
            {Icons.moreCircle}
          </button>
          <button className="ios-icon-button" onClick={onCreateNote}>
            {Icons.compose}
          </button>
        </div>
        <SearchBar value={searchValue} onChange={onSearchChange} />
      </header>

      <div className="ios-notes-sidebar__content">
        {filteredNotes.length === 0 ? (
          <div className="ios-empty-state">
            <div className="ios-empty-state__icon">📝</div>
            <div className="ios-empty-state__title">No Notes</div>
          </div>
        ) : (
          <>
            {/* Pinned section */}
            {pinnedNotes.length > 0 && (
              <section className="ios-notes-section">
                <div className="ios-notes-section__header">Pinned</div>
                <div className="ios-notes-section__list">
                  {pinnedNotes.map(note => (
                    <NoteRow
                      key={note.id}
                      note={note}
                      isSelected={note.id === selectedNoteId}
                      onClick={() => onSelectNote(note.id)}
                      onDelete={() => onDeleteNote(note.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Time-grouped sections */}
            {Array.from(groupedNotes.entries()).map(([timeGroup, groupNotes]) => (
              <section key={timeGroup} className="ios-notes-section">
                <div className="ios-notes-section__header">{timeGroup}</div>
                <div className="ios-notes-section__list">
                  {groupNotes.map(note => (
                    <NoteRow
                      key={note.id}
                      note={note}
                      folderName={showFolderInNotes ? 'Notes' : undefined}
                      isSelected={note.id === selectedNoteId}
                      onClick={() => onSelectNote(note.id)}
                      onDelete={() => onDeleteNote(note.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// Editor Panel with iOS-style title/body split - Rich Text Editor
function EditorPanel({
  note,
  content,
  onContentChange,
  onSave,
  onTogglePin,
  onDelete,
  onShare,
  onCreateNote,
  showBackButton,
  onBack,
  backLabel,
}: {
  note: Note | null;
  content: string;
  onContentChange: (content: string) => void;
  onSave: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onShare: () => void;
  onCreateNote?: () => void;
  showBackButton?: boolean;
  onBack?: () => void;
  backLabel?: string;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showFormatMenu, setShowFormatMenu] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [viewportOffset, setViewportOffset] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  // Track if we're initializing to prevent loops
  const isInitializingRef = useRef(false);
  const lastContentRef = useRef(content);

  // Convert plain text content to HTML for the editor
  const textToHtml = useCallback((text: string): string => {
    if (!text) return '<div class="ios-editor-title" data-placeholder="Title"></div><div class="ios-editor-body" data-placeholder="Start typing..."></div>';

    const lines = text.split('\n');
    const title = lines[0] || '';
    const bodyLines = lines.slice(1);

    // Process body lines for checklists and formatting
    const processedBody = bodyLines.map(line => {
      // Check for checklist items
      if (line.match(/^- \[[ x]\] /)) {
        const isChecked = line.match(/^- \[x\] /i);
        const text = line.replace(/^- \[[ x]\] /, '');
        return `<div class="ios-checklist-item${isChecked ? ' ios-checklist-item--checked' : ''}"><span class="ios-checkbox" contenteditable="false">${isChecked ? '☑' : '☐'}</span><span class="ios-checklist-text">${escapeHtml(text)}</span></div>`;
      }

      // Check for headings
      if (line.startsWith('### ')) {
        return `<div class="ios-subheading">${escapeHtml(line.slice(4))}</div>`;
      }
      if (line.startsWith('## ')) {
        return `<div class="ios-heading">${escapeHtml(line.slice(3))}</div>`;
      }
      if (line.startsWith('# ')) {
        return `<div class="ios-title-line">${escapeHtml(line.slice(2))}</div>`;
      }

      // Regular paragraph
      return `<div>${escapeHtml(line) || '<br>'}</div>`;
    }).join('');

    return `<div class="ios-editor-title" data-placeholder="Title">${escapeHtml(title) || ''}</div><div class="ios-editor-body" data-placeholder="Start typing...">${processedBody || '<div><br></div>'}</div>`;
  }, []);

  // Convert HTML back to plain text for storage
  const htmlToText = useCallback((html: string): string => {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    const titleEl = temp.querySelector('.ios-editor-title');
    const bodyEl = temp.querySelector('.ios-editor-body');

    const title = titleEl?.textContent || '';

    let bodyText = '';
    if (bodyEl) {
      const processNode = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent || '';
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;

          // Handle checklist items
          if (el.classList.contains('ios-checklist-item')) {
            const isChecked = el.classList.contains('ios-checklist-item--checked');
            const textEl = el.querySelector('.ios-checklist-text');
            const text = textEl?.textContent || '';
            return `- [${isChecked ? 'x' : ' '}] ${text}`;
          }

          // Handle headings
          if (el.classList.contains('ios-title-line')) {
            return `# ${el.textContent || ''}`;
          }
          if (el.classList.contains('ios-heading')) {
            return `## ${el.textContent || ''}`;
          }
          if (el.classList.contains('ios-subheading')) {
            return `### ${el.textContent || ''}`;
          }

          // Handle divs/paragraphs
          if (el.tagName === 'DIV' || el.tagName === 'P') {
            const childText = Array.from(el.childNodes).map(processNode).join('');
            return childText;
          }

          // Handle BR
          if (el.tagName === 'BR') {
            return '';
          }

          // Handle inline elements
          return el.textContent || '';
        }

        return '';
      };

      const lines: string[] = [];
      bodyEl.childNodes.forEach(node => {
        lines.push(processNode(node));
      });
      bodyText = lines.join('\n');
    }

    return title + (bodyText ? '\n' + bodyText : '');
  }, []);

  // Scroll caret into view (iOS Safari fix)
  // iOS Safari doesn't auto-scroll to keep caret visible while typing
  // Uses Range.getBoundingClientRect() directly - no DOM manipulation needed
  const scrollCaretIntoView = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!range.collapsed) return; // Only for caret, not selections

    const scrollContainer = contentRef.current;
    if (!scrollContainer) return;

    // Get caret position directly from the range - no marker needed
    const caretRect = range.getBoundingClientRect();

    // If rect is empty (can happen with collapsed range), bail out
    if (caretRect.height === 0 && caretRect.width === 0) return;

    const containerRect = scrollContainer.getBoundingClientRect();

    // Calculate where caret is relative to the container's visible area
    const caretTopInContainer = caretRect.top - containerRect.top;
    const caretBottomInContainer = caretRect.bottom - containerRect.top;

    // Visible height of container (account for what's actually visible on screen)
    const vv = window.visualViewport;
    const visibleHeight = vv
      ? Math.min(containerRect.height, vv.height - Math.max(0, containerRect.top - vv.offsetTop))
      : containerRect.height;

    // Top padding: account for header area
    const topPadding = 80;

    // Bottom padding: account for keyboard toolbar when open
    const lineHeight = 24;
    const bottomPadding = isKeyboardOpen ? (120 + lineHeight) : 60;

    // Check if caret is below visible area
    if (caretBottomInContainer > visibleHeight - bottomPadding) {
      const scrollAmount = caretBottomInContainer - visibleHeight + bottomPadding + lineHeight;
      scrollContainer.scrollTo({
        top: scrollContainer.scrollTop + scrollAmount,
        behavior: 'smooth'
      });
    }
    // Check if caret is above visible area
    else if (caretTopInContainer < topPadding) {
      const scrollAmount = caretTopInContainer - topPadding;
      scrollContainer.scrollTo({
        top: scrollContainer.scrollTop + scrollAmount,
        behavior: 'smooth'
      });
    }
  }, [isKeyboardOpen]);

  // Initialize editor content when note changes
  useEffect(() => {
    if (editorRef.current && content !== lastContentRef.current) {
      isInitializingRef.current = true;
      editorRef.current.innerHTML = textToHtml(content);
      lastContentRef.current = content;
      setTimeout(() => {
        isInitializingRef.current = false;
      }, 0);
    }
  }, [content, textToHtml]);

  // Handle input changes
  const handleInput = useCallback(() => {
    if (isInitializingRef.current || !editorRef.current) return;

    const newContent = htmlToText(editorRef.current.innerHTML);
    if (newContent !== lastContentRef.current) {
      lastContentRef.current = newContent;
      onContentChange(newContent);
    }

    // iOS Safari fix: manually scroll caret into view
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      scrollCaretIntoView();
    });
  }, [htmlToText, onContentChange, scrollCaretIntoView]);

  // Execute formatting command
  const execFormat = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  }, [handleInput]);

  // Toolbar action handlers
  const handleBold = useCallback(() => {
    execFormat('bold');
    setShowFormatMenu(false);
  }, [execFormat]);

  const handleItalic = useCallback(() => {
    execFormat('italic');
    setShowFormatMenu(false);
  }, [execFormat]);

  const handleUnderline = useCallback(() => {
    execFormat('underline');
    setShowFormatMenu(false);
  }, [execFormat]);

  const handleStrikethrough = useCallback(() => {
    execFormat('strikeThrough');
    setShowFormatMenu(false);
  }, [execFormat]);

  // Handle text style (heading levels)
  const handleTextStyle = useCallback((style: 'title' | 'heading' | 'subheading' | 'body') => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    let container = range.startContainer;

    // Find the parent div/block element
    while (container && container.nodeType !== Node.ELEMENT_NODE) {
      container = container.parentNode as Node;
    }

    // Find the closest div in the body
    let targetDiv = container as HTMLElement;
    while (targetDiv && targetDiv.parentElement && !targetDiv.parentElement.classList.contains('ios-editor-body')) {
      targetDiv = targetDiv.parentElement;
    }

    if (targetDiv && targetDiv.parentElement?.classList.contains('ios-editor-body')) {
      // Remove existing style classes
      targetDiv.classList.remove('ios-title-line', 'ios-heading', 'ios-subheading');

      // Add new style class
      switch (style) {
        case 'title':
          targetDiv.classList.add('ios-title-line');
          break;
        case 'heading':
          targetDiv.classList.add('ios-heading');
          break;
        case 'subheading':
          targetDiv.classList.add('ios-subheading');
          break;
        case 'body':
          // No class needed for body
          break;
      }

      handleInput();
    }

    setShowFormatMenu(false);
  }, [handleInput]);

  // Handle checklist
  const handleChecklist = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      // No selection, insert at end
      if (editorRef.current) {
        const bodyEl = editorRef.current.querySelector('.ios-editor-body');
        if (bodyEl) {
          const newItem = document.createElement('div');
          newItem.className = 'ios-checklist-item';
          newItem.innerHTML = '<span class="ios-checkbox" contenteditable="false">☐</span><span class="ios-checklist-text" contenteditable="true"></span>';
          bodyEl.appendChild(newItem);

          // Focus the text span
          const textSpan = newItem.querySelector('.ios-checklist-text');
          if (textSpan) {
            const range = document.createRange();
            range.selectNodeContents(textSpan);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }
    } else {
      // Convert current line to checklist
      const range = selection.getRangeAt(0);
      let container = range.startContainer;

      while (container && container.nodeType !== Node.ELEMENT_NODE) {
        container = container.parentNode as Node;
      }

      let targetDiv = container as HTMLElement;
      while (targetDiv && targetDiv.parentElement && !targetDiv.parentElement.classList.contains('ios-editor-body')) {
        targetDiv = targetDiv.parentElement;
      }

      if (targetDiv && targetDiv.parentElement?.classList.contains('ios-editor-body')) {
        const text = targetDiv.textContent || '';
        const newItem = document.createElement('div');
        newItem.className = 'ios-checklist-item';
        newItem.innerHTML = `<span class="ios-checkbox" contenteditable="false">☐</span><span class="ios-checklist-text" contenteditable="true">${escapeHtml(text)}</span>`;
        targetDiv.replaceWith(newItem);
      }
    }

    handleInput();
  }, [handleInput]);

  // Handle checkbox click
  const handleEditorClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('ios-checkbox')) {
      const item = target.closest('.ios-checklist-item');
      if (item) {
        const isChecked = item.classList.toggle('ios-checklist-item--checked');
        target.textContent = isChecked ? '☑' : '☐';
        handleInput();
      }
    }
  }, [handleInput]);

  // Handle table insertion
  const handleTable = useCallback(() => {
    const selection = window.getSelection();
    if (!editorRef.current) return;

    const bodyEl = editorRef.current.querySelector('.ios-editor-body');
    if (!bodyEl) return;

    const table = document.createElement('table');
    table.className = 'ios-table';
    table.innerHTML = `
      <thead><tr><th>Column 1</th><th>Column 2</th><th>Column 3</th></tr></thead>
      <tbody>
        <tr><td>Cell 1</td><td>Cell 2</td><td>Cell 3</td></tr>
        <tr><td>Cell 4</td><td>Cell 5</td><td>Cell 6</td></tr>
      </tbody>
    `;

    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.insertNode(table);
    } else {
      bodyEl.appendChild(table);
    }

    handleInput();
    showToast('Table inserted');
  }, [handleInput, showToast]);

  const handleAttachment = useCallback(() => {
    showToast('Attachments - Coming soon');
  }, [showToast]);

  const handleMarkup = useCallback(() => {
    showToast('Markup - Coming soon');
  }, [showToast]);

  const handleSearch = useCallback(() => {
    showToast('Search - Coming soon');
  }, [showToast]);

  // Handle key events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Handle Enter in title - move to body
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const titleEl = editorRef.current?.querySelector('.ios-editor-title');

      if (e.key === 'Enter' && titleEl?.contains(range.startContainer)) {
        e.preventDefault();
        const bodyEl = editorRef.current?.querySelector('.ios-editor-body');
        if (bodyEl) {
          const firstChild = bodyEl.firstChild;
          if (firstChild) {
            const newRange = document.createRange();
            newRange.setStart(firstChild, 0);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
        }
        return;
      }

      // Handle Enter in checklist item - create new checklist item
      if (e.key === 'Enter') {
        let container = range.startContainer;
        while (container && container.nodeType !== Node.ELEMENT_NODE) {
          container = container.parentNode as Node;
        }

        const checklistItem = (container as HTMLElement)?.closest?.('.ios-checklist-item');
        if (checklistItem) {
          e.preventDefault();
          const newItem = document.createElement('div');
          newItem.className = 'ios-checklist-item';
          newItem.innerHTML = '<span class="ios-checkbox" contenteditable="false">☐</span><span class="ios-checklist-text" contenteditable="true"></span>';
          checklistItem.after(newItem);

          const textSpan = newItem.querySelector('.ios-checklist-text');
          if (textSpan) {
            const newRange = document.createRange();
            newRange.selectNodeContents(textSpan);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
          handleInput();
          return;
        }
      }

      // Handle Backspace at start of checklist item - convert to regular div
      if (e.key === 'Backspace') {
        let container = range.startContainer;
        const textSpan = (container as HTMLElement)?.closest?.('.ios-checklist-text') ||
                         (container.parentNode as HTMLElement)?.closest?.('.ios-checklist-text');

        if (textSpan && range.startOffset === 0 && range.collapsed) {
          const checklistItem = textSpan.closest('.ios-checklist-item');
          if (checklistItem) {
            e.preventDefault();
            const text = textSpan.textContent || '';
            const newDiv = document.createElement('div');
            newDiv.textContent = text || '\u200B';
            checklistItem.replaceWith(newDiv);

            const newRange = document.createRange();
            newRange.setStart(newDiv, 0);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
            handleInput();
            return;
          }
        }
      }
    }

    // Keyboard shortcuts
    if (e.metaKey || e.ctrlKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          handleBold();
          break;
        case 'i':
          e.preventDefault();
          handleItalic();
          break;
        case 'u':
          e.preventDefault();
          handleUnderline();
          break;
      }
    }
  }, [handleBold, handleItalic, handleUnderline, handleInput]);

  // Detect keyboard open/close and adjust fixed elements
  useEffect(() => {
    if (!window.visualViewport) return;

    const viewport = window.visualViewport;

    const handleViewportChange = () => {
      const viewportHeight = viewport.height;
      const currentKeyboardHeight = window.innerHeight - viewportHeight;
      const isOpen = currentKeyboardHeight > 150;
      setIsKeyboardOpen(isOpen);
      setKeyboardHeight(isOpen ? currentKeyboardHeight : 0);

      // Track the offset from the top of the layout viewport to the visual viewport
      // This is how much iOS Safari has scrolled to keep the focused element in view
      const offset = viewport.offsetTop;
      setViewportOffset(offset);

      // Apply transform to header to keep it visible
      if (headerRef.current) {
        headerRef.current.style.transform = `translateY(${offset}px)`;
      }

      // Apply position to footer to keep it at bottom of visual viewport
      if (footerRef.current) {
        if (isOpen) {
          // Position footer at the bottom of the visual viewport
          footerRef.current.style.position = 'fixed';
          footerRef.current.style.top = `${viewport.height + offset}px`;
          footerRef.current.style.bottom = 'auto';
          footerRef.current.style.transform = 'translateY(-100%)';
        } else {
          // Reset to normal position
          footerRef.current.style.position = '';
          footerRef.current.style.top = '';
          footerRef.current.style.bottom = '';
          footerRef.current.style.transform = '';
        }
      }
    };

    viewport.addEventListener('resize', handleViewportChange);
    viewport.addEventListener('scroll', handleViewportChange);
    handleViewportChange(); // Initialize

    return () => {
      viewport.removeEventListener('resize', handleViewportChange);
      viewport.removeEventListener('scroll', handleViewportChange);
    };
  }, []);

  // iOS Safari: Listen for selection changes to scroll caret into view
  // This is more reliable than input events on iOS
  useEffect(() => {
    const handleSelectionChange = () => {
      // Only scroll if editor is focused
      if (!editorRef.current?.contains(document.activeElement) &&
          document.activeElement !== editorRef.current) {
        return;
      }
      // Debounce slightly to avoid excessive calls
      requestAnimationFrame(() => {
        scrollCaretIntoView();
      });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [scrollCaretIntoView]);

  // Auto-focus for new notes
  useEffect(() => {
    if (!note && editorRef.current) {
      const titleEl = editorRef.current.querySelector('.ios-editor-title');
      if (titleEl) {
        const range = document.createRange();
        range.selectNodeContents(titleEl);
        range.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }, [note]);

  return (
    <div className="ios-editor-panel">
      <header ref={headerRef} className="ios-editor-panel__header">
        <div className="ios-editor-panel__header-left">
          {showBackButton && onBack && (
            <BackButton onClick={onBack} label={backLabel || 'Notes'} />
          )}
        </div>

        {/* iPad toolbar icons */}
        <div className="ios-editor-panel__toolbar-center">
          <button type="button" className="ios-icon-button" aria-label="Search in note" onClick={handleSearch}>{Icons.search}</button>
          <div className="ios-format-button-wrapper">
            <button type="button" className="ios-icon-button" aria-label="Text format" onClick={() => setShowFormatMenu(!showFormatMenu)}>{Icons.textFormat}</button>
            {showFormatMenu && (
              <>
                <div className="ios-menu-backdrop" onClick={() => setShowFormatMenu(false)} />
                <div className="ios-format-menu ios-format-menu--ios" role="menu">
                  {/* Segmented control for text styles */}
                  <div className="ios-format-menu__segment-control">
                    <button
                      className="ios-format-menu__segment"
                      onClick={() => handleTextStyle('title')}
                      role="menuitem"
                    >
                      Title
                    </button>
                    <button
                      className="ios-format-menu__segment"
                      onClick={() => handleTextStyle('heading')}
                      role="menuitem"
                    >
                      Heading
                    </button>
                    <button
                      className="ios-format-menu__segment"
                      onClick={() => handleTextStyle('subheading')}
                      role="menuitem"
                    >
                      Subheading
                    </button>
                    <button
                      className="ios-format-menu__segment"
                      onClick={() => handleTextStyle('body')}
                      role="menuitem"
                    >
                      Body
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="ios-format-menu__divider" />

                  {/* Format buttons row: B I U S */}
                  <div className="ios-format-menu__buttons-row">
                    <button
                      className="ios-format-menu__format-btn"
                      onClick={handleBold}
                      role="menuitem"
                      aria-label="Bold"
                    >
                      <strong>B</strong>
                    </button>
                    <button
                      className="ios-format-menu__format-btn"
                      onClick={handleItalic}
                      role="menuitem"
                      aria-label="Italic"
                    >
                      <em>I</em>
                    </button>
                    <button
                      className="ios-format-menu__format-btn"
                      onClick={handleUnderline}
                      role="menuitem"
                      aria-label="Underline"
                    >
                      <span style={{ textDecoration: 'underline' }}>U</span>
                    </button>
                    <button
                      className="ios-format-menu__format-btn"
                      onClick={handleStrikethrough}
                      role="menuitem"
                      aria-label="Strikethrough"
                    >
                      <s>S</s>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <button type="button" className="ios-icon-button" aria-label="Checklist" onClick={handleChecklist}>{Icons.checklist}</button>
          <button type="button" className="ios-icon-button" aria-label="Table" onClick={handleTable}>{Icons.table}</button>
          <button type="button" className="ios-icon-button" aria-label="Attachment" onClick={handleAttachment}>{Icons.attachment}</button>
          <button type="button" className="ios-icon-button" aria-label="Markup" onClick={handleMarkup}>{Icons.markup}</button>
        </div>

        <div className="ios-editor-panel__header-right">
          <button type="button" className="ios-icon-button" onClick={onShare} aria-label="Share">
            {Icons.share}
          </button>
          <button
            type="button"
            className="ios-icon-button ios-icon-button--filled-circle"
            onClick={() => setShowMenu(!showMenu)}
            aria-label="More options"
            aria-expanded={showMenu}
            aria-haspopup="menu"
          >
            {Icons.moreCircle}
          </button>
        </div>
      </header>

      {showMenu && (
        <>
          <div className="ios-menu-backdrop" onClick={() => setShowMenu(false)} />
          <div className="ios-dropdown-menu ios-dropdown-menu--ios" role="menu">
            {/* Icon row at top */}
            <div className="ios-dropdown-menu__icon-row">
              <button
                className="ios-dropdown-menu__icon-btn"
                onClick={() => { showToast('Scan Document - Coming soon'); setShowMenu(false); }}
                role="menuitem"
              >
                {Icons.scan}
                <span>Scan</span>
              </button>
              <button
                className="ios-dropdown-menu__icon-btn"
                onClick={() => { onTogglePin(); setShowMenu(false); }}
                role="menuitem"
              >
                {Icons.pin}
                <span>{note?.isPinned ? 'Unpin' : 'Pin'}</span>
              </button>
              <button
                className="ios-dropdown-menu__icon-btn"
                onClick={() => { showToast('Lock Note - Coming soon'); setShowMenu(false); }}
                role="menuitem"
              >
                {Icons.lock}
                <span>Lock</span>
              </button>
            </div>

            {/* Divider */}
            <div className="ios-dropdown-menu__divider" />

            {/* Menu items */}
            <button
              className="ios-dropdown-menu__item"
              onClick={() => { showToast('Find in Note - Coming soon'); setShowMenu(false); }}
              role="menuitem"
            >
              {Icons.search}
              Find in Note
            </button>
            <button
              className="ios-dropdown-menu__item"
              onClick={() => { showToast('Move Note - Coming soon'); setShowMenu(false); }}
              role="menuitem"
            >
              {Icons.move}
              Move Note
            </button>
            <button
              className="ios-dropdown-menu__item"
              onClick={() => { showToast('Lines & Grids - Coming soon'); setShowMenu(false); }}
              role="menuitem"
            >
              {Icons.grid}
              Lines & Grids
            </button>

            {/* Divider */}
            <div className="ios-dropdown-menu__divider" />

            <button
              className="ios-dropdown-menu__item"
              onClick={() => { onShare(); setShowMenu(false); }}
              role="menuitem"
            >
              {Icons.share}
              Share Note
            </button>
            <button
              className="ios-dropdown-menu__item"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(content);
                  showToast('Copied to clipboard');
                } catch {
                  // Fallback for older browsers
                  const el = document.createElement('textarea');
                  el.value = content;
                  el.style.position = 'fixed';
                  el.style.opacity = '0';
                  document.body.appendChild(el);
                  el.select();
                  document.execCommand('copy');
                  document.body.removeChild(el);
                  showToast('Copied to clipboard');
                }
                setShowMenu(false);
              }}
              role="menuitem"
            >
              {Icons.copy}
              Send a Copy
            </button>
            <button
              className="ios-dropdown-menu__item"
              onClick={() => { showToast('Print - Coming soon'); setShowMenu(false); }}
              role="menuitem"
            >
              {Icons.print}
              Print
            </button>

            {/* Divider */}
            <div className="ios-dropdown-menu__divider" />

            <button
              className="ios-dropdown-menu__item ios-dropdown-menu__item--danger"
              onClick={() => { onDelete(); setShowMenu(false); }}
              role="menuitem"
            >
              {Icons.trash}
              Delete
            </button>
          </div>
        </>
      )}

      <div
        className="ios-editor-panel__content"
        ref={contentRef}
        style={{
          // When keyboard is open, add padding to create scrollable space
          // This allows the caret to scroll into view above the keyboard
          paddingBottom: isKeyboardOpen ? `${keyboardHeight}px` : undefined
        }}
      >
        {note && (
          <div className="ios-editor-panel__date">
            {formatFullDate(note.updatedAt)}
          </div>
        )}
        {/* Rich text editor using contenteditable */}
        <div
          ref={editorRef}
          className="ios-rich-editor"
          contentEditable
          onInput={handleInput}
          onClick={handleEditorClick}
          onKeyDown={handleKeyDown}
          onBlur={onSave}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Note content"
        />
      </div>

      {/* Keyboard accessory toolbar - shows when keyboard is open, positioned above keyboard */}
      {isKeyboardOpen && (
        <div
          className="ios-editor-panel__keyboard-toolbar"
          role="toolbar"
          aria-label="Text formatting"
          style={{ bottom: `${keyboardHeight}px` }}
        >
          <button type="button" className="ios-toolbar-button" aria-label="Checklist" onClick={handleChecklist}>{Icons.checklist}</button>
          <button type="button" className="ios-toolbar-button" aria-label="Bold" onClick={handleBold}><strong>B</strong></button>
          <button type="button" className="ios-toolbar-button" aria-label="Italic" onClick={handleItalic}><em>I</em></button>
          <button type="button" className="ios-toolbar-button" aria-label="Table" onClick={handleTable}>{Icons.table}</button>
          <div className="ios-keyboard-toolbar__spacer" />
          <button
            type="button"
            className="ios-toolbar-button ios-toolbar-button--done"
            onClick={() => editorRef.current?.blur()}
            aria-label="Dismiss keyboard"
          >
            Done
          </button>
        </div>
      )}

      {/* Mobile bottom toolbar - hidden when keyboard is open */}
      <footer ref={footerRef} className={`ios-editor-panel__footer ${isKeyboardOpen ? 'ios-editor-panel__footer--hidden' : ''}`} role="toolbar" aria-label="Note actions">
        <button type="button" className="ios-toolbar-button" aria-label="Checklist" onClick={handleChecklist}>{Icons.checklist}</button>
        <button type="button" className="ios-toolbar-button" aria-label="Bold" onClick={handleBold}><strong>B</strong></button>
        <button type="button" className="ios-toolbar-button" aria-label="Attachment" onClick={handleAttachment}>{Icons.attachment}</button>
        <button type="button" className="ios-toolbar-button" aria-label="Markup" onClick={handleMarkup}>{Icons.markup}</button>
        <button type="button" className="ios-compose-button ios-compose-button--prominent" aria-label="Create new note" onClick={onCreateNote}>{Icons.compose}</button>
      </footer>
    </div>
  );
}

// Folders View (mobile only)
function FoldersView({
  folders,
  notes,
  onSelectFolder,
  onCreateFolder,
}: {
  folders: Folder[];
  notes: Note[];
  onSelectFolder: (folderId: string) => void;
  onCreateFolder: () => void;
}) {
  const [searchValue, setSearchValue] = useState('');

  const icloudFolders = folders.filter(f => f.parentId === 'all' || f.id === 'all');
  const systemFolders = folders.filter(f => f.id === 'recently-deleted');

  const getNotesCount = (folderId: string): number => {
    if (folderId === 'all') {
      return notes.filter(n => n.folderId !== 'recently-deleted').length;
    }
    return notes.filter(n => n.folderId === folderId).length;
  };

  return (
    <div className="ios-folders-view">
      <header className="ios-header ios-header--large">
        <div className="ios-header__nav">
          <div className="ios-header__left" />
          <div className="ios-header__right">
            <button className="ios-icon-button" onClick={onCreateFolder}>
              {Icons.plus}
            </button>
          </div>
        </div>
        <div className="ios-header__large-title">Folders</div>
        <SearchBar value={searchValue} onChange={setSearchValue} />
      </header>

      <div className="ios-folders-view__content">
        <section className="ios-folder-section">
          <div className="ios-folder-section__header">iCloud</div>
          <div className="ios-folder-section__list">
            {icloudFolders.map(folder => (
              <FolderRow
                key={folder.id}
                folder={folder}
                noteCount={getNotesCount(folder.id)}
                onClick={() => onSelectFolder(folder.id)}
              />
            ))}
          </div>
        </section>

        {systemFolders.length > 0 && (
          <section className="ios-folder-section">
            <div className="ios-folder-section__list">
              {systemFolders.map(folder => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  noteCount={getNotesCount(folder.id)}
                  onClick={() => onSelectFolder(folder.id)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export function IOSNotesApp() {
  const isTablet = useIsTablet();
  const isLargeTablet = useIsLargeTablet();

  const [folders, setFolders] = useState<Folder[]>(() =>
    loadFromStorage(STORAGE_KEYS.FOLDERS, DEFAULT_FOLDERS)
  );
  const [notes, setNotes] = useState<Note[]>(() =>
    loadFromStorage(STORAGE_KEYS.NOTES, DEFAULT_NOTES)
  );

  // Mobile navigation state
  const [mobileView, setMobileView] = useState<'folders' | 'notes' | 'editor'>('folders');

  // Shared state
  const [currentFolderId, setCurrentFolderId] = useState<string>('all');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [showFoldersSidebar, setShowFoldersSidebar] = useState(true);
  const [showNotesSidebar, setShowNotesSidebar] = useState(true);

  // Get current folder and notes
  const currentFolder = folders.find(f => f.id === currentFolderId) || folders[0];
  const folderNotes = useMemo(() => {
    if (currentFolderId === 'all') {
      return notes.filter(n => n.folderId !== 'recently-deleted');
    }
    return notes.filter(n => n.folderId === currentFolderId);
  }, [notes, currentFolderId]);

  const selectedNote = selectedNoteId ? notes.find(n => n.id === selectedNoteId) || null : null;

  // Persist to storage
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.FOLDERS, folders);
  }, [folders]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.NOTES, notes);
  }, [notes]);

  // Sync editor content with selected note
  useEffect(() => {
    setEditorContent(selectedNote?.content || '');
  }, [selectedNote?.id]);

  // Track previous note ID to prevent saving stale content when switching
  const previousNoteIdRef = useRef<string | null>(null);
  const isInitialMountRef = useRef(true);

  // Update ref when selected note changes
  useEffect(() => {
    // Skip initial mount
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      previousNoteIdRef.current = selectedNoteId;
      return;
    }
    // When note changes, update the ref after a delay to prevent stale saves
    const timer = setTimeout(() => {
      previousNoteIdRef.current = selectedNoteId;
    }, 100);
    return () => clearTimeout(timer);
  }, [selectedNoteId]);

  // Auto-select first note on tablet if none selected
  useEffect(() => {
    if (isTablet && !selectedNoteId && folderNotes.length > 0) {
      const firstNote = folderNotes.find(n => n.isPinned) || folderNotes[0];
      setSelectedNoteId(firstNote.id);
    }
  }, [isTablet, selectedNoteId, folderNotes]);

  // Handlers
  const handleSelectFolder = useCallback((folderId: string) => {
    setCurrentFolderId(folderId);
    setSelectedNoteId(null);
    setMobileView('notes');
  }, []);

  const handleSelectNote = useCallback((noteId: string) => {
    setSelectedNoteId(noteId);
    setMobileView('editor');
  }, []);

  const handleCreateNote = useCallback(() => {
    const newNote: Note = {
      id: generateId(),
      folderId: currentFolderId === 'all' ? 'notes' : currentFolderId,
      title: '',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPinned: false,
    };
    setNotes(prev => [newNote, ...prev]);
    setSelectedNoteId(newNote.id);
    setEditorContent('');
    setMobileView('editor');
  }, [currentFolderId]);

  const handleSaveNote = useCallback(() => {
    if (!selectedNoteId) return;

    // Check if note is empty (just whitespace)
    const trimmedContent = editorContent.trim();
    if (!trimmedContent) {
      // Delete empty notes instead of saving them
      setNotes(prev => prev.filter(n => n.id !== selectedNoteId));
      return;
    }

    const title = extractTitle(editorContent);
    setNotes(prev => prev.map(n =>
      n.id === selectedNoteId
        ? { ...n, content: editorContent, title, updatedAt: Date.now() }
        : n
    ));
  }, [selectedNoteId, editorContent]);

  // Debounced auto-save while typing
  const debouncedContent = useDebounce(editorContent, 1000);
  useEffect(() => {
    // Don't save if:
    // 1. No note selected
    // 2. Content is empty
    // 3. We just switched notes (selectedNoteId doesn't match previous)
    if (!selectedNoteId || !debouncedContent) return;
    if (previousNoteIdRef.current !== selectedNoteId) return;

    // Also verify the content actually belongs to this note (matches current note's content pattern)
    const currentNote = notes.find(n => n.id === selectedNoteId);
    if (!currentNote) return;

    // Only save if content has actually changed
    if (currentNote.content === debouncedContent) return;

    const title = extractTitle(debouncedContent);
    setNotes(prev => prev.map(n =>
      n.id === selectedNoteId
        ? { ...n, content: debouncedContent, title, updatedAt: Date.now() }
        : n
    ));
  }, [selectedNoteId, debouncedContent, notes]);

  const handleDeleteNote = useCallback((noteId: string) => {
    setNotes(prev => prev.filter(n => n.id !== noteId));
    if (selectedNoteId === noteId) {
      setSelectedNoteId(null);
      if (!isTablet) {
        setMobileView('notes');
      }
    }
  }, [selectedNoteId, isTablet]);

  const handleTogglePin = useCallback(() => {
    if (!selectedNoteId) return;
    setNotes(prev => prev.map(n =>
      n.id === selectedNoteId
        ? { ...n, isPinned: !n.isPinned }
        : n
    ));
  }, [selectedNoteId]);

  const handleShare = useCallback(async () => {
    if (navigator.share && editorContent) {
      try {
        await navigator.share({
          title: extractTitle(editorContent),
          text: editorContent,
        });
      } catch (e) {
        // User cancelled
      }
    }
  }, [editorContent]);

  const handleCreateFolder = useCallback(() => {
    const name = prompt('Enter folder name:');
    if (name?.trim()) {
      const newFolder: Folder = {
        id: `folder-${Date.now()}`,
        name: name.trim(),
        icon: '📁',
        isSystem: false,
        parentId: 'all',
      };
      setFolders(prev => [...prev, newFolder]);
    }
  }, []);

  const handleMobileBack = useCallback(() => {
    if (mobileView === 'editor') {
      handleSaveNote();
      setMobileView('notes');
    } else if (mobileView === 'notes') {
      setMobileView('folders');
    }
  }, [mobileView, handleSaveNote]);

  // =========================================================================
  // RENDER
  // =========================================================================

  // Handle folder selection for 3-column layout
  const handleFolderSelect = useCallback((folderId: string) => {
    setCurrentFolderId(folderId);
    // Don't clear selected note - keep it selected
  }, []);

  // LARGE TABLET LAYOUT: 3-column view (Folders | Notes | Editor)
  if (isLargeTablet) {
    return (
      <ToastProvider>
        <div className={`ios-notes-app ios-notes-app--large-tablet ${!showFoldersSidebar ? 'ios-notes-app--folders-hidden' : ''} ${!showNotesSidebar ? 'ios-notes-app--notes-hidden' : ''}`}>
          {showFoldersSidebar && (
            <FoldersSidebar
              folders={folders}
              notes={notes}
              currentFolderId={currentFolderId}
              onSelectFolder={handleFolderSelect}
              onCreateFolder={handleCreateFolder}
              onToggleSidebar={() => setShowFoldersSidebar(false)}
            />
          )}

          {showNotesSidebar && (
            <NotesListSidebar
              folder={currentFolder}
              notes={folderNotes}
              selectedNoteId={selectedNoteId}
              searchValue={searchValue}
              onSearchChange={setSearchValue}
              onSelectNote={handleSelectNote}
              onCreateNote={handleCreateNote}
              onDeleteNote={handleDeleteNote}
              onToggleSidebar={() => setShowNotesSidebar(false)}
              showSidebarToggle
              showFolderInNotes={currentFolderId === 'all'}
            />
          )}

          <EditorPanel
            note={selectedNote}
            content={editorContent}
            onContentChange={setEditorContent}
            onSave={handleSaveNote}
            onTogglePin={handleTogglePin}
            onDelete={() => selectedNoteId && handleDeleteNote(selectedNoteId)}
            onShare={handleShare}
            onCreateNote={handleCreateNote}
            showBackButton={!showFoldersSidebar || !showNotesSidebar}
            onBack={() => { setShowFoldersSidebar(true); setShowNotesSidebar(true); }}
            backLabel={!showFoldersSidebar ? 'Folders' : currentFolder.name}
          />
        </div>
      </ToastProvider>
    );
  }

  // TABLET LAYOUT: Split view (2 columns)
  if (isTablet) {
    return (
      <ToastProvider>
        <div className="ios-notes-app ios-notes-app--tablet">
          {showSidebar && (
            <NotesListSidebar
              folder={currentFolder}
              notes={folderNotes}
              selectedNoteId={selectedNoteId}
              searchValue={searchValue}
              onSearchChange={setSearchValue}
              onSelectNote={handleSelectNote}
              onCreateNote={handleCreateNote}
              onDeleteNote={handleDeleteNote}
              onToggleSidebar={() => setShowSidebar(false)}
              showSidebarToggle
            />
          )}

          <EditorPanel
            note={selectedNote}
            content={editorContent}
            onContentChange={setEditorContent}
            onSave={handleSaveNote}
            onTogglePin={handleTogglePin}
            onDelete={() => selectedNoteId && handleDeleteNote(selectedNoteId)}
            onShare={handleShare}
            onCreateNote={handleCreateNote}
            showBackButton={!showSidebar}
            onBack={() => setShowSidebar(true)}
            backLabel={currentFolder.name}
          />
        </div>
      </ToastProvider>
    );
  }

  // MOBILE LAYOUT: Stacked navigation
  return (
    <ToastProvider>
      <div className="ios-notes-app ios-notes-app--mobile">
        {mobileView === 'folders' && (
          <FoldersView
            folders={folders}
            notes={notes}
            onSelectFolder={handleSelectFolder}
            onCreateFolder={handleCreateFolder}
          />
        )}

        {mobileView === 'notes' && (
          <div className="ios-notes-list-view">
            <header className="ios-header ios-header--large">
              <div className="ios-header__nav">
                <div className="ios-header__left">
                  <BackButton onClick={handleMobileBack} label="Folders" />
                </div>
                <div className="ios-header__right">
                  <button className="ios-icon-button">{Icons.more}</button>
                </div>
              </div>
              <div className="ios-header__large-title">{currentFolder.name}</div>
              <SearchBar value={searchValue} onChange={setSearchValue} />
            </header>

            <div className="ios-notes-list-view__content">
              <NotesListContent
                notes={folderNotes}
                searchValue={searchValue}
                selectedNoteId={selectedNoteId}
                onSelectNote={handleSelectNote}
                onDeleteNote={handleDeleteNote}
              />
            </div>

            <footer className="ios-notes-list-footer">
              <span className="ios-notes-list-footer__count">
                {folderNotes.length} {folderNotes.length === 1 ? 'Note' : 'Notes'}
              </span>
              <button className="ios-compose-button" onClick={handleCreateNote}>
                {Icons.compose}
              </button>
            </footer>
          </div>
        )}

        {mobileView === 'editor' && (
          <EditorPanel
            note={selectedNote}
            content={editorContent}
            onContentChange={setEditorContent}
            onSave={handleSaveNote}
            onTogglePin={handleTogglePin}
            onDelete={() => selectedNoteId && handleDeleteNote(selectedNoteId)}
            onShare={handleShare}
            onCreateNote={handleCreateNote}
            showBackButton
            onBack={handleMobileBack}
            backLabel={currentFolder.name}
          />
        )}
      </div>
    </ToastProvider>
  );
}

// Helper component for notes list content
function NotesListContent({
  notes,
  searchValue,
  selectedNoteId,
  onSelectNote,
  onDeleteNote,
}: {
  notes: Note[];
  searchValue: string;
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
}) {
  const filteredNotes = useMemo(() => {
    if (!searchValue) return notes;
    const query = searchValue.toLowerCase();
    return notes.filter(n =>
      n.title.toLowerCase().includes(query) ||
      n.content.toLowerCase().includes(query)
    );
  }, [notes, searchValue]);

  const pinnedNotes = filteredNotes.filter(n => n.isPinned);
  const unpinnedNotes = filteredNotes.filter(n => !n.isPinned);
  const groupedNotes = groupNotesByTime(unpinnedNotes);

  if (filteredNotes.length === 0) {
    return (
      <div className="ios-empty-state">
        <div className="ios-empty-state__icon">📝</div>
        <div className="ios-empty-state__title">No Notes</div>
        <div className="ios-empty-state__subtitle">
          {searchValue ? 'No notes match your search' : 'Tap the compose button to create a note'}
        </div>
      </div>
    );
  }

  return (
    <>
      {pinnedNotes.length > 0 && (
        <section className="ios-notes-section">
          <div className="ios-notes-section__header">Pinned</div>
          <div className="ios-notes-section__list">
            {pinnedNotes.map(note => (
              <NoteRow
                key={note.id}
                note={note}
                isSelected={note.id === selectedNoteId}
                onClick={() => onSelectNote(note.id)}
                onDelete={() => onDeleteNote(note.id)}
              />
            ))}
          </div>
        </section>
      )}

      {Array.from(groupedNotes.entries()).map(([timeGroup, groupNotes]) => (
        <section key={timeGroup} className="ios-notes-section">
          <div className="ios-notes-section__header">{timeGroup}</div>
          <div className="ios-notes-section__list">
            {groupNotes.map(note => (
              <NoteRow
                key={note.id}
                note={note}
                folderName="Notes"
                isSelected={note.id === selectedNoteId}
                onClick={() => onSelectNote(note.id)}
                onDelete={() => onDeleteNote(note.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export default IOSNotesApp;
