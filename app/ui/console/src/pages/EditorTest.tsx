/**
 * MINIMAL EDITOR TEST PAGE
 *
 * Just the fucking editor. Nothing else.
 * No toolbar, no sidebar, no buttons, no bullshit.
 *
 * Testing if scrolling works when there's literally nothing but the editor.
 */
import { useState } from 'react';
import { RichTextEditor } from '../editor2/RichTextEditor';
import type { SerializedEditorState } from 'lexical';
import type { RichDocSnapshot } from '../editor2/types';

export function EditorTest() {
  const [richDoc, setRichDoc] = useState<SerializedEditorState | null>(null);

  const handleChange = (snapshot: RichDocSnapshot) => {
    setRichDoc(snapshot.doc);
  };

  return (
    <>
      {/* Global styles for this test page */}
      <style>{`
        /* Reset everything */
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        html, body {
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: #1a1d29;
          color: #e5e7eb;
        }

        #root {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        /* THE ONLY SCROLL CONTAINER */
        /* Using .editor-scroll-container so ScrollIntoViewPlugin finds it */
        .editor-scroll-container {
          flex: 1;
          width: 100%;
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          background: #1a1d29;
        }

        /* Make the editor fill the space */
        .editor-scroll-container > * {
          min-height: 100%;
        }
      `}</style>

      {/* JUST THE EDITOR */}
      <div className="editor-scroll-container">
        <RichTextEditor
          initialDocJSON={richDoc}
          initialPlainText="Type here to test scrolling on iPad.\n\nPress Enter many times to create lots of lines.\n\nThe caret should automatically scroll into view when you type.\n\nThere is nothing else on this page - no toolbar, no sidebar, no buttons.\n\nJust the editor and the scroll container."
          onChange={handleChange}
          entities={[]}
          onEntityFocus={() => {}}
          showEntityIndicators={false}
        />
      </div>
    </>
  );
}
