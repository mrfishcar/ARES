/**
 * Unified Home Page
 * Beautiful, simple note-taker with live entity garden
 *
 * Left: Distraction-free writing
 * Right: Your knowledge garden growing in real-time
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotes } from '../lib/useNotes';
import { useEntities } from '../lib/useEntities';
import { MiniGarden } from '../components/MiniGarden';
import { CodeMirrorEditor } from '../components/CodeMirrorEditor';

interface UnifiedHomePageProps {
  project: string;
  toast: any;
}

export function UnifiedHomePage({ project, toast }: UnifiedHomePageProps) {
  const navigate = useNavigate();
  const { notes, createNote, updateNote } = useNotes({ project });
  const { entities } = useEntities({ project });

  // Editor state
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // UI state
  const [focusMode, setFocusMode] = useState(false); // Hide garden, full focus
  const [showGardenFull, setShowGardenFull] = useState(false); // Show only garden
  const [newEntityCount, setNewEntityCount] = useState(0);
  const [showAdvancedMenu, setShowAdvancedMenu] = useState(false);
  const [showNotesVault, setShowNotesVault] = useState(false); // Notes organizer sidebar

  // Refs
  const saveTimeoutRef = useRef<number>();
  const previousEntityCountRef = useRef(entities.length);

  // Word count
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  // Auto-save after 2 seconds of inactivity
  const autoSave = useCallback(async () => {
    if (!text.trim() && !title.trim()) return;

    setIsSaving(true);

    try {
      // Combine title and text into markdown
      const markdown = title.trim()
        ? `# ${title}\n\n${text}`
        : text;

      if (currentNoteId) {
        // Update existing note
        await updateNote(currentNoteId, { markdown });
      } else {
        // Create new note
        const note = await createNote({
          markdown,
          attachments: [],
        });
        setCurrentNoteId(note.id);
      }

      setLastSaved(new Date());
    } catch (error) {
      console.error('Auto-save failed:', error);
      toast.error(`Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  }, [title, text, currentNoteId, createNote, updateNote, toast]);

  // Trigger auto-save on title or text change
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      autoSave();
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [title, text, autoSave]);

  // Detect new entities
  useEffect(() => {
    if (entities.length > previousEntityCountRef.current) {
      const newCount = entities.length - previousEntityCountRef.current;
      setNewEntityCount(newCount);

      // Show notification
      toast.success(`${newCount} new ${newCount === 1 ? 'entity' : 'entities'} discovered!`, {
        duration: 2000,
      });

      // Mark newest entities
      setTimeout(() => setNewEntityCount(0), 3000);
    }

    previousEntityCountRef.current = entities.length;
  }, [entities.length, toast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + B = Toggle focus mode
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setFocusMode(f => !f);
      }

      // Tab = Toggle garden view
      if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        // Only if not in CodeMirror editor
        const activeElement = document.activeElement;
        const isInEditor = activeElement?.closest('.cm-editor');
        if (!isInEditor) {
          e.preventDefault();
          setShowGardenFull(g => !g);
        }
      }

      // Escape = Exit full views and close menus
      if (e.key === 'Escape') {
        setFocusMode(false);
        setShowGardenFull(false);
        setShowAdvancedMenu(false);
        setShowNotesVault(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close advanced menu when clicking outside
  useEffect(() => {
    if (!showAdvancedMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-advanced-menu]')) {
        setShowAdvancedMenu(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showAdvancedMenu]);

  // Handle entity click in garden
  const handleEntityClick = (entity: any) => {
    // For now, just navigate to entities page
    navigate(`/entities?entity=${entity.id}`);
  };

  // Format entity data for garden
  const gardenEntities = entities.slice(0, 50).map((entity, index) => ({
    id: entity.id,
    name: entity.name,
    type: entity.types?.[0] || 'CONCEPT',
    mentions: entity.mentionCount || 1,
    isNew: index >= entities.length - newEntityCount,
  }));

  // Status bar text
  const getSaveStatus = () => {
    if (isSaving) return 'Saving...';
    if (lastSaved) {
      const seconds = Math.floor((Date.now() - lastSaved.getTime()) / 1000);
      if (seconds < 5) return 'Saved just now';
      if (seconds < 60) return `Saved ${seconds}s ago`;
      const minutes = Math.floor(seconds / 60);
      return `Saved ${minutes}m ago`;
    }
    return 'Start writing...';
  };

  // Render garden-only view
  if (showGardenFull) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
        }}
      >
        <div style={{ maxWidth: '1000px', width: '100%', padding: '40px' }}>
          <div style={{ marginBottom: '32px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '32px', fontWeight: '300', color: '#111827', marginBottom: '8px' }}>
              Your Knowledge Garden
            </h1>
            <p style={{ fontSize: '15px', color: '#6b7280' }}>
              {entities.length} entities growing · Press Tab or Esc to return to writing
            </p>
          </div>

          <MiniGarden
            entities={gardenEntities}
            width={900}
            height={600}
            onEntityClick={handleEntityClick}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: '#ffffff',
      }}
    >
      {/* Notes Vault Sidebar */}
      {showNotesVault && (
        <div
          style={{
            width: '280px',
            borderRight: '1px solid #e5e7eb',
            display: 'flex',
            flexDirection: 'column',
            background: '#f9fafb',
          }}
        >
          {/* Vault header */}
          <div
            style={{
              padding: '20px',
              borderBottom: '1px solid #e5e7eb',
              background: '#ffffff',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: 0 }}>
              Notes
            </h3>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0 0' }}>
              {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            </p>
          </div>

          {/* Notes list */}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
            {notes.slice(0, 50).map((note) => {
              const noteTitle = note.title || note.markdown.split('\n')[0].replace(/^#\s*/, '').trim() || 'Untitled';
              const isActive = note.id === currentNoteId;

              return (
                <div
                  key={note.id}
                  onClick={() => {
                    setCurrentNoteId(note.id);
                    setTitle(note.title || '');
                    setText(note.markdown);
                    toast.success('Loaded note');
                  }}
                  style={{
                    padding: '12px',
                    marginBottom: '4px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: isActive ? '#ffffff' : 'transparent',
                    border: isActive ? '1px solid #e5e7eb' : '1px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: '500', color: '#111827', marginBottom: '4px' }}>
                    {noteTitle.slice(0, 50)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Left Side - Writing Canvas */}
      <div
        style={{
          flex: focusMode ? 1 : '0 0 60%',
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.3s ease',
        }}
      >
        {/* Minimal header */}
        <div
          style={{
            padding: '20px 40px',
            borderBottom: '1px solid #f3f4f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={() => setShowNotesVault(!showNotesVault)}
              style={{
                background: 'none',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '16px',
                color: '#6b7280',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Toggle notes vault"
            >
              ☰
            </button>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              {getSaveStatus()}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#9ca3af' }}>
              {wordCount} {wordCount === 1 ? 'word' : 'words'}
            </span>

            <button
              onClick={() => {
                setTitle('');
                setText('');
                setCurrentNoteId(null);
                setLastSaved(null);
                toast.success('Started new note');
              }}
              style={{
                background: 'none',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '13px',
                color: '#6b7280',
                cursor: 'pointer',
              }}
              title="Start a new note"
            >
              New Note
            </button>

            <button
              onClick={() => setFocusMode(!focusMode)}
              style={{
                background: 'none',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '13px',
                color: '#6b7280',
                cursor: 'pointer',
              }}
              title="Toggle focus mode (Cmd+B)"
            >
              {focusMode ? 'Show Garden' : 'Focus'}
            </button>

            <div style={{ position: 'relative' }} data-advanced-menu>
              <button
                onClick={() => setShowAdvancedMenu(!showAdvancedMenu)}
                style={{
                  background: 'none',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '13px',
                  color: '#6b7280',
                  cursor: 'pointer',
                }}
                title="Advanced features"
              >
                Advanced ▾
              </button>

              {showAdvancedMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '4px',
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                    minWidth: '160px',
                    zIndex: 1000,
                  }}
                >
                  <button
                    onClick={() => {
                      navigate('/notes');
                      setShowAdvancedMenu(false);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '10px 16px',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      fontSize: '14px',
                      color: '#374151',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f3f4f6',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    📝 Notes
                  </button>
                  <button
                    onClick={() => {
                      navigate('/entities');
                      setShowAdvancedMenu(false);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '10px 16px',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      fontSize: '14px',
                      color: '#374151',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f3f4f6',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    🔍 Entities
                  </button>
                  <button
                    onClick={() => {
                      navigate('/relations');
                      setShowAdvancedMenu(false);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '10px 16px',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      fontSize: '14px',
                      color: '#374151',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f3f4f6',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    🔗 Relations
                  </button>
                  <button
                    onClick={() => {
                      navigate('/graph');
                      setShowAdvancedMenu(false);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '10px 16px',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      fontSize: '14px',
                      color: '#374151',
                      cursor: 'pointer',
                      borderRadius: '0 0 8px 8px',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    🕸️ Graph
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Writing area */}
        <div style={{ flex: 1, padding: '40px', overflow: 'auto' }}>
          <div style={{ maxWidth: '700px', margin: '0 auto' }}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title..."
              style={{
                width: '100%',
                border: 'none',
                outline: 'none',
                fontSize: '32px',
                fontWeight: '600',
                color: '#111827',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                background: 'transparent',
                marginBottom: '16px',
              }}
            />

            <CodeMirrorEditor
              value={text}
              onChange={(newText) => setText(newText)}
              minHeight="calc(100vh - 280px)"
            />
          </div>
        </div>

        {/* Helper text */}
        <div
          style={{
            padding: '16px 40px',
            borderTop: '1px solid #f3f4f6',
            fontSize: '12px',
            color: '#9ca3af',
            display: 'flex',
            gap: '20px',
          }}
        >
          <span>💡 Tag entities: #Frodo:PERSON #Shire:PLACE</span>
          <span>⌨️ Cmd+B for focus mode</span>
          <span>⇥ Tab to view garden</span>
        </div>
      </div>

      {/* Right Side - Knowledge Garden */}
      {!focusMode && (
        <div
          style={{
            flex: '0 0 40%',
            background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
            borderLeft: '1px solid #e5e7eb',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Garden header */}
          <div
            style={{
              padding: '20px',
              borderBottom: '1px solid #e5e7eb',
              background: 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
              Your Knowledge Garden
            </h2>
            <p style={{ fontSize: '13px', color: '#6b7280' }}>
              {entities.length === 0
                ? 'Start writing to grow your garden...'
                : `${entities.length} ${entities.length === 1 ? 'entity' : 'entities'} growing`}
            </p>
          </div>

          {/* Garden visualization */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
          >
            {entities.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌱</div>
                <div style={{ fontSize: '15px' }}>
                  Your garden is waiting to grow...
                </div>
                <div style={{ fontSize: '13px', marginTop: '8px', opacity: 0.7 }}>
                  Start writing and watch entities bloom
                </div>
              </div>
            ) : (
              <MiniGarden
                entities={gardenEntities}
                width={400}
                height={400}
                onEntityClick={handleEntityClick}
              />
            )}
          </div>

          {/* Garden footer */}
          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid #e5e7eb',
              background: 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'blur(8px)',
              textAlign: 'center',
            }}
          >
            <button
              onClick={() => setShowGardenFull(true)}
              style={{
                background: 'transparent',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                color: '#6b7280',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              Explore Full Garden →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
