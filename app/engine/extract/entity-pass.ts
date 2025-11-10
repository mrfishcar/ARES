/**
 * ARES Entity Pass (lightweight)
 * - Normalizes quotes/spacing
 * - Collapses initials ("J. R. R." -> "J.R.R.")
 * - Fixes hyphenated surnames
 * - Heuristic type hints: PERSON / ORG / LOC
 * - Emits spans as {start,end} for projection onto tokens
 *
 * Toggle with env: ARES_ENTITY_PASS=on
 */

export type EntType = 'PERSON' | 'ORG' | 'LOC' | 'UNKNOWN';

export interface EntityHint {
  text: string;
  type: EntType;
  start: number; // inclusive char offset
  end: number;   // exclusive char offset
}

export interface EntityPassResult {
  text: string;
  entities: EntityHint[];
}

export function normalizeText(raw: string): string {
  return raw
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, '--')
    .replace(/\s+/g, ' ')
    .trim();
}

function collapseInitials(s: string): string {
  return s.replace(/\b([A-Z])\.\s(?=[A-Z]\.)/g, '$1.');
}

function attachSuffixes(s: string): string {
  return s.replace(/,\s+(Jr\.|Sr\.|II|III|IV|V)/g, ' $1');
}

function fixHyphenatedNames(s: string): string {
  return s.replace(/\b([A-Z][a-z]+)\s*-\s*([A-Z][a-z]+)\b/g, '$1-$2');
}

export function preprocessText(raw: string): string {
  let s = normalizeText(raw);
  s = collapseInitials(s);
  s = attachSuffixes(s);
  s = fixHyphenatedNames(s);
  return s;
}

const ORG_CUES = [
  'inc', 'llc', 'ltd', 'corp', 'co.', 'company', 'university', 'college',
  'ministry', 'church', 'department', 'committee', 'foundation', 'studio', 'records'
];
const LOC_CUES = [
  'street', 'st.', 'ave', 'avenue', 'road', 'rd.', 'boulevard', 'blvd', 'lane', 'ln.',
  'parish', 'county', 'city', 'state', 'province', 'park', 'river', 'lake'
];

export function guessType(surface: string): EntType {
  const s = surface.trim();
  const low = s.toLowerCase();

  if (ORG_CUES.some(c => low.endsWith(' ' + c) || low.includes(' ' + c + ' '))) return 'ORG';
  if (LOC_CUES.some(c => low.endsWith(' ' + c) || low.includes(' ' + c + ' '))) return 'LOC';

  const words = s.split(' ');
  // Check for titlecase words (allowing hyphenated compounds like Anne-Johnson)
  const titleish = words.length <= 5 && words.every(w =>
    /^[A-Z][a-z'\-]*(?:-[A-Z][a-z'\-]*)*$/.test(w) || /^[A-Z]\.$/.test(w) || /^(Jr\.|Sr\.)$/.test(w)
  );
  if (titleish) {
    if (/(Jr\.|Sr\.|II|III|IV|V)$/.test(s)) return 'PERSON';
    // Check for hyphenated names (e.g., Mary Anne-Johnson)
    if (s.includes('-') && words.length >= 2) return 'PERSON';
    // Multiple words are likely person names
    if (words.length >= 2 && words.length <= 3) return 'PERSON';
  }

  if (/\b[A-Z]{2,}\b(?:\s+\b[A-Z]{2,}\b)+/.test(s)) return 'ORG';
  return 'UNKNOWN';
}

/** Find capitalized sequences and produce hints with spans. */
export function findEntityHints(text: string): EntityHint[] {
  const hints: EntityHint[] = [];
  // Match sequences like "St. Tammany Parish", "J.R.R. Tolkien", "Red Wing Shoes Inc"
  // Captures: abbreviations (St., Dr.), initials (J.R.R.), and capitalized words including hyphenated compounds
  const re = /\b(?:[A-Z][a-z'\-]*(?:-[A-Z][a-z'\-]*)*\.?)+(?:\s+(?:[A-Z][a-z'\-]*(?:-[A-Z][a-z'\-]*)*\.?)+)+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const surface = m[0];
    const type = guessType(surface);
    hints.push({ text: surface, type, start: m.index, end: m.index + surface.length });
  }
  return hints;
}

export function runEntityPass(raw: string): EntityPassResult {
  const text = preprocessText(raw);
  const entities = findEntityHints(text);
  return { text, entities };
}

export function isEntityPassEnabled(): boolean {
  const flag = (process.env.ARES_ENTITY_PASS || '').toLowerCase();
  return flag === 'on' || flag === 'true' || flag === '1';
}
