/**
 * ARES Extraction Lab Editor - Clean Implementation
 *
 * Spec: Single CodeMirror instance with:
 * - Markdown live preview (toggle via "Show Raw Text")
 * - Entity highlighting (toggle via "Entity Highlighting")
 * - Right-click context menu (4 actions)
 * - Manual tag support (#Name:TYPE, #[Multi Word]:TYPE, Alias tags)
 * - # Autocomplete for entity creation
 *
 * Architecture: Single text source (rawMarkdownText prop), decorations only.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  EditorState,
  StateEffect,
  StateField,
  RangeSetBuilder,
  Transaction
} from '@codemirror/state';
import {
  EditorView,
  keymap,
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  WidgetType
} from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { EntitySpan, EntityType } from '../types/entities';
import { getEntityTypeColor, isValidEntityType } from '../types/entities';
import { EntityContextMenu } from './EntityContextMenu';
import type { CodeMirrorEditorProps } from './CodeMirrorEditorProps';

// ============================================================================
// 1. ENTITY HIGHLIGHTING EXTENSION
// ============================================================================

function entityHighlighterExtension(
  getEntities: () => EntitySpan[]
) {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildEntityDecorations(state, getEntities());
    },
    update(deco, tr) {
      // Always rebuild - we read fresh entities from the getter
      // The key insight: entitiesRef is always in sync with latest extraction
      // because useEffect updates it when entities prop changes.
      // So rebuilding here with getEntities() always gives us current data.
      return buildEntityDecorations(tr.state, getEntities());
    },
    provide: f => EditorView.decorations.from(f)
  });
}

function buildEntityDecorations(state: EditorState, entities: EntitySpan[]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const text = state.doc.toString();

  // Find all rejected regions to exclude them from highlighting
  const rejectedRegions: Array<{ start: number; end: number }> = [];
  const rejectionRegex = /\[([^\]]+)\]:REJECT_ENTITY|(\w+)(?:[.,!?;-]*):REJECT_ENTITY/g;
  let match;
  while ((match = rejectionRegex.exec(text)) !== null) {
    rejectedRegions.push({
      start: match.index,
      end: match.index + match[0].length
    });
  }

  // Helper to check if position overlaps with any rejected region
  const isInRejectedRegion = (start: number, end: number): boolean => {
    return rejectedRegions.some(region => !(end <= region.start || start >= region.end));
  };

  for (const entity of entities) {
    if (entity.start >= 0 && entity.end <= text.length && entity.start < entity.end) {
      // Skip entities that overlap with rejected regions
      if (isInRejectedRegion(entity.start, entity.end)) {
        continue;
      }

      const color = getEntityTypeColor(entity.type);
      builder.add(entity.start, entity.end, Decoration.mark({
        class: 'cm-entity-highlight',
        attributes: {
          'data-entity': JSON.stringify(entity),
          // Kindle-style: 80% height, feathered edges on all 4 sides
          // Entities that aren't tagged will get this mark decoration
          style: `
            background: linear-gradient(90deg,
              ${color}00 0%,
              ${color}20 10%,
              ${color}30 30%,
              ${color}30 70%,
              ${color}20 90%,
              ${color}00 100%);
            box-shadow: inset 0 2px 4px ${color}26, inset 0 -2px 4px ${color}26;
            cursor: pointer;
          `
        }
      }));
    }
  }

  return builder.finish();
}

// ============================================================================
// 2. CHARACTER REPLACEMENT WIDGET
// ============================================================================

/**
 * Widget to display normalized entity name with highlight color
 */
class EntityNameWidget extends WidgetType {
  constructor(
    private displayName: string,
    private highlightColor: string
  ) {
    super();
    console.log('[EntityNameWidget] Constructor called:', {
      displayName,
      highlightColor
    });
  }

  toDOM() {
    const span = document.createElement('span');
    span.textContent = this.displayName;

    // CRITICAL: Make widget non-interactive
    // Events pass through to underlying text, so right-click works
    span.style.pointerEvents = 'none';
    span.style.cursor = 'pointer';
    span.style.fontWeight = '600';

    // Don't highlight rejection tags - they're just placeholders
    if (this.highlightColor === '#6b7280') {
      // This is the fallback gray color used for REJECT_ENTITY
      // Just display the text without highlighting
      return span;
    }

    // Kindle-style highlight: 80% height, feathered edges on all 4 sides

    // Horizontal feathering via linear gradient (left/right)
    span.style.background = `
      linear-gradient(90deg,
        ${this.highlightColor}00 0%,
        ${this.highlightColor}20 10%,
        ${this.highlightColor}30 30%,
        ${this.highlightColor}30 70%,
        ${this.highlightColor}20 90%,
        ${this.highlightColor}00 100%)
    `;

    // Vertical feathering via inset box-shadows (top/bottom)
    span.style.boxShadow = `
      inset 0 2px 4px ${this.highlightColor}26,
      inset 0 -2px 4px ${this.highlightColor}26
    `;

    // 80% height - scale vertically while keeping horizontal width
    span.style.transform = 'scaleY(0.8)';
    span.style.transformOrigin = 'center';
    span.style.display = 'inline-block';

    span.style.padding = '0px 2px';
    span.style.borderRadius = '2px';

    return span;
  }

  eq(other: WidgetType) {
    if (!(other instanceof EntityNameWidget)) return false;

    // Compare display name and color
    return (
      other['displayName'] === this.displayName &&
      other['highlightColor'] === this.highlightColor
    );
  }
}

// ============================================================================
// 3. MANUAL TAG HIDING EXTENSION (Pretty Mode Only)
// ============================================================================

class HiddenTagWidget extends WidgetType {
  constructor(private text: string) {
    super();
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-tag-replacement';
    span.textContent = '';
    // Make widget truly invisible and zero-sized
    span.style.cssText = 'display: none; width: 0; height: 0; margin: 0; padding: 0;';
    return span;
  }

  eq(other: WidgetType) {
    return other instanceof HiddenTagWidget;
  }
}

function manualTagHidingExtension(
  getRenderMarkdown: () => boolean,
  getEntities: () => EntitySpan[]
) {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildTagHidingDecorations(state, getRenderMarkdown(), getEntities());
    },
    update(deco, tr) {
      // Always rebuild - read fresh toggle state and entities from getters
      // This ensures: toggle changes OR text changes OR entities change → decorations update
      return buildTagHidingDecorations(tr.state, getRenderMarkdown(), getEntities());
    },
    provide: f => EditorView.decorations.from(f)
  });
}

function buildTagHidingDecorations(
  state: EditorState,
  renderMarkdown: boolean,
  entities: EntitySpan[]
): DecorationSet {
  // In raw mode, don't hide tags
  if (!renderMarkdown) {
    console.log('[TagHiding] RAW MODE - skipping tag hiding');
    return Decoration.none;
  }

  console.log('[TagHiding] PRETTY MODE - processing tags with entities:', entities.length);

  // In pretty mode, hide ONLY the tag syntax, not the entity word
  // For "#Gondor:PLACE", hide "#" and ":PLACE" but keep "Gondor" visible
  const builder = new RangeSetBuilder<Decoration>();
  const text = state.doc.toString();

  // Helper function to find entity at a given position
  const findEntityAtPosition = (pos: number): EntitySpan | undefined => {
    return entities.find(e => e.start <= pos && pos < e.end);
  };

  // CRITICAL: Identify incomplete tag being typed (protected zone)
  // From # to SPACE = protected. Only hide tags that have been "committed" with a space.
  //
  // Key rule: A tag is COMMITTED if there's whitespace immediately after the complete tag match.
  // Example: "#Aragorn:PERSON ." is committed (space after PERSON), even though period follows.
  //          "#Aragorn:PERSON." is NOT committed (no space between PERSON and period).
  let incompleteTagStart = -1;
  let incompleteTagEnd = -1;

  // Match different tag formats and extract entity name positions
  // Support multi-word rejection syntax: [Multi Word]:REJECT_ENTITY
  // Groups: (1,2)=#[...]:TYPE | (3,4)=#Word:TYPE | (5,6,7)=Word:ALIAS_OF_...:TYPE | (8)=[...]:REJECT_ENTITY | (9)=Word:REJECT_ENTITY
  const tagRegex = /#\[([^\]]+)\]:(\w+)|#(\w+):(\w+)|(\w+):ALIAS_OF_([^:]+):(\w+)|\[([^\]]+)\]:REJECT_ENTITY|(\w+)(?:[.,!?;-]*):REJECT_ENTITY/g;

  // Find the LAST complete tag match to check if it's been spaced away from
  let lastTagMatch = null;
  let tempMatch;
  while ((tempMatch = tagRegex.exec(text)) !== null) {
    lastTagMatch = tempMatch;
  }

  // If there's a last tag match, check if it's been terminated/committed
  if (lastTagMatch) {
    const matchEnd = lastTagMatch.index + lastTagMatch[0].length;
    // Tag is COMMITTED only if there's an EXPLICIT terminating character immediately after
    // Terminating chars: space, period, comma, quotes, newline, etc.
    // DO NOT treat EOF as a terminator (user might still be typing at end of document)
    // This prevents: "#[Cory Gilford]:PERSON" (typing P at EOF) from being hidden prematurely
    // And requires: "#Cory:PERSON " (explicit space) or "#Cory:PERSON." to be hidden
    const isCommitted = matchEnd < text.length && /\W/.test(text[matchEnd]);

    if (!isCommitted) {
      // Either: no char after (EOF), or next char IS a word character → still being typed (incomplete)
      incompleteTagStart = lastTagMatch.index;
      incompleteTagEnd = text.length;
    }
    // else: Next char is a non-word char → tag is committed, allow hiding
  }

  // Reset regex for the decoration matching loop
  tagRegex.lastIndex = 0;

  console.log('[TagHiding] Looking for tags in text:', text.substring(0, 100));

  let match;
  let tagCount = 0;
  while ((match = tagRegex.exec(text)) !== null) {
    tagCount++;
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;
    const fullTag = match[0];

    console.log(`[TagHiding] Found tag #${tagCount}: "${fullTag}" at position ${matchStart}-${matchEnd}`);

    // PROTECTION: Skip tag hiding if this match is in the incomplete/being-typed region
    if (incompleteTagStart !== -1 && matchStart >= incompleteTagStart && matchStart < incompleteTagEnd) {
      continue; // Don't hide tags that are still being typed - they are protected
    }

    // Find entity and replace entire tag with normalized name widget
    const entity = findEntityAtPosition(matchStart);

    // If entity not found by position, try to find one that overlaps with this tag
    let entityToUse = entity || entities.find(e =>
      !(e.end <= matchStart || e.start >= matchEnd)
    );

    // If STILL no entity found, create a synthetic entity from the tag itself
    // This allows manual tags to be hidden and have context menus even if extraction fails
    if (!entityToUse) {
      console.log('[TagHiding] No entity found, creating synthetic entity from tag:', fullTag);

      // Extract entity name and type from the tag match groups
      let entityName = '';
      let entityType: EntityType = 'MISC';  // Default type

      if (match[1]) {
        // Pattern: #[Multi Word]:TYPE
        entityName = match[1];
        entityType = (match[2].toUpperCase() as EntityType);
      } else if (match[3]) {
        // Pattern: #Entity:TYPE
        entityName = match[3];
        entityType = (match[4].toUpperCase() as EntityType);
      } else if (match[5]) {
        // Pattern: Entity:ALIAS_OF_Canonical:TYPE
        entityName = match[5];
        entityType = (match[7].toUpperCase() as EntityType);
      } else if (match[8]) {
        // Pattern: [Multi Word]:REJECT_ENTITY (bracketed multi-word)
        // Still create synthetic entity for rejection tracking and blacklist learning
        entityName = match[8];
        entityType = 'MISC';  // Rejected entities are marked as MISC
      } else if (match[9]) {
        // Pattern: Word:REJECT_ENTITY (single word)
        // Still create synthetic entity for rejection tracking and blacklist learning
        entityName = match[9];
        entityType = 'MISC';  // Rejected entities are marked as MISC
      }

      // Validate the entity type - if invalid, default to MISC
      if (!isValidEntityType(entityType)) {
        console.log('[TagHiding] Invalid entity type:', entityType, '- defaulting to MISC');
        entityType = 'MISC';
      }

      // Create synthetic entity for the tag
      entityToUse = {
        start: matchStart,
        end: matchEnd,
        text: entityName,
        displayText: entityName,
        type: entityType,
        confidence: 1.0,
        source: 'manual' as const
      };

      console.log('[TagHiding] Created synthetic entity:', {
        text: entityName,
        type: entityType,
        isRejected: !!match[8] || !!match[9],
        position: `${matchStart}-${matchEnd}`
      });
    }

    console.log('[TagHiding] Creating widget for tag:', {
      fullTag,
      position: `${matchStart}-${matchEnd}`,
      entityText: entityToUse.text,
      entityType: entityToUse.type,
      entityPos: `${entityToUse.start}-${entityToUse.end}`
    });

    const color = getEntityTypeColor(entityToUse.type);

    // Part 1: Parent mark spanning entire tag with background color
    // SKIP for rejected entities - they should have NO highlighting
    // match[8] = bracketed multi-word rejection, match[9] = single-word rejection
    if (!match[8] && !match[9]) {
      builder.add(
        matchStart,
        matchEnd,
        Decoration.mark({
          class: 'cm-tag-highlight',
          attributes: {
            'data-entity': JSON.stringify(entityToUse),
            style: `
              background: linear-gradient(90deg,
                ${color}00 0%,
                ${color}20 10%,
                ${color}30 30%,
                ${color}30 70%,
                ${color}20 90%,
                ${color}00 100%);
              box-shadow: inset 0 2px 4px ${color}26, inset 0 -2px 4px ${color}26;
              cursor: pointer;
            `
          }
        })
      );
    }

    // Part 2: Hide syntax parts with CSS-based approach
    // Identify positions of syntax elements to hide based on tag pattern

    if (match[1]) {
      // Pattern: #[Multi Word]:TYPE
      // Hide: position 0-2 for "#[", position (2+entityName.length)-matchEnd for "]:TYPE"
      const hashBracketEnd = 2;
      const closeBracketStart = 2 + match[1].length;

      // Hide "#["
      builder.add(
        matchStart,
        matchStart + hashBracketEnd,
        Decoration.mark({
          class: 'cm-tag-syntax-hidden'
        })
      );

      // Hide "]:TYPE"
      builder.add(
        matchStart + closeBracketStart,
        matchEnd,
        Decoration.mark({
          class: 'cm-tag-syntax-hidden'
        })
      );
    } else if (match[3]) {
      // Pattern: #Entity:TYPE
      // Hide: position 0-1 for "#", position (1+entityName.length)-matchEnd for ":TYPE"
      const hashEnd = 1;
      const colonStart = 1 + match[3].length;

      // Hide "#"
      builder.add(
        matchStart,
        matchStart + hashEnd,
        Decoration.mark({
          class: 'cm-tag-syntax-hidden'
        })
      );

      // Hide ":TYPE"
      builder.add(
        matchStart + colonStart,
        matchEnd,
        Decoration.mark({
          class: 'cm-tag-syntax-hidden'
        })
      );
    } else if (match[5]) {
      // Pattern: Entity:ALIAS_OF_Canonical:TYPE
      // Hide entire ":ALIAS_OF_..." part, keep just "Entity"
      const aliasStart = 1 + match[5].length;

      builder.add(
        matchStart + aliasStart,
        matchEnd,
        Decoration.mark({
          class: 'cm-tag-syntax-hidden'
        })
      );
    } else if (match[8]) {
      // Pattern: [Multi Word]:REJECT_ENTITY (bracketed multi-word)
      // Hide entire "[" and "]:REJECT_ENTITY", keep just the entity name
      // Hide "[" at position 0
      builder.add(
        matchStart,
        matchStart + 1,
        Decoration.mark({
          class: 'cm-tag-syntax-hidden'
        })
      );

      // Hide "]:REJECT_ENTITY"
      const closeBracketStart = 1 + match[8].length;
      builder.add(
        matchStart + closeBracketStart,
        matchEnd,
        Decoration.mark({
          class: 'cm-tag-syntax-hidden'
        })
      );
    } else if (match[9]) {
      // Pattern: Word:REJECT_ENTITY (single word)
      // Hide ":REJECT_ENTITY" INCLUDING the colon, keep just "Word"
      // Synthetic entity is still created for rejection tracking and blacklist learning
      const rejectStart = match[9].length;  // Position of the colon

      builder.add(
        matchStart + rejectStart,
        matchEnd,
        Decoration.mark({
          class: 'cm-tag-syntax-hidden'
        })
      );
    }
  }

  return builder.finish();
}

// ============================================================================
// 4. CONTEXT MENU HANDLER
// ============================================================================

function contextMenuHandler(
  setContextMenu: (ctx: any) => void,
  entitiesRef: React.MutableRefObject<EntitySpan[]>
) {
  return EditorView.domEventHandlers({
    contextmenu: (event, view) => {
      console.log('[ContextMenu] Handler called!', {
        eventType: event.type,
        targetTag: (event.target as HTMLElement)?.tagName,
        targetClass: (event.target as HTMLElement)?.className
      });

      const target = event.target as HTMLElement;

      // First, try to find data-entity attribute in DOM (works for regular highlights)
      const elementWithData = target.closest('[data-entity]') as HTMLElement | null;
      if (elementWithData) {
        const entityData = elementWithData.getAttribute('data-entity');
        if (entityData) {
          event.preventDefault();
          try {
            const entity = JSON.parse(entityData) as EntitySpan;
            console.log('[ContextMenu] Found entity via DOM data-entity:', entity.text);
            setContextMenu({
              position: { x: event.clientX, y: event.clientY },
              entity
            });
            return true;
          } catch (e) {
            console.error('[ContextMenu] Failed to parse entity data:', entityData, e);
            return false;
          }
        }
      }

      // Fallback: use cursor position to find entity
      // This works when widgets are blocking DOM traversal
      console.log('[ContextMenu] No data-entity in DOM. Using cursor position fallback.');

      // Get the editor state
      const state = view.state;

      // Get the position of the click in the editor
      // We need to find which character position the user right-clicked on
      const coords = view.posAtCoords({x: event.clientX, y: event.clientY});

      if (coords === null) {
        console.log('[ContextMenu] Could not determine click position');
        return false;
      }

      const clickPos = coords;
      console.log('[ContextMenu] Click position:', clickPos);

      // Find entity at this position
      const clickedEntity = entitiesRef.current.find(e =>
        e.start <= clickPos && clickPos <= e.end
      );

      if (clickedEntity) {
        event.preventDefault();
        console.log('[ContextMenu] Found entity via position fallback:', clickedEntity.text);
        setContextMenu({
          position: { x: event.clientX, y: event.clientY },
          entity: clickedEntity
        });
        return true;
      }

      console.log('[ContextMenu] No entity found at cursor position');
      return false;
    }
  });
}

// ============================================================================
// 5. MARKDOWN HIGHLIGHT STYLE
// ============================================================================

const markdownHighlightStyle = HighlightStyle.define([
  // Headings - different levels
  { tag: t.heading1, fontSize: '2.2em', fontWeight: 'bold', color: '#4a403a' },
  { tag: t.heading2, fontSize: '1.8em', fontWeight: 'bold', color: '#4a403a' },
  { tag: t.heading3, fontSize: '1.4em', fontWeight: 'bold', color: '#4a403a' },
  { tag: t.heading4, fontSize: '1.2em', fontWeight: 'bold', color: '#4a403a' },
  { tag: t.heading5, fontSize: '1.1em', fontWeight: 'bold', color: '#4a403a' },
  { tag: t.heading6, fontWeight: 'bold', color: '#4a403a' },
  // Emphasis and strong
  { tag: t.emphasis, fontStyle: 'italic', color: '#8b7e77' },
  { tag: t.strong, fontWeight: 'bold', color: '#4a403a' },
  // Other elements
  { tag: t.link, color: '#3b82f6', textDecoration: 'underline' },
  { tag: t.quote, color: '#9ca3af', fontStyle: 'italic' },
  { tag: t.monospace, fontFamily: '"Courier New", monospace', fontSize: '0.9em' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: '#9ca3af' },
  // Formatting punctuation (subtle)
  { tag: t.processingInstruction, color: '#d1d5db', opacity: '0.5' },
  { tag: t.deleted, color: '#9ca3af', textDecoration: 'line-through' },
]);

// ============================================================================
// 6. EDITOR THEME - MARKDOWN LIVE PREVIEW
// ============================================================================

const editorTheme = EditorView.theme({
  '.cm-editor': {
    height: '100% !important',
    display: 'flex !important',
    flexDirection: 'row !important',
    cursor: 'text',
    caretColor: 'var(--accent-color) !important',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif',
    fontSize: '15px',
    lineHeight: '1.75',
    color: 'var(--text-primary)',
    backgroundColor: 'var(--bg-primary)',
    transition: 'background-color 0.3s ease, color 0.3s ease'
  },
  '.cm-content': {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif !important',
    padding: '16px',
    cursor: 'text',
    caretColor: 'var(--accent-color) !important',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)'
  },
  '.cm-scroller': {
    height: '100% !important',
    minHeight: '0 !important',
    minWidth: '0 !important',
    flex: '1 1 0 !important',
    overflow: 'auto !important',
    overflowX: 'hidden !important'
  },
  '.cm-line': {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif !important',
    position: 'relative',
    color: 'var(--text-primary)',
    caretColor: 'var(--accent-color) !important'
  },
  '.cm-gutters': {
    flexShrink: 0,
    backgroundColor: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border-color)',
    color: 'var(--text-secondary)',
    overflow: 'hidden'
  },
  // === Markdown Live Preview Styling ===
  // Heading level 1 (#)
  '.cm-heading1': {
    fontSize: '2.2em !important',
    fontWeight: 'bold !important',
    color: 'var(--md-heading)'
  },
  // Heading level 2 (##)
  '.cm-heading2': {
    fontSize: '1.8em !important',
    fontWeight: 'bold !important',
    color: 'var(--md-heading)'
  },
  // Heading level 3 (###)
  '.cm-heading3': {
    fontSize: '1.4em !important',
    fontWeight: 'bold !important',
    color: 'var(--md-heading)'
  },
  // Headings level 4-6
  '.cm-heading4': {
    fontSize: '1.2em !important',
    fontWeight: 'bold !important',
    color: 'var(--md-heading)'
  },
  '.cm-heading5': {
    fontSize: '1.1em !important',
    fontWeight: 'bold !important',
    color: 'var(--md-heading)'
  },
  '.cm-heading6': {
    fontWeight: 'bold !important',
    color: 'var(--md-heading)'
  },
  // Strong (bold) text - **text** or __text__
  '.cm-strong': {
    fontWeight: 'bold !important',
    color: 'var(--text-primary)'
  },
  // Emphasis (italic) text - *text* or _text_
  '.cm-em': {
    fontStyle: 'italic !important',
    color: 'var(--text-secondary)'
  },
  // Strikethrough - ~~text~~
  '.cm-strikethrough': {
    textDecoration: 'line-through',
    color: 'var(--text-tertiary)'
  },
  // Markdown formatting punctuation (*, _, -, #, etc.) - subtle gray
  '.cm-formatting': {
    color: 'var(--md-format)',
    opacity: '0.5'
  },
  '.cm-formatting-heading': {
    color: 'var(--md-format)',
    opacity: '0.5'
  },
  '.cm-formatting-em': {
    color: 'var(--md-format)',
    opacity: '0.5'
  },
  '.cm-formatting-strong': {
    color: 'var(--md-format)',
    opacity: '0.5'
  },
  '.cm-formatting-list': {
    color: 'var(--md-format)',
    opacity: '0.5'
  },
  // Links [text](url)
  '.cm-link': {
    color: 'var(--md-link)',
    textDecoration: 'underline'
  },
  // Quotes > text
  '.cm-quote': {
    color: 'var(--md-quote)',
    fontStyle: 'italic'
  },
  // === Entity Highlighting ===
  '.cm-entity-highlight': {
    transition: 'all 0.15s ease-in-out'
  },
  '.cm-tag-highlight': {
    transition: 'all 0.15s ease-in-out'
  },
  // === Tag Syntax Hiding ===
  '.cm-tag-syntax-hidden': {
    color: 'transparent !important',
    fontSize: '0 !important',
    letterSpacing: '-0.5em',
    userSelect: 'none',
    pointerEvents: 'none'
  },
  // === Spell Check Styling ===
  // Browser native spell-check will show red wavy underline
  // (no special styling needed - browser handles this)
  // === Code ===
  '.cm-inline-code': {
    backgroundColor: 'var(--md-code-bg)',
    color: 'var(--md-code-color)',
    padding: '2px 4px',
    borderRadius: '3px',
    fontFamily: '"Courier New", monospace',
    fontSize: '0.9em'
  },
  // === Underscore Replacement ===
  '.cm-underscore-hidden': {
    fontSize: '0',
    width: '0.4em', // Width of a space character
    display: 'inline-block'
  },
  '.cm-underscore-no-highlight': {
    // Cancel out entity highlight background on the underscore character
    background: 'transparent !important',
    'box-shadow': 'none !important'
  },
  // === Text Cursor (Caret) ===
  '.cm-cursor': {
    borderLeftColor: 'var(--accent-color) !important',
    borderLeftWidth: '2px !important',
    borderLeftStyle: 'solid !important',
    marginLeft: '-1px',
    caretColor: 'var(--accent-color) !important'
  },
  '.cm-cursor-primary': {
    borderLeftColor: 'var(--accent-color) !important',
    borderLeftWidth: '2px !important',
    caretColor: 'var(--accent-color) !important'
  },
  '.cm-cursor-secondary': {
    borderLeftColor: 'var(--accent-color) !important',
    caretColor: 'var(--accent-color) !important'
  }
});

// ============================================================================
// 6. MAIN COMPONENT
// ============================================================================

export function CodeMirrorEditor({
  value,
  onChange,
  minHeight = '400px',
  disableHighlighting = false,
  entities = [],
  renderMarkdown = true,
  onChangeType,
  onCreateNew,
  onReject,
  onTagEntity
}: CodeMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Refs for passing data to decorations (must be mutable refs, not props)
  const entitiesRef = useRef<EntitySpan[]>(entities);
  const renderMarkdownRef = useRef<boolean>(renderMarkdown);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    entity: EntitySpan;
  } | null>(null);

  // Keep refs in sync and trigger decoration updates
  useEffect(() => {
    console.log('[CodeMirror] entities prop changed:', entities.length, 'entities');
    entitiesRef.current = entities;
    console.log('[CodeMirror] entitiesRef updated, current value:', entitiesRef.current.length);
    // Trigger view update from React (safe - outside CM update cycle)
    const view = viewRef.current;
    if (view) {
      requestAnimationFrame(() => {
        console.log('[CodeMirror] Dispatching empty update to trigger decoration rebuild');
        // Empty dispatch triggers StateField update without cursor manipulation
        view.dispatch({});
      });
    }
  }, [entities]);

  useEffect(() => {
    renderMarkdownRef.current = renderMarkdown;
    // Trigger view update from React (safe - outside CM update cycle)
    const view = viewRef.current;
    if (view) {
      requestAnimationFrame(() => {
        // Empty dispatch triggers StateField update without cursor manipulation
        view.dispatch({});
      });
    }
  }, [renderMarkdown]);

  // Initialize editor on mount
  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        keymap.of(defaultKeymap),
        markdown(),
        // Enable live markdown syntax highlighting with custom markdown styles
        syntaxHighlighting(markdownHighlightStyle),
        ...(disableHighlighting ? [] : [entityHighlighterExtension(() => entitiesRef.current)]),
        manualTagHidingExtension(() => renderMarkdownRef.current, () => entitiesRef.current),
        contextMenuHandler(setContextMenu, entitiesRef),
        editorTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        })
      ]
    });

    const view = new EditorView({
      state,
      parent: editorRef.current
    });

    // Enable native browser spell-check and autocorrect on the editor DOM element
    const editorDOM = view.dom;
    if (editorDOM) {
      editorDOM.setAttribute('spellcheck', 'true');
    }

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Update text when value changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value
      }
    });
  }, [value]);

  // Handle context menu actions
  const handleChangeType = async (newType: EntityType) => {
    if (!contextMenu) return;
    const entity = contextMenu.entity;

    const tag = entity.text.includes(' ')
      ? `#[${entity.text}]:${newType}`
      : `#${entity.text}:${newType}`;

    const newText = value.slice(0, entity.start) + tag + value.slice(entity.end);
    onChange(newText);
    setContextMenu(null);

    if (onChangeType) {
      await onChangeType(entity, newType);
    }
  };

  const handleCreateNew = async (type: EntityType) => {
    if (!contextMenu) return;
    const entity = contextMenu.entity;

    const tag = entity.text.includes(' ')
      ? `#[${entity.text}]:${type}`
      : `#${entity.text}:${type}`;

    const newText = value.slice(0, entity.start) + tag + value.slice(entity.end);
    onChange(newText);
    setContextMenu(null);

    if (onCreateNew) {
      await onCreateNew(entity, type);
    }
  };

  const handleReject = async () => {
    if (!contextMenu) return;
    const entity = contextMenu.entity;

    // Use brackets for multi-word entities, plain syntax for single words
    const rejectTag = entity.text.includes(' ')
      ? `[${entity.text}]:REJECT_ENTITY`
      : `${entity.text}:REJECT_ENTITY`;

    const newText = value.slice(0, entity.start) + rejectTag + value.slice(entity.end);
    onChange(newText);
    setContextMenu(null);

    if (onReject) {
      await onReject(entity);
    }
  };

  const handleTagEntity = async () => {
    if (!contextMenu) return;
    if (onTagEntity) {
      await onTagEntity(contextMenu.entity, contextMenu.entity);
    }
    setContextMenu(null);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div
        ref={editorRef}
        style={{
          border: '1px solid var(--border-color)',
          borderRadius: '0',
          height: '100%',
          backgroundColor: 'var(--bg-primary)',
          width: '100%',
          flex: 1,
          minHeight: 0
        }}
      />

      {contextMenu && (
        <EntityContextMenu
          position={contextMenu.position}
          entity={{
            text: contextMenu.entity.text,
            type: contextMenu.entity.type,
            confidence: contextMenu.entity.confidence
          }}
          onChangeType={handleChangeType}
          onCreateNew={handleCreateNew}
          onReject={handleReject}
          onTagEntity={handleTagEntity}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
