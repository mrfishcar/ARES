/**
 * ScrollIntoViewPlugin
 * 
 * Makes the editor dynamically responsive to iOS keyboard appearance.
 * 
 * Key features:
 * 1. Uses visualViewport API to detect keyboard height
 * 2. Adjusts editor container height when keyboard appears
 * 3. Scrolls cursor into the visible area above the keyboard
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
    let keyboardHeight = 0;
    let isKeyboardVisible = false;

    // Get the visible height accounting for keyboard
    const getVisibleHeight = (): number => {
      if (window.visualViewport) {
        return window.visualViewport.height;
      }
      return window.innerHeight;
    };

    // Calculate keyboard height
    const calculateKeyboardHeight = (): number => {
      if (window.visualViewport) {
        const keyboardH = window.innerHeight - window.visualViewport.height;
        // Only consider it a keyboard if it's significant (> 100px)
        return keyboardH > 100 ? keyboardH : 0;
      }
      return 0;
    };

    // Adjust editor height based on keyboard
    const adjustEditorForKeyboard = () => {
      const newKeyboardHeight = calculateKeyboardHeight();
      isKeyboardVisible = newKeyboardHeight > 0;
      
      if (isKeyboardVisible) {
        // Keyboard is visible - adjust the editor shell to fit above keyboard
        keyboardHeight = newKeyboardHeight;
        
        // Set the editor shell height to visible area
        const visibleHeight = getVisibleHeight();
        editorShell.style.maxHeight = `${visibleHeight}px`;
        editorShell.style.height = `${visibleHeight}px`;
        
        // Also set on scroll container
        scrollContainer.style.maxHeight = `${visibleHeight - 100}px`; // Account for toolbar
        
        // Scroll cursor into view after adjustment
        requestAnimationFrame(() => {
          scrollCursorIntoView();
        });
      } else {
        // Keyboard hidden - restore default height
        keyboardHeight = 0;
        editorShell.style.maxHeight = '';
        editorShell.style.height = '';
        scrollContainer.style.maxHeight = '';
      }
    };

    // Function to scroll cursor into view within the visible area
    const scrollCursorIntoView = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      if (!editorElement.contains(range.commonAncestorContainer)) return;

      const rangeRect = range.getBoundingClientRect();
      
      // Calculate the actual visible bottom (accounting for keyboard)
      const visibleBottom = isKeyboardVisible && window.visualViewport
        ? window.visualViewport.height + window.visualViewport.offsetTop
        : window.innerHeight;
      
      const containerRect = scrollContainer.getBoundingClientRect();
      const padding = 60; // Extra padding for comfortable visibility

      // The effective bottom is the minimum of container bottom and visible viewport bottom
      const effectiveBottom = Math.min(containerRect.bottom, visibleBottom) - padding;
      const effectiveTop = containerRect.top + padding;

      // Scroll down if cursor is below visible area
      if (rangeRect.bottom > effectiveBottom) {
        const scrollAmount = rangeRect.bottom - effectiveBottom + padding;
        scrollContainer.scrollTop += scrollAmount;
      }

      // Scroll up if cursor is above visible area
      if (rangeRect.top < effectiveTop) {
        const scrollAmount = effectiveTop - rangeRect.top + padding;
        scrollContainer.scrollTop -= scrollAmount;
      }
    };

    // Listen to visualViewport resize (keyboard show/hide)
    const handleViewportResize = () => {
      adjustEditorForKeyboard();
    };

    // Listen to visualViewport scroll (iOS address bar changes)
    const handleViewportScroll = () => {
      if (isKeyboardVisible) {
        // Re-adjust when viewport scrolls with keyboard visible
        requestAnimationFrame(scrollCursorIntoView);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
      window.visualViewport.addEventListener('scroll', handleViewportScroll);
    }

    // Also listen to window resize as fallback
    window.addEventListener('resize', handleViewportResize);

    // Listen for text content changes (typing)
    const removeTextListener = editor.registerTextContentListener(() => {
      requestAnimationFrame(scrollCursorIntoView);
    });

    // Listen for selection changes (cursor movement)
    const handleSelectionChange = () => {
      setTimeout(scrollCursorIntoView, 10);
    };
    document.addEventListener('selectionchange', handleSelectionChange);

    // Focus handler - adjust when editor gains focus (keyboard appears)
    const handleFocus = () => {
      // Small delay to let keyboard animation complete
      setTimeout(adjustEditorForKeyboard, 300);
    };
    editorElement.addEventListener('focus', handleFocus, true);

    // Prevent window scroll when editing
    const handleWindowScroll = (e: Event) => {
      if (isKeyboardVisible && document.activeElement && scrollContainer.contains(document.activeElement)) {
        // Reset window scroll if it moves while keyboard is open
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener('scroll', handleWindowScroll, { passive: true });

    // Initial adjustment
    adjustEditorForKeyboard();

    return () => {
      removeTextListener();
      document.removeEventListener('selectionchange', handleSelectionChange);
      editorElement.removeEventListener('focus', handleFocus, true);
      window.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('scroll', handleWindowScroll);
      
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
        window.visualViewport.removeEventListener('scroll', handleViewportScroll);
      }

      // Restore editor shell height
      editorShell.style.maxHeight = '';
      editorShell.style.height = '';
      scrollContainer.style.maxHeight = '';
    };
  }, [editor]);

  return null;
}
