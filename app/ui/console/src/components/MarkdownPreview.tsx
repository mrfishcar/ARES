/**
 * Markdown Preview Component
 * Renders markdown text with entity highlighting
 */

import Markdown from 'markdown-to-jsx';
import { useEffect, useState } from 'react';
import type { EntitySpan } from '../types/entities';
import { getEntityTypeColor } from '../types/entities';

interface MarkdownPreviewProps {
  value: string;
  entities: EntitySpan[];
  minHeight?: string;
}

export function MarkdownPreview({ value, entities, minHeight = '400px' }: MarkdownPreviewProps) {
  const [highlightedText, setHighlightedText] = useState(value);

  useEffect(() => {
    // Process manual tags first: #Name:TYPE or #[Multi Word]:TYPE
    let processed = value;

    // Parse manual tags and replace with plain text
    const tagRegex = /#\[([^\]]+)\]:(\w+)|#(\w+):(\w+)/g;
    const manualTags: EntitySpan[] = [];

    let match;
    while ((match = tagRegex.exec(value)) !== null) {
      const isMultiWord = match[1] !== undefined;
      const name = isMultiWord ? match[1] : match[3];
      const type = isMultiWord ? match[2] : match[4];

      manualTags.push({
        start: match.index,
        end: match.index + match[0].length,
        text: name,
        displayText: name,
        type: type as any,
        confidence: 1.0,
        source: 'tag'
      });
    }

    // Replace manual tags with plain text (will be highlighted by spans below)
    processed = processed.replace(/#\[([^\]]+)\]:(\w+)|#(\w+):(\w+)/g, (_, multiWord, _type1, singleWord) => {
      return multiWord || singleWord;
    });

    // Combine manual tags with detected entities
    const allEntities = [...manualTags, ...entities];

    // Sort by start position and apply highlighting
    allEntities.sort((a, b) => a.start - b.start);

    // Apply entity highlights using span elements
    let result = '';
    let lastIndex = 0;

    for (const entity of allEntities) {
      // Add text before entity
      result += escapeHtml(processed.slice(lastIndex, entity.start));

      // Add highlighted entity
      const color = getEntityTypeColor(entity.type as any);
      result += `<span style="background: ${color}30; border-bottom: 2px solid ${color}; border-radius: 3px; padding: 1px 3px; font-weight: 500; cursor: pointer;">${escapeHtml(entity.text)}</span>`;

      lastIndex = entity.end;
    }

    // Add remaining text
    result += escapeHtml(processed.slice(lastIndex));

    setHighlightedText(result);
  }, [value, entities]);

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        minHeight,
        backgroundColor: '#ffffff',
        padding: '16px 20px',
        overflow: 'auto',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        lineHeight: '1.6',
      }}
    >
      <Markdown
        options={{
          overrides: {
            // Custom rendering for better styling
            h1: { props: { style: { fontSize: '2em', fontWeight: 'bold', marginTop: '0.5em', marginBottom: '0.5em' } } },
            h2: { props: { style: { fontSize: '1.5em', fontWeight: 'bold', marginTop: '0.5em', marginBottom: '0.5em' } } },
            h3: { props: { style: { fontSize: '1.25em', fontWeight: 'bold', marginTop: '0.5em', marginBottom: '0.5em' } } },
            p: { props: { style: { marginTop: '0.5em', marginBottom: '0.5em' } } },
            ul: { props: { style: { marginLeft: '1.5em', marginTop: '0.5em', marginBottom: '0.5em' } } },
            ol: { props: { style: { marginLeft: '1.5em', marginTop: '0.5em', marginBottom: '0.5em' } } },
            code: { props: { style: { backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '3px', fontFamily: 'monospace' } } },
            pre: { props: { style: { backgroundColor: '#f3f4f6', padding: '12px', borderRadius: '6px', overflow: 'auto', fontFamily: 'monospace' } } },
          }
        }}
      >
        {highlightedText}
      </Markdown>
    </div>
  );
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
