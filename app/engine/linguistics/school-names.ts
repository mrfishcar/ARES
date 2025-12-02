export interface SchoolNameParts {
  rootTokens: string[];      // ["mont", "linola", "junior"]
  suffixTokens: string[];    // ["high", "school"] or []
}

const SCHOOL_SUFFIXES = [
  ['high', 'school'],
  ['junior', 'high', 'school'],
  ['junior', 'high'],
  ['jr', 'high'],
  ['jr.', 'high'],
  ['school'],
  ['academy'],
  ['university'],
  ['college'],
  ['institute'],
];

function normalizeTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[.,]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * NV-1: find the longest matching school suffix at the end of the name.
 */
export function splitSchoolName(name: string): SchoolNameParts {
  const tokens = normalizeTokens(name);
  for (const suffix of SCHOOL_SUFFIXES.sort((a, b) => b.length - a.length)) {
    const n = suffix.length;
    if (tokens.length >= n) {
      const end = tokens.slice(-n);
      if (arraysEqual(end, suffix)) {
        return {
          rootTokens: tokens.slice(0, -n),
          suffixTokens: suffix,
        };
      }
    }
  }
  // no suffix, treat entire thing as root
  return {
    rootTokens: tokens,
    suffixTokens: [],
  };
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((t, i) => t === b[i]);
}

/**
 * NV-2: generate a canonical key for merging school ORG variants
 * based on their root tokens.
 */
export function schoolRootKey(name: string): string {
  const { rootTokens } = splitSchoolName(name);
  return rootTokens.join(' ');
}

/**
 * NV-3: decide if an entity name should be treated as PLACE, when
 * it's just the root of a school name.
 */
export interface PlaceEvidence {
  usedWithLocationPreposition: boolean; // "in Mont Linola", "from Mont Linola"
  standAlonePlaceCount: number;        // NP uses like "in Mont Linola"
}

/**
 * Very simple heuristic: only treat root as PLACE if we have explicit place evidence.
 */
export function shouldTreatRootAsPlace(
  rootName: string,
  evidence: PlaceEvidence
): boolean {
  if (!rootName.trim()) return false;
  return evidence.usedWithLocationPreposition || evidence.standAlonePlaceCount > 0;
}
