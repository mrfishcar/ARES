/**
 * Wiki Page - Sprint R5
 * View wiki markdown files with rendering
 * NOTE: markdown-to-jsx removed due to .replace() crash in Safari/iOS
 */

import { useState, useEffect } from 'react';
import { fetchWikiFile } from '../lib/api';
import { LoadingPage } from '../components/Loading';

/**
 * Simple markdown to HTML renderer (no external dependencies)
 */
function renderMarkdown(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let html = text;

  // Escape HTML first
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Code blocks (inline)
  html = html.replace(/`([^`]+)`/g, '<code style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace;">$1</code>');

  // Headers
  html = html.replace(/^### (.*)$/gm, '<h3 style="font-size: 18px; font-weight: 600; margin-top: 16px; margin-bottom: 8px;">$1</h3>');
  html = html.replace(/^## (.*)$/gm, '<h2 style="font-size: 20px; font-weight: 600; margin-top: 20px; margin-bottom: 10px;">$1</h2>');
  html = html.replace(/^# (.*)$/gm, '<h1 style="font-size: 24px; font-weight: 600; margin-top: 24px; margin-bottom: 12px;">$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Lists
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inList = false;

  for (const line of lines) {
    if (line.match(/^- /)) {
      if (!inList) {
        processedLines.push('<ul style="margin-bottom: 12px; padding-left: 24px;">');
        inList = true;
      }
      processedLines.push(`<li style="margin-bottom: 4px;">${line.substring(2)}</li>`);
    } else {
      if (inList) {
        processedLines.push('</ul>');
        inList = false;
      }
      if (line.trim()) {
        if (!line.startsWith('<h') && !line.startsWith('<ul') && !line.startsWith('<li')) {
          processedLines.push(`<p style="margin-bottom: 12px;">${line}</p>`);
        } else {
          processedLines.push(line);
        }
      }
    }
  }
  if (inList) {
    processedLines.push('</ul>');
  }

  return processedLines.join('\n');
}

/**
 * Simple Markdown renderer component
 */
function SimpleMarkdown({ children }: { children: string }) {
  const content = typeof children === 'string' && children ? children : '';

  if (!content) {
    return <p style={{ color: '#666' }}>No content to display</p>;
  }

  return (
    <div
      className="simple-markdown"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  );
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
              <SimpleMarkdown>
                {content}
              </SimpleMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
