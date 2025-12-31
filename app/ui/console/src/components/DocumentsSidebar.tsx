/**
 * DocumentsSidebar - Slide-out documents panel
 * Lists saved documents with load capability
 */

import { useState, useCallback } from 'react';
import { MoreVertical, Trash2 } from 'lucide-react';

interface Document {
  id: string;
  title: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

interface DocumentsSidebarProps {
  isOpen: boolean;
  documents: Document[];
  loadingDocuments: boolean;
  loadingDocument: boolean;
  onLoadDocument: (id: string) => void;
  onDeleteDocument?: (id: string) => void;
  onClose?: () => void;  // Added for swipe-to-close
  deriveDocumentName: (doc: Document) => string;
}

export function DocumentsSidebar({
  isOpen,
  documents,
  loadingDocuments,
  loadingDocument,
  onLoadDocument,
  onDeleteDocument,
  onClose,
  deriveDocumentName,
}: DocumentsSidebarProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Swipe-to-close gesture
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY, time: Date.now() });
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart || !onClose) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = Math.abs(touch.clientY - touchStart.y);
    const deltaTime = Date.now() - touchStart.time;

    // Swipe left to close (horizontal swipe < -100px, not too vertical, reasonably fast)
    if (deltaX < -100 && deltaY < 75 && deltaTime < 300) {
      onClose();
    }

    setTouchStart(null);
  }, [touchStart, onClose]);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onLoadDocument
    if (deleteConfirm === id) {
      // Second click - actually delete
      onDeleteDocument?.(id);
      setDeleteConfirm(null);
    } else {
      // First click - show confirmation
      setDeleteConfirm(id);
      // Auto-cancel after 3 seconds
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  return (
    <div
      className="documents-sidebar"
      style={{
        transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ARES branding */}
      <div className="sidebar-header">
        <div className="sidebar-brand">ARES</div>
        <a
          href="/booknlp"
          className="sidebar-link"
          style={{ marginTop: '8px', display: 'inline-block' }}
        >
          BookNLP Test
        </a>
        <a
          href="http://localhost:4173"
          className="sidebar-link"
          style={{ marginTop: '6px', display: 'inline-block' }}
          target="_blank"
          rel="noreferrer"
        >
          Notes Clone (localhost:4173)
        </a>
      </div>

      <div className="sidebar-content">
        <div className="sidebar-section-title">Documents</div>

        {loadingDocuments ? (
          <div className="sidebar-loading">Loading…</div>
        ) : documents.length === 0 ? (
          <div className="sidebar-empty">No documents yet</div>
        ) : (
          <ul className="document-list">
            {documents.map((doc) => (
              <li key={doc.id} className="document-list-item">
                <button
                  onClick={() => onLoadDocument(doc.id)}
                  className="document-item"
                  disabled={loadingDocument}
                >
                  <div className="document-item__info">
                    <div className="document-item__title">
                      {deriveDocumentName(doc)}
                    </div>
                    <div className="document-item__date">
                      {new Date(doc.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </button>
                {onDeleteDocument && (
                  <button
                    onClick={(e) => handleDelete(doc.id, e)}
                    className={`document-item__delete ${deleteConfirm === doc.id ? 'confirm' : ''}`}
                    title={deleteConfirm === doc.id ? 'Click again to confirm' : 'Delete document'}
                    type="button"
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
