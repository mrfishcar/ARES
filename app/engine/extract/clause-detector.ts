import type { ParsedSentence, Token } from './parse-types';

export interface Clause {
  text: string;
  start: number;
  end: number;
  type: 'main' | 'subordinate' | 'relative';
}

const RELATIVE_MARKERS = new Set([
  'who',
  'whom',
  'whose',
  'which',
  'where',
  'when'
]);

const SUBORDINATE_MARKERS = new Set([
  'that',
  'because',
  'since',
  'while',
  'after',
  'before',
  'though',
  'although',
  'if',
  'as',
  'once',
  'until'
]);

const CLAUSE_DEPS = new Set(['mark', 'advcl', 'acl', 'acl:relcl', 'relcl', 'csubj', 'ccomp']);

function classifyMarker(token: Token): Clause['type'] | null {
  const lower = token.text.toLowerCase();
  if (RELATIVE_MARKERS.has(lower) || token.dep === 'relcl' || token.tag === 'WDT') {
    return 'relative';
  }
  if (SUBORDINATE_MARKERS.has(lower) || CLAUSE_DEPS.has(token.dep) || token.pos === 'SCONJ') {
    return 'subordinate';
  }
  return null;
}

export function detectClauses(sentence: ParsedSentence, fullText: string): Clause[] {
  const clauses: Clause[] = [];
  const tokens = sentence.tokens ?? [];
  const markers = tokens
    .map(token => {
      const type = classifyMarker(token);
      if (!type) return null;
      return { token, type };
    })
    .filter((marker): marker is { token: Token; type: Clause['type'] } => Boolean(marker))
    .sort((a, b) => a.token.start - b.token.start);

  const addClause = (start: number, end: number, type: Clause['type']) => {
    const boundedStart = Math.max(sentence.start, start);
    const boundedEnd = Math.min(sentence.end, end);
    if (boundedEnd <= boundedStart) return;
    const raw = fullText.slice(boundedStart, boundedEnd);
    const trimmed = raw.trim();
    if (!trimmed) return;
    const offset = raw.indexOf(trimmed);
    const clauseStart = offset >= 0 ? boundedStart + offset : boundedStart;
    const clauseEnd = clauseStart + trimmed.length;
    clauses.push({ text: trimmed, start: clauseStart, end: clauseEnd, type });
  };

  if (markers.length === 0) {
    addClause(sentence.start, sentence.end, 'main');
    return clauses;
  }

  const firstMarkerStart = markers[0].token.start;
  if (firstMarkerStart > sentence.start) {
    addClause(sentence.start, firstMarkerStart, 'main');
  }

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].token.start;
    const end = i + 1 < markers.length ? markers[i + 1].token.start : sentence.end;
    addClause(start, end, markers[i].type);
  }

  return clauses;
}
