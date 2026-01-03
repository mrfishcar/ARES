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
  // Note: navigator.vibrate is NOT supported on iOS Safari.
  // True haptic feedback on iOS requires native app integration (UIImpactFeedbackGenerator).
  // This only works on Android Chrome and some desktop browsers.
  // For a web app targeting iOS, consider visual feedback as primary indicator.
  if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
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
    } catch {
      // Silently fail if vibrate is not supported
    }
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
  tags: string[];
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Folder {
  id: string;
  name: string;
  icon: string;
  isSystem: boolean;
  parentId: string | null;
  smartFilter?: SmartFilter;
}

export interface SmartFilter {
  type: 'hasTag' | 'hasTasks' | 'hasChecklist' | 'recentlyEdited' | 'hasAttachments';
  value?: string;
}

// ============================================================================
// STORAGE SERVICE
// ============================================================================

const STORAGE_KEYS = {
  NOTES: 'notes-editor-notes',
  FOLDERS: 'notes-editor-folders',
  TAGS: 'notes-editor-tags',
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

  static save<T>(key: string, value: T): { success: boolean; error?: 'quota' | 'unknown' } {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return { success: true };
    } catch (e) {
      console.error(`Failed to save ${key}:`, e);
      // Check if it's a quota exceeded error
      if (e instanceof DOMException && (
        e.code === 22 || // Chrome/Safari quota exceeded
        e.name === 'QuotaExceededError' ||
        e.name === 'NS_ERROR_DOM_QUOTA_REACHED' // Firefox
      )) {
        return { success: false, error: 'quota' };
      }
      return { success: false, error: 'unknown' };
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

  static async saveNotes(notes: Note[]): Promise<{ success: boolean; error?: 'quota' | 'unknown' }> {
    try {
      return this.save(STORAGE_KEYS.NOTES, notes);
    } catch (e) {
      console.error('Failed to save notes:', e);
      return { success: false, error: 'unknown' };
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

  static async saveFolders(folders: Folder[]): Promise<{ success: boolean; error?: 'quota' | 'unknown' }> {
    try {
      return this.save(STORAGE_KEYS.FOLDERS, folders);
    } catch (e) {
      console.error('Failed to save folders:', e);
      return { success: false, error: 'unknown' };
    }
  }

  static async loadTags(): Promise<Tag[]> {
    try {
      return this.load(STORAGE_KEYS.TAGS, DEFAULT_TAGS);
    } catch (e) {
      console.error('Failed to load tags:', e);
      return DEFAULT_TAGS;
    }
  }

  static async saveTags(tags: Tag[]): Promise<{ success: boolean; error?: 'quota' | 'unknown' }> {
    try {
      return this.save(STORAGE_KEYS.TAGS, tags);
    } catch (e) {
      console.error('Failed to save tags:', e);
      return { success: false, error: 'unknown' };
    }
  }
}

// ============================================================================
// DEFAULT DATA
// ============================================================================

const DEFAULT_FOLDERS: Folder[] = [
  { id: 'all', name: 'All Notes', icon: 'folder', isSystem: true, parentId: null },
  { id: 'notes', name: 'Notes', icon: 'folder', isSystem: true, parentId: 'all' },
  // Smart folders
  { id: 'smart-tasks', name: 'With Checklists', icon: 'checkbox', isSystem: true, parentId: null, smartFilter: { type: 'hasChecklist' } },
  { id: 'smart-recent', name: 'Recently Edited', icon: 'clock', isSystem: true, parentId: null, smartFilter: { type: 'recentlyEdited' } },
];

const DEFAULT_TAGS: Tag[] = [
  { id: 'work', name: 'Work', color: '#FF9500' },
  { id: 'personal', name: 'Personal', color: '#007AFF' },
  { id: 'ideas', name: 'Ideas', color: '#34C759' },
  { id: 'todo', name: 'To Do', color: '#FF3B30' },
  { id: 'archive', name: 'Archive', color: '#8E8E93' },
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
    tags: ['ideas'],
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
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  tag: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <circle cx="7" cy="7" r="1" fill="currentColor" />
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
  let preview = lines.slice(1, 3).join(' ').trim();

  // Strip markdown formatting markers for clean preview
  preview = preview
    .replace(/\*\*([^*]+)\*\*/g, '$1')     // **bold**
    .replace(/__([^_]+)__/g, '$1')          // __underline__
    .replace(/~~([^~]+)~~/g, '$1')          // ~~strikethrough~~
    .replace(/==([^=]+)==/g, '$1')          // ==highlight==
    .replace(/(?:^|[^\\])_([^_]+)_/g, (m, c) => m.startsWith('_') ? c : m[0] + c) // _italic_
    .replace(/`([^`]+)`/g, '$1')            // `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link](url) → link
    .replace(/^#+\s+/gm, '')                 // # headings
    .replace(/^- \[[ x]\] /gm, '')           // - [ ] tasks
    .replace(/^[•\-]\s+/gm, '')              // bullet points
    .replace(/^\d+\.\s+/gm, '');             // numbered lists

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

  // Add remaining month sections sorted chronologically (newest first)
  // Parse "Month Year" format and sort by date
  const monthSections = Array.from(dateGroups.entries()).map(([title, notes]) => {
    // Parse the title to get a sortable date
    // Format is "Month Year" e.g., "December 2024"
    const date = new Date(title + ' 1'); // Add day to make it parseable
    return { title, notes, sortDate: date.getTime() };
  });

  // Sort by date descending (newest first)
  monthSections.sort((a, b) => b.sortDate - a.sortDate);
  for (const { title, notes: sectionNotes } of monthSections) {
    sections.push({ title, notes: sectionNotes });
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

// Get icon for folder based on icon name
function getFolderIcon(iconName: string, isSelected: boolean): React.ReactNode {
  switch (iconName) {
    case 'checkbox':
      return Icons.checkbox;
    case 'clock':
      return Icons.clock;
    case 'tag':
      return Icons.tag;
    default:
      return isSelected ? Icons.folderFilled : Icons.folder;
  }
}

// Apply smart filter to notes
function applySmartFilter(notes: Note[], filter: SmartFilter): Note[] {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  switch (filter.type) {
    case 'hasTag':
      return notes.filter(n => n.tags?.includes(filter.value || ''));
    case 'hasChecklist':
    case 'hasTasks':
      // Both check for task list items (unchecked or checked)
      return notes.filter(n => n.content.includes('- [ ]') || n.content.includes('- [x]'));
    case 'recentlyEdited':
      // Notes edited in the last 24 hours (more intuitive for "recently")
      return notes.filter(n => now - n.updatedAt < dayMs);
    case 'hasAttachments':
      // Not implemented - return empty until attachments are supported
      console.warn('hasAttachments filter is not yet implemented');
      return [];
    default:
      // Exhaustive check - TypeScript will error if new filter types are added
      const _exhaustive: never = filter.type;
      console.warn(`Unknown smart filter type: ${_exhaustive}`);
      return notes;
  }
}

function FoldersSidebar({ folders, notes, selectedFolderId, onSelectFolder, onBack }: FoldersSidebarProps) {
  // Count notes per folder (including smart folder filtering)
  const noteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const folder of folders) {
      if (folder.id === 'all') {
        counts[folder.id] = notes.length;
      } else if (folder.smartFilter) {
        counts[folder.id] = applySmartFilter(notes, folder.smartFilter).length;
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
    const isSmart = !!folder.smartFilter;

    return (
      <div key={folder.id}>
        <button
          className={`folders-sidebar__item ${isSelected ? 'folders-sidebar__item--selected' : ''} ${isSmart ? 'folders-sidebar__item--smart' : ''}`}
          style={{ paddingLeft: `${16 + depth * 16}px` }}
          onClick={() => {
            triggerHaptic('selection');
            onSelectFolder(folder.id);
          }}
        >
          <span className="folders-sidebar__item-icon">
            {getFolderIcon(folder.icon, isSelected)}
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
  totalNotesCount: number; // Total notes across all folders (for empty state detection)
  selectedId: string | null;
  onSelect: (note: Note) => void;
  onCreateNote: () => void;
  onDelete: (noteId: string) => void;
  onReorder: (noteId: string, newIndex: number) => void;
  selectedFolderId: string;
  folderName: string;
  onShowFolders: () => void;
  tags: Tag[];
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
  tags: Tag[];
}

function NoteItem({ note, index, isSelected, onSelect, onDelete, isDragging, isDropTarget, onDragStart, onDragOver, onDragEnd, tags }: NoteItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentXRef = useRef(0);
  const longPressTimerRef = useRef<number | null>(null);
  const [isLongPressing, setIsLongPressing] = useState(false);
  // FIX: Lock gesture direction to prevent scroll/swipe conflicts
  const gestureLockRef = useRef<'horizontal' | 'vertical' | null>(null);

  const SWIPE_THRESHOLD = 80; // Pixels to reveal delete button
  const DELETE_THRESHOLD = 150; // Pixels to trigger delete
  const LONG_PRESS_DURATION = 500; // ms to start drag
  const GESTURE_LOCK_THRESHOLD = 12; // Pixels before deciding swipe vs scroll

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
    // Reset gesture lock at start of new touch
    gestureLockRef.current = null;

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
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

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
    if (absDeltaX > 10 || absDeltaY > 10) {
      clearLongPressTimer();
      setIsLongPressing(false);
    }

    // FIX: Lock gesture direction once we exceed threshold
    // This prevents accidental swipe when user is trying to scroll
    if (!gestureLockRef.current && (absDeltaX > GESTURE_LOCK_THRESHOLD || absDeltaY > GESTURE_LOCK_THRESHOLD)) {
      // Lock to whichever direction had more movement
      gestureLockRef.current = absDeltaX > absDeltaY ? 'horizontal' : 'vertical';
    }

    // Only allow swipe if gesture is locked to horizontal (or not locked yet but clearly horizontal)
    if (!isLongPressing && gestureLockRef.current === 'horizontal') {
      setIsSwiping(true);
      const newX = Math.min(0, Math.max(-DELETE_THRESHOLD, currentXRef.current + deltaX));
      setSwipeX(newX);
      // Prevent scroll when swiping
      e.preventDefault();
    }
    // If locked to vertical, let the scroll happen naturally (don't call preventDefault)
  };

  const handleTouchEnd = () => {
    clearLongPressTimer();
    setIsLongPressing(false);
    gestureLockRef.current = null;

    // If we were dragging, end the drag
    if (isDragging) {
      onDragEnd();
      return;
    }

    setIsSwiping(false);

    // Only process swipe result if we were actually swiping
    if (swipeX < -DELETE_THRESHOLD + 20) {
      // Trigger delete with haptic
      triggerHaptic('warning');
      onDelete();
    } else if (swipeX < -SWIPE_THRESHOLD / 2) {
      // Snap to reveal delete button
      setSwipeX(-SWIPE_THRESHOLD);
      triggerHaptic('selection');
    } else if (swipeX !== 0) {
      // Snap back only if we had some swipe
      setSwipeX(0);
    }
  };

  // Get animation transition based on state
  const getSwipeTransition = () => {
    if (isSwiping) return 'none';
    // Snap to threshold: crisp, quick
    if (swipeX === -SWIPE_THRESHOLD) return 'transform 0.25s cubic-bezier(0.33, 1, 0.68, 1)';
    // Snap back: bouncier spring for satisfying feel
    return 'transform 0.35s cubic-bezier(0.25, 1.25, 0.5, 1)';
  };

  // FIX #10: Handle touch cancel (e.g., notification appears mid-swipe)
  const handleTouchCancel = () => {
    clearLongPressTimer();
    setIsLongPressing(false);
    setIsSwiping(false);
    setSwipeX(0);
    gestureLockRef.current = null;
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
          transition: getSwipeTransition(),
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
        {note.tags && note.tags.length > 0 && (
          <div className="notes-list__item-tags">
            {note.tags.slice(0, 3).map(tagId => {
              const tag = tags.find(t => t.id === tagId);
              return (
                <span
                  key={tagId}
                  className="notes-list__item-tag"
                  style={tag?.color ? {
                    // Use color-mix for proper alpha support with any color format
                    backgroundColor: `color-mix(in srgb, ${tag.color} 15%, transparent)`,
                    color: tag.color
                  } : undefined}
                >
                  {tag?.name || tagId}
                </span>
              );
            })}
            {note.tags.length > 3 && (
              <span className="notes-list__item-tag notes-list__item-tag--more">
                +{note.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </button>
    </div>
  );
}

function NotesList({ notes, totalNotesCount, selectedId, onSelect, onCreateNote, onDelete, onReorder, selectedFolderId, folderName, onShowFolders, tags }: NotesListProps) {
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

  // Throttle haptic feedback during drag to avoid excessive vibrations
  const lastHapticTimeRef = useRef(0);
  const HAPTIC_THROTTLE_MS = 100;

  const handleDragOver = useCallback((index: number) => {
    if (index !== dropTargetIndex) {
      setDropTargetIndex(index);
      // Throttle haptic feedback
      const now = Date.now();
      if (now - lastHapticTimeRef.current > HAPTIC_THROTTLE_MS) {
        triggerHaptic('selection');
        lastHapticTimeRef.current = now;
      }
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

  // Filter notes by debounced search query
  // Note: We don't sort by updatedAt here - the notes array order is preserved
  // for drag-to-reorder functionality. Sections handle date grouping.
  const filteredNotes = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return notes;
    const query = debouncedSearchQuery.toLowerCase();
    return notes.filter(note =>
      note.content.toLowerCase().includes(query) ||
      getTitle(note.content).toLowerCase().includes(query)
    );
  }, [notes, debouncedSearchQuery]);

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
                    tags={tags}
                  />
                );
              })}
            </div>
          ));
        })()}
        {/* Search with no results */}
        {filteredNotes.length === 0 && searchQuery && (
          <div className="notes-list__empty">
            <p>No results for "{searchQuery}"</p>
          </div>
        )}
        {/* Folder has no notes (but app has notes elsewhere) */}
        {filteredNotes.length === 0 && !searchQuery && totalNotesCount > 0 && (
          <div className="notes-list__empty">
            <p>No notes in this folder</p>
            <button onClick={onCreateNote}>Create a note</button>
          </div>
        )}
        {/* App has no notes at all */}
        {totalNotesCount === 0 && (
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

    // Listen for selection changes with debounce to avoid excessive updates
    let debounceTimer: number | null = null;
    const debouncedCheckSelection = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(checkSelection, 50);
    };

    document.addEventListener('selectionchange', debouncedCheckSelection);
    return () => {
      document.removeEventListener('selectionchange', debouncedCheckSelection);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, []);

  // Hide on scroll (but not when scrolling inside the editor)
  useEffect(() => {
    const hideOnScroll = (e: Event) => {
      // Don't hide if scrolling inside the editor content area
      // This allows scrolling the document without losing the selection popup
      const target = e.target as Element;
      if (target?.closest?.('.ios-tiptap-editor, .ios-tiptap-wrapper, .notes-editor__content')) {
        return;
      }
      setIsVisible(false);
    };
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

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

  // Focus trap and keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    // Store previously focused element
    previousActiveElement.current = document.activeElement;

    // Focus the sheet for keyboard navigation
    requestAnimationFrame(() => {
      const firstButton = sheetRef.current?.querySelector('button');
      firstButton?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }

      // Focus trap - Tab key
      if (e.key === 'Tab') {
        const focusableElements = sheetRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements || focusableElements.length === 0) return;

        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey) {
          // Shift+Tab: if on first element, wrap to last
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: if on last element, wrap to first
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus when closing
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return createPortal(
    <div className="action-sheet-overlay" onClick={onCancel}>
      <div ref={sheetRef} className="action-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby={title ? 'action-sheet-title' : undefined}>
        {(title || message) && (
          <div className="action-sheet__header">
            {title && <div id="action-sheet-title" className="action-sheet__title">{title}</div>}
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
  const [tags, setTags] = useState<Tag[]>(DEFAULT_TAGS);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [showList, setShowList] = useState(true);
  const [showFolders, setShowFolders] = useState(false);
  // #5: Added save status indicator
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  // Storage error state for user feedback
  const [storageError, setStorageError] = useState<'quota' | 'unknown' | null>(null);
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
      const [loadedNotes, loadedFolders, loadedTags] = await Promise.all([
        StorageService.loadNotes(),
        StorageService.loadFolders(),
        StorageService.loadTags(),
      ]);
      setNotes(loadedNotes);
      setFolders(loadedFolders);
      setTags(loadedTags);

      // Select first note if none selected, or validate existing selection
      if (loadedNotes.length > 0) {
        setSelectedNoteId(prev => {
          // If previous selection exists and is valid, keep it
          if (prev && loadedNotes.find(n => n.id === prev)) {
            return prev;
          }
          // Otherwise select first note
          return loadedNotes[0].id;
        });
      }

      setIsLoading(false);
    }
    loadData();
  }, []);

  // Track if we've loaded initial data (to avoid flash of "unsaved" on mount)
  const hasLoadedRef = useRef(false);
  const previousNotesRef = useRef<Note[] | null>(null);

  // #5: Debounced save with status indicator
  useEffect(() => {
    if (isLoading) return;

    // Skip the first run after loading - notes haven't actually changed
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      previousNotesRef.current = notes;
      return;
    }

    // Check if notes actually changed (deep compare would be expensive, so compare length + ids)
    const prevNotes = previousNotesRef.current;
    const notesChanged = !prevNotes ||
      prevNotes.length !== notes.length ||
      prevNotes.some((pn, i) => pn.id !== notes[i]?.id || pn.content !== notes[i]?.content || pn.updatedAt !== notes[i]?.updatedAt);

    if (!notesChanged) return;

    previousNotesRef.current = notes;

    // Mark as unsaved when notes change
    setSaveStatus('unsaved');
    setStorageError(null); // Clear previous errors

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Save after 500ms of inactivity
    saveTimeoutRef.current = window.setTimeout(async () => {
      setSaveStatus('saving');
      const result = await StorageService.saveNotes(notes);
      if (result.success) {
        setSaveStatus('saved');
        setStorageError(null);
      } else {
        setSaveStatus('unsaved');
        setStorageError(result.error || 'unknown');
      }
    }, 500);

    // Cleanup
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [notes, isLoading]);

  // Save folders when they change
  useEffect(() => {
    if (isLoading) return;
    StorageService.saveFolders(folders);
  }, [folders, isLoading]);

  // Save tags when they change
  useEffect(() => {
    if (isLoading) return;
    StorageService.saveTags(tags);
  }, [tags, isLoading]);

  // Get selected note
  const selectedNote = notes.find(n => n.id === selectedNoteId) || null;

  // Get selected folder
  const selectedFolder = folders.find(f => f.id === selectedFolderId) || folders[0];
  const folderName = selectedFolder?.name || 'Notes';

  // Filter notes by selected folder (including smart folder filters)
  const filteredNotes = useMemo(() => {
    if (selectedFolderId === 'all') {
      return notes;
    }

    // Check if this is a smart folder
    if (selectedFolder?.smartFilter) {
      return applySmartFilter(notes, selectedFolder.smartFilter);
    }

    return notes.filter(n => n.folderId === selectedFolderId);
  }, [notes, selectedFolderId, selectedFolder]);

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
  // FIX: Use ref to track mounted state and prevent post-unmount updates
  const focusEditorMountedRef = useRef(true);

  useEffect(() => {
    focusEditorMountedRef.current = true;
    return () => {
      focusEditorMountedRef.current = false;
    };
  }, []);

  const focusEditor = useCallback(() => {
    let attempts = 0;
    const maxAttempts = 30; // ~500ms at 60fps

    const tryFocus = () => {
      // Bail out if component unmounted
      if (!focusEditorMountedRef.current) return;

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
    // Determine folder for new note:
    // - If viewing a smart folder (has smartFilter), use default 'notes' folder
    // - If viewing 'all' folder, use default 'notes' folder
    // - Otherwise, use current folder
    const targetFolderId = (selectedFolder?.smartFilter || selectedFolderId === 'all')
      ? 'notes'
      : selectedFolderId;

    const newNote: Note = {
      id: generateId(),
      folderId: targetFolderId,
      title: 'New Note',
      content: 'New Note\n\n',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPinned: false,
      tags: [],
    };
    triggerHaptic('light');
    setNotes(prev => [newNote, ...prev]);
    setSelectedNoteId(newNote.id);
    setShowList(false);

    // #15: Use proper focus timing
    focusEditor();
  }, [focusEditor, selectedFolderId, selectedFolder]);

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
  // Note: Reordering is only meaningful within unpinned notes since pinned notes
  // are always shown first. This function preserves the pinned/unpinned grouping.
  const handleReorderNote = useCallback((noteId: string, newIndex: number) => {
    setNotes(prev => {
      const note = prev.find(n => n.id === noteId);
      if (!note) return prev;

      // Get pinned and unpinned groups
      const pinned = prev.filter(n => n.isPinned);
      const unpinned = prev.filter(n => !n.isPinned);

      if (note.isPinned) {
        // Reorder within pinned notes only
        const pinnedIndex = pinned.findIndex(n => n.id === noteId);
        const targetIndex = Math.min(Math.max(0, newIndex), pinned.length - 1);
        if (pinnedIndex === -1 || pinnedIndex === targetIndex) return prev;

        const newPinned = [...pinned];
        const [removed] = newPinned.splice(pinnedIndex, 1);
        newPinned.splice(targetIndex, 0, removed);
        return [...newPinned, ...unpinned];
      } else {
        // Reorder within unpinned notes only
        const unpinnedIndex = unpinned.findIndex(n => n.id === noteId);
        // Adjust target index to be relative to unpinned array
        const adjustedIndex = Math.max(0, newIndex - pinned.length);
        const targetIndex = Math.min(Math.max(0, adjustedIndex), unpinned.length - 1);
        if (unpinnedIndex === -1 || unpinnedIndex === targetIndex) return prev;

        const newUnpinned = [...unpinned];
        const [removed] = newUnpinned.splice(unpinnedIndex, 1);
        newUnpinned.splice(targetIndex, 0, removed);
        return [...pinned, ...newUnpinned];
      }
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
      {/* Storage Error Banner */}
      {storageError && (
        <div className="notes-editor__storage-error" role="alert">
          <span>
            {storageError === 'quota'
              ? '⚠️ Storage full. Delete some notes to save changes.'
              : '⚠️ Could not save. Check your browser settings.'}
          </span>
          <button onClick={() => setStorageError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

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
          totalNotesCount={notes.length}
          selectedId={selectedNoteId}
          onSelect={handleSelectNote}
          onCreateNote={handleCreateNote}
          onDelete={handleRequestDelete}
          onReorder={handleReorderNote}
          selectedFolderId={selectedFolderId}
          folderName={folderName}
          onShowFolders={handleShowFolders}
          tags={tags}
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
