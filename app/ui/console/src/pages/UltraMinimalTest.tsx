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
  const [diagnostics, setDiagnostics] = useState({ winY: 0, vvH: 0, vvTop: 0, innerH: 0 });

  const addDebug = (msg: string) => {
    setDebug(prev => [...prev.slice(-5), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  // Diagnostic logger - shows if window.scrollY is changing
  useEffect(() => {
    const interval = setInterval(() => {
      const vv = window.visualViewport;
      setDiagnostics({
        winY: Math.round(window.scrollY),
        vvH: Math.round(vv?.height || 0),
        vvTop: Math.round(vv?.offsetTop || 0),
        innerH: Math.round(window.innerHeight),
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // NUCLEAR OPTION: Prevent ALL touchmove events on html/body
  useEffect(() => {
    const preventScroll = (e: TouchEvent) => {
      // Only prevent on html/body, allow on textarea's scroll container
      const target = e.target as HTMLElement;
      if (!target.closest('.scroll-container')) {
        e.preventDefault();
        setScrollLockCount(c => c + 1);
        addDebug('🚫 Prevented touchmove on body');
      }
    };

    // Prevent touchmove on document to stop viewport scroll
    document.addEventListener('touchmove', preventScroll, { passive: false });

    // EDGE NUDGING: Prevent scroll chaining at container edges
    const scrollContainer = document.querySelector('.scroll-container') as HTMLElement;
    const preventChaining = () => {
      if (!scrollContainer) return;

      // If at exact top, nudge down 1px to prevent upward scroll from stealing to body
      if (scrollContainer.scrollTop === 0) {
        scrollContainer.scrollTop = 1;
      }

      // If at exact bottom, nudge up 1px to prevent downward scroll from stealing to body
      const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      if (scrollContainer.scrollTop >= maxScroll) {
        scrollContainer.scrollTop = maxScroll - 1;
      }
    };

    if (scrollContainer) {
      scrollContainer.addEventListener('touchstart', preventChaining, { passive: true });
    }

    // Lock BOTH window.scroll AND visualViewport.scroll
    const lockWindowScroll = () => {
      window.scrollTo(0, 0);
      setScrollLockCount(c => c + 1);
      addDebug('🔒 window.scrollY tried to change - LOCKED');
    };

    const vv = window.visualViewport;
    const lockVVScroll = () => {
      window.scrollTo(0, 0);
      setScrollLockCount(c => c + 1);
      addDebug('🔒 visualViewport tried to scroll - LOCKED');
    };

    window.addEventListener('scroll', lockWindowScroll, { passive: true });
    if (vv) {
      vv.addEventListener('scroll', lockVVScroll);
    }

    addDebug('Viewport scroll lock active (touchmove + window.scroll + visualViewport.scroll + edge nudging)');

    return () => {
      document.removeEventListener('touchmove', preventScroll);
      window.removeEventListener('scroll', lockWindowScroll);
      if (scrollContainer) {
        scrollContainer.removeEventListener('touchstart', preventChaining);
      }
      if (vv) {
        vv.removeEventListener('scroll', lockVVScroll);
      }
    };
  }, []);

  // MANUAL CARET TRACKING - iOS doesn't do this automatically
  useEffect(() => {
    const textarea = document.querySelector('.test-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const trackCaret = () => {
      const scrollContainer = document.querySelector('.scroll-container') as HTMLElement;
      if (!scrollContainer) return;

      // Get caret position by counting lines
      const text = textarea.value.substring(0, textarea.selectionStart);
      const lines = text.split('\n');
      const lineHeight = 28; // Approximate line height
      const caretY = lines.length * lineHeight;

      const containerHeight = scrollContainer.clientHeight;
      const scrollTop = scrollContainer.scrollTop;

      // Target: keep caret at 40% down the screen (so keyboard doesn't obscure)
      const targetPosition = containerHeight * 0.4;

      // Danger zones: top 25% or bottom 35% of visible area
      const topDangerZone = scrollTop + (containerHeight * 0.25);
      const bottomDangerZone = scrollTop + (containerHeight * 0.65);

      let needsScroll = false;
      let newScrollTop = scrollTop;

      // Caret in bottom danger zone - scroll down IMMEDIATELY
      if (caretY > bottomDangerZone) {
        newScrollTop = caretY - targetPosition;
        needsScroll = true;
        addDebug(`⬇️ Caret in bottom zone (${Math.round(caretY)}px > ${Math.round(bottomDangerZone)}px)`);
      }
      // Caret in top danger zone - scroll up IMMEDIATELY
      else if (caretY < topDangerZone) {
        newScrollTop = Math.max(0, caretY - targetPosition);
        needsScroll = true;
        addDebug(`⬆️ Caret in top zone (${Math.round(caretY)}px < ${Math.round(topDangerZone)}px)`);
      }

      if (needsScroll) {
        scrollContainer.scrollTop = newScrollTop;
        setCaretTrackCount(c => c + 1);
        addDebug(`✅ Scrolled to ${Math.round(newScrollTop)}px (caret at ${Math.round(targetPosition)}px from top)`);
      }
    };

    // Track on input and selection change
    textarea.addEventListener('input', trackCaret);
    textarea.addEventListener('selectionchange', trackCaret);

    // CONTINUOUS tracking - check every frame while focused
    let rafId: number;
    const continuousTrack = () => {
      if (document.activeElement === textarea) {
        trackCaret();
      }
      rafId = requestAnimationFrame(continuousTrack);
    };
    rafId = requestAnimationFrame(continuousTrack);

    // Also track on keyboard show/hide (visualViewport resize)
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', trackCaret);
    }

    addDebug('Manual caret tracking enabled (continuous + events)');

    return () => {
      textarea.removeEventListener('input', trackCaret);
      textarea.removeEventListener('selectionchange', trackCaret);
      if (vv) {
        vv.removeEventListener('resize', trackCaret);
      }
      cancelAnimationFrame(rafId);
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
          overscroll-behavior: none;
          touch-action: none;  /* Prevent gesture scrolling */
          background: #1a1d29;
          color: #e5e7eb;
        }

        #root {
          position: fixed;
          inset: 0;
          overflow: hidden;
          overscroll-behavior: none;
          touch-action: none;
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
          overscroll-behavior: contain;
          touch-action: pan-y;  /* Allow vertical scroll HERE */
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
        <div>SCROLL LOCKS: {scrollLockCount} | CARET TRACKS: {caretTrackCount}</div>
        <div style={{ fontSize: '10px', marginTop: '4px' }}>
          winY:{diagnostics.winY} vvH:{diagnostics.vvH} vvTop:{diagnostics.vvTop} innerH:{diagnostics.innerH}
        </div>
        <div style={{ fontSize: '11px', marginTop: '2px' }}>{debug[debug.length - 1] || 'Waiting...'}</div>
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
