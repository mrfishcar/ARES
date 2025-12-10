/**
 * DocumentsSidebar - Slide-out documents panel
 * Lists saved documents with load capability
 */

interface Document {
  id: string;
  title: string;
  text: string;
  createdAt?: string;
  updatedAt: string;
}

interface DocumentsSidebarProps {
  isOpen: boolean;
  documents: Document[];
  loadingDocuments: boolean;
  loadingDocument: boolean;
  onLoadDocument: (id: string) => void;
  deriveDocumentName: (doc: Document) => string;
}

export function DocumentsSidebar({
  isOpen,
  documents,
  loadingDocuments,
  loadingDocument,
  onLoadDocument,
  deriveDocumentName,
}: DocumentsSidebarProps) {
  return (
    <div
      className="documents-sidebar"
      style={{
        transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
      }}
    >
      {/* ARES branding */}
      <div className="sidebar-header">
        <div className="sidebar-brand">ARES</div>
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
              <li key={doc.id}>
                <button
                  onClick={() => onLoadDocument(doc.id)}
                  className="document-item"
                  disabled={loadingDocument}
                >
                  <div className="document-item__title">
                    {deriveDocumentName(doc)}
                  </div>
                  <div className="document-item__date">
                    {new Date(doc.updatedAt).toLocaleDateString()}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
