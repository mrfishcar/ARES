/**
 * ScrollIntoViewPlugin
 * 
 * Makes the editor dynamically responsive to iOS keyboard appearance.
 * 
 * Key features:
 * 1. Uses visualViewport API to detect keyboard height
 * 2. Adjusts editor container height when keyboard appears
 * 3. Scrolls cursor into the visible area above the keyboard (debounced)
 * 4. Prevents viewport from shifting by containing all scrolling within editor
 */
import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

export function ScrollIntoViewPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const editorElement = editor.getRootElement();
    if (!editorElement) return;

    const scrollContainer = editorElement.closest('.rich-editor-surface') as HTMLElement | null;
    const editorShell = editorElement.closest('.rich-editor-shell') as HTMLElement | null;
    if (!scrollContainer || !editorShell) return;

    // Track keyboard state
    let isKeyboardVisible = false;
    let lastKeyboardHeight = 0;
    
    // Debounce timer for scroll operations
    let scrollDebounceTimer: number | null = null;
    let heightAdjustTimer: number | null = null;

    // Calculate keyboard height
    const calculateKeyboardHeight = (): number => {
      if (window.visualViewport) {
        const keyboardH = window.innerHeight - window.visualViewport.height;
        // Only consider it a keyboard if it's significant (> 150px)
        return keyboardH > 150 ? keyboardH : 0;
      }
      return 0;
    };

    // Adjust editor height based on keyboard - debounced
    const adjustEditorForKeyboard = () => {
      const newKeyboardHeight = calculateKeyboardHeight();
      
      // Only adjust if keyboard state actually changed
      if (Math.abs(newKeyboardHeight - lastKeyboardHeight) < 50) {
        return;
      }
      
      lastKeyboardHeight = newKeyboardHeight;
      isKeyboardVisible = newKeyboardHeight > 0;
      
      if (isKeyboardVisible) {
        // Keyboard is visible - adjust the editor shell to fit above keyboard
        const visibleHeight = window.visualViewport?.height || window.innerHeight;
        
        // Set heights without triggering layout thrashing
        editorShell.style.maxHeight = `${visibleHeight}px`;
        scrollContainer.style.maxHeight = `${visibleHeight - 80}px`; // Account for toolbar
        
        // Scroll cursor into view after adjustment settles
        if (heightAdjustTimer) clearTimeout(heightAdjustTimer);
        heightAdjustTimer = window.setTimeout(() => {
          scrollCursorIntoViewSmooth();
        }, 100);
      } else {
        // Keyboard hidden - restore default height
        editorShell.style.maxHeight = '';
        scrollContainer.style.maxHeight = '';
      }
    };

    // Function to scroll cursor into view - smooth, only when needed
    const scrollCursorIntoViewSmooth = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      if (!editorElement.contains(range.commonAncestorContainer)) return;

      const rangeRect = range.getBoundingClientRect();
      if (rangeRect.height === 0 && rangeRect.width === 0) return; // No valid cursor position
      
      const containerRect = scrollContainer.getBoundingClientRect();
      const padding = 40;

      // Calculate visible area
      const visibleTop = containerRect.top + padding;
      const visibleBottom = isKeyboardVisible && window.visualViewport
        ? Math.min(containerRect.bottom, window.visualViewport.height) - padding
        : containerRect.bottom - padding;

      // Only scroll if cursor is actually out of view
      if (rangeRect.bottom > visibleBottom) {
        // Cursor below visible area - scroll down
        const scrollAmount = rangeRect.bottom - visibleBottom + padding;
        scrollContainer.scrollBy({ top: scrollAmount, behavior: 'auto' });
      } else if (rangeRect.top < visibleTop) {
        // Cursor above visible area - scroll up  
        const scrollAmount = visibleTop - rangeRect.top + padding;
        scrollContainer.scrollBy({ top: -scrollAmount, behavior: 'auto' });
      }
    };

    // Debounced scroll into view - prevents jittery behavior
    const debouncedScrollIntoView = () => {
      if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
      scrollDebounceTimer = window.setTimeout(scrollCursorIntoViewSmooth, 150);
    };

    // Listen to visualViewport resize (keyboard show/hide)
    const handleViewportResize = () => {
      // Debounce height adjustments
      if (heightAdjustTimer) clearTimeout(heightAdjustTimer);
      heightAdjustTimer = window.setTimeout(adjustEditorForKeyboard, 100);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
    }

    // Also listen to window resize as fallback
    window.addEventListener('resize', handleViewportResize);

    // Listen for text content changes (typing) - debounced
    const removeTextListener = editor.registerTextContentListener(() => {
      // Only scroll on text changes if keyboard is visible
      if (isKeyboardVisible) {
        debouncedScrollIntoView();
      }
    });

    // Focus handler - adjust when editor gains focus (keyboard appears)
    const handleFocus = () => {
      // Delay to let keyboard animation complete
      setTimeout(() => {
        adjustEditorForKeyboard();
        // Additional scroll after keyboard fully appears
        setTimeout(scrollCursorIntoViewSmooth, 200);
      }, 350);
    };
    editorElement.addEventListener('focus', handleFocus, true);

    // Prevent window scroll when editing
    const handleWindowScroll = () => {
      if (isKeyboardVisible && document.activeElement && scrollContainer.contains(document.activeElement)) {
        // Reset window scroll if it moves while keyboard is open
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener('scroll', handleWindowScroll, { passive: true });

    return () => {
      if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
      if (heightAdjustTimer) clearTimeout(heightAdjustTimer);
      
      removeTextListener();
      editorElement.removeEventListener('focus', handleFocus, true);
      window.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('scroll', handleWindowScroll);
      
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
      }

      // Restore editor shell height
      editorShell.style.maxHeight = '';
      scrollContainer.style.maxHeight = '';
    };
  }, [editor]);

  return null;
}
