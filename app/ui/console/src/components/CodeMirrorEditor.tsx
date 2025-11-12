import { useEffect, useRef, useState } from 'react';
import { EditorState, StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import { EditorView, keymap, ViewPlugin, ViewUpdate, Decoration, DecorationSet } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import type { EntitySpan, EntityType } from '../types/entities';
import { highlightEntities, getEntityTypeColor } from '../types/entities';
import { EntityContextMenu } from './EntityContextMenu';

import type { CodeMirrorEditorProps } from './CodeMirrorEditorProps';


// --- Helper functions ---
function getSpanDisplayName(span: EntitySpan): string {
  return span.displayText || span.text;
}
function getSpanTooltipLabel(span: EntitySpan): string {
  const display = getSpanDisplayName(span);
  const canonical = (span as any).canonicalName?.trim();
  if (canonical && canonical.length > 0 && canonical.toLowerCase() !== display.toLowerCase()) {
    return `${display} → ${canonical}`;
  }
  return display;
}

// --- Entity Highlighter Plugin ---


function entityHighlighterExtension(setContextMenu?: (ctx: any) => void) {
  const setHighlights = StateEffect.define<DecorationSet>();
  const highlightField = StateField.define<DecorationSet>({
    create() { return Decoration.none; },
    update(deco, tr) {
      for (let e of tr.effects) if (e.is(setHighlights)) return e.value;
      return deco.map(tr.changes);
    },
    provide: f => EditorView.decorations.from(f)
  });
  const plugin = ViewPlugin.fromClass(class {
    private timeout: number | null = null;
    private readonly debounceMs = 1000; // 1 second debounce

    constructor(view: EditorView) {
      console.log('[EntityHighlighter] Plugin initialized');
      this.updateHighlights(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        console.log('[EntityHighlighter] Document changed, scheduling highlight update...');
        // Clear existing timeout
        if (this.timeout !== null) {
          clearTimeout(this.timeout);
        }
        // Schedule new update after debounce period
        this.timeout = setTimeout(() => {
          this.updateHighlights(update.view);
        }, this.debounceMs) as unknown as number;
      }
    }

    destroy() {
      // Clean up timeout on plugin destruction
      if (this.timeout !== null) {
        clearTimeout(this.timeout);
      }
    }

    async updateHighlights(view: EditorView) {
      const text = view.state.doc.toString();
      console.log('[EntityHighlighter] Analyzing text:', text.slice(0, 100) + (text.length > 100 ? '...' : ''));

      const builder = new RangeSetBuilder<Decoration>();

      try {
        const entities = await highlightEntities(text, { maxHighlights: 1000, minConfidence: 0.6, enableNaturalDetection: true });
        console.log(`[EntityHighlighter] Detection complete. Found ${entities.length} entities:`, entities);

        // Debug: log detected entities
        if (entities.length > 0) {
          console.log(`[EntityHighlighter] Detected ${entities.length} entities:`, entities);
        }

        for (const entity of entities) {
          console.log(`[EntityHighlighter] Entity:`, {
            text: entity.text,
            type: entity.type,
            confidence: entity.confidence,
            start: entity.start,
            end: entity.end
          });

          if (entity.confidence >= 0.6) {
            const color = getEntityTypeColor(entity.type);
            console.log(`[EntityHighlighter] Creating decoration for "${entity.text}" at ${entity.start}-${entity.end}, color: ${color}`);
            builder.add(entity.start, entity.end, Decoration.mark({
              class: 'cm-entity-highlight',
              attributes: {
                'data-entity': JSON.stringify(entity),
                style: `background: ${color}30; cursor: pointer; border-radius: 3px; padding: 1px 0;`
              }
            }));
          } else {
            console.log(`[EntityHighlighter] Skipping "${entity.text}" - confidence too low: ${entity.confidence}`);
          }
        }
      } catch (error) {
        console.error('[EntityHighlighter] ERROR during detection:', error);
        console.error('[EntityHighlighter] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      }

      // Always dispatch, even if detection failed
      view.dispatch({ effects: setHighlights.of(builder.finish()) });
    }
  });
  // Add right-click handler for context menu
  const contextMenuHandler = EditorView.domEventHandlers({
    contextmenu: (event, view) => {
      const target = event.target as HTMLElement;
      const entityData = target.getAttribute('data-entity');
      if (entityData && setContextMenu) {
        event.preventDefault();
        const entity = JSON.parse(entityData) as EntitySpan;
        console.log('Right-click on entity:', entity);

        setContextMenu({
          position: { x: event.clientX, y: event.clientY },
          entity,
        });
        return true;
      }
      return false;
    }
  });
  return [highlightField, plugin, contextMenuHandler];
}

// --- Main component ---
export function CodeMirrorEditor({
  value,
  onChange,
  minHeight = '400px',
}: CodeMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    entity: EntitySpan;
    isNewEntity?: boolean;
  } | null>(null);

  // Confirm mention stub (replace with real hook if needed)
  const _confirmMention = async () => {};

    // Initialize CodeMirror editor on mount
  useEffect(() => {
    if (!editorRef.current || viewRef.current) return; // Don't reinit if we already have a view

    try {
      const startState = EditorState.create({
        doc: value,
        extensions: [
          keymap.of(defaultKeymap),
          markdown(),
          ...entityHighlighterExtension(setContextMenu),
          entityHighlightTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged) {
              onChange(update.state.doc.toString());
            }
          })
        ],
      });

      const view = new EditorView({
        state: startState,
        parent: editorRef.current,
      });
      viewRef.current = view;

      return () => {
        if (viewRef.current) {
          viewRef.current.destroy();
          viewRef.current = null;
        }
      };
    } catch (error) {
      console.error('Error initializing editor:', error);
    }
  }, []); // Only run on mount

  // Update editor when value prop changes
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: value,
        },
      });
    }
  }, [value]);

  const handleConfirm = async (type: EntityType) => {
    if (!contextMenu || !viewRef.current) return;

    const view = viewRef.current;
    const entity = contextMenu.entity as EntitySpan;
    
    console.log('Confirm handler:', {
      entity,
      type,
      start: entity.start,
      end: entity.end
    });
    
    if ('start' in entity && 'end' in entity) {
      // Get the actual text from the document at this range
      const currentText = view.state.doc.sliceString(entity.start, entity.end);
      console.log('Current text:', currentText);
      
      // If it's already a tag, extract just the name part
      const cleanName = currentText.replace(/^#\[?([^\]]+)\]?:.*$/, '$1')
                                 .replace(/^(\w+)(?::.*)?$/, '$1')
                                 .trim();
      console.log('Clean name:', cleanName);
      
      // Create new tag with proper formatting
      const entityTag = cleanName.includes(' ') 
        ? `#[${cleanName}]:${type}`
        : `#${cleanName}:${type}`;
      console.log('New tag:', entityTag);

      view.dispatch({
        changes: { from: entity.start, to: entity.end, insert: entityTag },
      });
    }

    setContextMenu(null);
    view.focus();
  };

  const handleReject = () => {
    if (!contextMenu || !viewRef.current) return;

    const view = viewRef.current;
    const entity = contextMenu.entity as EntitySpan;
    
    console.log('Reject handler:', entity);
    
    // Get the actual text from the document
    const currentText = view.state.doc.sliceString(entity.start, entity.end);
    console.log('Current text to reject:', currentText);
    
    // If it's a tag format, extract just the plain name
    let plainName = currentText.replace(/^#\[?([^\]]+)\]?:[A-Z]+$/, '$1').trim();
    console.log('Plain name after reject:', plainName);
    
    view.dispatch({
      changes: { from: entity.start, to: entity.end, insert: plainName },
    });

    setContextMenu(null);
    view.focus();
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={editorRef}
        className="cm-editor"
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          minHeight,
          backgroundColor: '#ffffff',
          width: '100%',
          height: '100%',
          overflow: 'auto'
        }}
      />

      {contextMenu && (
        <EntityContextMenu
          position={contextMenu.position}
          entity={{
            text: getSpanTooltipLabel(contextMenu.entity as EntitySpan),
            type: contextMenu.entity.type,
            confidence: contextMenu.entity.confidence,
          }}
          onConfirm={handleConfirm}
          onReject={handleReject}
          onClose={() => setContextMenu(null)}
          isNewEntity={contextMenu.isNewEntity}
        />
      )}
    </div>
  );
}

// Add or update this theme in your CodeMirror extensions array:
const entityHighlightTheme = EditorView.theme({
  '.cm-entity-highlight': {
    background: 'rgba(59, 130, 246, 0.15)', // More visible blue highlight
    borderBottom: '2px solid #3b82f6', // Solid blue underline
    borderRadius: '3px',
    padding: '1px 3px',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    display: 'inline',
    boxShadow: 'none',
    lineHeight: 'inherit',
    cursor: 'pointer',
    fontWeight: '500', // Make it slightly bolder
  },
  '.cm-scroller': {
    overflow: 'auto',
    minHeight: '100%'
  },
  '.cm-content': {
    minHeight: '100%'
  }
});




