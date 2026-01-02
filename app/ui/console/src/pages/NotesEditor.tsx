/**
 * Notes Editor - Authentic iOS Notes Experience
 *
 * A pixel-perfect iOS Notes clone built on TipTap/ProseMirror
 * Designed for future ARES integration (entity highlighting, annotations)
 *
 * iOS Notes Features:
 * - Keyboard accessory toolbar (fixed above keyboard on mobile)
 * - Search bar with live filtering
 * - Section headers (Pinned, Today, Previous 7 Days, etc.)
 * - Swipe-to-delete with haptic feedback
 * - Delete confirmation action sheet
 * - Auto-format first line as title
 *
 * Code Audit Fixes Applied:
 * - #1: Fixed delete race condition (removed setTimeout inside state setter)
 * - #5: Added save status indicator
 * - #6: Removed unused useDebounce hook
 * - #12: Added proper error handling to StorageService
 * - #14: Added aria-labels to icon buttons
 * - #15: Fixed focus timing with requestAnimationFrame
 */

import React, { useState, useEffect, useRef, useCallback, Component, ReactNode, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { TipTapEditor, TipTapEditorRef } from '../components/TipTapEditor';
import '../components/TipTapEditor.css';
import './NotesEditor.css';

// ============================================================================
// HAPTIC FEEDBACK UTILITY
// ============================================================================

function triggerHaptic(style: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error' = 'light') {
  // Use Taptic Engine on iOS via vibrate API with specific patterns
  if ('vibrate' in navigator) {
    const patterns: Record<string, number | number[]> = {
      light: 10,
      medium: 20,
      heavy: 30,
      selection: 5,
      success: [10, 30, 10],
      warning: [20, 40, 20],
      error: [30, 50, 30, 50, 30],
    };
    navigator.vibrate(patterns[style]);
  }
}

// ============================================================================
// ERROR BOUNDARY (#3)
// ============================================================================

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class EditorErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Editor error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="notes-editor__error">
          <p>Something went wrong with the editor.</p>
          <button onClick={() => {
            this.setState({ hasError: false });
            this.props.onReset();
          }}>
            Reset Editor
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// SAVE STATUS TYPE (#5)
// ============================================================================

type SaveStatus = 'saved' | 'saving' | 'unsaved';

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
  // #12: Added proper error handling with try-catch wrapping async operations
  static load<T>(key: string, defaultValue: T): T {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return defaultValue;
      const parsed = JSON.parse(stored);
      // Validate the data structure exists
      if (parsed === null || parsed === undefined) return defaultValue;
      return parsed;
    } catch (e) {
      console.error(`Failed to load ${key}:`, e);
      return defaultValue;
    }
  }

  static save<T>(key: string, value: T): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`Failed to save ${key}:`, e);
      return false;
    }
  }

  // Future: These methods can be swapped to use IndexedDB or ARES database
  static async loadNotes(): Promise<Note[]> {
    try {
      return this.load(STORAGE_KEYS.NOTES, DEFAULT_NOTES);
    } catch (e) {
      console.error('Failed to load notes:', e);
      return DEFAULT_NOTES;
    }
  }

  static async saveNotes(notes: Note[]): Promise<boolean> {
    try {
      return this.save(STORAGE_KEYS.NOTES, notes);
    } catch (e) {
      console.error('Failed to save notes:', e);
      return false;
    }
  }

  static async loadFolders(): Promise<Folder[]> {
    try {
      return this.load(STORAGE_KEYS.FOLDERS, DEFAULT_FOLDERS);
    } catch (e) {
      console.error('Failed to load folders:', e);
      return DEFAULT_FOLDERS;
    }
  }

  static async saveFolders(folders: Folder[]): Promise<boolean> {
    try {
      return this.save(STORAGE_KEYS.FOLDERS, folders);
    } catch (e) {
      console.error('Failed to save folders:', e);
      return false;
    }
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
    content: 'Welcome to Notes\n\nThis is a beautiful, extensible notes editor inspired by iOS Notes. The first line automatically becomes the title.\n\nFeatures\n\n• Rich text editing with undo/redo\n• Task lists with checkboxes\n• Swipe-to-delete notes\n• Search across all notes\n• Pinned notes section\n\nTask List\n\n- [x] Create editor\n- [x] Add undo/redo\n- [x] Paper texture background\n- [ ] Integrate with ARES',
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
  folderFilled: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  ),
  chevronRight: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
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
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" />
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

// FIX #11: Cache date thresholds to avoid recalculating on every call
let cachedDateThresholds: { today: Date; yesterday: Date; weekAgo: Date; monthAgo: Date } | null = null;
let cacheTimestamp = 0;

function getDateThresholds() {
  const now = Date.now();
  // Refresh cache every minute
  if (!cachedDateThresholds || now - cacheTimestamp > 60000) {
    const nowDate = new Date(now);
    const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    cachedDateThresholds = {
      today,
      yesterday: new Date(today.getTime() - 86400000),
      weekAgo: new Date(today.getTime() - 7 * 86400000),
      monthAgo: new Date(today.getTime() - 30 * 86400000),
    };
    cacheTimestamp = now;
  }
  return cachedDateThresholds;
}

// Get date section for note (iOS Notes style grouping)
function getDateSection(timestamp: number): string {
  const date = new Date(timestamp);
  const { today, yesterday, weekAgo, monthAgo } = getDateThresholds();

  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  if (date >= weekAgo) return 'Previous 7 Days';
  if (date >= monthAgo) return 'Previous 30 Days';

  // Group by month/year
  return date.toLocaleDateString([], { month: 'long', year: 'numeric' });
}

// Group notes by section
interface NoteSection {
  title: string;
  notes: Note[];
}

function groupNotesBySection(notes: Note[]): NoteSection[] {
  const pinned = notes.filter(n => n.isPinned);
  const unpinned = notes.filter(n => !n.isPinned);

  const sections: NoteSection[] = [];

  if (pinned.length > 0) {
    sections.push({ title: 'Pinned', notes: pinned });
  }

  // Group unpinned by date section
  const dateGroups = new Map<string, Note[]>();
  for (const note of unpinned) {
    const section = getDateSection(note.updatedAt);
    if (!dateGroups.has(section)) {
      dateGroups.set(section, []);
    }
    dateGroups.get(section)!.push(note);
  }

  // Add date sections in order
  const sectionOrder = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days'];
  for (const sectionName of sectionOrder) {
    const sectionNotes = dateGroups.get(sectionName);
    if (sectionNotes && sectionNotes.length > 0) {
      sections.push({ title: sectionName, notes: sectionNotes });
      dateGroups.delete(sectionName);
    }
  }

  // Add remaining month sections
  for (const [sectionName, sectionNotes] of dateGroups) {
    sections.push({ title: sectionName, notes: sectionNotes });
  }

  return sections;
}

// ============================================================================
// FOLDERS SIDEBAR COMPONENT (iOS Notes Style)
// ============================================================================

interface FoldersSidebarProps {
  folders: Folder[];
  notes: Note[];
  selectedFolderId: string;
  onSelectFolder: (folderId: string) => void;
  onBack: () => void;
}

function FoldersSidebar({ folders, notes, selectedFolderId, onSelectFolder, onBack }: FoldersSidebarProps) {
  // Count notes per folder
  const noteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const folder of folders) {
      if (folder.id === 'all') {
        counts[folder.id] = notes.length;
      } else {
        counts[folder.id] = notes.filter(n => n.folderId === folder.id).length;
      }
    }
    return counts;
  }, [folders, notes]);

  // Get root folders (parentId === null or 'all')
  const rootFolders = folders.filter(f => f.parentId === null);
  const childFolders = (parentId: string) => folders.filter(f => f.parentId === parentId);

  const renderFolder = (folder: Folder, depth: number = 0) => {
    const children = childFolders(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const count = noteCounts[folder.id] || 0;

    return (
      <div key={folder.id}>
        <button
          className={`folders-sidebar__item ${isSelected ? 'folders-sidebar__item--selected' : ''}`}
          style={{ paddingLeft: `${16 + depth * 16}px` }}
          onClick={() => {
            triggerHaptic('selection');
            onSelectFolder(folder.id);
          }}
        >
          <span className="folders-sidebar__item-icon">
            {isSelected ? Icons.folderFilled : Icons.folder}
          </span>
          <span className="folders-sidebar__item-name">{folder.name}</span>
          <span className="folders-sidebar__item-count">{count}</span>
          {children.length > 0 && (
            <span className="folders-sidebar__item-chevron">{Icons.chevronRight}</span>
          )}
        </button>
        {children.map(child => renderFolder(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="folders-sidebar">
      <div className="folders-sidebar__header">
        <button
          className="folders-sidebar__back-btn"
          onClick={onBack}
          aria-label="Close folders"
        >
          {Icons.chevronLeft}
        </button>
        <h1>Folders</h1>
      </div>
      <div className="folders-sidebar__list">
        {rootFolders.map(folder => renderFolder(folder))}
      </div>
    </div>
  );
}

// ============================================================================
// NOTES LIST COMPONENT
// ============================================================================

interface NotesListProps {
  notes: Note[];
  selectedId: string | null;
  onSelect: (note: Note) => void;
  onCreateNote: () => void;
  onDelete: (noteId: string) => void;
  onReorder: (noteId: string, newIndex: number) => void;
  selectedFolderId: string;
  folderName: string;
  onShowFolders: () => void;
}

// Individual note item with swipe-to-delete and drag-to-reorder
interface NoteItemProps {
  note: Note;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (noteId: string, index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
}

function NoteItem({ note, index, isSelected, onSelect, onDelete, isDragging, isDropTarget, onDragStart, onDragOver, onDragEnd }: NoteItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentXRef = useRef(0);
  const longPressTimerRef = useRef<number | null>(null);
  const [isLongPressing, setIsLongPressing] = useState(false);

  const SWIPE_THRESHOLD = 80; // Pixels to reveal delete button
  const DELETE_THRESHOLD = 150; // Pixels to trigger delete
  const LONG_PRESS_DURATION = 500; // ms to start drag

  // FIX #3: Reset swipe when clicking outside this item
  useEffect(() => {
    if (swipeX === 0) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (itemRef.current && !itemRef.current.contains(e.target as Node)) {
        setSwipeX(0);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [swipeX]);

  // Clear long press timer
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    currentXRef.current = swipeX;

    // Start long press timer for drag
    longPressTimerRef.current = window.setTimeout(() => {
      setIsLongPressing(true);
      triggerHaptic('medium');
      onDragStart(note.id, index);
    }, LONG_PRESS_DURATION);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - startXRef.current;
    const deltaY = e.touches[0].clientY - startYRef.current;

    // If we're in drag mode, handle drag over
    if (isDragging) {
      // Trigger drag over on items we pass
      const touch = e.touches[0];
      const element = document.elementFromPoint(touch.clientX, touch.clientY);
      if (element) {
        const noteItem = element.closest('.notes-list__item-container');
        if (noteItem) {
          const noteIndex = parseInt(noteItem.getAttribute('data-index') || '-1', 10);
          if (noteIndex >= 0 && noteIndex !== index) {
            onDragOver(noteIndex);
          }
        }
      }
      return;
    }

    // Cancel long press if we moved too much (starting a swipe instead)
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      clearLongPressTimer();
      setIsLongPressing(false);
    }

    // Only swipe if we're not long pressing
    if (!isLongPressing && Math.abs(deltaX) > Math.abs(deltaY)) {
      setIsSwiping(true);
      const newX = Math.min(0, Math.max(-DELETE_THRESHOLD, currentXRef.current + deltaX));
      setSwipeX(newX);
    }
  };

  const handleTouchEnd = () => {
    clearLongPressTimer();
    setIsLongPressing(false);

    // If we were dragging, end the drag
    if (isDragging) {
      onDragEnd();
      return;
    }

    setIsSwiping(false);
    if (swipeX < -DELETE_THRESHOLD + 20) {
      // Trigger delete with haptic
      triggerHaptic('warning');
      onDelete();
    } else if (swipeX < -SWIPE_THRESHOLD / 2) {
      // Snap to reveal delete button
      setSwipeX(-SWIPE_THRESHOLD);
      triggerHaptic('selection');
    } else {
      // Snap back
      setSwipeX(0);
    }
  };

  // FIX #10: Handle touch cancel (e.g., notification appears mid-swipe)
  const handleTouchCancel = () => {
    clearLongPressTimer();
    setIsLongPressing(false);
    setIsSwiping(false);
    setSwipeX(0);
    if (isDragging) {
      onDragEnd();
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('warning');
    onDelete();
  };

  const itemClasses = [
    'notes-list__item',
    isSelected && 'notes-list__item--selected',
    isDragging && 'notes-list__item--dragging',
    isDropTarget && 'notes-list__item--drop-target',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={`notes-list__item-container ${isDragging ? 'notes-list__item-container--dragging' : ''}`}
      ref={itemRef}
      data-index={index}
    >
      {/* Drop indicator above */}
      {isDropTarget && <div className="notes-list__drop-indicator" />}

      {/* Delete action revealed by swipe */}
      <div className="notes-list__item-delete" onClick={handleDeleteClick}>
        {Icons.trash}
        <span>Delete</span>
      </div>

      {/* Swipeable note item */}
      <button
        className={itemClasses}
        onClick={() => {
          if (swipeX === 0 && !isDragging) {
            triggerHaptic('selection');
            onSelect();
          } else {
            setSwipeX(0);
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.3s cubic-bezier(0.25, 1.25, 0.5, 1)',
        }}
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
    </div>
  );
}

function NotesList({ notes, selectedId, onSelect, onCreateNote, onDelete, onReorder, selectedFolderId, folderName, onShowFolders }: NotesListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  // FIX #8: Debounced search to prevent jank with large lists
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Drag-to-reorder state
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [draggedFromIndex, setDraggedFromIndex] = useState<number>(-1);
  const [dropTargetIndex, setDropTargetIndex] = useState<number>(-1);

  // Drag handlers
  const handleDragStart = useCallback((noteId: string, index: number) => {
    setDraggedNoteId(noteId);
    setDraggedFromIndex(index);
  }, []);

  const handleDragOver = useCallback((index: number) => {
    if (index !== dropTargetIndex) {
      setDropTargetIndex(index);
      triggerHaptic('selection');
    }
  }, [dropTargetIndex]);

  const handleDragEnd = useCallback(() => {
    if (draggedNoteId && dropTargetIndex >= 0 && dropTargetIndex !== draggedFromIndex) {
      onReorder(draggedNoteId, dropTargetIndex);
      triggerHaptic('success');
    }
    setDraggedNoteId(null);
    setDraggedFromIndex(-1);
    setDropTargetIndex(-1);
  }, [draggedNoteId, dropTargetIndex, draggedFromIndex, onReorder]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Sort notes by update time (within each section)
  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [notes]);

  // Filter notes by debounced search query
  const filteredNotes = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return sortedNotes;
    const query = debouncedSearchQuery.toLowerCase();
    return sortedNotes.filter(note =>
      note.content.toLowerCase().includes(query) ||
      getTitle(note.content).toLowerCase().includes(query)
    );
  }, [sortedNotes, debouncedSearchQuery]);

  // Group filtered notes by section
  const sections = useMemo(() => {
    return groupNotesBySection(filteredNotes);
  }, [filteredNotes]);

  const handleClearSearch = () => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  return (
    <div className="notes-list">
      <div className="notes-list__header">
        <button
          className="notes-list__folders-btn"
          onClick={() => {
            triggerHaptic('selection');
            onShowFolders();
          }}
          aria-label="Show folders"
        >
          {Icons.chevronLeft}
          <span>Folders</span>
        </button>
        <h1>{folderName}</h1>
        {/* #14: Added aria-label for accessibility */}
        <button
          className="notes-list__new-btn"
          onClick={() => {
            triggerHaptic('light');
            onCreateNote();
          }}
          aria-label="Create new note"
        >
          {Icons.plus}
        </button>
      </div>

      {/* iOS-style search bar */}
      <div className={`notes-list__search ${isSearchFocused ? 'notes-list__search--focused' : ''}`}>
        <div className="notes-list__search-icon">{Icons.search}</div>
        <input
          ref={searchInputRef}
          type="text"
          className="notes-list__search-input"
          placeholder="Search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
        />
        {searchQuery && (
          <button
            className="notes-list__search-clear"
            onClick={handleClearSearch}
            aria-label="Clear search"
          >
            {Icons.close}
          </button>
        )}
      </div>

      <div className={`notes-list__items ${draggedNoteId ? 'notes-list__items--dragging' : ''}`}>
        {(() => {
          let noteIndex = 0;
          return sections.map(section => (
            <div key={section.title} className="notes-list__section">
              <div className="notes-list__section-header">{section.title}</div>
              {section.notes.map(note => {
                const currentIndex = noteIndex++;
                return (
                  <NoteItem
                    key={note.id}
                    note={note}
                    index={currentIndex}
                    isSelected={selectedId === note.id}
                    onSelect={() => onSelect(note)}
                    onDelete={() => onDelete(note.id)}
                    isDragging={draggedNoteId === note.id}
                    isDropTarget={dropTargetIndex === currentIndex && draggedNoteId !== note.id}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                  />
                );
              })}
            </div>
          ));
        })()}
        {filteredNotes.length === 0 && searchQuery && (
          <div className="notes-list__empty">
            <p>No results for "{searchQuery}"</p>
          </div>
        )}
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
// TEXT SELECTION POPUP (iOS-style formatting bubble)
// ============================================================================

interface SelectionPopupProps {
  editorRef: React.RefObject<TipTapEditorRef>;
}

function SelectionPopup({ editorRef }: SelectionPopupProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setIsVisible(false);
        return;
      }

      // FIX #9: Only show popup if selection is within the editor
      const editorElement = document.querySelector('.ios-tiptap-editor');
      if (!editorElement) {
        setIsVisible(false);
        return;
      }

      const anchorNode = selection.anchorNode;
      if (!anchorNode || !editorElement.contains(anchorNode)) {
        setIsVisible(false);
        return;
      }

      // Get selection bounds
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // FIX #2: Viewport bounds checking - ensure popup stays on screen
      const popupHeight = 48; // Approximate popup height
      const popupWidth = 200; // Approximate popup width
      const padding = 8;

      let x = rect.left + rect.width / 2;
      let y = rect.top - padding;

      // Clamp X to keep popup within viewport
      x = Math.max(popupWidth / 2 + padding, Math.min(window.innerWidth - popupWidth / 2 - padding, x));

      // If selection is too close to top, show popup below instead
      if (y < popupHeight + padding) {
        y = rect.bottom + padding + popupHeight;
      }

      setPosition({ x, y });
      setIsVisible(true);
    };

    // Listen for selection changes
    document.addEventListener('selectionchange', checkSelection);
    return () => document.removeEventListener('selectionchange', checkSelection);
  }, []);

  // Hide on scroll
  useEffect(() => {
    const hideOnScroll = () => setIsVisible(false);
    window.addEventListener('scroll', hideOnScroll, true);
    return () => window.removeEventListener('scroll', hideOnScroll, true);
  }, []);

  if (!isVisible || !position) return null;

  const preventFocusLoss = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
  };

  const handleFormat = (action: () => void) => {
    triggerHaptic('light');
    action();
  };

  return createPortal(
    <div
      ref={popupRef}
      className="selection-popup"
      style={{
        left: position.x,
        top: position.y,
      }}
      onMouseDown={preventFocusLoss}
      onTouchStart={preventFocusLoss}
    >
      <button
        className="selection-popup__btn"
        onClick={() => handleFormat(() => editorRef.current?.toggleBold())}
      >
        <strong>B</strong>
      </button>
      <button
        className="selection-popup__btn"
        onClick={() => handleFormat(() => editorRef.current?.toggleItalic())}
      >
        <em>I</em>
      </button>
      <button
        className="selection-popup__btn"
        onClick={() => handleFormat(() => editorRef.current?.toggleUnderline())}
      >
        <u>U</u>
      </button>
      <button
        className="selection-popup__btn"
        onClick={() => handleFormat(() => editorRef.current?.toggleStrike())}
      >
        <s>S</s>
      </button>
      <div className="selection-popup__divider" />
      <button
        className="selection-popup__btn"
        onClick={() => handleFormat(() => editorRef.current?.toggleHighlight())}
      >
        <span className="selection-popup__highlight">H</span>
      </button>
    </div>,
    document.body
  );
}

// ============================================================================
// ACTION SHEET COMPONENT (iOS-style)
// ============================================================================

interface ActionSheetAction {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

interface ActionSheetProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  actions: ActionSheetAction[];
  onCancel: () => void;
}

function ActionSheet({ isOpen, title, message, actions, onCancel }: ActionSheetProps) {
  // FIX #6: Body scroll lock when action sheet is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // FIX #12: Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return createPortal(
    <div className="action-sheet-overlay" onClick={onCancel}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
        {(title || message) && (
          <div className="action-sheet__header">
            {title && <div className="action-sheet__title">{title}</div>}
            {message && <div className="action-sheet__message">{message}</div>}
          </div>
        )}
        <div className="action-sheet__actions">
          {actions.map((action, index) => (
            <button
              key={index}
              className={`action-sheet__action ${action.destructive ? 'action-sheet__action--destructive' : ''}`}
              onClick={() => {
                triggerHaptic(action.destructive ? 'warning' : 'selection');
                action.onClick();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
        <button className="action-sheet__cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// EDITOR TOOLBAR COMPONENT
// ============================================================================

// FIX #7: Extract ToolbarButton to prevent recreation on every render
interface ToolbarButtonProps {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
  danger?: boolean;
}

const ToolbarButton = React.memo(function ToolbarButton({
  onClick,
  title,
  children,
  active,
  danger,
}: ToolbarButtonProps) {
  // Prevent focus stealing from editor on mobile
  const preventFocusLoss = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
  };

  return (
    <button
      className={`editor-toolbar__btn ${active ? 'editor-toolbar__btn--active' : ''} ${danger ? 'editor-toolbar__btn--danger' : ''}`}
      onClick={onClick}
      onMouseDown={preventFocusLoss}
      onTouchStart={preventFocusLoss}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
});

interface EditorToolbarProps {
  editorRef: React.RefObject<TipTapEditorRef>;
  onDelete: () => void;
  onTogglePin: () => void;
  isPinned: boolean;
  saveStatus: SaveStatus; // #5: Added save status
  isKeyboardOpen?: boolean; // For keyboard accessory positioning
}

function EditorToolbar({ editorRef, onDelete, onTogglePin, isPinned, saveStatus, isKeyboardOpen }: EditorToolbarProps) {
  const handleUndo = useCallback(() => {
    triggerHaptic('light');
    editorRef.current?.undo();
  }, [editorRef]);

  const handleRedo = useCallback(() => {
    triggerHaptic('light');
    editorRef.current?.redo();
  }, [editorRef]);

  const handleBold = useCallback(() => {
    triggerHaptic('light');
    editorRef.current?.toggleBold();
  }, [editorRef]);

  const handleItalic = useCallback(() => {
    triggerHaptic('light');
    editorRef.current?.toggleItalic();
  }, [editorRef]);

  const handleUnderline = useCallback(() => {
    triggerHaptic('light');
    editorRef.current?.toggleUnderline();
  }, [editorRef]);

  const handleBulletList = useCallback(() => {
    triggerHaptic('light');
    editorRef.current?.toggleBulletList();
  }, [editorRef]);

  const handleOrderedList = useCallback(() => {
    triggerHaptic('light');
    editorRef.current?.toggleOrderedList();
  }, [editorRef]);

  const handleTaskList = useCallback(() => {
    triggerHaptic('light');
    editorRef.current?.toggleTaskList();
  }, [editorRef]);

  const handleHeading = useCallback(() => {
    triggerHaptic('light');
    editorRef.current?.setHeading(2);
  }, [editorRef]);

  const toolbarContent = (
    <>
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

      {/* #5: Save status indicator (desktop) */}
      <span className={`editor-toolbar__save-status editor-toolbar__save-status--${saveStatus}`}>
        {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Unsaved'}
      </span>

      <div className="editor-toolbar__group">
        <ToolbarButton onClick={onTogglePin} title={isPinned ? 'Unpin' : 'Pin'} active={isPinned}>
          {isPinned ? Icons.pinFilled : Icons.pin}
        </ToolbarButton>
        <ToolbarButton onClick={onDelete} title="Delete" danger>
          {Icons.trash}
        </ToolbarButton>
      </div>
    </>
  );

  return (
    <div className={`editor-toolbar ${isKeyboardOpen ? 'editor-toolbar--keyboard-accessory' : ''}`}>
      {toolbarContent}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// #6: Removed unused useDebounce hook - was dead code

export default function NotesEditor() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [showList, setShowList] = useState(true);
  const [showFolders, setShowFolders] = useState(false);
  // #5: Added save status indicator
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  // Keyboard state for toolbar positioning
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  // Delete confirmation action sheet
  const [deleteConfirmNoteId, setDeleteConfirmNoteId] = useState<string | null>(null);

  const editorRef = useRef<TipTapEditorRef>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const editorErrorKey = useRef(0); // For resetting error boundary

  // Detect keyboard open/close on mobile
  // FIX #5: Check for both undefined AND null
  useEffect(() => {
    if (typeof visualViewport === 'undefined' || visualViewport === null) return;

    const vv = visualViewport; // Capture for closure

    const handleResize = () => {
      // If viewport height is significantly smaller than window height, keyboard is open
      const viewportHeight = vv.height;
      const windowHeight = window.innerHeight;
      const isOpen = viewportHeight < windowHeight * 0.75;
      setIsKeyboardOpen(isOpen);
    };

    vv.addEventListener('resize', handleResize);
    return () => vv.removeEventListener('resize', handleResize);
  }, []);

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

  // #5: Debounced save with status indicator
  useEffect(() => {
    if (isLoading) return;

    // Mark as unsaved when notes change
    setSaveStatus('unsaved');

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Save after 500ms of inactivity
    saveTimeoutRef.current = window.setTimeout(async () => {
      setSaveStatus('saving');
      const success = await StorageService.saveNotes(notes);
      setSaveStatus(success ? 'saved' : 'unsaved');
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

  // Get selected folder
  const selectedFolder = folders.find(f => f.id === selectedFolderId) || folders[0];
  const folderName = selectedFolder?.name || 'Notes';

  // Filter notes by selected folder
  const filteredNotes = useMemo(() => {
    if (selectedFolderId === 'all') {
      return notes;
    }
    return notes.filter(n => n.folderId === selectedFolderId);
  }, [notes, selectedFolderId]);

  // Handle folder selection
  const handleSelectFolder = useCallback((folderId: string) => {
    setSelectedFolderId(folderId);
    setShowFolders(false);
  }, []);

  // Show folders sidebar
  const handleShowFolders = useCallback(() => {
    setShowFolders(true);
  }, []);

  // Hide folders sidebar
  const handleHideFolders = useCallback(() => {
    setShowFolders(false);
  }, []);

  // Handle content change
  const handleContentChange = useCallback((content: string) => {
    if (!selectedNoteId) return;

    setNotes(prev => prev.map(note =>
      note.id === selectedNoteId
        ? { ...note, content, title: getTitle(content), updatedAt: Date.now() }
        : note
    ));
  }, [selectedNoteId]);

  // #15: Fixed focus timing with requestAnimationFrame
  // FIX #4: Add max attempts to prevent infinite loop
  const focusEditor = useCallback(() => {
    let attempts = 0;
    const maxAttempts = 30; // ~500ms at 60fps

    const tryFocus = () => {
      attempts++;
      const editor = editorRef.current?.getEditor();
      if (editor && !editor.isDestroyed) {
        editorRef.current?.focus();
      } else if (attempts < maxAttempts) {
        requestAnimationFrame(tryFocus);
      }
      // After max attempts, silently give up - editor may not be ready
    };
    requestAnimationFrame(tryFocus);
  }, []);

  // Create new note
  const handleCreateNote = useCallback(() => {
    const newNote: Note = {
      id: generateId(),
      folderId: 'notes',
      title: 'New Note',
      content: 'New Note\n\n',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPinned: false,
    };
    triggerHaptic('light');
    setNotes(prev => [newNote, ...prev]);
    setSelectedNoteId(newNote.id);
    setShowList(false);

    // #15: Use proper focus timing
    focusEditor();
  }, [focusEditor]);

  // #1: Fixed delete race condition - removed setTimeout inside state setter
  // Now uses a separate effect to handle selection after delete
  const handleDeleteNote = useCallback((noteId?: string) => {
    const idToDelete = noteId || selectedNoteId;
    if (!idToDelete) return;
    triggerHaptic('warning');
    setNotes(prev => prev.filter(n => n.id !== idToDelete));
    setDeleteConfirmNoteId(null);
  }, [selectedNoteId]);

  // Show delete confirmation action sheet
  const handleRequestDelete = useCallback((noteId?: string) => {
    const idToConfirm = noteId || selectedNoteId;
    if (!idToConfirm) return;
    triggerHaptic('warning');
    setDeleteConfirmNoteId(idToConfirm);
  }, [selectedNoteId]);

  // Cancel delete confirmation
  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmNoteId(null);
  }, []);

  // #1: Handle selection after note deletion (separate effect avoids race condition)
  useEffect(() => {
    if (selectedNoteId && !notes.find(n => n.id === selectedNoteId)) {
      // Selected note was deleted, select next available
      const nextNote = notes[0];
      setSelectedNoteId(nextNote?.id || null);
      if (!nextNote) {
        setShowList(true);
      }
    }
  }, [notes, selectedNoteId]);

  // Toggle pin
  const handleTogglePin = useCallback(() => {
    if (!selectedNoteId) return;

    setNotes(prev => prev.map(note =>
      note.id === selectedNoteId
        ? { ...note, isPinned: !note.isPinned }
        : note
    ));
  }, [selectedNoteId]);

  // Reorder notes (drag-to-reorder)
  const handleReorderNote = useCallback((noteId: string, newIndex: number) => {
    setNotes(prev => {
      const noteIndex = prev.findIndex(n => n.id === noteId);
      if (noteIndex === -1 || noteIndex === newIndex) return prev;

      const newNotes = [...prev];
      const [removed] = newNotes.splice(noteIndex, 1);
      newNotes.splice(newIndex, 0, removed);
      return newNotes;
    });
  }, []);

  // Select note
  const handleSelectNote = useCallback((note: Note) => {
    setSelectedNoteId(note.id);
    setShowList(false);
  }, []);

  // Handle back navigation
  const handleBack = useCallback(() => {
    setShowList(true);
  }, []);

  // #3: Reset handler for error boundary
  const handleEditorReset = useCallback(() => {
    editorErrorKey.current += 1;
  }, []);

  if (isLoading) {
    return <div className="notes-editor notes-editor--loading">Loading...</div>;
  }

  // Get the note being deleted for the action sheet
  const noteToDelete = deleteConfirmNoteId ? notes.find(n => n.id === deleteConfirmNoteId) : null;

  return (
    <div className="notes-editor">
      {/* Folders Sidebar */}
      <aside className={`notes-editor__folders ${showFolders ? 'notes-editor__folders--visible' : ''}`}>
        <FoldersSidebar
          folders={folders}
          notes={notes}
          selectedFolderId={selectedFolderId}
          onSelectFolder={handleSelectFolder}
          onBack={handleHideFolders}
        />
      </aside>

      {/* Notes List Sidebar */}
      <aside className={`notes-editor__sidebar ${!showList ? 'notes-editor__sidebar--hidden' : ''} ${showFolders ? 'notes-editor__sidebar--folders-open' : ''}`}>
        <NotesList
          notes={filteredNotes}
          selectedId={selectedNoteId}
          onSelect={handleSelectNote}
          onCreateNote={handleCreateNote}
          onDelete={handleRequestDelete}
          onReorder={handleReorderNote}
          selectedFolderId={selectedFolderId}
          folderName={folderName}
          onShowFolders={handleShowFolders}
        />
      </aside>

      {/* Editor Panel */}
      <main className={`notes-editor__main ${showList ? 'notes-editor__main--hidden' : ''}`}>
        {selectedNote ? (
          <>
            {/* Mobile back button */}
            <div className="notes-editor__mobile-header">
              {/* #14: Added aria-label */}
              <button
                className="notes-editor__back-btn"
                onClick={handleBack}
                aria-label="Go back to notes list"
              >
                {Icons.chevronLeft}
                <span>Notes</span>
              </button>
              {/* #5: Save status indicator */}
              <span className={`notes-editor__save-status notes-editor__save-status--${saveStatus}`}>
                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Unsaved'}
              </span>
            </div>

            {/* Toolbar with save status on desktop */}
            <EditorToolbar
              editorRef={editorRef}
              onDelete={() => handleRequestDelete()}
              onTogglePin={handleTogglePin}
              isPinned={selectedNote.isPinned}
              saveStatus={saveStatus}
              isKeyboardOpen={isKeyboardOpen}
            />

            {/* #3: TipTap Editor wrapped in error boundary */}
            <div className="notes-editor__content">
              <EditorErrorBoundary key={editorErrorKey.current} onReset={handleEditorReset}>
                <TipTapEditor
                  ref={editorRef}
                  content={selectedNote.content}
                  onContentChange={handleContentChange}
                  placeholder="Start writing..."
                />
              </EditorErrorBoundary>
            </div>

            {/* Text selection formatting popup */}
            <SelectionPopup editorRef={editorRef} />
          </>
        ) : (
          <div className="notes-editor__empty">
            <p>Select a note or create a new one</p>
            <button onClick={handleCreateNote}>Create Note</button>
          </div>
        )}
      </main>

      {/* Delete confirmation action sheet */}
      <ActionSheet
        isOpen={deleteConfirmNoteId !== null}
        title="Delete Note"
        message={noteToDelete ? `"${getTitle(noteToDelete.content)}" will be deleted permanently.` : undefined}
        actions={[
          {
            label: 'Delete Note',
            onClick: () => handleDeleteNote(deleteConfirmNoteId!),
            destructive: true,
          },
        ]}
        onCancel={handleCancelDelete}
      />
    </div>
  );
}
