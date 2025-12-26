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

        /* EXACT from working commit - simple height, no position: fixed */
        html,
        body {
          background: #FFF9F0;
          height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }

        #root {
          height: 100%;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          background-color: #FFF9F0;
        }

        /* EXACT: extraction-lab from line 68-74 */
        .extraction-lab {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #FFF9F0;
          overflow: hidden;
        }

        /* EXACT: lab-header from line 76-83 */
        .lab-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 32px;
          background: white;
          border-bottom: 1px solid #E8DED5;
          box-shadow: 0 2px 8px rgba(139, 126, 119, 0.08);
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

        /* EXACT: lab-content from line 163-170 */
        .lab-content {
          display: grid;
          grid-template-columns: 1fr;  /* Single column for just editor */
          gap: 24px;
          flex: 1;
          padding: 24px;
          overflow: hidden;  /* CRITICAL: constrains children */
        }

        /* EXACT: editor-panel from line 173-180 */
        .editor-panel {
          display: flex;
          flex-direction: column;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(139, 126, 119, 0.08);
          overflow: auto;  /* CRITICAL: scrolls naturally */
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
        }

        /* Make the Lexical editor fill the panel */
        .rich-editor-root {
          flex: 1;
          min-height: 0;
        }

        .rich-editor-surface {
          min-height: 100%;
          padding: 24px;
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
