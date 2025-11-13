/**
 * CodeMirror extension for auto-replacing entity tags
 * Converts #Name:TYPE to plain text with highlighting when user types space
 */

import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

/**
 * Create auto-replace extension for entity tags
 * When user types after a tag, replace it with plain text
 */
export function entityAutoReplaceExtension(): Extension {
  return ViewPlugin.fromClass(class {
    constructor(readonly view: EditorView) {}

    update(update: ViewUpdate) {
      if (!update.docChanged) return;

      // Check if the last change was typing a space or punctuation
      const changes = update.changes;
      changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
        const insertedText = inserted.toString();

        // Check if user typed space, punctuation, or newline
        if (insertedText.match(/[\s.,!?;:\n]/)) {
          // Look backwards from cursor to find a complete tag
          const pos = toB;
          const doc = update.state.doc;
          const line = doc.lineAt(pos);
          const textBefore = line.text.slice(0, pos - line.from);

          // Match tags: #Name:TYPE or #[Multi Word]:TYPE
          const tagMatch = textBefore.match(/(#\[([^\]]+)\]:(\w+)|#(\w+):(\w+))$/);

          if (tagMatch) {
            const fullTag = tagMatch[0];
            const name = tagMatch[2] || tagMatch[4]; // Multi-word or single word
            const type = tagMatch[3] || tagMatch[5];

            // Validate type
            if (['PERSON', 'PLACE', 'ORG', 'EVENT', 'CONCEPT', 'OBJECT'].includes(type.toUpperCase())) {
              // Calculate position of the tag
              const tagStart = pos - insertedText.length - fullTag.length;
              const tagEnd = pos - insertedText.length;

              console.log('[AutoReplace] Converting tag:', fullTag, '→', name);

              // Replace tag with plain name
              setTimeout(() => {
                this.view.dispatch({
                  changes: {
                    from: tagStart,
                    to: tagEnd,
                    insert: name,
                  },
                });
              }, 0);
            }
          }
        }
      });
    }
  });
}
