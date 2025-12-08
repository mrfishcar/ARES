Here you go – full CodeMirrorEditor.tsx with the scroll fix baked in:

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
  RangeSetBuilder,
  StateEffect,
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

const IS_DEV_ENV = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
const VERBOSE_LOGGING = false; // Set to true only when debugging highlighting issues
const ForceDecorationUpdate = StateEffect.define<void>();

// ============================================================================
// 0. UTILITY FUNCTIONS
// ============================================================================

/**
 * Binary search to find the first entity that ends after a given position.
 * Entities must be sorted by start position.
 */
function findFirstEntityInRange(entities: EntitySpan[], rangeStart: number): number {
  let lo = 0;
  let hi = entities.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    // An entity is potentially in range if it ends after rangeStart
    if (entities[mid].end <= rangeStart) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function makeSpanKey(e: EntitySpan): string {
  return `${e.start}-${e.end}-${e.type}`;
}

/**
 * Get entities that overlap with a given range [rangeStart, rangeEnd).
 * Entities must be sorted by start position.
 * Returns a subset of entities efficiently using binary search.
 */
function getEntitiesInRange(
  entities: EntitySpan[],
  rangeStart: number,
  rangeEnd: number
): EntitySpan[] {
  if (entities.length === 0) return [];

  // Find first entity that could be in range
  const startIdx = findFirstEntityInRange(entities, rangeStart);

  // Collect entities until we pass rangeEnd
  const result: EntitySpan[] = [];
  for (let i = startIdx; i < entities.length; i++) {
    const entity = entities[i];
    // Stop when entities start after our range
    if (entity.start >= rangeEnd) break;
    // Include if it overlaps with range
    if (entity.end > rangeStart && entity.start < rangeEnd) {
      result.push(entity);
    }
  }
  return result;
}

/**
 * Lighten and saturate a hex color for better glow visibility
 * Converts hex to HSL, increases lightness, increases saturation, converts back
 * @param hex - Color in hex format (e.g., '#3b82f6')
 * @param amount - Amount to lighten (0-100)
 * @returns Lightened color in hex format
 */
function lightenColor(hex: string, amount: number): string {
  // Remove # if present
  const color = hex.replace('#', '');

  // Convert hex to RGB
  const r = parseInt(color.substr(0, 2), 16) / 255;
  const g = parseInt(color.substr(2, 2), 16) / 255;
  const b = parseInt(color.substr(4, 2), 16) / 255;

  // Convert RGB to HSL
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  // Increase lightness and saturation for glow effect
  l = Math.min(1, l + amount / 100);
  s = Math.min(1, s + 0.2); // Increase saturation by 20%

  // Convert HSL back to RGB
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r2 = Math.round(hue2rgb(p, q, h + 1/3) * 255);
  const g2 = Math.round(hue2rgb(p, q, h) * 255);
  const b2 = Math.round(hue2rgb(p, q, h - 1/3) * 255);

  // Convert back to hex
  const toHex = (x: number): string => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}

/**
 * Convert hex color to RGBA string with specified opacity
 */
function hexToRgba(hex: string, opacity: number = 1): string {
  const color = hex.replace('#', '');
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function shouldRebuildDecorations(update: ViewUpdate): boolean {
  const hasForceEffect = update.transactions.some(tr =>
    tr.effects?.some(e => e.is(ForceDecorationUpdate))
  );

  return update.docChanged || update.viewportChanged || hasForceEffect;
}

function dispatchDecorationUpdate(view: EditorView | null | undefined) {
  if (!view) return;

  view.dispatch({
    effects: ForceDecorationUpdate.of(undefined)
  });
}

// ============================================================================
// 1. ENTITY HIGHLIGHTING EXTENSION
// ============================================================================

// Simple, robust entity highlighter
// Key principles:
// 1. Always build decorations synchronously - no async/timers
// 2. Only decorate what's visible + small buffer
// 3. Defensive checks to prevent crashes
// 4. No clever scroll detection - just simple viewport filtering
function entityHighlighterExtension(
  getEntities: () => EntitySpan[],
  isHighlightingDisabled: () => boolean,
  getHighlightOpacity: () => number,
  getEntityHighlightMode: () => boolean
) {
  const VIEWPORT_BUFFER = 2000; // chars before/after viewport

  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(readonly view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (shouldRebuildDecorations(update)) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const state = view.state;
      const doc = state.doc;
      const docLength = doc.length;

      const { from: vpFrom, to: vpTo } = view.viewport;
      const windowFrom = Math.max(0, vpFrom - VIEWPORT_BUFFER);
      const windowTo = Math.min(docLength, vpTo + VIEWPORT_BUFFER);

      return buildEntityDecorations(
        state,
        getEntities(),
        isHighlightingDisabled(),
        getHighlightOpacity(),
        getEntityHighlightMode(),
        windowFrom,
        windowTo
      );
    }
  }, {
    decorations: v => v.decorations
  });
}

// Pre-built style generators to avoid string concatenation in hot path
function buildDarkModeStyle(color: string, opacity: number): string {
  const glowColor = lightenColor(color, 15);
  const a1 = hexToRgba(glowColor, 0.7 * opacity);
  const a2 = hexToRgba(glowColor, 0.5 * opacity);
  const a3 = hexToRgba(glowColor, 0.3 * opacity);
  return `text-shadow: 0 0 4px ${a1}, 0 0 8px ${a2}, 0 0 12px ${a2}, 0 0 16px ${a3}; font-weight: 500; cursor: pointer;`;
}

function buildLightModeStyle(color: string, opacity: number): string {
  const hc = lightenColor(color, 10);
  const sc = hexToRgba(hc, 0.55 * opacity);
  const f1 = hexToRgba(hc, 0.35 * opacity);
  const f2 = hexToRgba(hc, 0.20 * opacity);
  const f3 = hexToRgba(hc, 0.10 * opacity);
  const f4 = hexToRgba(hc, 0.04 * opacity);
  return `background-color: ${sc}; box-shadow: -20px 0 16px -8px ${f4}, -14px 0 12px -6px ${f3}, -8px 0 10px -4px ${f2}, -4px 0 6px -2px ${f1}, 4px 0 6px -2px ${f1}, 8px 0 10px -4px ${f2}, 14px 0 12px -6px ${f3}, 20px 0 16px -8px ${f4}; font-weight: 500; cursor: pointer;`;
}

function buildEntityDecorations(
  state: EditorState,
  entities: EntitySpan[],
  isDisabled: boolean,
  opacityMultiplier: number = 1.0,
  entityHighlightMode: boolean = false,
  windowFrom: number,
  windowTo: number
): DecorationSet {
  const shouldHighlight = !isDisabled && Array.isArray(entities) && entities.length > 0;

  // Only log when verbose logging is enabled (debugging only)
  if (VERBOSE_LOGGING && IS_DEV_ENV) {
    console.debug('[CodeMirrorEditor] highlight check', {
      disableHighlighting: isDisabled,
      entityHighlightMode,
      entityCount: Array.isArray(entities) ? entities.length : 0
    });
  }

  // If highlighting is disabled or there are no entities, return empty decorations
  if (!shouldHighlight) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const docLength = state.doc.length;
  const rangeFrom = Math.max(0, windowFrom);
  const rangeTo = Math.min(docLength, windowTo);
  const textWindow = state.doc.sliceString(rangeFrom, rangeTo);
  const windowLength = textWindow.length;

  if (windowLength === 0) {
    return Decoration.none;
  }

  // Detect current theme (cached per render - DOM access is relatively cheap)
  const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

  const visibleEntities = entities.filter(e => !(e.end <= rangeFrom || e.start >= rangeTo));
  const MAX_DECORATIONS = 500;
  const limitedEntities = visibleEntities.slice(0, MAX_DECORATIONS);

  for (const entity of limitedEntities) {
    if (entity.start >= 0 && entity.end <= docLength && entity.start < entity.end) {
      const start = Math.max(entity.start, rangeFrom);
      const end = Math.min(entity.end, rangeTo);

      if (start >= end) continue;

      const style = isDarkMode
        ? buildDarkModeStyle(getEntityTypeColor(entity.type), opacityMultiplier)
        : buildLightModeStyle(getEntityTypeColor(entity.type), opacityMultiplier);
      const key = makeSpanKey(entity);

      builder.add(start, end, Decoration.mark({
        class: 'cm-entity-highlight',
        attributes: {
          'data-entity-key': key,
          style
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
    // Logging removed from constructor - called frequently for every widget
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
  const VIEWPORT_BUFFER = 2000;

  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(readonly view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (shouldRebuildDecorations(update)) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const renderMarkdown = getRenderMarkdown();
      if (!renderMarkdown) {
        return Decoration.none;
      }

      const state = view.state;
      const docLength = state.doc.length;
      const { from: vpFrom, to: vpTo } = view.viewport;
      const windowFrom = Math.max(0, vpFrom - VIEWPORT_BUFFER);
      const windowTo = Math.min(docLength, vpTo + VIEWPORT_BUFFER);

      return buildManualTagDecorations(
        state,
        renderMarkdown,
        getEntities(),
        windowFrom,
        windowTo
      );
    }
  }, {
    decorations: v => v.decorations
  });
}

function buildManualTagDecorations(
  state: EditorState,
  renderMarkdown: boolean,
  entities: EntitySpan[],
  windowFrom: number,
  windowTo: number
): DecorationSet {
  const doc = state.doc;
  const docLength = doc.length;
  const rangeFrom = Math.max(0, windowFrom);
  const rangeTo = Math.min(docLength, windowTo);
  const text = doc.sliceString(rangeFrom, rangeTo);
  const windowLength = text.length;
  // Only log when verbose logging is explicitly enabled (for debugging)
  const debugLogging = VERBOSE_LOGGING && IS_DEV_ENV;

  if (!renderMarkdown || windowLength === 0) {
    return Decoration.none;
  }

  // In pretty mode, hide ONLY the tag syntax, not the entity word
  // For "#Gondor:PLACE", hide "#" and ":PLACE" but keep "Gondor" visible
  const builder = new RangeSetBuilder<Decoration>();
  const visibleEntities = entities.filter(e => !(e.end <= rangeFrom || e.start >= rangeTo));

  // Helper function to find entity at a given position
  const findEntityAtPosition = (pos: number): EntitySpan | undefined => {
    for (const e of visibleEntities) {
      if (e.start <= pos && pos < e.end) {
        return e;
      }
    }
    return undefined;
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
    const matchStart = rangeFrom + lastTagMatch.index;
    const matchEnd = matchStart + lastTagMatch[0].length;
    // Tag is COMMITTED only if there's an EXPLICIT terminating character immediately after
    // Terminating chars: space, period, comma, quotes, newline, etc.
    // DO NOT treat EOF as a terminator (user might still be typing at end of document)
    // This prevents: "#[Cory Gilford]:PERSON" (typing P at EOF) from being hidden prematurely
    // And requires: "#Cory:PERSON " (explicit space) or "#Cory:PERSON." to be hidden
    const isCommitted = matchEnd < docLength && /\W/.test(doc.sliceString(matchEnd, matchEnd + 1));

    if (!isCommitted) {
      // Either: no char after (EOF), or next char IS a word character → still being typed (incomplete)
      incompleteTagStart = matchStart;
      incompleteTagEnd = docLength;
    }
    // else: Next char is a non-word char → tag is committed, allow hiding
  }

  // Reset regex for the decoration matching loop
  tagRegex.lastIndex = 0;

  if (debugLogging) {
    console.log('[TagHiding] Looking for tags in text:', text.substring(0, 100));
  }

  let match;
  let tagCount = 0;
  while ((match = tagRegex.exec(text)) !== null) {
    tagCount++;
    const matchStart = rangeFrom + match.index;
    const matchEnd = matchStart + match[0].length;
    const fullTag = match[0];

    if (debugLogging) {
      console.log(`[TagHiding] Found tag #${tagCount}: "${fullTag}" at position ${matchStart}-${matchEnd}`);
    }

    // PROTECTION: Skip tag hiding if this match is in the incomplete/being-typed region
    if (incompleteTagStart !== -1 && matchStart >= incompleteTagStart && matchStart < incompleteTagEnd) {
      continue; // Don't hide tags that are still being typed - they are protected
    }

    // Find entity and replace entire tag with normalized name widget
    const entity = findEntityAtPosition(matchStart);

    // If entity not found by position, try to find one that overlaps with this tag
    let entityToUse = entity || visibleEntities.find(e => !(e.end <= matchStart || e.start >= matchEnd));

    // If STILL no entity found, create a synthetic entity from the tag itself
    // This allows manual tags to be hidden and have context menus even if extraction fails
    if (!entityToUse) {
      if (debugLogging) {
        console.log('[TagHiding] No entity found, creating synthetic entity from tag:', fullTag);
      }

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
        if (debugLogging) {
          console.log('[TagHiding] Invalid entity type:', entityType, '- defaulting to MISC');
        }
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

      if (debugLogging) {
        console.log('[TagHiding] Created synthetic entity:', {
          text: entityName,
          type: entityType,
          isRejected: !!match[8] || !!match[9],
          position: `${matchStart}-${matchEnd}`
        });
      }
    }

    if (debugLogging) {
      console.log('[TagHiding] Creating widget for tag:', {
        fullTag,
        position: `${matchStart}-${matchEnd}`,
        entityText: entityToUse.text,
        entityType: entityToUse.type,
        entityPos: `${entityToUse.start}-${entityToUse.end}`
      });
    }

    // Note: The entity highlighting layer (buildEntityDecorations) already handles
    // highlighting the entity text with glow effects. We don't add highlighting here
    // to avoid duplicate overlapping highlights on the manual tags.
    // The mark below is only for structural/event handling (context menus).

    // Part 1: Parent mark spanning entire tag for event handling
    // SKIP for rejected entities - they should have NO highlighting
    // match[8] = bracketed multi-word rejection, match[9] = single-word rejection
    if (!match[8] && !match[9]) {
      builder.add(
        matchStart,
        matchEnd,
        Decoration.mark({
          class: 'cm-tag-highlight',
          attributes: {
            'data-entity-key': makeSpanKey(entityToUse),
            style: `cursor: pointer;`
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
  entitiesRef: React.MutableRefObject<EntitySpan[]>,
  entityMapRef: React.MutableRefObject<Map<string, EntitySpan>>,
  globalEntityMapRef: React.MutableRefObject<Map<string, EntitySpan>>,
  baseOffsetRef: React.MutableRefObject<number>
) {
  // Long-press tracking for touch devices
  let touchStartTime = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  const LONG_PRESS_DURATION = 500; // milliseconds
  const TOUCH_MOVEMENT_THRESHOLD = 10; // pixels

  const findEntityAtEvent = (event: any, view: EditorView) => {
    const target = event.target as HTMLElement;

    const elementWithData = target.closest('[data-entity-key]') as HTMLElement | null;
    if (elementWithData) {
      const key = elementWithData.dataset.entityKey;
      if (key) {
        const entity = entityMapRef.current.get(key);
        if (entity) {
          return entity;
        }
      }
    }

    // Fallback: use cursor position to find entity
    const coords = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (coords === null) {
      return null;
    }

    const clickPos = coords;
    const clickedEntity = entitiesRef.current.find(e =>
      e.start <= clickPos && clickPos <= e.end
    );

    return clickedEntity || null;
  };

  return EditorView.domEventHandlers({
    contextmenu: (event, view) => {
      // Context menu logging only in verbose mode
      if (VERBOSE_LOGGING) console.log('[ContextMenu] Right-click handler called');
      const localEntity = findEntityAtEvent(event, view);

      if (localEntity) {
        event.preventDefault();
        if (VERBOSE_LOGGING) console.log('[ContextMenu] Found entity:', localEntity.text);

        // Look up the global entity for callbacks
        const key = makeSpanKey(localEntity);
        const globalEntity = globalEntityMapRef.current.get(key) || localEntity;

        setContextMenu({
          position: { x: event.clientX, y: event.clientY },
          entity: globalEntity
        });
        return true;
      }

      if (VERBOSE_LOGGING) console.log('[ContextMenu] No entity at cursor');
      return false;
    },

    touchstart: (event, view) => {
      const touch = event.touches[0];
      if (!touch) return false;

      touchStartTime = Date.now();
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;

      // Clear any previous timer
      if (longPressTimer) clearTimeout(longPressTimer);

      // Set timer for long-press
      longPressTimer = setTimeout(() => {
        if (VERBOSE_LOGGING) console.log('[ContextMenu] Long-press detected');
        const localEntity = findEntityAtEvent({
          target: event.target,
          clientX: touch.clientX,
          clientY: touch.clientY
        }, view);

        if (localEntity) {
          if (VERBOSE_LOGGING) console.log('[ContextMenu] Found entity:', localEntity.text);

          // Look up the global entity for callbacks
          const key = makeSpanKey(localEntity);
          const globalEntity = globalEntityMapRef.current.get(key) || localEntity;

          setContextMenu({
            position: { x: touch.clientX, y: touch.clientY },
            entity: globalEntity
          });
        }
      }, LONG_PRESS_DURATION);

      return false;
    },

    touchmove: (event, view) => {
      const touch = event.touches[0];
      if (!touch) return false;

      // If user moved finger too far, cancel long-press
      const distance = Math.sqrt(
        Math.pow(touch.clientX - touchStartX, 2) +
        Math.pow(touch.clientY - touchStartY, 2)
      );

      if (distance > TOUCH_MOVEMENT_THRESHOLD) {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }

      return false;
    },

    touchend: (event, view) => {
      // Cancel long-press if finger lifted before timer completed
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }

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
  '&': {
    height: '100%',
  },
  '.cm-editor': {
    height: '100% !important',
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
    // Let the outer React wrapper be the ONLY scroll container.
    // The scroller just flexes to fill the available space.
    flex: '1 1 auto',
    minHeight: '0 !important'
  },
  '.cm-line': {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif !important',
    position: 'relative',
    color: 'var(--text-primary)',
    caretColor: 'var(--accent-color) !important'
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border-color)',
    color: 'var(--text-secondary)'
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
  highlightOpacity = 1.0,
  entities = [],
  renderMarkdown = true,
  onChangeType,
  onCreateNew,
  onReject,
  onTagEntity,
  entityHighlightMode = false,
  baseOffset = 0,
  onCursorChange
}: CodeMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Windowed mode: Convert global entities to local window coordinates
  // In full doc mode (baseOffset=0), this is a no-op
  const windowLength = value.length;
  const localEntities: EntitySpan[] = entities
    .filter(e => e.end > baseOffset && e.start < baseOffset + windowLength)
    .map(e => ({
      ...e,
      start: Math.max(0, e.start - baseOffset),
      end: Math.min(windowLength, e.end - baseOffset),
    }));

  // Refs for passing data to decorations (must be mutable refs, not props)
  // IMPORTANT: Store GLOBAL entities in the map for context menu actions
  const entitiesRef = useRef<EntitySpan[]>(localEntities);
  const entityMapRef = useRef<Map<string, EntitySpan>>(new Map());
  const globalEntityMapRef = useRef<Map<string, EntitySpan>>(new Map()); // Global entities for callbacks
  const baseOffsetRef = useRef<number>(baseOffset);
  const renderMarkdownRef = useRef<boolean>(renderMarkdown);
  const disableHighlightingRef = useRef<boolean>(disableHighlighting);
  const highlightOpacityRef = useRef<number>(highlightOpacity);
  const entityHighlightModeRef = useRef<boolean>(entityHighlightMode);
  const onChangeRef = useRef(onChange);
  const onCursorChangeRef = useRef(onCursorChange);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    entity: EntitySpan;
  } | null>(null);

  const createEntityFromSelection = useCallback(() => {
    const view = viewRef.current;
    if (!view || !entityHighlightModeRef.current || !onCreateNew) return;

    const state = view.state;
    const selection = state.selection.main;
    if (selection.empty) return;

    const start = selection.from;
    const end = selection.to;
    const selectedText = state.doc.sliceString(start, end).trim();
    if (!selectedText) return;

    const rawType = window.prompt('Enter entity type (e.g. PERSON, PLACE, ITEM):');
    if (!rawType) return;

    const type = rawType.trim().toUpperCase();
    const entitySpan: EntitySpan = {
      start,
      end,
      text: selectedText,
      displayText: selectedText,
      type: type as EntityType,
      confidence: 1.0,
      source: 'manual'
    };

    onCreateNew(entitySpan, type as EntityType);
  }, [onCreateNew]);

  // Apply dynamic scrollbar colors based on theme (CodeMirror scroller only)
  useEffect(() => {
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    const isDark = theme === 'dark';

    // Remove old style tag if it exists
    const oldStyle = document.getElementById('cm-scrollbar-colors');
    if (oldStyle) oldStyle.remove();

    // Create new style tag with theme-specific scrollbar colors. We scope this
    // to the CodeMirror scroller so it remains the only scroll container.
    const styleTag = document.createElement('style');
    styleTag.id = 'cm-scrollbar-colors';

    if (isDark) {
      styleTag.textContent = `
        .cm-scroller::-webkit-scrollbar-thumb {
          background: #64d5ff !important;
        }
        .cm-scroller::-webkit-scrollbar-thumb:hover {
          background: #a0e7ff !important;
        }
      `;
    } else {
      styleTag.textContent = `
        .cm-scroller::-webkit-scrollbar-thumb {
          background: #E8A87C !important;
        }
        .cm-scroller::-webkit-scrollbar-thumb:hover {
          background: #FFB347 !important;
        }
      `;
    }

    document.head.appendChild(styleTag);

    return () => styleTag.remove();
  }, []);

  // Keep refs in sync and trigger decoration rebuilds for dependent plugins
  useEffect(() => {
    if (VERBOSE_LOGGING) console.log('[CodeMirror] entities changed:', entities.length);

    // Sort LOCAL entities by start position for efficient binary search
    const sortedLocal = [...localEntities].sort((a, b) => a.start - b.start);
    entitiesRef.current = sortedLocal;

    // Store local entities in entityMapRef (for decoration rendering)
    const localMap = new Map<string, EntitySpan>();
    for (const e of sortedLocal) {
      localMap.set(makeSpanKey(e), e);
    }
    entityMapRef.current = localMap;

    // Store GLOBAL entities in globalEntityMapRef (for context menu callbacks)
    const globalMap = new Map<string, EntitySpan>();
    for (const e of entities) {
      globalMap.set(makeSpanKey(e), e);
    }
    globalEntityMapRef.current = globalMap;
    dispatchDecorationUpdate(viewRef.current);
  }, [entities, localEntities]);

  useEffect(() => {
    renderMarkdownRef.current = renderMarkdown;
    dispatchDecorationUpdate(viewRef.current);
  }, [renderMarkdown]);

  useEffect(() => {
    disableHighlightingRef.current = disableHighlighting;
    dispatchDecorationUpdate(viewRef.current);
  }, [disableHighlighting]);

  useEffect(() => {
    highlightOpacityRef.current = highlightOpacity;
    dispatchDecorationUpdate(viewRef.current);
  }, [highlightOpacity]);

  useEffect(() => {
    entityHighlightModeRef.current = entityHighlightMode;
  }, [entityHighlightMode]);

  useEffect(() => {
    baseOffsetRef.current = baseOffset;
  }, [baseOffset]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
  }, [onCursorChange]);

  // Watch for theme changes - rebuild decorations with new colors
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const observer = new MutationObserver(() => {
      // Debounce theme changes
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        dispatchDecorationUpdate(viewRef.current);
      }, 100);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    return () => {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, []);

  // Initialize editor on mount
  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        keymap.of([
          {
            key: 'Mod-e',
            run: () => {
              if (!entityHighlightModeRef.current) return false;
              createEntityFromSelection();
              return true;
            }
          },
          ...defaultKeymap
        ]),
        markdown(),
        // Enable live markdown syntax highlighting with custom markdown styles
        syntaxHighlighting(markdownHighlightStyle),
        entityHighlighterExtension(
          () => entitiesRef.current,
          () => disableHighlightingRef.current,
          () => highlightOpacityRef.current,
          () => entityHighlightModeRef.current
        ),
        manualTagHidingExtension(() => renderMarkdownRef.current, () => entitiesRef.current),
        contextMenuHandler(setContextMenu, entitiesRef, entityMapRef, globalEntityMapRef, baseOffsetRef),
        editorTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }

          // Report position for windowed mode
          // Track user actions (typing, clicking, arrow keys) AND viewport scrolling
          if (onCursorChangeRef.current) {
            const hasUserInput = update.transactions.some(tr => {
              const userEvent = tr.annotation(Transaction.userEvent);
              return userEvent && (
                userEvent.startsWith('select.') ||
                userEvent.startsWith('input.') ||
                userEvent.startsWith('delete.')
              );
            });

            // Report position after user input OR when viewport scrolls
            if (hasUserInput || update.viewportChanged) {
              // Use viewport center for scroll tracking, cursor for typing/selection
              let globalPos: number;
              if (update.viewportChanged && !hasUserInput) {
                // Scrolling - use viewport center
                const viewportCenter = Math.floor((update.view.viewport.from + update.view.viewport.to) / 2);
                globalPos = baseOffsetRef.current + viewportCenter;
              } else {
                // User action - use cursor position
                const localPos = update.state.selection.main.head;
                globalPos = baseOffsetRef.current + localPos;
              }
              onCursorChangeRef.current(globalPos);
            }
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

    if (entityHighlightMode) {
      setContextMenu(null);
      if (onChangeType) {
        await onChangeType(entity, newType);
      }
      return;
    }

    const tag = entity.text.includes(' ')
      ? `#[${entity.text}]:${newType}`
      : `#${entity.text}:${newType}`;

    // Find the full tag in the text starting from entity.start
    // Search backward for the # and forward for the end of the tag
    let tagStart = entity.start;
    let tagEnd = entity.end;

    // Search backward for # (could be #[ or just #)
    while (tagStart > 0 && value[tagStart - 1] !== ' ' && value[tagStart - 1] !== '\n') {
      tagStart--;
    }

    // Search forward for whitespace or end of string (marks end of tag)
    while (tagEnd < value.length && value[tagEnd] !== ' ' && value[tagEnd] !== '\n') {
      tagEnd++;
    }

    const newText = value.slice(0, tagStart) + tag + value.slice(tagEnd);
    onChange(newText);
    setContextMenu(null);

    if (onChangeType) {
      await onChangeType(entity, newType);
    }
  };

  const handleCreateNew = async (type: EntityType) => {
    if (!contextMenu) return;
    const entity = contextMenu.entity;

    if (entityHighlightMode) {
      setContextMenu(null);
      if (onCreateNew) {
        await onCreateNew(entity, type);
      }
      return;
    }

    const tag = entity.text.includes(' ')
      ? `#[${entity.text}]:${type}`
      : `#${entity.text}:${type}`;

    // Find the full tag in the text starting from entity.start
    // Search backward for the # and forward for the end of the tag
    let tagStart = entity.start;
    let tagEnd = entity.end;

    // Search backward for # (could be #[ or just #)
    while (tagStart > 0 && value[tagStart - 1] !== ' ' && value[tagStart - 1] !== '\n') {
      tagStart--;
    }

    // Search forward for whitespace or end of string (marks end of tag)
    while (tagEnd < value.length && value[tagEnd] !== ' ' && value[tagEnd] !== '\n') {
      tagEnd++;
    }

    const newText = value.slice(0, tagStart) + tag + value.slice(tagEnd);
    onChange(newText);
    setContextMenu(null);

    if (onCreateNew) {
      await onCreateNew(entity, type);
    }
  };

  const handleReject = async () => {
    if (!contextMenu) return;
    const entity = contextMenu.entity;

    if (entityHighlightMode) {
      setContextMenu(null);
      if (onReject) {
        await onReject(entity);
      }
      return;
    }

    // Use brackets for multi-word entities, plain syntax for single words
    const rejectTag = entity.text.includes(' ')
      ? `[${entity.text}]:REJECT_ENTITY`
      : `${entity.text}:REJECT_ENTITY`;

    // Find the full tag in the text starting from entity.start
    // Search backward for the # and forward for the end of the tag
    let tagStart = entity.start;
    let tagEnd = entity.end;

    // Search backward for # (could be #[ or just #)
    while (tagStart > 0 && value[tagStart - 1] !== ' ' && value[tagStart - 1] !== '\n') {
      tagStart--;
    }

    // Search forward for whitespace or end of string (marks end of tag)
    while (tagEnd < value.length && value[tagEnd] !== ' ' && value[tagEnd] !== '\n') {
      tagEnd++;
    }

    const newText = value.slice(0, tagStart) + rejectTag + value.slice(tagEnd);
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
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        ref={editorRef}
        className="cm-editor-wrapper"
        style={{
          border: '1px solid var(--border-color)',
          borderRadius: '0',
          backgroundColor: 'var(--bg-primary)',
          width: '100%',
          height: '100%',
          // This wrapper is the single scroll container for the editor.
          overflow: 'auto'
        } as React.CSSProperties}
        onContextMenu={(e) => {
          const view = viewRef.current;
          if (entityHighlightModeRef.current && view) {
            const sel = view.state.selection.main;
            if (!sel.empty) {
              e.preventDefault();
              createEntityFromSelection();
              return;
            }
          }
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