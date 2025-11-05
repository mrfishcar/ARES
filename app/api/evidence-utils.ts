/**
 * Evidence Normalization Utilities
 * Sprint R4: Sanitize and normalize evidence snippets
 */

/**
 * Normalize evidence text:
 * - Collapse whitespace
 * - Strip control characters
 * - Cap at maxLength (default 200)
 */
export function normalizeEvidence(text: string, maxLength: number = 200): string {
  // Strip control characters (except newline/tab which we'll collapse)
  let normalized = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // Collapse whitespace (including newlines and tabs)
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Cap length (account for ellipsis)
  if (normalized.length > maxLength) {
    normalized = normalized.substring(0, maxLength - 3) + '...';
  }

  return normalized;
}

/**
 * Extract evidence snippets from knowledge graph evidence
 * Returns normalized snippets with confidence
 */
export function extractEvidenceSnippets(
  evidence: Array<{ span?: { text?: string }; confidence?: number; docId?: string }>,
  limit: number = 8
): Array<{ text: string; confidence?: number; docId?: string }> {
  const snippets: Array<{ text: string; confidence?: number; docId?: string }> = [];

  for (const ev of evidence) {
    if (snippets.length >= limit) break;

    const text = ev.span?.text;
    if (!text) continue;

    snippets.push({
      text: normalizeEvidence(text),
      confidence: ev.confidence,
      docId: ev.docId
    });
  }

  return snippets;
}
