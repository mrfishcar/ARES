/**
 * ULTRA MINIMAL TEST - NO LEXICAL
 *
 * Just a plain textarea. If this doesn't work, iOS is fundamentally broken.
 */
import { useEffect, useState } from 'react';

export function UltraMinimalTest() {
  const [scrollLockCount, setScrollLockCount] = useState(0);
  const [caretTrackCount, setCaretTrackCount] = useState(0);
  const [debug, setDebug] = useState<string[]>([]);

  const addDebug = (msg: string) => {
    setDebug(prev => [...prev.slice(-5), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const lockScroll = () => {
      window.scrollTo(0, 0);
      setScrollLockCount(c => c + 1);
      addDebug('Viewport tried to scroll - LOCKED');
    };

    vv.addEventListener('scroll', lockScroll);
    addDebug('Viewport scroll lock active');

    return () => {
      vv.removeEventListener('scroll', lockScroll);
    };
  }, []);

  // MANUAL CARET TRACKING - iOS doesn't do this automatically
  useEffect(() => {
    const textarea = document.querySelector('.test-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const trackCaret = () => {
      const scrollContainer = document.querySelector('.scroll-container') as HTMLElement;
      if (!scrollContainer) return;

      // Get caret position by creating a temporary span
      const text = textarea.value.substring(0, textarea.selectionStart);
      const lines = text.split('\n');
      const lineHeight = 28; // Approximate line height
      const caretY = lines.length * lineHeight;

      const containerHeight = scrollContainer.clientHeight;
      const scrollTop = scrollContainer.scrollTop;
      const visibleTop = scrollTop;
      const visibleBottom = scrollTop + containerHeight;

      // If caret is below visible area, scroll it into view
      if (caretY > visibleBottom - 100) {
        const scrollAmount = caretY - (visibleBottom - 100);
        scrollContainer.scrollTop = scrollTop + scrollAmount;
        setCaretTrackCount(c => c + 1);
        addDebug(`Scrolled caret into view (${Math.round(scrollAmount)}px)`);
      }
    };

    textarea.addEventListener('input', trackCaret);
    textarea.addEventListener('selectionchange', trackCaret);

    addDebug('Manual caret tracking enabled');

    return () => {
      textarea.removeEventListener('input', trackCaret);
      textarea.removeEventListener('selectionchange', trackCaret);
    };
  }, []);

  return (
    <>
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

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
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .debug-bar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: #ef4444;
          color: white;
          padding: 8px;
          font-size: 12px;
          z-index: 9999;
          font-family: monospace;
        }

        .scroll-container {
          position: absolute;
          top: 50px;
          left: 0;
          right: 0;
          bottom: 0;
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          background: #1a1d29;
          padding: 20px;
        }

        .test-textarea {
          width: 100%;
          min-height: 100vh;
          background: #2d3748;
          color: #e5e7eb;
          border: 2px solid #4a5568;
          border-radius: 8px;
          padding: 20px;
          font-size: 18px;
          font-family: system-ui;
          resize: none;
        }

        .test-textarea:focus {
          outline: 2px solid #3b82f6;
          border-color: #3b82f6;
        }
      `}</style>

      {/* Debug bar - VISIBLE on screen */}
      <div className="debug-bar">
        SCROLL LOCKS: {scrollLockCount} | CARET TRACKS: {caretTrackCount} | {debug[debug.length - 1] || 'Waiting...'}
      </div>

      {/* The scroll container */}
      <div className="scroll-container">
        <textarea
          className="test-textarea"
          placeholder="Type here. Press Enter many times.

RED BAR shows:
- SCROLL LOCKS = viewport trying to scroll (should stay 0)
- CARET TRACKS = how many times we scrolled the caret into view

If CARET TRACKS increases, manual scrolling is working.

This is a plain textarea with MANUAL caret tracking - proving iOS needs explicit scrollIntoView."
          autoFocus
        />

        <div style={{ marginTop: '20px', padding: '20px', background: '#2d3748', borderRadius: '8px' }}>
          <h3 style={{ marginBottom: '10px' }}>Debug Log:</h3>
          {debug.map((msg, i) => (
            <div key={i} style={{ fontSize: '12px', fontFamily: 'monospace', marginBottom: '4px' }}>
              {msg}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
