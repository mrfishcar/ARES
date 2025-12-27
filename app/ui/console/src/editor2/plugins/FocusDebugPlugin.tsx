/**
 * FocusDebugPlugin - Instrumentation for iPad focus/tap debugging
 * 
 * This plugin logs:
 * - Focus events on the editor
 * - Tap/click events and their targets
 * - Selection changes
 * - Visual viewport changes (iOS keyboard)
 * - Element at tap point vs expected editor element
 * 
 * DEV ONLY - Remove or disable in production
 */

import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

const IS_DEV = import.meta.env.DEV || import.meta.env.MODE === 'development';
const DEBUG_FOCUS = IS_DEV && (typeof window !== 'undefined' && (window as any).__ARES_DEBUG_FOCUS__);

export function FocusDebugPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!DEBUG_FOCUS) return;

    const editorContainer = editor.getRootElement();
    if (!editorContainer) return;

    console.log('[FocusDebug] Plugin mounted, editor root:', editorContainer);

    // Log focus changes globally
    const handleFocusIn = (e: FocusEvent) => {
      console.log('[FocusDebug] focusin:', {
        target: e.target,
        activeElement: document.activeElement,
        isEditorFocused: editorContainer.contains(document.activeElement),
        composedPath: e.composedPath?.().map((el: any) => el.tagName || el.nodeName).join(' > '),
      });
    };

    const handleFocusOut = (e: FocusEvent) => {
      console.log('[FocusDebug] focusout:', {
        target: e.target,
        relatedTarget: e.relatedTarget,
        activeElement: document.activeElement,
      });
    };

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);

    // Log pointer events on editor wrapper
    const handlePointerDown = (e: PointerEvent) => {
      const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
      const expectedEditor = editorContainer.querySelector('[contenteditable="true"]');
      
      console.log('[FocusDebug] pointerdown:', {
        x: e.clientX,
        y: e.clientY,
        target: e.target,
        targetTag: (e.target as any)?.tagName,
        elementAtPoint,
        elementAtPointTag: elementAtPoint?.tagName,
        expectedEditor,
        isExpectedEditor: elementAtPoint === expectedEditor,
        activeElement: document.activeElement,
        composedPath: e.composedPath?.().map((el: any) => el.tagName || el.nodeName).join(' > '),
      });

      // If tap landed on wrong element, log the overlay chain
      if (elementAtPoint !== expectedEditor && elementAtPoint !== editorContainer) {
        console.warn('[FocusDebug] ⚠️ Tap interception detected!', {
          interceptor: elementAtPoint,
          interceptorStyles: elementAtPoint ? window.getComputedStyle(elementAtPoint) : null,
        });
      }
    };

    const handleClick = (e: MouseEvent) => {
      console.log('[FocusDebug] click:', {
        target: e.target,
        activeElement: document.activeElement,
      });
    };

    editorContainer.addEventListener('pointerdown', handlePointerDown, true);
    editorContainer.addEventListener('click', handleClick, true);

    // Log selection changes
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        console.log('[FocusDebug] selectionchange:', {
          anchorNode: selection.anchorNode,
          anchorOffset: selection.anchorOffset,
          focusNode: selection.focusNode,
          focusOffset: selection.focusOffset,
          isCollapsed: selection.isCollapsed,
          isInEditor: editorContainer.contains(selection.anchorNode),
        });
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);

    // iOS: Log visualViewport changes (keyboard open/close)
    if ('visualViewport' in window && window.visualViewport) {
      const visualViewport = window.visualViewport as VisualViewport;
      
      const handleViewportChange = () => {
        console.log('[FocusDebug] visualViewport change:', {
          height: visualViewport.height,
          width: visualViewport.width,
          offsetTop: visualViewport.offsetTop,
          offsetLeft: visualViewport.offsetLeft,
          scale: visualViewport.scale,
          windowScrollY: window.scrollY,
          windowInnerHeight: window.innerHeight,
        });
      };

      visualViewport.addEventListener('resize', handleViewportChange);
      visualViewport.addEventListener('scroll', handleViewportChange);

      return () => {
        document.removeEventListener('focusin', handleFocusIn, true);
        document.removeEventListener('focusout', handleFocusOut, true);
        editorContainer.removeEventListener('pointerdown', handlePointerDown, true);
        editorContainer.removeEventListener('click', handleClick, true);
        document.removeEventListener('selectionchange', handleSelectionChange);
        visualViewport.removeEventListener('resize', handleViewportChange);
        visualViewport.removeEventListener('scroll', handleViewportChange);
      };
    }

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      editorContainer.removeEventListener('pointerdown', handlePointerDown, true);
      editorContainer.removeEventListener('click', handleClick, true);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [editor]);

  return null;
}
