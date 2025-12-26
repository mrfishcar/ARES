/**
 * EXACT WORKING REPLICA - Complete copy of be09094b
 *
 * Full extraction lab with CodeMirror - EXACT replication
 * We'll keep this and compare to find what's missing
 */
import { useState, useEffect, useCallback } from 'react';
import { CodeMirrorEditor } from '../components/CodeMirrorEditor';

export function ExactWorkingReplica() {
  const [text, setText] = useState('');
  const [showHighlighting, setShowHighlighting] = useState(true);
  const [renderMarkdown, setRenderMarkdown] = useState(false);

  return (
    <>
      {/* COMPLETE CSS from working commit be09094b - EVERY DETAIL */}
      <style>{`
        /* Global reset - EXACT from be09094b */
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        /* TESTING: Blue background to control exposed area behind keyboard */
        /* Layer stack: html → body → #root → .extraction-lab → editor */
        /* ALL must be blue to prevent Safari void color from showing */
        html {
          background: #1E40AF;  /* BEDROCK: Real bottom layer */
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
            'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
            sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          background: #1E40AF;  /* Matches html */
          color: white;  /* White text */
          margin: 0;  /* Remove default margin */
        }

        #root {
          min-height: 100%;  /* Extend past content - NOT height: 100%! */
          background: #1E40AF;  /* Matches html/body */
        }

        /* CSS Variables - TESTING with blue theme */
        :root {
          --bg-primary: #1E40AF;  /* Blue */
          --bg-secondary: #1E3A8A;  /* Darker blue */
          --bg-tertiary: #1D4ED8;  /* Lighter blue */
          --text-primary: white;
          --text-secondary: #E0E7FF;  /* Light blue-white */
          --text-muted: #C7D2FE;  /* Muted blue-white */
          --accent-warm: #60A5FA;  /* Light blue accent */
          --accent-glow: #3B82F6;  /* Blue glow */
          --accent-purple: #818CF8;  /* Purple-blue */
          --border-soft: #3B82F6;  /* Blue border */
          --shadow-soft: 0 2px 8px rgba(30, 64, 175, 0.3);
          --shadow-medium: 0 4px 16px rgba(30, 64, 175, 0.4);
          --shadow-strong: 0 8px 24px rgba(30, 64, 175, 0.5);
          --border-radius: 12px;
          --border-radius-small: 8px;
        }

        /* EXACT: Line 68-74 - extraction-lab */
        .extraction-lab {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: var(--bg-primary);
          overflow: hidden;
        }

        /* EXACT: Line 76-83 - lab-header */
        .lab-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 32px;
          background: #1E3A8A;  /* Dark blue */
          border-bottom: 1px solid var(--border-soft);
          box-shadow: var(--shadow-soft);
        }

        .lab-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .lab-icon {
          font-size: 28px;
        }

        .lab-title h1 {
          font-size: 24px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .powered-badge {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .lab-stats {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .stat-badge {
          padding: 6px 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-soft);
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
          white-space: nowrap;
        }

        /* EXACT: Line 163-170 - lab-content */
        .lab-content {
          display: grid;
          grid-template-columns: 1fr 420px;  /* TWO columns like working commit */
          gap: 24px;
          flex: 1;
          padding: 24px;
          overflow: hidden;
        }

        /* EXACT: Line 173-180 - editor-panel */
        .editor-panel {
          display: flex;
          flex-direction: column;
          background: #2563EB;  /* Medium blue */
          border-radius: var(--border-radius);
          box-shadow: var(--shadow-soft);
          overflow: auto;
        }

        .panel-header {
          padding: 24px 24px 16px;
          border-bottom: 1px solid var(--border-soft);
        }

        .panel-header h2 {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 4px;
        }

        .panel-subtitle {
          font-size: 13px;
          color: var(--text-secondary);
          margin: 0;
        }

        /* EXACT: Results Panel - same structure as working commit */
        .results-panel {
          display: flex;
          flex-direction: column;
          background: #2563EB;  /* Medium blue */
          border-radius: var(--border-radius);
          box-shadow: var(--shadow-soft);
          padding: 24px;
          overflow-y: auto;
        }

        /* CodeMirror container */
        .cm-editor {
          /* Let it inherit from editor-panel */
        }
      `}</style>

      {/* EXACT structure from working commit be09094b */}
      <div className="extraction-lab">
        {/* Header */}
        <div className="lab-header">
          <div className="lab-title">
            <span className="lab-icon">🧪</span>
            <h1>Exact Working Replica</h1>
            <span className="powered-badge">Complete be09094b Copy</span>
          </div>
          <div className="lab-stats">
            <span className="stat-badge">Testing exact structure</span>
          </div>
        </div>

        {/* Main Content - EXACT grid layout from working commit */}
        <div className="lab-content">
          {/* Left: Editor Panel - EXACT structure */}
          <div className="editor-panel">
            <div className="panel-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div>
                  <h2>Write or paste text...</h2>
                  <p className="panel-subtitle">Complete replica of working commit structure</p>
                </div>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
                    <input
                      type="checkbox"
                      checked={showHighlighting}
                      onChange={(e) => setShowHighlighting(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>✨ Entity Highlighting</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
                    <input
                      type="checkbox"
                      checked={renderMarkdown}
                      onChange={(e) => setRenderMarkdown(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>📝 Render Markdown</span>
                  </label>
                </div>
              </div>
            </div>
            {/* EXACT CodeMirror like working commit */}
            <CodeMirrorEditor
              value={text}
              onChange={(newText) => setText(newText)}
              minHeight="calc(100vh - 280px)"
              disableHighlighting={!showHighlighting}
              enableWYSIWYG={renderMarkdown}
            />
          </div>

          {/* Right: Results Panel - Placeholder with EXACT structure */}
          <div className="results-panel">
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
              Results Panel Placeholder
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              This panel has the exact same CSS structure as the working commit's results panel.
            </p>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              Testing viewport scroll behavior with two-column grid layout.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
