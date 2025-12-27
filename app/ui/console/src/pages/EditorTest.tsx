/**
 * MINIMAL EDITOR TEST PAGE
 *
 * Just the fucking editor. Nothing else.
 * No toolbar, no sidebar, no buttons, no bullshit.
 *
 * Testing if scrolling works when there's literally nothing but the editor.
 */
import { useState, useEffect } from 'react';
import { RichTextEditor } from '../editor2/RichTextEditor';
import type { SerializedEditorState } from 'lexical';
import type { RichDocSnapshot } from '../editor2/types';

export function EditorTest() {
  const [richDoc, setRichDoc] = useState<SerializedEditorState | null>(null);

  const handleChange = (snapshot: RichDocSnapshot) => {
    setRichDoc(snapshot.docJSON);
  };

  // iOS Safari viewport scroll lock - NUCLEAR OPTION
  // If position: fixed doesn't work, this will force it
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const lockScroll = () => {
      window.scrollTo(0, 0);
      console.log('[EditorTest] Forced scroll to 0,0 - viewport tried to drift');
    };

    // Force scroll to 0,0 whenever viewport scrolls
    vv.addEventListener('scroll', lockScroll);

    console.log('[EditorTest] Viewport scroll lock active');

    return () => {
      vv.removeEventListener('scroll', lockScroll);
      console.log('[EditorTest] Viewport scroll lock removed');
    };
  }, []);

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

        /* CRITICAL: position: fixed prevents iOS from allowing viewport scroll */
        /* overflow: hidden alone DOES NOT WORK on iOS Safari */
        html, body {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: #1a1d29;
          color: #e5e7eb;
        }

        #root {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }

        /* THE ONLY SCROLL CONTAINER - position: absolute within fixed parent */
        /* Using .editor-scroll-container so ScrollIntoViewPlugin finds it */
        .editor-scroll-container {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
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
        />
      </div>
    </>
  );
}
