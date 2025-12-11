/**
 * Notes Page
 * Simplified two-pane notebook experience with optional folder sidebar
 */

import { useState, useMemo, useEffect } from 'react';
import { useNotes, type Note, type NoteInput } from '../lib/useNotes';
import { useEntities } from '../lib/useEntities';
import { CodeMirrorEditor } from '../components/CodeMirrorEditor';
import { LoadingPage } from '../components/Loading';
import { MiniGarden } from '../components/MiniGarden';

interface NotesPageProps {
  project: string;
  toast: any;
}

interface FolderGroup {
  key: string;
  label: string;
}

function deriveFolderLabel(note: Note): string {
  const title = note.title?.trim() || note.markdown.trim();
  if (!title) return 'Unsorted';
  const firstChar = title.charAt(0).toUpperCase();
  return /[A-Z]/.test(firstChar) ? firstChar : 'Unsorted';
}

export function NotesPage({ project, toast }: NotesPageProps) {
  const {
    notes,
    loading,
    error,
    hasNextPage,
    totalApprox,
    loadMore,
    createNote,
    updateNote,
    deleteNote,
  } = useNotes({ project });

  const { entities: entityList, loading: entitiesLoading } = useEntities({ project });

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<string>('ALL');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [editMode, setEditMode] = useState<'create' | 'edit' | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editMarkdown, setEditMarkdown] = useState('');
  const [saving, setSaving] = useState(false);
  const [showGarden, setShowGarden] = useState(false);

  const folders = useMemo<FolderGroup[]>(() => {
    const counts = new Map<string, number>();
    notes.forEach(note => {
      const label = deriveFolderLabel(note);
      counts.set(label, (counts.get(label) || 0) + 1);
    });

    const entries = Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label]) => ({ key: label, label }));

    return [{ key: 'ALL', label: 'All Notes' }, ...entries];
  }, [notes]);

  const filteredNotes = useMemo(() => {
    if (selectedFolder === 'ALL') return notes;
    return notes.filter(note => deriveFolderLabel(note) === selectedFolder);
  }, [notes, selectedFolder]);

  // Extract entities mentioned in current note
  const gardenEntities = useMemo(() => {
    if (!selectedNote?.markdown) return [];

    // Find all entity tags in format #EntityName:TYPE
    const entityTagRegex = /#([A-Za-z0-9_]+):(PERSON|PLACE|ORG|OBJECT|EVENT|CONCEPT)/g;
    const mentionedNames = new Set<string>();
    let match;

    while ((match = entityTagRegex.exec(selectedNote.markdown)) !== null) {
      mentionedNames.add(match[1].toLowerCase());
    }

    // Filter to only entities mentioned in current note
    const mentionedEntities = entityList.filter(entity =>
      mentionedNames.has(entity.name.toLowerCase())
    );

    return mentionedEntities.map(entity => ({
      id: entity.id,
      name: entity.name,
      type: entity.types?.[0] || 'CONCEPT',
      mentions: entity.mentionCount || 1,
    }));
  }, [entityList, selectedNote]);

  useEffect(() => {
    if (!selectedNoteId && filteredNotes.length > 0) {
      setSelectedNoteId(filteredNotes[0].id);
      setSelectedNote(filteredNotes[0]);
    }
  }, [filteredNotes, selectedNoteId]);

  useEffect(() => {
    if (selectedNoteId) {
      const note = notes.find(n => n.id === selectedNoteId) || null;
      setSelectedNote(note);
    }
  }, [notes, selectedNoteId]);

  const resetEditor = () => {
    setEditMode(null);
    setEditTitle('');
    setEditMarkdown('');
  };

  const handleCreate = () => {
    setSelectedNote(null);
    setSelectedNoteId(null);
    setEditMode('create');
    setEditTitle('');
    setEditMarkdown('');
  };

  const handleEdit = (note: Note) => {
    setSelectedNote(note);
    setSelectedNoteId(note.id);
    setEditMode('edit');
    setEditTitle(note.title || '');
    setEditMarkdown(note.markdown);
  };

  const handleCancel = () => {
    resetEditor();
    if (selectedNote) {
      setEditTitle(selectedNote.title || '');
      setEditMarkdown(selectedNote.markdown);
    }
  };

  const handleSave = async () => {
    if (!editMarkdown.trim()) {
      toast.error('Markdown content is required');
      return;
    }

    setSaving(true);

    try {
      const input: NoteInput = {
        title: editTitle.trim() || undefined,
        markdown: editMarkdown,
        attachments: [],
      };

      let note: Note | undefined;

      if (editMode === 'create') {
        note = await createNote(input);
        toast.success('Note created successfully');
      } else if (editMode === 'edit' && selectedNote) {
        note = await updateNote(selectedNote.id, input);
        toast.success('Note updated successfully');
      }

      if (note) {
        setSelectedNote(note);
        setSelectedNoteId(note.id);
        setEditTitle(note.title || '');
        setEditMarkdown(note.markdown);
      }

      setEditMode(null);
    } catch (error) {
      toast.error(`Failed to save note: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (note: Note) => {
    if (!confirm(`Delete note "${note.title || 'Untitled'}"?`)) {
      return;
    }

    try {
      await deleteNote(note.id);
      toast.success('Note deleted successfully');
      if (selectedNoteId === note.id) {
        setSelectedNoteId(null);
        setSelectedNote(null);
        resetEditor();
      }
    } catch (error) {
      toast.error(`Failed to delete note: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (loading && notes.length === 0) {
    return <LoadingPage />;
  }

  if (error) {
    return (
      <div style={{ padding: '20px' }}>
        <div
          style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: '16px',
            borderRadius: '8px',
          }}
        >
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100% - 72px)' }}>
      {sidebarOpen && (
        <aside
          style={{
            width: '280px',
            borderRight: '1px solid #e5e7eb',
            background: 'var(--bg-secondary)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '16px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Library</span>
            <button
              onClick={() => setSidebarOpen(false)}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: '14px',
              }}
              title="Hide sidebar"
            >
              Hide
            </button>
          </div>

          <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
            <button
              onClick={handleCreate}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: 'none',
                background: '#1d4ed8',
                color: 'white',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              New Note
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ padding: '12px 16px', fontSize: '12px', color: '#6b7280' }}>Folders</div>
            {folders.map(folder => (
              <button
                key={folder.key}
                onClick={() => setSelectedFolder(folder.key)}
                style={{
                  width: '100%',
                  padding: '8px 20px',
                  textAlign: 'left',
                  border: 'none',
                  background: selectedFolder === folder.key ? 'rgba(29, 78, 216, 0.12)' : 'transparent',
                  color: selectedFolder === folder.key ? '#1d4ed8' : '#374151',
                  fontWeight: selectedFolder === folder.key ? 600 : 500,
                  cursor: 'pointer',
                }}
              >
                {folder.label}
              </button>
            ))}

            <div style={{ padding: '12px 16px', fontSize: '12px', color: '#6b7280', borderTop: '1px solid #f3f4f6' }}>
              Notes ({totalApprox})
            </div>

            {filteredNotes.length === 0 ? (
              <div style={{ padding: '16px 20px', color: '#9ca3af', fontSize: '13px' }}>No notes yet</div>
            ) : (
              filteredNotes.map(note => (
                <div
                  key={note.id}
                  onClick={() => {
                    setSelectedNoteId(note.id);
                    setSelectedNote(note);
                    setEditMode(null);
                    setEditTitle(note.title || '');
                    setEditMarkdown(note.markdown);
                  }}
                  onDoubleClick={() => handleEdit(note)}
                  style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid #f3f4f6',
                    cursor: 'pointer',
                    background: selectedNoteId === note.id ? '#eef2ff' : 'transparent',
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                    {note.title || 'Untitled'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {note.markdown.split('\n')[0]?.slice(0, 60) || 'No preview'}
                  </div>
                </div>
              ))
            )}

            {hasNextPage && (
              <div style={{ padding: '16px 20px' }}>
                <button
                  onClick={() => loadMore()}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    background: '#f9fafb',
                    cursor: 'pointer',
                  }}
                >
                  Load More
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setSidebarOpen(o => !o)}
              style={{
                border: 'none',
                background: '#f3f4f6',
                color: '#374151',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
            </button>
            {selectedFolder !== 'ALL' && (
              <span style={{ fontSize: '13px', color: '#6b7280' }}>Folder: {selectedFolder}</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setShowGarden(prev => !prev)}
              style={{
                border: '1px solid #d1d5db',
                background: showGarden ? '#10b981' : '#ffffff',
                color: showGarden ? '#ffffff' : '#374151',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {showGarden ? 'Hide Entity Visual' : 'Show Entity Visual'}
            </button>
          </div>

          {selectedNote && editMode !== 'create' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleEdit(selectedNote)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  background: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(selectedNote)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #f87171',
                  background: '#fee2e2',
                  color: '#b91c1c',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
          {showGarden && (
            <div
              style={{
                marginBottom: '16px',
                padding: '20px',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                background: '#ffffff',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
                maxWidth: '100%',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>Live Entity Garden</h3>
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>
                    {entitiesLoading ? 'Refreshing…' : `${gardenEntities.length} entities in this note`}
                  </p>
                </div>
              </div>
              <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
                {gardenEntities.length === 0 ? (
                  <div
                    style={{
                      padding: '60px 20px',
                      textAlign: 'center',
                      color: '#6b7280',
                      fontSize: '14px',
                    }}
                  >
                    <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>🌱</div>
                    <div style={{ fontWeight: 600, marginBottom: '8px', color: '#374151' }}>
                      No entities found in this note
                    </div>
                    <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
                      Tag entities in your note using the format:<br />
                      <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                        #EntityName:TYPE
                      </code>
                      <br />
                      <div style={{ marginTop: '8px', color: '#9ca3af', fontSize: '12px' }}>
                        Types: PERSON, PLACE, ORG, OBJECT, EVENT, CONCEPT<br />
                        Example: <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>#Cory:PERSON</code>
                      </div>
                    </div>
                  </div>
                ) : (
                  <MiniGarden
                    entities={gardenEntities}
                    width={Math.min(760, typeof window !== 'undefined' ? window.innerWidth - (sidebarOpen ? 380 : 100) : 760)}
                    height={360}
                  />
                )}
              </div>
            </div>
          )}

          {editMode ? (
            <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input
                type="text"
                placeholder="Note title"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                style={{
                  fontSize: '24px',
                  fontWeight: 600,
                  border: 'none',
                  outline: 'none',
                  borderBottom: '1px solid #e5e7eb',
                  padding: '12px 0',
                }}
              />

              <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                <CodeMirrorEditor
                  value={editMarkdown}
                  onChange={value => setEditMarkdown(value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleCancel}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    background: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#1d4ed8',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? 'Saving…' : 'Save Note'}
                </button>
              </div>
            </div>
          ) : selectedNote ? (
            <div style={{ maxWidth: '880px', margin: '0 auto' }}>
              <h1 style={{ fontSize: '32px', fontWeight: 600, color: '#111827', marginBottom: '12px' }}>
                {selectedNote.title || 'Untitled'}
              </h1>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
                Updated {new Date(selectedNote.updatedAt).toLocaleString()}
              </div>
              <div
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.7,
                  color: '#374151',
                }}
              >
                {selectedNote.markdown || 'Start writing your note…'}
              </div>
            </div>
          ) : (
            <div style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
              fontSize: '15px',
            }}>
              Select a note or create a new one to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
