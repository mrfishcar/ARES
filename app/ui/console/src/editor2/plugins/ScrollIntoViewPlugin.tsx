/**
 * ScrollIntoViewPlugin
 *
 * Production-grade iOS keyboard handling inspired by Google Docs/Notion/CodeMirror
 *
 * Architecture:
 * - Visual-viewport-aware container height (Notion pattern)
 * - Static padding + scroll slack spacer (Google Docs pattern)
 * - rAF-batched scroll requests (CodeMirror pattern)
 *
 * Enhanced iOS Debugging (Dec 2025):
 * - Comprehensive scroll and viewport logging with timestamps
 * - Caret position tracking with visibility detection
 * - Toolbar overlap detection and scroll leakage diagnostics
 * - Keyboard height tracking and caret occlusion detection
 * - Scroll operation verification and success tracking
 *
 * Enable diagnostics: window.ARES_DEBUG_SCROLL = true
 * - Logs scroll events, viewport changes, caret movements
 * - Tracks toolbar positioning and potential content overlap
 * - Monitors keyboard appearance and caret visibility
 * - Reports scroll operation success/failure
 */
import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

const DEBUG_SCROLL = typeof window !== 'undefined' && (window as any).ARES_DEBUG_SCROLL;

function debugLog(...args: any[]) {
  if (DEBUG_SCROLL) {
    const timestamp = new Date().toISOString().substr(11, 12); // HH:MM:SS.mmm
    console.log(`[ScrollPlugin ${timestamp}]`, ...args);
  }
}

function debugWarn(...args: any[]) {
  if (DEBUG_SCROLL) {
    const timestamp = new Date().toISOString().substr(11, 12);
    console.warn(`[ScrollPlugin ${timestamp}]`, ...args);
  }
}

function debugError(...args: any[]) {
  if (DEBUG_SCROLL) {
    const timestamp = new Date().toISOString().substr(11, 12);
    console.error(`[ScrollPlugin ${timestamp}]`, ...args);
  }
}

export function ScrollIntoViewPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const editorElement = editor.getRootElement();
    if (!editorElement) {
      debugError('❌ No editor root element found');
      return;
    }

    // CRITICAL: Target correct scroll container based on viewport
    // Mobile (≤768px): .lab-content owns scroll
    // Desktop (>768px): .rich-editor-surface owns scroll
    const isMobile = window.innerWidth <= 768;
    let scrollContainer: HTMLElement | null;

    if (isMobile) {
      scrollContainer = editorElement.closest('.lab-content') as HTMLElement | null;
      debugLog('Mobile viewport: targeting .lab-content for scroll');
    } else {
      scrollContainer = editorElement.closest('.rich-editor-surface') as HTMLElement | null;
      debugLog('Desktop viewport: targeting .rich-editor-surface for scroll');
    }

    if (!scrollContainer) {
      debugError('❌ No scroll container found. Editor element:', editorElement, 'isMobile:', isMobile);
      return;
    }

    // Enhanced initialization logging
    let visualViewport = window.visualViewport;
    const toolbar = document.querySelector('.lab-toolbar-stack') as HTMLElement | null;
    
    debugLog('✅ Initialized successfully', {
      editorElement: {
        className: editorElement.className,
        rect: editorElement.getBoundingClientRect(),
      },
      scrollContainer: {
        className: scrollContainer.className,
        scrollHeight: scrollContainer.scrollHeight,
        clientHeight: scrollContainer.clientHeight,
        scrollTop: scrollContainer.scrollTop,
        maxScroll: scrollContainer.scrollHeight - scrollContainer.clientHeight,
        rect: scrollContainer.getBoundingClientRect(),
      },
      viewport: {
        visualHeight: visualViewport?.height ?? window.innerHeight,
        innerHeight: window.innerHeight,
        layoutHeight: window.innerHeight,
        offsetTop: visualViewport?.offsetTop ?? 0,
        scale: visualViewport?.scale ?? 1,
      },
      toolbar: toolbar ? {
        exists: true,
        rect: toolbar.getBoundingClientRect(),
        zIndex: window.getComputedStyle(toolbar).zIndex,
        position: window.getComputedStyle(toolbar).position,
      } : { exists: false },
    });

    // Animation frame ID for scroll timing
    let rafId: number | null = null;
    // Flag to prevent concurrent scroll operations (prevents jumping)
    let isScrolling = false;
    // Debounce timer to batch rapid events
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    // Track last logged state to avoid spam
    let lastLoggedState = {
      scrollTop: 0,
      scrollHeight: 0,
      clientHeight: 0,
      viewportHeight: 0,
    };

    /**
     * PHASE 1: Enhanced diagnostic logging with toolbar overlap detection
     * Log viewport and scroll container state to identify issues
     */
    const logDiagnostics = (event: string) => {
      const visualViewport = window.visualViewport;
      const vvHeight = visualViewport?.height ?? window.innerHeight;
      const vvOffsetTop = visualViewport?.offsetTop ?? 0;
      const vvScale = visualViewport?.scale ?? 1;

      const scrollTop = scrollContainer.scrollTop;
      const scrollHeight = scrollContainer.scrollHeight;
      const clientHeight = scrollContainer.clientHeight;
      
      // Get toolbar information for overlap detection
      const toolbar = document.querySelector('.lab-toolbar-stack') as HTMLElement | null;
      const toolbarRect = toolbar?.getBoundingClientRect();
      const scrollContainerRect = scrollContainer.getBoundingClientRect();

      // Only log if something changed significantly
      const changed =
        Math.abs(scrollTop - lastLoggedState.scrollTop) > 5 ||
        Math.abs(scrollHeight - lastLoggedState.scrollHeight) > 5 ||
        Math.abs(clientHeight - lastLoggedState.clientHeight) > 5 ||
        Math.abs(vvHeight - lastLoggedState.viewportHeight) > 5;

      if (changed) {
        const toolbarOverlap = toolbarRect && scrollContainerRect 
          ? {
              toolbarBottom: Math.round(toolbarRect.bottom),
              contentTop: Math.round(scrollContainerRect.top),
              overlapping: toolbarRect.bottom > scrollContainerRect.top,
              overlapAmount: Math.round(Math.max(0, toolbarRect.bottom - scrollContainerRect.top)),
            }
          : null;

        debugLog(`📊 ${event}`, {
          viewport: {
            height: vvHeight,
            offsetTop: vvOffsetTop,
            scale: vvScale,
            layoutHeight: window.innerHeight,
            keyboardHeight: window.innerHeight - vvHeight,
            keyboardOpen: (window.innerHeight - vvHeight) > 50,
          },
          scrollContainer: {
            scrollTop,
            scrollHeight,
            clientHeight,
            scrollRange: scrollHeight - clientHeight,
            hasScrollRoom: scrollHeight > clientHeight,
            scrollPercent: Math.round((scrollTop / (scrollHeight - clientHeight)) * 100),
            rect: {
              top: Math.round(scrollContainerRect.top),
              bottom: Math.round(scrollContainerRect.bottom),
              height: Math.round(scrollContainerRect.height),
            },
          },
          toolbar: toolbarOverlap || { exists: false },
          potentialIssues: {
            toolbarScrollLeakage: toolbarOverlap?.overlapping || false,
            contentBehindToolbar: toolbarOverlap && toolbarOverlap.overlapping && scrollTop > 0,
          }
        });

        lastLoggedState = {
          scrollTop,
          scrollHeight,
          clientHeight,
          viewportHeight: vvHeight,
        };
      }
    };

    /**
     * Scroll the cursor into view within the VISUAL viewport
     * Production pattern: Keep caret one line above keyboard
     */
    const scrollCursorIntoView = () => {
      // Prevent concurrent scroll operations (fixes jumping)
      if (isScrolling) {
        debugLog('Scroll already in progress, skipping');
        return;
      }

      // Cancel any pending animation frame
      if (rafId) cancelAnimationFrame(rafId);

      isScrolling = true;

      // CRITICAL FIX: Double-rAF to ensure layout is complete
      // Problem: When pressing Enter, DOM updates but layout hasn't finished
      // Solution: First rAF processes DOM, second rAF waits for layout/paint
      // This fixes the "second line enter" issue
      rafId = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) {
            debugLog('No selection');
            isScrolling = false;
            return;
          }

          const range = selection.getRangeAt(0);
          if (!editorElement.contains(range.commonAncestorContainer)) {
            debugLog('Selection outside editor');
            isScrolling = false;
            return;
          }

          // Get cursor position with enhanced diagnostics
          const rangeRect = range.getBoundingClientRect();
          if (rangeRect.height === 0 && rangeRect.width === 0) {
            debugWarn('⚠️ Empty range rect - caret may be invisible', {
              range: {
                startContainer: range.startContainer.nodeName,
                startOffset: range.startOffset,
                endContainer: range.endContainer.nodeName,
                endOffset: range.endOffset,
              },
            });
            isScrolling = false;
            return;
          }

          // Use visual viewport if available (iOS keyboard support)
          const visualViewport = window.visualViewport;
          const viewportHeight = visualViewport?.height ?? window.innerHeight;
          const viewportTop = visualViewport?.offsetTop ?? 0;
          
          // Get toolbar for overlap detection
          const toolbar = document.querySelector('.lab-toolbar-stack') as HTMLElement | null;
          const toolbarRect = toolbar?.getBoundingClientRect();
          const toolbarHeight = toolbarRect ? toolbarRect.bottom : 0;

          // Calculate visible area boundaries (accounting for keyboard and toolbar)
          const visibleTop = Math.max(viewportTop, toolbarHeight);
          const visibleBottom = viewportTop + viewportHeight;

          // REDUCED THRESHOLD: QuickType bar (40px) + one line (28px) + buffer (12px) = 80px
          // Reduced from 120px to prevent over-scrolling and jumping
          const ONE_LINE_ABOVE_KEYBOARD = 80;
          
          // Enhanced caret visibility check
          const caretBehindKeyboard = rangeRect.bottom > (visibleBottom - ONE_LINE_ABOVE_KEYBOARD);
          const caretBehindToolbar = rangeRect.top < visibleTop;
          const caretInVisibleArea = !caretBehindKeyboard && !caretBehindToolbar;

          debugLog('🎯 Caret position check', {
            caretRect: {
              top: Math.round(rangeRect.top),
              bottom: Math.round(rangeRect.bottom),
              left: Math.round(rangeRect.left),
              height: Math.round(rangeRect.height),
              width: Math.round(rangeRect.width),
            },
            visibleRegion: {
              top: Math.round(visibleTop),
              bottom: Math.round(visibleBottom),
              threshold: Math.round(visibleBottom - ONE_LINE_ABOVE_KEYBOARD),
              height: Math.round(visibleBottom - visibleTop),
            },
            toolbar: toolbarRect ? {
              bottom: Math.round(toolbarRect.bottom),
              height: Math.round(toolbarRect.height),
              blocking: caretBehindToolbar,
            } : { exists: false },
            keyboard: {
              height: Math.round(window.innerHeight - viewportHeight),
              open: (window.innerHeight - viewportHeight) > 50,
              blocking: caretBehindKeyboard,
            },
            scrollContainer: {
              scrollTop: Math.round(scrollContainer.scrollTop),
              scrollHeight: scrollContainer.scrollHeight,
              clientHeight: scrollContainer.clientHeight,
              maxScroll: scrollContainer.scrollHeight - scrollContainer.clientHeight,
            },
            caretStatus: caretInVisibleArea ? '✅ Visible' : 
                        caretBehindKeyboard ? '❌ Behind keyboard' :
                        caretBehindToolbar ? '❌ Behind toolbar' : '⚠️ Unknown',
          });

          // Check if cursor is below the visible area (behind keyboard)
          if (rangeRect.bottom > visibleBottom - ONE_LINE_ABOVE_KEYBOARD) {
            // Cursor is below visible area - scroll down to bring it into view
            const scrollAmount = rangeRect.bottom - (visibleBottom - ONE_LINE_ABOVE_KEYBOARD);
            const beforeScrollTop = scrollContainer.scrollTop;
            const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight;
            const targetScrollTop = Math.min(beforeScrollTop + scrollAmount, maxScrollTop);
            
            debugLog('🔽 Scrolling DOWN to reveal caret from behind keyboard', {
              scrollAmount: Math.round(scrollAmount),
              beforeScrollTop: Math.round(beforeScrollTop),
              targetScrollTop: Math.round(targetScrollTop),
              maxScrollTop: Math.round(maxScrollTop),
              willHitMax: targetScrollTop >= maxScrollTop,
              caretBottom: Math.round(rangeRect.bottom),
              viewportThreshold: Math.round(visibleBottom - ONE_LINE_ABOVE_KEYBOARD),
              overflow: Math.round(rangeRect.bottom - (visibleBottom - ONE_LINE_ABOVE_KEYBOARD)),
            });
            
            scrollContainer.scrollBy({
              top: scrollAmount,
              behavior: 'instant'  // rAF provides smoothness, instant prevents jank
            });
            
            // Verify scroll completed
            setTimeout(() => {
              const actualScrollTop = scrollContainer.scrollTop;
              const scrollDelta = actualScrollTop - beforeScrollTop;
              debugLog('🔽 Scroll DOWN completed', {
                beforeScrollTop: Math.round(beforeScrollTop),
                afterScrollTop: Math.round(actualScrollTop),
                requestedScroll: Math.round(scrollAmount),
                actualScroll: Math.round(scrollDelta),
                scrollSuccess: Math.abs(scrollDelta - scrollAmount) < 5,
              });
              logDiagnostics('After scroll down');
            }, 0);
          } else if (rangeRect.top < visibleTop + 40) {
            // Cursor is above visible area - scroll up (smaller buffer at top for toolbar)
            const scrollAmount = (visibleTop + 40) - rangeRect.top;
            const beforeScrollTop = scrollContainer.scrollTop;
            const targetScrollTop = Math.max(0, beforeScrollTop - scrollAmount);
            
            debugLog('🔼 Scrolling UP to reveal caret from behind toolbar', {
              scrollAmount: Math.round(scrollAmount),
              beforeScrollTop: Math.round(beforeScrollTop),
              targetScrollTop: Math.round(targetScrollTop),
              caretTop: Math.round(rangeRect.top),
              visibleTop: Math.round(visibleTop),
              toolbarBuffer: 40,
              overflow: Math.round((visibleTop + 40) - rangeRect.top),
            });
            
            scrollContainer.scrollBy({
              top: -scrollAmount,
              behavior: 'instant'
            });
            
            // Verify scroll completed
            setTimeout(() => {
              const actualScrollTop = scrollContainer.scrollTop;
              const scrollDelta = beforeScrollTop - actualScrollTop;
              debugLog('🔼 Scroll UP completed', {
                beforeScrollTop: Math.round(beforeScrollTop),
                afterScrollTop: Math.round(actualScrollTop),
                requestedScroll: Math.round(scrollAmount),
                actualScroll: Math.round(scrollDelta),
                scrollSuccess: Math.abs(scrollDelta - scrollAmount) < 5,
              });
              logDiagnostics('After scroll up');
            }, 0);
          } else {
            debugLog('✅ Caret in visible area, no scroll needed', {
              caretTop: Math.round(rangeRect.top),
              caretBottom: Math.round(rangeRect.bottom),
              visibleTop: Math.round(visibleTop),
              visibleBottom: Math.round(visibleBottom),
              clearanceTop: Math.round(rangeRect.top - visibleTop),
              clearanceBottom: Math.round((visibleBottom - ONE_LINE_ABOVE_KEYBOARD) - rangeRect.bottom),
            });
          }

          // Release scroll lock
          isScrolling = false;
        });
      });
    };

    /**
     * Text changes (typing) - Minimal debounce to batch rapid keystrokes
     * Prevents jumping from concurrent scroll operations
     */
    const handleTextChange = () => {
      const visualViewport = window.visualViewport;
      const vvHeight = visualViewport?.height ?? window.innerHeight;
      debugLog('📝 Text change detected', {
        viewportHeight: vvHeight,
        keyboardOpen: (window.innerHeight - vvHeight) > 50,
        scrollTop: scrollContainer.scrollTop,
        timestamp: performance.now(),
      });
      logDiagnostics('Text changed');

      // 16ms debounce (1 frame) to batch rapid keystrokes
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(scrollCursorIntoView, 16);
    };

    /**
     * Selection changes (cursor movement) - Minimal debounce
     */
    const handleSelectionScroll = () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rangeRect = range.getBoundingClientRect();
        debugLog('👆 Selection change detected', {
          isCollapsed: selection.isCollapsed,
          rangeCount: selection.rangeCount,
          caretPosition: {
            top: Math.round(rangeRect.top),
            bottom: Math.round(rangeRect.bottom),
          },
          scrollTop: scrollContainer.scrollTop,
          timestamp: performance.now(),
        });
      } else {
        debugLog('👆 Selection change detected (no ranges)');
      }

      // 16ms debounce (1 frame) to batch rapid changes
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(scrollCursorIntoView, 16);
    };

    // Listen for text changes (typing)
    const removeTextListener = editor.registerTextContentListener(handleTextChange);

    // Listen for selection changes (cursor movement without typing)
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (editorElement.contains(range.commonAncestorContainer)) {
          handleSelectionScroll();
        }
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);

    // Listen for viewport resize (keyboard appear/disappear)
    // visualViewport already declared above
    const handleViewportResize = () => {
      const vvHeight = visualViewport?.height ?? window.innerHeight;
      const keyboardHeight = window.innerHeight - vvHeight;
      debugLog('⌨️ Viewport resized (keyboard state change)', {
        viewportHeight: vvHeight,
        innerHeight: window.innerHeight,
        keyboardHeight,
        keyboardOpen: keyboardHeight > 50,
        offsetTop: visualViewport?.offsetTop ?? 0,
        scale: visualViewport?.scale ?? 1,
      });
      logDiagnostics('Viewport resized');
      scrollCursorIntoView();
    };
    visualViewport?.addEventListener('resize', handleViewportResize);

    // Listen for scroll events (diagnostic only)
    const handleScroll = () => {
      if (DEBUG_SCROLL) {
        debugLog('📜 Scroll event', {
          scrollTop: scrollContainer.scrollTop,
          timestamp: performance.now(),
        });
      }
      logDiagnostics('Scroll event');
    };
    if (DEBUG_SCROLL) {
      visualViewport?.addEventListener('scroll', handleScroll);
      scrollContainer.addEventListener('scroll', handleScroll);
    }

    // Initial diagnostic
    logDiagnostics('Plugin mounted');
    
    // Log master debug flag status
    if (DEBUG_SCROLL) {
      console.log('%c[ScrollPlugin] 🔍 Debug Mode ENABLED', 'color: #10b981; font-weight: bold; font-size: 14px;');
      console.log('[ScrollPlugin] To disable: window.ARES_DEBUG_SCROLL = false');
    } else {
      console.log('[ScrollPlugin] Debug mode disabled. To enable: window.ARES_DEBUG_SCROLL = true');
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (debounceTimer) clearTimeout(debounceTimer);
      removeTextListener();
      document.removeEventListener('selectionchange', handleSelectionChange);
      visualViewport?.removeEventListener('resize', handleViewportResize);
      if (DEBUG_SCROLL) {
        visualViewport?.removeEventListener('scroll', handleScroll);
        scrollContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, [editor]);

  return null;
}
