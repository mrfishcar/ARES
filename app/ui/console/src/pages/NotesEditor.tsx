/**
 * Notes Editor - TipTap-based clean implementation
 *
 * A stable, extensible notes editor built on TipTap/ProseMirror
 * Designed for future ARES integration (entity highlighting, annotations)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TipTapEditor, TipTapEditorRef } from '../components/TipTapEditor';
import '../components/TipTapEditor.css';
import './NotesEditor.css';

// ============================================================================
// TYPES
// ============================================================================

export interface Note {
  id: string;
  folderId: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  isPinned: boolean;
}

export interface Folder {
  id: string;
  name: string;
  icon: string;
  isSystem: boolean;
  parentId: string | null;
}

// ============================================================================
// STORAGE SERVICE
// ============================================================================

const STORAGE_KEYS = {
  NOTES: 'notes-editor-notes',
  FOLDERS: 'notes-editor-folders',
  SELECTED_NOTE: 'notes-editor-selected',
  SELECTED_FOLDER: 'notes-editor-folder',
};

class StorageService {
  static load<T>(key: string, defaultValue: T): T {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  static save<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Failed to save:', e);
    }
  }

  // Future: These methods can be swapped to use IndexedDB or ARES database
  static async loadNotes(): Promise<Note[]> {
    return this.load(STORAGE_KEYS.NOTES, DEFAULT_NOTES);
  }

  static async saveNotes(notes: Note[]): Promise<void> {
    this.save(STORAGE_KEYS.NOTES, notes);
  }

  static async loadFolders(): Promise<Folder[]> {
    return this.load(STORAGE_KEYS.FOLDERS, DEFAULT_FOLDERS);
  }

  static async saveFolders(folders: Folder[]): Promise<void> {
    this.save(STORAGE_KEYS.FOLDERS, folders);
  }
}

// ============================================================================
// DEFAULT DATA
// ============================================================================

const DEFAULT_FOLDERS: Folder[] = [
  { id: 'all', name: 'All Notes', icon: 'folder', isSystem: true, parentId: null },
  { id: 'notes', name: 'Notes', icon: 'folder', isSystem: true, parentId: 'all' },
];

const DEFAULT_NOTES: Note[] = [
  {
    id: 'welcome',
    folderId: 'notes',
    title: 'Welcome to Notes',
    content: '# Welcome to Notes\n\nThis is a stable, extensible notes editor built for the future.\n\n## Features\n\n- Rich text editing with undo/redo\n- Task lists with checkboxes\n- Headings and formatting\n- Ready for entity highlighting\n\n## Task List\n\n- [x] Create editor\n- [x] Add undo/redo\n- [ ] Integrate with ARES\n- [ ] Add entity highlighting',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isPinned: false,
  },
];

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  ),
  note: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 12h6M9 16h6M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  ),
  pinFilled: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  ),
  chevronLeft: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
  undo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
    </svg>
  ),
  redo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
    </svg>
  ),
  bold: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" />
      <path d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
    </svg>
  ),
  italic: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 4h-9M14 20H5M15 4L9 20" />
    </svg>
  ),
  underline: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 3v7a6 6 0 006 6 6 6 0 006-6V3M4 21h16" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  ),
  listOrdered: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M4 16v-2a2 2 0 114 0v2M4 18h4" />
    </svg>
  ),
  checkbox: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  heading: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 12h8M4 18V6M12 18V6M17 10l3-2M17 14l3 2M17 6v12" />
    </svg>
  ),
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: 'long' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

function getPreview(content: string): string {
  const lines = content.split('\n').filter(l => l.trim());
  const preview = lines.slice(1, 3).join(' ').trim();
  return preview.slice(0, 100) || 'No additional text';
}

function getTitle(content: string): string {
  const firstLine = content.split('\n')[0] || '';
  return firstLine.replace(/^#+ /, '').trim() || 'New Note';
}

function generateId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================================================
// NOTES LIST COMPONENT
// ============================================================================

interface NotesListProps {
  notes: Note[];
  selectedId: string | null;
  onSelect: (note: Note) => void;
  onCreateNote: () => void;
}

function NotesList({ notes, selectedId, onSelect, onCreateNote }: NotesListProps) {
  const sortedNotes = [...notes].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

  return (
    <div className="notes-list">
      <div className="notes-list__header">
        <h1>Notes</h1>
        <button className="notes-list__new-btn" onClick={onCreateNote}>
          {Icons.plus}
        </button>
      </div>
      <div className="notes-list__items">
        {sortedNotes.map(note => (
          <button
            key={note.id}
            className={`notes-list__item ${selectedId === note.id ? 'notes-list__item--selected' : ''}`}
            onClick={() => onSelect(note)}
          >
            <div className="notes-list__item-header">
              <span className="notes-list__item-title">{getTitle(note.content)}</span>
              {note.isPinned && <span className="notes-list__item-pin">{Icons.pinFilled}</span>}
            </div>
            <div className="notes-list__item-meta">
              <span className="notes-list__item-date">{formatDate(note.updatedAt)}</span>
              <span className="notes-list__item-preview">{getPreview(note.content)}</span>
            </div>
          </button>
        ))}
        {notes.length === 0 && (
          <div className="notes-list__empty">
            <p>No notes yet</p>
            <button onClick={onCreateNote}>Create your first note</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// EDITOR TOOLBAR COMPONENT
// ============================================================================

interface EditorToolbarProps {
  editorRef: React.RefObject<TipTapEditorRef>;
  onDelete: () => void;
  onTogglePin: () => void;
  isPinned: boolean;
}

function EditorToolbar({ editorRef, onDelete, onTogglePin, isPinned }: EditorToolbarProps) {
  // Prevent focus stealing from editor on mobile
  const preventFocusLoss = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
  };

  const handleUndo = () => editorRef.current?.undo();
  const handleRedo = () => editorRef.current?.redo();
  const handleBold = () => editorRef.current?.toggleBold();
  const handleItalic = () => editorRef.current?.toggleItalic();
  const handleUnderline = () => editorRef.current?.toggleUnderline();
  const handleBulletList = () => editorRef.current?.toggleBulletList();
  const handleOrderedList = () => editorRef.current?.toggleOrderedList();
  const handleTaskList = () => editorRef.current?.toggleTaskList();
  const handleHeading = () => editorRef.current?.setHeading(2);

  // Toolbar button with focus protection
  const ToolbarButton = ({ onClick, title, children, active, danger }: {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
    active?: boolean;
    danger?: boolean;
  }) => (
    <button
      className={`editor-toolbar__btn ${active ? 'editor-toolbar__btn--active' : ''} ${danger ? 'editor-toolbar__btn--danger' : ''}`}
      onClick={onClick}
      onMouseDown={preventFocusLoss}
      onTouchStart={preventFocusLoss}
      title={title}
    >
      {children}
    </button>
  );

  return (
    <div className="editor-toolbar">
      <div className="editor-toolbar__group">
        <ToolbarButton onClick={handleUndo} title="Undo">
          {Icons.undo}
        </ToolbarButton>
        <ToolbarButton onClick={handleRedo} title="Redo">
          {Icons.redo}
        </ToolbarButton>
      </div>

      <div className="editor-toolbar__divider" />

      <div className="editor-toolbar__group">
        <ToolbarButton onClick={handleHeading} title="Heading">
          {Icons.heading}
        </ToolbarButton>
        <ToolbarButton onClick={handleBold} title="Bold">
          {Icons.bold}
        </ToolbarButton>
        <ToolbarButton onClick={handleItalic} title="Italic">
          {Icons.italic}
        </ToolbarButton>
        <ToolbarButton onClick={handleUnderline} title="Underline">
          {Icons.underline}
        </ToolbarButton>
      </div>

      <div className="editor-toolbar__divider" />

      <div className="editor-toolbar__group">
        <ToolbarButton onClick={handleBulletList} title="Bullet List">
          {Icons.list}
        </ToolbarButton>
        <ToolbarButton onClick={handleOrderedList} title="Numbered List">
          {Icons.listOrdered}
        </ToolbarButton>
        <ToolbarButton onClick={handleTaskList} title="Task List">
          {Icons.checkbox}
        </ToolbarButton>
      </div>

      <div className="editor-toolbar__spacer" />

      <div className="editor-toolbar__group">
        <ToolbarButton onClick={onTogglePin} title={isPinned ? 'Unpin' : 'Pin'} active={isPinned}>
          {isPinned ? Icons.pinFilled : Icons.pin}
        </ToolbarButton>
        <ToolbarButton onClick={onDelete} title="Delete" danger>
          {Icons.trash}
        </ToolbarButton>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Debounce helper for save operations
function useDebounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  const timeoutRef = useRef<number | null>(null);

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      fn(...args);
    }, delay);
  }, [fn, delay]) as T;
}

export default function NotesEditor() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showList, setShowList] = useState(true);

  const editorRef = useRef<TipTapEditorRef>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  // Load data on mount
  useEffect(() => {
    async function loadData() {
      const [loadedNotes, loadedFolders] = await Promise.all([
        StorageService.loadNotes(),
        StorageService.loadFolders(),
      ]);
      setNotes(loadedNotes);
      setFolders(loadedFolders);

      // Select first note if none selected
      if (loadedNotes.length > 0) {
        setSelectedNoteId(prev => prev ?? loadedNotes[0].id);
      }

      setIsLoading(false);
    }
    loadData();
  }, []);

  // Debounced save - prevents saving on every keystroke
  useEffect(() => {
    if (isLoading) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Save after 500ms of inactivity
    saveTimeoutRef.current = window.setTimeout(() => {
      StorageService.saveNotes(notes);
    }, 500);

    // Cleanup
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [notes, isLoading]);

  // Get selected note
  const selectedNote = notes.find(n => n.id === selectedNoteId) || null;

  // Handle content change
  const handleContentChange = useCallback((content: string) => {
    if (!selectedNoteId) return;

    setNotes(prev => prev.map(note =>
      note.id === selectedNoteId
        ? { ...note, content, title: getTitle(content), updatedAt: Date.now() }
        : note
    ));
  }, [selectedNoteId]);

  // Create new note
  const handleCreateNote = useCallback(() => {
    const newNote: Note = {
      id: generateId(),
      folderId: 'notes',
      title: 'New Note',
      content: '# New Note\n\nStart writing...',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPinned: false,
    };
    setNotes(prev => [newNote, ...prev]);
    setSelectedNoteId(newNote.id);
    setShowList(false);

    // Focus editor after a tick
    setTimeout(() => editorRef.current?.focus(), 100);
  }, []);

  // Delete note - uses functional update to avoid stale closure
  const handleDeleteNote = useCallback(() => {
    if (!selectedNoteId) return;

    setNotes(prev => {
      const remaining = prev.filter(n => n.id !== selectedNoteId);
      // Select next note (use setTimeout to batch state updates)
      setTimeout(() => {
        setSelectedNoteId(remaining[0]?.id || null);
        // Show list on mobile if no notes left
        if (remaining.length === 0) {
          setShowList(true);
        }
      }, 0);
      return remaining;
    });
  }, [selectedNoteId]);

  // Toggle pin
  const handleTogglePin = useCallback(() => {
    if (!selectedNoteId) return;

    setNotes(prev => prev.map(note =>
      note.id === selectedNoteId
        ? { ...note, isPinned: !note.isPinned }
        : note
    ));
  }, [selectedNoteId]);

  // Select note
  const handleSelectNote = useCallback((note: Note) => {
    setSelectedNoteId(note.id);
    setShowList(false);
  }, []);

  // Handle back navigation
  const handleBack = useCallback(() => {
    setShowList(true);
  }, []);

  if (isLoading) {
    return <div className="notes-editor notes-editor--loading">Loading...</div>;
  }

  return (
    <div className="notes-editor">
      {/* Notes List Sidebar */}
      <aside className={`notes-editor__sidebar ${!showList ? 'notes-editor__sidebar--hidden' : ''}`}>
        <NotesList
          notes={notes}
          selectedId={selectedNoteId}
          onSelect={handleSelectNote}
          onCreateNote={handleCreateNote}
        />
      </aside>

      {/* Editor Panel */}
      <main className={`notes-editor__main ${showList ? 'notes-editor__main--hidden' : ''}`}>
        {selectedNote ? (
          <>
            {/* Mobile back button */}
            <div className="notes-editor__mobile-header">
              <button className="notes-editor__back-btn" onClick={handleBack}>
                {Icons.chevronLeft}
                <span>Notes</span>
              </button>
            </div>

            {/* Toolbar */}
            <EditorToolbar
              editorRef={editorRef}
              onDelete={handleDeleteNote}
              onTogglePin={handleTogglePin}
              isPinned={selectedNote.isPinned}
            />

            {/* TipTap Editor */}
            <div className="notes-editor__content">
              <TipTapEditor
                ref={editorRef}
                content={selectedNote.content}
                onContentChange={handleContentChange}
                placeholder="Start writing..."
              />
            </div>
          </>
        ) : (
          <div className="notes-editor__empty">
            <p>Select a note or create a new one</p>
            <button onClick={handleCreateNote}>Create Note</button>
          </div>
        )}
      </main>
    </div>
  );
}
