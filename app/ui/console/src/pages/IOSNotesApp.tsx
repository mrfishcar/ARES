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

// Hook for responsive breakpoint
function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const checkWidth = () => setIsTablet(window.innerWidth >= 768);
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  return isTablet;
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

// Search Bar
function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="ios-search-bar">
      <div className="ios-search-bar__container">
        {Icons.search}
        <input
          type="text"
          className="ios-search-bar__input"
          placeholder="Search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button className="ios-search-bar__clear" onClick={() => onChange('')}>
            ✕
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

// Note Row with time-based grouping support
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

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    const diff = e.touches[0].clientX - startXRef.current;
    if (diff < 0) {
      setSwipeX(Math.max(diff, -100));
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

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <div className="ios-note-row-wrapper">
      <div
        className="ios-note-row-actions"
        style={{ opacity: Math.min(1, Math.abs(swipeX) / 80) }}
      >
        <button className="ios-note-row-actions__delete" onClick={handleDelete}>
          {Icons.trash}
        </button>
      </div>
      <div
        className={`ios-note-row ${isSelected ? 'ios-note-row--selected' : ''}`}
        onClick={onClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ transform: `translateX(${swipeX}px)` }}
      >
        {note.isPinned && (
          <div className="ios-note-row__pin">{Icons.pin}</div>
        )}
        <div className="ios-note-row__content">
          <div className="ios-note-row__title">{note.title || 'New Note'}</div>
          <div className="ios-note-row__meta">
            <span className="ios-note-row__date">{formatDate(note.updatedAt)}</span>
            <span className="ios-note-row__preview">{extractPreview(note.content)}</span>
          </div>
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
}) {
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
          <button className="ios-icon-button ios-icon-button--circle">
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
        )}
      </div>
    </div>
  );
}

// Editor Panel
function EditorPanel({
  note,
  content,
  onContentChange,
  onSave,
  onTogglePin,
  onDelete,
  onShare,
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
  showBackButton?: boolean;
  onBack?: () => void;
  backLabel?: string;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current && !note) {
      textareaRef.current.focus();
    }
  }, [note]);

  return (
    <div className="ios-editor-panel">
      <header className="ios-editor-panel__header">
        <div className="ios-editor-panel__header-left">
          {showBackButton && onBack && (
            <BackButton onClick={onBack} label={backLabel || 'Notes'} />
          )}
        </div>

        {/* iPad toolbar icons */}
        <div className="ios-editor-panel__toolbar-center">
          <button className="ios-icon-button">{Icons.textFormat}</button>
          <button className="ios-icon-button">{Icons.checklist}</button>
          <button className="ios-icon-button">{Icons.table}</button>
          <button className="ios-icon-button">{Icons.attachment}</button>
          <button className="ios-icon-button">{Icons.markup}</button>
        </div>

        <div className="ios-editor-panel__header-right">
          <button className="ios-icon-button" onClick={onShare}>
            {Icons.share}
          </button>
          <button
            className="ios-icon-button"
            onClick={() => setShowMenu(!showMenu)}
          >
            {Icons.more}
          </button>
        </div>
      </header>

      {showMenu && (
        <>
          <div className="ios-menu-backdrop" onClick={() => setShowMenu(false)} />
          <div className="ios-dropdown-menu">
            <button className="ios-dropdown-menu__item" onClick={() => { onTogglePin(); setShowMenu(false); }}>
              {Icons.pin}
              {note?.isPinned ? 'Unpin Note' : 'Pin Note'}
            </button>
            <button className="ios-dropdown-menu__item" onClick={() => { navigator.clipboard.writeText(content); setShowMenu(false); }}>
              {Icons.copy}
              Copy
            </button>
            <button className="ios-dropdown-menu__item ios-dropdown-menu__item--danger" onClick={() => { onDelete(); setShowMenu(false); }}>
              {Icons.trash}
              Delete
            </button>
          </div>
        </>
      )}

      <div className="ios-editor-panel__content">
        {note && (
          <div className="ios-editor-panel__date">
            {formatFullDate(note.updatedAt)}
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="ios-editor-panel__textarea"
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder="Start typing..."
          autoFocus={!note}
          onBlur={onSave}
        />
      </div>

      {/* Mobile bottom toolbar */}
      <footer className="ios-editor-panel__footer">
        <button className="ios-toolbar-button">{Icons.checklist}</button>
        <button className="ios-toolbar-button">{Icons.textFormat}</button>
        <button className="ios-toolbar-button">{Icons.attachment}</button>
        <button className="ios-toolbar-button">{Icons.markup}</button>
        <button className="ios-toolbar-button">{Icons.compose}</button>
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

    const title = extractTitle(editorContent);
    setNotes(prev => prev.map(n =>
      n.id === selectedNoteId
        ? { ...n, content: editorContent, title, updatedAt: Date.now() }
        : n
    ));
  }, [selectedNoteId, editorContent]);

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

  // TABLET LAYOUT: Split view
  if (isTablet) {
    return (
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
          showBackButton={!showSidebar}
          onBack={() => setShowSidebar(true)}
          backLabel={currentFolder.name}
        />
      </div>
    );
  }

  // MOBILE LAYOUT: Stacked navigation
  return (
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
          showBackButton
          onBack={handleMobileBack}
          backLabel={currentFolder.name}
        />
      )}
    </div>
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
