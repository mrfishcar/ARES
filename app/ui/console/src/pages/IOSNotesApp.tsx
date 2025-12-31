/**
 * iOS Notes App Clone
 * A pixel-perfect recreation of the native iOS Notes app
 * Mobile-first design with authentic iOS styling
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

type ViewState =
  | { type: 'folders' }
  | { type: 'notes'; folderId: string }
  | { type: 'editor'; noteId: string | null; folderId: string }
  | { type: 'search' };

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
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
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

// ============================================================================
// COMPONENTS
// ============================================================================

// Header Component
function IOSHeader({
  title,
  leftButton,
  rightButton,
  isLargeTitle = false,
  searchValue,
  onSearchChange,
  showSearch = false,
}: {
  title: string;
  leftButton?: React.ReactNode;
  rightButton?: React.ReactNode;
  isLargeTitle?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  showSearch?: boolean;
}) {
  return (
    <header className={`ios-header ${isLargeTitle ? 'ios-header--large' : ''}`}>
      <div className="ios-header__nav">
        <div className="ios-header__left">{leftButton}</div>
        {!isLargeTitle && <div className="ios-header__title">{title}</div>}
        <div className="ios-header__right">{rightButton}</div>
      </div>
      {isLargeTitle && (
        <div className="ios-header__large-title">{title}</div>
      )}
      {showSearch && (
        <div className="ios-search-bar">
          <div className="ios-search-bar__container">
            <svg className="ios-search-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              className="ios-search-bar__input"
              placeholder="Search"
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
            />
            {searchValue && (
              <button
                className="ios-search-bar__clear"
                onClick={() => onSearchChange?.('')}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

// Back Button
function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button className="ios-back-button" onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M15 18l-6-6 6-6"/>
      </svg>
      <span>{label}</span>
    </button>
  );
}

// Folder Row
function FolderRow({
  folder,
  noteCount,
  onClick,
  showChevron = true,
}: {
  folder: Folder;
  noteCount: number;
  onClick: () => void;
  showChevron?: boolean;
}) {
  return (
    <button className="ios-folder-row" onClick={onClick}>
      <span className="ios-folder-row__icon">{folder.icon}</span>
      <span className="ios-folder-row__name">{folder.name}</span>
      <span className="ios-folder-row__count">{noteCount}</span>
      {showChevron && (
        <svg className="ios-folder-row__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      )}
    </button>
  );
}

// Note Row
function NoteRow({
  note,
  onClick,
  onDelete,
}: {
  note: Note;
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>
      <div
        ref={rowRef}
        className="ios-note-row"
        onClick={onClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ transform: `translateX(${swipeX}px)` }}
      >
        <div className="ios-note-row__pin-indicator">
          {note.isPinned && (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 4l4 4-1 1-1-1-3 3v3l-1 1-3-3-4 4-1-1 4-4-3-3 1-1h3l3-3-1-1z"/>
            </svg>
          )}
        </div>
        <div className="ios-note-row__content">
          <div className="ios-note-row__title">{note.title || 'New Note'}</div>
          <div className="ios-note-row__preview">
            <span className="ios-note-row__date">{formatDate(note.updatedAt)}</span>
            <span className="ios-note-row__text">{extractPreview(note.content)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Folders View
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
      <IOSHeader
        title="Folders"
        isLargeTitle
        showSearch
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        rightButton={
          <button className="ios-text-button" onClick={onCreateFolder}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        }
      />

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

// Notes List View
function NotesListView({
  folder,
  notes,
  onBack,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
}: {
  folder: Folder;
  notes: Note[];
  onBack: () => void;
  onSelectNote: (noteId: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (noteId: string) => void;
}) {
  const [searchValue, setSearchValue] = useState('');

  const filteredNotes = useMemo(() => {
    let result = notes;
    if (searchValue) {
      const query = searchValue.toLowerCase();
      result = result.filter(n =>
        n.title.toLowerCase().includes(query) ||
        n.content.toLowerCase().includes(query)
      );
    }
    // Sort: pinned first, then by updated date
    return result.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [notes, searchValue]);

  const pinnedNotes = filteredNotes.filter(n => n.isPinned);
  const unpinnedNotes = filteredNotes.filter(n => !n.isPinned);

  return (
    <div className="ios-notes-list-view">
      <IOSHeader
        title={folder.name}
        isLargeTitle
        showSearch
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        leftButton={<BackButton onClick={onBack} label="Folders" />}
        rightButton={
          <button className="ios-text-button ios-text-button--icon" onClick={() => {}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
            </svg>
          </button>
        }
      />

      <div className="ios-notes-list-view__content">
        {filteredNotes.length === 0 ? (
          <div className="ios-empty-state">
            <div className="ios-empty-state__icon">📝</div>
            <div className="ios-empty-state__title">No Notes</div>
            <div className="ios-empty-state__subtitle">
              {searchValue ? 'No notes match your search' : 'Tap the compose button to create a note'}
            </div>
          </div>
        ) : (
          <>
            {pinnedNotes.length > 0 && (
              <section className="ios-notes-section">
                <div className="ios-notes-section__header">Pinned</div>
                <div className="ios-notes-section__list">
                  {pinnedNotes.map(note => (
                    <NoteRow
                      key={note.id}
                      note={note}
                      onClick={() => onSelectNote(note.id)}
                      onDelete={() => onDeleteNote(note.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {unpinnedNotes.length > 0 && (
              <section className="ios-notes-section">
                {pinnedNotes.length > 0 && (
                  <div className="ios-notes-section__header">Notes</div>
                )}
                <div className="ios-notes-section__list">
                  {unpinnedNotes.map(note => (
                    <NoteRow
                      key={note.id}
                      note={note}
                      onClick={() => onSelectNote(note.id)}
                      onDelete={() => onDeleteNote(note.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <footer className="ios-notes-list-footer">
        <span className="ios-notes-list-footer__count">
          {filteredNotes.length} {filteredNotes.length === 1 ? 'Note' : 'Notes'}
        </span>
        <button className="ios-compose-button" onClick={onCreateNote}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>
      </footer>
    </div>
  );
}

// Note Editor View
function NoteEditorView({
  note,
  folder,
  onBack,
  onSave,
  onTogglePin,
  onDelete,
}: {
  note: Note | null;
  folder: Folder;
  onBack: () => void;
  onSave: (content: string) => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const [content, setContent] = useState(note?.content || '');
  const [showMenu, setShowMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasChanges = content !== (note?.content || '');

  useEffect(() => {
    setContent(note?.content || '');
  }, [note?.id]);

  useEffect(() => {
    if (textareaRef.current && !note) {
      textareaRef.current.focus();
    }
  }, [note]);

  const handleBack = () => {
    if (hasChanges || (!note && content.trim())) {
      onSave(content);
    }
    onBack();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: extractTitle(content),
          text: content,
        });
      } catch (e) {
        // User cancelled or error
      }
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="ios-note-editor">
      <IOSHeader
        title=""
        leftButton={<BackButton onClick={handleBack} label={folder.name} />}
        rightButton={
          <div className="ios-header__actions">
            <button className="ios-text-button ios-text-button--icon" onClick={handleShare}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
              </svg>
            </button>
            <button
              className="ios-text-button ios-text-button--icon"
              onClick={() => setShowMenu(!showMenu)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
              </svg>
            </button>
          </div>
        }
      />

      {showMenu && (
        <>
          <div className="ios-menu-backdrop" onClick={() => setShowMenu(false)} />
          <div className="ios-dropdown-menu">
            <button className="ios-dropdown-menu__item" onClick={() => { onTogglePin(); setShowMenu(false); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 4l4 4-1 1-1-1-3 3v3l-1 1-3-3-4 4-1-1 4-4-3-3 1-1h3l3-3-1-1z"/>
              </svg>
              {note?.isPinned ? 'Unpin Note' : 'Pin Note'}
            </button>
            <button className="ios-dropdown-menu__item" onClick={() => { navigator.clipboard.writeText(content); setShowMenu(false); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
              Copy
            </button>
            <button className="ios-dropdown-menu__item ios-dropdown-menu__item--danger" onClick={() => { onDelete(); setShowMenu(false); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
              Delete
            </button>
          </div>
        </>
      )}

      <div className="ios-note-editor__content">
        {note && (
          <div className="ios-note-editor__date">
            {formatDate(note.updatedAt)}
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="ios-note-editor__textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start typing..."
          autoFocus={!note}
        />
      </div>

      <footer className="ios-note-editor__toolbar">
        <button className="ios-toolbar-button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button className="ios-toolbar-button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7V4h16v3M9 20h6M12 4v16"/>
          </svg>
        </button>
        <button className="ios-toolbar-button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
          </svg>
        </button>
        <button className="ios-toolbar-button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/>
            <path d="M14 2v6h6"/>
          </svg>
        </button>
        <button className="ios-toolbar-button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </button>
      </footer>
    </div>
  );
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export function IOSNotesApp() {
  const [folders, setFolders] = useState<Folder[]>(() =>
    loadFromStorage(STORAGE_KEYS.FOLDERS, DEFAULT_FOLDERS)
  );
  const [notes, setNotes] = useState<Note[]>(() =>
    loadFromStorage(STORAGE_KEYS.NOTES, DEFAULT_NOTES)
  );
  const [viewState, setViewState] = useState<ViewState>({ type: 'folders' });
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);
  const [currentNote, setCurrentNote] = useState<Note | null>(null);

  // Persist to storage
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.FOLDERS, folders);
  }, [folders]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.NOTES, notes);
  }, [notes]);

  // Navigation handlers
  const handleSelectFolder = useCallback((folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (folder) {
      setCurrentFolder(folder);
      setViewState({ type: 'notes', folderId });
    }
  }, [folders]);

  const handleSelectNote = useCallback((noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (note && currentFolder) {
      setCurrentNote(note);
      setViewState({ type: 'editor', noteId, folderId: currentFolder.id });
    }
  }, [notes, currentFolder]);

  const handleCreateNote = useCallback(() => {
    if (currentFolder) {
      setCurrentNote(null);
      setViewState({ type: 'editor', noteId: null, folderId: currentFolder.id });
    }
  }, [currentFolder]);

  const handleSaveNote = useCallback((content: string) => {
    if (!content.trim()) return;

    const title = extractTitle(content);
    const now = Date.now();

    if (currentNote) {
      // Update existing note
      setNotes(prev => prev.map(n =>
        n.id === currentNote.id
          ? { ...n, content, title, updatedAt: now }
          : n
      ));
    } else if (currentFolder) {
      // Create new note
      const newNote: Note = {
        id: generateId(),
        folderId: currentFolder.id,
        title,
        content,
        createdAt: now,
        updatedAt: now,
        isPinned: false,
      };
      setNotes(prev => [newNote, ...prev]);
      setCurrentNote(newNote);
    }
  }, [currentNote, currentFolder]);

  const handleDeleteNote = useCallback((noteId: string) => {
    setNotes(prev => prev.filter(n => n.id !== noteId));
    if (currentNote?.id === noteId) {
      setCurrentNote(null);
      if (currentFolder) {
        setViewState({ type: 'notes', folderId: currentFolder.id });
      }
    }
  }, [currentNote, currentFolder]);

  const handleTogglePin = useCallback(() => {
    if (currentNote) {
      setNotes(prev => prev.map(n =>
        n.id === currentNote.id
          ? { ...n, isPinned: !n.isPinned }
          : n
      ));
      setCurrentNote(prev => prev ? { ...prev, isPinned: !prev.isPinned } : null);
    }
  }, [currentNote]);

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

  const handleBack = useCallback(() => {
    if (viewState.type === 'editor') {
      if (currentFolder) {
        setViewState({ type: 'notes', folderId: currentFolder.id });
      }
      setCurrentNote(null);
    } else if (viewState.type === 'notes') {
      setViewState({ type: 'folders' });
      setCurrentFolder(null);
    }
  }, [viewState, currentFolder]);

  // Get notes for current folder
  const folderNotes = useMemo(() => {
    if (!currentFolder) return [];
    if (currentFolder.id === 'all') {
      return notes.filter(n => n.folderId !== 'recently-deleted');
    }
    return notes.filter(n => n.folderId === currentFolder.id);
  }, [notes, currentFolder]);

  // Render based on view state
  return (
    <div className="ios-notes-app">
      {viewState.type === 'folders' && (
        <FoldersView
          folders={folders}
          notes={notes}
          onSelectFolder={handleSelectFolder}
          onCreateFolder={handleCreateFolder}
        />
      )}

      {viewState.type === 'notes' && currentFolder && (
        <NotesListView
          folder={currentFolder}
          notes={folderNotes}
          onBack={handleBack}
          onSelectNote={handleSelectNote}
          onCreateNote={handleCreateNote}
          onDeleteNote={handleDeleteNote}
        />
      )}

      {viewState.type === 'editor' && currentFolder && (
        <NoteEditorView
          note={currentNote}
          folder={currentFolder}
          onBack={handleBack}
          onSave={handleSaveNote}
          onTogglePin={handleTogglePin}
          onDelete={() => currentNote && handleDeleteNote(currentNote.id)}
        />
      )}
    </div>
  );
}

export default IOSNotesApp;
