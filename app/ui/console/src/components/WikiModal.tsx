/**
 * Wiki Modal
 * Shows auto-generated wiki page for an entity
 */

import { useState, useEffect } from 'react';
import { fetchEntityWiki } from '../lib/api';

interface WikiModalProps {
  entityName: string;
  entityType?: string;
  project: string;
  onClose: () => void;
  extractionContext?: { entities: any[]; relations: any[] };
}

export function WikiModal({ entityName, entityType, project, onClose, extractionContext }: WikiModalProps) {
  const [wiki, setWiki] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function generateWiki() {
      try {
        setLoading(true);
        setError(null);

        const generatedWiki = await fetchEntityWiki(
          project,
          entityName,
          undefined,
          entityType,
          extractionContext
        );

        setWiki(generatedWiki);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate wiki');
      } finally {
        setLoading(false);
      }
    }

    generateWiki();
  }, [entityName, entityType, project, extractionContext]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="wiki-modal-overlay" onClick={onClose}>
      <div className="wiki-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="wiki-header">
          <div className="wiki-title">
            <span className="wiki-icon">📖</span>
            <h2>{entityName}</h2>
          </div>
          <button className="wiki-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="wiki-body">
          {loading ? (
            <div className="wiki-loading">
              <div className="spinner"></div>
              <p>Generating wiki page...</p>
            </div>
          ) : error ? (
            <div className="wiki-error">
              <p>⚠️ {error}</p>
            </div>
          ) : (
            <div className="wiki-content">
              <div dangerouslySetInnerHTML={{ __html: markdownToHTML(wiki) }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Simple markdown to HTML converter
 * TODO: Use a proper markdown library (marked, markdown-it, etc.)
 */
function markdownToHTML(markdown: string): string {
  if (!markdown) return '<p>No content</p>';

  try {
    let html = markdown;

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');

    // Lists
    html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
    html = html.replace(/^- (.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Tables (simple markdown table to HTML)
    const lines = html.split('\n');
    let inTable = false;
    let tableHTML = '';
    const processedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('|') && !line.includes('<')) {
        if (!inTable) {
          tableHTML = '<table style="border-collapse: collapse; width: 100%; margin: 10px 0;"><tbody>';
          inTable = true;
        }
        const cells = line.split('|').filter(cell => cell.trim());
        tableHTML += '<tr>' + cells.map(cell => {
          const content = cell.trim();
          // Check if it looks like a header (contains ** or is in first row)
          if (content.includes('**') || i === 0 || content.match(/^[A-Z]/)) {
            return `<td style="border: 1px solid #ddd; padding: 8px;">${content}</td>`;
          }
          return `<td style="border: 1px solid #ddd; padding: 8px;">${content}</td>`;
        }).join('') + '</tr>';
      } else {
        if (inTable) {
          tableHTML += '</tbody></table>';
          processedLines.push(tableHTML);
          inTable = false;
          tableHTML = '';
        }
        if (line.trim()) {
          processedLines.push(line);
        }
      }
    }

    if (inTable) {
      tableHTML += '</tbody></table>';
      processedLines.push(tableHTML);
    }

    html = processedLines.join('\n');

    // Paragraphs - wrap text in <p> tags if not already in a block element
    html = html.split(/\n\n+/).map(para => {
      para = para.trim();
      if (!para) return '';
      if (para.startsWith('<') && para.endsWith('>')) return para;
      if (para.includes('<')) return para; // Already has HTML tags
      return `<p>${para}</p>`;
    }).join('\n');

    return html;
  } catch (error) {
    console.error('Error converting markdown to HTML:', error);
    return `<p>${markdown}</p>`;
  }
}
