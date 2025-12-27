/**
 * WORKING COMMIT STRUCTURE TEST
 *
 * Exact replication of commit be09094b structure
 * Nothing but the editor in the exact working layout
 */
import { useState } from 'react';
import { RichTextEditor } from '../editor2/RichTextEditor';
import type { SerializedEditorState } from 'lexical';
import type { RichDocSnapshot } from '../editor2/types';

export function WorkingCommitTest() {
  const [richDoc, setRichDoc] = useState<SerializedEditorState | null>(null);

  const handleChange = (snapshot: RichDocSnapshot) => {
    setRichDoc(snapshot.docJSON);
  };

  return (
    <>
      {/* EXACT CSS from working commit be09094b */}
      <style>{`
        /* Reset */
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        /* EXACT: Working commit has NO html/body/root styling! */
        /* Only font/color on body - NO height, NO overflow, NO position */
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
            'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
            sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          background: #FFF9F0;
          color: #4A403A;
        }

        /* EXACT LINE-BY-LINE from be09094b index.css */

        /* Line 68-74: .extraction-lab - EXACT properties */
        .extraction-lab {
          display: flex;
          flex-direction: column;
          height: 100vh;  /* NOT 100%, NOT 100dvh */
          background: #FFF9F0;
          overflow: hidden;
          /* NO position, NO transform, NO min-height */
        }

        /* Line 76-84: .lab-header - EXACT properties */
        .lab-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 32px;
          background: white;
          border-bottom: 1px solid #E8DED5;
          box-shadow: 0 2px 8px rgba(139, 126, 119, 0.08);
          /* NO position, NO height, NO overflow */
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
          color: #4A403A;
          margin: 0;
        }

        /* Line 163-170: .lab-content - EXACT properties */
        .lab-content {
          display: grid;
          grid-template-columns: 1fr;  /* Single column (original has 1fr 420px) */
          gap: 24px;
          flex: 1;
          padding: 24px;
          overflow: hidden;
          /* NO position, NO height, NO transform */
        }

        /* Line 173-180: .editor-panel - EXACT properties */
        .editor-panel {
          display: flex;
          flex-direction: column;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(139, 126, 119, 0.08);
          overflow: auto;
          /* NO position, NO height, NO min-height, NO transform */
        }

        .panel-header {
          padding: 24px 24px 16px;
          border-bottom: 1px solid #E8DED5;
        }

        .panel-header h2 {
          font-size: 18px;
          font-weight: 600;
          color: #4A403A;
          margin: 0 0 4px;
        }

        .panel-subtitle {
          font-size: 13px;
          color: #8B7E77;
          margin: 0;
        }
      `}</style>

      {/* EXACT structure from working commit */}
      <div className="extraction-lab">
        {/* Header */}
        <div className="lab-header">
          <div className="lab-title">
            <span className="lab-icon">🧪</span>
            <h1>Working Commit Test</h1>
          </div>
        </div>

        {/* Main Content - EXACT grid layout */}
        <div className="lab-content">
          {/* Editor Panel - EXACT structure */}
          <div className="editor-panel">
            <div className="panel-header">
              <h2>Write or paste text...</h2>
              <p className="panel-subtitle">Testing exact working commit structure (be09094b)</p>
            </div>
            {/* Lexical editor - should scroll naturally inside .editor-panel */}
            <RichTextEditor
              initialDocJSON={richDoc}
              initialPlainText="Start typing to test scrolling behavior on iPad.

Press Enter many times to create a long document.

The .editor-panel should scroll naturally.
The page (viewport) should NOT scroll.

This is the EXACT structure from commit be09094b that worked."
              onChange={handleChange}
              entities={[]}
            />
          </div>
        </div>
      </div>
    </>
  );
}
