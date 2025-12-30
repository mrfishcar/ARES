/**
 * Wiki Page - Sprint R5
 * View wiki markdown files with rendering
 */

import { useState, useEffect } from 'react';
import { fetchWikiFile } from '../lib/api';
import { LoadingPage } from '../components/Loading';
import Markdown from 'markdown-to-jsx';

/**
 * Safe Markdown wrapper that ensures content is always a valid string
 */
function SafeMarkdown({ children, options }: { children: string; options?: any }) {
  const content = typeof children === 'string' && children ? children : '';

  if (!content) {
    return <p style={{ color: '#666' }}>No content to display</p>;
  }

  try {
    return <Markdown options={options}>{content}</Markdown>;
  } catch (err) {
    console.error('[SafeMarkdown] Render error:', err);
    return <pre style={{ whiteSpace: 'pre-wrap' }}>{content}</pre>;
  }
}

interface WikiFile {
  id: string;
  path: string;
}

interface WikiPageProps {
  project: string;
  toast: any;
}

export function WikiPage({ project, toast }: WikiPageProps) {
  const [files, setFiles] = useState<WikiFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<WikiFile | null>(null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);

  // Load wiki file list
  useEffect(() => {
    const loadFiles = async () => {
      try {
        setLoading(true);
        // For now, we'll use a mock list since listWikiFiles isn't in Sprint R4
        // In production, this would query the actual GraphQL endpoint
        setFiles([
          { id: 'example', path: 'example.md' },
        ]);
      } catch (error) {
        toast.error(`Failed to load wiki files: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    loadFiles();
  }, [project, toast]);

  // Load file content
  const loadFile = async (file: WikiFile) => {
    try {
      setContentLoading(true);
      setSelectedFile(file);
      const fileContent = await fetchWikiFile(project, file.id);
      setContent(fileContent);
    } catch (error) {
      toast.error(`Failed to load wiki file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setContent('');
    } finally {
      setContentLoading(false);
    }
  };

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <div style={{ display: 'flex', gap: '24px' }}>
      {/* File list */}
      <div style={{ flex: '0 0 300px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px' }}>Wiki Files</h2>

        <div
          style={{
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          {files.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>No wiki files found</div>
          ) : (
            files.map((file, index) => (
              <div
                key={file.id}
                onClick={() => loadFile(file)}
                style={{
                  padding: '12px 16px',
                  borderBottom: index < files.length - 1 ? '1px solid #e5e7eb' : 'none',
                  cursor: 'pointer',
                  background: selectedFile?.id === file.id ? '#f3f4f6' : 'white',
                }}
              >
                <div style={{ fontSize: '14px', color: '#111827' }}>{file.path}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Content viewer */}
      <div style={{ flex: 1 }}>
        {!selectedFile ? (
          <div
            style={{
              background: 'white',
              padding: '40px',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              textAlign: 'center',
              color: '#6b7280',
            }}
          >
            Select a wiki file to view
          </div>
        ) : contentLoading ? (
          <LoadingPage />
        ) : (
          <div
            style={{
              background: 'white',
              padding: '24px',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>{selectedFile.path}</h3>
            <div
              style={{
                fontSize: '14px',
                lineHeight: '1.6',
                color: '#111827',
              }}
              className="markdown-content"
            >
              <SafeMarkdown
                options={{
                  overrides: {
                    h1: { props: { style: { fontSize: '24px', fontWeight: '600', marginTop: '24px', marginBottom: '12px' } } },
                    h2: { props: { style: { fontSize: '20px', fontWeight: '600', marginTop: '20px', marginBottom: '10px' } } },
                    h3: { props: { style: { fontSize: '18px', fontWeight: '600', marginTop: '16px', marginBottom: '8px' } } },
                    p: { props: { style: { marginBottom: '12px' } } },
                    code: { props: { style: { background: '#f3f4f6', padding: '2px 6px', borderRadius: '3px', fontFamily: 'monospace' } } },
                    pre: { props: { style: { background: '#f3f4f6', padding: '12px', borderRadius: '6px', overflow: 'auto', marginBottom: '12px' } } },
                    ul: { props: { style: { marginBottom: '12px', paddingLeft: '24px' } } },
                    ol: { props: { style: { marginBottom: '12px', paddingLeft: '24px' } } },
                    li: { props: { style: { marginBottom: '4px' } } },
                  },
                }}
              >
                {content}
              </SafeMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
