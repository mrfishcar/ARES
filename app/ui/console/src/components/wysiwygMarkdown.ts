/**
 * WYSIWYG Markdown Extension for CodeMirror
 * Renders markdown syntax inline as you type (Obsidian-style)
 */

import { EditorView, Decoration, ViewPlugin, DecorationSet, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import type { Extension } from '@codemirror/state';

/**
 * Create WYSIWYG markdown extension
 * Renders markdown inline: headings, bold, italic, etc.
 */
export function wysiwygMarkdownExtension(): Extension {
  const decorations = ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const doc = view.state.doc;

      for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const text = line.text;

        // Skip empty lines
        if (!text.trim()) continue;

        // Entity tags: #Name:TYPE or #[Multi Word]:TYPE
        // Render as just the name with no tag syntax
        const entityTagRegex = /#\[([^\]]+)\]:(\w+)|#(\w+):(\w+)/g;
        let tagMatch;
        while ((tagMatch = entityTagRegex.exec(text)) !== null) {
          const isMultiWord = tagMatch[1] !== undefined;
          const name = isMultiWord ? tagMatch[1] : tagMatch[3];
          const type = isMultiWord ? tagMatch[2] : tagMatch[4];
          const startPos = line.from + tagMatch.index;
          const endPos = startPos + tagMatch[0].length;

          // Validate type
          if (['PERSON', 'PLACE', 'ORG', 'EVENT', 'CONCEPT', 'OBJECT'].includes(type.toUpperCase())) {
            // Replace entire tag with just the name (styled)
            builder.add(startPos, endPos, Decoration.replace({
              widget: new class extends WidgetType {
                toDOM() {
                  const span = document.createElement('span');
                  span.textContent = name;
                  // Get entity type color
                  const colors: Record<string, string> = {
                    PERSON: '#3b82f6',
                    PLACE: '#10b981',
                    ORG: '#f59e0b',
                    EVENT: '#ef4444',
                    CONCEPT: '#8b5cf6',
                    OBJECT: '#ec4899',
                  };
                  const color = colors[type.toUpperCase()] || '#6b7280';
                  span.style.cssText = `background: ${color}30; border-bottom: 2px solid ${color}; border-radius: 3px; padding: 1px 3px; font-weight: 500;`;
                  return span;
                }
              }
            }));
          }
        }

        // Headings: # Heading, ## Heading, etc.
        const headingMatch = text.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const syntaxEnd = line.from + headingMatch[1].length + 1; // +1 for space

          // Hide the # symbols and space
          builder.add(line.from, syntaxEnd, Decoration.replace({}));

          // Style the heading text
          const fontSize = ['2em', '1.5em', '1.3em', '1.1em', '1em', '0.9em'][level - 1];
          builder.add(syntaxEnd, line.to, Decoration.mark({
            attributes: {
              style: `font-size: ${fontSize}; font-weight: bold; display: block; margin: 0.5em 0;`
            }
          }));
          continue;
        }

        // Bold: **text** or __text__
        const boldRegex = /(\*\*|__)((?:(?!\1).)+?)\1/g;
        let boldMatch;
        while ((boldMatch = boldRegex.exec(text)) !== null) {
          const startPos = line.from + boldMatch.index;
          const endPos = startPos + boldMatch[0].length;
          const openEnd = startPos + boldMatch[1].length;
          const closeStart = endPos - boldMatch[1].length;

          // Hide opening markers
          builder.add(startPos, openEnd, Decoration.replace({}));
          // Style the text
          builder.add(openEnd, closeStart, Decoration.mark({
            attributes: { style: 'font-weight: bold;' }
          }));
          // Hide closing markers
          builder.add(closeStart, endPos, Decoration.replace({}));
        }

        // Italic: *text* or _text_ (but not part of bold)
        const italicRegex = /(?<!\*|\w)(\*|_)((?:(?!\1).)+?)\1(?!\*|\w)/g;
        let italicMatch;
        while ((italicMatch = italicRegex.exec(text)) !== null) {
          const startPos = line.from + italicMatch.index;
          const endPos = startPos + italicMatch[0].length;
          const openEnd = startPos + italicMatch[1].length;
          const closeStart = endPos - italicMatch[1].length;

          // Hide opening markers
          builder.add(startPos, openEnd, Decoration.replace({}));
          // Style the text
          builder.add(openEnd, closeStart, Decoration.mark({
            attributes: { style: 'font-style: italic;' }
          }));
          // Hide closing markers
          builder.add(closeStart, endPos, Decoration.replace({}));
        }

        // Code: `code`
        const codeRegex = /`([^`]+)`/g;
        let codeMatch;
        while ((codeMatch = codeRegex.exec(text)) !== null) {
          const startPos = line.from + codeMatch.index;
          const endPos = startPos + codeMatch[0].length;
          const openEnd = startPos + 1;
          const closeStart = endPos - 1;

          // Hide opening backtick
          builder.add(startPos, openEnd, Decoration.replace({}));
          // Style the code
          builder.add(openEnd, closeStart, Decoration.mark({
            attributes: {
              style: 'background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 0.9em;'
            }
          }));
          // Hide closing backtick
          builder.add(closeStart, endPos, Decoration.replace({}));
        }

        // Strikethrough: ~~text~~
        const strikeRegex = /~~([^~]+)~~/g;
        let strikeMatch;
        while ((strikeMatch = strikeRegex.exec(text)) !== null) {
          const startPos = line.from + strikeMatch.index;
          const endPos = startPos + strikeMatch[0].length;
          const openEnd = startPos + 2;
          const closeStart = endPos - 2;

          // Hide opening ~~
          builder.add(startPos, openEnd, Decoration.replace({}));
          // Style the text
          builder.add(openEnd, closeStart, Decoration.mark({
            attributes: { style: 'text-decoration: line-through;' }
          }));
          // Hide closing ~~
          builder.add(closeStart, endPos, Decoration.replace({}));
        }

        // Lists: - item or * item or + item
        const listMatch = text.match(/^(\s*)([-*+])\s+(.+)$/);
        if (listMatch) {
          const markerStart = line.from + listMatch[1].length;
          const markerEnd = markerStart + listMatch[2].length + 1; // +1 for space

          // Replace marker with bullet
          builder.add(markerStart, markerEnd, Decoration.replace({
            widget: new class extends WidgetType {
              toDOM() {
                const span = document.createElement('span');
                span.textContent = '• ';
                span.style.color = '#6b7280';
                return span;
              }
            }
          }));
        }

        // Numbered lists: 1. item
        const numberedListMatch = text.match(/^(\s*)(\d+)\.\s+(.+)$/);
        if (numberedListMatch) {
          const markerStart = line.from + numberedListMatch[1].length;
          const markerEnd = markerStart + numberedListMatch[2].length + 2; // +2 for ". "

          // Style the number
          builder.add(markerStart, markerEnd, Decoration.mark({
            attributes: { style: 'color: #6b7280; font-weight: 500;' }
          }));
        }
      }

      return builder.finish();
    }
  }, {
    decorations: v => v.decorations
  });

  return [decorations, wysiwygTheme];
}

// Import WidgetType for list bullets
import { WidgetType } from '@codemirror/view';

// Theme for WYSIWYG markdown
const wysiwygTheme = EditorView.theme({
  '.cm-line': {
    lineHeight: '1.6',
  },
  '.cm-content': {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '16px',
  }
});
